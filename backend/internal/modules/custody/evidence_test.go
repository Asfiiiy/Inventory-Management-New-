package custody_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/modules/custody"
	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
	platformHttp "whoopit-core/internal/platform/http"
)

func TestCustody_Evidence_Sealing_And_Tamper_Proof_Chain(t *testing.T) {
	ctx := context.Background()
	pool := getTestPool(t)
	defer pool.Close()

	valkeyClient := getTestValkey(t)
	defer valkeyClient.Close()

	tdb := database.NewTenantDB(pool)
	moveSvc := inventory.NewStockMovementService(tdb)

	router := platformHttp.NewRouter(nil)
	inventory.RegisterRoutes(router, tdb)
	custody.RegisterRoutes(router, tdb, moveSvc, valkeyClient)

	orgID := uuid.New()
	empUserID := uuid.New()
	var vendorLocID, storeLocID, laptopItemID uuid.UUID

	// Bootstrap Org & User
	err := tdb.WithAdminTx(ctx, func(q *db.Queries, tx pgx.Tx) error {
		_, err := q.CreateOrganization(ctx, db.CreateOrganizationParams{
			OrgID: orgID,
			Name:  "Cyberdyne Evidence Systems",
			Slug:  "cyberdyne-" + orgID.String()[:8],
			Plan:  "enterprise",
		})
		return err
	})
	if err != nil {
		t.Fatalf("Failed to bootstrap organization: %v", err)
	}

	err = tdb.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		_, err := q.CreateUser(ctx, db.CreateUserParams{
			UserID:       empUserID,
			OrgID:        orgID,
			Email:        "miles.dyson@cyberdyne.com",
			PasswordHash: "$2a$12$hash",
			Role:         "employee",
		})
		if err != nil {
			return err
		}

		vLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Vendor Inbound",
			Category: "virtual_vendor",
		})
		if err != nil {
			return err
		}
		vendorLocID = vLoc.LocationID

		sLoc, err := q.CreateLocation(ctx, db.CreateLocationParams{
			OrgID:    orgID,
			Name:     "Hardware Vault",
			Category: "physical_office",
		})
		if err != nil {
			return err
		}
		storeLocID = sLoc.LocationID

		laptop, err := q.CreateItem(ctx, db.CreateItemParams{
			OrgID:           orgID,
			Sku:             "DELL-XPS-15-" + orgID.String()[:6],
			Name:            "Dell XPS 15 OLED",
			TrackingMode:    "serialized",
			BaseUom:         "unit",
			ValuationMethod: "fifo",
			Attributes:      []byte(`{"serial_number": "SN-XPS-887766", "ram_gb": 64, "storage_spec": "2TB", "condition_grade": "A"}`),
		})
		if err != nil {
			return err
		}
		laptopItemID = laptop.ItemID

		// Receive 1 laptop into vault
		moveQty := pgtype.Numeric{}
		_ = moveQty.Scan("1.0000")
		_, err = q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          orgID,
			ItemID:         laptopItemID,
			FromLocationID: vendorLocID,
			ToLocationID:   storeLocID,
			Quantity:       moveQty,
			MoveType:       "INWARD_RECEIPT",
			ReferenceCode:  pgtype.Text{String: "PO-DELL-999", Valid: true},
			ActorID:        empUserID,
		})
		return err
	})
	if err != nil {
		t.Fatalf("Failed to bootstrap locations and item: %v", err)
	}

	var assignmentID string

	// 1. Issue / Checkout Laptop to Employee
	t.Run("Step 1: Checkout Laptop and Automatically Generate Sealed Evidence", func(t *testing.T) {
		payload := map[string]interface{}{
			"asset_id":             laptopItemID.String(),
			"employee_user_id":     empUserID.String(),
			"source_location_id":   storeLocID.String(),
			"condition_grade":      "A",
			"expected_return_date": time.Now().AddDate(0, 6, 0).Format(time.RFC3339),
		}
		rawJSON, _ := json.Marshal(payload)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/assets/checkout", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("Checkout failed with %d: %s", rec.Code, rec.Body.String())
		}

		var resp struct {
			Data struct {
				Assignment struct {
					AssignmentID string `json:"assignment_id"`
				} `json:"assignment"`
			} `json:"data"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &resp)
		assignmentID = resp.Data.Assignment.AssignmentID

		t.Logf("Step 1 passed! Laptop issued. Assignment ID: %s", assignmentID)
	})

	// 2. Verify Certificate & Hash Chain Integrity
	t.Run("Step 2: Cryptographic Verification of Certificate and Hash Chain", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/assets/assignments/"+assignmentID+"/certificate", nil)
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Certificate retrieval failed (%d): %s", rec.Code, rec.Body.String())
		}

		var certResp struct {
			Data struct {
				IsValid        bool   `json:"is_valid"`
				TamperDetected bool   `json:"tamper_detected"`
				ComputedHash   string `json:"computed_hash"`
				StoredHash     string `json:"stored_hash"`
				Evidence       struct {
					PdfSha256    string `json:"pdf_sha256"`
					RecordHash   string `json:"record_hash"`
					PreviousHash string `json:"previous_hash"`
				} `json:"evidence"`
			} `json:"data"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &certResp)

		if !certResp.Data.IsValid {
			t.Errorf("Expected certificate to be valid, but is_valid was false")
		}
		if certResp.Data.TamperDetected {
			t.Errorf("Tamper detected prematurely on newly generated evidence")
		}
		if certResp.Data.ComputedHash != certResp.Data.StoredHash {
			t.Errorf("Hash mismatch: computed %s != stored %s", certResp.Data.ComputedHash, certResp.Data.StoredHash)
		}
		if len(certResp.Data.Evidence.PdfSha256) != 64 {
			t.Errorf("Expected valid 64-char SHA-256 hash, got %s", certResp.Data.Evidence.PdfSha256)
		}

		t.Logf("Step 2 passed! Hash chain verified: Computed=%s Stored=%s PDF_SHA256=%s",
			certResp.Data.ComputedHash, certResp.Data.StoredHash, certResp.Data.Evidence.PdfSha256)
	})

	// 3. Tamper Test: Modify Evidence Row in Database & Verify Detection
	t.Run("Step 3: Tamper-Evident Security Proof (Altering field invalidates chain)", func(t *testing.T) {
		// Illicitly tamper with the stored pdf_sha256 in the database
		err := tdb.WithTenantTxRaw(ctx, orgID, func(q *db.Queries, tx pgx.Tx) error {
			assignUUID, _ := uuid.Parse(assignmentID)
			tag, err := tx.Exec(ctx, `
				UPDATE handover_evidence
				SET pdf_sha256 = 'badc0ffee0000000000000000000000000000000000000000000000000000000'
				WHERE assignment_id = $1 AND org_id = $2
			`, assignUUID, orgID)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				t.Fatalf("Tamper test: 0 rows updated in handover_evidence")
			}
			return nil
		})
		if err != nil {
			t.Fatalf("Failed to inject tamper test data: %v", err)
		}

		// Re-fetch certificate and assert tamper detection
		req := httptest.NewRequest(http.MethodGet, "/api/v1/assets/assignments/"+assignmentID+"/certificate", nil)
		req.Header.Set("X-Tenant-ID", orgID.String())
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected HTTP 200 returning verification details, got %d", rec.Code)
		}

		var tamperedResp struct {
			Data struct {
				IsValid        bool   `json:"is_valid"`
				TamperDetected bool   `json:"tamper_detected"`
				ComputedHash   string `json:"computed_hash"`
				StoredHash     string `json:"stored_hash"`
			} `json:"data"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &tamperedResp)

		if tamperedResp.Data.IsValid {
			t.Errorf("SECURITY FAULT: Tampered evidence was accepted as valid!")
		}
		if !tamperedResp.Data.TamperDetected {
			t.Errorf("SECURITY FAULT: TamperDetected flag was not raised!")
		}

		t.Logf("Step 3 passed! Cryptographic tamper detection verified with 100%% certainty:")
		t.Logf("  Computed Hash from altered data: %s", tamperedResp.Data.ComputedHash)
		t.Logf("  Stored Immutable Record Hash:   %s", tamperedResp.Data.StoredHash)
		t.Logf("  TamperDetected: %v, IsValid: %v", tamperedResp.Data.TamperDetected, tamperedResp.Data.IsValid)
	})

	// 4. OpenAPI & Swagger UI Verification
	t.Run("Step 4: Swagger UI & OpenAPI 3.1 Spec Endpoint Verification", func(t *testing.T) {
		// Verify /swagger/openapi.json
		reqJSON := httptest.NewRequest(http.MethodGet, "/swagger/openapi.json", nil)
		recJSON := httptest.NewRecorder()
		router.ServeHTTP(recJSON, reqJSON)

		if recJSON.Code != http.StatusOK {
			t.Errorf("Expected HTTP 200 for /swagger/openapi.json, got %d", recJSON.Code)
		}
		var openapiDoc map[string]interface{}
		if err := json.Unmarshal(recJSON.Body.Bytes(), &openapiDoc); err != nil {
			t.Errorf("Failed to parse OpenAPI JSON: %v", err)
		}
		if openapiDoc["openapi"] != "3.1.0" {
			t.Errorf("Expected OpenAPI 3.1.0, got %v", openapiDoc["openapi"])
		}

		// Verify /swagger/index.html
		reqUI := httptest.NewRequest(http.MethodGet, "/swagger/index.html", nil)
		recUI := httptest.NewRecorder()
		router.ServeHTTP(recUI, reqUI)

		if recUI.Code != http.StatusOK {
			t.Errorf("Expected HTTP 200 for /swagger/index.html, got %d", recUI.Code)
		}
		if !bytes.Contains(recUI.Body.Bytes(), []byte("SwaggerUIBundle")) {
			t.Errorf("Swagger UI HTML missing SwaggerUIBundle script")
		}

		t.Logf("Step 4 passed! Swagger UI and OpenAPI 3.1 documentation endpoints fully operational.")
	})
}
