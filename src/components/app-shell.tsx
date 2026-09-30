/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BotMessageSquare,
  CalendarDays,
  ClipboardList,
  DatabaseBackup,
  FileText,
  FlaskConical,
  History,
  Import,
  LayoutDashboard,
  LayoutGrid,
  ListOrdered,
  LogOut,
  Pill,
  ReceiptIndianRupee,
  Settings,
  ShieldCheck,
  MonitorCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useAuth } from "@/hooks/use-auth";
import { getSessionId } from "@/hooks/use-session-tracking";
import { NotificationBell } from "@/components/notification-bell";
import type { RolePermissions } from "@/lib/access-control";

export const navigationItems = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, permission: "canViewDashboard" },
  { to: "/patients", label: "Patients", icon: Users, permission: "canViewPatients" },
  {
    to: "/patient-history",
    label: "History",
    icon: History,
    permission: "canViewPatientHistory",
  },
  {
    to: "/appointments",
    label: "Appointments",
    icon: CalendarDays,
    permission: "canViewAppointments",
  },
  { to: "/queue", label: "Queue", icon: ListOrdered, permission: "canViewQueue" },
  {
    to: "/emr-timeline",
    label: "EMR Timeline",
    icon: ClipboardList,
    permission: "canViewEmrTimeline",
  },
  {
    to: "/prescriptions",
    label: "Prescriptions",
    icon: FileText,
    permission: "canViewPrescriptions",
  },
  { to: "/lab", label: "Laboratory", icon: FlaskConical, permission: "canAccessLab" },
  { to: "/pharmacy", label: "Pharmacy", icon: Pill, permission: "canAccessPharmacy" },
  {
    to: "/billing",
    label: "Billing",
    icon: ReceiptIndianRupee,
    permission: "canAccessBilling",
  },
  {
    to: "/automations",
    label: "Automations",
    icon: BotMessageSquare,
    permission: "canManageAutomations",
  },
  { to: "/modules", label: "Modules", icon: LayoutGrid, permission: "canViewModules" },
  { to: "/sessions", label: "Security", icon: MonitorCheck, permission: "canManageUsers" },
  {
    to: "/imports",
    label: "Data Imports",
    icon: Import,
    permission: "canManageImports",
  },
  {
    to: "/organization-settings",
    label: "Hospital Settings",
    icon: Settings,
    permission: "canManageUsers",
  },
  {
    to: "/access-control",
    label: "Access Control",
    icon: ShieldCheck,
    permission: "canManageUsers",
  },
  {
    to: "/system-admin",
    label: "Audit & Backup",
    icon: DatabaseBackup,
    permission: "canManageUsers",
  },
] as const;

export function filterNavigationItems(permissions?: Partial<RolePermissions>) {
  return navigationItems.filter((item) => permissions?.[item.permission] === true);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: access } = useRoleAccess();
  const { session, user } = useAuth();
  const visibleItems = filterNavigationItems(access?.permissions);

  const signOut = async () => {
    const sessionId = getSessionId(session);
    if (sessionId && user) {
      await (supabase as any)
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString(), revoked_reason: "user_logout" })
        .eq("id", sessionId)
        .eq("user_id", user.id);
    }
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <Link to="/" className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand shadow-glow">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold tracking-tight text-white">
            Care<span className="text-white/75">Orbit</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleItems.map((it) => {
            const active = location.pathname === it.to;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                  active
                    ? "bg-gradient-brand text-white shadow-glow ring-1 ring-white/15"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white",
                )}
              >
                <it.icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-2">
            <span className="px-1 text-xs font-medium text-sidebar-foreground">Alerts</span>
            <NotificationBell />
          </div>
          <div className="mb-3 rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3 text-xs text-sidebar-foreground">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-white" />
              <Badge variant="secondary" className="border-white/10 bg-white/10 text-white">
                {access?.copy.label ?? "Role"}
              </Badge>
            </div>
            <p className="leading-relaxed text-sidebar-foreground/80">
              {access?.copy.description ?? "Loading access rights..."}
            </p>
          </div>
          <Button
            onClick={signOut}
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="md:hidden flex min-h-16 items-center justify-between border-b bg-surface px-4">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2 font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand">
              <Activity className="h-5 w-5 text-white" />
            </span>
            <span className="text-heading">CareOrbit</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <NotificationBell />
            {/* Role badge: hidden below 400px to prevent header overflow */}
            <Badge variant="secondary" className="hidden min-[400px]:inline-flex max-w-[7rem] truncate">
              {access?.copy.label ?? "Role"}
            </Badge>
            <Button
              onClick={signOut}
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Mobile navigation — horizontal scroll with scroll-snap and fade affordance */}
        <div className="relative md:hidden border-b bg-surface">
          <nav className="flex gap-1 overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleItems.map((it) => {
              const active = location.pathname === it.to;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium",
                    active
                      ? "bg-gradient-brand text-white shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-heading",
                  )}
                >
                  <it.icon className="h-4 w-4" />
                  {it.label}
                </Link>
              );
            })}
          </nav>
          {/* Right-edge fade affordance — indicates scrollability without JS */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent" />
        </div>
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
