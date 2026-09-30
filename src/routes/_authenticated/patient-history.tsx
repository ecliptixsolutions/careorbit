import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Search, ShieldAlert, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useRoleAccess } from "@/hooks/use-role-access";
import { isMissingRelationError } from "@/lib/supabase-errors";

export const Route = createFileRoute("/_authenticated/patient-history")({
  component: PatientHistoryPage,
});

type PatientRow = Tables<"patients">;
type AppointmentRow = Tables<"appointments">;

function getGuardianContact(notes: string | null) {
  const match = notes?.match(/^Guardian emergency contact:\s*(.+)$/im);
  return match?.[1] ?? "";
}

function getAssignedDoctor(notes: string | null) {
  const match = notes?.match(/^Assigned doctor:\s*(.+)$/im);
  return match?.[1] ?? "";
}

function PatientHistoryPage() {
  const { data: access } = useRoleAccess();
  const [number, setNumber] = useState("");

  const { data: patients = [], isLoading: patientsLoading } = useQuery<PatientRow[]>({
    queryKey: ["patient-history-patients"],
    enabled: access?.permissions.canViewPatientHistory ?? false,
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
    queryKey: ["patient-history-appointments", patientIds.join(",")],
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

  const filteredPatients = useMemo(() => {
    const term = number.trim().toLowerCase();
    if (!term) return patients;

    return patients.filter((patient) => {
      return (
        (patient.phone ?? "").toLowerCase().includes(term) ||
        getGuardianContact(patient.notes).toLowerCase().includes(term) ||
        patient.full_name.toLowerCase().includes(term) ||
        patient.mrn.toLowerCase().includes(term)
      );
    });
  }, [number, patients]);

  if (!(access?.permissions.canViewPatientHistory ?? false)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Patient history restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This screen is available for doctors, nurses, approved clinical roles, and admins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Patient History</h1>
        <p className="mt-1 text-muted-foreground">
          Doctor data view for searching patient history by patient or guardian number.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{access?.copy.label ?? "Role"}</Badge>
          <span>Search by mobile number, guardian number, MRN, or name.</span>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          placeholder="Enter patient or guardian number"
          className="pl-9"
        />
      </div>

      {patientsLoading ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading patient history...
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <UserRound className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <p className="mt-3 text-sm text-muted-foreground">No matching patient found.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredPatients.map((patient) => {
            const patientAppointments = appointments.filter(
              (appointment) => appointment.patient_id === patient.id,
            );

            return (
              <div key={patient.id} className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{patient.full_name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">{patient.mrn}</p>
                  </div>
                  <Badge variant="outline">{patientAppointments.length} visits</Badge>
                </div>
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div>Phone: {patient.phone || "-"}</div>
                  <div>Guardian: {getGuardianContact(patient.notes) || "-"}</div>
                  <div>Doctor: {getAssignedDoctor(patient.notes) || "-"}</div>
                  <div>Blood: {patient.blood_group || "-"}</div>
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <CalendarDays className="h-4 w-4 text-brand-blue" />
                    Appointments
                  </div>
                  {patientAppointments.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      No appointment history.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {patientAppointments.slice(0, 5).map((appointment) => (
                        <div key={appointment.id} className="rounded-lg border p-3 text-sm">
                          <div className="font-medium">
                            {new Date(appointment.scheduled_at).toLocaleString()}
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {appointment.reason || "No problem brief saved."}
                          </p>
                          <Badge variant="secondary" className="mt-2">
                            {appointment.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
