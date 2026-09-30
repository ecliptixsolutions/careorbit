# CareOrbit backup verification report

## Status: FAIL — full database backup not created

The active source is `wjrteuclldaunsnstvcn.supabase.co`. REST access and the authentication admin endpoint both responded successfully in read-only checks. The repository contains API credentials only; it contains no Supabase database connection URL or database password. Neither `supabase` CLI nor `pg_dump` is available on this host.

Therefore a PostgreSQL logical backup was not attempted and no backup file exists. A REST data extract would not preserve PostgreSQL schema objects, functions/RPCs, constraints, auth records, or a reliable point-in-time snapshot, so it is not represented as a database backup.

| Check | Result |
| --- | --- |
| Database backup | FAIL |
| Backup file | NOT CREATED |
| Size | NOT CREATED |
| SHA-256 | NOT CREATED |
| Structural validation | NOT POSSIBLE |
| Storage bucket `hospital-assets` | Accessible; 0 top-level objects reported |
| Storage export artifact | NOT CREATED |
| Authentication status | PARTIAL — 4 identities match 4 profiles; no auth export |

Required to proceed: a temporary, read-only Supabase PostgreSQL connection string (or database password plus the official connection details), or a verified downloadable Supabase dashboard backup. No secret should be committed to this repository.
