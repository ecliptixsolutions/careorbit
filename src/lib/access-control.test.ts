import { describe, expect, it } from "vitest";
import {
  databaseRoleFor,
  pickPrimaryRole,
  roleDefinitions,
  roleFromRow,
  signupRoleOptions,
} from "./access-control";
import { filterNavigationItems, navigationItems } from "@/components/app-shell";

describe("role access control", () => {
  it("keeps privileged actions limited to administrators", () => {
    const privileged = ["super_admin", "hospital_admin", "admin"] as const;
    const nonPrivileged = [
      "doctor",
      "staff",
      "nurse",
      "pharmacist",
      "lab_technician",
      "billing_operator",
      "custom",
      "pending",
    ] as const;

    for (const role of privileged) {
      expect(roleDefinitions[role].permissions.canManageUsers).toBe(true);
      expect(roleDefinitions[role].permissions.canManageRoles).toBe(true);
      expect(roleDefinitions[role].permissions.canDeleteRecords).toBe(true);
      expect(roleDefinitions[role].permissions.canCreatePrescriptions).toBe(true);
    }

    for (const role of nonPrivileged) {
      expect(roleDefinitions[role].permissions.canManageUsers).toBe(false);
      expect(roleDefinitions[role].permissions.canManageRoles).toBe(false);
      expect(roleDefinitions[role].permissions.canDeleteRecords).toBe(false);
      expect(roleDefinitions[role].permissions.canCreatePrescriptions).toBe(role === "doctor");
    }
  });

  it("lets nurses and pharmacists review but not issue prescriptions", () => {
    for (const role of ["nurse", "pharmacist"] as const) {
      expect(roleDefinitions[role].permissions.canViewPrescriptions).toBe(true);
      expect(roleDefinitions[role].permissions.canCreatePrescriptions).toBe(false);
    }
  });

  it("maps every sign-up role to its persisted role identity", () => {
    for (const option of signupRoleOptions) {
      const stored = databaseRoleFor(option.value);
      expect(roleFromRow(stored).key).toBe(option.value);
    }
  });

  it("selects the highest-priority role deterministically", () => {
    const role = pickPrimaryRole([
      {
        id: "staff",
        user_id: "user",
        role: "staff",
        custom_label: null,
        created_at: "2026-07-04T00:00:00Z",
      },
      {
        id: "admin",
        user_id: "user",
        role: "admin",
        custom_label: "hospital_admin",
        created_at: "2026-07-04T00:00:00Z",
      },
      {
        id: "doctor",
        user_id: "user",
        role: "doctor",
        custom_label: null,
        created_at: "2026-07-04T00:00:00Z",
      },
    ]);

    expect(role.key).toBe("hospital_admin");
  });

  it("shows only explicitly permitted navigation for all nine roles", () => {
    const roles = [
      "super_admin",
      "hospital_admin",
      "admin",
      "staff",
      "doctor",
      "nurse",
      "pharmacist",
      "lab_technician",
      "billing_operator",
    ] as const;

    for (const role of roles) {
      const visible = filterNavigationItems(roleDefinitions[role].permissions);
      expect(visible.map((item) => item.to)).toEqual(
        navigationItems
          .filter((item) => roleDefinitions[role].permissions[item.permission] === true)
          .map((item) => item.to),
      );
      expect(visible.some((item) => item.to === "/sessions")).toBe(
        roleDefinitions[role].permissions.canManageUsers,
      );
    }

    expect(filterNavigationItems()).toEqual([]);
    expect(filterNavigationItems({ canManageUsers: true }).map((item) => item.to)).toEqual([
      "/sessions",
      "/organization-settings",
      "/access-control",
      "/system-admin",
    ]);
  });
});
