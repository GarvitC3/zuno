/**
 * Memory model — pure functions, no UI, no clock.
 *
 *   R(t) = A * exp(-t / S)
 *
 *   R(t)  estimated probability the student can recall the topic
 *   A     recall right after the latest assessment (or modelled review)
 *   t     DAYS since that reference moment
 *   S     memory stability in DAYS (bigger = forgets slower)
 *
 * "Observed" quiz accuracy (k / n) is stored separately in the quiz history and
 * never overwritten; `MemoryState` is the model's *estimate*, and anything
 * computed beyond "now" is a *forecast*.
 */
import type { Familiarity, MemoryState } from '../types'
import { ENGINE as E } from './config'
import { MIN_PER_DAY } from './time'

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
export const clamp01 = (x: number) => (Number.isFinite(x) ? clamp(x, 0, 1) : 0)

/** Keep stability positive and finite. */
export function safeStability(s: number): number {
  if (!Number.isFinite(s) || s <= 0) return E.DEFAULT_STABILITY_DAYS
  return clamp(s, E.STABILITY_MIN_DAYS, E.STABILITY_MAX_DAYS)
}

/** Repair a possibly-corrupt memory state so the maths can never see NaN or S <= 0. */
export function sanitizeMemory(m: Partial<MemoryState> | null | undefined, fallbackAnchor: number): MemoryState {
  return {
    anchor: Number.isFinite(m?.anchor) ? (m!.anchor as number) : fallbackAnchor,
    recall: Number.isFinite(m?.recall) ? clamp01(m!.recall as number) : E.UNSURE_RECALL,
    stability: safeStability(m?.stability as number),
    source: m?.source === 'quiz' || m?.source === 'familiarity' || m?.source === 'unsure' ? m.source : 'unsure',
    assessments: Number.isFinite(m?.assessments) ? Math.max(0, Math.floor(m!.assessments as number)) : 0,
  }
}

/** A topic's stability once the "I'm struggling" flag is applied. */
export function effectiveStability(mem: MemoryState, struggling: boolean): number {
  const s = safeStability(mem.stability)
  return struggling ? safeStability(s * E.STRUGGLE_STABILITY_FACTOR) : s
}

/** Memory state as the projections should see it (flag applied to stability). */
export function projectionMemory(mem: MemoryState, struggling: boolean): MemoryState {
  return { ...mem, stability: effectiveStability(mem, struggling) }
}

/** R at absolute time `atAbs`. Elapsed time is clamped at 0 (we never "un-forget"). */
export function recallAt(mem: MemoryState, atAbs: number): number {
  const tDays = Math.max(0, (atAbs - mem.anchor) / MIN_PER_DAY)
  const s = safeStability(mem.stability)
  return clamp01(clamp01(mem.recall) * Math.exp(-tDays / s))
}

export function initialMemory(familiarity: Familiarity | null | undefined, nowAbs: number): MemoryState {
  if (familiarity && familiarity >= 1 && familiarity <= 5) {
    return {
      anchor: nowAbs,
      recall: E.FAMILIARITY_RECALL[familiarity],
      stability: E.FAMILIARITY_STABILITY_DAYS[familiarity],
      source: 'familiarity',
      assessments: 0,
    }
  }
  return {
    anchor: nowAbs,
    recall: E.UNSURE_RECALL,
    stability: E.DEFAULT_STABILITY_DAYS,
    source: 'unsure',
    assessments: 0,
  }
}

export interface QuizUpdate {
  next: MemoryState
  /** Model's forecast of recall at the moment of the check (before evidence). */
  recallBefore: number
  /** Raw observed accuracy k / n. */
  observed: number
  /** How much weight the evidence got: n / (n + n0). */
  evidenceWeight: number
  stabilityBefore: number
  stabilityAfter: number
}

