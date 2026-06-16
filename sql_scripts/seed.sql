-- ============================================================
-- CONFLUENCE 2026 — Seed Data
-- ============================================================
-- Run AFTER schema.sql and policies.sql
-- ============================================================

INSERT INTO pass_types (name, slug, price, category, description, perks, available_qty, is_active)
VALUES

(
  'Learning Lab Pass',
  'learning-lab',
  4500.00,
  'Education',
  'Deep-dive workshops, hands-on sessions, and skill-building experiences curated for builders and learners.',
  '["3 curated workshops","Learning Lab access","Workshop materials kit","Lunch & refreshments","Certificate of participation","Confluence swag bag"]',
  50,
  TRUE
),

(
  'Concept Cocoon Pass',
  'concept-cocoon',
  1000.00,
  'Startup',
  'Ideation labs, founder sessions, and startup pitch opportunities. Built for early-stage builders and dreamers.',
  '["Ideation lab access","Pitch session slot","Founder roundtables","Investor networking hour","Lunch & refreshments","Concept Cocoon swag"]',
  200,
  TRUE
),

(
  'Networking Gala Pass',
  'networking-gala',
  150.00,
  'Networking',
  'Premium networking evening with curated connections, mentor speed-rounds, and exclusive community access.',
  '["Gala evening entry","Curated networking rounds","1-on-1 mentor sessions","Industry leader panels","Premium dinner","Exclusive Gala swag"]',
  5000,
  TRUE
);

-- ============================================================
-- Verify
-- ============================================================
SELECT id, name, slug, price, available_qty, is_active FROM pass_types ORDER BY price;
