import type { AppData } from './types'
import { examFor, examStartAbs } from './engine/plan'
import { commitmentBlocksOn, overlaps, sessionMinutes, sessionSpan, windowsOn } from './engine/slots'
import { momentToAbs, toAbs, type LocalMoment } from './engine/time'

/** Monday 19 Oct 2026, 2:00 PM local. */
export const NOW: LocalMoment = { date: '2026-10-19', minute: 14 * 60 }

export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    for (const v of Object.values(obj as object)) deepFreeze(v)
  }
  return obj
}

/**
 * Check every hard scheduling constraint on a plan. Returns human-readable
 * violations (empty array = valid).
 */
export function planViolations(data: AppData, now: LocalMoment, opts: { checkWindows?: boolean } = {}): string[] {
  const out: string[] = []
  const nowAbs = momentToAbs(now)
  const live = data.sessions.filter((s) => s.status !== 'skipped')
  const future = data.sessions.filter((s) => s.status === 'planned' && toAbs(s.date, s.startMin) > nowAbs)

  for (const s of future) {
    const topic = data.topics.find((t) => t.id === s.topicId)
    if (!topic) {
      out.push(`${s.id}: unknown topic`)
      continue
    }
    const span = { start: s.startMin, end: s.startMin + s.durationMin }
    if (span.end > 1440) out.push(`${s.id}: crosses midnight`)
    for (const c of commitmentBlocksOn(data.availability, s.date)) {
      if (overlaps(span, c)) out.push(`${s.id}: overlaps commitment ${c.label}`)
    }
    if (opts.checkWindows !== false && !s.locked) {
      const wins = windowsOn(data.availability, s.date)
      if (!wins.some((w) => w.start <= span.start && w.end >= span.end)) out.push(`${s.id}: outside study windows`)
    }
    const exam = examStartAbs(examFor(data, topic))
    if (exam !== null && toAbs(s.date, span.end) > exam) out.push(`${s.id}: ends after its exam`)
  }

  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = sessionSpan(live[i])
      const b = sessionSpan(live[j])
      if (a.date === b.date && overlaps(a, b)) out.push(`${live[i].id} overlaps ${live[j].id}`)
    }
  }

  const perDay = new Map<string, number>()
  for (const s of live) {
    const d = sessionSpan(s).date
    perDay.set(d, (perDay.get(d) ?? 0) + sessionMinutes(s))
  }
  for (const [d, m] of perDay) {
    const onlyAuto = live.filter((s) => sessionSpan(s).date === d).every((s) => !s.locked)
    if (onlyAuto && m > data.availability.maxDailyMin && d >= now.date) out.push(`${d}: ${m} min exceeds daily limit`)
  }
  return out
}

export function plannedMinutesFor(data: AppData, topicId: string, now: LocalMoment): number {
  const nowAbs = momentToAbs(now)
  return data.sessions
    .filter((s) => s.topicId === topicId && s.status === 'planned' && toAbs(s.date, s.startMin) > nowAbs)
    .reduce((sum, s) => sum + s.durationMin, 0)
}

import type { Availability, Importance, Topic } from './types'
import { initialCompletionModel } from './engine/completion'
import { initialMemory } from './engine/memory'
import { replan } from './engine/plan'
import { emptyData } from './state/persistence'
import { addDays } from './engine/time'

export const weekdayAvailability = (over: Partial<Availability> = {}): Availability => ({
  windows: [{ id: 'w1', days: [0, 1, 2, 3, 4, 5, 6], startMin: 16 * 60, endMin: 19 * 60 }],
  commitments: [],
  extraWindows: [],
  blockedDates: [],
  preferredSessionMin: 30,
  breakMin: 10,
  maxDailyMin: 120,
  ...over,
})

/** Two subjects (exams in `examA` / `examB` days) with `perSubject` topics each, then planned. */
export function basicData(
  now: LocalMoment,
  opts: { examA?: number; examB?: number; perSubject?: number; availability?: Partial<Availability>; importance?: Importance; plan?: boolean } = {},
): AppData {
  const per = opts.perSubject ?? 3
  const base = emptyData()
  const subjects = [
    { id: 'sA', name: 'Alpha', color: 'blue' as const },
    { id: 'sB', name: 'Beta', color: 'peach' as const },
  ]
  const exams = [
    { id: 'eA', subjectId: 'sA', name: 'Alpha exam', date: addDays(now.date, opts.examA ?? 4), startMin: 9 * 60 },
    { id: 'eB', subjectId: 'sB', name: 'Beta exam', date: addDays(now.date, opts.examB ?? 8), startMin: 9 * 60 },
  ]
  const anchor = momentToAbs(now)
  const topics: Topic[] = []
  for (const s of subjects) {
    for (let i = 1; i <= per; i++) {
      topics.push({
        id: `${s.id}-t${i}`,
        subjectId: s.id,
        examId: s.id === 'sA' ? 'eA' : 'eB',
        name: `${s.name} topic ${i}`,
        importance: opts.importance ?? 3,
        struggling: false,
        prerequisites: [],
        memory: initialMemory(2, anchor),
      })
    }
  }
  const data: AppData = {
    ...base,
    onboarded: true,
    subjects,
    exams,
    topics,
    availability: weekdayAvailability(opts.availability),
    completion: initialCompletionModel(),
  }
  return opts.plan === false ? data : replan(data, now).data
}
