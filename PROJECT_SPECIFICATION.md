# CareOrbit Project Specification

Last updated: 2026-09-24  
Architecture: **Hostinger MySQL** (Supabase migration complete)

## 1. Project Overview

CareOrbit is a healthcare ERP, EMR, and AI-ready web application for clinics and hospitals. The application provides a branded public website, email/password authentication, a protected application shell, full role-based access control, patient management, appointment scheduling, lab orders, pharmacy, billing, imports, and organisation settings.

Authentication and all data storage run on **Hostinger MySQL** (`u791891216_careorbit`) accessed via an Express API. The Supabase runtime dependency has been fully removed.

## 2. Product Goals

- Provide a modern web interface for healthcare facility operations.
- Centralize patient information, guardian contact details, and appointment scheduling.
- Support clinic staff, doctors, admins, and custom operational roles.
- Full hospital ERP workflows: lab, pharmacy, billing, inventory, surgery, radiology, telemedicine, and AI-assisted consultation.
- Deploy as a Vite + TanStack Start frontend with a Node.js Express API on Hostinger.

## 3. Current Implementation Status

Implemented and live on MySQL:

- Public landing page.
- CareOrbit branding and Ecliptix-inspired dark blue/purple visual theme.
- Email/password login with HttpOnly session cookie.
- Email/password signup with role selection and pending-approval flow.
- Password strength checklist and random strong password suggestion.
- Protected authenticated layout with role-based navigation.
- Pending approval gate for custom roles (nurse, pharmacist, lab technician, billing operator).
- Dashboard with live counts from MySQL.
- Patient listing, search, creation, and bulk import.
- Guardian emergency contact capture.
- Appointment listing, scheduling, and bulk import.
- WhatsApp/SMS appointment notification via Twilio (configurable).
- EMR timeline.
- Queue management.
- Lab orders and lab technician assignment.
- Pharmacy inventory, dispensing, and pharmacy billing.
- Billing (invoices, finalize, cancel, payment recording).
- Service catalogue and bulk import.
- Bulk imports: patients, pharmacy, services, appointments, staff.
- Staff invitation.
- Organisation settings with logo upload.
- Access control: user approval and role assignment by admins.
- Custom role templates.
- Role-wise session policies.
- Active session management.
- System admin: audit logs and full data backup.
- Automations.
- Forgot password / password reset (token-based, SMTP-configurable).
- Change password.

Not currently exposed in the UI (roadmap):

- Patient edit/delete screens.
- Appointment edit/delete/status update screens.
- Multi-facility tenant separation.
- Surgery, radiology, telemedicine modules beyond marketing content.
- AI consultation assistant and voice receptionist.

## 4. Architecture

### 4.1 Runtime architecture

```
Browser (Vite :8080 dev / static build in production)
  â†“  /api proxy (Vite dev) or direct (production)
Express :3001  (hostinger-api/src/server.js)
  â†“
SSH tunnel (dev only: 127.0.0.1:3307 â†’ 46.202.196.229:65002)
  â†“
Hostinger MariaDB 11.8 â€” database: u791891216_careorbit
```

### 4.2 Authentication flow

```
POST /api/auth/login
  â†’ bcrypt.compare(password, hash)
  â†’ INSERT user_sessions
  â†’ Set-Cookie: careorbit_session=<uuid>; HttpOnly; SameSite=Lax; Max-Age=28800
```

Every authenticated request carries the `careorbit_session` cookie. The `auth()` middleware in Express validates it against `user_sessions` (8-hour idle window, revoked_at check).

### 4.3 Frontend Supabase compatibility bridge

`src/integrations/supabase/client.ts` is a hand-written shim that intercepts every `supabase.*` call and routes it to the Express API. No Supabase SDK is installed or called at runtime.

| `supabase.*` call | Express endpoint |
|---|---|
| `auth.signInWithPassword()` | `POST /api/auth/login` |
| `auth.signUp()` | `POST /api/auth/signup` |
| `auth.signOut()` | `POST /api/auth/logout` |
| `auth.getSession() / getUser()` | `GET /api/auth/me` |
| `auth.updateUser()` | `POST /api/auth/change-password` |
| `auth.onAuthStateChange()` | In-memory listener |
| `from("table").*` | `POST /api/data/<table>` |
| `rpc()` | Stub (all RPCs now have dedicated endpoints) |
| `functions.invoke()` | Stub (replaced by `/api/admin/invite-staff`) |
| `storage.from().getPublicUrl()` | Returns `/uploads/<path>` |
| `storage.from().upload()` | Stub (replaced by `POST /api/uploads/logo`) |
| `storage.from().remove()` | Stub (replaced by `DELETE /api/uploads/logo`) |

