import { useCallback, useEffect, useState } from 'react'
import {
  addPenalty,
  addStar,
  approveStar,
  deletePenalty,
  deleteStar,
  fetchPenalties,
  fetchPolicyItems,
  fetchStars,
} from '../../lib/api'
import type { PerformanceStar, PolicyItem, PolicyPenalty } from '../../lib/types'
import { MAX_STARS_PER_METRIC, STAR_METRICS } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

/**
 * Performance stars and audio-crew-policy penalties for one employee. Visible to
 * staff (3/4-time+). Staff nominate stars; the Audio Manager awards/approves and
 * manages penalties. Shown on the employee's sheet; the $ value appears in Pay.
 */
export function PerformancePanel({ employeeId }: { employeeId: string }) {
  const { canManageMembers, isAudioManager } = useAuth()
  const [stars, setStars] = useState<PerformanceStar[] | null>(null)
  const [penalties, setPenalties] = useState<PolicyPenalty[] | null>(null)
  const [policyItems, setPolicyItems] = useState<PolicyItem[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    Promise.all([fetchStars(employeeId), fetchPenalties(employeeId), fetchPolicyItems()])
      .then(([s, p, pi]) => {
        setStars(s)
        setPenalties(p)
        setPolicyItems(pi)
      })
      .catch((e: Error) => setError(e.message))
  }, [employeeId])

  useEffect(() => {
    if (canManageMembers) reload()
  }, [canManageMembers, reload])

  if (!canManageMembers) return null
  if (error) return <p className="error-text">{error}</p>
  if (!stars || !penalties) return <div className="page-message">Loading performance…</div>

  async function run(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
      reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const offenseItems = policyItems.filter((p) => p.kind === 'offense')
  const terminationItems = policyItems.filter((p) => p.kind === 'termination')

  return (
    <section className="card stack">
      <h2>Performance</h2>

      <div>
        <h3>Stars</h3>
        {STAR_METRICS.map((metric) => {
          const forMetric = stars.filter((s) => s.metric === metric)
          const awarded = forMetric.filter((s) => s.status === 'awarded')
          const nominated = forMetric.filter((s) => s.status === 'nominated')
          return (
            <MetricRow
              key={metric}
              metric={metric}
              awarded={awarded}
              nominated={nominated}
              isAudioManager={isAudioManager}
              onAward={(note) => run(() => addStar(employeeId, metric, note, 'awarded'))}
              onNominate={(note) => run(() => addStar(employeeId, metric, note, 'nominated'))}
              onApprove={(id) => run(() => approveStar(id))}
              onDelete={(id) => run(() => deleteStar(id))}
            />
          )
        })}
      </div>

      <div>
        <h3>Audio crew policy penalties</h3>
        {penalties.length === 0 && <p className="muted">No penalties.</p>}
        {penalties.map((pen) => {
          const item = policyItems.find((i) => i.id === pen.policy_item_id)
          return (
            <div key={pen.id} className="item-row">
              <div className="item-main">
                <span>{item?.label ?? '(removed offense)'}</span>
                {pen.note && <span className="muted item-description">— {pen.note}</span>}
              </div>
              {isAudioManager && (
                <button className="chip-button chip-button-danger" onClick={() => run(() => deletePenalty(pen.id))}>
                  ✕
                </button>
              )}
            </div>
          )
        })}
        {isAudioManager && offenseItems.length > 0 && (
          <AddPenalty items={offenseItems} onAdd={(itemId, note) => run(() => addPenalty(employeeId, itemId, note))} />
        )}
      </div>

      {terminationItems.length > 0 && (
        <div>
          <h3>Termination reasons</h3>
          <ul className="muted">
            {terminationItems.map((t) => (
              <li key={t.id}>{t.label}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function MetricRow({
  metric,
  awarded,
  nominated,
  isAudioManager,
  onAward,
  onNominate,
  onApprove,
  onDelete,
}: {
  metric: string
  awarded: PerformanceStar[]
  nominated: PerformanceStar[]
  isAudioManager: boolean
  onAward: (note: string) => void
  onNominate: (note: string) => void
  onApprove: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [note, setNote] = useState('')
  const full = awarded.length >= MAX_STARS_PER_METRIC
  const stars = '★'.repeat(awarded.length) + '☆'.repeat(Math.max(0, MAX_STARS_PER_METRIC - awarded.length))

  function submit(fn: (n: string) => void) {
    fn(note.trim())
    setNote('')
  }

  return (
    <div className="metric-row">
      <div className="metric-head">
        <span className="metric-name">{metric}</span>
        <span className="metric-stars">{stars}</span>
        <span className="muted">
          {awarded.length}/{MAX_STARS_PER_METRIC}
        </span>
      </div>
      {[...awarded, ...nominated].map((s) => (
        <div key={s.id} className="star-line">
          <span>{s.status === 'awarded' ? '★' : '☆ (nominated)'}</span>
          {s.note && <span className="muted"> — {s.note}</span>}
          {isAudioManager && s.status === 'nominated' && (
            <button className="chip-button chip-button-primary" onClick={() => onApprove(s.id)}>
              Approve
            </button>
          )}
          <button className="chip-button chip-button-danger" onClick={() => onDelete(s.id)}>
            ✕
          </button>
        </div>
      ))}
      <div className="row-actions">
        <input
          type="text"
          placeholder="Note for this star"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: '1 1 12rem' }}
        />
        {isAudioManager ? (
          <button className="chip-button chip-button-primary" disabled={full} onClick={() => submit(onAward)}>
            {full ? 'Max 5' : 'Award ★'}
          </button>
        ) : (
          <button className="chip-button" onClick={() => submit(onNominate)}>
            Nominate
          </button>
        )}
      </div>
    </div>
  )
}

function AddPenalty({
  items,
  onAdd,
}: {
  items: PolicyItem[]
  onAdd: (itemId: string, note: string) => void
}) {
  const [itemId, setItemId] = useState(items[0]?.id ?? '')
  const [note, setNote] = useState('')
  return (
    <div className="row-actions" style={{ marginTop: '0.5rem' }}>
      <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ flex: '1 1 16rem' }}>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ flex: '1 1 8rem' }}
      />
      <button
        className="button-secondary"
        onClick={() => {
          if (itemId) {
            onAdd(itemId, note.trim())
            setNote('')
          }
        }}
      >
        + Add penalty
      </button>
    </div>
  )
}
