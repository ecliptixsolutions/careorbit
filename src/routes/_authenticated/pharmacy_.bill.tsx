import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileDown,
  FileSpreadsheet,
  Minus,
  Plus,
  Printer,
  ReceiptIndianRupee,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { organizationLogoUrl, useOrganizationSettings } from "@/hooks/use-organization-settings";
import {
  calculateInvoiceTotals,
  downloadExcel,
  downloadInvoicePdf,
  jsonArray,
  money,
  type InvoiceBrand,
  type InvoiceLine,
} from "@/lib/clinical-operations";
import { InvoicePreview } from "@/components/invoice-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/pharmacy_/bill")({
  component: PharmacyBillPage,
});

type PatientMini = Pick<Tables<"patients">, "id" | "full_name" | "mrn" | "phone" | "address">;
type PharmacyItem = Tables<"pharmacy_items">;
type PaymentRow = Tables<"payments">;
type PharmacyInvoice = Tables<"invoices"> & {
  patients: PatientMini | null;
  payments: PaymentRow[];
};
type CartLine = {
  pharmacyItemId: string;
  quantity: number;
  discountPercent: number;
};

function PharmacyBillPage() {
  const { user } = useAuth();
  const { data: access } = useRoleAccess();
  const { data: organization } = useOrganizationSettings();
  const queryClient = useQueryClient();
  const [patientMode, setPatientMode] = useState<"patient" | "walk-in">("patient");
  const [patientId, setPatientId] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<PharmacyInvoice | null>(null);

  const canManage =
    access?.permissions.canAccessPharmacy || access?.permissions.canManageUsers || false;

  const { data: patients = [] } = useQuery<PatientMini[]>({
    queryKey: ["clinical-patients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, mrn, phone, address")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stock = [] } = useQuery<PharmacyItem[]>({
    queryKey: ["pharmacy-items"],
    enabled: canManage,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("pharmacy_items")
        .select("*")
        .gt("stock_quantity", 0)
        .or(`expires_on.is.null,expires_on.gte.${today}`)
        .order("medicine_name")
        .order("expires_on", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<PharmacyInvoice[]>({
    queryKey: ["pharmacy-invoices"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, patients(id, full_name, mrn, phone, address), payments(*)")
        .eq("invoice_type", "pharmacy")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as PharmacyInvoice[];
    },
  });

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

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return stock
      .filter((item) =>
        [item.medicine_name, item.sku, item.batch_number]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(term)),
      )
      .slice(0, 12);
  }, [search, stock]);

  const invoiceLines = useMemo<InvoiceLine[]>(
    () =>
      cart.flatMap((line) => {
        const item = stock.find((candidate) => candidate.id === line.pharmacyItemId);
        if (!item) return [];
        const gross = Number(item.unit_price) * line.quantity;
        const discountAmount = gross * (line.discountPercent / 100);
        const taxableAmount = gross - discountAmount;
        const taxAmount = taxableAmount * (Number(item.gst_rate) / 100);
        return [
          {
            pharmacyItemId: item.id,
            description: item.medicine_name,
            medicineName: item.medicine_name,
            serviceCode: item.sku ?? undefined,
            sku: item.sku ?? undefined,
            hsnCode: item.hsn_code ?? undefined,
            batchNumber: item.batch_number ?? undefined,
            expiryDate: item.expires_on ?? undefined,
            quantity: line.quantity,
            unitPrice: Number(item.unit_price),
            mrp: Number(item.mrp),
            discountPercent: line.discountPercent,
            discountAmount,
            taxRate: Number(item.gst_rate),
            taxableAmount,
            taxAmount,
            amount: taxableAmount + taxAmount,
          },
        ];
      }),
    [cart, stock],
  );
  const totals = useMemo(() => calculateInvoiceTotals(invoiceLines), [invoiceLines]);
  const payment = Number(amountReceived || 0);
  const balance = Math.max(totals.total - payment, 0);
  const changeDue = Math.max(payment - totals.total, 0);

  const addToCart = (item: PharmacyItem) => {
    setCart((current) => {
      const existing = current.find((line) => line.pharmacyItemId === item.id);
      if (existing) {
        if (existing.quantity >= item.stock_quantity) {
          toast.error(`Only ${item.stock_quantity} units are available`);
          return current;
        }
        return current.map((line) =>
          line.pharmacyItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { pharmacyItemId: item.id, quantity: 1, discountPercent: 0 }];
    });
    setSearch("");
  };

  const updateCart = (
    pharmacyItemId: string,
    key: "quantity" | "discountPercent",
    value: number,
  ) => {
    const item = stock.find((candidate) => candidate.id === pharmacyItemId);
    setCart((current) =>
      current.map((line) =>
        line.pharmacyItemId === pharmacyItemId
          ? {
              ...line,
              [key]:
                key === "quantity"
                  ? Math.max(1, Math.min(Math.trunc(value || 1), item?.stock_quantity ?? 1))
                  : Math.max(0, Math.min(value || 0, 100)),
            }
          : line,
      ),
    );
  };

  const createBill = useMutation({
    mutationFn: async (saveAsDraft: boolean) => {
      if (patientMode === "patient" && !patientId) throw new Error("Select a patient");
      if (patientMode === "walk-in" && walkInName.trim().length < 2)
        throw new Error("Enter the walk-in customer name");
      if (cart.length === 0) throw new Error("Add at least one medicine");
      if (!saveAsDraft && paymentMethod !== "cash" && payment > totals.total)
        throw new Error("Card or UPI payment cannot exceed the bill total");

      const response = await fetch("/api/pharmacy/bill", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientMode === "patient" ? patientId : null,
          walk_in_name: patientMode === "walk-in" ? walkInName.trim() : null,
          walk_in_phone: patientMode === "walk-in" ? walkInPhone.trim() || null : null,
          items: cart.map((line) => ({
            pharmacyItemId: line.pharmacyItemId,
            quantity: line.quantity,
            discountPercent: line.discountPercent,
          })),
          payment_amount: saveAsDraft ? 0 : payment,
          payment_method: paymentMethod,
          payment_reference: paymentReference.trim() || null,
          notes: notes.trim() || null,
          save_as_draft: saveAsDraft,
          draft_id: draftId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "Failed to create pharmacy bill");
      return body.invoice ?? null;
    },
    onSuccess: (invoice, saveAsDraft) => {
      toast.success(saveAsDraft ? "Pharmacy bill draft saved" : "Pharmacy bill generated");
      queryClient.invalidateQueries({ queryKey: ["pharmacy-items"] });
      queryClient.invalidateQueries({ queryKey: ["pharmacy-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dispensations"] });
      setCart([]);
      setPatientId("");
      setWalkInName("");
      setWalkInPhone("");
      setAmountReceived("");
      setPaymentReference("");
      setNotes("");
      setDraftId(null);
      if (!saveAsDraft && invoice) {
        setPreviewInvoice({
          ...invoice,
          patients: patients.find((patient) => patient.id === invoice.patient_id) ?? null,
          payments: [],
        });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const downloadPharmacyInvoice = (invoice: PharmacyInvoice) => {
    const lines = jsonArray<InvoiceLine>(invoice.items);
    const paymentMethodValue = invoice.payments[0]?.method;
    return downloadInvoicePdf({
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.finalized_at ?? invoice.created_at,
      status: invoice.status,
      title: "PHARMACY TAX INVOICE",
      patientName: invoice.patients?.full_name ?? invoice.walk_in_name ?? "Walk-in customer",
      mrn: invoice.patients?.mrn ?? "Walk-in",
      patientPhone: invoice.patients?.phone ?? invoice.walk_in_phone ?? undefined,
      patientAddress: invoice.patients?.address ?? undefined,
      items: lines,
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount_amount),
      tax: Number(invoice.tax_amount),
      cgst: Number(invoice.cgst_amount),
      sgst: Number(invoice.sgst_amount),
      total: Number(invoice.total_amount),
      paid: Number(invoice.paid_amount),
      paymentMethod: paymentMethodValue,
      brand,
    });
  };

  const loadDraft = (invoice: PharmacyInvoice) => {
    const draftLines = jsonArray<InvoiceLine>(invoice.items);
    setDraftId(invoice.id);
    setCart(
      draftLines.flatMap((line) =>
        line.pharmacyItemId
          ? [
              {
                pharmacyItemId: line.pharmacyItemId,
                quantity: Number(line.quantity),
                discountPercent: Number(line.discountPercent ?? 0),
              },
            ]
          : [],
      ),
    );
    if (invoice.patient_id) {
      setPatientMode("patient");
      setPatientId(invoice.patient_id);
    } else {
      setPatientMode("walk-in");
      setWalkInName(invoice.walk_in_name ?? "");
      setWalkInPhone(invoice.walk_in_phone ?? "");
    }
    setNotes(invoice.notes ?? "");
    setAmountReceived("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("Draft loaded");
  };

  if (!canManage) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <ReceiptIndianRupee className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Pharmacy billing restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pharmacy billing is available to pharmacists and administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" title="Back to pharmacy">
            <Link to="/pharmacy">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">New pharmacy bill</h1>
            <p className="mt-1 text-muted-foreground">
              {draftId
                ? "Editing a saved draft. Stock will be checked again when generated."
                : "Select a customer, add valid medicine batches and collect payment."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={createBill.isPending || cart.length === 0}
            onClick={() => createBill.mutate(true)}
          >
            Save draft
          </Button>
          <Button
            disabled={createBill.isPending || cart.length === 0}
            onClick={() => createBill.mutate(false)}
          >
            <ReceiptIndianRupee className="mr-2 h-4 w-4" />
            {createBill.isPending ? "Generating..." : "Generate bill"}
          </Button>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="border-y py-5">
            <div className="mb-4 flex w-fit rounded-md border p-1">
              {(["patient", "walk-in"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={patientMode === mode ? "default" : "ghost"}
                  onClick={() => setPatientMode(mode)}
                >
                  {mode === "patient" ? "Registered patient" : "Walk-in customer"}
                </Button>
              ))}
            </div>
            {patientMode === "patient" ? (
              <div className="max-w-xl">
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
            ) : (
              <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
                <div>
                  <Label>Customer name *</Label>
                  <Input
                    value={walkInName}
                    onChange={(event) => setWalkInName(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={walkInPhone}
                    onChange={(event) => setWalkInPhone(event.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <Label htmlFor="medicine-search">Add medicine</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="medicine-search"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search medicine name, SKU or batch"
              />
            </div>
            {search.trim() && (
              <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    No valid in-stock batch found.
                  </div>
                ) : (
                  searchResults.map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      className="flex w-full items-center justify-between gap-4 border-b px-4 py-3 text-left hover:bg-muted"
                      onClick={() => addToCart(item)}
                    >
                      <div>
                        <div className="font-medium">
                          {item.medicine_name}
                          {index === 0 && <Badge className="ml-2">FEFO</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          SKU {item.sku || "-"} | Batch {item.batch_number || "-"} | Expiry{" "}
                          {item.expires_on || "-"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-sm">
                        <div>{money(item.unit_price)}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.stock_quantity} available
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-[18px] border bg-card shadow-sm">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Medicine / batch</th>
                  <th className="px-3 py-3">Quantity</th>
                  <th className="px-3 py-3">Rate</th>
                  <th className="px-3 py-3">Discount %</th>
                  <th className="px-3 py-3">GST</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoiceLines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <ShoppingCart className="mx-auto mb-2 h-7 w-7" />
                      Search and add medicines to begin.
                    </td>
                  </tr>
                ) : (
                  invoiceLines.map((line) => {
                    const cartLine = cart.find(
                      (candidate) => candidate.pharmacyItemId === line.pharmacyItemId,
                    )!;
                    return (
                      <tr key={line.pharmacyItemId} className="border-t hover:bg-primary-soft/60">
                        <td className="px-3 py-3">
                          <div className="font-medium">{line.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {line.serviceCode || "-"} | Batch {line.batchNumber || "-"} | Exp{" "}
                            {line.expiryDate || "-"}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex w-fit items-center rounded-md border">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                updateCart(line.pharmacyItemId!, "quantity", cartLine.quantity - 1)
                              }
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center">{cartLine.quantity}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                updateCart(line.pharmacyItemId!, "quantity", cartLine.quantity + 1)
                              }
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-3">{money(line.unitPrice)}</td>
                        <td className="px-3 py-3">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            className="w-24"
                            value={cartLine.discountPercent}
                            onChange={(event) =>
                              updateCart(
                                line.pharmacyItemId!,
                                "discountPercent",
                                Number(event.target.value),
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-3">{line.taxRate}%</td>
                        <td className="px-3 py-3 text-right font-medium">{money(line.amount)}</td>
                        <td className="px-2 py-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Remove medicine"
                            onClick={() =>
                              setCart((current) =>
                                current.filter(
                                  (candidate) => candidate.pharmacyItemId !== line.pharmacyItemId,
                                ),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-5 border-l pl-0 xl:pl-6">
          <div>
            <h2 className="font-semibold">Payment</h2>
            <div className="mt-3">
              <Label>Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <Label>Amount received</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={totals.total <= 0}
                  onClick={() => setAmountReceived(totals.total.toFixed(2))}
                >
                  Pay full
                </Button>
              </div>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amountReceived}
                onChange={(event) => setAmountReceived(event.target.value)}
              />
            </div>
            <div className="mt-3">
              <Label>Payment reference</Label>
              <Input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder={paymentMethod === "cash" ? "Optional" : "Transaction reference"}
              />
            </div>
          </div>

          <div className="space-y-2 border-y py-4 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{money(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span>-{money(totals.lineDiscount)}</span>
            </div>
            <div className="flex justify-between">
              <span>CGST</span>
              <span>{money(totals.tax / 2)}</span>
            </div>
            <div className="flex justify-between">
              <span>SGST</span>
              <span>{money(totals.tax - totals.tax / 2)}</span>
            </div>
            <div className="flex justify-between pt-2 text-lg font-bold">
              <span>Total</span>
              <span>{money(totals.total)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Balance</span>
              <span>{money(balance)}</span>
            </div>
            {changeDue > 0 && (
              <div className="flex justify-between font-medium text-emerald-600">
                <span>Change due</span>
                <span>{money(changeDue)}</span>
              </div>
            )}
          </div>

          <div>
            <Label>Bill notes</Label>
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </aside>
      </section>

      <section className="border-t pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Pharmacy bill history</h2>
            <p className="text-sm text-muted-foreground">Draft and finalized pharmacy invoices.</p>
          </div>
          <Button
            variant="outline"
            disabled={invoices.length === 0}
            onClick={() =>
              downloadExcel(`pharmacy-bills-${new Date().toISOString().slice(0, 10)}.xlsx`, [
                {
                  name: "Pharmacy bills",
                  rows: invoices.map((invoice) => ({
                    Invoice: invoice.invoice_number,
                    Customer:
                      invoice.patients?.full_name ?? invoice.walk_in_name ?? "Walk-in customer",
                    MRN: invoice.patients?.mrn ?? "",
                    Subtotal: Number(invoice.subtotal),
                    Discount: Number(invoice.discount_amount),
                    GST: Number(invoice.tax_amount),
                    Total: Number(invoice.total_amount),
                    Paid: Number(invoice.paid_amount),
                    Balance: Number(invoice.total_amount) - Number(invoice.paid_amount),
                    Status: invoice.status,
                    Date: invoice.created_at,
                  })),
                },
              ])
            }
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
        </div>
        {invoicesLoading ? (
          <div className="py-10 text-center text-muted-foreground">Loading bills...</div>
        ) : invoices.length === 0 ? (
          <div className="rounded-[18px] border border-dashed p-10 text-center text-muted-foreground">
            No pharmacy bills yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[18px] border bg-card shadow-sm">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t hover:bg-primary-soft/60">
                    <td className="px-4 py-3">
                      <div className="font-medium">{invoice.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(invoice.created_at).toLocaleString("en-IN")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {invoice.patients?.full_name ?? invoice.walk_in_name ?? "Walk-in customer"}
                    </td>
                    <td className="px-4 py-3">
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
                        {invoice.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{money(invoice.total_amount)}</td>
                    <td className="px-4 py-3">{money(invoice.paid_amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {invoice.status === "draft" && (
                          <Button variant="outline" size="sm" onClick={() => loadDraft(invoice)}>
                            Load draft
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="icon"
                          title="Preview and print"
                          onClick={() => setPreviewInvoice(invoice)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          title="Download PDF"
                          onClick={() => downloadPharmacyInvoice(invoice)}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={!!previewInvoice} onOpenChange={(open) => !open && setPreviewInvoice(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Pharmacy invoice</DialogTitle>
            <DialogDescription>Print or download the finalized bill.</DialogDescription>
          </DialogHeader>
          {previewInvoice && (
            <>
              <div className="flex justify-end gap-2 print:hidden">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
                <Button onClick={() => downloadPharmacyInvoice(previewInvoice)}>
                  <FileDown className="mr-2 h-4 w-4" /> Download PDF
                </Button>
              </div>
              <div id="pharmacy-invoice-print">
                <InvoicePreview
                  brand={brand}
                  title="PHARMACY TAX INVOICE"
                  invoiceNumber={previewInvoice.invoice_number}
                  invoiceDate={previewInvoice.finalized_at ?? previewInvoice.created_at}
                  status={previewInvoice.status}
                  patientName={
                    previewInvoice.patients?.full_name ??
                    previewInvoice.walk_in_name ??
                    "Walk-in customer"
                  }
                  mrn={previewInvoice.patients?.mrn ?? "Walk-in"}
                  patientPhone={
                    previewInvoice.patients?.phone ?? previewInvoice.walk_in_phone ?? undefined
                  }
                  patientAddress={previewInvoice.patients?.address ?? undefined}
                  items={jsonArray<InvoiceLine>(previewInvoice.items)}
                  subtotal={Number(previewInvoice.subtotal)}
                  discount={Number(previewInvoice.discount_amount)}
                  tax={Number(previewInvoice.tax_amount)}
                  cgst={Number(previewInvoice.cgst_amount)}
                  sgst={Number(previewInvoice.sgst_amount)}
                  total={Number(previewInvoice.total_amount)}
                  paid={Number(previewInvoice.paid_amount)}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
