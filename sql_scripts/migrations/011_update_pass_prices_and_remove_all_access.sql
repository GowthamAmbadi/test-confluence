-- ============================================================
-- Migration 011: Update pass prices and remove All Access Pass
-- ============================================================

-- Update Networking Gala Pass price
UPDATE pass_types SET price = 150.00 WHERE slug = 'networking-gala';
UPDATE events SET price = 150.00 WHERE slug = 'networking-gala';

-- Remove All Access Pass
DELETE FROM pass_types WHERE slug = 'all-access';
DELETE FROM events WHERE slug = 'all-access';
