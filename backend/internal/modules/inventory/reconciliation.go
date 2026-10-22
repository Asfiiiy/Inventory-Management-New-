package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"math"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"whoopit-core/internal/platform/db"
)

type LocationReconciliation struct {
	LocationID   uuid.UUID `json:"location_id"`
	LocationName string    `json:"location_name"`
	LedgerSum    float64   `json:"ledger_sum"`
	CachedOnHand float64   `json:"cached_on_hand"`
	Drift        float64   `json:"drift"`
	Healed       bool      `json:"healed"`
}

type ReconciliationReport struct {
	OrgID         uuid.UUID                `json:"org_id"`
	ItemID        uuid.UUID                `json:"item_id"`
	Discrepancies int                      `json:"discrepancies"`
	Locations     []LocationReconciliation `json:"locations"`
}

// ReconcileItemLedger computes mathematical truth from immutable stock_moves, checks against stock_balances, and heals any drift.
func (s *StockMovementService) ReconcileItemLedger(ctx context.Context, orgID, itemID uuid.UUID) (*ReconciliationReport, error) {
	report := &ReconciliationReport{
		OrgID:     orgID,
		ItemID:    itemID,
		Locations: []LocationReconciliation{},
	}

	err := s.db.WithTenantTxRaw(ctx, orgID, func(q *db.Queries, tx pgx.Tx) error {
		// 1. Lock item row to serialize reconciliation
		_, err := q.LockItemForUpdate(ctx, db.LockItemForUpdateParams{
			ItemID: itemID,
			OrgID:  orgID,
		})
		if err != nil {
			return err
		}

		// 2. Find all physical locations that ever touched this item or have balance
		locRows, err := tx.Query(ctx, `
			SELECT DISTINCT l.location_id, l.name
			FROM locations l
			WHERE l.org_id = $1 AND l.category IN ('physical_warehouse', 'physical_office')
			  AND (
			      l.location_id IN (SELECT from_location_id FROM stock_moves WHERE org_id = $1 AND item_id = $2)
			      OR l.location_id IN (SELECT to_location_id FROM stock_moves WHERE org_id = $1 AND item_id = $2)
			      OR l.location_id IN (SELECT location_id FROM stock_balances WHERE org_id = $1 AND item_id = $2)
			  )
			ORDER BY l.name ASC
		`, orgID, itemID)
		if err != nil {
			return err
		}
		defer locRows.Close()

		type locRef struct {
			id   uuid.UUID
			name string
		}
		var locations []locRef
		for locRows.Next() {
			var l locRef
			if err := locRows.Scan(&l.id, &l.name); err == nil {
				locations = append(locations, l)
			}
		}

		// 3. For each physical location, calculate exact ledger sum vs cached on_hand
		for _, loc := range locations {
			var ledgerSum float64
			err := tx.QueryRow(ctx, `
				SELECT COALESCE(SUM(
					CASE 
						WHEN to_location_id = $3 THEN quantity::float8 
						WHEN from_location_id = $3 THEN -quantity::float8 
						ELSE 0 
					END
				), 0)::float8
				FROM stock_moves
				WHERE org_id = $1 AND item_id = $2 AND (to_location_id = $3 OR from_location_id = $3)
			`, orgID, itemID, loc.id).Scan(&ledgerSum)
			if err != nil {
				return err
			}

			var cachedOnHand float64
			err = tx.QueryRow(ctx, `
				SELECT COALESCE(on_hand, 0)::float8
				FROM stock_balances
				WHERE org_id = $1 AND item_id = $2 AND location_id = $3
			`, orgID, itemID, loc.id).Scan(&cachedOnHand)
			if err != nil && !errorsIsNoRows(err) {
				return err
			}

			drift := math.Abs(ledgerSum - cachedOnHand)
			locRec := LocationReconciliation{
				LocationID:   loc.id,
				LocationName: loc.name,
				LedgerSum:    ledgerSum,
				CachedOnHand: cachedOnHand,
				Drift:        drift,
			}

			if drift > 0.0001 {
				report.Discrepancies++
				locRec.Healed = true

				// Auto-heal: update stock_balances to match ledger truth
				_, err = tx.Exec(ctx, `
					INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out, updated_at)
					VALUES ($1, $2, $3, $4, 0, 0, CURRENT_TIMESTAMP)
					ON CONFLICT (org_id, item_id, location_id)
					DO UPDATE SET
						on_hand = EXCLUDED.on_hand,
						updated_at = CURRENT_TIMESTAMP
				`, orgID, itemID, loc.id, ledgerSum)
				if err != nil {
					return err
				}

				// Log to audit log
				diffMeta, _ := json.Marshal(map[string]any{
					"item_id":        itemID,
					"location_id":    loc.id,
					"previous_cache": cachedOnHand,
					"ledger_actual":  ledgerSum,
					"drift":          drift,
				})
				_, _ = tx.Exec(ctx, `
					INSERT INTO audit_log (org_id, user_id, action, entity_type, entity_id, before_values, after_values, ip_address)
					VALUES ($1, NULL, 'RECONCILIATION_DRIFT_HEALED', 'stock_balances', $2, NULL, $3::jsonb, '127.0.0.1')
				`, orgID, loc.id.String(), diffMeta)
			}

			report.Locations = append(report.Locations, locRec)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return report, nil
}

func errorsIsNoRows(err error) bool {
	return err != nil && (err == pgx.ErrNoRows || fmt.Sprintf("%v", err) == "no rows in result set")
}

// Reconcile implements the background jobs.ItemReconciler interface.
func (s *StockMovementService) Reconcile(ctx context.Context, orgID, itemID uuid.UUID) error {
	_, err := s.ReconcileItemLedger(ctx, orgID, itemID)
	return err
}
