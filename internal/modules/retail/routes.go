package retail

import (
	"github.com/go-chi/chi/v5"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/database"
)

// RegisterRoutes sets up retail point-of-sale fast stock deduction endpoints.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB, moveSvc *inventory.StockMovementService) *RetailSalesService {
	svc := NewRetailSalesService(tdb, moveSvc)
	h := NewHandler(svc)

	r.Group(func(ret chi.Router) {
		ret.Use(middleware.TenantMiddleware)

		ret.Post("/api/v1/retail/sell", h.Sell)
	})

	return svc
}
