-- ============================================================
-- Migration 018: Event check-in (Module 5)
-- ============================================================

ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS device_information TEXT;

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
    'ADMIN_PASSWORD_RESET',
    'REGISTRATION_VIEWED',
    'ADMIN_NOTE_ADDED',
    'ADMIN_EMAIL_RESENT',
    'CHECKED_IN'
  )
);

CREATE OR REPLACE FUNCTION map_audit_event_label(p_event_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_event_type
    WHEN 'REGISTRATION_CREATED' THEN 'Registration Created'
    WHEN 'ORDER_CREATED' THEN 'Order Created'
    WHEN 'PAYMENT_CAPTURED' THEN 'Payment Completed'
    WHEN 'PAYMENT_FAILED' THEN 'Payment Failed'
    WHEN 'REGISTRATION_APPROVED' THEN 'Registration Approved'
    WHEN 'EMAIL_SENT' THEN 'Confirmation Email Sent'
    WHEN 'EMAIL_FAILED' THEN 'Confirmation Email Failed'
    WHEN 'REFUND_CREATED' THEN 'Refund Created'
    WHEN 'REGISTRATION_VIEWED' THEN 'Registration Viewed'
    WHEN 'ADMIN_NOTE_ADDED' THEN 'Internal Note Added'
    WHEN 'ADMIN_EMAIL_RESENT' THEN 'Confirmation Email Resent'
    WHEN 'CHECKED_IN' THEN 'Checked In'
    ELSE initcap(replace(lower(p_event_type), '_', ' '))
  END;
$$;

CREATE OR REPLACE FUNCTION derive_checkin_block_reason(
  p_status TEXT,
  p_has_active_check_in BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_has_active_check_in THEN
    RETURN 'Already Checked In';
  END IF;
  IF p_status = 'PAYMENT_PENDING' THEN
    RETURN 'Payment Pending';
  END IF;
  IF p_status = 'CANCELLED' THEN
    RETURN 'Registration Cancelled';
  END IF;
  IF p_status = 'REFUNDED' THEN
    RETURN 'Registration Refunded';
  END IF;
  IF p_status <> 'PAYMENT_COMPLETE' THEN
    RETURN 'Registration Not Eligible';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION search_admin_checkin_attendees(
  p_q TEXT,
  p_limit INT DEFAULT 8
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed TEXT := btrim(COALESCE(p_q, ''));
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
  v_items JSONB;
BEGIN
  IF v_trimmed = '' OR length(v_trimmed) < 2 THEN
    RETURN '[]'::JSONB;
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'full_name'), '[]'::JSONB)
  INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'registration_id', r.id,
      'full_name', r.full_name,
      'registration_reference', r.registration_id,
      'purchased_pass', COALESCE((
        SELECT string_agg(e.name, ', ' ORDER BY e.name)
        FROM registration_items ri
        JOIN events e ON e.id = ri.event_id
        WHERE ri.registration_id = r.id
      ), '—'),
      'payment_status', CASE
        WHEN r.status = 'PAYMENT_COMPLETE' THEN 'complete'
        WHEN EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = r.id AND px.status = 'failed')
          OR EXISTS (SELECT 1 FROM orders ox WHERE ox.registration_id = r.id AND ox.status = 'failed')
          THEN 'failed'
        ELSE 'pending'
      END,
      'registration_status', r.status,
      'check_in_status', CASE
        WHEN EXISTS (SELECT 1 FROM check_ins ci WHERE ci.registration_id = r.id AND ci.status = 'active')
          THEN 'checked_in'
        ELSE 'not_checked_in'
      END,
      'registered_date', r.created_at,
      'can_check_in', (
        r.status = 'PAYMENT_COMPLETE'
        AND NOT EXISTS (SELECT 1 FROM check_ins ci WHERE ci.registration_id = r.id AND ci.status = 'active')
      ),
      'block_reason', derive_checkin_block_reason(
        r.status,
        EXISTS (SELECT 1 FROM check_ins ci WHERE ci.registration_id = r.id AND ci.status = 'active')
      ),
      'checked_in_by', (
        SELECT ap.full_name
        FROM check_ins ci
        JOIN admin_profiles ap ON ap.id = ci.checked_in_by
        WHERE ci.registration_id = r.id AND ci.status = 'active'
        ORDER BY ci.checked_in_at ASC
        LIMIT 1
      ),
      'checked_in_at', (
        SELECT ci.checked_in_at
        FROM check_ins ci
        WHERE ci.registration_id = r.id AND ci.status = 'active'
        ORDER BY ci.checked_in_at ASC
        LIMIT 1
      )
    ) AS row
    FROM registrations r
    WHERE
      r.registration_id ILIKE '%' || v_trimmed || '%'
      OR r.full_name ILIKE '%' || v_trimmed || '%'
      OR r.email ILIKE '%' || v_trimmed || '%'
      OR r.phone ILIKE '%' || v_trimmed || '%'
    ORDER BY
      CASE WHEN r.registration_id ILIKE v_trimmed || '%' THEN 0 ELSE 1 END,
      r.full_name
    LIMIT v_limit
  ) s;

  RETURN v_items;
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_checkin_stats(p_recent_limit INT DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_day_start TIMESTAMPTZ := (v_today::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  v_recent JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'checked_in_at' DESC), '[]'::JSONB)
  INTO v_recent
  FROM (
    SELECT jsonb_build_object(
      'checked_in_at', x.checked_in_at,
      'attendee_name', x.full_name,
      'pass', x.purchased_pass,
      'volunteer_name', x.volunteer_name
    ) AS row
    FROM (
      SELECT DISTINCT ON (ci.registration_id)
        ci.registration_id,
        ci.checked_in_at,
        r.full_name,
        COALESCE(ap.full_name, 'Staff') AS volunteer_name,
        COALESCE((
          SELECT string_agg(e.name, ', ' ORDER BY e.name)
          FROM registration_items ri
          JOIN events e ON e.id = ri.event_id
          WHERE ri.registration_id = r.id
        ), '—') AS purchased_pass
      FROM check_ins ci
      JOIN registrations r ON r.id = ci.registration_id
      LEFT JOIN admin_profiles ap ON ap.id = ci.checked_in_by
      WHERE ci.status = 'active'
      ORDER BY ci.registration_id, ci.checked_in_at DESC
    ) x
    ORDER BY x.checked_in_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_recent_limit, 20), 1), 50)
  ) s;

  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'timezone', 'Asia/Kolkata',
    'today_check_ins', (
      SELECT COUNT(DISTINCT ci.registration_id)::INT
      FROM check_ins ci
      WHERE ci.status = 'active'
        AND ci.checked_in_at >= v_day_start
        AND ci.checked_in_at < v_day_start + INTERVAL '1 day'
    ),
    'total_check_ins', (
      SELECT COUNT(DISTINCT ci.registration_id)::INT
      FROM check_ins ci
      WHERE ci.status = 'active'
    ),
    'pending_check_ins', (
      SELECT COUNT(*)::INT
      FROM registrations r
      WHERE r.status = 'PAYMENT_COMPLETE'
        AND NOT EXISTS (
          SELECT 1 FROM check_ins ci
          WHERE ci.registration_id = r.id AND ci.status = 'active'
        )
    ),
    'recent', v_recent
  );
