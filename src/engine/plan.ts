/**
 * Adapters between stored app data and the scheduler, plus plan diffing.
 * Still pure: given the same data and the same `now`, the result is identical.
 */
import type { AppData, Exam, PlanChange, Session, Topic } from '../types'
import { updateCompletion } from './completion'
import { ENGINE as E } from './config'
import { buildSchedule, type SchedulerOptions, type SchedulerResult, type SchedulerTopic } from './scheduler'
import { sessionSpan } from './slots'
import { formatMinutes, momentToAbs, relativeWhen, toAbs, type LocalMoment } from './time'

export function examFor(data: AppData, topic: Topic): Exam | null {
  if (!topic.examId) return null
  return data.exams.find((e) => e.id === topic.examId) ?? null
}

export function examStartAbs(exam: Exam | null): number | null {
  return exam ? toAbs(exam.date, exam.startMin ?? E.DEFAULT_EXAM_START_MIN) : null
}

export function schedulerTopics(data: AppData): SchedulerTopic[] {
  return data.topics.map((t) => ({
    id: t.id,
    subjectId: t.subjectId,
    importance: t.importance,
    struggling: t.struggling,
    memory: t.memory,
    examStartAbs: examStartAbs(examFor(data, t)),
  }))
}

export const sessionStartAbs = (s: Session) => toAbs(s.date, s.startMin)
export const sessionEndAbs = (s: Session) => toAbs(s.date, s.startMin + s.durationMin)

/**
 * A session the scheduler must never touch: anything already resolved
 * (completed / partial / skipped), anything the student pinned, and anything
 * that has already started or passed.
 */
export function isFixedSession(s: Session, nowAbs: number): boolean {
  return s.status !== 'planned' || s.locked || sessionStartAbs(s) <= nowAbs
}

/** Planned sessions whose time has fully passed without being done. */
export function isMissed(s: Session, nowAbs: number): boolean {
  return s.status === 'planned' && sessionEndAbs(s) <= nowAbs
}

/**
 * Past planned sessions that were never recorded count as skipped: they become
 * `skipped` and teach the completion model. Pure; returns a new AppData.
 */
export function resolveMissedInData(data: AppData, now: LocalMoment): AppData {
  const nowAbs = momentToAbs(now)
  let completion = data.completion
  const sessions = data.sessions.map((s) => {
    if (!isMissed(s, nowAbs)) return s
    completion = updateCompletion(completion, s.durationMin, { kind: 'skipped' })
    return { ...s, status: 'skipped' as const }
  })
  return { ...data, sessions, completion }
}

export interface ReplanOutput {
  data: AppData
  result: SchedulerResult
  /** The re-plannable sessions before this replan (for diffing). */
  before: Session[]
}

/**
 * Regenerate every future, unlocked, still-planned session. Completed, partial,
 * skipped, locked and past sessions are carried over untouched. Quiz history is
 * never modified.
 */
export function replan(data: AppData, now: LocalMoment, options?: SchedulerOptions): ReplanOutput {
  const nowAbs = momentToAbs(now)
  const before = data.sessions.filter((s) => !isFixedSession(s, nowAbs))
  const fixed = data.sessions.filter((s) => isFixedSession(s, nowAbs))
  const result = buildSchedule({
    now,
    topics: schedulerTopics(data),
    availability: data.availability,
    fixedSessions: fixed,
    completion: data.completion,
    previousPlan: before,
    options,
  })
  const sessions = sortSessions([...fixed, ...result.sessions])
  return {
    data: {
      ...data,
      sessions,
      planMeta: { generatedFor: now.date, unmet: result.unmet },
    },
    result,
    before,
  }
}

export function sortSessions(list: Session[]): Session[] {
  return [...list].sort((a, b) => {
    const sa = sessionSpan(a)
    const sb = sessionSpan(b)
    return toAbs(sa.date, sa.start) - toAbs(sb.date, sb.start) || a.id.localeCompare(b.id)
  })
}

// ---- Diffing ---------------------------------------------------------------------

const same = (a: Session, b: Session) =>
  a.topicId === b.topicId && a.date === b.date && a.startMin === b.startMin && a.durationMin === b.durationMin

