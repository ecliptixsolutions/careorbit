# Full feature test matrix

| Feature | Status | Evidence / blocker |
| --- | --- | --- |
| Authentication | FAIL | `auth_users` absent; Supabase auth remains in runtime code |
| Dashboard, Patients, Appointments, Queue, EMR, Prescriptions | BLOCKED | No authenticated test user or migrated application data |
| Billing, Payments, Pharmacy, Dispensing, Lab | FAIL | No server transactions/RPC replacements found |
| Notifications, Sessions, Access Control | BLOCKED | No test users/sessions; authorization is incomplete |
| Organization settings | PARTIAL | One existing settings row; upload endpoint absent |
| Imports, Staff, Uploads, Reports, System Administration | FAIL | Edge Function/Supabase dependency or missing API implementation |
| Build | BLOCKED | Build process did not finish within the local execution window |
| Typecheck | FAIL | Stale Supabase imports and type errors |
| Unit tests | PASS | 16 tests in 4 test files |
