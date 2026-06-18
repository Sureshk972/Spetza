import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Allow the landing page to render without env vars during scaffold/dev.
// Calls to supabase will fail gracefully until env vars are filled in.
export const supabase = url && anonKey
  ? createClient(url, anonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-anon-key')

export const hasSupabaseConfig = Boolean(url && anonKey)
