# CAREORBIT AUTH IMPLEMENTATION AUDIT — 2026-09-11

## Scope
Read-only audit before MySQL auth hardening. No DB modifications.

## 1. Login / Signup Pages
- `src/routes/login.tsx` (`/login`) — `supabase.auth.signInWithPassword`, `getSession` auto-redirect, email+password, forgot link
- `src/routes/signup.tsx` (`/signup`) — 2-step wizard (full_name, organization, role select, phone → email/password), `supabase.auth.signUp` with `options.data` + fallback `signInWithPassword`, `signupRoleOptions` (9 roles), `passwordRequirements` validation
- `src/routes/forgot-password.tsx` — `resetPasswordForEmail` (stub: "mail provider not configured")
- `src/routes/reset-password.tsx` — `onAuthStateChange(PASSWORD_RECOVERY)`, `exchangeCodeForSession`, `updateUser` (stubbed), `signOut`

## 2. Auth Hooks / Context
- `src/hooks/use-auth.ts` — no React Context, uses `onAuthStateChange` + `getSession`, returns `{session,user,loading}` via `supabase.auth`
- `src/hooks/use-role-access.ts` — TanStack Query fetching `profiles`+`user_roles`, `pickPrimaryRole`, `isPendingApproval` detection
- `src/hooks/use-session-tracking.ts` — decodes JWT `session_id`, upserts `user_sessions`

## 3. Protected Routes / Role Guards
- `src/routes/_authenticated.tsx` — `createFileRoute("/_authenticated")`, checks `useAuth`+`useRoleAccess`, redirects to `/login` if no user, blocks `isPendingApproval` with forced signOut screen, wraps `<AppShell><Outlet>`
- `src/components/app-shell.tsx` — filters nav by `access.permissions`, 18 links, `getSessionId` + `supabase.from(user_sessions).update(revoked)` + `supabase.auth.signOut()`
- `src/lib/access-control.ts` — `roleDefinitions` 11 keys, `permissions` 30 keys, `signupRoleOptions`, `rolePriority`, `databaseRoleFor`, `pendingLabel`

## 4. Supabase Auth Calls (grep counts)
- `@supabase/supabase-js` 6 hits, `@supabase/ssr` 8 hits — package NOT in `package.json` (stale)
- `supabase.auth` 25 hits, `signUp` 3, `signInWithPassword` 5, `signOut` 12, `getSession` 12, `getUser` 9, `onAuthStateChange` 3, `exchangeCodeForSession` 2, `resetPasswordForEmail` 2, `updateUser` 2, `admin.inviteUserByEmail` 1
- `supabase.from()` 24 hits, `.rpc()` 10 hits (`approve_user_role`, `has_role`, billing RPCs)
- `from.*supabase|import.*supabase` 64 hits across 38 files
- Remaining Supabase call sites: 51+ legacy `supabase.from/rpc/functions/storage` routed via bridge but not yet native MySQL transactions

## 5. Frontend Bridge
- `src/integrations/supabase/client.ts` (177 lines) — NOT real Supabase: `fetch(VITE_API_BASE_URL+"/api/...")` with `credentials:"include"`, stubbed `rpc/functions/storage`. Maps: `getSession→GET /api/auth/me`, `signInWithPassword→POST /api/auth/login`, `signUp→POST /api/auth/signup`, `signOut→POST /api/auth/logout`, `updateUser→POST /api/auth/change-password`
- `src/integrations/supabase/client.server.ts` — SSR `createServerClient` with `careorbit-${projectRef}-auth-v2` cookie, `supabaseAdmin` service_role — unused at runtime (frontend points to Hostinger)
- `src/integrations/supabase/auth-middleware.ts` — `requireSupabaseAuth` + `requireRole` (verify `getUser`, `profiles.status='active'`, `user_roles` pending check, `user_sessions` idle/absolute timeout)
- `api/appointment-notification.ts` — separate Twilio route, still validates via `fetch /auth/v1/user`

