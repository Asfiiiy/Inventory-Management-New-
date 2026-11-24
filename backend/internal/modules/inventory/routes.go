package inventory

import (
	"github.com/go-chi/chi/v5"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/platform/database"
)

// RegisterRoutes sets up stock movement, reservations, and balance endpoints mounted under /api/v1/stock.
// Returns the handler so the process can wire Phase-2 scheduled finance mail.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB) *Handler {
	svc := NewStockMovementService(tdb)
	res := NewReservationsService(tdb)
	h := NewHandler(svc, res)

	r.Group(func(stock chi.Router) {
		stock.Use(middleware.TenantMiddleware)
		stock.Use(middleware.PlanGate(tdb.Pool()))

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

		// Stock Alerts & Ledger Reconciliation
		stock.Get("/api/v1/stock/alerts", h.GetStockAlerts)
		stock.Post("/api/v1/stock/items/{id}/reconcile", h.ReconcileItem)

		// Office IT Faulty & Vendor Repair Lifecycle
		stock.Get("/api/v1/repairs", h.ListRepairs)
		stock.Post("/api/v1/repairs", h.CreateRepair)
		stock.Post("/api/v1/repairs/{id}/send-vendor", h.SendToVendor)
		stock.Post("/api/v1/repairs/{id}/complete", h.CompleteRepair)
		stock.Post("/api/v1/repairs/{id}/scrap", h.ScrapRepair)

		// Finance Manager Audit Report & Direct Email Dispatch
		stock.Get("/api/v1/reports/finance", h.GetFinanceReport)
		stock.Post("/api/v1/reports/finance-email", h.SendFinanceReportEmail)

		// Warranty / AMC + low-stock digest emails
		stock.Get("/api/v1/reports/warranty-alerts", h.GetWarrantyAlerts)
		stock.Post("/api/v1/reports/warranty-alerts/email", h.EmailWarrantyAlerts)
		stock.Post("/api/v1/reports/low-stock/email", h.EmailLowStockDigest)

		// Product lifecycle timeline (moves + custody + repairs)
		stock.Get("/api/v1/stock/items/{id}/lifecycle", h.GetItemLifecycle)
	})
	return h
}
