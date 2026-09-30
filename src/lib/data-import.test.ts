import { describe, expect, it } from "vitest";
import {
  mapImportRows,
  parseImportFile,
  sanitizeImportValue,
  suggestedMapping,
} from "./data-import";

const fields = [
  { key: "full_name", label: "Full name", required: true },
  { key: "phone", label: "Phone" },
];

describe("import mapping", () => {
  it("suggests normalized matching columns", () => {
    expect(suggestedMapping(["Full Name", "Phone"], fields)).toEqual({
      full_name: "Full Name",
      phone: "Phone",
    });
  });

  it("maps rows using explicit columns", () => {
    expect(
      mapImportRows(
        [{ Name: "Test Patient", Mobile: "9000000000" }],
        { full_name: "Name", phone: "Mobile" },
        fields,
      ),
    ).toEqual([{ full_name: "Test Patient", phone: "9000000000" }]);
  });

  it("reports the spreadsheet row for missing required values", () => {
    expect(() => mapImportRows([{ Name: "" }], { full_name: "Name", phone: "" }, fields)).toThrow(
      "Row 2",
    );
  });

  it("rejects spreadsheet formulas", () => {
    expect(() => sanitizeImportValue('=HYPERLINK("https://example.com")')).toThrow(
      "formulas are not allowed",
    );
    expect(sanitizeImportValue(-5)).toBe(-5);
  });

  it("parses valid CSV rows", async () => {
    const file = new File(["Full Name,Phone\nTest Patient,9000000000"], "patients.csv", {
      type: "text/csv",
    });
    const parsed = await parseImportFile(file);
    expect(parsed.headers).toEqual(["Full Name", "Phone"]);
    expect(parsed.rows).toHaveLength(1);
  });

  it("rejects unsupported and oversized files", async () => {
    await expect(parseImportFile(new File(["test"], "patients.txt"))).rejects.toThrow(
      "CSV or XLSX",
    );
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "patients.csv");
    await expect(parseImportFile(oversized)).rejects.toThrow("5 MB");
  });
});
