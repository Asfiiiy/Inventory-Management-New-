package warehouse

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

type Handler struct {
	service *BatchAllocationService
}

func NewHandler(service *BatchAllocationService) *Handler {
	return &Handler{service: service}
}

type RegisterLotRequest struct {
	ItemID         string `json:"item_id"`
	TrackingNumber string `json:"tracking_number"`
	ExpirationDate string `json:"expiration_date"`
}

func (h *Handler) RegisterLot(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req RegisterLotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	itemID, err := uuid.Parse(req.ItemID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid item_id UUID", nil)
		return
	}

	if req.TrackingNumber == "" {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "tracking_number is required", nil)
		return
	}

	expDate, err := time.Parse(time.RFC3339, req.ExpirationDate)
	if err != nil {
		// Also try YYYY-MM-DD
		expDate, err = time.Parse("2006-01-02", req.ExpirationDate)
		if err != nil {
			platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid expiration_date format (use RFC3339 or YYYY-MM-DD)", nil)
			return
		}
	}

	lot, err := h.service.RegisterLot(r.Context(), orgID, itemID, req.TrackingNumber, expDate)
	if err != nil {
		if errors.Is(err, ErrNotBatchItem) {
			platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Invalid Tracking Mode", err.Error(), nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, lot, nil)
}

type DispatchFEFORequest struct {
	ItemID         string  `json:"item_id"`
	FromLocationID string  `json:"from_location_id"`
	ToLocationID   string  `json:"to_location_id"`
	Quantity       float64 `json:"quantity"`
	ReferenceCode  string  `json:"reference_code,omitempty"`
}

func (h *Handler) DispatchFEFO(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req DispatchFEFORequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	itemID, err := uuid.Parse(req.ItemID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid item_id UUID", nil)
		return
	}

	fromLocID, err := uuid.Parse(req.FromLocationID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid from_location_id UUID", nil)
		return
	}

	toLocID, err := uuid.Parse(req.ToLocationID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid to_location_id UUID", nil)
		return
	}

	if req.Quantity <= 0 {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Quantity must be greater than zero", nil)
		return
	}

	res, err := h.service.DispatchFEFO(r.Context(), DispatchFEFOInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: fromLocID,
		ToLocationID:   toLocID,
		Quantity:       req.Quantity,
		ReferenceCode:  req.ReferenceCode,
	})
	if err != nil {
		if errors.Is(err, ErrNotBatchItem) {
			platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Invalid Tracking Mode", err.Error(), nil)
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
