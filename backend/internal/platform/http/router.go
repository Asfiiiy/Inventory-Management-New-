package http

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// CorsMiddleware enables Cross-Origin Resource Sharing for the web frontend.
func CorsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Tenant-ID, Origin, X-Requested-With")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// SlogLoggerMiddleware logs HTTP requests using standard library structured slog.
func SlogLoggerMiddleware(logger *slog.Logger) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			t1 := time.Now()

			defer func() {
				logger.Info("http_request",
					slog.String("method", r.Method),
					slog.String("path", r.URL.Path),
					slog.String("req_id", middleware.GetReqID(r.Context())),
					slog.String("remote_addr", r.RemoteAddr),
					slog.Int("status", ww.Status()),
					slog.Duration("duration", time.Since(t1)),
				)
			}()

			next.ServeHTTP(ww, r)
		})
	}
}

// NewRouter constructs a configured Chi router with standard enterprise middleware.
func NewRouter(logger *slog.Logger) *chi.Mux {
	r := chi.NewRouter()

	r.Use(SecurityHeadersMiddleware)
	r.Use(MaxBodySizeMiddleware(10 << 20)) // 10MB payload limit to prevent DoS
	r.Use(CorsMiddleware)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	if logger != nil {
		r.Use(SlogLoggerMiddleware(logger))
	}
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// Global rate limiter: 10,000 req/minute per IP
	defaultLimiter := NewIPRateLimiter(10000, time.Minute)
	r.Use(defaultLimiter.Middleware)

	// Root liveness check
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		RespondJSON(w, http.StatusOK, map[string]string{"status": "healthy"}, nil)
	})

	// Swagger & OpenAPI 3.1 documentation
	RegisterSwaggerRoutes(r)

	return r
}

// ReadinessCheckFunc defines a component readiness probe callback.
type ReadinessCheckFunc func(ctx context.Context) (status string, ok bool)

// RegisterReadinessRoute wires the /readyz endpoint with registered health probes.
func RegisterReadinessRoute(r *chi.Mux, probes map[string]ReadinessCheckFunc) {
	r.Get("/readyz", func(w http.ResponseWriter, req *http.Request) {
		allReady := true
		results := make(map[string]string)
		for name, probe := range probes {
			status, ok := probe(req.Context())
			results[name] = status
			if !ok {
				allReady = false
			}
		}

		if !allReady {
			RespondProblem(w, req, http.StatusServiceUnavailable, "System Not Ready", "One or more required subsystem probes failed", nil)
			return
		}

		RespondJSON(w, http.StatusOK, results, nil)
	})
}
