-- ============================================================
-- Migration 005: payments
-- Authoritative payment records (webhook-written in Phase 2+)
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL,
  registration_id     UUID NOT NULL,
  razorpay_payment_id TEXT NOT NULL,
  razorpay_order_id   TEXT NOT NULL,
  amount              NUMERIC(10, 2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  method              TEXT,
  status              TEXT NOT NULL,
  signature_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_event       TEXT,
  webhook_payload     JSONB,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT payments_order_fk
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
  CONSTRAINT payments_registration_fk
    FOREIGN KEY (registration_id) REFERENCES registrations (id) ON DELETE RESTRICT,
  CONSTRAINT payments_razorpay_payment_id_unique UNIQUE (razorpay_payment_id),
  CONSTRAINT payments_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT payments_status_check CHECK (
    status IN ('captured', 'failed', 'refunded')
  ),
  CONSTRAINT payments_captured_requires_verified CHECK (
    (status = 'captured' AND signature_verified = TRUE AND paid_at IS NOT NULL)
    OR (status <> 'captured')
  )
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_registration_id ON payments (registration_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON payments (razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at DESC);

COMMENT ON TABLE payments IS 'Immutable payment audit trail. Insert/update only via service_role (Edge Functions).';
