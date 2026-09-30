/**
 * STEP 5 — Polling / refresh diagnostics
 *
 * CONFIRMED findings from code audit:
 *
 * 1. useNotifications() has refetchInterval: 30_000. Every 30 seconds it fires
 *    THREE network requests via the supabase compat client:
 *      POST /api/data/notifications       (recipient_id = user.id, limit 20)
 *      POST /api/data/appointments         (doctor_id = user.id, limit 20)
 *      POST /api/data/notification_read_states (user_id = user.id)
 *
 * 2. Each of those hits the Express auth() middleware, which:
 *      • validates the careorbit_session cookie
 *      • runs a MySQL session-policy time check
 *      • executes: UPDATE user_sessions SET last_activity_at=NOW(6) WHERE id=?
 *    This means an open focused browser tab stays "active" indefinitely via
 *    these passive requests — by design.
 *
 * 3. The polling is a React Query refetch. It does NOT cause:
 *      • document.location navigation
 *      • full browser reload (window.location.reload)
 *      • React root unmount/remount
 *      • AppShell remount
 *      • route-level navigation
 *    It updates React Query cache → notification bell re-renders with new data.
 *    Everything else on the page is unaffected.
 *
 * 4. use-session-tracking.ts calls getSessionId(session) which decodes
 *    session.access_token via JWT. /api/auth/me returns { session: { id, user } }
 *    with no access_token field. getSessionId() always returns undefined.
 *    useSessionTracking() early-returns and never upserts user_sessions.
 *    This is a pre-existing gap — NOT related to the reported refresh issue.
 *
 * WHAT REMAINS UNVERIFIED (requires browser DevTools):
 *   • Whether a full page reload is actually happening or only appears to
 *     (e.g. a scroll-to-top, CSS reflow, or overlay re-render)
 *   • Whether any third-party script, service worker, or HMR artifact is
 *     causing a real reload in development
 *   • Whether a JS error is triggering an error boundary that resets state
 *
 * NEXT DEBUGGING STEPS if the visual "reload" persists:
 *   1. Open DevTools → Network tab → check "Preserve log"
 *      Look for document requests (type: document) every ~30s.
 *      If present → real navigation/reload. If absent → React re-render only.
 *   2. Open DevTools → Console → paste:
 *        window.__origReload = window.location.reload;
 *        window.location.reload = function() {
 *          console.trace('reload called'); window.__origReload.call(window);
 *        };
 *      If the stack trace fires → something is calling window.location.reload.
 *   3. Open DevTools → Performance tab → record 35 seconds.
 *      Look for "Navigation" markers vs "Task" markers.
 *   4. Check for error boundaries: if a React error is thrown inside the 30s
 *      refetch callback, the error boundary resets subtree state — visible as
 *      a "flash". Check Console for uncaught errors.
 *   5. Check for service workers: DevTools → Application → Service Workers.
 *      A SW reload on cache update can look like a full page reset.
 */

import { useEffect, useRef } from "react";

const IS_DEV = import.meta.env.DEV;

/**
 * usePollingDiagnostics
 *
 * Drop this into any component to get development-only console output that
 * distinguishes between:
 *   - React Query refetches (expected every 30s)
 *   - Component mounts/unmounts (would indicate AppShell remount)
 *   - Actual document reloads (should never happen from polling)
 *
 * Usage:
 *   import { usePollingDiagnostics } from "@/hooks/use-polling-diagnostics";
 *   // Inside AppShell or NotificationBell:
 *   usePollingDiagnostics("AppShell");
 *
 * Remove or comment out when investigation is complete.
 * No-ops in production (IS_DEV guard).
 */
export function usePollingDiagnostics(componentName: string) {
  const mountCount = useRef(0);
  const mountTime = useRef(Date.now());

  useEffect(() => {
    if (!IS_DEV) return;

    mountCount.current += 1;
    const now = Date.now();
    const elapsed = ((now - mountTime.current) / 1000).toFixed(1);
    mountTime.current = now;

    if (mountCount.current === 1) {
      console.log(
        `[polling-diag] ${componentName} mounted at ${new Date().toISOString()}`,
      );
    } else {
      console.warn(
        `[polling-diag] ${componentName} RE-MOUNTED (mount #${mountCount.current}) ` +
          `— ${elapsed}s since last mount. ` +
          `If this fires every ~30s that confirms a remount issue (not just a refetch).`,
      );
    }

    // Intercept window.location.reload once per mount — dev only
    const originalReload = window.location.reload.bind(window.location);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.location as any).reload = function interceptedReload(...args: unknown[]) {
      console.error(
        `[polling-diag] window.location.reload() called from ${componentName}!`,
        new Error("reload stack trace"),
      );
      return originalReload(...(args as []));
    };

    return () => {
      if (!IS_DEV) return;
      // Restore original reload on unmount
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.location as any).reload = originalReload;
      console.log(
        `[polling-diag] ${componentName} UNMOUNTED after ` +
          `${((Date.now() - mountTime.current) / 1000).toFixed(1)}s`,
      );
    };
  });
  // Intentionally no dependency array — runs on every render to count renders vs mounts
}

/**
 * useRenderCounter
 *
 * Lightweight render counter — logs every render of a component.
 * Useful for checking if a component re-renders on every 30s poll.
 *
 * Usage:
 *   useRenderCounter("NotificationBell");
 *
 * No-ops in production.
 */
export function useRenderCounter(componentName: string) {
  const renderCount = useRef(0);

  if (IS_DEV) {
    renderCount.current += 1;
    // Only log every 5th render to avoid noise — adjust as needed
    if (renderCount.current % 5 === 0) {
      console.log(
        `[polling-diag] ${componentName} has rendered ${renderCount.current} times`,
      );
    }
  }
}
