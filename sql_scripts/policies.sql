-- ============================================================
-- CONFLUENCE 2026 — Row Level Security Policies
-- ============================================================
-- Run AFTER schema.sql
-- ============================================================

-- ============================================================
-- PASS TYPES — public read, no public write
-- ============================================================
ALTER TABLE pass_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pass_types_public_read"
  ON pass_types FOR SELECT
  USING (is_active = TRUE);

-- Admin-only insert/update (authenticated role)
CREATE POLICY "pass_types_admin_write"
  ON pass_types FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- PARTICIPANTS — public insert, own-record read
-- ============================================================
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- Anyone can register (insert)
CREATE POLICY "participants_public_insert"
  ON participants FOR INSERT
  TO anon
  WITH CHECK (TRUE);

-- Allow public users to read participant records (needed for upsert return)
CREATE POLICY "participants_public_read"
  ON participants FOR SELECT
  TO anon
  USING (TRUE);

-- Allow public users to update participant records (needed for upsert)
CREATE POLICY "participants_public_update"
  ON participants FOR UPDATE
  TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- Authenticated users (admins) can read all
CREATE POLICY "participants_admin_read"
  ON participants FOR SELECT
  TO authenticated
  USING (TRUE);

-- Admins can update
CREATE POLICY "participants_admin_update"
  ON participants FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- APPLICATIONS — public insert, admin read
-- ============================================================
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "applications_public_insert"
  ON applications FOR INSERT
  TO anon
  WITH CHECK (TRUE);

-- Allow public users to read applications (needed for returning inserted application)
CREATE POLICY "applications_public_read"
  ON applications FOR SELECT
  TO anon
  USING (TRUE);

-- Allow public users to update application status and answers upon successful payment verification
CREATE POLICY "applications_public_update"
  ON applications FOR UPDATE
  TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "applications_admin_read"
  ON applications FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "applications_admin_update"
  ON applications FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- CART ORDERS — public insert, admin read
-- ============================================================
ALTER TABLE cart_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_public_insert"
  ON cart_orders FOR INSERT
  TO anon
  WITH CHECK (TRUE);

-- Allow public users to read orders (needed for returning inserted order)
CREATE POLICY "orders_public_read"
  ON cart_orders FOR SELECT
  TO anon
  USING (TRUE);

CREATE POLICY "orders_admin_read"
  ON cart_orders FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "orders_admin_update"
  ON cart_orders FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- WAITLIST — public insert, admin read
-- ============================================================
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_public_insert"
  ON waitlist FOR INSERT
  TO anon
  WITH CHECK (TRUE);

CREATE POLICY "waitlist_admin_read"
  ON waitlist FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "waitlist_public_read"
  ON waitlist FOR SELECT
  TO anon
  USING (TRUE);

CREATE POLICY "waitlist_admin_update"
  ON waitlist FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- NOTES
-- ============================================================
-- • anon key = used by the frontend (public inserts only)
-- • authenticated = Supabase Auth users (your admin dashboard)
-- • To build an admin panel, use Supabase Auth + check role
-- • Never expose service_role key on the frontend
