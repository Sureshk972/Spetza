// Posting a request is one write for send-kind and two for pickup-kind
// (the request, then its contact). Kept out of the page so the rollback
// can be tested with a fake client.
export async function postDeliveryRequest(supabase, requestRow, contact) {
  const { data: inserted, error } = await supabase
    .from('delivery_requests')
    .insert(requestRow)
    .select('id')
    .single()
  if (error) return { id: null, error }
  if (!contact) return { id: inserted.id, error: null }
  const { error: contactErr } = await supabase
    .from('delivery_pickup_contacts')
    .insert({ delivery_request_id: inserted.id, ...contact })
  if (contactErr) {
    // A pickup job with nobody to collect from must not sit in the courier
    // pool. Remove it and let the requester try again.
    const { error: deleteErr } = await supabase
      .from('delivery_requests')
      .delete()
      .eq('id', inserted.id)
    if (deleteErr) console.error('rollback of orphan pickup request failed', deleteErr)
    return { id: null, error: contactErr }
  }
  return { id: inserted.id, error: null }
}
