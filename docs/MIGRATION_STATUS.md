# CareOrbit migration status

Updated 2026-09-11.

## Verified MySQL checkpoint

- Database: `u791891216_careorbit`
- Server: MariaDB `11.8.9-MariaDB-log`
- Schema: 20 tables, 27 triggers, 17 foreign keys, 61 indexes
- Data: 12 rows total (`organization_settings`: 1; `role_session_policies`: 11; all other CareOrbit tables: 0)
- No schema import, data import, update, or deletion has been performed.

## Source recovery

Two repository-supported source candidates were tested read-only:

1. Current environment hostname: `wjrteuclldaunsnstvcn.supabase.co`
2. `supabase/config.toml` project ID: `qceswgasbqvzrjxwkafc` (standard endpoint form)

The original environment endpoint subsequently responded to a read-only service-role REST request. Counts were compared: MySQL is missing 4 profiles, 4 user roles, 5 audit logs, and 2 user sessions. ID parity has not yet been compared, and no records have been migrated.

## Gates

| Gate | Status |
| --- | --- |
| Schema verification | PASS |
| Source data comparison | PARTIAL — counts complete, IDs pending |
| Missing-data migration | NOT STARTED — 15 verified missing records |
| MySQL auth table | MISSING |
| API/RLS/RPC replacement | PARTIAL |
| Storage/invite migration | NOT READY |
| Role QA | BLOCKED |
| Production readiness | NO |

## Required input to proceed

Provide the original active Supabase project URL and a read-only service credential, or a verified Supabase backup/export. Once source data is available, compare counts and UUIDs first; only then migrate missing rows transactionally.
