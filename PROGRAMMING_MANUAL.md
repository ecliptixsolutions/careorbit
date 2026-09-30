# CareOrbit Programming Manual

Last updated: 2026-05-20

## 1. Purpose

This manual explains how the CareOrbit application is structured, how to run it locally, how to build and deploy it, and how the main frontend, authentication, database, and security pieces fit together.

The project is a TanStack Start healthcare ERP application deployed to Cloudflare Workers with Supabase as the backend.

## 2. Technology Stack

| Area                  | Technology                                     |
| --------------------- | ---------------------------------------------- |
| Runtime framework     | TanStack Start                                 |
| UI library            | React 19                                       |
| Routing               | TanStack Router                                |
| Data fetching/cache   | TanStack Query                                 |
| Build tool            | Vite                                           |
| Styling               | Tailwind CSS 4 with CSS variables              |
| UI primitives         | Radix UI                                       |
| Icons                 | lucide-react                                   |
| Forms                 | React state, browser validation, zod available |
| Notifications         | sonner                                         |
| Backend/auth/database | Supabase                                       |
| Deployment            | Cloudflare Workers via Wrangler                |
| TypeScript            | TypeScript 5                                   |

## 3. Project Directory

Project root:

```text
C:\Users\ACPL\Desktop\codex data\erp\supabase-studio-main\supabase-studio-main
```

Important files and directories:

```text
src/
  assets/
    hero-doctor.jpg
  components/
    app-shell.tsx
    site-header.tsx
    ui/
  hooks/
    use-auth.ts
    use-mobile.tsx
    use-role-access.ts
  integrations/
    supabase/
      client.ts
      client.server.ts
      auth-middleware.ts
      types.ts
    lovable/
      index.ts
  lib/
    error-capture.ts
    error-page.ts
    utils.ts
  routes/
    __root.tsx
    index.tsx
    login.tsx
    signup.tsx
    _authenticated.tsx
    _authenticated/
      dashboard.tsx
      patients.tsx
      appointments.tsx
  router.tsx
  server.ts
  start.ts
  styles.css
supabase/
  config.toml
  migrations/
package.json
vite.config.ts
wrangler.jsonc
PROJECT_SPECIFICATION.md
USER_MANUAL.md
PROGRAMMING_MANUAL.md
```

## 4. Application Architecture

CareOrbit is split into public and authenticated surfaces.

Public routes:

| Route     | File                    | Purpose                               |
| --------- | ----------------------- | ------------------------------------- |
| `/`       | `src/routes/index.tsx`  | Marketing landing page.               |
| `/login`  | `src/routes/login.tsx`  | Email/password login.                 |
| `/signup` | `src/routes/signup.tsx` | Account creation with role selection. |

Authenticated routes:

| Route           | File                                         | Purpose                            |
| --------------- | -------------------------------------------- | ---------------------------------- |
| `/dashboard`    | `src/routes/_authenticated/dashboard.tsx`    | Operational dashboard.             |
| `/patients`     | `src/routes/_authenticated/patients.tsx`     | Patient list, search, add patient. |
| `/appointments` | `src/routes/_authenticated/appointments.tsx` | Appointment list and scheduling.   |

The `_authenticated` layout protects authenticated routes by checking the current Supabase session through `useAuth()`.

Role-aware UI context is provided by:

```text
src/hooks/use-role-access.ts
```

This hook loads the signed-in user's profile and role records, selects the primary role, maps it to UI permissions, and returns role copy used by the shell, dashboard, patients page, and appointments page.

## 5. Environment Variables

The Supabase client expects these values:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

For server-side rendering fallback, the client also checks:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Do not commit real secrets into documentation. Keep environment values in `.env`, Cloudflare variables, or the deployment provider's secret management.

## 6. Local Development

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Common local URL:

```text
http://localhost:5174
```

If another Vite server is already using the default port, Vite may choose another available port. Use the terminal output as the source of truth.

## 7. Build

Production build:

```bash
npm run build
```

The build creates a Cloudflare-compatible output under:

```text
dist/
```

Important note for this machine: the default Node version may be too old for current Wrangler. Use Node 22 or newer. In previous deployment, bundled Node 24 was used successfully:

```text
C:\Users\ACPL\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
```

## 8. Deployment

Current Cloudflare Worker test deployment:

```text
https://oehealth-erp-test.sharefile740-ludo.workers.dev
```

