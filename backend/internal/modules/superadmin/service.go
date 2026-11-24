package superadmin

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"whoopit-core/internal/modules/auth"
	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/entitlement"
	"whoopit-core/internal/platform/mail"
)

type OrganizationSummary struct {
	OrgID              uuid.UUID  `json:"org_id"`
	Name               string     `json:"name"`
	Slug               string     `json:"slug"`
	Plan               string     `json:"plan"`
	CreatedAt          time.Time  `json:"created_at"`
	TrialEndsAt        *time.Time `json:"trial_ends_at,omitempty"`
	TrialDaysRemaining int        `json:"trial_days_remaining"`
	IsTrialExpired     bool       `json:"is_trial_expired"`
	UserCount          int64      `json:"user_count"`
	ItemCount          int64      `json:"item_count"`
	MovementCount      int64      `json:"movement_count"`
	Status             string     `json:"status"` // "active", "suspended", "trial", "expired"
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
	OrgID              uuid.UUID `json:"org_id"`
	Name               string    `json:"name"`
	Slug               string    `json:"slug"`
	Plan               string    `json:"plan"`
	AdminEmail         string    `json:"admin_email"`
	AdminName          string    `json:"admin_name"`
	CreatedAt          time.Time `json:"created_at"`
	WelcomeEmailSent   bool      `json:"welcome_email_sent"`
	WelcomeEmailError  string    `json:"welcome_email_error,omitempty"`
}

type Service struct {
	tdb *database.TenantDB
}

func NewService(tdb *database.TenantDB) *Service {
	return &Service{tdb: tdb}
}

// Platform seed org binds the Whoopit SuperAdmin account — not a paying client company.
const platformOrgID = "a0000000-0000-0000-0000-000000000001"

func isPlatformOwnerRole(role string) bool {
	r := strings.ToLower(strings.TrimSpace(role))
	return r == "superadmin" || r == "platform_admin"
}

func isPlatformOwnerEmail(email string) bool {
	return strings.EqualFold(strings.TrimSpace(email), "admin@whoopit.io")
}

