package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"whoopit-core/internal/modules/auth"
	"whoopit-core/internal/modules/catalog"
	"whoopit-core/internal/modules/custody"
	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/modules/profiles"
	"whoopit-core/internal/modules/retail"
	"whoopit-core/internal/modules/superadmin"
	"whoopit-core/internal/modules/warehouse"
	"whoopit-core/internal/platform/cache"
	"whoopit-core/internal/platform/config"
	"whoopit-core/internal/platform/database"
	platformHttp "whoopit-core/internal/platform/http"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// 1. Load & validate environment configuration at startup
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration validation failed", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("configuration loaded successfully",
		slog.String("env", cfg.AppEnv),
		slog.String("port", cfg.AppPort),
		slog.Int("db_max_conns", int(cfg.DBMaxConns)),
	)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 2. Initialize PostgreSQL connection pool
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to parse database configuration", slog.Any("error", err))
		os.Exit(1)
	}
	poolConfig.MaxConns = cfg.DBMaxConns
	poolConfig.MinConns = cfg.DBMinConns
	poolConfig.MaxConnLifetime = cfg.DBMaxConnLifetime
	poolConfig.MaxConnIdleTime = cfg.DBMaxConnIdleTime

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		logger.Error("failed to connect to database pool", slog.Any("error", err))
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Error("database ping check failed", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("connected to PostgreSQL 18 with RLS enabled")

	// 2. Initialize Core Platform Components
	tenantDB := database.NewTenantDB(pool)
	moveSvc := inventory.NewStockMovementService(tenantDB)

	valkeyClient, err := cache.NewValkeyClient(cfg.ValkeyAddr)
	if err != nil {
		logger.Warn("valkey cache connection unavailable, continuing without cache", slog.Any("error", err))
	} else {
		defer valkeyClient.Close()
		logger.Info("connected to Valkey 9 cache", slog.String("addr", cfg.ValkeyAddr))
	}

	schemaValidator, err := profiles.NewSchemaValidator()
	if err != nil {
		logger.Error("failed to compile industry profile schemas", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("compiled Draft 2020-12 industry profiles (office_it, warehouse, retail, factory)")

	// 3. Setup Chi Router & Register Handlers
	router := platformHttp.NewRouter(logger)
	auth.RegisterRoutes(router, tenantDB)
	catalog.RegisterRoutes(router, tenantDB, schemaValidator)
	inventory.RegisterRoutes(router, tenantDB)
	custody.RegisterRoutes(router, tenantDB, moveSvc, valkeyClient)
	warehouse.RegisterRoutes(router, tenantDB, moveSvc)
	retail.RegisterRoutes(router, tenantDB, moveSvc)
	superadmin.RegisterRoutes(router, tenantDB)

	// Readiness probes for Kubernetes / Docker orchestrators
	platformHttp.RegisterReadinessRoute(router, map[string]platformHttp.ReadinessCheckFunc{
		"postgres": func(ctx context.Context) (string, bool) {
			if err := pool.Ping(ctx); err != nil {
				return fmt.Sprintf("db connection error: %v", err), false
			}
			return "connected", true
		},
		"valkey": func(ctx context.Context) (string, bool) {
			if valkeyClient == nil {
				return "unconfigured (fallback mode)", true
			}
			if err := valkeyClient.Client().Ping(ctx).Err(); err != nil {
				return fmt.Sprintf("valkey ping error: %v", err), false
			}
			return "connected", true
		},
	})

	// 4. Start HTTP Server with Graceful Shutdown
	srv := &http.Server{
		Addr:         ":" + cfg.AppPort,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("starting Whoopit Core API server", slog.String("port", cfg.AppPort))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		logger.Error("server error encountered", slog.Any("error", err))
		os.Exit(1)

	case sig := <-shutdown:
		logger.Info("shutdown signal received", slog.String("signal", sig.String()))

		ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancelShutdown()

		if err := srv.Shutdown(ctxShutdown); err != nil {
			logger.Error("graceful server shutdown failed", slog.Any("error", err))
			_ = srv.Close()
		}
		logger.Info("Whoopit Core API server stopped cleanly")
	}
}
