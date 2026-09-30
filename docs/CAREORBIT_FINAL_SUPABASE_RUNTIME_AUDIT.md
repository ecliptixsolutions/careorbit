# CareOrbit Final Supabase Runtime Audit

**Date:** 2026-09-24
**Type:** Read-only audit
**Code modified:** NO
**Database modified:** NO

---

## QUICK STATUS

| Check | Result |
|---|---|
| SUPABASE RUNTIME USAGE | **FOUND — 5 categories** |
| MYSQL AUTH | **PASS** (login/signup/session/logout all route to Express → MySQL) |
| MYSQL DATABASE ACCESS | **PASS** (all `supabase.from()` calls route through the compatibility bridge to `/api/data/:table` → MySQL) |
| SUPABASE AUTH RUNTIME | **FOUND — 3 files with active calls that fail gracefully or are unreachable** |
| SUPABASE DATABASE RUNTIME | **NONE** (all `.from()` calls hit the bridge → MySQL) |
| SUPABASE STORAGE RUNTIME | **FOUND — organization-settings logo upload/delete** |
| SUPABASE RPC RUNTIME | **FOUND — 6 active call sites, all return a static error** |
| SUPABASE EDGE FUNCTION RUNTIME | **FOUND — invite-staff invocation (returns static error)** |
| SUPABASE REALTIME RUNTIME | **NONE** |

---

## HOW THE COMPATIBILITY BRIDGE WORKS

`src/integrations/supabase/client.ts` is **not** the Supabase JS SDK. It is a hand-written
compatibility shim that intercepts every `supabase.*` call and routes it to the Hostinger Express
API instead. This is the central fact that determines every classification below.

```
supabase.auth.signInWithPassword()  →  POST /api/auth/login      → Express → MySQL  ✅
supabase.auth.signUp()              →  POST /api/auth/signup     → Express → MySQL  ✅
supabase.auth.signOut()             →  POST /api/auth/logout     → Express → MySQL  ✅
supabase.auth.getSession()          →  GET  /api/auth/me         → Express → MySQL  ✅
supabase.auth.getUser()             →  GET  /api/auth/me         → Express → MySQL  ✅
supabase.from("table").*            →  POST /api/data/<table>    → Express → MySQL  ✅
supabase.rpc("any_function")        →  returns static error immediately              ❌
supabase.functions.invoke("fn")     →  returns static error immediately              ❌
supabase.storage.from("bucket").*   →  getPublicUrl() = local URL; upload/remove stubbed as errors ⚠️
supabase.auth.resetPasswordForEmail →  returns static error immediately              ❌
supabase.auth.exchangeCodeForSession→  returns static error immediately              ❌
supabase.auth.updateUser()          →  POST /api/auth/change-password → MySQL       ✅
supabase.auth.onAuthStateChange()   →  in-memory event listener only (no Supabase)  ✅
```

No call ever reaches `wjrteuclldaunsnstvcn.supabase.co` through the browser client.

---

## SECTION 1 — SUPABASE AUTH

### 1a. Active runtime auth calls — ALL BRIDGED TO MYSQL ✅

| File | Call | Destination | Status |
|---|---|---|---|
| `src/routes/login.tsx` | `supabase.auth.getSession()` | `GET /api/auth/me` → MySQL | MYSQL |
| `src/routes/login.tsx` | `supabase.auth.signInWithPassword()` | `POST /api/auth/login` → MySQL | MYSQL |
| `src/routes/signup.tsx` | `supabase.auth.signUp()` | `POST /api/auth/signup` → MySQL | MYSQL |
| `src/routes/_authenticated.tsx` | `supabase.auth.signOut()` | `POST /api/auth/logout` → MySQL | MYSQL |
| `src/components/app-shell.tsx` | `supabase.auth.signOut()` | `POST /api/auth/logout` → MySQL | MYSQL |
| `src/hooks/use-auth.ts` | `supabase.auth.getSession()` | `GET /api/auth/me` → MySQL | MYSQL |
| `src/hooks/use-auth.ts` | `supabase.auth.onAuthStateChange()` | In-memory listener, no network | MYSQL |
| `src/routes/_authenticated/sessions.tsx` | `supabase.auth.signOut()` × 2 | `POST /api/auth/logout` → MySQL | MYSQL |

