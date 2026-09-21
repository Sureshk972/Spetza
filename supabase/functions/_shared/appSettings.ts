// Operator switches in public.app_settings, read with the service role.
// Falls back to the default when the row is missing so a bad deploy can
// never silently flip a rule.

export async function courierPaysBackgroundCheck(supabase: any): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "courier_pays_background_check")
    .maybeSingle();
  if (error || !data) {
    console.error("app_settings: courier_pays_background_check unreadable, defaulting to true", error);
    return true;
  }
  return data.value === true;
}
