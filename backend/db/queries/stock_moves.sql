-- name: CreateStockMove :one
INSERT INTO stock_moves (
    move_id,
    org_id,
    item_id,
    from_location_id,
    to_location_id,
    quantity,
    move_type,
    reference_code,
    actor_id,
    idempotency_key,
    usage_target,
    batch_number,
    expiry_date,
    unit_cost
) VALUES (
    COALESCE(sqlc.narg('move_id'), gen_random_uuid()),
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    sqlc.narg('reference_code'),
    $7,
    sqlc.narg('idempotency_key'),
    sqlc.narg('usage_target'),
    sqlc.narg('batch_number'),
    sqlc.narg('expiry_date'),
    COALESCE(sqlc.narg('unit_cost'), 0)
)
RETURNING *;

-- name: CreateStockMoveLine :one
INSERT INTO stock_move_lines (
    line_id,
    move_id,
    tracking_number,
    quantity
) VALUES (
    COALESCE(sqlc.narg('line_id'), gen_random_uuid()),
    $1,
    $2,
    $3
)
RETURNING *;

-- name: ListMovesByItem :many
SELECT * FROM stock_moves
WHERE org_id = $1 AND item_id = $2
ORDER BY created_at DESC;

-- name: ListMoveLinesByMoveID :many
SELECT * FROM stock_move_lines
WHERE move_id = $1;

-- name: CalculateLocationBalance :one
SELECT 
    (COALESCE(SUM(CASE WHEN to_location_id = $3 THEN quantity ELSE 0 END), 0) -
     COALESCE(SUM(CASE WHEN from_location_id = $3 THEN quantity ELSE 0 END), 0))::numeric(14, 4) AS current_balance
FROM stock_moves
WHERE org_id = $1 AND item_id = $2 AND (to_location_id = $3 OR from_location_id = $3);

-- name: ListStockMoves :many
SELECT * FROM stock_moves
WHERE org_id = $1
  AND (sqlc.narg('item_id')::uuid IS NULL OR item_id = sqlc.narg('item_id'))
  AND (sqlc.narg('location_id')::uuid IS NULL OR from_location_id = sqlc.narg('location_id') OR to_location_id = sqlc.narg('location_id'))
ORDER BY created_at DESC
LIMIT sqlc.arg('limit_count') OFFSET sqlc.arg('offset_count');
