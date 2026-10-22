package inventory

import (
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
)

var (
	ErrInsufficientStock = errors.New("insufficient stock at source location")
	ErrInvalidMoveQty    = errors.New("move quantity must be greater than zero")
	ErrInvalidLineQty    = errors.New("serialized item move lines must each have quantity 1.0 and sum to move quantity")
	ErrItemNotFound      = errors.New("item not found")
	ErrLocationNotFound  = errors.New("location not found")
	ErrNoUOMConversion   = errors.New("no valid unit conversion rule found")
)

type MoveLineInput struct {
	TrackingNumber string  `json:"tracking_number"`
	Quantity       float64 `json:"quantity"`
}

type ExecuteMoveInput struct {
	OrgID          uuid.UUID       `json:"org_id"`
	ItemID         uuid.UUID       `json:"item_id"`
	FromLocationID uuid.UUID       `json:"from_location_id"`
	ToLocationID   uuid.UUID       `json:"to_location_id"`
	Quantity       float64         `json:"quantity"`
	Unit           string          `json:"unit,omitempty"`
	MoveType       string          `json:"move_type"`
	ReferenceCode  string          `json:"reference_code,omitempty"`
	IdempotencyKey string          `json:"idempotency_key,omitempty"`
	ActorID        uuid.UUID       `json:"actor_id"`
	Lines          []MoveLineInput `json:"lines,omitempty"`
}

type MoveResult struct {
	Move  db.StockMove       `json:"move"`
	Lines []db.StockMoveLine `json:"lines,omitempty"`
}

// StockMovementService orchestrates atomic two-sided inventory moves with balance verification.
type StockMovementService struct {
	db *database.TenantDB
}

// NewStockMovementService constructs a new StockMovementService.
func NewStockMovementService(tdb *database.TenantDB) *StockMovementService {
	return &StockMovementService{db: tdb}
}

