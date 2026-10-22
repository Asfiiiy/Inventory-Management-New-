package custody_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"whoopit-core/internal/modules/custody"
	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/cache"
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

func getTestValkey(t *testing.T) *cache.ValkeyClient {
	addr := os.Getenv("VALKEY_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	client, err := cache.NewValkeyClient(addr)
	if err != nil {
		t.Fatalf("Failed to connect to Valkey: %v", err)
	}
	return client
}

func TestCustody_Lifecycle_And_Valkey_Reservation(t *testing.T) {
	ctx := context.Background()
	pool := getTestPool(t)
	defer pool.Close()

	valkeyClient := getTestValkey(t)
	defer valkeyClient.Close()

	tdb := database.NewTenantDB(pool)
	moveSvc := inventory.NewStockMovementService(tdb)

	// Setup Chi Router
	router := platformHttp.NewRouter(nil)
	inventory.RegisterRoutes(router, tdb)
	custody.RegisterRoutes(router, tdb, moveSvc, valkeyClient)

	orgID := uuid.New()
	empAUserID := uuid.New()
	empBUserID := uuid.New()

	var vendorLocID, itStoreLocID, macBookItemID uuid.UUID

	// Bootstrap Org, Users, Locations, and Serialized MacBook
	err := tdb.WithAdminTx(ctx, func(q *db.Queries, tx pgx.Tx) error {
		_, err := q.CreateOrganization(ctx, db.CreateOrganizationParams{
			OrgID: orgID,
			Name:  "Apex Technologies Custody Hub",
			Slug:  "apex-custody-" + orgID.String()[:8],
			Plan:  "enterprise",
		})
		return err
	})
	if err != nil {
		t.Fatalf("Failed to bootstrap organization: %v", err)
	}

	err = tdb.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		// Insert Employee A
		_, err := q.CreateUser(ctx, db.CreateUserParams{
			UserID:       empAUserID,
			OrgID:        orgID,
			Email:        "employee.a@apex.com",
			PasswordHash: "$2a$12$hash1",
			Role:         "employee",
		})
		if err != nil {
			return err
		}

		// Insert Employee B
		_, err = q.CreateUser(ctx, db.CreateUserParams{
			UserID:       empBUserID,
			OrgID:        orgID,
			Email:        "employee.b@apex.com",
			PasswordHash: "$2a$12$hash2",
			Role:         "employee",
		})
		if err != nil {
			return err
		}

		// Vendor Virtual Location
		vLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Apple Direct Vendor",
			Category: "virtual_vendor",
		})
		if err != nil {
			return err
		}
		vendorLocID = vLoc.LocationID

		// Physical Office IT Store
		itLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "HQ IT Hardware Store",
			Category: "physical_office",
		})
		if err != nil {
			return err
		}
		itStoreLocID = itLoc.LocationID

		// Serialized MacBook Pro M3
		item, err := q.CreateItem(ctx, db.CreateItemParams{
			OrgID:           orgID,
			Sku:             "MAC-M3-PRO-" + orgID.String()[:6],
			Name:            "MacBook Pro M3 Space Black",
			TrackingMode:    "serialized",
			BaseUom:         "unit",
			ValuationMethod: "fifo",
			Attributes:      []byte(`{"serial_number": "SN-MAC-770011", "ram_gb": 36, "storage_spec": "1TB", "condition_grade": "A"}`),
		})
		if err != nil {
			return err
		}
		macBookItemID = item.ItemID

		// Receive 1 MacBook into HQ IT Store: Vendor -> HQ IT Store
		moveQty := pgtype.Numeric{}
		_ = moveQty.Scan("1.0000")
		_, err = q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          orgID,
			ItemID:         macBookItemID,
			FromLocationID: vendorLocID,
			ToLocationID:   itStoreLocID,
			Quantity:       moveQty,
			MoveType:       "INWARD_RECEIPT",
			ReferenceCode:  pgtype.Text{String: "PO-APPLE-001", Valid: true},
			ActorID:        empAUserID,
		})
		return err
	})
	if err != nil {
		t.Fatalf("Failed to initialize locations and item: %v", err)
	}

	var activeAssignmentID string

	// -------------------------------------------------------------------------
	// Test 1 (Full Custody Lifecycle - Check-Out):
	// Check-out MacBook to Employee A.
	// Verify Store balance = 0, Employee A custody lists MacBook, assignment is active.
	// -------------------------------------------------------------------------
	t.Run("Test 1: Check-out to Employee A & Automatic Movement", func(t *testing.T) {
		checkoutPayload := map[string]interface{}{
			"asset_id":             macBookItemID.String(),
			"employee_user_id":     empAUserID.String(),
			"source_location_id":   itStoreLocID.String(),
			"condition_grade":      "A",
			"expected_return_date": time.Now().AddDate(0, 6, 0).Format(time.RFC3339),
		}
		rawJSON, _ := json.Marshal(checkoutPayload)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/assets/checkout", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("Expected HTTP 201 Created for asset checkout, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		var checkOutResp struct {
			Success bool `json:"success"`
			Data    struct {
				Assignment struct {
					AssignmentID string `json:"assignment_id"`
				} `json:"assignment"`
			} `json:"data"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &checkOutResp)
		activeAssignmentID = checkOutResp.Data.Assignment.AssignmentID

		// Verify: Office IT Store balance is now 0 (transferred to Virtual/Custody)
		bal, err := moveSvc.GetLocationBalance(ctx, orgID, itStoreLocID, macBookItemID)
		if err != nil {
			t.Fatalf("Failed to query store balance: %v", err)
		}
		if bal != 0.0 {
			t.Errorf("Expected store balance to be 0 after checkout, got %v", bal)
		}

		// Verify: Employee A active custody list returns the MacBook
		listReq := httptest.NewRequest(http.MethodGet, "/api/v1/assets/custody/employee/"+empAUserID.String(), nil)
		listReq.Header.Set("X-Tenant-ID", orgID.String())
		listRec := httptest.NewRecorder()
		router.ServeHTTP(listRec, listReq)

		if listRec.Code != http.StatusOK {
			t.Fatalf("Failed to list employee custody: %s", listRec.Body.String())
		}

		var listResp struct {
			Data []struct {
				AssetID string `json:"asset_id"`
			} `json:"data"`
		}
		_ = json.Unmarshal(listRec.Body.Bytes(), &listResp)

		if len(listResp.Data) != 1 || listResp.Data[0].AssetID != macBookItemID.String() {
			t.Errorf("Expected MacBook in Employee A custody list, got: %+v", listResp.Data)
		}

		t.Logf("Test 1 passed! Asset successfully deployed to Employee A. Store balance: 0. Assignment: %s", activeAssignmentID)
	})

	// -------------------------------------------------------------------------
	// Test 2 (Anti-Double Assignment Guard -> HTTP 409):
	// Attempt to check-out the same MacBook to Employee B while still deployed.
	// -------------------------------------------------------------------------
	t.Run("Test 2: Anti-Double Assignment Guard -> HTTP 409 Conflict", func(t *testing.T) {
		doubleCheckoutPayload := map[string]interface{}{
			"asset_id":           macBookItemID.String(),
			"employee_user_id":   empBUserID.String(),
			"source_location_id": itStoreLocID.String(),
		}
		rawJSON, _ := json.Marshal(doubleCheckoutPayload)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/assets/checkout", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusConflict {
			t.Fatalf("Expected HTTP 409 Conflict for double-assignment, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		var problem platformHttp.ProblemDetails
		_ = json.Unmarshal(rec.Body.Bytes(), &problem)
		if problem.Title != "Asset Deployment Conflict" {
			t.Errorf("Expected problem title 'Asset Deployment Conflict', got '%s'", problem.Title)
		}

		t.Logf("Test 2 passed! Double-assignment strictly rejected with HTTP 409: %s", problem.Detail)
	})

	// -------------------------------------------------------------------------
	// Test 3 (Check-in / Return):
	// Return MacBook back to Office IT Store.
	// Verify: Store balance restores to 1, and Employee A active custody is empty.
	// -------------------------------------------------------------------------
	t.Run("Test 3: Check-in / Return back to Office Store", func(t *testing.T) {
		checkinPayload := map[string]interface{}{
			"assignment_id":         activeAssignmentID,
			"return_to_location_id": itStoreLocID.String(),
			"condition_grade":       "A",
			"notes":                 "Returned in mint condition after project completion",
		}
		rawJSON, _ := json.Marshal(checkinPayload)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/assets/checkin", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected HTTP 200 OK for asset check-in, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		// Verify: Office IT Store balance restores to 1.0
		bal, err := moveSvc.GetLocationBalance(ctx, orgID, itStoreLocID, macBookItemID)
		if err != nil {
			t.Fatalf("Failed to query store balance: %v", err)
		}
		if bal != 1.0 {
			t.Errorf("Expected store balance to restore to 1.0, got %v", bal)
		}

		// Verify: Employee A active custody is now empty
		listReq := httptest.NewRequest(http.MethodGet, "/api/v1/assets/custody/employee/"+empAUserID.String(), nil)
		listReq.Header.Set("X-Tenant-ID", orgID.String())
		listRec := httptest.NewRecorder()
		router.ServeHTTP(listRec, listReq)

		var listResp struct {
			Data []interface{} `json:"data"`
		}
		_ = json.Unmarshal(listRec.Body.Bytes(), &listResp)

		if len(listResp.Data) != 0 {
			t.Errorf("Expected Employee A custody to be 0 after check-in, got %d", len(listResp.Data))
		}

		t.Logf("Test 3 passed! Asset returned. Store balance restored to %v. Custody empty.", bal)
	})

	// -------------------------------------------------------------------------
	// Test 4 (Valkey Atomic Reservation):
	// Seed Valkey with 5 units. Run 10 concurrent requests and assert zero oversell.
	// -------------------------------------------------------------------------
	t.Run("Test 4: Valkey Atomic Reservation & Oversell Prevention", func(t *testing.T) {
		resvItemID := uuid.New()
		resvLocID := uuid.New()

		// 1. Seed Valkey with 5 units
		err := valkeyClient.SetAvailableStock(ctx, orgID, resvItemID, resvLocID, 5)
		if err != nil {
			t.Fatalf("Failed to seed Valkey stock: %v", err)
		}

		// 2. Launch 10 concurrent reservation attempts for 1 unit each
		totalRequests := 10
		var successfulReservations int32
		var rejectedReservations int32

		var wg sync.WaitGroup
		wg.Add(totalRequests)

		for i := 0; i < totalRequests; i++ {
			go func() {
				defer wg.Done()

				payload := map[string]interface{}{
					"item_id":     resvItemID.String(),
					"location_id": resvLocID.String(),
					"quantity":    1,
				}
				rawJSON, _ := json.Marshal(payload)

				req := httptest.NewRequest(http.MethodPost, "/api/v1/stock/reserve", bytes.NewReader(rawJSON))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Tenant-ID", orgID.String())
				rec := httptest.NewRecorder()

				router.ServeHTTP(rec, req)

				if rec.Code == http.StatusOK {
					atomic.AddInt32(&successfulReservations, 1)
				} else if rec.Code == http.StatusUnprocessableEntity {
					atomic.AddInt32(&rejectedReservations, 1)
				}
			}()
		}

		wg.Wait()

		if successfulReservations != 5 {
			t.Errorf("Expected exactly 5 successful reservations, got %d", successfulReservations)
		}
		if rejectedReservations != 5 {
			t.Errorf("Expected exactly 5 rejected reservations, got %d", rejectedReservations)
		}

		// Verify remaining stock in Valkey is 0
		remaining, err := valkeyClient.GetAvailableStock(ctx, orgID, resvItemID, resvLocID)
		if err != nil {
			t.Fatalf("Failed to read remaining Valkey stock: %v", err)
		}
		if remaining != 0 {
			t.Errorf("Expected remaining stock in Valkey to be 0, got %d", remaining)
		}

		t.Logf("Test 4 passed! Valkey atomic reservation: 5 approved, 5 denied. Zero overselling.")
	})
}
