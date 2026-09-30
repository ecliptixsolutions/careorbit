# CAREORBIT — STEP 2 SIDEBAR AUDIT

**Date:** 2026-09-28  
**Type:** Read-only investigation  
**Status:** Analysis complete — ready for Step 2 implementation

---

## 1. Sidebar Architecture

### Main navigation component
**File:** `src/components/app-shell.tsx`

The sidebar is implemented as a single component that handles both **desktop sidebar** and **mobile horizontal navigation**. Navigation items are hardcoded in an array at the top of the file.

**Key architecture:**
- **Desktop:** Left sidebar with vertical navigation (`aside` element, hidden on mobile with `md:flex`)
- **Mobile:** Top horizontal bar + horizontal scrolling nav strip (visible only on mobile)
- **Both use the same `items` array** filtered by permissions
- **Filtering logic:** `visibleItems = items.filter((item) => access?.permissions[item.permission] ?? true)`

### Current visibility implementation
```typescript
const items = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, permission: "canViewDashboard" },
  { to: "/patients", label: "Patients", icon: Users, permission: "canViewPatients" },
  // ... 15 more items
]

const visibleItems = items.filter((item) => access?.permissions[item.permission] ?? true);
```

**Critical issue:** The filter defaults to `?? true` — if permissions are undefined or the role access query fails, **all items are visible by default**. This is the opposite of secure-by-default design.

---

## 2. Navigation Files

| File | Purpose |
|---|---|
| `src/components/app-shell.tsx` | Main navigation (desktop sidebar + mobile nav) |
| `src/hooks/use-role-access.ts` | Permission resolution hook |
| `src/lib/access-control.ts` | Role definitions, permissions, module metadata |
| `src/routes/_authenticated/*.tsx` | Individual route files with permission guards |
| `src/components/ui/command.tsx` | Command palette primitive (NOT IN USE) |

**Note:** No command palette is currently implemented — the `cmdk` component exists but is never imported or used.

---

## 3. Complete Module Map

| Module | Route | Sidebar Entry | Permission | Backend Table Access | Page Guard |
|---|---|---|---|---|---|
| **Overview** | `/dashboard` | Yes | `canViewDashboard` | patients, appointments (stats only) | None |
| **Patients** | `/patients` | Yes | `canViewPatients` | patients (select/insert) | None |
| **History** | `/patient-history` | Yes | `canViewPatientHistory` | patients (phone search) | "Patient history restricted" |
| **Appointments** | `/appointments` | Yes | `canViewAppointments` | appointments (select/insert/update) | None |
| **Queue** | `/queue` | Yes | `canViewQueue` | appointments (queue filter) | "Queue restricted" |
| **EMR Timeline** | `/emr-timeline` | Yes | `canViewEmrTimeline` | patients, appointments, prescriptions, lab_orders, invoices | "EMR timeline restricted" |
| **Prescriptions** | `/prescriptions` | Yes | `canViewPrescriptions` | prescriptions (select/insert) | "Prescriptions restricted" |
| **Laboratory** | `/lab` | Yes | `canAccessLab` | lab_orders (select/insert/update) | "Laboratory restricted" |
| **Pharmacy** | `/pharmacy` | Yes | `canAccessPharmacy` | pharmacy_items, dispensations, pharmacy_invoice_items | "Pharmacy restricted" |
| **Pharmacy Billing** | `/pharmacy/bill` | No (sub-route) | `canAccessPharmacy` | Same as /pharmacy | "Pharmacy billing restricted" |
| **Billing** | `/billing` | Yes | `canAccessBilling` | invoices, payments, service_catalog | "Billing restricted" |
| **Automations** | `/automations` | Yes | `canManageAutomations` | N/A (settings page) | "Automations restricted" |
| **Modules** | `/modules` | Yes | `canViewModules` | N/A (overview page) | None |
| **Security** | `/sessions` | Yes | `canViewModules` | user_sessions (own rows) | None |
| **Data Imports** | `/imports` | Yes | `canManageImports` | import_batches (metadata only) | "Data imports restricted" |
| **Hospital Settings** | `/organization-settings` | Yes | `canManageUsers` | organization_settings (select/upsert) | "Hospital settings restricted" |
| **Access Control** | `/access-control` | Yes | `canManageUsers` | profiles, user_roles, custom_role_templates | "Access control restricted" |
| **Audit & Backup** | `/system-admin` | Yes | `canManageUsers` | audit_logs, all tables (backup exports) | "Administration restricted" |

