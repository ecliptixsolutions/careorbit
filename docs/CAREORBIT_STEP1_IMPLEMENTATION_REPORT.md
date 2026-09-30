# CareOrbit — Step 1 Implementation Report
## Security & Role Authorization Hardening

**Date:** 2026-09-28
**Verification:** 55 / 55 PASS — 0 FAIL
**Build:** ✔ built in 8.76s — zero TypeScript errors
**Supabase modified:** NO
**15-record migration:** NOT EXECUTED
**Database schema modified:** NO
**QA accounts modified:** NO (all 9 exist with correct roles; test data cleaned up)

---

## 1. Files Changed

| File | Type of change |
|---|---|
| `hostinger-api/src/server.js` | All security hardening (auth middleware, helper functions, data API, approve-user, connection pool) |
| `src/lib/access-control.ts` | Added `publicSignupRoleOptions` export; renamed/documented `signupRoleOptions` |

---

## 2. Authorization Changes

### Summary of what changed

Before Step 1, the `/api/data/:table` endpoint applied a single blanket rule: admin-flagged tables required `role='admin'`, all other tables were open to any authenticated user regardless of role. This meant:

- A billing operator could read prescriptions
- A lab technician could insert pharmacy items
- A doctor could modify organization settings
- Any admin could insert directly into `user_roles` to bypass the Super Admin count limit
- Nurses were incorrectly blocked from appointment imports due to a role-name bug

After Step 1, every table has explicit per-action authorization enforced server-side.

---

## 3. Sensitive API Protection

### Full per-table authorization matrix (implemented in `/api/data/:table`)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `patients` | Any auth | Staff, Doctor, Nurse, Admin | Admin only | Admin only |
| `appointments` | Any auth | Staff, Doctor, Nurse, Admin | Staff, Doctor, Nurse, Admin | Admin only |
| `notifications` | Any auth (own rows via filter) | Any auth | Any auth (own rows) | Any auth (own rows) |
| `notification_read_states` | Any auth | Any auth | Any auth | Any auth |
| `prescriptions` | Doctor, Nurse, Pharmacist, Admin | Doctor, Admin | Admin only | Admin only |
| `lab_orders` | Doctor, Lab Tech, Admin | Doctor, Admin | Lab Tech, Admin | Admin only |
| `pharmacy_items` | Pharmacist, Admin | Pharmacist, Admin | Pharmacist, Admin | Pharmacist, Admin |
| `dispensations` | Pharmacist, Admin | Pharmacist, Admin | Pharmacist, Admin | Pharmacist, Admin |
| `pharmacy_invoice_items` | Pharmacist, Admin | Pharmacist, Admin | Pharmacist, Admin | Pharmacist, Admin |
| `invoices` | Billing Op, Staff, Doctor, Nurse, Admin | Billing Op, Staff, Admin | Billing Op, Staff, Admin | Billing Op, Staff, Admin |
| `payments` | Billing Op, Staff, Admin | Billing Op, Staff, Admin | Billing Op, Staff, Admin | Billing Op, Staff, Admin |
| `organization_settings` | Any auth | Admin only | Admin only | Admin only |
| `service_catalog` | Any auth | Billing Op, Staff, Admin | Billing Op, Staff, Admin | Billing Op, Staff, Admin |
| `import_batches` | Any auth | Any auth | Admin only | Admin only |
| `audit_logs` | Admin only | Blocked (server-internal) | Admin only | Admin only |
| `user_roles` | Any auth (needed for role resolution) | **BLOCKED — use /api/admin/approve-user** | **BLOCKED** | **BLOCKED** |
| `profiles` | Any auth (needed for role resolution) | **BLOCKED — use dedicated endpoints** | **BLOCKED** | **BLOCKED** |
| `user_sessions` | Own rows only (filter enforced) | Any auth | Own rows only | Admin only |
| `custom_role_templates` | Admin only | Admin only | Admin only | Admin only |
| `role_session_policies` | Admin only | Admin only | Admin only | Admin only |

### Key protections added

**`user_roles` writes blocked at the data API:** Any `insert`, `update`, `delete`, or `upsert` action on `user_roles` via `POST /api/data/user_roles` now returns HTTP 403 for all users including admins. Role changes must go through `POST /api/admin/approve-user` which enforces the Super Admin count limit and writes an audit log.

