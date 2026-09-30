# CareOrbit MariaDB Migration Notes

Companion to `database/careorbit_mysql_migration.sql` (rev 2).

- **Source schema:** Supabase PostgreSQL (`supabase/migrations/*.sql` + `supabase/setup_new_project.sql`)
- **Target:** Hostinger **MariaDB** (≥ 10.3), database `u791891216_careorbit`
- **Migration date:** 2026-08-19 (rev 1 failed, rev 2 is MariaDB-compatible)
- **Status:** Schema migrated. **No live data migrated.** Supabase Auth + Storage remain the source of truth until a data + storage migration is run.

### Why rev 2 (the `#1064` failure)

The first import (rev 1) was written for MySQL 8 and used MySQL 8 **functional indexes**
(`CREATE UNIQUE INDEX ... ON t ((LOWER(email)))`). Hostinger actually runs **MariaDB**, which
has no functional-index syntax, producing:

```
#1064 - You have an error in your SQL syntax ... near '((LOWER(email)))'
```

That aborted the import after `profiles` was created. Rev 2 removes all MySQL-8-only syntax:

- Functional unique indexes → **STORED generated columns + plain unique indexes**.
- `DEFAULT (UUID())` expression defaults → **BEFORE INSERT triggers** (MariaDB expression
  defaults are version-dependent and unreliable).
- `CREATE`/`DROP DATABASE` → removed (the target DB already exists).

A partial import may already exist in the database. Run
`database/cleanup_partial_careorbit_migration.sql` first (see §7), verify the database is empty,
then import `database/careorbit_mysql_migration.sql`.

---

## 1. What Was Created

| # | Table                  | Origin migration(s)                                                        |
|---|------------------------|---------------------------------------------------------------------------|
| 1 | `profiles`              | base, 04150000 (email), 08190000 (status)                                  |
| 2 | `user_roles`            | base, 03120000 (workflow roles policy)                                     |
| 3 | `patients`              | base, 06120000 (case_fee, sonography_fee)                                  |
| 4 | `appointments`          | base                                                                            |
| 5 | `notifications`         | 02090000                                                                        |
| 6 | `prescriptions`         | 03120000                                                                        |
| 7 | `invoices`              | 03120000, 04150000 (finalization cols), 06120000 (pharmacy/walk-in cols)         |
| 8 | `payments`              | 03120000, 04150000 (receipt_number NOT NULL UNIQUE)                              |
| 9 | `lab_orders`            | 03120000                                                                        |
| 10 | `pharmacy_items`       | 03120000, 04150000 (sku unique → functional unique), 06120000 (mrp/gst/hsn)     |
| 11 | `dispensations`        | 03120000, 06120000 (patient_id nullable, invoice_id)                             |
| 12 | `audit_logs`           | 03120000                                                                        |
| 13 | `pharmacy_invoice_items` | 06120000                                                                     |
| 14 | `organization_settings` | 04150000, 06120000 (drug_license_numbers, invoice_accent_color)                 |
| 15 | `service_catalog`      | 04150000                                                                        |
| 16 | `import_batches`       | 04150000                                                                        |
| 17 | `role_session_policies`| 08190000                                                                        |
| 18 | `user_sessions`        | 08190000                                                                        |
| 19 | `notification_read_states` | 08190000                                                                   |
| 20 | `custom_role_templates`| 08190000                                                                        |

Counts:
- **20** tables
- **14** secondary indexes (incl. the 3 unique functional-lower indexes) + PKs/UNIQUEs inline in DDL
- **27** triggers = 13 UUID-generation + 5 auto-numbering/receipt + 9 `updated_at`
- **4** STORED generated columns (only where origin had functional/lower unique indexes)
- **1** seed config row (`organization_settings` singleton) + **11** rows in `role_session_policies`

---

## 2. Type Conversion Map

