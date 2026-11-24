package auth

import (
	"context"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/entitlement"
	"whoopit-core/internal/platform/mail"
)

func allowDemoPasswordBypass() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("ALLOW_DEMO_PASSWORD_BYPASS")))
	return v == "1" || v == "true" || v == "yes"
}

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUserNotFound       = errors.New("user not found")
	ErrUserInactive       = errors.New("user account is inactive")
	ErrEmailExists        = errors.New("email address is already in use")
)

type UserProfile struct {
	ID                 uuid.UUID  `json:"id"`
	OrgID              uuid.UUID  `json:"org_id"`
	OrgName            string     `json:"org_name,omitempty"`
	OrgPlan            string     `json:"org_plan,omitempty"`
	Email              string     `json:"email"`
	Name               string     `json:"name"`
	Role               string     `json:"role"`
	IsActive           bool       `json:"is_active"`
	EmployeeCode       string     `json:"employee_code,omitempty"`
	Department         string     `json:"department,omitempty"`
	DeskLocation       string     `json:"desk_location,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	TrialEndsAt        *time.Time `json:"trial_ends_at,omitempty"`
	TrialDaysRemaining int        `json:"trial_days_remaining"`
	IsTrialExpired     bool       `json:"is_trial_expired"`
	IsSuspended        bool       `json:"is_suspended"`
	InviteEmailSent    bool       `json:"invite_email_sent,omitempty"`
}

type CreateUserInput struct {
	Email          string
	Password       string
	Name           string
	Role           string
	EmployeeCode   string
	Department     string
	DeskLocation   string
	SendInviteMail bool
}

type UpdateUserInput struct {
	Role           string
	Name           string
	Email          string
	IsActive       bool
	EmployeeCode   *string
	Department     *string
	DeskLocation   *string
}

type AuthResponse struct {
	Token string      `json:"token"`
	User  UserProfile `json:"user"`
}

type Service struct {
	tdb *database.TenantDB
}

func NewService(tdb *database.TenantDB) *Service {
	return &Service{tdb: tdb}
}

// sanitizeSlug converts text into a clean URL-friendly slug.
func sanitizeSlug(input string) string {
	reg := regexp.MustCompile("[^a-z0-9]+")
	slug := reg.ReplaceAllString(strings.ToLower(strings.TrimSpace(input)), "-")
	return strings.Trim(slug, "-")
}

// Register creates a new organization and the initial administrator user account.
func (s *Service) Register(ctx context.Context, email, password, name, orgName string) (*AuthResponse, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || len(password) < 6 {
		return nil, errors.New("valid email and password (minimum 6 characters) are required")
	}

	if name == "" {
		parts := strings.Split(email, "@")
		name = strings.Title(parts[0])
	}

	if orgName == "" {
		orgName = name + "'s Inventory"
	}

	// Hash password with Argon2id
	pwHash, err := HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	orgID := uuid.New()
	userID := uuid.New()
	slugBase := sanitizeSlug(orgName)
	if slugBase == "" {
		slugBase = "org"
	}
	orgSlug := fmt.Sprintf("%s-%s", slugBase, uuid.New().String()[:8])

	pool := s.tdb.Pool()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to start registration transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Bypass RLS during initial organization creation
	_, _ = tx.Exec(ctx, "SET LOCAL row_security = off")

	// 1. Create Organization
	_, err = tx.Exec(ctx, `
		INSERT INTO organizations (org_id, name, slug, plan)
		VALUES ($1, $2, $3, 'enterprise')
	`, orgID, orgName, orgSlug)
	if err != nil {
		return nil, fmt.Errorf("failed to create organization: %w", err)
	}

	// 2. Create Owner User (role: 'owner')
	now := time.Now()
	_, err = tx.Exec(ctx, `
		INSERT INTO users (user_id, org_id, email, password_hash, role, name, is_active, created_at)
		VALUES ($1, $2, $3, $4, 'owner', $5, true, $6)
	`, userID, orgID, email, pwHash, name, now)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return nil, ErrEmailExists
		}
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit registration: %w", err)
	}

	token, err := GenerateToken(userID, orgID, email, name, "owner")
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	return &AuthResponse{
		Token: token,
		User: UserProfile{
			ID:        userID,
			OrgID:     orgID,
			OrgName:   orgName,
			OrgPlan:   "enterprise",
			Email:     email,
			Name:      name,
			Role:      "owner",
			IsActive:  true,
			CreatedAt: now,
		},
	}, nil
}

// Login authenticates a user by email and password, returning a signed JWT token and persisting a session.
func (s *Service) Login(ctx context.Context, email, password string) (*AuthResponse, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return nil, ErrInvalidCredentials
	}

	pool := s.tdb.Pool()

	var (
		userID       uuid.UUID
		orgID        uuid.UUID
		orgName      string
		orgPlan      string
		emailDB      string
		passwordHash string
		role         string
		name         string
		isActive     bool
		createdAt    time.Time
		trialEndsAt  *time.Time
	)

	query := `
		SELECT u.user_id, u.org_id, COALESCE(o.name, ''), COALESCE(o.plan, 'standard'), u.email::text, u.password_hash, u.role, u.name, u.is_active, u.created_at,
		       COALESCE(o.trial_ends_at, CASE WHEN lower(COALESCE(o.plan, '')) = 'trial' THEN o.created_at + interval '30 days' ELSE NULL END)
		FROM users u
		LEFT JOIN organizations o ON o.org_id = u.org_id
		WHERE u.email = $1
		ORDER BY u.is_active DESC, u.created_at DESC
		LIMIT 1
	`

	err := pool.QueryRow(ctx, query, email).Scan(
		&userID, &orgID, &orgName, &orgPlan, &emailDB, &passwordHash, &role, &name, &isActive, &createdAt, &trialEndsAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("database query failed: %w", err)
	}

	if !isActive {
		return nil, ErrUserInactive
	}

	isSuspended := strings.EqualFold(orgPlan, "suspended")
	if isSuspended && role != "superadmin" {
		return nil, errors.New("organization workspace has been placed on commercial billing hold. please contact admin@whoopit.io")
	}

	isTrialExpired, trialDaysRemaining := entitlement.TrialWindow(orgPlan, trialEndsAt, time.Now())
	if isTrialExpired && role != "superadmin" {
		return nil, errors.New("your 30-day evaluation trial has ended. please contact admin@whoopit.io to activate a commercial license")
	}

	// Verify password (supports Argon2id with Bcrypt backward-compatibility).
	// Hardcoded demo passwords only when ALLOW_DEMO_PASSWORD_BYPASS=1 (local).
	valid, err := VerifyPassword(passwordHash, password)
	if !valid && allowDemoPasswordBypass() {
		if strings.EqualFold(emailDB, "admin@whoopit.io") && (password == "Password123!" || password == "AdminPass123!") {
			valid = true
			err = nil
		} else if strings.EqualFold(emailDB, "staff@whoopit.io") && (password == "Password123!" || password == "StaffPass123!") {
			valid = true
			err = nil
		}
	}
	if err != nil || !valid {
		return nil, ErrInvalidCredentials
	}

	if name == "" {
		parts := strings.Split(emailDB, "@")
		name = strings.Title(parts[0])
	}

	token, err := GenerateToken(userID, orgID, emailDB, name, role)
	if err != nil {
		return nil, fmt.Errorf("failed to sign authentication token: %w", err)
	}

	// Record Server-side session in PostgreSQL
	sessionID := uuid.New().String()
	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	_, _ = pool.Exec(ctx, `
		INSERT INTO sessions (session_id, user_id, org_id, expires_at)
		VALUES ($1, $2, $3, $4)
	`, sessionID, userID, orgID, expiresAt)

	return &AuthResponse{
		Token: token,
		User: UserProfile{
			ID:                 userID,
			OrgID:              orgID,
			OrgName:            orgName,
			OrgPlan:            orgPlan,
			Email:              emailDB,
			Name:               name,
			Role:               role,
			IsActive:           isActive,
			CreatedAt:          createdAt,
			TrialEndsAt:        trialEndsAt,
			TrialDaysRemaining: trialDaysRemaining,
			IsTrialExpired:     isTrialExpired,
			IsSuspended:        isSuspended,
		},
	}, nil
}

// GetUserProfile loads the current user's profile details.
func (s *Service) GetUserProfile(ctx context.Context, userID uuid.UUID) (*UserProfile, error) {
	pool := s.tdb.Pool()

	var (
		uID         uuid.UUID
		orgID       uuid.UUID
		orgName     string
		orgPlan     string
		email       string
		role        string
		name        string
		isActive    bool
		createdAt   time.Time
		trialEndsAt *time.Time
	)

	query := `
		SELECT u.user_id, u.org_id, COALESCE(o.name, ''), COALESCE(o.plan, 'standard'), u.email::text, u.role, u.name, u.is_active, u.created_at,
		       COALESCE(o.trial_ends_at, CASE WHEN lower(COALESCE(o.plan, '')) = 'trial' THEN o.created_at + interval '30 days' ELSE NULL END)
		FROM users u
		LEFT JOIN organizations o ON o.org_id = u.org_id
		WHERE u.user_id = $1
	`

	err := pool.QueryRow(ctx, query, userID).Scan(
		&uID, &orgID, &orgName, &orgPlan, &email, &role, &name, &isActive, &createdAt, &trialEndsAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("database query failed: %w", err)
	}

	if name == "" {
		parts := strings.Split(email, "@")
		name = strings.Title(parts[0])
	}

	isSuspended := strings.EqualFold(orgPlan, "suspended")
	isTrialExpired, trialDaysRemaining := entitlement.TrialWindow(orgPlan, trialEndsAt, time.Now())

	return &UserProfile{
		ID:                 uID,
		OrgID:              orgID,
		OrgName:            orgName,
		OrgPlan:            orgPlan,
		Email:              email,
		Name:               name,
		Role:               role,
		IsActive:           isActive,
		CreatedAt:          createdAt,
		TrialEndsAt:        trialEndsAt,
		TrialDaysRemaining: trialDaysRemaining,
		IsTrialExpired:     isTrialExpired,
		IsSuspended:        isSuspended,
	}, nil
}

// Logout revokes a session by session ID.
func (s *Service) Logout(ctx context.Context, sessionID string) error {
	pool := s.tdb.Pool()
	_, err := pool.Exec(ctx, "DELETE FROM sessions WHERE session_id = $1", sessionID)
	return err
}

// LogoutUser revokes all server-side sessions for a user (JWT logout).
func (s *Service) LogoutUser(ctx context.Context, userID uuid.UUID) error {
	if userID == uuid.Nil {
		return nil
	}
	_, err := s.tdb.Pool().Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

// ForgotPassword resets to a temporary password and emails it when the account exists.
func (s *Service) ForgotPassword(ctx context.Context, email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || !strings.Contains(email, "@") {
		return nil
	}
	pool := s.tdb.Pool()
	var userID uuid.UUID
	var name string
	err := pool.QueryRow(ctx, `
		SELECT user_id, COALESCE(NULLIF(name, ''), split_part(email::text, '@', 1))
		FROM users WHERE lower(email::text) = $1 AND is_active = true
		LIMIT 1
	`, email).Scan(&userID, &name)
	if err != nil {
		return nil // do not reveal existence
	}

	tempPass := fmt.Sprintf("Temp%s!", uuid.New().String()[:8])
	hash, err := HashPassword(tempPass)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE user_id = $1`, userID, hash)
	if err != nil {
		return err
	}
	_ = s.LogoutUser(ctx, userID)

	loginURL := mail.PublicAppURL() + "/login"
	html := fmt.Sprintf(`
		<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;color:#0f172a">
		  <h2 style="color:#0c3843">Password reset</h2>
		  <p>Hello %s,</p>
		  <p>A temporary password was generated for your Whoopit account.</p>
		  <ul>
		    <li>Email: <strong>%s</strong></li>
		    <li>Temporary password: <strong>%s</strong></li>
		  </ul>
		  <p>Sign in at <a href="%s">%s</a> and change this password with your admin if needed.</p>
		</div>`, name, email, tempPass, loginURL, loginURL)
	text := fmt.Sprintf("Whoopit temporary password for %s: %s\nLogin: %s\n", email, tempPass, loginURL)
	_, _ = mail.Send(email, "Your Whoopit temporary password", html, text)
	return nil
}

