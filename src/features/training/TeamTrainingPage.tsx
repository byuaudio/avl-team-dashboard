import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAllMilestoneProgress,
  fetchTeamRoster,
  fetchTrainingTree,
  resetMemberPassword,
  setMemberArchived,
  setMemberRole,
} from '../../lib/api'
import type { EmployeeRole, MilestoneProgress, Profile, TrainingNode } from '../../lib/types'
import { ROLE_LABELS, ROLE_RANK, assignableRoles, maxAssignableRank } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'
import { AddMemberForm } from './AddMemberForm'

/**
 * Trainer/manager overview: every employee with their milestone progress and
 * how many sign-off requests are waiting. Staff (3/4-time+) can also change
 * roles (up to their ceiling) and archive members.
 */
export function TeamTrainingPage() {
  const { profile, canManageMembers } = useAuth()
  const [roster, setRoster] = useState<Profile[] | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null)
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)

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

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setActionError(null)
      try {
        await action()
        refreshRoster()
      } catch (e) {
        setActionError((e as Error).message)
      }
    },
    [refreshRoster],
  )

  if (error) return <p className="error-text">{error}</p>
  if (!roster || !nodes) return <div className="page-message">Loading…</div>

  const totalItems = nodes.reduce(
    (sum, node) => (node.kind === 'item' ? sum + node.milestones.length : sum),
    0,
  )
  const cap = maxAssignableRank(profile?.role)
  const roleOptions = assignableRoles(profile?.role)
  const visible = roster.filter((p) => (showArchived ? true : !p.archived))

  return (
    <div className="stack">
      <h1>Team Training</h1>
      {canManageMembers && <AddMemberForm onAdded={refreshRoster} />}
      {actionError && <p className="error-text">{actionError}</p>}
      {canManageMembers && (
        <label className="muted" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived members
        </label>
      )}
      <section className="card">
        <table className="training-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Progress</th>
              <th>Waiting for sign-off</th>
              {canManageMembers && <th>Manage</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((person) => {
              const stats = statsByEmployee.get(person.id) ?? { passed: 0, pending: 0 }
              const isSelf = person.id === profile?.id
              const canManageThis = canManageMembers && !isSelf && ROLE_RANK[person.role] <= cap
              return (
                <tr key={person.id} className={person.archived ? 'row-archived' : undefined}>
                  <td>
                    <Link to={`/team/${person.id}`}>{person.full_name}</Link>
                    {person.archived && <span className="muted"> · archived</span>}
                  </td>
                  <td>
                    {canManageThis ? (
                      <select
                        value={person.role}
                        onChange={(e) =>
                          runAction(() => setMemberRole(person.id, e.target.value as EmployeeRole))
                        }
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABELS[person.role]
                    )}
                  </td>
                  <td>
                    {stats.passed} / {totalItems}
                  </td>
                  <td>{stats.pending > 0 ? `${stats.pending} item(s)` : '—'}</td>
                  {canManageMembers && (
                    <td>
                      {canManageThis && (
                        <span className="row-actions">
                          <button
                            className="button-secondary"
                            onClick={() => setResetTarget(person)}
                          >
                            Reset password
                          </button>
                          <button
                            className="button-secondary"
                            onClick={() =>
                              runAction(() => setMemberArchived(person.id, !person.archived))
                            }
                          >
                            {person.archived ? 'Unarchive' : 'Archive'}
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      {resetTarget && (
        <ResetPasswordModal member={resetTarget} onClose={() => setResetTarget(null)} />
      )}
    </div>
  )
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(10)
  crypto.getRandomValues(bytes)
  return 'AVL-' + Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

function ResetPasswordModal({ member, onClose }: { member: Profile; onClose: () => void }) {
  const [password, setPassword] = useState(generateTempPassword)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleReset() {
    setSubmitting(true)
    setError(null)
    try {
      await resetMemberPassword(member.id, password)
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Reset password · {member.full_name}</h2>
          <button className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {!done ? (
          <>
            <label className="modal-field">
              Temporary password
              <input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
            </label>
            <p className="muted">
              They can sign in with this and change it afterward from “My Account.”
            </p>
            {error && <p className="error-text">{error}</p>}
            <button className="button-primary" onClick={handleReset} disabled={submitting}>
              {submitting ? 'Setting…' : 'Set password'}
            </button>
          </>
        ) : (
          <>
            <p className="success-text">
              Done. Share this password with {member.full_name}:
            </p>
            <p style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.02em' }}>{password}</p>
            <button className="button-primary" onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
