-- ============================================================
-- Migration 022: Promo codes (Phase 1)
-- Note: 021 is used by fix_search_admin_registrations
-- ============================================================

CREATE TABLE IF NOT EXISTS promo_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID REFERENCES events (id) ON DELETE SET NULL,
  code            TEXT NOT NULL,
  description     TEXT,
  discount_type   TEXT NOT NULL,
  discount_value  NUMERIC(10, 2) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from      TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  max_uses        INTEGER,
  used_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT promo_codes_code_unique UNIQUE (code),
  CONSTRAINT promo_codes_discount_type_check CHECK (
    discount_type IN ('fixed', 'percentage')
  ),
  CONSTRAINT promo_codes_discount_value_positive CHECK (discount_value > 0),
  CONSTRAINT promo_codes_percentage_max CHECK (
    discount_type <> 'percentage' OR discount_value <= 100
  ),
  CONSTRAINT promo_codes_max_uses_positive CHECK (
    max_uses IS NULL OR max_uses > 0
  ),
  CONSTRAINT promo_codes_used_count_non_negative CHECK (used_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code_upper
  ON promo_codes (UPPER(btrim(code)));

CREATE INDEX IF NOT EXISTS idx_promo_codes_event_id
  ON promo_codes (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promo_codes_is_active
  ON promo_codes (is_active)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id   UUID NOT NULL REFERENCES promo_codes (id) ON DELETE RESTRICT,
  registration_id UUID NOT NULL REFERENCES registrations (id) ON DELETE RESTRICT,
  order_id        UUID REFERENCES orders (id) ON DELETE SET NULL,
  discount_amount NUMERIC(10, 2) NOT NULL,
  redeemed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT promo_code_redemptions_discount_non_negative CHECK (discount_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_code_redemptions_unique
  ON promo_code_redemptions (promo_code_id, registration_id);

CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_promo
  ON promo_code_redemptions (promo_code_id, redeemed_at DESC);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON promo_codes FROM anon, authenticated;
REVOKE ALL ON promo_code_redemptions FROM anon, authenticated;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_promo_code_id
  ON orders (promo_code_id)
  WHERE promo_code_id IS NOT NULL;

-- Validate promo code for checkout (public via edge function)
CREATE OR REPLACE FUNCTION validate_promo_code(
  p_code TEXT,
  p_event_id UUID DEFAULT NULL,
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

  IF v_row.event_id IS NOT NULL AND p_event_id IS NOT NULL AND v_row.event_id <> p_event_id THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'code', v_row.code,
      'discount_amount', 0,
      'final_amount', GREATEST(COALESCE(p_subtotal, 0), 0),
      'message', 'Promo code not found'
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
    'discount_type', v_row.discount_type,
    'discount_value', v_row.discount_value,
    'discount_amount', v_discount,
    'final_amount', v_final,
    'message', 'Promo code applied'
  );
END;
$$;

-- Idempotent redemption after payment capture
CREATE OR REPLACE FUNCTION redeem_promo_code_for_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_inserted_id UUID;
BEGIN
  SELECT o.id, o.registration_id, o.promo_code_id, o.discount, o.coupon_code
  INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND OR v_order.promo_code_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped');
  END IF;

  INSERT INTO promo_code_redemptions (
    promo_code_id,
    registration_id,
    order_id,
    discount_amount
  ) VALUES (
    v_order.promo_code_id,
    v_order.registration_id,
    v_order.id,
    COALESCE(v_order.discount, 0)
  )
  ON CONFLICT (promo_code_id, registration_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    UPDATE promo_codes
    SET used_count = used_count + 1, updated_at = NOW()
    WHERE id = v_order.promo_code_id;
    RETURN jsonb_build_object('status', 'redeemed', 'redemption_id', v_inserted_id);
  END IF;

  RETURN jsonb_build_object('status', 'already_redeemed');
END;
$$;

-- Admin list
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
    ORDER BY p.created_at DESC
  ) s;
$$;

CREATE OR REPLACE FUNCTION create_admin_promo_code(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := UPPER(btrim(p_payload->>'code'));
  v_id UUID;
BEGIN
  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'code_required';
  END IF;

  INSERT INTO promo_codes (
    event_id,
    code,
    description,
    discount_type,
    discount_value,
    is_active,
    valid_from,
    valid_until,
    max_uses
  ) VALUES (
    NULLIF(p_payload->>'event_id', '')::UUID,
    v_code,
    NULLIF(btrim(p_payload->>'description'), ''),
    COALESCE(p_payload->>'discount_type', 'fixed'),
    (p_payload->>'discount_value')::NUMERIC,
    COALESCE((p_payload->>'is_active')::BOOLEAN, TRUE),
    NULLIF(p_payload->>'valid_from', '')::TIMESTAMPTZ,
    NULLIF(p_payload->>'valid_until', '')::TIMESTAMPTZ,
    NULLIF(p_payload->>'max_uses', '')::INTEGER
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT row FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'event_id', p.event_id,
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
      FROM promo_codes p WHERE p.id = v_id
    ) s
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'code_exists';
END;
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
    FROM promo_codes p WHERE p.id = p_id
  );
END;
$$;

-- Extend payment capture to redeem promo (idempotent)
CREATE OR REPLACE FUNCTION process_payment_captured(
  p_razorpay_payment_id TEXT,
  p_razorpay_order_id TEXT,
  p_amount_paise INTEGER,
  p_currency TEXT,
  p_method TEXT,
  p_webhook_event TEXT,
  p_webhook_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_registration RECORD;
  v_payment_id UUID;
  v_public_reg_id TEXT;
  v_item RECORD;
  v_amount_rupees NUMERIC(10, 2);
  v_now TIMESTAMPTZ := NOW();
  v_remaining INT;
  v_redeem JSONB;
BEGIN
  v_amount_rupees := (p_amount_paise::NUMERIC / 100);

  IF EXISTS (SELECT 1 FROM payments WHERE razorpay_payment_id = p_razorpay_payment_id) THEN
    RETURN jsonb_build_object(
      'status', 'already_processed',
      'razorpay_payment_id', p_razorpay_payment_id
    );
  END IF;

  SELECT * INTO v_order
  FROM orders
  WHERE razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object(
      'status', 'already_paid',
      'order_id', v_order.id
    );
  END IF;

  IF v_order.amount_paise <> p_amount_paise THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  SELECT * INTO v_registration
  FROM registrations
  WHERE id = v_order.registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_not_found';
  END IF;

  FOR v_item IN
    SELECT ri.quantity, e.id AS event_id, e.slug, e.available_qty, e.sold_qty
    FROM registration_items ri
    JOIN events e ON e.id = ri.event_id
    WHERE ri.registration_id = v_order.registration_id
    FOR UPDATE OF e
  LOOP
    v_remaining := v_item.available_qty - v_item.sold_qty;
    IF v_remaining < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_capacity:%', v_item.slug;
    END IF;

    UPDATE events
    SET sold_qty = sold_qty + v_item.quantity, updated_at = v_now
    WHERE id = v_item.event_id;
  END LOOP;

  IF v_registration.status = 'PAYMENT_COMPLETE' AND v_registration.registration_id IS NOT NULL THEN
    v_public_reg_id := v_registration.registration_id;
  ELSE
    v_public_reg_id := generate_public_registration_id(v_order.registration_id);
  END IF;

  INSERT INTO payments (
    order_id,
    registration_id,
    razorpay_payment_id,
    razorpay_order_id,
    amount,
    currency,
    method,
    status,
    signature_verified,
    webhook_event,
    webhook_payload,
    paid_at
  ) VALUES (
    v_order.id,
    v_order.registration_id,
    p_razorpay_payment_id,
    p_razorpay_order_id,
    v_amount_rupees,
    COALESCE(NULLIF(p_currency, ''), 'INR'),
    p_method,
    'captured',
    TRUE,
    p_webhook_event,
    p_webhook_payload,
    v_now
  )
  RETURNING id INTO v_payment_id;

  UPDATE orders
  SET status = 'paid', paid_at = v_now, updated_at = v_now
  WHERE id = v_order.id;

  UPDATE registrations
  SET
    status = 'PAYMENT_COMPLETE',
    registration_id = v_public_reg_id,
    approved_at = v_now,
    updated_at = v_now
  WHERE id = v_order.registration_id;

  v_redeem := redeem_promo_code_for_order(v_order.id);

  INSERT INTO audit_logs (
    event_type, entity_type, entity_id, registration_id, order_id, payment_id, actor_type, metadata
  ) VALUES (
    'PAYMENT_CAPTURED', 'payment', v_payment_id, v_order.registration_id, v_order.id, v_payment_id, 'webhook',
    jsonb_build_object(
      'razorpay_payment_id', p_razorpay_payment_id,
      'razorpay_order_id', p_razorpay_order_id,
      'promo_redemption', v_redeem
    )
  );

  INSERT INTO audit_logs (
    event_type, entity_type, entity_id, registration_id, order_id, payment_id, actor_type, metadata
  ) VALUES (
    'REGISTRATION_APPROVED', 'registration', v_order.registration_id, v_order.registration_id, v_order.id, v_payment_id, 'webhook',
    jsonb_build_object('registration_id', v_public_reg_id)
  );

  RETURN jsonb_build_object(
    'status', 'captured',
    'order_id', v_order.id,
    'payment_id', v_payment_id,
    'registration_id', v_public_reg_id,
    'promo_redemption', v_redeem
  );
END;
$$;

REVOKE ALL ON FUNCTION validate_promo_code(TEXT, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION redeem_promo_code_for_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_admin_promo_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION create_admin_promo_code(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_admin_promo_code(UUID, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION validate_promo_code(TEXT, UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION redeem_promo_code_for_order(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION list_admin_promo_codes() TO service_role;
GRANT EXECUTE ON FUNCTION create_admin_promo_code(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION update_admin_promo_code(UUID, JSONB) TO service_role;

COMMENT ON TABLE promo_codes IS 'Phase 1 promo codes — managed via admin dashboard.';
COMMENT ON FUNCTION validate_promo_code IS 'Checkout promo validation — server-side only.';
