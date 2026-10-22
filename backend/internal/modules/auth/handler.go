package auth

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

type Handler struct {
	service *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{service: svc}
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name,omitempty"`
	OrgName  string `json:"org_name,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON payload", nil)
		return
	}

	res, err := h.service.Register(r.Context(), req.Email, req.Password, req.Name, req.OrgName)
	if err != nil {
		if errors.Is(err, ErrEmailExists) {
			platformHttp.RespondProblem(w, r, http.StatusConflict, "Email Conflict", err.Error(), nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Registration Failed", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, res, nil)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON payload", nil)
		return
	}

	res, err := h.service.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) || errors.Is(err, ErrUserInactive) {
			platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", err.Error(), nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, res, nil)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		// Fallback check claims directly if present
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "User authentication required", nil)
		return
	}

	profile, err := h.service.GetUserProfile(r.Context(), userID)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "User Not Found", "Profile could not be found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, profile, nil)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	// If a session token/header is provided, revoke it
	sessionID := r.Header.Get("X-Session-ID")
	if sessionID != "" {
		_ = h.service.Logout(r.Context(), sessionID)
	}
	platformHttp.RespondJSON(w, http.StatusOK, map[string]string{"message": "logged out successfully"}, nil)
}

func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON payload", nil)
		return
	}
	// Per Phase B2: forgot-password email simulation
	platformHttp.RespondJSON(w, http.StatusOK, map[string]string{
		"message": "If this email exists in the system, password reset instructions have been dispatched.",
	}, nil)
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Missing Tenant", "Tenant context required", nil)
		return
	}

	users, err := h.service.ListUsers(r.Context(), orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, users, nil)
}

type CreateUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Role     string `json:"role"`
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Missing Tenant", "Tenant context required", nil)
		return
	}

	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON payload", nil)
		return
	}

	user, err := h.service.CreateUser(r.Context(), orgID, req.Email, req.Password, req.Name, req.Role)
	if err != nil {
		if errors.Is(err, ErrEmailExists) {
			platformHttp.RespondProblem(w, r, http.StatusConflict, "Email Conflict", err.Error(), nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Failed to Create User", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, user, nil)
}

type UpdateUserRequest struct {
	Role     string `json:"role"`
	IsActive bool   `json:"is_active"`
}

func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Missing Tenant", "Tenant context required", nil)
		return
	}

	targetIDStr := r.PathValue("id")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid ID", "Invalid user ID parameter", nil)
		return
	}

	var req UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON payload", nil)
		return
	}

	user, err := h.service.UpdateUser(r.Context(), orgID, targetID, req.Role, req.IsActive)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "User not found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, user, nil)
}
