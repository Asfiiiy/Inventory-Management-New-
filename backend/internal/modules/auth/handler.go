package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	platformAuth "whoopit-core/internal/platform/auth"
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
	// SaaS model: companies are provisioned by platform SuperAdmin only ("Give Software").
	platformHttp.RespondProblem(
		w, r, http.StatusForbidden,
		"Self-registration disabled",
		"New company workspaces are created by the platform administrator. Ask Whoopit support or your SuperAdmin to provision access.",
		nil,
	)
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
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "trial has ended") || strings.Contains(lower, "billing hold") {
			platformHttp.RespondProblem(w, r, http.StatusForbidden, "License Inactive", err.Error(), nil)
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
	sessionID := r.Header.Get("X-Session-ID")
	if sessionID != "" {
		_ = h.service.Logout(r.Context(), sessionID)
	}
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if claims, err := platformAuth.ParseToken(tokenStr); err == nil && claims != nil {
			_ = h.service.LogoutUser(r.Context(), claims.UserID)
		}
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
	// Always return the same message (no email enumeration). Real reset mail is sent when the account exists.
	_ = h.service.ForgotPassword(r.Context(), req.Email)
	platformHttp.RespondJSON(w, http.StatusOK, map[string]string{
		"message": "If this email exists in the system, a temporary password has been sent.",
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
	Email          string `json:"email"`
	Password       string `json:"password"`
	Name           string `json:"name"`
	Role           string `json:"role"`
	EmployeeCode   string `json:"employee_code"`
	Department     string `json:"department"`
	DeskLocation   string `json:"desk_location"`
	SendInviteMail *bool  `json:"send_invite_mail"`
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Missing Tenant", "Tenant context required", nil)
		return
	}
	role, _ := middleware.GetUserRole(r.Context())
	if !middleware.IsCompanyAdmin(role) {
		platformHttp.RespondProblem(w, r, http.StatusForbidden, "Forbidden", "Only a company admin can create users", nil)
		return
	}

	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON payload", nil)
		return
	}

	sendMail := true
	if req.SendInviteMail != nil {
		sendMail = *req.SendInviteMail
	}

	user, err := h.service.CreateUser(r.Context(), orgID, CreateUserInput{
		Email:          req.Email,
		Password:       req.Password,
		Name:           req.Name,
		Role:           req.Role,
		EmployeeCode:   req.EmployeeCode,
		Department:     req.Department,
		DeskLocation:   req.DeskLocation,
		SendInviteMail: sendMail,
	})
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
	Role           string  `json:"role"`
	Name           string  `json:"name"`
	Email          string  `json:"email"`
	IsActive       bool    `json:"is_active"`
	EmployeeCode   *string `json:"employee_code"`
	Department     *string `json:"department"`
	DeskLocation   *string `json:"desk_location"`
}

func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Missing Tenant", "Tenant context required", nil)
		return
	}
	role, _ := middleware.GetUserRole(r.Context())
	if !middleware.IsCompanyAdmin(role) {
		platformHttp.RespondProblem(w, r, http.StatusForbidden, "Forbidden", "Only a company admin can update users", nil)
		return
	}

	targetIDStr := chi.URLParam(r, "id")
	if targetIDStr == "" {
		targetIDStr = r.PathValue("id")
	}
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

	user, err := h.service.UpdateUser(r.Context(), orgID, targetID, UpdateUserInput{
		Role:         req.Role,
		Name:         req.Name,
		Email:        req.Email,
		IsActive:     req.IsActive,
		EmployeeCode: req.EmployeeCode,
		Department:   req.Department,
		DeskLocation: req.DeskLocation,
	})
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "User not found", nil)
			return
		}
		if errors.Is(err, ErrEmailExists) {
			platformHttp.RespondProblem(w, r, http.StatusConflict, "Email Conflict", err.Error(), nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, user, nil)
}