| PostgreSQL | MySQL                     | Notes |
|------------|---------------------------|-------|
| `uuid`     | `CHAR(36)`                | Columns that referenced Supabase `auth.users` keep this type but have **no FK** (auth not migrated). |
| `bigint generated always as identity` | `BIGINT AUTO_INCREMENT` | `audit_logs.id`. |
| `timestamptz` | `DATETIME(6)`          | Store **UTC**; convert to local time in the app/display layer. Defaults use `CURRENT_TIMESTAMP(6)`. |
| `numeric(p,s)` | `DECIMAL(p,s)`        | Exact match for all currency/fee columns. |
| `jsonb`    | `JSON`                    | MySQL forbids `DEFAULT` on JSON columns, so `NOT NULL DEFAULT '{}'/'[]'` became **nullable**. The backend must always supply a value (`{}`/`[]`) when inserting. |
| `text`     | `VARCHAR(n)` / `TEXT`     | Indexed/unique text narrowed to sensible `VARCHAR` lengths for UTF-8 key limits. |
| `text[]`   | `JSON`                    | `organization_settings.drug_license_numbers`. |
| `inet`     | `VARCHAR(45)`             | `user_sessions.ip_address`. |
| `boolean`  | `TINYINT(1)`              | `service_catalog.is_active`. |
| Enums      | MariaDB `ENUM(...)`       | `app_role`, `appointment_status`, invoice/payment/lab/import status literal lists. |
| `gen_random_uuid()` default | `BEFORE INSERT` trigger | All `id` PKs that had a client-free UUID default get a `trg_*_uuid` BEFORE INSERT trigger that sets `id = UUID()` only when `id` is NULL/empty. MariaDB expression defaults (`DEFAULT (UUID())`) are version-dependent, so triggers are used for portability. `user_sessions.id` and composite-PK tables have no default, matching origin. Business keys (mrn, invoice/prescription/lab/order/receipt numbers) are generated by triggers. |
| expression unique index `((LOWER(...)))` | STORED generated column + plain `UNIQUE INDEX` | MariaDB has **no** functional indexes. Origin partial/functional unique indexes are reproduced with generated columns + ordinary unique indexes (see §6 caveats 3–4). |

---

## 3. Not Migrated (Downstream Responsibilities)

### 3.1 Supabase Auth (`auth.users`, `auth.uid()`)
- Auth stays in Supabase. These app columns previously FKeyed `auth.users` and now have **no FK** — the backend must resolve/validate user ids and enforce user lifecycle (deletes, invitations):
  - `profiles.id`, `user_roles.user_id`, `patients.created_by`, `appointments.doctor_id`, `appointments.created_by`, `notifications.recipient_id`, `notifications.actor_id`, `prescriptions.doctor_id`, `prescriptions.created_by`, `invoices.created_by`, `invoices.updated_by`, `payments.received_by`, `lab_orders.ordered_by`, `lab_orders.completed_by`, `pharmacy_items.created_by`, `dispensations.dispensed_by`, `audit_logs.actor_id`, `organization_settings.updated_by`, `service_catalog.created_by`, `import_batches.created_by`, `user_sessions.user_id`, `notification_read_states.user_id`, `custom_role_templates.user_id`.
- `auth.users.encrypted_password` trigger `revoke_sessions_on_password_change` cannot be ported; revoke sessions in app code on password change.

### 3.2 Storage
- Bucket `hospital-assets` (public, PNG/JPEG/WEBP, ≤2 MB) NOT created. `profiles.avatar_url` and `organization_settings.logo_path` still store **Supabase object paths/URLs** — leave as-is until files are copied (e.g., to Hostinger local storage or a CDN) and URLs rewritten.

### 3.3 RLS Policies (inventory — enforce in backend)
MySQL has no row-level security. Port each policy below into backend middleware/queries. Helper equivalents of `has_role(uid,'admin')` / `has_custom_role(uid,'pharmacist')`: query `user_roles` (role = chosen, or role='custom' AND lower(custom_label)=chosen).

