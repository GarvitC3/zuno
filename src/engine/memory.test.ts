import { describe, expect, it } from 'vitest'
import { ENGINE as E } from './config'
import {
  forecastCurve,
  initialMemory,
  projectedRecall,
  recallAt,
  reviewTransition,
  safeStability,
  sanitizeMemory,
  updateFromQuiz,
} from './memory'
import { MIN_PER_DAY } from './time'

const T0 = 1_000_000 * MIN_PER_DAY // arbitrary absolute minute
const mem = (recall = 0.8, stability = 5) => ({ anchor: T0, recall, stability, source: 'quiz' as const, assessments: 1 })
const days = (n: number) => T0 + n * MIN_PER_DAY

describe('forgetting curve R(t) = A·exp(−t/S)', () => {
  it('matches the formula exactly', () => {
    expect(recallAt(mem(0.8, 5), days(5))).toBeCloseTo(0.8 / Math.E, 10)
    expect(recallAt(mem(0.8, 5), days(0))).toBeCloseTo(0.8, 10)
  })

  it('always stays between 0 and 1', () => {
    for (const a of [-3, 0, 0.5, 1, 2, NaN]) {
      for (const s of [-1, 0, 0.01, 5, 1e9, NaN]) {
        for (const d of [-10, 0, 1, 30, 1e6]) {
          const r = recallAt({ ...mem(), recall: a, stability: s }, days(d))
          expect(r).toBeGreaterThanOrEqual(0)
          expect(r).toBeLessThanOrEqual(1)
          expect(Number.isFinite(r)).toBe(true)
        }
      }
    }
  })

  it('decays over time when nothing is reviewed', () => {
    let prev = Infinity
    for (let d = 0; d <= 40; d += 2) {
      const r = recallAt(mem(0.9, 6), days(d))
      expect(r).toBeLessThan(prev)
      prev = r
    }
  })

  it('forgets faster when stability is smaller', () => {
    expect(recallAt(mem(0.9, 2), days(5))).toBeLessThan(recallAt(mem(0.9, 10), days(5)))
  })

  it('never "un-forgets": times before the anchor use zero elapsed time', () => {
    expect(recallAt(mem(0.7, 4), days(-5))).toBeCloseTo(0.7, 10)
  })

  it('keeps stability positive and handles missing or corrupt input', () => {
    expect(safeStability(-4)).toBeGreaterThan(0)
    expect(safeStability(0)).toBeGreaterThan(0)
    expect(safeStability(NaN)).toBeGreaterThan(0)
    const repaired = sanitizeMemory({ recall: NaN, stability: -1 } as never, T0)
    expect(repaired.stability).toBeGreaterThan(0)
    expect(repaired.recall).toBeGreaterThanOrEqual(0)
    expect(repaired.anchor).toBe(T0)
    expect(sanitizeMemory(null, T0).stability).toBeGreaterThan(0)
  })
})

describe('initial familiarity', () => {
  it('maps higher familiarity to higher starting recall', () => {
    const recalls = ([1, 2, 3, 4, 5] as const).map((f) => initialMemory(f, T0).recall)
    expect([...recalls].sort((a, b) => a - b)).toEqual(recalls)
  })
  it('treats "not sure" as a neutral estimate flagged as a guess', () => {
    const m = initialMemory(null, T0)
    expect(m.source).toBe('unsure')
    expect(m.recall).toBe(E.UNSURE_RECALL)
  })
})

describe('recall-check update', () => {
  it('lowers the estimate after a weak result and raises it after a strong one', () => {
    const base = mem(0.6, 6)
    const weak = updateFromQuiz(base, { correct: 1, total: 5 }, T0)
    const strong = updateFromQuiz(base, { correct: 5, total: 5 }, T0)
    expect(weak.next.recall).toBeLessThan(0.6)
    expect(strong.next.recall).toBeGreaterThan(0.6)
    expect(strong.next.stability).toBeGreaterThan(weak.next.stability)
  })

  it('is exactly the Beta-Binomial posterior mean', () => {
    const u = updateFromQuiz(mem(0.6, 6), { correct: 2, total: 5 }, T0)
    expect(u.next.recall).toBeCloseTo((E.PRIOR_STRENGTH * 0.6 + 2) / (E.PRIOR_STRENGTH + 5), 10)
  })

  it('trusts bigger quizzes more', () => {
    const small = updateFromQuiz(mem(0.8, 6), { correct: 0, total: 1 }, T0)
    const big = updateFromQuiz(mem(0.8, 6), { correct: 0, total: 10 }, T0)
    expect(big.evidenceWeight).toBeGreaterThan(small.evidenceWeight)
    expect(big.next.recall).toBeLessThan(small.next.recall)
  })

  it('keeps the observed score distinct from the model estimate', () => {
    const u = updateFromQuiz(mem(0.6, 6), { correct: 2, total: 5 }, T0)
    expect(u.observed).toBe(0.4)
    expect(u.next.recall).not.toBe(u.observed)
    expect(u.next.source).toBe('quiz')
    expect(u.next.anchor).toBe(T0)
    expect(u.next.assessments).toBe(2)
  })

  it('does not mutate its input and clamps bad scores', () => {
    const base = Object.freeze(mem(0.6, 6))
    const u = updateFromQuiz(base, { correct: 99, total: 5 }, T0)
    expect(u.observed).toBe(1)
    expect(updateFromQuiz(base, { correct: -3, total: 0 }, T0).next.recall).toBeGreaterThanOrEqual(0)
    expect(updateFromQuiz(base, { correct: NaN, total: NaN }, T0).next.recall).toBeLessThanOrEqual(1)
  })

  it('lets a first check override a guessed starting point faster', () => {
    const guess = { ...mem(0.4, 5), source: 'unsure' as const }
    const known = { ...mem(0.4, 5), source: 'familiarity' as const }
    const a = updateFromQuiz(guess, { correct: 5, total: 5 }, T0).next.recall
    const b = updateFromQuiz(known, { correct: 5, total: 5 }, T0).next.recall
    expect(a).toBeGreaterThan(b)
  })

  it('applies the struggle flag to the pre-check forecast', () => {
    const plain = updateFromQuiz(mem(0.8, 8), { correct: 3, total: 5 }, days(6), false)
    const flagged = updateFromQuiz(mem(0.8, 8), { correct: 3, total: 5 }, days(6), true)
    expect(flagged.recallBefore).toBeLessThan(plain.recallBefore)
  })
})

