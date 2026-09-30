import type { Json } from "@/integrations/supabase/types";

export type MedicineLine = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
};

export type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  serviceCode?: string;
  taxRate?: number;
  pharmacyItemId?: string;
  medicineName?: string;
  sku?: string;
  hsnCode?: string;
  batchNumber?: string;
  expiryDate?: string;
  mrp?: number;
  discountPercent?: number;
  discountAmount?: number;
  taxableAmount?: number;
  taxAmount?: number;
  amount?: number;
};

export type InvoiceBrand = {
  hospitalName: string;
  legalName?: string;
  logoUrl?: string | null;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstin?: string;
  drugLicenseNumbers?: string[];
  accentColor?: string;
  terms?: string;
  paymentDetails?: string;
  footer?: string;
  authorizedSignatory?: string;
};

function currencyAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateInvoiceTotals(lines: InvoiceLine[], discount = 0) {
  const subtotal = currencyAmount(
    lines.reduce((total, line) => total + Number(line.quantity) * Number(line.unitPrice), 0),
  );
  const lineDiscount = currencyAmount(
    lines.reduce(
      (total, line) =>
        total +
        (line.discountAmount ??
          Number(line.quantity) *
            Number(line.unitPrice) *
            (Number(line.discountPercent ?? 0) / 100)),
      0,
    ),
  );
  const tax = currencyAmount(
    lines.reduce(
      (total, line) =>
        total +
        (line.taxAmount ??
          (Number(line.quantity) * Number(line.unitPrice) -
            (line.discountAmount ??
              Number(line.quantity) *
                Number(line.unitPrice) *
                (Number(line.discountPercent ?? 0) / 100))) *
            (Number(line.taxRate ?? 0) / 100)),
      0,
    ),
  );
  return {
    subtotal,
    lineDiscount,
    tax,
    total: currencyAmount(Math.max(subtotal - lineDiscount - Number(discount || 0) + tax, 0)),
  };
}

export function jsonArray<T>(value: Json): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function pdfMoney(value: number | string | null | undefined) {
  return `INR ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))}`;
}

async function fetchPdfImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load invoice logo");
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const format = blob.type.includes("png") ? "PNG" : blob.type.includes("webp") ? "WEBP" : "JPEG";
  return { dataUrl, format };
}

export function downloadBlob(filename: string, blob: Blob) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  downloadBlob(filename, blob);
}

export async function downloadExcel(
  filename: string,
  sheets: Array<{ name: string; rows: Record<string, unknown>[] }>,
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const workbookSheets = sheets.map(({ name, rows }) => {
    const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const data = [
      keys.map((key) => ({
        value: key,
        fontWeight: "bold" as const,
        textColor: "#FFFFFF",
        backgroundColor: "#0F766E",
      })),
      ...rows.map((row) =>
        keys.map((key) => {
          const value = row[key];
          if (value == null) return "";
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          ) {
            return value;
          }
          if (value instanceof Date) return value;
          return JSON.stringify(value);
        }),
      ),
    ];
    return {
      data,
      sheet: name.slice(0, 31),
      columns: keys.map((key) => ({
        width: Math.min(
          40,
          Math.max(key.length + 2, ...rows.map((row) => String(row[key] ?? "").length + 2)),
        ),
      })),
      stickyRowsCount: keys.length ? 1 : 0,
    };
  });

  const blob = await writeXlsxFile(workbookSheets).toBlob();
  downloadBlob(filename, blob);
}