## 6. Hostinger API (`hostinger-api/src/server.js` 299 lines)
- `express` + `mysql2/promise` pool (`MYSQL_HOST/PORT/DATABASE/USER/PASSWORD`, missing→`pool=null` 503)
- `tables` 20 allow-listed, `adminTables` 6 requiring `admin` role (coarse)
- Routes: `GET /api/health`, `GET /api/health/db`, `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout` (auth), `GET /api/auth/me` (auth), `POST /api/auth/change-password` (auth), `POST /api/data/:table` (auth, filter DSL eq/neq/is/in, select/insert/upsert/update/delete, LIMIT 1000)
- Cookie `careorbit_session` `HttpOnly SameSite=Lax Secure?production Max-Age=28800` (8h), `auth()` middleware: `WHERE s.id=? AND revoked_at IS NULL AND last_activity_at>DATE_SUB(NOW(), INTERVAL 8 HOUR)`
- `scripts/verify-mysql.js` read-only inspector

## 7. Database Schema
- `database/careorbit_mysql_migration.sql` (1040 lines) — 20 tables, 27 triggers, 17 FKs, 61 indexes, MariaDB-safe (generated columns for func indexes, triggers for UUID/auto-numbering, `DATETIME(6)`, `JSON` nullable)
- `database/20260911_auth_forward_migration.sql` — pending `CREATE TABLE IF NOT EXISTS auth_users(id CHAR(36) PK, email VARCHAR(255) UNIQUE, password_hash VARCHAR(255), is_active TINYINT, created_at/updated_at DATETIME(6))` — MISSING `email_verified`, `last_sign_in_at`, `email_lower` normalized uniqueness, `updated_at` trigger
- `database/20260911_careorbit_missing_data_migration.sql` — NOT EXECUTED, 4 profiles + 4 user_roles + 5 audit_logs + 2 user_sessions (15 records)
- `database/cleanup_partial_careorbit_migration.sql` — rollback helper
- `supabase/setup_new_project.sql` + 9 migrations — define `has_role`, `has_custom_role`, `approve_user_role`, RLS (not ported to MariaDB)

## 8. Auth Gaps Found
- **Signup not transactional**: 3 separate `execute` without `BEGIN/COMMIT/ROLLBACK` → partial state possible
- **Signup weak validation**: regex `/^\S+@\S+\.\S+$/` + 10-char check only; frontend enforces `passwordRequirements` but server does not (uppercase/lowercase/number/special)
- **Signup ignores roles safely** (forces `pending_approval` + `staff`) but also prevents any test account from logging in (`login` requires `status='active'`)
- **Login rejects pending**: blocks QA testing until `approve_user_role` (no API exists for it)
- **No rate limiting / brute-force protection** on login/signup
- **No CORS** middleware (`credentials: include` from browser will fail cross-origin without headers)
- **Cookie missing Partitioned/Secure nuances**, `SameSite=Lax` OK but no `Secure` in dev
- **auth_users missing fields**: spec requires `email_verified`, `last_sign_in_at`; also needs `email_lower` generated column + unique index for case-insensitive normalized email
- **Frontend signup still sends `role` in payload** but server discards — UX mismatch (user selects Super Admin but gets Staff/pending)
- **Double-click protection** only via `loading` disable on signup; login button also disabled but no server-side dedup/idempotency beyond DB unique constraint
- **Privilege escalation**: public signup cannot escalate (server ignores role), PASS, but `POST /api/data/user_roles` allow-listed as admin-only only — non-admin can still attempt via generic data route with `admin` check only literal `admin` (custom roles like `hospital_admin` mapped to `admin` DB role may bypass)
- **Supabase vestiges**: `client.server.ts` still imports `@supabase/ssr`/`@supabase/supabase-js` absent from `package.json` — build will warn/break if imported

## 9. Existing Supabase Identities
- 4 auth identities in Supabase matching 4 profile IDs, NO password hashes migrated, NO `auth_users` in MySQL → documented future strategy: invite to set new password / secure reset / admin activation (do NOT invent passwords)

## 10. Immediate Plan
- Enhance `20260911_auth_forward_migration.sql` to add `email_lower`, `email_verified`, `last_sign_in_at`
- Harden `server.js`: transactions, full password policy, CORS, rate-limit, normalize email, transactionally handle duplicate 409, activate `staff` QA path or approve flow
- Fix frontend: normalize email (toLowerCase+trim), disable double submit on login, align role UX with server reality
- Verify build/typecheck/lint
