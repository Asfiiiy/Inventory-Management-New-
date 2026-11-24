package catalog

import (
	"net/http"
	"time"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

type onboardingStatusResponse struct {
	Completed   bool       `json:"completed"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	Steps       []string   `json:"steps"`
}

// GetOnboardingStatus returns whether the tenant finished the first-run wizard.
func (h *Handler) GetOnboardingStatus(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var completedAt *time.Time
	_ = h.db.Pool().QueryRow(r.Context(), `
		SELECT onboarding_completed_at FROM organization_settings WHERE org_id = $1
	`, orgID).Scan(&completedAt)

	platformHttp.RespondJSON(w, http.StatusOK, onboardingStatusResponse{
		Completed:   completedAt != nil,
		CompletedAt: completedAt,
		Steps: []string{
			"Confirm company settings & alert email",
			"Add IT store location (if missing)",
			"Create first hardware SKU",
			"Add a staff member",
			"Issue first device with e-signature",
		},
	}, nil)
}

// CompleteOnboarding marks the first-run wizard as done.
func (h *Handler) CompleteOnboarding(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}
	if !canEditWorkspace(r) {
		platformHttp.RespondProblem(w, r, http.StatusForbidden, "Forbidden", "Only a company admin can complete onboarding", nil)
		return
	}

	_, err := h.db.Pool().Exec(r.Context(), `
		INSERT INTO organization_settings (org_id, allow_negative_stock, currency, time_zone, onboarding_completed_at, updated_at)
		VALUES ($1, false, 'USD', 'UTC', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT (org_id) DO UPDATE SET
			onboarding_completed_at = COALESCE(organization_settings.onboarding_completed_at, CURRENT_TIMESTAMP),
			updated_at = CURRENT_TIMESTAMP
	`, orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	var completedAt time.Time
	_ = h.db.Pool().QueryRow(r.Context(), `
		SELECT onboarding_completed_at FROM organization_settings WHERE org_id = $1
	`, orgID).Scan(&completedAt)

	platformHttp.RespondJSON(w, http.StatusOK, onboardingStatusResponse{
		Completed:   true,
		CompletedAt: &completedAt,
		Steps:       []string{},
	}, nil)
}
