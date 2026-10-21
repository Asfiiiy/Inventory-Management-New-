package warehouse

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
)

var (
	ErrNotBatchItem      = errors.New("item tracking mode is not batch")
	ErrInsufficientStock = errors.New("insufficient stock across available batches/lots for requested quantity")
	ErrInvalidQuantity   = errors.New("quantity must be greater than zero")
)

type BatchAllocationService struct {
	db      *database.TenantDB
	moveSvc *inventory.StockMovementService
}

func NewBatchAllocationService(tdb *database.TenantDB, moveSvc *inventory.StockMovementService) *BatchAllocationService {
	return &BatchAllocationService{
		db:      tdb,
		moveSvc: moveSvc,
	}
}

// RegisterLot creates a lot record with tracking number and expiration date.
func (s *BatchAllocationService) RegisterLot(ctx context.Context, orgID, itemID uuid.UUID, trackingNumber string, expirationDate time.Time) (*db.Lot, error) {
	var lot db.Lot
	err := s.db.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		item, err := q.GetItemByID(ctx, db.GetItemByIDParams{
			ItemID: itemID,
			OrgID:  orgID,
		})
		if err != nil {
			return err
		}
		if fmt.Sprintf("%v", item.TrackingMode) != "batch" {
			return ErrNotBatchItem
		}

		expPg := pgtype.Timestamptz{Time: expirationDate, Valid: true}
		created, err := q.CreateLot(ctx, db.CreateLotParams{
			OrgID:          orgID,
			ItemID:         itemID,
			TrackingNumber: trackingNumber,
			ExpirationDate: expPg,
		})
		if err != nil {
			return err
		}
		lot = created
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &lot, nil
}

type DispatchFEFOInput struct {
	OrgID          uuid.UUID
	ItemID         uuid.UUID
	FromLocationID uuid.UUID
	ToLocationID   uuid.UUID
	Quantity       float64
	ReferenceCode  string
	ActorID        uuid.UUID
}

type DispatchFEFOResult struct {
	Move          db.StockMove             `json:"move"`
	Lines         []db.StockMoveLine       `json:"lines"`
	AllocatedLots []AllocatedLotAllocation `json:"allocated_lots"`
}

type AllocatedLotAllocation struct {
	LotID          uuid.UUID `json:"lot_id"`
	TrackingNumber string    `json:"tracking_number"`
	ExpirationDate time.Time `json:"expiration_date"`
	Quantity       float64   `json:"quantity"`
}

// DispatchFEFO automatically allocates stock across earliest-expiring lots and executes the double-entry move.
func (s *BatchAllocationService) DispatchFEFO(ctx context.Context, in DispatchFEFOInput) (*DispatchFEFOResult, error) {
	if in.Quantity <= 0 {
		return nil, ErrInvalidQuantity
	}

	var moveLines []inventory.MoveLineInput
	var allocations []AllocatedLotAllocation

	err := s.db.WithTenantTx(ctx, in.OrgID, func(q *db.Queries) error {
		item, err := q.GetItemByID(ctx, db.GetItemByIDParams{
			ItemID: itemIDClean(in.ItemID),
			OrgID:  in.OrgID,
		})
		if err != nil {
			return err
		}
		if fmt.Sprintf("%v", item.TrackingMode) != "batch" {
			return ErrNotBatchItem
		}

		// Query available lots ordered by expiration_date ASC
		availableLots, err := q.GetAvailableLotsForFEFO(ctx, db.GetAvailableLotsForFEFOParams{
			OrgID:      in.OrgID,
			ItemID:     in.ItemID,
			LocationID: in.FromLocationID,
		})
		if err != nil {
			return err
		}

		remainingToAllocate := in.Quantity
		for _, lot := range availableLots {
			if remainingToAllocate <= 0 {
				break
			}

			var availFloat float64
			if lot.AvailableQuantity.Valid {
				f, _ := lot.AvailableQuantity.Float64Value()
				if f.Valid {
					availFloat = f.Float64
				}
			}

			if availFloat <= 0 {
				continue
			}

			qtyToTake := math.Min(remainingToAllocate, availFloat)
			remainingToAllocate -= qtyToTake

			allocations = append(allocations, AllocatedLotAllocation{
				LotID:          lot.LotID,
				TrackingNumber: lot.TrackingNumber,
				ExpirationDate: lot.ExpirationDate.Time,
				Quantity:       qtyToTake,
			})

			moveLines = append(moveLines, inventory.MoveLineInput{
				TrackingNumber: lot.TrackingNumber,
				Quantity:       qtyToTake,
			})
		}

		if remainingToAllocate > 0.0001 {
			return ErrInsufficientStock
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	// Execute move through StockMovementService
	moveRes, err := s.moveSvc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          in.OrgID,
		ItemID:         in.ItemID,
		FromLocationID: in.FromLocationID,
		ToLocationID:   in.ToLocationID,
		Quantity:       in.Quantity,
		MoveType:       "INTERNAL_TRANSFER",
		ReferenceCode:  in.ReferenceCode,
		ActorID:        in.ActorID,
		Lines:          moveLines,
	})
	if err != nil {
		return nil, err
	}

	return &DispatchFEFOResult{
		Move:          moveRes.Move,
		Lines:         moveRes.Lines,
		AllocatedLots: allocations,
	}, nil
}

func itemIDClean(id uuid.UUID) uuid.UUID {
	return id
}
