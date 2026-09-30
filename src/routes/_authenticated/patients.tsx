import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Search, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isMissingRelationError, missingSchemaMessage } from "@/lib/supabase-errors";

export const Route = createFileRoute("/_authenticated/patients")({
  component: PatientsPage,
});

type PatientRow = Tables<"patients">;
type AppointmentRow = Tables<"appointments">;
type PatientFormValues = {
  full_name: string;
  date_of_birth: string;
  gender: string;
  doctor_name: string;
  phone: string;
  emergency_contact_number: string;
  email: string;
  address: string;
  blood_group: string;
  allergies: string;
  case_fee: string;
  sonography_fee: string;
  notes: string;
};
type PatientCreatePayload = Pick<
  TablesInsert<"patients">,
  | "full_name"
  | "date_of_birth"
  | "gender"
  | "phone"
  | "email"
  | "address"
  | "blood_group"
  | "allergies"
  | "case_fee"
  | "sonography_fee"
  | "notes"
>;

const guardianContactPrefix = "Guardian emergency contact:";
const doctorNamePrefix = "Assigned doctor:";

function formatPatientNotes(notes: string, emergencyContactNumber: string, doctorName: string) {
  return [
    emergencyContactNumber.trim()
      ? `${guardianContactPrefix} ${emergencyContactNumber.trim()}`
      : "",
    doctorName.trim() ? `${doctorNamePrefix} ${doctorName.trim()}` : "",
    notes.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getGuardianContact(notes: string | null) {
  const match = notes?.match(/^Guardian emergency contact:\s*(.+)$/im);
  return match?.[1] ?? "";
}

function getAssignedDoctor(notes: string | null) {
  const match = notes?.match(/^Assigned doctor:\s*(.+)$/im);
  return match?.[1] ?? "";
}

function PatientsPage() {
  const { user } = useAuth();
  const { data: access } = useRoleAccess();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [historyPatient, setHistoryPatient] = useState<PatientRow | null>(null);

  const { data: patients = [], isLoading } = useQuery<PatientRow[]>({
    queryKey: ["patients"],
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

  const filtered = patients.filter((patient) => {
    const term = search.toLowerCase();
    return (
      patient.full_name.toLowerCase().includes(term) ||
      patient.mrn.toLowerCase().includes(term) ||
      (patient.phone ?? "").toLowerCase().includes(term) ||
      getGuardianContact(patient.notes).toLowerCase().includes(term) ||
      getAssignedDoctor(patient.notes).toLowerCase().includes(term)
    );
  });

  const { data: historyAppointments = [] } = useQuery<AppointmentRow[]>({
    queryKey: ["patient-history-appointments", historyPatient?.id],
    enabled: !!historyPatient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("patient_id", historyPatient!.id)
        .order("scheduled_at", { ascending: false });
      if (error && !isMissingRelationError(error)) throw error;
      if (error) return [];
      return data ?? [];
    },
  });

  const createMut = useMutation<void, Error, PatientCreatePayload>({
    mutationFn: async (form) => {
      const { error } = await supabase.from("patients").insert({ ...form, created_by: user!.id });
      if (error) {
        if (isMissingRelationError(error))
          throw new Error(missingSchemaMessage("Patient registration"));
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Patient added");
      qc.invalidateQueries({ queryKey: ["patients"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Patients</h1>
          <p className="mt-1 text-muted-foreground">Manage all patient records.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{access?.copy.label ?? "Role"}</Badge>
            <span>
              {access?.permissions.canCreatePatients
                ? "Can register patients and assign doctor names."
                : "Patient registration is not available for this role."}
            </span>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-gradient-brand text-white hover:opacity-90"
              disabled={!(access?.permissions.canCreatePatients ?? true)}
            >
              <Plus className="mr-2 h-4 w-4" /> New patient
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add patient</DialogTitle>
              <DialogDescription>
                Register demographics, doctor name, guardian contact, and patient notes.
              </DialogDescription>
            </DialogHeader>
            <PatientForm onSubmit={(d) => createMut.mutate(d)} loading={createMut.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, MRN, phone, doctor or guardian"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-[18px] border bg-card shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <User className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No patients yet. Add your first one.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">MRN</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 hidden md:table-cell">DOB</th>
                <th className="px-4 py-3 hidden md:table-cell">Phone</th>
                <th className="px-4 py-3 hidden lg:table-cell">Guardian</th>
                <th className="px-4 py-3 hidden lg:table-cell">Doctor</th>
                <th className="px-4 py-3 hidden xl:table-cell">Blood</th>
                <th className="px-4 py-3 text-right">History</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((patient) => (
                <tr key={patient.id} className="border-t hover:bg-primary-soft/60">
                  <td className="px-4 py-3 font-mono text-xs">{patient.mrn}</td>
                  <td className="px-4 py-3 font-medium">{patient.full_name}</td>
                  <td className="px-4 py-3 hidden md:table-cell">{patient.date_of_birth || "-"}</td>
                  <td className="px-4 py-3 hidden md:table-cell">{patient.phone || "-"}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {getGuardianContact(patient.notes) || "-"}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {getAssignedDoctor(patient.notes) || "-"}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">{patient.blood_group || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!(access?.permissions.canViewPatientHistory ?? true)}
                      onClick={() => setHistoryPatient(patient)}
                    >
                      View data
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Dialog open={!!historyPatient} onOpenChange={(value) => !value && setHistoryPatient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Patient history</DialogTitle>
            <DialogDescription>
              Patient data view for doctor and approved clinical/admin roles.
            </DialogDescription>
          </DialogHeader>
          {historyPatient && (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border bg-muted/60 p-4">
                <div className="font-semibold">{historyPatient.full_name}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {historyPatient.mrn}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>Phone: {historyPatient.phone || "-"}</div>
                  <div>Guardian: {getGuardianContact(historyPatient.notes) || "-"}</div>
                  <div>Doctor: {getAssignedDoctor(historyPatient.notes) || "-"}</div>
                  <div>Blood: {historyPatient.blood_group || "-"}</div>
                  <div>Case fees: {historyPatient.case_fee ?? "-"}</div>
                  <div>Sonography fees: {historyPatient.sonography_fee ?? "-"}</div>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <CalendarDays className="h-4 w-4 text-brand-blue" />
                  Appointment history
                </div>
                {historyAppointments.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-muted-foreground">
                    No appointments found for this patient.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyAppointments.map((appointment) => (
                      <div key={appointment.id} className="rounded-lg border p-3">
                        <div className="font-medium">
                          {new Date(appointment.scheduled_at).toLocaleString()}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {appointment.reason || "No problem brief saved."}
                        </div>
                        <Badge variant="secondary" className="mt-2">
                          {appointment.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PatientForm({
  onSubmit,
  loading,
}: {
  onSubmit: (d: PatientCreatePayload) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<PatientFormValues>({
    full_name: "",
    date_of_birth: "",
    gender: "",
    doctor_name: "",
    phone: "",
    emergency_contact_number: "",
    email: "",
    address: "",
    blood_group: "",
    allergies: "",
    case_fee: "",
    sonography_fee: "",
    notes: "",
  });
  const update = (k: keyof PatientFormValues, v: string) => setForm({ ...form, [k]: v });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          full_name: form.full_name,
          gender: form.gender,
          phone: form.phone,
          email: form.email,
          address: form.address,
          blood_group: form.blood_group,
          allergies: form.allergies,
          case_fee: form.case_fee === "" ? null : Number(form.case_fee),
          sonography_fee: form.sonography_fee === "" ? null : Number(form.sonography_fee),
          notes: formatPatientNotes(form.notes, form.emergency_contact_number, form.doctor_name),
          date_of_birth: form.date_of_birth || null,
        });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="col-span-2">
          <Label>Full name *</Label>
          <Input
            required
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
          />
        </div>
        <div>
          <Label>Date of birth</Label>
          <Input
            type="date"
            value={form.date_of_birth}
            onChange={(e) => update("date_of_birth", e.target.value)}
          />
        </div>
        <div>
          <Label>Gender</Label>
          <Select value={form.gender} onValueChange={(v) => update("gender", v)}>
            <SelectTrigger>
              <SelectValue placeholder="-" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        </div>
        <div>
          <Label>Doctor name</Label>
          <Input
            value={form.doctor_name}
            onChange={(e) => update("doctor_name", e.target.value)}
            placeholder="e.g. Dr. Mehta"
          />
        </div>
        <div>
          <Label>Guardian emergency contact</Label>
          <Input
            type="tel"
            value={form.emergency_contact_number}
            onChange={(e) => update("emergency_contact_number", e.target.value)}
            placeholder="Guardian contact number"
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>
        <div>
          <Label>Blood group</Label>
          <Input
            value={form.blood_group}
            onChange={(e) => update("blood_group", e.target.value)}
            placeholder="e.g. O+"
          />
        </div>
        <div>
          <Label>Allergies</Label>
          <Input value={form.allergies} onChange={(e) => update("allergies", e.target.value)} />
        </div>
        <div>
          <Label>Case fees (optional)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.case_fee}
            onChange={(e) => update("case_fee", e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label>Sonography fees (optional)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.sonography_fee}
            onChange={(e) => update("sonography_fee", e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>
      <div>
        <Label>Address</Label>
        <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
      </div>
      <DialogFooter>
        <Button
          type="submit"
          disabled={loading}
          className="bg-gradient-brand text-white hover:opacity-90"
        >
          {loading ? "Saving..." : "Save patient"}
        </Button>
      </DialogFooter>
    </form>
  );
}