## 5. Target Users and Roles

### Role hierarchy (DB storage model)

| Friendly name | `user_roles.role` | `user_roles.custom_label` | Active immediately? |
|---|---|---|---|
| Super Admin | `admin` | `super_admin` | Bootstrap only |
| Hospital Admin | `admin` | `hospital_admin` | Admin-assigned only |
| Admin | `admin` | null | Admin-assigned only |
| Doctor | `doctor` | null | Yes (public signup) |
| Staff | `staff` | null | Yes (public signup) |
| Nurse | `custom` | `nurse` | Pending approval |
| Pharmacist | `custom` | `pharmacist` | Pending approval |
| Lab Technician | `custom` | `lab_technician` | Pending approval |
| Billing Operator | `custom` | `billing_operator` | Pending approval |
| Pending | `custom` | `pending:<role>` | Blocked â€” awaiting admin |

### Permission gates

`canManageUsers`, `canApproveUsers`, `canManageRoles` â€” Super Admin, Hospital Admin, Admin only.  
All role permissions defined in `src/lib/access-control.ts` â†’ `roleDefinitions`.

## 6. Route Map

### Public routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/login` | Email/password login |
| `/signup` | Account creation (staff/doctor immediate; others pending approval) |
| `/forgot-password` | Request password-reset link |
| `/reset-password?token=<hex>` | Token-based password reset |

### Authenticated routes

| Route | Purpose | Role gate |
|---|---|---|
| `/dashboard` | Operational overview and metrics | All |
| `/patients` | Patient list, search, create | All |
| `/patient-history` | Patient history by phone | Doctor+ |
| `/appointments` | Appointment list, schedule | All |
| `/emr-timeline` | EMR clinical timeline | Clinical |
| `/queue` | Queue management | Clinical |
| `/lab` | Lab orders and results | Lab+ |
| `/prescriptions` | Prescription management | Doctor+ |
| `/pharmacy` | Pharmacy inventory and dispensing | Pharmacist+ |
| `/pharmacy/bill` | Pharmacy billing | Pharmacist+ |
| `/billing` | Invoices and payments | Billing+ |
| `/imports` | Bulk data import and staff invitation | Staff+ |
| `/automations` | Workflow automations | Staff+ |
| `/access-control` | User approval and role assignment | Admin |
| `/organization-settings` | Hospital branding and settings | Admin |
| `/sessions` | Active session management | All |
| `/system-admin` | Audit logs and data backup | Admin |

## 7. Express API Endpoints

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/signup` | None | Create account |
| `POST` | `/api/auth/login` | None | Email/password login |
| `POST` | `/api/auth/logout` | Session | Revoke session |
| `GET` | `/api/auth/me` | Session | Current user + roles |
| `GET` | `/api/auth/session` | Session | Session info |
| `POST` | `/api/auth/change-password` | Session | Change password, revoke other sessions |
| `POST` | `/api/auth/request-password-reset` | None | Generate reset token; send email if SMTP configured |
| `POST` | `/api/auth/verify-reset-token` | None | Validate reset token (read-only) |
| `POST` | `/api/auth/complete-password-reset` | None | Apply new password; mark token used; revoke sessions |
| `POST` | `/api/auth/qa-provision` | Token | QA account bootstrap (token-gated) |

### Admin / Role management

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/admin/approve-user` | Admin session | Approve pending user, assign role, revoke old sessions |
| `POST` | `/api/admin/invite-staff` | Admin session | Bulk staff creation with optional email invite |

### Billing

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/billing/finalize` | Billing/Admin | Draft â†’ issued |
| `POST` | `/api/billing/cancel` | Billing/Admin | Issued â†’ cancelled (requires reason; no paid amount) |
| `POST` | `/api/billing/payment` | Billing/Admin | Record payment; update `paid_amount`; return receipt number |

### Pharmacy

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/pharmacy/dispense` | Pharmacist/Admin | Stock check + decrement + dispensation row |
| `POST` | `/api/pharmacy/bill` | Pharmacist/Admin | Full pharmacy bill transaction (items, stock, payment) |

