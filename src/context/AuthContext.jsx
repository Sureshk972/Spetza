import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { initPush, teardownPush } from '../lib/push.js'

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  profileLoading: false,
  refreshProfile: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // True while a profile fetch is in flight. RequireAuth uses this to hold
  // the gate shut when we have a user but don't yet know their profile --
  // otherwise sign-in renders the dashboard for a beat before the phone /
  // name gates can fire. Only blocks when `profile` is still null, so a
  // routine refreshProfile() mid-session never flashes a spinner.
  const [profileLoading, setProfileLoading] = useState(false)

  const fetchProfile = useCallback(async (uid) => {
    setProfileLoading(true)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle()
      const next = data ?? null
      setProfile(next)
      return next
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false)
      return
    }
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      const sessionUser = data.session?.user ?? null
      setUser(sessionUser)
      // Fetch profile BEFORE clearing loading so guards see the full state
      if (sessionUser) {
        await fetchProfile(sessionUser.id).catch(() => {})
      }
      if (mounted) setLoading(false)
      // Init push after auth is resolved and profile is loaded
      if (sessionUser) {
        initPush(sessionUser.id)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null
      setUser(next)
      if (next) {
        // Mark the fetch as pending synchronously. fetchProfile sets this
        // too, but it isn't awaited here -- without this line React can
        // paint the post-sign-in route before the flag flips.
        setProfileLoading(true)
        fetchProfile(next.id).catch(() => setProfileLoading(false))
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [fetchProfile])

  const refreshProfile = useCallback(async () => {
    if (!user || !hasSupabaseConfig) return null
    return await fetchProfile(user.id)
  }, [user, fetchProfile])

  const signOut = async () => {
    if (user) await teardownPush(user.id)
    if (hasSupabaseConfig) await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, profileLoading, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
