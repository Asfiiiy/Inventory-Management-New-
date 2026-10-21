-- ====================================================================
-- Whoopit Inventory Platform (v4)
-- Migration: 000001_init_core_and_ledger.up.sql
-- Description: Core Multi-Tenancy RLS, Location Tree (ltree),
--              Universal Catalog, and Two-Sided Stock Ledger
-- ====================================================================

-- 1. Ensure Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 2. Core Multi-Tenancy Session Accessor Function
CREATE OR REPLACE FUNCTION current_org_id() 
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.org_id', true), '')::uuid;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
    org_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    slug CITEXT UNIQUE NOT NULL,
    plan VARCHAR(32) NOT NULL DEFAULT 'standard',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    email CITEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'employee',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_org_email UNIQUE(org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users (org_id);

-- 5. Hierarchical Location Engine (ltree)
DO $$ BEGIN
    CREATE TYPE location_category AS ENUM (
        'physical_warehouse',
        'physical_office',
        'virtual_vendor',
        'virtual_customer',
        'virtual_scrap',
        'virtual_custody',
        'virtual_production'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS locations (
    location_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    category location_category NOT NULL,
    parent_id UUID REFERENCES locations(location_id) ON DELETE RESTRICT,
    path LTREE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_locations_org_path UNIQUE(org_id, path)
);

CREATE INDEX IF NOT EXISTS idx_locations_path_gist ON locations USING GIST (path);
CREATE INDEX IF NOT EXISTS idx_locations_org_id ON locations (org_id);
CREATE INDEX IF NOT EXISTS idx_locations_parent_id ON locations (parent_id);

-- Trigger Function to Automatically Synchronize ltree Path
CREATE OR REPLACE FUNCTION trg_sync_location_path()
RETURNS TRIGGER AS $$
DECLARE
    parent_path LTREE;
    node_label TEXT;
BEGIN
    IF NEW.location_id IS NULL THEN
        NEW.location_id := gen_random_uuid();
    END IF;

    -- Format a valid ltree label prefixing with 'loc_' and replacing hyphens
    node_label := 'loc_' || replace(NEW.location_id::text, '-', '_');

    IF NEW.parent_id IS NULL THEN
        NEW.path := node_label::ltree;
    ELSE
        SELECT path INTO parent_path 
        FROM locations 
        WHERE location_id = NEW.parent_id AND org_id = NEW.org_id;

        IF parent_path IS NULL THEN
            RAISE EXCEPTION 'Parent location % does not exist in org %', NEW.parent_id, NEW.org_id;
        END IF;

        NEW.path := parent_path || node_label::ltree;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_locations_path_sync ON locations;
CREATE TRIGGER trg_locations_path_sync
BEFORE INSERT OR UPDATE OF parent_id
ON locations
FOR EACH ROW
EXECUTE FUNCTION trg_sync_location_path();

-- 6. Universal Catalog & Dynamic Schema
DO $$ BEGIN
    CREATE TYPE tracking_mode AS ENUM ('none', 'serialized', 'bulk', 'batch');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE valuation_method AS ENUM ('fifo', 'wac');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS items (
    item_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    sku CITEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    tracking_mode tracking_mode NOT NULL DEFAULT 'none',
    base_uom VARCHAR(16) NOT NULL DEFAULT 'unit',
    valuation_method valuation_method NOT NULL DEFAULT 'fifo',
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_items_org_sku UNIQUE(org_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_items_attributes_gin ON items USING GIN (attributes jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_items_org_id ON items (org_id);
CREATE INDEX IF NOT EXISTS idx_items_sku_trgm ON items USING GIN (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_items_name_trgm ON items USING GIN (name gin_trgm_ops);

-- 7. Two-Sided Stock Movement Ledger (Append-Only)
CREATE TABLE IF NOT EXISTS stock_moves (
    move_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(item_id),
    from_location_id UUID NOT NULL REFERENCES locations(location_id),
    to_location_id UUID NOT NULL REFERENCES locations(location_id),
    quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
    move_type VARCHAR(32) NOT NULL,
    reference_code VARCHAR(128),
    actor_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_moves_composite ON stock_moves (org_id, item_id, to_location_id, from_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_from_loc ON stock_moves (from_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_to_loc ON stock_moves (to_location_id);

CREATE TABLE IF NOT EXISTS stock_move_lines (
    line_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    move_id UUID NOT NULL REFERENCES stock_moves(move_id) ON DELETE CASCADE,
    tracking_number VARCHAR(128) NOT NULL,
    quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_move_lines_move_id ON stock_move_lines (move_id);
CREATE INDEX IF NOT EXISTS idx_stock_move_lines_tracking ON stock_move_lines (tracking_number);

-- 8. Anti-Overlap Custody Index (Asset Assignments)
CREATE TABLE IF NOT EXISTS asset_assignments (
    assignment_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES items(item_id),
    assigned_to_user_id UUID NOT NULL REFERENCES users(user_id),
    checkout_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expected_return_date TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    condition_grade VARCHAR(16) DEFAULT 'A'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_no_double_assignment ON asset_assignments (asset_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_asset_assignments_org_id ON asset_assignments (org_id);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_user_id ON asset_assignments (assigned_to_user_id);

-- 9. Row-Level Security (RLS) Enforcement & Policies

-- Enable and FORCE RLS on users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON users;
CREATE POLICY tenant_isolation_policy ON users FOR ALL USING (org_id = current_org_id());

-- Enable and FORCE RLS on locations
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON locations;
CREATE POLICY tenant_isolation_policy ON locations FOR ALL USING (org_id = current_org_id());

-- Enable and FORCE RLS on items
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON items;
CREATE POLICY tenant_isolation_policy ON items FOR ALL USING (org_id = current_org_id());

-- Enable and FORCE RLS on stock_moves
ALTER TABLE stock_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_moves FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON stock_moves;
CREATE POLICY tenant_isolation_policy ON stock_moves FOR ALL USING (org_id = current_org_id());

-- Enable and FORCE RLS on stock_move_lines
ALTER TABLE stock_move_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_move_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_move_lines ON stock_move_lines;
CREATE POLICY tenant_isolation_move_lines ON stock_move_lines FOR ALL
USING (EXISTS (SELECT 1 FROM stock_moves sm WHERE sm.move_id = stock_move_lines.move_id AND sm.org_id = current_org_id()));

-- Enable and FORCE RLS on asset_assignments
ALTER TABLE asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON asset_assignments;
CREATE POLICY tenant_isolation_policy ON asset_assignments FOR ALL USING (org_id = current_org_id());
