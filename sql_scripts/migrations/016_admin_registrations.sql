-- ============================================================
-- Migration 016: Registration management search (Module 3)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS admin_recent_searches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_profile_id  UUID NOT NULL,
  search_text       TEXT NOT NULL,
  searched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT admin_recent_searches_profile_fk
    FOREIGN KEY (admin_profile_id) REFERENCES admin_profiles (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_recent_searches_profile
  ON admin_recent_searches (admin_profile_id, searched_at DESC);

ALTER TABLE admin_recent_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_recent_searches_read_own
  ON admin_recent_searches FOR SELECT
  TO authenticated
  USING (admin_profile_id IN (
    SELECT id FROM admin_profiles WHERE user_id = auth.uid()
  ));

REVOKE INSERT, UPDATE, DELETE ON admin_recent_searches FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_registrations_full_name_lower
  ON registrations (LOWER(full_name));

CREATE INDEX IF NOT EXISTS idx_registrations_email_lower
  ON registrations (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_registrations_phone
  ON registrations (phone);

CREATE INDEX IF NOT EXISTS idx_registrations_college_lower
  ON registrations (LOWER(college));

CREATE INDEX IF NOT EXISTS idx_registrations_registration_id_lower
  ON registrations (LOWER(registration_id))
  WHERE registration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_items_event_answers_city
  ON registration_items ((LOWER(event_answers->>'city')))
  WHERE event_answers ? 'city';

-- List + search + pagination
CREATE OR REPLACE FUNCTION search_admin_registrations(
  p_q TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL,
  p_registration_status TEXT DEFAULT NULL,
  p_check_in_status TEXT DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_date_preset TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_sort TEXT DEFAULT 'created_at',
  p_sort_dir TEXT DEFAULT 'desc',
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_offset INT;
  v_total INT;
  v_items JSONB;
  v_passes JSONB;
  v_sort_col TEXT;
  v_sort_dir TEXT;
BEGIN
  p_page := GREATEST(COALESCE(p_page, 1), 1);
  p_page_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_offset := (p_page - 1) * p_page_size;

  v_sort_col := CASE COALESCE(p_sort, 'created_at')
    WHEN 'registration_id' THEN 'registration_reference'
    WHEN 'full_name' THEN 'full_name'
    WHEN 'amount_paid' THEN 'amount_paid'
    ELSE 'created_at'
  END;

  v_sort_dir := CASE WHEN LOWER(COALESCE(p_sort_dir, 'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  IF p_date_preset = 'today' THEN
    v_from := (v_today::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := v_from + INTERVAL '1 day';
  ELSIF p_date_preset = 'yesterday' THEN
    v_from := ((v_today - 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := v_from + INTERVAL '1 day';
  ELSIF p_date_preset = 'last_7' THEN
    v_from := ((v_today - 6)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := ((v_today + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  ELSIF p_date_preset = 'last_30' THEN
    v_from := ((v_today - 29)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := ((v_today + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  ELSIF p_date_preset = 'custom' AND p_date_from IS NOT NULL AND p_date_to IS NOT NULL THEN
    v_from := (p_date_from::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := ((p_date_to + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  END IF;

  SELECT COUNT(*)::INT INTO v_total
  FROM registrations r
  WHERE
    (p_q IS NULL OR btrim(p_q) = '' OR (
      r.registration_id ILIKE '%' || p_q || '%'
      OR r.full_name ILIKE '%' || p_q || '%'
      OR r.email ILIKE '%' || p_q || '%'
      OR r.phone ILIKE '%' || p_q || '%'
      OR r.college ILIKE '%' || p_q || '%'
      OR EXISTS (
        SELECT 1 FROM registration_items ri
        WHERE ri.registration_id = r.id
          AND COALESCE(ri.event_answers->>'city', '') ILIKE '%' || p_q || '%'
      )
    ))
    AND (p_registration_status IS NULL OR btrim(p_registration_status) = '' OR r.status = p_registration_status)
    AND (p_event_id IS NULL OR EXISTS (
      SELECT 1 FROM registration_items ri WHERE ri.registration_id = r.id AND ri.event_id = p_event_id
    ))
    AND (v_from IS NULL OR (r.created_at >= v_from AND r.created_at < v_to))
    AND (p_check_in_status IS NULL OR btrim(p_check_in_status) = '' OR (
      (p_check_in_status = 'checked_in' AND EXISTS (
        SELECT 1 FROM check_ins ci WHERE ci.registration_id = r.id AND ci.status = 'active'
      ))
      OR (p_check_in_status = 'not_checked_in' AND NOT EXISTS (
        SELECT 1 FROM check_ins ci WHERE ci.registration_id = r.id AND ci.status = 'active'
      ))
    ))
    AND (p_payment_status IS NULL OR btrim(p_payment_status) = '' OR (
      (p_payment_status = 'complete' AND r.status = 'PAYMENT_COMPLETE')
      OR (p_payment_status = 'pending' AND r.status = 'PAYMENT_PENDING' AND NOT EXISTS (
        SELECT 1 FROM payments px WHERE px.registration_id = r.id AND px.status = 'failed'
      ) AND NOT EXISTS (
        SELECT 1 FROM orders ox WHERE ox.registration_id = r.id AND ox.status = 'failed'
      ))
      OR (p_payment_status = 'failed' AND (
        EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = r.id AND px.status = 'failed')
        OR EXISTS (SELECT 1 FROM orders ox WHERE ox.registration_id = r.id AND ox.status = 'failed')
      ))
    ));

  EXECUTE format(
    $sql$
    SELECT COALESCE(jsonb_agg(row), '[]'::JSONB)
    FROM (
      SELECT jsonb_build_object(
        'id', x.id,
        'registration_reference', x.registration_reference,
        'full_name', x.full_name,
        'email', x.email,
        'phone', x.phone,
        'college', x.college,
        'purchased_pass', x.purchased_pass,
        'amount_paid', x.amount_paid,
        'payment_status', x.payment_status,
        'registration_status', x.registration_status,
        'check_in_status', x.check_in_status,
        'created_at', x.created_at
      ) AS row
      FROM (
        SELECT
          r.id,
          r.registration_id AS registration_reference,
          r.full_name,
          r.email,
          r.phone,
          r.college,
          COALESCE((
            SELECT string_agg(e.name, ', ' ORDER BY e.name)
            FROM registration_items ri
            JOIN events e ON e.id = ri.event_id
            WHERE ri.registration_id = r.id
          ), '—') AS purchased_pass,
          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.registration_id = r.id AND p.status = 'captured'
          ), 0)::NUMERIC AS amount_paid,
          CASE
            WHEN r.status = 'PAYMENT_COMPLETE' THEN 'complete'
            WHEN EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = r.id AND px.status = 'failed')
              OR EXISTS (SELECT 1 FROM orders ox WHERE ox.registration_id = r.id AND ox.status = 'failed')
              THEN 'failed'
            ELSE 'pending'
          END AS payment_status,
          r.status AS registration_status,
          CASE
            WHEN EXISTS (SELECT 1 FROM check_ins ci WHERE ci.registration_id = r.id AND ci.status = 'active')
              THEN 'checked_in'
            ELSE 'not_checked_in'
          END AS check_in_status,
          r.created_at
        FROM registrations r
        WHERE
          ($1 IS NULL OR btrim($1) = '' OR (
            r.registration_id ILIKE '%%' || $1 || '%%'
            OR r.full_name ILIKE '%%' || $1 || '%%'
            OR r.email ILIKE '%%' || $1 || '%%'
            OR r.phone ILIKE '%%' || $1 || '%%'
            OR r.college ILIKE '%%' || $1 || '%%'
            OR EXISTS (
              SELECT 1 FROM registration_items ri
              WHERE ri.registration_id = r.id
                AND COALESCE(ri.event_answers->>'city', '') ILIKE '%%' || $1 || '%%'
            )
          ))
          AND ($2 IS NULL OR btrim($2) = '' OR r.status = $2)
          AND ($3 IS NULL OR EXISTS (
            SELECT 1 FROM registration_items ri WHERE ri.registration_id = r.id AND ri.event_id = $3
          ))
          AND ($4 IS NULL OR (r.created_at >= $4 AND r.created_at < $5))
          AND ($6 IS NULL OR btrim($6) = '' OR (
            ($6 = 'checked_in' AND EXISTS (
              SELECT 1 FROM check_ins ci WHERE ci.registration_id = r.id AND ci.status = 'active'
            ))
            OR ($6 = 'not_checked_in' AND NOT EXISTS (
              SELECT 1 FROM check_ins ci WHERE ci.registration_id = r.id AND ci.status = 'active'
            ))
          ))
          AND ($7 IS NULL OR btrim($7) = '' OR (
            ($7 = 'complete' AND r.status = 'PAYMENT_COMPLETE')
            OR ($7 = 'pending' AND r.status = 'PAYMENT_PENDING' AND NOT EXISTS (
              SELECT 1 FROM payments px WHERE px.registration_id = r.id AND px.status = 'failed'
            ) AND NOT EXISTS (
              SELECT 1 FROM orders ox WHERE ox.registration_id = r.id AND ox.status = 'failed'
            ))
            OR ($7 = 'failed' AND (
              EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = r.id AND px.status = 'failed')
              OR EXISTS (SELECT 1 FROM orders ox WHERE ox.registration_id = r.id AND ox.status = 'failed')
            ))
          ))
        ORDER BY %I %s
        LIMIT $8 OFFSET $9
      ) x
    ) s
    $sql$,
    v_sort_col, v_sort_dir
  )
  INTO v_items
  USING p_q, p_registration_status, p_event_id, v_from, v_to, p_check_in_status, p_payment_status, p_page_size, v_offset;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'slug', e.slug
  ) ORDER BY e.name), '[]'::JSONB)
  INTO v_passes
  FROM events e
  WHERE e.is_active = TRUE;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'passes', v_passes
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_registration_detail(p_registration_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg RECORD;
  v_items JSONB;
  v_orders JSONB;
  v_payments JSONB;
  v_audit JSONB;
  v_check_ins JSONB;
BEGIN
  SELECT * INTO v_reg FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ri.id,
    'event_id', e.id,
    'event_name', e.name,
    'event_slug', e.slug,
    'quantity', ri.quantity,
    'unit_price', ri.unit_price,
    'line_subtotal', ri.line_subtotal,
    'event_answers', ri.event_answers
  ) ORDER BY e.name), '[]'::JSONB)
  INTO v_items
  FROM registration_items ri
  JOIN events e ON e.id = ri.event_id
  WHERE ri.registration_id = p_registration_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'razorpay_order_id', o.razorpay_order_id,
    'total', o.total,
    'amount_paise', o.amount_paise,
    'status', o.status,
    'created_at', o.created_at,
    'paid_at', o.paid_at
  ) ORDER BY o.created_at DESC), '[]'::JSONB)
  INTO v_orders
  FROM orders o
  WHERE o.registration_id = p_registration_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'razorpay_payment_id', p.razorpay_payment_id,
    'amount', p.amount,
    'currency', p.currency,
    'status', p.status,
    'method', p.method,
    'paid_at', p.paid_at,
    'created_at', p.created_at
  ) ORDER BY p.created_at DESC), '[]'::JSONB)
  INTO v_payments
  FROM payments p
  WHERE p.registration_id = p_registration_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'event_type', a.event_type,
    'created_at', a.created_at,
    'metadata', a.metadata
  ) ORDER BY a.created_at DESC), '[]'::JSONB)
  INTO v_audit
  FROM audit_logs a
  WHERE a.registration_id = p_registration_id
  LIMIT 20;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ci.id,
    'event_name', e.name,
    'checked_in_at', ci.checked_in_at,
    'status', ci.status
  ) ORDER BY ci.checked_in_at DESC), '[]'::JSONB)
  INTO v_check_ins
  FROM check_ins ci
  JOIN events e ON e.id = ci.event_id
  WHERE ci.registration_id = p_registration_id;

  RETURN jsonb_build_object(
    'id', v_reg.id,
    'registration_reference', v_reg.registration_id,
    'full_name', v_reg.full_name,
    'email', v_reg.email,
    'phone', v_reg.phone,
    'college', v_reg.college,
    'status', v_reg.status,
    'created_at', v_reg.created_at,
    'approved_at', v_reg.approved_at,
    'payment_status', CASE
      WHEN v_reg.status = 'PAYMENT_COMPLETE' THEN 'complete'
      WHEN EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = v_reg.id AND px.status = 'failed')
        OR EXISTS (SELECT 1 FROM orders ox WHERE ox.registration_id = v_reg.id AND ox.status = 'failed')
        THEN 'failed'
      ELSE 'pending'
    END,
    'check_in_status', CASE
      WHEN EXISTS (SELECT 1 FROM check_ins ci WHERE ci.registration_id = v_reg.id AND ci.status = 'active')
        THEN 'checked_in'
      ELSE 'not_checked_in'
    END,
    'amount_paid', COALESCE((
      SELECT SUM(p.amount) FROM payments p
      WHERE p.registration_id = v_reg.id AND p.status = 'captured'
    ), 0),
    'items', v_items,
    'orders', v_orders,
    'payments', v_payments,
    'audit_logs', v_audit,
    'check_ins', v_check_ins
  );
