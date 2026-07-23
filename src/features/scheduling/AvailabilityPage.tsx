import { useCallback, useEffect, useState } from 'react'
import {
  addAvailabilityBlock,
  addAvailabilityRule,
  deleteAvailabilityBlock,
  deleteAvailabilityRule,
  fetchAvailabilityBlocks,
  fetchAvailabilityRules,
  setMeetingMethods,
} from '../../lib/api'
import type { AvailabilityBlock, AvailabilityRule } from '../../lib/types'
import { MEETING_METHODS, WEEKDAYS } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

/** Trainer sets their availability: a recurring weekly pattern plus one-off
 *  open blocks and blackout (time-off) exceptions. */
export function AvailabilityPage() {
  const { profile, canGrantPassoffs } = useAuth()
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null)
  const [blocks, setBlocks] = useState<AvailabilityBlock[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trainerId = profile?.id ?? ''
  const reload = useCallback(() => {
    if (!trainerId) return
    Promise.all([fetchAvailabilityRules(trainerId), fetchAvailabilityBlocks(trainerId)])
      .then(([r, b]) => {
        setRules(r)
        setBlocks(b)
      })
      .catch((e: Error) => setError(e.message))
  }, [trainerId])

  useEffect(() => {
    if (canGrantPassoffs) reload()
  }, [canGrantPassoffs, reload])

  // Recurring form
  const [weekday, setWeekday] = useState(1)
  const [rStart, setRStart] = useState('14:00')
  const [rEnd, setREnd] = useState('17:00')
  const [rSlot, setRSlot] = useState(30)
  // One-off form
  const [date, setDate] = useState('')
  const [bStart, setBStart] = useState('14:00')
  const [bEnd, setBEnd] = useState('17:00')
  const [bSlot, setBSlot] = useState(30)
  const [bKind, setBKind] = useState<'open' | 'blackout'>('open')
  // Meeting methods (from own profile)
  const [methods, setMethods] = useState<string[]>(profile?.meeting_methods ?? [])
  const [methodsSaved, setMethodsSaved] = useState(false)

  if (!canGrantPassoffs) return <p className="page-message">Availability is for trainers.</p>
  if (error) return <p className="error-text">{error}</p>
  if (!rules || !blocks) return <div className="page-message">Loading…</div>

  async function run(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
      reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="stack">
      <h1>My Availability</h1>
      <p className="muted">
        Set a repeating weekly pattern, plus one-off open times or blackout (time-off) days.
        Students book fixed-length slots within your open times.
      </p>

      <section className="card stack">
        <h2>Meeting methods you offer</h2>
        <div className="chip-row">
          {MEETING_METHODS.map((m) => {
            const on = methods.includes(m)
            return (
              <button
                key={m}
                className={`filter-chip${on ? ' filter-chip-on' : ''}`}
                onClick={() => {
                  setMethodsSaved(false)
                  setMethods((prev) => (on ? prev.filter((x) => x !== m) : [...prev, m]))
                }}
              >
                {m}
              </button>
            )
          })}
        </div>
        <div className="row-actions">
          <button
            className="button-secondary"
            onClick={() => run(async () => { await setMeetingMethods(methods); setMethodsSaved(true) })}
          >
            Save methods
          </button>
          {methodsSaved && <span className="success-text">Saved.</span>}
        </div>
      </section>

      <section className="card stack">
        <h2>Weekly pattern</h2>
        {rules.length === 0 && <p className="muted">No recurring availability yet.</p>}
        {rules.map((r) => (
          <div key={r.id} className="row-actions">
            <span style={{ flex: '1 1 auto' }}>
              <strong>{WEEKDAYS[r.weekday]}</strong> {r.start_time}–{r.end_time} · {r.slot_minutes}-min slots
            </span>
            <button className="chip-button chip-button-danger" onClick={() => run(() => deleteAvailabilityRule(r.id))}>
              ✕
            </button>
          </div>
        ))}
        <div className="row-actions">
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <input type="time" value={rStart} onChange={(e) => setRStart(e.target.value)} />
          <span>to</span>
          <input type="time" value={rEnd} onChange={(e) => setREnd(e.target.value)} />
          <SlotSelect value={rSlot} onChange={setRSlot} />
          <button
            className="button-secondary"
            onClick={() =>
              run(() =>
                addAvailabilityRule({
                  trainer_id: trainerId,
                  weekday,
                  start_time: rStart,
                  end_time: rEnd,
                  slot_minutes: rSlot,
                }),
              )
            }
          >
            + Add
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>One-off dates</h2>
        {blocks.length === 0 && <p className="muted">No one-off entries.</p>}
        {blocks.map((b) => (
          <div key={b.id} className="row-actions">
            <span style={{ flex: '1 1 auto' }}>
              <strong>{b.on_date}</strong> {b.start_time}–{b.end_time} ·{' '}
              {b.kind === 'blackout' ? (
                <span style={{ color: '#b3261e' }}>blackout (unavailable)</span>
              ) : (
                <>open · {b.slot_minutes}-min slots</>
              )}
            </span>
            <button className="chip-button chip-button-danger" onClick={() => run(() => deleteAvailabilityBlock(b.id))}>
              ✕
            </button>
          </div>
        ))}
        <div className="row-actions">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" value={bStart} onChange={(e) => setBStart(e.target.value)} />
          <span>to</span>
          <input type="time" value={bEnd} onChange={(e) => setBEnd(e.target.value)} />
          <SlotSelect value={bSlot} onChange={setBSlot} />
          <select value={bKind} onChange={(e) => setBKind(e.target.value as 'open' | 'blackout')}>
            <option value="open">Open</option>
            <option value="blackout">Blackout</option>
          </select>
          <button
            className="button-secondary"
            disabled={!date}
            onClick={() =>
              run(() =>
                addAvailabilityBlock({
                  trainer_id: trainerId,
                  on_date: date,
                  start_time: bStart,
                  end_time: bEnd,
                  slot_minutes: bSlot,
                  kind: bKind,
                }),
              )
            }
          >
            + Add
          </button>
        </div>
      </section>
    </div>
  )
}

function SlotSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} title="Slot length">
      {[15, 30, 45, 60, 90].map((m) => (
        <option key={m} value={m}>
          {m} min
        </option>
      ))}
    </select>
  )
}
