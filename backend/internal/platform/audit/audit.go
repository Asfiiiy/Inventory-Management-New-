package audit

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Entry struct {
	OrgID        uuid.UUID
	UserID       *uuid.UUID
	Action       string
	EntityType   string
	EntityID     string
	BeforeValues any
	AfterValues  any
	IPAddress    string
}

type Logger struct {
	pool *pgxpool.Pool
}

func NewLogger(pool *pgxpool.Pool) *Logger {
	return &Logger{pool: pool}
}

// Log records an immutable audit trail entry in the database.
func (l *Logger) Log(ctx context.Context, e Entry) error {
	var beforeJSON, afterJSON []byte
	var err error

	if e.BeforeValues != nil {
		beforeJSON, err = json.Marshal(e.BeforeValues)
		if err != nil {
			return fmt.Errorf("audit: failed to marshal before values: %w", err)
		}
	}

	if e.AfterValues != nil {
		afterJSON, err = json.Marshal(e.AfterValues)
		if err != nil {
			return fmt.Errorf("audit: failed to marshal after values: %w", err)
		}
	}

	query := `
		INSERT INTO audit_log (
			org_id, user_id, action, entity_type, entity_id,
			before_values, after_values, ip_address
		) VALUES (
			$1, $2, $3, $4, $5,
			$6::jsonb, $7::jsonb, $8
		)
	`

	_, err = l.pool.Exec(ctx, query,
		e.OrgID,
		e.UserID,
		e.Action,
		e.EntityType,
		e.EntityID,
		beforeJSON,
		afterJSON,
		e.IPAddress,
	)
	if err != nil {
		return fmt.Errorf("audit: database insert failed: %w", err)
	}

	return nil
}
