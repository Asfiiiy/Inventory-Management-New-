package inventory

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

// Handler manages HTTP endpoints for inventory stock movements and balance queries.
type Handler struct {
	service *StockMovementService
}

// NewHandler constructs a new Inventory Handler.
func NewHandler(svc *StockMovementService) *Handler {
	return &Handler{service: svc}
}

type CreateMoveRequest struct {
	ItemID         string          `json:"item_id"`
	FromLocationID string          `json:"from_location_id"`
	ToLocationID   string          `json:"to_location_id"`
	Quantity       float64         `json:"quantity"`
	MoveType       string          `json:"move_type"`
	ReferenceCode  string          `json:"reference_code,omitempty"`
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
		MoveType:       req.MoveType,
		ReferenceCode:  req.ReferenceCode,
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