```
"Role and profile changes must use the dedicated administration endpoints"
```

**`profiles` writes blocked:** Direct writes to `profiles` via the data API are blocked. Profile mutations go through dedicated server-managed paths.

**`user_sessions` own-row enforcement:** Non-admin users can only access `user_sessions` rows where a `user_id` filter matching their own ID is present in the request. Any attempt to read or modify all sessions without this filter returns HTTP 403.

---

## 4. Role Hierarchy

### What was implemented

A numeric tier system enforces that a principal can only assign roles **strictly below their own tier**. The exception is that a Super Admin (tier 4) can bootstrap another Super Admin IF count = 0.

```
super_admin    tier 4  — can assign: hospital_admin, admin, and all clinical/ops roles
hospital_admin tier 3  — can assign: admin, and all clinical/ops roles
admin          tier 2  — can assign: doctor, staff, nurse, pharmacist, lab_tech, billing_op
```

**Server-side enforcement in `POST /api/admin/approve-user`:**

```
assigningTier = resolveRoleKey(actor) → ROLE_TIER[key]
assignedTier  = ROLE_TIER[targetRoleKey]

if assignedTier >= assigningTier AND not self AND not super_admin boot:
  → HTTP 403 "You cannot assign <role> — your role level is insufficient"
```

**Verified:**
- Admin attempting to assign hospital_admin → **HTTP 403**
- Hospital Admin attempting to assign super_admin → **HTTP 403**
- Hospital Admin assigning nurse (lower tier) → **HTTP 200**
- Super Admin assigning super_admin to a second user (count > 0) → **HTTP 409**

### Role resolution

A new `resolveRoleKey(req)` helper was added. It reads `req.user.effective_custom_label` (which is derived from `MAX(user_roles.custom_label)` joined at auth time) and maps it to a friendly role key. This is used by:
- Tier hierarchy check in `approve-user`
- Permission checks in the data API (`hasLabRole`, `hasPharmRole`, `hasBillingRole`, etc.)
- All role helper functions (`isPharmacyRole`, `isBillingRole`, `isStaffOrAdmin`)

The `effective_custom_label` field solves a problem where `profiles.custom_role_label` can be stale after role changes — the value from `user_roles.custom_label` (via the auth JOIN) is always current.

---

## 5. Nurse Fix

### Root cause

`isStaffOrAdmin()` previously checked:

```javascript
req.user.roles.some((r) => ["staff", "doctor", "nurse"].includes(r))
```

Nurses are stored in the database as `role='custom'`, not `role='nurse'`. The `req.user.roles` array contains DB-level `role` enum values (`admin`, `doctor`, `staff`, `custom`). So `"nurse"` never appeared in the array — nurses were always blocked by `isStaffOrAdmin()`.

### Fix applied

```javascript
function isStaffOrAdmin(req) {
  if (isAdmin(req)) return true;
  const label = (req.user.effective_custom_label || req.user.custom_role_label || "").toLowerCase();
  return req.user.roles.some((r) => ["staff", "doctor"].includes(r)) || label === "nurse";
}
```

The same pattern was applied to `isBillingRole()` and `isPharmacyRole()` — all use `effective_custom_label` instead of relying on the DB `role` enum.

### Impact

Before fix: `POST /api/imports/appointments` returned **HTTP 403** for nurses.
After fix: **HTTP 422** (validation — correct auth passed, empty rows rejected).

---

## 6. Session Policy

### What was implemented

The `auth()` middleware now reads from the `role_session_policies` table and enforces per-role idle and absolute timeouts using **MySQL-side time comparison** to avoid clock skew between the Node.js process and the MySQL server (which were found to be 330 minutes apart due to a timezone configuration difference on the Hostinger server).

**Policies are cached** in memory for 5 minutes to avoid a DB hit on every request. If the table is inaccessible, the fallback is 8-hour idle / 24-hour absolute.

**The comparison uses MySQL's own clock:**

