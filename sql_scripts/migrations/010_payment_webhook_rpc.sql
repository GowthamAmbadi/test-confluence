-- ============================================================
-- Migration 010: Payment webhook RPCs (transactional)
-- Called by payment-webhook Edge Function via service_role
-- ============================================================

CREATE OR REPLACE FUNCTION generate_public_registration_id(p_registration_uuid UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug TEXT;
  v_prefix TEXT;
  v_reg_id TEXT;
  v_attempt INT := 0;
BEGIN
  SELECT e.slug INTO v_slug
  FROM registration_items ri
  JOIN events e ON e.id = ri.event_id
  WHERE ri.registration_id = p_registration_uuid
  ORDER BY ri.created_at
  LIMIT 1;

  v_prefix := CASE v_slug
    WHEN 'learning-lab' THEN 'LL'
    WHEN 'concept-cocoon' THEN 'CC'
    WHEN 'networking-gala' THEN 'NG'
    WHEN 'all-access' THEN 'AA'
    ELSE 'CF'
  END;

  LOOP
    v_attempt := v_attempt + 1;
    v_reg_id := v_prefix || '26-' || upper(substr(md5(random()::text || p_registration_uuid::text || v_attempt::text), 1, 5));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM registrations WHERE registration_id = v_reg_id);
    IF v_attempt > 20 THEN
      RAISE EXCEPTION 'registration_id_generation_failed';
    END IF;
  END LOOP;

  RETURN v_reg_id;
END;
$$;

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
BEGIN
  v_amount_rupees := (p_amount_paise::NUMERIC / 100);

  -- Idempotency: payment already recorded
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

  -- Capacity check + increment sold_qty
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

  INSERT INTO audit_logs (
    event_type, entity_type, entity_id, registration_id, order_id, payment_id, actor_type, metadata
  ) VALUES (
    'PAYMENT_CAPTURED', 'payment', v_payment_id, v_order.registration_id, v_order.id, v_payment_id, 'webhook',
    jsonb_build_object('razorpay_payment_id', p_razorpay_payment_id, 'razorpay_order_id', p_razorpay_order_id)
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
    'registration_id', v_public_reg_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION process_payment_failed(
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
  v_payment_id UUID;
  v_amount_rupees NUMERIC(10, 2);
  v_now TIMESTAMPTZ := NOW();
  v_existing_status TEXT;
BEGIN
  v_amount_rupees := (p_amount_paise::NUMERIC / 100);

  SELECT status INTO v_existing_status
  FROM payments
  WHERE razorpay_payment_id = p_razorpay_payment_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'already_processed',
      'razorpay_payment_id', p_razorpay_payment_id,
      'payment_status', v_existing_status
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
    RETURN jsonb_build_object('status', 'order_already_paid', 'order_id', v_order.id);
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
    'failed',
    TRUE,
    p_webhook_event,
    p_webhook_payload,
    NULL
  )
  RETURNING id INTO v_payment_id;

  UPDATE orders
  SET status = 'failed', updated_at = v_now
  WHERE id = v_order.id AND status = 'created';

  INSERT INTO audit_logs (
    event_type, entity_type, entity_id, registration_id, order_id, payment_id, actor_type, metadata
  ) VALUES (
    'PAYMENT_FAILED', 'payment', v_payment_id, v_order.registration_id, v_order.id, v_payment_id, 'webhook',
    jsonb_build_object('razorpay_payment_id', p_razorpay_payment_id, 'razorpay_order_id', p_razorpay_order_id)
  );

  RETURN jsonb_build_object(
    'status', 'failed',
    'order_id', v_order.id,
    'payment_id', v_payment_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION process_order_paid(
  p_razorpay_order_id TEXT,
  p_amount_paise INTEGER,
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
  v_payment RECORD;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('status', 'already_paid', 'order_id', v_order.id);
  END IF;

  IF v_order.amount_paise <> p_amount_paise THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  SELECT * INTO v_payment
  FROM payments
  WHERE razorpay_order_id = p_razorpay_order_id AND status = 'captured'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'awaiting_capture_processing',
      'order_id', v_order.id,
      'payment_id', v_payment.id
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'acknowledged',
    'order_id', v_order.id,
    'message', 'order.paid received; awaiting payment.captured'
  );
END;
$$;

REVOKE ALL ON FUNCTION process_payment_captured FROM PUBLIC;
REVOKE ALL ON FUNCTION process_payment_failed FROM PUBLIC;
REVOKE ALL ON FUNCTION process_order_paid FROM PUBLIC;
REVOKE ALL ON FUNCTION generate_public_registration_id FROM PUBLIC;

GRANT EXECUTE ON FUNCTION process_payment_captured TO service_role;
GRANT EXECUTE ON FUNCTION process_payment_failed TO service_role;
GRANT EXECUTE ON FUNCTION process_order_paid TO service_role;
