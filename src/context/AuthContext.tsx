import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/validation'
import type { Profile } from '../types/database'

type AuthState = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    if (!isUuid(userId)) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) {
      console.error('[Auth] loadProfile:', error.message, error)
      setProfile(null)
      return
    }
    if (!data) {
      console.warn(
        '[Auth] ไม่มีแถวใน public.profiles สำหรับ user นี้ — รัน SQL backfill ใน SETUP.md หรือสร้างแถวใน Table Editor',
      )
    }
    setProfile(data)
  }, [])

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setProfile(null)
      return
    }
    await loadProfile(uid)
  }, [loadProfile, session?.user?.id])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return
      setSession(s)
      setLoading(false)
      if (s?.user?.id) void loadProfile(s.user.id)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user?.id) void loadProfile(s.user.id)
      else setProfile(null)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      refreshProfile,
      signIn,
      signOut,
    }),
    [session, profile, loading, refreshProfile, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