// ListUsers returns all store staff and organization users (excluding global superadmins).
func (s *Service) ListUsers(ctx context.Context, orgID uuid.UUID) ([]UserProfile, error) {
	pool := s.tdb.Pool()
	rows, err := pool.Query(ctx, `
		SELECT user_id, org_id, email::text, role, name, is_active, created_at,
		       COALESCE(employee_code, ''), COALESCE(department, ''), COALESCE(desk_location, '')
		FROM users
		WHERE org_id = $1 AND role != 'superadmin'
		ORDER BY created_at DESC
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []UserProfile
	for rows.Next() {
		var u UserProfile
		if err := rows.Scan(
			&u.ID, &u.OrgID, &u.Email, &u.Role, &u.Name, &u.IsActive, &u.CreatedAt,
			&u.EmployeeCode, &u.Department, &u.DeskLocation,
		); err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// CreateUser adds a new user to an existing organization with an Argon2id hashed password.
func (s *Service) CreateUser(ctx context.Context, orgID uuid.UUID, in CreateUserInput) (*UserProfile, error) {
	email := strings.TrimSpace(strings.ToLower(in.Email))
	password := in.Password
	name := strings.TrimSpace(in.Name)
	if email == "" || len(password) < 6 {
		return nil, errors.New("valid email and password (minimum 6 characters) are required")
	}

	canonicalRole := CanonicalRole(in.Role)
	pwHash, err := HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	userID := uuid.New()
	now := time.Now()
	empCode := strings.TrimSpace(in.EmployeeCode)
	dept := strings.TrimSpace(in.Department)
	desk := strings.TrimSpace(in.DeskLocation)

	pool := s.tdb.Pool()
	_, err = pool.Exec(ctx, `
		INSERT INTO users (user_id, org_id, email, password_hash, role, name, is_active, created_at, employee_code, department, desk_location)
		VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10)
	`, userID, orgID, email, pwHash, canonicalRole, name, now, empCode, dept, desk)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return nil, ErrEmailExists
		}
		return nil, fmt.Errorf("failed to insert user: %w", err)
	}

	profile := &UserProfile{
		ID:           userID,
		OrgID:        orgID,
		Email:        email,
		Name:         name,
		Role:         canonicalRole,
		IsActive:     true,
		EmployeeCode: empCode,
		Department:   dept,
		DeskLocation: desk,
		CreatedAt:    now,
	}

	if in.SendInviteMail {
		loginURL := mail.PublicAppURL() + "/login"
		html := fmt.Sprintf(`
			<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;color:#0f172a">
			  <h2 style="color:#0c3843">You have a Whoopit staff account</h2>
			  <p>Hello %s,</p>
			  <p>Sign in at <a href="%s">%s</a></p>
			  <ul>
			    <li>Email: <strong>%s</strong></li>
			    <li>Temporary password: <strong>%s</strong></li>
			  </ul>
			</div>`, name, loginURL, loginURL, email, password)
		text := fmt.Sprintf("Whoopit staff account\nLogin: %s\nEmail: %s\nPassword: %s\n", loginURL, email, password)
		if _, err := mail.Send(email, "Your Whoopit staff sign-in", html, text); err == nil {
			profile.InviteEmailSent = true
		}
	}

	return profile, nil
}

// UpdateUser updates a user's role, name, email, directory fields, or active status.
func (s *Service) UpdateUser(ctx context.Context, orgID, userID uuid.UUID, in UpdateUserInput) (*UserProfile, error) {
	canonicalRole := strings.TrimSpace(in.Role)
	if canonicalRole != "" {
		canonicalRole = CanonicalRole(canonicalRole)
	}
	name := strings.TrimSpace(in.Name)
	email := strings.TrimSpace(strings.ToLower(in.Email))
	empCode := ""
	dept := ""
	desk := ""
	if in.EmployeeCode != nil {
		empCode = strings.TrimSpace(*in.EmployeeCode)
	}
	if in.Department != nil {
		dept = strings.TrimSpace(*in.Department)
	}
	if in.DeskLocation != nil {
		desk = strings.TrimSpace(*in.DeskLocation)
	}
	pool := s.tdb.Pool()

	var u UserProfile
	err := pool.QueryRow(ctx, `
		UPDATE users
		SET role = CASE WHEN $3 = '' THEN role ELSE $3::varchar END,
		    is_active = $4,
		    name = CASE WHEN $5 = '' THEN name ELSE $5::varchar END,
		    email = CASE WHEN $6 = '' THEN email ELSE $6::citext END,
		    employee_code = CASE WHEN $7::boolean THEN $8 ELSE employee_code END,
		    department = CASE WHEN $9::boolean THEN $10 ELSE department END,
		    desk_location = CASE WHEN $11::boolean THEN $12 ELSE desk_location END
		WHERE user_id = $1 AND org_id = $2
		RETURNING user_id, org_id, email::text, role, name, is_active, created_at,
		          COALESCE(employee_code, ''), COALESCE(department, ''), COALESCE(desk_location, '')
	`, userID, orgID, canonicalRole, in.IsActive, name, email,
		in.EmployeeCode != nil, empCode,
		in.Department != nil, dept,
		in.DeskLocation != nil, desk,
	).Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Role, &u.Name, &u.IsActive, &u.CreatedAt,
		&u.EmployeeCode, &u.Department, &u.DeskLocation,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return nil, ErrEmailExists
		}
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	return &u, nil
}
