import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAllMilestoneProgress, fetchTeamRoster, fetchTrainingTree } from '../../lib/api'
import type { MilestoneProgress, Profile, TrainingNode } from '../../lib/types'
import { ROLE_LABELS } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

/**
 * Trainer/manager overview of every (active) employee's training progress, with
 * a link into each sheet. Member management lives on the Team Roster page; the
 * template is edited in a separate window via the button here.
 */
export function TeamTrainingPage() {
  const { canEditTemplate } = useAuth()
  const [roster, setRoster] = useState<Profile[] | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null)
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchTeamRoster(), fetchAllMilestoneProgress(), fetchTrainingTree()])
      .then(([r, p, n]) => {
        setRoster(r)
        setProgress(p)
        setNodes(n)
      })
      .catch((e: Error) => setError(e.message))
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

  const totalItems = nodes.reduce(
    (sum, n) => (n.kind === 'item' && !n.retired ? sum + n.milestones.length : sum),
    0,
  )
  const activeRoster = roster.filter((p) => p.is_active && !p.archived)

  function openTemplateEditor() {
    const url = new URL(window.location.href)
    url.hash = '#/template'
    window.open(url.toString(), '_blank', 'noopener')
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Team Training</h1>
        {canEditTemplate && (
          <button className="button-secondary" onClick={openTemplateEditor}>
            Edit Template ↗
          </button>
        )}
      </div>
      <section className="card">
        <table className="training-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Progress</th>
              <th>Waiting for sign-off</th>
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