Wrangler config in source:

```text
wrangler.jsonc
```

Generated deployment config used by the build:

```text
dist/server/wrangler.json
```

Deploy command pattern:

```bash
wrangler deploy --config ./dist/server/wrangler.json --name oehealth-erp-test
```

After deployment, verify:

- Home route returns HTTP 200.
- `/login` returns HTTP 200.
- `/signup` returns HTTP 200.
- Page title contains CareOrbit.
- Old branding does not appear in rendered HTML.

## 9. Package Scripts

From `package.json`:

| Script      | Command                         | Purpose                         |
| ----------- | ------------------------------- | ------------------------------- |
| `dev`       | `vite dev`                      | Start local development server. |
| `build`     | `vite build`                    | Create production build.        |
| `build:dev` | `vite build --mode development` | Development-mode build.         |
| `preview`   | `vite preview`                  | Preview build locally.          |
| `lint`      | `eslint .`                      | Run linting.                    |
| `format`    | `prettier --write .`            | Format project files.           |

## 10. Routing

Routing is file based through TanStack Router.

The root route is:

```text
src/routes/__root.tsx
```

Responsibilities:

- Defines HTML shell.
- Loads global CSS.
- Sets page metadata.
- Wraps the application with `QueryClientProvider`.
- Mounts the Sonner toaster.
- Defines not-found and error UI.

Authenticated layout:

```text
src/routes/_authenticated.tsx
```

Responsibilities:

- Reads auth state using `useAuth`.
- Redirects unauthenticated users to `/login`.
- Shows loading state while session is being checked.
- Wraps protected screens with `AppShell`.

Generated route tree:

```text
src/routeTree.gen.ts
```

This file is generated by TanStack tooling. Do not edit it manually.

## 11. Authentication Flow

Supabase client:

```text
src/integrations/supabase/client.ts
```

Auth hook:

```text
src/hooks/use-auth.ts
```

The auth hook:

- Subscribes to Supabase auth state changes.
- Reads the current session using `supabase.auth.getSession()`.
- Returns `session`, `user`, and `loading`.

Login page:

```text
src/routes/login.tsx
```

Login function:

```ts
supabase.auth.signInWithPassword({ email, password });
```

Signup page:

```text
src/routes/signup.tsx
```

Signup function:

```ts
supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      full_name,
      organization,
      role,
      custom_role_label,
    },
  },
});
```

Removed from current user-facing auth:

- Google login button.
- OTP login.
- Email verification wording.

There is still a Lovable integration file that references OAuth helper logic:

```text
src/integrations/lovable/index.ts
```

It is not part of the current login/signup UI. If OAuth is permanently removed, review this integration during cleanup.

## 12. Signup Role Handling

Signup supports:

- `admin`.
- `doctor`.
- `staff`.
- `custom`.

The selected role is sent in user metadata:

```ts
data: {
  role,
  custom_role_label: role === "custom" ? customLabel : null,
}
```

The database trigger `handle_new_user()` reads this metadata and creates:

- A `profiles` record.
- A `user_roles` record.

The frontend reads those records through `useRoleAccess()`.

Current role priority:

```text
admin -> doctor -> staff -> custom
```

Current UI permission mapping keeps the core workflow available to all roles because the backend RLS permits the shared patient and appointment workflow for authenticated Admin, Doctor, Staff, and Custom users. Admin receives additional delete/manage rights in the UI model for screens that are added later.

## 13. Password Validation

Password validation is implemented in:

```text
src/routes/signup.tsx
```

Rules:

- At least 8 characters.
- One uppercase letter.
- One lowercase letter.
- One number.
- One special character.

Signup submission is blocked when the password is weak.

Suggested password generation uses browser crypto:

```ts
crypto.getRandomValues(values);
```

The generated password includes required character classes and shuffled additional characters.

## 14. Application Shell

File:

```text
src/components/app-shell.tsx
```

Responsibilities:

- Desktop sidebar.
- Mobile header.
- Mobile nav tabs.
- CareOrbit brand.
- Main navigation.
- Role badge and access description.
- Sign out action.

Current navigation items:

- Overview -> `/dashboard`
- Patients -> `/patients`
- Appointments -> `/appointments`

The shell filters navigation through the permission flags returned by `useRoleAccess()`. In the current release all roles can see the same core navigation because they all have the same core screen rights.

## 15. Landing Page

File:

```text
src/routes/index.tsx
```

Major arrays:

- `features`
- `stats`
- `whyChoose`

Major sections:

- Hero.
- Features.
- Why Choose Us.
- Contact CTA.
- Footer.

Header component:

```text
src/components/site-header.tsx
```

Branding and theme are controlled mostly by:

```text
src/styles.css
```

## 16. Dashboard Module

File:

```text
src/routes/_authenticated/dashboard.tsx
```

The dashboard uses TanStack Query and Supabase count queries.

Statistics:

- Patient count.
- Appointment count.
- Today's appointment count.
- Static active module count.

Profile lookup:

```ts
supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
```

## 17. Patients Module

File:

```text
src/routes/_authenticated/patients.tsx
```

Main features:

- Load patients from Supabase.
- Search by name, MRN, doctor name, or guardian emergency contact.
- Create patient.
- Display patient table.
- Capture doctor name in the add-patient form.

Patient fetch:

```ts
supabase.from("patients").select("*").order("created_at", { ascending: false });
```

Patient insert:

```ts
supabase.from("patients").insert({ ...form, created_by: user.id });
```

Guardian emergency contact behavior:

- Form captures `emergency_contact_number`.
- Before saving, it is merged into `notes`.
- Display logic extracts it using a regular expression.

Prefix:

```text
Guardian emergency contact:
```

Doctor name behavior:

- Form captures `doctor_name`.
- Before saving, it is merged into `notes`.
- Display logic extracts it using a regular expression.
- Search checks the extracted doctor name.

Prefix:

```text
Assigned doctor:
```

No database schema change is required for this release because the doctor name is stored as structured patient notes. If doctor assignment needs reporting, filtering, or doctor relation joins later, migrate this into a dedicated nullable database column or a doctor assignment table.

Important types:

```ts
type PatientRow = Tables<"patients">;
type PatientFormValues = { ... };
type PatientCreatePayload = ...;
```

## 18. Appointments Module

File:

```text
src/routes/_authenticated/appointments.tsx
```

Main features:

- Load appointments.
- Join appointment rows with patient name and MRN.
- Load patient options.
- Create appointment.
- Show appointment status badge.

Appointment fetch:

```ts
supabase
  .from("appointments")
  .select("*, patients(full_name, mrn)")
  .order("scheduled_at", { ascending: true });
```

Patient options fetch:

```ts
supabase.from("patients").select("id, full_name, mrn").order("full_name");
```

Appointment insert:

```ts
supabase.from("appointments").insert({
  ...form,
  doctor_id: user.id,
  created_by: user.id,
});
```

Appointment status enum:

- scheduled.
- confirmed.
- completed.
- cancelled.
- no_show.

Current limitation: status updates are not exposed in the UI.

## 19. Database Schema

Main migration:

```text
supabase/migrations/20260508163603_14ab6362-a493-4348-a89a-4658d052f258.sql
```

Security hardening migration:

```text
supabase/migrations/20260508163631_c6817d6a-793a-49a2-932e-ab12ad829c29.sql
```

Policy update migration:

```text
supabase/migrations/20260508163705_228cfa22-f3bd-4364-87bd-aa25a55735ac.sql
```

### Enums

```sql
app_role:
  admin
  doctor
  staff
  custom
```

```sql
appointment_status:
  scheduled
  confirmed
  completed
  cancelled
  no_show
```

### Tables

`profiles`:

- `id`
- `full_name`
- `phone`
- `organization`
- `custom_role_label`
- `avatar_url`
- `created_at`
- `updated_at`

`user_roles`:

- `id`
- `user_id`
- `role`
- `custom_label`
- `created_at`

`patients`:

- `id`
- `mrn`
- `full_name`
- `date_of_birth`
- `gender`
- `phone`
- `email`
- `address`
- `blood_group`
- `allergies`
- `notes`
- `created_by`
- `created_at`
- `updated_at`

Structured patient notes currently store:

- `Guardian emergency contact: <number>`
- `Assigned doctor: <doctor name>`

`appointments`:

- `id`
- `patient_id`
- `doctor_id`
- `scheduled_at`
- `duration_minutes`
- `reason`
- `status`
- `notes`
- `created_by`
- `created_at`
- `updated_at`

## 20. Row Level Security

RLS is enabled on:

- `profiles`.
- `user_roles`.
- `patients`.
- `appointments`.

Current policies:

Profiles:

