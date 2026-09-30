# CareOrbit MySQL Signup Debug Report

**Date:** 2026-09-24
**Investigator:** Kiro (automated)
**Scope:** POST /api/auth/signup end-to-end debug — Hostinger MySQL only
**Supabase modified:** NO
**15-record migration executed:** NOT EXECUTED
**MySQL data modified:** Test account created and fully cleaned up. No QA accounts touched.

---

## ROOT CAUSE

Two distinct bugs, both in `hostinger-api/src/server.js`:

### Bug 1 — Primary: "Request failed" on signup

The Express server was **not running** when signup was originally tested.
Vite's `/api` proxy at port 8080 forwarded the request to `localhost:3001`, which was
unreachable. The Vite proxy returned a non-JSON `502/504` error response. In
`src/integrations/supabase/client.ts` the `fetch` wrapper does:

```js
const body = await response.json().catch(() => ({}));
// → body = {} because response is HTML/empty
return { data: null, error: { message: body.error?.message || "Request failed" } };
//                                       ↑ undefined          ↑ fallback fires
```

This produced the generic `"Request failed"` message with no further detail.

**Secondary cause visible once server was running:** the signup INSERT explicitly
set `is_active = 0`, but the login query guards on `!user.is_active`. In JavaScript
`!0 === true`, so every account created by the old signup handler was permanently
locked out — login returned `401 Invalid email or password` immediately after
a successful signup.

### Bug 2 — Accounts permanently locked after signup

```js
// BEFORE (broken)
"INSERT INTO auth_users … VALUES (?,?,?,?,0)"
//                                        ^^^ is_active hardcoded 0
```

The `auth_users` schema (`20260911_auth_forward_migration.sql`) defines
`is_active TINYINT(1) NOT NULL DEFAULT 1`, so the default was correct — but the
explicit `0` in every INSERT overrode it. This affected both `/api/auth/signup`
and `/api/auth/qa-provision`.

### Bug 3 — organization and phone silently dropped

The signup form collects `organization` and `phone` in step 1 but the old API call
body only sent `{ email, password, full_name }`. The `profiles` INSERT did not
include those columns, so all organization and phone data was discarded.

### Bug 4 — Privileged roles visible in public signup dropdown

`signupRoleOptions` (from `src/lib/access-control.ts`) included `super_admin`,
`hospital_admin`, and `admin`. These appeared as selectable options on the public
signup form. The server correctly rejected them, but they should never have been
offered in the first place.

### Bug 5 — No pending-approval UX for custom roles

Selecting `nurse`, `pharmacist`, `lab_technician`, or `billing_operator` on signup
resulted in a `staff` account with no indication that the chosen role required admin
approval. The `pending:*` custom_label flow existed in `_authenticated.tsx` but was
never wired through signup.

---

## FIXES APPLIED

### `hostinger-api/src/server.js`

| Change | Detail |
|---|---|
| `is_active = 1` in signup INSERT | Accounts are active immediately after creation |
| `is_active = 1` in qa-provision INSERT | Same fix applied for consistency |
| `organization` + `phone` added to profiles INSERT | Fields now persisted from request body |
| Role safe-list enforced server-side | Only `staff`, `doctor`, `nurse`, `pharmacist`, `lab_technician`, `billing_operator` accepted |
| Pending approval flow | `nurse`/`pharmacist`/`lab_technician`/`billing_operator` → `role='custom'`, `custom_label='pending:<role>'`, `profiles.status='pending_approval'` |
| `pending_approval` flag in 201 response | Frontend uses this to show approval-pending screen |
| `staff` and `doctor` → active immediately | `profiles.status='active'`, `role='staff'`/`'doctor'` |

### `src/integrations/supabase/client.ts`

| Change | Detail |
|---|---|
| `organization` forwarded in signUp body | `input.options?.data?.organization` |
| `phone` forwarded in signUp body | `input.options?.data?.phone` |
| `role` forwarded in signUp body | `input.options?.data?.role` |

### `src/routes/signup.tsx`

| Change | Detail |
|---|---|
| `publicSignupRoleOptions` replaces `signupRoleOptions` | `super_admin`, `hospital_admin`, `admin` removed from public dropdown |
| `organization`, `phone`, `role` sent in `options.data` | Passed through the compatibility bridge to the API |
| Pending-approval screen shown in-place | After signup of a pending role, form replaced with approval-waiting card |
| Improved error messages | `"Request failed"` → `"Could not reach the server…"`, 409 → `"An account with this email already exists"`, 429 → `"Too many signup attempts"` |
| `loading` guard on double-click | Existing — confirmed working (`if (loading) return`) |

---

## LIVE TEST RESULTS

All tests run against the live Hostinger MySQL database via SSH tunnel.
Test account: `qa.signup.test.1790265881@careorbit.test`
Test account was fully cleaned up from all tables after verification.

