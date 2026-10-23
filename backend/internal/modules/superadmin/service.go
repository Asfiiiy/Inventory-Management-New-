package superadmin

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"whoopit-core/internal/modules/auth"
	"whoopit-core/internal/platform/database"
)

type OrganizationSummary struct {
	OrgID         uuid.UUID `json:"org_id"`
	Name          string    `json:"name"`
	Slug          string    `json:"slug"`
	Plan          string    `json:"plan"`
	CreatedAt     time.Time `json:"created_at"`
	UserCount     int64     `json:"user_count"`
	ItemCount     int64     `json:"item_count"`
	MovementCount int64     `json:"movement_count"`
	Status        string    `json:"status"` // "active", "suspended", "trial"
}

type PlatformTelemetry struct {
	TotalOrganizations int64 `json:"total_organizations"`
	TotalUsers         int64 `json:"total_users"`
	TotalItems         int64 `json:"total_items"`
	TotalMovements     int64 `json:"total_movements"`
	ActiveEnterprises  int64 `json:"active_enterprises"`
	ActiveStandards    int64 `json:"active_standards"`
	ActiveTrials       int64 `json:"active_trials"`
}

type ProvisionInput struct {
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	Plan          string `json:"plan"`
	AdminName     string `json:"admin_name"`
	AdminEmail    string `json:"admin_email"`
	AdminPassword string `json:"admin_password"`
}

type ProvisionResult struct {
	OrgID      uuid.UUID `json:"org_id"`
	Name       string    `json:"name"`
	Slug       string    `json:"slug"`
	Plan       string    `json:"plan"`
	AdminEmail string    `json:"admin_email"`
	AdminName  string    `json:"admin_name"`
	CreatedAt  time.Time `json:"created_at"`
}

type Service struct {
	tdb *database.TenantDB
}

func NewService(tdb *database.TenantDB) *Service {
	return &Service{tdb: tdb}
}