| Table | Policy | Operation | Allow when |
|-------|--------|-----------|------------|
| profiles | Profiles viewable by authenticated users | SELECT | any authenticated user |
| profiles | Users update own profile | UPDATE | `id = auth.user` |
| profiles | Users insert own profile | INSERT | `id = auth.user` |
| user_roles | Users can view their own roles | SELECT | `user_id = auth.user` |
| user_roles | Admins can view all roles | SELECT | `role = admin` |
| user_roles | Authenticated can view doctor roles | SELECT | `role = 'doctor'` |
| user_roles | Authenticated can view workflow roles | SELECT | `role='custom'` AND lower(custom_label) ∈ {pharmacist, lab_technician, billing_operator} |
| user_roles | Admins manage roles | ALL | `role = admin` |
| patients | Authenticated can insert patients | INSERT | `created_by = auth.user` |
| patients | Clinical users view patients | SELECT | role ∈ admin/doctor/staff or custom ∈ nurse/pharmacist/lab_technician/billing_operator |
| patients | Clinical users update patients | UPDATE | role ∈ admin/doctor/staff or custom = nurse |
| patients | Admins can delete patients | DELETE | `role = admin` |
| appointments | Clinical users view appointments | SELECT | role ∈ admin/doctor/staff or custom ∈ nurse/lab_technician/billing_operator |
| appointments | Authenticated can insert appointments | INSERT | `created_by = auth.user` |
| appointments | Clinical users update appointments | UPDATE | role ∈ admin/doctor/staff or custom = nurse |
| appointments | Admins can delete appointments | DELETE | `role = admin` |
| notifications | Users can view own notifications | SELECT | `recipient_id = auth.user` or admin |
| notifications | Users can mark own notifications read | UPDATE | `recipient_id = auth.user` |
| notifications | Authenticated can create notifications | INSERT | `actor_id = auth.user` or admin |
| prescriptions | Clinical users view prescriptions | SELECT | admin/doctor or custom ∈ pharmacist/nurse |
| prescriptions | Doctors manage prescriptions | ALL | admin or `doctor_id = auth.user` (insert also `created_by = auth.user`) |
| invoices | Billing users view invoices | SELECT | admin/staff or custom = billing_operator |
| invoices | Billing users manage invoices | ALL | admin/staff or custom = billing_operator |
| invoices | Pharmacy users view pharmacy invoices | SELECT | `invoice_type='pharmacy'` AND (admin or custom = pharmacist) |
| payments | Billing users manage payments | ALL | admin/staff or custom = billing_operator |
| payments | Pharmacy users view pharmacy payments | SELECT | invoice is pharmacy AND (admin or custom = pharmacist) |
| lab_orders | Clinical users view lab orders | SELECT | admin/doctor or custom ∈ nurse/lab_technician |
| lab_orders | Clinical users create lab orders | INSERT | admin or (doctor AND `ordered_by = auth.user`) |
| lab_orders | Lab users update lab orders | UPDATE | admin or custom = lab_technician |
| pharmacy_items | Pharmacy users view stock | SELECT | admin or custom ∈ pharmacist/billing_operator |
| pharmacy_items | Pharmacy users manage stock | ALL | admin or custom = pharmacist |
| dispensations | Clinical users view dispensations | SELECT | admin/doctor or custom = pharmacist |
| dispensations | Pharmacy users create dispensations | INSERT | admin or (custom = pharmacist AND `dispensed_by = auth.user`) |
| audit_logs | Admins view audit logs | SELECT | `role = admin` |
| organization_settings | Authenticated view organization settings | SELECT | any authenticated user |
| organization_settings | Admins manage organization settings | ALL | admin (UPDATE also `updated_by = auth.user`) |
| service_catalog | Billing users view service catalog | SELECT | admin/staff or custom = billing_operator |
| service_catalog | Billing users manage service catalog | ALL | admin or custom = billing_operator |
| import_batches | Users view own imports | SELECT | `created_by = auth.user` or admin |
| import_batches | Users create own imports | INSERT | `created_by = auth.user` |
| pharmacy_invoice_items | Pharmacy users view invoice items | SELECT | admin or custom ∈ pharmacist/billing_operator |
| user_sessions | Users view own sessions | SELECT | `user_id = auth.user` |
| user_sessions | Admins view user sessions | SELECT | admin |
| user_sessions | Users create own sessions | INSERT | `user_id = auth.user` |
| user_sessions | Users revoke own sessions | UPDATE | `user_id = auth.user` or admin |
| notification_read_states | Users manage own read states | ALL | `user_id = auth.user` |
| custom_role_templates | Users manage own templates | ALL | `user_id = auth.user` |

### 3.4 SECURITY DEFINER Functions / RPCs (port to backend transactions)
The app calls these via `.rpc(...)` — re-implement as backend endpoints/stored procedures. They enforce auth + business rules that MySQL CHECKs cannot:

