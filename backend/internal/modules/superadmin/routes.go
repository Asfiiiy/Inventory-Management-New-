package superadmin

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/platform/database"
	platformHttp "whoopit-core/internal/platform/http"
)

// requireMasterAdmin verifies that the caller is the platform owner or superadmin.
func requireMasterAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email, hasEmail := middleware.GetUserEmail(r.Context())
		role, hasRole := middleware.GetUserRole(r.Context())

		isMaster := (hasEmail && strings.EqualFold(email, "admin@whoopit.io")) ||
			(hasRole && (strings.EqualFold(role, "superadmin") || strings.EqualFold(role, "platform_admin")))

		if !isMaster {
			platformHttp.RespondProblem(
				w, r, http.StatusForbidden,
				"Forbidden: Master Platform Admin Only",
				"You do not have permission to access the SuperAdmin control room.",
				nil,
			)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RegisterRoutes registers master platform control endpoints under /api/v1/superadmin.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB) {
	svc := NewService(tdb)
	h := NewHandler(svc)

	r.Route("/api/v1/superadmin", func(sa chi.Router) {
		sa.Use(middleware.TenantMiddleware)
		sa.Use(requireMasterAdmin)

		sa.Get("/organizations", h.ListOrganizations)
		sa.Post("/organizations", h.ProvisionOrganization)
		sa.Patch("/organizations/{id}", h.UpdateOrganization)
		sa.Get("/organizations/{id}/activity", h.GetOrgActivity)
		sa.Get("/telemetry", h.GetTelemetry)
		sa.Get("/users", h.ListUsers)
		sa.Get("/audit", h.ListAuditLogs)
	})
}
