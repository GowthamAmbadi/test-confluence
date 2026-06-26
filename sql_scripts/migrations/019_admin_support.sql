-- ============================================================
-- Migration 019: Support Desk (Module 6)
-- ============================================================

ALTER TABLE admin_notes
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General';

ALTER TABLE admin_notes DROP CONSTRAINT IF EXISTS admin_notes_category_check;
ALTER TABLE admin_notes ADD CONSTRAINT admin_notes_category_check CHECK (
  category IN ('General', 'Payment', 'Registration', 'Technical', 'VIP', 'Other')
);

CREATE TABLE IF NOT EXISTS registration_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL,
  tag             TEXT NOT NULL,
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT registration_tags_registration_fk
    FOREIGN KEY (registration_id) REFERENCES registrations (id) ON DELETE CASCADE,
  CONSTRAINT registration_tags_created_by_fk
    FOREIGN KEY (created_by) REFERENCES admin_profiles (id) ON DELETE RESTRICT,
  CONSTRAINT registration_tags_tag_check CHECK (
    tag IN ('vip', 'speaker', 'sponsor')
  ),
  CONSTRAINT registration_tags_unique UNIQUE (registration_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_registration_tags_registration
  ON registration_tags (registration_id);

ALTER TABLE registration_tags ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON registration_tags FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_audit_logs_registration_email_events
  ON audit_logs (registration_id, created_at DESC)
  WHERE event_type IN ('EMAIL_SENT', 'EMAIL_FAILED', 'ADMIN_EMAIL_RESENT');

CREATE OR REPLACE FUNCTION derive_email_delivery_status(p_registration_id UUID, p_registration_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_latest RECORD;
  v_last_sent TIMESTAMPTZ;
  v_last_resend TIMESTAMPTZ;
  v_last_failed TIMESTAMPTZ;
  v_failure_reason TEXT;
  v_resend_count INT;
  v_status TEXT;
BEGIN
  IF p_registration_status <> 'PAYMENT_COMPLETE' THEN
    RETURN jsonb_build_object(
      'delivery_status', 'not_applicable',
      'last_email_sent_at', NULL,
      'last_resend_at', NULL,
      'resend_count', 0,
      'last_email_failed_at', NULL,
      'last_failure_reason', NULL
    );
  END IF;

  SELECT created_at, event_type, metadata
  INTO v_latest
  FROM audit_logs
  WHERE registration_id = p_registration_id
    AND event_type IN ('EMAIL_SENT', 'EMAIL_FAILED', 'ADMIN_EMAIL_RESENT')
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT MAX(created_at) INTO v_last_sent
  FROM audit_logs
  WHERE registration_id = p_registration_id AND event_type = 'EMAIL_SENT';

  SELECT MAX(created_at) INTO v_last_resend
  FROM audit_logs
  WHERE registration_id = p_registration_id AND event_type = 'ADMIN_EMAIL_RESENT';

  SELECT MAX(created_at) INTO v_last_failed
  FROM audit_logs
  WHERE registration_id = p_registration_id AND event_type = 'EMAIL_FAILED';

  SELECT COUNT(*)::INT INTO v_resend_count
  FROM audit_logs
  WHERE registration_id = p_registration_id AND event_type = 'ADMIN_EMAIL_RESENT';

  SELECT a.metadata->>'error' INTO v_failure_reason
  FROM audit_logs a
  WHERE a.registration_id = p_registration_id AND a.event_type = 'EMAIL_FAILED'
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF v_latest IS NULL OR v_latest.event_type IS NULL THEN
    v_status := 'pending';
  ELSIF v_latest.event_type = 'EMAIL_FAILED' THEN
    v_status := 'failed';
  ELSIF v_latest.event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT') THEN
    v_status := 'delivered';
  ELSIF v_last_failed IS NOT NULL AND v_last_sent IS NULL AND v_last_resend IS NULL THEN
    v_status := 'failed';
  ELSE
    v_status := 'pending';
  END IF;

  RETURN jsonb_build_object(
    'delivery_status', v_status,
    'last_email_sent_at', v_last_sent,
    'last_resend_at', v_last_resend,
    'resend_count', v_resend_count,
    'last_email_failed_at', v_last_failed,
    'last_failure_reason', v_failure_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_attendee_profile(p_registration_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg RECORD;
  v_payment_status TEXT;
  v_check_in_status TEXT;
  v_amount_paid NUMERIC;
  v_purchased_pass TEXT;
  v_city TEXT;
  v_state TEXT;
  v_country TEXT;
  v_latest_payment RECORD;
  v_latest_order RECORD;
  v_notes_count INT;
  v_has_tag_vip BOOLEAN;
  v_has_tag_speaker BOOLEAN;
  v_has_tag_sponsor BOOLEAN;
  v_alerts JSONB := '[]'::jsonb;
  v_personal JSONB;
  v_purchased_passes JSONB;
  v_registration_responses JSONB;
  v_check_in JSONB;
  v_internal_notes JSONB;
  v_timeline JSONB;
  v_technical JSONB;
  v_communication JSONB;
  v_tags JSONB;
  v_active_check_in RECORD;
BEGIN
  SELECT * INTO v_reg FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_payment_status := CASE
    WHEN v_reg.status = 'PAYMENT_COMPLETE' THEN 'complete'
    WHEN EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = v_reg.id AND px.status = 'failed')
      OR EXISTS (SELECT 1 FROM orders ox WHERE ox.registration_id = v_reg.id AND ox.status = 'failed')
      THEN 'failed'
    ELSE 'pending'
  END;

  v_check_in_status := CASE
    WHEN EXISTS (SELECT 1 FROM check_ins ci WHERE ci.registration_id = v_reg.id AND ci.status = 'active')
      THEN 'checked_in'
    ELSE 'not_checked_in'
  END;

  v_amount_paid := COALESCE((
    SELECT SUM(p.amount) FROM payments p
    WHERE p.registration_id = v_reg.id AND p.status = 'captured'
  ), 0);

  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_purchased_pass
  FROM registration_items ri
  JOIN events e ON e.id = ri.event_id
  WHERE ri.registration_id = p_registration_id;

  SELECT
    MAX(NULLIF(btrim(ri.event_answers->>'city'), '')),
    MAX(NULLIF(btrim(ri.event_answers->>'state'), '')),
    MAX(NULLIF(btrim(ri.event_answers->>'country'), ''))
  INTO v_city, v_state, v_country
  FROM registration_items ri
  WHERE ri.registration_id = p_registration_id;

  SELECT p.* INTO v_latest_payment
  FROM payments p
  WHERE p.registration_id = p_registration_id AND p.status = 'captured'
  ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
  LIMIT 1;

  SELECT o.* INTO v_latest_order
  FROM orders o
  WHERE o.registration_id = p_registration_id
  ORDER BY o.created_at DESC
  LIMIT 1;

  SELECT COUNT(*)::INT INTO v_notes_count
  FROM admin_notes n
  WHERE n.entity_type = 'registration' AND n.entity_id = p_registration_id;

  SELECT EXISTS (SELECT 1 FROM registration_tags t WHERE t.registration_id = p_registration_id AND t.tag = 'vip')
  INTO v_has_tag_vip;
  SELECT EXISTS (SELECT 1 FROM registration_tags t WHERE t.registration_id = p_registration_id AND t.tag = 'speaker')
  INTO v_has_tag_speaker;
  SELECT EXISTS (SELECT 1 FROM registration_tags t WHERE t.registration_id = p_registration_id AND t.tag = 'sponsor')
  INTO v_has_tag_sponsor;

  v_communication := derive_email_delivery_status(p_registration_id, v_reg.status);

  IF v_payment_status = 'pending' THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'payment_pending', 'label', 'Payment Pending', 'severity', 'warning'));
  END IF;
  IF v_payment_status = 'failed' THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'payment_failed', 'label', 'Payment Failed', 'severity', 'danger'));
  END IF;
  IF v_check_in_status = 'checked_in' THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'checked_in', 'label', 'Already Checked In', 'severity', 'success'));
  END IF;
  IF v_has_tag_vip THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'vip', 'label', 'VIP', 'severity', 'info'));
  END IF;
  IF v_has_tag_speaker THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'speaker', 'label', 'Speaker', 'severity', 'info'));
  END IF;
  IF v_has_tag_sponsor THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'sponsor', 'label', 'Sponsor', 'severity', 'info'));
  END IF;
  IF v_notes_count > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'internal_notes', 'label', 'Internal Notes Present', 'severity', 'info'));
  END IF;
  IF (v_communication->>'delivery_status') = 'failed' THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'email_failed', 'label', 'Confirmation Email Failed', 'severity', 'danger'));
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tag', t.tag,
    'created_by', ap.full_name,
    'created_at', t.created_at
  ) ORDER BY t.tag), '[]'::JSONB)
  INTO v_tags
  FROM registration_tags t
  JOIN admin_profiles ap ON ap.id = t.created_by
  WHERE t.registration_id = p_registration_id;

  v_personal := jsonb_build_object(
    'full_name', v_reg.full_name,
    'email', v_reg.email,
    'phone', v_reg.phone,
    'college', v_reg.college,
    'city', v_city,
    'state', v_state,
    'country', v_country,
    'avatar_url', NULL
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'registration_item_id', ri.id,
    'event_id', e.id,
    'event_name', e.name,
    'pass_name', e.name,
    'quantity', ri.quantity,
    'amount', ri.line_subtotal,
    'registration_status', v_reg.status
  ) ORDER BY e.name), '[]'::JSONB)
  INTO v_purchased_passes
  FROM registration_items ri
  JOIN events e ON e.id = ri.event_id
  WHERE ri.registration_id = p_registration_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'event_id', e.id,
    'event_name', e.name,
    'event_slug', e.slug,
    'answers', build_registration_form_answers(e.registration_form_schema, ri.event_answers)
  ) ORDER BY e.name), '[]'::JSONB)
  INTO v_registration_responses
  FROM registration_items ri
  JOIN events e ON e.id = ri.event_id
  WHERE ri.registration_id = p_registration_id;

  SELECT ci.*, ap.full_name AS checked_in_by_name, e.name AS event_name
  INTO v_active_check_in
  FROM check_ins ci
  JOIN events e ON e.id = ci.event_id
  LEFT JOIN admin_profiles ap ON ap.id = ci.checked_in_by
  WHERE ci.registration_id = p_registration_id AND ci.status = 'active'
  ORDER BY ci.checked_in_at DESC
  LIMIT 1;

  v_check_in := jsonb_build_object(
    'checked_in', v_check_in_status = 'checked_in',
    'checked_by', v_active_check_in.checked_in_by_name,
    'checked_at', v_active_check_in.checked_in_at,
    'notes', v_active_check_in.notes,
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'event_name', e.name,
        'checked_at', ci.checked_in_at,
        'status', ci.status,
        'notes', ci.notes
      ) ORDER BY ci.checked_in_at DESC)
      FROM check_ins ci
      JOIN events e ON e.id = ci.event_id
      WHERE ci.registration_id = p_registration_id
    ), '[]'::JSONB)
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'note', n.note,
    'category', n.category,
    'created_by', ap.full_name,
    'created_at', n.created_at
  ) ORDER BY n.created_at ASC), '[]'::JSONB)
  INTO v_internal_notes
  FROM admin_notes n
  JOIN admin_profiles ap ON ap.id = n.created_by
  WHERE n.entity_type = 'registration' AND n.entity_id = p_registration_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'timestamp', a.created_at,
    'actor', resolve_audit_actor_name(a.actor_type, a.actor_id),
    'action', map_audit_event_label(a.event_type),
    'event_type', a.event_type,
    'metadata', a.metadata
  ) ORDER BY a.created_at DESC), '[]'::JSONB)
  INTO v_timeline
  FROM audit_logs a
  WHERE a.registration_id = p_registration_id
  LIMIT 100;

  v_technical := jsonb_build_object(
    'registration_uuid', v_reg.id,
    'registration_item_ids', COALESCE((
      SELECT jsonb_agg(ri.id ORDER BY ri.created_at)
      FROM registration_items ri
      WHERE ri.registration_id = p_registration_id
    ), '[]'::JSONB),
    'order_id', v_latest_order.id,
    'payment_id', v_latest_payment.id,
    'razorpay_order_id', COALESCE(v_latest_payment.razorpay_order_id, v_latest_order.razorpay_order_id),
    'razorpay_payment_id', v_latest_payment.razorpay_payment_id
  );

  RETURN jsonb_build_object(
    'snapshot', jsonb_build_object(
      'full_name', v_reg.full_name,
      'registration_reference', v_reg.registration_id,
      'purchased_pass', COALESCE(v_purchased_pass, '—'),
      'payment_status', v_payment_status,
      'check_in_status', v_check_in_status,
      'registration_status', v_reg.status,
      'amount_paid', v_amount_paid,
      'registration_date', v_reg.created_at,
      'last_updated', v_reg.updated_at
    ),
    'alerts', v_alerts,
    'personal', v_personal,
    'purchased_passes', v_purchased_passes,
    'payment', jsonb_build_object(
      'payment_status', v_payment_status,
      'amount_paid', v_amount_paid,
      'currency', COALESCE(v_latest_payment.currency, 'INR'),
      'payment_date', v_latest_payment.paid_at,
      'razorpay_order_id', COALESCE(v_latest_payment.razorpay_order_id, v_latest_order.razorpay_order_id),
      'razorpay_payment_id', v_latest_payment.razorpay_payment_id,
      'payment_method', v_latest_payment.method
    ),
    'communication', v_communication,
    'tags', v_tags,
    'support_extensions', jsonb_build_object(
      'tickets_enabled', FALSE,
      'escalations_enabled', FALSE,
      'assignments_enabled', FALSE,
      'priorities_enabled', FALSE,
      'tag_management_enabled', FALSE
    ),
    'technical', v_technical,
    'registration_responses', v_registration_responses,
    'check_in', v_check_in,
    'internal_notes', v_internal_notes,
    'activity_timeline', v_timeline
  );
