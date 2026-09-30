# CAREORBIT — STEP 5: 30-SECOND POLLING DIAGNOSTICS

**Date:** 2026-09-24  
**Status:** COMPLETE (diagnostics delivered; full-reload claim not proven or disproven — see below)  
**Build:** PASS

---

## Summary

The 30-second polling from `useNotifications()` is confirmed by code. It fires three React Query refetches every 30 seconds — **not** a document reload. The reported "full-page refresh" has not been proven to be caused by polling. This document records what was confirmed, what was not, and how to verify it in the browser.

---

## Confirmed: 30-Second Polling Behavior

**File:** `src/hooks/use-notifications.ts`

```typescript
useQuery({
  queryKey: ["notifications", user?.id],
  refetchInterval: 30_000,   // ← confirmed
  ...
})
```

Every 30 seconds this fires **three network requests** in sequence:

1. `POST /api/data/notifications`  
   Filter: `recipient_id = user.id`, limit 20, order by `created_at DESC`

2. `POST /api/data/appointments`  
   Filter: `doctor_id = user.id`, limit 20, order by `created_at DESC`  
   (Only doctor-role users receive meaningful results — other roles get empty arrays)

3. `POST /api/data/notification_read_states`  
   Filter: `user_id = user.id`

All three go through the Express `auth()` middleware, which:
- Validates the `careorbit_session` cookie
- Checks session idle/absolute timeout against MySQL server clock
- Executes: `UPDATE user_sessions SET last_activity_at=NOW(6) WHERE id=?`

**Effect:** An open browser tab with a logged-in user stays "active" indefinitely via these passive requests — even with no user interaction. This is by design and is documented behavior.

---

## Confirmed: What Polling Does NOT Do

From code inspection:

| Claim | Verdict |
|---|---|
| Polling causes `window.location.reload()` | **NOT FOUND** — no reload call in notifications hook |
| Polling causes route navigation | **NOT FOUND** — no `navigate()` called in notifications hook |
| Polling remounts AppShell | **NOT FOUND** — refetch only updates React Query cache |
| Polling remounts NotificationBell | **EXPECTED** — NotificationBell re-renders when `unreadCount` changes; this is a React re-render, not a remount |
| Polling causes full browser reload | **NOT PROVEN** — no code path from the polling to a reload was found |

A React Query refetch updates the in-memory cache. Components subscribed to that query (e.g. `NotificationBell`) re-render with new data. Nothing else in the tree remounts unless an ancestor throws an error that triggers an error boundary reset.

---

## Confirmed: use-session-tracking Gap (Separate Issue)

**File:** `src/hooks/use-session-tracking.ts`

`getSessionId(session)` decodes `session.access_token` via JWT. However, `/api/auth/me` returns:

```json
{ "session": { "id": "...", "user": { "id": "...", "email": "..." } } }
```

There is **no `access_token` field** in this response. Therefore:
- `getSessionId()` always returns `undefined`
- `useSessionTracking()` guards on `if (!sessionId) return` and never runs the upsert
- No `user_sessions` row is written via this hook

This is a pre-existing gap. It does not affect authentication (session cookies work correctly), does not affect the session list on `/sessions`, and is **not related to the polling issue**. It is documented here for completeness.

---

## What Remains Unverified

A visual "page reset" every ~30 seconds **could** be caused by any of the following — none of which can be confirmed or ruled out without browser DevTools observation:

1. **Actual `window.location.reload()` call** from an unknown source (service worker, analytics script, HMR artifact in development)
2. **React error boundary reset** — an uncaught error in the 30s refetch callback resets the nearest error boundary subtree, which looks like a re-render flash
3. **Scroll-to-top** triggered by a router effect on query key change
4. **CSS reflow** from a large state update in the notification bell (e.g. animation on badge count change)
5. **Service worker cache update** triggering a controlled reload

---

## How to Investigate in Browser DevTools

### Step 1 — Confirm whether it is a real document reload

1. Open DevTools → **Network** tab
2. Check **"Preserve log"**
3. Wait 35 seconds
4. Look at the `Type` column — filter by `document`

If a `document`-type request appears every ~30s → **real navigation/reload happening**.  
If only `fetch` / `xhr` requests appear → **it is a React re-render, not a reload**.

### Step 2 — Intercept reload calls (if Step 1 confirms real reload)

Paste in DevTools Console:
```javascript
const orig = window.location.reload.bind(window.location);
window.location.reload = function(...args) {
  console.error('[reload intercepted]', new Error('stack trace'));
  return orig(...args);
};
```

If the stack trace fires, the call stack will identify the exact source.

### Step 3 — Use the provided diagnostic hook

**File:** `src/hooks/use-polling-diagnostics.ts`

Add to `AppShell` (or `NotificationBell`) temporarily:

```typescript
import { usePollingDiagnostics } from "@/hooks/use-polling-diagnostics";

// Inside AppShell component:
usePollingDiagnostics("AppShell");
```

This logs:
- Mount time (first load)
- Re-mount events with timestamps (only fires if the component actually unmounts/remounts)
- Unmount events
- Intercepts `window.location.reload()` and logs a stack trace

If "RE-MOUNTED" appears every ~30s → AppShell is being unmounted and remounted (problem).  
If no RE-MOUNTED appears → it is a re-render only, not a remount (expected, benign).

### Step 4 — Check for service workers

DevTools → **Application** → **Service Workers**  
If a service worker is registered and shows "Update available" or performs a controlled reload, this is the cause.

### Step 5 — Check for error boundary resets

DevTools → **Console** → look for uncaught errors every ~30s  
An error thrown during the notification refetch (e.g. from JSON parsing or network error) that reaches an error boundary will reset the subtree.

---

## What Was Changed

### New file: `src/hooks/use-polling-diagnostics.ts`

Two development-only hooks:

**`usePollingDiagnostics(componentName: string)`**
- Logs mount, remount (with elapsed time), and unmount events
- Intercepts `window.location.reload()` and logs stack trace
- Restores original reload on unmount
- No-ops in production via `import.meta.env.DEV`

**`useRenderCounter(componentName: string)`**
- Logs render count every 5th render
- No-ops in production

**Usage:** Not wired into any component by default. Must be deliberately added by a developer. Remove after investigation.

---

## What Was NOT Changed

- `use-notifications.ts` — polling preserved exactly as-is
- `refetchInterval: 30_000` — unchanged
- Authentication middleware — unchanged
- Session timeout behavior — unchanged
- Session `last_activity_at` update behavior — unchanged
- Rate limiting — unchanged

The polling was not disabled, slowed down, or modified. The behavior has not been declared "fixed" because no evidence of the root cause of the reported visual refresh was found in the code.

---

## Files Changed

| File | Change |
|---|---|
| `src/hooks/use-polling-diagnostics.ts` | New file — dev-only diagnostics hooks |

---

## Conclusion

The 30-second polling is confirmed and works as designed. The three network requests every 30 seconds are React Query refetches — they update the notification bell data without touching the DOM tree outside the bell component. They cannot cause a document reload by themselves.

**The reported full-page visual refresh is NOT proven to be caused by the notification polling.** Investigation requires browser DevTools as described above. The diagnostic hook is available to capture the evidence needed.
