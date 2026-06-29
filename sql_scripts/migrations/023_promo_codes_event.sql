-- ============================================================
-- Migration 023: Event-specific promo codes (Phase 1 enhancement)
-- ============================================================

-- Required: p_event_id no longer has a DEFAULT (must be supplied explicitly).
DROP FUNCTION IF EXISTS validate_promo_code(TEXT, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION validate_promo_code(
  p_code TEXT,
  p_event_id UUID,
  p_subtotal NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row promo_codes%ROWTYPE;
  v_normalized TEXT;
  v_discount NUMERIC(10, 2);
  v_final NUMERIC(10, 2);
BEGIN
  IF p_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'code', NULL,
      'discount_amount', 0,
      'final_amount', GREATEST(COALESCE(p_subtotal, 0), 0),
      'message', 'Event is required for promo validation'
    );
  END IF;

  v_normalized := UPPER(btrim(COALESCE(p_code, '')));

  IF v_normalized = '' THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'code', NULL,
      'discount_amount', 0,
      'final_amount', GREATEST(COALESCE(p_subtotal, 0), 0),
      'message', 'Promo code not found'
    );
  END IF;

  SELECT * INTO v_row
  FROM promo_codes
  WHERE UPPER(btrim(code)) = v_normalized;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'code', v_normalized,
      'discount_amount', 0,
      'final_amount', GREATEST(COALESCE(p_subtotal, 0), 0),
      'message', 'Promo code not found'
    );
  END IF;

  IF NOT v_row.is_active THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'code', v_row.code,
      'discount_amount', 0,
      'final_amount', GREATEST(COALESCE(p_subtotal, 0), 0),
      'message', 'Promo code inactive'
    );
  END IF;

  IF v_row.valid_from IS NOT NULL AND NOW() < v_row.valid_from THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'code', v_row.code,
      'discount_amount', 0,
      'final_amount', GREATEST(COALESCE(p_subtotal, 0), 0),
      'message', 'Promo code is not yet valid'
    );
  END IF;

  IF v_row.valid_until IS NOT NULL AND NOW() > v_row.valid_until THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'code', v_row.code,
      'discount_amount', 0,
      'final_amount', GREATEST(COALESCE(p_subtotal, 0), 0),
      'message', 'Promo code expired'
    );
  END IF;

  IF v_row.max_uses IS NOT NULL AND v_row.used_count >= v_row.max_uses THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'code', v_row.code,
      'discount_amount', 0,
      'final_amount', GREATEST(COALESCE(p_subtotal, 0), 0),
      'message', 'Promo code usage limit reached'
    );
  END IF;

  -- Global codes (event_id NULL) apply to any event; specific codes must match.
  IF v_row.event_id IS NOT NULL AND v_row.event_id <> p_event_id THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'code', v_row.code,
      'discount_amount', 0,
      'final_amount', GREATEST(COALESCE(p_subtotal, 0), 0),
      'message', 'Promo code not valid for this pass'
    );
  END IF;

  IF v_row.discount_type = 'fixed' THEN
    v_discount := LEAST(v_row.discount_value, GREATEST(COALESCE(p_subtotal, 0), 0));
  ELSE
    v_discount := ROUND(GREATEST(COALESCE(p_subtotal, 0), 0) * v_row.discount_value / 100, 2);
  END IF;

  v_final := GREATEST(COALESCE(p_subtotal, 0) - v_discount, 0);

  RETURN jsonb_build_object(
    'valid', TRUE,
    'code', v_row.code,
    'promo_code_id', v_row.id,
    'event_id', v_row.event_id,
    'discount_type', v_row.discount_type,
    'discount_value', v_row.discount_value,
    'discount_amount', v_discount,
    'final_amount', v_final,
    'message', 'Promo code applied'
  );
END;
$$;

CREATE OR REPLACE FUNCTION list_admin_promo_codes()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::JSONB)
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'event_id', p.event_id,
      'event_name', e.name,
      'code', p.code,
      'description', p.description,
      'discount_type', p.discount_type,
      'discount_value', p.discount_value,
      'is_active', p.is_active,
      'valid_from', p.valid_from,
      'valid_until', p.valid_until,
      'max_uses', p.max_uses,
      'used_count', p.used_count,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ) AS row
    FROM promo_codes p
    LEFT JOIN events e ON e.id = p.event_id
    ORDER BY p.created_at DESC
  ) s;
$$;

CREATE OR REPLACE FUNCTION update_admin_promo_code(p_id UUID, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE promo_codes
  SET
    event_id = CASE
      WHEN p_payload ? 'event_id' THEN NULLIF(p_payload->>'event_id', '')::UUID
      ELSE event_id
    END,
    description = CASE WHEN p_payload ? 'description' THEN NULLIF(btrim(p_payload->>'description'), '') ELSE description END,
    discount_type = COALESCE(p_payload->>'discount_type', discount_type),
    discount_value = COALESCE((p_payload->>'discount_value')::NUMERIC, discount_value),
    is_active = COALESCE((p_payload->>'is_active')::BOOLEAN, is_active),
    valid_from = CASE
      WHEN p_payload ? 'valid_from' THEN NULLIF(p_payload->>'valid_from', '')::TIMESTAMPTZ
      ELSE valid_from
    END,
    valid_until = CASE
      WHEN p_payload ? 'valid_until' THEN NULLIF(p_payload->>'valid_until', '')::TIMESTAMPTZ
      ELSE valid_until
    END,
    max_uses = CASE
      WHEN p_payload ? 'max_uses' THEN NULLIF(p_payload->>'max_uses', '')::INTEGER
      ELSE max_uses
    END,
    updated_at = NOW()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', p.id,
      'event_id', p.event_id,
      'event_name', e.name,
      'code', p.code,
      'description', p.description,
      'discount_type', p.discount_type,
      'discount_value', p.discount_value,
      'is_active', p.is_active,
      'valid_from', p.valid_from,
      'valid_until', p.valid_until,
      'max_uses', p.max_uses,
      'used_count', p.used_count,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    )
    FROM promo_codes p
    LEFT JOIN events e ON e.id = p.event_id
    WHERE p.id = p_id
  );
END;
$$;

-- Existing rows keep event_id NULL (global / all events).
COMMENT ON FUNCTION validate_promo_code(TEXT, UUID, NUMERIC) IS 'Phase 1 promo validation — requires event_id; global promos use event_id NULL on row.';

REVOKE ALL ON FUNCTION validate_promo_code(TEXT, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validate_promo_code(TEXT, UUID, NUMERIC) TO service_role;
