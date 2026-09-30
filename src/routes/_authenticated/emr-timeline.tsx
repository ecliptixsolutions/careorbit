import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarDays,
  CreditCard,
  FileText,
  HeartPulse,
  Pill,
  Search,
  ShieldAlert,
  Stethoscope,
  TestTube2,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useRoleAccess } from "@/hooks/use-role-access";
import { getAppointmentDoctorName, stripWorkflowNotes } from "@/lib/appointment-workflow";
import { isMissingRelationError } from "@/lib/supabase-errors";

export const Route = createFileRoute("/_authenticated/emr-timeline")({
  component: EmrTimelinePage,
});

type PatientRow = Tables<"patients">;
type AppointmentRow = Tables<"appointments">;
type PrescriptionRow = Tables<"prescriptions">;
type LabOrderRow = Tables<"lab_orders">;
type InvoiceRow = Tables<"invoices">;

type TimelineEntry = {
  id: string;
  date: string;
  title: string;
  description: string;
  type: "visit" | "prescription" | "report" | "diagnosis" | "billing" | "vitals" | "profile";
  icon: typeof CalendarDays;
};

const typeTone: Record<TimelineEntry["type"], string> = {
  visit: "border-blue-200 bg-blue-50 text-blue-700",
  prescription: "border-purple-200 bg-purple-50 text-purple-700",
  report: "border-cyan-200 bg-cyan-50 text-cyan-700",
  diagnosis: "border-green-200 bg-green-50 text-green-700",
  billing: "border-amber-200 bg-amber-50 text-amber-700",
  vitals: "border-rose-200 bg-rose-50 text-rose-700",
  profile: "border-slate-200 bg-slate-50 text-slate-700",
};

function getGuardianContact(notes: string | null) {
  const match = notes?.match(/^Guardian emergency contact:\s*(.+)$/im);
  return match?.[1] ?? "";
}