// ExecuteMove executes an atomic two-sided movement from source to destination location.
func (s *StockMovementService) ExecuteMove(ctx context.Context, input ExecuteMoveInput) (*MoveResult, error) {
	if input.Quantity <= 0 {
		return nil, ErrInvalidMoveQty
	}
	if input.ActorID == uuid.Nil {
		input.ActorID = uuid.New()
	}

	// Idempotency Deduplication Check
	if input.IdempotencyKey != "" {
		pool := s.db.Pool()
		var existing db.StockMove
		err := pool.QueryRow(ctx, `
			SELECT move_id, org_id, item_id, from_location_id, to_location_id, quantity, move_type, reference_code, actor_id, created_at, idempotency_key, usage_target, batch_number, expiry_date, unit_cost
			FROM stock_moves
			WHERE org_id = $1 AND idempotency_key = $2
		`, input.OrgID, input.IdempotencyKey).Scan(
			&existing.MoveID, &existing.OrgID, &existing.ItemID,
			&existing.FromLocationID, &existing.ToLocationID, &existing.Quantity,
			&existing.MoveType, &existing.ReferenceCode, &existing.ActorID,
			&existing.CreatedAt, &existing.IdempotencyKey, &existing.UsageTarget,
			&existing.BatchNumber, &existing.ExpiryDate, &existing.UnitCost,
		)
		if err == nil {
			return &MoveResult{Move: existing}, nil
		}
	}

	var result MoveResult

	err := s.db.WithTenantTxRaw(ctx, input.OrgID, func(q *db.Queries, tx pgx.Tx) error {
		// Step 1: Pessimistic Lock on Item row to serialize concurrent movements
		_, err := q.LockItemForUpdate(ctx, db.LockItemForUpdateParams{
			ItemID: input.ItemID,
			OrgID:  input.OrgID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrItemNotFound
			}
			return err
		}

		item, err := q.GetItemByID(ctx, db.GetItemByIDParams{
			ItemID: input.ItemID,
			OrgID:  input.OrgID,
		})
		if err != nil {
			return err
		}

		// Step 2: Multi-Unit UOM Conversion
		effectiveQuantity := input.Quantity
		if input.Unit != "" && input.Unit != item.BaseUom {
			var mult float64
			err := tx.QueryRow(ctx, `
				SELECT multiplier::float8 FROM uom_conversions
				WHERE org_id = $1 AND (item_id = $2 OR item_id IS NULL) AND from_unit = $3 AND to_base_unit = $4
				ORDER BY item_id NULLS LAST
				LIMIT 1
			`, input.OrgID, input.ItemID, input.Unit, item.BaseUom).Scan(&mult)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return fmt.Errorf("%w: cannot convert '%s' to '%s'", ErrNoUOMConversion, input.Unit, item.BaseUom)
				}
				return err
			}
			if mult <= 0 {
				return fmt.Errorf("%w: multiplier for '%s' to '%s' must be positive", ErrNoUOMConversion, input.Unit, item.BaseUom)
			}
			effectiveQuantity = input.Quantity * mult
		}

		// Validation: Serialized item check
		trackingModeStr := fmt.Sprintf("%v", item.TrackingMode)
		if trackingModeStr == "serialized" {
			var lineSum float64
			for _, line := range input.Lines {
				if math.Abs(line.Quantity-1.0) > 0.0001 {
					return ErrInvalidLineQty
				}
				lineSum += line.Quantity
			}
			if math.Abs(lineSum-effectiveQuantity) > 0.0001 {
				return ErrInvalidLineQty
			}
		}

		// Verify Source Location
		fromLoc, err := q.GetLocationByID(ctx, db.GetLocationByIDParams{
			LocationID: input.FromLocationID,
			OrgID:      input.OrgID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("%w: source location %s", ErrLocationNotFound, input.FromLocationID)
			}
			return err
		}

		// Verify Destination Location
		toLoc, err := q.GetLocationByID(ctx, db.GetLocationByIDParams{
			LocationID: input.ToLocationID,
			OrgID:      input.OrgID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("%w: destination location %s", ErrLocationNotFound, input.ToLocationID)
			}
			return err
		}

		// Step 3: Physical Balance Guard & Negative Stock Check
		categoryStr := fmt.Sprintf("%v", fromLoc.Category)
		isPhysicalSource := categoryStr == "physical_warehouse" || categoryStr == "physical_office"

		if isPhysicalSource {
			// Check tenant settings for allow_negative_stock
			allowNegative := false
			_ = tx.QueryRow(ctx, "SELECT allow_negative_stock FROM organization_settings WHERE org_id = $1", input.OrgID).Scan(&allowNegative)

			if !allowNegative {
				balNumeric, err := q.CalculateLocationBalance(ctx, db.CalculateLocationBalanceParams{
					OrgID:        input.OrgID,
					ItemID:       input.ItemID,
					ToLocationID: input.FromLocationID,
				})
				if err != nil {
					return err
				}

				val, err := balNumeric.Float64Value()
				currentBalance := 0.0
				if err == nil && val.Valid {
					currentBalance = val.Float64
				}

				// Check reservations at this location
				var reservedAtLoc float64
				_ = tx.QueryRow(ctx, `
					SELECT COALESCE(reserved, 0)::float8 FROM stock_balances
					WHERE org_id = $1 AND item_id = $2 AND location_id = $3
				`, input.OrgID, input.ItemID, input.FromLocationID).Scan(&reservedAtLoc)

				availableBalance := currentBalance - reservedAtLoc

				// If on-hand / available balance is less than required, abort immediately
				if availableBalance < effectiveQuantity {
					return ErrInsufficientStock
				}
			}
		}

		// Step 4: Insert into append-only stock_moves
		moveQty := pgtype.Numeric{}
		_ = moveQty.Scan(fmt.Sprintf("%.4f", effectiveQuantity))

		refCode := pgtype.Text{String: input.ReferenceCode, Valid: input.ReferenceCode != ""}
		idempKey := pgtype.Text{String: input.IdempotencyKey, Valid: input.IdempotencyKey != ""}
		move, err := q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          input.OrgID,
			ItemID:         input.ItemID,
			FromLocationID: input.FromLocationID,
			ToLocationID:   input.ToLocationID,
			Quantity:       moveQty,
			MoveType:       input.MoveType,
			ReferenceCode:  refCode,
			IdempotencyKey: idempKey,
			ActorID:        input.ActorID,
		})
		if err != nil {
			return err
		}
		result.Move = move

		// Step 5: Update Materialized Stock Balances
		toCategoryStr := fmt.Sprintf("%v", toLoc.Category)
		isPhysicalDest := toCategoryStr == "physical_warehouse" || toCategoryStr == "physical_office"

		if isPhysicalSource {
			cmd, err := tx.Exec(ctx, `
				UPDATE stock_balances
				SET on_hand = on_hand - $4,
				    updated_at = CURRENT_TIMESTAMP
				WHERE org_id = $1 AND item_id = $2 AND location_id = $3
			`, input.OrgID, input.ItemID, input.FromLocationID, effectiveQuantity)
			if err != nil {
				return err
			}
			if cmd.RowsAffected() == 0 {
				_, err = tx.Exec(ctx, `
					INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out, updated_at)
					VALUES ($1, $2, $3, 0, 0, 0, CURRENT_TIMESTAMP)
					ON CONFLICT (org_id, item_id, location_id) DO NOTHING
				`, input.OrgID, input.ItemID, input.FromLocationID)
				if err != nil {
					return err
				}
			}
		}

		if isPhysicalDest {
			cmd, err := tx.Exec(ctx, `
				UPDATE stock_balances
				SET on_hand = on_hand + $4,
				    updated_at = CURRENT_TIMESTAMP
				WHERE org_id = $1 AND item_id = $2 AND location_id = $3
			`, input.OrgID, input.ItemID, input.ToLocationID, effectiveQuantity)
			if err != nil {
				return err
			}
			if cmd.RowsAffected() == 0 {
				_, err = tx.Exec(ctx, `
					INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out, updated_at)
					VALUES ($1, $2, $3, $4, 0, 0, CURRENT_TIMESTAMP)
					ON CONFLICT (org_id, item_id, location_id)
					DO UPDATE SET
						on_hand = stock_balances.on_hand + $4,
						updated_at = CURRENT_TIMESTAMP
				`, input.OrgID, input.ItemID, input.ToLocationID, effectiveQuantity)
				if err != nil {
					return err
				}
			}
		}

		if toCategoryStr == "virtual_custody" {
			_, err = tx.Exec(ctx, `
				INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out, updated_at)
				VALUES ($1, $2, $3, 0, 0, $4, CURRENT_TIMESTAMP)
				ON CONFLICT (org_id, item_id, location_id)
				DO UPDATE SET
					checked_out = stock_balances.checked_out + $4,
					updated_at = CURRENT_TIMESTAMP
			`, input.OrgID, input.ItemID, input.FromLocationID, effectiveQuantity)
			if err != nil {
				return err
			}
		}

		// Step 6: Line Allocation for tracking numbers
		for _, line := range input.Lines {
			lineQty := pgtype.Numeric{}
			_ = lineQty.Scan(fmt.Sprintf("%.4f", line.Quantity))

			createdLine, err := q.CreateStockMoveLine(ctx, db.CreateStockMoveLineParams{
				MoveID:         move.MoveID,
				TrackingNumber: line.TrackingNumber,
				Quantity:       lineQty,
			})
			if err != nil {
				return err
			}
			result.Lines = append(result.Lines, createdLine)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &result, nil
}