- Authenticated users can view profiles.
- Users can update their own profile.
- Users can insert their own profile.

User roles:

- Users can view their own roles.
- Admins can view all roles.
- Admins can manage roles.

Patients:

- Authenticated users can view patients.
- Authenticated users can insert patients when `created_by = auth.uid()`.
- Authenticated users with app role admin, doctor, staff, or custom can update patients.
- Admins can delete patients.

Appointments:

- Authenticated users can view appointments.
- Authenticated users can insert appointments when `created_by = auth.uid()`.
- Authenticated users with app role admin, doctor, staff, or custom can update appointments.
- Admins can delete appointments.

Important security note: current select policies allow all authenticated users to view all patients and appointments. For multi-facility or tenant-separated production use, add organization/facility scoping before launch.

## 21. Database Functions and Triggers

Function:

```sql
public.has_role(_user_id uuid, _role app_role)
```

Purpose:

- Used by RLS policies to check user role.

Function:

```sql
public.handle_updated_at()
```

Purpose:

- Updates `updated_at` on modified rows.

Function:

```sql
public.handle_new_user()
```

Purpose:

- Runs after Supabase Auth user creation.
- Creates profile.
- Creates user role.

Trigger:

```sql
on_auth_user_created
```

Runs:

```sql
after insert on auth.users
```

## 22. Generated Supabase Types

File:

```text
src/integrations/supabase/types.ts
```

Use these helpers:

```ts
Tables<"patients">;
TablesInsert<"patients">;
Tables<"appointments">;
TablesInsert<"appointments">;
```

Do not manually hand-write duplicated table types unless there is a strong reason.

## 23. Styling and Theme

Global styling file:

```text
src/styles.css
```

The theme uses CSS variables and Tailwind 4.

Important theme tokens:

- `--background`
- `--foreground`
- `--card`
- `--primary`
- `--brand-red`
- `--brand-blue`
- `--gradient-hero`
- `--gradient-brand`
- `--gradient-card`
- `--sidebar`

Reusable utility classes:

- `bg-gradient-hero`
- `bg-gradient-brand`
- `bg-gradient-card`
- `text-gradient-brand`
- `shadow-glow`
- `shadow-elegant`

The current visual direction is a dark blue/purple Ecliptix-inspired healthcare technology theme.

## 24. UI Components

Shared UI components live in:

```text
src/components/ui/
```

These are mostly Radix UI-based shadcn-style components.

Common components used by feature screens:

- `Button`
- `Input`
- `Label`
- `Textarea`
- `Dialog`
- `Select`
- `Badge`

Keep feature code simple and reuse existing UI primitives.

## 25. Error Handling

Route-level error UI is implemented in:

```text
src/routes/__root.tsx
```

The error page:

- Logs the error to console.
- Displays message.
- Provides `Try again`.
- Provides `Home`.

Supabase mutation errors are shown using Sonner toast messages.

## 26. Coding Standards

Follow existing project style:

- TypeScript.
- React function components.
- TanStack Router file routes.
- TanStack Query for Supabase reads and cache invalidation.
- Supabase client for data operations.
- Use existing UI components.
- Use `lucide-react` icons.
- Use CSS variables and theme utility classes.
- Keep edits scoped to the requested feature.

Avoid:

- Direct DOM manipulation.
- Duplicate route guards.
- Hard-coded secrets.
- Manual edits to generated route tree.
- Unscoped database reads for new tenant-specific modules.

## 27. Adding a New Authenticated Page

1. Create a file under:

```text
src/routes/_authenticated/
```

Example:

```text
src/routes/_authenticated/billing.tsx
```

2. Define a file route:

```ts
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});

function BillingPage() {
  return <div>Billing</div>;
}
```

3. Add navigation to:

```text
src/components/app-shell.tsx
```

4. Add any database tables and RLS policies in a Supabase migration.

5. Add typed data access using generated Supabase types.

6. Build and test.

## 28. Adding a New Database Table

Recommended process:

1. Create a Supabase migration under `supabase/migrations`.
2. Create table with `created_at` and `updated_at` when useful.
3. Enable RLS.
4. Add policies for select, insert, update, and delete.
5. Add indexes for common filters and joins.
6. Add updated-at trigger if mutable.
7. Regenerate Supabase types if using Supabase CLI.
8. Implement UI route or component.
9. Test with multiple roles.

Security checklist for new tables:

- Does every policy include tenant or facility scope where needed?
- Can users only insert records they own or are allowed to create?
- Can users update records outside their authority?
- Are delete policies restricted?
- Are joins leaking data through broad select policies?

## 29. Testing Checklist

Run before deployment:

```bash
npm run build
```

Recommended checks:

- Landing page loads.
- `/login` loads.
- `/signup` loads.
- Signup password validation works.
- Login works with a valid account.
- Protected route redirects to login when signed out.
- Dashboard loads when signed in.
- Patient creation works.
- Patient creation captures doctor name.
- Patient search works.
- Patient search works by doctor name.
- Role badge appears in authenticated shell.
- Dashboard role-wise access panel renders.
- Appointment creation works after patient exists.
- Appointment button is disabled when no patients exist.
- Sign out works.
- Mobile navigation works.
- Desktop sidebar works.

For code quality:

```bash
npm run lint
```

If lint rules are noisy due generated files, review the ESLint config before suppressing warnings.

## 30. Security Testing Checklist

Perform controlled defensive testing:

- Invalid login credentials.
- Weak signup passwords.
- Attempt protected route access while logged out.
- Attempt patient insert without authenticated session.
- Attempt appointment insert without authenticated session.
- Attempt delete as non-admin through backend/API test.
- Verify RLS blocks unauthorized writes.
- Test XSS payloads in text fields and confirm output is escaped.
- Test very long input values and confirm UI remains stable.
- Confirm Supabase errors do not expose secrets.
- Confirm no service role key is bundled into client assets.

Important: do not run destructive security tests against production data.

## 31. Performance Considerations

Current screens load full patient and appointment lists.

For small clinics this is acceptable. For larger facilities, implement:

- Server-side pagination.
- Search queries at database level.
- Date filtering for appointments.
- Indexes on frequently searched columns.
- Virtualized tables for large row counts.
- Facility/tenant-scoped queries.

Potential indexes for future growth:

```sql
create index on public.patients (created_at desc);
create index on public.patients (full_name);
create index on public.appointments (scheduled_at);
create index on public.appointments (patient_id);
create index on public.appointments (doctor_id);
```

## 32. Known Current Limitations

Functional:

- No patient edit/delete UI.
- No appointment edit/delete/status update UI.
- No admin user management screen.
- No role-specific dashboards.
- No separate role-specific dashboard layouts.
- No facility/tenant model in current UI.
- No lab, pharmacy, billing, inventory, surgery, radiology, telemedicine, or AI workflow screens beyond marketing content.

Security/architecture:

- All authenticated users can currently view all patients and appointments.
- Custom roles do not yet have granular permission differences.
- Guardian contact is stored inside `notes` rather than a dedicated database column.
- Assigned doctor name is stored inside `notes` rather than a dedicated database column.

Deployment:

- Worker name still uses the test name `oehealth-erp-test`.
- Public product branding is CareOrbit.

## 33. Recommended Roadmap

Short term:

- Add dedicated `emergency_contact_number` column to `patients`.
- Add patient edit and detail page.
- Add appointment status update actions.
- Add role-based navigation visibility.
- Add admin user management.
- Add form validation with zod schemas.

Medium term:

- Add facility/organization table.
- Add tenant-scoped RLS.
- Add doctor assignment.
- Add calendar view.
- Add audit logging.
- Add import/export.

Long term:

- Add pharmacy module.
- Add lab module.
- Add billing module.
- Add inventory module.
- Add radiology/DICOM module.
- Add telemedicine module.
- Add AI consultation assistant.

## 34. Troubleshooting

### Build Fails Because of Node Version

Symptom:

```text
Wrangler requires at least Node.js v22.0.0
```

Fix:

- Use Node 22 or newer.
- On this machine, bundled Node 24 has been used successfully.

### Supabase Environment Error

Symptom:

```text
Missing Supabase environment variable(s)
```

Fix:

- Confirm `VITE_SUPABASE_URL`.
- Confirm `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Confirm Cloudflare deployment variables if SSR requires server-side values.

### Protected Page Keeps Redirecting to Login

Likely causes:

- No active Supabase session.
- Local storage cleared.
- Auth token expired.
- Supabase URL/key mismatch between environments.

Fix:

- Sign in again.
- Confirm the environment variables target the correct Supabase project.

### Signup Creates Account But Does Not Open Dashboard

Likely causes:

- Supabase email confirmation setting requires confirmation.
- Automatic sign-in was not allowed.

Fix:

- Current UI falls back to login page.
- For immediate login after signup, configure Supabase email confirmation according to project requirements.

### Appointment Button Disabled

Reason:

- No patient records exist.

Fix:

- Create a patient first.

## 35. Release Procedure

1. Confirm requirements.
2. Make code changes.
3. Run build.
4. Test key workflows locally.
5. Deploy to Cloudflare test Worker.
6. Verify live routes.
7. Check branding.
8. Record Cloudflare version ID.
9. Share live URL and verification summary.

Minimum live verification:

```text
/
/login
/signup
```

Expected:

- HTTP 200.
- CareOrbit title.
- No old visible branding.

## 36. Latest Role/Admin Implementation

This release adds role-wise UI, pending user approval, patient history lookup, module visibility, and admin role assignment without requiring an immediate live Supabase enum migration.

### Files Added

```text
src/lib/access-control.ts
src/routes/_authenticated/access-control.tsx
src/routes/_authenticated/modules.tsx
src/routes/_authenticated/patient-history.tsx
```

### Files Updated

```text
src/hooks/use-role-access.ts
src/routes/signup.tsx
src/routes/_authenticated.tsx
src/components/app-shell.tsx
src/routes/_authenticated/dashboard.tsx
src/routes/_authenticated/patients.tsx
```

### Role Storage Strategy

The existing Supabase enum supports:

```text
admin
doctor
staff
custom
```

To avoid breaking live signup before database migrations are applied, extended roles are mapped onto existing safe database roles:

| UI role          | Stored database role | Stored custom label  |
| ---------------- | -------------------- | -------------------- |
| Super Admin      | `admin`              | `super_admin`        |
| Hospital Admin   | `admin`              | `hospital_admin`     |
| Admin            | `admin`              | `null`               |
| Doctor           | `doctor`             | `null`               |
| Staff            | `staff`              | `null`               |
| Nurse            | `custom`             | `nurse`              |
| Pharmacist       | `custom`             | `pharmacist`         |
| Lab Technician   | `custom`             | `lab_technician`     |
| Billing Operator | `custom`             | `billing_operator`   |
| Pending request  | `custom`             | `pending:<role_key>` |

This keeps compatibility with the current `app_role` enum while still enabling role-wise UI and admin approvals.

### Permission Matrix

Permission definitions live in:

```text
src/lib/access-control.ts
```

Main exported items:

```ts
roleDefinitions;
signupRoleOptions;
assignableRoleKeys;
moduleDefinitions;
databaseRoleFor();
pendingDatabaseRoleFor();
roleFromRow();
pickPrimaryRole();
```

Each role has a `permissions` object that controls navigation and page actions:

- Dashboard.
- Patients.
- Patient creation.
- Patient history.
- Appointments.
- Appointment scheduling.
- Modules.
- User management.
- User approval.
- Role management.
- Module-specific rights.

### Signup Approval Flow

Signup now stores every new role request as pending:

```ts
role: "custom";
custom_role_label: "pending:<requested_role>";
```

The authenticated layout checks `useRoleAccess()`. If the user's primary role resolves to `pending`, the app renders a waiting-for-approval screen instead of the authenticated shell.

### Access Control Screen

Route:

```text
/access-control
```

File:

```text
src/routes/_authenticated/access-control.tsx
```

Functions:

- Reads all profiles.
- Reads all user roles.
- Shows pending users.
- Allows admins to assign built-in roles.
- Allows one Super Admin assignment from the UI.
- Allows creation of local custom role templates.
- Shows a role rights matrix.

Backend note:

- Existing RLS allows users with database role `admin` to manage `user_roles`.
- Super Admin and Hospital Admin are stored as `admin` plus a custom label, so they retain backend admin role-management capability.
- Custom role templates are currently frontend templates stored in `localStorage`; production-grade dynamic roles should use a dedicated database table.

### Patient History Screen

Route:

```text
/patient-history
```

File:

```text
src/routes/_authenticated/patient-history.tsx
```

Search supports:

- Patient phone number.
- Guardian emergency contact number.
- MRN.
- Patient name.

Data shown:

- Patient details.
- Guardian contact.
- Assigned doctor.
- Blood group.
- Related appointments.
- Problem/disease briefs.
- Appointment statuses.

### Modules Screen

Route:

```text
/modules
```

File:

```text
src/routes/_authenticated/modules.tsx
```

The modules screen lists all advertised ERP modules:

- Patient Management.
- IPD / OPD Management.
- Medical Staff Management.
- Quick Consultations.
- AI & Voice Consultation.
- Lab Management.
- Pharmacy.
- Billing & Accounting.
- Inventory Management.
- Surgery.
- Radiology & DICOM Viewer.
- Telemedicine.

The module permission key determines whether each card shows `Allowed` or `Restricted`.

### Production Database Recommendation

For production-grade role creation and approval, add dedicated tables:

```sql
create table public.role_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  permissions jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.user_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null,
  status text not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
