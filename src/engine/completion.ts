/**
 * Completion probability — a Beta-Bernoulli model.
 *
 * For each coarse duration group (short / medium / long) the chance that a
 * planned session is completed is modelled as p ~ Beta(alpha, beta):
 *
 *     p_complete = alpha / (alpha + beta)
 *
 * New users start from a documented prior (see ENGINE.COMPLETION_PRIORS).
 * Each outcome updates only its own group:
 *   completed → alpha += 1
 *   skipped   → beta  += 1
 *   partial   → alpha += f, beta += (1 - f)   where f = minutes done / minutes planned
 *
 * The partial rule is a pragmatic approximation: a strict Bernoulli outcome is
 * 0 or 1, so a fractional observation is not a true likelihood. We use it so
 * "I did most of it" counts for more than "I skipped it" without throwing the
 * evidence away.
 *
 * Groups are kept coarse (3) on purpose: finer segmentation would leave each
 * group with too little data to learn anything.
 */
import type { BetaParams, CompletionModel, DurationGroup } from '../types'
import { ENGINE as E } from './config'
import { clamp, clamp01 } from './memory'

export function durationGroup(durationMin: number): DurationGroup {
  if (durationMin <= E.SHORT_MAX_MIN) return 'short'
  if (durationMin <= E.MEDIUM_MAX_MIN) return 'medium'
  return 'long'
}

export const GROUP_LABEL: Record<DurationGroup, string> = {
  short: `up to ${E.SHORT_MAX_MIN} min`,
  medium: `${E.SHORT_MAX_MIN + 1}–${E.MEDIUM_MAX_MIN} min`,
  long: `over ${E.MEDIUM_MAX_MIN} min`,
}

export function initialCompletionModel(): CompletionModel {
  const p = E.COMPLETION_PRIORS
  return {
    short: { ...p.short },
    medium: { ...p.medium },
    long: { ...p.long },
  }
}

const validBeta = (b: Partial<BetaParams> | undefined): b is BetaParams =>
  !!b && Number.isFinite(b.alpha) && Number.isFinite(b.beta) && (b.alpha as number) > 0 && (b.beta as number) > 0

/** Repair a possibly-corrupt model (missing groups, non-positive parameters). */
export function sanitizeCompletion(m: Partial<CompletionModel> | null | undefined): CompletionModel {
  const base = initialCompletionModel()
  return {
    short: validBeta(m?.short) ? { alpha: m!.short!.alpha, beta: m!.short!.beta } : base.short,
    medium: validBeta(m?.medium) ? { alpha: m!.medium!.alpha, beta: m!.medium!.beta } : base.medium,
    long: validBeta(m?.long) ? { alpha: m!.long!.alpha, beta: m!.long!.beta } : base.long,
  }
}

export function betaMean(b: BetaParams): number {
  return b.alpha / (b.alpha + b.beta)
}

export function betaStdDev(b: BetaParams): number {
  const n = b.alpha + b.beta
  return Math.sqrt((b.alpha * b.beta) / (n * n * (n + 1)))
}

/** Probability that a session of this length will be completed. */
export function pComplete(model: CompletionModel, durationMin: number): number {
  return clamp01(betaMean(model[durationGroup(durationMin)]))
}

export type SessionOutcome =
  | { kind: 'completed' }
  | { kind: 'skipped' }
  | { kind: 'partial'; fraction: number }

export function outcomeFromMinutes(plannedMin: number, actualMin: number): SessionOutcome {
  if (!(plannedMin > 0)) return { kind: 'skipped' }
  const f = clamp(actualMin / plannedMin, 0, 1)
  if (f >= E.PARTIAL_FULL_CREDIT_FRACTION) return { kind: 'completed' }
  if (f <= 0) return { kind: 'skipped' }
  return { kind: 'partial', fraction: f }
}

/** Returns a NEW model; the input is never mutated. */
export function updateCompletion(model: CompletionModel, durationMin: number, outcome: SessionOutcome): CompletionModel {
  const g = durationGroup(durationMin)
  const cur = model[g]
  let next: BetaParams
  switch (outcome.kind) {
    case 'completed':
      next = { alpha: cur.alpha + 1, beta: cur.beta }
      break
    case 'skipped':
      next = { alpha: cur.alpha, beta: cur.beta + 1 }
      break
    case 'partial': {
      const f = clamp01(outcome.fraction)
      next = { alpha: cur.alpha + f, beta: cur.beta + (1 - f) }
      break
    }
  }
  return { ...model, [g]: next }
}

/** Number of real observations a group has seen beyond its prior. */
export function observationCount(model: CompletionModel, group: DurationGroup): number {
  const prior = E.COMPLETION_PRIORS[group]
  const cur = model[group]
  return Math.max(0, Math.round((cur.alpha + cur.beta - prior.alpha - prior.beta) * 100) / 100)
}

/** True while a group's estimate is still mostly the starting assumption. */
export function isInitialEstimate(model: CompletionModel, group: DurationGroup): boolean {
  return observationCount(model, group) < 3
}
