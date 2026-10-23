package superadmin

import (
	"github.com/go-chi/chi/v5"

	"whoopit-core/internal/platform/database"
)

// RegisterRoutes registers master platform control endpoints under /api/v1/superadmin.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB) {
	svc := NewService(tdb)
	h := NewHandler(svc)

	r.Route("/api/v1/superadmin", func(sa chi.Router) {
		sa.Get("/organizations", h.ListOrganizations)
		sa.Post("/organizations", h.ProvisionOrganization)
		sa.Patch("/organizations/{id}", h.UpdateOrganization)
		sa.Get("/organizations/{id}/activity", h.GetOrgActivity)
		sa.Get("/telemetry", h.GetTelemetry)
		sa.Get("/users", h.ListUsers)
		sa.Get("/audit", h.ListAuditLogs)
	})
}
