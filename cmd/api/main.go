package main

import (
	"context"
	"errors"
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
	"whoopit-core/internal/modules/warehouse"
	"whoopit-core/internal/platform/cache"
	"whoopit-core/internal/platform/database"
	platformHttp "whoopit-core/internal/platform/http"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	port := os.Getenv("APP_PORT")
	if port == "" {
		port = "8080"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://whoopit_admin:whoopit_secure_pw_2026@localhost:5432/whoopit_inventory_v4?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Initialize PostgreSQL connection pool
	poolConfig, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		logger.Error("failed to parse database configuration", slog.Any("error", err))
		os.Exit(1)
	}

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

	valkeyAddr := os.Getenv("VALKEY_ADDR")
	if valkeyAddr == "" {
		valkeyAddr = "localhost:6379"
	}
	valkeyClient, err := cache.NewValkeyClient(valkeyAddr)
	if err != nil {
		logger.Warn("valkey cache connection unavailable, continuing without cache", slog.Any("error", err))
	} else {
		defer valkeyClient.Close()
		logger.Info("connected to Valkey 9 cache", slog.String("addr", valkeyAddr))
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

	// 4. Start HTTP Server with Graceful Shutdown
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("starting Whoopit Core API server", slog.String("port", port))
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
