import type { Tables } from "@/integrations/supabase/types";

export type AppointmentWorkflowMeta = {
  doctorName: string;
  doctorNotificationPhone: string;
  token: string;
  checkInMethod: string;
  checkedInAt: string;
  prescriptionPdf: string;
  labReport: string;
  medicineReminder: string;
  followUpPlan: string;
};

const workflowLabels = {
  doctorName: "Doctor name",
  doctorNotificationPhone: "Doctor notification phone",
  token: "Queue token",
  checkInMethod: "Check-in method",
  checkedInAt: "Checked in at",
  prescriptionPdf: "Prescription PDF",
  labReport: "Lab report",
  medicineReminder: "Medicine reminder",
  followUpPlan: "Follow-up plan",
} satisfies Record<keyof AppointmentWorkflowMeta, string>;

const workflowLinePattern = new RegExp(
  `^(${Object.values(workflowLabels)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")}):\\s*.*$`,
  "gim",
);

export function getWorkflowValue(notes: string | null | undefined, label: string) {
  const match = notes?.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

export function parseAppointmentWorkflow(
  notes: string | null | undefined,
): AppointmentWorkflowMeta {
  return {
    doctorName: getWorkflowValue(notes, workflowLabels.doctorName),
    doctorNotificationPhone: getWorkflowValue(notes, workflowLabels.doctorNotificationPhone),
    token: getWorkflowValue(notes, workflowLabels.token),
    checkInMethod: getWorkflowValue(notes, workflowLabels.checkInMethod),
    checkedInAt: getWorkflowValue(notes, workflowLabels.checkedInAt),
    prescriptionPdf: getWorkflowValue(notes, workflowLabels.prescriptionPdf),
    labReport: getWorkflowValue(notes, workflowLabels.labReport),
    medicineReminder: getWorkflowValue(notes, workflowLabels.medicineReminder),
    followUpPlan: getWorkflowValue(notes, workflowLabels.followUpPlan),
  };
}

export function stripWorkflowNotes(notes: string | null | undefined) {
  return (notes ?? "")
    .replace(workflowLinePattern, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function buildAppointmentNotes(
  existingNotes: string | null | undefined,
  meta: Partial<AppointmentWorkflowMeta>,
) {
  const clinicalNotes = stripWorkflowNotes(existingNotes);
  const merged = { ...parseAppointmentWorkflow(existingNotes), ...meta };
  const workflowLines = Object.entries(workflowLabels)
    .map(([key, label]) => {
      const value = merged[key as keyof AppointmentWorkflowMeta]?.trim();
      return value ? `${label}: ${value}` : "";
    })
    .filter(Boolean);

  return [clinicalNotes, ...workflowLines].filter(Boolean).join("\n");
}

export function getAppointmentDoctorName(
  appointment: Pick<Tables<"appointments">, "notes" | "doctor_id">,
) {
  return (
    parseAppointmentWorkflow(appointment.notes).doctorName || appointment.doctor_id || "Unassigned"
  );
}

export function getAppointmentToken(
  appointment: Pick<Tables<"appointments">, "notes" | "scheduled_at">,
  index: number,
) {
  const savedToken = parseAppointmentWorkflow(appointment.notes).token;
  if (savedToken) return savedToken;

  const date = new Date(appointment.scheduled_at);
  const day = Number.isNaN(date.getTime())
    ? "0000"
    : `${date.getMonth() + 1}`.padStart(2, "0") + `${date.getDate()}`.padStart(2, "0");
  return `Q-${day}-${String(index + 1).padStart(3, "0")}`;
}

export function getWhatsAppHref(phone: string | null | undefined, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function formatAppointmentWindow(
  appointment: Pick<Tables<"appointments">, "scheduled_at" | "duration_minutes">,
) {
  const start = new Date(appointment.scheduled_at);
  const end = new Date(start.getTime() + appointment.duration_minutes * 60_000);
  return `${start.toLocaleString()} - ${end.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
