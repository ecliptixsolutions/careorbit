import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DatabaseBackup, Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoleAccess } from "@/hooks/use-role-access";
import { downloadExcel, downloadJson } from "@/lib/clinical-operations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/system-admin")({
  component: SystemAdminPage,
});

const backupTables = [
  "profiles",
  "user_roles",
  "patients",
  "appointments",
  "notifications",
  "prescriptions",
  "invoices",
  "payments",
  "lab_orders",
  "pharmacy_items",
  "dispensations",
  "organization_settings",
  "service_catalog",
  "import_batches",
] as const;

function SystemAdminPage() {
  const { data: access } = useRoleAccess();
  const isAdmin = access?.permissions.canManageUsers ?? false;

  const { data: profiles = [] } = useQuery({
    queryKey: ["audit-profiles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const exportBackup = useMutation({
    mutationFn: async () => {
      const results = await Promise.all(
        backupTables.map(async (table) => {
          const { data, error } = await supabase.from(table).select("*");
          if (error) throw new Error(`${table}: ${error.message}`);
          return [table, data ?? []] as const;
        }),
      );
      return Object.fromEntries(results);
    },
    onSuccess: (tables) => {
      const createdAt = new Date().toISOString();
      downloadJson(`careorbit-backup-${createdAt.slice(0, 10)}.json`, {
        format: "careorbit-json-backup-v1",
        createdAt,
        tables,
      });
      toast.success("Backup export created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportExcel = useMutation({
    mutationFn: async () => {
      const results = await Promise.all(
        backupTables.map(async (table) => {
          const { data, error } = await supabase.from(table).select("*");
          if (error) throw new Error(`${table}: ${error.message}`);
          return { name: table, rows: (data ?? []) as Record<string, unknown>[] };
        }),
      );
      await downloadExcel(`careorbit-data-${new Date().toISOString().slice(0, 10)}.xlsx`, results);
    },
    onSuccess: () => toast.success("Excel export created"),
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Administration restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Audit history and backup exports are available to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Audit & backup</h1>
          <p className="mt-1 text-muted-foreground">
            Review record changes and export a recoverable application-data snapshot.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => exportExcel.mutate()}
            disabled={exportExcel.isPending}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {exportExcel.isPending ? "Preparing..." : "Export Excel"}
          </Button>
          <Button
            onClick={() => exportBackup.mutate()}
            disabled={exportBackup.isPending}
            className="bg-gradient-brand text-white"
          >
            {exportBackup.isPending ? (
              <DatabaseBackup className="mr-2 h-4 w-4 animate-pulse" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exportBackup.isPending ? "Preparing..." : "Export JSON backup"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[18px] border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Recorded changes</div>
          <div className="mt-2 text-3xl font-bold text-heading">{logs.length}</div>
        </div>
        <div className="rounded-[18px] border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Exported tables</div>
          <div className="mt-2 text-3xl font-bold text-heading">{backupTables.length}</div>
        </div>
        <div className="rounded-[18px] border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Audit retention</div>
          <div className="mt-2 text-3xl font-bold text-heading">200</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[18px] border bg-card shadow-sm">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            New record changes will appear here.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Record</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-primary-soft/60">
                  <td className="whitespace-nowrap px-4 py-3">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {profiles.find((profile) => profile.id === log.actor_id)?.full_name ?? "System"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{log.action}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{log.entity_type}</span>
                    <div className="max-w-56 truncate font-mono text-xs text-muted-foreground">
                      {log.entity_id}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
