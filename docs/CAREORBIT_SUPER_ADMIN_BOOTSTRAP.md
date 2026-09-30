# CareOrbit — Super Admin Bootstrap

**File:** `scripts/bootstrap-superadmin.js`  
**Command:** `npm run bootstrap:superadmin`  
**Type:** CLI-only, one-time, server-side tool

---

## Why this exists

CareOrbit's role hierarchy requires an existing authenticated Super Admin to approve and promote other users. This creates a bootstrapping gap: in a fresh production deployment, there is no Super Admin, so no one can reach `/access-control` to create one through the UI.

The application intentionally blocks every other path:
- Public signup (`/signup`) rejects `super_admin`, `hospital_admin`, and `admin` role requests at both the UI and server levels.
- The staff invitation endpoint (`POST /api/admin/invite-staff`) only accepts the 6 non-privileged roles.
- The QA provisioning endpoint (`POST /api/auth/qa-provision`) only accepts `@careorbit.test` email addresses and is intended for automated test environments only.
- There is no unauthenticated HTTP endpoint that can create a privileged account.

This script is the **only supported production path** for creating the first Super Admin.

---

## What the script does

1. Connects to MySQL using the existing `MYSQL_*` environment variables.
2. Queries whether a Super Admin already exists.
3. If one exists: prints a message and exits without making any changes.
4. If none exists: interactively prompts for email, full name, organization, and password (with confirmation).
5. Validates all inputs using the same rules enforced by the API server.
6. Creates three rows in a single database transaction:
   - `auth_users` — email, bcrypt-hashed password (cost factor 12), `is_active=1`, `email_verified=1`
   - `profiles` — full name, organization, `status='active'`
   - `user_roles` — `role='admin'`, `custom_label='super_admin'`
7. All three rows share the same UUID.
8. On any failure: rolls back the transaction completely. No partial account is left behind.
9. After commit: runs four verification queries to confirm the account was created correctly.
10. Prints the email and name. Never prints the password, hash, or database credentials.

---

## How to run it

### Prerequisites

- Node.js 20+ with ES module support
- MySQL environment variables set (same variables used by the API server)
- Either via `.env` file in the project root, or exported in the shell

### Command

```bash
npm run bootstrap:superadmin
```

Or directly:

```bash
node scripts/bootstrap-superadmin.js
```

### Interactive session example

```
╔════════════════════════════════════════════════════════════╗
║          CareOrbit — First Super Admin Bootstrap           ║
╚════════════════════════════════════════════════════════════╝

No Super Admin exists yet. This wizard creates the first one.
This command is idempotent: running it again will safely abort.

  Email address: admin@yourhospital.com
  Full name:     Dr. Riya Mehta
  Organization:  City General Hospital

  Password requirements:
    • At least 10 characters
    • At least one uppercase letter
    • At least one lowercase letter
    • At least one number
    • At least one special character

  Password:      (hidden, not echoed)
  Confirm:       (hidden, not echoed)

  ─── Review ───────────────────────────────────────────────
  Email:        admin@yourhospital.com
  Name:         Dr. Riya Mehta
  Organization: City General Hospital
  Role:         Super Admin (role='admin', custom_label='super_admin')
  ──────────────────────────────────────────────────────────

  Create this Super Admin account? [yes/no]: yes

  Hashing password…
  Writing to database…
  Verifying…

╔════════════════════════════════════════════════════════════╗
║              Super Admin created successfully.             ║
╚════════════════════════════════════════════════════════════╝

  Email:  admin@yourhospital.com
  Name:   Dr. Riya Mehta

  Next steps:
  1. Sign in at /login with the email and password you entered.
  2. Visit /access-control to approve users and assign roles.
  3. Use /access-control to create Hospital Admins and Admins.
```

---

## Production usage

Run this once after deploying the application to a new environment. The command must be run from a machine that can reach the production MySQL server — either on the server itself, or from a workstation with a database tunnel active (`npm run db:tunnel`).

```bash
# Example: on the production server
cd /path/to/careorbit
export MYSQL_HOST=...
export MYSQL_DATABASE=...
export MYSQL_USER=...
export MYSQL_PASSWORD=...
npm run bootstrap:superadmin
```

