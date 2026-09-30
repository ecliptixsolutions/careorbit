import type { Enums, Tables } from "@/integrations/supabase/types";

export type AppRole = Enums<"app_role">;
export type UserRole = Tables<"user_roles">;

export type PermissionKey =
  | "canViewDashboard"
  | "canViewPatients"
  | "canCreatePatients"
  | "canViewPatientHistory"
  | "canViewAppointments"
  | "canScheduleAppointments"
  | "canViewQueue"
  | "canManageQueue"
  | "canViewEmrTimeline"
  | "canViewPrescriptions"
  | "canCreatePrescriptions"
  | "canManageAutomations"
  | "canAccessFacialCheckIn"
  | "canViewModules"
  | "canManageUsers"
  | "canApproveUsers"
  | "canManageRoles"
  | "canManageImports"
  | "canUpdateRecords"
  | "canDeleteRecords"
  | "canAccessIpdOpd"
  | "canAccessMedicalStaff"
  | "canAccessQuickConsult"
  | "canAccessAiVoice"
  | "canAccessLab"
  | "canAccessPharmacy"
  | "canAccessBilling"
  | "canAccessInventory"
  | "canAccessSurgery"
  | "canAccessRadiology"
  | "canAccessTelemedicine";

export type RolePermissions = Record<PermissionKey, boolean>;

export type RoleKey =
  | "super_admin"
  | "hospital_admin"
  | "admin"
  | "doctor"
  | "staff"
  | "pharmacist"
  | "nurse"
  | "lab_technician"
  | "billing_operator"
  | "custom"
  | "pending";

export type RoleDefinition = {
  key: RoleKey;
  label: string;
  dbRole: AppRole;
  customLabel: string | null;
  description: string;
  focus: string;
  permissions: RolePermissions;
};

const no = false;
const yes = true;

function permissions(overrides: Partial<RolePermissions>): RolePermissions {
  return {
    canViewDashboard: yes,
    canViewPatients: no,
    canCreatePatients: no,
    canViewPatientHistory: no,
    canViewAppointments: no,
    canScheduleAppointments: no,
    canViewQueue: no,
    canManageQueue: no,
    canViewEmrTimeline: no,
    canViewPrescriptions: no,
    canCreatePrescriptions: no,
    canManageAutomations: no,
    canAccessFacialCheckIn: no,
    canViewModules: yes,
    canManageUsers: no,
    canApproveUsers: no,
    canManageRoles: no,
    canManageImports: no,
    canUpdateRecords: no,
    canDeleteRecords: no,
    canAccessIpdOpd: no,
    canAccessMedicalStaff: no,
    canAccessQuickConsult: no,
    canAccessAiVoice: no,
    canAccessLab: no,
    canAccessPharmacy: no,
    canAccessBilling: no,
    canAccessInventory: no,
    canAccessSurgery: no,
    canAccessRadiology: no,
    canAccessTelemedicine: no,
    ...overrides,
  };
}

const clinicalRights = permissions({
  canViewPatients: yes,
  canCreatePatients: yes,
  canViewPatientHistory: yes,
  canViewAppointments: yes,
  canScheduleAppointments: yes,
  canViewQueue: yes,
  canViewEmrTimeline: yes,
  canViewPrescriptions: yes,
  canCreatePrescriptions: yes,
  canUpdateRecords: yes,
  canAccessQuickConsult: yes,
  canAccessAiVoice: yes,
  canAccessLab: yes,
  canAccessTelemedicine: yes,
});

const operationsRights = permissions({
  canViewPatients: yes,
  canCreatePatients: yes,
  canViewAppointments: yes,
  canScheduleAppointments: yes,
  canViewQueue: yes,
  canManageQueue: yes,
  canManageAutomations: yes,
  canAccessFacialCheckIn: yes,
  canUpdateRecords: yes,
  canManageImports: yes,
  canAccessIpdOpd: yes,
  canAccessMedicalStaff: yes,
  canAccessInventory: yes,
});

