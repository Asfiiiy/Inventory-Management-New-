package database_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
)

func getTestPool(t *testing.T) *pgxpool.Pool {
	connStr := os.Getenv("TEST_DATABASE_URL")
	if connStr == "" {
		// Use whoopit_app to ensure non-superuser RLS enforcement
		connStr = "postgres://whoopit_app:whoopit_app_pw_2026@localhost:5432/whoopit_inventory_v4?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		t.Fatalf("Failed to parse DB config: %v", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatalf("Failed to connect to DB pool: %v", err)
	}

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("Database ping failed: %v", err)
	}

	return pool
}

func TestTenantDB_RLS_Enforcement_And_Move_Ledger(t *testing.T) {
	ctx := context.Background()
	pool := getTestPool(t)
	defer pool.Close()

	tdb := database.NewTenantDB(pool)

	orgAID := uuid.New()
	orgBID := uuid.New()

	// 1. Create Organization A & B
	err := tdb.WithAdminTx(ctx, func(q *db.Queries, tx pgx.Tx) error {
		_, err := q.CreateOrganization(ctx, db.CreateOrganizationParams{
			OrgID: orgAID,
			Name:  "Tenant Alpha Logistics",
			Slug:  "alpha-" + orgAID.String()[:8],
			Plan:  "enterprise",
		})
		if err != nil {
			return err
		}

		_, err = q.CreateOrganization(ctx, db.CreateOrganizationParams{
			OrgID: orgBID,
			Name:  "Tenant Beta Pharma",
			Slug:  "beta-" + orgBID.String()[:8],
			Plan:  "standard",
		})
		return err
	})
	if err != nil {
		t.Fatalf("Failed to create test organizations: %v", err)
	}

	var vendorLocID, warehouseLocID, itemID, moveID uuid.UUID

	// 2. Execute operations within Tenant A context
	err = tdb.WithTenantTx(ctx, orgAID, func(q *db.Queries) error {
		// Create Virtual Vendor Location
		vendorLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgAID,
			Name:     "Global Tech Supplier",
			Category: "virtual_vendor",
		})
		if err != nil {
			return err
		}
		vendorLocID = vendorLoc.LocationID

		// Create Physical Warehouse Location
		warehouseLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgAID,
			Name:     "Central Distribution Center",
			Category: "physical_warehouse",
		})
		if err != nil {
			return err
		}
		warehouseLocID = warehouseLoc.LocationID

		// Create Item with Dynamic JSONB Attributes
		rawAttrs, _ := json.Marshal(map[string]interface{}{
			"brand":      "Dell Technologies",
			"rack_units": "2U",
			"cpu_cores":  64,
			"warranty":   "3yr Onsite ProSupport",
		})

		item, err := q.CreateItem(ctx, db.CreateItemParams{
			OrgID:           orgAID,
			Sku:             "SRV-R760-" + orgAID.String()[:6],
			Name:            "PowerEdge R760 Rack Server",
			TrackingMode:    "serialized",
			BaseUom:         "unit",
			ValuationMethod: "fifo",
			Attributes:      rawAttrs,
		})
		if err != nil {
			return err
		}
		itemID = item.ItemID

		// Execute Inward Stock Move: Vendor -> Warehouse (Quantity: 5)
		moveQty := pgtype.Numeric{}
		_ = moveQty.Scan("5.0000")

		refCode := "PO-2026-ALPHA-001"
		move, err := q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          orgAID,
			ItemID:         itemID,
			FromLocationID: vendorLocID,
			ToLocationID:   warehouseLocID,
			Quantity:       moveQty,
			MoveType:       "INWARD_RECEIPT",
			ReferenceCode:  pgtype.Text{String: refCode, Valid: true},
			ActorID:        uuid.New(),
		})
		if err != nil {
			return err
		}
		moveID = move.MoveID

		// Create Move Line (Serial Number)
		lineQty := pgtype.Numeric{}
		_ = lineQty.Scan("1.0000")
		_, err = q.CreateStockMoveLine(ctx, db.CreateStockMoveLineParams{
			MoveID:         move.MoveID,
			TrackingNumber: "SN-DELL-998811",
			Quantity:       lineQty,
		})
		if err != nil {
			return err
		}

		// Calculate Location Balance at Central Distribution Center
		balance, err := q.CalculateLocationBalance(ctx, db.CalculateLocationBalanceParams{
			OrgID:          orgAID,
			ItemID:         itemID,
			ToLocationID:   warehouseLocID,
		})
		if err != nil {
			return err
		}

		floatVal, err := balance.Float64Value()
		if err != nil || !floatVal.Valid || floatVal.Float64 != 5.0 {
			t.Errorf("Expected balance of 5.0 at warehouse, got %v (err: %v)", floatVal, err)
		}

		// Verify JSONB Search
		searchAttr, _ := json.Marshal(map[string]interface{}{"brand": "Dell Technologies"})
		results, err := q.SearchItemsByAttribute(ctx, db.SearchItemsByAttributeParams{
			OrgID:      orgAID,
			Attributes: searchAttr,
		})
		if err != nil || len(results) == 0 {
			t.Errorf("Failed to query item via JSONB containment: %v", err)
		}

		return nil
	})
	if err != nil {
		t.Fatalf("Tenant A transaction failed: %v", err)
	}

	// 3. Verify Tenant Isolation (Tenant B trying to access Tenant A's data)
	err = tdb.WithTenantTx(ctx, orgBID, func(q *db.Queries) error {
		// Attempt to fetch Tenant A's item -> MUST return ErrNoRows
		_, err := q.GetItemByID(ctx, db.GetItemByIDParams{
			ItemID: itemID,
			OrgID:  orgBID,
		})
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Errorf("Expected pgx.ErrNoRows when accessing cross-tenant item, got: %v", err)
		}

		// Attempt to fetch Tenant A's location -> MUST return ErrNoRows
		_, err = q.GetLocationByID(ctx, db.GetLocationByIDParams{
			LocationID: warehouseLocID,
			OrgID:      orgBID,
		})
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Errorf("Expected pgx.ErrNoRows when accessing cross-tenant location, got: %v", err)
		}

		// Attempt to query stock moves for Tenant A's item as Tenant B -> MUST return 0 rows
		moves, err := q.ListMovesByItem(ctx, db.ListMovesByItemParams{
			OrgID:  orgBID,
			ItemID: itemID,
		})
		if err != nil {
			return err
		}
		if len(moves) != 0 {
			t.Errorf("Data leak! Tenant B saw %d stock moves belonging to Tenant A", len(moves))
		}

		// Verify stock_move_lines RLS security patch: Tenant B querying move lines
		lines, err := q.ListMoveLinesByMoveID(ctx, moveID)
		if err != nil {
			return err
		}
		if len(lines) != 0 {
			t.Errorf("Security Breach! Tenant B saw %d move lines from Tenant A (RLS patch failed)", len(lines))
		}

		return nil
	})
	if err != nil {
		t.Fatalf("Tenant B isolation test failed: %v", err)
	}

	// 4. Test Nil org_id protection
	err = tdb.WithTenantTx(ctx, uuid.Nil, func(q *db.Queries) error {
		return nil
	})
	if err == nil {
		t.Errorf("Expected WithTenantTx to reject uuid.Nil, but it succeeded")
	}
}
