package superadmin

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	platformHttp "whoopit-core/internal/platform/http"
)

type Handler struct {
	service *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{service: svc}
}

// ListOrganizations returns all registered client companies.
func (h *Handler) ListOrganizations(w http.ResponseWriter, r *http.Request) {
	list, err := h.service.ListOrganizations(r.Context())
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, list, map[string]interface{}{
		"count": len(list),
	})
}

// GetDiagnostics probes Postgres, Valkey, storage, and SMTP from the API process.
func (h *Handler) GetDiagnostics(w http.ResponseWriter, r *http.Request) {
	platformHttp.RespondJSON(w, http.StatusOK, h.service.ProbeInfrastructure(r.Context()), nil)
}

// GetTelemetry returns aggregate SaaS platform metrics across all client companies.
func (h *Handler) GetTelemetry(w http.ResponseWriter, r *http.Request) {
	telem, err := h.service.GetTelemetry(r.Context())
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, telem, nil)
}

// ProvisionOrganization onboard a new client company with initial warehouse and admin user.
func (h *Handler) ProvisionOrganization(w http.ResponseWriter, r *http.Request) {
	var in ProvisionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	res, err := h.service.ProvisionOrganization(r.Context(), in)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Provisioning Failed", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, res, nil)
}

type UpdateOrgRequest struct {
	Name string `json:"name,omitempty"`
	Plan string `json:"plan,omitempty"`
}

// UpdateOrganization modifies plan or details of an organization.
func (h *Handler) UpdateOrganization(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	orgID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid organization UUID", nil)
		return
	}

	var req UpdateOrgRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	if err := h.service.UpdateOrganization(r.Context(), orgID, req.Name, req.Plan); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"updated": true,
		"org_id":  orgID,
	}, nil)
}

type ExtendTrialRequest struct {
	Days int `json:"days,omitempty"`
}

// ExtendTrial grants an extension to an organization's trial evaluation period.
func (h *Handler) ExtendTrial(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	orgID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid organization UUID", nil)
		return
	}

	var req ExtendTrialRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	days := req.Days
	if days <= 0 {
		days = 14
	}

	if err := h.service.ExtendTrial(r.Context(), orgID, days); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"extended": true,
		"org_id":   orgID,
		"days":     days,
	}, nil)
}

// ListUsers returns all users registered across client workspaces.
func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.service.ListUsers(r.Context())
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, users, map[string]interface{}{
		"count": len(users),
	})
}

// ListAuditLogs returns global audit trail entries.
func (h *Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := h.service.ListAuditLogs(r.Context(), 100)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, logs, map[string]interface{}{
		"count": len(logs),
	})
}

// GetOrgActivity returns activity and audit logs for a specific organization.
func (h *Handler) GetOrgActivity(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	orgID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid organization UUID", nil)
		return
	}

	activity, err := h.service.GetOrgActivity(r.Context(), orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, activity, map[string]interface{}{
		"count": len(activity),
	})
}
