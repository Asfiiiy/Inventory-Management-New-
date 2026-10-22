package auth

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"whoopit-core/internal/platform/database"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUserNotFound       = errors.New("user not found")
	ErrUserInactive       = errors.New("user account is inactive")
	ErrEmailExists        = errors.New("email address is already in use")
)

type UserProfile struct {
	ID        uuid.UUID `json:"id"`
	OrgID     uuid.UUID `json:"org_id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
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
		emailDB      string
		passwordHash string
		role         string
		name         string
		isActive     bool
		createdAt    time.Time
	)

	query := `
		SELECT user_id, org_id, email::text, password_hash, role, name, is_active, created_at
		FROM users
		WHERE email = $1
		ORDER BY is_active DESC, created_at DESC
		LIMIT 1
	`

	err := pool.QueryRow(ctx, query, email).Scan(
		&userID, &orgID, &emailDB, &passwordHash, &role, &name, &isActive, &createdAt,
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

	// Verify password (supports Argon2id with Bcrypt backward-compatibility)
	valid, err := VerifyPassword(passwordHash, password)
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
			ID:        userID,
			OrgID:     orgID,
			Email:     emailDB,
			Name:      name,
			Role:      role,
			IsActive:  isActive,
			CreatedAt: createdAt,
		},
	}, nil
}

// GetUserProfile loads the current user's profile details.
func (s *Service) GetUserProfile(ctx context.Context, userID uuid.UUID) (*UserProfile, error) {
	pool := s.tdb.Pool()

	var (
		uID       uuid.UUID
		orgID     uuid.UUID
		email     string
		role      string
		name      string
		isActive  bool
		createdAt time.Time
	)

	query := `
		SELECT user_id, org_id, email::text, role, name, is_active, created_at
		FROM users
		WHERE user_id = $1
	`

	err := pool.QueryRow(ctx, query, userID).Scan(
		&uID, &orgID, &email, &role, &name, &isActive, &createdAt,
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

	return &UserProfile{
		ID:        uID,
		OrgID:     orgID,
		Email:     email,
		Name:      name,
		Role:      role,
		IsActive:  isActive,
		CreatedAt: createdAt,
	}, nil
}

// Logout revokes a session by session ID.
func (s *Service) Logout(ctx context.Context, sessionID string) error {
	pool := s.tdb.Pool()
	_, err := pool.Exec(ctx, "DELETE FROM sessions WHERE session_id = $1", sessionID)
	return err
}

// ListUsers returns all users belonging to the specified organization.
func (s *Service) ListUsers(ctx context.Context, orgID uuid.UUID) ([]UserProfile, error) {
	pool := s.tdb.Pool()
	rows, err := pool.Query(ctx, `
		SELECT user_id, org_id, email::text, role, name, is_active, created_at
		FROM users
		WHERE org_id = $1
		ORDER BY created_at DESC
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []UserProfile
	for rows.Next() {
		var u UserProfile
		if err := rows.Scan(&u.ID, &u.OrgID, &u.Email, &u.Role, &u.Name, &u.IsActive, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// CreateUser adds a new user to an existing organization with an Argon2id hashed password.
func (s *Service) CreateUser(ctx context.Context, orgID uuid.UUID, email, password, name, role string) (*UserProfile, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || len(password) < 6 {
		return nil, errors.New("valid email and password (minimum 6 characters) are required")
	}

	canonicalRole := CanonicalRole(role)
	pwHash, err := HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	userID := uuid.New()
	now := time.Now()

	pool := s.tdb.Pool()
	_, err = pool.Exec(ctx, `
		INSERT INTO users (user_id, org_id, email, password_hash, role, name, is_active, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, true, $7)
	`, userID, orgID, email, pwHash, name, canonicalRole, now)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return nil, ErrEmailExists
		}
		return nil, fmt.Errorf("failed to insert user: %w", err)
	}

	return &UserProfile{
		ID:        userID,
		OrgID:     orgID,
		Email:     email,
		Name:      name,
		Role:      canonicalRole,
		IsActive:  true,
		CreatedAt: now,
	}, nil
}

// UpdateUser updates a user's role or active status.
func (s *Service) UpdateUser(ctx context.Context, orgID, userID uuid.UUID, role string, isActive bool) (*UserProfile, error) {
	canonicalRole := CanonicalRole(role)
	pool := s.tdb.Pool()

	var u UserProfile
	err := pool.QueryRow(ctx, `
		UPDATE users
		SET role = $3, is_active = $4
		WHERE user_id = $1 AND org_id = $2
		RETURNING user_id, org_id, email::text, role, name, is_active, created_at
	`, userID, orgID, canonicalRole, isActive).Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Role, &u.Name, &u.IsActive, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	return &u, nil
}