Or if using a `.env` file:

```bash
npm run bootstrap:superadmin
```

The script loads `dotenv/config` automatically and reads from `.env` in the project root.

---

## Safety checks

| Check | Behavior |
|---|---|
| Super Admin already exists | Aborts immediately, no changes made |
| Email already registered | Rejects the email during input, prompts for another |
| Invalid email format | Rejects during input |
| Weak password | Rejects during input (same rules as the API) |
| Password confirmation mismatch | Rejects during input |
| User types "no" at confirmation | Aborts, no changes made |
| Ctrl-C during input | Exits cleanly, no changes made |
| MySQL transaction failure | Rolled back completely, error message printed, exits with code 1 |
| Post-commit verification fails | Error message printed with details, exits with code 1 |

---

## What happens if a Super Admin already exists

The script queries:

```sql
SELECT COUNT(*) AS existing
FROM user_roles
WHERE role = 'admin' AND custom_label = 'super_admin'
```

If `existing > 0`:

```
╔════════════════════════════════════════════════════════════╗
║         A Super Admin already exists in this database.     ║
║         No changes have been made.                         ║
╚════════════════════════════════════════════════════════════╝

To manage roles, log in as Super Admin and visit /access-control.
```

The script exits with code 0. No prompts are shown, no data is written.

---

## How to access `/access-control` after bootstrap

1. Sign in at `/login` using the email and password entered during bootstrap.
2. The sidebar shows "Access Control" (visible only to admin roles).
3. On `/access-control`, use the role buttons to approve pending users and assign roles:
   - **Hospital Admin** — click "Hospital Admin" on a user's row (Super Admin only)
   - **Admin** — click "Admin" on a user's row (Super Admin or Hospital Admin)
   - **Doctor, Staff, Nurse, etc.** — click the appropriate button (any admin role)

---

## Public signup cannot create privileged roles

The application enforces this at two layers:

**UI layer (`/signup`):**  
The role dropdown only offers: Staff, Doctor, Nurse, Pharmacist, Lab Technician, Billing Operator. The TypeScript type excludes `super_admin`, `hospital_admin`, and `admin`.

**Server layer (`POST /api/auth/signup`):**  
Any attempt to pass a privileged role in the request body (via any field: `role`, `requested_role`, `options.data.role`, `isAdmin`, `isSuperAdmin`, `permissions`) returns `403 Privileged role assignment not allowed on public signup`.

Nurse, Pharmacist, Lab Technician, and Billing Operator accounts created through public signup are placed in `pending_approval` status and require explicit approval via `/access-control` before they can log in.

---

## Database rows created

All three rows share the same UUID:

```sql
-- auth_users
INSERT INTO auth_users (id, email, password_hash, email_verified, is_active)
VALUES ('<uuid>', '<email>', '<bcrypt-hash>', 1, 1);

-- profiles
INSERT INTO profiles (id, email, full_name, organization, status)
VALUES ('<uuid>', '<email>', '<full_name>', '<organization>', 'active');

-- user_roles
INSERT INTO user_roles (id, user_id, role, custom_label)
VALUES ('<new-uuid>', '<uuid>', 'admin', 'super_admin');
```

---

## What is never logged or printed

- The plaintext password
- The bcrypt hash
- `MYSQL_PASSWORD`
- Any other environment variable value
- Session secrets or tokens

The `password` variable is set to `null` immediately after hashing completes.

---

## Files

| File | Purpose |
|---|---|
| `scripts/bootstrap-superadmin.js` | The bootstrap script |
| `package.json` | `"bootstrap:superadmin"` script entry |
| `docs/CAREORBIT_SUPER_ADMIN_BOOTSTRAP.md` | This document |

---

## Related

- `docs/CAREORBIT_STEP2_SIDEBAR_AUDIT.md` — role visibility in navigation
- `/access-control` route — ongoing role management UI
- `scripts/provision-qa-accounts.js` — QA environment account seeding (test only)
- `hostinger-api/src/server.js` — `POST /api/admin/approve-user` — the API-layer role assignment used after bootstrap