### 1b. Auth calls that return static errors (no network call made) ❌

| File | Call | Bridge response | Impact |
|---|---|---|---|
| `src/routes/forgot-password.tsx` | `supabase.auth.resetPasswordForEmail()` | `"Password reset email requires a configured outbound mail provider."` | Password reset is non-functional. No Supabase call made. |
| `src/routes/reset-password.tsx` | `supabase.auth.exchangeCodeForSession()` | `"Invalid recovery link."` | Reset-password page is non-functional. No Supabase call made. |
| `src/routes/reset-password.tsx` | `supabase.auth.onAuthStateChange()` | In-memory listener, `PASSWORD_RECOVERY` event never fires | Page loads but stays broken. No Supabase call made. |
| `src/routes/reset-password.tsx` | `supabase.auth.updateUser()` | Routes to `POST /api/auth/change-password` → MySQL | Only reachable if exchange succeeds (it never does) |

### 1c. Supabase Appointments auth call — reaches Supabase REST ⚠️

**File:** `src/routes/_authenticated/appointments.tsx` lines ~191–199

```typescript
const { data: { session } } = await supabase.auth.getSession();
// → returns { session: { id: <mysql-session-uuid>, user: { id, email } } }

const phoneResponse = await fetch("/api/appointment-notification", {
  method: "POST",
  headers: { Authorization: `Bearer ${session?.access_token}` },
  ...
});
```

`supabase.auth.getSession()` returns the MySQL session object. Its `access_token` field is
**undefined** (the MySQL session has no JWT — it only has `id` and `user`). The
`Authorization: Bearer undefined` header is sent to `/api/appointment-notification`.

`api/appointment-notification.ts` then calls:
```typescript
const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
  headers: { apikey: supabaseKey, authorization }
});
```

This **does make an outbound call to `wjrteuclldaunsnstvcn.supabase.co`** with
`Authorization: Bearer undefined`. Supabase returns 401, the handler returns 401, and the
phone notification silently fails. The appointment is still saved correctly; only the
WhatsApp/SMS notification is non-functional.

**Classification: ACTIVE RUNTIME CALL TO SUPABASE — always fails with 401. No data exposure.**

---

## SECTION 2 — SUPABASE DATABASE (`supabase.from()`)

**All `supabase.from()` calls route through the compatibility bridge to `POST /api/data/<table>` → Express → MySQL.**

No call reaches the Supabase PostgreSQL database.

| File | Table(s) queried | Destination |
|---|---|---|
| `src/hooks/use-role-access.ts` | `profiles`, `user_roles` | MySQL via `/api/data/` |
| `src/hooks/use-organization-settings.ts` | `organization_settings` | MySQL via `/api/data/` |
| `src/routes/_authenticated/dashboard.tsx` | `patients`, `appointments` | MySQL via `/api/data/` |
| `src/routes/_authenticated/access-control.tsx` | `profiles`, `user_roles`, `custom_role_templates` | MySQL via `/api/data/` |
| `src/routes/_authenticated/patients.tsx` | `patients` | MySQL via `/api/data/` |
| `src/routes/_authenticated/appointments.tsx` | `appointments`, `notifications`, `user_roles` | MySQL via `/api/data/` |
| `src/routes/_authenticated/prescriptions.tsx` | `prescriptions`, `profiles`, `notifications`, `user_roles` | MySQL via `/api/data/` |
| `src/routes/_authenticated/lab.tsx` | `lab_orders`, `patients`, `notifications`, `user_roles` | MySQL via `/api/data/` |
| `src/routes/_authenticated/pharmacy.tsx` | `pharmacy_items`, `patients`, `user_roles` | MySQL via `/api/data/` |
| `src/routes/_authenticated/billing.tsx` | `invoices`, `patients`, `service_catalog` | MySQL via `/api/data/` |
| `src/routes/_authenticated/organization-settings.tsx` | `organization_settings` | MySQL via `/api/data/` |
| `src/routes/_authenticated/sessions.tsx` | `user_sessions` | MySQL via `/api/data/` |
| `src/routes/_authenticated/system-admin.tsx` | All backup tables | MySQL via `/api/data/` |
| `src/routes/_authenticated/automations.tsx` | `appointments`, `patients` | MySQL via `/api/data/` |
| `src/routes/_authenticated/emr-timeline.tsx` | All clinical tables | MySQL via `/api/data/` |
| `src/routes/_authenticated/queue.tsx` | `appointments` | MySQL via `/api/data/` |
| `src/routes/_authenticated/patient-history.tsx` | `patients`, clinical tables | MySQL via `/api/data/` |

