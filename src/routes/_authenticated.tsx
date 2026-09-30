import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useSessionTracking } from "@/hooks/use-session-tracking";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Activity, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { session, user, loading } = useAuth();
  const { data: access, isLoading: accessLoading } = useRoleAccess();
  const navigate = useNavigate();
  useSessionTracking(session, access?.roleKey);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user || accessLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Activity className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (access?.isPendingApproval) {
    const signOut = async () => {
      await supabase.auth.signOut();
      navigate({ to: "/" });
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4">
        <div className="w-full max-w-lg rounded-[18px] border bg-card p-8 text-center shadow-elegant">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-brand">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-heading">Waiting for admin approval</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is created, but a Super Admin, Hospital Admin, or Admin must approve your
            requested role before you can access CareOrbit workflows.
          </p>
          <div className="mt-5 rounded-xl border bg-muted/60 p-4 text-left text-sm">
            <div className="font-medium">Requested role</div>
            <div className="mt-1 text-muted-foreground">
              {access.pendingRole?.label ?? "Role request"}
            </div>
          </div>
          <Button onClick={signOut} className="mt-6 bg-gradient-brand text-white hover:opacity-95">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
