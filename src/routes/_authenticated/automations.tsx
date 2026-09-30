import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  BotMessageSquare,
  CalendarClock,
  FileText,
  MessageCircle,
  Pill,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  buildAppointmentNotes,
  getAppointmentDoctorName,
  getWhatsAppHref,
  parseAppointmentWorkflow,
} from "@/lib/appointment-workflow";
import { isMissingRelationError, missingSchemaMessage } from "@/lib/supabase-errors";

export const Route = createFileRoute("/_authenticated/automations")({
  component: AutomationsPage,
});

type PatientMini = Pick<Tables<"patients">, "id" | "full_name" | "mrn" | "phone">;
type AppointmentWithPatient = Tables<"appointments"> & {
  patients: PatientMini | null;
};

type AutomationTask = {
  id: string;
  title: string;
  type: "appointment" | "follow_up" | "missed" | "prescription" | "lab" | "medicine";
  appointment: AppointmentWithPatient;
  message: string;
  icon: typeof BellRing;
};

const taskTone: Record<AutomationTask["type"], string> = {
  appointment: "border-blue-200 bg-blue-50 text-blue-700",
  follow_up: "border-teal-200 bg-teal-50 text-teal-700",
  missed: "border-amber-200 bg-amber-50 text-amber-700",
  prescription: "border-purple-200 bg-purple-50 text-purple-700",
  lab: "border-cyan-200 bg-cyan-50 text-cyan-700",
  medicine: "border-rose-200 bg-rose-50 text-rose-700",
};

function patientName(appointment: AppointmentWithPatient) {
  return appointment.patients?.full_name || "Patient";
}

function buildTasks(appointments: AppointmentWithPatient[]): AutomationTask[] {
  const now = new Date();
  const next24Hours = now.getTime() + 24 * 60 * 60 * 1000;
  const tasks: AutomationTask[] = [];

  appointments.forEach((appointment) => {
    const scheduledAt = new Date(appointment.scheduled_at);
    const doctor = getAppointmentDoctorName(appointment);
    const patient = patientName(appointment);
    const meta = parseAppointmentWorkflow(appointment.notes);

    if (
      scheduledAt.getTime() >= now.getTime() &&
      scheduledAt.getTime() <= next24Hours &&
      appointment.status !== "cancelled"
    ) {
      tasks.push({
        id: `${appointment.id}:appointment`,
        title: "Appointment reminder",
        type: "appointment",
        appointment,
        icon: CalendarClock,
        message: `Hello ${patient}, this is a reminder for your appointment with ${doctor} on ${scheduledAt.toLocaleString()}. Please arrive 10 minutes early.`,
      });
    }

    if (
      scheduledAt.getTime() < now.getTime() &&
      (appointment.status === "scheduled" ||
        appointment.status === "confirmed" ||
        appointment.status === "no_show")
    ) {
      tasks.push({
        id: `${appointment.id}:missed`,
        title: "Missed appointment recovery",
        type: "missed",
        appointment,
        icon: BellRing,
        message: `Hello ${patient}, we noticed you missed your appointment with ${doctor}. Reply here or call reception to reschedule.`,
      });
    }

    if (appointment.status === "completed") {
      tasks.push({
        id: `${appointment.id}:follow-up`,
        title: "Revisit reminder",
        type: "follow_up",
        appointment,
        icon: BellRing,
        message: `Hello ${patient}, this is a follow-up reminder after your visit with ${doctor}. Please schedule a revisit if symptoms continue.`,
      });
      tasks.push({
        id: `${appointment.id}:prescription`,
        title: "Prescription PDF",
        type: "prescription",
        appointment,
        icon: FileText,
        message: `Hello ${patient}, your prescription PDF from ${doctor} is ready. Please contact reception if you need it resent.`,
      });
    }

    if (meta.labReport && meta.labReport !== "Pending") {
      tasks.push({
        id: `${appointment.id}:lab`,
        title: "Lab report message",
        type: "lab",
        appointment,
        icon: FileText,
        message: `Hello ${patient}, your lab report is ready. Please contact the lab desk or open your patient portal for details.`,
      });
    }

    tasks.push({
      id: `${appointment.id}:medicine`,
      title: "Medicine reminder",
      type: "medicine",
      appointment,
      icon: Pill,
      message: `Hello ${patient}, please take your prescribed medicines as advised by ${doctor}. Reply if you need pharmacy support.`,
    });
  });

  return tasks.slice(0, 24);
}

function parseChatbotCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed) return null;
  const doctor = trimmed.match(/dr\.?\s+([a-z\s]+)/i)?.[0]?.trim() ?? "doctor not detected";
  const when = /tomorrow/i.test(trimmed)
    ? "tomorrow"
    : /today/i.test(trimmed)
      ? "today"
      : "date not detected";
  const intent = /book|appointment|schedule/i.test(trimmed)
    ? "Book appointment"
    : /report|lab/i.test(trimmed)
      ? "Lab report request"
      : /medicine|tablet|dose/i.test(trimmed)
        ? "Medicine reminder"
        : "General patient reply";
  return { intent, doctor, when };
}

