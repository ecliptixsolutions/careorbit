# CareOrbit Role Creation Flow Report

**Date:** 2026-09-24
**Type:** Read-only investigation
**Scope:** All role creation, assignment, and approval paths across frontend, backend, and database
**Code modified:** NO
**Database modified:** NO
**Accounts created:** NO

---

## PUBLIC SIGNUP ROLES

The public `/signup` page offers exactly **6 roles** via the local `publicSignupRoleOptions` constant in `src/routes/signup.tsx`:

| Role | Immediately active? | DB `role` | `custom_label` |
|---|---|---|---|
| Staff | YES | `staff` | null |
| Doctor | YES | `doctor` | null |
| Nurse | NO — pending approval | `custom` | `pending:nurse` |
| Pharmacist | NO — pending approval | `custom` | `pending:pharmacist` |
| Lab Technician | NO — pending approval | `custom` | `pending:lab_technician` |
| Billing Operator | NO — pending approval | `custom` | `pending:billing_operator` |

`super_admin`, `hospital_admin`, and `admin` are **not available** on the public signup form. They are excluded via a TypeScript type constraint on `publicSignupRoleOptions` and are also explicitly rejected by the server with HTTP 403.

> Note: `src/lib/access-control.ts` still exports a `signupRoleOptions` array that includes all 9 roles. This was the original list. The signup page was updated to use the new restricted `publicSignupRoleOptions` instead. `signupRoleOptions` is now unused on the signup form but the export is still present.

---

## SUPER ADMIN CREATION

**Current mechanism: Bootstrap-only — no self-service path.**

There are 4 ways a Super Admin row can be created in MySQL. None of them are UI-accessible to a non-admin user:

| # | Method | How | Auth required |
|---|---|---|---|
| 1 | `scripts/provision-qa-accounts.js` | Runs directly against MySQL with `MYSQL_*` env vars; inserts `role='admin', custom_label='super_admin'` for `qa.superadmin@careorbit.test` | Server access / env vars |
| 2 | `POST /api/auth/qa-provision` | Token-gated endpoint (`x-qa-provision-token` header); allow-map hardcodes 9 QA emails including super_admin | `QA_PROVISION_TOKEN` env var |
| 3 | Direct database INSERT | `INSERT INTO user_roles … role='admin', custom_label='super_admin'` via phpMyAdmin or MySQL client | Hostinger DB credentials |
| 4 | `POST /api/data/user_roles` (data API) | Generic data endpoint; requires an existing authenticated session with DB role `admin`; inserts a row directly | Must already be an admin |

**The `approve_user_role` PostgreSQL SECURITY DEFINER function** (in `supabase/migrations/20260708190000_security_remediation.sql`) enforces: only one Super Admin allowed, and only an existing `admin` role holder can call it. This function exists only on the Supabase/PostgreSQL side. **It has not been ported to the MySQL/Hostinger Express API.**

**Bootstrap gap:** To create the very first Super Admin on a fresh MySQL deployment, you must use method 1, 2, or 3. There is no first-user promotion logic anywhere in the application.

---

## ADMIN CREATION

**Current mechanism: No dedicated UI path — broken RPC.**

Admins can only be created by:
1. An existing authenticated `admin` (DB role) using `POST /api/data/user_roles` directly (programmatic, no UI)
2. `POST /api/auth/qa-provision` (QA token required)
3. `scripts/provision-qa-accounts.js` (server access required)
4. Direct database INSERT

The Access Control page (`/_authenticated/access-control`) shows an "Admin" button in the role assignment grid. When clicked it calls `supabase.rpc("approve_user_role", …)`. This **always returns an error** because `client.ts` stubs `rpc()` to:
```
{ data: null, error: { message: "This operation must be migrated to a server transaction." } }
```

The role assignment UI exists but **role assignment does not work** in the MySQL/Hostinger environment.

---

## HOSPITAL ADMIN CREATION

**Same as Admin — broken RPC, no working UI path.**

The UI renders a "Hospital Admin" button on the access-control page. It calls the same stubbed `supabase.rpc("approve_user_role")`. Always fails.

Bootstrap-only via the same 4 methods listed under Super Admin (with `custom_label='hospital_admin'`).

---

## USER APPROVAL

**UI exists. Functionality is broken.**

**UI location:** `/_authenticated/access-control` → "User approval and role assignment" panel

**What the UI does:**
- Fetches all `profiles` and `user_roles` from `POST /api/data/profiles` and `POST /api/data/user_roles`
- Shows each user with their current role (or pending badge if `custom_label` starts with `pending:`)
- For pending users shows their requested role (parsed from `pending:<role>` label)
- Renders a row of role-assignment buttons for every user (`assignableRoleKeys`)

