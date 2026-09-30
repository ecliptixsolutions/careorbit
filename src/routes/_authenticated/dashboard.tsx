import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DatabaseBackup,
  FlaskConical,
  IndianRupee,
  ListOrdered,
  Loader2,
  Pill,
  ReceiptIndianRupee,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  useDashboardSummary,
  type AdminSummary,
  type BillingSummary,
  type DoctorSummary,
  type LabTechSummary,
  type NurseSummary,
  type PharmacistSummary,
  type StaffSummary,
} from "@/hooks/use-dashboard-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// ── Primitive KPI card ────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "text-brand-blue",
  loading = false,
  emphasis = false,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent?: string;
  loading?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[18px] border bg-card p-6 shadow-sm",
        emphasis && "ring-2 ring-brand-red/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={cn("h-5 w-5", accent)} />
      </div>
      <div className="mt-4 text-3xl font-bold text-heading">
        {loading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : value}
      </div>
    </div>
  );
}

// ── Currency formatter (no external dependency) ───────────────────────────

function formatCurrency(amount: number): string {
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount.toFixed(0)}`;
}

// ── Error state ───────────────────────────────────────────────────────────

function SummaryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-[18px] border border-dashed bg-muted/40 p-8 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-muted-foreground">
        Dashboard data could not be loaded.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────

function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("grid gap-4", count <= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[18px] border bg-card p-6 shadow-sm animate-pulse">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="mt-5 h-8 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ── Role-specific sections ────────────────────────────────────────────────

function AdminSection({ s, loading }: { s: AdminSummary | undefined; loading: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total patients" value={s?.total_patients ?? 0} icon={Users} loading={loading} />
        <KpiCard label="Today's appointments" value={s?.today_appointments ?? 0} icon={CalendarDays} accent="text-brand-red" loading={loading} />
        <KpiCard label="Active users" value={s?.active_users ?? 0} icon={ShieldCheck} loading={loading} />
        <KpiCard
          label="Pending approvals"
          value={s?.pending_approvals ?? 0}
          icon={BellRing}
          accent="text-brand-red"
          emphasis={(s?.pending_approvals ?? 0) > 0}
          loading={loading}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Open invoices" value={s?.open_invoices ?? 0} icon={ReceiptIndianRupee} loading={loading} />
        <KpiCard label="Outstanding" value={s ? formatCurrency(s.outstanding_amount) : "—"} icon={IndianRupee} accent="text-brand-red" loading={loading} />
        <KpiCard label="Audit events today" value={s?.audit_events_today ?? 0} icon={DatabaseBackup} loading={loading} />
      </div>
      {!loading && (s?.pending_approvals ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-brand-red/30 bg-red-50/60 px-5 py-3">
          <span className="text-sm font-medium text-red-700">
            {s!.pending_approvals} user{s!.pending_approvals > 1 ? "s are" : " is"} waiting for role approval.
          </span>
          <Button asChild size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
            <Link to="/access-control">Review</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function StaffSection({ s, loading }: { s: StaffSummary | undefined; loading: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard label="Today's appointments" value={s?.today_appointments ?? 0} icon={CalendarDays} loading={loading} />
      <KpiCard label="Queue waiting" value={s?.queue_waiting ?? 0} icon={ListOrdered} accent="text-brand-red" loading={loading} />
      <KpiCard label="Completed today" value={s?.completed_today ?? 0} icon={CheckCircle2} loading={loading} />
      <KpiCard label="New patients today" value={s?.new_patients_today ?? 0} icon={Users} loading={loading} />
      <KpiCard label="Total scheduled" value={s?.total_scheduled ?? 0} icon={Activity} accent="text-brand-red" loading={loading} />
    </div>
  );
}

function DoctorSection({ s, loading }: { s: DoctorSummary | undefined; loading: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="My appointments today" value={s?.my_today ?? 0} icon={CalendarDays} loading={loading} />
        <KpiCard label="Upcoming (all)" value={s?.my_upcoming ?? 0} icon={Activity} loading={loading} />
        <KpiCard label="Completed today" value={s?.completed_today ?? 0} icon={CheckCircle2} loading={loading} />
        <KpiCard label="Rx written (7 days)" value={s?.rx_last_7d ?? 0} icon={ClipboardList} loading={loading} />
        <KpiCard
          label="Pending lab orders"
          value={s?.pending_labs ?? 0}
          icon={FlaskConical}
          accent="text-brand-red"
          emphasis={(s?.pending_labs ?? 0) > 0}
          loading={loading}
        />
      </div>
      {!loading && (s?.my_today ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No appointments scheduled for you today.
        </div>
      )}
    </div>
  );
}

function NurseSection({ s, loading }: { s: NurseSummary | undefined; loading: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard label="Today's appointments" value={s?.today_appointments ?? 0} icon={CalendarDays} loading={loading} />
      <KpiCard label="Queue waiting" value={s?.queue_waiting ?? 0} icon={ListOrdered} accent="text-brand-red" loading={loading} />
      <KpiCard label="Completed today" value={s?.completed_today ?? 0} icon={CheckCircle2} loading={loading} />
      <KpiCard label="Prescriptions today" value={s?.prescriptions_today ?? 0} icon={ClipboardList} loading={loading} />
    </div>
  );
}

function PharmacistSection({ s, loading }: { s: PharmacistSummary | undefined; loading: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Prescriptions today" value={s?.prescriptions_today ?? 0} icon={ClipboardList} loading={loading} />
        <KpiCard label="Pending prescriptions" value={s?.pending_prescriptions ?? 0} icon={Activity} accent="text-brand-red" loading={loading} />
        <KpiCard label="Dispensed today" value={s?.dispensed_today ?? 0} icon={Pill} loading={loading} />
        <KpiCard
          label="Low stock items"
          value={s?.low_stock_items ?? 0}
          icon={AlertTriangle}
          accent="text-brand-red"
          emphasis={(s?.low_stock_items ?? 0) > 0}
          loading={loading}
        />
        <KpiCard
          label="Out of stock"
          value={s?.out_of_stock ?? 0}
          icon={AlertTriangle}
          accent="text-brand-red"
          emphasis={(s?.out_of_stock ?? 0) > 0}
          loading={loading}
        />
      </div>
      {!loading && (s?.out_of_stock ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-brand-red/30 bg-red-50/60 px-5 py-3">
          <span className="text-sm font-medium text-red-700">
            {s!.out_of_stock} medicine{s!.out_of_stock > 1 ? "s are" : " is"} out of stock.
          </span>
          <Button asChild size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
            <Link to="/pharmacy">View pharmacy</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function LabTechSection({ s, loading }: { s: LabTechSummary | undefined; loading: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Pending orders"
          value={s?.pending_orders ?? 0}
          icon={FlaskConical}
          accent="text-brand-red"
          emphasis={(s?.pending_orders ?? 0) > 0}
          loading={loading}
        />
        <KpiCard label="Samples collected" value={s?.samples_collected ?? 0} icon={Activity} loading={loading} />
        <KpiCard label="Completed today" value={s?.completed_today ?? 0} icon={CheckCircle2} loading={loading} />
        <KpiCard
          label="Overdue (>4h)"
          value={s?.overdue_orders ?? 0}
          icon={AlertTriangle}
          accent="text-brand-red"
          emphasis={(s?.overdue_orders ?? 0) > 0}
          loading={loading}
        />
        <KpiCard label="Ordered today" value={s?.ordered_today ?? 0} icon={ClipboardList} loading={loading} />
      </div>
      {!loading && (s?.overdue_orders ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-brand-red/30 bg-red-50/60 px-5 py-3">
          <span className="text-sm font-medium text-red-700">
            {s!.overdue_orders} lab order{s!.overdue_orders > 1 ? "s are" : " is"} pending for more than 4 hours.
          </span>
          <Button asChild size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
            <Link to="/lab">Open lab</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function BillingSection({ s, loading }: { s: BillingSummary | undefined; loading: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        label="Open invoices"
        value={s?.open_invoices ?? 0}
        icon={ReceiptIndianRupee}
        accent="text-brand-red"
        emphasis={(s?.open_invoices ?? 0) > 0}
        loading={loading}
      />
      <KpiCard label="Partially paid" value={s?.partially_paid ?? 0} icon={Activity} loading={loading} />
      <KpiCard label="Outstanding" value={s ? formatCurrency(s.outstanding_amount) : "—"} icon={IndianRupee} accent="text-brand-red" loading={loading} />
      <KpiCard label="Payments today" value={s?.payments_today ?? 0} icon={CheckCircle2} loading={loading} />
      <KpiCard label="Collected today" value={s ? formatCurrency(s.collected_today) : "—"} icon={TrendingUp} loading={loading} />
      <KpiCard label="Invoices today" value={s?.invoices_today ?? 0} icon={ClipboardList} loading={loading} />
    </div>
  );
}

// ── Role-wise access rights grid ──────────────────────────────────────────

function AccessGrid() {
  const { data: access } = useRoleAccess();
  const rights = [
    ["Patients",      access?.permissions.canViewPatients,          "View patient records"],
    ["History",       access?.permissions.canViewPatientHistory,     "Search patient history by number"],
    ["Add Patient",   access?.permissions.canCreatePatients,         "Register patients and assign doctors"],
    ["Appointments",  access?.permissions.canScheduleAppointments,   "Schedule consultations"],
    ["Queue",         access?.permissions.canViewQueue,              "Live token queue and QR check-in"],
    ["EMR Timeline",  access?.permissions.canViewEmrTimeline,        "Full patient history view"],
    ["Automations",   access?.permissions.canManageAutomations,      "WhatsApp reminders and follow-ups"],
    ["Modules",       access?.permissions.canViewModules,            "Open enabled ERP module workspaces"],
    ["User Approval", access?.permissions.canApproveUsers,           "Approve accounts and assign roles"],
    ["Role Creation", access?.permissions.canManageRoles,            "Create role templates and rights"],
    ["Delete Rights", access?.permissions.canDeleteRecords,          "Delete records when UI exists"],
  ] as const;

  return (
    <div className="rounded-[18px] border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-blue" />
            <h2 className="text-xl font-semibold">Role-wise access</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {access?.copy.focus ?? "Loading current role access…"}
          </p>
        </div>
        <Badge className="bg-gradient-brand text-white">{access?.copy.label ?? "Role"}</Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rights.map(([label, enabled, desc]) => (
          <div key={label} className="rounded-xl border bg-muted/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2
                className={enabled ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"}
              />
              {label}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────

function Dashboard() {
  const { data: access } = useRoleAccess();
  const { data: summary, isLoading, isError, refetch } = useDashboardSummary();

  const roleKey = access?.roleKey ?? "custom";
  const firstName = access?.profile?.full_name?.split(" ")[0];
  const facility = (access?.profile as { organization?: string } | undefined)?.organization;

  // Role section title map
  const sectionTitle: Record<string, string> = {
    super_admin:      "System overview",
    hospital_admin:   "Hospital operations",
    admin:            "Admin overview",
    staff:            "Reception & scheduling",
    doctor:           "My clinical summary",
    nurse:            "Care queue",
    pharmacist:       "Pharmacy workload",
    lab_technician:   "Lab pipeline",
    billing_operator: "Billing & collections",
  };

  const title = sectionTitle[roleKey] ?? "Dashboard";

  return (
    <div className="space-y-8">
      {/* ── Welcome header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {facility ? `${facility} — ` : ""}{title}
        </p>
      </div>

      {/* ── Role-specific KPI section ───────────────────────────────────── */}
      <section aria-label={title}>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>

        {isError ? (
          <SummaryError onRetry={() => void refetch()} />
        ) : isLoading && !summary ? (
          <KpiSkeleton count={roleKey === "billing_operator" ? 6 : ["admin","super_admin","hospital_admin"].includes(roleKey) ? 7 : 4} />
        ) : (
          <>
            {(roleKey === "super_admin" || roleKey === "hospital_admin" || roleKey === "admin") && (
              <AdminSection s={summary as AdminSummary | undefined} loading={isLoading} />
            )}
            {roleKey === "staff" && (
              <StaffSection s={summary as StaffSummary | undefined} loading={isLoading} />
            )}
            {roleKey === "doctor" && (
              <DoctorSection s={summary as DoctorSummary | undefined} loading={isLoading} />
            )}
            {roleKey === "nurse" && (
              <NurseSection s={summary as NurseSummary | undefined} loading={isLoading} />
            )}
            {roleKey === "pharmacist" && (
              <PharmacistSection s={summary as PharmacistSummary | undefined} loading={isLoading} />
            )}
            {roleKey === "lab_technician" && (
              <LabTechSection s={summary as LabTechSummary | undefined} loading={isLoading} />
            )}
            {roleKey === "billing_operator" && (
              <BillingSection s={summary as BillingSummary | undefined} loading={isLoading} />
            )}
            {/* custom / pending / unknown roles */}
            {!["super_admin","hospital_admin","admin","staff","doctor","nurse","pharmacist","lab_technician","billing_operator"].includes(roleKey) && (
              <div className="grid gap-4 sm:grid-cols-2">
                <KpiCard
                  label="Today's appointments"
                  value={(summary as { today_appointments?: number } | undefined)?.today_appointments ?? 0}
                  icon={CalendarDays}
                  loading={isLoading}
                />
                <KpiCard
                  label="Total patients"
                  value={(summary as { total_patients?: number } | undefined)?.total_patients ?? 0}
                  icon={Users}
                  loading={isLoading}
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Get-started banner (shown only when data is absent / zero) ──── */}
      {!isLoading && !isError && (
        (() => {
          const isEmpty =
            (roleKey === "staff" && (summary as StaffSummary | undefined)?.total_scheduled === 0) ||
            (roleKey === "doctor" && (summary as DoctorSummary | undefined)?.my_upcoming === 0) ||
            (!summary);
          return isEmpty ? (
            <div className="rounded-[18px] border bg-gradient-brand p-8 text-white shadow-elegant">
              <h2 className="text-2xl font-bold text-white">Get started</h2>
              <p className="mt-2 text-white/90">
                Add your first patient, assign the doctor name, schedule a timed appointment, then
                manage queue check-in, EMR timeline, and follow-up reminders from role-based screens.
              </p>
            </div>
          ) : null;
        })()
      )}

      {/* ── Role-wise access rights ─────────────────────────────────────── */}
      <AccessGrid />
    </div>
  );
}
