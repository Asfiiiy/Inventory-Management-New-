package http

import (
	"encoding/json"
	"net/http"
)

// SuccessResponse defines the standard enterprise JSON response envelope.
type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
	Meta    interface{} `json:"meta,omitempty"`
}

// ValidationErrorDetail represents a single field-level validation fault.
type ValidationErrorDetail struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ProblemDetails defines the RFC 7807 problem details specification for HTTP APIs.
type ProblemDetails struct {
	Type     string                  `json:"type"`
	Title    string                  `json:"title"`
	Status   int                     `json:"status"`
	Detail   string                  `json:"detail"`
	Instance string                  `json:"instance,omitempty"`
	Errors   []ValidationErrorDetail `json:"errors,omitempty"`
}

// RespondJSON sends a uniform successful response.
func RespondJSON(w http.ResponseWriter, status int, data interface{}, meta interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(SuccessResponse{
		Success: true,
		Data:    data,
		Meta:    meta,
	})
}

// RespondProblem sends an RFC 7807 problem details error response.
func RespondProblem(w http.ResponseWriter, r *http.Request, status int, title, detail string, errors []ValidationErrorDetail) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)

	instance := ""
	if r != nil {
		instance = r.URL.Path
	}

	problemType := "about:blank"
	if status == http.StatusUnprocessableEntity {
		problemType = "https://whoopit.io/errors/validation-failed"
	} else if status == http.StatusUnauthorized || status == http.StatusForbidden {
		problemType = "https://whoopit.io/errors/unauthorized-tenant"
	} else if status == http.StatusNotFound {
		problemType = "https://whoopit.io/errors/not-found"
	}

	_ = json.NewEncoder(w).Encode(ProblemDetails{
		Type:     problemType,
		Title:    title,
		Status:   status,
		Detail:   detail,
		Instance: instance,
		Errors:   errors,
	})
}
