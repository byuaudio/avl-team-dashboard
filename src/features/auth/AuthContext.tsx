import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../lib/supabaseClient'
import type { Profile } from '../../lib/types'

interface AuthContextValue {
  session: Session | null
  /** The signed-in employee's profile row (name, role). Null while loading or signed out. */
  profile: Profile | null
  /** True until the initial session + profile load has finished. */
  loading: boolean
  /** Trainers and managers can view all sheets and grant pass-offs. */
  canGrantPassoffs: boolean
  isManager: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseClient()

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    getSupabaseClient()
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setProfile(data)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    canGrantPassoffs: profile?.role === 'student_trainer' || profile?.role === 'manager',
    isManager: profile?.role === 'manager',
    signIn: async (email, password) => {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
      return { error: error ? error.message : null }
    },
    signOut: async () => {
      await getSupabaseClient().auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
