# CareOrbit data migration final report

Live MySQL verification through Hostinger phpMyAdmin found `u791891216_careorbit` on MariaDB 11.8.9 with 20 tables, 27 triggers, 17 foreign keys, and 61 indexes. Schema import was not run.

| Table group | Supabase count | MySQL count | Missing | Migrated | Status |
| --- | --- | --- | --- | --- | --- |
| profiles | 4 | 0 | 4 | 0 | MYSQL MISSING DATA |
| user_roles | 4 | 0 | 4 | 0 | MYSQL MISSING DATA |
| audit_logs | 5 | 0 | 5 | 0 | MYSQL MISSING DATA |
| user_sessions | 2 | 0 | 2 | 0 | MYSQL MISSING DATA |
| organization_settings | 1 | 1 | 0 | 0 | MATCH |
| role_session_policies | 11 | 11 | 0 | 0 | MATCH |
| remaining 14 expected tables | 0 | 0 | 0 | 0 | MATCH |

Read-only Supabase REST comparison recovered successfully. MySQL is missing 15 verified source records: 4 profiles, 4 user roles, 5 audit logs, and 2 user sessions. No Supabase/MySQL data was modified. ID comparison, duplicate detection, relationship/orphan verification, and password/auth migration remain pending. `auth_users` is absent from the live database.
