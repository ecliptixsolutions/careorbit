# CareOrbit Web Security Remediation And Test Report

Date: July 8, 2026

## Target

- Application: CareOrbit
- Production URL: `https://janani-careorbit.vercel.app/`
- Local test URL: `http://127.0.0.1:4173`
- Data sensitivity: PHI, identity data, appointments, billing, pharmacy, audit/session metadata

## Work Completed

- Implemented repository-side remediation for token storage, signup privilege escalation, CORS, headers, RLS, CSRF-style origin checks, session tracking, notification read state, custom role templates, chart XSS risk, generic root errors, and secret scanning.
- Added `@supabase/ssr` and cookie-aware Supabase browser/server clients.
- Added `20260708190000_security_remediation.sql` for pending approvals, role approval RPC, RLS fixes, session policies, session revocation triggers, audit logging, notification read states, and role templates.
- Added a Security / active sessions page.
- Added repeatable HTTP/HEAD security testing and Playwright browser security tests.
- Downloaded reference tooling into `.security-tools/`: OWASP CRS and the corrected public Defending Code reference harness repo.

## Local Verification

All local verification passed on July 8, 2026:

- `npx vite build --config vite.hostinger.config.ts`: PASS
- `npm run build`: PASS
- `npm test`: PASS, 16 tests
- `npm run lint`: PASS with 6 existing Fast Refresh warnings only
- `npm audit --audit-level=high`: PASS, 0 vulnerabilities
- Client bundle service-role scan: PASS, `clean`
- `python tests/security_assessment.py --target http://127.0.0.1:4173 --mode local`: PASS, 0 failures
- `npx playwright test`: PASS locally, 2 passed and 1 production-header test skipped as expected

## Deployment Status

GitHub push succeeded:

- Branch: `main`
- Pushed branch includes the remediation commits and this final report on `main`.

Direct Vercel deployment was blocked:

- `vercel whoami`: `Not authorized`
- `vercel deploy --prod --yes`: failed because the CLI could not retrieve project settings from the existing `.vercel` link.
- The provided Vercel token is valid for `ecliptix-solutions-projects`, but it is not authorized for the linked project org `team_ciY5gwuIJQVytlt8Il5dctQr`.

Alternate deployment succeeded under the Vercel team available to the provided token:

- Alternate live URL: `https://careorbit-vercel-clean.vercel.app`
- HTTP security scanner: PASS, 16 passed and 0 failed.
- Playwright browser security tests: PASS, 3 passed and 0 failed.

Production still serves an older July 6 deployment:

- Production `Last-Modified`: `Mon, 06 Jul 2026 10:32:22 GMT`
- Production bundle: `/assets/index-CmkA698T.js`
- Expected new deployment was not visible during retest, including a follow-up HEAD check after pushing `f5e947b`.

## Production Retest Result

The production URL is reachable, but it has not deployed this remediation yet.

Failing live controls:

- `Access-Control-Allow-Origin: *` is still present on production.
- The deployed signup page still offers `Hospital Admin`, `Admin`, and `Super Admin`, confirming production is not serving the remediated build.
- `Content-Security-Policy` is missing.
- `X-Content-Type-Options` is missing.
- `X-Frame-Options` is missing.
- `Referrer-Policy` is missing.
- `Permissions-Policy` is missing.
- `Cache-Control` is still `public, max-age=0, must-revalidate`.

Passing live checks:

- Root page returns 200 and loads the CareOrbit shell.
- HEAD request returns 200.
- HSTS is present.
- Sensitive-path probes did not leak service role keys, private keys, or database URLs.
- Reflected XSS payload was not reflected raw.

Live retest commands run after the GitHub push:

- `python tests/security_assessment.py --target https://janani-careorbit.vercel.app --mode deployed`: FAIL, 9 passed and 7 failed.
- `TARGET_URL=https://janani-careorbit.vercel.app EXPECT_SECURITY_HEADERS=1 npx playwright test`: FAIL, 1 passed and 2 failed because production still serves the old signup roles and missing headers.

## Required External Actions

1. Provide a Vercel token or browser session authorized for the linked `janani-careorbit` project, then deploy the latest `main` commit to production.
2. Apply `supabase/migrations/20260708190000_security_remediation.sql` to the live Supabase project.
3. Redeploy the `invite-staff` Supabase edge function.
4. Rotate the Supabase service-role key in the Supabase dashboard and update only server-side deployment secrets.
5. Configure Vercel Firewall rate limiting for `/login`.
6. Configure Supabase Auth session controls/rate limits where the current plan supports them.
7. Re-run:
   - `python tests/security_assessment.py --target https://janani-careorbit.vercel.app --mode deployed`
   - `TARGET_URL=https://janani-careorbit.vercel.app EXPECT_SECURITY_HEADERS=1 npx playwright test`
