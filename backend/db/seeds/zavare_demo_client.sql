-- ====================================================================
-- Demo client company for js3055391@gmail.com (Company Admin)
-- Password: Password123!
-- Populates org, staff, vendors, catalog, stock, custody, repairs.
-- ====================================================================

DO $$
DECLARE
    v_org_id UUID := 'a1111111-1111-4111-8111-111111111111';
    v_admin_id UUID := 'b1111111-1111-4111-8111-111111111111';
    v_staff1 UUID := 'b1111111-1111-4111-8111-111111111112';
    v_staff2 UUID := 'b1111111-1111-4111-8111-111111111113';
    v_staff3 UUID := 'b1111111-1111-4111-8111-111111111114';
    -- argon2id hash for Password123!
    v_pw TEXT := '$argon2id$v=19$m=65536,t=3,p=2$3X+A4v71smNJez1ZVuKJSg$CknRNg1axOUMU7oE5o9UGreMYMOsuQlimWyQv14OHMg';

    v_sup1 UUID := 'c1111111-1111-4111-8111-111111111111';
    v_sup2 UUID := 'c1111111-1111-4111-8111-111111111112';
    v_sup3 UUID := 'c1111111-1111-4111-8111-111111111113';

    v_cat_laptops UUID := 'd1111111-1111-4111-8111-111111111111';
    v_cat_monitors UUID := 'd1111111-1111-4111-8111-111111111112';
    v_cat_consumables UUID := 'd1111111-1111-4111-8111-111111111113';
    v_cat_peripherals UUID := 'd1111111-1111-4111-8111-111111111114';

    v_loc_vendor UUID := 'e1111111-1111-4111-8111-111111111100';
    v_loc_customer UUID := 'e1111111-1111-4111-8111-111111111101';
    v_loc_scrap UUID := 'e1111111-1111-4111-8111-111111111102';
    v_loc_custody UUID := 'e1111111-1111-4111-8111-111111111103';
    v_loc_active UUID := 'e1111111-1111-4111-8111-111111111104';
    v_loc_backup UUID := 'e1111111-1111-4111-8111-111111111105';

    v_item_mbp UUID := 'f1111111-1111-4111-8111-111111111101';
    v_item_dell UUID := 'f1111111-1111-4111-8111-111111111102';
    v_item_monitor UUID := 'f1111111-1111-4111-8111-111111111103';
    v_item_mouse UUID := 'f1111111-1111-4111-8111-111111111104';
    v_item_kbd UUID := 'f1111111-1111-4111-8111-111111111105';
    v_item_cable UUID := 'f1111111-1111-4111-8111-111111111106';
    v_item_toner UUID := 'f1111111-1111-4111-8111-111111111107';
    v_item_dock UUID := 'f1111111-1111-4111-8111-111111111108';
