package custody

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

type Handler struct {
	service *AssetCustodyService
}

func NewHandler(svc *AssetCustodyService) *Handler {
	return &Handler{service: svc}
}

type CheckOutRequest struct {
	AssetID            string `json:"asset_id"`
	EmployeeUserID     string `json:"employee_user_id"`
	SourceLocationID   string `json:"source_location_id"`
	ExpectedReturnDate string `json:"expected_return_date,omitempty"`
	ConditionGrade     string `json:"condition_grade,omitempty"`
}

// CheckOut assigns an IT asset to an employee and records double-entry movement.
func (h *Handler) CheckOut(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CheckOutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	assetID, err := uuid.Parse(req.AssetID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid asset_id", []platformHttp.ValidationErrorDetail{
			{Field: "asset_id", Message: "must be a valid UUID"},
		})
		return
	}

	empID, err := uuid.Parse(req.EmployeeUserID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid employee_user_id", []platformHttp.ValidationErrorDetail{
			{Field: "employee_user_id", Message: "must be a valid UUID"},
		})
		return
	}

	srcLocID, err := uuid.Parse(req.SourceLocationID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid source_location_id", []platformHttp.ValidationErrorDetail{
			{Field: "source_location_id", Message: "must be a valid UUID"},
		})
		return
	}

	var expDate *time.Time
	if req.ExpectedReturnDate != "" {
		parsedDate, parseErr := time.Parse(time.RFC3339, req.ExpectedReturnDate)
		if parseErr == nil {
			expDate = &parsedDate
		}
	}

	input := CheckOutInput{
		OrgID:              orgID,
		AssetID:            assetID,
		EmployeeUserID:     empID,
		SourceLocationID:   srcLocID,
		ExpectedReturnDate: expDate,
		ConditionGrade:     req.ConditionGrade,
	}

	res, err := h.service.CheckOut(r.Context(), input)
	if err != nil {
		if errors.Is(err, ErrAssetAlreadyAssigned) {
			platformHttp.RespondProblem(
				w, r, http.StatusConflict,
				"Asset Deployment Conflict",
				"Asset is already assigned to another employee",
				[]platformHttp.ValidationErrorDetail{
					{Field: "asset_id", Message: "active assignment exists for this asset"},
				},
			)
			return
		}
		if errors.Is(err, ErrAssetNotSerialized) {
			platformHttp.RespondProblem(
				w, r, http.StatusUnprocessableEntity,
				"Invalid Asset Type",
				err.Error(),
				nil,
			)
			return
		}

		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, res, nil)
}

type CheckInRequest struct {
	AssignmentID       string `json:"assignment_id"`
	ReturnToLocationID string `json:"return_to_location_id"`
	ConditionGrade     string `json:"condition_grade,omitempty"`
	Notes              string `json:"notes,omitempty"`
}

// CheckIn returns an asset from custody back to physical storage.
func (h *Handler) CheckIn(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CheckInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	assignmentID, err := uuid.Parse(req.AssignmentID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid assignment_id", []platformHttp.ValidationErrorDetail{
			{Field: "assignment_id", Message: "must be a valid UUID"},
		})
		return
	}

	retLocID, err := uuid.Parse(req.ReturnToLocationID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid return_to_location_id", []platformHttp.ValidationErrorDetail{
			{Field: "return_to_location_id", Message: "must be a valid UUID"},
		})
		return
	}

	input := CheckInInput{
		OrgID:              orgID,
		AssignmentID:       assignmentID,
		ReturnToLocationID: retLocID,
		ConditionGrade:     req.ConditionGrade,
		Notes:              req.Notes,
	}

	res, err := h.service.CheckIn(r.Context(), input)
	if err != nil {
		if errors.Is(err, ErrAssignmentNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", err.Error(), nil)
			return
		}
		if errors.Is(err, ErrAssignmentAlreadyClosed) {
			platformHttp.RespondProblem(w, r, http.StatusConflict, "Conflict", err.Error(), nil)
			return
		}

		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, res, nil)
}

// ListEmployeeCustody retrieves all active hardware assets deployed to an employee.
func (h *Handler) ListEmployeeCustody(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	userIDStr := chi.URLParam(r, "user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid user_id parameter", nil)
		return
	}

	items, err := h.service.ListEmployeeCustody(r.Context(), orgID, userID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, items, map[string]interface{}{"count": len(items)})
}

// GetCustodySummary retrieves aggregate asset counts for the organization.
func (h *Handler) GetCustodySummary(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	summary, err := h.service.GetCustodySummary(r.Context(), orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, summary, nil)
}

// GetHandoverCertificate retrieves and verifies the cryptographic evidence certificate for an assignment.
func (h *Handler) GetHandoverCertificate(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	assignmentIDStr := chi.URLParam(r, "id")
	assignmentID, err := uuid.Parse(assignmentIDStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid assignment id parameter", nil)
		return
	}

	res, err := h.service.GetHandoverCertificate(r.Context(), orgID, assignmentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, ErrAssignmentNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Handover certificate or assignment not found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, res, nil)
}