export interface DiffContext {
  topicName: (topicId: string) => string
  today: string
  /** Sessions the student just skipped (so an unreplaced one reads "skipped", not "removed"). */
  skippedIds?: string[]
}

/** Describe, in plain words, how a set of future sessions changed. */
export function diffPlans(before: Session[], after: Session[], ctx: DiffContext): PlanChange[] {
  const b = before.filter((s) => s.status === 'planned')
  const a = after.filter((s) => s.status === 'planned')
  const unmatchedB = [...b]
  const unmatchedA: Session[] = []

  for (const s of a) {
    const i = unmatchedB.findIndex((x) => same(x, s))
    if (i >= 0) unmatchedB.splice(i, 1)
    else unmatchedA.push(s)
  }

  const changes: { when: number; change: PlanChange }[] = []
  const pool = unmatchedB
  for (const s of unmatchedA) {
    const sAbs = sessionStartAbs(s)
    // Pair with the nearest unmatched earlier session of the same topic.
    let bestIdx = -1
    let bestDist = Infinity
    pool.forEach((x, i) => {
      if (x.topicId !== s.topicId) return
      const dist = Math.abs(sessionStartAbs(x) - sAbs)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    })
    const name = ctx.topicName(s.topicId)
    if (bestIdx >= 0) {
      const old = pool.splice(bestIdx, 1)[0]
      if (old.date === s.date && old.startMin === s.startMin) {
        changes.push({
          when: sAbs,
          change: {
            kind: 'resized',
            topicId: s.topicId,
            text: `${name} on ${relativeWhen(s.date, s.startMin, ctx.today)} is now ${s.durationMin} min (was ${old.durationMin} min).`,
          },
        })
      } else {
        changes.push({
          when: sAbs,
          change: {
            kind: 'moved',
            topicId: s.topicId,
            text: `${capitalize(name)} moved to ${relativeWhen(s.date, s.startMin, ctx.today)}.`,
          },
        })
      }
    } else {
      changes.push({
        when: sAbs,
        change: {
          kind: 'added',
          topicId: s.topicId,
          text: `Added ${s.durationMin} min of ${name} ${relativeWhen(s.date, s.startMin, ctx.today)}.`,
        },
      })
    }
  }
  for (const x of pool) {
    changes.push({
      when: sessionStartAbs(x),
      change: {
        kind: 'removed',
        topicId: x.topicId,
        text: ctx.skippedIds?.includes(x.id)
          ? `${capitalize(ctx.topicName(x.topicId))} ${relativeWhen(x.date, x.startMin, ctx.today)} was skipped. The sessions still planned for it cover the gap.`
          : `${capitalize(ctx.topicName(x.topicId))} ${relativeWhen(x.date, x.startMin, ctx.today)} is no longer on the plan.`,
      },
    })
  }
  const order = { moved: 0, added: 1, resized: 2, removed: 3 } as const
  return changes
    .sort((p, q) => order[p.change.kind] - order[q.change.kind] || p.when - q.when)
    .map((c) => c.change)
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** "More time for Newton's laws (+45 min); less for Limits (−30 min)." */
export function minuteShiftNote(before: Session[], after: Session[], topicName: (id: string) => string): string | undefined {
  const delta = new Map<string, number>()
  for (const s of before) if (s.status === 'planned') delta.set(s.topicId, (delta.get(s.topicId) ?? 0) - s.durationMin)
  for (const s of after) if (s.status === 'planned') delta.set(s.topicId, (delta.get(s.topicId) ?? 0) + s.durationMin)
  const rows = [...delta.entries()].filter(([, d]) => Math.abs(d) >= 5).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
  if (rows.length === 0) return undefined
  const more = rows.filter(([, d]) => d > 0).slice(0, 2)
  const less = rows.filter(([, d]) => d < 0).slice(0, 2)
  const fmt = (list: [string, number][]) =>
    list.map(([id, d]) => `${topicName(id)} (${d > 0 ? '+' : '−'}${formatMinutes(Math.abs(d))})`).join(', ')
  const parts: string[] = []
  if (more.length) parts.push(`More time for ${fmt(more)}`)
  if (less.length) parts.push(`${more.length ? 'less' : 'Less time'} for ${fmt(less)}`)
  return parts.join('; ') + '.'
}