BEGIN
    PERFORM set_config('row_security', 'off', true);

    -- Clean re-seed for this demo org
    DELETE FROM organizations WHERE org_id = v_org_id OR slug = 'zavare-demo';

    INSERT INTO organizations (org_id, name, slug, plan, created_at)
    VALUES (v_org_id, 'Zavare Technologies', 'zavare-demo', 'enterprise', NOW() - INTERVAL '45 days');

    INSERT INTO organization_settings (org_id, allow_negative_stock, currency, time_zone, alert_email)
    VALUES (v_org_id, false, 'USD', 'Asia/Karachi', 'js3055391@gmail.com')
    ON CONFLICT (org_id) DO UPDATE
      SET alert_email = EXCLUDED.alert_email, currency = EXCLUDED.currency, time_zone = EXCLUDED.time_zone;

    PERFORM set_config('app.org_id', v_org_id::text, true);

    INSERT INTO locations (location_id, org_id, name, category, is_backup_location)
    VALUES
        (v_loc_vendor, v_org_id, 'External Vendors (Virtual)', 'virtual_vendor', false),
        (v_loc_customer, v_org_id, 'Customers / Dispatch (Virtual)', 'virtual_customer', false),
        (v_loc_scrap, v_org_id, 'Inventory Scrap & Loss (Virtual)', 'virtual_scrap', false),
        (v_loc_custody, v_org_id, 'Staff Custody (Virtual)', 'virtual_custody', false),
        (v_loc_active, v_org_id, 'Main Floor / Active Store', 'physical_office', false),
        (v_loc_backup, v_org_id, 'Reserve Godown / Storage Depot', 'physical_warehouse', true);

    INSERT INTO users (user_id, org_id, email, password_hash, role, name, is_active, created_at, employee_code, department, desk_location)
    VALUES
        (v_admin_id, v_org_id, 'js3055391@gmail.com', v_pw, 'owner', 'Mohsin Zafar', true, NOW() - INTERVAL '45 days', 'EMP-001', 'IT', 'Floor 2 · Desk A1'),
        (v_staff1, v_org_id, 'ayesha@zavare.demo', v_pw, 'staff', 'Ayesha Malik', true, NOW() - INTERVAL '30 days', 'EMP-1024', 'Engineering', 'Floor 3 · Desk 12'),
        (v_staff2, v_org_id, 'bilal@zavare.demo', v_pw, 'staff', 'Bilal Ahmed', true, NOW() - INTERVAL '20 days', 'EMP-1025', 'Finance', 'Floor 1 · Desk 4'),
        (v_staff3, v_org_id, 'sara@zavare.demo', v_pw, 'staff', 'Sara Khan', true, NOW() - INTERVAL '10 days', 'EMP-1026', 'HR', 'Floor 2 · Desk 8');

    INSERT INTO suppliers (supplier_id, org_id, name, phone, email, address, notes, is_active)
    VALUES
        (v_sup1, v_org_id, 'Dell Technologies PK', '+92 21 111 335 526', 'orders.pk@dell.com', 'Karachi · Clifton', 'Hardware OEM', true),
        (v_sup2, v_org_id, 'Apple Authorized Reseller', '+92 21 34567890', 'b2b@applereseller.pk', 'Lahore · Gulberg', 'MacBook / displays', true),
        (v_sup3, v_org_id, 'TechCare Repair Center', '+92 300 1234567', 'desk@techcare.pk', 'Islamabad · F-7', 'Warranty & out-of-warranty repairs', true);

    INSERT INTO categories (category_id, org_id, name)
    VALUES
        (v_cat_laptops, v_org_id, 'Laptops'),
        (v_cat_monitors, v_org_id, 'Monitors'),
        (v_cat_consumables, v_org_id, 'Consumables'),
        (v_cat_peripherals, v_org_id, 'Peripherals');

    INSERT INTO units_of_measure (org_id, name, symbol)
    VALUES
        (v_org_id, 'Piece', 'pcs'),
        (v_org_id, 'Box', 'box')
    ON CONFLICT DO NOTHING;

    INSERT INTO items (
        item_id, org_id, sku, name, tracking_mode, base_uom, valuation_method,
        reorder_level, buffer_stock, cost_price, selling_price, barcode, category_id, supplier_id,
        attributes, is_active
    ) VALUES
        (v_item_mbp, v_org_id, 'MBP-M3-ENT-16', 'Apple MacBook Pro M3 Max 16-inch', 'none', 'pcs', 'wac',
         2, 1, 3200, 3200, '890100000001', v_cat_laptops, v_sup2,
         jsonb_build_object('brand','Apple','warranty_expiry','2026-12-05','purchase_date','2025-01-15','ram','36GB'), true),
        (v_item_dell, v_org_id, 'DELL-LAT-5540', 'Dell Latitude 5540 Business Laptop', 'none', 'pcs', 'wac',
         3, 1, 1100, 1100, '890100000002', v_cat_laptops, v_sup1,
         jsonb_build_object('brand','Dell','warranty_expiry','2027-03-01','purchase_date','2025-06-01','ram','16GB'), true),
        (v_item_monitor, v_org_id, 'MON-U2723QE', 'Dell UltraSharp 27 4K Monitor', 'none', 'pcs', 'wac',
         2, 1, 450, 450, '890100000003', v_cat_monitors, v_sup1,
         jsonb_build_object('brand','Dell','warranty_expiry','2026-11-25','purchase_date','2024-11-20'), true),
        (v_item_mouse, v_org_id, 'MSE-MX3', 'Logitech MX Master 3S Mouse', 'none', 'pcs', 'wac',
         5, 2, 85, 85, '890100000004', v_cat_peripherals, v_sup1,
         jsonb_build_object('brand','Logitech','warranty_months',12), true),
        (v_item_kbd, v_org_id, 'KBD-MXKEYS', 'Logitech MX Keys Keyboard', 'none', 'pcs', 'wac',
         5, 2, 95, 95, '890100000005', v_cat_peripherals, v_sup1,
         jsonb_build_object('brand','Logitech','warranty_months',12), true),
        (v_item_cable, v_org_id, 'CBL-USB-C-2M', 'USB-C Charging Cable 2m (bulk)', 'none', 'pcs', 'wac',
         20, 8, 8.5, 8.5, '890100000006', v_cat_consumables, v_sup1,
         jsonb_build_object('brand','Generic','consumable',true), true),
        (v_item_toner, v_org_id, 'TNR-HP-85A', 'HP 85A Black Toner Cartridge', 'none', 'pcs', 'wac',
         4, 2, 55, 55, '890100000007', v_cat_consumables, v_sup1,
         jsonb_build_object('brand','HP','consumable',true), true),
        (v_item_dock, v_org_id, 'DOCK-WD19', 'Dell WD19TB Thunderbolt Dock', 'none', 'pcs', 'wac',
         2, 1, 220, 220, '890100000008', v_cat_peripherals, v_sup1,
         jsonb_build_object('brand','Dell','warranty_expiry','2027-01-10'), true);

    -- Inward receipts + balances
    INSERT INTO stock_moves (org_id, item_id, from_location_id, to_location_id, quantity, move_type, reference_code, actor_id, unit_cost, created_at)
    VALUES
        (v_org_id, v_item_mbp, v_loc_vendor, v_loc_active, 8, 'receipt', 'PO-ZAV-1001', v_admin_id, 3200, NOW() - INTERVAL '40 days'),
        (v_org_id, v_item_dell, v_loc_vendor, v_loc_active, 15, 'receipt', 'PO-ZAV-1002', v_admin_id, 1100, NOW() - INTERVAL '38 days'),
        (v_org_id, v_item_monitor, v_loc_vendor, v_loc_active, 10, 'receipt', 'PO-ZAV-1003', v_admin_id, 450, NOW() - INTERVAL '35 days'),
        (v_org_id, v_item_mouse, v_loc_vendor, v_loc_active, 25, 'receipt', 'PO-ZAV-1004', v_admin_id, 85, NOW() - INTERVAL '30 days'),
        (v_org_id, v_item_kbd, v_loc_vendor, v_loc_active, 20, 'receipt', 'PO-ZAV-1005', v_admin_id, 95, NOW() - INTERVAL '30 days'),
        (v_org_id, v_item_cable, v_loc_vendor, v_loc_active, 80, 'receipt', 'PO-ZAV-1006', v_admin_id, 8.5, NOW() - INTERVAL '25 days'),
        (v_org_id, v_item_toner, v_loc_vendor, v_loc_active, 12, 'receipt', 'PO-ZAV-1007', v_admin_id, 55, NOW() - INTERVAL '22 days'),
        (v_org_id, v_item_dock, v_loc_vendor, v_loc_active, 6, 'receipt', 'PO-ZAV-1008', v_admin_id, 220, NOW() - INTERVAL '20 days'),
        (v_org_id, v_item_dell, v_loc_vendor, v_loc_backup, 5, 'receipt', 'PO-ZAV-1009', v_admin_id, 1100, NOW() - INTERVAL '18 days');

    -- Consumable issues (stock-out)
    INSERT INTO stock_moves (org_id, item_id, from_location_id, to_location_id, quantity, move_type, reference_code, usage_target, actor_id, unit_cost, created_at)
    VALUES
        (v_org_id, v_item_cable, v_loc_active, v_loc_customer, 12, 'issue', 'DSP-2201', 'Engineering', v_admin_id, 8.5, NOW() - INTERVAL '12 days'),
        (v_org_id, v_item_toner, v_loc_active, v_loc_customer, 3, 'issue', 'DSP-2202', 'Finance', v_admin_id, 55, NOW() - INTERVAL '8 days'),
        (v_org_id, v_item_cable, v_loc_active, v_loc_customer, 6, 'issue', 'DSP-2203', 'HR', v_admin_id, 8.5, NOW() - INTERVAL '3 days');

    INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out)
    VALUES
        (v_org_id, v_item_mbp, v_loc_active, 5, 0, 3),
        (v_org_id, v_item_dell, v_loc_active, 10, 0, 5),
        (v_org_id, v_item_dell, v_loc_backup, 5, 0, 0),
        (v_org_id, v_item_monitor, v_loc_active, 7, 0, 2),
        (v_org_id, v_item_mouse, v_loc_active, 20, 0, 4),
        (v_org_id, v_item_kbd, v_loc_active, 16, 0, 3),
        (v_org_id, v_item_cable, v_loc_active, 62, 0, 0),
        (v_org_id, v_item_toner, v_loc_active, 9, 0, 0),
        (v_org_id, v_item_dock, v_loc_active, 4, 0, 2);

    -- Custody handovers (active + one returned)
    INSERT INTO asset_assignments (
        org_id, asset_id, assigned_to_user_id, checkout_date, expected_return_date,
        quantity, employee_code, employee_name, employee_department, employee_email,
        serial_number, signature_data, notes, condition_grade
    ) VALUES
        (v_org_id, v_item_mbp, v_staff1, NOW() - INTERVAL '14 days', NOW() + INTERVAL '350 days',
         1, 'EMP-1024', 'Ayesha Malik', 'Engineering', 'ayesha@zavare.demo',
         'C02XMBP001', 'data:image/png;base64,iVBORw0KGgo=', 'Onboarding kit', 'EXCELLENT'),
        (v_org_id, v_item_dell, v_staff2, NOW() - INTERVAL '10 days', NOW() + INTERVAL '340 days',
         1, 'EMP-1025', 'Bilal Ahmed', 'Finance', 'bilal@zavare.demo',
         'DLL5540-7781', 'data:image/png;base64,iVBORw0KGgo=', 'Finance laptop', 'GOOD'),
        (v_org_id, v_item_monitor, v_staff1, NOW() - INTERVAL '14 days', NULL,
         1, 'EMP-1024', 'Ayesha Malik', 'Engineering', 'ayesha@zavare.demo',
         'MON-U2723-441', 'data:image/png;base64,iVBORw0KGgo=', 'Dual display', 'EXCELLENT'),
        (v_org_id, v_item_dock, v_staff2, NOW() - INTERVAL '10 days', NULL,
         1, 'EMP-1025', 'Bilal Ahmed', 'Finance', 'bilal@zavare.demo',
         'WD19-9912', 'data:image/png;base64,iVBORw0KGgo=', '', 'GOOD'),
        (v_org_id, v_item_mouse, v_staff3, NOW() - INTERVAL '7 days', NOW() + INTERVAL '180 days',
         1, 'EMP-1026', 'Sara Khan', 'HR', 'sara@zavare.demo',
         'MX3-5510', 'data:image/png;base64,iVBORw0KGgo=', '', 'GOOD');

    INSERT INTO asset_assignments (
        org_id, asset_id, assigned_to_user_id, checkout_date, expected_return_date, returned_at,
        quantity, employee_code, employee_name, employee_department, employee_email,
        serial_number, signature_data, notes, condition_grade
    ) VALUES
        (v_org_id, v_item_kbd, v_staff3, NOW() - INTERVAL '40 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days',
         1, 'EMP-1026', 'Sara Khan', 'HR', 'sara@zavare.demo',
         'MXK-2201', 'data:image/png;base64,iVBORw0KGgo=', 'Returned after role change', 'GOOD');

    -- Repairs pipeline
    INSERT INTO asset_repairs (
        org_id, item_id, quantity, serial_number, status, issue_description, reported_by,
        vendor_name, vendor_contact, ticket_reference, sent_date, expected_return_date,
        repair_cost, resolution_notes, created_at, updated_at
    ) VALUES
        (v_org_id, v_item_dell, 1, 'DLL5540-1120', 'FAULTY', 'Keyboard keys intermittent', 'Mohsin Zafar',
         '', '', 'FLT-901', NULL, NULL, 0, '', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
        (v_org_id, v_item_mbp, 1, 'C02XMBP088', 'AT_VENDOR', 'Battery swelling under warranty', 'Ayesha Malik',
         'TechCare Repair Center', 'desk@techcare.pk', 'TC-44021', NOW() - INTERVAL '6 days', NOW() + INTERVAL '8 days',
         0, 'Waiting for Apple parts', NOW() - INTERVAL '6 days', NOW() - INTERVAL '1 day'),
        (v_org_id, v_item_monitor, 1, 'MON-U2723-010', 'REPAIRED', 'No power / PSU fault', 'Bilal Ahmed',
         'Dell Technologies PK', 'orders.pk@dell.com', 'DELL-R-7781', NOW() - INTERVAL '20 days', NOW() - INTERVAL '5 days',
         120, 'PSU replaced under AMC', NOW() - INTERVAL '20 days', NOW() - INTERVAL '5 days');

    UPDATE asset_repairs
    SET repaired_date = NOW() - INTERVAL '5 days'
    WHERE org_id = v_org_id AND status = 'REPAIRED';

    INSERT INTO audit_log (org_id, user_id, action, entity_type, entity_id, ip_address, created_at)
    VALUES
        (v_org_id, v_admin_id, 'SOFTWARE_PROVISIONED', 'organization', v_org_id::text, '127.0.0.1', NOW() - INTERVAL '45 days'),
        (v_org_id, v_admin_id, 'STOCK_RECEIPT', 'item', v_item_mbp::text, '127.0.0.1', NOW() - INTERVAL '40 days'),
        (v_org_id, v_admin_id, 'CUSTODY_CHECKOUT', 'assignment', v_staff1::text, '127.0.0.1', NOW() - INTERVAL '14 days');

    RAISE NOTICE 'Zavare demo client seeded for js3055391@gmail.com / Password123!';
END $$;
