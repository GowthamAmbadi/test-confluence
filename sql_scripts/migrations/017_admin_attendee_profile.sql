-- ============================================================
-- Migration 017: Attendee profile (Module 4)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  note         TEXT NOT NULL,
  created_by   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT admin_notes_created_by_fk
    FOREIGN KEY (created_by) REFERENCES admin_profiles (id) ON DELETE RESTRICT,
  CONSTRAINT admin_notes_note_nonempty CHECK (btrim(note) <> ''),
  CONSTRAINT admin_notes_entity_type_check CHECK (
    entity_type IN ('registration', 'payment', 'event', 'volunteer', 'sponsor')
  )
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_entity
  ON admin_notes (entity_type, entity_id, created_at ASC);

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON admin_notes FROM anon, authenticated;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS registration_form_schema JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS notes TEXT;

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
    'ADMIN_EMAIL_RESENT'
  )
);

-- Seed form schemas (mirrors public registration forms)
UPDATE events SET registration_form_schema = '[
  {"key":"full_name","label":"Full Name","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"email","label":"Email Address","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"phone","label":"Phone Number","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"college_company","label":"College / Company","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"city","label":"City","type":"text","section":"Personal Information"},
  {"key":"experience_level","label":"Experience Level","type":"dropdown","section":"Personal Information","options":[{"value":"student","label":"Student"},{"value":"early","label":"Early Career (0–2 yrs)"},{"value":"mid","label":"Mid Career (3–6 yrs)"},{"value":"senior","label":"Senior (7+ yrs)"},{"value":"founder","label":"Founder / Entrepreneur"}]},
  {"key":"linkedin","label":"LinkedIn URL","type":"link","section":"Personal Information"},
  {"key":"instagram","label":"Instagram Handle","type":"text","section":"Personal Information"},
  {"key":"why_attend","label":"Why do you want to attend?","type":"textarea","section":"Motivation & Goals"},
  {"key":"building","label":"What are you building or interested in?","type":"textarea","section":"Motivation & Goals"},
  {"key":"portfolio","label":"Resume / Portfolio Link","type":"link","section":"Motivation & Goals"},
  {"key":"dietary","label":"Dietary Preferences","type":"dropdown","section":"Motivation & Goals","options":[{"value":"veg","label":"Vegetarian"},{"value":"nonveg","label":"Non-Vegetarian"},{"value":"vegan","label":"Vegan"},{"value":"jain","label":"Jain"},{"value":"none","label":"No Preference"}]},
  {"key":"skill_domain","label":"Skill Domain","type":"dropdown","section":"Learning Lab Details","options":[{"value":"tech","label":"Technology & Engineering"},{"value":"design","label":"Design & UX"},{"value":"marketing","label":"Marketing & Growth"},{"value":"finance","label":"Finance & Business"},{"value":"leadership","label":"Leadership & Soft Skills"},{"value":"content","label":"Content & Media"},{"value":"other","label":"Other"}]},
  {"key":"workshops","label":"Workshops Interested In","type":"text","section":"Learning Lab Details"},
  {"key":"current_projects","label":"Current Projects","type":"textarea","section":"Learning Lab Details"},
  {"key":"ec_name","label":"Emergency Contact Name","type":"text","section":"Emergency Contact"},
  {"key":"ec_phone","label":"Emergency Contact Number","type":"text","section":"Emergency Contact"},
  {"key":"agree_terms","label":"Terms & Conditions","type":"checkbox","section":"Confirmation","exclude_from_profile":true}
]'::jsonb WHERE slug = 'learning-lab';

