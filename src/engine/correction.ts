/**
 * Course Correction — Zuno's friendly "panic mode".
 *
 * Given (a) which subjects matter most and (b) how many minutes the student can
 * really give from now on, re-run the SAME scheduler under a total-time budget,
 * with priority subjects weighted up. Nothing is saved until the student applies it.
 *
 * Missed sessions are first treated as skipped (so the completion model learns
 * from them), and pinned sessions stay where they are.
 */
import type { AppData, DateKey, ID } from '../types'
import { examFor, replan, resolveMissedInData } from './plan'
import { allInsights } from './insights'
import { formatDateShort, type LocalMoment } from './time'

export const PRIORITY_WEIGHT = 2
export const OTHER_WEIGHT = 0.6

export interface CorrectionInput {
  prioritySubjectIds: ID[]
  /** Total new study minutes the student can really give from now on. */
  budgetMin: number
}

export type Verdict = 'prioritized' | 'kept' | 'reduced' | 'omitted' | 'nothing'

export interface CorrectionRow {
  topicId: ID
  topicName: string
  subjectId: ID
  subjectName: string
  examDate: DateKey | null
  beforeMinutes: number
  afterMinutes: number
  beforeProjected: number | null
  afterProjected: number | null
  verdict: Verdict
  reason: string
}

export interface CorrectionResult {
  data: AppData
  rows: CorrectionRow[]
  beforeMinutes: number
  afterMinutes: number
  budgetMin: number
  meanBefore: number | null
  meanAfter: number | null
  unmetCount: number
  /** Short headline sentences the UI can show above the table. */
  summary: string[]
}

const pct = (x: number) => `${Math.round(x * 100)}%`

function futureMinutesFor(data: AppData, topicId: string, now: LocalMoment): number {
  return data.sessions
    .filter(
      (s) =>
        s.topicId === topicId &&
        s.status === 'planned' &&
        (s.date > now.date || (s.date === now.date && s.startMin + s.durationMin > now.minute)),
    )
    .reduce((sum, s) => sum + s.durationMin, 0)
}

/** Current plan's remaining minutes (used to suggest a sensible budget). */
export function currentPlanMinutes(data: AppData, now: LocalMoment): number {
  return data.topics.reduce((sum, t) => sum + futureMinutesFor(data, t.id, now), 0)
}

export function runCorrection(data: AppData, now: LocalMoment, input: CorrectionInput): CorrectionResult {
  const prioritySet = new Set(input.prioritySubjectIds)
  const beforeInsights = allInsights(data, now)
  const base = resolveMissedInData(data, now)

  // Only sessions that can still move count toward the budget; pinned ones are extra.
  const weight: Record<string, number> = {}
  for (const t of base.topics) {
    weight[t.id] = prioritySet.size === 0 || prioritySet.has(t.subjectId) ? PRIORITY_WEIGHT : OTHER_WEIGHT
  }
  const { data: corrected, result } = replan(base, now, {
    budgetMin: Math.max(0, input.budgetMin),
    weightMultipliers: weight,
  })

  const afterInsights = allInsights(corrected, now)
  const rows: CorrectionRow[] = []
  const prioritizedExamDates = base.topics
    .filter((t) => prioritySet.has(t.subjectId))
    .map((t) => examFor(base, t)?.date)
    .filter((d): d is DateKey => !!d)
  const latestPriorityExam = prioritizedExamDates.length ? prioritizedExamDates.reduce((a, b) => (a > b ? a : b)) : null

  for (const a of afterInsights) {
    const b = beforeInsights.find((x) => x.topic.id === a.topic.id)
    if (!a.exam || a.examPassed) continue
    const beforeMin = futureMinutesFor(data, a.topic.id, now)
    const afterMin = futureMinutesFor(corrected, a.topic.id, now)
    const isPriority = prioritySet.size === 0 || prioritySet.has(a.subject.id)
    const days = a.daysToExam ?? 0
    const when = `${a.subject.name} exam on ${formatDateShort(a.exam.date)} (${days} ${days === 1 ? 'day' : 'days'})`

    let verdict: Verdict
    let reason: string
    if (afterMin === 0 && beforeMin === 0) {
      verdict = 'nothing'
      reason = `No review is needed right now: forecast recall on exam day is ${pct(a.projectedWith ?? a.recallNow)}.`
    } else if (afterMin === 0) {
      verdict = 'omitted'
      const later = latestPriorityExam && a.exam.date > latestPriorityExam
      reason = later
        ? `Left out for now. Its exam is later than your priorities, so it can wait for the next plan.`
        : `Left out for now. Each minute here adds less expected recall than the topics we kept (${when}).`
    } else if (afterMin < beforeMin * 0.9) {
      verdict = 'reduced'
      reason = isPriority
        ? `Trimmed to fit your time, but kept because ${when} is close and recall is ${pct(a.recallNow)}.`
        : `Trimmed so priority topics get the time. Forecast on exam day: ${pct(a.projectedWith ?? 0)}.`
    } else if (isPriority && prioritySet.size > 0) {
      verdict = 'prioritized'
      reason = `Prioritized: ${when}, and your estimated recall is ${pct(a.recallNow)}.`
    } else {
      verdict = 'kept'
      reason = `Kept as planned: it still gives a good return for the time (${when}).`
    }
    rows.push({
      topicId: a.topic.id,
      topicName: a.topic.name,
      subjectId: a.subject.id,
      subjectName: a.subject.name,
      examDate: a.exam.date,
      beforeMinutes: beforeMin,
      afterMinutes: afterMin,
      beforeProjected: b?.projectedWith ?? null,
      afterProjected: a.projectedWith,
      verdict,
      reason,
    })
  }

  const mean = (list: CorrectionRow[], pick: (r: CorrectionRow) => number | null) => {
    const weights = list.map((r) => base.topics.find((t) => t.id === r.topicId)?.importance ?? 3)
    const vals = list.map(pick)
    let sw = 0
    let s = 0
    vals.forEach((v, i) => {
      if (v === null) return
      sw += weights[i]
      s += weights[i] * v
    })
    return sw ? s / sw : null
  }

  const beforeMinutes = rows.reduce((s, r) => s + r.beforeMinutes, 0)
  const afterMinutes = rows.reduce((s, r) => s + r.afterMinutes, 0)
  const meanBefore = mean(rows, (r) => r.beforeProjected)
  const meanAfter = mean(rows, (r) => r.afterProjected)

  const summary: string[] = []
  summary.push(
    `With ${Math.round(input.budgetMin)} minutes, Zuno plans ${Math.round(afterMinutes)} minutes across ${rows.filter((r) => r.afterMinutes > 0).length} topics (your current plan has ${Math.round(beforeMinutes)}).`,
  )
  if (meanBefore !== null && meanAfter !== null) {
    summary.push(`Expected exam-day recall (importance-weighted): ${pct(meanBefore)} before → ${pct(meanAfter)} after. These are estimates.`)
  }
  if (result.unmet.length > 0) {
    summary.push(`Even so, ${result.unmet.length} ${result.unmet.length === 1 ? 'topic stays' : 'topics stay'} below the ${pct(0.7)} target — the time just isn't there for everything, and that's okay.`)
  }

  return {
    data: corrected,
    rows,
    beforeMinutes,
    afterMinutes,
    budgetMin: input.budgetMin,
    meanBefore,
    meanAfter,
    unmetCount: result.unmet.length,
    summary,
  }
}