### Imports

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/imports/patients` | Staff/Admin | Bulk patient import with MRN/phone dedup |
| `POST` | `/api/imports/pharmacy` | Pharmacist/Admin | Bulk pharmacy stock import with SKU/batch dedup |
| `POST` | `/api/imports/services` | Billing/Admin | Bulk service catalogue import (upsert by service_code) |
| `POST` | `/api/imports/appointments` | Staff/Admin | Bulk appointment import via patient MRN lookup |

### Storage

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/uploads/logo` | Admin | Multipart logo upload â†’ `public/uploads/branding/` |
| `DELETE` | `/api/uploads/logo` | Admin | Delete local logo file (path traversal protected) |

### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/appointment-notification` | Session | WhatsApp/SMS via Twilio; 503 if not configured |

### Data (generic)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/data/:table` | Session | CRUD on allowed tables; admin-only tables require `role='admin'` |

## 8. Data Model

Database: MariaDB 11.8 on Hostinger â€” `u791891216_careorbit`  
20 application tables + `password_reset_tokens`.

### Core tables

| Table | Purpose |
|---|---|
| `auth_users` | Email + bcrypt hash + `is_active` + `email_verified` |
| `profiles` | Full name, org, phone, `status`, `custom_role_label` |
| `user_roles` | `role` (app_role enum) + `custom_label` |
| `user_sessions` | HttpOnly session tokens, `last_activity_at`, `revoked_at` |
| `password_reset_tokens` | SHA-256 hashed reset tokens, 1-hour expiry, single-use |
| `patients` | MRN, demographics, notes, `created_by` |
| `appointments` | Patient + doctor + `scheduled_at` + status |
| `lab_orders` | Lab test orders linked to patients |
| `prescriptions` | Prescription records |
| `pharmacy_items` | Medicine inventory with SKU, batch, stock, GST |
| `pharmacy_invoice_items` | Line items for pharmacy bills |
| `dispensations` | Stock decrement events |
| `invoices` | Billing invoices with GST/CGST/SGST |
| `payments` | Payment records against invoices |
| `service_catalog` | Billable service codes and prices |
| `notifications` | In-app notification records |
| `notification_read_states` | Per-user read state for notifications |
| `import_batches` | Audit trail for all bulk imports |
| `audit_logs` | System audit log |
| `organization_settings` | Hospital name, logo, invoice prefix |
| `custom_role_templates` | Admin-defined custom role labels |
| `role_session_policies` | Per-role idle/absolute timeout config |

### `app_role` enum values

`admin` | `doctor` | `staff` | `custom`

All three admin tiers (super_admin / hospital_admin / plain admin) store `role='admin'` â€” distinguished by `custom_label`.

## 9. Technical Architecture

### 9.1 Frontend

- React 19 + TanStack Start + TanStack Router + TanStack Query
- Vite + TypeScript + Tailwind CSS v4
- Radix UI / Shadcn component structure, Lucide icons, Sonner toasts

### 9.2 Backend

- Node.js 20 + Express 5
- mysql2/promise connection pool
- bcryptjs (cost 12) for password hashing
- node:crypto `randomUUID()`, `createHash()`, `randomBytes()`
- Optional nodemailer for SMTP email delivery
- Optional Twilio for WhatsApp/SMS notifications

### 9.3 Local development

```powershell
# Terminal 1 â€” SSH tunnel to Hostinger MySQL
node scripts/db-tunnel.js

# Terminal 2 â€” Express API
node hostinger-api/src/server.js

# Terminal 3 â€” Vite frontend
npm run dev
```

The tunnel script (`scripts/db-tunnel.js`) has auto-reconnect with 10-second keepalive and 3-second retry â€” it will not drop silently.

### 9.4 Environment variables

