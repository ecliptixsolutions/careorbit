import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, ImagePlus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  organizationLogoUrl,
  organizationSettingsId,
  useOrganizationSettings,
} from "@/hooks/use-organization-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/organization-settings")({
  component: OrganizationSettingsPage,
});

type Settings = Tables<"organization_settings">;

const fieldGroups: Array<{
  title: string;
  fields: Array<{ key: keyof Settings; label: string; placeholder?: string }>;
}> = [
  {
    title: "Hospital identity",
    fields: [
      { key: "hospital_name", label: "Hospital name" },
      { key: "legal_name", label: "Legal / business name" },
      { key: "gstin", label: "GSTIN" },
      { key: "pan_registration", label: "PAN / registration number" },
    ],
  },
  {
    title: "Contact details",
    fields: [
      { key: "primary_phone", label: "Primary phone" },
      { key: "secondary_phone", label: "Secondary phone" },
      { key: "email", label: "Email" },
      { key: "website", label: "Website" },
    ],
  },
  {
    title: "Address",
    fields: [
      { key: "address_line_1", label: "Address line 1" },
      { key: "address_line_2", label: "Address line 2" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "postal_code", label: "PIN code" },
    ],
  },
  {
    title: "Invoice defaults",
    fields: [
      { key: "invoice_prefix", label: "Invoice prefix" },
      { key: "currency", label: "Currency" },
      { key: "authorized_signatory", label: "Authorized signatory" },
    ],
  },
];

function OrganizationSettingsPage() {
  const { user } = useAuth();
  const { data: access } = useRoleAccess();
  const { data: settings, isLoading } = useOrganizationSettings();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const selectedLogoUrl = useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : null),
    [logoFile],
  );

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);
  useEffect(
    () => () => {
      if (selectedLogoUrl) URL.revokeObjectURL(selectedLogoUrl);
    },
    [selectedLogoUrl],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form || !user) throw new Error("Settings are not ready");
      if (form.hospital_name.trim().length < 2) throw new Error("Hospital name is required");

      let logoPath = form.logo_path;
      if (logoFile) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(logoFile.type))
          throw new Error("Logo must be PNG, JPG or WebP");
        if (logoFile.size > 2 * 1024 * 1024) throw new Error("Logo must be 2 MB or smaller");

        // Upload via Express endpoint
        const formData = new FormData();
        formData.append("logo", logoFile);
        const uploadRes = await fetch("/api/uploads/logo", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const uploadBody = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(uploadBody.error?.message || "Logo upload failed");
        logoPath = uploadBody.path as string;
      }

      const { error } = await supabase.from("organization_settings").upsert({
        ...form,
        id: organizationSettingsId,
        logo_path: logoPath,
        invoice_prefix: form.invoice_prefix.trim().toUpperCase() || "INV",
        currency: "INR",
        updated_by: user.id,
      });
      if (error) throw error;

      // Delete old logo file if replaced (only local /uploads/ paths)
      if (logoFile && form.logo_path && form.logo_path !== logoPath && form.logo_path.startsWith("branding/")) {
        await fetch("/api/uploads/logo", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: form.logo_path }),
        });
      }
    },
    onSuccess: () => {
      toast.success("Hospital settings saved");
      setLogoFile(null);
      queryClient.invalidateQueries({ queryKey: ["organization-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeLogo = useMutation({
    mutationFn: async () => {
      if (!form?.logo_path || !user) return;
      // Only delete local uploads — Supabase Storage URLs are left intact
      if (form.logo_path.startsWith("branding/")) {
        await fetch("/api/uploads/logo", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: form.logo_path }),
        });
      }
      const { error: updateError } = await supabase
        .from("organization_settings")
        .update({ logo_path: null, updated_by: user.id })
        .eq("id", organizationSettingsId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success("Logo removed");
      setLogoFile(null);
      queryClient.invalidateQueries({ queryKey: ["organization-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!access?.permissions.canManageUsers) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Hospital settings restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only administrators can change invoice branding and facility details.
        </p>
      </div>
    );
  }

  if (isLoading || !form) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  const currentLogo = selectedLogoUrl ?? organizationLogoUrl(form.logo_path);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Hospital settings</h1>
          <p className="mt-1 text-muted-foreground">
            Branding and legal details used on invoices and receipts.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? "Saving..." : "Save settings"}
        </Button>
      </div>

      <section className="grid gap-5 border-y py-5 md:grid-cols-[220px_1fr]">
        <div>
          <h2 className="font-semibold">Hospital logo</h2>
          <p className="mt-1 text-xs text-muted-foreground">PNG, JPG or WebP. Maximum 2 MB.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-md border bg-white">
            {currentLogo ? (
              <img
                src={currentLogo}
                alt="Hospital logo preview"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <label>
                <ImagePlus className="mr-2 h-4 w-4" /> Choose logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </Button>
            {form.logo_path && (
              <Button
                variant="outline"
                onClick={() => removeLogo.mutate()}
                disabled={removeLogo.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </Button>
            )}
          </div>
        </div>
      </section>

      {fieldGroups.map((group) => (
        <section key={group.title} className="grid gap-5 border-b pb-5 md:grid-cols-[220px_1fr]">
          <h2 className="font-semibold">{group.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => (
              <div key={String(field.key)}>
                <Label htmlFor={String(field.key)}>{field.label}</Label>
                <Input
                  id={String(field.key)}
                  value={String(form[field.key] ?? "")}
                  disabled={field.key === "currency"}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, [field.key]: event.target.value } : current,
                    )
                  }
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="grid gap-5 border-b pb-5 md:grid-cols-[220px_1fr]">
        <div>
          <h2 className="font-semibold">Pharmacy invoice</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Legal identifiers and colour used on pharmacy bills.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="drug_license_numbers">Drug licence numbers</Label>
            <Textarea
              id="drug_license_numbers"
              rows={3}
              value={form.drug_license_numbers.join("\n")}
              placeholder={"Enter one licence number per line"}
              onChange={(event) =>
                setForm((current) =>
                  current
                    ? {
                        ...current,
                        drug_license_numbers: event.target.value
                          .split("\n")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      }
                    : current,
                )
              }
            />
          </div>
          <div>
            <Label htmlFor="invoice_accent_color">Invoice accent colour</Label>
            <div className="flex items-center gap-3">
              <Input
                id="invoice_accent_color"
                type="color"
                className="h-10 w-16 p-1"
                value={form.invoice_accent_color}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, invoice_accent_color: event.target.value } : current,
                  )
                }
              />
              <Input
                value={form.invoice_accent_color}
                readOnly
                aria-label="Invoice accent colour"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-[220px_1fr]">
        <h2 className="font-semibold">Invoice text</h2>
        <div className="space-y-4">
          {[
            ["invoice_terms", "Terms and conditions"],
            ["payment_details", "Bank / UPI payment details"],
            ["invoice_footer", "Invoice footer"],
          ].map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={key}>{label}</Label>
              <Textarea
                id={key}
                rows={3}
                value={String(form[key as keyof Settings] ?? "")}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, [key]: event.target.value } : current,
                  )
                }
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