**Total:** 18 authenticated routes, 17 sidebar entries (pharmacy/bill is a sub-route).

---

## 4. Current Visibility By Role

| Module | Super Admin | Hospital Admin | Admin | Staff | Doctor | Nurse | Pharmacist | Lab Tech | Billing |
|---|---|---|---|---|---|---|---|---|---|
| **Overview** | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE |
| **Patients** | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE |
| **History** | VISIBLE | VISIBLE | VISIBLE | HIDDEN | VISIBLE | VISIBLE | VISIBLE | VISIBLE | HIDDEN |
| **Appointments** | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN | VISIBLE |
| **Queue** | VISIBLE | VISIBLE | VISIBLE | VISIBLE | HIDDEN | VISIBLE | HIDDEN | HIDDEN | HIDDEN |
| **EMR Timeline** | VISIBLE | VISIBLE | VISIBLE | HIDDEN | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE |
| **Prescriptions** | VISIBLE | VISIBLE | VISIBLE | HIDDEN | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN |
| **Laboratory** | VISIBLE | VISIBLE | VISIBLE | HIDDEN | VISIBLE | HIDDEN | HIDDEN | VISIBLE | HIDDEN |
| **Pharmacy** | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN | HIDDEN | VISIBLE | HIDDEN | HIDDEN |
| **Billing** | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN | VISIBLE |
| **Automations** | VISIBLE | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN |
| **Modules** | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE |
| **Security** | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE | VISIBLE |
| **Data Imports** | VISIBLE | VISIBLE | VISIBLE | VISIBLE | HIDDEN | VISIBLE | VISIBLE | HIDDEN | VISIBLE |
| **Hospital Settings** | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN |
| **Access Control** | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN |
| **Audit & Backup** | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN | HIDDEN |

**Legend:**
- **VISIBLE** = Item appears in sidebar/nav, page loads normally
- **HIDDEN** = Item does NOT appear in sidebar/nav
- **RESTRICTED** = Item appears in sidebar/nav, but page shows "Restricted" message

**Current issue:** All roles have `canViewModules: yes` in `access-control.ts`, so **Modules** and **Security** are visible to everyone. This is intentional design (Modules is an overview/discovery page).

---

## 5. Restricted UI Locations

**13 pages currently show "Restricted" screens** when accessed by unauthorized roles:

| Route | Message | Condition |
|---|---|---|
| `/patient-history` | "Patient history restricted" | `!canViewPatientHistory` |
| `/queue` | "Queue restricted" | `!canViewQueue && !canManageQueue` |
| `/emr-timeline` | "EMR timeline restricted" | `!canViewEmrTimeline` |
| `/prescriptions` | "Prescriptions restricted" | `!canViewPrescriptions` |
| `/lab` | "Laboratory restricted" | `!canAccessLab` |
| `/pharmacy` | "Pharmacy restricted" | `!canAccessPharmacy` |
| `/pharmacy/bill` | "Pharmacy billing restricted" | `!canAccessPharmacy` |
| `/billing` | "Billing restricted" | `!canManage` (computed from `canAccessBilling \|\| canManageUsers`) |
| `/automations` | "Automations restricted" | `!canManageAutomations` |
| `/imports` | "Data imports restricted" | `!canManageImports` |
| `/organization-settings` | "Hospital settings restricted" | `!canManageUsers` |
| `/access-control` | "Access control restricted" | `!canManageUsers` |
| `/system-admin` | "Administration restricted" | `!canManageUsers` |

**Pattern:** Each route file contains a guard like:
```typescript
if (!access?.permissions.canAccessXYZ) {
  return <div>Restricted message</div>;
}
```

**These guards remain necessary** for security — they protect against:
- Direct URL access (typing `/billing` in the address bar)
- Browser history navigation
- Bookmarks
- Deep links

**Backend authorization** (Step 1) also blocks unauthorized API access even if the UI is bypassed.

---

## 6. Mobile Navigation

**Implementation:** `src/components/app-shell.tsx` contains both desktop and mobile navigation.

**Mobile UI structure:**
```
<div className="md:hidden ...">   {/* Mobile header */}
  <Link to="/dashboard">Logo</Link>
  <NotificationBell />
  <Badge>{role}</Badge>
  <Button onClick={signOut}>Sign out</Button>
</div>

<nav className="md:hidden ...">   {/* Mobile horizontal nav strip */}
  {visibleItems.map((it) => <Link key={it.to} to={it.to}>...</Link>)}
</nav>
```