export async function downloadPrescriptionPdf(input: {
  prescriptionNumber: string;
  patientName: string;
  mrn: string;
  doctorName: string;
  diagnosis: string;
  advice: string;
  medicines: MedicineLine[];
  issuedAt: string;
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  const left = 18;
  let y = 20;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text("CareOrbit Prescription", left, y);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  y += 9;
  pdf.text(`Prescription: ${input.prescriptionNumber}`, left, y);
  pdf.text(`Issued: ${new Date(input.issuedAt).toLocaleString()}`, 120, y);
  y += 10;
  pdf.line(left, y, 192, y);
  y += 8;
  pdf.text(`Patient: ${input.patientName}`, left, y);
  pdf.text(`MRN: ${input.mrn}`, 120, y);
  y += 7;
  pdf.text(`Doctor: ${input.doctorName}`, left, y);
  y += 10;
  pdf.setFont("helvetica", "bold");
  pdf.text("Diagnosis", left, y);
  pdf.setFont("helvetica", "normal");
  y += 6;
  pdf.text(pdf.splitTextToSize(input.diagnosis || "Not specified", 174), left, y);
  y += 12;
  pdf.setFont("helvetica", "bold");
  pdf.text("Medicines", left, y);
  y += 7;

  input.medicines.forEach((medicine, index) => {
    if (y > 265) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFont("helvetica", "bold");
    pdf.text(`${index + 1}. ${medicine.name}`, left, y);
    pdf.setFont("helvetica", "normal");
    y += 6;
    const details = [medicine.dosage, medicine.frequency, medicine.duration, medicine.instructions]
      .filter(Boolean)
      .join(" | ");
    pdf.text(pdf.splitTextToSize(details || "As directed", 168), left + 5, y);
    y += 10;
  });

  pdf.setFont("helvetica", "bold");
  pdf.text("Advice", left, y);
  pdf.setFont("helvetica", "normal");
  y += 6;
  pdf.text(
    pdf.splitTextToSize(input.advice || "Follow the prescribed treatment plan.", 174),
    left,
    y,
  );
  downloadBlob(`${input.prescriptionNumber}.pdf`, pdf.output("blob"));
}

export async function downloadInvoicePdf(input: {
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  patientName: string;
  mrn: string;
  patientPhone?: string;
  patientAddress?: string;
  items: InvoiceLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  brand: InvoiceBrand;
  title?: string;
  cgst?: number;
  sgst?: number;
  paymentMethod?: string;
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  const left = 16;
  const right = 194;
  let y = 16;

  if (input.brand.logoUrl) {
    try {
      const image = await fetchPdfImage(input.brand.logoUrl);
      pdf.addImage(image.dataUrl, image.format, left, y, 36, 20, undefined, "FAST");
    } catch {
      // A missing logo must never block a legally useful invoice.
    }
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text(input.brand.hospitalName || "CareOrbit Hospital", right, y + 4, { align: "right" });
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  const businessLines = [
    input.brand.legalName,
    input.brand.address,
    input.brand.phone,
    input.brand.email,
    input.brand.website,
    input.brand.gstin ? `GSTIN: ${input.brand.gstin}` : "",
    ...(input.brand.drugLicenseNumbers ?? []).map((value) => `Drug Licence: ${value}`),
  ].filter(Boolean) as string[];
  businessLines.slice(0, 8).forEach((line, index) => {
    pdf.text(line, right, y + 10 + index * 4, { align: "right" });
  });
  y = Math.max(45, 30 + Math.min(businessLines.length, 8) * 4);
  pdf.setDrawColor(30);
  pdf.line(left, y, right, y);
  y += 8;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(input.title ?? "TAX INVOICE", left, y);
  pdf.setFontSize(9);
  pdf.text(input.invoiceNumber, right, y, { align: "right" });
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.text(`Date: ${new Date(input.invoiceDate).toLocaleDateString("en-IN")}`, right, y, {
    align: "right",
  });
  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.text("Bill to", left, y);
  pdf.setFont("helvetica", "normal");
  y += 5;
  pdf.text(`${input.patientName} (${input.mrn})`, left, y);
  y += 4;
  if (input.patientPhone) {
    pdf.text(`Phone: ${input.patientPhone}`, left, y);
    y += 4;
  }
  if (input.patientAddress) {
    pdf.text(pdf.splitTextToSize(input.patientAddress, 90), left, y);
    y += 7;
  }
  pdf.setFont("helvetica", "bold");
  pdf.text(`Status: ${input.status.replaceAll("_", " ").toUpperCase()}`, right, y - 4, {
    align: "right",
  });
  y += 5;

  const drawTableHeader = () => {
    pdf.setFillColor(238, 242, 245);
    pdf.rect(left, y, right - left, 7, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("#", left + 2, y + 5);
    pdf.text("Description", left + 10, y + 5);
    pdf.text("Qty", 132, y + 5, { align: "right" });
    pdf.text("Rate", 158, y + 5, { align: "right" });
    pdf.text("Amount", right - 2, y + 5, { align: "right" });
    pdf.setFont("helvetica", "normal");
    y += 10;
  };
  drawTableHeader();

  input.items.forEach((item, index) => {
    if (y > 255) {
      pdf.addPage();
      y = 18;
      drawTableHeader();
    }
    const itemMeta = [
      item.batchNumber ? `Batch: ${item.batchNumber}` : "",
      item.expiryDate ? `Exp: ${new Date(item.expiryDate).toLocaleDateString("en-IN")}` : "",
      item.hsnCode ? `HSN: ${item.hsnCode}` : "",
      item.discountPercent ? `Discount: ${item.discountPercent}%` : "",
      item.taxRate ? `GST: ${item.taxRate}%` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    const description = [[item.serviceCode, item.description].filter(Boolean).join(" - "), itemMeta]
      .filter(Boolean)
      .join("\n");
    const wrapped = pdf.splitTextToSize(description, 105);
    pdf.text(String(index + 1), left + 2, y);
    pdf.text(wrapped, left + 10, y);
    pdf.text(String(item.quantity), 132, y, { align: "right" });
    pdf.text(pdfMoney(item.unitPrice), 158, y, { align: "right" });
    pdf.text(
      pdfMoney(
        item.amount ??
          (item.taxableAmount ??
            item.quantity * item.unitPrice - Number(item.discountAmount ?? 0)) +
            Number(item.taxAmount ?? 0),
      ),
      right - 2,
      y,
      { align: "right" },
    );
    y += Math.max(7, wrapped.length * 4 + 2);
  });

  y += 3;
  pdf.line(116, y, right, y);
  y += 7;
  const totalRows: Array<[string, number]> = [
    ["Subtotal", input.subtotal],
    ["Discount", -input.discount],
    ...(input.cgst !== undefined && input.sgst !== undefined
      ? ([
          ["CGST", input.cgst],
          ["SGST", input.sgst],
        ] as Array<[string, number]>)
      : ([["Tax", input.tax]] as Array<[string, number]>)),
    ["Total", input.total],
    ["Paid", input.paid],
    ["Balance", Math.max(input.total - input.paid, 0)],
  ];
  totalRows.forEach(([label, value]) => {
    pdf.text(String(label), 120, y);
    pdf.text(pdfMoney(Number(value)), right - 2, y, { align: "right" });
    y += 7;
  });

  if (input.paymentMethod) {
    pdf.text(`Payment method: ${input.paymentMethod.toUpperCase()}`, left, y - 7);
  }

  if (input.brand.paymentDetails) {
    y += 3;
    pdf.setFont("helvetica", "bold");
    pdf.text("Payment details", left, y);
    pdf.setFont("helvetica", "normal");
    y += 5;
    pdf.text(pdf.splitTextToSize(input.brand.paymentDetails, 95), left, y);
  }

  if (input.brand.terms) {
    y = Math.max(y + 14, 235);
    pdf.setFont("helvetica", "bold");
    pdf.text("Terms", left, y);
    pdf.setFont("helvetica", "normal");
    y += 5;
    pdf.text(pdf.splitTextToSize(input.brand.terms, 120), left, y);
  }

  if (input.brand.authorizedSignatory) {
    pdf.setFont("helvetica", "bold");
    pdf.text(input.brand.authorizedSignatory, right, Math.min(y + 18, 270), { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.text("Authorized signatory", right, Math.min(y + 23, 275), { align: "right" });
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(7);
    pdf.setTextColor(80);
    pdf.text(input.brand.footer || "Computer-generated invoice", left, 288);
    pdf.text(`Page ${page} of ${pages}`, right, 288, { align: "right" });
  }
  downloadBlob(`${input.invoiceNumber}.pdf`, pdf.output("blob"));
}

export async function downloadReceiptPdf(input: {
  receiptNumber: string;
  invoiceNumber: string;
  paidAt: string;
  patientName: string;
  mrn: string;
  amount: number;
  method: string;
  reference?: string | null;
  remainingBalance: number;
  brand: InvoiceBrand;
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  const left = 18;
  const right = 192;
  let y = 20;
  if (input.brand.logoUrl) {
    try {
      const image = await fetchPdfImage(input.brand.logoUrl);
      pdf.addImage(image.dataUrl, image.format, left, y - 6, 34, 17, undefined, "FAST");
      y += 18;
    } catch {
      // Continue with text branding when the logo cannot be loaded.
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(input.brand.hospitalName || "CareOrbit Hospital", left, y);
  pdf.setFontSize(13);
  pdf.text("PAYMENT RECEIPT", right, y, { align: "right" });
  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(input.brand.address || "", left, y);
  pdf.text(input.receiptNumber, right, y, { align: "right" });
  y += 5;
  pdf.text([input.brand.phone, input.brand.email].filter(Boolean).join(" | "), left, y);
  pdf.text(new Date(input.paidAt).toLocaleString("en-IN"), right, y, { align: "right" });
  y += 10;
  pdf.line(left, y, right, y);
  y += 10;
  [
    ["Received from", `${input.patientName} (${input.mrn})`],
    ["Against invoice", input.invoiceNumber],
    ["Amount received", pdfMoney(input.amount)],
    ["Payment method", input.method.replaceAll("_", " ")],
    ["Reference", input.reference || "-"],
    ["Remaining balance", pdfMoney(input.remainingBalance)],
  ].forEach(([label, value]) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(String(label), left, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(String(value), 70, y);
    y += 9;
  });
  y += 10;
  pdf.setFont("helvetica", "bold");
  pdf.text(input.brand.authorizedSignatory || "Authorized cashier", right, y, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.text("Authorized signatory", right, y + 5, { align: "right" });
  pdf.setFontSize(7);
  pdf.text(input.brand.footer || "Thank you", left, 288);
  downloadBlob(`${input.receiptNumber}.pdf`, pdf.output("blob"));
}
