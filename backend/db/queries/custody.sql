-- name: CreateAssetAssignment :one
INSERT INTO asset_assignments (
    assignment_id,
    org_id,
    asset_id,
    assigned_to_user_id,
    expected_return_date,
    condition_grade
) VALUES (
    COALESCE(sqlc.narg('assignment_id'), gen_random_uuid()),
    $1,
    $2,
    $3,
    sqlc.narg('expected_return_date'),
    COALESCE(sqlc.narg('condition_grade'), 'A')
)
RETURNING assignment_id, org_id, asset_id, assigned_to_user_id, checkout_date, expected_return_date, returned_at, condition_grade;

-- name: GetActiveAssignmentByAssetID :one
SELECT assignment_id, org_id, asset_id, assigned_to_user_id, checkout_date, expected_return_date, returned_at, condition_grade
FROM asset_assignments
WHERE org_id = $1 AND asset_id = $2 AND returned_at IS NULL
LIMIT 1;

-- name: GetAssignmentByID :one
SELECT assignment_id, org_id, asset_id, assigned_to_user_id, checkout_date, expected_return_date, returned_at, condition_grade
FROM asset_assignments
WHERE assignment_id = $1 AND org_id = $2
LIMIT 1;

-- name: CloseAssetAssignment :one
UPDATE asset_assignments
SET returned_at = CURRENT_TIMESTAMP,
    condition_grade = COALESCE(sqlc.narg('condition_grade'), condition_grade)
WHERE assignment_id = $1 AND org_id = $2 AND returned_at IS NULL
RETURNING assignment_id, org_id, asset_id, assigned_to_user_id, checkout_date, expected_return_date, returned_at, condition_grade;

-- name: ListActiveAssignmentsByEmployee :many
SELECT a.assignment_id, a.org_id, a.asset_id, a.assigned_to_user_id, a.checkout_date, a.expected_return_date, a.returned_at, a.condition_grade,
       i.sku AS asset_sku, i.name AS asset_name, i.attributes AS asset_attributes
FROM asset_assignments a
JOIN items i ON i.item_id = a.asset_id
WHERE a.org_id = $1 AND a.assigned_to_user_id = $2 AND a.returned_at IS NULL
ORDER BY a.checkout_date DESC;

-- name: GetCustodySummary :one
SELECT 
    COUNT(DISTINCT i.item_id)::bigint AS total_assets,
    COUNT(DISTINCT CASE WHEN a.returned_at IS NULL AND a.assignment_id IS NOT NULL THEN a.asset_id END)::bigint AS deployed_to_employees,
    (COUNT(DISTINCT i.item_id) - COUNT(DISTINCT CASE WHEN a.returned_at IS NULL AND a.assignment_id IS NOT NULL THEN a.asset_id END))::bigint AS remaining_in_storage
FROM items i
LEFT JOIN asset_assignments a ON a.asset_id = i.item_id AND a.org_id = i.org_id AND a.returned_at IS NULL
WHERE i.org_id = $1 AND i.is_active = true;

-- name: CreateHandoverEvidence :one
INSERT INTO handover_evidence (
    evidence_id,
    org_id,
    assignment_id,
    pdf_sha256,
    record_hash,
    previous_hash
) VALUES (
    COALESCE(sqlc.narg('evidence_id'), gen_random_uuid()),
    $1, $2, $3, $4, $5
) RETURNING evidence_id, org_id, assignment_id, pdf_sha256, record_hash, previous_hash, created_at;

-- name: GetLatestEvidenceByOrg :one
SELECT evidence_id, org_id, assignment_id, pdf_sha256, record_hash, previous_hash, created_at
FROM handover_evidence
WHERE org_id = $1
ORDER BY created_at DESC
LIMIT 1;

-- name: GetHandoverEvidenceByAssignmentID :one
SELECT evidence_id, org_id, assignment_id, pdf_sha256, record_hash, previous_hash, created_at
FROM handover_evidence
WHERE org_id = $1 AND assignment_id = $2
LIMIT 1;
