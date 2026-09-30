import { money, type InvoiceBrand, type InvoiceLine } from "@/lib/clinical-operations";

export function InvoicePreview({
  brand,
  invoiceNumber,
  invoiceDate,
  status,
  patientName,
  mrn,
  patientPhone,
  patientAddress,
  items,
  subtotal,
  discount,
  tax,
  total,
  paid,
  title = "TAX INVOICE",
  cgst,
  sgst,
}: {
  brand: InvoiceBrand;
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
  title?: string;
  cgst?: number;
  sgst?: number;
}) {
  return (
    <div className="mx-auto min-h-[760px] max-w-[760px] bg-white p-8 text-sm text-black shadow-sm">
      <header
        className="flex items-start justify-between gap-6 border-b-2 pb-5"
        style={{ borderColor: brand.accentColor ?? "#2563eb" }}
      >
        <div className="flex h-20 w-40 items-center">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="text-xl font-bold">{brand.hospitalName}</div>
          )}
        </div>
        <div className="max-w-sm text-right">
          <div className="text-xl font-bold">{brand.hospitalName}</div>
          {brand.legalName && <div>{brand.legalName}</div>}
          <div>{brand.address}</div>
          <div>{[brand.phone, brand.email].filter(Boolean).join(" | ")}</div>
          <div>{brand.website}</div>
          {brand.gstin && <div>GSTIN: {brand.gstin}</div>}
          {brand.drugLicenseNumbers?.map((license) => (
            <div key={license}>Drug Licence: {license}</div>
          ))}
        </div>
      </header>

      <div className="mt-5 flex items-start justify-between gap-6">
        <div>
          <div className="text-lg font-bold">{title}</div>
          <div className="mt-4 font-semibold">Bill to</div>
          <div>{patientName}</div>
          <div>{mrn}</div>
          <div>{patientPhone}</div>
          <div>{patientAddress}</div>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-right">
          <dt className="font-semibold">Invoice</dt>
          <dd>{invoiceNumber}</dd>
          <dt className="font-semibold">Date</dt>
          <dd>{new Date(invoiceDate).toLocaleDateString("en-IN")}</dd>
          <dt className="font-semibold">Status</dt>
          <dd className="uppercase">{status.replaceAll("_", " ")}</dd>
        </dl>
      </div>

      <table className="mt-7 w-full border-collapse">
        <thead>
          <tr className="border-y bg-gray-100 text-left">
            <th className="px-2 py-2">Description</th>
            <th className="px-2 py-2 text-right">Qty</th>
            <th className="px-2 py-2 text-right">Rate</th>
            <th className="px-2 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.description}-${index}`} className="border-b">
              <td className="px-2 py-2">
                {item.serviceCode && <span className="mr-2 text-gray-500">{item.serviceCode}</span>}
                {item.description}
                {(item.batchNumber || item.expiryDate || item.hsnCode) && (
                  <div className="mt-1 text-xs text-gray-500">
                    {[
                      item.batchNumber ? `Batch: ${item.batchNumber}` : "",
                      item.expiryDate
                        ? `Expiry: ${new Date(item.expiryDate).toLocaleDateString("en-IN")}`
                        : "",
                      item.hsnCode ? `HSN: ${item.hsnCode}` : "",
                      item.discountPercent ? `Discount: ${item.discountPercent}%` : "",
                      item.taxRate ? `GST: ${item.taxRate}%` : "",
                    ]
                      .filter(Boolean)
                      .join(" | ")}
                  </div>
                )}
              </td>
              <td className="px-2 py-2 text-right">{item.quantity}</td>
              <td className="px-2 py-2 text-right">{money(item.unitPrice)}</td>
              <td className="px-2 py-2 text-right">
                {money(
                  item.amount ??
                    (item.taxableAmount ??
                      item.quantity * item.unitPrice - Number(item.discountAmount ?? 0)) +
                      Number(item.taxAmount ?? 0),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-5 w-72 space-y-1">
        {[
          ["Subtotal", subtotal],
          ["Discount", -discount],
          ...(cgst !== undefined && sgst !== undefined
            ? [
                ["CGST", cgst],
                ["SGST", sgst],
              ]
            : [["Tax", tax]]),
          ["Total", total],
          ["Paid", paid],
          ["Balance", Math.max(total - paid, 0)],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex justify-between border-b py-1">
            <span>{label}</span>
            <strong>{money(Number(value))}</strong>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          {brand.paymentDetails && (
            <>
              <div className="font-semibold">Payment details</div>
              <div className="mt-1 whitespace-pre-wrap text-xs">{brand.paymentDetails}</div>
            </>
          )}
          {brand.terms && (
            <>
              <div className="mt-5 font-semibold">Terms</div>
              <div className="mt-1 whitespace-pre-wrap text-xs">{brand.terms}</div>
            </>
          )}
        </div>
        <div className="self-end text-right">
          <div className="font-semibold">{brand.authorizedSignatory}</div>
          <div className="text-xs">Authorized signatory</div>
        </div>
      </div>
      <footer className="mt-10 border-t pt-3 text-center text-xs text-gray-600">
        {brand.footer || "Computer-generated invoice"}
      </footer>
    </div>
  );
}
