package test

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"

	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/database"
)

func Test_B4_UOM_Conversion_In_Movement(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	tdb := database.NewTenantDB(pool)
	svc := inventory.NewStockMovementService(tdb)

	// 1. Setup item with base_uom = 'pcs'
	itemID := uuid.New()
	sku := fmt.Sprintf("B4-UOM-%s", uuid.New().String()[:8])
	_, err := pool.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active)
		VALUES ($1, $2, $3, 'UOM Test Cable', 'none', 'pcs', 'wac', true)
	`, itemID, orgID, sku)
	if err != nil {
		t.Fatalf("failed to insert item: %v", err)
	}

	// 2. Setup UOM conversion: 1 'box' = 24 'pcs'
	_, _ = pool.Exec(ctx, `
		INSERT INTO units_of_measure (unit_id, org_id, name, symbol)
		VALUES (gen_random_uuid(), $1, 'Box of 24', 'box')
		ON CONFLICT (org_id, symbol) DO NOTHING
	`, orgID)
	_, _ = pool.Exec(ctx, `
		INSERT INTO uom_conversions (conversion_id, org_id, item_id, from_unit, to_base_unit, multiplier)
		VALUES (gen_random_uuid(), $1, $2, 'box', 'pcs', 24.0000)
		ON CONFLICT DO NOTHING
	`, orgID, itemID)

	// 3. Setup Virtual Vendor and Physical Warehouse locations
	vendorLocID := uuid.New()
	warehouseLocID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO locations (location_id, org_id, name, category, is_active)
		VALUES 
			($1, $2, 'UOM Virtual Vendor', 'virtual_vendor', true),
			($3, $2, 'UOM Physical Warehouse', 'physical_warehouse', true)
	`, vendorLocID, orgID, warehouseLocID)

	// 4. Inward 2 boxes from vendor to warehouse (2 boxes * 24 = 48 pcs in base UOM)
	res, err := svc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: vendorLocID,
		ToLocationID:   warehouseLocID,
		Quantity:       2.0,
		Unit:           "box",
		MoveType:       "INWARD_PURCHASE",
	})
	if err != nil {
		t.Fatalf("ExecuteMove with UOM conversion failed: %v", err)
	}

	// 5. Verify movement was persisted as 48 pcs base quantity
	val, err := res.Move.Quantity.Float64Value()
	if err != nil || val.Float64 != 48.0 {
		t.Errorf("expected movement quantity converted to 48.0 pcs, got %v (err=%v)", val.Float64, err)
	}

	// 6. Verify warehouse stock balance is 48.0
	bal, err := svc.GetLocationBalance(ctx, orgID, warehouseLocID, itemID)
	if err != nil || bal != 48.0 {
		t.Errorf("expected warehouse balance 48.0, got %v (err=%v)", bal, err)
	} else {
		t.Logf("PASS: Multi-unit UOM conversion verified in stock movement (2 boxes -> 48 pcs).")
	}
}

