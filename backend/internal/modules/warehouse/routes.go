package warehouse

import (
	"github.com/go-chi/chi/v5"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/database"
)

// RegisterRoutes sets up warehouse batch management and FEFO allocation routes.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB, moveSvc *inventory.StockMovementService) *BatchAllocationService {
	svc := NewBatchAllocationService(tdb, moveSvc)
	h := NewHandler(svc)

	r.Group(func(w chi.Router) {
		w.Use(middleware.TenantMiddleware)

		w.Post("/api/v1/warehouse/lots", h.RegisterLot)
		w.Post("/api/v1/warehouse/dispatch-fefo", h.DispatchFEFO)
	})

	return svc
}
