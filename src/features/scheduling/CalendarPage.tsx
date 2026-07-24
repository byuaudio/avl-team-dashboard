import { useCallback, useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import {
  bookSlot,
  fetchAvailability,
  fetchAvailabilityCounts,
  fetchMyBookings,
  fetchTeamRoster,
  setCalendarColor,
} from '../../lib/api'
import type { Availability, Booking, Profile } from '../../lib/types'
import { ROLE_RANK } from '../../lib/types'
import { bookingTitle, fmtDateLong, fmtTime } from '../../lib/scheduling'
import { useAuth } from '../auth/AuthContext'

interface CalEvent {
  id: string
  title: string
  start: string
  end: string
  backgroundColor: string
  borderColor: string
  textColor: string
  extendedProps: { kind: 'availability' | 'booking'; availability?: Availability }
}

/** Darken a #rrggbb hex by `amt` (0–1). */
function darken(hex: string, amt = 0.25): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.round(((n >> 16) & 255) * (1 - amt))
  const g = Math.round(((n >> 8) & 255) * (1 - amt))
  const b = Math.round((n & 255) * (1 - amt))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function CalendarPage() {
  const { profile, canGrantPassoffs } = useAuth()
  const [roster, setRoster] = useState<Profile[]>([])
  const [avail, setAvail] = useState<Availability[]>([])
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [selectedTrainers, setSelectedTrainers] = useState<Set<string> | null>(null)
  const [methodFilter, setMethodFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<Availability | null>(null)
  const [color, setColor] = useState(profile?.calendar_color ?? '#2E5D8A')

  useEffect(() => {
    fetchTeamRoster().then(setRoster).catch((e: Error) => setError(e.message))
  }, [])

  const load = useCallback((from: string, to: string) => {
    Promise.all([fetchAvailability(from, to), fetchAvailabilityCounts(from, to), fetchMyBookings()])
      .then(([a, c, b]) => {
        setAvail(a)
        setCounts(new Map(c.map((x) => [`${x.availability_id}:${x.start_at}`, x.taken])))
        setBookings(b)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (range) load(range.from, range.to)
  }, [range, load])

  const trainers = useMemo(
    () => roster.filter((p) => ROLE_RANK[p.role] >= 40 && p.is_active && !p.archived),
    [roster],
  )
  const colorOf = useCallback(
    (id: string) => roster.find((p) => p.id === id)?.calendar_color ?? '#2E5D8A',
    [roster],
  )
  const nameOf = (id: string) => roster.find((p) => p.id === id)?.full_name ?? '—'

  // Default: all trainers selected once roster loads.
  useEffect(() => {
    if (selectedTrainers === null && trainers.length) {
      setSelectedTrainers(new Set(trainers.map((t) => t.id)))
    }
  }, [trainers, selectedTrainers])

  const events = useMemo<CalEvent[]>(() => {
    const sel = selectedTrainers ?? new Set(trainers.map((t) => t.id))
    const out: CalEvent[] = []
    for (const a of avail) {
      if (!sel.has(a.trainer_id)) continue
      if (methodFilter !== 'all' && a.method !== methodFilter) continue
      if (a.kind === 'blackout') {
        out.push({
          id: `a-${a.id}`,
          title: 'Blocked',
          start: a.start_at,
          end: a.end_at,
          backgroundColor: '#c9ced6',
          borderColor: '#b4bac4',
          textColor: '#333',
          extendedProps: { kind: 'availability', availability: a },
        })
      } else {
        out.push({
          id: `a-${a.id}`,
          title: `${a.event_type} · ${nameOf(a.trainer_id)}`,
          start: a.start_at,
          end: a.end_at,
          backgroundColor: colorOf(a.trainer_id),
          borderColor: colorOf(a.trainer_id),
          textColor: '#fff',
          extendedProps: { kind: 'availability', availability: a },
        })
      }
    }
    for (const b of bookings) {
      if (b.status === 'cancelled' || b.status === 'declined') continue
      out.push({
        id: `b-${b.id}`,
        title: `${bookingTitle(b)} (${b.status})`,
        start: b.start_at,
        end: b.end_at,
        backgroundColor: darken(colorOf(b.trainer_id)),
        borderColor: darken(colorOf(b.trainer_id)),
        textColor: '#fff',
        extendedProps: { kind: 'booking' },
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avail, bookings, selectedTrainers, methodFilter, trainers, roster])

  const methods = useMemo(() => {
    const s = new Set<string>()
    for (const a of avail) if (a.method) s.add(a.method)
    return [...s]
  }, [avail])

  function onEventClick(arg: { event: { extendedProps: Record<string, unknown> } }) {
    const kind = arg.event.extendedProps.kind as string
    if (kind === 'availability') {
      const a = arg.event.extendedProps.availability as Availability
      if (a.kind === 'open') setBooking(a)
    } else {
      window.location.hash = '#/sessions'
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Training Calendar</h1>
        {canGrantPassoffs && (
          <label className="row-actions" style={{ alignItems: 'center' }}>
            My color:
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value)
                setCalendarColor(e.target.value).catch((err: Error) => setError(err.message))
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}

      <section className="card">
        <div className="legend">
          {trainers.map((t) => {
            const on = (selectedTrainers ?? new Set()).has(t.id)
            return (
              <button
                key={t.id}
                className={`legend-item${on ? '' : ' legend-off'}`}
                onClick={() =>
                  setSelectedTrainers((prev) => {
                    const next = new Set(prev ?? trainers.map((x) => x.id))
                    if (next.has(t.id)) next.delete(t.id)
                    else next.add(t.id)
                    return next
                  })
                }
              >
                <span className="legend-swatch" style={{ background: t.calendar_color }} />
                {t.full_name}
              </button>
            )
          })}
          {methods.length > 0 && (
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
              <option value="all">All methods</option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="calendar-wrap">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            events={events}
            eventClick={onEventClick}
            datesSet={(info) =>
              setRange({ from: info.start.toISOString(), to: info.end.toISOString() })
            }
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            allDaySlot={false}
            nowIndicator
            height="auto"
            expandRows
          />
        </div>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Click an availability block to book a time. Trainers: set your hours on “My Availability”
          (drag-to-create on the calendar is coming next).
        </p>
      </section>

      {booking && (
        <BookPopover
          block={booking}
          trainerName={nameOf(booking.trainer_id)}
          counts={counts}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null)
            if (range) load(range.from, range.to)
          }}
        />
      )}
    </div>
  )
}

function BookPopover({
  block,
  trainerName,
  counts,
  onClose,
  onBooked,
}: {
  block: Availability
  trainerName: string
  counts: Map<string, number>
  onClose: () => void
  onBooked: () => void
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Build sub-slots from the block.
  const slots = useMemo(() => {
    const out: { start: Date; remaining: number }[] = []
    const start = new Date(block.start_at)
    const end = new Date(block.end_at)
    const now = Date.now()
    for (let t = start.getTime(); t + block.booking_minutes * 60000 <= end.getTime(); t += block.booking_minutes * 60000) {
      const s = new Date(t)
      if (s.getTime() < now) continue
      const taken = counts.get(`${block.id}:${s.toISOString()}`) ?? 0
      out.push({ start: s, remaining: block.capacity - taken })
    }
    return out
  }, [block, counts])

  async function schedule() {
    if (!chosen) return
    setSubmitting(true)
    setError(null)
    try {
      await bookSlot({ availabilityId: block.id, start: chosen, topic, description })
      onBooked()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const dirty = topic !== '' || description !== '' || chosen !== null
  function close() {
    if (dirty && !window.confirm('Discard this booking?')) return
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="popover card" onClick={(e) => e.stopPropagation()}>
        <h2>{block.event_type}</h2>
        <div className="popover-row muted">👤 {trainerName}</div>
        <div className="popover-row muted">🗓️ {fmtDateLong(new Date(block.start_at))}</div>
        {block.method && <div className="popover-row muted">📍 {block.method}</div>}
        {block.capacity > 1 && (
          <div className="popover-row muted">👥 Group · up to {block.capacity}</div>
        )}

        <div>
          <p className="muted" style={{ margin: '0 0 0.3rem' }}>Pick a time:</p>
          <div className="slot-grid">
            {slots.map((s) => {
              const iso = s.start.toISOString()
              return (
                <button
                  key={iso}
                  disabled={s.remaining <= 0}
                  className={`slot-btn${chosen === iso ? ' slot-btn-on' : ''}`}
                  onClick={() => setChosen(iso)}
                >
                  {fmtTime(s.start)}
                  {block.capacity > 1 && <span className="slot-trainer">{s.remaining} left</span>}
                </button>
              )
            })}
            {slots.length === 0 && <p className="muted">No upcoming times in this block.</p>}
          </div>
        </div>

        <input
          className="popover-title"
          placeholder="Training topic (optional)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <textarea
          className="popover-desc"
          rows={2}
          placeholder="Anything you'd like your trainer to know? (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p className="error-text">{error}</p>}
        <div className="popover-actions">
          <button className="button-primary" onClick={schedule} disabled={!chosen || submitting}>
            {submitting ? 'Scheduling…' : 'Schedule Meeting'}
          </button>
          <button className="button-secondary" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
