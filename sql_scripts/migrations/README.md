# Database Migrations — Confluence 2026

Phase 1 additive migrations. Legacy tables (`pass_types`, `participants`, `applications`, `cart_orders`, `waitlist`) are **not dropped**.

## Apply order (Supabase SQL Editor)

Run in sequence on **staging first**, then production:

| # | File | Purpose |
|---|------|---------|
| 001 | `001_create_events.sql` | `events` table |
| 002 | `002_create_registrations.sql` | `registrations` table |
| 003 | `003_create_registration_items.sql` | `registration_items` (requires 001, 002) |
| 004 | `004_create_orders.sql` | `orders` (requires 002) |
| 005 | `005_create_payments.sql` | `payments` (requires 002, 004) |
| 006 | `006_create_audit_logs.sql` | `audit_logs` (requires 002, 004, 005) |
| 007 | `007_new_tables_rls.sql` | RLS on new tables (requires 001–006) |
| 008 | `008_backfill_events_from_pass_types.sql` | Optional: sync `events` from `pass_types` |
| 009 | `009_revoke_legacy_anon_updates.sql` | Security: drop `applications_public_update` |
| 010 | `010_payment_webhook_rpc.sql` | Transactional RPCs for `payment-webhook` |

## Validation (after 007)

```sql
-- New tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('events', 'registrations', 'registration_items', 'orders', 'payments', 'audit_logs');

-- Legacy row counts unchanged (snapshot before migration, compare after)
SELECT 'pass_types' AS t, COUNT(*) FROM pass_types
UNION ALL SELECT 'applications', COUNT(*) FROM applications;

-- anon cannot insert registrations (should fail from anon client)
-- service_role can insert (Edge Functions, Phase 2)
```

## Rollback (reverse order, only if new tables are empty)

```
009 → 008 (no-op) → 007 → 006 → 005 → 004 → 003 → 002 → 001
```

Do **not** drop new tables if Phase 2 has written production data.

## Phase 2 (not included here)

- `create-registration` / `create-order` Edge Functions (service_role writes)
- Data backfill: `applications` → `registrations` + `registration_items`
- Frontend cutover to new tables
