package middleware

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/google/uuid"

	platformAuth "whoopit-core/internal/platform/auth"
	platformHttp "whoopit-core/internal/platform/http"
)

type contextKey string

const (
	tenantContextKey contextKey = "tenant_org_id"
	userContextKey   contextKey = "auth_user_id"
	roleContextKey   contextKey = "auth_role"
	emailContextKey  contextKey = "auth_email"
	nameContextKey   contextKey = "auth_name"
)

func allowInsecureDevAuth() bool {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	flag := strings.ToLower(strings.TrimSpace(os.Getenv("ALLOW_DEV_TENANT_HEADER")))
	return (env == "development" || env == "dev" || env == "local") && (flag == "1" || flag == "true" || flag == "yes")
}

// TenantMiddleware extracts and verifies the organization tenant UUID and user session.
// Production requires a valid JWT Bearer token. SuperAdmin may still switch tenant via X-Tenant-ID.
func TenantMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims, err := platformAuth.ParseToken(tokenStr)
			if err == nil && claims != nil {
				ctx := r.Context()
				orgID := claims.OrgID
				// Allow SuperAdmin to switch tenant scope via X-Tenant-ID (support preview)
				if strings.EqualFold(claims.Role, "superadmin") || strings.EqualFold(claims.Email, "admin@whoopit.io") {
					if tenantHeader := r.Header.Get("X-Tenant-ID"); tenantHeader != "" {
						if parsedTenant, parseErr := uuid.Parse(tenantHeader); parseErr == nil && parsedTenant != uuid.Nil {
							orgID = parsedTenant
						}
					}
				}
				ctx = context.WithValue(ctx, tenantContextKey, orgID)
				ctx = context.WithValue(ctx, userContextKey, claims.UserID)
				ctx = context.WithValue(ctx, roleContextKey, claims.Role)
				ctx = context.WithValue(ctx, emailContextKey, claims.Email)
				ctx = context.WithValue(ctx, nameContextKey, claims.Name)

				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		// Opt-in local-only bypass (never on by default in docker/production).
		if allowInsecureDevAuth() {
			tenantStr := r.Header.Get("X-Tenant-ID")
			if tenantStr != "" {
				if parsedID, err := uuid.Parse(tenantStr); err == nil && parsedID != uuid.Nil {
					ctx := r.Context()
					ctx = context.WithValue(ctx, tenantContextKey, parsedID)
					ctx = context.WithValue(ctx, roleContextKey, "admin")
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		platformHttp.RespondProblem(
			w, r, http.StatusUnauthorized,
			"Unauthorized: Missing Authentication Session",
			"A valid Authorization Bearer JWT is required.",
			nil,
		)
	})
}

// GetTenantID retrieves the organization UUID from request context.
func GetTenantID(ctx context.Context) (uuid.UUID, bool) {
	val, ok := ctx.Value(tenantContextKey).(uuid.UUID)
	if !ok || val == uuid.Nil {
		return uuid.Nil, false
	}
	return val, true
}

// GetUserID retrieves the authenticated user's UUID from request context.
func GetUserID(ctx context.Context) (uuid.UUID, bool) {
	val, ok := ctx.Value(userContextKey).(uuid.UUID)
	if !ok || val == uuid.Nil {
		return uuid.Nil, false
	}
	return val, true
}

// GetUserRole retrieves the authenticated user's role (e.g. 'admin', 'staff') from context.
func GetUserRole(ctx context.Context) (string, bool) {
	val, ok := ctx.Value(roleContextKey).(string)
	if !ok || val == "" {
		return "", false
	}
	return val, true
}

// GetUserEmail retrieves the authenticated user's email address from context.
func GetUserEmail(ctx context.Context) (string, bool) {
	val, ok := ctx.Value(emailContextKey).(string)
	if !ok || val == "" {
		return "", false
	}
	return val, true
}

// GetUserName retrieves the authenticated user's display name from context.
func GetUserName(ctx context.Context) (string, bool) {
	val, ok := ctx.Value(nameContextKey).(string)
	if !ok || val == "" {
		return "", false
	}
	return val, true
}

// RequireRole checks whether the user's role is in the allowedRoles list.
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, ok := GetUserRole(r.Context())
			if !ok {
				platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "User role not identified", nil)
				return
			}

			canon := platformAuth.CanonicalRole(role)
			if strings.EqualFold(role, "superadmin") || strings.EqualFold(role, "platform_admin") {
				canon = "superadmin"
			}

			allowed := false
			for _, allowedRole := range allowedRoles {
				a := strings.ToLower(strings.TrimSpace(allowedRole))
				if strings.EqualFold(role, a) || strings.EqualFold(canon, a) {
					allowed = true
					break
				}
				if a == "admin" && (canon == platformAuth.RoleOwner || strings.EqualFold(role, "admin")) {
					allowed = true
					break
				}
			}

			if !allowed {
				platformHttp.RespondProblem(
					w, r, http.StatusForbidden,
					"Forbidden: Insufficient Permissions",
					fmt.Sprintf("Your role '%s' does not have permission to access this resource.", role),
					nil,
				)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// IsCompanyAdmin reports whether the caller can administer the tenant workspace.
func IsCompanyAdmin(role string) bool {
	r := strings.ToLower(strings.TrimSpace(role))
	switch r {
	case "admin", "owner", "manager", "superadmin", "platform_admin":
		return true
	default:
		return platformAuth.CanonicalRole(role) == platformAuth.RoleOwner ||
			platformAuth.CanonicalRole(role) == platformAuth.RoleManager
	}
}
