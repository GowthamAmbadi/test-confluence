# Confluence 2026 — Event Operations Admin (Module 1)

Internal staff dashboard for authentication and team management.

## Stack

- React + Vite + TypeScript
- Supabase Auth (`auth.users`)
- Supabase Edge Functions: `admin-me`, `admin-record-login`, `admin-team`
- Tables: `admin_profiles`, `admin_login_audit`

## Setup

### 1. Apply database migration

Run in Supabase SQL Editor:

```
sql_scripts/migrations/013_admin_auth_team.sql
```

### 2. Bootstrap first Super Admin

1. Supabase Dashboard → **Authentication → Users → Add user**
   - Email + password
   - Confirm email

2. Copy the new user's UUID, then run:

```sql
INSERT INTO admin_profiles (user_id, full_name, email, role, is_active)
VALUES (
  'PASTE_AUTH_USER_UUID_HERE',
  'Your Name',
  'you@yanc.in',
  'SUPER_ADMIN',
  TRUE
);
```

### 3. Configure secrets

```bash
supabase secrets set ADMIN_APP_URL=http://localhost:5173
```

For production:

```bash
supabase secrets set ADMIN_APP_URL=https://ops.confluence.yanc.in
```

### 4. Deploy Edge Functions

```bash
supabase functions deploy admin-me
supabase functions deploy admin-record-login
supabase functions deploy admin-team
```

### 5. Run admin app locally

```bash
cd admin
cp .env.example .env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open http://localhost:5173

## Roles

| Role | Module 1 access |
|------|-----------------|
| `SUPER_ADMIN` | Full access + Team management |
| `CHECKIN_STAFF` | Login, home (check-in in Module 3) |
| `SUPPORT_DESK` | Login, home (support in Module 2) |

## Routes

| Route | Access |
|-------|--------|
| `/login` | Public |
| `/forgot-password` | Public |
| `/reset-password` | Recovery link |
| `/` | All active staff |
| `/team` | Super Admin only |
| `/unauthorized` | All |

## Login audit

Every successful sign-in calls `admin-record-login` with:

- Staff profile ID
- IP address (from proxy headers)
- User agent
- Device label
- Timestamp → `admin_login_audit` + `admin_profiles.last_login_at`

## Team management (Super Admin)

- Create account (invite email or temporary password)
- Deactivate / activate
- Assign role
- Reset password (email link)
- View last login + status

## Not included (future modules)

- Dashboard analytics
- Registration search
- Check-in scanner
- Support cases
