package config

import (
	"os"
	"testing"
)

func TestConfig_Load_Defaults(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error loading config with defaults: %v", err)
	}

	if cfg.AppPort != "8080" && os.Getenv("APP_PORT") == "" {
		t.Errorf("expected default port 8080, got %s", cfg.AppPort)
	}
	if cfg.DBMaxConns != 25 {
		t.Errorf("expected default DBMaxConns 25, got %d", cfg.DBMaxConns)
	}
	if cfg.DBMinConns != 5 {
		t.Errorf("expected default DBMinConns 5, got %d", cfg.DBMinConns)
	}
}

func TestConfig_Load_InvalidConns(t *testing.T) {
	os.Setenv("DB_MAX_CONNS", "invalid_number")
	defer os.Unsetenv("DB_MAX_CONNS")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for invalid DB_MAX_CONNS, got nil")
	}
}
