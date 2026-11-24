package catalog

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/platform/db"
	platformHttp "whoopit-core/internal/platform/http"
)

type workspaceSettingsResponse struct {
	OrgID              string  `json:"org_id"`
	Name               string  `json:"name"`
	Plan               string  `json:"plan"`
	Currency           string  `json:"currency"`
	TimeZone           string  `json:"time_zone"`
	AlertEmail         string  `json:"alert_email"`
	AllowNegativeStock bool    `json:"allow_negative_stock"`
	ApprovalThreshold  float64 `json:"approval_threshold"`
}

type updateWorkspaceRequest struct {
	Name               string   `json:"name"`
	Currency           string   `json:"currency"`
	TimeZone           string   `json:"time_zone"`
	AlertEmail         string   `json:"alert_email"`
	AllowNegativeStock *bool    `json:"allow_negative_stock"`
	ApprovalThreshold  *float64 `json:"approval_threshold,omitempty"`
}

func (h *Handler) GetWorkspaceSettings(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	resp := workspaceSettingsResponse{
		OrgID:    orgID.String(),
		Currency: "USD",
		TimeZone: "UTC",
	}
	err := h.db.Pool().QueryRow(r.Context(), `
		SELECT name, COALESCE(plan, '')
		FROM organizations
		WHERE org_id = $1
	`, orgID).Scan(&resp.Name, &resp.Plan)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Company not found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	resp.ApprovalThreshold = 500
	err = h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		row, err := q.GetOrganizationSettings(r.Context(), orgID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			return err
		}
		resp.Currency = row.Currency
		resp.TimeZone = row.TimeZone
		resp.AlertEmail = row.AlertEmail.String
		resp.AllowNegativeStock = row.AllowNegativeStock
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	_ = h.db.Pool().QueryRow(r.Context(), `
		SELECT COALESCE(approval_threshold, 500)::float8 FROM organization_settings WHERE org_id = $1
	`, orgID).Scan(&resp.ApprovalThreshold)

	platformHttp.RespondJSON(w, http.StatusOK, resp, nil)
}

func (h *Handler) UpdateWorkspaceSettings(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}
	if !canEditWorkspace(r) {
		platformHttp.RespondProblem(w, r, http.StatusForbidden, "Forbidden", "Only a company admin can change workspace settings", nil)
		return
	}

	var req updateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Validation Error", "company name is required", nil)
		return
	}
	if len(name) > 120 {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Validation Error", "company name is too long", nil)
		return
	}

	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "USD"
	}
	if len(currency) < 3 || len(currency) > 8 {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Validation Error", "currency must be a 3 to 8 letter code", nil)
		return
	}

	timeZone := strings.TrimSpace(req.TimeZone)
	if timeZone == "" {
		timeZone = "UTC"
	}
	if len(timeZone) > 64 || strings.ContainsAny(timeZone, " \t") {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Validation Error", "time zone is not valid", nil)
		return
	}

	alertEmail := strings.TrimSpace(req.AlertEmail)
	if alertEmail != "" && !strings.Contains(alertEmail, "@") {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Validation Error", "alert email is not valid", nil)
		return
	}

	tag, err := h.db.Pool().Exec(r.Context(), `
		UPDATE organizations
		SET name = $2
		WHERE org_id = $1
	`, orgID, name)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	if tag.RowsAffected() == 0 {
		platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Company not found", nil)
		return
	}

	var saved db.OrganizationSetting
	err = h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		allowNegative := false
		existing, err := q.GetOrganizationSettings(r.Context(), orgID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err == nil {
			allowNegative = existing.AllowNegativeStock
		}
		if req.AllowNegativeStock != nil {
			allowNegative = *req.AllowNegativeStock
		}

		saved, err = q.UpsertOrganizationSettings(r.Context(), db.UpsertOrganizationSettingsParams{
			OrgID:              orgID,
			AllowNegativeStock: allowNegative,
			Currency:           currency,
			TimeZone:           timeZone,
			AlertEmail:         pgtype.Text{String: alertEmail, Valid: alertEmail != ""},
		})
		return err
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	threshold := 500.0
	if req.ApprovalThreshold != nil && *req.ApprovalThreshold >= 0 {
		threshold = *req.ApprovalThreshold
		_, _ = h.db.Pool().Exec(r.Context(), `
			UPDATE organization_settings SET approval_threshold = $2, updated_at = CURRENT_TIMESTAMP WHERE org_id = $1
		`, orgID, threshold)
	} else {
		_ = h.db.Pool().QueryRow(r.Context(), `
			SELECT COALESCE(approval_threshold, 500)::float8 FROM organization_settings WHERE org_id = $1
		`, orgID).Scan(&threshold)
	}

	var plan string
	_ = h.db.Pool().QueryRow(r.Context(), `SELECT COALESCE(plan, '') FROM organizations WHERE org_id = $1`, orgID).Scan(&plan)

	platformHttp.RespondJSON(w, http.StatusOK, workspaceSettingsResponse{
		OrgID:              orgID.String(),
		Name:               name,
		Plan:               plan,
		Currency:           saved.Currency,
		TimeZone:           saved.TimeZone,
		AlertEmail:         saved.AlertEmail.String,
		AllowNegativeStock: saved.AllowNegativeStock,
		ApprovalThreshold:  threshold,
	}, nil)
}

func canEditWorkspace(r *http.Request) bool {
	role, ok := middleware.GetUserRole(r.Context())
	if !ok {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "owner", "admin", "manager", "superadmin", "platform_admin":
		return true
	default:
		return false
	}
}