// ListOrganizations returns all registered organizations with aggregate user, item, and movement stats.
func (s *Service) ListOrganizations(ctx context.Context) ([]OrganizationSummary, error) {
	pool := s.tdb.Pool()

	rows, err := pool.Query(ctx, `
		SELECT 
			o.org_id,
			o.name,
			o.slug,
			o.plan,
			o.created_at,
			COUNT(DISTINCT u.user_id)::bigint AS user_count,
			COUNT(DISTINCT i.item_id)::bigint AS item_count,
			COUNT(DISTINCT m.move_id)::bigint AS movement_count
		FROM organizations o
		LEFT JOIN users u ON u.org_id = o.org_id
		LEFT JOIN items i ON i.org_id = o.org_id AND i.is_active = true
		LEFT JOIN stock_moves m ON m.org_id = o.org_id
		GROUP BY o.org_id, o.name, o.slug, o.plan, o.created_at
		ORDER BY o.created_at DESC;
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query organizations: %w", err)
	}
	defer rows.Close()

	var list []OrganizationSummary
	for rows.Next() {
		var o OrganizationSummary
		if err := rows.Scan(
			&o.OrgID,
			&o.Name,
			&o.Slug,
			&o.Plan,
			&o.CreatedAt,
			&o.UserCount,
			&o.ItemCount,
			&o.MovementCount,
		); err != nil {
			return nil, fmt.Errorf("failed to scan organization: %w", err)
		}

		if o.Plan == "trial" {
			o.Status = "trial"
		} else if strings.HasPrefix(o.Plan, "suspended") {
			o.Status = "suspended"
		} else {
			o.Status = "active"
		}

		list = append(list, o)
	}

	return list, rows.Err()
}

// GetTelemetry aggregates global platform counts for the SuperAdmin command center.
func (s *Service) GetTelemetry(ctx context.Context) (*PlatformTelemetry, error) {
	pool := s.tdb.Pool()

	var t PlatformTelemetry
	err := pool.QueryRow(ctx, `
		SELECT
			COUNT(DISTINCT o.org_id)::bigint,
			COUNT(DISTINCT u.user_id)::bigint,
			COUNT(DISTINCT i.item_id)::bigint,
			COUNT(DISTINCT m.move_id)::bigint,
			COUNT(DISTINCT CASE WHEN o.plan = 'enterprise' THEN o.org_id END)::bigint,
			COUNT(DISTINCT CASE WHEN o.plan = 'standard' THEN o.org_id END)::bigint,
			COUNT(DISTINCT CASE WHEN o.plan = 'trial' THEN o.org_id END)::bigint
		FROM organizations o
		LEFT JOIN users u ON u.org_id = o.org_id
		LEFT JOIN items i ON i.org_id = o.org_id AND i.is_active = true
		LEFT JOIN stock_moves m ON m.org_id = o.org_id;
	`).Scan(
		&t.TotalOrganizations,
		&t.TotalUsers,
		&t.TotalItems,
		&t.TotalMovements,
		&t.ActiveEnterprises,
		&t.ActiveStandards,
		&t.ActiveTrials,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate telemetry: %w", err)
	}

	return &t, nil
}

// ProvisionOrganization sets up a brand new company workspace with isolated schema, storage locations, and owner credentials.
func (s *Service) ProvisionOrganization(ctx context.Context, in ProvisionInput) (*ProvisionResult, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, fmt.Errorf("company name is required")
	}

	if in.Plan == "" {
		in.Plan = "enterprise"
	}

	in.Slug = strings.ToLower(strings.TrimSpace(in.Slug))
	if in.Slug == "" {
		base := strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
				return r
			}
			return '-'
		}, strings.ToLower(in.Name))
		in.Slug = fmt.Sprintf("%s-%s", base, uuid.New().String()[:6])
	}

	in.AdminEmail = strings.TrimSpace(in.AdminEmail)
	if in.AdminEmail == "" {
		return nil, fmt.Errorf("admin email is required")
	}

	if in.AdminPassword == "" {
		in.AdminPassword = "Password123!"
	}

	if in.AdminName == "" {
		in.AdminName = "Company Administrator"
	}

	pwHash, err := auth.HashPassword(in.AdminPassword)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	orgID := uuid.New()
	userID := uuid.New()
	locVendorID := uuid.New()
	locActiveID := uuid.New()
	locBackupID := uuid.New()
	now := time.Now()

	pool := s.tdb.Pool()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Bypass RLS during initial provisioning
	_, _ = tx.Exec(ctx, "SET LOCAL row_security = off")

	// 1. Create Organization
	_, err = tx.Exec(ctx, `
		INSERT INTO organizations (org_id, name, slug, plan, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`, orgID, in.Name, in.Slug, in.Plan, now)
	if err != nil {
		return nil, fmt.Errorf("failed to insert organization: %w", err)
	}

	// 2. Organization Settings
	_, err = tx.Exec(ctx, `
		INSERT INTO organization_settings (org_id, allow_negative_stock, currency, time_zone)
		VALUES ($1, false, 'USD', 'UTC')
		ON CONFLICT (org_id) DO NOTHING
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to set org settings: %w", err)
	}

	// 3. Create Default Storage Locations
	_, err = tx.Exec(ctx, `
		INSERT INTO locations (location_id, org_id, name, category, is_backup_location)
		VALUES 
			($1, $4, 'External Vendors (Virtual)', 'virtual_vendor', false),
			($2, $4, 'Main Floor / Active Store', 'physical_office', false),
			($3, $4, 'Reserve Godown / Storage Depot', 'physical_warehouse', true)
		ON CONFLICT (location_id) DO NOTHING;
	`, locVendorID, locActiveID, locBackupID, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to create default locations: %w", err)
	}

	// 4. Create Owner User
	_, err = tx.Exec(ctx, `
		INSERT INTO users (user_id, org_id, email, password_hash, role, name, is_active, created_at)
		VALUES ($1, $2, $3, $4, 'owner', $5, true, $6)
	`, userID, orgID, in.AdminEmail, pwHash, in.AdminName, now)
	if err != nil {
		return nil, fmt.Errorf("failed to insert admin user: %w", err)
	}

	// 5. Record Initial Provisioning Audit Event
	auditID := uuid.New()
	_, _ = tx.Exec(ctx, `
		INSERT INTO audit_log (audit_id, org_id, user_id, action, entity_type, entity_id, ip_address, created_at)
		VALUES ($1, $2, $3, 'SOFTWARE_PROVISIONED', 'organization', $4, '127.0.0.1', $5)
	`, auditID, orgID, userID, orgID.String(), now)

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit provisioning: %w", err)
	}

	return &ProvisionResult{
		OrgID:      orgID,
		Name:       in.Name,
		Slug:       in.Slug,
		Plan:       in.Plan,
		AdminEmail: in.AdminEmail,
		AdminName:  in.AdminName,
		CreatedAt:  now,
	}, nil
}

