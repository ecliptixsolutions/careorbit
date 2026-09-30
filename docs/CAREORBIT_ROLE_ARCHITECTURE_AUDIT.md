# CareOrbit Role Architecture Audit

**Date:** 2026-09-24
**Type:** Read-only investigation
**Code modified:** NO
**Database modified:** NO

---

## 1. Current Roles

| Role | Exists | DB `role` | `custom_label` | How Created | Main Access |
|---|---|---|---|---|---|
| Super Admin | ✅ | `admin` | `super_admin` | Bootstrap only (script/direct DB) | All 31 permissions |
| Hospital Admin | ✅ | `admin` | `hospital_admin` | Admin assigns via access-control UI | All 31 permissions |
| Admin | ✅ | `admin` | `null` | Admin assigns via access-control UI | All 31 permissions |
| Doctor | ✅ | `doctor` | `null` | Public signup (immediate) | Clinical access (14 permissions) |
| Staff | ✅ | `staff` | `null` | Public signup (immediate) | Operations access (13 permissions) |
| Nurse | ✅ | `custom` | `nurse` | Public signup → pending approval | Nursing + IPD (13 permissions) |
| Pharmacist | ✅ | `custom` | `pharmacist` | Public signup → pending approval | Pharmacy (8 permissions) |
| Lab Technician | ✅ | `custom` | `lab_technician` | Public signup → pending approval | Lab (6 permissions) |
| Billing Operator | ✅ | `custom` | `billing_operator` | Public signup → pending approval | Billing (6 permissions) |

**Note on "Billing":** The task lists "Billing" as a role name. In the application the formal role name is **Billing Operator** (`billing_operator`). These are the same role.

---

## 2. Public Signup

**File:** `src/routes/signup.tsx`

### What appears in the dropdown

The constant `publicSignupRoleOptions` presents exactly **6 options** with a TypeScript type that explicitly excludes `super_admin`, `hospital_admin`, `admin`, `pending`, and `custom`:

```
Staff | Doctor | Nurse | Pharmacist | Lab Technician | Billing Operator
```

Super Admin, Hospital Admin, and Admin are **not visible** on the public signup page.

### Form fields

- **Step 1:** Full name (required), Organization (optional), Role dropdown (defaults to `"staff"`), Phone/WhatsApp (optional)
- **Step 2:** Email (required), Password (required, min 10 chars, must contain upper+lower+digit+special)

### What gets sent to the API

```json
POST /api/auth/signup
{
  "email": "<lowercase>",
  "password": "<plaintext>",
  "full_name": "...",
  "organization": "...",
  "phone": "...",
  "role": "<selected_role_key>"
}
```

### Backend role assignment (server.js)

The server never trusts the submitted role blindly. The logic:

1. **Hard block** — if `role` is any of `["super_admin","hospital_admin","admin","super admin","hospital admin"]` → **403 Privileged role assignment not allowed on public signup**
2. **Body field block** — if `req.body.isAdmin`, `req.body.isSuperAdmin`, or `req.body.permissions` are present → **403**
3. **Safe-list** — accepted values: `["staff","doctor","nurse","pharmacist","lab_technician","billing_operator"]`. Anything else silently defaults to `"staff"`.

### Role mapping after safe-list

| Submitted role | DB `role` | `custom_label` | `profiles.status` | Login immediately? |
|---|---|---|---|---|
| `staff` | `staff` | null | `active` | Yes |
| `doctor` | `doctor` | null | `active` | Yes |
| `nurse` | `custom` | `pending:nurse` | `pending_approval` | Blocked — pending |
| `pharmacist` | `custom` | `pending:pharmacist` | `pending_approval` | Blocked — pending |
| `lab_technician` | `custom` | `pending:lab_technician` | `pending_approval` | Blocked — pending |
| `billing_operator` | `custom` | `pending:billing_operator` | `pending_approval` | Blocked — pending |
| *(anything else)* | `staff` | null | `active` | Yes |

### Pending approval UX

When the API returns `{ pending_approval: true }`, the signup page renders an in-place "Waiting for admin approval" message. The user is shown their requested role label and a link to the login page. They are not redirected automatically.

When a pending user attempts login:
- The login endpoint checks `profiles.status`. If `status !== 'active'` it returns **403 Account pending approval**.
- Even if someone tried to bypass the frontend, they cannot log in until an admin approves.

