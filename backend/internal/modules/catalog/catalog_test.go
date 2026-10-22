package catalog_test

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
	"whoopit-core/internal/modules/profiles"
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

func TestCatalog_HTTP_Endpoints_And_Profile_Validation(t *testing.T) {
	ctx := context.Background()
	pool := getTestPool(t)
	defer pool.Close()

	tdb := database.NewTenantDB(pool)
	validator, err := profiles.NewSchemaValidator()
	if err != nil {
		t.Fatalf("Failed to compile industry profile schemas: %v", err)
	}

	// Setup Chi Router & Register Catalog Routes
	router := platformHttp.NewRouter(nil)
	catalog.RegisterRoutes(router, tdb, validator)

	// Create test organizations
	orgAID := uuid.New()
	orgBID := uuid.New()

	err = tdb.WithAdminTx(ctx, func(q *db.Queries, tx pgx.Tx) error {
		_, err := q.CreateOrganization(ctx, db.CreateOrganizationParams{
			OrgID: orgAID,
			Name:  "Tenant A Tech Corp",
			Slug:  "tech-a-" + orgAID.String()[:8],
			Plan:  "enterprise",
		})
		if err != nil {
			return err
		}

		_, err = q.CreateOrganization(ctx, db.CreateOrganizationParams{
			OrgID: orgBID,
			Name:  "Tenant B Retail Hub",
			Slug:  "retail-b-" + orgBID.String()[:8],
			Plan:  "standard",
		})
		return err
	})
	if err != nil {
		t.Fatalf("Failed to create test organizations: %v", err)
	}

	// -------------------------------------------------------------------------
	// Test 1: Schema Validation Failure
	// POST /api/v1/items?profile=office_it with invalid attributes
	// Missing 'serial_number' and 'ram_gb' is passed as string instead of int
	// MUST return HTTP 422 with validation errors
	// -------------------------------------------------------------------------
	t.Run("Test 1: Schema Validation Failure -> HTTP 422", func(t *testing.T) {
		invalidBody := map[string]interface{}{
			"sku":           "BAD-LAPTOP-01",
			"name":          "Lenovo ThinkPad X1 Invalid",
			"tracking_mode": "serialized",
			"base_uom":      "unit",
			"attributes": map[string]interface{}{
				"ram_gb":          "not-a-number",
				"storage_spec":    "512GB NVMe",
				"condition_grade": "A",
				// Missing required: serial_number
			},
		}
		rawJSON, _ := json.Marshal(invalidBody)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/items?profile=office_it", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgAID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("Expected HTTP 422 Unprocessable Entity, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		var problem platformHttp.ProblemDetails
		if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
			t.Fatalf("Failed to parse RFC 7807 problem details response: %v", err)
		}

		if len(problem.Errors) == 0 {
			t.Errorf("Expected field-level validation errors in problem details, got 0. Response: %+v", problem)
		}

		t.Logf("Test 1 passed successfully! HTTP 422 returned with %d validation fault(s): %+v", len(problem.Errors), problem.Errors)
	})

	// -------------------------------------------------------------------------
	// Test 2: Schema Validation Success
	// POST /api/v1/items?profile=office_it with all required attributes valid
	// MUST return HTTP 201 Created and return the created Item record
	// -------------------------------------------------------------------------
	var createdItemID string

	t.Run("Test 2: Schema Validation Success -> HTTP 201 Created", func(t *testing.T) {
		validBody := map[string]interface{}{
			"sku":           "LEN-P1-GEN7-" + orgAID.String()[:6],
			"name":          "ThinkPad P1 Gen 7 Mobile Workstation",
			"tracking_mode": "serialized",
			"base_uom":      "unit",
			"attributes": map[string]interface{}{
				"serial_number":   "SN-LENOVO-99008811",
				"ram_gb":          64,
				"storage_spec":    "2TB NVMe PCIe Gen 4",
				"condition_grade": "A",
			},
		}
		rawJSON, _ := json.Marshal(validBody)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/items?profile=office_it", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgAID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("Expected HTTP 201 Created, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		var resp platformHttp.SuccessResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse success response: %v", err)
		}

		if !resp.Success {
			t.Errorf("Expected resp.Success to be true")
		}

		itemMap, ok := resp.Data.(map[string]interface{})
		if !ok {
			t.Fatalf("Expected resp.Data to be map, got %T", resp.Data)
		}

		idVal, ok := itemMap["item_id"].(string)
		if !ok || idVal == "" {
			t.Fatalf("Expected valid item_id string in response, got %v", itemMap["item_id"])
		}

		createdItemID = idVal
		t.Logf("Test 2 passed successfully! Item created with ID: %s", createdItemID)
	})

	// -------------------------------------------------------------------------
	// Test 3: Tenant Cross-Access Isolation over HTTP
	// Tenant B attempting GET /api/v1/items/{tenant_a_item_id}
	// MUST return HTTP 404 Not Found (zero cross-tenant data leak)
	// -------------------------------------------------------------------------
	t.Run("Test 3: Tenant Cross-Access Isolation over HTTP -> HTTP 404", func(t *testing.T) {
		if createdItemID == "" {
			t.Fatalf("Cannot run Test 3 because Test 2 did not provide createdItemID")
		}

		// Request made with Tenant B header
		req := httptest.NewRequest(http.MethodGet, "/api/v1/items/"+createdItemID, nil)
		req.Header.Set("X-Tenant-ID", orgBID.String())
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("Security Fault! Expected HTTP 404 Not Found for cross-tenant request, got %d. Body: %s", rec.Code, rec.Body.String())
		}

		var problem platformHttp.ProblemDetails
		if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
			t.Fatalf("Failed to parse problem details: %v", err)
		}

		if problem.Status != http.StatusNotFound {
			t.Errorf("Expected problem.Status to be 404, got %d", problem.Status)
		}

		t.Logf("Test 3 passed successfully! Cross-tenant access strictly blocked with HTTP 404 Problem Details.")
	})

	// -------------------------------------------------------------------------
	// Additional Verification: Subtree Locations & JSONB Containment Search
	// -------------------------------------------------------------------------
	t.Run("Locations Subtree and Search Verification", func(t *testing.T) {
		// Create Location in Tenant A
		locBody := map[string]interface{}{
			"name":     "High-Security Data Vault",
			"category": "physical_warehouse",
		}
		rawJSON, _ := json.Marshal(locBody)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/locations", bytes.NewReader(rawJSON))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-ID", orgAID.String())
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("Failed to create location: %s", rec.Body.String())
		}

		// Search Items by JSONB containment
		searchBody := map[string]interface{}{
			"attributes": map[string]interface{}{
				"ram_gb": 64,
			},
		}
		searchJSON, _ := json.Marshal(searchBody)
		searchReq := httptest.NewRequest(http.MethodPost, "/api/v1/items/search", bytes.NewReader(searchJSON))
		searchReq.Header.Set("Content-Type", "application/json")
		searchReq.Header.Set("X-Tenant-ID", orgAID.String())
		searchRec := httptest.NewRecorder()
		router.ServeHTTP(searchRec, searchReq)

		if searchRec.Code != http.StatusOK {
			t.Fatalf("Failed to search items: %s", searchRec.Body.String())
		}
	})
}