```

Recommended enforcement:

- Add RLS so only Super Admin, Hospital Admin, or Admin can approve.
- Add a unique partial index so only one Super Admin can exist.
- Move role-template creation from `localStorage` to `role_templates`.
- Apply tenant/hospital scoping before production multi-hospital use.

### Current Limitation

This deployment implements role-wise UI, user approval workflow, and role assignment using the current live schema. It does not yet apply the recommended Supabase migration automatically, because Cloudflare Worker deployment does not push Supabase schema changes.

## 37. Smart Queue, EMR, and Automation Implementation

### New Routes

Added authenticated routes:

```text
src/routes/_authenticated/queue.tsx
src/routes/_authenticated/automations.tsx
src/routes/_authenticated/emr-timeline.tsx
```

Updated routes:

```text
src/routes/_authenticated/appointments.tsx
src/routes/_authenticated/dashboard.tsx
src/routes/_authenticated/modules.tsx
src/components/app-shell.tsx
src/lib/access-control.ts
```

### Appointment Workflow Metadata

New helper:

```text
src/lib/appointment-workflow.ts
```

The current database does not have separate queue, doctor-name, prescription, lab-report, and automation tables. To avoid breaking live deployment, workflow metadata is stored inside `appointments.notes` using stable labels:

- `Doctor name`
- `Queue token`
- `Check-in method`
- `Checked in at`
- `Prescription PDF`
- `Lab report`
- `Medicine reminder`
- `Follow-up plan`

Helper functions parse, strip, and rebuild these note lines so normal clinical notes remain readable.

### New Permission Keys

Added role rights:

```text
canViewQueue
canManageQueue
canViewEmrTimeline
canManageAutomations
canAccessFacialCheckIn
```

These rights control navigation visibility and page-level restricted states.

### Queue Logic

The queue screen reads today's appointments from Supabase and derives:

- Token number.
- Predicted start time.
- Predicted waiting time.
- QR check-in URL.
- Check-in status.

Waiting-time prediction is deterministic and frontend-derived:

```text
predicted start = max(scheduled time, previous predicted finish)
predicted wait = predicted start - current time
predicted finish = predicted start + duration_minutes
```

Check-in updates the appointment status to `confirmed` and stores check-in metadata in `appointments.notes`.

### WhatsApp and Follow-Up Automation

The automation route derives CRM tasks from appointments:

- Upcoming appointments within 24 hours become appointment reminder tasks.
- Past scheduled/confirmed/no-show appointments become missed recovery tasks.
- Completed appointments create follow-up and prescription tasks.
- Lab and medicine message tasks are generated from workflow status.

WhatsApp links use:

```text
https://wa.me/<phone>?text=<encoded message>
```

Production auto-send requires:

- WhatsApp Business API provider.
- Secure server-side provider token.
- Webhook handler.
- Scheduled reminder worker.
- Message delivery log table.

### Smart EMR Timeline

The EMR timeline combines:

- `patients`
- `appointments`
- workflow metadata from `appointments.notes`

It renders derived timeline entries for:

- Patient profile creation.
- Visit.
- Diagnosis/problem brief.
- Prescription status.
- Lab/radiology report status.
- Billing context.
- Vitals placeholder.

For production, add database tables for prescriptions, reports, invoices, vitals, and diagnoses instead of deriving placeholders from appointment data.

### Role-Based Dashboards

The dashboard now selects widget groups from the resolved `roleKey` returned by `useRoleAccess()`:

- Super Admin.
- Hospital Admin.
- Admin.
- Doctor.
- Staff/Reception.
- Nurse.
- Pharmacist.
- Lab Technician.
- Billing Operator.
- Custom.

Navigation remains permission-driven, not hardcoded by role name.
