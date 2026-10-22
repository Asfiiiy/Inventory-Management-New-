-- name: CreateCustomFieldDefinition :one
INSERT INTO custom_field_definitions (
    org_id, field_name, field_type, dropdown_options, is_required
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: ListCustomFieldDefinitions :many
SELECT * FROM custom_field_definitions
WHERE org_id = $1
ORDER BY field_name ASC;

-- name: DeleteCustomFieldDefinition :exec
DELETE FROM custom_field_definitions
WHERE field_id = $1 AND org_id = $2;
