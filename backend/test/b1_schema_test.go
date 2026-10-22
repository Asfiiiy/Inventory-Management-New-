package test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func getTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://whoopit_admin:whoopit_secure_pw_2026@localhost:5432/whoopit_inventory_v4?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("database ping failed: %v", err)
	}
	return pool
}

func Test_B1_Schema_Constraints(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx := context.Background()
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")

	// Set tenant context for RLS
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("failed to acquire connection: %v", err)
	}
	defer conn.Release()

	_, err = conn.Exec(ctx, "SELECT set_config('app.org_id', $1, false)", orgID.String())
	if err != nil {
		t.Fatalf("failed to set app.org_id: %v", err)
	}

	// 1. Test Unique SKU Constraint
	t.Run("Constraint_1_Unique_SKU_Per_Org", func(t *testing.T) {
		sku := "TEST-UNIQUE-SKU-" + uuid.New().String()[:8]
		_, err := conn.Exec(ctx, `
			INSERT INTO items (org_id, sku, name)
			VALUES ($1, $2, 'Item A')
		`, orgID, sku)
		if err != nil {
			t.Fatalf("initial insert should succeed: %v", err)
		}

		// Duplicate insert must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO items (org_id, sku, name)
			VALUES ($1, $2, 'Item B Duplicate')
		`, orgID, sku)
		if err == nil {
			t.Errorf("expected duplicate SKU insert to fail uq_items_org_sku constraint, but it succeeded")
		} else {
			t.Logf("PASS: Duplicate SKU correctly rejected: %v", err)
		}
	})

	// 2. Test Positive Quantity on Stock Moves Constraint
	t.Run("Constraint_2_Positive_Movement_Quantity", func(t *testing.T) {
		itemID := uuid.MustParse("f0000000-0000-0000-0000-000000000001")
		locActive := uuid.MustParse("e0000000-0000-0000-0000-000000000001")
		locBackup := uuid.MustParse("e0000000-0000-0000-0000-000000000002")
		actorID := uuid.MustParse("b0000000-0000-0000-0000-000000000001")

		// Negative or zero quantity must be rejected
		_, err := conn.Exec(ctx, `
			INSERT INTO stock_moves (org_id, item_id, from_location_id, to_location_id, quantity, move_type, actor_id)
			VALUES ($1, $2, $3, $4, -5.0000, 'transfer', $5)
		`, orgID, itemID, locBackup, locActive, actorID)
		if err == nil {
			t.Errorf("expected negative movement quantity to fail CHECK constraint, but it succeeded")
		} else {
			t.Logf("PASS: Negative movement quantity correctly rejected: %v", err)
		}

		_, err = conn.Exec(ctx, `
			INSERT INTO stock_moves (org_id, item_id, from_location_id, to_location_id, quantity, move_type, actor_id)
			VALUES ($1, $2, $3, $4, 0.0000, 'transfer', $5)
		`, orgID, itemID, locBackup, locActive, actorID)
		if err == nil {
			t.Errorf("expected zero movement quantity to fail CHECK constraint, but it succeeded")
		} else {
			t.Logf("PASS: Zero movement quantity correctly rejected: %v", err)
		}
	})

	// 3. Test Stock Balances Reserved <= On Hand Constraint
	t.Run("Constraint_3_Reserved_LTE_OnHand", func(t *testing.T) {
		itemID := uuid.New()
		locID := uuid.MustParse("e0000000-0000-0000-0000-000000000001")

		// First create test item
		_, err := conn.Exec(ctx, `
			INSERT INTO items (item_id, org_id, sku, name)
			VALUES ($1, $2, $3, 'Reservation Test Item')
		`, itemID, orgID, "RES-TEST-"+itemID.String()[:8])
		if err != nil {
			t.Fatalf("failed to insert test item: %v", err)
		}

		// Attempt to set reserved (15) > on_hand (10)
		_, err = conn.Exec(ctx, `
			INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out)
			VALUES ($1, $2, $3, 10.0000, 15.0000, 0)
		`, orgID, itemID, locID)
		if err == nil {
			t.Errorf("expected reserved > on_hand to fail chk_reserved_lte_on_hand constraint, but it succeeded")
		} else {
			t.Logf("PASS: Reserved > OnHand correctly rejected: %v", err)
		}
	})

	// 4. Test Idempotency Key Unique Constraint
	t.Run("Constraint_4_Idempotency_Key_Unique", func(t *testing.T) {
		itemID := uuid.MustParse("f0000000-0000-0000-0000-000000000001")
		locActive := uuid.MustParse("e0000000-0000-0000-0000-000000000001")
		locBackup := uuid.MustParse("e0000000-0000-0000-0000-000000000002")
		actorID := uuid.MustParse("b0000000-0000-0000-0000-000000000001")
		idempotencyKey := "IDEM-" + uuid.New().String()

		// First insert succeeds
		_, err := conn.Exec(ctx, `
			INSERT INTO stock_moves (org_id, item_id, from_location_id, to_location_id, quantity, move_type, actor_id, idempotency_key)
			VALUES ($1, $2, $3, $4, 1.0000, 'transfer', $5, $6)
		`, orgID, itemID, locBackup, locActive, actorID, idempotencyKey)
		if err != nil {
			t.Fatalf("first idempotency move failed: %v", err)
		}

		// Second insert with identical key must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO stock_moves (org_id, item_id, from_location_id, to_location_id, quantity, move_type, actor_id, idempotency_key)
			VALUES ($1, $2, $3, $4, 1.0000, 'transfer', $5, $6)
		`, orgID, itemID, locBackup, locActive, actorID, idempotencyKey)
		if err == nil {
			t.Errorf("expected duplicate idempotency key to fail, but it succeeded")
		} else {
			t.Logf("PASS: Duplicate idempotency key correctly rejected: %v", err)
		}
	})

	// 5. Test Custom Field Definitions Check Constraint
	t.Run("Constraint_5_Custom_Field_Type_Check", func(t *testing.T) {
		_, err := conn.Exec(ctx, `
			INSERT INTO custom_field_definitions (org_id, field_name, field_type)
			VALUES ($1, 'invalid_field', 'invalid_unsupported_type')
		`, orgID)
		if err == nil {
			t.Errorf("expected invalid custom field type to fail CHECK constraint, but it succeeded")
		} else {
			t.Logf("PASS: Invalid field_type correctly rejected: %v", err)
		}
	})
}
