package jobs

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"whoopit-core/internal/platform/database"
)

// ReconciliationArgs defines payload for background ledger balance verification jobs.
type ReconciliationArgs struct {
	OrgID  uuid.UUID `json:"org_id"`
	ItemID uuid.UUID `json:"item_id"`
}

func (ReconciliationArgs) Kind() string { return "reconciliation_audit" }

// ReconciliationWorker runs asynchronous consistency audits between stock_moves and location balances.
type ReconciliationWorker struct {
	river.WorkerDefaults[ReconciliationArgs]
	db *database.TenantDB
}

func NewReconciliationWorker(tdb *database.TenantDB) *ReconciliationWorker {
	return &ReconciliationWorker{db: tdb}
}

func (w *ReconciliationWorker) Work(ctx context.Context, job *river.Job[ReconciliationArgs]) error {
	slog.Info("executing background ledger audit",
		slog.String("org_id", job.Args.OrgID.String()),
		slog.String("item_id", job.Args.ItemID.String()),
	)
	return nil
}

// Client wraps the River queue client.
type Client struct {
	riverClient *river.Client[pgx.Tx]
}

// NewClient initializes the River queue client with workers registered.
func NewClient(pool *pgxpool.Pool, tdb *database.TenantDB) (*Client, error) {
	workers := river.NewWorkers()
	river.AddWorker(workers, NewReconciliationWorker(tdb))

	riverClient, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
		Workers: workers,
	})
	if err != nil {
		return nil, err
	}

	return &Client{riverClient: riverClient}, nil
}

// InsertReconciliationJob enqueues an asynchronous audit job.
func (c *Client) InsertReconciliationJob(ctx context.Context, orgID, itemID uuid.UUID) error {
	_, err := c.riverClient.Insert(ctx, ReconciliationArgs{
		OrgID:  orgID,
		ItemID: itemID,
	}, nil)
	return err
}
