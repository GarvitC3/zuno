/**
 * Study scheduler — a deterministic GREEDY HEURISTIC (not a global optimiser).
 *
 * Objective, per candidate review c of topic i with duration d at time τ:
 *
 *     score(c) = w_i · p_complete(d) · ΔR_exam(i, c) / d  · (small nudges)
 *
 *   w_i          importance weight (importance / 3)
 *   p_complete   Beta-Bernoulli estimate for d's duration group
 *   ΔR_exam      gain in forecast recall on exam day if c is completed, GIVEN every
 *                review already planned for that topic (so a gain is never counted twice)
 *   / d          makes sessions of different lengths comparable (gain per minute)
 *
 * Loop: repeatedly pick the highest-scoring feasible candidate, place it, and
 * recompute marginal gains. Stops when nothing feasible has a worthwhile gain.
 *
 * Hard constraints (never violated): inside study windows, outside commitments,
 * no overlap with other sessions (incl. breaks), finishes before the exam,
 * respects the daily study limit and one-session-per-topic-per-day.
 *
 * Because it is greedy, the result improves the objective but is NOT guaranteed
 * optimal. See README for limitations.
 */
import type { Availability, CompletionModel, DateKey, MemoryState, Session, UnmetNeed } from '../types'
import { durationGroup, isInitialEstimate, pComplete } from './completion'
import { ENGINE as E } from './config'
import { projectedRecall, projectionMemory, type PlannedReview } from './memory'
import {
  ceilToGrid,
  floorToGrid,
  freeIntervalsOn,
  sessionMinutes,
  sessionSpan,
  type Interval,
} from './slots'
import { addDays, diffDays, fromDayIndex, momentToAbs, toAbs, type LocalMoment } from './time'

export interface SchedulerTopic {
  id: string
  subjectId: string
  importance: number
  struggling: boolean
  memory: MemoryState
  /** Absolute minute the topic's exam starts; null/past = nothing to plan. */
  examStartAbs: number | null
}

export interface SchedulerOptions {
  /** Cap on total NEW minutes scheduled (Course Correction). */
  budgetMin?: number
  /** Multiply a topic's importance weight (Course Correction priorities). */
  weightMultipliers?: Record<string, number>
  horizonDays?: number
  maxSessions?: number
}

export interface SchedulerInput {
  now: LocalMoment
  topics: SchedulerTopic[]
  availability: Availability
  /** Everything that must stay put: history, skipped (blocks its slot), locked plans. */
  fixedSessions: Session[]
  completion: CompletionModel
  /** Previous auto plan — only used for a small "keep it where it was" bonus. */
  previousPlan?: Session[]
  options?: SchedulerOptions
}

export interface TopicPlan {
  topicId: string
  plannedMinutes: number
  plannedCount: number
  /** Forecast exam-day recall with the full plan (fixed future + new). */
  projectedWith: number
  /** Forecast exam-day recall if the student did no further review at all. */
  projectedWithout: number
  active: boolean
}

export interface SchedulerResult {
  sessions: Session[]
  perTopic: Record<string, TopicPlan>
  unmet: UnmetNeed[]
  totalMinutes: number
}

const importanceWeight = (importance: number) => Math.max(0.2, importance / 3)

const round5 = (m: number) => Math.round(m / E.SLOT_GRID_MIN) * E.SLOT_GRID_MIN

export function candidateDurations(preferred: number): { preferred: number; short: number } {
  const pref = Math.max(E.MIN_SESSION_MIN, round5(preferred))
  const short = Math.max(E.MIN_SESSION_MIN, round5(pref * E.SHORT_ALTERNATIVE_FRACTION))
  return { preferred: pref, short }
}

export function autoSessionId(topicId: string, date: DateKey, startMin: number): string {
  return `auto|${topicId}|${date}|${startMin}`
}

interface Candidate {
  topic: SchedulerTopic
  date: DateKey
  startMin: number
  durationMin: number
  score: number
  gain: number
  pc: number
}

