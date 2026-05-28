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
  1499.00,
  'Education',
  'Deep-dive workshops, hands-on sessions, and skill-building experiences curated for builders and learners.',
  '["3 curated workshops","Learning Lab access","Workshop materials kit","Lunch & refreshments","Certificate of participation","Confluence swag bag"]',
  200,
  TRUE
),

(
  'Concept Cocoon Pass',
  'concept-cocoon',
  1999.00,
  'Startup',
  'Ideation labs, founder sessions, and startup pitch opportunities. Built for early-stage builders and dreamers.',
  '["Ideation lab access","Pitch session slot","Founder roundtables","Investor networking hour","Lunch & refreshments","Concept Cocoon swag"]',
  150,
  TRUE
),

(
  'Networking Gala Pass',
  'networking-gala',
  2499.00,
  'Networking',

  
  'Premium networking evening with curated connections, mentor speed-rounds, and exclusive community access.',
  '["Gala evening entry","Curated networking rounds","1-on-1 mentor sessions","Industry leader panels","Premium dinner","Exclusive Gala swag"]',
  100,
  TRUE
),

(
  'All Access Pass',
  'all-access',
  4999.00,
  'Premium',
  'The complete Confluence experience. Every session, every workshop, every networking opportunity — yours.',
  '["Full 2-day access","All workshops & labs","Gala evening entry","Priority mentor sessions","Startup pitch slot","Investor meet","Premium gift box","VIP lounge access","All-Access lanyard"]',
  50,
  TRUE
);

-- ============================================================
-- Verify
-- ============================================================
SELECT id, name, slug, price, available_qty, is_active FROM pass_types ORDER BY price;