| Function | Behavior to preserve |
|----------|----------------------|
| `has_role(uid, app_role)` | role membership check (used by RLS + invite-staff only; app reads `user_roles` directly). |
| `has_custom_role(uid, label)` | custom-role membership check. |
| `handle_new_user()` | signup trigger: create `profiles` row + default `user_roles` row from signup metadata; later versions also set `status='pending_approval'` and `pending:<label>` custom role. Implement in the invite/signup service (Supabase still owns signup — keep this on the auth trigger side). |
| `create_pharmacy_bill(...)` | Validates pharmacy access, patient/walk-in requirement, item count, expiry, stock; computes GST split (cgst=sgst), totals, writes `invoices`+`pharmacy_invoice_items`+`dispensations`, decrements stock, records payment, generates receipt, handles drafts. |
| `record_invoice_payment(...)` | Validates amount ≤ balance, method; inserts payment, updates `paid_amount`+`status`, generates receipt. |
| `finalize_invoice(uid)` | Draft → issued, sets `finalized_at`. |
| `cancel_invoice(uid, reason)` | Issued/unpaid only, sets `cancelled_at`, requires reason ≥ 3 chars, admin/billing_operator. |
| `guard_invoice_changes()` trigger | Only drafts may be deleted; finalized financial fields may not change; paid_amount must equal sum of payments; status transition matrix; cancellation rules. **Recommend porting as MySQL triggers/check logic + backend validation.** |
| `dispense_medicine(...)` | Stock check + decrement + dispensation insert, pharmacy access. |
| `import_patients/import_pharmacy/import_services/import_appointments` | Bulk validation, dedupe, writes `import_batches` summary. |
| `approve_user_role(uid, role, label)` | Only one super_admin; clears+reinserts role; sets `profiles.status='active'`. |
| `revoke_sessions_on_role_change()` trigger | Revoke active sessions when role changes. |

### 3.5 Audit logging
`capture_audit_log()` trigger wrote `old_data`/`new_data` with `auth.uid()`. Not ported (no auth context in MySQL). Implement server-side auditing (e.g., BEFORE/AFTER triggers writing `audit_logs` with a backend-supplied actor, or app-layer audit).

### 3.6 Realtime
`notifications` was added to `supabase_realtime` publication. MySQL Hostinger has no realtime; use polling or a broker if realtime notifications are required.

---

## 4. Data Migration

**Not performed** — the real Supabase DB was not touched (out of scope). When authorized, the backend should:
1. Export each table from Supabase (JSON/CSV) preserving UUIDs and UTC timestamps.
2. Insert into the MySQL equivalents, supplying values for all **nullable JSON** columns (they have no server default).
3. Keep `id` values identical so foreign keys and `auth.users` ids remain valid.
4. Rewrite `avatar_url` / `logo_path` after moving Supabase Storage files.

---

## 5. Post-Import Verification (phpMyAdmin)

Run in phpMyAdmin → SQL on `u791891216_careorbit`:

```sql
SELECT COUNT(*) AS tables_ok FROM information_schema.tables
WHERE table_schema = DATABASE();
-- expect 20

SELECT COUNT(*) AS config_seeds FROM organization_settings;   -- expect 1
SELECT COUNT(*) AS session_policies FROM role_session_policies; -- expect 11

SHOW TRIGGERS;                     -- expect 27 triggers
SHOW INDEX FROM profiles;          -- expect unique index on email_lower (generated col)
SHOW INDEX FROM pharmacy_items;    -- expect unique index on (sku_lower, batch_lower) (generated cols)
SHOW INDEX FROM service_catalog;   -- expect unique index on service_code_lower (generated col)
```

Smoke test the auto-numbering + UUID triggers (roll back immediately):

```sql
START TRANSACTION;
INSERT INTO patients (id, full_name) VALUES (UUID(), 'Smoke Test');
SELECT id, mrn FROM patients WHERE full_name = 'Smoke Test';
ROLLBACK;
```

Expected `id` = a UUID (dashed format, hex case varies by MariaDB version), `mrn` = `MRN-XXXXXXXX`.
The origin stored lowercase undashed ids. IDs are opaque to the backend (compared as strings),
so case/dashes are safe to leave as-is; if strict parity is needed, change the triggers to
`SET NEW.id = LOWER(REPLACE(UUID(), '-', ''))` before migrating data.

---

## 6. Caveats & Decisions