// ListOrganizations returns paying / provisioned client companies only (excludes Whoopit platform seed).
func (s *Service) ListOrganizations(ctx context.Context) ([]OrganizationSummary, error) {
	pool := s.tdb.Pool()

	rows, err := pool.Query(ctx, `
		SELECT 
			o.org_id,
			o.name,
			o.slug,
			o.plan,
			o.created_at,
			COALESCE(o.trial_ends_at, CASE WHEN lower(COALESCE(o.plan, '')) = 'trial' THEN o.created_at + interval '30 days' ELSE NULL END),
			COUNT(DISTINCT u.user_id) FILTER (
				WHERE lower(u.role) NOT IN ('superadmin', 'platform_admin')
				  AND lower(u.email::text) <> 'admin@whoopit.io'
			)::bigint AS user_count,
			COUNT(DISTINCT i.item_id)::bigint AS item_count,
			COUNT(DISTINCT m.move_id)::bigint AS movement_count
		FROM organizations o
		LEFT JOIN users u ON u.org_id = o.org_id
		LEFT JOIN items i ON i.org_id = o.org_id AND i.is_active = true
		LEFT JOIN stock_moves m ON m.org_id = o.org_id
		WHERE o.org_id <> $1::uuid
		  AND lower(o.slug::text) <> 'whoopit-store'
		GROUP BY o.org_id, o.name, o.slug, o.plan, o.created_at, o.trial_ends_at
		ORDER BY o.created_at DESC;
	`, platformOrgID)
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
			&o.TrialEndsAt,
			&o.UserCount,
			&o.ItemCount,
			&o.MovementCount,
		); err != nil {
			return nil, fmt.Errorf("failed to scan organization: %w", err)
		}

		if strings.EqualFold(o.Plan, "trial") {
			expired, days := entitlement.TrialWindow(o.Plan, o.TrialEndsAt, time.Now())
			o.IsTrialExpired = expired
			o.TrialDaysRemaining = days
			if expired {
				o.Status = "expired"
			} else {
				o.Status = "trial"
			}
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
			COUNT(DISTINCT u.user_id) FILTER (
				WHERE lower(u.role) NOT IN ('superadmin', 'platform_admin')
				  AND lower(u.email::text) <> 'admin@whoopit.io'
			)::bigint,
			COUNT(DISTINCT i.item_id)::bigint,
			COUNT(DISTINCT m.move_id)::bigint,
			COUNT(DISTINCT CASE WHEN o.plan = 'enterprise' THEN o.org_id END)::bigint,
			COUNT(DISTINCT CASE WHEN o.plan = 'standard' THEN o.org_id END)::bigint,
			COUNT(DISTINCT CASE WHEN o.plan = 'trial' THEN o.org_id END)::bigint
		FROM organizations o
		LEFT JOIN users u ON u.org_id = o.org_id
		LEFT JOIN items i ON i.org_id = o.org_id AND i.is_active = true
		LEFT JOIN stock_moves m ON m.org_id = o.org_id
		WHERE o.org_id <> $1::uuid
		  AND lower(o.slug::text) <> 'whoopit-store';
	`, platformOrgID).Scan(
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
	locCustomerID := uuid.New()
	locScrapID := uuid.New()
	locCustodyID := uuid.New()
	locActiveID := uuid.New()
	locBackupID := uuid.New()
	now := time.Now()

	pool := s.tdb.Pool()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var trialEndsAt *time.Time
	if strings.EqualFold(in.Plan, "trial") {
		tEnd := now.Add(30 * 24 * time.Hour)
		trialEndsAt = &tEnd
	}

	// 1. Create Organization
	_, err = tx.Exec(ctx, `
		INSERT INTO organizations (org_id, name, slug, plan, created_at, trial_ends_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, orgID, in.Name, in.Slug, in.Plan, now, trialEndsAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert organization: %w", err)
	}

	// Set transaction-local RLS tenant context for newly provisioned organization
	_, err = tx.Exec(ctx, "SELECT set_config('app.org_id', $1, true)", orgID.String())
	if err != nil {
		return nil, fmt.Errorf("failed to set tenant RLS context: %w", err)
	}

	// 2. Organization Settings (alert mailbox defaults to the new admin)
	_, err = tx.Exec(ctx, `
		INSERT INTO organization_settings (org_id, allow_negative_stock, currency, time_zone, alert_email)
		VALUES ($1, false, 'USD', 'UTC', $2)
		ON CONFLICT (org_id) DO UPDATE SET alert_email = COALESCE(organization_settings.alert_email, EXCLUDED.alert_email)
	`, orgID, in.AdminEmail)
	if err != nil {
		return nil, fmt.Errorf("failed to set org settings: %w", err)
	}

	// 3. Create Default Storage Locations (Both Physical & Virtual Topology)
	_, err = tx.Exec(ctx, `
		INSERT INTO locations (location_id, org_id, name, category, is_backup_location)
		VALUES 
			($1, $7, 'External Vendors (Virtual)', 'virtual_vendor', false),
			($2, $7, 'Customers / Dispatch (Virtual)', 'virtual_customer', false),
			($3, $7, 'Inventory Scrap & Loss (Virtual)', 'virtual_scrap', false),
			($4, $7, 'Staff Custody (Virtual)', 'virtual_custody', false),
			($5, $7, 'Main Floor / Active Store', 'physical_office', false),
			($6, $7, 'Reserve Godown / Storage Depot', 'physical_warehouse', true)
		ON CONFLICT (location_id) DO NOTHING
	`, locVendorID, locCustomerID, locScrapID, locCustodyID, locActiveID, locBackupID, orgID)
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

	// 5. Seed Default Starter Categories & Units of Measure for New Client Workspace (0 Initial Assets)
	catIT := uuid.New()
	catTools := uuid.New()
	catOffice := uuid.New()
	_, _ = tx.Exec(ctx, `
		INSERT INTO categories (category_id, org_id, name)
		VALUES 
			($1, $4, 'Computers & Networking'),
			($2, $4, 'Tools & Hardware Equipment'),
			($3, $4, 'Office Supplies & Stationery')
		ON CONFLICT DO NOTHING
	`, catIT, catTools, catOffice, orgID)

	_, _ = tx.Exec(ctx, `
		INSERT INTO units_of_measure (org_id, name, symbol)
		VALUES 
			($1, 'Piece', 'pcs'),
			($1, 'Box', 'box')
		ON CONFLICT DO NOTHING
	`, orgID)

	// Note: New client workspaces intentionally start with 0 items, 0 moves, and 0 balances
	// so the client receives a 100% clean, fresh slate with unique IDs.

	// 6. Record Initial Provisioning Audit Event
	auditID := uuid.New()
	_, _ = tx.Exec(ctx, `
		INSERT INTO audit_log (audit_id, org_id, user_id, action, entity_type, entity_id, ip_address, created_at)
		VALUES ($1, $2, $3, 'SOFTWARE_PROVISIONED', 'organization', $4, '127.0.0.1', $5)
	`, auditID, orgID, userID, orgID.String(), now)

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit provisioning: %w", err)
	}

	result := &ProvisionResult{
		OrgID:      orgID,
		Name:       in.Name,
		Slug:       in.Slug,
		Plan:       in.Plan,
		AdminEmail: in.AdminEmail,
		AdminName:  in.AdminName,
		CreatedAt:  now,
	}

	loginURL := mail.PublicAppURL() + "/login"
	html := fmt.Sprintf(`
		<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
		  <h2 style="color:#0c3843">Whoopit Office IT is ready</h2>
		  <p>Hello %s,</p>
		  <p>Your company workspace <strong>%s</strong> is live on the <strong>%s</strong> plan.</p>
		  <p>Sign in here: <a href="%s">%s</a></p>
		  <ul>
		    <li>Email: <strong>%s</strong></li>
		    <li>Temporary password: <strong>%s</strong></li>
		  </ul>
		  <p style="font-size:13px;color:#64748b">Change this password after your first sign-in. Warranty and low-stock alerts will go to this mailbox until you update Workspace Settings.</p>
		</div>
	`, in.AdminName, in.Name, in.Plan, loginURL, loginURL, in.AdminEmail, in.AdminPassword)
	text := fmt.Sprintf("Whoopit workspace ready for %s (%s plan).\nLogin: %s\nEmail: %s\nPassword: %s\n",
		in.Name, in.Plan, loginURL, in.AdminEmail, in.AdminPassword)
	if _, err := mail.Send(in.AdminEmail, "Your Whoopit Office IT workspace is ready", html, text); err != nil {
		result.WelcomeEmailSent = false
		result.WelcomeEmailError = err.Error()
	} else {
		result.WelcomeEmailSent = true
	}

	return result, nil
}

