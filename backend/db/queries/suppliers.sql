-- name: CreateSupplier :one
INSERT INTO suppliers (
    org_id, name, phone, email, address, notes, is_active
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: ListSuppliers :many
SELECT * FROM suppliers
WHERE org_id = $1 AND is_active = true
ORDER BY name ASC;

-- name: GetSupplierByID :one
SELECT * FROM suppliers
WHERE supplier_id = $1 AND org_id = $2;

-- name: UpdateSupplier :one
UPDATE suppliers
SET name = $3,
    phone = $4,
    email = $5,
    address = $6,
    notes = $7,
    is_active = $8
WHERE supplier_id = $1 AND org_id = $2
RETURNING *;
