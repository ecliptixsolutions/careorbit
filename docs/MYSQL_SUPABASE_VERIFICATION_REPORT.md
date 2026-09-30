# CareOrbit MySQL Verification Report

Audited: 2026-09-11. This was a read-only verification. No SQL migration, DDL, DML, import, deletion, or remote database operation was performed.

## Executive status

| Item | Result |
| --- | --- |
| Database target | `u791891216_careorbit` |
| MySQL connection | **PASS** — authenticated Hostinger phpMyAdmin session, read-only queries |
| Server/version | MariaDB `11.8.9-MariaDB-log` |
| Schema migration | **COMPLETE** — live CareOrbit schema matches expected table/trigger/FK counts |
| Data migration | **UNVERIFIED** — source comparison unavailable; MySQL clinical/application data is absent |
| Application migration | **PARTIAL** |
| Supabase runtime dependency | **ACTIVE** |
| MySQL backend | **PARTIAL** |
| Production ready | **NO** |

## Database and schema

The existing `database/careorbit_mysql_migration.sql` was inspected but not run. It declares 20 expected application tables, 27 triggers, 17 foreign keys, and 14 explicit indexes. The live database verified as `u791891216_careorbit`, with **20 base tables, 27 triggers, 17 foreign keys, and 61 indexes** (the latter includes primary and engine/constraint indexes). It contains every expected CareOrbit table: profiles, user_roles, patients, appointments, notifications, prescriptions, invoices, payments, lab_orders, pharmacy_items, dispensations, audit_logs, pharmacy_invoice_items, organization_settings, service_catalog, import_batches, role_session_policies, user_sessions, notification_read_states, and custom_role_templates.

`auth_users` is **not** in the base schema artifact and is absent from the live 20-table database. The separate `database/20260911_auth_forward_migration.sql` was not run. Authentication-table existence, user counts, active state, linked profiles/roles, session state, and password hashes are therefore **UNVERIFIED/NOT MIGRATED**.

The direct local connection attempt was rejected because phpMyAdmin's `127.0.0.1` is internal to Hostinger. The authenticated Hostinger phpMyAdmin session subsequently performed only `SELECT` queries; no schema/data change was made.

## Data comparison

Supabase source comparison was not possible. Supabase variables are present locally, but this audit did not use them and no read-only authenticated source connection was configured. Live MySQL row counts are: `organization_settings=1`, `role_session_policies=11`; all other 18 expected tables are `0` (total `12`). Thus clinical, billing, pharmacy, profile, role, notification, audit, import, and session data are absent from MySQL. ID comparison and orphan checks remain **UNABLE TO VERIFY**; whether this represents missing migration data or an intentionally empty baseline cannot be proven without read-only Supabase source counts.

## Application and security gaps

The Node API in `hostinger-api/src/server.js` has a MySQL pool, HTTP-only session cookie, bcryptjs hashing, parameterized values, a table allow-list, and health endpoints. It has no uploads endpoint and no resource-specific API routes. Its generic data endpoint does not reproduce the Supabase RLS rules. The source RLS migrations protect profiles, roles, patients, appointments, notifications, prescriptions, invoices, payments, lab orders, pharmacy, dispensations, audit logs, and pharmacy billing with user/role ownership rules; the backend supplies only a coarse admin-table check. **RLS replacement: PARTIAL/UNSAFE FOR PRODUCTION.**

No server implementation was found for transactional equivalents of `finalize_invoice`, `cancel_invoice`, `record_invoice_payment`, `create_pharmacy_bill`, `dispense_medicine`, or the import RPCs. No `START TRANSACTION`, `FOR UPDATE`, rollback, or commit logic was found in the Node API. Billing, payment, stock, pharmacy, and imports are therefore **NOT MIGRATED** and lack demonstrated race/duplicate protection beyond schema constraints.

The SQL artifact declares uniqueness for invoice number, receipt number, lab order number, profile email, pharmacy SKU/batch, service code, and MRN; live enforcement is unverified.

## Supabase dependency inventory

The frontend bridge at `src/integrations/supabase/client.ts` uses `fetch` to the Hostinger API, but 51+ legacy query/auth/RPC/storage-shaped call sites still use its `supabase` compatibility API. They are not all usable replacements: its RPC and Edge-function methods intentionally return migration errors.

Active or reachable Supabase dependencies remain:

- `api/appointment-notification.ts` uses `SUPABASE_URL` and calls Supabase Auth `/auth/v1/user`.
- `src/integrations/supabase/client.server.ts` imports `@supabase/ssr` and `@supabase/supabase-js` despite both packages being absent from `package.json`.
- `supabase/functions/invite-staff/index.ts` remains a Supabase Edge Function using Auth admin invites, RPC `has_role`, and `import_batches`.
- `vercel.json` permits `https://*.supabase.co` and `wss://*.supabase.co` in CSP.
- Supabase environment variable names remain in `.env`/`.env.local`; values are not reported.

Status: database **PARTIAL**, auth **ACTIVE**, storage **PARTIAL**, RPC **PARTIAL**, Edge Function **ACTIVE**, realtime **UNKNOWN**. There is no `public/uploads` directory and no backend upload route, so storage migration is **NOT MIGRATED**.

## Environment and packages

`MYSQL_*` and `API_BASE_URL` appear in `.env.example`; active credentials are unavailable. Supabase variable names appear in local env files. No `VITE_MYSQL*` variable or frontend MySQL credential reference was found: **client credential exposure PASS**.

`mysql2`, `express`, `bcryptjs`, and `dotenv` are runtime dependencies. `@supabase/supabase-js` and `@supabase/ssr` are absent from `package.json`, but stale server code imports them; this is a broken dependency, not a completed removal. `@lovable.dev/cloud-auth-js` remains installed; this audit found it used only through the Lovable integration layer.

## Build and tests

- `npm run build`: **PASS**
- `npm test`: **PASS** — 4 files, 16 tests
- `npx tsc --noEmit`: **FAIL** — stale Supabase server imports plus implicit-any/type regressions from the compatibility bridge
- `npm run lint`: **FAIL** — pre-existing formatting failures and compatibility bridge lint failures

## Exact next steps

1. Provide a read-only Supabase source credential to compare counts and stable IDs; do not migrate data until differences are reviewed.
3. Replace the compatibility calls with authorized resource routes and implement server transactions for billing, payments, pharmacy, and imports.
4. Replace/remove the Supabase Edge Function, Supabase auth API endpoint, stale server client, CSP allowances, and Supabase env runtime use.
5. Implement secure uploads, password-reset mail/token flow, complete RLS-equivalent authorization, then make typecheck and lint pass.
