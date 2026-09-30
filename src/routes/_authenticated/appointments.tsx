import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Pencil, Plus, QrCode, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  buildAppointmentNotes,
  formatAppointmentWindow,
  getAppointmentDoctorName,
  getAppointmentToken,
} from "@/lib/appointment-workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { isMissingRelationError, missingSchemaMessage } from "@/lib/supabase-errors";

export const Route = createFileRoute("/_authenticated/appointments")({
  component: AppointmentsPage,
});

type AppointmentStatus = Tables<"appointments">["status"];
type PatientOption = Pick<Tables<"patients">, "id" | "full_name" | "mrn" | "phone">;
type DoctorOption = Pick<Tables<"profiles">, "id" | "full_name" | "phone">;
type AppointmentWithPatient = Tables<"appointments"> & {
  patients: PatientOption | null;
};
type AppointmentFormValues = {
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: string;
  doctor_name: string;
  notification_phone: string;
  reason: string;
  visit_notes: string;
  status: AppointmentStatus;
};
type AppointmentCreatePayload = TablesInsert<"appointments"> & {
  doctor_name: string;
  notification_phone: string;
  patient_name: string;
};
type AppointmentCreateResult = {
  phoneStatus: "not_requested" | "sent" | "provider_not_configured" | "failed";
};

