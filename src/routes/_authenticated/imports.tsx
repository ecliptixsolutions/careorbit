import { createFileRoute } from "@tanstack/react-router";
import { DatabaseZap, ShieldAlert } from "lucide-react";
import { useRoleAccess } from "@/hooks/use-role-access";
import { DataImportPanel } from "@/components/data-import-panel";
import type { ImportField, ImportResult, ImportRow } from "@/lib/data-import";

export const Route = createFileRoute("/_authenticated/imports")({
  component: ImportsPage,
});

const patientFields: ImportField[] = [
  { key: "full_name", label: "Full name", required: true, example: "Training Patient" },
  { key: "date_of_birth", label: "Date of birth", example: "1990-01-31" },
  { key: "gender", label: "Gender", example: "Female" },
  { key: "phone", label: "Phone", example: "9000000000" },
  { key: "email", label: "Email", example: "patient@example.com" },
  { key: "address", label: "Address", example: "Hospital Road" },
  { key: "blood_group", label: "Blood group", example: "O+" },
  { key: "emergency_contact", label: "Emergency contact", example: "Guardian 9111111111" },
  { key: "mrn", label: "Existing MRN", example: "" },
  { key: "notes", label: "Notes", example: "" },
];

const pharmacyFields: ImportField[] = [
  { key: "medicine_name", label: "Medicine name", required: true, example: "Paracetamol 500 mg" },
  { key: "sku", label: "SKU", example: "PCM-500" },
  { key: "batch_number", label: "Batch number", example: "B-2026-01" },
  { key: "expiry_date", label: "Expiry date", example: "2028-12-31" },
  { key: "quantity", label: "Quantity", required: true, example: 100 },
  { key: "reorder_level", label: "Reorder level", example: 10 },
  { key: "unit_price", label: "Unit price", required: true, example: 2.5 },
  { key: "mrp", label: "MRP", example: 3 },
  { key: "gst_rate", label: "GST rate", example: 12 },
  { key: "hsn_code", label: "HSN code", example: "30049099" },
];

const serviceFields: ImportField[] = [
  { key: "service_code", label: "Service code", required: true, example: "CONSULT" },
  { key: "service_name", label: "Service name", required: true, example: "Consultation" },
  { key: "category", label: "Category", example: "OPD" },
  { key: "default_price", label: "Default price", required: true, example: 500 },
  { key: "tax_rate", label: "Tax rate", example: 0 },
  { key: "active", label: "Active", example: true },
];

const appointmentFields: ImportField[] = [
  { key: "patient_mrn", label: "Patient MRN", required: true, example: "MRN-12345678" },
  { key: "doctor_email", label: "Doctor email", required: true, example: "doctor@example.com" },
  { key: "appointment_date", label: "Appointment date", required: true, example: "2026-07-10" },
  { key: "appointment_time", label: "Appointment time", required: true, example: "10:30" },
  { key: "reason", label: "Reason", example: "Follow-up" },
  { key: "status", label: "Status", example: "scheduled" },
];

const staffFields: ImportField[] = [
  { key: "full_name", label: "Full name", required: true, example: "Staff Member" },
  { key: "email", label: "Email", required: true, example: "staff@example.com" },
  { key: "phone", label: "Phone", example: "9000000000" },
  { key: "organization", label: "Organization", example: "CareOrbit Hospital" },
  { key: "role", label: "Role", required: true, example: "staff" },
];

async function apiImport(
  endpoint: string,
  input: { fileName: string; rows: ImportRow[]; updateExisting?: boolean },
): Promise<ImportResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: input.fileName,
      rows: input.rows,
      update_existing: input.updateExisting ?? false,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "Import failed");
  return {
    total: Number(body.total ?? 0),
    imported: Number(body.imported ?? 0),
    skipped: Number(body.skipped ?? 0),
    errors: Array.isArray(body.errors) ? body.errors : [],
  };
}

function ImportsPage() {
  const { data: access } = useRoleAccess();
  const role = access?.roleKey;
  const isAdmin = access?.permissions.canManageUsers ?? false;
  const canPatientImport = isAdmin || role === "staff" || role === "nurse";
  const canPharmacyImport = isAdmin || role === "pharmacist";
  const canServiceImport = isAdmin || role === "billing_operator";
  const canAppointmentImport = isAdmin || role === "staff" || role === "nurse";

  if (!access?.permissions.canManageImports) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Data imports restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role does not allow bulk database changes.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <DatabaseZap className="h-9 w-9 text-primary" />
        <h1 className="mt-3 text-3xl font-bold">Data imports</h1>
        <p className="mt-1 text-muted-foreground">
          Map, preview and validate CSV or XLSX data before it reaches CareOrbit.
        </p>
      </div>

      {canPatientImport && (
        <DataImportPanel
          title="Patients"
          description="Creates new patient records. MRN, phone, email and name/date-of-birth combinations are checked for duplicates."
          templateName="patients"
          fields={patientFields}
          submit={(input) => apiImport("/api/imports/patients", input)}
        />
      )}

      {canPharmacyImport && (
        <DataImportPanel
          title="Pharmacy stock"
          description="Imports medicine batches. Existing SKU and batch matches are skipped unless the update option is explicitly confirmed."
          templateName="pharmacy"
          fields={pharmacyFields}
          allowConfirmedUpdates
          submit={async (input) => apiImport("/api/imports/pharmacy", input)}
        />
      )}

      {canServiceImport && (
        <DataImportPanel
          title="Billing service catalogue"
          description="Creates or updates service codes, default prices and tax rates used when drafting invoices."
          templateName="billing-services"
          fields={serviceFields}
          submit={(input) => apiImport("/api/imports/services", input)}
        />
      )}

      {canAppointmentImport && (
        <DataImportPanel
          title="Appointments"
          description="Patient MRNs and doctor emails must already exist. Conflicting doctor times are rejected."
          templateName="appointments"
          fields={appointmentFields}
          submit={(input) => apiImport("/api/imports/appointments", input)}
        />
      )}

      {isAdmin && (
        <DataImportPanel
          title="Staff invitations"
          description="Sends secure activation emails. Passwords are never accepted in an import file."
          templateName="staff-invitations"
          fields={staffFields}
          submit={async (input) => apiImport("/api/admin/invite-staff", input)}
        />
      )}
    </div>
  );
}
