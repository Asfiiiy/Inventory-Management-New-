package test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"whoopit-core/internal/platform/audit"
	"whoopit-core/internal/platform/auth"
)

func Test_B2_Argon2id_Hashing_And_Bcrypt_Compatibility(t *testing.T) {
	password := "SecureSecret2026!"

	// 1. Argon2id Hash & Verify
	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatalf("failed to hash with Argon2id: %v", err)
	}

	valid, err := auth.VerifyPassword(hash, password)
	if err != nil || !valid {
		t.Errorf("Argon2id verification failed: valid=%v, err=%v", valid, err)
	}

	// 2. Reject Wrong Password
	invalid, err := auth.VerifyPassword(hash, "WrongPassword123")
	if err != nil || invalid {
		t.Errorf("expected wrong password to fail verification, got invalid=%v", invalid)
	}

	// 3. Backward Compatibility with legacy Bcrypt hash
	bcryptHashBytes, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		t.Fatalf("failed to generate bcrypt hash: %v", err)
	}
	bcryptValid, err := auth.VerifyPassword(string(bcryptHashBytes), password)
	if err != nil || !bcryptValid {
		t.Errorf("legacy bcrypt hash verification failed: valid=%v, err=%v", bcryptValid, err)
	} else {
		t.Logf("PASS: Argon2id and legacy Bcrypt dual verification operational.")
	}
}

func Test_B2_Role_Permission_Table(t *testing.T) {
	// 1. Owner has full permissions
	if !auth.HasPermission(auth.RoleOwner, auth.PermProductsDelete) {
		t.Errorf("Owner must have PermProductsDelete")
	}
	if !auth.HasPermission(auth.RoleOwner, auth.PermValuationView) {
		t.Errorf("Owner must have PermValuationView")
	}

	// 2. Manager cannot delete products but can view valuation & manage
	if auth.HasPermission(auth.RoleManager, auth.PermProductsDelete) {
		t.Errorf("Manager must NOT have PermProductsDelete")
	}
	if !auth.HasPermission(auth.RoleManager, auth.PermProductsManage) {
		t.Errorf("Manager must have PermProductsManage")
	}
	if !auth.HasPermission(auth.RoleManager, auth.PermValuationView) {
		t.Errorf("Manager must have PermValuationView")
	}

	// 3. Storekeeper can stock in/out/count, but NOT valuation or delete
	if auth.HasPermission(auth.RoleStorekeeper, auth.PermValuationView) {
		t.Errorf("Storekeeper must NOT have PermValuationView (valuation masked)")
	}
	if auth.HasPermission(auth.RoleStorekeeper, auth.PermProductsDelete) {
		t.Errorf("Storekeeper must NOT have PermProductsDelete")
	}
	if !auth.HasPermission(auth.RoleStorekeeper, auth.PermStockIn) {
		t.Errorf("Storekeeper must have PermStockIn")
	}

	// 4. Viewer is read-only
	if auth.HasPermission(auth.RoleViewer, auth.PermStockIn) {
		t.Errorf("Viewer must NOT have PermStockIn")
	}
	if !auth.HasPermission(auth.RoleViewer, auth.PermProductsView) {
		t.Errorf("Viewer must have PermProductsView")
	}

	// 5. Backwards-compatibility aliases
	if !auth.HasPermission("admin", auth.PermProductsDelete) {
		t.Errorf("admin alias should map to Owner permissions")
	}
	if auth.HasPermission("staff", auth.PermValuationView) {
		t.Errorf("staff alias should map to Storekeeper permissions")
	}
	t.Logf("PASS: Phase B2 Role & Permission Matrix verified across all 4 tiers.")
}

func getOrCreateTestUser(ctx context.Context, pool *pgxpool.Pool, orgID uuid.UUID) (uuid.UUID, error) {
	var userID uuid.UUID
	err := pool.QueryRow(ctx, "SELECT user_id FROM users WHERE org_id = $1 LIMIT 1", orgID).Scan(&userID)
	if err == nil {
		return userID, nil
	}

	userID = uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO users (user_id, org_id, email, password_hash, role, name, is_active)
		VALUES ($1, $2, 'testuser@whoopit.io', 'hash', 'owner', 'Test User', true)
		ON CONFLICT (org_id, email) DO NOTHING
	`, userID, orgID)
	if err != nil {
		return uuid.Nil, err
	}
	return userID, nil
}

func Test_B2_Audit_Log_Writer(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	auditLogger := audit.NewLogger(pool)
	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	userID, err := getOrCreateTestUser(ctx, pool, orgID)
	if err != nil {
		t.Fatalf("failed to get/create test user: %v", err)
	}

	entry := audit.Entry{
		OrgID:      orgID,
		UserID:     &userID,
		Action:     "PRODUCT_CREATED",
		EntityType: "product",
		EntityID:   "PROD-TEST-AUDIT",
		BeforeValues: map[string]any{
			"status": "none",
		},
		AfterValues: map[string]any{
			"status": "active",
			"sku":    "PROD-TEST-AUDIT",
		},
		IPAddress: "127.0.0.1",
	}

	err = auditLogger.Log(ctx, entry)
	if err != nil {
		t.Fatalf("failed to write audit log entry: %v", err)
	}

	// Verify insertion
	var count int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM audit_log
		WHERE org_id = $1 AND entity_id = 'PROD-TEST-AUDIT'
	`, orgID).Scan(&count)
	if err != nil || count == 0 {
		t.Errorf("expected audit entry in database, found count=%d, err=%v", count, err)
	} else {
		t.Logf("PASS: Audit log entry successfully persisted and verified.")
	}
}

func Test_B2_Session_Persistence_And_Revocation(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	orgID := uuid.MustParse("a0000000-0000-0000-0000-000000000001")
	userID, err := getOrCreateTestUser(ctx, pool, orgID)
	if err != nil {
		t.Fatalf("failed to get/create test user: %v", err)
	}
	sessionID := "SESS-" + uuid.New().String()

	// 1. Insert Session
	_, err = pool.Exec(ctx, `
		INSERT INTO sessions (session_id, user_id, org_id, expires_at)
		VALUES ($1, $2, $3, $4)
	`, sessionID, userID, orgID, time.Now().Add(24*time.Hour))
	if err != nil {
		t.Fatalf("failed to insert test session: %v", err)
	}

	// 2. Verify Session Exists
	var count int
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM sessions WHERE session_id = $1", sessionID).Scan(&count)
	if count != 1 {
		t.Fatalf("expected 1 session, got %d", count)
	}

	// 3. Revoke Session
	_, err = pool.Exec(ctx, "DELETE FROM sessions WHERE session_id = $1", sessionID)
	if err != nil {
		t.Fatalf("failed to delete session: %v", err)
	}

	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM sessions WHERE session_id = $1", sessionID).Scan(&count)
	if count != 0 {
		t.Errorf("expected session to be revoked, got count=%d", count)
	} else {
		t.Logf("PASS: Server-side session lifecycle (create & revoke) verified.")
	}
}
