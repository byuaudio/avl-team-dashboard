import { useEffect, useMemo, useState } from 'react'
import {
  cancelBooking,
  decideBooking,
  deleteBookingRpc,
  fetchAllAvailabilityBlocks,
  fetchAllAvailabilityRules,
  fetchMyBookings,
  fetchTeamRoster,
  fetchTrainerBusy,
  reassignBooking,
  rescheduleBooking,
  setBookingNotes,
  setBookingOutcome,
} from '../../lib/api'
import type { AvailabilityBlock, AvailabilityRule, Booking, Profile } from '../../lib/types'
import { ROLE_LABELS, ROLE_RANK } from '../../lib/types'
import {
  bookingTitle,
  downloadIcs,
  fmtDateLong,
  fmtTime,
  googleCalUrl,
  slotsForDay,
  upcomingDays,
  type BusyInterval,
  type Slot,
} from '../../lib/scheduling'
import { useAuth } from '../auth/AuthContext'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending approval',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

export function MySessionsPage() {
  const { profile, canManageMembers, isAudioManager } = useAuth()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [roster, setRoster] = useState<Profile[]>([])
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([])
  const [busy, setBusy] = useState<BusyInterval[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Booking | null>(null)

  function reload() {
    fetchMyBookings().then(setBookings).catch((e: Error) => setError(e.message))
  }
  useEffect(() => {
    Promise.all([
      fetchMyBookings(),
      fetchTeamRoster(),
      fetchAllAvailabilityRules(),
      fetchAllAvailabilityBlocks(),
      fetchTrainerBusy(new Date().toISOString(), new Date(Date.now() + 30 * 86400000).toISOString()),
    ])
      .then(([b, r, ru, bl, bz]) => {
        setBookings(b)
        setRoster(r)
        setRules(ru)
        setBlocks(bl)
        setBusy(bz)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const nameById = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of roster) m.set(p.id, p)
    return m
  }, [roster])

  if (error) return <p className="error-text">{error}</p>
  if (!bookings || !profile) return <div className="page-message">Loading…</div>

  const me = profile.id
  const mine = bookings.filter((b) => b.student_id === me || b.trainer_id === me)
  const requests = mine.filter((b) => b.trainer_id === me && b.status === 'pending')
  const upcoming = mine
    .filter((b) => b.status !== 'cancelled' && b.status !== 'declined' && new Date(b.end_at) >= new Date())
    .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at))
  const past = mine
    .filter((b) => !(b.status !== 'cancelled' && b.status !== 'declined' && new Date(b.end_at) >= new Date()))
    .sort((a, b) => +new Date(b.start_at) - +new Date(a.start_at))

  const row = (b: Booking) => {
    const other = nameById.get(b.trainer_id === me ? b.student_id : b.trainer_id)
    return (
      <button key={b.id} className="session-row" onClick={() => setSelected(b)}>
        <span className="session-when">
          {fmtDateLong(new Date(b.start_at))} · {fmtTime(new Date(b.start_at))}
        </span>
        <span className="session-title">{bookingTitle(b)}</span>
        <span className="muted">
          {b.trainer_id === me ? 'with ' : 'trainer: '}
          {other?.full_name ?? '—'}
        </span>
        <span className={`badge badge-${b.status}`}>{STATUS_LABEL[b.status] ?? b.status}</span>
      </button>
    )
  }

  return (
    <div className="stack">
      <h1>My Sessions</h1>

      {requests.length > 0 && (
        <section className="card stack">
          <h2>Requests to approve</h2>
          {requests.map(row)}
        </section>
      )}

      <section className="card stack">
        <h2>Upcoming</h2>
        {upcoming.length === 0 ? <p className="muted">Nothing scheduled.</p> : upcoming.map(row)}
      </section>

      {past.length > 0 && (
        <details className="card">
          <summary className="tree-title">Past & cancelled</summary>
          <div className="stack" style={{ marginTop: '0.5rem' }}>{past.map(row)}</div>
        </details>
      )}

      {selected && (
        <BookingModal
          booking={selected}
          me={me}
          isStaff={canManageMembers}
          isAudioManager={isAudioManager}
          nameById={nameById}
          trainers={roster.filter((p) => ROLE_RANK[p.role] >= 40 && p.is_active && !p.archived)}
          rules={rules}
          blocks={blocks}
          busy={busy}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null)
            reload()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function BookingModal({
  booking,
  me,
  isStaff,
  isAudioManager,
  nameById,
  trainers,
  rules,
  blocks,
  busy,
  onClose,
  onChanged,
  onError,
}: {
  booking: Booking
  me: string
  isStaff: boolean
  isAudioManager: boolean
  nameById: Map<string, Profile>
  trainers: Profile[]
  rules: AvailabilityRule[]
  blocks: AvailabilityBlock[]
  busy: BusyInterval[]
  onClose: () => void
  onChanged: () => void
  onError: (m: string) => void
}) {
  const b = booking
  const isTrainer = b.trainer_id === me
  const isStudent = b.student_id === me
  const trainer = nameById.get(b.trainer_id)
  const student = nameById.get(b.student_id)
  const [mode, setMode] = useState<'view' | 'reschedule' | 'notes'>('view')
  const [notes, setNotes] = useState(b.staff_notes)

  async function run(fn: () => Promise<void>) {
    onError('')
    try {
      await fn()
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  const rescheduleSlots: Slot[] =
    mode === 'reschedule'
      ? upcomingDays(14).flatMap((d) => slotsForDay(d, b.trainer_id, rules, blocks, busy))
      : []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="popover card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{bookingTitle(b)}</h2>
          <button className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="popover-row muted">👤 Trainer: {trainer?.full_name ?? '—'} · {trainer ? ROLE_LABELS[trainer.role] : ''}</div>
        <div className="popover-row muted">🎓 Student: {student?.full_name ?? '—'}</div>
        <div className="popover-row muted">🗓️ {fmtDateLong(new Date(b.start_at))}</div>
        <div className="popover-row muted">🕑 {fmtTime(new Date(b.start_at))} – {fmtTime(new Date(b.end_at))}</div>
        {b.method && <div className="popover-row muted">📍 {b.method}</div>}
        <div className="popover-row muted">Status: {STATUS_LABEL[b.status] ?? b.status}{b.attended ? ` · ${b.attended === 'no_show' ? 'No-show' : 'Completed'}` : ''}</div>
        {b.description && <p><strong>Note:</strong> {b.description}</p>}
        {(isTrainer || isStaff) && b.staff_notes && (
          <p><strong>Staff notes:</strong> {b.staff_notes}</p>
        )}

        {mode === 'view' && (
          <div className="popover-actions" style={{ flexWrap: 'wrap' }}>
            {isTrainer && b.status === 'pending' && (
              <>
                <button className="button-primary" onClick={() => run(() => decideBooking(b.id, true))}>
                  Approve
                </button>
                <button className="button-secondary" onClick={() => run(() => decideBooking(b.id, false))}>
                  Decline
                </button>
              </>
            )}
            {b.status === 'confirmed' && (
              <>
                <a className="button-secondary" href={googleCalUrl(b, trainer?.full_name ?? 'Trainer')} target="_blank" rel="noopener">
                  Add to Google Calendar
                </a>
                <button className="button-secondary" onClick={() => downloadIcs(b, trainer?.full_name ?? 'Trainer')}>
                  Download .ics
                </button>
              </>
            )}
            {(isStudent || isTrainer) && b.status !== 'cancelled' && (
              <>
                <button className="chip-button" onClick={() => setMode('reschedule')}>Reschedule</button>
                <button className="chip-button chip-button-danger" onClick={() => run(() => cancelBooking(b.id))}>
                  Cancel
                </button>
              </>
            )}
            {(isTrainer || isStaff) && (
              <>
                <button className="chip-button" onClick={() => run(() => setBookingOutcome(b.id, 'completed'))}>
                  Mark completed
                </button>
                <button className="chip-button" onClick={() => run(() => setBookingOutcome(b.id, 'no_show'))}>
                  No-show
                </button>
                <button className="chip-button" onClick={() => setMode('notes')}>Add notes</button>
              </>
            )}
            {isAudioManager && (
              <>
                <select
                  className="chip-button"
                  defaultValue=""
                  onChange={(e) => e.target.value && run(() => reassignBooking(b.id, e.target.value))}
                >
                  <option value="">Reassign to…</option>
                  {trainers.filter((t) => t.id !== b.trainer_id).map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
                <button className="chip-button chip-button-danger" onClick={() => run(() => deleteBookingRpc(b.id))}>
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {mode === 'notes' && (
          <div className="stack">
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Staff notes…" />
            <div className="popover-actions">
              <button className="button-primary" onClick={() => run(() => setBookingNotes(b.id, notes))}>Save notes</button>
              <button className="button-secondary" onClick={() => setMode('view')}>Back</button>
            </div>
          </div>
        )}

        {mode === 'reschedule' && (
          <div className="stack">
            <p className="muted">Pick a new time:</p>
            <div className="slot-grid" style={{ maxHeight: '16rem', overflowY: 'auto' }}>
              {rescheduleSlots.map((s, i) => (
                <button
                  key={i}
                  className="slot-btn"
                  onClick={() => run(() => rescheduleBooking(b.id, s.start.toISOString(), s.end.toISOString()))}
                >
                  {fmtDateLong(s.start).replace(/,.*/, '')} {fmtTime(s.start)}
                </button>
              ))}
              {rescheduleSlots.length === 0 && <p className="muted">No open times.</p>}
            </div>
            <button className="button-secondary" onClick={() => setMode('view')}>Back</button>
          </div>
        )}
      </div>
    </div>
  )
}