const fullAdminRights = permissions({
  canViewPatients: yes,
  canCreatePatients: yes,
  canViewPatientHistory: yes,
  canViewAppointments: yes,
  canScheduleAppointments: yes,
  canViewQueue: yes,
  canManageQueue: yes,
  canViewEmrTimeline: yes,
  canViewPrescriptions: yes,
  canCreatePrescriptions: yes,
  canManageAutomations: yes,
  canAccessFacialCheckIn: yes,
  canManageUsers: yes,
  canApproveUsers: yes,
  canManageRoles: yes,
  canUpdateRecords: yes,
  canDeleteRecords: yes,
  canManageImports: yes,
  canAccessIpdOpd: yes,
  canAccessMedicalStaff: yes,
  canAccessQuickConsult: yes,
  canAccessAiVoice: yes,
  canAccessLab: yes,
  canAccessPharmacy: yes,
  canAccessBilling: yes,
  canAccessInventory: yes,
  canAccessSurgery: yes,
  canAccessRadiology: yes,
  canAccessTelemedicine: yes,
});

export const roleDefinitions: Record<RoleKey, RoleDefinition> = {
  super_admin: {
    key: "super_admin",
    label: "Super Admin",
    dbRole: "admin",
    customLabel: "super_admin",
    description: "System owner access across hospitals, user approvals, roles, and all modules.",
    focus: "Create hospital admins, approve users, assign rights, and supervise every module.",
    permissions: fullAdminRights,
  },
  hospital_admin: {
    key: "hospital_admin",
    label: "Hospital Admin",
    dbRole: "admin",
    customLabel: "hospital_admin",
    description: "Hospital-level administration for users, approvals, operations, and reporting.",
    focus:
      "Approve hospital users, assign roles, monitor care operations, and manage facility data.",
    permissions: fullAdminRights,
  },
  admin: {
    key: "admin",
    label: "Admin",
    dbRole: "admin",
    customLabel: null,
    description: "Operational admin access for users, approvals, and records.",
    focus: "Review dashboard activity, approve users, assign roles, and manage records.",
    permissions: fullAdminRights,
  },
  doctor: {
    key: "doctor",
    label: "Doctor",
    dbRole: "doctor",
    customLabel: null,
    description: "Clinical access for patients, history by phone number, and appointments.",
    focus: "Search patient history by number, review visit context, and manage consultations.",
    permissions: clinicalRights,
  },
  staff: {
    key: "staff",
    label: "Staff",
    dbRole: "staff",
    customLabel: null,
    description: "Front desk access for patient registration and appointment scheduling.",
    focus: "Register patients, assign doctors, capture guardian contacts, and schedule visits.",
    permissions: operationsRights,
  },
  pharmacist: {
    key: "pharmacist",
    label: "Pharmacist",
    dbRole: "custom",
    customLabel: "pharmacist",
    description: "Pharmacy module access with patient and appointment context.",
    focus: "Review patient context and manage pharmacy workflow entries.",
    permissions: permissions({
      canViewPatients: yes,
      canViewPatientHistory: yes,
      canViewAppointments: yes,
      canViewEmrTimeline: yes,
      canViewPrescriptions: yes,
      canAccessPharmacy: yes,
      canUpdateRecords: yes,
      canManageImports: yes,
    }),
  },
  nurse: {
    key: "nurse",
    label: "Nurse",
    dbRole: "custom",
    customLabel: "nurse",
    description: "Nursing access for patient context, appointments, and IPD/OPD workflow.",
    focus: "Review patient history, support consultations, and coordinate care tasks.",
    permissions: permissions({
      canViewPatients: yes,
      canCreatePatients: yes,
      canViewPatientHistory: yes,
      canViewAppointments: yes,
      canScheduleAppointments: yes,
      canViewQueue: yes,
      canManageQueue: yes,
      canViewEmrTimeline: yes,
      canViewPrescriptions: yes,
      canAccessIpdOpd: yes,
      canAccessQuickConsult: yes,
      canUpdateRecords: yes,
      canManageImports: yes,
    }),
  },
  lab_technician: {
    key: "lab_technician",
    label: "Lab Technician",
    dbRole: "custom",
    customLabel: "lab_technician",
    description: "Lab workflow access with patient and appointment context.",
    focus: "Review patient context and manage lab workflow entries.",
    permissions: permissions({
      canViewPatients: yes,
      canViewPatientHistory: yes,
      canViewAppointments: yes,
      canViewEmrTimeline: yes,
      canAccessLab: yes,
      canUpdateRecords: yes,
    }),
  },
  billing_operator: {
    key: "billing_operator",
    label: "Billing Operator",
    dbRole: "custom",
    customLabel: "billing_operator",
    description: "Billing and accounting access with patient and appointment context.",
    focus: "Review patient context and manage billing workflow entries.",
    permissions: permissions({
      canViewPatients: yes,
      canViewAppointments: yes,
      canViewEmrTimeline: yes,
      canAccessBilling: yes,
      canUpdateRecords: yes,
      canManageImports: yes,
    }),
  },
  custom: {
    key: "custom",
    label: "Custom Role",
    dbRole: "custom",
    customLabel: "custom",
    description: "Custom operational access assigned by an administrator.",
    focus: "Use the modules enabled for this custom workflow.",
    permissions: permissions({
      canViewPatients: yes,
      canViewAppointments: yes,
      canViewQueue: yes,
      canUpdateRecords: yes,
    }),
  },
  pending: {
    key: "pending",
    label: "Pending Approval",
    dbRole: "custom",
    customLabel: "pending",
    description: "Account created and waiting for admin approval.",
    focus: "Wait for a Super Admin, Hospital Admin, or Admin to approve your requested role.",
    permissions: permissions({
      canViewDashboard: no,
      canViewModules: no,
    }),
  },
};