```sql
SELECT
  last_activity_at > DATE_SUB(NOW(6), INTERVAL ? MINUTE) AS idle_ok,
  created_at       > DATE_SUB(NOW(6), INTERVAL ? MINUTE) AS absolute_ok
FROM user_sessions WHERE id = ?
```

### Active policies (from the database)

| Role | Idle timeout | Absolute timeout |
|---|---|---|
| super_admin / hospital_admin | 15 min | 4 hours |
| admin | 15 min | 8 hours |
| doctor / nurse / pharmacist / lab_technician | 20 min | 12 hours |
| billing_operator / staff | 20 min | 8 hours |

### Key design decisions

- **Hardcoded 8-hour window removed.** All sessions now use their role's policy.
- **Auth middleware makes 2 DB queries** per request instead of 1: the session/profile query and the timeout check. This is a deliberate trade-off for correctness. A future optimisation could combine them into a single query.
- Existing sessions that were within the old 8-hour window but outside their role's policy will correctly expire on the next request.

---

## 7. Audit Logging

### What was implemented

`POST /api/admin/approve-user` now inserts a row into `audit_logs` immediately after every successful role change, within the same transaction commit.

**Schema used (existing `audit_logs` table):**

```sql
INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data)
VALUES (
  <actor_user_id>,
  'role_change',
  'user_roles',
  <target_user_id>,
  '{"role": "<old_role>", "custom_label": "<old_label>"}',  -- JSON
  '{"role": "<new_role>", "custom_label": "<new_label>"}'   -- JSON
)
```

**Design:**
- Audit log failure is non-fatal — a caught exception logs to stderr but does not abort the role change or roll back the transaction.
- Passwords, session tokens, and reset tokens are never included.
- The `old_data` and `new_data` fields contain only the role/label — no PII beyond what is already in the audit table.

**Verified:** After `POST /api/admin/approve-user`, the most recent `audit_logs` row has `action='role_change'`, a valid `actor_id`, a valid `entity_id`, `entity_type='user_roles'`, and a populated `new_data` JSON field.

---

## 8. Signup Security

Public signup security was **confirmed intact**. No changes were required.

- `POST /api/auth/signup` still explicitly rejects `super_admin`, `hospital_admin`, `admin` in the PRIVILEGED block list → **HTTP 403**
- The public signup page's `publicSignupRoleOptions` constant offers only: Staff, Doctor, Nurse, Pharmacist, Lab Technician, Billing Operator
- These protections are dual-layered (frontend TypeScript + server-side 403)

### signupRoleOptions cleanup (Task #8)

`src/lib/access-control.ts` previously exported a single `signupRoleOptions` array containing all 9 roles including admin tiers. It is now split into two exports:

```typescript
// For use on the public /signup page only — no privileged roles
export const publicSignupRoleOptions = [staff, doctor, nurse, pharmacist, lab_technician, billing_operator]

// For use by admin UI (access-control page, internal assignment) — all 9 roles
export const signupRoleOptions = [super_admin, hospital_admin, admin, staff, doctor, nurse, pharmacist, lab_technician, billing_operator]
```

The `signup.tsx` page already used its own local `publicSignupRoleOptions` constant and is unaffected. No component currently imports `signupRoleOptions` for a public form — the rename/split is preventive documentation.

---

## 9. Tests Performed

**55 / 55 PASS — 0 FAIL**

### A. Authentication — all 9 QA roles
All 9 QA accounts successfully logged in after the changes. No regressions.

### B. Table Authorization (20 checks)
| Check | Result |
|---|---|
| patients SELECT: staff | PASS 200 |
| patients SELECT: nurse | PASS 200 |
| patients INSERT: staff | PASS 201 |
| patients INSERT: billing_operator | PASS 403 |
| appointments SELECT: doctor | PASS 200 |
| prescriptions SELECT: doctor | PASS 200 |
| prescriptions SELECT: staff | PASS 403 |
| prescriptions SELECT: billing | PASS 403 |
| lab_orders SELECT: lab_tech | PASS 200 |
| lab_orders SELECT: staff | PASS 403 |
| pharmacy_items SELECT: pharmacist | PASS 200 |
| pharmacy_items SELECT: doctor | PASS 403 |
| invoices SELECT: billing | PASS 200 |
| invoices SELECT: doctor (emr-timeline) | PASS 200 |
| invoices SELECT: nurse (emr-timeline) | PASS 200 |
| invoices SELECT: lab_tech | PASS 403 |
| org_settings SELECT: nurse | PASS 200 |
| org_settings UPSERT: staff | PASS 403 |
| audit_logs SELECT: admin | PASS 200 |
| audit_logs SELECT: doctor | PASS 403 |

