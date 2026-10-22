-- ====================================================================
-- Whoopit Inventory Platform (v4)
-- Migration: 000002_add_lots_table.up.sql
-- Description: Batch / Lot Tracking Engine with Expiration Dates & RLS
-- ====================================================================

CREATE TABLE IF NOT EXISTS lots (
    lot_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    tracking_number VARCHAR(128) NOT NULL,
    expiration_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_lots_org_item_tracking UNIQUE(org_id, item_id, tracking_number)
);

CREATE INDEX IF NOT EXISTS idx_lots_item_exp ON lots (org_id, item_id, expiration_date ASC);
CREATE INDEX IF NOT EXISTS idx_lots_tracking ON lots (org_id, tracking_number);

-- Enable and FORCE Row-Level Security on lots
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON lots;
CREATE POLICY tenant_isolation_policy ON lots FOR ALL USING (org_id = current_org_id());
