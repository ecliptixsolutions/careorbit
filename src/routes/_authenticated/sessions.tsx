/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { MonitorCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getSessionId } from "@/hooks/use-session-tracking";
import { isMissingRelationError, missingSchemaMessage } from "@/lib/supabase-errors";

export const Route = createFileRoute("/_authenticated/sessions")({
  component: SessionsPage,
});

type UserSession = {
  id: string;
  created_at: string;
  last_activity_at: string;
  device_label: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

function SessionsPage() {
  const { session, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentSessionId = getSessionId(session);

  const { data: sessions = [], isLoading } = useQuery<UserSession[]>({
    queryKey: ["my-sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from("user_sessions")
        .select("id, created_at, last_activity_at, device_label, ip_address, user_agent")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .order("last_activity_at", { ascending: false });
      if (error && !isMissingRelationError(error)) throw error;
      if (error) throw new Error(missingSchemaMessage("Session management"));
      return (data ?? []) as UserSession[];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!user) return;
      const { error } = await (supabase as any)
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString(), revoked_reason: "user_logout" })
        .eq("id", sessionId)
        .eq("user_id", user.id);
      if (error && !isMissingRelationError(error)) throw error;
      if (sessionId === currentSessionId) {
        await supabase.auth.signOut();
      }
    },
    onSuccess: (_data, sessionId) => {
      toast.success("Session revoked");
      if (sessionId === currentSessionId) {
        navigate({ to: "/" });
      } else {
        qc.invalidateQueries({ queryKey: ["my-sessions", user?.id] });
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await (supabase as any)
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString(), revoked_reason: "user_logout" })
        .eq("user_id", user.id)
        .is("revoked_at", null);
      if (error && !isMissingRelationError(error)) throw error;
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      toast.success("Signed out everywhere");
      navigate({ to: "/" });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security</h1>
        <p className="mt-1 text-muted-foreground">
          Review active sessions and sign out devices you do not recognize.
        </p>
      </div>

      <div className="rounded-[18px] border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MonitorCheck className="h-5 w-5 text-brand-blue" />
            <h2 className="text-xl font-semibold">Active sessions</h2>
          </div>
          <Button
            variant="outline"
            disabled={revokeAllMutation.isPending || sessions.length === 0}
            onClick={() => revokeAllMutation.mutate()}
          >
            Log out everywhere
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border bg-muted/60 p-6 text-sm text-muted-foreground">
            No active sessions are recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((item) => {
              const current = item.id === currentSessionId;
              return (
                <div key={item.id} className="rounded-xl border bg-muted/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {item.device_label || "Browser session"}
                        {current && (
                          <Badge className="bg-primary text-primary-foreground">Current</Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Last active{" "}
                        {formatDistanceToNow(new Date(item.last_activity_at), {
                          addSuffix: true,
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{item.ip_address || "IP not recorded"}</span>
                        <span>{item.user_agent || "User agent not recorded"}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={current ? "default" : "outline"}
                      disabled={revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate(item.id)}
                    >
                      {current ? "Log out this device" : "Log out"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-[18px] border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-blue" />
          <h2 className="text-xl font-semibold">Session policy</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          CareOrbit records session activity, supports per-role timeout policies, and revokes
          sessions automatically after password or role changes once the security migration is
          deployed.
        </p>
      </div>
    </div>
  );
}
