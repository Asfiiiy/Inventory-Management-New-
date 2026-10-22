package inventory

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"whoopit-core/internal/platform/db"
)

type LocationStockDetail struct {
	LocationID       uuid.UUID `json:"location_id"`
	LocationName     string    `json:"location_name"`
	IsBackupLocation bool      `json:"is_backup_location"`
	OnHand           float64   `json:"on_hand"`
	Reserved         float64   `json:"reserved"`
	Available        float64   `json:"available"`
}

type StockSummaryResponse struct {
	ItemID          uuid.UUID             `json:"item_id"`
	Sku             string                `json:"sku"`
	Name            string                `json:"name"`
	BaseUom         string                `json:"base_uom"`
	TotalOnHand     float64               `json:"total_on_hand"`
	TotalReserved   float64               `json:"total_reserved"`
	TotalAvailable  float64               `json:"total_available"`
	TotalCheckedOut float64               `json:"total_checked_out"`
	ReorderLevel    float64               `json:"reorder_level"`
	BufferStock     float64               `json:"buffer_stock"`
	StockStatus     string                `json:"stock_status"` // IN_STOCK, LOW_STOCK, BUFFER_ALERT, OUT_OF_STOCK
	Locations       []LocationStockDetail `json:"locations"`
}

// GetItemStockSummary calculates live balances, location breakdowns, and 4-tier badge status.
func (s *StockMovementService) GetItemStockSummary(ctx context.Context, orgID, itemID uuid.UUID) (*StockSummaryResponse, error) {
	pool := s.db.Pool()

	// 1. Fetch Item details
	var sku, name, baseUom string
	var reorderLevel, bufferStock float64
	err := pool.QueryRow(ctx, `
		SELECT 
			sku, 
			name, 
			base_uom, 
			COALESCE(reorder_level, 0)::float8, 
			COALESCE(buffer_stock, 0)::float8
		FROM items
		WHERE org_id = $1 AND item_id = $2
	`, orgID, itemID).Scan(&sku, &name, &baseUom, &reorderLevel, &bufferStock)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrItemNotFound
		}
		return nil, err
	}

	// 2. Fetch Aggregated Balances from queries
	var totalOnHand, totalReserved, totalCheckedOut, totalAvailable float64
	err = s.db.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		tot, err := q.GetItemTotalBalance(ctx, db.GetItemTotalBalanceParams{
			OrgID:  orgID,
			ItemID: itemID,
		})
		if err != nil {
			return err
		}

		if val, err := tot.TotalOnHand.Float64Value(); err == nil && val.Valid {
			totalOnHand = val.Float64
		}
		if val, err := tot.TotalReserved.Float64Value(); err == nil && val.Valid {
			totalReserved = val.Float64
		}
		if val, err := tot.TotalCheckedOut.Float64Value(); err == nil && val.Valid {
			totalCheckedOut = val.Float64
		}
		if val, err := tot.TotalAvailable.Float64Value(); err == nil && val.Valid {
			totalAvailable = val.Float64
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// 3. Determine 4-Tier Stock Status
	// OUT_OF_STOCK <= 0
	// BUFFER_ALERT <= buffer_stock
	// LOW_STOCK <= reorder_level
	// IN_STOCK > reorder_level
	stockStatus := "IN_STOCK"
	if totalOnHand <= 0 {
		stockStatus = "OUT_OF_STOCK"
	} else if bufferStock > 0 && totalOnHand <= bufferStock {
		stockStatus = "BUFFER_ALERT"
	} else if reorderLevel > 0 && totalOnHand <= reorderLevel {
		stockStatus = "LOW_STOCK"
	}

	// 4. Fetch per-location breakdown (Active vs Godown / Backup)
	var locations []LocationStockDetail
	err = s.db.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		rows, err := q.ListStockBalancesByItem(ctx, db.ListStockBalancesByItemParams{
			OrgID:  orgID,
			ItemID: itemID,
		})
		if err != nil {
			return err
		}

		for _, row := range rows {
			var onHand, reserved float64
			if val, err := row.OnHand.Float64Value(); err == nil && val.Valid {
				onHand = val.Float64
			}
			if val, err := row.Reserved.Float64Value(); err == nil && val.Valid {
				reserved = val.Float64
			}

			locations = append(locations, LocationStockDetail{
				LocationID:       row.LocationID,
				LocationName:     row.LocationName,
				IsBackupLocation: row.IsBackupLocation,
				OnHand:           onHand,
				Reserved:         reserved,
				Available:        onHand - reserved,
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return &StockSummaryResponse{
		ItemID:          itemID,
		Sku:             sku,
		Name:            name,
		BaseUom:         baseUom,
		TotalOnHand:     totalOnHand,
		TotalReserved:   totalReserved,
		TotalAvailable:  totalAvailable,
		TotalCheckedOut: totalCheckedOut,
		ReorderLevel:    reorderLevel,
		BufferStock:     bufferStock,
		StockStatus:     stockStatus,
		Locations:       locations,
	}, nil
}
