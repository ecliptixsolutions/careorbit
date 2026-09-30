import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, Plus, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  downloadExcel,
  downloadPrescriptionPdf,
  jsonArray,
  type MedicineLine,
} from "@/lib/clinical-operations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/prescriptions")({
  component: PrescriptionsPage,
});

type PatientMini = Pick<Tables<"patients">, "id" | "full_name" | "mrn">;
type PrescriptionRow = Tables<"prescriptions"> & { patients: PatientMini | null };

const emptyMedicine: MedicineLine = {
  name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
};

function PrescriptionsPage() {
  const { user } = useAuth();
  const { data: access } = useRoleAccess();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [advice, setAdvice] = useState("");
  const [medicines, setMedicines] = useState<MedicineLine[]>([{ ...emptyMedicine }]);

  const canView =
    access?.permissions.canViewPrescriptions || access?.permissions.canManageUsers || false;
  const canCreate =
    access?.permissions.canCreatePrescriptions || access?.permissions.canManageUsers || false;

  const { data: patients = [] } = useQuery<PatientMini[]>({
    queryKey: ["clinical-patients"],
    enabled: canCreate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, mrn")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["clinical-profiles"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: prescriptions = [], isLoading } = useQuery<PrescriptionRow[]>({
    queryKey: ["prescriptions"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescriptions")
        .select("*, patients(id, full_name, mrn)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PrescriptionRow[];
    },
  });

  const createPrescription = useMutation({
    mutationFn: async () => {
      if (!canCreate) throw new Error("Only doctors and administrators can issue prescriptions");
      const validMedicines = medicines.filter((medicine) => medicine.name.trim());
      if (!patientId || validMedicines.length === 0) {
        throw new Error("Select a patient and add at least one medicine");
      }
      const { data: prescription, error } = await supabase
        .from("prescriptions")
        .insert({
          patient_id: patientId,
          doctor_id: user!.id,
          created_by: user!.id,
          diagnosis,
          advice,
          medicines: validMedicines as unknown as Json,
          status: "issued",
          issued_at: new Date().toISOString(),
        })
        .select("id, prescription_number")
        .single();
      if (error) throw error;

      const { data: pharmacists } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "custom")
        .eq("custom_label", "pharmacist");
      if (prescription && pharmacists?.length) {
        const patient = patients.find((item) => item.id === patientId);
        const { error: notificationError } = await supabase.from("notifications").insert(
          pharmacists.map((pharmacist) => ({
            recipient_id: pharmacist.user_id,
            actor_id: user!.id,
            patient_id: patientId,
            title: "Prescription ready for pharmacy",
            body: `${prescription.prescription_number} issued for ${patient?.full_name ?? "patient"}.`,
            metadata: { prescription_id: prescription.id },
          })),
        );
        if (notificationError) throw notificationError;
      }
    },
    onSuccess: () => {
      toast.success("Prescription issued");
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      setPatientId("");
      setDiagnosis("");
      setAdvice("");
      setMedicines([{ ...emptyMedicine }]);
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canView) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Prescriptions restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Prescription access is available to authorized clinical and pharmacy roles.
        </p>
      </div>
    );
  }

  const updateMedicine = (index: number, key: keyof MedicineLine, value: string) => {
    setMedicines((current) =>
      current.map((medicine, medicineIndex) =>
        medicineIndex === index ? { ...medicine, [key]: value } : medicine,
      ),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Prescriptions</h1>
          <p className="mt-1 text-muted-foreground">
            {canCreate
              ? "Issue structured prescriptions and download patient-ready PDFs."
              : "Review issued prescriptions and download patient-ready PDFs."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={prescriptions.length === 0}
            onClick={() =>
              downloadExcel(
                `careorbit-prescriptions-${new Date().toISOString().slice(0, 10)}.xlsx`,
                [
                  {
                    name: "Prescriptions",
                    rows: prescriptions.map((prescription) => ({
                      "Prescription number": prescription.prescription_number,
                      Patient: prescription.patients?.full_name ?? "",
                      MRN: prescription.patients?.mrn ?? "",
                      Doctor:
                        profiles.find((profile) => profile.id === prescription.doctor_id)
                          ?.full_name ?? "CareOrbit Doctor",
                      Diagnosis: prescription.diagnosis ?? "",
                      Medicines: jsonArray<MedicineLine>(prescription.medicines)
                        .map((medicine) =>
                          [medicine.name, medicine.dosage, medicine.frequency, medicine.duration]
                            .filter(Boolean)
                            .join(" "),
                        )
                        .join("; "),
                      Advice: prescription.advice ?? "",
                      Status: prescription.status,
                      "Issued at": prescription.issued_at ?? prescription.created_at,
                    })),
                  },
                ],
              )
            }
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          {canCreate && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-brand text-white">
                  <Plus className="mr-2 h-4 w-4" /> New prescription
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Issue prescription</DialogTitle>
                  <DialogDescription>
                    Add diagnosis, medicines, dosage instructions, duration and clinical advice.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Patient</Label>
                    <Select value={patientId} onValueChange={setPatientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {patients.map((patient) => (
                          <SelectItem key={patient.id} value={patient.id}>
                            {patient.full_name} ({patient.mrn})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Diagnosis</Label>
                    <Textarea
                      value={diagnosis}
                      onChange={(event) => setDiagnosis(event.target.value)}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Medicines</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setMedicines((current) => [...current, { ...emptyMedicine }])
                        }
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add medicine
                      </Button>
                    </div>
                    {medicines.map((medicine, index) => (
                      <div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-5">
                        <Input
                          value={medicine.name}
                          onChange={(event) => updateMedicine(index, "name", event.target.value)}
                          placeholder="Medicine"
                        />
                        <Input
                          value={medicine.dosage}
                          onChange={(event) => updateMedicine(index, "dosage", event.target.value)}
                          placeholder="Dose"
                        />
                        <Input
                          value={medicine.frequency}
                          onChange={(event) =>
                            updateMedicine(index, "frequency", event.target.value)
                          }
                          placeholder="Frequency"
                        />
                        <Input
                          value={medicine.duration}
                          onChange={(event) =>
                            updateMedicine(index, "duration", event.target.value)
                          }
                          placeholder="Duration"
                        />
                        <div className="flex gap-2">
                          <Input
                            value={medicine.instructions}
                            onChange={(event) =>
                              updateMedicine(index, "instructions", event.target.value)
                            }
                            placeholder="Instructions"
                          />
                          {medicines.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setMedicines((current) =>
                                  current.filter((_, medicineIndex) => medicineIndex !== index),
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <Label>Advice</Label>
                    <Textarea value={advice} onChange={(event) => setAdvice(event.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createPrescription.mutate()}
                    disabled={createPrescription.isPending || !patientId}
                    className="bg-gradient-brand text-white"
                  >
                    {createPrescription.isPending ? "Issuing..." : "Issue prescription"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : prescriptions.length === 0 ? (
        <div className="rounded-[18px] border border-dashed p-10 text-center text-muted-foreground">
          No prescriptions issued yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {prescriptions.map((prescription) => {
            const medicineLines = jsonArray<MedicineLine>(prescription.medicines);
            const doctorName =
              profiles.find((profile) => profile.id === prescription.doctor_id)?.full_name ??
              "CareOrbit Doctor";
            return (
              <div
                key={prescription.id}
                className="grid gap-4 rounded-[18px] border bg-card p-4 shadow-sm md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{prescription.prescription_number}</h2>
                    <Badge
                      variant="secondary"
                      className={
                        prescription.status === "issued"
                          ? "border-purple-200 bg-purple-50 text-purple-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }
                    >
                      {prescription.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {prescription.patients?.full_name} - {prescription.patients?.mrn} - {doctorName}
                  </div>
                  <p className="mt-2 text-sm">
                    {prescription.diagnosis || "Diagnosis not specified"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {medicineLines.map((medicine, index) => (
                      <Badge key={`${medicine.name}-${index}`} variant="outline">
                        {medicine.name} {medicine.dosage}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadPrescriptionPdf({
                      prescriptionNumber: prescription.prescription_number,
                      patientName: prescription.patients?.full_name ?? "Patient",
                      mrn: prescription.patients?.mrn ?? "",
                      doctorName,
                      diagnosis: prescription.diagnosis ?? "",
                      advice: prescription.advice ?? "",
                      medicines: medicineLines,
                      issuedAt: prescription.issued_at ?? prescription.created_at,
                    })
                  }
                >
                  <FileDown className="mr-2 h-4 w-4" /> PDF
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