// UpdateOrganization updates the plan, name, or suspension status of a client company.
func (s *Service) UpdateOrganization(ctx context.Context, orgID uuid.UUID, name, plan string) error {
	if orgID.String() == platformOrgID {
		return fmt.Errorf("cannot modify Whoopit platform seed organization")
	}
	pool := s.tdb.Pool()

	var trialUpdate string
	if strings.EqualFold(plan, "trial") {
		trialUpdate = ", trial_ends_at = NOW() + interval '30 days'"
	}

	query := fmt.Sprintf(`
		UPDATE organizations
		SET name = COALESCE(NULLIF($2, ''), name),
		    plan = COALESCE(NULLIF($3, ''), plan)%s
		WHERE org_id = $1
		  AND org_id <> $4::uuid
	`, trialUpdate)

	tag, err := pool.Exec(ctx, query, orgID, name, plan, platformOrgID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("organization not found or protected")
	}

	auditID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO audit_log (audit_id, org_id, action, entity_type, entity_id, ip_address, created_at)
		VALUES ($1, $2, 'PLAN_UPDATED', 'organization', $3, '127.0.0.1', NOW())
	`, auditID, orgID, plan)

	return nil
}

// ExtendTrial extends the trial duration of a client company by a given number of days (default +14 days).
func (s *Service) ExtendTrial(ctx context.Context, orgID uuid.UUID, days int) error {
	if orgID.String() == platformOrgID {
		return fmt.Errorf("cannot modify Whoopit platform seed organization")
	}
	pool := s.tdb.Pool()
	if days <= 0 {
		days = 14
	}
	tag, err := pool.Exec(ctx, `
		UPDATE organizations
		SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + ($2 * interval '1 day'),
		    plan = 'trial'
		WHERE org_id = $1
		  AND org_id <> $3::uuid
	`, orgID, days, platformOrgID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("organization not found or protected")
	}

	auditID := uuid.New()
	_, _ = pool.Exec(ctx, `
		INSERT INTO audit_log (audit_id, org_id, action, entity_type, entity_id, ip_address, created_at)
		VALUES ($1, $2, 'TRIAL_EXTENDED', 'organization', $3, '127.0.0.1', NOW())
	`, auditID, orgID, fmt.Sprintf("+%d days", days))

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

	// Client IT Managers = company admins/staff only. Whoopit SuperAdmin is the software vendor, not a client user.
	rows, err := tx.Query(ctx, `
		SELECT 
			u.user_id,
			u.org_id,
			COALESCE(o.name, 'Unknown Company') AS org_name,
			u.email,
			COALESCE(u.name, 'User') AS name,
			u.role,
			u.is_active,
			u.created_at
		FROM users u
		LEFT JOIN organizations o ON o.org_id = u.org_id
		WHERE lower(u.role) NOT IN ('superadmin', 'platform_admin')
		  AND lower(u.email::text) <> 'admin@whoopit.io'
		  AND u.org_id <> $1::uuid
		  AND lower(COALESCE(o.slug::text, '')) <> 'whoopit-store'
		ORDER BY u.created_at DESC
		LIMIT 200;
	`, platformOrgID)
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
		if isPlatformOwnerRole(u.Role) || isPlatformOwnerEmail(u.Email) {
			continue
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
		WHERE a.org_id IS DISTINCT FROM $2::uuid
		  AND lower(COALESCE(o.slug::text, '')) <> 'whoopit-store'
		ORDER BY a.created_at DESC
		LIMIT $1;
	`, limit, platformOrgID)
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
			COALESCE(u.email, 'system@whoopit.io') AS user_email,
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
