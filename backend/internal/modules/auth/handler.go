package auth

import (
	"encoding/json"
	"errors"
	"net/http"

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
