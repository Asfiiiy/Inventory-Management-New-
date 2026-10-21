-- name: CreateUser :one
INSERT INTO users (
    user_id,
    org_id,
    email,
    password_hash,
    role
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users
WHERE user_id = $1 AND org_id = current_org_id();