### Can Super Admin / Admin / Hospital Admin be created through public signup?

**No.** Both the frontend UI (TypeScript exclusion) and the server (explicit HTTP 403) prevent it. A direct API call with `role=super_admin` returns `403 Privileged role assignment not allowed on public signup`.

---

## 3. Super Admin Creation

### Exact current mechanism

Super Admin is **not self-serviceable**. There are three paths:

**Path A — `scripts/provision-qa-accounts.js` (primary bootstrap method)**

Running this script directly against the MySQL database with `MYSQL_*` env vars creates the QA Super Admin:
```
qa.superadmin@careorbit.test → role='admin', custom_label='super_admin'
```
The script is protected by a hardcoded allowlist of exactly 9 emails. It cannot be used to create arbitrary super admins.

**Path B — `POST /api/auth/qa-provision` (token-gated HTTP endpoint)**

Requires `x-qa-provision-token: <QA_PROVISION_TOKEN>` header. Same hardcoded allowlist. Creates the same 9 QA accounts. Not accessible without the token.

**Path C — `POST /api/admin/approve-user` (requires existing admin)**

An existing user with DB `role='admin'` can promote another user to Super Admin:
```json
{ "user_id": "<target>", "role": "admin", "custom_label": "super_admin" }
```
The server enforces: **maximum 1 Super Admin**. If one already exists, returns 409.

**Path D — Direct database INSERT (emergency only)**

A user with Hostinger database access can directly insert a `user_roles` row with `role='admin', custom_label='super_admin'`. This bypasses all application-level constraints including the 1-super-admin limit.

### Is there already a Super Admin?

Yes. `qa.superadmin@careorbit.test` exists in the live MySQL database with `role='admin', custom_label='super_admin'`. It was created via `scripts/provision-qa-accounts.js` or `POST /api/auth/qa-provision`.

### Can another Super Admin be created?

Via `POST /api/admin/approve-user`: **No** — the server enforces a count limit of 1.
Via `POST /api/data/user_roles` (direct data API, admin only): **Yes** — this path bypasses the count limit check. (See Section 8.)

### Who is allowed to create another Super Admin?

Any user with DB `role='admin'` can call `POST /api/admin/approve-user`. This includes plain Admin and Hospital Admin in addition to Super Admin (all three share `role='admin'` in the DB). The application does not differentiate between the three tiers at the backend permission level.

---

## 4. Admin / Hospital Admin Creation

### Every current path

**Via `POST /api/admin/approve-user`**

Any user with DB `role='admin'` (any of the three admin tiers) can assign any role including `admin` or `admin+hospital_admin` to any existing user.

Authorization check:
```javascript
if (!isAdmin(req)) throw fail(403, "Administrator role required");
// isAdmin = req.user.roles.includes("admin")
```

The endpoint:
1. Validates the target user exists in `profiles`
2. Deletes ALL existing `user_roles` rows for the target
3. Inserts a new single row
4. Sets `profiles.status = 'active'`
5. Revokes all active sessions for the target user

**Via Access Control UI (`/_authenticated/access-control`)**

Gated by `canManageUsers` permission (Super Admin, Hospital Admin, Admin only). Shows every user as a card with all 9 assignable role buttons. Clicking a button calls `POST /api/admin/approve-user` via `fetch`.

**Via `POST /api/auth/qa-provision`**

Creates `qa.hospitaladmin@careorbit.test` and `qa.admin@careorbit.test` if they do not exist. Token-gated.

**Via `POST /api/admin/invite-staff`**

Creates accounts for `staff`, `doctor`, `nurse`, `pharmacist`, `lab_technician`, `billing_operator` only. `super_admin`, `hospital_admin`, and `admin` are not in the `SAFE_ROLES` map — any attempt returns 422. Cannot be used to create admins.

### Who can approve / assign roles?

Any user whose `user_roles` table has a row with `role='admin'` (DB-level). This includes all three admin tiers since all share the same DB `role` value. There is no further tier differentiation on the server.

### Is role assignment enforced server-side?

Yes. `POST /api/admin/approve-user` checks `isAdmin(req)` before proceeding. Non-admin requests receive HTTP 403.

---

## 5. User Approval Flow