// GetLocationBalance calculates on-hand balance for a specific item and location.
func (s *StockMovementService) GetLocationBalance(ctx context.Context, orgID, locationID, itemID uuid.UUID) (float64, error) {
	var balance float64

	err := s.db.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		balNumeric, err := q.CalculateLocationBalance(ctx, db.CalculateLocationBalanceParams{
			OrgID:        orgID,
			ItemID:       itemID,
			ToLocationID: locationID,
		})
		if err != nil {
			return err
		}

		val, err := balNumeric.Float64Value()
		if err == nil && val.Valid {
			balance = val.Float64
		}
		return nil
	})

	return balance, err
}

// ListMoves lists movements filtered by item or location with pagination.
func (s *StockMovementService) ListMoves(ctx context.Context, orgID uuid.UUID, itemID, locationID *uuid.UUID, limit, offset int32) ([]db.StockMove, error) {
	var moves []db.StockMove

	err := s.db.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		var itemUUID, locUUID pgtype.UUID
		if itemID != nil && *itemID != uuid.Nil {
			itemUUID = pgtype.UUID{Bytes: *itemID, Valid: true}
		}
		if locationID != nil && *locationID != uuid.Nil {
			locUUID = pgtype.UUID{Bytes: *locationID, Valid: true}
		}

		res, err := q.ListStockMoves(ctx, db.ListStockMovesParams{
			OrgID:       orgID,
			ItemID:      itemUUID,
			LocationID:  locUUID,
			LimitCount:  limit,
			OffsetCount: offset,
		})
		if err != nil {
			return err
		}
		moves = res
		return nil
	})

	return moves, err
}
