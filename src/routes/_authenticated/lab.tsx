import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FlaskConical, Plus, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { downloadExcel } from "@/lib/clinical-operations";
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

export const Route = createFileRoute("/_authenticated/lab")({
  component: LabPage,
});

type PatientMini = Pick<Tables<"patients">, "id" | "full_name" | "mrn">;
type LabRow = Tables<"lab_orders"> & { patients: PatientMini | null };

function LabPage() {
  const { user } = useAuth();
  const { data: access } = useRoleAccess();
  const qc = useQueryClient();
  const [orderOpen, setOrderOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<LabRow | null>(null);
  const [patientId, setPatientId] = useState("");
  const [testName, setTestName] = useState("");
  const [priority, setPriority] = useState("routine");
  const [status, setStatus] = useState("completed");
  const [result, setResult] = useState("");
  const [referenceRange, setReferenceRange] = useState("");

  const isAdmin = ["admin", "hospital_admin", "super_admin"].includes(access?.roleKey ?? "");
  const canOrder = access?.roleKey === "doctor" || isAdmin;
  const canProcess = access?.roleKey === "lab_technician" || isAdmin;
  const canView = canOrder || canProcess;

  const { data: patients = [] } = useQuery<PatientMini[]>({
    queryKey: ["clinical-patients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, mrn")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders = [], isLoading } = useQuery<LabRow[]>({
    queryKey: ["lab-orders"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_orders")
        .select("*, patients(id, full_name, mrn)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LabRow[];
    },
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      if (!patientId || !testName.trim()) throw new Error("Patient and test name are required");
      const { data: order, error } = await supabase
        .from("lab_orders")
        .insert({
          patient_id: patientId,
          test_name: testName.trim(),
          priority,
          ordered_by: user!.id,
        })
        .select("id, order_number")
        .single();
      if (error) throw error;

      const { data: technicians } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "custom")
        .eq("custom_label", "lab_technician");
      if (order && technicians?.length) {
        const patient = patients.find((item) => item.id === patientId);
        const { error: notificationError } = await supabase.from("notifications").insert(
          technicians.map((technician) => ({
            recipient_id: technician.user_id,
            actor_id: user!.id,
            patient_id: patientId,
            title: priority === "urgent" ? "Urgent lab order" : "New lab order",
            body: `${order.order_number}: ${testName.trim()} for ${patient?.full_name ?? "patient"}.`,
            metadata: { lab_order_id: order.id, priority },
          })),
        );
        if (notificationError) throw notificationError;
      }
    },
    onSuccess: () => {
      toast.success("Lab order created");
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
      setOrderOpen(false);
      setPatientId("");
      setTestName("");
      setPriority("routine");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateOrder = useMutation({
    mutationFn: async () => {
      if (!selectedOrder) throw new Error("Select a lab order");
      const completed = status === "completed";
      const { error } = await supabase
        .from("lab_orders")
        .update({
          status,
          result: result || null,
          reference_range: referenceRange || null,
          completed_by: completed ? user!.id : null,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", selectedOrder.id);
      if (error) throw error;
      if (completed && selectedOrder.ordered_by && selectedOrder.ordered_by !== user!.id) {
        const { error: notificationError } = await supabase.from("notifications").insert({
          recipient_id: selectedOrder.ordered_by,
          actor_id: user!.id,
          patient_id: selectedOrder.patient_id,
          title: "Lab result completed",
          body: `${selectedOrder.order_number}: ${selectedOrder.test_name} result is ready.`,
          metadata: { lab_order_id: selectedOrder.id },
        });
        if (notificationError) throw notificationError;
      }
    },
    onSuccess: () => {
      toast.success("Lab order updated");
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
      setResultOpen(false);
      setSelectedOrder(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canView) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <FlaskConical className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Laboratory restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Laboratory orders and results are available to doctors, lab technicians and
          administrators.
        </p>
      </div>
    );
  }

  const openResult = (order: LabRow) => {
    setSelectedOrder(order);
    setStatus(order.status);
    setResult(order.result ?? "");
    setReferenceRange(order.reference_range ?? "");
    setResultOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Laboratory</h1>
          <p className="mt-1 text-muted-foreground">
            Order tests, track samples and record verified results.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={orders.length === 0}
            onClick={() =>
              downloadExcel(`careorbit-lab-orders-${new Date().toISOString().slice(0, 10)}.xlsx`, [
                {
                  name: "Lab Orders",
                  rows: orders.map((order) => ({
                    "Order number": order.order_number,
                    Patient: order.patients?.full_name ?? "",
                    MRN: order.patients?.mrn ?? "",
                    Test: order.test_name,
                    Priority: order.priority,
                    Status: order.status,
                    Result: order.result ?? "",
                    "Reference range": order.reference_range ?? "",
                    "Ordered at": order.created_at,
                    "Completed at": order.completed_at ?? "",
                  })),
                },
              ])
            }
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          {canOrder && (
            <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-brand text-white">
                  <Plus className="mr-2 h-4 w-4" /> New lab order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Order laboratory test</DialogTitle>
                  <DialogDescription>
                    Create a patient-linked investigation request.
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
                    <Label>Test name</Label>
                    <Input
                      value={testName}
                      onChange={(event) => setTestName(event.target.value)}
                      placeholder="CBC, HbA1c, thyroid profile..."
                    />
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="routine">Routine</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createOrder.mutate()}
                    disabled={createOrder.isPending || !patientId || !testName.trim()}
                    className="bg-gradient-brand text-white"
                  >
                    {createOrder.isPending ? "Ordering..." : "Create order"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="rounded-[18px] border border-dashed p-10 text-center text-muted-foreground">
          No lab orders yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="grid gap-4 rounded-[18px] border bg-card p-4 shadow-sm md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <TestTube2 className="h-4 w-4 text-brand-blue" />
                  <h2 className="font-semibold">{order.test_name}</h2>
                  <Badge
                    variant="secondary"
                    className={
                      order.status === "completed"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : order.status === "cancelled"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }
                  >
                    {order.status.replace("_", " ")}
                  </Badge>
                  {order.priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {order.order_number} - {order.patients?.full_name} - {order.patients?.mrn}
                </div>
                {order.result && <p className="mt-2 text-sm">Result: {order.result}</p>}
              </div>
              {canProcess && (
                <Button variant="outline" onClick={() => openResult(order)}>
                  Update result
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update lab result</DialogTitle>
            <DialogDescription>
              {selectedOrder?.order_number} - {selectedOrder?.test_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["ordered", "sample_collected", "processing", "completed", "cancelled"].map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {value.replace("_", " ")}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Result</Label>
              <Textarea
                value={result}
                onChange={(event) => setResult(event.target.value)}
                rows={5}
              />
            </div>
            <div>
              <Label>Reference range</Label>
              <Input
                value={referenceRange}
                onChange={(event) => setReferenceRange(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => updateOrder.mutate()}
              disabled={updateOrder.isPending}
              className="bg-gradient-brand text-white"
            >
              {updateOrder.isPending ? "Saving..." : "Save result"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
