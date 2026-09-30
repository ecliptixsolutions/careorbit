# Security test report

| Area | Status | Finding |
| --- | --- | --- |
| Database credentials in frontend | PASS | No `VITE_MYSQL*` client credential exposure found |
| Authentication | FAIL | MySQL auth table absent; Supabase auth paths remain |
| Authorization/RLS parity | FAIL | Generic API has coarse authorization, not Supabase RLS-equivalent checks |
| Sessions | PARTIAL | Server session code exists but no live auth data/test was possible |
| SQL injection | PARTIAL | Generic API uses parameter values; full route coverage absent |
| XSS/input validation | BLOCKED | End-to-end forms/API unavailable for safe verification |
| Billing/pharmacy idempotency | FAIL | No transaction, lock, or idempotency implementation found |
| Upload security | FAIL | No upload endpoint/directory |
| Supabase removal | FAIL | Runtime auth, Edge Function, and legacy call paths remain |
