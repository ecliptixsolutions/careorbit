import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const base = import.meta.env.VITE_API_BASE_URL || "";

// ── Shape returned by each role branch on the server ─────────────────────

export type AdminSummary = {
  role: "super_admin" | "hospital_admin" | "admin";
  total_patients: number;
  total_appointments: number;
  today_appointments: number;
  pending_approvals: number;
  active_users: number;
  open_invoices: number;
  outstanding_amount: number;
  audit_events_today: number;
  recent_audit: Array<{
    actor_id: string;
    action: string;
    entity_type: string;
    created_at: string;
  }>;
};

export type StaffSummary = {
  role: "staff";
  today_appointments: number;
  queue_waiting: number;
  completed_today: number;
  new_patients_today: number;
  total_scheduled: number;
};

export type DoctorSummary = {
  role: "doctor";
  my_today: number;
  my_upcoming: number;
  rx_last_7d: number;
  pending_labs: number;
  completed_today: number;
};

export type NurseSummary = {
  role: "nurse";
  today_appointments: number;
  queue_waiting: number;
  completed_today: number;
  prescriptions_today: number;
};

export type PharmacistSummary = {
  role: "pharmacist";
  prescriptions_today: number;
  pending_prescriptions: number;
  dispensed_today: number;
  low_stock_items: number;
  out_of_stock: number;
};

export type LabTechSummary = {
  role: "lab_technician";
  pending_orders: number;
  samples_collected: number;
  completed_today: number;
  overdue_orders: number;
  ordered_today: number;
};

export type BillingSummary = {
  role: "billing_operator";
  open_invoices: number;
  partially_paid: number;
  outstanding_amount: number;
  payments_today: number;
  collected_today: number;
  invoices_today: number;
};

export type FallbackSummary = {
  role: string;
  today_appointments: number;
  total_patients: number;
};

export type DashboardSummary =
  | AdminSummary
  | StaffSummary
  | DoctorSummary
  | NurseSummary
  | PharmacistSummary
  | LabTechSummary
  | BillingSummary
  | FallbackSummary;

// ── Hook ──────────────────────────────────────────────────────────────────

export function useDashboardSummary() {
  const { user } = useAuth();

  return useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", user?.id],
    enabled: !!user,
    staleTime: 60_000,          // re-fetch at most once per minute
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`${base}/api/dashboard/summary`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: { message?: string } }).error?.message ??
            "Dashboard summary unavailable",
        );
      }
      const body = (await response.json()) as { ok: boolean; summary: DashboardSummary };
      return body.summary;
    },
  });
}