/**
 * Update the estimate from a recall check of `correct` out of `total`.
 *
 * Treat the model's own forecast R_before as a Beta prior with strength n0, and
 * the check as n Bernoulli trials with k successes. The posterior mean is
 *
 *     A_new = (n0 * R_before + k) / (n0 + n)
 *
 * so a long quiz overrides the model faster than a one-question quiz.
 * Stability then moves with how well the student did:
 *
 *     S_new = S * (m0 + m1 * A_new)       (clamped; heuristic, not calibrated)
 *
 * so strong results lengthen memory and weak results leave it short.
 * The clock is reset: the anchor becomes the time of the check.
 *
 * Note: the update does NOT credit the study session itself — completing a
 * timer is not evidence of mastery. Only the check result is.
 */
export function updateFromQuiz(
  mem: MemoryState,
  quiz: { correct: number; total: number },
  atAbs: number,
  struggling = false,
): QuizUpdate {
  const total = Math.max(1, Math.floor(Number.isFinite(quiz.total) ? quiz.total : 1))
  const correct = clamp(Math.floor(Number.isFinite(quiz.correct) ? quiz.correct : 0), 0, total)
  const base = sanitizeMemory(mem, atAbs)
  const recallBefore = recallAt(projectionMemory(base, struggling), atAbs)
  const n0 = base.source === 'unsure' ? E.PRIOR_STRENGTH_UNSURE : E.PRIOR_STRENGTH
  const aNew = clamp01((n0 * recallBefore + correct) / (n0 + total))
  const mult = E.QUIZ_STABILITY_MULT_BASE + E.QUIZ_STABILITY_MULT_SLOPE * aNew
  const sNew = safeStability(base.stability * mult)
  return {
    next: { anchor: atAbs, recall: aNew, stability: sNew, source: 'quiz', assessments: base.assessments + 1 },
    recallBefore,
    observed: correct / total,
    evidenceWeight: total / (n0 + total),
    stabilityBefore: base.stability,
    stabilityAfter: sNew,
  }
}

// ---- Hypothetical reviews (planning & forecasting) -------------------------------

/**
 * Effectiveness of a session of `durationMin` minutes, in [0, 1):
 *     eff(d) = 1 - exp(-(d - overhead) / D0)
 * Diminishing returns: the first minutes help most; the overhead means very
 * short sessions are inefficient. Together they give each session length a
 * natural "gain per minute" sweet spot.
 */
export function sessionEffectiveness(durationMin: number): number {
  if (!Number.isFinite(durationMin)) return 0
  const learning = durationMin - E.SESSION_OVERHEAD_MIN
  if (learning <= 0) return 0
  return 1 - Math.exp(-learning / E.EFFECTIVENESS_TIMESCALE_MIN)
}

/**
 * What a COMPLETED review of `durationMin` at time `atAbs` would do to (A, S).
 *
 *   R_b     = R(atAbs)                             (forgetting before the review)
 *   e       = eff(d) * recency                     (recency: <1 day since last review → discounted)
 *   A_post  = R_b + (ceiling - R_b) * e            (never reaches perfect recall)
 *   spacing = clamp((1 - R_b) / 0.5, floor, 1)     (reviewing while still fresh helps less)
 *   S_post  = S * (1 + gain * e * spacing)
 *
 * This is a documented hypothetical learning transition, not a measurement.
 */
export function reviewTransition(mem: MemoryState, atAbs: number, durationMin: number): MemoryState {
  const rb = recallAt(mem, atAbs)
  const gapDays = Math.max(0, (atAbs - mem.anchor) / MIN_PER_DAY)
  const recency = clamp(gapDays / E.RECENCY_FULL_EFFECT_DAYS, E.RECENCY_FLOOR, 1)
  const eff = sessionEffectiveness(durationMin) * recency
  const aPost = clamp01(rb + (E.REVIEW_CEILING - rb) * eff)
  const spacing = clamp(
    (1 - rb) / E.SPACING_REFERENCE_FORGETTING,
    E.SPACING_FLOOR,
    1,
  )
  const sPost = safeStability(safeStability(mem.stability) * (1 + E.STABILITY_GAIN * eff * spacing))
  return { ...mem, anchor: Math.max(atAbs, mem.anchor), recall: Math.max(aPost, rb), stability: sPost }
}