```
User signs up for nurse / pharmacist / lab_technician / billing_operator
          ↓
POST /api/auth/signup
  → user_roles: role='custom', custom_label='pending:<role>'
  → profiles.status = 'pending_approval'
  → Response: { pending_approval: true }
          ↓
Frontend shows "Waiting for admin approval" screen
          ↓
User tries to log in → POST /api/auth/login
  → profiles.status check: if status !== 'active' → 403 "Account pending approval"
  → User cannot log in
          ↓
Admin/Hospital Admin/Super Admin logs in
  → Navigates to /_authenticated/access-control
  → Sees user card with badge "Pending Nurse" (resolved from pending:nurse label)
  → Clicks role button → POST /api/admin/approve-user
  → Server: DELETE old user_roles, INSERT new role, SET profiles.status='active', REVOKE sessions
          ↓
User can now log in with approved role
```

### Role assignment capability by actor

| Actor | Can approve/assign? | Can assign Super Admin? | Can assign Hospital Admin? |
|---|---|---|---|
| Super Admin (DB: `admin`) | ✅ Yes | ✅ Yes (if count=0) | ✅ Yes |
| Hospital Admin (DB: `admin`) | ✅ Yes | ✅ Yes (if count=0) | ✅ Yes |
| Admin (DB: `admin`) | ✅ Yes | ✅ Yes (if count=0) | ✅ Yes |
| Doctor / Staff / Nurse / etc. | ❌ No — 403 | ❌ | ❌ |

**Important:** All three admin tiers have identical capabilities at the server level — the three tiers are semantic labels only.

---

## 6. Backend Authorization

### auth() middleware

Every protected endpoint uses the `auth()` middleware which:
- Reads the `careorbit_session` HttpOnly cookie
- Validates it against `user_sessions` (must not be revoked, `last_activity_at` within 8 hours)
- Checks `profiles.status` is not `'disabled'`
- Attaches `req.user.roles` (array of DB `role` column values from all `user_roles` rows)
- Updates `last_activity_at` on every request

### All endpoints with role checks beyond auth()

| Endpoint | Check | Roles allowed |
|---|---|---|
| `POST /api/admin/approve-user` | `isAdmin()` | Super Admin, Hospital Admin, Admin |
| `POST /api/admin/invite-staff` | `isAdmin()` | Super Admin, Hospital Admin, Admin |
| `POST /api/uploads/logo` | `isAdmin()` | Super Admin, Hospital Admin, Admin |
| `DELETE /api/uploads/logo` | `isAdmin()` | Super Admin, Hospital Admin, Admin |
| `POST /api/billing/finalize` | `isBillingRole()` | Admin + Staff + Billing Operator |
| `POST /api/billing/cancel` | `isBillingRole()` | Admin + Staff + Billing Operator |
| `POST /api/billing/payment` | `isBillingRole()` | Admin + Staff + Billing Operator |
| `POST /api/pharmacy/dispense` | `isPharmacyRole()` | Admin + Pharmacist |
| `POST /api/pharmacy/bill` | `isPharmacyRole()` | Admin + Pharmacist |
| `POST /api/imports/patients` | `importAuth()` | Admin + Staff + Doctor + Nurse + Pharmacist + Billing Operator |
| `POST /api/imports/pharmacy` | `isPharmacyRole()` | Admin + Pharmacist |
| `POST /api/imports/services` | `isBillingRole()` | Admin + Staff + Billing Operator |
| `POST /api/imports/appointments` | `isStaffOrAdmin()` | Admin + Staff + Doctor + (Nurse — see §8) |
| `POST /api/data/:adminTable` | `req.user.roles.includes("admin")` | Super Admin, Hospital Admin, Admin |

### Endpoints that only check auth() (no role gate)

- `POST /api/auth/logout` — correct (own session only)
- `GET /api/auth/me` — correct (own data only)
- `GET /api/auth/session` — correct
- `POST /api/auth/change-password` — correct (own password only)
- `POST /api/appointment-notification` — any authenticated user can send Twilio messages
- `POST /api/data/:table` (non-adminTables) — any authenticated user can read/write all clinical tables

### The /api/data/:table guard

Admin-only tables (`profiles`, `user_roles`, `audit_logs`, `role_session_policies`, `user_sessions`, `custom_role_templates`) require `req.user.roles.includes("admin")`.

Non-admin tables accessible to **any authenticated user** with any CRUD action:
`patients`, `appointments`, `notifications`, `prescriptions`, `invoices`, `payments`, `lab_orders`, `pharmacy_items`, `dispensations`, `pharmacy_invoice_items`, `organization_settings`, `service_catalog`, `import_batches`, `notification_read_states`