### C. Role Security (11 checks)
| Check | Result |
|---|---|
| user_roles INSERT via data API: doctor | PASS 403 |
| user_roles INSERT via data API: staff | PASS 403 |
| user_roles INSERT via data API: admin | PASS 403 |
| user_roles SELECT: doctor (role resolution) | PASS 200 |
| approve-user: admin assigns doctor | PASS 200 |
| approve-user: admin attempts hospital_admin | PASS 403 |
| approve-user: hospital_admin assigns nurse | PASS 200 |
| approve-user: hospital_admin attempts super_admin | PASS 403 |
| Super Admin count limit (second SA) | PASS 409 |
| Public signup: super_admin | PASS 403 |
| Public signup: admin | PASS 403 |

### D. Nurse Role Fix (4 checks)
| Check | Result |
|---|---|
| Nurse re-login after role reassignment | PASS 200 |
| Nurse imports/appointments: auth passes (422, not 403) | PASS 422 |
| Nurse appointments SELECT | PASS 200 |
| Nurse patients SELECT | PASS 200 |

### E. Session Policy (3 checks)
| Check | Result |
|---|---|
| DB accessible (policies loadable) | PASS 200 |
| Login still succeeds | PASS 200 |
| /api/auth/me on valid session | PASS 200 |

### F. Audit Logging (5 checks)
| Check | Result |
|---|---|
| role_change entry written after approve-user | PASS |
| Contains actor_id | PASS |
| Contains entity_id | PASS |
| entity_type = user_roles | PASS |
| new_data field present | PASS |

### G. user_sessions Own-Row Enforcement (3 checks)
| Check | Result |
|---|---|
| SELECT own rows: staff (with user_id filter) | PASS 200 |
| SELECT all rows: staff (no filter) | PASS 403 |
| SELECT all rows: super_admin | PASS 200 |

---

## 10. Build Result

```
✔ built in 8.76s
```

Zero TypeScript errors. All route assets compiled successfully including:
- `billing-CQyVwbRO.js`
- `pharmacy_.bill-GWvjwcdG.js`
- `imports-QBItOEzD.js`
- `access-control-DO4UyMa3.js`
- `appointments-WczrQFGY.js`
- All other authenticated routes

---

## 11. Remaining Issues

### Infrastructure: Hostinger MySQL timezone skew

The Hostinger MySQL server clock is approximately 330 minutes (5.5 hours) behind the local development machine. This affects **local development only** — the production deployment would run the API server on the same machine as the tunnel, so the clocks would be in sync.

**Mitigation applied:** Session timeout comparisons now use MySQL's own `NOW()` for both sides of the comparison, making auth completely immune to this skew.

**Remaining risk:** Any application code that compares `new Date()` from Node.js against a timestamp read from MySQL (e.g. in billing receipt numbers, audit log timestamps displayed in the UI) will show timestamps that appear 5.5 hours in the past. This is a Hostinger configuration issue, not an application bug, and has no security impact.

### Not yet addressed (separate steps)

| Item | Step |
|---|---|
| Role-based sidebar (show/hide nav items correctly) | Step 2 |
| Role-specific dashboards | Step 3 |
| Mobile/responsive UI | Step 4 |
| ~30-second refresh investigation | Step 5 |
| `admin` tier differentiation in the UI (Access Control shows all three admin roles but enforces no visual distinction) | Future |
| Multi-tenant data isolation (all users see all patients/appointments) | Future |
| Email verification flow | Future |

---

**SUPABASE MODIFIED: NO**
**15-RECORD MIGRATION: NOT EXECUTED**
**DATABASE SCHEMA MODIFIED: NO**
**QA ACCOUNTS MODIFIED: NO (all 9 preserved with correct roles)**
**STEP 1 STATUS: COMPLETE**
