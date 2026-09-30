/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ShieldAlert, ShieldCheck, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  assignableRoleKeys,
  databaseRoleFor,
  requestedRoleFromPending,
  roleDefinitions,
  roleFromRow,
  type RoleKey,
} from "@/lib/access-control";
import { isMissingRelationError, missingSchemaMessage } from "@/lib/supabase-errors";

export const Route = createFileRoute("/_authenticated/access-control")({
  component: AccessControlPage,
});

type Profile = Tables<"profiles">;
type UserRole = Tables<"user_roles">;
type UserRow = {
  profile: Profile;
  roles: UserRole[];
};
type CustomTemplate = {
  key: string;
  label: string;
};

function toTemplateKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function AccessControlPage() {
  const { user } = useAuth();
  const { data: access } = useRoleAccess();
  const qc = useQueryClient();
  const [templateName, setTemplateName] = useState("");

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ["admin-profiles"],
    enabled: access?.permissions.canManageUsers ?? false,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at");
      if (error && !isMissingRelationError(error)) throw error;
      if (error) return [];
      return data ?? [];
    },
  });

  const { data: roles = [] } = useQuery<UserRole[]>({
    queryKey: ["admin-user-roles"],
    enabled: access?.permissions.canManageUsers ?? false,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*").order("created_at");
      if (error && !isMissingRelationError(error)) throw error;
      if (error) return [];
      return data ?? [];
    },
  });

  const { data: templates = [] } = useQuery<CustomTemplate[]>({
    queryKey: ["custom-role-templates", user?.id],
    enabled: !!user && (access?.permissions.canManageUsers ?? false),
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from("custom_role_templates")
        .select("key, label")
        .eq("user_id", user.id)
        .order("created_at");
      if (error && !isMissingRelationError(error)) throw error;
      return error ? [] : ((data ?? []) as CustomTemplate[]);
    },
  });

  const users = useMemo<UserRow[]>(() => {
    return profiles.map((profile) => ({
      profile,
      roles: roles.filter((role) => role.user_id === profile.id),
    }));
  }, [profiles, roles]);

  const superAdminCount = roles.filter(
    (role) => role.role === "admin" && role.custom_label === "super_admin",
  ).length;

  const assignRoleMutation = useMutation({
    mutationFn: async ({
      targetUserId,
      roleKey,
      customLabel,
    }: {
      targetUserId: string;
      roleKey: RoleKey;
      customLabel?: string;
    }) => {
      const roleConfig =
        roleKey === "custom"
          ? { role: "custom" as const, custom_label: customLabel ?? "custom" }
          : databaseRoleFor(roleKey);

      if (roleKey === "super_admin" && superAdminCount > 0 && targetUserId !== user?.id) {
        throw new Error("Only one Super Admin is allowed from this approval screen.");
      }

      const response = await fetch("/api/admin/approve-user", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: targetUserId,
          role: roleConfig.role,
          custom_label: roleConfig.custom_label ?? null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "Role assignment failed");
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      qc.invalidateQueries({ queryKey: ["role-access"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const createTemplate = async () => {
    const key = toTemplateKey(templateName);
    if (!key) {
      toast.error("Enter a role name");
      return;
    }
    if (templates.some((template) => template.key === key)) {
      toast.error("Role template already exists");
      return;
    }
    const { error } = await (supabase as any).from("custom_role_templates").insert({
      user_id: user?.id,
      key,
      label: templateName.trim(),
    });
    if (error) {
      if (isMissingRelationError(error)) {
        toast.error(missingSchemaMessage("Custom role templates"));
      } else {
        toast.error(error.message);
      }
      return;
    }
    qc.invalidateQueries({ queryKey: ["custom-role-templates", user?.id] });
    setTemplateName("");
    toast.success("Role template created");
  };

  if (!(access?.permissions.canManageUsers ?? false)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Access control restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only Super Admin, Hospital Admin, and Admin roles can approve users and assign rights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Access Control</h1>
        <p className="mt-1 text-muted-foreground">
          Approve user creation, assign roles, and review role-wise rights.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{access?.copy.label ?? "Admin"}</Badge>
          <span>{superAdminCount > 0 ? "Super Admin exists" : "No Super Admin assigned yet"}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-brand-blue" />
            <h2 className="text-xl font-semibold">User approval and role assignment</h2>
          </div>

          {profilesLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading users...</div>
          ) : (
            <div className="space-y-3">
              {users.map(({ profile, roles: userRoles }) => {
                const primaryRole = roleFromRow(userRoles[0]);
                const pendingRole = requestedRoleFromPending(userRoles[0]?.custom_label);
                const isPending = primaryRole.key === "pending";

                return (
                  <div key={profile.id} className="rounded-xl border bg-muted/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{profile.full_name || "Unnamed user"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {profile.organization || "No organization saved"}
                        </div>
                      </div>
                      <Badge
                        className={
                          isPending
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "bg-primary text-white"
                        }
                      >
                        {isPending
                          ? `Pending ${pendingRole?.label ?? "approval"}`
                          : primaryRole.label}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignableRoleKeys.map((roleKey) => (
                        <Button
                          key={roleKey}
                          size="sm"
                          variant={roleKey === primaryRole.key ? "default" : "outline"}
                          disabled={
                            assignRoleMutation.isPending ||
                            (roleKey === "super_admin" &&
                              superAdminCount > 0 &&
                              profile.id !== user?.id)
                          }
                          onClick={() =>
                            assignRoleMutation.mutate({ targetUserId: profile.id, roleKey })
                          }
                        >
                          {roleDefinitions[roleKey].label}
                        </Button>
                      ))}
                      {templates.map((template) => (
                        <Button
                          key={template.key}
                          size="sm"
                          variant="outline"
                          disabled={assignRoleMutation.isPending}
                          onClick={() =>
                            assignRoleMutation.mutate({
                              targetUserId: profile.id,
                              roleKey: "custom",
                              customLabel: template.key,
                            })
                          }
                        >
                          {template.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-brand-blue" />
              <h2 className="text-xl font-semibold">Role creation</h2>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="role-template">New role template</Label>
                <Input
                  id="role-template"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="e.g. Insurance Desk"
                />
              </div>
              <Button
                onClick={() => void createTemplate()}
                className="w-full bg-gradient-brand text-white"
              >
                Create role template
              </Button>
              {templates.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {templates.map((template) => (
                    <Badge key={template.key} variant="secondary">
                      {template.label}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Role templates can be assigned immediately in the UI. Database-backed dynamic
                permission editing needs the supplied migration model before production use.
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-brand-blue" />
              <h2 className="text-xl font-semibold">Role rights matrix</h2>
            </div>
            <div className="space-y-2">
              {assignableRoleKeys.map((roleKey) => {
                const role = roleDefinitions[roleKey];
                const enabledCount = Object.values(role.permissions).filter(Boolean).length;
                return (
                  <div key={role.key} className="rounded-xl border bg-muted/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{role.label}</div>
                      <Badge variant="outline">{enabledCount} rights</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(role.permissions)
                        .filter(([, enabled]) => enabled)
                        .slice(0, 8)
                        .map(([permission]) => (
                          <Badge key={permission} variant="secondary" className="text-[10px]">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {permission.replace("can", "")}
                          </Badge>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
