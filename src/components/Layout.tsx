import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { ROLE_LABELS } from '../lib/types'

export function Layout() {
  const { profile, canGrantPassoffs, canEditTemplate, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-brand">BYU Audio for Live Events</span>
        <nav className="app-nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/training">My Training</NavLink>
          {canGrantPassoffs && <NavLink to="/team">Team Training</NavLink>}
          {canEditTemplate && <NavLink to="/template">Edit Template</NavLink>}
        </nav>
        <div className="app-user">
          {profile && (
            <span className="muted">
              {profile.full_name} · {ROLE_LABELS[profile.role]}
            </span>
          )}
          <button className="button-secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
