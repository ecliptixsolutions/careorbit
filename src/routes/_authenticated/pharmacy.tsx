import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, PackagePlus, Pill, ReceiptIndianRupee, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { downloadExcel, money } from "@/lib/clinical-operations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/pharmacy")({
  component: PharmacyPage,
});

type PatientMini = Pick<Tables<"patients">, "id" | "full_name" | "mrn">;

function PharmacyPage() {
  const { user } = useAuth();
  const { data: access } = useRoleAccess();
  const qc = useQueryClient();
  const [stockOpen, setStockOpen] = useState(false);
  const [dispenseOpen, setDispenseOpen] = useState(false);
  const [medicineName, setMedicineName] = useState("");
  const [sku, setSku] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [stock, setStock] = useState("0");
  const [reorder, setReorder] = useState("10");
  const [price, setPrice] = useState("0");
  const [mrp, setMrp] = useState("0");
  const [gstRate, setGstRate] = useState("0");
  const [hsnCode, setHsnCode] = useState("");
  const [patientId, setPatientId] = useState("");
  const [prescriptionId, setPrescriptionId] = useState("__none__");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const canManage =
    access?.permissions.canAccessPharmacy || access?.permissions.canManageUsers || false;

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

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pharmacy-items"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pharmacy_items")
        .select("*")
        .order("medicine_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["pharmacy-prescriptions"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescriptions")
        .select("id, prescription_number, patient_id")
        .eq("status", "issued")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: dispensations = [] } = useQuery({
    queryKey: ["dispensations"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispensations")
        .select("*, patients(id, full_name, mrn), pharmacy_items(id, medicine_name)")
        .order("dispensed_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const addStock = useMutation({
    mutationFn: async () => {
      if (!medicineName.trim()) throw new Error("Medicine name is required");
      const { error } = await supabase.from("pharmacy_items").insert({
        medicine_name: medicineName.trim(),
        sku: sku || null,
        batch_number: batch || null,
        expires_on: expiry || null,
        stock_quantity: Number(stock || 0),
        reorder_level: Number(reorder || 0),
        unit_price: Number(price || 0),
        mrp: Number(mrp || price || 0),
        gst_rate: Number(gstRate || 0),
        hsn_code: hsnCode || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medicine added to stock");
      qc.invalidateQueries({ queryKey: ["pharmacy-items"] });
      setStockOpen(false);
      setMedicineName("");
      setSku("");
      setBatch("");
      setExpiry("");
      setStock("0");
      setPrice("0");
      setMrp("0");
      setGstRate("0");
      setHsnCode("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dispense = useMutation({
    mutationFn: async () => {
      if (!patientId || !itemId) throw new Error("Patient and medicine are required");
      const response = await fetch("/api/pharmacy/dispense", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          prescription_id: prescriptionId === "__none__" ? null : prescriptionId,
          pharmacy_item_id: itemId,
          quantity: Number(quantity),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "Failed to dispense medicine");
    },
    onSuccess: () => {
      toast.success("Medicine dispensed and stock updated");
      qc.invalidateQueries({ queryKey: ["pharmacy-items"] });
      qc.invalidateQueries({ queryKey: ["dispensations"] });
      setDispenseOpen(false);
      setPatientId("");
      setPrescriptionId("__none__");
      setItemId("");
      setQuantity("1");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canManage) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <Pill className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Pharmacy restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pharmacy stock and dispensing are available to pharmacists and administrators.
        </p>
      </div>
    );
  }

  const filteredPrescriptions = prescriptions.filter(
    (prescription) => !patientId || prescription.patient_id === patientId,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Pharmacy</h1>
          <p className="mt-1 text-muted-foreground">
            Track medicine batches, expiry, stock levels and patient dispensing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/pharmacy/bill">
              <ReceiptIndianRupee className="mr-2 h-4 w-4" /> New bill
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled={items.length === 0}
            onClick={() =>
              downloadExcel(`careorbit-pharmacy-${new Date().toISOString().slice(0, 10)}.xlsx`, [
                {
                  name: "Stock",
                  rows: items.map((item) => ({
                    Medicine: item.medicine_name,
                    SKU: item.sku ?? "",
                    Batch: item.batch_number ?? "",
                    Expiry: item.expires_on ?? "",
                    Stock: item.stock_quantity,
                    "Reorder level": item.reorder_level,
                    "Unit price": Number(item.unit_price),
                    "Low stock": item.stock_quantity <= item.reorder_level ? "Yes" : "No",
                  })),
                },
                {
                  name: "Dispensations",
                  rows: dispensations.map((dispensation) => ({
                    Patient: dispensation.patients?.full_name ?? "",
                    MRN: dispensation.patients?.mrn ?? "",
                    Medicine: dispensation.pharmacy_items?.medicine_name ?? "",
                    Quantity: dispensation.quantity,
                    "Dispensed at": dispensation.dispensed_at,
                  })),
                },
              ])
            }
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Dialog open={stockOpen} onOpenChange={setStockOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <PackagePlus className="mr-2 h-4 w-4" /> Add stock
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add pharmacy stock</DialogTitle>
                <DialogDescription>Register a medicine batch and selling price.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Medicine name</Label>
                  <Input
                    value={medicineName}
                    onChange={(event) => setMedicineName(event.target.value)}
                  />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input value={sku} onChange={(event) => setSku(event.target.value)} />
                </div>
                <div>
                  <Label>Batch</Label>
                  <Input value={batch} onChange={(event) => setBatch(event.target.value)} />
                </div>
                <div>
                  <Label>Expiry</Label>
                  <Input
                    type="date"
                    value={expiry}
                    onChange={(event) => setExpiry(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Stock quantity</Label>
                  <Input
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(event) => setStock(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Reorder level</Label>
                  <Input
                    type="number"
                    min={0}
                    value={reorder}
                    onChange={(event) => setReorder(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Unit price</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
                <div>
                  <Label>MRP</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={mrp}
                    onChange={(event) => setMrp(event.target.value)}
                  />
                </div>
                <div>
                  <Label>GST rate (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={gstRate}
                    onChange={(event) => setGstRate(event.target.value)}
                  />
                </div>
                <div>
                  <Label>HSN code</Label>
                  <Input value={hsnCode} onChange={(event) => setHsnCode(event.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addStock.mutate()}
                  disabled={addStock.isPending || !medicineName.trim()}
                  className="bg-gradient-brand text-white"
                >
                  {addStock.isPending ? "Adding..." : "Add stock"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={dispenseOpen} onOpenChange={setDispenseOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-brand text-white">
                <ShoppingBag className="mr-2 h-4 w-4" /> Dispense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dispense medicine</DialogTitle>
                <DialogDescription>Stock is reduced atomically after dispensing.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Patient</Label>
                  <Select
                    value={patientId}
                    onValueChange={(value) => {
                      setPatientId(value);
                      setPrescriptionId("__none__");
                    }}
                  >
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
                  <Label>Prescription</Label>
                  <Select value={prescriptionId} onValueChange={setPrescriptionId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Without prescription link</SelectItem>
                      {filteredPrescriptions.map((prescription) => (
                        <SelectItem key={prescription.id} value={prescription.id}>
                          {prescription.prescription_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Medicine</Label>
                  <Select value={itemId} onValueChange={setItemId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stock item" />
                    </SelectTrigger>
                    <SelectContent>
                      {items
                        .filter((item) => item.stock_quantity > 0)
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.medicine_name} ({item.stock_quantity} available)
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => dispense.mutate()}
                  disabled={dispense.isPending || !patientId || !itemId}
                  className="bg-gradient-brand text-white"
                >
                  {dispense.isPending ? "Dispensing..." : "Dispense medicine"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[18px] border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Medicines</div>
          <div className="mt-2 text-3xl font-bold text-heading">{items.length}</div>
        </div>
        <div className="rounded-[18px] border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Low stock</div>
          <div className="mt-2 text-3xl font-bold text-heading">
            {items.filter((item) => item.stock_quantity <= item.reorder_level).length}
          </div>
        </div>
        <div className="rounded-[18px] border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Dispensed records</div>
          <div className="mt-2 text-3xl font-bold text-heading">{dispensations.length}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="rounded-[18px] border border-dashed p-10 text-center text-muted-foreground">
          No pharmacy stock yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">GST</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t hover:bg-primary-soft/60">
                  <td className="px-4 py-3 font-medium">
                    {item.medicine_name}
                    <div className="text-xs text-muted-foreground">{item.sku}</div>
                  </td>
                  <td className="px-4 py-3">{item.batch_number || "-"}</td>
                  <td className="px-4 py-3">{item.expires_on || "-"}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        item.stock_quantity <= item.reorder_level ? "destructive" : "secondary"
                      }
                      className={
                        item.stock_quantity <= item.reorder_level
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-green-200 bg-green-50 text-green-700"
                      }
                    >
                      {item.stock_quantity}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{money(item.unit_price)}</td>
                  <td className="px-4 py-3">{Number(item.gst_rate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