UPDATE events SET registration_form_schema = '[
  {"key":"full_name","label":"Full Name","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"email","label":"Email Address","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"phone","label":"Phone Number","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"college_company","label":"College / Company","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"city","label":"City","type":"text","section":"Personal Information"},
  {"key":"experience_level","label":"Experience Level","type":"dropdown","section":"Personal Information","options":[{"value":"student","label":"Student"},{"value":"early","label":"Early Career (0–2 yrs)"},{"value":"mid","label":"Mid Career (3–6 yrs)"},{"value":"senior","label":"Senior (7+ yrs)"},{"value":"founder","label":"Founder / Entrepreneur"}]},
  {"key":"linkedin","label":"LinkedIn URL","type":"link","section":"Personal Information"},
  {"key":"instagram","label":"Instagram Handle","type":"text","section":"Personal Information"},
  {"key":"why_attend","label":"Why do you want to attend?","type":"textarea","section":"Motivation & Goals"},
  {"key":"building","label":"What are you building?","type":"textarea","section":"Motivation & Goals"},
  {"key":"portfolio","label":"Resume / Portfolio Link","type":"link","section":"Motivation & Goals"},
  {"key":"dietary","label":"Dietary Preferences","type":"dropdown","section":"Motivation & Goals","options":[{"value":"veg","label":"Vegetarian"},{"value":"nonveg","label":"Non-Vegetarian"},{"value":"vegan","label":"Vegan"},{"value":"jain","label":"Jain"},{"value":"none","label":"No Preference"}]},
  {"key":"startup_idea","label":"Startup Idea","type":"textarea","section":"Your Startup Idea"},
  {"key":"idea_stage","label":"Stage of Idea","type":"dropdown","section":"Your Startup Idea","options":[{"value":"ideation","label":"Ideation (concept only)"},{"value":"validation","label":"Validation (testing market)"},{"value":"mvp","label":"MVP Built"},{"value":"early-traction","label":"Early Traction"},{"value":"scaling","label":"Scaling / Revenue"}]},
  {"key":"team_size","label":"Team Size","type":"dropdown","section":"Your Startup Idea","options":[{"value":"solo","label":"Solo Founder"},{"value":"2","label":"2 People"},{"value":"3-5","label":"3–5 People"},{"value":"6-10","label":"6–10 People"},{"value":"10+","label":"10+ People"}]},
  {"key":"funding_status","label":"Funding Status","type":"dropdown","section":"Your Startup Idea","options":[{"value":"bootstrapped","label":"Bootstrapped"},{"value":"friends-family","label":"Friends & Family Round"},{"value":"angel","label":"Angel Funded"},{"value":"seed","label":"Seed Stage"},{"value":"series-a","label":"Series A+"},{"value":"seeking","label":"Actively Seeking Funding"}]},
  {"key":"pitch_deck_url","label":"Startup Pitch Deck Link","type":"link","section":"Your Startup Idea"},
  {"key":"pitch_video_url","label":"Startup Pitch Video Link","type":"link","section":"Your Startup Idea"},
  {"key":"intro_video_url","label":"Self Introduction Video Link","type":"link","section":"Your Startup Idea"},
  {"key":"ec_name","label":"Emergency Contact Name","type":"text","section":"Emergency Contact"},
  {"key":"ec_phone","label":"Emergency Contact Number","type":"text","section":"Emergency Contact"},
  {"key":"agree_terms","label":"Terms & Conditions","type":"checkbox","section":"Confirmation","exclude_from_profile":true}
]'::jsonb WHERE slug = 'concept-cocoon';

