-- name: CreateReservation :one
INSERT INTO reservations (
    org_id, item_id, location_id, quantity, kind, target, status, due_back_date, created_by
) VALUES (
    $1, $2, $3, $4, $5, $6, 'active', $7, $8
) RETURNING *;

-- name: ListActiveReservationsByItem :many
SELECT * FROM reservations
WHERE org_id = $1 AND item_id = $2 AND status = 'active'
ORDER BY created_at DESC;

-- name: UpdateReservationStatus :one
UPDATE reservations
SET status = $3,
    updated_at = CURRENT_TIMESTAMP
WHERE reservation_id = $1 AND org_id = $2
RETURNING *;
