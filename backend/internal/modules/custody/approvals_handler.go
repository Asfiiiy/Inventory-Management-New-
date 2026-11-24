package custody

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

type createRequestBody struct {
	AssetID            string  `json:"asset_id"`
	EmployeeUserID     string  `json:"employee_user_id"`
	SourceLocationID   string  `json:"source_location_id,omitempty"`
	Quantity           float64 `json:"quantity,omitempty"`
	SerialNumber       string  `json:"serial_number,omitempty"`
	RequestType        string  `json:"request_type,omitempty"`
	Reason             string  `json:"reason,omitempty"`
	Notes              string  `json:"notes,omitempty"`
	ConditionGrade     string  `json:"condition_grade,omitempty"`
	ExpectedReturnDate string  `json:"expected_return_date,omitempty"`
}

type decideRequestBody struct {
	DecisionNotes string `json:"decision_notes,omitempty"`
	SignatureData string `json:"signature_data,omitempty"`
}

// CreateAssetRequest queues a pending hardware issue/dispose for admin approval.
func (h *Handler) CreateAssetRequest(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "User context missing", nil)
		return
	}

	var body createRequestBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	itemID, err := uuid.Parse(body.AssetID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid asset_id", nil)
		return
	}
	empID, err := uuid.Parse(body.EmployeeUserID)
	if err != nil {
		empID = userID
	}

	var locPtr *uuid.UUID
	if strings.TrimSpace(body.SourceLocationID) != "" {
		locID, err := uuid.Parse(body.SourceLocationID)
		if err != nil {
			platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid source_location_id", nil)
			return
		}
		locPtr = &locID
	}

	var expDate *time.Time
	if body.ExpectedReturnDate != "" {
		if parsed, parseErr := time.Parse(time.RFC3339, body.ExpectedReturnDate); parseErr == nil {
			expDate = &parsed
		}
	}

	req, err := h.service.CreateAssetRequest(r.Context(), CreateRequestInput{
		OrgID:              orgID,
		RequesterUserID:    userID,
		ItemID:             itemID,
		EmployeeUserID:     empID,
		SourceLocationID:   locPtr,
		Quantity:           body.Quantity,
		SerialNumber:       body.SerialNumber,
		RequestType:        body.RequestType,
		Reason:             body.Reason,
		Notes:              body.Notes,
		ConditionGrade:     body.ConditionGrade,
		ExpectedReturnDate: expDate,
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	platformHttp.RespondJSON(w, http.StatusCreated, req, nil)
}

// ListAssetRequests returns pending/all approval queue items.
func (h *Handler) ListAssetRequests(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status == "" {
		status = "PENDING"
	}
	items, err := h.service.ListAssetRequests(r.Context(), orgID, status)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	platformHttp.RespondJSON(w, http.StatusOK, items, map[string]any{"count": len(items)})
}

// GetApprovalPolicy returns the org approval threshold.
func (h *Handler) GetApprovalPolicy(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}
	platformHttp.RespondJSON(w, http.StatusOK, map[string]any{
		"approval_threshold": h.service.GetApprovalThreshold(r.Context(), orgID),
	}, nil)
}

func (h *Handler) decideAssetRequest(w http.ResponseWriter, r *http.Request, approve bool) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}
	role, _ := middleware.GetUserRole(r.Context())
	roleNorm := strings.ToLower(strings.TrimSpace(role))
	if roleNorm != "admin" && roleNorm != "owner" && roleNorm != "superadmin" && roleNorm != "platform_admin" {
		platformHttp.RespondProblem(w, r, http.StatusForbidden, "Forbidden", "Only a company admin can decide approval requests", nil)
		return
	}
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "User context missing", nil)
		return
	}
	requestID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid request id", nil)
		return
	}

	var body decideRequestBody
	_ = json.NewDecoder(r.Body).Decode(&body)

	res, err := h.service.DecideAssetRequest(r.Context(), DecideRequestInput{
		OrgID:         orgID,
		RequestID:     requestID,
		DeciderUserID: userID,
		Approve:       approve,
		DecisionNotes: body.DecisionNotes,
		SignatureData: body.SignatureData,
	})
	if err != nil {
		if errors.Is(err, ErrRequestNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", err.Error(), nil)
			return
		}
		if errors.Is(err, ErrRequestNotPending) {
			platformHttp.RespondProblem(w, r, http.StatusConflict, "Conflict", err.Error(), nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Decision Failed", err.Error(), nil)
		return
	}
	platformHttp.RespondJSON(w, http.StatusOK, res, nil)
}

func (h *Handler) ApproveAssetRequest(w http.ResponseWriter, r *http.Request) {
	h.decideAssetRequest(w, r, true)
}

func (h *Handler) RejectAssetRequest(w http.ResponseWriter, r *http.Request) {
	h.decideAssetRequest(w, r, false)
}