UPDATE events SET registration_form_schema = '[
  {"key":"full_name","label":"Full Name","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"email","label":"Email Address","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"phone","label":"Phone Number","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"college_company","label":"College / Company","type":"text","section":"Personal Information","exclude_from_profile":true},
  {"key":"city","label":"City","type":"text","section":"Personal Information"},
  {"key":"experience_level","label":"Experience Level","type":"dropdown","section":"Personal Information","options":[{"value":"student","label":"Student"},{"value":"early","label":"Early Career (0–2 yrs)"},{"value":"mid","label":"Mid Career (3–6 yrs)"},{"value":"senior","label":"Senior (7+ yrs)"},{"value":"founder","label":"Founder / Entrepreneur"}]},
  {"key":"linkedin","label":"LinkedIn URL","type":"link","section":"Personal Information"},
  {"key":"instagram","label":"Instagram Handle","type":"text","section":"Personal Information"},
  {"key":"why_attend","label":"Why do you want to attend?","type":"textarea","section":"Motivation & Goals"},
  {"key":"building","label":"What are you building or interested in?","type":"textarea","section":"Motivation & Goals"},
  {"key":"portfolio","label":"Resume / Portfolio Link","type":"link","section":"Motivation & Goals"},
  {"key":"dietary","label":"Dietary Preferences","type":"dropdown","section":"Motivation & Goals","options":[{"value":"veg","label":"Vegetarian"},{"value":"nonveg","label":"Non-Vegetarian"},{"value":"vegan","label":"Vegan"},{"value":"jain","label":"Jain"},{"value":"none","label":"No Preference"}]},
  {"key":"industry","label":"Industry","type":"dropdown","section":"Networking Profile","options":[{"value":"tech","label":"Technology"},{"value":"finance","label":"Finance & Banking"},{"value":"healthcare","label":"Healthcare"},{"value":"education","label":"Education"},{"value":"media","label":"Media & Entertainment"},{"value":"consulting","label":"Consulting"},{"value":"manufacturing","label":"Manufacturing"},{"value":"retail","label":"Retail & E-commerce"},{"value":"startup","label":"Startup / Venture"},{"value":"other","label":"Other"}]},
  {"key":"mentor_domain","label":"Preferred Mentor Domain","type":"dropdown","section":"Networking Profile","options":[{"value":"product","label":"Product & Strategy"},{"value":"growth","label":"Growth & Marketing"},{"value":"fundraising","label":"Fundraising & VC"},{"value":"leadership","label":"Leadership & Management"},{"value":"tech","label":"Engineering & Tech"},{"value":"ops","label":"Operations & Scale"},{"value":"hr","label":"People & Culture"}]},
  {"key":"networking_goals","label":"Networking Goals","type":"textarea","section":"Networking Profile"},
  {"key":"ec_name","label":"Emergency Contact Name","type":"text","section":"Emergency Contact"},
  {"key":"ec_phone","label":"Emergency Contact Number","type":"text","section":"Emergency Contact"},
  {"key":"agree_terms","label":"Terms & Conditions","type":"checkbox","section":"Confirmation","exclude_from_profile":true}
]'::jsonb WHERE slug = 'networking-gala';