END;
$$;

CREATE OR REPLACE FUNCTION perform_admin_checkin(
  p_registration_id UUID,
  p_admin_profile_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_device_information TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg RECORD;
  v_item RECORD;
  v_existing RECORD;
  v_check_in_ids UUID[] := ARRAY[]::UUID[];
  v_new_id UUID;
  v_notes TEXT := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_device TEXT := NULLIF(btrim(COALESCE(p_device_information, '')), '');
  v_pass TEXT;
  v_staff_name TEXT;
  v_checked_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_reg
  FROM registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'NOT_FOUND',
      'error', 'Registration Not Found'
    );
  END IF;

  IF v_reg.status = 'PAYMENT_PENDING' THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'PAYMENT_PENDING',
      'error', 'Payment Pending'
    );
  END IF;

  IF v_reg.status = 'CANCELLED' THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'CANCELLED',
      'error', 'Registration Cancelled'
    );
  END IF;

  IF v_reg.status = 'REFUNDED' THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'REFUNDED',
      'error', 'Registration Refunded'
    );
  END IF;

  IF v_reg.status <> 'PAYMENT_COMPLETE' THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'NOT_ELIGIBLE',
      'error', 'Registration Not Eligible'
    );
  END IF;

  SELECT ci.checked_in_at, ap.full_name AS checked_in_by_name
  INTO v_existing
  FROM check_ins ci
  LEFT JOIN admin_profiles ap ON ap.id = ci.checked_in_by
  WHERE ci.registration_id = p_registration_id AND ci.status = 'active'
  ORDER BY ci.checked_in_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'ALREADY_CHECKED_IN',
      'error', 'Already Checked In',
      'checked_in_by', v_existing.checked_in_by_name,
      'checked_in_at', v_existing.checked_in_at
    );
  END IF;

  SELECT full_name INTO v_staff_name
  FROM admin_profiles
  WHERE id = p_admin_profile_id;

  v_checked_at := NOW();

  FOR v_item IN
    SELECT ri.id AS registration_item_id, ri.event_id
    FROM registration_items ri
    WHERE ri.registration_id = p_registration_id
    ORDER BY ri.created_at
  LOOP
    INSERT INTO check_ins (
      registration_id,
      registration_item_id,
      event_id,
      checked_in_at,
      checked_in_by,
      status,
      notes,
      device_information
    ) VALUES (
      p_registration_id,
      v_item.registration_item_id,
      v_item.event_id,
      v_checked_at,
      p_admin_profile_id,
      'active',
      v_notes,
      v_device
    )
    RETURNING id INTO v_new_id;

    v_check_in_ids := array_append(v_check_in_ids, v_new_id);
  END LOOP;

  IF cardinality(v_check_in_ids) = 0 THEN
    RAISE EXCEPTION 'Registration has no items to check in';
  END IF;

  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_pass
  FROM registration_items ri
  JOIN events e ON e.id = ri.event_id
  WHERE ri.registration_id = p_registration_id;

  INSERT INTO audit_logs (
    event_type,
    entity_type,
    entity_id,
    registration_id,
    actor_type,
    actor_id,
    metadata
  ) VALUES (
    'CHECKED_IN',
    'registration',
    p_registration_id,
    p_registration_id,
    'admin',
    p_admin_profile_id::text,
    jsonb_build_object(
      'check_in_ids', to_jsonb(v_check_in_ids),
      'purchased_pass', v_pass,
      'notes', v_notes,
      'device_information', v_device,
      'override', FALSE
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'confirmation', jsonb_build_object(
      'attendee_name', v_reg.full_name,
      'purchased_pass', COALESCE(v_pass, '—'),
      'checked_in_at', v_checked_at,
      'checked_in_by', COALESCE(v_staff_name, 'Staff'),
      'check_in_ids', to_jsonb(v_check_in_ids)
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT ci.checked_in_at, ap.full_name AS checked_in_by_name
    INTO v_existing
    FROM check_ins ci
    LEFT JOIN admin_profiles ap ON ap.id = ci.checked_in_by
    WHERE ci.registration_id = p_registration_id AND ci.status = 'active'
    ORDER BY ci.checked_in_at ASC
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'ALREADY_CHECKED_IN',
      'error', 'Already Checked In',
      'checked_in_by', v_existing.checked_in_by_name,
      'checked_in_at', v_existing.checked_in_at
    );
END;
$$;

REVOKE ALL ON FUNCTION derive_checkin_block_reason FROM PUBLIC;
REVOKE ALL ON FUNCTION search_admin_checkin_attendees FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_checkin_stats FROM PUBLIC;
REVOKE ALL ON FUNCTION perform_admin_checkin FROM PUBLIC;

GRANT EXECUTE ON FUNCTION search_admin_checkin_attendees TO service_role;
GRANT EXECUTE ON FUNCTION get_admin_checkin_stats TO service_role;
GRANT EXECUTE ON FUNCTION perform_admin_checkin TO service_role;

COMMENT ON FUNCTION perform_admin_checkin IS 'Module 5 atomic registration-level check-in. metadata.override reserved for future SUPER_ADMIN manual override.';
COMMENT ON FUNCTION get_admin_checkin_stats IS 'Module 5 live counters and recent check-in history.';