export function reviewsFromSessions(
  sessions: readonly Session[],
  topicId: string,
  nowAbs: number,
  completion: CompletionModel,
): PlannedReview[] {
  const out: PlannedReview[] = []
  for (const s of sessions) {
    if (s.topicId !== topicId || s.status !== 'planned') continue
    const at = toAbs(s.date, s.startMin)
    if (at <= nowAbs) continue
    out.push({ atAbs: at, durationMin: s.durationMin, pComplete: pComplete(completion, s.durationMin) })
  }
  return out
}

export function buildSchedule(input: SchedulerInput): SchedulerResult {
  const { now, availability: av, completion } = input
  const opts = input.options ?? {}
  const nowAbs = momentToAbs(now)
  const horizon = opts.horizonDays ?? E.MAX_PLAN_HORIZON_DAYS
  const maxSessions = opts.maxSessions ?? E.MAX_SESSIONS_PER_PLAN
  const durs = candidateDurations(av.preferredSessionMin)
  // A shorter block is only considered once the student's OWN record says their preferred
  // length is not working. Before that, p_complete is just the starting assumption, and the
  // student's stated preference wins.
  const allowShorter = !isInitialEstimate(completion, durationGroup(durs.preferred))
  const maxDaily = Math.max(0, av.maxDailyMin)

  const active = input.topics.filter((t) => t.examStartAbs !== null && t.examStartAbs > nowAbs)
  const planned: Session[] = []
  const all: Session[] = [...input.fixedSessions]

  // Reviews already committed per topic (future locked sessions count).
  const reviews = new Map<string, PlannedReview[]>()
  const projMem = new Map<string, MemoryState>()
  const base = new Map<string, number>()
  for (const t of input.topics) {
    projMem.set(t.id, projectionMemory(t.memory, t.struggling))
    reviews.set(t.id, reviewsFromSessions(input.fixedSessions, t.id, nowAbs, completion))
  }
  for (const t of active) {
    base.set(t.id, projectedRecall(projMem.get(t.id)!, reviews.get(t.id)!, t.examStartAbs!))
  }

  // Day bookkeeping
  const topicDay = new Map<string, number>() // `${topicId}|${date}` → sessions that day
  const used = new Map<DateKey, number>()
  const addUsage = (s: Session) => {
    const day = sessionSpan(s).date
    topicDay.set(`${s.topicId}|${day}`, (topicDay.get(`${s.topicId}|${day}`) ?? 0) + 1)
    // A day the student moved this topic away from counts as taken: no refilling it.
    for (const v of s.vacated ?? []) topicDay.set(`${s.topicId}|${v}`, E.MAX_SESSIONS_PER_TOPIC_PER_DAY)
    // A skipped session still counts toward the day's limit: the student signalled
    // that time was not workable, so the planner must not pile other work into it.
    const spent = s.status === 'skipped' ? s.durationMin : sessionMinutes(s)
    used.set(day, (used.get(day) ?? 0) + spent)
  }
  all.forEach(addUsage)

  const lastExamDay = active.reduce((mx, t) => Math.max(mx, Math.floor(t.examStartAbs! / 1440)), -Infinity)
  const horizonDay = addDays(now.date, horizon)
  const examDay = lastExamDay === -Infinity ? now.date : fromDayIndex(lastExamDay)
  const lastDay = examDay < horizonDay ? examDay : horizonDay // ISO date keys sort lexicographically
  const days: DateKey[] = []
  for (let d = now.date; diffDays(d, lastDay) >= 0; d = addDays(d, 1)) days.push(d)

  const earliestToday = now.minute + E.LEAD_TIME_MIN
  const freeCache = new Map<DateKey, Interval[]>()
  const sessionsByDate = new Map<DateKey, Session[]>()
  const indexSession = (s: Session) => {
    // Index by the day the session really sits on (actual time for done sessions).
    const key = sessionSpan(s).date
    sessionsByDate.set(key, [...(sessionsByDate.get(key) ?? []), s])
  }
  all.forEach(indexSession)
  const freeFor = (date: DateKey): Interval[] => {
    let f = freeCache.get(date)
    if (!f) {
      f = freeIntervalsOn(av, date, sessionsByDate.get(date) ?? [], date === now.date ? earliestToday : 0)
      freeCache.set(date, f)
    }
    return f
  }

  // Previous placements are extra candidate start times (and earn a small bonus),
  // so a replan changes only what it needs to instead of shuffling the whole day.
  const prevKeys = new Map<string, number>()
  const prevStarts = new Map<string, number[]>()
  for (const s of input.previousPlan ?? []) {
    prevKeys.set(`${s.topicId}|${s.date}|${s.startMin}`, s.durationMin)
    const k = `${s.topicId}|${s.date}`
    prevStarts.set(k, [...(prevStarts.get(k) ?? []), s.startMin])
  }

  let budget = opts.budgetMin ?? Infinity
  let totalMinutes = 0

  while (planned.length < maxSessions) {
    let best: Candidate | null = null

    for (const topic of active) {
      const b = base.get(topic.id)!
      if (b >= E.SATURATION_RECALL) continue
      const mem = projMem.get(topic.id)!
      const have = reviews.get(topic.id)!
      const w = importanceWeight(topic.importance) * (opts.weightMultipliers?.[topic.id] ?? 1)
      const examAbs = topic.examStartAbs!

      for (const date of days) {
        if ((topicDay.get(`${topic.id}|${date}`) ?? 0) >= E.MAX_SESSIONS_PER_TOPIC_PER_DAY) continue
        const dayCap = maxDaily - (used.get(date) ?? 0)
        if (dayCap < E.MIN_SESSION_MIN) continue
        for (const interval of freeFor(date)) {
          const starts = [interval.start]
          for (const p of prevStarts.get(`${topic.id}|${date}`) ?? []) {
            if (p > interval.start && p + E.MIN_SESSION_MIN <= interval.end) starts.push(p)
          }
          for (const start of starts) {
            const startAbs = toAbs(date, start)
            if (startAbs >= examAbs) continue
            const room = Math.min(
              interval.end - start,
              dayCap,
              floorToGrid(examAbs - startAbs),
              Number.isFinite(budget) ? floorToGrid(budget) : Infinity,
            )
            if (room < E.MIN_SESSION_MIN) continue
            const options = new Set<number>()
            options.add(Math.min(durs.preferred, floorToGrid(room)))
            if (allowShorter && durs.short < durs.preferred) options.add(Math.min(durs.short, floorToGrid(room)))
            for (const d of options) {
              if (d < E.MIN_SESSION_MIN) continue
              const pc = pComplete(completion, d)
              const withReview = projectedRecall(mem, [...have, { atAbs: startAbs, durationMin: d, pComplete: 1 }], examAbs)
              const gain = withReview - b
              if (gain < E.MIN_EXAM_GAIN) continue
              const daysAhead = Math.max(0, (startAbs - nowAbs) / 1440)
              let score = (w * pc * gain) / d
              score *= Math.pow(E.PLAN_DRIFT_PER_DAY, daysAhead)
              if (d === durs.preferred) score *= E.PREFERRED_LENGTH_BONUS
              if (prevKeys.get(`${topic.id}|${date}|${start}`) === d) score *= E.STABILITY_BONUS
              const cand: Candidate = { topic, date, startMin: start, durationMin: d, score, gain, pc }
              if (isBetter(cand, best)) best = cand
            }
          }
        }
      }
    }

    if (!best) break

    const chosen: Session = {
      id: autoSessionId(best.topic.id, best.date, best.startMin),
      topicId: best.topic.id,
      date: best.date,
      startMin: best.startMin,
      durationMin: best.durationMin,
      status: 'planned',
      locked: false,
    }
    planned.push(chosen)
    all.push(chosen)
    indexSession(chosen)
    freeCache.delete(chosen.date)
    addUsage(chosen)
    totalMinutes += chosen.durationMin
    budget -= chosen.durationMin
    const list = reviews.get(best.topic.id)!
    list.push({ atAbs: toAbs(best.date, best.startMin), durationMin: best.durationMin, pComplete: best.pc })
    base.set(best.topic.id, projectedRecall(projMem.get(best.topic.id)!, list, best.topic.examStartAbs!))
  }

  // Within a day, do the most pressing work first (while fresh): the closest exam, then the
  // highest final marginal score. Only same-length sessions trade places, and a swap is
  // skipped if it would run past a topic's exam.
  const examOf = new Map(input.topics.map((t) => [t.id, t.examStartAbs] as const))
  const topicById = new Map(input.topics.map((t) => [t.id, t] as const))
  // Final marginal score of each session: importance × p × (gain given the rest of the plan) ÷ minutes.
  // This is the same number the UI shows as the "ranking score".
  const finalReviews = new Map<string, PlannedReview[]>()
  for (const t of input.topics) finalReviews.set(t.id, reviewsFromSessions([...input.fixedSessions, ...planned], t.id, nowAbs, completion))
  const marginal = new Map<string, number>()
  for (const p of planned) {
    const t = topicById.get(p.topicId)!
    if (t.examStartAbs === null) continue
    const at = toAbs(p.date, p.startMin)
    const all = finalReviews.get(t.id)!
    const others = all.filter((r) => !(r.atAbs === at && r.durationMin === p.durationMin))
    const m = projMem.get(t.id)!
    const gain = projectedRecall(m, [...others, { atAbs: at, durationMin: p.durationMin, pComplete: 1 }], t.examStartAbs) - projectedRecall(m, others, t.examStartAbs)
    marginal.set(p.id, importanceWeight(t.importance) * (opts.weightMultipliers?.[t.id] ?? 1) * pComplete(completion, p.durationMin) * gain / p.durationMin)
  }
  const byDate = new Map<DateKey, Session[]>()
  for (const p of planned) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p])
  const ordered: Session[] = []
  for (const [date, list] of byDate) {
    const byLength = new Map<number, Session[]>()
    for (const p of list) byLength.set(p.durationMin, [...(byLength.get(p.durationMin) ?? []), p])
    for (const [, group] of byLength) {
      const slots = [...group].sort((a, b) => a.startMin - b.startMin)
      // Closest exam first, then highest marginal score.
      const examKey = (p: Session) => examOf.get(p.topicId) ?? Number.POSITIVE_INFINITY
      const ranked = [...group].sort(
        (a, b) =>
          examKey(a) - examKey(b) ||
          (marginal.get(b.id) ?? 0) - (marginal.get(a.id) ?? 0) ||
          a.topicId.localeCompare(b.topicId),
      )
      const fits = slots.every((slot, i) => {
        const exam = examOf.get(ranked[i].topicId)
        return exam === null || exam === undefined || toAbs(date, slot.startMin + slot.durationMin) <= exam
      })
      slots.forEach((slot, i) => {
        const topicId = fits ? ranked[i].topicId : slot.topicId
        ordered.push({ ...slot, topicId, id: autoSessionId(topicId, date, slot.startMin) })
      })
    }
  }
  planned.length = 0
  planned.push(...ordered)
  planned.sort((a, b) => toAbs(a.date, a.startMin) - toAbs(b.date, b.startMin) || a.topicId.localeCompare(b.topicId))

  // Rebuild each topic's reviews from the FINAL times so summaries match the plan exactly.
  for (const t of input.topics) {
    reviews.set(t.id, reviewsFromSessions([...input.fixedSessions, ...planned], t.id, nowAbs, completion))
  }

  // ---- Per-topic summary and honest "unmet need" reporting ------------------------
  const perTopic: Record<string, TopicPlan> = {}
  const unmet: UnmetNeed[] = []
  for (const t of input.topics) {
    const isActive = active.includes(t)
    const mem = projMem.get(t.id)!
    const mine = planned.filter((s) => s.topicId === t.id)
    const withPlan = isActive ? projectedRecall(mem, reviews.get(t.id)!, t.examStartAbs!) : 0
    const without = isActive ? projectedRecall(mem, [], t.examStartAbs!) : 0
    perTopic[t.id] = {
      topicId: t.id,
      plannedMinutes: mine.reduce((s, x) => s + x.durationMin, 0),
      plannedCount: mine.length,
      projectedWith: withPlan,
      projectedWithout: without,
      active: isActive,
    }
    if (!isActive || withPlan >= E.TARGET_RECALL) continue

    const extra = idealExtraMinutes(mem, reviews.get(t.id)!, t.examStartAbs!, nowAbs, durs.preferred, completion)
    if (extra.minutes <= 0) continue

    const budgetBound = Number.isFinite(budget) && budget < E.MIN_SESSION_MIN
    let reason: UnmetNeed['reason']
    if (budgetBound) reason = 'budget'
    else {
      const anyFree = days.some(
        (d) =>
          toAbs(d, 0) < t.examStartAbs! &&
          freeFor(d).some((iv) => toAbs(d, iv.start) + E.MIN_SESSION_MIN <= t.examStartAbs!),
      )
      reason = anyFree ? 'daily_limit' : 'no_free_time'
    }
    // Only report a need if the scheduler genuinely could not place more for this topic.
    unmet.push({
      topicId: t.id,
      projectedRecall: withPlan,
      targetRecall: E.TARGET_RECALL,
      extraMinutes: extra.minutes,
      reason,
    })
  }

  return { sessions: planned, perTopic, unmet, totalMinutes }
}

