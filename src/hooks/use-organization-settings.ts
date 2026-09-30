import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const organizationSettingsId = "00000000-0000-0000-0000-000000000001";

export function useOrganizationSettings() {
  return useQuery({
    queryKey: ["organization-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_settings")
        .select("*")
        .eq("id", organizationSettingsId)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function organizationLogoUrl(path: string | null | undefined) {
  if (!path) return null;
  return supabase.storage.from("hospital-assets").getPublicUrl(path).data.publicUrl;
}
