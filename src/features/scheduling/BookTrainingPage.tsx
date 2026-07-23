import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAllAvailabilityBlocks,
  fetchAllAvailabilityRules,
  fetchTeamRoster,
  fetchTrainerBusy,
  requestBooking,
} from '../../lib/api'
import type { AvailabilityBlock, AvailabilityRule, Profile } from '../../lib/types'
import { ROLE_LABELS, ROLE_RANK } from '../../lib/types'
import {
  fmtDateLong,
  fmtDateShort,
  fmtTime,
  slotsForDay,
  upcomingDays,
  type BusyInterval,
  type Slot,
} from '../../lib/scheduling'

const DAYS_AHEAD = 21
const initials = (name: string) =>
  name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

interface Draft {
  slot: Slot
  trainer: Profile
  topic: string
  method: string
  description: string
}

export function BookTrainingPage() {
  const [roster, setRoster] = useState<Profile[] | null>(null)
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([])
  const [busy, setBusy] = useState<BusyInterval[]>([])
  const [error, setError] = useState<string | null>(null)

  const [trainerFilter, setTrainerFilter] = useState<string>('any')
  const [dayIdx, setDayIdx] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [booked, setBooked] = useState<string | null>(null)

  function loadBusy() {
    const days = upcomingDays(DAYS_AHEAD)
    const from = days[0].toISOString()
    const to = new Date(days[days.length - 1].getTime() + 86400000).toISOString()
    fetchTrainerBusy(from, to).then(setBusy).catch((e: Error) => setError(e.message))
  }
  useEffect(() => {
    Promise.all([fetchTeamRoster(), fetchAllAvailabilityRules(), fetchAllAvailabilityBlocks()])
      .then(([r, ru, bl]) => {
        setRoster(r)
        setRules(ru)
        setBlocks(bl)
      })
      .catch((e: Error) => setError(e.message))
    loadBusy()
  }, [])

  const trainers = useMemo(
    () => (roster ?? []).filter((p) => ROLE_RANK[p.role] >= 40 && p.is_active && !p.archived),
    [roster],
  )
  const days = useMemo(() => upcomingDays(DAYS_AHEAD), [])

  const slotsFor = useMemo(() => {
    return (day: Date): Slot[] => {
      const pool = trainerFilter === 'any' ? trainers : trainers.filter((t) => t.id === trainerFilter)
      return pool
        .flatMap((t) => slotsForDay(day, t.id, rules, blocks, busy))
        .sort((a, b) => a.start.getTime() - b.start.getTime())
    }
  }, [trainers, rules, blocks, busy, trainerFilter])

  if (error) return <p className="error-text">{error}</p>
  if (!roster) return <div className="page-message">Loading…</div>

  const trainerById = (id: string) => trainers.find((t) => t.id === id)
  const daySlots = slotsFor(days[dayIdx])

  function openDraft(slot: Slot) {
    const trainer = trainerById(slot.trainerId)
    if (!trainer) return
    const methods = trainer.meeting_methods ?? []
    setDraft({
      slot,
      trainer,
      topic: '',
      method: methods.length === 1 ? methods[0] : '',
      description: '',
    })
  }

  return (
    <div className="stack">
      <h1>Book Training</h1>
      {booked && (
        <p className="cleared-rate">
          Request sent! Your trainer will confirm it. See <Link to="/sessions">My Sessions</Link>.
        </p>
      )}

      <section className="card stack">
        <div>
          <h2>1 · Choose a trainer</h2>
          <div className="chip-row">
            <button
              className={`filter-chip${trainerFilter === 'any' ? ' filter-chip-on' : ''}`}
              onClick={() => setTrainerFilter('any')}
            >
              Any available trainer
            </button>
            {trainers.map((t) => (
              <button
                key={t.id}
                className={`filter-chip${trainerFilter === t.id ? ' filter-chip-on' : ''}`}
                onClick={() => setTrainerFilter(t.id)}
              >
                <span className="avatar">{initials(t.full_name)}</span>
                {t.full_name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2>2 · Pick a day</h2>
          <div className="day-strip">
            {days.map((d, i) => {
              const has = slotsFor(d).length > 0
              return (
                <button
                  key={i}
                  disabled={!has}
                  className={`day-chip${i === dayIdx ? ' day-chip-on' : ''}${has ? '' : ' day-chip-empty'}`}
                  onClick={() => setDayIdx(i)}
                >
                  {fmtDateShort(d)}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <h2>3 · Pick a time — {fmtDateLong(days[dayIdx])}</h2>
          {daySlots.length === 0 ? (
            <p className="muted">No open times this day. Try another day or trainer.</p>
          ) : (
            <div className="slot-grid">
              {daySlots.map((s, i) => {
                const t = trainerById(s.trainerId)
                return (
                  <button key={i} className="slot-btn" onClick={() => openDraft(s)}>
                    {fmtTime(s.start)}
                    {trainerFilter === 'any' && t && <span className="slot-trainer">{t.full_name}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {draft && (
        <QuickBook
          draft={draft}
          setDraft={setDraft}
          daySlots={slotsFor(draft.slot.start)}
          trainers={trainers}
          onClose={() => setDraft(null)}
          onBooked={() => {
            setDraft(null)
            setBooked('ok')
            loadBusy()
          }}
          onConflict={loadBusy}
        />
      )}
    </div>
  )
}

function QuickBook({
  draft,
  setDraft,
  daySlots,
  trainers,
  onClose,
  onBooked,
  onConflict,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  daySlots: Slot[]
  trainers: Profile[]
  onClose: () => void
  onBooked: () => void
  onConflict: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const { slot, trainer, topic, method, description } = draft
  const methods = trainer.meeting_methods ?? []

  // Times available for the chosen trainer on this day (for inline time change).
  const trainerSlots = daySlots.filter((s) => s.trainerId === trainer.id)
  const dirty = topic !== '' || description !== '' || method !== ''

  async function schedule() {
    setSubmitting(true)
    setError(null)
    try {
      await requestBooking({
        trainerId: trainer.id,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        topic,
        method: method || null,
        description,
      })
      onBooked()
    } catch (e) {
      setError((e as Error).message)
      onConflict()
    } finally {
      setSubmitting(false)
    }
  }

  function close() {
    if (dirty && !window.confirm('Discard this booking?')) return
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="popover card" onClick={(e) => e.stopPropagation()}>
        <input
          className="popover-title"
          placeholder="Training topic (optional)"
          value={topic}
          onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
          autoFocus
        />

        <div className="popover-row">
          <span className="avatar">{initials(trainer.full_name)}</span>
          <select
            value={trainer.id}
            onChange={(e) => {
              const t = trainers.find((x) => x.id === e.target.value)
              if (t) setDraft({ ...draft, trainer: t, method: (t.meeting_methods ?? []).length === 1 ? t.meeting_methods[0] : '' })
            }}
          >
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name} · {ROLE_LABELS[t.role]}
              </option>
            ))}
          </select>
        </div>

        <div className="popover-row">
          <span aria-hidden>🗓️</span>
          <span>{fmtDateLong(slot.start)}</span>
        </div>
        <div className="popover-row">
          <span aria-hidden>🕑</span>
          <select
            value={slot.start.toISOString()}
            onChange={(e) => {
              const s = trainerSlots.find((x) => x.start.toISOString() === e.target.value)
              if (s) setDraft({ ...draft, slot: s })
            }}
          >
            {trainerSlots.map((s) => (
              <option key={s.start.toISOString()} value={s.start.toISOString()}>
                {fmtTime(s.start)} – {fmtTime(s.end)}
              </option>
            ))}
          </select>
        </div>

        {methods.length > 1 && (
          <div className="popover-row">
            <span aria-hidden>📍</span>
            <select value={method} onChange={(e) => setDraft({ ...draft, method: e.target.value })}>
              <option value="">Meeting method…</option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
        {methods.length === 1 && <div className="popover-row muted">📍 {methods[0]}</div>}

        <textarea
          className="popover-desc"
          placeholder="Anything you'd like your trainer to know? (optional)"
          value={description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={more ? 4 : 2}
        />

        {more && (
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Times are shown in your local timezone. Please cancel at least a few hours ahead if your
            plans change. (Reminders and recurring sessions are coming.)
          </p>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="popover-actions">
          <button className="button-primary" onClick={schedule} disabled={submitting}>
            {submitting ? 'Scheduling…' : 'Schedule Meeting'}
          </button>
          <button className="button-secondary" onClick={close}>
            Cancel
          </button>
          <button className="chip-button" onClick={() => setMore((v) => !v)}>
            {more ? 'Fewer options' : 'More options'}
          </button>
        </div>
      </div>
    </div>
  )
}