// ── Public signup options ─────────────────────────────────────────────────
// Used ONLY on the public /signup page.
// super_admin / hospital_admin / admin are intentionally excluded here.
// Update signup.tsx (publicSignupRoleOptions) if you change this list.
export const publicSignupRoleOptions: Array<{
  value: Exclude<RoleKey, "pending" | "custom" | "super_admin" | "hospital_admin" | "admin">;
  label: string;
}> = [
  { value: "staff",            label: "Staff" },
  { value: "doctor",           label: "Doctor" },
  { value: "nurse",            label: "Nurse" },
  { value: "pharmacist",       label: "Pharmacist" },
  { value: "lab_technician",   label: "Lab Technician" },
  { value: "billing_operator", label: "Billing Operator" },
];

// ── Admin-facing role options (all 9 roles) ───────────────────────────────
// Used by Access Control page role-assignment buttons.
// Contains privileged roles — never expose this list on a public-facing form.
export const signupRoleOptions: Array<{
  value: Exclude<RoleKey, "pending" | "custom">;
  label: string;
}> = [
  { value: "super_admin",      label: "Super Admin" },
  { value: "hospital_admin",   label: "Hospital Admin" },
  { value: "admin",            label: "Admin" },
  { value: "staff",            label: "Staff" },
  { value: "doctor",           label: "Doctor" },
  { value: "nurse",            label: "Nurse" },
  { value: "pharmacist",       label: "Pharmacist" },
  { value: "lab_technician",   label: "Lab Technician" },
  { value: "billing_operator", label: "Billing Operator" },
];

export const assignableRoleKeys: Array<Exclude<RoleKey, "pending" | "custom">> = [
  "super_admin",
  "hospital_admin",
  "admin",
  "doctor",
  "staff",
  "nurse",
  "pharmacist",
  "lab_technician",
  "billing_operator",
];

export const rolePriority: RoleKey[] = [
  "super_admin",
  "hospital_admin",
  "admin",
  "doctor",
  "nurse",
  "staff",
  "pharmacist",
  "lab_technician",
  "billing_operator",
  "custom",
  "pending",
];

export function pendingLabel(roleKey: RoleKey) {
  return `pending:${roleKey}`;
}

export function isPendingLabel(label: string | null | undefined) {
  return !!label?.startsWith("pending:");
}

export function normalizeCustomLabel(label: string | null | undefined) {
  return label?.trim().toLowerCase().replace(/\s+/g, "_") ?? "";
}

export function roleFromRow(row: Pick<UserRole, "role" | "custom_label"> | null | undefined) {
  if (!row) return roleDefinitions.staff;

  const label = normalizeCustomLabel(row.custom_label);
  if (isPendingLabel(label)) return requestedRoleFromPending(label) ?? roleDefinitions.custom;
  if (row.role === "admin" && label === "super_admin") return roleDefinitions.super_admin;
  if (row.role === "admin" && label === "hospital_admin") return roleDefinitions.hospital_admin;
  if (row.role === "admin") return roleDefinitions.admin;
  if (row.role === "doctor") return roleDefinitions.doctor;
  if (row.role === "staff") return roleDefinitions.staff;
  if (label === "pharmacist") return roleDefinitions.pharmacist;
  if (label === "nurse") return roleDefinitions.nurse;
  if (label === "lab_technician" || label === "lab tech") return roleDefinitions.lab_technician;
  if (label === "billing_operator") return roleDefinitions.billing_operator;
  return { ...roleDefinitions.custom, label: row.custom_label || roleDefinitions.custom.label };
}

