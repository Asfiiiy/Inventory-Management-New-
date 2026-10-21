package middleware

import (
	"context"
	"fmt"
	"net/http"
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

// TenantMiddleware extracts and verifies the organization tenant UUID and user session.
// It verifies JWT Bearer tokens first, with a fallback to 'X-Tenant-ID' for development ease.
func TenantMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims, err := platformAuth.ParseToken(tokenStr)
			if err == nil && claims != nil {
				ctx := r.Context()
				ctx = context.WithValue(ctx, tenantContextKey, claims.OrgID)
				ctx = context.WithValue(ctx, userContextKey, claims.UserID)
				ctx = context.WithValue(ctx, roleContextKey, claims.Role)
				ctx = context.WithValue(ctx, emailContextKey, claims.Email)
				ctx = context.WithValue(ctx, nameContextKey, claims.Name)

				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// If not a JWT, check if it's a raw UUID (dev token mode)
			if parsedDevUUID, devErr := uuid.Parse(tokenStr); devErr == nil && parsedDevUUID != uuid.Nil {
				ctx := r.Context()
				ctx = context.WithValue(ctx, tenantContextKey, parsedDevUUID)
				ctx = context.WithValue(ctx, roleContextKey, "admin")
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		// Fallback check: X-Tenant-ID header
		tenantStr := r.Header.Get("X-Tenant-ID")
		if tenantStr != "" {
			parsedID, err := uuid.Parse(tenantStr)
			if err == nil && parsedID != uuid.Nil {
				ctx := r.Context()
				ctx = context.WithValue(ctx, tenantContextKey, parsedID)
				ctx = context.WithValue(ctx, roleContextKey, "admin")
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		platformHttp.RespondProblem(
			w, r, http.StatusUnauthorized,
			"Unauthorized: Missing Authentication Session",
			"A valid 'Authorization: Bearer <token>' or 'X-Tenant-ID' header is required.",
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
// If not, it rejects the request with HTTP 403 Forbidden.
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, ok := GetUserRole(r.Context())
			if !ok {
				platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "User role not identified", nil)
				return
			}

			allowed := false
			for _, allowedRole := range allowedRoles {
				if strings.EqualFold(role, allowedRole) {
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