---

## 7. MySQL Role Model

### Tables involved in role management

```
auth_users (id, email, password_hash, email_verified, is_active, last_sign_in_at)
    │ 1:1 (no FK enforced — backend owns integrity)
    ▼
profiles   (id, full_name, org, phone, custom_role_label, status ['active'|'pending_approval'|'disabled'])
    │ 1:many (no FK enforced)
    ▼
user_roles (id, user_id, role ENUM['admin'|'doctor'|'staff'|'custom'], custom_label, created_at)
           UNIQUE (user_id, role, custom_label)
```

### Role storage model

```
Super Admin    → role='admin',  custom_label='super_admin'
Hospital Admin → role='admin',  custom_label='hospital_admin'
Admin          → role='admin',  custom_label=NULL
Doctor         → role='doctor', custom_label=NULL
Staff          → role='staff',  custom_label=NULL
Nurse          → role='custom', custom_label='nurse'
Pharmacist     → role='custom', custom_label='pharmacist'
Lab Technician → role='custom', custom_label='lab_technician'
Billing Op.    → role='custom', custom_label='billing_operator'
Pending Nurse  → role='custom', custom_label='pending:nurse'
(etc.)
```

### Multiple roles per user

Structurally **supported** by the schema. The `UNIQUE (user_id, role, custom_label)` constraint allows a user to hold multiple rows with different `role`/`custom_label` combinations (e.g., both `doctor` and `custom/pharmacist`).

In practice the `POST /api/admin/approve-user` endpoint **deletes all existing rows and inserts one new one**, enforcing single-role assignment. The frontend `pickPrimaryRole()` function correctly handles multi-role scenarios if they exist.

### Organization relationship

There is no `organization_id` foreign key on `user_roles` or `profiles`. The `organization` column on `profiles` is a free-text field. Multi-tenancy / facility isolation is **not implemented** — all users share all data.

### Role change audit trail

**None.** The `audit_logs` table exists but role changes are not written to it. The `user_sessions.revoked_reason = 'role_change'` provides indirect evidence that a role change occurred, but there is no record of what role was assigned, by whom, or when.

### Role session policies (seeded defaults)

| Role | Idle timeout | Absolute timeout |
|---|---|---|
| super_admin / hospital_admin | 15 min | 4 hours |
| admin | 15 min | 8 hours |
| doctor / nurse / pharmacist / lab_technician | 20 min | 12 hours |
| billing_operator / staff | 20 min | 8 hours |

**Note:** These policies exist in the DB but are not enforced by the Express API. The `auth()` middleware only checks `last_activity_at > NOW() - 8 hours` — a hardcoded 8-hour window for all roles, ignoring the `role_session_policies` table entirely.

---

## 8. Privilege Escalation Risks

These are findings from code inspection only. No live exploitation was performed.

### Risk 1 — Admin can bypass super_admin count limit via /api/data/user_roles ⚠️ MEDIUM

The `POST /api/admin/approve-user` endpoint correctly enforces a maximum of 1 Super Admin. However, any authenticated admin can also use `POST /api/data/user_roles` with `action:'insert'` to directly insert a `user_roles` row with any `role`/`custom_label` — including `role='admin', custom_label='super_admin'`. The adminTables guard only checks `role='admin'`; it does not apply the super_admin count limit.

**Concrete path:**
```json
POST /api/data/user_roles
{ "action": "insert", "data": { "user_id": "<target>", "role": "admin", "custom_label": "super_admin" } }
```
This requires an authenticated admin session. It is not exploitable by regular users.

### Risk 2 — Staff can access billing endpoints ⚠️ LOW (likely intentional)

`isBillingRole()` returns `true` for any user whose DB `role` is `'staff'`. Staff users can therefore finalize, cancel, and record payments on invoices. The code comment acknowledges this: "We accept admin or any session that was started with billing-adjacent roles." It appears intentional but may be broader than desired in a strict role separation model.

### Risk 3 — isStaffOrAdmin() nurse bug 🐛 DEFECT

