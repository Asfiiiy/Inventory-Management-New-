package http

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ipBucket struct {
	tokens  int
	resetAt time.Time
}

// IPRateLimiter provides sliding-window / fixed-interval rate limiting per IP address.
type IPRateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	ips    map[string]*ipBucket
}

// NewIPRateLimiter creates a new rate limiter with the specified limit and time window.
func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
	limiter := &IPRateLimiter{
		limit:  limit,
		window: window,
		ips:    make(map[string]*ipBucket),
	}

	// Periodically clean up expired entries every 2 minutes
	go limiter.cleanupRoutine()
	return limiter
}

func (l *IPRateLimiter) cleanupRoutine() {
	ticker := time.NewTicker(2 * time.Minute)
	for range ticker.C {
		l.mu.Lock()
		now := time.Now()
		for ip, b := range l.ips {
			if now.After(b.resetAt) {
				delete(l.ips, ip)
			}
		}
		l.mu.Unlock()
	}
}

// ExtractIP retrieves the effective client IP, checking X-Forwarded-For and RemoteAddr.
func ExtractIP(r *http.Request) string {
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

// Middleware returns an HTTP handler that enforces rate limiting.
func (l *IPRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := ExtractIP(r)
		now := time.Now()

		l.mu.Lock()
		bucket, exists := l.ips[ip]
		if !exists || now.After(bucket.resetAt) {
			bucket = &ipBucket{
				tokens:  1,
				resetAt: now.Add(l.window),
			}
			l.ips[ip] = bucket
		} else {
			bucket.tokens++
		}

		currentCount := bucket.tokens
		resetSeconds := int(time.Until(bucket.resetAt).Seconds())
		if resetSeconds < 0 {
			resetSeconds = 0
		}
		remaining := l.limit - currentCount
		if remaining < 0 {
			remaining = 0
		}
		l.mu.Unlock()

		// Populate standard rate limit response headers
		w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", l.limit))
		w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
		w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetSeconds))

		if currentCount > l.limit {
			w.Header().Set("Retry-After", fmt.Sprintf("%d", resetSeconds))
			RespondProblem(w, r, http.StatusTooManyRequests, "Rate Limit Exceeded", "Too many requests. Please retry after cooldown period.", nil)
			return
		}

		next.ServeHTTP(w, r)
	})
}
