-- ====================================================================
-- Whoopit Inventory Platform (v4)
-- Migration: 000001_init_core_and_ledger.down.sql
-- Description: Revert Core Multi-Tenancy RLS, Location Tree,
--              Universal Catalog, and Two-Sided Stock Ledger
-- ====================================================================

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS tenant_isolation_move_lines ON stock_move_lines;
DROP POLICY IF EXISTS tenant_isolation_policy ON asset_assignments;
DROP POLICY IF EXISTS tenant_isolation_policy ON stock_moves;
DROP POLICY IF EXISTS tenant_isolation_policy ON items;
DROP POLICY IF EXISTS tenant_isolation_policy ON locations;
DROP POLICY IF EXISTS tenant_isolation_policy ON users;

-- 2. Drop Tables in reverse dependency order
DROP TABLE IF EXISTS asset_assignments CASCADE;
DROP TABLE IF EXISTS stock_move_lines CASCADE;
DROP TABLE IF EXISTS stock_moves CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- 3. Drop Triggers and Functions
DROP TRIGGER IF EXISTS trg_locations_path_sync ON locations;
DROP FUNCTION IF EXISTS trg_sync_location_path();
DROP FUNCTION IF EXISTS current_org_id();

-- 4. Drop Types
DROP TYPE IF EXISTS valuation_method CASCADE;
DROP TYPE IF EXISTS tracking_mode CASCADE;
DROP TYPE IF EXISTS location_category CASCADE;