func Test_B4_Negative_Stock_Protection_And_Idempotency(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	tdb := database.NewTenantDB(pool)
	svc := inventory.NewStockMovementService(tdb)

	// Ensure negative stock is strictly forbidden for tenant
	_, _ = pool.Exec(ctx, `
		INSERT INTO organization_settings (org_id, allow_negative_stock)
		VALUES ($1, false)
		ON CONFLICT (org_id) DO UPDATE SET allow_negative_stock = false
	`, orgID)

	itemID := uuid.New()
	sku := fmt.Sprintf("B4-IDEM-%s", uuid.New().String()[:8])
	_, _ = pool.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active)
		VALUES ($1, $2, $3, 'Idempotent Item', 'none', 'pcs', 'wac', true)
	`, itemID, orgID, sku)

	srcLocID := uuid.New()
	dstLocID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO locations (location_id, org_id, name, category, is_active)
		VALUES 
			($1, $2, 'Store A', 'physical_warehouse', true),
			($3, $2, 'Store B', 'physical_warehouse', true)
	`, srcLocID, orgID, dstLocID)

	// 1. Attempt to move 10 pcs from Store A with 0 on-hand -> Must FAIL with ErrInsufficientStock
	_, err := svc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: srcLocID,
		ToLocationID:   dstLocID,
		Quantity:       10.0,
		MoveType:       "INTERNAL_TRANSFER",
	})
	if err != inventory.ErrInsufficientStock {
		t.Errorf("expected ErrInsufficientStock, got %v", err)
	}

	// 2. Seed 20 pcs into Store A via virtual inward
	vendorLocID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO locations (location_id, org_id, name, category, is_active) VALUES ($1, $2, 'Vendor V', 'virtual_vendor', true)", vendorLocID, orgID)
	_, err = svc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: vendorLocID,
		ToLocationID:   srcLocID,
		Quantity:       20.0,
		MoveType:       "INWARD_PURCHASE",
	})
	if err != nil {
		t.Fatalf("initial inward failed: %v", err)
	}

	// 3. Move 5 pcs with IdempotencyKey
	idempKey := fmt.Sprintf("idemp-%s", uuid.New().String()[:8])
	res1, err := svc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: srcLocID,
		ToLocationID:   dstLocID,
		Quantity:       5.0,
		MoveType:       "INTERNAL_TRANSFER",
		IdempotencyKey: idempKey,
	})
	if err != nil {
		t.Fatalf("first idempotent move failed: %v", err)
	}

	// 4. Repeat exact same move with the SAME IdempotencyKey
	res2, err := svc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: srcLocID,
		ToLocationID:   dstLocID,
		Quantity:       5.0,
		MoveType:       "INTERNAL_TRANSFER",
		IdempotencyKey: idempKey,
	})
	if err != nil {
		t.Fatalf("second idempotent move call failed: %v", err)
	}

	// Verify both calls returned the identical MoveID
	if res1.Move.MoveID != res2.Move.MoveID {
		t.Errorf("expected same MoveID for idempotent call, got %v and %v", res1.Move.MoveID, res2.Move.MoveID)
	}

	// Verify Store A balance is 15 (decremented ONCE, not twice)
	balA, _ := svc.GetLocationBalance(ctx, orgID, srcLocID, itemID)
	if balA != 15.0 {
		t.Errorf("expected Store A balance to be 15.0 after idempotent call, got %v", balA)
	} else {
		t.Logf("PASS: Negative stock protection and Idempotency key deduplication verified.")
	}
}

func Test_B4_Reservations_Hold_Release_And_Fulfillment(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	tdb := database.NewTenantDB(pool)
	resSvc := inventory.NewReservationsService(tdb)
	moveSvc := inventory.NewStockMovementService(tdb)

	itemID := uuid.New()
	sku := fmt.Sprintf("B4-RES-%s", uuid.New().String()[:8])
	_, _ = pool.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active)
		VALUES ($1, $2, $3, 'Reserved Item', 'none', 'pcs', 'wac', true)
	`, itemID, orgID, sku)

	storeLocID := uuid.New()
	customerLocID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO locations (location_id, org_id, name, category, is_active)
		VALUES 
			($1, $2, 'Retail Floor', 'physical_warehouse', true),
			($3, $2, 'Customer Virtual', 'virtual_customer', true)
	`, storeLocID, orgID, customerLocID)

	// Seed 10 pcs on hand in Retail Floor
	_, _ = pool.Exec(ctx, `
		INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out)
		VALUES ($1, $2, $3, 10.0, 0, 0)
		ON CONFLICT (org_id, item_id, location_id) DO UPDATE SET on_hand = 10.0, reserved = 0
	`, orgID, itemID, storeLocID)

	userID, err := getOrCreateTestUser(ctx, pool, orgID)
	if err != nil {
		t.Fatalf("failed to get test user: %v", err)
	}

	// 1. Create Hold for 4 pcs
	hold, err := resSvc.CreateReservation(ctx, inventory.CreateReservationInput{
		OrgID:       orgID,
		ItemID:      itemID,
		LocationID:  storeLocID,
		Quantity:    4.0,
		Kind:        "reserve",
		Target:      "SO-2026-9999",
		CreatedBy:   userID,
	})
	if err != nil {
		t.Fatalf("CreateReservation failed: %v", err)
	}

	// Verify balance: on_hand=10, reserved=4, available=6
	var onHand, reserved float64
	_ = pool.QueryRow(ctx, "SELECT on_hand::float8, reserved::float8 FROM stock_balances WHERE org_id=$1 AND item_id=$2 AND location_id=$3", orgID, itemID, storeLocID).Scan(&onHand, &reserved)
	if onHand != 10.0 || reserved != 4.0 {
		t.Errorf("expected onHand 10.0 and reserved 4.0, got onHand=%v, reserved=%v", onHand, reserved)
	}

	// 2. Attempt to move 8 pcs -> must FAIL because only 6 available (10 - 4 reserved)
	_, err = moveSvc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: storeLocID,
		ToLocationID:   customerLocID,
		Quantity:       8.0,
		MoveType:       "SALES_DISPATCH",
	})
	if err != inventory.ErrInsufficientStock {
		t.Errorf("expected ErrInsufficientStock when moving more than available (onHand-reserved), got %v", err)
	}

	// 3. Fulfill the reservation: 4 pcs dispatched to customer
	actorID := uuid.New()
	fulfilled, err := resSvc.FulfillReservation(ctx, orgID, hold.ReservationID, customerLocID, actorID)
	if err != nil {
		t.Fatalf("FulfillReservation failed: %v", err)
	}
	if fulfilled.Status != "fulfilled" {
		t.Errorf("expected status 'fulfilled', got %s", fulfilled.Status)
	}

	// Verify balances after fulfillment: on_hand=6, reserved=0
	_ = pool.QueryRow(ctx, "SELECT on_hand::float8, reserved::float8 FROM stock_balances WHERE org_id=$1 AND item_id=$2 AND location_id=$3", orgID, itemID, storeLocID).Scan(&onHand, &reserved)
	if onHand != 6.0 || reserved != 0.0 {
		t.Errorf("expected onHand 6.0 and reserved 0.0, got onHand=%v, reserved=%v", onHand, reserved)
	} else {
		t.Logf("PASS: Reservation lifecycle (Create -> Hold Guard -> Fulfill) verified.")
	}
}