END;
$$;

CREATE OR REPLACE FUNCTION record_admin_recent_search(
  p_admin_profile_id UUID,
  p_search_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed TEXT := btrim(p_search_text);
BEGIN
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RETURN '[]'::JSONB;
  END IF;

  INSERT INTO admin_recent_searches (admin_profile_id, search_text)
  VALUES (p_admin_profile_id, v_trimmed);

  DELETE FROM admin_recent_searches
  WHERE id IN (
    SELECT id FROM admin_recent_searches
    WHERE admin_profile_id = p_admin_profile_id
    ORDER BY searched_at DESC
    OFFSET 10
  );

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'search_text', s.search_text,
      'searched_at', s.searched_at
    ) ORDER BY s.searched_at DESC), '[]'::JSONB)
    FROM (
      SELECT search_text, searched_at
      FROM admin_recent_searches
      WHERE admin_profile_id = p_admin_profile_id
      ORDER BY searched_at DESC
      LIMIT 10
    ) s
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_recent_searches(p_admin_profile_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'search_text', s.search_text,
    'searched_at', s.searched_at
  ) ORDER BY s.searched_at DESC), '[]'::JSONB)
  FROM (
    SELECT search_text, searched_at
    FROM admin_recent_searches
    WHERE admin_profile_id = p_admin_profile_id
    ORDER BY searched_at DESC
    LIMIT 10
  ) s;
$$;

REVOKE ALL ON FUNCTION search_admin_registrations FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_registration_detail FROM PUBLIC;
REVOKE ALL ON FUNCTION record_admin_recent_search FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_recent_searches FROM PUBLIC;

GRANT EXECUTE ON FUNCTION search_admin_registrations TO service_role;
GRANT EXECUTE ON FUNCTION get_admin_registration_detail TO service_role;
GRANT EXECUTE ON FUNCTION record_admin_recent_search TO service_role;
GRANT EXECUTE ON FUNCTION get_admin_recent_searches TO service_role;