function AutomationsPage() {
  const { data: access } = useRoleAccess();
  const qc = useQueryClient();
  const [chatPrompt, setChatPrompt] = useState("Book appointment with Dr Shah tomorrow");

  const { data: appointments = [], isLoading } = useQuery<AppointmentWithPatient[]>({
    queryKey: ["automation-appointments"],
    enabled: access?.permissions.canManageAutomations ?? false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, full_name, mrn, phone)")
        .order("scheduled_at", { ascending: false })
        .limit(80);
      if (error && !isMissingRelationError(error)) throw error;
      if (error) return [];
      return (data ?? []) as AppointmentWithPatient[];
    },
  });

  const tasks = useMemo(() => buildTasks(appointments), [appointments]);
  const parsedCommand = parseChatbotCommand(chatPrompt);

  const logMutation = useMutation({
    mutationFn: async (task: AutomationTask) => {
      const { error } = await supabase
        .from("appointments")
        .update({
          notes: buildAppointmentNotes(task.appointment.notes, {
            followUpPlan: `${task.title} prepared at ${new Date().toLocaleString()}`,
          }),
        })
        .eq("id", task.appointment.id);
      if (error) {
        if (isMissingRelationError(error))
          throw new Error(missingSchemaMessage("Automation logging"));
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Automation activity logged");
      qc.invalidateQueries({ queryKey: ["automation-appointments"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!(access?.permissions.canManageAutomations ?? false)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Automations restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          WhatsApp and follow-up automation controls are available for admin and front-desk roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Follow-up & WhatsApp Automation</h1>
        <p className="mt-1 text-muted-foreground">
          Prepare appointment reminders, prescription PDFs, lab report messages, missed appointment
          recovery, medicine reminders, and AI chatbot replies.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{access?.copy.label ?? "Role"}</Badge>
          <span>WhatsApp provider credentials are required for unattended automatic sending.</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Appointment reminders", tasks.filter((task) => task.type === "appointment").length],
          ["Missed recovery", tasks.filter((task) => task.type === "missed").length],
          ["Follow-up tasks", tasks.filter((task) => task.type === "follow_up").length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[18px] border bg-card p-5 shadow-sm">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-3 text-3xl font-bold text-heading">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[18px] border bg-card shadow-sm">
          <div className="border-b p-4">
            <h2 className="font-semibold">Automation worklist</h2>
            <p className="text-sm text-muted-foreground">
              Each task opens WhatsApp with a prepared message and can be logged back to the visit.
            </p>
          </div>
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Loading automation tasks...
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No automation tasks are due from recent appointments.
            </div>
          ) : (
            <div className="divide-y">
              {tasks.map((task) => {
                const Icon = task.icon;
                const href = getWhatsAppHref(task.appointment.patients?.phone, task.message);
                return (
                  <div key={task.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className="h-4 w-4 text-brand-blue" />
                        <h3 className="font-semibold">{task.title}</h3>
                        <Badge className={taskTone[task.type]}>{task.type.replace("_", " ")}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {task.appointment.patients?.full_name} -{" "}
                        {task.appointment.patients?.phone || "No phone saved"}
                      </div>
                      <p className="mt-2 text-sm">{task.message}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <Button asChild size="sm" disabled={!href}>
                        <a href={href || "#"} target="_blank" rel="noreferrer">
                          <MessageCircle className="mr-2 h-4 w-4" />
                          WhatsApp
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={logMutation.isPending}
                        onClick={() => logMutation.mutate(task)}
                      >
                        Log prepared
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[18px] border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <BotMessageSquare className="h-5 w-5 text-brand-blue" />
              <h2 className="font-semibold">WhatsApp AI chatbot draft</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Type a patient message to preview booking intent extraction before connecting an AI
              provider.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Incoming WhatsApp message</Label>
                <Textarea
                  rows={3}
                  value={chatPrompt}
                  onChange={(event) => setChatPrompt(event.target.value)}
                />
              </div>
              {parsedCommand && (
                <div className="rounded-xl border bg-muted/60 p-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Intent:</span> {parsedCommand.intent}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Doctor:</span> {parsedCommand.doctor}
                  </div>
                  <div>
                    <span className="text-muted-foreground">When:</span> {parsedCommand.when}
                  </div>
                </div>
              )}
              <Button asChild className="w-full bg-gradient-brand text-white">
                <Link to="/appointments">Create appointment from draft</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[18px] border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-brand-red" />
              <h2 className="font-semibold">Configured CRM reminders</h2>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              {[
                "Appointment reminders",
                "Vaccination reminders",
                "Revisit reminders",
                "Missed appointment recovery",
                "Prescription PDFs",
                "Lab reports",
                "Medicine reminders",
                "Auto chatbot replies",
              ].map((rule) => (
                <div key={rule} className="flex items-center justify-between rounded-lg border p-3">
                  <span>{rule}</span>
                  <Badge variant="outline">Workflow ready</Badge>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Background auto-send needs a WhatsApp Business provider webhook and scheduled job.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
