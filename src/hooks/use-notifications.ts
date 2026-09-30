/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { isMissingRelationError } from "@/lib/supabase-errors";

type PatientMini = Pick<Tables<"patients">, "id" | "full_name" | "mrn" | "phone">;
type AppointmentWithPatient = Tables<"appointments"> & {
  patients: PatientMini | null;
};
type DbNotification = Tables<"notifications">;

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  source: "notification" | "appointment";
  appointmentId?: string | null;
  patientId?: string | null;
  channel?: string;
  phone?: string | null;
};

function fromDbNotification(row: DbNotification): NotificationItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    read: !!row.read_at,
    source: "notification",
    appointmentId: row.appointment_id,
    patientId: row.patient_id,
    channel: row.channel,
    phone: row.recipient_phone,
  };
}

function fromAppointment(
  row: AppointmentWithPatient,
  readAppointmentIds: Set<string>,
): NotificationItem {
  const when = format(new Date(row.scheduled_at), "MMM d, h:mm a");
  const patient = row.patients?.full_name ?? "Patient";
  return {
    id: `appointment:${row.id}`,
    title: "New appointment assigned",
    body: `${patient} is scheduled for ${when}${row.reason ? ` - ${row.reason}` : ""}.`,
    createdAt: row.created_at,
    read: readAppointmentIds.has(row.id),
    source: "appointment",
    appointmentId: row.id,
    patientId: row.patient_id,
  };
}

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<NotificationItem[]>({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!user) return [];

      const [notificationResult, appointmentResult] = await Promise.all([
        supabase
          .from("notifications")
          .select("*")
          .eq("recipient_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("appointments")
          .select("*, patients(id, full_name, mrn, phone)")
          .eq("doctor_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      const readStateResult = await (supabase as any)
        .from("notification_read_states")
        .select("appointment_id")
        .eq("user_id", user.id);

      if (notificationResult.error && !isMissingRelationError(notificationResult.error)) {
        throw notificationResult.error;
      }
      if (appointmentResult.error && !isMissingRelationError(appointmentResult.error)) {
        throw appointmentResult.error;
      }

      const dbItems = notificationResult.error
        ? []
        : (notificationResult.data ?? []).map(fromDbNotification);
      const readAppointmentIds = new Set<string>(
        readStateResult.error
          ? []
          : ((readStateResult.data ?? []) as Array<{ appointment_id: string }>).map(
              (row) => row.appointment_id,
            ),
      );
      const appointmentItems = appointmentResult.error
        ? []
        : ((appointmentResult.data ?? []) as AppointmentWithPatient[]).map((row) =>
            fromAppointment(row, readAppointmentIds),
          );

      const dbAppointmentIds = new Set(dbItems.map((item) => item.appointmentId).filter(Boolean));
      const fallbackItems = appointmentItems.filter(
        (item) => !item.appointmentId || !dbAppointmentIds.has(item.appointmentId),
      );

      return [...dbItems, ...fallbackItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },
  });

  const markRead = useMutation({
    mutationFn: async (item: NotificationItem) => {
      if (!user) return;
      if (item.source === "notification") {
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", item.id)
          .eq("recipient_id", user.id);
        if (error && !isMissingRelationError(error)) throw error;
      } else if (item.appointmentId) {
        const { error } = await (supabase as any).from("notification_read_states").upsert({
          user_id: user.id,
          appointment_id: item.appointmentId,
          read_at: new Date().toISOString(),
        });
        if (error && !isMissingRelationError(error)) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const unread = query.data?.filter((item) => !item.read) ?? [];
      const appointmentReads = unread
        .filter((item) => item.source === "appointment" && item.appointmentId)
        .map((item) => ({
          user_id: user.id,
          appointment_id: item.appointmentId,
          read_at: new Date().toISOString(),
        }));
      if (appointmentReads.length > 0) {
        const { error } = await (supabase as any)
          .from("notification_read_states")
          .upsert(appointmentReads);
        if (error && !isMissingRelationError(error)) throw error;
      }
      const dbIds = unread.filter((item) => item.source === "notification").map((item) => item.id);
      if (dbIds.length > 0) {
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .in("id", dbIds)
          .eq("recipient_id", user.id);
        if (error && !isMissingRelationError(error)) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  return {
    ...query,
    unreadCount: query.data?.filter((item) => !item.read).length ?? 0,
    markRead,
    markAllRead,
  };
}
