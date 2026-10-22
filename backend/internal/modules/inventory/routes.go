package inventory

import (
	"github.com/go-chi/chi/v5"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/platform/database"
)

// RegisterRoutes sets up stock movement, reservations, and balance endpoints mounted under /api/v1/stock.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB) {
	svc := NewStockMovementService(tdb)
	res := NewReservationsService(tdb)
	h := NewHandler(svc, res)

	r.Group(func(stock chi.Router) {
		stock.Use(middleware.TenantMiddleware)

		stock.Post("/api/v1/stock/moves", h.CreateMove)
		stock.Get("/api/v1/stock/moves", h.ListMoves)
		stock.Get("/api/v1/stock/locations/{location_id}/balance", h.GetLocationBalance)

		// Reservations Engine
		stock.Post("/api/v1/stock/reservations", h.CreateReservation)
		stock.Get("/api/v1/stock/reservations", h.ListReservations)
		stock.Post("/api/v1/stock/reservations/{id}/release", h.ReleaseReservation)
		stock.Post("/api/v1/stock/reservations/{id}/fulfill", h.FulfillReservation)

		// Stock Summary with 4-Tier Badges & Location Breakdown
		stock.Get("/api/v1/stock/items/{id}/summary", h.GetItemStockSummary)
	})
}
