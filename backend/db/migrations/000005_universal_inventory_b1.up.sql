-- ====================================================================
-- Whoopit Universal Inventory Platform (Phase B1 - Database Design)
-- Migration: 000005_universal_inventory_b1.up.sql
-- Description: Universal schema pieces: Suppliers, Custom Field Definitions,
--              Categories, Units of Measure & Conversions, Backup Location Tag,
--              Stock Balances, Reservations, Idempotency & Stock Movement Meta,
--              and Organization Settings.
-- ====================================================================

-- 1. Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    phone VARCHAR(64),
    email CITEXT,
    address TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_suppliers_org_name UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_org_id ON suppliers (org_id);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON suppliers;
CREATE POLICY tenant_isolation_policy ON suppliers FOR ALL USING (org_id = current_org_id());

-- 2. Custom Field Definitions Table
CREATE TABLE IF NOT EXISTS custom_field_definitions (
    field_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    field_name VARCHAR(64) NOT NULL,
    field_type VARCHAR(32) NOT NULL CHECK (field_type IN ('text', 'number', 'decimal', 'date', 'dropdown', 'boolean', 'barcode')),
    dropdown_options JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_custom_fields_org_name UNIQUE(org_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_org_id ON custom_field_definitions (org_id);
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON custom_field_definitions;
CREATE POLICY tenant_isolation_policy ON custom_field_definitions FOR ALL USING (org_id = current_org_id());

-- 3. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    category_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    parent_id UUID REFERENCES categories(category_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_categories_org_name UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_org_id ON categories (org_id);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON categories;
CREATE POLICY tenant_isolation_policy ON categories FOR ALL USING (org_id = current_org_id());

-- 4. Units of Measure Table
CREATE TABLE IF NOT EXISTS units_of_measure (
    unit_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    symbol VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_uom_org_symbol UNIQUE(org_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_uom_org_id ON units_of_measure (org_id);
ALTER TABLE units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE units_of_measure FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON units_of_measure;
CREATE POLICY tenant_isolation_policy ON units_of_measure FOR ALL USING (org_id = current_org_id());

-- 5. UOM Conversions Table
CREATE TABLE IF NOT EXISTS uom_conversions (
    conversion_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(item_id) ON DELETE CASCADE,
    from_unit VARCHAR(32) NOT NULL,
    to_base_unit VARCHAR(32) NOT NULL,
    multiplier NUMERIC(14, 4) NOT NULL CHECK (multiplier > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_uom_conversions_item_units UNIQUE(org_id, item_id, from_unit, to_base_unit)
);

CREATE INDEX IF NOT EXISTS idx_uom_conversions_org_item ON uom_conversions (org_id, item_id);
ALTER TABLE uom_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE uom_conversions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON uom_conversions;
CREATE POLICY tenant_isolation_policy ON uom_conversions FOR ALL USING (org_id = current_org_id());

-- 6. Location Backup / Godown Tag
ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_backup_location BOOLEAN NOT NULL DEFAULT false;

-- 7. Items Table Enhancements (Reorder Level, Buffer Stock, Pricing, Supplier, Category, Barcode)
ALTER TABLE items ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0);
ALTER TABLE items ADD COLUMN IF NOT EXISTS buffer_stock NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (buffer_stock >= 0);
ALTER TABLE items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14, 4) NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14, 4) NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(category_id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(supplier_id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS barcode VARCHAR(128);
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_items_barcode ON items (org_id, barcode) WHERE barcode IS NOT NULL;

-- 8. Stock Movements Table Enhancements (Idempotency, Target, Batch, Expiry, Cost)
ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS usage_target VARCHAR(128);
ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS batch_number VARCHAR(128);
ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_moves_idempotency ON stock_moves (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_moves_item_time ON stock_moves (org_id, item_id, created_at DESC);

-- 9. Stock Balances Table (Fast Current Balance with Negative / Overdraft Guard)
CREATE TABLE IF NOT EXISTS stock_balances (
    balance_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
    on_hand NUMERIC(14, 4) NOT NULL DEFAULT 0,
    reserved NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    checked_out NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (checked_out >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stock_balances_org_item_loc UNIQUE(org_id, item_id, location_id),
    CONSTRAINT chk_reserved_lte_on_hand CHECK (reserved <= on_hand)
);

CREATE INDEX IF NOT EXISTS idx_stock_balances_org_item ON stock_balances (org_id, item_id);
CREATE INDEX IF NOT EXISTS idx_stock_balances_org_loc ON stock_balances (org_id, location_id);
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON stock_balances;
CREATE POLICY tenant_isolation_policy ON stock_balances FOR ALL USING (org_id = current_org_id());

-- 10. Reservations Table (Holds & Returnable Tool Tracking)
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
    quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
    kind VARCHAR(32) NOT NULL CHECK (kind IN ('reserve', 'check_out')),
    target VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'fulfilled', 'returned')),
    due_back_date TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reservations_org_status ON reservations (org_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_org_item ON reservations (org_id, item_id);
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON reservations;
CREATE POLICY tenant_isolation_policy ON reservations FOR ALL USING (org_id = current_org_id());

-- 11. Organization Settings Table (Negative Stock Option, Currency, Timezone)
CREATE TABLE IF NOT EXISTS organization_settings (
    org_id UUID PRIMARY KEY REFERENCES organizations(org_id) ON DELETE CASCADE,
    allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    time_zone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    alert_email CITEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON organization_settings;
CREATE POLICY tenant_isolation_policy ON organization_settings FOR ALL USING (org_id = current_org_id());
