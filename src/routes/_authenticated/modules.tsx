import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BedDouble,
  Bot,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  ListOrdered,
  MessageCircle,
  Pill,
  Receipt,
  ScanFace,
  ScanLine,
  Scissors,
  ShieldAlert,
  Stethoscope,
  Users,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRoleAccess } from "@/hooks/use-role-access";
import { moduleDefinitions } from "@/lib/access-control";

export const Route = createFileRoute("/_authenticated/modules")({
  component: ModulesPage,
});

const moduleIcons = [
  Users,
  BedDouble,
  Stethoscope,
  CalendarDays,
  Bot,
  FlaskConical,
  Pill,
  Receipt,
  Boxes,
  Scissors,
  ScanLine,
  Video,
  ListOrdered,
  ClipboardList,
  MessageCircle,
  ScanFace,
];

function ModulesPage() {
  const { data: access } = useRoleAccess();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ERP Modules</h1>
        <p className="mt-1 text-muted-foreground">
          All CareOrbit modules are listed here with role-wise access visibility.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{access?.copy.label ?? "Role"}</Badge>
          <span>Enabled modules are based on the current role rights matrix.</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {moduleDefinitions.map((module, index) => {
          const Icon = moduleIcons[index] ?? CheckCircle2;
          const enabled = access?.permissions[module.permission] ?? false;
          const route =
            module.title === "Patient Management"
              ? "/patients"
              : module.title === "Quick Consultations"
                ? "/prescriptions"
                : module.title === "Telemedicine"
                  ? "/appointments"
                  : module.title === "Lab Management"
                    ? "/lab"
                    : module.title === "Pharmacy"
                      ? "/pharmacy"
                      : module.title === "Billing & Accounting"
                        ? "/billing"
                        : module.title === "Smart Queue & QR Check-In" ||
                            module.title === "Facial / QR Patient Check-In"
                          ? "/queue"
                          : module.title === "Smart EMR Timeline"
                            ? "/emr-timeline"
                            : module.title === "WhatsApp & Follow-up Automation"
                              ? "/automations"
                              : null;

          return (
            <div
              key={module.title}
              className="rounded-[18px] border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <Badge
                  variant="secondary"
                  className={
                    enabled
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }
                >
                  {enabled ? "Allowed" : "Restricted"}
                </Badge>
              </div>
              <h2 className="mt-4 text-lg font-semibold">{module.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{module.description}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <Badge variant="outline">{module.status}</Badge>
                {route && enabled ? (
                  <Button asChild size="sm" className="bg-gradient-brand text-white">
                    <Link to={route}>Open</Link>
                  </Button>
                ) : enabled ? (
                  <Button size="sm" variant="outline" disabled>
                    Workspace ready
                  </Button>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Ask admin
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
