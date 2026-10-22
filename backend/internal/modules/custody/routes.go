package custody

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/cache"
	"whoopit-core/internal/platform/database"
	platformHttp "whoopit-core/internal/platform/http"
)

// RegisterRoutes sets up custody and atomic stock reservation endpoints.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB, moveSvc *inventory.StockMovementService, valkey *cache.ValkeyClient) {
	svc := NewAssetCustodyService(tdb, moveSvc)
	h := NewHandler(svc)

	r.Group(func(cr chi.Router) {
		cr.Use(middleware.TenantMiddleware)

		cr.Post("/api/v1/assets/checkout", h.CheckOut)
		cr.Post("/api/v1/assets/checkin", h.CheckIn)
		cr.Get("/api/v1/assets/custody/employee/{user_id}", h.ListEmployeeCustody)
		cr.Get("/api/v1/assets/summary", h.GetCustodySummary)
		cr.Get("/api/v1/assets/assignments/{id}/certificate", h.GetHandoverCertificate)

		if valkey != nil {
			cr.Post("/api/v1/stock/reserve", func(w http.ResponseWriter, r *http.Request) {
				orgID, ok := middleware.GetTenantID(r.Context())
				if !ok {
					platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
					return
				}

				var req struct {
					ItemID     string `json:"item_id"`
					LocationID string `json:"location_id"`
					Quantity   int64  `json:"quantity"`
				}
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
					return
				}

				itemID, err := uuid.Parse(req.ItemID)
				if err != nil {
					platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid item_id UUID", nil)
					return
				}
				locID, err := uuid.Parse(req.LocationID)
				if err != nil {
					platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid location_id UUID", nil)
					return
				}

				token, reserved, err := valkey.ReserveStock(r.Context(), orgID, itemID, locID, req.Quantity)
				if err != nil {
					platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
					return
				}

				if !reserved {
					platformHttp.RespondProblem(
						w, r, http.StatusUnprocessableEntity,
						"Reservation Denied",
						"Insufficient cached stock to reserve requested quantity",
						nil,
					)
					return
				}

				platformHttp.RespondJSON(w, http.StatusOK, map[string]interface{}{
					"reservation_token":  token,
					"expires_in_seconds": 300,
				}, nil)
			})
		}
	})
}
