-- Migration: 000005_universal_inventory_b1.down.sql

DROP TABLE IF EXISTS organization_settings;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS stock_balances;

DROP INDEX IF EXISTS idx_stock_moves_item_time;
DROP INDEX IF EXISTS idx_stock_moves_idempotency;
ALTER TABLE stock_moves DROP COLUMN IF EXISTS unit_cost;
ALTER TABLE stock_moves DROP COLUMN IF EXISTS expiry_date;
ALTER TABLE stock_moves DROP COLUMN IF EXISTS batch_number;
ALTER TABLE stock_moves DROP COLUMN IF EXISTS usage_target;
ALTER TABLE stock_moves DROP COLUMN IF EXISTS idempotency_key;

DROP INDEX IF EXISTS idx_items_barcode;
ALTER TABLE items DROP COLUMN IF EXISTS image_url;
ALTER TABLE items DROP COLUMN IF EXISTS barcode;
ALTER TABLE items DROP COLUMN IF EXISTS supplier_id;
ALTER TABLE items DROP COLUMN IF EXISTS category_id;
ALTER TABLE items DROP COLUMN IF EXISTS selling_price;
ALTER TABLE items DROP COLUMN IF EXISTS cost_price;
ALTER TABLE items DROP COLUMN IF EXISTS buffer_stock;
ALTER TABLE items DROP COLUMN IF EXISTS reorder_level;

ALTER TABLE locations DROP COLUMN IF EXISTS is_backup_location;

DROP TABLE IF EXISTS uom_conversions;
DROP TABLE IF EXISTS units_of_measure;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS custom_field_definitions;
DROP TABLE IF EXISTS suppliers;
