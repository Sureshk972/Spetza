// delivery_requests.sender_id / courier_id reference auth.users, not profiles,
// so PostgREST can't embed `profiles!...` on them (PGRST200). Look the
// profiles up in one second query and attach them as `sender` / `courier`.
export async function attachProfiles(supabase, rows, fields = 'id, first_name, last_name') {
  if (!rows?.length) return []
  const ids = [...new Set(rows.flatMap((r) => [r.sender_id, r.courier_id]).filter(Boolean))]
  const { data } = ids.length
    ? await supabase.from('profiles').select(fields).in('id', ids)
    : { data: [] }
  const byId = new Map((data ?? []).map((p) => [p.id, p]))
  return rows.map((r) => ({
    ...r,
    sender: byId.get(r.sender_id) ?? null,
    courier: byId.get(r.courier_id) ?? null,
  }))
}
