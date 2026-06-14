-- ============================================================
-- Migration 009: Revoke dangerous legacy anon UPDATE policies
-- Phase 1 security fix — run AFTER removing client-side approveApplication
-- Legacy INSERT/read on applications/participants unchanged
-- ============================================================

DROP POLICY IF EXISTS "applications_public_update" ON applications;
