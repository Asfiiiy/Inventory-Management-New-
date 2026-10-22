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
	MoveType       string          `json:"move_type"`
	ReferenceCode  string          `json:"reference_code,omitempty"`
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

	var result MoveResult

	err := s.db.WithTenantTx(ctx, input.OrgID, func(q *db.Queries) error {
		// Step 1: Pessimistic Lock on Item row to serialize concurrent movements
		item, err := q.LockItemForUpdate(ctx, db.LockItemForUpdateParams{
			ItemID: input.ItemID,
			OrgID:  input.OrgID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrItemNotFound
			}
			return err
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
			if math.Abs(lineSum-input.Quantity) > 0.0001 {
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
		_, err = q.GetLocationByID(ctx, db.GetLocationByIDParams{
			LocationID: input.ToLocationID,
			OrgID:      input.OrgID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("%w: destination location %s", ErrLocationNotFound, input.ToLocationID)
			}
			return err
		}

		// Step 2: Physical Balance Guard
		categoryStr := fmt.Sprintf("%v", fromLoc.Category)
		isPhysicalSource := categoryStr == "physical_warehouse" || categoryStr == "physical_office"

		if isPhysicalSource {
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

			// If on-hand balance is less than required, abort immediately
			if currentBalance < input.Quantity {
				return ErrInsufficientStock
			}
		}

		// Step 3: Insert into append-only stock_moves
		moveQty := pgtype.Numeric{}
		_ = moveQty.Scan(fmt.Sprintf("%.4f", input.Quantity))

		refCode := pgtype.Text{String: input.ReferenceCode, Valid: input.ReferenceCode != ""}
		move, err := q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          input.OrgID,
			ItemID:         input.ItemID,
			FromLocationID: input.FromLocationID,
			ToLocationID:   input.ToLocationID,
			Quantity:       moveQty,
			MoveType:       input.MoveType,
			ReferenceCode:  refCode,
			ActorID:        input.ActorID,
		})
		if err != nil {
			return err
		}
		result.Move = move

		// Step 4: Line Allocation for tracking numbers
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
