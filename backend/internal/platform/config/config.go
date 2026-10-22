package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all validated configuration values for the Whoopit Core backend service.
type Config struct {
	AppEnv      string
	AppPort     string
	DatabaseURL string
	ValkeyAddr  string
	JWTSecret   string

	DBMaxConns        int32
	DBMinConns        int32
	DBMaxConnLifetime time.Duration
	DBMaxConnIdleTime time.Duration
}

// Load reads and validates configuration from environment variables with safe defaults.
func Load() (*Config, error) {
	cfg := &Config{
		AppEnv:      getEnv("APP_ENV", "development"),
		AppPort:     getEnv("APP_PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://whoopit_admin:whoopit_secure_pw_2026@localhost:5432/whoopit_inventory_v4?sslmode=disable"),
		ValkeyAddr:  getEnv("VALKEY_ADDR", "localhost:6379"),
		JWTSecret:   getEnv("JWT_SECRET", "whoopit_jwt_secret_2026_super_secure_auth_token_key_99"),
	}

	maxConns, err := strconv.Atoi(getEnv("DB_MAX_CONNS", "25"))
	if err != nil || maxConns <= 0 {
		return nil, fmt.Errorf("invalid DB_MAX_CONNS: %s", getEnv("DB_MAX_CONNS", "25"))
	}
	cfg.DBMaxConns = int32(maxConns)

	minConns, err := strconv.Atoi(getEnv("DB_MIN_CONNS", "5"))
	if err != nil || minConns < 0 {
		return nil, fmt.Errorf("invalid DB_MIN_CONNS: %s", getEnv("DB_MIN_CONNS", "5"))
	}
	cfg.DBMinConns = int32(minConns)

	maxLifetime, err := time.ParseDuration(getEnv("DB_MAX_CONN_LIFETIME", "1h"))
	if err != nil {
		return nil, fmt.Errorf("invalid DB_MAX_CONN_LIFETIME: %w", err)
	}
	cfg.DBMaxConnLifetime = maxLifetime

	maxIdleTime, err := time.ParseDuration(getEnv("DB_MAX_CONN_IDLE_TIME", "30m"))
	if err != nil {
		return nil, fmt.Errorf("invalid DB_MAX_CONN_IDLE_TIME: %w", err)
	}
	cfg.DBMaxConnIdleTime = maxIdleTime

	// Critical validation in production
	if cfg.AppEnv == "production" {
		if cfg.JWTSecret == "" || cfg.JWTSecret == "whoopit_jwt_secret_2026_super_secure_auth_token_key_99" {
			return nil, fmt.Errorf("JWT_SECRET must be set to a secure custom secret in production")
		}
	}

	return cfg, nil
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}