function isBetter(c: Candidate, best: Candidate | null): boolean {
  if (!best) return true
  const diff = c.score - best.score
  if (Math.abs(diff) > 1e-12) return diff > 0
  const ta = toAbs(c.date, c.startMin)
  const tb = toAbs(best.date, best.startMin)
  if (ta !== tb) return ta < tb
  if (c.topic.id !== best.topic.id) return c.topic.id < best.topic.id
  return c.durationMin > best.durationMin
}

/**
 * Rough extra study time that would be needed to reach TARGET_RECALL, assuming
 * reviews of the preferred length could be placed anywhere (evenly spaced).
 * Used only to describe unmet need — it is an estimate, not a plan.
 */
export function idealExtraMinutes(
  mem: MemoryState,
  have: readonly PlannedReview[],
  examAbs: number,
  nowAbs: number,
  preferredMin: number,
  completion: CompletionModel,
): { minutes: number; reviews: number } {
  const start = Math.max(nowAbs, mem.anchor)
  const span = examAbs - start
  if (span <= E.MIN_SESSION_MIN) return { minutes: 0, reviews: 0 }
  const pc = pComplete(completion, preferredMin)
  const current = projectedRecall(mem, have, examAbs)
  if (current >= E.TARGET_RECALL) return { minutes: 0, reviews: 0 }
  for (let k = 1; k <= 8; k++) {
    const extras: PlannedReview[] = []
    for (let j = 1; j <= k; j++) {
      extras.push({ atAbs: start + (span * j) / (k + 1), durationMin: preferredMin, pComplete: pc })
    }
    const r = projectedRecall(mem, [...have, ...extras], examAbs)
    if (k === 1 && r - current < E.MIN_EXAM_GAIN) return { minutes: 0, reviews: 0 }
    if (r >= E.TARGET_RECALL || k === 8) return { minutes: k * preferredMin, reviews: k }
  }
  return { minutes: 0, reviews: 0 }
}

export { ceilToGrid }
