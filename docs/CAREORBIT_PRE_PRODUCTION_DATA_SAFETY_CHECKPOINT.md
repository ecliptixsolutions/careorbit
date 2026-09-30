# CareOrbit pre-production data safety checkpoint

Date: 2026-09-14

## Source verification

- Active Supabase source: `wjrteuclldaunsnstvcn.supabase.co` — REST and auth endpoints reachable.
- `supabase/config.toml` names a different project ID and is treated as stale configuration, not as the active source.
- Read-only source counts: profiles 4; user_roles 4; audit_logs 5; user_sessions 2; organization_settings 1; role_session_policies 11; all other listed CareOrbit application tables 0.
- Storage bucket `hospital-assets` exists and reported 0 top-level objects. No storage export was created.
- Authentication: 4 identities match the 4 profile IDs. No password material or replacement credentials were created.

## Backup gate

- Full Supabase database backup: BLOCKED. No Postgres connection credential/URL or downloadable dashboard backup was available.
- Backup artifact: NOT CREATED.
- Backup verification: FAIL (there is no file to inspect or checksum).

## MySQL verification

- Target database: `u791891216_careorbit`.
- A fresh terminal verification is BLOCKED: the configured local MySQL proxy at `127.0.0.1:3307` refused the connection, and the Hostinger browser session is no longer available to this task.
- The previously observed schema baseline was 20 tables, 27 triggers, 17 foreign keys, 61 indexes; it is not asserted as a fresh verification here.
- No query was submitted after the SQL editor was staged; therefore no MySQL data was changed in this safety-gate task.

## 15-record migration file

- File: `database/20260911_careorbit_missing_data_migration.sql`
- SHA-256: `2C5E23083116B0C947E77F53A4A65C45DE71EF9EB8FA9A3F0B782B8A8E0070AA`
- Content verified: profiles 4, user_roles 4, audit_logs 5, user_sessions 2 (15 total).
- Transaction wrapper present; no DELETE, DROP, TRUNCATE, or standalone UPDATE statement found.
- Execution: NO.

## Result

Production safety gate: **BLOCKED**. Obtain and verify a read-only full Supabase backup, then restore access for a fresh read-only Hostinger MySQL check before approving any data migration.
