/**
 * Local-date helpers.
 *
 * Design rule: a calendar day is always treated as exactly 1440 minutes.
 * All arithmetic goes through `dayIndex` (days since 1970-01-01, computed with
 * Date.UTC) so a daylight-saving change can never move a session by an hour.
 * The only place the real clock is read is `momentFromDate`, which uses the
 * device's *local* date parts.
 */
import type { DateKey } from '../types'

export const MIN_PER_DAY = 1440

export interface LocalMoment {
  date: DateKey
  /** Minutes since local midnight, 0..1439 */
  minute: number
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidDateKey(k: unknown): k is DateKey {
  if (typeof k !== 'string') return false
  const m = DATE_RE.exec(k)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

export function dayIndex(k: DateKey): number {
  const m = DATE_RE.exec(k)
  if (!m) throw new Error(`Invalid date key: ${String(k)}`)
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

export function fromDayIndex(i: number): DateKey {
  const t = new Date(i * 86_400_000)
  const y = t.getUTCFullYear()
  const m = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d = String(t.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(k: DateKey, n: number): DateKey {
  return fromDayIndex(dayIndex(k) + n)
}

/** Whole calendar days from a to b (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  return dayIndex(b) - dayIndex(a)
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(k: DateKey): number {
  return new Date(dayIndex(k) * 86_400_000).getUTCDay()
}

export function toAbs(date: DateKey, minute: number): number {
  return dayIndex(date) * MIN_PER_DAY + minute
}

export function momentToAbs(m: LocalMoment): number {
  return toAbs(m.date, m.minute)
}

export function fromAbs(abs: number): LocalMoment {
  const day = Math.floor(abs / MIN_PER_DAY)
  return { date: fromDayIndex(day), minute: Math.round(abs - day * MIN_PER_DAY) }
}

/** Reads the device's local date parts. */
export function momentFromDate(d: Date): LocalMoment {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return { date: `${y}-${mo}-${da}`, minute: d.getHours() * 60 + d.getMinutes() }
}

export function nowMoment(): LocalMoment {
  return momentFromDate(new Date())
}

/** Elapsed fractional days from abs minute a to b. */
export function daysBetweenAbs(a: number, b: number): number {
  return (b - a) / MIN_PER_DAY
}

// ---- formatting (display only) -------------------------------------------------

export function formatClock(minute: number): string {
  const m = ((Math.round(minute) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY
  const h24 = Math.floor(m / 60)
  const mm = m % 60
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`
}

/** "HH:MM" for <input type="time"> */
export function minutesToInput(minute: number): string {
  const m = Math.max(0, Math.min(MIN_PER_DAY - 1, Math.round(minute)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function inputToMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h > 23 || mm > 59) return null
  return h * 60 + mm
}

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const weekdayShort = (i: number) => WEEKDAYS_SHORT[i]
export const weekdayLong = (i: number) => WEEKDAYS_LONG[i]

export function formatDateShort(k: DateKey): string {
  const [, m, d] = k.split('-').map(Number)
  return `${MONTHS_SHORT[m - 1]} ${d}`
}

/** "Monday, October 19" */
export function formatDateLong(k: DateKey): string {
  const [, m, d] = k.split('-').map(Number)
  return `${WEEKDAYS_LONG[weekdayOf(k)]}, ${MONTHS_LONG[m - 1]} ${d}`
}

export function formatDateWithWeekday(k: DateKey): string {
  return `${WEEKDAYS_SHORT[weekdayOf(k)]}, ${formatDateShort(k)}`
}

/** "today", "tomorrow", "Wednesday", or "Oct 29" relative to `today`. */
export function relativeDay(k: DateKey, today: DateKey): string {
  const diff = diffDays(today, k)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  if (diff > 1 && diff < 7) return WEEKDAYS_LONG[weekdayOf(k)]
  return formatDateShort(k)
}

/** "tomorrow at 3:30 PM" */
export function relativeWhen(k: DateKey, minute: number, today: DateKey): string {
  return `${relativeDay(k, today)} at ${formatClock(minute)}`
}

export function formatMinutes(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}
