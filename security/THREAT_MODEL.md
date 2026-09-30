# CareOrbit Threat Model

## Scope

CareOrbit is a web-based hospital and clinic ERP/EMR application built with React, TanStack Start, Supabase Auth/Postgres, and Vercel/static hosting. It handles PHI, staff identity data, appointments, pharmacy, billing, lab, audit logs, imports, and session metadata.

## Assets

1. Supabase Auth identities and sessions.
2. PHI in patients, appointments, prescriptions, lab orders, invoices, payments, dispensations, and pharmacy stock.
3. Role and approval data in profiles and user_roles.
4. Service-role and deployment secrets.
5. Audit logs and import batches.
6. Client bundles and deployment headers.
7. User-owned notification read states and custom role templates.

## Entry Points

1. Public routes: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`.
2. Authenticated app routes under `/_authenticated/*`.
3. Supabase browser client calls to PostgREST/Auth.
4. Supabase edge function `invite-staff`.
5. Vercel/static HTTP surface and rewrite rules.
6. CSV/XLS import UI and import RPC functions.
7. Password reset and signup metadata.
8. Session revocation and role-approval workflows.

## STRIDE Summary

| Threat                 | Example                                           | Mitigation                                                                                  |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Spoofing               | Stolen browser token, forged session cookie       | Supabase SSR cookie storage, SameSite Strict, session table, revoke on password/role change |
| Tampering              | User edits role metadata at signup                | `handle_new_user()` ignores requested admin role and creates pending approval               |
| Repudiation            | Staff denies changing records                     | Existing audit trigger plus `user_sessions_audit`                                           |
| Information Disclosure | PHI exposed via broad RLS or cached auth response | Role-scoped RLS, `private, no-store`, security headers                                      |
| Denial of Service      | Credential stuffing or large imports              | Supabase Auth limits, Vercel firewall action still required, import row limits              |
| Elevation of Privilege | Client-side RBAC bypass or direct RPC call        | RLS policies, approval RPC, auth middleware for server functions                            |

## Security Assumptions

- Production testing is authorized for `https://janani-careorbit.vercel.app/`.
- Supabase service role key is server-only and not exposed to client bundles.
- Dashboard-only controls, including service-key rotation, Supabase Auth session controls, and Vercel WAF rules, require account access outside this repository.

## Out Of Scope

- Destructive production data mutation.
- Password brute force against real accounts.
- Social engineering, phishing, and physical security.
- Legal compliance certification for DPDP/ABDM/HIPAA.
