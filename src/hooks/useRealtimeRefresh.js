import { useEffect, useRef } from 'react'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'

// Subscribe to postgres_changes on `table` with `filter`, and invoke
// `refresh()` on any INSERT/UPDATE/DELETE. `refresh` is held by ref so
// its identity changing between renders doesn't tear down the sub.
//
// Pass null/undefined for `filter` (or `enabled=false`) to skip
// subscribing — e.g. before the user id is known.
export function useRealtimeRefresh({ channelName, table, filter, refresh, enabled = true }) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (!hasSupabaseConfig || !enabled || !channelName || !filter) return
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => { refreshRef.current?.() },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelName, table, filter, enabled])
}
