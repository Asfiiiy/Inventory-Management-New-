package database

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"whoopit-core/internal/platform/db"
)

// TenantDB wraps a pgx connection pool and enforces PostgreSQL Row-Level Security
// by binding every transaction to a specific organization tenant.
type TenantDB struct {
	pool *pgxpool.Pool
}

// NewTenantDB initializes a new TenantDB instance with the given pool.
func NewTenantDB(pool *pgxpool.Pool) *TenantDB {
	return &TenantDB{pool: pool}
}

// Pool returns the underlying pgxpool.Pool instance.
func (tdb *TenantDB) Pool() *pgxpool.Pool {
	return tdb.pool
}

// WithTenantTx executes the provided callback within an isolated database transaction
// bound strictly to orgID via 'SET LOCAL app.org_id = $1'.
// The transaction automatically commits on success or rolls back on error/panic.
func (tdb *TenantDB) WithTenantTx(ctx context.Context, orgID uuid.UUID, fn func(queries *db.Queries) error) (err error) {
	if orgID == uuid.Nil {
		return fmt.Errorf("tenant_db: cannot execute tenant transaction with nil org_id")
	}

	tx, err := tdb.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("tenant_db: failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		} else if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	// Inject PostgreSQL native Row-Level Security session context (transaction-local)
	_, err = tx.Exec(ctx, "SELECT set_config('app.org_id', $1, true)", orgID.String())
	if err != nil {
		return fmt.Errorf("tenant_db: failed to set tenant RLS context: %w", err)
	}

	queries := db.New(tx)
	if err = fn(queries); err != nil {
		return err
	}

	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("tenant_db: failed to commit transaction: %w", err)
	}

	return nil
}

// WithTenantTxRaw executes within an isolated database transaction bound strictly to orgID
// and exposes both queries and the raw pgx.Tx for advanced operations.
func (tdb *TenantDB) WithTenantTxRaw(ctx context.Context, orgID uuid.UUID, fn func(queries *db.Queries, tx pgx.Tx) error) (err error) {
	if orgID == uuid.Nil {
		return fmt.Errorf("tenant_db: cannot execute tenant transaction with nil org_id")
	}

	tx, err := tdb.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("tenant_db: failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		} else if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	_, err = tx.Exec(ctx, "SELECT set_config('app.org_id', $1, true)", orgID.String())
	if err != nil {
		return fmt.Errorf("tenant_db: failed to set tenant RLS context: %w", err)
	}

	queries := db.New(tx)
	if err = fn(queries, tx); err != nil {
		return err
	}

	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("tenant_db: failed to commit transaction: %w", err)
	}

	return nil
}

// WithAdminTx executes a query block in a transaction without injecting an org_id context.
// Useful for cross-tenant administration, system migrations, or global organization onboarding.
func (tdb *TenantDB) WithAdminTx(ctx context.Context, fn func(queries *db.Queries, tx pgx.Tx) error) (err error) {
	tx, err := tdb.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("tenant_db: failed to begin admin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		} else if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	queries := db.New(tx)
	if err = fn(queries, tx); err != nil {
		return err
	}

	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("tenant_db: failed to commit admin transaction: %w", err)
	}

	return nil
}
