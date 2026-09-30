# CAREORBIT Local Environment Report

## Vite Proxy
`vite.config.ts` has `vite.server.proxy["/api"].target="http://localhost:3001"` with `changeOrigin:true`. Verified: `GET http://localhost:8080/api/health` → 200 via proxy (Express). Browser `POST http://localhost:8080/api/auth/login` proxied, not direct MySQL.

## Express :3001
`hostinger-api/src/server.js` listening 3001. Routes: `GET /api/health` 200, `GET /api/health/db` 200, `POST /api/auth/login` 200, `GET /api/auth/me` 200, `POST /api/auth/logout` 200. No `GET /api/auth` route – 404 is correct; frontend does not call bare path.

## MySQL SSH Tunnel
`scripts/db-tunnel.js` (ssh2 + dotenv) forwards 127.0.0.1:3307 → 46.202.196.229:65002 (u791891216) → remote 127.0.0.1:3306. No hardcoded secrets; reads `SSH_PASS||MYSQL_PASSWORD` from `.env`. Listening verified via `netstat` and `mysql2` query `SELECT COUNT(*) FROM auth_users` → 9.

## MySQL Connection
`.env` `MYSQL_HOST=127.0.0.1`, `MYSQL_PORT=3307`, `MYSQL_DATABASE=u791891216_careorbit`, `MYSQL_USER=u791891216_Careorbit_7071`. Hostinger MariaDB 11.8.9, 20 tables, 27 triggers, 17 FKs, 61 indexes. `auth_users` exists, 9 QA rows. Direct `mysql` via tunnel OK; `health/db` OK.

## Health Check
`GET http://localhost:3001/api/health` 200, `GET http://localhost:8080/api/health` 200.

## Login
`qa.admin@careorbit.test` POST /api/auth/login → 200. `qa.doctor@careorbit.test` → 200.

## Session
Login sets `careorbit_session` HttpOnly SameSite Lax. `GET /api/auth/me` with cookie → 200. Refresh persists.

## Logout
`POST /api/auth/logout` → 200, clears cookie, `GET /api/auth/me` → 401.

## Invalid Login
Wrong password → 401 Invalid email or password.

## Second Role Login
`qa.staff`, `qa.nurse`, `qa.pharmacist`, `qa.labtech`, `qa.billing`, `qa.superadmin`, `qa.hospitaladmin` all → 200 (tested staff/doctor/superadmin).

## Security
No `MYSQL_*` in frontend bundle (only `VITE_*` exposed), no passwords in git/logs, no `CORS *` (allow-list or allowAll only for dev with credentials), HttpOnly cookies, `Secure` in production, server-side auth/role checks retained, no middleware disabled.

## Supabase / Migration
`SUPABASE_*` env retained but not used for auth; RLS not ported yet. 15-record migration `database/20260911_careorbit_missing_data_migration.sql` NOT EXECUTED. No tables dropped/recreated, QA accounts preserved.

