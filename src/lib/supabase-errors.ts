export function isMissingRelationError(
  error: { code?: string; message?: string } | null | undefined,
) {
  if (!error) return false;

  return (
    error.code === "PGRST205" ||
    /Could not find the table|relation .* does not exist|schema cache/i.test(error.message ?? "")
  );
}

export function missingSchemaMessage(feature: string) {
  return `${feature} is not ready yet because the Supabase project schema has not been applied.`;
}
