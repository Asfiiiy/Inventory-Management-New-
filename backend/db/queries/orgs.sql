-- name: CreateOrganization :one
INSERT INTO organizations (
    org_id,
    name,
    slug,
    plan
) VALUES (
    COALESCE(sqlc.narg('org_id'), gen_random_uuid()),
    $1,
    $2,
    COALESCE(sqlc.narg('plan'), 'standard')
)
RETURNING org_id, name, slug, plan, created_at;

-- name: GetOrganizationByID :one
SELECT org_id, name, slug, plan, created_at
FROM organizations
WHERE org_id = $1
LIMIT 1;

-- name: GetOrganizationBySlug :one
SELECT org_id, name, slug, plan, created_at
FROM organizations
WHERE slug = $1
LIMIT 1;
