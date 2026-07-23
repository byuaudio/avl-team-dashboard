import { useEffect, useMemo, useState } from 'react'
import { fetchMilestoneProgressForEmployee, fetchTrainingTree, setBaseRate } from '../../lib/api'
import { computePay } from '../../lib/pay'
import type { MilestoneProgress, Profile, TrainingNode } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

const money = (n: number) => `$${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * Training-based pay breakdown for one employee. Only rendered when the viewer
 * can see pay (Full-Time / Audio Manager); the Audio Manager can edit the base
 * rate here and category amounts in Edit Template.
 */
export function PayPanel({ employee }: { employee: Profile }) {
  const { canSeePay, isAudioManager } = useAuth()
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null)
  const [baseRate, setBaseRateState] = useState(employee.base_rate)
  const [editing, setEditing] = useState(false)
  const [draftRate, setDraftRate] = useState(String(employee.base_rate))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBaseRateState(employee.base_rate)
    setDraftRate(String(employee.base_rate))
  }, [employee.base_rate])

  useEffect(() => {
    if (!canSeePay) return
    Promise.all([fetchTrainingTree(), fetchMilestoneProgressForEmployee(employee.id)])
      .then(([n, p]) => {
        setNodes(n)
        setProgress(p)
      })
      .catch((e: Error) => setError(e.message))
  }, [canSeePay, employee.id])

  const pay = useMemo(
    () => (nodes && progress ? computePay(nodes, progress, baseRate) : null),
    [nodes, progress, baseRate],
  )

  if (!canSeePay) return null
  if (employee.role === 'non_audio_student') {
    return (
      <section className="card">
        <h2>Pay</h2>
        <p className="muted">Pay is not based on training for this role.</p>
      </section>
    )
  }
  if (error) return <p className="error-text">{error}</p>
  if (!pay) return <div className="page-message">Calculating pay…</div>

  async function saveRate() {
    setError(null)
    const value = Number(draftRate)
    if (Number.isNaN(value)) {
      setError('Enter a number.')
      return
    }
    try {
      await setBaseRate(employee.id, value)
      setBaseRateState(value)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const earned = pay.total - pay.baseRate

  return (
    <details className="card">
      <summary className="pay-summary">
        <span className="tree-title">Pay</span>
        <span className="pay-total">{money(pay.total)}/hr</span>
        <span className="muted">
          ({money(pay.baseRate)} base + {money(earned)} training)
        </span>
      </summary>

      <div className="pay-base">
        Base rate:{' '}
        {isAudioManager && editing ? (
          <>
            <input
              type="number"
              step="0.01"
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value)}
              style={{ width: '6rem' }}
            />
            <button className="chip-button chip-button-primary" onClick={saveRate}>
              Save
            </button>
            <button className="chip-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <strong>{money(pay.baseRate)}</strong>
            {isAudioManager && (
              <button className="chip-button" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}

      <table className="training-table pay-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Done</th>
            <th>Amount</th>
            <th>Earned</th>
          </tr>
        </thead>
        <tbody>
          {pay.categories.map((c) => (
            <tr key={c.id}>
              <td>{c.title}</td>
              <td>
                {c.completed}/{c.active} ({pct(c.pct)})
              </td>
              <td>{money(c.amount)}</td>
              <td>{money(c.earning)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>
              <strong>Total rate</strong>
            </td>
            <td>
              <strong>{money(pay.total)}/hr</strong>
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="muted">
        Category amounts are set in Edit Template (Audio Manager). Retired training still counts,
        so a category can read over 100%.
      </p>
    </details>
  )
}
