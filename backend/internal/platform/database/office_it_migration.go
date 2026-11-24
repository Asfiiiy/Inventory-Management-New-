package database

import (
	"context"
)

// EnsureOfficeITSchema applies idempotent DDL updates for Office IT Inventory Lifecycle
// (Employee ID, Online Digital Signature, Multi-Unit Custody, and Faulty / Vendor Repair Tracking).
func (tdb *TenantDB) EnsureOfficeITSchema(ctx context.Context) error {
	ddl := `
		ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

		ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_code VARCHAR(64) NOT NULL DEFAULT '';
		ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(128) NOT NULL DEFAULT '';
		ALTER TABLE users ADD COLUMN IF NOT EXISTS desk_location VARCHAR(128) NOT NULL DEFAULT '';

		UPDATE users SET role = 'staff' WHERE lower(role) IN ('storekeeper', 'employee');
		UPDATE users SET role = 'admin' WHERE lower(role) = 'owner' AND email::text <> 'admin@whoopit.io';

		DROP INDEX IF EXISTS idx_no_double_assignment;

		ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 4) NOT NULL DEFAULT 1;
		ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS employee_code VARCHAR(64) NOT NULL DEFAULT '';
		ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS employee_name VARCHAR(128) NOT NULL DEFAULT '';
		ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS employee_department VARCHAR(128) NOT NULL DEFAULT '';
		ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS employee_email VARCHAR(128) NOT NULL DEFAULT '';
		ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS serial_number VARCHAR(128) NOT NULL DEFAULT '';
		ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS signature_data TEXT NOT NULL DEFAULT '';
		ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

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

		ALTER TABLE organization_settings
			ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
			ADD COLUMN IF NOT EXISTS approval_threshold NUMERIC(14, 4) NOT NULL DEFAULT 500,
			ADD COLUMN IF NOT EXISTS last_finance_email_at TIMESTAMPTZ,
			ADD COLUMN IF NOT EXISTS last_trial_notice_at TIMESTAMPTZ;

		ALTER TABLE items
			ADD COLUMN IF NOT EXISTS cost_center VARCHAR(64) NOT NULL DEFAULT '';

		CREATE TABLE IF NOT EXISTS asset_requests (
			request_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
			org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
			item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
			requester_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
			employee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
			source_location_id UUID REFERENCES locations(location_id) ON DELETE SET NULL,
			quantity NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
			serial_number VARCHAR(128) NOT NULL DEFAULT '',
			request_type VARCHAR(32) NOT NULL DEFAULT 'CHECKOUT'
				CHECK (request_type IN ('CHECKOUT', 'DISPOSE')),
			status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
				CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
			unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
			estimated_value NUMERIC(14, 4) NOT NULL DEFAULT 0,
			reason TEXT NOT NULL DEFAULT '',
			notes TEXT NOT NULL DEFAULT '',
			condition_grade VARCHAR(8) NOT NULL DEFAULT 'A',
			expected_return_date TIMESTAMPTZ,
			decided_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
			decided_at TIMESTAMPTZ,
			decision_notes TEXT NOT NULL DEFAULT '',
			assignment_id UUID,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE INDEX IF NOT EXISTS idx_asset_requests_org_status ON asset_requests (org_id, status);
		CREATE INDEX IF NOT EXISTS idx_asset_requests_employee ON asset_requests (org_id, employee_user_id);

		ALTER TABLE asset_requests ENABLE ROW LEVEL SECURITY;
		ALTER TABLE asset_requests FORCE ROW LEVEL SECURITY;
		DROP POLICY IF EXISTS tenant_isolation_policy ON asset_requests;
		CREATE POLICY tenant_isolation_policy ON asset_requests FOR ALL USING (org_id = current_org_id());
	`
	_, err := tdb.pool.Exec(ctx, ddl)
	return err
}