export function pickPrimaryRole(roles: UserRole[]) {
  const resolved = roles.map(roleFromRow);
  return (
    rolePriority.map((key) => resolved.find((role) => role.key === key)).find(Boolean) ??
    roleDefinitions.staff
  );
}

export function databaseRoleFor(roleKey: RoleKey): { role: AppRole; custom_label: string | null } {
  const definition = roleDefinitions[roleKey] ?? roleDefinitions.custom;
  return { role: definition.dbRole, custom_label: definition.customLabel };
}

export function pendingDatabaseRoleFor(roleKey: RoleKey): { role: AppRole; custom_label: string } {
  return { role: "custom", custom_label: pendingLabel(roleKey) };
}

export function requestedRoleFromPending(label: string | null | undefined) {
  if (!isPendingLabel(label)) return null;
  const key = normalizeCustomLabel(label).replace("pending:", "") as RoleKey;
  return roleDefinitions[key] ?? roleDefinitions.custom;
}

export const moduleDefinitions = [
  {
    title: "Patient Management",
    description:
      "Patient registration, MRN search, guardian contact, doctor assignment, and notes.",
    permission: "canViewPatients" satisfies PermissionKey,
    status: "Live",
  },
  {
    title: "IPD / OPD Management",
    description: "Admission, outpatient, ward, and visit workflow workspace.",
    permission: "canAccessIpdOpd" satisfies PermissionKey,
    status: "Role enabled",
  },
  {
    title: "Medical Staff Management",
    description: "Doctors, nurses, schedules, responsibility, and staff operations.",
    permission: "canAccessMedicalStaff" satisfies PermissionKey,
    status: "Role enabled",
  },
  {
    title: "Quick Consultations",
    description: "Fast consultation workspace connected to patient history and appointments.",
    permission: "canAccessQuickConsult" satisfies PermissionKey,
    status: "Role enabled",
  },
  {
    title: "AI & Voice Consultation",
    description: "AI-ready consultation area and voice receptionist planning workspace.",
    permission: "canAccessAiVoice" satisfies PermissionKey,
    status: "Role enabled",
  },
  {
    title: "Lab Management",
    description: "Lab requests, sample tracking, result workflow, and patient lookup.",
    permission: "canAccessLab" satisfies PermissionKey,
    status: "Live",
  },
  {
    title: "Pharmacy",
    description: "Prescription, dispensing, stock, and medicine workflow area.",
    permission: "canAccessPharmacy" satisfies PermissionKey,
    status: "Live",
  },
  {
    title: "Billing & Accounting",
    description: "Billing desk workflow, invoice planning, and accounting access.",
    permission: "canAccessBilling" satisfies PermissionKey,
    status: "Live",
  },
  {
    title: "Inventory Management",
    description: "Consumables, equipment, expiry, and stock workflow area.",
    permission: "canAccessInventory" satisfies PermissionKey,
    status: "Role enabled",
  },
  {
    title: "Surgery",
    description: "Operation theatre schedule, checklist, and post-op workflow area.",
    permission: "canAccessSurgery" satisfies PermissionKey,
    status: "Role enabled",
  },
  {
    title: "Radiology & DICOM Viewer",
    description: "Radiology order and DICOM viewer workspace planning area.",
    permission: "canAccessRadiology" satisfies PermissionKey,
    status: "Role enabled",
  },
  {
    title: "Telemedicine",
    description: "Remote consultation workflow and patient appointment context.",
    permission: "canAccessTelemedicine" satisfies PermissionKey,
    status: "Role enabled",
  },
  {
    title: "Smart Queue & QR Check-In",
    description: "Live token queue, QR check-in, and predicted waiting time.",
    permission: "canViewQueue" satisfies PermissionKey,
    status: "Live",
  },
  {
    title: "Smart EMR Timeline",
    description: "Patient history timeline for visits, diagnoses, reports, billing, and vitals.",
    permission: "canViewEmrTimeline" satisfies PermissionKey,
    status: "Live",
  },
  {
    title: "WhatsApp & Follow-up Automation",
    description:
      "Appointment reminders, missed visit recovery, medicine reminders, and chatbot drafts.",
    permission: "canManageAutomations" satisfies PermissionKey,
    status: "Provider ready",
  },
  {
    title: "Facial / QR Patient Check-In",
    description:
      "QR reception check-in plus face lookup workflow placeholder for biometric providers.",
    permission: "canAccessFacialCheckIn" satisfies PermissionKey,
    status: "QR live",
  },
] as const;
