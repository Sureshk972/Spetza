import { useEffect, useState } from 'react'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Returns the count of deliveries the courier has accepted but not yet picked up.
 * Subscribes to realtime so the badge appears/disappears instantly.
 */
export function usePendingPickups() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = async () => {
    if (!user || !hasSupabaseConfig) return
    const { count: n } = await supabase
      .from('delivery_requests')
      .select('id', { count: 'exact', head: true })
      .eq('courier_id', user.id)
      .eq('status', 'accepted')
    setCount(n ?? 0)
  }

  useEffect(() => {
    refresh()
    if (!user || !hasSupabaseConfig) return

    const channel = supabase
      .channel(`pending-pickups:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_requests',
          filter: `courier_id=eq.${user.id}`,
        },
        () => refresh(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  return count
}
