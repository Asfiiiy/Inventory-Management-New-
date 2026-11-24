package custody

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
	"whoopit-core/internal/platform/mail"
)

type Handler struct {
	service *AssetCustodyService
}

func NewHandler(svc *AssetCustodyService) *Handler {
	return &Handler{service: svc}
}

type CheckOutRequest struct {
	AssetID            string  `json:"asset_id"`
	EmployeeUserID     string  `json:"employee_user_id"`
	SourceLocationID   string  `json:"source_location_id"`
	ExpectedReturnDate string  `json:"expected_return_date,omitempty"`
	ConditionGrade     string  `json:"condition_grade,omitempty"`
	Quantity           float64 `json:"quantity,omitempty"`
	EmployeeCode       string  `json:"employee_code,omitempty"`
	EmployeeName       string  `json:"employee_name,omitempty"`
	EmployeeDepartment string  `json:"employee_department,omitempty"`
	EmployeeEmail      string  `json:"employee_email,omitempty"`
	SerialNumber       string  `json:"serial_number,omitempty"`
	SignatureData      string  `json:"signature_data,omitempty"`
	Notes              string  `json:"notes,omitempty"`
	AdminOverride      bool    `json:"admin_override,omitempty"`
}

// CheckOut assigns an IT asset to an employee with Employee ID & Digital Signature.
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

	role, _ := middleware.GetUserRole(r.Context())
	userID, _ := middleware.GetUserID(r.Context())
	qty := req.Quantity
	if qty <= 0 {
		qty = 1
	}
	unitCost, _, _, _ := h.service.itemUnitCost(r.Context(), orgID, assetID)
	threshold := h.service.GetApprovalThreshold(r.Context(), orgID)
	est := unitCost * qty
	isAdmin := middleware.IsCompanyAdmin(role)

	// Staff cannot direct-issue — always queue. Admins queue high-value unless override.
	needsQueue := !isAdmin || (threshold > 0 && est >= threshold && !req.AdminOverride)
	if needsQueue {
		if userID == uuid.Nil {
			platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "User context missing", nil)
			return
		}
		pending, qErr := h.service.CreateAssetRequest(r.Context(), CreateRequestInput{
			OrgID:              orgID,
			RequesterUserID:    userID,
			ItemID:             assetID,
			EmployeeUserID:     empID,
			SourceLocationID:   &srcLocID,
			Quantity:           qty,
			SerialNumber:       req.SerialNumber,
			RequestType:        "CHECKOUT",
			Reason:             fmt.Sprintf("Requires approval (est. $%.0f, threshold $%.0f)", est, threshold),
			Notes:              req.Notes,
			ConditionGrade:     req.ConditionGrade,
			ExpectedReturnDate: expDate,
		})
		if qErr != nil {
			platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", qErr.Error(), nil)
			return
		}
		platformHttp.RespondJSON(w, http.StatusAccepted, map[string]any{
			"pending_approval": true,
			"request":          pending,
			"threshold":        threshold,
			"estimated_value":  est,
			"message":          "Issue queued for admin approval because of role or high asset value.",
		}, nil)
		return
	}

	input := CheckOutInput{
		OrgID:              orgID,
		AssetID:            assetID,
		EmployeeUserID:     empID,
		SourceLocationID:   srcLocID,
		ExpectedReturnDate: expDate,
		ConditionGrade:     req.ConditionGrade,
		Quantity:           req.Quantity,
		EmployeeCode:       req.EmployeeCode,
		EmployeeName:       req.EmployeeName,
		EmployeeDepartment: req.EmployeeDepartment,
		EmployeeEmail:      req.EmployeeEmail,
		SerialNumber:       req.SerialNumber,
		SignatureData:      req.SignatureData,
		Notes:              req.Notes,
	}

	res, err := h.service.CheckOut(r.Context(), input)
	if err != nil {
		if errors.Is(err, ErrAssetAlreadyAssigned) {
			platformHttp.RespondProblem(
				w, r, http.StatusConflict,
				"Asset Deployment Conflict",
				"This specific asset or serial number is already assigned to another employee",
				[]platformHttp.ValidationErrorDetail{
					{Field: "asset_id", Message: "active assignment exists for this serial/asset"},
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

	if res != nil && strings.Contains(res.Assignment.EmployeeEmail, "@") {
		loginURL := mail.PublicAppURL() + "/my-assets"
		html := fmt.Sprintf(`
			<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;color:#0f172a">
			  <h2 style="color:#0c3843">Hardware issued to you</h2>
			  <p>Hello %s,</p>
			  <p><strong>%s</strong> (%s) was issued to you.</p>
			  <ul>
			    <li>Serial: %s</li>
			    <li>Issued: %s</li>
			  </ul>
			  <p>View your devices: <a href="%s">%s</a></p>
			</div>`,
			res.Assignment.EmployeeName,
			res.Assignment.AssetName,
			res.Assignment.AssetSku,
			func() string {
				if strings.TrimSpace(res.Assignment.SerialNumber) == "" {
					return "Not recorded"
				}
				return res.Assignment.SerialNumber
			}(),
			res.Assignment.CheckoutDate.Format("02 Jan 2006 15:04"),
			loginURL, loginURL,
		)
		text := fmt.Sprintf("Hardware issued: %s (%s)\nSerial: %s\nSee %s\n",
			res.Assignment.AssetName, res.Assignment.AssetSku, res.Assignment.SerialNumber, loginURL)
		_, _ = mail.Send(res.Assignment.EmployeeEmail, "Hardware issued: "+res.Assignment.AssetName, html, text)
	}

	platformHttp.RespondJSON(w, http.StatusCreated, res, nil)
}

type CheckInRequest struct {
	AssignmentID       string `json:"assignment_id"`
	ReturnToLocationID string `json:"return_to_location_id"`
	ConditionGrade     string `json:"condition_grade,omitempty"`
	Notes              string `json:"notes,omitempty"`
	ReturnCondition    string `json:"return_condition,omitempty"`
	IssueDescription   string `json:"issue_description,omitempty"`
	VendorName         string `json:"vendor_name,omitempty"`
}

// CheckIn returns an asset from custody back to physical storage or marks it Faulty/Under Repair.
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
		ReturnCondition:    req.ReturnCondition,
		IssueDescription:   req.IssueDescription,
		VendorName:         req.VendorName,
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

// ListAllAssignments retrieves all active and historical custody assignments for the organization.
func (h *Handler) ListAllAssignments(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	items, err := h.service.ListAllAssignments(r.Context(), orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, items, map[string]interface{}{"count": len(items)})
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
