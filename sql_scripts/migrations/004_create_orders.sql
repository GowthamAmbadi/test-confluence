-- ============================================================
-- Migration 004: orders
-- Replaces cart_orders conceptually (legacy table retained)
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id   UUID NOT NULL,
  razorpay_order_id TEXT,
  subtotal          NUMERIC(10, 2) NOT NULL,
  discount          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  coupon_code       TEXT,
  gst               NUMERIC(10, 2) NOT NULL,
  total             NUMERIC(10, 2) NOT NULL,
  amount_paise      INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'INR',
  status            TEXT NOT NULL DEFAULT 'created',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ,

  CONSTRAINT orders_registration_fk
    FOREIGN KEY (registration_id) REFERENCES registrations (id) ON DELETE RESTRICT,
  CONSTRAINT orders_razorpay_order_id_unique UNIQUE (razorpay_order_id),
  CONSTRAINT orders_subtotal_non_negative CHECK (subtotal >= 0),
  CONSTRAINT orders_discount_non_negative CHECK (discount >= 0),
  CONSTRAINT orders_gst_non_negative CHECK (gst >= 0),
  CONSTRAINT orders_total_non_negative CHECK (total >= 0),
  CONSTRAINT orders_amount_paise_positive CHECK (amount_paise > 0),
  CONSTRAINT orders_amount_paise_matches_total CHECK (amount_paise = ROUND(total * 100)),
  CONSTRAINT orders_status_check CHECK (
    status IN ('created', 'paid', 'failed', 'expired')
  ),
  CONSTRAINT orders_paid_at_when_paid CHECK (
    (status = 'paid' AND paid_at IS NOT NULL)
    OR (status <> 'paid')
  )
);

CREATE INDEX IF NOT EXISTS idx_orders_registration_id ON orders (registration_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON orders (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

COMMENT ON TABLE orders IS 'Payment order per registration. razorpay_order_id populated in Phase 2 create-order.';
