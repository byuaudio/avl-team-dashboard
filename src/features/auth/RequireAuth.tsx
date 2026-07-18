import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'

/** Wraps signed-in-only routes: redirects to /login and blocks deactivated accounts. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return <div className="page-message">Loading…</div>
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (profile && !profile.is_active) {
    return (
      <div className="page-message">
        Your account is deactivated. Contact a manager if you think this is a mistake.
      </div>
    )
  }
  return <>{children}</>
}
