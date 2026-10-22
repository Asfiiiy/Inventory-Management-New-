-- name: CreateItem :one
INSERT INTO items (
    item_id,
    org_id,
    sku,
    name,
    tracking_mode,
    base_uom,
    valuation_method,
    attributes
) VALUES (
    COALESCE(sqlc.narg('item_id'), gen_random_uuid()),
    $1,
    $2,
    $3,
    $4,
    COALESCE(sqlc.narg('base_uom'), 'unit'),
    COALESCE(sqlc.narg('valuation_method')::valuation_method, 'fifo'::valuation_method),
    COALESCE(sqlc.narg('attributes'), '{}'::jsonb)
)
RETURNING *;

-- name: GetItemByID :one
SELECT * FROM items
WHERE item_id = $1 AND org_id = $2
LIMIT 1;

-- name: GetItemBySKU :one
SELECT * FROM items
WHERE sku = $1 AND org_id = $2
LIMIT 1;

-- name: SearchItemsByAttribute :many
SELECT * FROM items
WHERE org_id = $1 AND attributes @> sqlc.arg('attributes')::jsonb
ORDER BY name ASC;

-- name: LockItemForUpdate :one
SELECT item_id, org_id, sku, name, tracking_mode
FROM items
WHERE item_id = $1 AND org_id = $2
FOR UPDATE;

-- name: GetItemBySKUOrBarcode :one
SELECT * FROM items
WHERE org_id = $1
  AND (
    sku = $2 
    OR attributes->>'barcode_upc' = $2 
    OR attributes->>'barcode' = $2
    OR barcode = $2
  )
LIMIT 1;