function buildTimeline(
  patient: PatientRow,
  appointments: AppointmentRow[],
  prescriptions: PrescriptionRow[],
  labOrders: LabOrderRow[],
  invoices: InvoiceRow[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: `${patient.id}:profile`,
      date: patient.created_at,
      title: "Patient profile created",
      description: `MRN ${patient.mrn} registered with phone ${patient.phone || "-"} and blood group ${
        patient.blood_group || "-"
      }.`,
      type: "profile",
      icon: UserRound,
    },
  ];

  appointments.forEach((appointment) => {
    const base = `${appointment.id}:${appointment.scheduled_at}`;
    entries.push({
      id: `${base}:visit`,
      date: appointment.scheduled_at,
      title: `Visit with ${getAppointmentDoctorName(appointment)}`,
      description: appointment.reason || "Consultation visit recorded without problem brief.",
      type: "visit",
      icon: CalendarDays,
    });
    entries.push({
      id: `${base}:diagnosis`,
      date: appointment.scheduled_at,
      title: "Diagnosis / problem brief",
      description:
        appointment.reason || stripWorkflowNotes(appointment.notes) || "No diagnosis captured.",
      type: "diagnosis",
      icon: Stethoscope,
    });
    entries.push({
      id: `${base}:vitals`,
      date: appointment.scheduled_at,
      title: "Vitals",
      description:
        "Vitals capture workspace ready for nurse/doctor entry after database table setup.",
      type: "vitals",
      icon: HeartPulse,
    });
  });

  prescriptions.forEach((prescription) => {
    const medicineCount = Array.isArray(prescription.medicines) ? prescription.medicines.length : 0;
    entries.push({
      id: `${prescription.id}:prescription`,
      date: prescription.issued_at ?? prescription.created_at,
      title: `Prescription ${prescription.prescription_number}`,
      description: `${prescription.diagnosis || "Diagnosis not specified"} - ${medicineCount} medicine${medicineCount === 1 ? "" : "s"}.`,
      type: "prescription",
      icon: Pill,
    });
  });

  labOrders.forEach((order) => {
    entries.push({
      id: `${order.id}:report`,
      date: order.completed_at ?? order.ordered_at,
      title: `${order.test_name} - ${order.status.replace("_", " ")}`,
      description:
        order.result || `Lab order ${order.order_number} is ${order.status.replace("_", " ")}.`,
      type: "report",
      icon: TestTube2,
    });
  });

  invoices.forEach((invoice) => {
    entries.push({
      id: `${invoice.id}:billing`,
      date: invoice.created_at,
      title: `Invoice ${invoice.invoice_number}`,
      description: `Total INR ${Number(invoice.total_amount).toFixed(2)} - Paid INR ${Number(invoice.paid_amount).toFixed(2)} - ${invoice.status.replace("_", " ")}.`,
      type: "billing",
      icon: CreditCard,
    });
  });

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function EmrTimelinePage() {
  const { data: access } = useRoleAccess();
  const [search, setSearch] = useState("");
  const [activePatientId, setActivePatientId] = useState("");

  const { data: patients = [], isLoading: patientsLoading } = useQuery<PatientRow[]>({
    queryKey: ["emr-patients"],
    enabled: access?.permissions.canViewEmrTimeline ?? false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error && !isMissingRelationError(error)) throw error;
      if (error) return [];
      return data ?? [];
    },
  });

  const patientIds = patients.map((patient) => patient.id);
  const { data: appointments = [] } = useQuery<AppointmentRow[]>({
    queryKey: ["emr-appointments", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .in("patient_id", patientIds)
        .order("scheduled_at", { ascending: false });
      if (error && !isMissingRelationError(error)) throw error;
      if (error) return [];
      return data ?? [];
    },
  });

  const { data: prescriptions = [] } = useQuery<PrescriptionRow[]>({
    queryKey: ["emr-prescriptions", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescriptions")
        .select("*")
        .in("patient_id", patientIds)
        .order("created_at", { ascending: false });
      if (error && !isMissingRelationError(error)) throw error;
      return error ? [] : (data ?? []);
    },
  });

  const { data: labOrders = [] } = useQuery<LabOrderRow[]>({
    queryKey: ["emr-lab-orders", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_orders")
        .select("*")
        .in("patient_id", patientIds)
        .order("created_at", { ascending: false });
      if (error && !isMissingRelationError(error)) throw error;
      return error ? [] : (data ?? []);
    },
  });

  const { data: invoices = [] } = useQuery<InvoiceRow[]>({
    queryKey: ["emr-invoices", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .in("patient_id", patientIds)
        .order("created_at", { ascending: false });
      if (error && !isMissingRelationError(error)) throw error;
      return error ? [] : (data ?? []);
    },
  });

  const filteredPatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? patients.filter(
          (patient) =>
            patient.full_name.toLowerCase().includes(term) ||
            patient.mrn.toLowerCase().includes(term) ||
            patient.phone?.toLowerCase().includes(term) ||
            getGuardianContact(patient.notes).toLowerCase().includes(term),
        )
      : patients;
    return list.slice(0, 12);
  }, [patients, search]);

  const activePatient =
    patients.find((patient) => patient.id === activePatientId) ?? filteredPatients[0] ?? null;
  const activeAppointments = activePatient
    ? appointments.filter((appointment) => appointment.patient_id === activePatient.id)
    : [];
  const timeline = activePatient
    ? buildTimeline(
        activePatient,
        activeAppointments,
        prescriptions.filter((item) => item.patient_id === activePatient.id),
        labOrders.filter((item) => item.patient_id === activePatient.id),
        invoices.filter((item) => item.patient_id === activePatient.id),
      )
    : [];

  if (!(access?.permissions.canViewEmrTimeline ?? false)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">EMR timeline restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Smart EMR timeline is available for doctors, nurses, clinical roles, and admins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Smart EMR Timeline</h1>
        <p className="mt-1 text-muted-foreground">
          Patient full history in a modern timeline covering visits, prescriptions, reports,
          diagnoses, billing, and vitals.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{access?.copy.label ?? "Role"}</Badge>
          <span>Search by patient number, guardian number, MRN, or name.</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.6fr]">
        <div className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient history"
                className="pl-9"
              />
            </div>
          </div>
          {patientsLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading patients...</div>
          ) : filteredPatients.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No patient found.</div>
          ) : (
            <div className="divide-y">
              {filteredPatients.map((patient) => {
                const selected = patient.id === activePatient?.id;
                const visitCount = appointments.filter(
                  (appointment) => appointment.patient_id === patient.id,
                ).length;
                return (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => setActivePatientId(patient.id)}
                    className={`w-full p-4 text-left transition-colors ${
                      selected ? "bg-primary/10" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{patient.full_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{patient.mrn}</div>
                      </div>
                      <Badge variant="outline">{visitCount} visits</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {patient.phone || "-"} - Guardian {getGuardianContact(patient.notes) || "-"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card">
          {activePatient ? (
            <>
              <div className="border-b p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{activePatient.full_name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {activePatient.mrn} - {activePatient.phone || "No phone"} - Blood{" "}
                      {activePatient.blood_group || "-"}
                    </p>
                  </div>
                  <Badge className="bg-gradient-brand text-white">{timeline.length} events</Badge>
                </div>
              </div>

              <div className="space-y-4 p-5">
                {timeline.map((entry, index) => {
                  const Icon = entry.icon;
                  return (
                    <div key={entry.id} className="relative grid gap-4 sm:grid-cols-[2.25rem_1fr]">
                      <div className="relative flex justify-center">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-white">
                          <Icon className="h-4 w-4" />
                        </div>
                        {index < timeline.length - 1 && (
                          <div className="absolute top-10 h-full w-px bg-border" />
                        )}
                      </div>
                      <div className="rounded-xl border bg-muted/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{entry.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(entry.date).toLocaleString()}
                            </div>
                          </div>
                          <Badge className={typeTone[entry.type]}>
                            {entry.type.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{entry.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="p-10 text-center">
              <Activity className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <p className="mt-3 text-sm text-muted-foreground">
                Select a patient to view EMR timeline.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