CREATE OR REPLACE FUNCTION humanize_field_key(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT initcap(replace(replace(p_key, '_', ' '), '-', ' '));
$$;

CREATE OR REPLACE FUNCTION resolve_form_option_label(p_options JSONB, p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_opt JSONB;
BEGIN
  IF p_options IS NULL OR p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;

  FOR v_opt IN SELECT value FROM jsonb_array_elements(p_options) AS value
  LOOP
    IF v_opt->>'value' = p_value THEN
      RETURN v_opt->>'label';
    END IF;
  END LOOP;

  RETURN p_value;
END;
$$;

CREATE OR REPLACE FUNCTION format_form_answer_display(
  p_type TEXT,
  p_value JSONB,
  p_options JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT;
  v_item JSONB;
  v_parts TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN '—';
  END IF;

  IF p_type = 'checkbox' THEN
    IF p_value = 'true'::jsonb OR lower(p_value #>> '{}') IN ('true', 'yes', '1') THEN
      RETURN 'Yes';
    END IF;
    RETURN 'No';
  END IF;

  IF jsonb_typeof(p_value) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_value) AS value
    LOOP
      v_parts := array_append(v_parts, COALESCE(resolve_form_option_label(p_options, v_item #>> '{}'), v_item #>> '{}'));
    END LOOP;
    RETURN COALESCE(array_to_string(v_parts, ', '), '—');
  END IF;

  v_text := p_value #>> '{}';
  IF v_text IS NULL OR btrim(v_text) = '' THEN
    RETURN '—';
  END IF;

  IF p_type IN ('dropdown', 'radio') THEN
    RETURN COALESCE(resolve_form_option_label(p_options, v_text), v_text);
  END IF;

  RETURN v_text;
END;
$$;

CREATE OR REPLACE FUNCTION infer_form_field_type(p_key TEXT, p_value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN 'text';
  END IF;

  IF jsonb_typeof(p_value) = 'array' THEN
    RETURN 'multiselect';
  END IF;

  IF jsonb_typeof(p_value) = 'boolean' THEN
    RETURN 'checkbox';
  END IF;

  v_text := p_value #>> '{}';
  IF v_text ~* '^https?://' THEN
    RETURN 'link';
  END IF;

  IF length(v_text) > 120 THEN
    RETURN 'textarea';
  END IF;

  RETURN 'text';
END;
$$;

CREATE OR REPLACE FUNCTION build_registration_form_answers(
  p_schema JSONB,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_field JSONB;
  v_result JSONB := '[]'::jsonb;
  v_key TEXT;
  v_type TEXT;
  v_label TEXT;
  v_section TEXT;
  v_options JSONB;
  v_value JSONB;
  v_display TEXT;
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_orphan_key TEXT;
  v_exclude_keys TEXT[] := ARRAY['full_name','email','phone','college_company','college','agree_terms'];
BEGIN
  IF p_schema IS NOT NULL AND jsonb_typeof(p_schema) = 'array' THEN
    FOR v_field IN SELECT value FROM jsonb_array_elements(p_schema) AS value
    LOOP
      v_key := v_field->>'key';
      IF v_key IS NULL OR COALESCE((v_field->>'exclude_from_profile')::boolean, FALSE) THEN
        CONTINUE;
      END IF;

      v_seen := array_append(v_seen, v_key);
      v_type := COALESCE(v_field->>'type', 'text');
      v_label := COALESCE(v_field->>'label', humanize_field_key(v_key));
      v_section := v_field->>'section';
      v_options := v_field->'options';
      v_value := p_answers -> v_key;
      v_display := format_form_answer_display(v_type, v_value, v_options);

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'field_key', v_key,
        'label', v_label,
        'type', v_type,
        'section', v_section,
        'value', CASE
          WHEN v_value IS NULL OR v_value = 'null'::jsonb THEN NULL
          WHEN jsonb_typeof(v_value) = 'array' THEN v_value
          WHEN v_type = 'checkbox' THEN to_jsonb(v_display = 'Yes')
          ELSE to_jsonb(v_value #>> '{}')
        END,
        'display_value', v_display
      ));
    END LOOP;
  END IF;

  IF p_answers IS NOT NULL THEN
    FOR v_orphan_key IN SELECT key FROM jsonb_each(p_answers)
    LOOP
      IF v_orphan_key = ANY (v_seen) OR v_orphan_key = ANY (v_exclude_keys) THEN
        CONTINUE;
      END IF;

      v_value := p_answers -> v_orphan_key;
      IF v_value IS NULL OR v_value = 'null'::jsonb OR (jsonb_typeof(v_value) = 'string' AND btrim(v_value #>> '{}') = '') THEN
        CONTINUE;
      END IF;

      v_type := infer_form_field_type(v_orphan_key, v_value);
      v_display := format_form_answer_display(v_type, v_value, NULL);

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'field_key', v_orphan_key,
        'label', humanize_field_key(v_orphan_key),
        'type', v_type,
        'section', NULL,
        'value', CASE
          WHEN jsonb_typeof(v_value) = 'array' THEN v_value
          WHEN v_type = 'checkbox' THEN to_jsonb(v_display = 'Yes')
          ELSE to_jsonb(v_value #>> '{}')
        END,
        'display_value', v_display
      ));
    END LOOP;
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_audit_actor_name(p_actor_type TEXT, p_actor_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_actor_type = 'admin' AND p_actor_id IS NOT NULL THEN COALESCE((
      SELECT full_name FROM admin_profiles WHERE id::text = p_actor_id LIMIT 1
    ), 'Staff')
    WHEN p_actor_type = 'webhook' THEN 'Payment Webhook'
    ELSE 'System'
  END;
$$;

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
    ELSE initcap(replace(lower(p_event_type), '_', ' '))
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
  v_has_vip_note BOOLEAN;
  v_has_email_failed BOOLEAN;
  v_has_email_sent BOOLEAN;
  v_alerts JSONB := '[]'::jsonb;
  v_personal JSONB;
  v_purchased_passes JSONB;
  v_registration_responses JSONB;
  v_check_in JSONB;
  v_internal_notes JSONB;
  v_timeline JSONB;
  v_technical JSONB;
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

  SELECT EXISTS (
    SELECT 1 FROM admin_notes n
    WHERE n.entity_type = 'registration'
      AND n.entity_id = p_registration_id
      AND n.note ~* '(^|[^a-z])vip([^a-z]|$)|vip guest'
  ) INTO v_has_vip_note;

  SELECT EXISTS (
    SELECT 1 FROM audit_logs a
    WHERE a.registration_id = p_registration_id AND a.event_type = 'EMAIL_FAILED'
  ) INTO v_has_email_failed;

  SELECT EXISTS (
    SELECT 1 FROM audit_logs a
    WHERE a.registration_id = p_registration_id
      AND a.event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT')
  ) INTO v_has_email_sent;

  IF v_payment_status = 'pending' THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'payment_pending', 'label', 'Payment Pending', 'severity', 'warning'));
  END IF;
  IF v_payment_status = 'failed' THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'payment_failed', 'label', 'Payment Failed', 'severity', 'danger'));
  END IF;
  IF v_check_in_status = 'checked_in' THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'checked_in', 'label', 'Checked In', 'severity', 'success'));
  END IF;
  IF v_has_vip_note THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'vip', 'label', 'VIP', 'severity', 'info'));
  END IF;
  IF v_notes_count > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'internal_notes', 'label', 'Internal Notes Available', 'severity', 'info'));
  END IF;
  IF v_has_email_failed AND NOT v_has_email_sent THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('key', 'email_failed', 'label', 'Email Failed', 'severity', 'danger'));
  END IF;

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
  p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed TEXT := btrim(p_note);
  v_note_id UUID;
  v_registration_id UUID;
