import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchTeamRoster } from '../../lib/api'
import type { Profile } from '../../lib/types'
import { ROLE_LABELS } from '../../lib/types'
import { TrainingSheet } from './TrainingSheet'
import { PayPanel } from './PayPanel'

/** A trainer/manager viewing (and passing off items on) one employee's sheet. */
export function EmployeeTrainingPage() {
  const { employeeId } = useParams<{ employeeId: string }>()
  const [employee, setEmployee] = useState<Profile | null>(null)

  useEffect(() => {
    if (!employeeId) return
    fetchTeamRoster().then((roster) =>
      setEmployee(roster.find((person) => person.id === employeeId) ?? null),
    )
  }, [employeeId])

  if (!employeeId) return <p className="error-text">No employee selected.</p>

  return (
    <div className="stack">
      <p>
        <Link to="/team">← Back to team</Link>
      </p>
      <h1>
        {employee ? employee.full_name : 'Training Sheet'}
        {employee && <span className="muted"> · {ROLE_LABELS[employee.role]}</span>}
      </h1>
      {employee && <PayPanel employee={employee} />}
      <TrainingSheet employeeId={employeeId} />
    </div>
  )
}
