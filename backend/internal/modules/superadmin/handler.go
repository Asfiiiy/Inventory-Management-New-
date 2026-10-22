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
