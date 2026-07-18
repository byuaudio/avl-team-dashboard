import { useState, type FormEvent } from 'react'
import { addTeamMember } from '../../lib/api'
import { ROLE_LABELS, type EmployeeRole } from '../../lib/types'

/**
 * Manager-only form to add a new team member. On success it clears itself and
 * calls onAdded() so the parent can refresh the roster. Rendered on the Team
 * Training page (gated by isManager there).
 */
export function AddMemberForm({ onAdded }: { onAdded: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<EmployeeRole>('student')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      await addTeamMember({ fullName, email, password, role })
      setSuccess(
        `Added ${fullName}. They can sign in now with that email and temporary password, then change the password later.`,
      )
      setFullName('')
      setEmail('')
      setPassword('')
      setRole('student')
      onAdded()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <details className="card member-form">
      <summary>Add a team member</summary>
      <form onSubmit={handleSubmit}>
        <label>
          Full name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <label>
          Temporary password
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            minLength={8}
            placeholder="At least 8 characters"
            required
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as EmployeeRole)}>
            {(Object.keys(ROLE_LABELS) as EmployeeRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{success}</p>}
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add member'}
        </button>
      </form>
    </details>
  )
}
