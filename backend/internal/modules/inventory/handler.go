package inventory

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

// Handler manages HTTP endpoints for inventory stock movements and balance queries.
type Handler struct {
	service      *StockMovementService
	reservations *ReservationsService
}

// NewHandler constructs a new Inventory Handler.
func NewHandler(svc *StockMovementService, res *ReservationsService) *Handler {
	return &Handler{service: svc, reservations: res}
}

type CreateMoveRequest struct {
	ItemID         string          `json:"item_id"`
	FromLocationID string          `json:"from_location_id"`
	ToLocationID   string          `json:"to_location_id"`
	Quantity       float64         `json:"quantity"`
	Unit           string          `json:"unit,omitempty"`
	MoveType       string          `json:"move_type"`
	ReferenceCode  string          `json:"reference_code,omitempty"`
	IdempotencyKey string          `json:"idempotency_key,omitempty"`
	Lines          []MoveLineInput `json:"lines,omitempty"`
}

// CreateMove executes an atomic two-sided stock movement.
func (h *Handler) CreateMove(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CreateMoveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	itemID, err := uuid.Parse(req.ItemID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid item_id", []platformHttp.ValidationErrorDetail{
			{Field: "item_id", Message: "must be a valid UUID"},
		})
		return
	}

	fromLocID, err := uuid.Parse(req.FromLocationID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid from_location_id", []platformHttp.ValidationErrorDetail{
			{Field: "from_location_id", Message: "must be a valid UUID"},
		})
		return
	}

	toLocID, err := uuid.Parse(req.ToLocationID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid to_location_id", []platformHttp.ValidationErrorDetail{
			{Field: "to_location_id", Message: "must be a valid UUID"},
		})
		return
	}

	if req.Quantity <= 0 {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid quantity", []platformHttp.ValidationErrorDetail{
			{Field: "quantity", Message: "must be greater than 0"},
		})
		return
	}

	if req.MoveType == "" {
		req.MoveType = "INTERNAL_TRANSFER"
	}

	// RBAC: Block staff from performing manual stock adjustments or write-offs
	role, _ := middleware.GetUserRole(r.Context())
	if role == "staff" && (strings.Contains(strings.ToUpper(req.MoveType), "ADJUSTMENT") || strings.Contains(strings.ToUpper(req.MoveType), "SCRAP")) {
		platformHttp.RespondProblem(
			w, r, http.StatusForbidden,
			"Forbidden: Action Restricted",
			"Staff accounts are blocked from performing manual stock adjustments. Only Administrators are permitted.",
			nil,
		)
		return
	}

	input := ExecuteMoveInput{
		OrgID:          orgID,
		ItemID:         itemID,
		FromLocationID: fromLocID,
		ToLocationID:   toLocID,
		Quantity:       req.Quantity,
		Unit:           req.Unit,
		MoveType:       req.MoveType,
		ReferenceCode:  req.ReferenceCode,
		IdempotencyKey: req.IdempotencyKey,
		Lines:          req.Lines,
	}

	res, err := h.service.ExecuteMove(r.Context(), input)
	if err != nil {
		if errors.Is(err, ErrInsufficientStock) {
			platformHttp.RespondProblem(
				w, r, http.StatusUnprocessableEntity,
				"Insufficient Stock",
				"Source location does not have enough stock",
				[]platformHttp.ValidationErrorDetail{
					{Field: "quantity", Message: "requested quantity exceeds on-hand balance at source location"},
				},
			)
			return
		}
		if errors.Is(err, ErrNoUOMConversion) {
			platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "UOM Conversion Error", err.Error(), nil)
			return
		}
		if errors.Is(err, ErrInvalidLineQty) {
			platformHttp.RespondProblem(
				w, r, http.StatusUnprocessableEntity,
				"Invalid Move Lines",
				err.Error(),
				nil,
			)
			return
		}
		if errors.Is(err, ErrLocationNotFound) || errors.Is(err, ErrItemNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Resource Not Found", err.Error(), nil)
			return
		}

		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, res, nil)
}

// GetLocationBalance returns the current on-hand balance for an item at a specific location.
func (h *Handler) GetLocationBalance(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	locIDStr := chi.URLParam(r, "location_id")
	locID, err := uuid.Parse(locIDStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid location_id UUID", nil)
		return
	}

	itemIDStr := r.URL.Query().Get("item_id")
	if itemIDStr == "" {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Query parameter 'item_id' is required", nil)
		return
	}

	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid item_id UUID parameter", nil)
		return
	}

	balance, err := h.service.GetLocationBalance(r.Context(), orgID, locID, itemID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"location_id": locID,
		"item_id":     itemID,
		"balance":     balance,
	}, nil)
}

