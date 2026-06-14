-- ============================================================
-- Migration 006: audit_logs
-- Append-only operational audit trail
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  registration_id UUID,
  order_id        UUID,
  payment_id      UUID,
  actor_type      TEXT NOT NULL DEFAULT 'system',
  actor_id        TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT audit_logs_event_type_check CHECK (
    event_type IN (
      'REGISTRATION_CREATED',
      'ORDER_CREATED',
      'PAYMENT_CAPTURED',
      'PAYMENT_FAILED',
      'REGISTRATION_APPROVED',
      'EMAIL_SENT',
      'REFUND_CREATED'
    )
  ),
  CONSTRAINT audit_logs_actor_type_check CHECK (
    actor_type IN ('system', 'webhook', 'admin', 'anon')
  ),
  CONSTRAINT audit_logs_entity_type_check CHECK (
    entity_type IN (
      'registration',
      'registration_item',
      'order',
      'payment',
      'event',
      'email'
    )
  ),
  CONSTRAINT audit_logs_registration_fk
    FOREIGN KEY (registration_id) REFERENCES registrations (id) ON DELETE SET NULL,
  CONSTRAINT audit_logs_order_fk
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL,
  CONSTRAINT audit_logs_payment_fk
    FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_registration_id ON audit_logs (registration_id)
  WHERE registration_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_order_id ON audit_logs (order_id)
  WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

COMMENT ON TABLE audit_logs IS 'Append-only audit log. No UPDATE/DELETE from application roles.';
