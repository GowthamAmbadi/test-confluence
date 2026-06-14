-- ============================================================
-- Migration 001: events
-- Replaces pass_types conceptually (legacy table retained)
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  price         NUMERIC(10, 2) NOT NULL,
  category      TEXT,
  description   TEXT,
  perks         JSONB NOT NULL DEFAULT '[]'::jsonb,
  available_qty INTEGER NOT NULL DEFAULT 100,
  sold_qty      INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT events_slug_unique UNIQUE (slug),
  CONSTRAINT events_price_non_negative CHECK (price >= 0),
  CONSTRAINT events_available_qty_non_negative CHECK (available_qty >= 0),
  CONSTRAINT events_sold_qty_non_negative CHECK (sold_qty >= 0),
  CONSTRAINT events_capacity_invariant CHECK (sold_qty <= available_qty)
);

CREATE INDEX IF NOT EXISTS idx_events_slug ON events (slug);
CREATE INDEX IF NOT EXISTS idx_events_active ON events (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_events_category ON events (category);

COMMENT ON TABLE events IS 'Event/pass catalogue. Phase 2+ source of truth. Legacy pass_types retained for Phase 1.';
