package inventory

import (
	"context"

	"github.com/google/uuid"
)

type StockAlert struct {
	ItemID           uuid.UUID `json:"item_id"`
	Sku              string    `json:"sku"`
	Name             string    `json:"name"`
	BaseUom          string    `json:"base_uom"`
	TotalOnHand      float64   `json:"total_on_hand"`
	ReorderLevel     float64   `json:"reorder_level"`
	BufferStock      float64   `json:"buffer_stock"`
	AlertType        string    `json:"alert_type"` // OUT_OF_STOCK, BUFFER_ALERT, LOW_STOCK
	SuggestedReorder float64   `json:"suggested_reorder"`
}

// GetStockAlerts returns items where total on-hand stock has breached reorder_level or buffer_stock thresholds.
func (s *StockMovementService) GetStockAlerts(ctx context.Context, orgID uuid.UUID) ([]StockAlert, error) {
	pool := s.db.Pool()

	query := `
		SELECT 
			i.item_id,
			i.sku,
			i.name,
			i.base_uom,
			COALESCE(SUM(sb.on_hand), 0)::float8 AS total_on_hand,
			COALESCE(i.reorder_level, 0)::float8 AS reorder_level,
			COALESCE(i.buffer_stock, 0)::float8 AS buffer_stock
		FROM items i
		LEFT JOIN stock_balances sb ON sb.item_id = i.item_id AND sb.org_id = i.org_id
		WHERE i.org_id = $1 AND i.is_active = true
		  AND (i.reorder_level > 0 OR i.buffer_stock > 0)
		GROUP BY i.item_id, i.sku, i.name, i.base_uom, i.reorder_level, i.buffer_stock
		HAVING COALESCE(SUM(sb.on_hand), 0) <= GREATEST(i.reorder_level, i.buffer_stock)
		ORDER BY total_on_hand ASC
	`

	rows, err := pool.Query(ctx, query, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []StockAlert
	for rows.Next() {
		var a StockAlert
		err := rows.Scan(
			&a.ItemID, &a.Sku, &a.Name, &a.BaseUom,
			&a.TotalOnHand, &a.ReorderLevel, &a.BufferStock,
		)
		if err != nil {
			return nil, err
		}

		if a.TotalOnHand <= 0 {
			a.AlertType = "OUT_OF_STOCK"
		} else if a.BufferStock > 0 && a.TotalOnHand <= a.BufferStock {
			a.AlertType = "BUFFER_ALERT"
		} else {
			a.AlertType = "LOW_STOCK"
		}

		// Suggested replenishment: bring up to 2x reorder level
		targetStock := a.ReorderLevel * 2
		if a.BufferStock*2 > targetStock {
			targetStock = a.BufferStock * 2
		}
		if targetStock > a.TotalOnHand {
			a.SuggestedReorder = targetStock - a.TotalOnHand
		}

		alerts = append(alerts, a)
	}

	return alerts, nil
}
