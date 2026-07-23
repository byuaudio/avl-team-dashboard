import { useState, type FormEvent } from 'react'
import { changeOwnPassword } from '../../lib/api'
import { ROLE_LABELS } from '../../lib/types'
import { useAuth } from './AuthContext'

/** The signed-in user's account: profile summary + change-password form. */
export function AccountPage() {
  const { profile } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await changeOwnPassword(password)
      setSuccess(true)
      setPassword('')
      setConfirm('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="stack">
      <h1>My Account</h1>
      {profile && (
        <section className="card">
          <p>
            <strong>{profile.full_name}</strong>
            <span className="muted"> · {ROLE_LABELS[profile.role]}</span>
          </p>
        </section>
      )}
      <section className="card member-form">
        <h2>Change password</h2>
        <form onSubmit={handleSubmit}>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">Password changed.</p>}
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </section>
    </div>
  )
}
