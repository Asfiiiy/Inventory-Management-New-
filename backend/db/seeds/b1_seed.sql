-- ====================================================================
-- Whoopit Universal Inventory Platform (Phase B1 - Master Seed Script)
-- File: backend/db/seeds/b1_seed.sql
-- Contains: 1 Org, 3 Suppliers, 2 Locations (Active vs Backup Godown),
--           Categories, UOMs, 20 Products, and Sample Stock In Movements.
-- ====================================================================

DO $$
DECLARE
    v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
    v_user_id UUID := 'b0000000-0000-0000-0000-000000000001';
    
    v_sup1 UUID := 'c0000000-0000-0000-0000-000000000001';
    v_sup2 UUID := 'c0000000-0000-0000-0000-000000000002';
    v_sup3 UUID := 'c0000000-0000-0000-0000-000000000003';

    v_cat_it UUID := 'd0000000-0000-0000-0000-000000000001';
    v_cat_tools UUID := 'd0000000-0000-0000-0000-000000000002';
    v_cat_office UUID := 'd0000000-0000-0000-0000-000000000003';

    v_loc_active UUID := 'e0000000-0000-0000-0000-000000000001';
    v_loc_backup UUID := 'e0000000-0000-0000-0000-000000000002';
    v_loc_vendor UUID := 'e0000000-0000-0000-0000-000000000000';

    v_item_id UUID;
    v_idx INT;
    v_sku TEXT;
    v_name TEXT;
    v_barcode TEXT;
    v_cost NUMERIC(14,4);
    v_reorder NUMERIC(14,4);
    v_buffer NUMERIC(14,4);
BEGIN
    -- 1. Ensure Organization
    INSERT INTO organizations (org_id, name, slug, plan)
    VALUES (v_org_id, 'Whoopit Enterprise Demo', 'whoopit-demo', 'enterprise')
    ON CONFLICT (org_id) DO NOTHING;

    -- 2. Organization Settings
    INSERT INTO organization_settings (org_id, allow_negative_stock, currency, time_zone)
    VALUES (v_org_id, false, 'USD', 'UTC')
    ON CONFLICT (org_id) DO UPDATE SET allow_negative_stock = false;

    -- 3. Suppliers (3 Required)
    INSERT INTO suppliers (supplier_id, org_id, name, phone, email, address, is_active)
    VALUES 
        (v_sup1, v_org_id, 'Apex Global Supplies', '+1-555-0101', 'orders@apexsupplies.com', '100 Industrial Pkwy, Chicago, IL', true),
        (v_sup2, v_org_id, 'Nexus Tech Distribution', '+1-555-0102', 'sales@nexustech.io', '400 Silicon Ave, San Jose, CA', true),
        (v_sup3, v_org_id, 'Prime Wholesale Distributors', '+1-555-0103', 'support@primewholesale.net', '88 Logistics Way, Dallas, TX', true)
    ON CONFLICT (org_id, name) DO NOTHING;

    -- 4. Locations (Active Front Shop vs Backup Reserve Godown)
    INSERT INTO locations (location_id, org_id, name, category, is_backup_location)
    VALUES 
        (v_loc_vendor, v_org_id, 'External Vendors (Virtual)', 'virtual_vendor', false),
        (v_loc_active, v_org_id, 'Main Floor / Active Store', 'physical_office', false),
        (v_loc_backup, v_org_id, 'Reserve Godown / Storage Depot', 'physical_warehouse', true)
    ON CONFLICT (location_id) DO NOTHING;

    -- 5. Categories
    INSERT INTO categories (category_id, org_id, name)
    VALUES 
        (v_cat_it, v_org_id, 'Computers & Networking'),
        (v_cat_tools, v_org_id, 'Tools & Hardware Equipment'),
        (v_cat_office, v_org_id, 'Office Supplies & Stationery')
    ON CONFLICT (org_id, name) DO NOTHING;

    -- 6. Units of Measure & Conversion
    INSERT INTO units_of_measure (org_id, name, symbol)
    VALUES 
        (v_org_id, 'Piece', 'pcs'),
        (v_org_id, 'Box', 'box'),
        (v_org_id, 'Kilogram', 'kg')
    ON CONFLICT (org_id, symbol) DO NOTHING;

    -- 7. 20 Products & Initial Stock Movements
    FOR v_idx IN 1..20 LOOP
        v_item_id := ('f0000000-0000-0000-0000-' || lpad(v_idx::text, 12, '0'))::uuid;
        v_sku := 'PROD-' || lpad(v_idx::text, 4, '0');
        v_barcode := '890100' || lpad(v_idx::text, 6, '0');
        v_cost := 25.00 + (v_idx * 5.50);
        v_reorder := 10.00;
        v_buffer := 4.00;

        CASE (v_idx % 3)
            WHEN 0 THEN
                v_name := 'Dell Latitude Laptop Model ' || v_idx;
            WHEN 1 THEN
                v_name := 'Bosch Industrial Power Drill ' || v_idx;
            ELSE
                v_name := 'Ergonomic Desk Accessories Pack ' || v_idx;
        END CASE;

        INSERT INTO items (
            item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method,
            reorder_level, buffer_stock, cost_price, selling_price, barcode, attributes, is_active
        ) VALUES (
            v_item_id, v_org_id, v_sku, v_name, 'none', 'pcs', 'wac',
            v_reorder, v_buffer, v_cost, (v_cost * 1.4)::numeric(14,4), v_barcode,
            jsonb_build_object('warranty_months', 24, 'brand', 'Enterprise Pro', 'model_code', 'MOD-' || v_idx),
            true
        ) ON CONFLICT (org_id, sku) DO NOTHING;

        -- Seed Initial Stock Moves: 20 units into Active Store, 30 units into Backup Godown
        INSERT INTO stock_moves (
            org_id, item_id, from_location_id, to_location_id, quantity,
            move_type, reference_code, actor_id, unit_cost
        ) VALUES 
            (v_org_id, v_item_id, v_loc_vendor, v_loc_active, 20.0000, 'receipt', 'INIT-ACT-' || v_idx, v_user_id, v_cost),
            (v_org_id, v_item_id, v_loc_vendor, v_loc_backup, 30.0000, 'receipt', 'INIT-BAK-' || v_idx, v_user_id, v_cost);

        -- Initialize Balances in stock_balances
        INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out)
        VALUES 
            (v_org_id, v_item_id, v_loc_active, 20.0000, 0, 0),
            (v_org_id, v_item_id, v_loc_backup, 30.0000, 0, 0)
        ON CONFLICT (org_id, item_id, location_id)
        DO UPDATE SET on_hand = EXCLUDED.on_hand;
    END LOOP;

    RAISE NOTICE 'B1 Seed completed successfully: 1 Org, 3 Suppliers, 2 Locations, 20 Products & Initial Balances.';
END $$;
