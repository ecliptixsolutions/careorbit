import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { isMissingRelationError } from "@/lib/supabase-errors";
import {
  isPendingLabel,
  normalizeCustomLabel,
  pickPrimaryRole,
  requestedRoleFromPending,
  roleDefinitions,
  roleFromRow,
  type AppRole,
  type RoleKey,
} from "@/lib/access-control";

type Profile = Tables<"profiles">;
type UserRole = Tables<"user_roles">;

function getPendingRole(roles: UserRole[]) {
  const pendingRow = roles.find((row) => isPendingLabel(row.custom_label));
  return requestedRoleFromPending(pendingRow?.custom_label);
}

function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "doctor" || value === "staff" || value === "custom";
}

function roleFromProfileFallback(profile: Profile | null, userMetadata: Record<string, unknown>) {
  const label = normalizeCustomLabel(
    profile?.custom_role_label ?? (userMetadata.custom_role_label as string | undefined),
  );

  if (isPendingLabel(label)) return requestedRoleFromPending(label) ?? roleDefinitions.staff;
  if (label === "super_admin") return roleDefinitions.super_admin;
  if (label === "hospital_admin") return roleDefinitions.hospital_admin;
  if (label === "admin") return roleDefinitions.admin;
  if (label === "doctor") return roleDefinitions.doctor;
  if (label === "staff") return roleDefinitions.staff;
  if (label === "nurse") return roleDefinitions.nurse;
  if (label === "pharmacist") return roleDefinitions.pharmacist;
  if (label === "lab_technician") return roleDefinitions.lab_technician;
  if (label === "billing_operator") return roleDefinitions.billing_operator;

  const metadataRole = userMetadata.role;
  if (isAppRole(metadataRole)) {
    return roleFromRow({ role: metadataRole, custom_label: label || null });
  }

  const requestedRole = normalizeCustomLabel(userMetadata.requested_role as string | undefined);
  if (requestedRole in roleDefinitions) {
    return roleDefinitions[requestedRole as RoleKey];
  }

  return label ? roleFromRow({ role: "custom", custom_label: label }) : roleDefinitions.staff;
}

export function useRoleAccess() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["role-access", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!user) throw new Error("User is required");

      const [profileResult, roleResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("*").eq("user_id", user.id),
      ]);

      if (profileResult.error && !isMissingRelationError(profileResult.error))
        throw profileResult.error;
      if (roleResult.error && !isMissingRelationError(roleResult.error)) throw roleResult.error;

      const profile: Profile | null = profileResult.error ? null : (profileResult.data ?? null);
      const roleReadError = roleResult.error?.message ?? profileResult.error?.message ?? null;
      const roles: UserRole[] = roleResult.error ? [] : (roleResult.data ?? []);
      const primaryRole =
        roles.length > 0
          ? pickPrimaryRole(roles)
          : roleFromProfileFallback(profile, user.user_metadata);
      const pendingRole =
        getPendingRole(roles) ??
        requestedRoleFromPending(profile?.custom_role_label) ??
        requestedRoleFromPending(user.user_metadata.custom_role_label as string | undefined);
      const isPendingApproval = primaryRole.key === "pending";

      return {
        profile,
        roles,
        roleReadError,
        role: primaryRole.dbRole,
        roleKey: primaryRole.key,
        roleLabel: primaryRole.label,
        pendingRole,
        isPendingApproval,
        copy: isPendingApproval
          ? {
              ...roleDefinitions.pending,
              label: pendingRole ? `Pending ${pendingRole.label}` : roleDefinitions.pending.label,
            }
          : primaryRole,
        permissions: primaryRole.permissions,
      };
    },
  });
}
