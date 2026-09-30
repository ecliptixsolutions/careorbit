import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  downloadImportErrors,
  downloadImportTemplate,
  mapImportRows,
  parseImportFile,
  suggestedMapping,
  type ImportField,
  type ImportResult,
  type ImportRow,
} from "@/lib/data-import";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DataImportPanel({
  title,
  description,
  templateName,
  fields,
  submit,
  allowConfirmedUpdates = false,
}: {
  title: string;
  description: string;
  templateName: string;
  fields: ImportField[];
  submit: (input: {
    fileName: string;
    rows: ImportRow[];
    updateExisting: boolean;
  }) => Promise<ImportResult>;
  allowConfirmedUpdates?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<ImportRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const preview = useMemo(() => {
    try {
      return mapImportRows(rawRows.slice(0, 5), mapping, fields);
    } catch {
      return [];
    }
  }, [fields, mapping, rawRows]);

  const chooseFile = async (selected: File | null) => {
    setFile(selected);
    setResult(null);
    setConfirmed(false);
    if (!selected) {
      setHeaders([]);
      setRawRows([]);
      return;
    }
    try {
      const parsed = await parseImportFile(selected);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(suggestedMapping(parsed.headers, fields));
    } catch (error) {
      setFile(null);
      setHeaders([]);
      setRawRows([]);
      toast.error(error instanceof Error ? error.message : "Could not read file");
    }
  };

  const runImport = async () => {
    if (!file || !confirmed) return;
    setLoading(true);
    try {
      const rows = mapImportRows(rawRows, mapping, fields);
      const nextResult = await submit({ fileName: file.name, rows, updateExisting });
      setResult(nextResult);
      toast.success(`${nextResult.imported} rows imported`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="border-b py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" onClick={() => downloadImportTemplate(templateName, fields)}>
          <Download className="mr-2 h-4 w-4" /> Template
        </Button>
      </div>

      <div className="mt-4">
        <Button asChild variant="outline">
          <label>
            <Upload className="mr-2 h-4 w-4" />
            {file ? file.name : "Choose CSV or XLSX"}
            <input
              type="file"
              accept=".csv,.xlsx"
              className="sr-only"
              onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </Button>
        <span className="ml-3 text-xs text-muted-foreground">Maximum 5 MB / 2,000 rows</span>
      </div>

      {headers.length > 0 && (
        <div className="mt-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold">Column mapping</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((field) => (
                <div key={field.key}>
                  <Label>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <Select
                    value={mapping[field.key] || "__none__"}
                    onValueChange={(value) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]: value === "__none__" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not mapped</SelectItem>
                      {headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-[18px] border bg-card shadow-sm">
            <table className="w-full text-xs">
              <thead className="bg-muted/70 text-left">
                <tr>
                  {fields.map((field) => (
                    <th key={field.key} className="whitespace-nowrap px-3 py-2">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index} className="border-t hover:bg-primary-soft/60">
                    {fields.map((field) => (
                      <td key={field.key} className="max-w-48 truncate px-3 py-2">
                        {String(row[field.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allowConfirmedUpdates && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={updateExisting}
                onCheckedChange={(value) => setUpdateExisting(value === true)}
              />
              Update an existing record only when its SKU and batch match
            </label>
          )}

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            <span>
              I reviewed the mapping and preview. Import {rawRows.length} rows into the live
              database.
            </span>
          </label>

          <Button onClick={() => void runImport()} disabled={!confirmed || loading}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {loading ? "Importing..." : "Confirm import"}
          </Button>
        </div>
      )}

      {result && (
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border bg-muted/60 p-4 text-sm">
          {result.errors.length ? (
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          )}
          <span>{result.imported} imported</span>
          <span>{result.skipped} skipped</span>
          {result.errors.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadImportErrors(templateName, result)}
            >
              <Download className="mr-2 h-4 w-4" /> Error report
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
