package superadmin

import (
	"context"
	"net"
	"net/url"
	"os"
	"strings"
	"time"
)

type ServiceProbe struct {
	OK        bool   `json:"ok"`
	LatencyMS int64  `json:"latency_ms"`
	Detail    string `json:"detail"`
}

type InfrastructureDiagnostics struct {
	Postgres ServiceProbe `json:"postgres"`
	Valkey   ServiceProbe `json:"valkey"`
	Storage  ServiceProbe `json:"storage"`
	SMTP     ServiceProbe `json:"smtp"`
}

// ProbeInfrastructure checks Postgres, Valkey, object storage, and SMTP from this API process.
func (s *Service) ProbeInfrastructure(ctx context.Context) InfrastructureDiagnostics {
	return InfrastructureDiagnostics{
		Postgres: probePostgres(ctx, s),
		Valkey:   probeTCP(envOr("VALKEY_ADDR", "valkey:6379")),
		Storage:  probeTCP(storageAddr()),
		SMTP:     probeTCP(envOr("SMTP_ADDR", "mailpit:1025")),
	}
}

func probePostgres(ctx context.Context, s *Service) ServiceProbe {
	start := time.Now()
	pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	err := s.tdb.Pool().Ping(pingCtx)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return ServiceProbe{OK: false, LatencyMS: elapsed, Detail: err.Error()}
	}
	return ServiceProbe{OK: true, LatencyMS: elapsed, Detail: "connected"}
}

func probeTCP(addr string) ServiceProbe {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return ServiceProbe{OK: false, Detail: "address is not configured"}
	}
	start := time.Now()
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return ServiceProbe{OK: false, LatencyMS: elapsed, Detail: err.Error()}
	}
	_ = conn.Close()
	return ServiceProbe{OK: true, LatencyMS: elapsed, Detail: "tcp open"}
}

func storageAddr() string {
	raw := strings.TrimSpace(os.Getenv("S3_ENDPOINT"))
	if raw == "" {
		raw = "http://storage:9000"
	}
	if !strings.Contains(raw, "://") {
		return raw
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return "storage:9000"
	}
	if parsed.Port() != "" {
		return parsed.Host
	}
	port := "443"
	if parsed.Scheme == "http" {
		port = "9000"
	}
	return net.JoinHostPort(parsed.Hostname(), port)
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
