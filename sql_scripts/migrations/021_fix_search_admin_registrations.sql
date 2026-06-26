-- ============================================================
-- Migration 021: Fix search_admin_registrations sort SQL error
-- Outer jsonb_agg ORDER BY referenced columns not in scope.
-- ============================================================

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

REVOKE ALL ON FUNCTION search_admin_registrations FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_admin_registrations TO service_role;

COMMENT ON FUNCTION search_admin_registrations IS 'Module 3 registration search — fixed outer jsonb_agg sort (021).';
