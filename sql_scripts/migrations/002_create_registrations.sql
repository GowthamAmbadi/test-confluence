-- ============================================================
-- Migration 002: registrations
-- Replaces participants + applications header (legacy retained)
-- ============================================================

CREATE TABLE IF NOT EXISTS registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id TEXT,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  college         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,

  CONSTRAINT registrations_registration_id_unique UNIQUE (registration_id),
  CONSTRAINT registrations_status_check CHECK (
    status IN (
      'PAYMENT_PENDING',
      'PAYMENT_COMPLETE',
      'CANCELLED',
      'REFUNDED'
    )
  ),
  CONSTRAINT registrations_registration_id_when_complete CHECK (
    (status = 'PAYMENT_COMPLETE' AND registration_id IS NOT NULL)
    OR (status <> 'PAYMENT_COMPLETE')
  )
);

CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations (status);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations (email);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_registration_id ON registrations (registration_id)
  WHERE registration_id IS NOT NULL;

COMMENT ON TABLE registrations IS 'Checkout registration header. registration_id NULL until webhook approval (Phase 2+).';
COMMENT ON COLUMN registrations.registration_id IS 'Public tracking ID. Generated only after PAYMENT_COMPLETE.';