// UpdateOrganization updates the plan, name, or suspension status of a client company.
func (s *Service) UpdateOrganization(ctx context.Context, orgID uuid.UUID, name, plan string) error {
	pool := s.tdb.Pool()

	_, err := pool.Exec(ctx, `
		UPDATE organizations
		SET name = COALESCE(NULLIF($2, ''), name),
		    plan = COALESCE(NULLIF($3, ''), plan)
		WHERE org_id = $1
	`, orgID, name, plan)
	if err != nil {
		return err
	}

	auditID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO audit_log (audit_id, org_id, action, entity_type, entity_id, ip_address, created_at)
		VALUES ($1, $2, 'PLAN_UPDATED', 'organization', $3, '127.0.0.1', NOW())
	`, auditID, orgID, plan)

	return nil
}

type GlobalUser struct {
	UserID    uuid.UUID `json:"user_id"`
	OrgID     uuid.UUID `json:"org_id"`
	OrgName   string    `json:"org_name"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type AuditEvent struct {
	AuditID    uuid.UUID `json:"audit_id"`
	OrgID      uuid.UUID `json:"org_id"`
	OrgName    string    `json:"org_name"`
	Action     string    `json:"action"`
	EntityType string    `json:"entity_type"`
	EntityID   string    `json:"entity_id"`
	UserEmail  string    `json:"user_email"`
	CreatedAt  time.Time `json:"created_at"`
	IPAddress  string    `json:"ip_address"`
}

func (s *Service) ListUsers(ctx context.Context) ([]GlobalUser, error) {
	pool := s.tdb.Pool()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, "SET LOCAL row_security = off")

	rows, err := tx.Query(ctx, `
		SELECT 
			u.user_id,
			u.org_id,
			COALESCE(o.name, 'Platform System') AS org_name,
			u.email,
			COALESCE(u.name, 'Store User') AS name,
			u.role,
			u.is_active,
			u.created_at
		FROM users u
		LEFT JOIN organizations o ON o.org_id = u.org_id
		ORDER BY u.created_at DESC
		LIMIT 200;
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []GlobalUser
	for rows.Next() {
		var u GlobalUser
		if err := rows.Scan(&u.UserID, &u.OrgID, &u.OrgName, &u.Email, &u.Name, &u.Role, &u.IsActive, &u.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, u)
	}
	return list, rows.Err()
}

func (s *Service) ListAuditLogs(ctx context.Context, limit int) ([]AuditEvent, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	pool := s.tdb.Pool()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, "SET LOCAL row_security = off")

	rows, err := tx.Query(ctx, `
		SELECT
			a.audit_id,
			a.org_id,
			COALESCE(o.name, 'Global') AS org_name,
			a.action,
			a.entity_type,
			a.entity_id,
			COALESCE(u.email, 'system@whoopit.io') AS user_email,
			a.created_at,
			COALESCE(a.ip_address::text, '127.0.0.1') AS ip_address
		FROM audit_log a
		LEFT JOIN organizations o ON o.org_id = a.org_id
		LEFT JOIN users u ON u.user_id = a.user_id
		ORDER BY a.created_at DESC
		LIMIT $1;
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []AuditEvent
	for rows.Next() {
		var ev AuditEvent
		if err := rows.Scan(&ev.AuditID, &ev.OrgID, &ev.OrgName, &ev.Action, &ev.EntityType, &ev.EntityID, &ev.UserEmail, &ev.CreatedAt, &ev.IPAddress); err != nil {
			return nil, err
		}
		list = append(list, ev)
	}
	return list, rows.Err()
}

func (s *Service) GetOrgActivity(ctx context.Context, orgID uuid.UUID) ([]AuditEvent, error) {
	pool := s.tdb.Pool()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, "SET LOCAL row_security = off")

	rows, err := tx.Query(ctx, `
		SELECT
			a.audit_id,
			a.org_id,
			COALESCE(o.name, 'Client Company') AS org_name,
			a.action,
			a.entity_type,
			a.entity_id,
			COALESCE(u.email, 'store-staff') AS user_email,
			a.created_at,
			COALESCE(a.ip_address::text, '127.0.0.1') AS ip_address
		FROM audit_log a
		LEFT JOIN organizations o ON o.org_id = a.org_id
		LEFT JOIN users u ON u.user_id = a.user_id
		WHERE a.org_id = $1
		ORDER BY a.created_at DESC
		LIMIT 50;
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []AuditEvent
	for rows.Next() {
		var ev AuditEvent
		if err := rows.Scan(&ev.AuditID, &ev.OrgID, &ev.OrgName, &ev.Action, &ev.EntityType, &ev.EntityID, &ev.UserEmail, &ev.CreatedAt, &ev.IPAddress); err != nil {
			return nil, err
		}
		list = append(list, ev)
	}
	return list, rows.Err()
}