BEGIN
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'note is required';
  END IF;

  INSERT INTO admin_notes (entity_type, entity_id, note, created_by)
  VALUES (p_entity_type, p_entity_id, v_trimmed, p_admin_profile_id)
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
    jsonb_build_object('note_id', v_note_id, 'note_preview', left(v_trimmed, 120))
  );

  RETURN jsonb_build_object('id', v_note_id);
END;
$$;

REVOKE ALL ON FUNCTION humanize_field_key FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_form_option_label FROM PUBLIC;
REVOKE ALL ON FUNCTION format_form_answer_display FROM PUBLIC;
REVOKE ALL ON FUNCTION infer_form_field_type FROM PUBLIC;
REVOKE ALL ON FUNCTION build_registration_form_answers FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_audit_actor_name FROM PUBLIC;
REVOKE ALL ON FUNCTION map_audit_event_label FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_attendee_profile FROM PUBLIC;
REVOKE ALL ON FUNCTION add_admin_note FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_admin_attendee_profile TO service_role;
GRANT EXECUTE ON FUNCTION add_admin_note TO service_role;

COMMENT ON TABLE admin_notes IS 'Reusable internal notes for registrations, payments, events, volunteers, sponsors.';
COMMENT ON FUNCTION get_admin_attendee_profile IS 'Module 4 attendee profile — single round trip payload for admin-registration-profile API.';