`isStaffOrAdmin()` checks `req.user.roles.some(r => ["staff","doctor","nurse"].includes(r))`. Nurses are stored with `role='custom'` in the DB, not `role='nurse'`. So `req.user.roles` for a nurse contains `["custom"]`, not `["nurse"]`. Nurses are incorrectly denied access to `POST /api/imports/appointments`. This is a defect, not a privilege escalation.

### Risk 4 — All clinical data readable by any authenticated user ⚠️ MEDIUM

`POST /api/data/:table` with `action:'select'` applies no per-table role checks for non-adminTables. Any authenticated user — including a doctor, pharmacist, or billing operator — can `SELECT * FROM invoices`, `SELECT * FROM prescriptions`, `SELECT * FROM lab_orders`, `SELECT * FROM patients`, etc. The frontend navigation hides links by permission, but the API itself is open. This is a multi-tenancy / data privacy concern rather than a privilege escalation within the role system, but it matters for production HIPAA/healthcare compliance.

### Risk 5 — Appointment notifications unguarded ⚠️ LOW

`POST /api/appointment-notification` only checks `auth()`. Any authenticated user can trigger Twilio SMS/WhatsApp messages. In practice this is low-risk (no data exposure, requires a valid session, Twilio is not configured in dev) but should require a minimum role in production.

### Risk 6 — Frontend role fallback to user_metadata

`roleFromProfileFallback()` in `use-role-access.ts` falls back to `user.user_metadata.role` if `user_roles` is missing or empty. This metadata comes from the MySQL session's `/api/auth/me` response (`user_metadata: { full_name }`) — which does NOT include a role field. So in practice this fallback resolves to `roleDefinitions.staff`. Not a real risk, but the code path exists.

### Risk 7 — `signupRoleOptions` still exports privileged roles (stale export)

`src/lib/access-control.ts` still exports `signupRoleOptions` which includes all 9 roles (including `super_admin`, `hospital_admin`, `admin`). The signup page now uses the local `publicSignupRoleOptions` constant instead, so this export is unused on the signup form. However, if any other component imported `signupRoleOptions` for a public-facing form, it would expose admin roles. The export should be removed or renamed to `adminAssignableRoleOptions`.

---

## 9. Existing QA Accounts

All 9 QA accounts exist in the live MySQL database (`u791891216_careorbit`). Confirmed by:
1. Code inspection of `scripts/provision-qa-accounts.js`
2. Live API login test (`qa.superadmin@careorbit.test` → HTTP 200 during verification suite)

| Email | DB role | custom_label | profiles.status |
|---|---|---|---|
| `qa.superadmin@careorbit.test` | `admin` | `super_admin` | `active` |
| `qa.hospitaladmin@careorbit.test` | `admin` | `hospital_admin` | `active` |
| `qa.admin@careorbit.test` | `admin` | null | `active` |
| `qa.staff@careorbit.test` | `staff` | null | `active` |
| `qa.doctor@careorbit.test` | `doctor` | null | `active` |
| `qa.nurse@careorbit.test` | `custom` | `nurse` | `active` |
| `qa.pharmacist@careorbit.test` | `custom` | `pharmacist` | `active` |
| `qa.labtech@careorbit.test` | `custom` | `lab_technician` | `active` |
| `qa.billing@careorbit.test` | `custom` | `billing_operator` | `active` |

Passwords are not displayed. All 9 accounts were created via `scripts/provision-qa-accounts.js` or `POST /api/auth/qa-provision`.

---

## 10. Missing / Broken Role Features

| Item | Status | Details |
|---|---|---|
| Role change audit log | **Missing** | No writes to `audit_logs` when roles are assigned or changed |
| Role session policy enforcement | **Missing** | `role_session_policies` table exists with seeded values but is not read by `auth()` middleware — all sessions use a hardcoded 8-hour window |
| Nurse appointment import bug | **Defect** | `isStaffOrAdmin()` checks for `role='nurse'` but nurses are stored as `role='custom'` — nurses are incorrectly blocked from `POST /api/imports/appointments` |
| Per-table data isolation on generic endpoint | **Missing** | Any authenticated user can read all clinical tables via `/api/data/:table` — no row-level or role-level filtering |
| Admin tier differentiation | **Missing** | Super Admin, Hospital Admin, and Admin all share `role='admin'` in the DB and have identical server-side capabilities — no tier hierarchy is enforced |
| Multi-facility tenancy | **Not implemented** | `profiles.organization` is a free-text field; no `organization_id` FK; all users see all patient/clinical data |
| `signupRoleOptions` stale export | **Minor** | Still exported with all 9 roles including admin tiers; unused on the signup page but could mislead future developers |
| Direct `user_roles` insert bypasses super_admin count limit | **Gap** | `/api/data/user_roles` allows admin to insert directly, bypassing the count check in `/api/admin/approve-user` |
| Appointment notification role gate | **Missing** | Any authenticated user can trigger Twilio SMS; no minimum role requirement |

