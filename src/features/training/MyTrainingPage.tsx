import { useAuth } from '../auth/AuthContext'
import { TrainingSheet } from './TrainingSheet'
import { PayPanel } from './PayPanel'

export function MyTrainingPage() {
  const { profile } = useAuth()
  if (!profile) return <div className="page-message">Loading…</div>

  return (
    <div className="stack">
      <h1>My Training Sheet</h1>
      {profile.submitted_rate != null && (
        <p className="cleared-rate">
          Current pay rate (cleared by payroll): <strong>${profile.submitted_rate.toFixed(2)}/hr</strong>
          {profile.submitted_at && <span className="muted"> · as of {profile.submitted_at}</span>}
        </p>
      )}
      <PayPanel employee={profile} />
      <TrainingSheet employeeId={profile.id} />
    </div>
  )
}
