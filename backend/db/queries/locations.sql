-- name: CreateLocation :one
INSERT INTO locations (
    location_id,
    org_id,
    name,
    category,
    parent_id
) VALUES (
    COALESCE(sqlc.narg('location_id'), gen_random_uuid()),
    $1,
    $2,
    $3,
    $4
)
RETURNING *;

-- name: GetLocationByID :one
SELECT * FROM locations
WHERE location_id = $1 AND org_id = $2
LIMIT 1;

-- name: ListLocationsByParent :many
SELECT * FROM locations
WHERE org_id = $1 AND parent_id IS NOT DISTINCT FROM $2
ORDER BY name ASC;

-- name: GetSubtreeLocations :many
SELECT * FROM locations
WHERE org_id = $1 AND path <@ sqlc.arg('path')::ltree
ORDER BY path ASC;

-- name: GetLocationByCategory :one
SELECT * FROM locations
WHERE org_id = $1 AND category = $2
LIMIT 1;