**What breaks it:**
```typescript
// access-control.tsx assignRoleMutation
const { error } = await (supabase as any).rpc("approve_user_role", {
  _user_id: targetUserId,
  _role: roleConfig.role,
  _custom_label: roleConfig.custom_label,
});
```

The `rpc()` method in `client.ts`:
```typescript
rpc: async () => ({
  data: null,
  error: { message: "This operation must be migrated to a server transaction." },
}),
```

**Every role assignment attempt fails with "This operation must be migrated to a server transaction."**

The user sees a toast error. The `user_roles` row is never updated. `profiles.status` is never changed to `active`. Pending users stay pending forever.

---

## ROLE ASSIGNMENT

**Current actual working path (programmatic only):**

`POST /api/data/user_roles` with `action: "insert"` or `action: "upsert"`, authenticated as a user with DB role `admin`:

```json
{
  "action": "upsert",
  "data": {
    "id": "<uuid>",
    "user_id": "<target-user-uuid>",
    "role": "doctor",
    "custom_label": null
  }
}
```

Also requires a separate `POST /api/data/profiles` call with `action: "update"` to set `status='active'`.

**Server guard on `/api/data/user_roles`:**
```js
adminTables = new Set(["profiles", "user_roles", "audit_logs", …])
// Guard: req.user.roles.includes("admin") required
```
`req.user.roles` is populated from `GROUP_CONCAT(DISTINCT r.role)` — the raw DB `role` column value. Since `super_admin`, `hospital_admin`, and plain `admin` all store `role='admin'` in the DB, all three admin variants pass this check.

**No server-side super_admin count limit on this path.** The one-super-admin limit exists only in the PostgreSQL `approve_user_role` function (not ported to MySQL).

---

## ROLE HIERARCHY

### DB storage model

| Friendly name | `user_roles.role` | `user_roles.custom_label` | `profiles.status` |
|---|---|---|---|
| Super Admin | `admin` | `super_admin` | `active` |
| Hospital Admin | `admin` | `hospital_admin` | `active` |
| Admin | `admin` | null | `active` |
| Doctor | `doctor` | null | `active` |
| Staff | `staff` | null | `active` |
| Nurse | `custom` | `nurse` | `active` |
| Pharmacist | `custom` | `pharmacist` | `active` |
| Lab Technician | `custom` | `lab_technician` | `active` |
| Billing Operator | `custom` | `billing_operator` | `active` |
| Pending (any) | `custom` | `pending:<requested>` | `pending_approval` |

### Permission hierarchy (from `src/lib/access-control.ts`)

All three admin tiers (super_admin, hospital_admin, admin) receive identical permissions (`fullAdminRights`). There is no permission differentiation between them in the frontend — the distinction is semantic only. The DB route guard treats them all identically (all have `role='admin'`).

| Permission | super_admin | hospital_admin | admin | doctor | staff | nurse | pharmacist | lab_tech | billing |
|---|---|---|---|---|---|---|---|---|---|
| canManageUsers | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| canApproveUsers | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| canManageRoles | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| canViewPatients | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| canCreatePatients | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| canDeleteRecords | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Who can assign which roles

| Acting role | Can call `/api/data/user_roles`? | Soft limit on super_admin? |
|---|---|---|
| super_admin (DB: admin) | YES | NO (not enforced server-side in MySQL) |
| hospital_admin (DB: admin) | YES | NO |
| admin (DB: admin) | YES | NO |
| doctor / staff / nurse / etc. | NO — 403 | n/a |

In the Supabase/PostgreSQL path: `approve_user_role()` SECURITY DEFINER enforced: only one super_admin allowed (unless assigning to self); only `admin` role can call it. This enforcement does NOT exist in MySQL.

---

## SERVER-SIDE ROLE PROTECTION

**PASS — with one gap**

Protection at `POST /api/auth/signup`:
- Explicit block list: `super_admin`, `hospital_admin`, `admin` → 403
- Body field blocks: `isAdmin`, `isSuperAdmin`, `permissions` → 403
- Safe-list: only staff/doctor/nurse/pharmacist/lab_technician/billing_operator accepted
- Any other value silently defaults to `staff`

Protection at `POST /api/data/user_roles`:
- Requires authenticated session (`careorbit_session` cookie)
- Requires `req.user.roles.includes("admin")` → 403 for everyone else

**Gap:** No server-side maximum of 1 super_admin in MySQL. An authenticated admin can insert multiple `role='admin', custom_label='super_admin'` rows via the data API.

---

## PRIVILEGE ESCALATION PROTECTION

**PASS on public signup. PARTIAL on authenticated paths.**