**SUPABASE DATABASE RUNTIME: NONE**

---

## SECTION 3 — SUPABASE RPC

The bridge stubs `rpc()` to always return immediately:
```typescript
rpc: async () => ({
  data: null,
  error: { message: "This operation must be migrated to a server transaction." },
}),
```

Every call site receives this error. No network call is made to Supabase.

| File | RPC function called | Current behaviour |
|---|---|---|
| `src/routes/_authenticated/access-control.tsx` | `approve_user_role` | Always fails — role assignment non-functional |
| `src/routes/_authenticated/billing.tsx` | `finalize_invoice` | Always fails — finalize non-functional |
| `src/routes/_authenticated/billing.tsx` | `cancel_invoice` | Always fails — cancel non-functional |
| `src/routes/_authenticated/billing.tsx` | `record_invoice_payment` | Always fails — payment recording non-functional |
| `src/routes/_authenticated/pharmacy_.bill.tsx` | `create_pharmacy_bill` | Always fails — pharmacy billing non-functional |
| `src/routes/_authenticated/pharmacy.tsx` | `dispense_medicine` | Always fails — dispensation non-functional |
| `src/routes/_authenticated/imports.tsx` | `import_pharmacy`, `import_patients`, etc. | Always fails — all bulk imports non-functional |

**SUPABASE RPC RUNTIME: NO NETWORK CALLS — but 7 business-critical features are broken.**

---

## SECTION 4 — SUPABASE EDGE FUNCTIONS

The bridge stubs `functions.invoke()` to always return immediately:
```typescript
functions: {
  invoke: async () => ({
    data: null,
    error: { message: "This operation must be migrated to the Hostinger API." },
  }),
},
```

| File | Function invoked | Current behaviour |
|---|---|---|
| `src/routes/_authenticated/imports.tsx` | `invite-staff` | Always fails — staff invitation non-functional |

The Edge Function file itself (`supabase/functions/invite-staff/index.ts`) exists in the repo
and imports `@supabase/supabase-js` from `esm.sh`. It uses `createClient`, `auth.getUser()`,
`rpc("has_role")`, and `auth.admin.inviteUserByEmail()`. This file **is never executed** in the
Hostinger/Express environment — it is a Supabase Deno Edge Function that would only run if
deployed to the Supabase platform.

**SUPABASE EDGE FUNCTION RUNTIME: NO NETWORK CALLS — staff invitation non-functional.**

---

## SECTION 5 — SUPABASE STORAGE

The bridge partially stubs storage:
```typescript
storage: {
  from: () => ({
    getPublicUrl: (path) => ({ data: { publicUrl: `${base}/uploads/${path}` } }),
    upload: async () => ({ error: { message: "Use /api/uploads." } }),
    remove: async () => ({ error: null }),
  }),
},
```

| File | Call | Actual behaviour |
|---|---|---|
| `src/hooks/use-organization-settings.ts` | `getPublicUrl(path)` | Returns local `/uploads/<path>` URL — no Supabase call ✅ |
| `src/routes/_authenticated/organization-settings.tsx` | `upload(logoPath, file)` | Returns `{ error: "Use /api/uploads." }` — upload silently fails ❌ |
| `src/routes/_authenticated/organization-settings.tsx` | `remove([path])` | Returns `{ error: null }` (fake success) — no deletion happens ❌ |

**Result:** Organisation logo upload is broken. Any existing logo URLs that point to
`hospital-assets.supabase.co` will not render (no Supabase bucket access). The `getPublicUrl`
call returns a local `/uploads/` path which also has no backing files on the Express server.

**SUPABASE STORAGE RUNTIME: NO CALLS TO SUPABASE — but logo upload/remove are non-functional.**