---

## 11. Proposed Target Role Architecture

*This section describes recommended changes — clearly separated from the current implementation above.*

### A. Enforce admin tier hierarchy

Introduce a `roleLevel()` helper that maps DB `role` + `custom_label` to a numeric tier:
```
super_admin=4, hospital_admin=3, admin=2, doctor/staff/...=1
```
An admin can only assign roles at their level or below. A plain Admin cannot create Hospital Admin or Super Admin.

### B. Enforce role_session_policies at runtime

Read `role_session_policies` in the `auth()` middleware based on `req.user.custom_role_label ?? req.user.session_role` and apply the per-role idle and absolute timeout.

### C. Add audit logging for role changes

In `POST /api/admin/approve-user`, after the role change transaction:
```sql
INSERT INTO audit_logs (actor_id, action, target_id, details, created_at)
VALUES (?, 'role_change', ?, JSON_OBJECT('old_role', ?, 'new_role', ?, 'new_label', ?), NOW(6))
```

### D. Fix the nurse bug in isStaffOrAdmin()

```javascript
function isStaffOrAdmin(req) {
  if (isAdmin(req)) return true;
  const label = (req.user.custom_role_label || "").toLowerCase();
  return req.user.roles.some(r => ["staff","doctor"].includes(r))
    || label === "nurse";
}
```

### E. Block super_admin creation via /api/data/user_roles

Add a guard in the `/api/data/:table` insert/upsert handler:
```javascript
if (table === "user_roles" && Array.isArray(data)) {
  for (const row of Array.isArray(data) ? [data] : data) {
    if (row.role === "admin" && row.custom_label === "super_admin") {
      // Apply the same count check as approve-user
    }
  }
}
```

### F. Per-table read permissions on /api/data/:table

Add a `readableBy` map that lists minimum required role per table:
- `invoices`, `payments`: admin or billing_operator or staff
- `prescriptions`: doctor, nurse, pharmacist, or admin
- `lab_orders`: doctor, lab_technician, or admin
- `pharmacy_items`, `dispensations`: pharmacist or admin

### G. Clean up stale signupRoleOptions export

Rename `signupRoleOptions` to `allRoleOptions` or `adminAssignableRoleOptions` to make clear it is not for use on the public signup page.

### H. Minimum role gate on appointment notifications

```javascript
app.post("/api/appointment-notification", auth, (req, res, next) => {
  if (!isStaffOrAdmin(req) && !req.user.roles.includes("doctor")) return next(fail(403, "Insufficient role"));
  // ...
});
```

---

## 12. Files Reviewed

| File | What was reviewed |
|---|---|
| `hostinger-api/src/server.js` | Full file: auth() middleware, all role checks, signup handler, approve-user endpoint, adminTables guard, all helper functions |
| `src/lib/access-control.ts` | Full file: all roleDefinitions, permissions, DB mappings, role utility functions |
| `src/routes/signup.tsx` | publicSignupRoleOptions, form structure, handleSubmit, pending_approval client logic |
| `src/hooks/use-role-access.ts` | Full role resolution logic, fallback chain, pending detection |
| `src/routes/_authenticated.tsx` | Pending-approval gate, session check, signout flow |
| `src/routes/_authenticated/access-control.tsx` | assignRoleMutation, assignableRoleKeys, super_admin count logic, custom templates |
| `src/components/app-shell.tsx` | Navigation items and permission gates |
| `scripts/provision-qa-accounts.js` | QA account definitions (email, role, custom_label) |
| `database/careorbit_mysql_migration.sql` | user_roles DDL, profiles DDL, role_session_policies seed, triggers |
| `database/20260911_auth_forward_migration.sql` | auth_users DDL |
| `database/careorbit_add_password_reset_tokens.sql` | password_reset_tokens DDL |

**CODE MODIFIED: NO**
**DATABASE MODIFIED: NO**
**USERS CREATED: NO**
**ROLES CHANGED: NO**
