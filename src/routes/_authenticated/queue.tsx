import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock3,
  QrCode,
  ScanFace,
  ShieldAlert,
  Timer,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  buildAppointmentNotes,
  getAppointmentDoctorName,
  getAppointmentToken,
  parseAppointmentWorkflow,
} from "@/lib/appointment-workflow";
import { isMissingRelationError, missingSchemaMessage } from "@/lib/supabase-errors";

export const Route = createFileRoute("/_authenticated/queue")({
  component: QueuePage,
});

type PatientMini = Pick<Tables<"patients">, "id" | "full_name" | "mrn" | "phone">;
type QueueAppointment = Tables<"appointments"> & {
  patients: PatientMini | null;
};

type QueueRow = {
  appointment: QueueAppointment;
  token: string;
  predictedStart: Date;
  predictedWait: number;
};

const statusTone = {
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  confirmed: "border-teal-200 bg-teal-50 text-teal-700",
  completed: "border-green-200 bg-green-50 text-green-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
  no_show: "border-red-200 bg-red-50 text-red-700",
} satisfies Record<Tables<"appointments">["status"], string>;

function isToday(value: string) {
  return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function qrImageUrl(appointmentId: string) {
  const origin =
    typeof window === "undefined"
      ? "https://oehealth-erp-test.sharefile740-ludo.workers.dev"
      : window.location.origin;
  const payload = `${origin}/queue?checkin=${appointmentId}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(
    payload,
  )}`;
}

function QueuePage() {
  const { data: access } = useRoleAccess();
  const qc = useQueryClient();
  const [qrAppointment, setQrAppointment] = useState<QueueAppointment | null>(null);
  const [faceLookup, setFaceLookup] = useState("");
  const [checkInId, setCheckInId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCheckInId(new URLSearchParams(window.location.search).get("checkin") ?? "");
  }, []);

  const { data: appointments = [], isLoading } = useQuery<QueueAppointment[]>({
    queryKey: ["queue-appointments"],
    enabled: access?.permissions.canViewQueue ?? false,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, full_name, mrn, phone)")
        .gte("scheduled_at", start.toISOString())
        .lt("scheduled_at", end.toISOString())
        .order("scheduled_at", { ascending: true });
      if (error && !isMissingRelationError(error)) throw error;
      if (error) return [];
      return (data ?? []) as QueueAppointment[];
    },
  });

  const queueRows = useMemo<QueueRow[]>(() => {
    const now = new Date();
    let cursor = new Date(now);
    return appointments
      .filter((appointment) => isToday(appointment.scheduled_at))
      .map((appointment, index) => {
        const scheduled = new Date(appointment.scheduled_at);
        const predictedStart = new Date(Math.max(scheduled.getTime(), cursor.getTime()));
        const predictedWait = Math.max(
          0,
          Math.round((predictedStart.getTime() - now.getTime()) / 60_000),
        );
        cursor = new Date(predictedStart.getTime() + appointment.duration_minutes * 60_000);
        return {
          appointment,
          token: getAppointmentToken(appointment, index),
          predictedStart,
          predictedWait,
        };
      });
  }, [appointments]);

  const checkInTarget = queueRows.find((row) => row.appointment.id === checkInId);
  const faceMatches = queueRows.filter((row) => {
    const term = faceLookup.trim().toLowerCase();
    if (!term) return false;
    return (
      row.appointment.patients?.full_name.toLowerCase().includes(term) ||
      row.appointment.patients?.mrn.toLowerCase().includes(term) ||
      row.appointment.patients?.phone?.toLowerCase().includes(term)
    );
  });

  const updateAppointment = useMutation({
    mutationFn: async ({
      appointment,
      status,
      method,
    }: {
      appointment: QueueAppointment;
      status: Tables<"appointments">["status"];
      method?: string;
    }) => {
      const notes = method
        ? buildAppointmentNotes(appointment.notes, {
            token: getAppointmentToken(
              appointment,
              queueRows.findIndex((row) => row.appointment.id === appointment.id),
            ),
            checkInMethod: method,
            checkedInAt: new Date().toISOString(),
          })
        : appointment.notes;
      const { error } = await supabase
        .from("appointments")
        .update({ status, notes })
        .eq("id", appointment.id);
      if (error) {
        if (isMissingRelationError(error)) throw new Error(missingSchemaMessage("Queue updates"));
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Queue updated");
      qc.invalidateQueries({ queryKey: ["queue-appointments"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setCheckInId("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!(access?.permissions.canViewQueue ?? false)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Queue restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Queue, QR check-in, and waiting-time prediction are available only for approved roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Smart Queue</h1>
          <p className="mt-1 text-muted-foreground">
            Live token queue, QR reception check-in, and predicted waiting time for today's visits.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{access?.copy.label ?? "Role"}</Badge>
            <span>Queue prediction uses appointment order and duration.</span>
          </div>
        </div>
        <div className="rounded-[18px] border bg-gradient-brand px-5 py-4 text-white shadow-elegant">
          <div className="text-xs uppercase tracking-wide text-white/80">Live queue</div>
          <div className="mt-1 text-3xl font-bold">{queueRows.length}</div>
        </div>
      </div>

      {checkInTarget && (
        <div className="rounded-[18px] border border-green-200 bg-green-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">QR check-in detected</div>
              <p className="text-sm text-muted-foreground">
                {checkInTarget.appointment.patients?.full_name} - {checkInTarget.token}
              </p>
            </div>
            <Button
              disabled={
                updateAppointment.isPending || !(access?.permissions.canManageQueue ?? false)
              }
              onClick={() =>
                updateAppointment.mutate({
                  appointment: checkInTarget.appointment,
                  status: "confirmed",
                  method: "QR",
                })
              }
            >
              Confirm QR check-in
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-[18px] border bg-card shadow-sm">
          <div className="border-b p-4">
            <h2 className="font-semibold">Live queue screen</h2>
            <p className="text-sm text-muted-foreground">
              Share this screen at reception or on waiting-area display.
            </p>
          </div>
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading queue...</div>
          ) : queueRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No appointments scheduled today.
            </div>
          ) : (
            <div className="divide-y">
              {queueRows.map(({ appointment, token, predictedStart, predictedWait }) => {
                const meta = parseAppointmentWorkflow(appointment.notes);
                return (
                  <div
                    key={appointment.id}
                    className="grid gap-4 p-4 lg:grid-cols-[0.4fr_1fr_auto]"
                  >
                    <div>
                      <div className="text-xs text-muted-foreground">Token</div>
                      <div className="text-2xl font-bold text-brand-blue">{token}</div>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{appointment.patients?.full_name}</h3>
                        <Badge variant="outline">{appointment.patients?.mrn}</Badge>
                        <Badge className={statusTone[appointment.status]}>
                          {appointment.status}
                        </Badge>
                      </div>
                      <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                        <span>Doctor: {getAppointmentDoctorName(appointment)}</span>
                        <span>Time: {format(new Date(appointment.scheduled_at), "h:mm a")}</span>
                        <span>Predicted start: {format(predictedStart, "h:mm a")}</span>
                        <span>Waiting: {predictedWait} min</span>
                      </div>
                      {meta.checkedInAt && (
                        <div className="mt-2 text-xs font-medium text-green-700">
                          Checked in by {meta.checkInMethod || "Reception"} at{" "}
                          {new Date(meta.checkedInAt).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setQrAppointment(appointment)}
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        QR
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          updateAppointment.isPending ||
                          !(access?.permissions.canManageQueue ?? false)
                        }
                        onClick={() =>
                          updateAppointment.mutate({
                            appointment,
                            status: "confirmed",
                            method: "Reception",
                          })
                        }
                      >
                        <UserCheck className="mr-2 h-4 w-4" />
                        Check in
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          updateAppointment.isPending ||
                          !(access?.permissions.canManageQueue ?? false)
                        }
                        onClick={() =>
                          updateAppointment.mutate({
                            appointment,
                            status: "completed",
                          })
                        }
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Done
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
              <Timer className="h-5 w-5 text-brand-blue" />
              <h2 className="font-semibold">Waiting prediction</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Current calculation predicts start time using scheduled time, queue order, and
              duration minutes. It updates as the list changes.
            </p>
          </div>

          <div className="rounded-[18px] border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ScanFace className="h-5 w-5 text-brand-red" />
              <h2 className="font-semibold">Facial lookup workflow</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Face recognition provider is not connected. Use this reception lookup to validate the
              patient before biometric integration.
            </p>
            <div className="mt-4">
              <Label>Search patient by face-match name / MRN / phone</Label>
              <Input
                value={faceLookup}
                onChange={(event) => setFaceLookup(event.target.value)}
                placeholder="Start typing patient name"
              />
            </div>
            {faceMatches.length > 0 && (
              <div className="mt-3 space-y-2">
                {faceMatches.map(({ appointment, token }) => (
                  <div key={appointment.id} className="rounded-xl border bg-muted/60 p-3 text-sm">
                    <div className="font-medium">{appointment.patients?.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {appointment.patients?.mrn} - {token}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!qrAppointment} onOpenChange={(value) => !value && setQrAppointment(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>QR patient check-in</DialogTitle>
            <DialogDescription>
              Scan this QR at reception to open the check-in confirmation for this appointment.
            </DialogDescription>
          </DialogHeader>
          {qrAppointment && (
            <div className="space-y-4 text-center">
              <img
                src={qrImageUrl(qrAppointment.id)}
                alt="Appointment check-in QR"
                className="mx-auto rounded-lg border bg-white p-2"
              />
              <div className="text-sm">
                <div className="font-medium">{qrAppointment.patients?.full_name}</div>
                <div className="text-muted-foreground">
                  {format(new Date(qrAppointment.scheduled_at), "MMM d, h:mm a")}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
