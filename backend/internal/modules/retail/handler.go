package retail

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

type Handler struct {
	service *RetailSalesService
}

func NewHandler(service *RetailSalesService) *Handler {
	return &Handler{service: service}
}

type SellRequest struct {
	SKUOrBarcode    string  `json:"sku_or_barcode"`
	Quantity        float64 `json:"quantity"`
	StoreLocationID string  `json:"store_location_id"`
	ReceiptID       string  `json:"receipt_id"`
}

func (h *Handler) Sell(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req SellRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	if req.SKUOrBarcode == "" {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "sku_or_barcode is required", nil)
		return
	}

	if req.Quantity <= 0 {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Quantity must be greater than zero", nil)
		return
	}

	storeLocID, err := uuid.Parse(req.StoreLocationID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid store_location_id UUID", nil)
		return
	}

	res, err := h.service.SellItem(r.Context(), SellInput{
		OrgID:           orgID,
		SKUOrBarcode:    req.SKUOrBarcode,
		Quantity:        req.Quantity,
		StoreLocationID: storeLocID,
		ReceiptID:       req.ReceiptID,
	})
	if err != nil {
		if errors.Is(err, ErrItemNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Item Not Found", err.Error(), nil)
			return
		}
		if errors.Is(err, ErrInsufficientStock) {
			platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Insufficient Stock", err.Error(), nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, res, nil)
}
