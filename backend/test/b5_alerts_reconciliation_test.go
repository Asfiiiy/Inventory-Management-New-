package test

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/riverqueue/river"

	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/jobs"
)

func Test_B5_Stock_Alerts_Detection(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	tdb := database.NewTenantDB(pool)
	svc := inventory.NewStockMovementService(tdb)

	// 1. Create item A: Critical/Buffer breach (reorder_level=50, buffer_stock=20, on_hand=10)
	itemA := uuid.New()
	skuA := fmt.Sprintf("B5-CRIT-%s", uuid.New().String()[:8])
	_, err := pool.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active, reorder_level, buffer_stock)
		VALUES ($1, $2, $3, 'Critical Buffer Item', 'none', 'pcs', 'wac', true, 50.0, 20.0)
	`, itemA, orgID, skuA)
	if err != nil {
		t.Fatalf("failed to insert itemA: %v", err)
	}

	// 2. Create item B: Low Stock breach (reorder_level=40, buffer_stock=10, on_hand=25)
	itemB := uuid.New()
	skuB := fmt.Sprintf("B5-LOW-%s", uuid.New().String()[:8])
	_, err = pool.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active, reorder_level, buffer_stock)
		VALUES ($1, $2, $3, 'Low Stock Item', 'none', 'pcs', 'wac', true, 40.0, 10.0)
	`, itemB, orgID, skuB)
	if err != nil {
		t.Fatalf("failed to insert itemB: %v", err)
	}

	// 3. Create item C: Healthy Stock (reorder_level=30, buffer_stock=10, on_hand=80)
	itemC := uuid.New()
	skuC := fmt.Sprintf("B5-HLTH-%s", uuid.New().String()[:8])
	_, err = pool.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active, reorder_level, buffer_stock)
		VALUES ($1, $2, $3, 'Healthy Stock Item', 'none', 'pcs', 'wac', true, 30.0, 10.0)
	`, itemC, orgID, skuC)
	if err != nil {
		t.Fatalf("failed to insert itemC: %v", err)
	}

	// Setup warehouse location
	locID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO locations (location_id, org_id, name, category, is_active)
		VALUES ($1, $2, 'Alert Test Location', 'physical_warehouse', true)
	`, locID, orgID)

	// Seed balances: Item A = 10, Item B = 25, Item C = 80
	_, _ = pool.Exec(ctx, `
		INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out)
		VALUES 
			($1, $2, $5, 10.0, 0, 0),
			($1, $3, $5, 25.0, 0, 0),
			($1, $4, $5, 80.0, 0, 0)
	`, orgID, itemA, itemB, itemC, locID)

	// 4. Query alerts
	alerts, err := svc.GetStockAlerts(ctx, orgID)
	if err != nil {
		t.Fatalf("GetStockAlerts failed: %v", err)
	}

	var foundA, foundB, foundC bool
	for _, a := range alerts {
		if a.ItemID == itemA {
			foundA = true
			if a.AlertType != "BUFFER_ALERT" {
				t.Errorf("expected itemA to have alert BUFFER_ALERT, got %s", a.AlertType)
			}
			if a.SuggestedReorder <= 0 {
				t.Errorf("expected suggested reorder for itemA, got %f", a.SuggestedReorder)
			}
		}
		if a.ItemID == itemB {
			foundB = true
			if a.AlertType != "LOW_STOCK" {
				t.Errorf("expected itemB to have alert LOW_STOCK, got %s", a.AlertType)
			}
			if a.SuggestedReorder != 55.0 { // target: 40*2 = 80; suggested: 80 - 25 = 55
				t.Errorf("expected suggested reorder for itemB = 55, got %f", a.SuggestedReorder)
			}
		}
		if a.ItemID == itemC {
			foundC = true
		}
	}

	if !foundA {
		t.Errorf("itemA not found in alerts")
	}
	if !foundB {
		t.Errorf("itemB not found in alerts")
	}
	if foundC {
		t.Errorf("healthy itemC should NOT appear in stock alerts")
	}

	t.Log("PASS: Stock alerts detection and replenishment calculation verified.")
}

