-- name: UpsertStockBalance :one
INSERT INTO stock_balances (
    org_id, item_id, location_id, on_hand, reserved, checked_out, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP
)
ON CONFLICT (org_id, item_id, location_id)
DO UPDATE SET
    on_hand = EXCLUDED.on_hand,
    reserved = EXCLUDED.reserved,
    checked_out = EXCLUDED.checked_out,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: GetStockBalance :one
SELECT * FROM stock_balances
WHERE org_id = $1 AND item_id = $2 AND location_id = $3;

-- name: GetItemTotalBalance :one
SELECT 
    COALESCE(SUM(on_hand), 0)::numeric(14,4) AS total_on_hand,
    COALESCE(SUM(reserved), 0)::numeric(14,4) AS total_reserved,
    COALESCE(SUM(checked_out), 0)::numeric(14,4) AS total_checked_out,
    (COALESCE(SUM(on_hand), 0) - COALESCE(SUM(reserved), 0))::numeric(14,4) AS total_available
FROM stock_balances
WHERE org_id = $1 AND item_id = $2;

-- name: ListStockBalancesByItem :many
SELECT 
    sb.*,
    l.name AS location_name,
    l.is_backup_location
FROM stock_balances sb
JOIN locations l ON l.location_id = sb.location_id
WHERE sb.org_id = $1 AND sb.item_id = $2
ORDER BY l.name ASC;
