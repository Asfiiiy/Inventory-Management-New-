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
		api.Patch("/items/{id}/archive", h.ArchiveItem)
		api.Post("/items/search", h.SearchItems)
		api.Post("/items/import-csv", h.ImportProductsCSV)

		// Custom Fields
		api.Post("/custom-fields", h.CreateCustomField)
		api.Get("/custom-fields", h.ListCustomFields)
		api.Delete("/custom-fields/{id}", h.DeleteCustomField)

		// Suppliers
		api.Post("/suppliers", h.CreateSupplier)
		api.Get("/suppliers", h.ListSuppliers)

		// Categories
		api.Post("/categories", h.CreateCategory)
		api.Get("/categories", h.ListCategories)

		// Units of Measure & Conversions
		api.Post("/units", h.CreateUOM)
		api.Get("/units", h.ListUOMs)
		api.Post("/units/conversions", h.CreateUOMConversion)
	})
}
