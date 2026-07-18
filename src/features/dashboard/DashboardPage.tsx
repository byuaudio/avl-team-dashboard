import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAllProgress,
  fetchAnnouncements,
  fetchTeamRoster,
  fetchTrainingTemplate,
  type TrainingTemplate,
} from '../../lib/api'
import type { Announcement, Profile, TrainingProgress } from '../../lib/types'
import { ROLE_LABELS } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

export function DashboardPage() {
  const { profile, canGrantPassoffs } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [roster, setRoster] = useState<Profile[] | null>(null)
  const [progress, setProgress] = useState<TrainingProgress[] | null>(null)
  const [template, setTemplate] = useState<TrainingTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetchAnnouncements(),
      fetchTeamRoster(),
      fetchAllProgress(),
      fetchTrainingTemplate(),
    ])
      .then(([loadedAnnouncements, loadedRoster, loadedProgress, loadedTemplate]) => {
        setAnnouncements(loadedAnnouncements)
        setRoster(loadedRoster)
        setProgress(loadedProgress)
        setTemplate(loadedTemplate)
      })
      .catch((loadError: Error) => setError(loadError.message))
  }, [])

  const myPassedCount = useMemo(
    () =>
      (progress ?? []).filter(
        (row) => row.employee_id === profile?.id && row.status === 'passed_off',
      ).length,
    [progress, profile],
  )

  const pendingRequestCount = useMemo(
    () => (progress ?? []).filter((row) => row.status === 'passoff_requested').length,
    [progress],
  )

  if (error) return <p className="error-text">{error}</p>
  if (!announcements || !roster || !template) {
    return <div className="page-message">Loading…</div>
  }

  const totalItems = template.items.length

  return (
    <div className="stack">
      <h1>Dashboard</h1>

      <div className="card-grid">
        <section className="card stat-card">
          <h2>My Training</h2>
          <p className="stat-number">
            {myPassedCount} / {totalItems}
          </p>
          <p className="muted">items passed off</p>
          <Link to="/training">Open my training sheet →</Link>
        </section>

        {canGrantPassoffs && (
          <section className="card stat-card">
            <h2>Pass-off Requests</h2>
            <p className="stat-number">{pendingRequestCount}</p>
            <p className="muted">waiting across the team</p>
            <Link to="/team">Review team training →</Link>
          </section>
        )}
      </div>

      <section className="card">
        <h2>Announcements</h2>
        {announcements.length === 0 ? (
          <p className="muted">No announcements yet.</p>
        ) : (
          <ul className="announcement-list">
            {announcements.map((announcement) => (
              <li key={announcement.id}>
                <strong>{announcement.title}</strong>
                <span className="muted">
                  {' '}
                  — {new Date(announcement.created_at).toLocaleDateString()}
                </span>
                {announcement.body && <p>{announcement.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Team</h2>
        <table className="training-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {roster
              .filter((person) => person.is_active)
              .map((person) => (
                <tr key={person.id}>
                  <td>{person.full_name}</td>
                  <td>{ROLE_LABELS[person.role]}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
