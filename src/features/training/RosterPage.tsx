import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchTeamRoster,
  resetMemberPassword,
  setMemberArchived,
  setMemberRole,
} from '../../lib/api'
import type { EmployeeRole, Profile } from '../../lib/types'
import { ROLE_LABELS, ROLE_RANK, assignableRoles, maxAssignableRank } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'
import { AddMemberForm } from './AddMemberForm'

/** Staff (3/4-time+) manage the team here: add members, change roles (up to
 *  their ceiling), archive/unarchive, and reset passwords. */
export function RosterPage() {
  const { profile, canManageMembers } = useAuth()
  const [roster, setRoster] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)

  const refreshRoster = useCallback(() => {
    fetchTeamRoster()
      .then(setRoster)
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    refreshRoster()
  }, [refreshRoster])

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

  if (!canManageMembers) return <p className="page-message">This page is for staff (3/4-time+).</p>
  if (error) return <p className="error-text">{error}</p>
  if (!roster) return <div className="page-message">Loading…</div>

  const cap = maxAssignableRank(profile?.role)
  const roleOptions = assignableRoles(profile?.role)
  const visible = roster.filter((p) => (showArchived ? true : !p.archived))

  return (
    <div className="stack">
      <h1>Team Roster</h1>
      <AddMemberForm onAdded={refreshRoster} />
      {actionError && <p className="error-text">{actionError}</p>}
      <label className="muted" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived members
      </label>
      <section className="card">
        <table className="training-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((person) => {
              const isSelf = person.id === profile?.id
              const canManageThis = !isSelf && ROLE_RANK[person.role] <= cap
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
                    {canManageThis && (
                      <span className="row-actions">
                        <button className="button-secondary" onClick={() => setResetTarget(person)}>
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
            <p className="success-text">Done. Share this password with {member.full_name}:</p>
            <p style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.02em' }}>
              {password}
            </p>
            <button className="button-primary" onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
