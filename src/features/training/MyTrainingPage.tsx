import { useAuth } from '../auth/AuthContext'
import { TrainingSheet } from './TrainingSheet'

export function MyTrainingPage() {
  const { profile } = useAuth()
  if (!profile) return <div className="page-message">Loading…</div>

  return (
    <div className="stack">
      <h1>My Training Sheet</h1>
      <TrainingSheet employeeId={profile.id} />
    </div>
  )
}