| Attack vector | Protected? | How |
|---|---|---|
| Public signup sends `role=super_admin` in body | ✅ YES | 403 from explicit PRIVILEGED block list in server.js |
| Public signup sends `isAdmin=true` | ✅ YES | 403 from body field check |
| Public signup sends `role=anything_else` | ✅ YES | Safe-list; defaults to staff |
| Authenticated admin assigns super_admin to self via data API | ⚠️ PARTIAL | Allowed; no server-side count limit |
| Authenticated admin assigns super_admin to others | ⚠️ PARTIAL | Allowed; no server-side count limit |
| Non-admin calls `/api/data/user_roles` to change own role | ✅ YES | 403 from adminTables guard |

---

## MISSING FUNCTIONALITY

| Missing item | Impact | Severity |
|---|---|---|
| **`POST /api/approve-user-role` endpoint in server.js** | The Access Control UI is completely non-functional. Pending users can never be approved. Role changes via UI always fail. | **Critical** |
| **`profiles.status` update on role assignment** | Even if a role row is written, the account stays `pending_approval` unless `profiles.status` is also set to `active`. The Supabase `approve_user_role` function did both atomically. MySQL has no equivalent. | **Critical** |
| **`revoke_sessions_on_role_change` trigger** | On Supabase, changing a role automatically revoked all active sessions so the user's permissions refreshed on next login. No equivalent in MySQL. | Medium |
| **Super Admin count limit on MySQL path** | One-super-admin constraint exists only in PostgreSQL. Via `/api/data/user_roles`, any admin can create multiple super admins. | Medium |
| **Admin invitation flow** | There is no way to invite a new admin directly from the UI. An admin must exist already, and they can only operate programmatically. | Medium |
| **First-user bootstrap UI** | No mechanism to promote the first account to super_admin without server access. | Medium |
| **`useRoleAccess` stale after approval** | After role assignment, the approved user's session reflects old roles until they log out and back in (no server-push or forced refresh). | Low |

---

## RECOMMENDED ROLE FLOW

### Immediate fix (unblocks the application)

Add a `POST /api/admin/approve-user` endpoint to `server.js` that:
1. Requires an authenticated session with DB role `admin`
2. Accepts `{ user_id, role, custom_label }`
3. Validates: role must be in the allowed enum; custom_label must be in the safe set
4. Enforces: max 1 super_admin (count check before insert)
5. In a transaction: deletes old `user_roles` row, inserts new one, updates `profiles.status='active'`, revokes all active sessions for the target user
6. Returns `{ ok: true }`

Update `access-control.tsx` `assignRoleMutation` to call this endpoint instead of `supabase.rpc("approve_user_role")`.

### Role hierarchy recommendation

```
Super Admin     (bootstrap only — direct DB or QA provision)
    ↓ can create
Hospital Admin  (assigned by Super Admin via approve-user endpoint)
    ↓ can create
Admin           (assigned by Super Admin or Hospital Admin)
    ↓ can create
All other roles (assigned by any admin tier)
```

The server should enforce that only a Super Admin can assign Super Admin or Hospital Admin roles, and prevent self-promotion beyond current tier.

### Public signup recommendation (current state is already correct)

```
Public signup → staff or doctor: active immediately, no approval needed
Public signup → nurse/pharmacist/lab_tech/billing: pending:X, admin approval required
super_admin / hospital_admin / admin: never on public signup (enforced server-side)
```

---

## FILES INVOLVED

| File | Role |
|---|---|
| `hostinger-api/src/server.js` | All server-side auth and role enforcement |
| `src/routes/signup.tsx` | Public signup dropdown and form |
| `src/routes/_authenticated/access-control.tsx` | Admin UI for user approval (broken — rpc stub) |
| `src/routes/_authenticated/dashboard.tsx` | Role-aware dashboard widgets |
| `src/routes/_authenticated.tsx` | Pending-approval gate layout |
| `src/lib/access-control.ts` | Role definitions, DB mappings, permission sets |
| `src/hooks/use-role-access.ts` | Current user role resolution |
| `src/integrations/supabase/client.ts` | Compatibility bridge — `rpc()` stubbed |
| `supabase/migrations/20260708190000_security_remediation.sql` | PostgreSQL `approve_user_role` function (not ported) |
| `scripts/provision-qa-accounts.js` | QA bootstrap — only working admin creation path |
| `database/MYSQL_MIGRATION_NOTES.md` | Documents `approve_user_role` as not ported |

---

**SUPABASE MODIFIED: NO**
**DATABASE MODIFIED: NO**
**ACCOUNTS CREATED: NO**
**CODE MODIFIED: NO**