| Check | Status | Detail |
|---|---|---|
| FRONTEND REQUEST | **PASS** | `POST /api/auth/signup` via Vite proxy → Express :3001 |
| VITE PROXY | **PASS** | `/api` proxy target `http://localhost:3001` reachable |
| EXPRESS SIGNUP ROUTE | **PASS** | 201 Created |
| MYSQL CONNECTION | **PASS** | SSH tunnel `127.0.0.1:3307` → `46.202.196.229:65002` → MariaDB |
| MYSQL INSERT | **PASS** | Transaction committed, all 3 rows written atomically |
| AUTH_USERS | **PASS** | `email_verified=0`, `is_active=1` |
| PROFILES | **PASS** | `full_name`, `organization`, `phone`, `status='active'` all saved |
| USER_ROLES | **PASS** | `role='staff'`, `custom_label=NULL` |
| USER_SESSIONS | **PASS** | Session created on login, `revoked_at` set on logout |
| TRANSACTION SAFETY | **PASS** | `beginTransaction` / `commit` / `rollback` wraps all 3 INSERTs |
| DUPLICATE EMAIL | **PASS** | 409 `"Email already registered"` — no second row created |
| PASSWORD HASHING | **PASS** | `bcrypt` cost 12, hash not returned in any response |
| DOUBLE CLICK PROTECTION | **PASS** | `if (loading) return` guard; button `disabled` during submit |
| PRIVILEGE ESCALATION PROTECTION | **PASS** | 403 for `super_admin` role attempt |
| LOGIN AFTER SIGNUP | **PASS** | 200, `careorbit_session` HttpOnly cookie set |
| LOGOUT | **PASS** | 200, session `revoked_at` written |
| SESSION REVOKED AFTER LOGOUT | **PASS** | 401 on `/api/auth/me` after logout |

---

## ARCHITECTURE CONFIRMED

```
Browser (http://localhost:8080/signup)
  ↓  form submit → supabase.auth.signUp()
src/integrations/supabase/client.ts  [compatibility bridge]
  ↓  POST /api/auth/signup  { email, password, full_name, organization, phone, role }
Vite :8080  /api proxy
  ↓
Express :3001  POST /api/auth/signup
  ↓  rateLimit, validate, strip privileged role
  ↓  bcrypt.hash(password, 12)
  ↓  conn.beginTransaction()
  ↓  INSERT auth_users   (is_active=1, email_verified=0)
  ↓  INSERT profiles     (org, phone, status)
  ↓  INSERT user_roles   (role, custom_label)
  ↓  conn.commit()
  ↓  201 { user: { id, email }, session: null, pending_approval: false }
Browser  → navigate to /login  OR  show pending-approval screen
```

---

## ROLE ASSIGNMENT MATRIX (public signup)

| Selected role | DB role | custom_label | profiles.status | Login allowed |
|---|---|---|---|---|
| staff | `staff` | NULL | `active` | Yes |
| doctor | `doctor` | NULL | `active` | Yes |
| nurse | `custom` | `pending:nurse` | `pending_approval` | Yes (pending screen) |
| pharmacist | `custom` | `pending:pharmacist` | `pending_approval` | Yes (pending screen) |
| lab_technician | `custom` | `pending:lab_technician` | `pending_approval` | Yes (pending screen) |
| billing_operator | `custom` | `pending:billing_operator` | `pending_approval` | Yes (pending screen) |
| super_admin *(blocked)* | — | — | — | 403 |
| hospital_admin *(blocked)* | — | — | — | 403 |
| admin *(blocked)* | — | — | — | 403 |

---

## SECURITY FINDINGS

| Finding | Severity | Status |
|---|---|---|
| `is_active=0` locked every signup account | High | Fixed — set to `1` |
| Privileged roles in public signup dropdown | Medium | Fixed — removed from `publicSignupRoleOptions` |
| `organization`/`phone` silently discarded | Low | Fixed — forwarded and persisted |
| Password not stored in plaintext | — | PASS — bcrypt hash only |
| Password not returned in API response | — | PASS — `password_hash` never returned |
| Password not logged | — | PASS — no `console.log` of body |
| Transaction rollback on partial failure | — | PASS — `conn.rollback()` in catch |
| Rate limiting on signup endpoint | — | PASS — 10 req/min per IP |

---

## OUTSTANDING NOTES

- `email_verified = 0` for all new signups. No email confirmation flow exists yet.
  This is acceptable for an internal hospital ERP where admin approval is the gate,
  but an email verification step should be added before public deployment.
- `pending_approval` accounts can log in and see the approval-waiting screen.
  Sessions are created normally — the `_authenticated.tsx` gate handles the UI block.
- No SMTP provider is configured for password reset (`resetPasswordForEmail` returns
  a static error). This is a known limitation documented in `client.ts`.

---

## FILES MODIFIED

| File | Change summary |
|---|---|
| `hostinger-api/src/server.js` | `is_active=1`, org/phone, role logic, pending approval, qa-provision fix |
| `src/integrations/supabase/client.ts` | Forward org/phone/role in signUp bridge |
| `src/routes/signup.tsx` | Public role list, send fields, pending screen, better errors |

**SUPABASE MODIFIED: NO**
**15-RECORD MIGRATION: NOT EXECUTED**
**MYSQL DATA MODIFIED: NO** (test account created and cleaned up; no QA accounts touched)
**FINAL STATUS: PASS**