END;
$$;

CREATE OR REPLACE FUNCTION add_admin_note(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_admin_profile_id UUID,
  p_note TEXT,
  p_category TEXT DEFAULT 'General'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed TEXT := btrim(p_note);
  v_category TEXT := COALESCE(NULLIF(btrim(p_category), ''), 'General');
  v_note_id UUID;
  v_registration_id UUID;
BEGIN
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'note is required';
  END IF;

  IF v_category NOT IN ('General', 'Payment', 'Registration', 'Technical', 'VIP', 'Other') THEN
    RAISE EXCEPTION 'invalid note category';
  END IF;

  INSERT INTO admin_notes (entity_type, entity_id, note, created_by, category)
  VALUES (p_entity_type, p_entity_id, v_trimmed, p_admin_profile_id, v_category)
  RETURNING id INTO v_note_id;

  v_registration_id := CASE WHEN p_entity_type = 'registration' THEN p_entity_id ELSE NULL END;

  INSERT INTO audit_logs (
    event_type,
    entity_type,
    entity_id,
    registration_id,
    actor_type,
    actor_id,
    metadata
  ) VALUES (
    'ADMIN_NOTE_ADDED',
    p_entity_type,
    p_entity_id,
    v_registration_id,
    'admin',
    p_admin_profile_id::text,
    jsonb_build_object(
      'note_id', v_note_id,
      'note_preview', left(v_trimmed, 120),
      'category', v_category
    )
  );

  RETURN jsonb_build_object('id', v_note_id, 'category', v_category);
END;
$$;

REVOKE ALL ON FUNCTION derive_email_delivery_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION derive_email_delivery_status TO service_role;

COMMENT ON TABLE registration_tags IS 'Reusable registration tags (vip, speaker, sponsor). Module 6 reads for alerts; tag management UI deferred.';
COMMENT ON COLUMN admin_notes.category IS 'Support note category — append-only classification.';