/**
 * Expected-state version for a review that happens with probability `p`
 * (mean-field approximation: we average A and S, not the final recall).
 */
export function expectedReviewTransition(
  mem: MemoryState,
  atAbs: number,
  durationMin: number,
  pComplete: number,
): MemoryState {
  const p = clamp01(pComplete)
  const done = reviewTransition(mem, atAbs, durationMin)
  const rb = recallAt(mem, atAbs)
  return {
    ...mem,
    anchor: Math.max(atAbs, mem.anchor),
    recall: clamp01(p * done.recall + (1 - p) * rb),
    stability: safeStability(p * done.stability + (1 - p) * safeStability(mem.stability)),
  }
}

export interface PlannedReview {
  atAbs: number
  durationMin: number
  /** Probability the review is actually completed. 1 = assume it happens. */
  pComplete: number
}

/**
 * Forecast recall at `targetAbs` given a list of planned reviews (any order).
 * Reviews at or before the memory anchor, or after the target, are ignored.
 * Uses the SAME transition the scheduler optimises, so charts and plans agree.
 */
export function projectedRecall(mem: MemoryState, reviews: readonly PlannedReview[], targetAbs: number): number {
  let state = mem
  const ordered = [...reviews]
    .filter((r) => r.atAbs > mem.anchor && r.atAbs <= targetAbs)
    .sort((a, b) => a.atAbs - b.atAbs)
  for (const r of ordered) {
    state = expectedReviewTransition(state, r.atAbs, r.durationMin, r.pComplete)
  }
  return recallAt(state, targetAbs)
}

export interface CurvePoint {
  atAbs: number
  recall: number
}

/**
 * Sample the forecast curve from `fromAbs` to `toAbs`. Each review contributes
 * two points at the same time (just before and just after) so the chart shows
 * the jump.
 */
export function forecastCurve(
  mem: MemoryState,
  reviews: readonly PlannedReview[],
  fromAbs: number,
  toAbs: number,
  stepMin = 360,
): CurvePoint[] {
  const pts: CurvePoint[] = []
  if (!(toAbs > fromAbs)) return pts
  const ordered = [...reviews]
    .filter((r) => r.atAbs > Math.max(mem.anchor, fromAbs) - 1e-9 && r.atAbs <= toAbs)
    .sort((a, b) => a.atAbs - b.atAbs)

  let state = mem
  let cursor = fromAbs
  const sampleTo = (end: number) => {
    for (let t = cursor; t < end; t += stepMin) pts.push({ atAbs: t, recall: recallAt(state, t) })
  }
  for (const r of ordered) {
    sampleTo(r.atAbs)
    pts.push({ atAbs: r.atAbs, recall: recallAt(state, r.atAbs) })
    state = expectedReviewTransition(state, r.atAbs, r.durationMin, r.pComplete)
    pts.push({ atAbs: r.atAbs, recall: recallAt(state, r.atAbs) })
    cursor = r.atAbs + stepMin
  }
  sampleTo(toAbs)
  pts.push({ atAbs: toAbs, recall: recallAt(state, toAbs) })
  return pts
}

export type RecallStatus = 'strong' | 'steady' | 'fading' | 'attention'

export function recallStatus(recall: number): RecallStatus {
  if (recall >= E.STATUS_STRONG) return 'strong'
  if (recall >= E.STATUS_STEADY) return 'steady'
  if (recall >= E.STATUS_FADING) return 'fading'
  return 'attention'
}

export const STATUS_LABEL: Record<RecallStatus, string> = {
  strong: 'Strong',
  steady: 'Steady',
  fading: 'Fading',
  attention: 'Needs attention',
}