const statusColors: Record<AppointmentStatus, string> = {
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  confirmed: "border-teal-200 bg-teal-50 text-teal-700",
  completed: "border-green-200 bg-green-50 text-green-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
  no_show: "border-red-200 bg-red-50 text-red-700",
};

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function AppointmentsPage() {
  const { user } = useAuth();
  const { data: access } = useRoleAccess();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editAppointment, setEditAppointment] = useState<AppointmentWithPatient | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState("30");
  const [editStatus, setEditStatus] = useState<AppointmentStatus>("scheduled");

  const { data: appts = [], isLoading } = useQuery<AppointmentWithPatient[]>({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, full_name, mrn, phone)")
        .order("scheduled_at", { ascending: true });
      if (error && !isMissingRelationError(error)) throw error;
      if (error) return [];
      return (data ?? []) as AppointmentWithPatient[];
    },
  });

  const { data: patients = [] } = useQuery<PatientOption[]>({
    queryKey: ["patients-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, full_name, mrn, phone")
        .order("full_name");
      return (data ?? []) as PatientOption[];
    },
  });

  const { data: doctors = [] } = useQuery<DoctorOption[]>({
    queryKey: ["doctor-options"],
    queryFn: async () => {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "doctor");
      if (roleError && !isMissingRelationError(roleError)) throw roleError;
      if (roleError) return [];

      const ids = [...new Set((roleRows ?? []).map((row) => row.user_id))];
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", ids)
        .order("full_name");
      if (error && !isMissingRelationError(error)) throw error;
      if (error) return [];
      return data ?? [];
    },
  });

  const todayAppointments = useMemo(() => {
    const today = todayInputDate();
    return appts.filter((appointment) => appointment.scheduled_at.slice(0, 10) === today);
  }, [appts]);

  const createMut = useMutation<AppointmentCreateResult, Error, AppointmentCreatePayload>({
    mutationFn: async (form) => {
      const { doctor_name, notification_phone, patient_name, ...appointment } = form;
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          ...appointment,
          created_by: user!.id,
        })
        .select("id, patient_id, scheduled_at")
        .single();
      if (error) {
        if (isMissingRelationError(error))
          throw new Error(missingSchemaMessage("Appointment scheduling"));
        throw error;
      }

      if (data) {
        const when = format(new Date(appointment.scheduled_at), "MMM d, yyyy h:mm a");
        const notificationBody = `${patient_name} is scheduled with ${doctor_name} on ${when}.`;
        if (appointment.doctor_id) {
          const { error: notificationError } = await supabase.from("notifications").insert({
            recipient_id: appointment.doctor_id,
            actor_id: user!.id,
            appointment_id: data.id,
            patient_id: appointment.patient_id,
            channel: notification_phone ? "in_app_phone_ready" : "in_app",
            recipient_phone: notification_phone || null,
            title: "New appointment booked",
            body: notificationBody,
            metadata: {
              patient_name,
              doctor_name,
              notification_phone,
              phone_provider_status: notification_phone ? "ready_for_provider" : "not_requested",
            },
          });
          if (notificationError && !isMissingRelationError(notificationError)) {
            throw notificationError;
          }
        }

        if (notification_phone) {
          try {
            // Authentication is handled via the careorbit_session cookie (credentials: "include").
            // No Bearer token needed — the MySQL session cookie is sent automatically.
            const phoneResponse = await fetch("/api/appointment-notification", {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                phone: notification_phone,
                message: `CareOrbit: ${notificationBody}`,
              }),
            });
            if (phoneResponse.ok) return { phoneStatus: "sent" };
            const phoneResult = (await phoneResponse.json()) as { code?: string };
            if (phoneResult.code === "PROVIDER_NOT_CONFIGURED") {
              return { phoneStatus: "provider_not_configured" };
            }
            return { phoneStatus: "failed" };
          } catch {
            return { phoneStatus: "failed" };
          }
        }
      }
      return { phoneStatus: "not_requested" };
    },
    onSuccess: ({ phoneStatus }) => {
      toast.success("Appointment scheduled");
      if (phoneStatus === "sent") toast.success("Phone notification sent");
      if (phoneStatus === "provider_not_configured") {
        toast.info("In-app alert created. Phone provider setup is still required.");
      }
      if (phoneStatus === "failed") {
        toast.warning("Appointment saved, but the phone notification could not be sent.");
      }
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editAppointment) throw new Error("Select an appointment");
      const scheduledAt = new Date(`${editDate}T${editTime}`).toISOString();
      const { error } = await supabase
        .from("appointments")
        .update({
          scheduled_at: scheduledAt,
          duration_minutes: Number(editDuration),
          status: editStatus,
        })
        .eq("id", editAppointment.id);
      if (error) throw error;

      if (editAppointment.doctor_id) {
        const isCancelled = editStatus === "cancelled";
        const title = isCancelled ? "Appointment cancelled" : "Appointment updated";
        const body = `${editAppointment.patients?.full_name ?? "Patient"} appointment is ${
          isCancelled
            ? "cancelled"
            : `now scheduled for ${format(new Date(scheduledAt), "MMM d, yyyy h:mm a")}`
        }.`;
        const { error: notificationError } = await supabase.from("notifications").insert({
          recipient_id: editAppointment.doctor_id,
          actor_id: user!.id,
          appointment_id: editAppointment.id,
          patient_id: editAppointment.patient_id,
          title,
          body,
          channel: "in_app",
          metadata: { status: editStatus, scheduled_at: scheduledAt },
        });
        if (notificationError) throw notificationError;
      }
    },
    onSuccess: () => {
      toast.success(editStatus === "cancelled" ? "Appointment cancelled" : "Appointment updated");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setEditAppointment(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openEdit = (appointment: AppointmentWithPatient) => {
    const date = new Date(appointment.scheduled_at);
    setEditAppointment(appointment);
    setEditDate(format(date, "yyyy-MM-dd"));
    setEditTime(format(date, "HH:mm"));
    setEditDuration(String(appointment.duration_minutes));
    setEditStatus(appointment.status);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Appointments</h1>
          <p className="mt-1 text-muted-foreground">
            Schedule consultations with doctor name, date, time, duration, and queue context.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{access?.copy.label ?? "Role"}</Badge>
            <span>
              {access?.permissions.canScheduleAppointments
                ? "Can create appointments under current role rights."
                : "Appointment scheduling is not available for this role."}
            </span>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-gradient-brand text-white hover:opacity-90"
              disabled={
                patients.length === 0 || !(access?.permissions.canScheduleAppointments ?? true)
              }
            >
              <Plus className="mr-2 h-4 w-4" /> New appointment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>New appointment</DialogTitle>
              <DialogDescription>
                Select a patient, doctor, appointment date, appointment time, duration, and problem
                brief.
              </DialogDescription>
            </DialogHeader>
            <ApptForm
              patients={patients}
              doctors={doctors}
              loading={createMut.isPending}
              queuePosition={todayAppointments.length + 1}
              onSubmit={(d) => createMut.mutate(d)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[18px] border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4 text-brand-blue" />
            Today's schedule
          </div>
          <div className="mt-3 text-3xl font-bold text-heading">{todayAppointments.length}</div>
        </div>
        <div className="rounded-[18px] border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4 text-brand-red" />
            Default slot
          </div>
          <div className="mt-3 text-3xl font-bold text-heading">30 min</div>
        </div>
        <div className="rounded-[18px] border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <QrCode className="h-4 w-4 text-brand-blue" />
            Queue tokens
          </div>
          <div className="mt-3 text-3xl font-bold text-heading">Auto</div>
        </div>
      </div>

      {patients.length === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/60 p-4 text-sm text-muted-foreground">
          Add a patient first to schedule appointments.
        </div>
      )}

      <div className="rounded-[18px] border bg-card shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : appts.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No appointments yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date / time</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3 hidden lg:table-cell">Doctor</th>
                <th className="px-4 py-3 hidden md:table-cell">Problem / disease brief</th>
                <th className="px-4 py-3 hidden lg:table-cell">Queue</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {appts.map((appointment, index) => (
                <tr key={appointment.id} className="border-t hover:bg-primary-soft/60">
                  <td className="px-4 py-3 font-medium">
                    {format(new Date(appointment.scheduled_at), "MMM d, yyyy")}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(appointment.scheduled_at), "h:mm a")} -{" "}
                      {appointment.duration_minutes} min
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {appointment.patients?.full_name}
                    <div className="font-mono text-xs text-muted-foreground">
                      {appointment.patients?.mrn}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-brand-blue" />
                      {getAppointmentDoctorName(appointment)}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden max-w-xs md:table-cell text-muted-foreground">
                    {appointment.reason || "-"}
                    <div className="mt-1 text-xs">{formatAppointmentWindow(appointment)}</div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <Badge variant="outline">{getAppointmentToken(appointment, index)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={statusColors[appointment.status]}>
                      {appointment.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Reschedule or cancel"
                      disabled={!(access?.permissions.canUpdateRecords ?? false)}
                      onClick={() => openEdit(appointment)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Dialog open={!!editAppointment} onOpenChange={(value) => !value && setEditAppointment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update appointment</DialogTitle>
            <DialogDescription>
              Reschedule, change duration, confirm, complete or cancel this appointment.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={editDate}
                onChange={(event) => setEditDate(event.target.value)}
              />
            </div>
            <div>
              <Label>Time</Label>
              <Input
                type="time"
                value={editTime}
                onChange={(event) => setEditTime(event.target.value)}
              />
            </div>
            <div>
              <Label>Duration</Label>
              <Input
                type="number"
                min={5}
                step={5}
                value={editDuration}
                onChange={(event) => setEditDuration(event.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={editStatus}
                onValueChange={(value) => setEditStatus(value as AppointmentStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      "scheduled",
                      "confirmed",
                      "completed",
                      "cancelled",
                      "no_show",
                    ] as AppointmentStatus[]
                  ).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => updateMut.mutate()}
              disabled={updateMut.isPending || !editDate || !editTime}
              className="bg-gradient-brand text-white"
            >
              {updateMut.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApptForm({
  patients,
  doctors,
  onSubmit,
  loading,
  queuePosition,
}: {
  patients: PatientOption[];
  doctors: DoctorOption[];
  onSubmit: (d: AppointmentCreatePayload) => void;
  loading: boolean;
  queuePosition: number;
}) {
  const [form, setForm] = useState<AppointmentFormValues>({
    patient_id: "",
    doctor_id: "",
    appointment_date: todayInputDate(),
    appointment_time: "",
    duration_minutes: "30",
    doctor_name: "",
    notification_phone: "",
    reason: "",
    visit_notes: "",
    status: "scheduled",
  });
  const update = <K extends keyof AppointmentFormValues>(k: K, v: AppointmentFormValues[K]) =>
    setForm({ ...form, [k]: v });
  const selectedDoctor = doctors.find((doctor) => doctor.id === form.doctor_id);
  const selectedPatient = patients.find((patient) => patient.id === form.patient_id);
  const phoneRequired = !selectedDoctor?.phone;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const scheduledAt = new Date(`${form.appointment_date}T${form.appointment_time}`);
        onSubmit({
          patient_id: form.patient_id,
          doctor_id: form.doctor_id || null,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: Number(form.duration_minutes),
          reason: form.reason,
          status: form.status,
          doctor_name: form.doctor_name,
          notification_phone: form.notification_phone,
          patient_name: selectedPatient?.full_name ?? "Patient",
          notes: buildAppointmentNotes(form.visit_notes, {
            doctorName: form.doctor_name,
            doctorNotificationPhone: form.notification_phone || "Not provided",
            token: `Q-${form.appointment_date.replaceAll("-", "").slice(4)}-${String(
              queuePosition,
            ).padStart(3, "0")}`,
            prescriptionPdf: "Pending",
            labReport: "Pending",
            medicineReminder: "Not scheduled",
          }),
        });
      }}
      className="space-y-4"
    >
      <div>
        <Label>Patient *</Label>
        <Select value={form.patient_id} onValueChange={(v) => update("patient_id", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select patient" />
          </SelectTrigger>
          <SelectContent>
            {patients.map((patient) => (
              <SelectItem key={patient.id} value={patient.id}>
                {patient.full_name} ({patient.mrn})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Doctor name *</Label>
        {doctors.length > 0 ? (
          <Select
            value={form.doctor_id || "__manual__"}
            onValueChange={(value) => {
              if (value === "__manual__") {
                setForm({
                  ...form,
                  doctor_id: "",
                  doctor_name: "",
                  notification_phone: "",
                });
                return;
              }

              const doctor = doctors.find((item) => item.id === value);
              setForm({
                ...form,
                doctor_id: value,
                doctor_name: doctor?.full_name || "Doctor",
                notification_phone: doctor?.phone || form.notification_phone,
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select doctor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__manual__">Manual doctor name</SelectItem>
              {doctors.map((doctor) => (
                <SelectItem key={doctor.id} value={doctor.id}>
                  {doctor.full_name || "Doctor"} {doctor.phone ? `(${doctor.phone})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            required
            value={form.doctor_name}
            onChange={(e) => update("doctor_name", e.target.value)}
            placeholder="e.g. Dr Shah"
          />
        )}
        {doctors.length > 0 && !form.doctor_id && (
          <Input
            required
            className="mt-2"
            value={form.doctor_name}
            onChange={(e) => update("doctor_name", e.target.value)}
            placeholder="e.g. Dr Shah"
          />
        )}
      </div>
      <div>
        <Label>Notification number {phoneRequired ? "*" : ""}</Label>
        <Input
          required={phoneRequired}
          type="tel"
          value={form.notification_phone}
          onChange={(e) => update("notification_phone", e.target.value)}
          placeholder="Phone / WhatsApp number"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Appointment date *</Label>
          <Input
            type="date"
            required
            value={form.appointment_date}
            onChange={(e) => update("appointment_date", e.target.value)}
          />
        </div>
        <div>
          <Label>Appointment time *</Label>
          <Input
            type="time"
            required
            value={form.appointment_time}
            onChange={(e) => update("appointment_time", e.target.value)}
          />
        </div>
        <div>
          <Label>Duration (min)</Label>
          <Input
            type="number"
            min={5}
            step={5}
            value={form.duration_minutes}
            onChange={(e) => update("duration_minutes", e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Patient problem / disease brief</Label>
        <Textarea
          rows={3}
          value={form.reason}
          onChange={(e) => update("reason", e.target.value)}
          placeholder="e.g. Fever for 3 days, diabetes follow-up, post-surgery review"
        />
      </div>
      <div>
        <Label>Internal appointment notes</Label>
        <Textarea
          rows={2}
          value={form.visit_notes}
          onChange={(e) => update("visit_notes", e.target.value)}
          placeholder="Optional reception or clinical notes"
        />
      </div>
      <DialogFooter>
        <Button
          type="submit"
          disabled={
            loading ||
            !form.patient_id ||
            !form.appointment_time ||
            !form.doctor_name ||
            (phoneRequired && !form.notification_phone)
          }
          className="bg-gradient-brand text-white hover:opacity-90"
        >
          {loading ? "Saving..." : "Schedule appointment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
