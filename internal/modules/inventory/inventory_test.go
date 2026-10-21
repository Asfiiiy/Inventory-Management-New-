package inventory_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
	platformHttp "whoopit-core/internal/platform/http"
)

func getTestPool(t *testing.T) *pgxpool.Pool {
	connStr := os.Getenv("TEST_DATABASE_URL")
	if connStr == "" {
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

func TestStockMovement_Engine_And_Balance_Validation(t *testing.T) {
	ctx := context.Background()
	pool := getTestPool(t)
	defer pool.Close()

	tdb := database.NewTenantDB(pool)

	// Setup Chi Router
	router := platformHttp.NewRouter(nil)
	inventory.RegisterRoutes(router, tdb)

	orgID := uuid.New()
	var vendorLocID, warehouseLocID, shelfLocID, bulkItemID, serialItemID uuid.UUID

	// Bootstrap Organization, Locations, and Items
	err := tdb.WithAdminTx(ctx, func(q *db.Queries, tx pgx.Tx) error {
		_, err := q.CreateOrganization(ctx, db.CreateOrganizationParams{
			OrgID: orgID,
			Name:  "Atlas Universal Supply Chain",
			Slug:  "atlas-" + orgID.String()[:8],
			Plan:  "enterprise",
		})
		return err
	})
	if err != nil {
		t.Fatalf("Failed to create test organization: %v", err)
	}

	err = tdb.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		// 1. Virtual Vendor Location
		vLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Global Suppliers Virtual",
			Category: "virtual_vendor",
		})
		if err != nil {
			return err
		}
		vendorLocID = vLoc.LocationID

		// 2. Physical Warehouse
		wLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Central Distribution Center",
			Category: "physical_warehouse",
		})
		if err != nil {
			return err
		}
		warehouseLocID = wLoc.LocationID

		// 3. Physical Shelf under Warehouse
		sLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Aisle 01 / Shelf B",
			Category: "physical_warehouse",
			ParentID: pgtype.UUID{Bytes: warehouseLocID, Valid: true},
		})
		if err != nil {
			return err
		}
		shelfLocID = sLoc.LocationID

		// 4. Bulk Consumable Item
		bItem, err := q.CreateItem(ctx, db.CreateItemParams{
			OrgID:           orgID,
			Sku:             "CBL-CAT6-100M-" + orgID.String()[:6],
			Name:            "Cat6 Shielded Cable Reel 100M",
			TrackingMode:    "bulk",
			BaseUom:         "meter",
			ValuationMethod: "fifo",
			Attributes:      []byte(`{"gauge": "23AWG", "shielding": "STP"}`),
		})
		if err != nil {
			return err
		}
		bulkItemID = bItem.ItemID

		// 5. Serialized Equipment Item
		sItem, err := q.CreateItem(ctx, db.CreateItemParams{
			OrgID:           orgID,
			Sku:             "LPT-MAC-M3-" + orgID.String()[:6],
			Name:            "Apple MacBook Pro 16 M3 Max",
			TrackingMode:    "serialized",
			BaseUom:         "unit",
			ValuationMethod: "fifo",
			Attributes:      []byte(`{"ram": "36GB", "storage": "1TB"}`),
		})
		if err != nil {
			return err
		}
		serialItemID = sItem.ItemID

		return nil
	})
	if err != nil {
		t.Fatalf("Failed to bootstrap inventory test entities: %v", err)
	}

	// -------------------------------------------------------------------------
	// Test 1 (Inward Receipt): Virtual Vendor -> Physical Warehouse (Qty: 10.0)
	// -------------------------------------------------------------------------
	t.Run("Test 1: Inward Receipt from Vendor to Warehouse", func(t *testing.T) {
		movePayload := map[string]interface{}{
			"item_id":          bulkItemID.String(),
			"from_location_id": vendorLocID.String(),
			"to_location_id":   warehouseLocID.String(),
			"quantity":         10.0,
			"move_type":        "INWARD_RECEIPT",
			"reference_code":   "PO-ATLAS-2026-001",
		}
		rawJSON, _ := json.Marshal(movePayload)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/stock/moves", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("Expected HTTP 201 Created for inward move, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		// Verify Warehouse Balance == 10.0
		balReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/stock/locations/%s/balance?item_id=%s", warehouseLocID, bulkItemID), nil)
		balReq.Header.Set("X-Tenant-ID", orgID.String())
		balRec := httptest.NewRecorder()
		router.ServeHTTP(balRec, balReq)

		if balRec.Code != http.StatusOK {
			t.Fatalf("Failed to get location balance: %s", balRec.Body.String())
		}

		var balResp struct {
			Success bool `json:"success"`
			Data    struct {
				Balance float64 `json:"balance"`
			} `json:"data"`
		}
		_ = json.Unmarshal(balRec.Body.Bytes(), &balResp)

		if balResp.Data.Balance != 10.0 {
			t.Errorf("Expected warehouse balance of 10.0, got %v", balResp.Data.Balance)
		}
		t.Logf("Test 1 passed! Warehouse balance accurately increased to %v", balResp.Data.Balance)
	})

	// -------------------------------------------------------------------------
	// Test 2 (Internal Transfer): Warehouse -> Shelf 01 (Qty: 4.0)
	// Conservation: Warehouse must be 6.0, Shelf must be 4.0, Total == 10.0
	// -------------------------------------------------------------------------
	t.Run("Test 2: Internal Transfer Conserves Stock", func(t *testing.T) {
		transferPayload := map[string]interface{}{
			"item_id":          bulkItemID.String(),
			"from_location_id": warehouseLocID.String(),
			"to_location_id":   shelfLocID.String(),
			"quantity":         4.0,
			"move_type":        "INTERNAL_TRANSFER",
			"reference_code":   "TRANS-BIN-01",
		}
		rawJSON, _ := json.Marshal(transferPayload)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/stock/moves", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("Expected HTTP 201 Created for internal transfer, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		// Verify Warehouse Balance == 6.0
		balReqW := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/stock/locations/%s/balance?item_id=%s", warehouseLocID, bulkItemID), nil)
		balReqW.Header.Set("X-Tenant-ID", orgID.String())
		balRecW := httptest.NewRecorder()
		router.ServeHTTP(balRecW, balReqW)

		var respW struct {
			Data struct {
				Balance float64 `json:"balance"`
			} `json:"data"`
		}
		_ = json.Unmarshal(balRecW.Body.Bytes(), &respW)
		if respW.Data.Balance != 6.0 {
			t.Errorf("Expected warehouse balance of 6.0, got %v", respW.Data.Balance)
		}

		// Verify Shelf Balance == 4.0
		balReqS := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/stock/locations/%s/balance?item_id=%s", shelfLocID, bulkItemID), nil)
		balReqS.Header.Set("X-Tenant-ID", orgID.String())
		balRecS := httptest.NewRecorder()
		router.ServeHTTP(balRecS, balReqS)

		var respS struct {
			Data struct {
				Balance float64 `json:"balance"`
			} `json:"data"`
		}
		_ = json.Unmarshal(balRecS.Body.Bytes(), &respS)
		if respS.Data.Balance != 4.0 {
			t.Errorf("Expected shelf balance of 4.0, got %v", respS.Data.Balance)
		}

		// Conservation check
		if respW.Data.Balance+respS.Data.Balance != 10.0 {
			t.Errorf("Conservation violation! Total stock is not conserved: %v + %v != 10.0", respW.Data.Balance, respS.Data.Balance)
		}
		t.Logf("Test 2 passed! Total stock mathematically conserved (Warehouse: %v, Shelf: %v)", respW.Data.Balance, respS.Data.Balance)
	})

	// -------------------------------------------------------------------------
	// Test 3 (Negative Stock Prevention): Attempt to move 10.0 out of Shelf (Available: 4.0)
	// MUST fail with HTTP 422 Problem Details "Insufficient Stock"
	// -------------------------------------------------------------------------
	t.Run("Test 3: Negative Stock Prevention -> HTTP 422", func(t *testing.T) {
		excessPayload := map[string]interface{}{
			"item_id":          bulkItemID.String(),
			"from_location_id": shelfLocID.String(),
			"to_location_id":   warehouseLocID.String(),
			"quantity":         10.0, // Shelf only has 4.0!
			"move_type":        "INTERNAL_TRANSFER",
		}
		rawJSON, _ := json.Marshal(excessPayload)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/stock/moves", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("Expected HTTP 422 Unprocessable Entity for negative stock, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		var problem platformHttp.ProblemDetails
		if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
			t.Fatalf("Failed to parse Problem Details: %v", err)
		}

		if problem.Title != "Insufficient Stock" {
			t.Errorf("Expected Problem Title 'Insufficient Stock', got '%s'", problem.Title)
		}

		// Verify Shelf Balance is STILL 4.0 (zero mutation after rollback)
		balReqS := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/stock/locations/%s/balance?item_id=%s", shelfLocID, bulkItemID), nil)
		balReqS.Header.Set("X-Tenant-ID", orgID.String())
		balRecS := httptest.NewRecorder()
		router.ServeHTTP(balRecS, balReqS)

		var respS struct {
			Data struct {
				Balance float64 `json:"balance"`
			} `json:"data"`
		}
		_ = json.Unmarshal(balRecS.Body.Bytes(), &respS)
		if respS.Data.Balance != 4.0 {
			t.Errorf("Rollback failed! Shelf balance corrupted to %v", respS.Data.Balance)
		}

		t.Logf("Test 3 passed! Negative stock strictly rejected with HTTP 422: %s", problem.Detail)
	})

	// -------------------------------------------------------------------------
	// Test 4 (Serialized Tracking Verification): Move Serialized Item with Tracking Lines
	// -------------------------------------------------------------------------
	t.Run("Test 4: Serialized Tracking Lines Verification", func(t *testing.T) {
		serializedPayload := map[string]interface{}{
			"item_id":          serialItemID.String(),
			"from_location_id": vendorLocID.String(),
			"to_location_id":   warehouseLocID.String(),
			"quantity":         2.0,
			"move_type":        "INWARD_RECEIPT",
			"reference_code":   "PO-MAC-2026-09",
			"lines": []map[string]interface{}{
				{"tracking_number": "SN-MAC-M3-0001", "quantity": 1.0},
				{"tracking_number": "SN-MAC-M3-0002", "quantity": 1.0},
			},
		}
		rawJSON, _ := json.Marshal(serializedPayload)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/stock/moves", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("Expected HTTP 201 Created for serialized move, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		var moveResp struct {
			Success bool `json:"success"`
			Data    struct {
				Move struct {
					MoveID string `json:"move_id"`
				} `json:"move"`
				Lines []struct {
					LineID         string `json:"line_id"`
					TrackingNumber string `json:"tracking_number"`
				} `json:"lines"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &moveResp); err != nil {
			t.Fatalf("Failed to parse move response: %v", err)
		}

		if len(moveResp.Data.Lines) != 2 {
			t.Fatalf("Expected 2 move lines, got %d", len(moveResp.Data.Lines))
		}

		// Negative Case: Attempt serialized move without lines matching quantity -> MUST FAIL HTTP 422
		invalidSerialPayload := map[string]interface{}{
			"item_id":          serialItemID.String(),
			"from_location_id": vendorLocID.String(),
			"to_location_id":   warehouseLocID.String(),
			"quantity":         2.0,
			"move_type":        "INWARD_RECEIPT",
			"lines": []map[string]interface{}{
				{"tracking_number": "SN-MAC-M3-SINGLE", "quantity": 2.0}, // Quantity must be 1.0 per line!
			},
		}
		invalidJSON, _ := json.Marshal(invalidSerialPayload)

		badReq := httptest.NewRequest(http.MethodPost, "/api/v1/stock/moves", bytes.NewReader(invalidJSON))
		badReq.Header.Set("Content-Type", "application/json")
		badReq.Header.Set("X-Tenant-ID", orgID.String())
		badRec := httptest.NewRecorder()
		router.ServeHTTP(badRec, badReq)

		if badRec.Code != http.StatusUnprocessableEntity {
			t.Errorf("Expected HTTP 422 for invalid serialized line quantities, got %d", badRec.Code)
		}

		t.Logf("Test 4 passed! Serialized lines confirmed and validated.")
	})
}
