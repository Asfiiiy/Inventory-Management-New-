package test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	platformHttp "whoopit-core/internal/platform/http"
)

func Test_B6_Security_Headers_And_CORS(t *testing.T) {
	router := platformHttp.NewRouter(nil)

	// 1. Test GET /healthz returns all required OWASP security headers
	req := httptest.NewRequest("GET", "/healthz", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	headers := rec.Header()
	if ct := headers.Get("X-Content-Type-Options"); ct != "nosniff" {
		t.Errorf("expected X-Content-Type-Options: nosniff, got %s", ct)
	}
	if fo := headers.Get("X-Frame-Options"); fo != "DENY" {
		t.Errorf("expected X-Frame-Options: DENY, got %s", fo)
	}
	if xss := headers.Get("X-XSS-Protection"); xss != "1; mode=block" {
		t.Errorf("expected X-XSS-Protection: 1; mode=block, got %s", xss)
	}
	if ref := headers.Get("Referrer-Policy"); ref != "strict-origin-when-cross-origin" {
		t.Errorf("expected Referrer-Policy: strict-origin-when-cross-origin, got %s", ref)
	}
	if csp := headers.Get("Content-Security-Policy"); csp == "" {
		t.Errorf("expected Content-Security-Policy header to be set")
	}
	if perm := headers.Get("Permissions-Policy"); perm == "" {
		t.Errorf("expected Permissions-Policy header to be set")
	}

	// 2. Test CORS Preflight
	optReq := httptest.NewRequest("OPTIONS", "/healthz", nil)
	optReq.Header.Set("Origin", "http://localhost:3000")
	optRec := httptest.NewRecorder()
	router.ServeHTTP(optRec, optReq)

	if optRec.Code != http.StatusOK {
		t.Fatalf("expected CORS OPTIONS 200 OK, got %d", optRec.Code)
	}
	if acao := optRec.Header().Get("Access-Control-Allow-Origin"); acao != "http://localhost:3000" {
		t.Errorf("expected Access-Control-Allow-Origin: http://localhost:3000, got %s", acao)
	}
	if creds := optRec.Header().Get("Access-Control-Allow-Credentials"); creds != "true" {
		t.Errorf("expected Access-Control-Allow-Credentials: true, got %s", creds)
	}

	t.Log("PASS: OWASP Security Headers and CORS Preflight verified.")
}

func Test_B6_Rate_Limiting_Middleware(t *testing.T) {
	// Create isolated router with strict rate limiter: 3 requests per 5 seconds
	r := chi.NewRouter()
	limiter := platformHttp.NewIPRateLimiter(3, 5*time.Second)
	r.Use(limiter.Middleware)

	r.Get("/test-limit", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	clientIP := "192.168.1.100:12345"

	// First 3 requests must succeed
	for i := 1; i <= 3; i++ {
		req := httptest.NewRequest("GET", "/test-limit", nil)
		req.RemoteAddr = clientIP
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("request %d expected status 200, got %d", i, rec.Code)
		}
		rem := rec.Header().Get("X-RateLimit-Remaining")
		if rem == "" {
			t.Errorf("request %d missing X-RateLimit-Remaining header", i)
		}
	}

	// 4th request must be rejected with 429 Too Many Requests
	req := httptest.NewRequest("GET", "/test-limit", nil)
	req.RemoteAddr = clientIP
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 4th request to return 429 Too Many Requests, got %d", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Errorf("expected Retry-After header on 429 response")
	}

	var prob platformHttp.ProblemDetails
	if err := json.NewDecoder(rec.Body).Decode(&prob); err != nil {
		t.Fatalf("failed to decode 429 RFC 7807 problem details: %v", err)
	}
	if prob.Status != http.StatusTooManyRequests {
		t.Errorf("expected problem status 429, got %d", prob.Status)
	}

	t.Log("PASS: Rate limiting and 429 Too Many Requests enforcement verified.")
}

func Test_B6_Readiness_Probes(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	r := platformHttp.NewRouter(nil)
	platformHttp.RegisterReadinessRoute(r, map[string]platformHttp.ReadinessCheckFunc{
		"postgres": func(ctx context.Context) (string, bool) {
			if err := pool.Ping(ctx); err != nil {
				return err.Error(), false
			}
			return "connected", true
		},
		"cache": func(ctx context.Context) (string, bool) {
			return "ready", true
		},
	})

	// Test healthy state
	req := httptest.NewRequest("GET", "/readyz", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected /readyz status 200, got %d", rec.Code)
	}

	var resp platformHttp.SuccessResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to parse /readyz response: %v", err)
	}
	if !resp.Success {
		t.Errorf("expected success true")
	}

	// Test degraded probe
	rDegraded := platformHttp.NewRouter(nil)
	platformHttp.RegisterReadinessRoute(rDegraded, map[string]platformHttp.ReadinessCheckFunc{
		"postgres": func(ctx context.Context) (string, bool) {
			return "connection refused", false
		},
	})

	degReq := httptest.NewRequest("GET", "/readyz", nil)
	degRec := httptest.NewRecorder()
	rDegraded.ServeHTTP(degRec, degReq)

	if degRec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected degraded probe to return 503, got %d", degRec.Code)
	}

	t.Log("PASS: Kubernetes /readyz readiness probes and 503 failover verified.")
}

func Test_B6_Max_Body_Size_Limiter(t *testing.T) {
	r := chi.NewRouter()
	r.Use(platformHttp.MaxBodySizeMiddleware(512)) // 512 bytes limit

	r.Post("/upload", func(w http.ResponseWriter, req *http.Request) {
		body, err := io.ReadAll(req.Body)
		if err != nil {
			http.Error(w, "request entity too large", http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})

	// Payload within limit (100 bytes) -> succeed
	smallData := bytes.Repeat([]byte("a"), 100)
	reqSmall := httptest.NewRequest("POST", "/upload", bytes.NewReader(smallData))
	recSmall := httptest.NewRecorder()
	r.ServeHTTP(recSmall, reqSmall)
	if recSmall.Code != http.StatusOK {
		t.Errorf("expected small payload status 200, got %d", recSmall.Code)
	}

	// Payload exceeding limit (1024 bytes) -> fail with 413
	largeData := bytes.Repeat([]byte("a"), 1024)
	reqLarge := httptest.NewRequest("POST", "/upload", bytes.NewReader(largeData))
	recLarge := httptest.NewRecorder()
	r.ServeHTTP(recLarge, reqLarge)
	if recLarge.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("expected oversized payload status 413, got %d", recLarge.Code)
	}

	t.Log("PASS: Maximum request body size limiter verified.")
}
