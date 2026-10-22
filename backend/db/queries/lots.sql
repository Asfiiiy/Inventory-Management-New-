-- name: CreateLot :one
INSERT INTO lots (
    lot_id,
    org_id,
    item_id,
    tracking_number,
    expiration_date
) VALUES (
    COALESCE(sqlc.narg('lot_id'), gen_random_uuid()),
    $1,
    $2,
    $3,
    $4
) RETURNING lot_id, org_id, item_id, tracking_number, expiration_date, created_at;

-- name: GetLotByTracking :one
SELECT lot_id, org_id, item_id, tracking_number, expiration_date, created_at
FROM lots
WHERE org_id = $1 AND item_id = $2 AND tracking_number = $3
LIMIT 1;

-- name: ListLotsByItem :many
SELECT lot_id, org_id, item_id, tracking_number, expiration_date, created_at
FROM lots
WHERE org_id = $1 AND item_id = $2
ORDER BY expiration_date ASC;

-- name: GetAvailableLotsForFEFO :many
SELECT 
    l.lot_id,
    l.org_id,
    l.item_id,
    l.tracking_number,
    l.expiration_date,
    (
        COALESCE(
            (SELECT SUM(sml.quantity)
             FROM stock_move_lines sml
             JOIN stock_moves sm ON sml.move_id = sm.move_id
             WHERE sm.org_id = $1 
               AND sm.item_id = $2 
               AND sm.to_location_id = sqlc.arg('location_id')
               AND sml.tracking_number = l.tracking_number
            ), 0::numeric
        ) - COALESCE(
            (SELECT SUM(sml.quantity)
             FROM stock_move_lines sml
             JOIN stock_moves sm ON sml.move_id = sm.move_id
             WHERE sm.org_id = $1 
               AND sm.item_id = $2 
               AND sm.from_location_id = sqlc.arg('location_id')
               AND sml.tracking_number = l.tracking_number
            ), 0::numeric
        )
    )::numeric AS available_quantity
FROM lots l
WHERE l.org_id = $1 
  AND l.item_id = $2
ORDER BY l.expiration_date ASC;
