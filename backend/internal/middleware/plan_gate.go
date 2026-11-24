package middleware

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"whoopit-core/internal/platform/entitlement"
	platformHttp "whoopit-core/internal/platform/http"
)

// PlanGate enforces the commercial license on every tenant API call.
// Superadmin keeps access so platform support can still open a client workspace.
// GET /api/v1/auth/me is intentionally not wrapped, so the UI can read expiry flags.
func PlanGate(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if role, ok := GetUserRole(r.Context()); ok && strings.EqualFold(role, "superadmin") {
				next.ServeHTTP(w, r)
				return
			}

			orgID, ok := GetTenantID(r.Context())
			if !ok || pool == nil {
				next.ServeHTTP(w, r)
				return
			}

			snap, err := entitlement.Load(r.Context(), pool, orgID)
			if err != nil {
				platformHttp.RespondProblem(w, r, http.StatusServiceUnavailable, "License Check Failed", "Could not verify the workspace plan. Please try again.", nil)
				return
			}
			if pe := snap.AccessError(); pe != nil {
				platformHttp.RespondProblem(w, r, pe.HTTPStatus, pe.Title, pe.Detail, nil)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
