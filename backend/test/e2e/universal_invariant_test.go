package e2e_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"whoopit-core/internal/modules/catalog"
	"whoopit-core/internal/modules/custody"
	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/modules/profiles"
	"whoopit-core/internal/modules/retail"
	"whoopit-core/internal/modules/warehouse"
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

func TestUniversal_MultiIndustry_Invariant_E2E(t *testing.T) {
	ctx := context.Background()
	pool := getTestPool(t)
	defer pool.Close()

	valkeyClient, err := cache.NewValkeyClient("localhost:6379")
	if err != nil {
		t.Logf("Valkey unavailable for optional cache in e2e: %v", err)
	} else {
		defer valkeyClient.Close()
	}

	tdb := database.NewTenantDB(pool)
	moveSvc := inventory.NewStockMovementService(tdb)

	validator, err := profiles.NewSchemaValidator()
	if err != nil {
		t.Fatalf("Failed to initialize schema validator: %v", err)
	}

	// Setup Central Router with all modules mounted
	router := platformHttp.NewRouter(nil)
	catalog.RegisterRoutes(router, tdb, validator)
	inventory.RegisterRoutes(router, tdb)
	custody.RegisterRoutes(router, tdb, moveSvc, valkeyClient)
	warehouse.RegisterRoutes(router, tdb, moveSvc)
	retail.RegisterRoutes(router, tdb, moveSvc)

	orgID := uuid.New()
	adminUserID := uuid.New()
	custodyEmpUserID := uuid.New()

	// Location IDs for all 4 Verticals
	var (
		locVendor      uuid.UUID
		locWarehouse   uuid.UUID
		locITStore     uuid.UUID
		locRetailStore uuid.UUID
		locFactory     uuid.UUID
		locCustody     uuid.UUID
		locCustomer    uuid.UUID
		locScrap       uuid.UUID
	)

	// Item IDs
	var (
		laptopItemID   uuid.UUID
		chemicalItemID uuid.UUID
		keyboardItemID uuid.UUID
	)

	// -------------------------------------------------------------------------
	// 1. BOOTSTRAP: Organization, Users, and Complete Location Hierarchy
	// -------------------------------------------------------------------------
	err = tdb.WithAdminTx(ctx, func(q *db.Queries, tx pgx.Tx) error {
		_, err := q.CreateOrganization(ctx, db.CreateOrganizationParams{
			OrgID: orgID,
			Name:  "OmniCorp Multi-Industry Global Enterprise",
			Slug:  "omnicorp-" + orgID.String()[:8],
			Plan:  "enterprise",
		})
		return err
	})
	if err != nil {
		t.Fatalf("Failed to create test organization: %v", err)
	}

	err = tdb.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		// Users
		_, err := q.CreateUser(ctx, db.CreateUserParams{
			UserID:       adminUserID,
			OrgID:        orgID,
			Email:        "admin@omnicorp.com",
			PasswordHash: "$2a$12$hash1",
			Role:         "admin",
		})
		if err != nil {
			return err
		}

		_, err = q.CreateUser(ctx, db.CreateUserParams{
			UserID:       custodyEmpUserID,
			OrgID:        orgID,
			Email:        "sarah.connor@omnicorp.com",
			PasswordHash: "$2a$12$hash2",
			Role:         "employee",
		})
		if err != nil {
			return err
		}

		// Virtual Vendor
		vLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Global Suppliers",
			Category: "virtual_vendor",
		})
		if err != nil {
			return err
		}
		locVendor = vLoc.LocationID

		// Physical Central Warehouse
		wLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Central Logistics Warehouse",
			Category: "physical_warehouse",
		})
		if err != nil {
			return err
		}
		locWarehouse = wLoc.LocationID

		// Physical Office IT Store
		itLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Corporate IT Depot",
			Category: "physical_office",
		})
		if err != nil {
			return err
		}
		locITStore = itLoc.LocationID

		// Physical Retail Store
		rLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Downtown Retail Flagship",
			Category: "physical_office",
		})
		if err != nil {
			return err
		}
		locRetailStore = rLoc.LocationID

		// Physical Factory Assembly Floor
		fLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Assembly Plant Floor",
			Category: "physical_office",
		})
		if err != nil {
			return err
		}
		locFactory = fLoc.LocationID

		// Virtual Custody
		cLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Virtual Custody",
			Category: "virtual_custody",
		})
		if err != nil {
			return err
		}
		locCustody = cLoc.LocationID

		// Virtual Customer
		custLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Virtual Customers",
			Category: "virtual_customer",
		})
		if err != nil {
			return err
		}
		locCustomer = custLoc.LocationID

		// Virtual Scrap
		sLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Virtual Scrap Bin",
			Category: "virtual_scrap",
		})
		if err != nil {
			return err
		}
		locScrap = sLoc.LocationID

		// ---------------------------------------------------------------------
		// Catalog Items Creation
		// ---------------------------------------------------------------------
		// A. Serialized Laptop (Office IT)
		laptop, err := q.CreateItem(ctx, db.CreateItemParams{
			OrgID:           orgID,
			Sku:             "TP-X1-GEN12-" + orgID.String()[:6],
			Name:            "Lenovo ThinkPad X1 Carbon Gen 12",
			TrackingMode:    "serialized",
			BaseUom:         "unit",
			ValuationMethod: "fifo",
			Attributes:      []byte(`{"serial_number": "SN-TP-998811", "ram_gb": 32, "storage_spec": "1TB", "condition_grade": "A"}`),
		})
		if err != nil {
			return err
		}
		laptopItemID = laptop.ItemID

		// B. Batch Chemical Solvent (Warehouse)
		chem, err := q.CreateItem(ctx, db.CreateItemParams{
			OrgID:           orgID,
			Sku:             "CHEM-X-500L-" + orgID.String()[:6],
			Name:            "Industrial Solvent Chem-X",
			TrackingMode:    "batch",
			BaseUom:         "unit",
			ValuationMethod: "fifo",
			Attributes:      []byte(`{"lot_number": "BATCH-001", "expiry_date": "2026-11-01", "storage_temp": "20C"}`),
		})
		if err != nil {
			return err
		}
		chemicalItemID = chem.ItemID

		// C. Retail Barcoded Keyboard (Retail POS)
		kb, err := q.CreateItem(ctx, db.CreateItemParams{
			OrgID:           orgID,
			Sku:             "KB-MECH-RGB-" + orgID.String()[:6],
			Name:            "Ergonomic Mechanical Keyboard",
			TrackingMode:    "bulk",
			BaseUom:         "unit",
			ValuationMethod: "fifo",
			Attributes:      []byte(`{"barcode_upc": "8901234567890", "size": "Standard", "color": "Matte Black"}`),
		})
		if err != nil {
			return err
		}
		keyboardItemID = kb.ItemID

		return nil
	})
	if err != nil {
		t.Fatalf("Failed to bootstrap locations and items: %v", err)
	}

	// -------------------------------------------------------------------------
	// A. OFFICE IT VERTICAL: Inward Receipt -> Check-Out to Employee Custody
	// -------------------------------------------------------------------------
	t.Run("Vertical A (Office IT): Receipt & Check-Out to Custody", func(t *testing.T) {
		// 1. Inward Receipt: 1 ThinkPad into Corporate IT Depot
		res, err := moveSvc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
			OrgID:          orgID,
			ItemID:         laptopItemID,
			FromLocationID: locVendor,
			ToLocationID:   locITStore,
			Quantity:       1.0,
			MoveType:       "INWARD_RECEIPT",
			ReferenceCode:  "PO-IT-001",
			ActorID:        adminUserID,
			Lines: []inventory.MoveLineInput{
				{TrackingNumber: "SN-TP-998811", Quantity: 1.0},
			},
		})
		if err != nil {
			t.Fatalf("Failed inward receipt for laptop: %v", err)
		}
		_ = res

		bal, _ := moveSvc.GetLocationBalance(ctx, orgID, locITStore, laptopItemID)
		if bal != 1.0 {
			t.Fatalf("Expected IT Depot balance 1.0, got %v", bal)
		}

		// 2. Check-Out to Sarah Connor via POST /api/v1/assets/checkout
		checkoutPayload := map[string]interface{}{
			"asset_id":             laptopItemID.String(),
			"employee_user_id":     custodyEmpUserID.String(),
			"source_location_id":   locITStore.String(),
			"condition_grade":      "A",
			"expected_return_date": time.Now().AddDate(0, 12, 0).Format(time.RFC3339),
		}
		rawJSON, _ := json.Marshal(checkoutPayload)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/assets/checkout", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("Asset checkout failed (%d): %s", rec.Code, rec.Body.String())
		}

		// Verify: Store balance drops to 0, Custody balance increases to 1
		balStore, _ := moveSvc.GetLocationBalance(ctx, orgID, locITStore, laptopItemID)
		if balStore != 0.0 {
			t.Errorf("Expected IT Depot balance to be 0 after checkout, got %v", balStore)
		}
		balCustody, _ := moveSvc.GetLocationBalance(ctx, orgID, locCustody, laptopItemID)
		if balCustody != 1.0 {
			t.Errorf("Expected Virtual Custody balance to be 1.0, got %v", balCustody)
		}

		t.Logf("Vertical A verified: Laptop in custody. Store balance = %v, Custody balance = %v", balStore, balCustody)
	})

	// -------------------------------------------------------------------------
	// B. WAREHOUSE VERTICAL: Batch Inward -> FEFO Picking Order Verification
	// -------------------------------------------------------------------------
	t.Run("Vertical B (Warehouse): Batch Inward & FEFO Picking Order", func(t *testing.T) {
		// 1. Register Lot A (expires in 10 days) and Lot B (expires in 60 days)
		lotAPayload := map[string]interface{}{
			"item_id":         chemicalItemID.String(),
			"tracking_number": "LOT-CHEM-A",
			"expiration_date": time.Now().AddDate(0, 0, 10).Format(time.RFC3339),
		}
		rawLotA, _ := json.Marshal(lotAPayload)
		reqA := httptest.NewRequest(http.MethodPost, "/api/v1/warehouse/lots", bytes.NewReader(rawLotA))
		reqA.Header.Set("Content-Type", "application/json")
		reqA.Header.Set("X-Tenant-ID", orgID.String())
		recA := httptest.NewRecorder()
		router.ServeHTTP(recA, reqA)
		if recA.Code != http.StatusCreated {
			t.Fatalf("Failed to register Lot A: %s", recA.Body.String())
		}

		lotBPayload := map[string]interface{}{
			"item_id":         chemicalItemID.String(),
			"tracking_number": "LOT-CHEM-B",
			"expiration_date": time.Now().AddDate(0, 0, 60).Format(time.RFC3339),
		}
		rawLotB, _ := json.Marshal(lotBPayload)
		reqB := httptest.NewRequest(http.MethodPost, "/api/v1/warehouse/lots", bytes.NewReader(rawLotB))
		reqB.Header.Set("Content-Type", "application/json")
		reqB.Header.Set("X-Tenant-ID", orgID.String())
		recB := httptest.NewRecorder()
		router.ServeHTTP(recB, reqB)
		if recB.Code != http.StatusCreated {
			t.Fatalf("Failed to register Lot B: %s", recB.Body.String())
		}

		// 2. Receive 5 units of Lot A and 10 units of Lot B into Central Warehouse
		_, err := moveSvc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
			OrgID:          orgID,
			ItemID:         chemicalItemID,
			FromLocationID: locVendor,
			ToLocationID:   locWarehouse,
			Quantity:       5.0,
			MoveType:       "INWARD_RECEIPT",
			ReferenceCode:  "PO-CHEM-A",
			ActorID:        adminUserID,
			Lines: []inventory.MoveLineInput{
				{TrackingNumber: "LOT-CHEM-A", Quantity: 5.0},
			},
		})
		if err != nil {
			t.Fatalf("Failed inward receipt of Lot A: %v", err)
		}

		_, err = moveSvc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
			OrgID:          orgID,
			ItemID:         chemicalItemID,
			FromLocationID: locVendor,
			ToLocationID:   locWarehouse,
			Quantity:       10.0,
			MoveType:       "INWARD_RECEIPT",
			ReferenceCode:  "PO-CHEM-B",
			ActorID:        adminUserID,
			Lines: []inventory.MoveLineInput{
				{TrackingNumber: "LOT-CHEM-B", Quantity: 10.0},
			},
		})
		if err != nil {
			t.Fatalf("Failed inward receipt of Lot B: %v", err)
		}

		balWarehouse, _ := moveSvc.GetLocationBalance(ctx, orgID, locWarehouse, chemicalItemID)
		if balWarehouse != 15.0 {
			t.Fatalf("Expected Warehouse balance 15.0, got %v", balWarehouse)
		}

		// 3. Dispatch 1 unit via FEFO: Warehouse -> Factory Floor
		fefoPayload := map[string]interface{}{
			"item_id":          chemicalItemID.String(),
			"from_location_id": locWarehouse.String(),
			"to_location_id":   locFactory.String(),
			"quantity":         1.0,
			"reference_code":   "REQ-FACTORY-01",
		}
		rawFEFO, _ := json.Marshal(fefoPayload)
		reqFEFO := httptest.NewRequest(http.MethodPost, "/api/v1/warehouse/dispatch-fefo", bytes.NewReader(rawFEFO))
		reqFEFO.Header.Set("Content-Type", "application/json")
		reqFEFO.Header.Set("X-Tenant-ID", orgID.String())
		recFEFO := httptest.NewRecorder()
		router.ServeHTTP(recFEFO, reqFEFO)

		if recFEFO.Code != http.StatusOK {
			t.Fatalf("FEFO dispatch failed (%d): %s", recFEFO.Code, recFEFO.Body.String())
		}

		var fefoResp struct {
			Data struct {
				AllocatedLots []struct {
					TrackingNumber string  `json:"tracking_number"`
					Quantity       float64 `json:"quantity"`
				} `json:"allocated_lots"`
			} `json:"data"`
		}
		_ = json.Unmarshal(recFEFO.Body.Bytes(), &fefoResp)

		if len(fefoResp.Data.AllocatedLots) != 1 {
			t.Fatalf("Expected 1 allocated lot in FEFO response, got %d", len(fefoResp.Data.AllocatedLots))
		}

		pickedLot := fefoResp.Data.AllocatedLots[0].TrackingNumber
		if pickedLot != "LOT-CHEM-A" {
			t.Errorf("FEFO Failure: Expected Lot A (expiring in 10 days) to be picked first, but got %s", pickedLot)
		}

		// Verify balances after FEFO dispatch
		balWHAfter, _ := moveSvc.GetLocationBalance(ctx, orgID, locWarehouse, chemicalItemID)
		if balWHAfter != 14.0 {
			t.Errorf("Expected Warehouse balance 14.0, got %v", balWHAfter)
		}
		balFact, _ := moveSvc.GetLocationBalance(ctx, orgID, locFactory, chemicalItemID)
		if balFact != 1.0 {
			t.Errorf("Expected Factory balance 1.0, got %v", balFact)
		}

		t.Logf("Vertical B verified: FEFO strictly picked earliest-expiring %s. Warehouse: %v, Factory: %v", pickedLot, balWHAfter, balFact)
	})

	// -------------------------------------------------------------------------
	// C. RETAIL VERTICAL: Barcode Quick-Deduction POS Sale
	// -------------------------------------------------------------------------
	t.Run("Vertical C (Retail): Fast POS Stock Deduction", func(t *testing.T) {
		// 1. Inward receipt: 10 Keyboards into Downtown Retail Flagship
		_, err := moveSvc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
			OrgID:          orgID,
			ItemID:         keyboardItemID,
			FromLocationID: locVendor,
			ToLocationID:   locRetailStore,
			Quantity:       10.0,
			MoveType:       "INWARD_RECEIPT",
			ReferenceCode:  "PO-RETAIL-01",
			ActorID:        adminUserID,
		})
		if err != nil {
			t.Fatalf("Failed inward receipt for keyboards: %v", err)
		}

		balStoreBefore, _ := moveSvc.GetLocationBalance(ctx, orgID, locRetailStore, keyboardItemID)
		if balStoreBefore != 10.0 {
			t.Fatalf("Expected Retail Store balance 10.0, got %v", balStoreBefore)
		}

		// 2. Sell 3 keyboards via barcode "8901234567890"
		sellPayload := map[string]interface{}{
			"sku_or_barcode":    "8901234567890",
			"quantity":          3.0,
			"store_location_id": locRetailStore.String(),
			"receipt_id":        "RCPT-2026-0001",
		}
		rawSell, _ := json.Marshal(sellPayload)
		reqSell := httptest.NewRequest(http.MethodPost, "/api/v1/retail/sell", bytes.NewReader(rawSell))
		reqSell.Header.Set("Content-Type", "application/json")
		reqSell.Header.Set("X-Tenant-ID", orgID.String())
		recSell := httptest.NewRecorder()
		router.ServeHTTP(recSell, reqSell)

		if recSell.Code != http.StatusOK {
			t.Fatalf("Retail sale failed (%d): %s", recSell.Code, recSell.Body.String())
		}

		var sellResp struct {
			Data struct {
				RemainingShelfBalance float64 `json:"remaining_shelf_balance"`
				SoldQuantity          float64 `json:"sold_quantity"`
			} `json:"data"`
		}
		_ = json.Unmarshal(recSell.Body.Bytes(), &sellResp)

		if sellResp.Data.RemainingShelfBalance != 7.0 {
			t.Errorf("Expected remaining shelf balance 7.0, got %v", sellResp.Data.RemainingShelfBalance)
		}

		// Verify store balance and customer location balance
		balStoreAfter, _ := moveSvc.GetLocationBalance(ctx, orgID, locRetailStore, keyboardItemID)
		if balStoreAfter != 7.0 {
			t.Errorf("Expected Store balance 7.0, got %v", balStoreAfter)
		}
		balCustomer, _ := moveSvc.GetLocationBalance(ctx, orgID, locCustomer, keyboardItemID)
		if balCustomer != 3.0 {
			t.Errorf("Expected Virtual Customer balance 3.0, got %v", balCustomer)
		}

		t.Logf("Vertical C verified: 3 units sold via barcode. Shelf: %v, Customers: %v", balStoreAfter, balCustomer)
	})

	// -------------------------------------------------------------------------
	// D. FACTORY VERTICAL: Scrap Movement
	// -------------------------------------------------------------------------
	t.Run("Vertical D (Factory): Defective Stock Scrap Transfer", func(t *testing.T) {
		// Transfer 1 unit of chemical from Factory Floor to Virtual Scrap Bin
		_, err := moveSvc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
			OrgID:          orgID,
			ItemID:         chemicalItemID,
			FromLocationID: locFactory,
			ToLocationID:   locScrap,
			Quantity:       1.0,
			MoveType:       "SCRAP",
			ReferenceCode:  "SCRAP-DEFECT-001",
			ActorID:        adminUserID,
			Lines: []inventory.MoveLineInput{
				{TrackingNumber: "LOT-CHEM-A", Quantity: 1.0},
			},
		})
		if err != nil {
			t.Fatalf("Failed to execute scrap movement: %v", err)
		}

		balFactoryAfter, _ := moveSvc.GetLocationBalance(ctx, orgID, locFactory, chemicalItemID)
		if balFactoryAfter != 0.0 {
			t.Errorf("Expected Factory balance 0.0 after scrap, got %v", balFactoryAfter)
		}
		balScrap, _ := moveSvc.GetLocationBalance(ctx, orgID, locScrap, chemicalItemID)
		if balScrap != 1.0 {
			t.Errorf("Expected Virtual Scrap balance 1.0, got %v", balScrap)
		}

		t.Logf("Vertical D verified: 1 unit scrapped. Factory: %v, Scrap: %v", balFactoryAfter, balScrap)
	})

	// -------------------------------------------------------------------------
	// MATHEMATICAL INVARIANT & CONSERVATION PROOF
	// -------------------------------------------------------------------------
	t.Run("Mathematical Invariant: Global Stock Conservation & Zero Negative Physical Stock", func(t *testing.T) {
		// 1. Calculate Total Inward Stock Received from Vendor:
		// Laptop: 1
		// Chemical Chem-X: 5 (Lot A) + 10 (Lot B) = 15
		// Keyboard: 10
		totalInwardReceived := 1.0 + 15.0 + 10.0 // 26.0

		// 2. Query Current Balances across all Physical Locations:
		balITStore, _ := moveSvc.GetLocationBalance(ctx, orgID, locITStore, laptopItemID)
		balWarehouse, _ := moveSvc.GetLocationBalance(ctx, orgID, locWarehouse, chemicalItemID)
		balRetail, _ := moveSvc.GetLocationBalance(ctx, orgID, locRetailStore, keyboardItemID)
		balFactory, _ := moveSvc.GetLocationBalance(ctx, orgID, locFactory, chemicalItemID)

		totalPhysicalStock := balITStore + balWarehouse + balRetail + balFactory // 0 + 14 + 7 + 0 = 21.0

		// 3. Query Balances at Virtual Destination Locations:
		balCustody, _ := moveSvc.GetLocationBalance(ctx, orgID, locCustody, laptopItemID)    // 1.0
		balCustomer, _ := moveSvc.GetLocationBalance(ctx, orgID, locCustomer, keyboardItemID) // 3.0
		balScrap, _ := moveSvc.GetLocationBalance(ctx, orgID, locScrap, chemicalItemID)       // 1.0

		totalAccountedStock := totalPhysicalStock + balCustody + balCustomer + balScrap // 21 + 1 + 3 + 1 = 26.0

		t.Logf("Mathematical Audit Summary:")
		t.Logf("  Total Inward Stock Received:  %.4f", totalInwardReceived)
		t.Logf("  Total Physical On-Hand Stock: %.4f (IT Store: %.1f, Warehouse: %.1f, Retail: %.1f, Factory: %.1f)",
			totalPhysicalStock, balITStore, balWarehouse, balRetail, balFactory)
		t.Logf("  Total Virtual Stock:          %.4f (Custody: %.1f, Customers: %.1f, Scrap: %.1f)",
			balCustody+balCustomer+balScrap, balCustody, balCustomer, balScrap)
		t.Logf("  Total Accounted Stock:        %.4f", totalAccountedStock)

		// Assert Mathematical Equality: Total Inward == Physical + Custody + Customer + Scrap
		if totalInwardReceived != totalAccountedStock {
			t.Fatalf("INVARIANT VIOLATION: Total inward stock (%.4f) != Accounted stock (%.4f)",
				totalInwardReceived, totalAccountedStock)
		}

		// Assert Zero Negative Stock across all physical locations
		physicalBalances := map[string]float64{
			"IT Depot Store":   balITStore,
			"Central Warehouse": balWarehouse,
			"Retail Flagship":  balRetail,
			"Factory Floor":    balFactory,
		}
		for locName, balance := range physicalBalances {
			if balance < 0 {
				t.Fatalf("INVARIANT VIOLATION: Negative stock detected at %s: %.4f", locName, balance)
			}
		}

		t.Logf("MATHEMATICAL PROOF VERIFIED: Conservation of stock holds with 100%% precision. No physical location has negative stock.")
	})
}
