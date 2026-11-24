-- ====================================================================
-- Whoopit Office IT Inventory & Asset Lifecycle Platform
-- Migration: 000007_office_it_lifecycle.up.sql
-- Description: Multi-unit Employee Custody Assignments, Digital Signatures,
--              Employee IDs, and Faulty / Vendor Repair Tracking Ledger.
-- ====================================================================

-- 0. Trial cutoff used by the 30-day evaluation license
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- 1. Allow multiple units of an IT item (e.g. 20 Laptops, 50 Mice) to be assigned to multiple employees concurrently
DROP INDEX IF EXISTS idx_no_double_assignment;

-- 2. Extend asset_assignments with Employee ID, Name, Department, Quantity, Serial Number, and Online Digital Signature
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 4) NOT NULL DEFAULT 1;
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS employee_code VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS employee_name VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS employee_department VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS employee_email VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS serial_number VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS signature_data TEXT NOT NULL DEFAULT '';
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

-- 3. Office IT Faulty & Vendor Repair Tracking Ledger
CREATE TABLE IF NOT EXISTS asset_repairs (
    repair_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    quantity NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    serial_number VARCHAR(128) NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'FAULTY' CHECK (status IN ('FAULTY', 'AT_VENDOR', 'REPAIRED', 'SCRAPPED')),
    issue_description TEXT NOT NULL DEFAULT '',
    reported_by VARCHAR(128) NOT NULL DEFAULT '',
    vendor_name VARCHAR(128) NOT NULL DEFAULT '',
    vendor_contact VARCHAR(128) NOT NULL DEFAULT '',
    ticket_reference VARCHAR(128) NOT NULL DEFAULT '',
    sent_date TIMESTAMPTZ,
    expected_return_date TIMESTAMPTZ,
    repaired_date TIMESTAMPTZ,
    repair_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
    resolution_notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_repairs_org_id ON asset_repairs (org_id);
CREATE INDEX IF NOT EXISTS idx_asset_repairs_item_id ON asset_repairs (org_id, item_id);
CREATE INDEX IF NOT EXISTS idx_asset_repairs_status ON asset_repairs (org_id, status);

ALTER TABLE asset_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_repairs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON asset_repairs;
CREATE POLICY tenant_isolation_policy ON asset_repairs FOR ALL USING (org_id = current_org_id());
