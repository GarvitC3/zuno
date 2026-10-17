import { describe, expect, it } from 'vitest'
import {
  betaMean,
  betaStdDev,
  durationGroup,
  initialCompletionModel,
  isInitialEstimate,
  outcomeFromMinutes,
  pComplete,
  sanitizeCompletion,
  updateCompletion,
} from './completion'
import { ENGINE as E } from './config'

describe('completion probability (Beta-Bernoulli)', () => {
  it('starts from the documented prior for new users', () => {
    const m = initialCompletionModel()
    expect(pComplete(m, 15)).toBeCloseTo(E.COMPLETION_PRIORS.short.alpha / 4, 10)
    expect(pComplete(m, 30)).toBeCloseTo(0.7, 10)
    expect(pComplete(m, 60)).toBeCloseTo(0.55, 10)
    expect(isInitialEstimate(m, 'medium')).toBe(true)
  })

  it('p = alpha / (alpha + beta)', () => {
    expect(betaMean({ alpha: 3, beta: 1 })).toBe(0.75)
  })

  it('rises with completed sessions and falls with skipped ones', () => {
    let m = initialCompletionModel()
    const start = pComplete(m, 30)
    for (let i = 0; i < 5; i++) m = updateCompletion(m, 30, { kind: 'completed' })
    const up = pComplete(m, 30)
    expect(up).toBeGreaterThan(start)
    for (let i = 0; i < 10; i++) m = updateCompletion(m, 30, { kind: 'skipped' })
    expect(pComplete(m, 30)).toBeLessThan(up)
  })

  it('treats a partial session as in-between a completion and a skip', () => {
    const base = initialCompletionModel()
    const done = pComplete(updateCompletion(base, 30, { kind: 'completed' }), 30)
    const half = pComplete(updateCompletion(base, 30, { kind: 'partial', fraction: 0.5 }), 30)
    const skip = pComplete(updateCompletion(base, 30, { kind: 'skipped' }), 30)
    expect(skip).toBeLessThan(half)
    expect(half).toBeLessThan(done)
  })

  it('learns duration groups separately', () => {
    let m = initialCompletionModel()
    for (let i = 0; i < 6; i++) m = updateCompletion(m, 30, { kind: 'completed' })
    for (let i = 0; i < 6; i++) m = updateCompletion(m, 60, { kind: 'skipped' })
    expect(pComplete(m, 30)).toBeGreaterThan(0.8)
    expect(pComplete(m, 60)).toBeLessThan(0.3)
    expect(pComplete(m, 15)).toBeCloseTo(pComplete(initialCompletionModel(), 15), 10) // untouched group
  })

  it('assigns durations to coarse groups', () => {
    expect(durationGroup(20)).toBe('short')
    expect(durationGroup(21)).toBe('medium')
    expect(durationGroup(40)).toBe('medium')
    expect(durationGroup(41)).toBe('long')
  })

  it('does not mutate the previous model', () => {
    const m = Object.freeze(initialCompletionModel())
    const next = updateCompletion(m, 30, { kind: 'completed' })
    expect(next).not.toBe(m)
    expect(m.medium.alpha).toBe(E.COMPLETION_PRIORS.medium.alpha)
  })

  it('becomes more certain as evidence accumulates', () => {
    let m = initialCompletionModel()
    const before = betaStdDev(m.medium)
    for (let i = 0; i < 20; i++) m = updateCompletion(m, 30, { kind: i % 4 === 0 ? 'skipped' : 'completed' })
    expect(betaStdDev(m.medium)).toBeLessThan(before)
    expect(isInitialEstimate(m, 'medium')).toBe(false)
  })

  it('classifies minutes studied', () => {
    expect(outcomeFromMinutes(30, 30).kind).toBe('completed')
    expect(outcomeFromMinutes(30, 28).kind).toBe('completed')
    expect(outcomeFromMinutes(30, 15)).toEqual({ kind: 'partial', fraction: 0.5 })
    expect(outcomeFromMinutes(30, 0).kind).toBe('skipped')
    expect(outcomeFromMinutes(0, 10).kind).toBe('skipped')
  })

  it('repairs corrupt models', () => {
    const m = sanitizeCompletion({ short: { alpha: -1, beta: NaN }, medium: { alpha: 5, beta: 2 } } as never)
    expect(m.short).toEqual(E.COMPLETION_PRIORS.short)
    expect(m.medium).toEqual({ alpha: 5, beta: 2 })
    expect(m.long).toEqual(E.COMPLETION_PRIORS.long)
    expect(sanitizeCompletion(undefined).medium.alpha).toBeGreaterThan(0)
  })
})
