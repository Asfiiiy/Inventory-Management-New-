package http

import (
	"net/http"
)

// SecurityHeadersMiddleware injects enterprise OWASP-recommended HTTP security headers into every response.
func SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Prevent MIME-sniffing
		w.Header().Set("X-Content-Type-Options", "nosniff")

		// Prevent clickjacking via iframes
		w.Header().Set("X-Frame-Options", "DENY")

		// Cross-Site Scripting Protection
		w.Header().Set("X-XSS-Protection", "1; mode=block")

		// Referrer privacy
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Content Security Policy for API & Web
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' *")

		// Restrict device hardware API capabilities
		w.Header().Set("Permissions-Policy", "geolocation=(), camera=(), microphone=()")

		next.ServeHTTP(w, r)
	})
}

// MaxBodySizeMiddleware limits incoming request body payload to prevent denial-of-service via huge payloads.
func MaxBodySizeMiddleware(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil && maxBytes > 0 {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}
