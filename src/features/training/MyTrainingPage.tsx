import { useAuth } from '../auth/AuthContext'
import { TrainingSheet } from './TrainingSheet'
import { PayPanel } from './PayPanel'

export function MyTrainingPage() {
  const { profile } = useAuth()
  if (!profile) return <div className="page-message">Loading…</div>

  return (
    <div className="stack">
      <h1>My Training Sheet</h1>
      <PayPanel employee={profile} />
      <TrainingSheet employeeId={profile.id} />
    </div>
  )
}
