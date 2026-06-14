-- ============================================================
-- Migration 003: registration_items
-- Line items per registration
-- ============================================================

CREATE TABLE IF NOT EXISTS registration_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL,
  event_id        UUID NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price      NUMERIC(10, 2) NOT NULL,
  line_subtotal   NUMERIC(10, 2) NOT NULL,
  event_answers   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT registration_items_registration_fk
    FOREIGN KEY (registration_id) REFERENCES registrations (id) ON DELETE CASCADE,
  CONSTRAINT registration_items_event_fk
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT,
  CONSTRAINT registration_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT registration_items_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT registration_items_line_subtotal_non_negative CHECK (line_subtotal >= 0),
  CONSTRAINT registration_items_line_subtotal_matches CHECK (
    line_subtotal = (unit_price * quantity)
  )
);

CREATE INDEX IF NOT EXISTS idx_registration_items_registration_id
  ON registration_items (registration_id);
CREATE INDEX IF NOT EXISTS idx_registration_items_event_id
  ON registration_items (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_items_registration_event_unique
  ON registration_items (registration_id, event_id);

COMMENT ON TABLE registration_items IS 'Selected events per registration with price snapshot and pass-specific answers.';
