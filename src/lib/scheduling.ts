// Slot generation and calendar-export helpers for the booking flow.
// All times are handled in the viewer's local timezone.

import type { AvailabilityBlock, AvailabilityRule, Booking } from './types'

export interface BusyInterval {
  trainer_id: string
  start_at: string
  end_at: string
}

export interface Slot {
  trainerId: string
  start: Date
  end: Date
}

const toMin = (t: string) => {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m)
}

/** Local YYYY-MM-DD for a Date. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function overlaps(aS: number, aE: number, bS: number, bE: number) {
  return aS < bE && aE > bS
}

/** Available slots for one trainer on one calendar day. */
export function slotsForDay(
  day: Date,
  trainerId: string,
  rules: AvailabilityRule[],
  blocks: AvailabilityBlock[],
  busy: BusyInterval[],
): Slot[] {
  const weekday = day.getDay()
  const dayIso = isoDate(day)
  const now = Date.now()

  const open: { s: number; e: number; slot: number }[] = []
  for (const r of rules) {
    if (r.trainer_id === trainerId && r.weekday === weekday) {
      open.push({ s: toMin(r.start_time), e: toMin(r.end_time), slot: r.slot_minutes })
    }
  }
  for (const b of blocks) {
    if (b.trainer_id === trainerId && b.on_date === dayIso && b.kind === 'open') {
      open.push({ s: toMin(b.start_time), e: toMin(b.end_time), slot: b.slot_minutes })
    }
  }
  const blackout = blocks
    .filter((b) => b.trainer_id === trainerId && b.on_date === dayIso && b.kind === 'blackout')
    .map((b) => ({ s: toMin(b.start_time), e: toMin(b.end_time) }))

  const busyMin = busy
    .filter((b) => b.trainer_id === trainerId)
    .map((b) => {
      const s = new Date(b.start_at)
      const e = new Date(b.end_at)
      return { s: s.getHours() * 60 + s.getMinutes(), e: e.getHours() * 60 + e.getMinutes(), day: isoDate(s) }
    })
    .filter((b) => b.day === dayIso)

  const seen = new Set<number>()
  const slots: Slot[] = []
  for (const iv of open) {
    for (let m = iv.s; m + iv.slot <= iv.e; m += iv.slot) {
      const mEnd = m + iv.slot
      if (seen.has(m)) continue
      if (blackout.some((bl) => overlaps(m, mEnd, bl.s, bl.e))) continue
      if (busyMin.some((bz) => overlaps(m, mEnd, bz.s, bz.e))) continue
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60)
      if (start.getTime() < now) continue
      seen.add(m)
      slots.push({
        trainerId,
        start,
        end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(mEnd / 60), mEnd % 60),
      })
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** The next `count` days starting today. */
export function upcomingDays(count: number): Date[] {
  const out: Date[] = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  for (let i = 0; i < count; i++) {
    out.push(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i))
  }
  return out
}

// --- Formatting ------------------------------------------------------------

export const fmtDateLong = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
export const fmtDateShort = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
export const fmtTime = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export const bookingTitle = (b: Pick<Booking, 'topic'>) => b.topic?.trim() || 'One-on-One Training'

// --- Calendar export -------------------------------------------------------

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function googleCalUrl(b: Booking, trainerName: string): string {
  const start = new Date(b.start_at)
  const end = new Date(b.end_at)
  const text = `${bookingTitle(b)} with ${trainerName}`
  const details = [b.description, b.method ? `Method: ${b.method}` : '']
    .filter(Boolean)
    .join('\n')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function downloadIcs(b: Booking, trainerName: string): void {
  const start = new Date(b.start_at)
  const end = new Date(b.end_at)
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AVL Dashboard//Training//EN',
    'BEGIN:VEVENT',
    `UID:${b.id}@avl-dashboard`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${bookingTitle(b)} with ${trainerName}`,
    `DESCRIPTION:${(b.description || '').replace(/\n/g, '\\n')}${b.method ? `\\nMethod: ${b.method}` : ''}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `training-${isoDate(start)}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
