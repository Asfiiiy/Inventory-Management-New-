package inventory

import (
	"github.com/go-chi/chi/v5"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/platform/database"
)

// RegisterRoutes sets up stock movement and balance endpoints mounted under /api/v1/stock.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB) {
	svc := NewStockMovementService(tdb)
	h := NewHandler(svc)

	r.Group(func(stock chi.Router) {
		stock.Use(middleware.TenantMiddleware)

		stock.Post("/api/v1/stock/moves", h.CreateMove)
		stock.Get("/api/v1/stock/moves", h.ListMoves)
		stock.Get("/api/v1/stock/locations/{location_id}/balance", h.GetLocationBalance)
	})
}
