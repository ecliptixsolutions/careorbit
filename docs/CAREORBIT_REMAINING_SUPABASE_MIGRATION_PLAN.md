# CareOrbit — Remaining Supabase Migration Plan

**Date:** 2026-09-24  
**Status:** In progress

---

## Call-site inventory

| File | Call | Classification | Replacement |
|---|---|---|---|
| `access-control.tsx` | `supabase.rpc("approve_user_role")` | MIGRATE | `POST /api/admin/approve-user` |
| `billing.tsx` | `supabase.rpc("finalize_invoice")` | MIGRATE | `POST /api/billing/finalize` |
| `billing.tsx` | `supabase.rpc("cancel_invoice")` | MIGRATE | `POST /api/billing/cancel` |
| `billing.tsx` | `supabase.rpc("record_invoice_payment")` | MIGRATE | `POST /api/billing/payment` |
| `pharmacy.tsx` | `supabase.rpc("dispense_medicine")` | MIGRATE | `POST /api/pharmacy/dispense` |
| `pharmacy_.bill.tsx` | `supabase.rpc("create_pharmacy_bill")` | MIGRATE | `POST /api/pharmacy/bill` |
| `imports.tsx` | `supabase.rpc("import_patients")` | MIGRATE | `POST /api/imports/patients` |
| `imports.tsx` | `supabase.rpc("import_pharmacy")` | MIGRATE | `POST /api/imports/pharmacy` |
| `imports.tsx` | `supabase.rpc("import_services")` | MIGRATE | `POST /api/imports/services` |
| `imports.tsx` | `supabase.rpc("import_appointments")` | MIGRATE | `POST /api/imports/appointments` |
| `imports.tsx` | `supabase.functions.invoke("invite-staff")` | MIGRATE | `POST /api/admin/invite-staff` |
| `forgot-password.tsx` | `supabase.auth.resetPasswordForEmail()` | MIGRATE | `POST /api/auth/request-password-reset` |
| `reset-password.tsx` | `supabase.auth.exchangeCodeForSession()` | MIGRATE | `POST /api/auth/verify-reset-token` |
| `reset-password.tsx` | `supabase.auth.onAuthStateChange()` | MIGRATE | Token-based URL param flow |
| `reset-password.tsx` | `supabase.auth.updateUser()` | MIGRATE | `POST /api/auth/complete-password-reset` |
| `organization-settings.tsx` | `supabase.storage.from().upload()` | MIGRATE | `POST /api/uploads/logo` |
| `organization-settings.tsx` | `supabase.storage.from().remove()` | MIGRATE | `DELETE /api/uploads/logo` |
| `api/appointment-notification.ts` | `fetch(SUPABASE_URL/auth/v1/user)` | MIGRATE | MySQL session cookie auth |
| `client.server.ts` | `createServerClient(@supabase/ssr)` | DEAD CODE | Not imported anywhere |
| `auth-middleware.ts` | `getSupabaseServerClient()` | DEAD CODE | Not imported anywhere |
| `supabase/functions/invite-staff/index.ts` | Deno Edge Function | DEAD CODE | Not deployed to Hostinger |
| `PROGRAMMING_MANUAL.md` etc. | References to Supabase APIs | DOCUMENTATION ONLY | No action |

---

## New MySQL table required

`password_reset_tokens` — created by `database/careorbit_add_password_reset_tokens.sql`

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id        CHAR(36)     NOT NULL PRIMARY KEY,
  user_id   CHAR(36)     NOT NULL,
  token     CHAR(64)     NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at    DATETIME(6) NULL,
  UNIQUE KEY uk_prt_token (token),
  KEY        idx_prt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## New server endpoints

All added to `hostinger-api/src/server.js`.

| Endpoint | Auth | Description |
|---|---|---|
| `POST /api/admin/approve-user` | admin session | Approve pending user, assign role |
| `POST /api/billing/finalize` | billing/admin session | Draft → issued |
| `POST /api/billing/cancel` | billing/admin session | Issued → cancelled |
| `POST /api/billing/payment` | billing/admin session | Record payment, update paid_amount/status |
| `POST /api/pharmacy/dispense` | pharmacist/admin session | Stock check + decrement + dispensation |
| `POST /api/pharmacy/bill` | pharmacist/admin session | Full pharmacy bill transaction |
| `POST /api/imports/patients` | staff/admin session | Bulk patient import |
| `POST /api/imports/pharmacy` | pharmacist/admin session | Bulk pharmacy stock import |
| `POST /api/imports/services` | billing/admin session | Bulk service catalogue import |
| `POST /api/imports/appointments` | staff/admin session | Bulk appointment import |
| `POST /api/admin/invite-staff` | admin session | Create staff account; no email needed |
| `POST /api/auth/request-password-reset` | none | Generate token; if SMTP configured send email |
| `POST /api/auth/verify-reset-token` | none | Validate token, return one-time session marker |
| `POST /api/auth/complete-password-reset` | reset token | Update password, revoke all sessions |
| `POST /api/uploads/logo` | admin session | Multipart logo upload to local /public/uploads |
| `DELETE /api/uploads/logo` | admin session | Delete local logo file |

---

## Storage decision

Supabase Storage (`hospital-assets` bucket) is replaced with local disk storage on the Express
server at `public/uploads/`. Files are served via the existing `app.use("/uploads", express.static(...))` middleware. Existing Supabase Storage URLs in `logo_path` continue to render
as external URLs (browsers load them directly from Supabase CDN) until replaced by an admin
re-uploading the logo. No existing Supabase Storage files are deleted.

---

## Email delivery

Password reset and staff invitation both require email delivery. The server checks for
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` environment variables. If not
configured:

- Password reset: token is stored in DB; response reports `email_configured: false`. In
  development the reset link is included in the API response for testing.
- Staff invitation: account is created; response includes `account_created: true` and
  `email_configured: false`. Admin can share credentials manually.