// ListMoves lists movements filtered by item or location with limit/offset.
func (h *Handler) ListMoves(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var itemUUID, locUUID *uuid.UUID

	if itemStr := r.URL.Query().Get("item_id"); itemStr != "" {
		if parsed, err := uuid.Parse(itemStr); err == nil {
			itemUUID = &parsed
		}
	}
	if locStr := r.URL.Query().Get("location_id"); locStr != "" {
		if parsed, err := uuid.Parse(locStr); err == nil {
			locUUID = &parsed
		}
	}

	limit := int32(50)
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 && val <= 200 {
			limit = int32(val)
		}
	}

	offset := int32(0)
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if val, err := strconv.Atoi(offsetStr); err == nil && val >= 0 {
			offset = int32(val)
		}
	}

	moves, err := h.service.ListMoves(r.Context(), orgID, itemUUID, locUUID, limit, offset)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, moves, map[string]interface{}{
		"count":  len(moves),
		"limit":  limit,
		"offset": offset,
	})
}

// -----------------------------------------------------------------------------
// Stock Summary Handlers
// -----------------------------------------------------------------------------

// GetItemStockSummary returns on-hand, reserved, available, 4-tier status badges, and location breakdown.
func (h *Handler) GetItemStockSummary(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid ID", "Invalid item UUID parameter", nil)
		return
	}

	summary, err := h.service.GetItemStockSummary(r.Context(), orgID, itemID)
	if err != nil {
		if errors.Is(err, ErrItemNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Item not found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, summary, nil)
}

// -----------------------------------------------------------------------------
// Reservations Handlers
// -----------------------------------------------------------------------------

type CreateReservationRequest struct {
	ItemID      string  `json:"item_id"`
	LocationID  string  `json:"location_id"`
	Quantity    float64 `json:"quantity"`
	Kind        string  `json:"kind,omitempty"`
	Target      string  `json:"target,omitempty"`
	DueBackDate *string `json:"due_back_date,omitempty"`
}

func (h *Handler) CreateReservation(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CreateReservationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	itemID, err := uuid.Parse(req.ItemID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Validation Error", "Invalid item_id UUID", nil)
		return
	}

	locID, err := uuid.Parse(req.LocationID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Validation Error", "Invalid location_id UUID", nil)
		return
	}

	var dueBack *time.Time
	if req.DueBackDate != nil && *req.DueBackDate != "" {
		t, err := time.Parse(time.RFC3339, *req.DueBackDate)
		if err == nil {
			dueBack = &t
		}
	}

	res, err := h.reservations.CreateReservation(r.Context(), CreateReservationInput{
		OrgID:       orgID,
		ItemID:      itemID,
		LocationID:  locID,
		Quantity:    req.Quantity,
		Kind:        req.Kind,
		Target:      req.Target,
		DueBackDate: dueBack,
	})
	if err != nil {
		if errors.Is(err, ErrInsufficientStock) {
			platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Insufficient Stock", err.Error(), nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, res, nil)
}

func (h *Handler) ListReservations(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var itemUUID *uuid.UUID
	if itemStr := r.URL.Query().Get("item_id"); itemStr != "" {
		if parsed, err := uuid.Parse(itemStr); err == nil {
			itemUUID = &parsed
		}
	}
	status := r.URL.Query().Get("status")

	reservations, err := h.reservations.ListReservations(r.Context(), orgID, itemUUID, status)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, reservations, map[string]any{"count": len(reservations)})
}

func (h *Handler) ReleaseReservation(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	resID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid ID", "Invalid reservation UUID", nil)
		return
	}

	released, err := h.reservations.ReleaseReservation(r.Context(), orgID, resID)
	if err != nil {
		if errors.Is(err, ErrReservationNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Reservation not found", nil)
			return
		}
		if errors.Is(err, ErrReservationInactive) {
			platformHttp.RespondProblem(w, r, http.StatusConflict, "Conflict", "Reservation is not active", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, released, nil)
}

type FulfillReservationRequest struct {
	ToLocationID string `json:"to_location_id"`
}

func (h *Handler) FulfillReservation(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	resID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid ID", "Invalid reservation UUID", nil)
		return
	}

	var req FulfillReservationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	toLocID, err := uuid.Parse(req.ToLocationID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid Location ID", "to_location_id must be a valid UUID", nil)
		return
	}

	actorID := uuid.New()
	fulfilled, err := h.reservations.FulfillReservation(r.Context(), orgID, resID, toLocID, actorID)
	if err != nil {
		if errors.Is(err, ErrReservationNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Reservation not found", nil)
			return
		}
		if errors.Is(err, ErrReservationInactive) {
			platformHttp.RespondProblem(w, r, http.StatusConflict, "Conflict", "Reservation is not active", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, fulfilled, nil)
}

