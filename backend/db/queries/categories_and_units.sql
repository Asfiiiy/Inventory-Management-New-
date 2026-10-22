-- name: CreateCategory :one
INSERT INTO categories (
    org_id, name, parent_id
) VALUES (
    $1, $2, $3
) RETURNING *;

-- name: ListCategories :many
SELECT * FROM categories
WHERE org_id = $1
ORDER BY name ASC;

-- name: CreateUOM :one
INSERT INTO units_of_measure (
    org_id, name, symbol
) VALUES (
    $1, $2, $3
) RETURNING *;

-- name: ListUOMs :many
SELECT * FROM units_of_measure
WHERE org_id = $1
ORDER BY name ASC;

-- name: CreateUOMConversion :one
INSERT INTO uom_conversions (
    org_id, item_id, from_unit, to_base_unit, multiplier
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: GetUOMConversion :one
SELECT * FROM uom_conversions
WHERE org_id = $1 AND (item_id = $2 OR item_id IS NULL) AND from_unit = $3 AND to_base_unit = $4
LIMIT 1;
