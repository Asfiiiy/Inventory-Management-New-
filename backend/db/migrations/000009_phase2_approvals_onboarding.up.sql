-- Phase 2: approval workflows, onboarding flag, cost centers, approval threshold

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