---

## SECTION 6 — DEAD / LEGACY CODE (never executed at runtime)

| File | Type | Why it never executes |
|---|---|---|
| `src/integrations/supabase/client.server.ts` | DEAD | Imports `@supabase/ssr` and `@supabase/supabase-js` — neither package is in `package.json`. File is never imported anywhere in `src/`. Would throw `MODULE_NOT_FOUND` if called. |
| `src/integrations/supabase/auth-middleware.ts` | DEAD | Imports `getSupabaseServerClient` from `client.server.ts`. Never imported anywhere in the runtime app. Was an SSR middleware for the old Supabase auth path. |
| `supabase/functions/invite-staff/index.ts` | DEAD | A Supabase Deno Edge Function. Never deployed to the Hostinger environment. Only runs on the Supabase platform. |
| `api/appointment-notification.ts` | MIGRATION/LEGACY | Still references `SUPABASE_URL` to validate the session token via Supabase Auth REST. Reached at runtime but always fails (see Section 1c). |

---

## SECTION 7 — PACKAGE AUDIT

| Package | In `package.json`? | In `bun.lock`? | Actually used at runtime? |
|---|---|---|---|
| `@supabase/supabase-js` | **NO** | Yes (lock file stale) | NO — not installed, not importable |
| `@supabase/ssr` | **NO** | Not found | NO — would cause MODULE_NOT_FOUND |
| `mysql2` | YES | Yes | YES — all database access |
| `bcryptjs` | YES | Yes | YES — password hashing |
| `express` | YES | Yes | YES — API server |

`@supabase/supabase-js` appears in `bun.lock` because it was added by the Lovable sandbox
scaffolding and is referenced in the lock file from an earlier phase. It is not listed in
`package.json` `dependencies` or `devDependencies`, so it cannot be `import`-ed at runtime.
The browser client (`src/integrations/supabase/client.ts`) is a **hand-written shim** — it does
not import the Supabase SDK at all.

---

## SECTION 8 — ENVIRONMENT VARIABLE USAGE

| Variable | Where used | Runtime impact |
|---|---|---|
| `SUPABASE_URL` | `api/appointment-notification.ts`, `client.server.ts` | `appointment-notification.ts` uses it to call Supabase Auth `/auth/v1/user` — call always fails with 401. `client.server.ts` never loaded. |
| `SUPABASE_ANON_KEY` | `api/appointment-notification.ts`, `client.server.ts` | Same as above. |
| `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts` | File never loaded. No runtime impact. Key should be removed from `.env`. |
| `VITE_SUPABASE_URL` | `api/appointment-notification.ts` | Fallback for `SUPABASE_URL`. Same impact. |
| `VITE_SUPABASE_ANON_KEY` | `api/appointment-notification.ts` | Fallback for `SUPABASE_ANON_KEY`. Same impact. |
| `VITE_SUPABASE_PROJECT_ID` | `.env` | Read by Vite at build time only. No runtime call. |

---

## SECTION 9 — CONFIRMED AUTHENTICATION FLOW

```
Browser
  ↓
supabase.auth.signInWithPassword({ email, password })
  ↓  [compatibility bridge in client.ts]
POST /api/auth/login   (Content-Type: application/json, credentials: include)
  ↓
Vite :8080  →  proxy  →  Express :3001
  ↓
Hostinger MySQL  (via SSH tunnel :3307)
  ↓
auth_users: bcrypt.compare(password, hash)
user_sessions: INSERT new session row
  ↓
Set-Cookie: careorbit_session=<uuid>; HttpOnly; SameSite=Lax
```

**Supabase is NOT in this path at any point. MYSQL AUTH: PASS.**

---

## SECTION 10 — COMPLETE FINDING CLASSIFICATION

### ACTIVE RUNTIME — reaches Supabase network

| # | File | Call | Classification | Risk |
|---|---|---|---|---|
| 1 | `api/appointment-notification.ts` | `fetch(SUPABASE_URL + "/auth/v1/user")` | ACTIVE (always returns 401) | Low — always fails, no data exchanged |

### ACTIVE RUNTIME — non-functional features (static errors, no network)

