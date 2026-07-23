import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAllMilestoneProgress,
  fetchTeamRoster,
  fetchTrainingTree,
} from '../../lib/api'
import type { MilestoneProgress, Profile, TrainingNode } from '../../lib/types'
import { ROLE_LABELS } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'
import { AddMemberForm } from './AddMemberForm'

/**
 * Trainer/manager overview: every employee with their milestone progress and
 * how many sign-off requests are waiting on them.
 */
export function TeamTrainingPage() {
  const { isManager } = useAuth()
  const [roster, setRoster] = useState<Profile[] | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null)
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshRoster = useCallback(() => {
    fetchTeamRoster()
      .then(setRoster)
      .catch((loadError: Error) => setError(loadError.message))
  }, [])

  useEffect(() => {
    Promise.all([fetchTeamRoster(), fetchAllMilestoneProgress(), fetchTrainingTree()])
      .then(([loadedRoster, loadedProgress, loadedNodes]) => {
        setRoster(loadedRoster)
        setProgress(loadedProgress)
        setNodes(loadedNodes)
      })
      .catch((loadError: Error) => setError(loadError.message))
  }, [])

  const statsByEmployee = useMemo(() => {
    const stats = new Map<string, { passed: number; pending: number }>()
    for (const row of progress ?? []) {
      const entry = stats.get(row.employee_id) ?? { passed: 0, pending: 0 }
      if (row.status === 'granted') entry.passed += 1
      if (row.status === 'requested') entry.pending += 1
      stats.set(row.employee_id, entry)
    }
    return stats
  }, [progress])

  if (error) return <p className="error-text">{error}</p>
  if (!roster || !nodes) return <div className="page-message">Loading…</div>

  // Total sign-off slots = every milestone on every item in the template.
  const totalItems = nodes.reduce(
    (sum, node) => (node.kind === 'item' ? sum + node.milestones.length : sum),
    0,
  )
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
