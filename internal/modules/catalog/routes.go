package catalog

import (
	"github.com/go-chi/chi/v5"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/modules/profiles"
	"whoopit-core/internal/platform/database"
)

// RegisterRoutes sets up catalog and location routes mounted under /api/v1.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB, validator *profiles.SchemaValidator) {
	h := NewHandler(tdb, validator)

	r.Route("/api/v1", func(api chi.Router) {
		// Protect all core inventory endpoints with Tenant Context Middleware
		api.Use(middleware.TenantMiddleware)

		// Locations
		api.Post("/locations", h.CreateLocation)
		api.Get("/locations", h.ListLocations)

		// Items
		api.Post("/items", h.CreateItem)
		api.Get("/items", h.ListItems)
		api.Get("/items/{id}", h.GetItemByID)
		api.Delete("/items/{id}", h.DeleteItem)
		api.Post("/items/search", h.SearchItems)
	})
}
