import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "./clinical-operations";

describe("calculateInvoiceTotals", () => {
  it("calculates line totals, tax and discount", () => {
    expect(
      calculateInvoiceTotals(
        [
          { description: "Consultation", quantity: 2, unitPrice: 500, taxRate: 5 },
          { description: "Procedure", quantity: 1, unitPrice: 1000, taxRate: 18 },
        ],
        100,
      ),
    ).toEqual({ subtotal: 2000, lineDiscount: 0, tax: 230, total: 2130 });
  });

  it("applies line discounts before tax", () => {
    expect(
      calculateInvoiceTotals([
        {
          description: "Medicine",
          quantity: 2,
          unitPrice: 100,
          discountPercent: 10,
          taxRate: 12,
        },
      ]),
    ).toEqual({ subtotal: 200, lineDiscount: 20, tax: 21.6, total: 201.6 });
  });

  it("never creates a negative invoice total", () => {
    expect(
      calculateInvoiceTotals([{ description: "Test", quantity: 1, unitPrice: 100 }], 500).total,
    ).toBe(0);
  });
});
