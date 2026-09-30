# CareOrbit Phase 2 UUID comparison

Comparison performed on 2026-09-11 against the configured Supabase source and the Hostinger MySQL database `u791891216_careorbit`.

| Table | Source rows | Target rows before migration | Missing primary keys |
| --- | ---: | ---: | ---: |
| profiles | 4 | 0 | 4 |
| user_roles | 4 | 0 | 4 |
| audit_logs | 5 | 0 | 5 |
| user_sessions | 2 | 0 | 2 |

The 15 missing records are the entire source sets. `audit_logs.id` is a numeric primary key; all other listed primary keys are UUIDs.

## Relationship validation

All four `user_roles.user_id` values and both `user_sessions.user_id` values exist in the four source profile IDs. Every audit actor ID exists in that same profile set, and every audit `entity_id` is one of the two source session IDs. No patient, appointment, invoice, payment, lab, pharmacy, notification, or clinical record was selected for migration.

## Migration scope

The accompanying SQL file is transaction-wrapped and primary-key guarded. It inserts only the 15 rows identified above; it has no `UPDATE`, `DELETE`, DDL, authentication, or schema statements.