**Both desktop and mobile use the same `visibleItems` array** — there is no duplication.

**Mobile-specific issue:** Horizontal scrolling nav can be cramped if many items are visible. Admin roles (17 visible items) require significant horizontal scrolling on mobile.

---

## 7. Command Palette / Quick Actions

**Status:** Command palette **NOT IN USE**.

- `src/components/ui/command.tsx` exists (shadcn/ui `Command` primitive wrapper)
- `cmdk` library is installed in `package.json`
- **No component imports or uses `CommandDialog`**
- No keyboard shortcuts (Cmd+K / Ctrl+K) are registered

**Conclusion:** Command palette is not a concern for Step 2. If added in the future, it should also filter items by `visibleItems`.

---

## 8. Existing Permission System

The permission system is **well-structured and reusable**:

### `src/lib/access-control.ts`
**Exports:**
- `roleDefinitions`: Object mapping `RoleKey` → `RoleDefinition` (includes `permissions` object)
- `moduleDefinitions`: Array of module metadata (title, description, permission key, status)
- `PermissionKey`: Type union of all 33 permission flags
- `RolePermissions`: Object type `Record<PermissionKey, boolean>`

**Each role definition includes:**
```typescript
{
  key: "pharmacist",
  label: "Pharmacist",
  dbRole: "custom",
  customLabel: "pharmacist",
  description: "Pharmacy module access with patient and appointment context.",
  focus: "Review patient context and manage pharmacy workflow entries.",
  permissions: {
    canViewDashboard: true,
    canViewPatients: true,
    canViewPatientHistory: true,
    canViewAppointments: true,
    canViewEmrTimeline: true,
    canViewPrescriptions: true,
    canAccessPharmacy: true,
    canUpdateRecords: true,
    canManageImports: true,
    // ... all other permissions: false
  }
}
```

### `src/hooks/use-role-access.ts`
**Returns:**
```typescript
{
  profile: Profile | null,
  roles: UserRole[],
  role: AppRole,              // DB role enum value
  roleKey: RoleKey,           // Friendly role key (super_admin, doctor, etc.)
  roleLabel: string,          // Display label
  pendingRole: RoleDefinition | null,
  isPendingApproval: boolean,
  copy: RoleDefinition,       // Full role definition with description/focus
  permissions: RolePermissions  // Object with all 33 permission flags
}
```

**Permission check in components:**
```typescript
const { data: access } = useRoleAccess();
const canView = access?.permissions.canAccessBilling || false;
if (!canView) return <Restricted />;
```

**This system is sufficient** — Step 2 should reuse it, not replace it.

---

## 9. Recommended Implementation

### Goal
Remove "Restricted" UX by **hiding inaccessible navigation items entirely**. Users should never see a module they cannot access.

### Changes required

#### **Change 1: Fix the default visibility fallback**

**File:** `src/components/app-shell.tsx`

**Current (insecure):**
```typescript
const visibleItems = items.filter((item) => access?.permissions[item.permission] ?? true);
```

**Fixed (secure-by-default):**
```typescript
const visibleItems = items.filter((item) => access?.permissions[item.permission] === true);
```

**Rationale:** If `access` is `undefined` (loading state) or the permission key doesn't exist, the item should be **hidden by default**, not visible.

---

#### **Change 2: Show loading state while permissions load**

**Current behavior:** Sidebar renders immediately with all items visible (due to `?? true` fallback).

**Improved behavior:** Show a loading skeleton or minimal nav while `useRoleAccess()` is fetching.

**Implementation:**
```typescript
const { data: access, isLoading } = useRoleAccess();

if (isLoading) {
  return <div className="flex min-h-screen">
    <aside className="w-64 border-r">
      <div>Loading navigation...</div>
    </aside>
    <main className="flex-1">{children}</main>
  </div>;
}

const visibleItems = items.filter((item) => access?.permissions[item.permission] === true);
```

**Alternative (less disruptive):** Keep the nav visible but start with `visibleItems = []` during loading:
```typescript
const visibleItems = access 
  ? items.filter((item) => access.permissions[item.permission] === true)
  : [];
```

---

#### **Change 3: Keep page-level guards**

