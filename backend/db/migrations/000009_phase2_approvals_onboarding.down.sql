DROP TABLE IF EXISTS asset_requests;

ALTER TABLE items DROP COLUMN IF EXISTS cost_center;

ALTER TABLE organization_settings
  DROP COLUMN IF EXISTS onboarding_completed_at,
  DROP COLUMN IF EXISTS approval_threshold,
  DROP COLUMN IF EXISTS last_finance_email_at,
  DROP COLUMN IF EXISTS last_trial_notice_at;
