-- ============================================================
-- Migration 012: allow EMAIL_FAILED in audit_logs.event_type
-- Required for payment-webhook email failure audit trail
-- ============================================================

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
    'REFUND_CREATED'
  )
);
