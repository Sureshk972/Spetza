// Read one operator switch from app_settings. Resolves to `fallback` until
// the row arrives (and if it never does), so a page renders the safe
// default first and never flashes an offer it may have to withdraw.
import { useEffect, useState } from 'react'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'

export function useAppSetting(key, fallback) {
  const [value, setValue] = useState(fallback)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!hasSupabaseConfig) return
    let cancelled = false
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data) setValue(data.value)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [key])
  return { value, loaded }
}
