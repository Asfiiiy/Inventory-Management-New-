package retail

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
)

var (
	ErrItemNotFound      = errors.New("item not found matching SKU or barcode")
	ErrInsufficientStock = errors.New("insufficient stock at store location for sale")
	ErrInvalidQuantity   = errors.New("sale quantity must be greater than zero")
)

type RetailSalesService struct {
	db      *database.TenantDB
	moveSvc *inventory.StockMovementService
}

func NewRetailSalesService(tdb *database.TenantDB, moveSvc *inventory.StockMovementService) *RetailSalesService {
	return &RetailSalesService{
		db:      tdb,
		moveSvc: moveSvc,
	}
}

type SellInput struct {
	OrgID           uuid.UUID
	SKUOrBarcode    string
	Quantity        float64
	StoreLocationID uuid.UUID
	ReceiptID       string
	ActorID         uuid.UUID
}

type SellResult struct {
	Item                  db.Item            `json:"item"`
	Move                  db.StockMove       `json:"move"`
	Lines                 []db.StockMoveLine `json:"lines,omitempty"`
	SoldQuantity          float64            `json:"sold_quantity"`
	RemainingShelfBalance float64            `json:"remaining_shelf_balance"`
}

func (s *RetailSalesService) SellItem(ctx context.Context, in SellInput) (*SellResult, error) {
	if in.Quantity <= 0 {
		return nil, ErrInvalidQuantity
	}
	if in.ActorID == uuid.Nil {
		in.ActorID = uuid.New()
	}

	var item db.Item
	var customerLocID uuid.UUID

	// Step 1: Resolve Item & Customer Location within tenant context
	err := s.db.WithTenantTx(ctx, in.OrgID, func(q *db.Queries) error {
		resolvedItem, err := q.GetItemBySKUOrBarcode(ctx, db.GetItemBySKUOrBarcodeParams{
			OrgID: in.OrgID,
			Sku:   in.SKUOrBarcode,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrItemNotFound
			}
			return err
		}
		item = resolvedItem

		// Step 2: Resolve or Create Virtual Customer Location
		custLoc, err := q.GetLocationByCategory(ctx, db.GetLocationByCategoryParams{
			OrgID:    in.OrgID,
			Category: "virtual_customer",
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				newLoc, cErr := q.CreateLocation(ctx, db.CreateLocationParams{
					OrgID:    in.OrgID,
					Name:     "Virtual Customers",
					Category: "virtual_customer",
				})
				if cErr != nil {
					return cErr
				}
				customerLocID = newLoc.LocationID
			} else {
				return err
			}
		} else {
			customerLocID = custLoc.LocationID
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	// Step 3: Check Current Store Location Balance
	currentBal, err := s.moveSvc.GetLocationBalance(ctx, in.OrgID, in.StoreLocationID, item.ItemID)
	if err != nil {
		return nil, err
	}
	if currentBal < in.Quantity {
		return nil, fmt.Errorf("%w: current on-hand balance is %v, requested %v", ErrInsufficientStock, currentBal, in.Quantity)
	}

	// Step 4: Execute Atomic Stock Move (Store -> Virtual/Customer)
	moveRes, err := s.moveSvc.ExecuteMove(ctx, inventory.ExecuteMoveInput{
		OrgID:          in.OrgID,
		ItemID:         item.ItemID,
		FromLocationID: in.StoreLocationID,
		ToLocationID:   customerLocID,
		Quantity:       in.Quantity,
		MoveType:       "RETAIL_SALE",
		ReferenceCode:  in.ReceiptID,
		ActorID:        in.ActorID,
	})
	if err != nil {
		return nil, err
	}

	// Step 5: Calculate Remaining Shelf Balance
	remainingBal, err := s.moveSvc.GetLocationBalance(ctx, in.OrgID, in.StoreLocationID, item.ItemID)
	if err != nil {
		return nil, err
	}

	return &SellResult{
		Item:                  item,
		Move:                  moveRes.Move,
		Lines:                 moveRes.Lines,
		SoldQuantity:          in.Quantity,
		RemainingShelfBalance: remainingBal,
	}, nil
}