**DO NOT remove the "Restricted" screens** from individual route files. They serve as:
- Defense-in-depth (if someone bookmarks a URL or types it directly)
- Fallback if permissions change mid-session
- Protection against browser history navigation

**The guards should remain:**
```typescript
if (!access?.permissions.canAccessBilling) {
  return <div>Billing restricted</div>;
}
```

**Step 2 changes:**
- Hide nav items → users never see the sidebar entry
- Keep page guards → direct URL access still shows "Restricted"
- Keep backend guards → API calls still return 403

**Three-layer protection:**
1. **Frontend sidebar** — hide navigation (UX)
2. **Frontend page** — show "Restricted" if accessed directly (UX fallback)
3. **Backend API** — return 403 (security)

---

#### **Change 4: Adjust the "Modules" permission**

**Current:** `canViewModules: yes` for all roles (intentional — it's a discovery page).

**Issue:** `/modules` route is visible to everyone, which is fine. But `/sessions` also uses `canViewModules` and is administrative (shows active sessions with revoke buttons).

**Recommended split:**
- `/modules` → `canViewModules: yes` for all roles ✓ (keep as-is)
- `/sessions` → `canManageSessions` (new permission, only for users who can revoke sessions)

**Implementation:**
1. Add `canManageSessions: boolean` to `PermissionKey` type
2. Add it to admin role permissions only
3. Update `/sessions` sidebar entry: `permission: "canManageSessions"`
4. Update `/sessions` route guard to check `canManageSessions`

**Fallback (simpler):** Change `/sessions` sidebar entry to `permission: "canManageUsers"` (already admin-only).

---

### Summary of changes

| File | Change | Lines affected |
|---|---|---|
| `src/components/app-shell.tsx` | Fix `?? true` → `=== true` | 1 line |
| `src/components/app-shell.tsx` | Add loading state (optional) | ~10 lines |
| `src/components/app-shell.tsx` | Change `/sessions` permission to `canManageUsers` | 1 line |
| **TOTAL** | **Minimal changes** | **~12 lines** |

**No changes required to:**
- `use-role-access.ts` — already correct
- `access-control.ts` — already correct
- Individual route files — keep page guards as-is
- Backend — Step 1 already hardened

---

## 10. Files Reviewed

### Primary files
- `src/components/app-shell.tsx` — Main navigation component
- `src/hooks/use-role-access.ts` — Permission hook
- `src/lib/access-control.ts` — Role/permission definitions

### All route files (18 total)
- `src/routes/_authenticated/dashboard.tsx`
- `src/routes/_authenticated/patients.tsx`
- `src/routes/_authenticated/patient-history.tsx`
- `src/routes/_authenticated/appointments.tsx`
- `src/routes/_authenticated/queue.tsx`
- `src/routes/_authenticated/emr-timeline.tsx`
- `src/routes/_authenticated/prescriptions.tsx`
- `src/routes/_authenticated/lab.tsx`
- `src/routes/_authenticated/pharmacy.tsx`
- `src/routes/_authenticated/pharmacy_.bill.tsx`
- `src/routes/_authenticated/billing.tsx`
- `src/routes/_authenticated/automations.tsx`
- `src/routes/_authenticated/modules.tsx`
- `src/routes/_authenticated/sessions.tsx`
- `src/routes/_authenticated/imports.tsx`
- `src/routes/_authenticated/organization-settings.tsx`
- `src/routes/_authenticated/access-control.tsx`
- `src/routes/_authenticated/system-admin.tsx`

### UI primitives
- `src/components/ui/command.tsx` — Unused command palette primitive

**Total files reviewed:** 22 files

---

## Next Steps (Step 2 Implementation)

1. **Fix the insecure default:** Change `?? true` → `=== true` in `app-shell.tsx`
2. **Add loading state:** Show skeleton nav or empty array while permissions load
3. **Adjust /sessions permission:** Change to `canManageUsers` (or create `canManageSessions`)
4. **Test all 9 roles:** Verify sidebar visibility matches the table in section 4
5. **Verify "Restricted" pages still work:** Direct URL access should still show guards
6. **Build and deploy:** Ensure TypeScript compiles with zero errors

**Estimated effort:** 30 minutes (changes are minimal and localized).

**Risk:** Very low — changes are additive (hiding items), not destructive (removing guards).

---

**READ-ONLY AUDIT COMPLETE**  
**NO FILES MODIFIED**  
**READY FOR STEP 2 IMPLEMENTATION**
