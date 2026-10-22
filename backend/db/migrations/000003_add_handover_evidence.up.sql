-- ====================================================================
-- Whoopit Inventory Platform (v4)
-- Migration: 000003_add_handover_evidence.up.sql
-- Description: Tamper-Evident Custody Handover Evidence & Hash Chain
-- ====================================================================

CREATE TABLE IF NOT EXISTS handover_evidence (
    evidence_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES asset_assignments(assignment_id) ON DELETE CASCADE,
    pdf_sha256 TEXT NOT NULL,
    record_hash TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_handover_evidence_assignment ON handover_evidence (org_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_handover_evidence_record_hash ON handover_evidence (record_hash);

-- Enable and FORCE Row-Level Security on handover_evidence
ALTER TABLE handover_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE handover_evidence FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON handover_evidence;
CREATE POLICY tenant_isolation_policy ON handover_evidence FOR ALL USING (org_id = current_org_id());
