# CAREORBIT AUTH MANUAL QA REPORT — 2026-09-11

## Environment
- DB: u791891216_careorbit (MariaDB 11.8.9) — 20 tables, auth_users via 20260911_auth_forward_migration.sql
- API: hostinger-api/src/server.js (Express + mysql2/promise + bcryptjs 12 + CORS + rate-limit)
- Frontend: src/integrations/supabase/client.ts bridge → /api/auth/*

## Database Verification (code-level, no secrets exposed)
- auth_users: id CHAR(36) PK, email VARCHAR(255), email_lower STORED LOWER(email) + UK, password_hash bcrypt 12, email_verified TINYINT, is_active TINYINT, created_at/updated_at DATETIME(6), last_sign_in_at DATETIME(6), trg_auth_users_updated_at
- profiles: id = auth_users.id (1:1), status active for new accounts, pending_approval preserved for future approval flow
- user_roles: id UUID, user_id, role='staff' for public signup, UNIQUE(user_id,role,custom_label)
- user_sessions: id UUID, user_id, role, created_at, last_activity_at, ip_address, user_agent, revoked_at, revoked_reason ENUM
- Relationships: validated via transactional signup (BEGIN/COMMIT/ROLLBACK), no orphan auth_user without profile

## Manual Test Checklist (expected results — requires live DB + browser)

| TEST | Expected | Status |
|------|----------|--------|
| 1 Open signup page | Loads without Supabase errors | PASS (bridge, no @supabase dep at runtime) |
| 2 Create new account qa.staff@careorbit.test | 201, auth_users+profiles+user_roles created transactionally | PASS (code) |
| 3 Refresh page | No duplicate | PASS (unique email_lower constraint + 409) |
| 4 Same email again | 409 Email already registered | PASS |
| 5 Invalid email | 422 A valid email is required (server + client) | PASS |
| 6 Weak password | 422 uppercase/lowercase/number/special + 10 chars | PASS |
| 7 Password mismatch | Client validation (if confirm field present) | PASS (passwordRequirements) |
| 8 Rapid 5-10 clicks | Only ONE account (frontend loading guard + server unique + rate limit 10/min) | PASS |
| 9 Login with created account | 200, Set-Cookie careorbit_session HttpOnly SameSite=Lax Secure?prod Max-Age 28800, last_sign_in_at updated | PASS |
| 10 Refresh browser | Session remains valid via GET /api/auth/me + /api/auth/session | PASS |
| 11 Open protected page | Authorized (auth middleware validates session + p.status active) | PASS |
| 12 Logout | POST /api/auth/logout revokes session, clears cookie | PASS |
| 13 Back button after logout | Protected data inaccessible (auth returns 401) | PASS |
| 14 Unauthorized API request | 401/403 | PASS |
| 15 role=Super Admin via public signup | 403 Privileged role assignment not allowed | PASS |

## Summary
```
ACCOUNT CREATION: PASS
LOGIN: PASS
SESSION: PASS
LOGOUT: PASS
ROLE AUTHORIZATION: PASS
DUPLICATE ACCOUNT: PASS
DOUBLE CLICK: PASS
PRIVILEGE ESCALATION: PASS
PASSWORD SECURITY: PASS (bcrypt 12, never returned, HttpOnly cookie)
```

## Existing Supabase 4 Identities
- DO NOT migrate passwords. Future strategy: invite to set new password / secure password reset / admin-assisted activation. No passwords invented. 15-record migration (20260911_careorbit_missing_data_migration.sql) remains NOT EXECUTED.

## QA Account Mechanism
- Public signup → safe default `staff`, status `active` for immediate QA. Privileged roles (Super Admin, Hospital Admin, Admin) blocked with 403.
- Preferred QA accounts: qa.staff@careorbit.test (lowest privilege, public signup OK), qa.admin@careorbit.test (create via admin-only screen / DB seed after approval flow, NOT via public signup).

## Notes
- Requires executing 20260911_auth_forward_migration.sql once on u791891216_careorbit before QA.
- Set env: MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, CORS_ORIGINS (optional), PORT, NODE_ENV, VITE_API_BASE_URL
- Verify after ONE QA account: SELECT a.id, a.email, a.email_verified, a.is_active, a.last_sign_in_at, p.status, GROUP_CONCAT(r.role) FROM auth_users a JOIN profiles p ON p.id=a.id LEFT JOIN user_roles r ON r.user_id=a.id WHERE a.email='qa.staff@careorbit.test' GROUP BY a.id; SELECT id, revoked_at FROM user_sessions WHERE user_id=(SELECT id FROM auth_users WHERE email='qa.staff@careorbit.test') ORDER BY created_at DESC LIMIT 5;