```
# MySQL (required)
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3307
MYSQL_DATABASE=u791891216_careorbit
MYSQL_USER=u791891216_Careorbit_7071
MYSQL_PASSWORD=<password>

# SSH tunnel (required for local dev)
SSH_HOST=46.202.196.229
SSH_PORT=65002
SSH_USER=u791891216
TUNNEL_LOCAL_PORT=3307

# App URL (for password reset links)
APP_URL=http://localhost:8081

# SMTP (optional â€” password reset and staff invitation email)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Twilio (optional â€” appointment notifications)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
TWILIO_SMS_FROM=

# QA provisioning (optional)
QA_PROVISION_TOKEN=

# CORS (optional â€” comma-separated allowed origins)
CORS_ORIGINS=
```

### 9.5 Deployment

Frontend: build with `npm run build` â†’ deploy `dist/` as static files on Hostinger or any CDN.  
API: deploy `hostinger-api/` as a Node.js application on Hostinger.  
No Cloudflare Workers deployment is required (the original wrangler config remains for reference).

## 10. Security

- Passwords: bcrypt cost 12, never returned in any API response
- Sessions: HttpOnly, SameSite=Lax cookie (`careorbit_session`), 8-hour idle timeout, revoked on logout / password change / role change
- Rate limiting: login (20 req/min per IP + 10 req/min per email), signup (10 req/min), password reset (5 req/5 min)
- Role enforcement: server-side only â€” no client-controlled privilege escalation
- Privilege escalation on signup: `super_admin`, `hospital_admin`, `admin` explicitly blocked with HTTP 403
- Admin tables (`user_roles`, `profiles`, `user_sessions`, etc.): require DB role `admin` on `/api/data/:table`
- Storage: MIME type validation, 2 MB limit, path traversal prevention on delete
- Password reset: SHA-256 hashed tokens, 1-hour expiry, single-use, generic response (no email enumeration)
- SQL injection: parameterized queries throughout; column names validated against allowlists before interpolation

## 11. Key Files

| File | Purpose |
|---|---|
| `hostinger-api/src/server.js` | All Express routes, auth middleware, MySQL pool |
| `scripts/db-tunnel.js` | SSH tunnel with auto-reconnect |
| `src/integrations/supabase/client.ts` | Compatibility bridge â†’ MySQL |
| `src/lib/access-control.ts` | Role definitions, permissions, DB mappings |
| `src/hooks/use-auth.ts` | Session state hook |
| `src/hooks/use-role-access.ts` | Current user role + permissions |
| `src/routes/_authenticated.tsx` | Protected layout + pending-approval gate |
| `src/routes/_authenticated/access-control.tsx` | User approval + role assignment |
| `src/routes/_authenticated/billing.tsx` | Invoice management |
| `src/routes/_authenticated/pharmacy_.bill.tsx` | Pharmacy billing |
| `src/routes/_authenticated/pharmacy.tsx` | Pharmacy inventory + dispensing |
| `src/routes/_authenticated/imports.tsx` | Bulk imports + staff invitation |
| `src/routes/forgot-password.tsx` | Request password reset |
| `src/routes/reset-password.tsx` | Token-based password reset |
| `api/appointment-notification.ts` | Twilio WhatsApp/SMS handler (also registered as Express route) |
| `database/careorbit_add_password_reset_tokens.sql` | `password_reset_tokens` table migration |
| `database/careorbit_mysql_migration.sql` | Full MySQL schema |
| `database/20260911_careorbit_missing_data_migration.sql` | 15-record migration (NOT YET EXECUTED) |

## 12. Outstanding items

| Item | Status | Notes |
|---|---|---|
| 15-record Supabase â†’ MySQL data migration | **BLOCKED** | Requires verified Supabase backup first (see CAREORBIT_BACKUP_VERIFICATION_REPORT.md) |
| Supabase backup | **BLOCKED** | Database password required for pg_dump |
| Patient edit/delete UI | Not started | Schema supports it |
| Appointment edit/delete/status UI | Not started | Schema supports it |
| Multi-tenant RLS | Not started | All users currently see all patients/appointments |
| SMTP configuration | Not configured | Required for password reset email delivery |
| Twilio configuration | Not configured | Required for appointment notifications |
| Super Admin bootstrap UI | Not implemented | First SA must be created via `scripts/provision-qa-accounts.js` or direct DB |
| `client.server.ts` / `auth-middleware.ts` | Dead code | Never imported; safe to delete in a future cleanup |
