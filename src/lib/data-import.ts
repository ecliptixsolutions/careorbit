import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { downloadExcel, downloadJson } from "@/lib/clinical-operations";

export type ImportValue = string | number | boolean | null;
export type ImportRow = Record<string, ImportValue>;
export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  example?: ImportValue;
};
export type ImportResult = {
  total: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
};

const maxFileSize = 5 * 1024 * 1024;

export function sanitizeImportValue(value: unknown): ImportValue {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value).trim();
  if (/^[=+@]/.test(text) || /^-[A-Za-z]/.test(text)) {
    throw new Error(`Spreadsheet formulas are not allowed: ${text.slice(0, 30)}`);
  }
  return text;
}

export async function parseImportFile(file: File) {
  if (file.size > maxFileSize) throw new Error("Import files must be 5 MB or smaller");
  const extension = file.name.split(".").pop()?.toLowerCase();
  let matrix: unknown[][];

  if (extension === "xlsx") {
    matrix = (await readSheet(file)) as unknown[][];
  } else if (extension === "csv") {
    const text = await file.text();
    const parsed = Papa.parse<unknown[]>(text, {
      skipEmptyLines: "greedy",
    });
    if (parsed.errors.length) throw new Error(parsed.errors[0].message);
    matrix = parsed.data;
  } else {
    throw new Error("Choose a CSV or XLSX file");
  }

  if (matrix.length < 2) throw new Error("The file must contain a header and at least one row");
  if (matrix.length > 2001) throw new Error("Maximum 2000 data rows per import");

  const headers = matrix[0].map((value, index) => String(value ?? `Column ${index + 1}`).trim());
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    throw new Error("Header names must be unique");
  }

  const rows = matrix
    .slice(1)
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, sanitizeImportValue(values[index])]),
      ),
    );
  return { headers, rows };
}

export function mapImportRows(
  rows: ImportRow[],
  mapping: Record<string, string>,
  fields: ImportField[],
) {
  return rows.map((row, index) => {
    const mapped: ImportRow = {};
    for (const field of fields) {
      const source = mapping[field.key];
      const value = source ? row[source] : null;
      if (field.required && (value == null || String(value).trim() === "")) {
        throw new Error(`Row ${index + 2}: ${field.label} is required`);
      }
      mapped[field.key] = value;
    }
    return mapped;
  });
}

export function suggestedMapping(headers: string[], fields: ImportField[]) {
  const normalized = new Map(
    headers.map((header) => [header.toLowerCase().replace(/[^a-z0-9]+/g, "_"), header]),
  );
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      normalized.get(field.key) ??
        normalized.get(field.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")) ??
        "",
    ]),
  );
}

export async function downloadImportTemplate(name: string, fields: ImportField[]) {
  await downloadExcel(`${name}-import-template.xlsx`, [
    {
      name: "Template",
      rows: [Object.fromEntries(fields.map((field) => [field.label, field.example ?? ""]))],
    },
  ]);
}

export function downloadImportErrors(name: string, result: ImportResult) {
  downloadJson(`${name}-import-errors.json`, {
    generatedAt: new Date().toISOString(),
    ...result,
  });
}
