import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { ROLE_LABELS } from '../lib/types'
import { NotificationsBell } from './NotificationsBell'
import { ErrorBoundary } from './ErrorBoundary'

export function Layout() {
  const { profile, canGrantPassoffs, canManageMembers, canSeePay, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-brand">BYU Audio for Live Events</span>
        <nav className="app-nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/training">My Training</NavLink>
          <NavLink to="/calendar">Calendar</NavLink>
          <NavLink to="/sessions">My Sessions</NavLink>
          {canGrantPassoffs && <NavLink to="/team">Team Training</NavLink>}
          {canGrantPassoffs && <NavLink to="/availability">My Availability</NavLink>}
          {canManageMembers && <NavLink to="/roster">Team Roster</NavLink>}
          {canSeePay && <NavLink to="/payroll">Payroll</NavLink>}
        </nav>
        <div className="app-user">
          <NotificationsBell />
          {profile && (
            <NavLink to="/account" className="muted account-link">
              {profile.full_name} · {ROLE_LABELS[profile.role]}
            </NavLink>
          )}
          <button className="button-secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
