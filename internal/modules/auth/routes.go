package auth

import (
	"github.com/go-chi/chi/v5"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/platform/database"
)

// RegisterRoutes mounts the authentication routes under /api/v1/auth.
func RegisterRoutes(r chi.Router, tdb *database.TenantDB) {
	svc := NewService(tdb)
	h := NewHandler(svc)

	r.Route("/api/v1/auth", func(auth chi.Router) {
		// Public authentication endpoints
		auth.Post("/register", h.Register)
		auth.Post("/login", h.Login)

		// Protected user session endpoint
		auth.Group(func(protected chi.Router) {
			protected.Use(middleware.TenantMiddleware)
			protected.Get("/me", h.Me)
		})
	})
}
