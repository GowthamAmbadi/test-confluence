-- ============================================================
-- Migration 007: RLS for new tables (Phase 1)
-- Legacy table policies unchanged — current flow keeps working
-- service_role bypasses RLS in Supabase (Edge Functions use this)
-- Run AFTER migrations 001–006
-- ============================================================

-- events — public read only (active events)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_public_read"
  ON events FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY "events_admin_write"
  ON events FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- registrations — NO public writes
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registrations_admin_read"
  ON registrations FOR SELECT
  TO authenticated
  USING (TRUE);

-- registration_items — NO public access
ALTER TABLE registration_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registration_items_admin_read"
  ON registration_items FOR SELECT
  TO authenticated
  USING (TRUE);

-- orders — NO public access
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_admin_read"
  ON orders FOR SELECT
  TO authenticated
  USING (TRUE);

-- payments — NO public access
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_admin_read"
  ON payments FOR SELECT
  TO authenticated
  USING (TRUE);

-- audit_logs — append-only, admin read
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_admin_read"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (TRUE);

-- Defense in depth: revoke direct writes from anon on new tables
REVOKE INSERT, UPDATE, DELETE ON events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON registrations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON registration_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON orders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM anon;