1. **JSON defaults:** MariaDB (like MySQL) cannot assign `DEFAULT` to JSON — affected columns are nullable and **must be written by the backend** (`items`, `brand_snapshot`, `medicines`, `metadata`, `summary`, `old_data`, `new_data`, `drug_license_numbers`).
2. **UUID defaults preserved via triggers:** every `id` PK that had a `gen_random_uuid()` default gets a BEFORE INSERT trigger (`trg_*_uuid`) that sets `id = UUID()` only when `id` is NULL/empty. This avoids MariaDB's unreliable expression-default support. Only `user_sessions.id` and the composite-PK tables (`notification_read_states`, `custom_role_templates`) have no default, matching the origin. Business keys (mrn / invoice / prescription / lab-order / receipt numbers) are generated automatically by triggers.
3. **`profiles.email`** unique index is implemented as `email_lower` (STORED generated column `LOWER(email)`) + a plain unique index — equivalent to the origin's partial unique index `lower(email) WHERE email IS NOT NULL`. A NULL `email` yields a NULL generated column, and MariaDB unique indexes treat NULL as distinct, so multiple empty emails stay allowed while real emails are case-insensitively unique.
4. **`pharmacy_items.sku`** no longer unique by itself (origin dropped `pharmacy_items_sku_key`); uniqueness is on `(sku_lower, batch_lower)` = `(LOWER(sku), LOWER(COALESCE(batch_number,'')))` via generated columns. NULL `sku` → NULL `sku_lower` → row exempt from uniqueness, matching origin's `WHERE sku IS NOT NULL` predicate. `batch_lower` uses `COALESCE(batch_number,'')` so NULL/empty batches don't break the unique pairing — same as the origin functional index.
4a. **`service_catalog.service_code`** unique is `service_code_lower` (generated `LOWER(service_code)`) + unique index; the origin column was NOT NULL, so the plain unique index fully reproduces the partial unique index.
5. **`user_sessions.id`** has no auto default in the origin — same here (app supplies it).
6. **`revoked_reason`** ENUM→CHECK (nullable) to allow `NULL`.
7. **Timezone:** all `DATETIME(6)` values are UTC. The import sets session `time_zone='+00:00'`; the app must convert to local time for display.
8. **Functions not silently translated:** anything using `auth.uid()`, `security definer`, `raise exception`, or `jsonb` traversal was deliberately left to the backend (see §3.4).
9. `custom_role_templates.``key``` is a MariaDB reserved word — always backtick-quote it in queries.
10. **Generated columns:** the 4 STORED generated columns are added ONLY where the origin had a functional/lower unique index. MariaDB generated columns cannot be used with `ON DUPLICATE KEY UPDATE` targets — the migration never does so. If the backend writes `profiles.email`, `pharmacy_items.sku`, `pharmacy_items.batch_number`, or `service_catalog.service_code` it only supplies the base column; the generated columns are maintained by the server.
11. **`DESC` in indexes:** MariaDB < 10.8 parses `DESC` but physically stores indexes ascending (functionally equivalent for equality/range lookups); MariaDB ≥ 10.8 stores true descending indexes. The `DESC` qualifiers are kept for the origin query patterns.

---

## 7. Recovering from the Failed Import (Cleanup + Re-import)

The rev-1 import aborted on the second statement (`CREATE UNIQUE INDEX idx_profiles_email_lower ON profiles ((LOWER(email)))`, #1064). Depending on where it stopped, the database may contain `profiles` and other objects ahead of that point. `database/cleanup_partial_careorbit_migration.sql` removes **only** objects the migration script creates:

- all **27** triggers (explicit `DROP TRIGGER IF EXISTS`, incl. the 13 UUID / 5 auto-numbering / 9 `updated_at`),
- all **20** tables in dependency order (children first) with `SET FOREIGN_KEY_CHECKS` toggled off/on around the drops.

It contains **no** `DROP DATABASE` / `CREATE DATABASE`, no `TRUNCATE`, no drops of anything outside the migration's own object list, and every statement is guarded with `IF EXISTS` (idempotent, safe to re-run).

### Correct import order (Hostinger phpMyAdmin)

1. First import `database/cleanup_partial_careorbit_migration.sql` into the partially populated database `u791891216_careorbit`.
2. Verify the database is empty:
   ```sql
   SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE(); -- expect 0
   SHOW TRIGGERS;                                                                  -- expect empty
   ```
3. Then import `database/careorbit_mysql_migration.sql` (rev 2).
4. Run the §5 verification queries (expect 20 tables, 27 triggers, 1 + 11 config seeds).