package test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/modules/catalog"
	"whoopit-core/internal/platform/db"
)

func Test_B3_CustomField_DynamicValidation(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")

	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("failed to acquire connection: %v", err)
	}
	defer conn.Release()

	_, err = conn.Exec(ctx, "SELECT set_config('app.org_id', $1, false)", orgID.String())
	if err != nil {
		t.Fatalf("failed to set app.org_id: %v", err)
	}

	// 1. Setup test custom field definitions:
	// a. 'warranty_months' (number, required)
	// b. 'color' (dropdown: red, blue, green, not required)
	_, _ = conn.Exec(ctx, "DELETE FROM custom_field_definitions WHERE org_id = $1 AND field_name IN ('warranty_months', 'color')", orgID)

	defs := []db.CustomFieldDefinition{
		{
			FieldID:         uuid.New(),
			OrgID:           orgID,
			FieldName:       "warranty_months",
			FieldType:       "number",
			DropdownOptions: json.RawMessage("[]"),
			IsRequired:      true,
		},
		{
			FieldID:         uuid.New(),
			OrgID:           orgID,
			FieldName:       "color",
			FieldType:       "dropdown",
			DropdownOptions: json.RawMessage(`["Red", "Blue", "Green"]`),
			IsRequired:      false,
		},
	}

	for _, d := range defs {
		_, err = conn.Exec(ctx, `
			INSERT INTO custom_field_definitions (field_id, org_id, field_name, field_type, dropdown_options, is_required)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, d.FieldID, d.OrgID, d.FieldName, d.FieldType, d.DropdownOptions, d.IsRequired)
		if err != nil {
			t.Fatalf("failed to insert test custom field def: %v", err)
		}
	}

	// 2. Test missing required field 'warranty_months' -> Should FAIL
	invalidMissingPayload := json.RawMessage(`{"color": "Red"}`)
	errs := catalog.ValidateCustomFields(invalidMissingPayload, defs)
	if len(errs) == 0 {
		t.Errorf("expected validation error for missing required field 'warranty_months', got none")
	}

	// 3. Test wrong type for 'warranty_months' (string instead of number) -> Should FAIL
	invalidTypePayload := json.RawMessage(`{"warranty_months": "twenty-four", "color": "Red"}`)
	errs = catalog.ValidateCustomFields(invalidTypePayload, defs)
	if len(errs) == 0 {
		t.Errorf("expected validation error for string value in number field, got none")
	}

	// 4. Test invalid dropdown option for 'color' -> Should FAIL
	invalidDropdownPayload := json.RawMessage(`{"warranty_months": 24, "color": "Yellow"}`)
	errs = catalog.ValidateCustomFields(invalidDropdownPayload, defs)
	if len(errs) == 0 {
		t.Errorf("expected validation error for invalid dropdown option 'Yellow', got none")
	}

	// 5. Test valid payload -> Should PASS
	validPayload := json.RawMessage(`{"warranty_months": 24, "color": "Blue"}`)
	errs = catalog.ValidateCustomFields(validPayload, defs)
	if len(errs) > 0 {
		t.Errorf("expected valid payload to pass, got errors: %v", errs)
	} else {
		t.Logf("PASS: Phase B3 Dynamic Custom Field validator verified.")
	}
}

func Test_B3_MasterData_Suppliers_And_Categories(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")

	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("failed to acquire connection: %v", err)
	}
	defer conn.Release()

	_, _ = conn.Exec(ctx, "SELECT set_config('app.org_id', $1, false)", orgID.String())

	// 1. Create Supplier
	supplierID := uuid.New()
	supplierName := fmt.Sprintf("B3 Apex Hardware Ltd %s", uuid.New().String()[:8])
	_, err = conn.Exec(ctx, `
		INSERT INTO suppliers (supplier_id, org_id, name, phone, email, address, is_active)
		VALUES ($1, $2, $3, '+923001234567', 'apex@example.com', 'Tech Ave, City', true)
	`, supplierID, orgID, supplierName)
	if err != nil {
		t.Fatalf("failed to insert supplier: %v", err)
	}

	var fetchedName string
	err = conn.QueryRow(ctx, "SELECT name FROM suppliers WHERE supplier_id = $1 AND org_id = $2", supplierID, orgID).Scan(&fetchedName)
	if err != nil || fetchedName != supplierName {
		t.Errorf("expected supplier name %q, got %q (err=%v)", supplierName, fetchedName, err)
	}

	// 2. Create Parent and Child Category
	parentCatID := uuid.New()
	childCatID := uuid.New()
	parentCatName := fmt.Sprintf("Networking Gear %s", uuid.New().String()[:8])
	childCatName := fmt.Sprintf("Routers & Switches %s", uuid.New().String()[:8])

	_, err = conn.Exec(ctx, `
		INSERT INTO categories (category_id, org_id, name, parent_id)
		VALUES ($1, $2, $3, NULL)
	`, parentCatID, orgID, parentCatName)
	if err != nil {
		t.Fatalf("failed to insert parent category: %v", err)
	}

	_, err = conn.Exec(ctx, `
		INSERT INTO categories (category_id, org_id, name, parent_id)
		VALUES ($1, $2, $3, $4)
	`, childCatID, orgID, childCatName, parentCatID)
	if err != nil {
		t.Fatalf("failed to insert child category: %v", err)
	}

	var fetchedParentID uuid.UUID
	err = conn.QueryRow(ctx, "SELECT parent_id FROM categories WHERE category_id = $1", childCatID).Scan(&fetchedParentID)
	if err != nil || fetchedParentID != parentCatID {
		t.Errorf("expected child category parent_id %v, got %v (err=%v)", parentCatID, fetchedParentID, err)
	} else {
		t.Logf("PASS: Phase B3 Suppliers and Hierarchical Categories verified.")
	}
}

func Test_B3_UOM_Conversions(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")

	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("failed to acquire connection: %v", err)
	}
	defer conn.Release()

	_, _ = conn.Exec(ctx, "SELECT set_config('app.org_id', $1, false)", orgID.String())

	// Ensure units exist
	_, _ = conn.Exec(ctx, `
		INSERT INTO units_of_measure (unit_id, org_id, name, symbol)
		VALUES 
			(gen_random_uuid(), $1, 'Pack of 10', 'pk10'),
			(gen_random_uuid(), $1, 'Piece', 'pcs')
		ON CONFLICT (org_id, symbol) DO NOTHING
	`, orgID)

	// Create Conversion: 1 pk10 = 10 pcs
	convID := uuid.New()
	_, err = conn.Exec(ctx, `
		INSERT INTO uom_conversions (conversion_id, org_id, from_unit, to_base_unit, multiplier)
		VALUES ($1, $2, 'pk10', 'pcs', 10.0000)
		ON CONFLICT DO NOTHING
	`, convID, orgID)
	if err != nil {
		t.Fatalf("failed to insert uom_conversion: %v", err)
	}

	var multiplier pgtype.Numeric
	err = conn.QueryRow(ctx, `
		SELECT multiplier FROM uom_conversions
		WHERE org_id = $1 AND from_unit = 'pk10' AND to_base_unit = 'pcs'
		LIMIT 1
	`, orgID).Scan(&multiplier)
	if err != nil {
		t.Fatalf("failed to query uom_conversions: %v", err)
	}

	val, err := multiplier.Float64Value()
	if err != nil || val.Float64 != 10.0 {
		t.Errorf("expected multiplier 10.0, got %v (err=%v)", val.Float64, err)
	} else {
		t.Logf("PASS: Phase B3 Multi-Unit conversion rules verified.")
	}
}

func Test_B3_Product_Archive_SoftDelete(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")

	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("failed to acquire connection: %v", err)
	}
	defer conn.Release()

	_, _ = conn.Exec(ctx, "SELECT set_config('app.org_id', $1, false)", orgID.String())

	itemID := uuid.New()
	sku := fmt.Sprintf("B3-ARCHIVE-%s", uuid.New().String()[:8])
	_, err = conn.Exec(ctx, `
		INSERT INTO items (item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method, is_active)
		VALUES ($1, $2, $3, 'Item to Archive', 'none', 'pcs', 'wac', true)
	`, itemID, orgID, sku)
	if err != nil {
		t.Fatalf("failed to insert item for archive test: %v", err)
	}

	// Archive the item (soft delete)
	res, err := conn.Exec(ctx, `
		UPDATE items
		SET is_active = false, updated_at = CURRENT_TIMESTAMP
		WHERE item_id = $1 AND org_id = $2
	`, itemID, orgID)
	if err != nil || res.RowsAffected() != 1 {
		t.Fatalf("archive update failed: %v", err)
	}

	// Verify it still exists in the DB for audit & ledger history, but is_active = false
	var isActive bool
	err = conn.QueryRow(ctx, "SELECT is_active FROM items WHERE item_id = $1", itemID).Scan(&isActive)
	if err != nil {
		t.Fatalf("item was unexpectedly deleted from DB: %v", err)
	}
	if isActive {
		t.Errorf("expected item is_active to be false after archive, got true")
	} else {
		t.Logf("PASS: Phase B3 Soft delete / Archive preserves ledger history.")
	}
}
