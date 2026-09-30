# Patch Summary

## Applied

- Installed `@supabase/ssr` and replaced explicit Supabase auth localStorage with cookie-aware browser and server clients.
- Added authenticated server middleware and role guard helpers.
- Added global origin-check middleware and `private, no-store` response handling.
- Removed admin-tier self-service signup roles and aligned signup password validation to the shared 10-character policy.
- Added `20260708190000_security_remediation.sql` for pending approvals, role approval RPC, RLS hardening, session policies, session audit triggers, notification read states, and custom role templates.
- Added an active sessions Security page with session revocation.
- Removed `dangerouslySetInnerHTML` from chart styling.
- Restricted CORS in `invite-staff`.
- Added enforced Vercel security headers, HSTS, and no-store caching.
- Added gitleaks CI scanning.
- Added repeatable HTTP/HEAD and Playwright security tests.

## External Controls Still Required

- Rotate the Supabase service-role key in the Supabase dashboard.
- Apply the new Supabase migration to the live database.
- Configure Supabase Auth session controls where plan-supported.
- Configure Vercel Firewall rate limiting for `/login`.
