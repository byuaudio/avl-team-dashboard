import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAllProgress,
  fetchTeamRoster,
  fetchTrainingTemplate,
  type TrainingTemplate,
} from '../../lib/api'
import type { Profile, TrainingProgress } from '../../lib/types'
import { ROLE_LABELS } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'
import { AddMemberForm } from './AddMemberForm'

/**
 * Trainer/manager overview: every employee with their pass-off progress and
 * how many pass-off requests are waiting on them.
 */
export function TeamTrainingPage() {
  const { isManager } = useAuth()
  const [roster, setRoster] = useState<Profile[] | null>(null)
  const [progress, setProgress] = useState<TrainingProgress[] | null>(null)
  const [template, setTemplate] = useState<TrainingTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshRoster = useCallback(() => {
    fetchTeamRoster()
      .then(setRoster)
      .catch((loadError: Error) => setError(loadError.message))
  }, [])

  useEffect(() => {
    Promise.all([fetchTeamRoster(), fetchAllProgress(), fetchTrainingTemplate()])
      .then(([loadedRoster, loadedProgress, loadedTemplate]) => {
        setRoster(loadedRoster)
        setProgress(loadedProgress)
        setTemplate(loadedTemplate)
      })
      .catch((loadError: Error) => setError(loadError.message))
  }, [])

  const statsByEmployee = useMemo(() => {
    const stats = new Map<string, { passed: number; pending: number }>()
    for (const row of progress ?? []) {
      const entry = stats.get(row.employee_id) ?? { passed: 0, pending: 0 }
      if (row.status === 'passed_off') entry.passed += 1
      if (row.status === 'passoff_requested') entry.pending += 1
      stats.set(row.employee_id, entry)
    }
    return stats
  }, [progress])

  if (error) return <p className="error-text">{error}</p>
  if (!roster || !template) return <div className="page-message">Loading…</div>

  const totalItems = template.items.length
  const activeRoster = roster.filter((person) => person.is_active)

  return (
    <div className="stack">
      <h1>Team Training</h1>
      {isManager && <AddMemberForm onAdded={refreshRoster} />}
      <section className="card">
        <table className="training-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Progress</th>
              <th>Waiting for pass-off</th>
            </tr>
          </thead>
          <tbody>
            {activeRoster.map((person) => {
              const stats = statsByEmployee.get(person.id) ?? { passed: 0, pending: 0 }
              return (
                <tr key={person.id}>
                  <td>
                    <Link to={`/team/${person.id}`}>{person.full_name}</Link>
                  </td>
                  <td>{ROLE_LABELS[person.role]}</td>
                  <td>
                    {stats.passed} / {totalItems}
                  </td>
                  <td>{stats.pending > 0 ? `${stats.pending} item(s)` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
