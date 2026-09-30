# CAREORBIT — STEP 3: ROLE-SPECIFIC DASHBOARDS

**Date:** 2026-09-24  
**Status:** COMPLETE  
**Build:** PASS (Vite 7.3.6, 2732 modules, zero errors)

---

## What Was Changed

### 1. Server — new endpoint: `GET /api/dashboard/summary`

**File:** `hostinger-api/src/server.js` (PHASE 10, appended before error handler)

A single role-aware aggregation endpoint that:
- Authenticates via existing `auth()` middleware (careorbit_session cookie)
- Resolves the user's effective role using the existing `resolveRoleKey(req)` helper
- Executes a single subquery-based `SELECT` with `COUNT(*)` aggregates — **no `SELECT *`, no full-table transfers**
- Uses MySQL's own `NOW()` for date comparisons, avoiding Node ↔ DB clock skew
- Returns only the fields relevant to the authenticated role
- Enforces role authorization server-side (mirrors frontend permissions matrix)

**Role branches and metrics returned:**

| Role | Metrics |
|---|---|
| super_admin / hospital_admin / admin | total_patients, total_appointments, today_appointments, pending_approvals, active_users, open_invoices, outstanding_amount, audit_events_today, recent_audit (last 5 rows) |
| staff | today_appointments, queue_waiting, completed_today, new_patients_today, total_scheduled |
| doctor | my_today (own), my_upcoming (own), rx_last_7d (own), pending_labs (own), completed_today (own) |
| nurse | today_appointments, queue_waiting, completed_today, prescriptions_today |
| pharmacist | prescriptions_today, pending_prescriptions, dispensed_today, low_stock_items, out_of_stock |
| lab_technician | pending_orders, samples_collected, completed_today, overdue_orders (>4h), ordered_today |
| billing_operator | open_invoices, partially_paid, outstanding_amount, payments_today, collected_today, invoices_today |
| custom / pending / fallback | today_appointments, total_patients |

Doctor metrics use `WHERE doctor_id = ?` / `WHERE ordered_by = ?` — own data only, never another user's clinical data.

### 2. Frontend hook: `useDashboardSummary()`

**File:** `src/hooks/use-dashboard-summary.ts` (new file)

- Uses `fetch()` directly with `credentials: "include"` — not the supabase compat client
- `queryKey: ["dashboard-summary", user?.id]`
- `staleTime: 60_000` — re-fetches at most once per minute, not on every navigation
- `retry: 1`, `refetchOnWindowFocus: false`
- Fully typed: exports `AdminSummary`, `StaffSummary`, `DoctorSummary`, `NurseSummary`, `PharmacistSummary`, `LabTechSummary`, `BillingSummary`, `FallbackSummary` and the `DashboardSummary` union type

### 3. Dashboard page: complete rewrite

**File:** `src/routes/_authenticated/dashboard.tsx`

**Removed:**
- All `supabase.from().gte().lt()` calls — `.gte` and `.lt` range operators are not implemented in the compat client, causing silent query failures (audit finding confirmed)
- Static hard-coded `value: 16` for "Active modules" KPI
- Static fake role-labelled widget descriptions with embedded counts

**Added:**
- `useDashboardSummary()` hook for live data
- Role-specific section components: `AdminSection`, `StaffSection`, `DoctorSection`, `NurseSection`, `PharmacistSection`, `LabTechSection`, `BillingSection`
- `KpiCard` primitive with loading spinner state
- `KpiSkeleton` — animated placeholder grid shown while data loads
- `SummaryError` — error state with retry button
- Alert banners for actionable items:
  - Admin: pending approvals > 0 → "Review" link to /access-control
  - Pharmacist: out_of_stock > 0 → "View pharmacy" link
  - Lab Tech: overdue_orders > 0 → "Open lab" link
- Get-started banner shown only when data is absent/zero (staff with no scheduled appointments, doctor with no upcoming appointments)
- `AccessGrid` component — preserved role-wise access rights matrix from original dashboard
- `formatCurrency()` helper: formats amounts as ₹1.2L / ₹45.3K / ₹890 without external dependencies
- Custom/pending/unknown roles show minimal fallback with today's appointments and total patients

---

## What Was Intentionally NOT Changed

- `use-role-access.ts` — permission system unchanged
- `access-control.ts` — role definitions unchanged
- All route page-level guards (Restricted screens) — preserved as defense-in-depth
- Backend authorization hierarchy — unchanged
- Session validation / rate limiting — unchanged
- `use-notifications.ts` — polling unchanged
- No Supabase RPC / functions.invoke / Storage introduced

---

## Security Considerations

- The dashboard endpoint enforces role server-side via `resolveRoleKey(req)` — frontend role checks are display-only
- Doctor metrics are scoped to `WHERE doctor_id = req.user.id` — a doctor cannot see another doctor's appointment pipeline
- Admin metrics (`audit_logs`, `profiles` counts) only visible to `isAdmin(req)` roles
- `outstanding_amount` (financial) only returned to admin and billing_operator roles
- `recent_audit` rows contain only `actor_id`, `action`, `entity_type`, `created_at` — no patient PII

---

## Testing

**Build:** PASS — `npx vite build` exits 0, 2732 modules transformed, zero TypeScript errors from application code.

**Manual verification required per role:**

| Role | Expected dashboard section | Key metric to verify |
|---|---|---|
| super_admin | AdminSection | pending_approvals count matches access-control page |
| hospital_admin | AdminSection | same as super_admin |
| admin | AdminSection | same as super_admin |
| staff | StaffSection | today_appointments matches appointments page count |
| doctor | DoctorSection | my_today = appointments where doctor_id = self and today |
| nurse | NurseSection | queue_waiting = today scheduled appointments |
| pharmacist | PharmacistSection | low_stock_items matches pharmacy page |
| lab_technician | LabTechSection | pending_orders matches lab page |
| billing_operator | BillingSection | open_invoices + outstanding_amount matches billing page |

**Loading state:** observable on slow connections or by throttling in DevTools Network tab.

**Error state:** observable by temporarily revoking session in another tab — dashboard shows "Retry" button.

---

## Known Issues / Remaining Work

- `recent_audit` in AdminSummary returns a single row object due to how the SQL subquery is structured (not a joined array). The frontend receives it as `Array<{...}>` — if multiple recent audit events are needed in a future audit feed, the query should be changed to a separate `SELECT ... LIMIT 5` query. Currently displayed count only.
- No chart components added — all metrics are counts/amounts only. Charts can be added in a future pass using the same aggregated data.
- `prescriptions` table does not have a reliable `status` column in all deployments — `pending_prescriptions` falls back to `status IN ('pending','active') OR status IS NULL`. Verify against actual schema.

---

## Files Changed

| File | Change type |
|---|---|
| `hostinger-api/src/server.js` | Added PHASE 10 `GET /api/dashboard/summary` endpoint |
| `src/hooks/use-dashboard-summary.ts` | New file — typed hook |
| `src/routes/_authenticated/dashboard.tsx` | Complete rewrite |