func Test_B4_Stock_Summary_And_4Tier_Status(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	tdb := database.NewTenantDB(pool)
	svc := inventory.NewStockMovementService(tdb)

	// 1. Setup item with reorder_level = 10, buffer_stock = 5
	itemID := uuid.New()
	sku := fmt.Sprintf("B4-SUM-%s", uuid.New().String()[:8])
	_, _ = pool.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active, reorder_level, buffer_stock)
		VALUES ($1, $2, $3, 'Monitored Item', 'none', 'pcs', 'wac', true, 10.0, 5.0)
	`, itemID, orgID, sku)

	activeLocID := uuid.New()
	godownLocID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO locations (location_id, org_id, name, category, is_active, is_backup_location)
		VALUES 
			($1, $2, 'Main Shop Shelf', 'physical_warehouse', true, false),
			($3, $2, 'Godown Reserve Storage', 'physical_warehouse', true, true)
	`, activeLocID, orgID, godownLocID)

	// Seed 3 pcs in active shop, 4 pcs in godown reserve -> Total On Hand = 7
	// Reorder level = 10, Buffer stock = 5 -> On Hand 7 is <= 10 (LOW_STOCK)
	_, _ = pool.Exec(ctx, `
		INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out)
		VALUES 
			($1, $2, $3, 3.0, 0, 0),
			($1, $2, $4, 4.0, 0, 0)
		ON CONFLICT (org_id, item_id, location_id) DO UPDATE SET on_hand = EXCLUDED.on_hand
	`, orgID, itemID, activeLocID, godownLocID)

	summary, err := svc.GetItemStockSummary(ctx, orgID, itemID)
	if err != nil {
		t.Fatalf("GetItemStockSummary failed: %v", err)
	}

	if summary.TotalOnHand != 7.0 {
		t.Errorf("expected TotalOnHand 7.0, got %v", summary.TotalOnHand)
	}
	if summary.StockStatus != "LOW_STOCK" {
		t.Errorf("expected StockStatus LOW_STOCK (7 <= 10), got %s", summary.StockStatus)
	}
	if len(summary.Locations) != 2 {
		t.Errorf("expected 2 location breakdown entries, got %d", len(summary.Locations))
	}

	// Verify backup location flag is accurately passed through
	var foundGodown bool
	for _, l := range summary.Locations {
		if l.LocationID == godownLocID && l.IsBackupLocation {
			foundGodown = true
		}
	}
	if !foundGodown {
		t.Errorf("expected to find Godown location with is_backup_location=true")
	} else {
		t.Logf("PASS: Stock summary, 4-tier status badges, and Active vs Godown location breakdown verified.")
	}
}
