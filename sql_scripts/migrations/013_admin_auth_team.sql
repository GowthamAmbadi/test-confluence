-- ============================================================
-- Migration 013: Admin authentication & team management
-- Module 1 — Event Operations Dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT admin_profiles_user_fk
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT admin_profiles_email_unique UNIQUE (email),
  CONSTRAINT admin_profiles_role_check CHECK (
    role IN ('SUPER_ADMIN', 'CHECKIN_STAFF', 'SUPPORT_DESK')
  )
);

CREATE TABLE IF NOT EXISTS admin_login_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_profile_id  UUID NOT NULL,
  user_id           UUID NOT NULL,
  ip_address        TEXT,
  user_agent        TEXT,
  device_label      TEXT,
  login_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT admin_login_audit_profile_fk
    FOREIGN KEY (admin_profile_id) REFERENCES admin_profiles (id) ON DELETE CASCADE
);

ALTER TABLE admin_profiles
  ADD CONSTRAINT admin_profiles_created_by_fk
  FOREIGN KEY (created_by) REFERENCES admin_profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_profiles_user_id ON admin_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_role ON admin_profiles (role);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_active ON admin_profiles (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_admin_profiles_email ON admin_profiles (email);
CREATE INDEX IF NOT EXISTS idx_admin_login_audit_profile_id ON admin_login_audit (admin_profile_id);
CREATE INDEX IF NOT EXISTS idx_admin_login_audit_user_id ON admin_login_audit (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_login_audit_login_at ON admin_login_audit (login_at DESC);

COMMENT ON TABLE admin_profiles IS 'Internal staff accounts for Event Operations Dashboard.';
COMMENT ON TABLE admin_login_audit IS 'Append-only staff login audit trail (IP, device, time).';

-- Helper for RLS (avoids recursive policy checks)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_profiles
    WHERE user_id = auth.uid()
      AND role = 'SUPER_ADMIN'
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_profiles
    WHERE user_id = auth.uid()
      AND is_active = TRUE
  );
$$;

ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_login_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_profiles_read_own
  ON admin_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND is_active = TRUE);

CREATE POLICY admin_profiles_super_admin_read
  ON admin_profiles FOR SELECT
  TO authenticated
  USING (is_super_admin());

CREATE POLICY admin_login_audit_read_own
  ON admin_login_audit FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY admin_login_audit_super_admin_read
  ON admin_login_audit FOR SELECT
  TO authenticated
  USING (is_super_admin());

REVOKE ALL ON admin_profiles FROM anon;
REVOKE ALL ON admin_login_audit FROM anon;
REVOKE INSERT, UPDATE, DELETE ON admin_profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON admin_login_audit FROM authenticated;

-- Extend audit_logs for staff actions (Module 1+)
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_event_type_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_event_type_check CHECK (
  event_type IN (
    'REGISTRATION_CREATED',
    'ORDER_CREATED',
    'PAYMENT_CAPTURED',
    'PAYMENT_FAILED',
    'REGISTRATION_APPROVED',
    'EMAIL_SENT',
    'EMAIL_FAILED',
    'REFUND_CREATED',
    'ADMIN_LOGIN',
    'ADMIN_TEAM_CREATED',
    'ADMIN_TEAM_UPDATED',
    'ADMIN_PASSWORD_RESET'
  )
);

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_type_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_check CHECK (
  entity_type IN (
    'registration',
    'registration_item',
    'order',
    'payment',
    'event',
    'email',
    'admin_profile',
    'admin_login'
  )
);