| # | File | Feature | What fails |
|---|---|---|---|
| 2 | `src/routes/_authenticated/access-control.tsx` | User approval / role assignment | `rpc("approve_user_role")` → static error |
| 3 | `src/routes/_authenticated/billing.tsx` | Finalize invoice | `rpc("finalize_invoice")` → static error |
| 4 | `src/routes/_authenticated/billing.tsx` | Cancel invoice | `rpc("cancel_invoice")` → static error |
| 5 | `src/routes/_authenticated/billing.tsx` | Record payment | `rpc("record_invoice_payment")` → static error |
| 6 | `src/routes/_authenticated/pharmacy_.bill.tsx` | Create pharmacy bill | `rpc("create_pharmacy_bill")` → static error |
| 7 | `src/routes/_authenticated/pharmacy.tsx` | Dispense medicine | `rpc("dispense_medicine")` → static error |
| 8 | `src/routes/_authenticated/imports.tsx` | All bulk imports + staff invite | `rpc("import_*")` + `functions.invoke("invite-staff")` → static error |
| 9 | `src/routes/_authenticated/organization-settings.tsx` | Logo upload / remove | `storage.upload/remove` → static error |
| 10 | `src/routes/forgot-password.tsx` | Password reset email | `resetPasswordForEmail` → static error |
| 11 | `src/routes/reset-password.tsx` | Reset password flow | `exchangeCodeForSession` → static error |

### DEAD CODE (never reached at runtime)

| # | File | Reason |
|---|---|---|
| 12 | `src/integrations/supabase/client.server.ts` | Not imported anywhere; packages absent |
| 13 | `src/integrations/supabase/auth-middleware.ts` | Not imported anywhere |
| 14 | `supabase/functions/invite-staff/index.ts` | Deno Edge Function; not deployed to Hostinger |

### DOCUMENTATION / TEST ONLY

| # | File | Type |
|---|---|---|
| 15 | `docs/` (all .md files) | Documentation |
| 16 | `PROGRAMMING_MANUAL.md`, `PROJECT_SPECIFICATION.md` | Documentation |
| 17 | `security/VULN-FINDINGS.json`, `security/PATCHES.md`, `security/FINAL_REPORT.md` | Historical security docs |
| 18 | `tests/security_e2e.pw.ts`, `tests/security_assessment.py` | Test only (grep for key names, no SDK usage) |
| 19 | `scripts/generate-pdf-report.cjs` | Build script only |

---

## SUMMARY

The authentication and data access paths are **fully on MySQL**. The compatibility bridge in
`client.ts` successfully intercepts every `supabase.*` call and routes it to the Express API.
No user data flows to Supabase at runtime.

**What is broken due to the Supabase → MySQL migration being incomplete:**

| Category | Broken features |
|---|---|
| Role management | User approval, role assignment (rpc stub) |
| Billing | Finalize invoice, cancel invoice, record payment (rpc stub) |
| Pharmacy | Create pharmacy bill, dispense medicine (rpc stub) |
| Imports | All bulk data imports, staff invitation (rpc stub + functions stub) |
| Storage | Organization logo upload/delete (storage stub) |
| Auth | Password reset/forgot-password flow (resetPasswordForEmail stub) |
| Notifications | WhatsApp/SMS appointment notifications (appointment-notification.ts hits Supabase Auth → 401) |

**None of the broken features expose data to Supabase or cause data loss.** They fail with
error messages. The core hospital workflows (patients, appointments, lab orders, prescriptions,
sessions, roles reading, dashboard) all work through MySQL.

---

**SUPABASE RUNTIME USAGE: FOUND (1 network call — appointment-notification, always 401)**
**MYSQL AUTH: PASS**
**MYSQL DATABASE ACCESS: PASS**
**SUPABASE AUTH RUNTIME: NONE (all bridged to MySQL)**
**SUPABASE DATABASE RUNTIME: NONE**
**SUPABASE STORAGE RUNTIME: NONE (stubbed — upload/remove non-functional)**
**SUPABASE RPC RUNTIME: NONE (stubbed — 7 features non-functional)**
**SUPABASE EDGE FUNCTION RUNTIME: NONE (stubbed — staff invite non-functional)**
**SUPABASE REALTIME RUNTIME: NONE**
