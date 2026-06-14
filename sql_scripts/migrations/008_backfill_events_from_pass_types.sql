-- ============================================================
-- Migration 008: Backfill events from pass_types (idempotent)
-- Does NOT modify pass_types. Safe while legacy flow runs.
-- Run AFTER 001_create_events.sql
-- ============================================================

INSERT INTO events (
  id, name, slug, price, category, description, perks,
  available_qty, sold_qty, is_active, created_at
)
SELECT
  id, name, slug, price, category, description, perks,
  available_qty, sold_qty, is_active, created_at
FROM pass_types
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  price         = EXCLUDED.price,
  category      = EXCLUDED.category,
  description   = EXCLUDED.description,
  perks         = EXCLUDED.perks,
  available_qty = EXCLUDED.available_qty,
  sold_qty      = EXCLUDED.sold_qty,
  is_active     = EXCLUDED.is_active,
  updated_at    = NOW();
