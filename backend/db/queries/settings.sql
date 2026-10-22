-- name: UpsertOrganizationSettings :one
INSERT INTO organization_settings (
    org_id, allow_negative_stock, currency, time_zone, alert_email, updated_at
) VALUES (
    $1, $2, $3, $4, $5, CURRENT_TIMESTAMP
)
ON CONFLICT (org_id)
DO UPDATE SET
    allow_negative_stock = EXCLUDED.allow_negative_stock,
    currency = EXCLUDED.currency,
    time_zone = EXCLUDED.time_zone,
    alert_email = EXCLUDED.alert_email,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: GetOrganizationSettings :one
SELECT * FROM organization_settings
WHERE org_id = $1;