describe('hypothetical review transition', () => {
  it('never assumes perfect recall', () => {
    for (const d of [15, 30, 60, 180, 600]) {
      const m = reviewTransition(mem(0.1, 3), days(1), d)
      expect(m.recall).toBeLessThanOrEqual(E.REVIEW_CEILING + 1e-9)
    }
  })
  it('longer sessions help more, with diminishing returns', () => {
    const r = (d: number) => reviewTransition(mem(0.2, 3), days(2), d).recall
    expect(r(45)).toBeGreaterThan(r(15))
    expect(r(45) - r(30)).toBeLessThan(r(30) - r(15))
  })
  it('gives sessions at or below the overhead no effect', () => {
    const before = recallAt(mem(0.3, 3), days(1))
    expect(reviewTransition(mem(0.3, 3), days(1), E.SESSION_OVERHEAD_MIN).recall).toBeCloseTo(before, 10)
  })
  it('rewards well-spaced reviews with more stability than premature ones', () => {
    const early = reviewTransition(mem(0.9, 10), days(0.1), 30).stability / 10
    const late = reviewTransition(mem(0.9, 2), days(8), 30).stability / 2
    expect(late).toBeGreaterThan(early)
  })
})

describe('forecasts', () => {
  const exam = days(14)
  it('a planned review improves exam-day recall over no review', () => {
    const none = projectedRecall(mem(0.5, 4), [], exam)
    const one = projectedRecall(mem(0.5, 4), [{ atAbs: days(12), durationMin: 30, pComplete: 1 }], exam)
    expect(one).toBeGreaterThan(none)
  })
  it('a review that is unlikely to happen helps less', () => {
    const sure = projectedRecall(mem(0.5, 4), [{ atAbs: days(12), durationMin: 30, pComplete: 1 }], exam)
    const unlikely = projectedRecall(mem(0.5, 4), [{ atAbs: days(12), durationMin: 30, pComplete: 0.2 }], exam)
    const never = projectedRecall(mem(0.5, 4), [{ atAbs: days(12), durationMin: 30, pComplete: 0 }], exam)
    expect(sure).toBeGreaterThan(unlikely)
    expect(unlikely).toBeGreaterThan(never)
    expect(never).toBeCloseTo(projectedRecall(mem(0.5, 4), [], exam), 10)
  })
  it('ignores reviews scheduled after the target', () => {
    const base = projectedRecall(mem(0.5, 4), [], exam)
    expect(projectedRecall(mem(0.5, 4), [{ atAbs: days(20), durationMin: 60, pComplete: 1 }], exam)).toBeCloseTo(base, 10)
  })
  it('has diminishing returns for a second back-to-back review', () => {
    const one = [{ atAbs: days(12), durationMin: 30, pComplete: 1 }]
    const two = [...one, { atAbs: days(12) + 60, durationMin: 30, pComplete: 1 }]
    const g1 = projectedRecall(mem(0.3, 4), one, exam) - projectedRecall(mem(0.3, 4), [], exam)
    const g2 = projectedRecall(mem(0.3, 4), two, exam) - projectedRecall(mem(0.3, 4), one, exam)
    expect(g2).toBeLessThan(g1 / 2)
  })
  it('draws a curve that stays within [0, 1] and jumps at reviews', () => {
    const pts = forecastCurve(mem(0.5, 4), [{ atAbs: days(7), durationMin: 30, pComplete: 1 }], days(0), exam)
    expect(pts.length).toBeGreaterThan(5)
    for (const p of pts) {
      expect(p.recall).toBeGreaterThanOrEqual(0)
      expect(p.recall).toBeLessThanOrEqual(1)
    }
    const at7 = pts.filter((p) => p.atAbs === days(7))
    expect(at7).toHaveLength(2)
    expect(at7[1].recall).toBeGreaterThan(at7[0].recall)
  })
})