func Test_B5_Ledger_Reconciliation_And_AutoHealing(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	tdb := database.NewTenantDB(pool)
	svc := inventory.NewStockMovementService(tdb)

	// 1. Setup item
	itemID := uuid.New()
	sku := fmt.Sprintf("B5-RECON-%s", uuid.New().String()[:8])
	_, err := pool.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active)
		VALUES ($1, $2, $3, 'Recon Test Item', 'none', 'pcs', 'wac', true)
	`, itemID, orgID, sku)
	if err != nil {
		t.Fatalf("failed to insert item: %v", err)
	}

	// 2. Setup locations: Virtual Vendor, Warehouse A, Warehouse B
	vendorLocID := uuid.New()
	whALocID := uuid.New()
	whBLocID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO locations (location_id, org_id, name, category, is_active)
		VALUES 
			($1, $2, 'Recon Vendor', 'virtual_vendor', true),
			($3, $2, 'Recon Warehouse A', 'physical_warehouse', true),
			($4, $2, 'Recon Warehouse B', 'physical_warehouse', true)
	`, vendorLocID, orgID, whALocID, whBLocID)

	// 3. Inward 100 pcs to Warehouse A
	_, err = svc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: vendorLocID,
		ToLocationID:   whALocID,
		Quantity:       100.0,
		MoveType:       "inward",
		ReferenceCode:      "PO-RECON-01",
	})
	if err != nil {
		t.Fatalf("ExecuteMove inward failed: %v", err)
	}

	// 4. Transfer 30 pcs from Warehouse A to Warehouse B (WhA = 70, WhB = 30)
	_, err = svc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: whALocID,
		ToLocationID:   whBLocID,
		Quantity:       30.0,
		MoveType:       "transfer",
		ReferenceCode:      "TR-RECON-01",
	})
	if err != nil {
		t.Fatalf("ExecuteMove transfer failed: %v", err)
	}

	// 5. Intentionally simulate data corruption/cache drift in stock_balances
	// Set Warehouse A on_hand to 45.0 (actual ledger sum is 70.0 -> drift = 25.0)
	_, err = pool.Exec(ctx, `
		UPDATE stock_balances 
		SET on_hand = 45.0
		WHERE org_id = $1 AND item_id = $2 AND location_id = $3
	`, orgID, itemID, whALocID)
	if err != nil {
		t.Fatalf("failed to inject drift: %v", err)
	}

	// 6. Run ReconcileItemLedger
	report, err := svc.ReconcileItemLedger(ctx, orgID, itemID)
	if err != nil {
		t.Fatalf("ReconcileItemLedger failed: %v", err)
	}

	if report.Discrepancies != 1 {
		t.Errorf("expected 1 discrepancy, got %d", report.Discrepancies)
	}

	var whAHealed bool
	for _, loc := range report.Locations {
		if loc.LocationID == whALocID {
			if !loc.Healed {
				t.Errorf("expected Warehouse A to be marked healed")
			}
			if loc.Drift != 25.0 {
				t.Errorf("expected drift = 25.0, got %f", loc.Drift)
			}
			if loc.LedgerSum != 70.0 {
				t.Errorf("expected ledger sum = 70.0, got %f", loc.LedgerSum)
			}
			whAHealed = true
		}
	}
	if !whAHealed {
		t.Errorf("Warehouse A was not in reconciliation report")
	}

	// 7. Verify stock_balances is now healed in DB
	var healedOnHand float64
	err = pool.QueryRow(ctx, `
		SELECT on_hand FROM stock_balances 
		WHERE org_id = $1 AND item_id = $2 AND location_id = $3
	`, orgID, itemID, whALocID).Scan(&healedOnHand)
	if err != nil {
		t.Fatalf("failed to query healed balance: %v", err)
	}
	if healedOnHand != 70.0 {
		t.Errorf("expected healed on_hand = 70.0, got %f", healedOnHand)
	}

	// 8. Verify audit log entry
	var auditCount int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM audit_log 
		WHERE org_id = $1 AND action = 'RECONCILIATION_DRIFT_HEALED'
	`, orgID).Scan(&auditCount)
	if err != nil {
		t.Fatalf("failed to query audit log: %v", err)
	}
	if auditCount == 0 {
		t.Errorf("expected at least 1 audit_log record for healed drift")
	}

	t.Log("PASS: Ledger reconciliation and stock_balances auto-healing verified.")
}

func Test_B5_River_Background_Worker_Execution(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	tdb := database.NewTenantDB(pool)
	svc := inventory.NewStockMovementService(tdb)

	// 1. Setup item
	itemID := uuid.New()
	sku := fmt.Sprintf("B5-RIVER-%s", uuid.New().String()[:8])
	_, err := pool.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active)
		VALUES ($1, $2, $3, 'River Recon Item', 'none', 'pcs', 'wac', true)
	`, itemID, orgID, sku)
	if err != nil {
		t.Fatalf("failed to insert item: %v", err)
	}

	// 2. Setup locations
	vendorLocID := uuid.New()
	whLocID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO locations (location_id, org_id, name, category, is_active)
		VALUES 
			($1, $2, 'River Vendor', 'virtual_vendor', true),
			($3, $2, 'River Wh', 'physical_warehouse', true)
	`, vendorLocID, orgID, whLocID)

	// Inward 50 pcs
	_, err = svc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: vendorLocID,
		ToLocationID:   whLocID,
		Quantity:       50.0,
		MoveType:       "inward",
		ReferenceCode:      "PO-RIVER-01",
	})
	if err != nil {
		t.Fatalf("ExecuteMove inward failed: %v", err)
	}

	// Corrupt cache
	_, _ = pool.Exec(ctx, `
		UPDATE stock_balances SET on_hand = 12.0 
		WHERE org_id = $1 AND item_id = $2 AND location_id = $3
	`, orgID, itemID, whLocID)

	// 3. Initialize ReconciliationWorker and invoke Work
	worker := jobs.NewReconciliationWorker(tdb, svc)
	job := &river.Job[jobs.ReconciliationArgs]{
		Args: jobs.ReconciliationArgs{
			OrgID:  orgID,
			ItemID: itemID,
		},
	}

	err = worker.Work(ctx, job)
	if err != nil {
		t.Fatalf("River worker Work failed: %v", err)
	}

	// 4. Verify balance is restored to 50.0
	var finalOnHand float64
	err = pool.QueryRow(ctx, `
		SELECT on_hand FROM stock_balances 
		WHERE org_id = $1 AND item_id = $2 AND location_id = $3
	`, orgID, itemID, whLocID).Scan(&finalOnHand)
	if err != nil {
		t.Fatalf("failed to query final balance: %v", err)
	}
	if finalOnHand != 50.0 {
		t.Errorf("expected final on_hand healed to 50.0, got %f", finalOnHand)
	}

	t.Log("PASS: River background reconciliation worker successfully healed ledger drift.")
}
