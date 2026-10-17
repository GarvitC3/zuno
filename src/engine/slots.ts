/**
 * Availability → free time.
 *
 * free(day) = study windows(day) − commitments(day) − existing sessions(day)
 *
 * All intervals are half-open [start, end) in minutes since local midnight.
 */
import type { Availability, Commitment, DateKey, Session } from '../types'
import { ENGINE as E } from './config'
import { addDays, formatClock, fromAbs, MIN_PER_DAY, toAbs, weekdayOf } from './time'

export interface Interval {
  start: number
  end: number
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.end > i.start)
    .map((i) => ({ ...i }))
    .sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else out.push(i)
  }
  return out
}

export function subtractIntervals(from: Interval[], remove: Interval[]): Interval[] {
  const cuts = mergeIntervals(remove)
  const result: Interval[] = []
  for (const f of from) {
    let pieces: Interval[] = [{ ...f }]
    for (const c of cuts) {
      const next: Interval[] = []
      for (const p of pieces) {
        if (c.end <= p.start || c.start >= p.end) {
          next.push(p)
          continue
        }
        if (c.start > p.start) next.push({ start: p.start, end: c.start })
        if (c.end < p.end) next.push({ start: c.end, end: p.end })
      }
      pieces = next
    }
    result.push(...pieces)
  }
  return result
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

/** Study windows that apply on `date` (recurring + one-off extra, minus blocked days). */
export function windowsOn(av: Availability, date: DateKey): Interval[] {
  if (av.blockedDates.includes(date)) return []
  const wd = weekdayOf(date)
  const list: Interval[] = []
  for (const w of av.windows) {
    if (w.days.includes(wd) && w.endMin > w.startMin) list.push({ start: w.startMin, end: w.endMin })
  }
  for (const x of av.extraWindows) {
    if (x.date === date && x.endMin > x.startMin) list.push({ start: x.startMin, end: x.endMin })
  }
  return mergeIntervals(list)
}

export interface LabelledInterval extends Interval {
  label: string
  kind: Commitment['kind']
  id: string
}

/** Commitment blocks on `date`, including overnight spill from the previous day. */
export function commitmentBlocksOn(av: Availability, date: DateKey): LabelledInterval[] {
  const wd = weekdayOf(date)
  const prev = addDays(date, -1)
  const prevWd = weekdayOf(prev)
  const out: LabelledInterval[] = []
  for (const c of av.commitments) {
    const overnight = c.endMin <= c.startMin
    const mk = (start: number, end: number): LabelledInterval => ({
      start,
      end,
      label: c.label,
      kind: c.kind,
      id: c.id,
    })
    if (c.onDate) {
      if (c.onDate === date) out.push(mk(c.startMin, overnight ? MIN_PER_DAY : c.endMin))
      if (overnight && c.onDate === prev) out.push(mk(0, c.endMin))
    } else {
      if (c.days.includes(wd)) out.push(mk(c.startMin, overnight ? MIN_PER_DAY : c.endMin))
      if (overnight && c.days.includes(prevWd)) out.push(mk(0, c.endMin))
    }
  }
  return out.filter((b) => b.end > b.start).sort((a, b) => a.start - b.start)
}

export function commitmentsOn(av: Availability, date: DateKey): Interval[] {
  return mergeIntervals(commitmentBlocksOn(av, date))
}

// ---- Sessions as intervals -----------------------------------------------------

export interface SessionSpan {
  date: DateKey
  start: number
  end: number
}

/** Where a session actually sits: the real time if it was done, otherwise its slot. */
export function sessionSpan(s: Session): SessionSpan {
  if ((s.status === 'completed' || s.status === 'partial') && s.actual) {
    const m = fromAbs(s.actual.startAbs)
    const end = Math.min(MIN_PER_DAY, m.minute + Math.max(1, Math.round(s.actual.minutes)))
    return { date: m.date, start: m.minute, end }
  }
  return { date: s.date, start: s.startMin, end: s.startMin + s.durationMin }
}

/** Minutes a session contributes to the day's study total. */
export function sessionMinutes(s: Session): number {
  if (s.status === 'skipped') return 0
  if ((s.status === 'completed' || s.status === 'partial') && s.actual) return Math.round(s.actual.minutes)
  return s.durationMin
}

/** Busy time from sessions on `date`. Non-skipped sessions are padded by the break length. */
export function sessionBusyOn(sessions: readonly Session[], date: DateKey, breakMin: number): Interval[] {
  const out: Interval[] = []
  for (const s of sessions) {
    const span = sessionSpan(s)
    if (span.date !== date) continue
    const pad = s.status === 'skipped' ? 0 : breakMin
    out.push({ start: span.start - pad, end: span.end + pad })
  }
  return out
}

/** Round up to the slot grid. */
export const ceilToGrid = (m: number) => Math.ceil(m / E.SLOT_GRID_MIN) * E.SLOT_GRID_MIN
export const floorToGrid = (m: number) => Math.floor(m / E.SLOT_GRID_MIN) * E.SLOT_GRID_MIN

/**
 * Free, usable intervals on `date`: long enough to hold a minimum session and
 * aligned to the slot grid. `earliest` clips today's already-gone time.
 */
export function freeIntervalsOn(
  av: Availability,
  date: DateKey,
  sessions: readonly Session[],
  earliest = 0,
): Interval[] {
  const wins = windowsOn(av, date)
  if (wins.length === 0) return []
  const free = subtractIntervals(
    subtractIntervals(wins, commitmentsOn(av, date)),
    sessionBusyOn(sessions, date, av.breakMin),
  )
  return free
    .map((i) => ({ start: ceilToGrid(Math.max(i.start, earliest)), end: floorToGrid(i.end) }))
    .filter((i) => i.end - i.start >= E.MIN_SESSION_MIN)
}

/** Total study capacity (minutes) of the windows on a date, ignoring sessions. */
export function windowCapacityOn(av: Availability, date: DateKey): number {
  const free = subtractIntervals(windowsOn(av, date), commitmentsOn(av, date))
  return free.reduce((sum, i) => sum + (i.end - i.start), 0)
}

// ---- Placement validation (manual changes) ---------------------------------------

export interface PlacementCheck {
  ok: boolean
  /** Which field the message belongs beside. */
  field?: 'date' | 'time' | 'duration'
  message?: string
}

export interface PlacementInput {
  availability: Availability
  sessions: readonly Session[]
  /** Session being edited (ignored when checking overlaps). */
  sessionId: string
  date: DateKey
  startMin: number
  durationMin: number
  /** Absolute-minute exam start for the session's topic, if any. */
  examStartAbs: number | null
  nowAbs: number
}

export const MIN_MANUAL_DURATION = E.MIN_SESSION_MIN
export const MAX_MANUAL_DURATION = 180

/**
 * A manual move/resize must stay inside a study window, avoid every commitment,
 * avoid other (non-skipped) sessions, start in the future, and finish before the exam.
 */
export function validatePlacement(inp: PlacementInput): PlacementCheck {
  const { availability: av, date, startMin, durationMin } = inp
  if (!Number.isFinite(durationMin) || durationMin < MIN_MANUAL_DURATION) {
    return { ok: false, field: 'duration', message: `Sessions need at least ${MIN_MANUAL_DURATION} minutes.` }
  }
  if (durationMin > MAX_MANUAL_DURATION) {
    return { ok: false, field: 'duration', message: `Keep sessions under ${MAX_MANUAL_DURATION / 60} hours so you can stay sharp.` }
  }
  if (!Number.isFinite(startMin) || startMin < 0 || startMin >= MIN_PER_DAY) {
    return { ok: false, field: 'time', message: 'Pick a start time.' }
  }
  const end = startMin + durationMin
  if (end > MIN_PER_DAY) {
    return { ok: false, field: 'time', message: 'This would run past midnight. Pick an earlier start.' }
  }
  const startAbs = toAbs(date, startMin)
  if (startAbs < inp.nowAbs) {
    return { ok: false, field: 'time', message: 'That time has already passed.' }
  }
  if (inp.examStartAbs !== null && startAbs + durationMin > inp.examStartAbs) {
    return { ok: false, field: 'date', message: 'This would run past the exam it prepares you for.' }
  }
  const span: Interval = { start: startMin, end }
  for (const c of commitmentBlocksOn(av, date)) {
    if (overlaps(span, c)) {
      return {
        ok: false,
        field: 'time',
        message: `This overlaps "${c.label}" (${formatClock(c.start)}–${formatClock(c.end)}).`,
      }
    }
  }
  const wins = windowsOn(av, date)
  if (av.blockedDates.includes(date)) {
    return { ok: false, field: 'date', message: 'You marked this day as a no-study day.' }
  }
  if (!wins.some((w) => w.start <= span.start && w.end >= span.end)) {
    return {
      ok: false,
      field: 'time',
      message:
        wins.length === 0
          ? 'You have no study time set aside on this day.'
          : `Pick a time inside your study windows (${wins.map((w) => `${formatClock(w.start)}–${formatClock(w.end)}`).join(', ')}).`,
    }
  }
  for (const s of inp.sessions) {
    if (s.id === inp.sessionId || s.status === 'skipped') continue
    const o = sessionSpan(s)
    if (o.date === date && overlaps(span, { start: o.start, end: o.end })) {
      return { ok: false, field: 'time', message: 'This overlaps another study session.' }
    }
  }
  return { ok: true }
}

export interface SlotSuggestion {
  date: DateKey
  startMin: number
}

/** Next feasible start times for a session of `durationMin` (max two per day). */
export function suggestSlots(opts: {
  availability: Availability
  sessions: readonly Session[]
  sessionId: string
  durationMin: number
  fromDate: DateKey
  nowAbs: number
  examStartAbs: number | null
  maxDays?: number
  limit?: number
}): SlotSuggestion[] {
  const out: SlotSuggestion[] = []
  const others = opts.sessions.filter((s) => s.id !== opts.sessionId)
  const limit = opts.limit ?? 6
  for (let i = 0; i < (opts.maxDays ?? 21) && out.length < limit; i++) {
    const date = addDays(opts.fromDate, i)
    const free = freeIntervalsOn(opts.availability, date, others)
    let perDay = 0
    for (const interval of free) {
      for (let start = interval.start; start + opts.durationMin <= interval.end && perDay < 2; start += 60) {
        const check = validatePlacement({
          availability: opts.availability,
          sessions: opts.sessions,
          sessionId: opts.sessionId,
          date,
          startMin: start,
          durationMin: opts.durationMin,
          examStartAbs: opts.examStartAbs,
          nowAbs: opts.nowAbs,
        })
        if (check.ok) {
          out.push({ date, startMin: start })
          perDay++
          if (out.length >= limit) return out
        }
      }
    }
  }
  return out
}
