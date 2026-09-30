import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CreditCard,
  Eye,
  FileDown,
  FileSpreadsheet,
  Pencil,
  Plus,
  ReceiptIndianRupee,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  calculateInvoiceTotals,
  downloadExcel,
  downloadInvoicePdf,
  downloadReceiptPdf,
  jsonArray,
  money,
  type InvoiceBrand,
  type InvoiceLine,
} from "@/lib/clinical-operations";
import { organizationLogoUrl, useOrganizationSettings } from "@/hooks/use-organization-settings";
import { InvoicePreview } from "@/components/invoice-preview";
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

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});

type PatientMini = Pick<
  Tables<"patients">,
  "id" | "full_name" | "mrn" | "phone" | "email" | "address"
>;
type PaymentRow = Tables<"payments">;
type InvoiceRow = Tables<"invoices"> & {
  patients: PatientMini | null;
  payments: PaymentRow[];
};
type ServiceRow = Tables<"service_catalog">;

const emptyLine: InvoiceLine = {
  description: "Consultation",
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,
};

function BillingPage() {
  const { user } = useAuth();
  const { data: access } = useRoleAccess();
  const { data: organization } = useOrganizationSettings();
  const qc = useQueryClient();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRow | null>(null);
  const [patientId, setPatientId] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([{ ...emptyLine }]);
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");

  const canManage =
    access?.permissions.canAccessBilling || access?.permissions.canManageUsers || false;
  const canCancel =
    access?.permissions.canManageUsers || access?.roleKey === "billing_operator" || false;

  const { data: patients = [] } = useQuery<PatientMini[]>({
    queryKey: ["clinical-patients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, mrn, phone, email, address")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: services = [] } = useQuery<ServiceRow[]>({
    queryKey: ["service-catalog"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("*")
        .eq("is_active", true)
        .order("service_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [], isLoading } = useQuery<InvoiceRow[]>({
    queryKey: ["invoices"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, patients(id, full_name, mrn, phone, email, address), payments(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  const { subtotal, tax, total } = useMemo(
    () => calculateInvoiceTotals(lines, Number(discount || 0)),
    [discount, lines],
  );

  const brand = useMemo<InvoiceBrand>(
    () => ({
      hospitalName: organization?.hospital_name ?? "CareOrbit Hospital",
      legalName: organization?.legal_name ?? undefined,
      logoUrl: organizationLogoUrl(organization?.logo_path),
      address: [
        organization?.address_line_1,
        organization?.address_line_2,
        organization?.city,
        organization?.state,
        organization?.postal_code,
      ]
        .filter(Boolean)
        .join(", "),
      phone: [organization?.primary_phone, organization?.secondary_phone]
        .filter(Boolean)
        .join(" / "),
      email: organization?.email ?? undefined,
      website: organization?.website ?? undefined,
      gstin: organization?.gstin ?? undefined,
      drugLicenseNumbers: organization?.drug_license_numbers ?? [],
      accentColor: organization?.invoice_accent_color ?? "#2563eb",
      terms: organization?.invoice_terms ?? undefined,
      paymentDetails: organization?.payment_details ?? undefined,
      footer: organization?.invoice_footer ?? undefined,
      authorizedSignatory: organization?.authorized_signatory ?? undefined,
    }),
    [organization],
  );

  const resetEditor = () => {
    setEditingInvoice(null);
    setPatientId("");
    setLines([{ ...emptyLine }]);
    setDiscount("0");
    setNotes("");
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      const validLines = lines.filter(
        (line) => line.description.trim() && line.quantity > 0 && line.unitPrice >= 0,
      );
      if (!patientId || validLines.length === 0)
        throw new Error("Patient and invoice items are required");
      const payload = {
        patient_id: patientId,
        items: validLines as unknown as Json,
        subtotal,
        discount_amount: Number(discount || 0),
        tax_amount: tax,
        total_amount: total,
        notes,
        status: "draft",
        updated_by: user!.id,
      };
      if (editingInvoice) {
        const { error } = await supabase
          .from("invoices")
          .update(payload)
          .eq("id", editingInvoice.id)
          .eq("status", "draft");
        if (error) throw error;
      } else {
        const { error } = await supabase.from("invoices").insert({
          ...payload,
          created_by: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Invoice draft saved");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setInvoiceOpen(false);
      resetEditor();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const finalizeInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await fetch("/api/billing/finalize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "Failed to finalize invoice");
    },
    onSuccess: () => {
      toast.success("Invoice finalized");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setPreviewOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteDraft = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceId)
        .eq("status", "draft");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Draft deleted");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelInvoice = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice) throw new Error("Select an invoice");
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: selectedInvoice.id, reason: cancellationReason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "Failed to cancel invoice");
    },
    onSuccess: () => {
      toast.success("Invoice cancelled");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setCancelOpen(false);
      setSelectedInvoice(null);
      setCancellationReason("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice) throw new Error("Select an invoice");
      const amount = Number(paymentAmount);
      const balance = Number(selectedInvoice.total_amount) - Number(selectedInvoice.paid_amount);
      if (!amount || amount <= 0 || amount > balance)
        throw new Error("Enter an amount within the balance");
      const response = await fetch("/api/billing/payment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: selectedInvoice.id,
          amount,
          method: paymentMethod,
          reference: paymentReference || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "Failed to record payment");
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setPaymentOpen(false);
      setSelectedInvoice(null);
      setPaymentAmount("");
      setPaymentReference("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canManage) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <ReceiptIndianRupee className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Billing restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Billing is available to billing operators and administrators.
        </p>
      </div>
    );
  }

  const updateLine = (index: number, key: keyof InvoiceLine, value: string) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [key]: key === "description" || key === "serviceCode" ? value : Number(value || 0),
            }
          : line,
      ),
    );
  };

  const editDraft = (invoice: InvoiceRow) => {
    setEditingInvoice(invoice);
    setPatientId(invoice.patient_id ?? "");
    setLines(jsonArray<InvoiceLine>(invoice.items));
    setDiscount(String(invoice.discount_amount));
    setNotes(invoice.notes ?? "");
    setInvoiceOpen(true);
  };

  const openPreview = (invoice: InvoiceRow) => {
    setSelectedInvoice(invoice);
    setPreviewOpen(true);
  };

  const openPayment = (invoice: InvoiceRow) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(
      String(Math.max(Number(invoice.total_amount) - Number(invoice.paid_amount), 0)),
    );
    setPaymentOpen(true);
  };

  const addService = (serviceId: string) => {
    const service = services.find((item) => item.id === serviceId);
    if (!service) return;
    setLines((current) => [
      ...current,
      {
        serviceCode: service.service_code,
        description: service.service_name,
        quantity: 1,
        unitPrice: Number(service.default_price),
        taxRate: Number(service.tax_rate),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Billing & payments</h1>
          <p className="mt-1 text-muted-foreground">
            Draft, preview and finalize branded invoices, payments and receipts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={invoices.length === 0}
            onClick={() =>
              downloadExcel(`careorbit-invoices-${new Date().toISOString().slice(0, 10)}.xlsx`, [
                {
                  name: "Invoices",
                  rows: invoices.map((invoice) => ({
                    "Invoice number": invoice.invoice_number,
                    Type: invoice.invoice_type,
                    Patient: invoice.patients?.full_name ?? invoice.walk_in_name ?? "",
                    MRN: invoice.patients?.mrn ?? "",
                    Total: Number(invoice.total_amount),
                    Paid: Number(invoice.paid_amount),
                    Balance: Math.max(
                      Number(invoice.total_amount) - Number(invoice.paid_amount),
                      0,
                    ),
                    Status: invoice.status,
                    "Created at": invoice.created_at,
                  })),
                },
                {
                  name: "Payments",
                  rows: invoices.flatMap((invoice) =>
                    invoice.payments.map((payment) => ({
                      "Receipt number": payment.receipt_number,
                      "Invoice number": invoice.invoice_number,
                      Patient: invoice.patients?.full_name ?? "",
                      Amount: Number(payment.amount),
                      Method: payment.method,
                      Reference: payment.reference ?? "",
                      "Paid at": payment.paid_at,
                    })),
                  ),
                },
              ])
            }
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Dialog
            open={invoiceOpen}
            onOpenChange={(value) => {
              setInvoiceOpen(value);
              if (!value) resetEditor();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New draft
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>
                  {editingInvoice ? "Edit invoice draft" : "New invoice draft"}
                </DialogTitle>
                <DialogDescription>
                  Drafts do not count as patient debt until finalized.
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

                {services.length > 0 && (
                  <div>
                    <Label>Service catalogue</Label>
                    <Select value="" onValueChange={addService}>
                      <SelectTrigger>
                        <SelectValue placeholder="Add a catalogue service" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.service_code} - {service.service_name} (
                            {money(service.default_price)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Invoice items</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setLines((current) => [...current, { ...emptyLine, description: "" }])
                      }
                    >
                      <Plus className="mr-1 h-4 w-4" /> Custom item
                    </Button>
                  </div>
                  {lines.map((line, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-md border p-3 md:grid-cols-[110px_1fr_80px_120px_90px_auto]"
                    >
                      <Input
                        value={line.serviceCode ?? ""}
                        onChange={(event) => updateLine(index, "serviceCode", event.target.value)}
                        placeholder="Code"
                      />
                      <Input
                        value={line.description}
                        onChange={(event) => updateLine(index, "description", event.target.value)}
                        placeholder="Service or item"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(event) => updateLine(index, "quantity", event.target.value)}
                        aria-label="Quantity"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) => updateLine(index, "unitPrice", event.target.value)}
                        aria-label="Unit price"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={line.taxRate ?? 0}
                        onChange={(event) => updateLine(index, "taxRate", event.target.value)}
                        aria-label="Tax rate"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, lineIndex) => lineIndex !== index),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <Label>Subtotal</Label>
                    <Input value={money(subtotal)} disabled />
                  </div>
                  <div>
                    <Label>Discount</Label>
                    <Input
                      type="number"
                      min={0}
                      value={discount}
                      onChange={(event) => setDiscount(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Tax</Label>
                    <Input value={money(tax)} disabled />
                  </div>
                  <div>
                    <Label>Total</Label>
                    <Input value={money(total)} disabled />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => saveDraft.mutate()}
                  disabled={saveDraft.isPending || !patientId}
                >
                  {saveDraft.isPending ? "Saving..." : "Save draft"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-[18px] border border-dashed p-10 text-center text-muted-foreground">
          No invoices created yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {invoices.map((invoice) => {
            const invoiceLines = jsonArray<InvoiceLine>(invoice.items);
            const balance = Math.max(Number(invoice.total_amount) - Number(invoice.paid_amount), 0);
            return (
              <div key={invoice.id} className="rounded-[18px] border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{invoice.invoice_number}</h2>
                      <Badge
                        variant={invoice.status === "cancelled" ? "destructive" : "secondary"}
                        className={
                          invoice.status === "cancelled"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : invoice.status === "issued"
                              ? "border-purple-200 bg-purple-50 text-purple-700"
                              : invoice.status === "paid"
                                ? "border-green-200 bg-green-50 text-green-700"
                                : invoice.status === "partially_paid"
                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                        }
                      >
                        {invoice.status.replace("_", " ")}
                      </Badge>
                      <Badge variant="outline">{invoice.invoice_type}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {invoice.patients?.full_name ?? invoice.walk_in_name ?? "Walk-in customer"}
                      {invoice.patients?.mrn ? ` - ${invoice.patients.mrn}` : ""}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-5 text-sm">
                      <span>
                        Total: <strong>{money(invoice.total_amount)}</strong>
                      </span>
                      <span>
                        Paid: <strong>{money(invoice.paid_amount)}</strong>
                      </span>
                      <span>
                        Balance: <strong>{money(balance)}</strong>
                      </span>
                    </div>
                    {invoice.cancellation_reason && (
                      <p className="mt-2 text-xs text-destructive">
                        Cancelled: {invoice.cancellation_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {invoice.status === "draft" && invoice.invoice_type === "general" && (
                      <>
                        <Button variant="outline" onClick={() => editDraft(invoice)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </Button>
                        <Button variant="outline" onClick={() => openPreview(invoice)}>
                          <Eye className="mr-2 h-4 w-4" /> Preview
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => deleteDraft.mutate(invoice.id)}
                          disabled={deleteDraft.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                      </>
                    )}
                    {["issued", "partially_paid"].includes(invoice.status) && balance > 0 && (
                      <Button variant="outline" onClick={() => openPayment(invoice)}>
                        <CreditCard className="mr-2 h-4 w-4" /> Record payment
                      </Button>
                    )}
                    {canCancel &&
                      invoice.status === "issued" &&
                      Number(invoice.paid_amount) === 0 && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setCancelOpen(true);
                          }}
                        >
                          <Ban className="mr-2 h-4 w-4" /> Cancel
                        </Button>
                      )}
                    {invoice.status !== "draft" && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          downloadInvoicePdf({
                            invoiceNumber: invoice.invoice_number,
                            invoiceDate: invoice.finalized_at ?? invoice.created_at,
                            status: invoice.status,
                            title:
                              invoice.invoice_type === "pharmacy"
                                ? "PHARMACY TAX INVOICE"
                                : "TAX INVOICE",
                            patientName:
                              invoice.patients?.full_name ??
                              invoice.walk_in_name ??
                              "Walk-in customer",
                            mrn: invoice.patients?.mrn ?? "Walk-in",
                            patientPhone:
                              invoice.patients?.phone ?? invoice.walk_in_phone ?? undefined,
                            patientAddress: invoice.patients?.address ?? undefined,
                            items: invoiceLines,
                            subtotal: Number(invoice.subtotal),
                            discount: Number(invoice.discount_amount),
                            tax: Number(invoice.tax_amount),
                            cgst:
                              invoice.invoice_type === "pharmacy"
                                ? Number(invoice.cgst_amount)
                                : undefined,
                            sgst:
                              invoice.invoice_type === "pharmacy"
                                ? Number(invoice.sgst_amount)
                                : undefined,
                            total: Number(invoice.total_amount),
                            paid: Number(invoice.paid_amount),
                            brand,
                          })
                        }
                      >
                        <FileDown className="mr-2 h-4 w-4" /> Invoice PDF
                      </Button>
                    )}
                  </div>
                </div>

                {invoice.payments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                    {invoice.payments.map((payment) => (
                      <Button
                        key={payment.id}
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          downloadReceiptPdf({
                            receiptNumber: payment.receipt_number,
                            invoiceNumber: invoice.invoice_number,
                            paidAt: payment.paid_at,
                            patientName: invoice.patients?.full_name ?? "Patient",
                            mrn: invoice.patients?.mrn ?? "",
                            amount: Number(payment.amount),
                            method: payment.method,
                            reference: payment.reference,
                            remainingBalance: Math.max(
                              Number(invoice.total_amount) -
                                invoice.payments
                                  .filter((row) => row.paid_at <= payment.paid_at)
                                  .reduce((sum, row) => sum + Number(row.amount), 0),
                              0,
                            ),
                            brand,
                          })
                        }
                      >
                        <ReceiptIndianRupee className="mr-2 h-4 w-4" />
                        {payment.receipt_number}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Invoice preview</DialogTitle>
            <DialogDescription>
              Review the exact business, patient and financial information before finalizing.
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <InvoicePreview
              brand={brand}
              title={
                selectedInvoice.invoice_type === "pharmacy" ? "PHARMACY TAX INVOICE" : "TAX INVOICE"
              }
              invoiceNumber={selectedInvoice.invoice_number}
              invoiceDate={selectedInvoice.created_at}
              status={selectedInvoice.status}
              patientName={
                selectedInvoice.patients?.full_name ??
                selectedInvoice.walk_in_name ??
                "Walk-in customer"
              }
              mrn={selectedInvoice.patients?.mrn ?? "Walk-in"}
              patientPhone={
                selectedInvoice.patients?.phone ?? selectedInvoice.walk_in_phone ?? undefined
              }
              patientAddress={selectedInvoice.patients?.address ?? undefined}
              items={jsonArray<InvoiceLine>(selectedInvoice.items)}
              subtotal={Number(selectedInvoice.subtotal)}
              discount={Number(selectedInvoice.discount_amount)}
              tax={Number(selectedInvoice.tax_amount)}
              cgst={
                selectedInvoice.invoice_type === "pharmacy"
                  ? Number(selectedInvoice.cgst_amount)
                  : undefined
              }
              sgst={
                selectedInvoice.invoice_type === "pharmacy"
                  ? Number(selectedInvoice.sgst_amount)
                  : undefined
              }
              total={Number(selectedInvoice.total_amount)}
              paid={Number(selectedInvoice.paid_amount)}
            />
          )}
          <DialogFooter>
            {selectedInvoice?.status === "draft" && (
              <Button
                onClick={() => finalizeInvoice.mutate(selectedInvoice.id)}
                disabled={finalizeInvoice.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                {finalizeInvoice.isPending ? "Finalizing..." : "Finalize invoice"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>{selectedInvoice?.invoice_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["cash", "card", "upi", "bank_transfer", "insurance", "other"].map((method) => (
                    <SelectItem key={method} value={method}>
                      {method.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference</Label>
              <Input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>
              {recordPayment.isPending ? "Recording..." : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel invoice</DialogTitle>
            <DialogDescription>
              The invoice remains in the audit history. Paid invoices cannot be cancelled here.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Cancellation reason</Label>
            <Textarea
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => cancelInvoice.mutate()}
              disabled={cancelInvoice.isPending || cancellationReason.trim().length < 3}
            >
              {cancelInvoice.isPending ? "Cancelling..." : "Confirm cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
