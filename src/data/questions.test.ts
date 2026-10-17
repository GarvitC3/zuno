import { describe, expect, it } from 'vitest'
import { QUESTION_BANK, hasQuestionBank, pickQuestions } from './questions'
import { createDemoData } from './demo'
import { NOW } from '../test-utils'

describe('question bank integrity', () => {
  it('every demo topic has a bank', () => {
    const data = createDemoData(NOW)
    for (const t of data.topics) expect(hasQuestionBank(t.bankKey), t.name).toBe(true)
  })

  it('every question is well formed with exactly one valid correct answer', () => {
    const ids = new Set<string>()
    for (const [key, list] of Object.entries(QUESTION_BANK)) {
      expect(list.length, key).toBeGreaterThanOrEqual(5)
      for (const q of list) {
        expect(ids.has(q.id), `${q.id} duplicated`).toBe(false)
        ids.add(q.id)
        expect(q.options).toHaveLength(4)
        expect(new Set(q.options).size, `${q.id} has duplicate options`).toBe(4)
        expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id).toBe(true)
        expect(q.prompt.length).toBeGreaterThan(10)
        expect(q.explanation.length).toBeGreaterThan(15)
      }
    }
  })

  it('varies where the right answer sits', () => {
    const positions = new Set(Object.values(QUESTION_BANK).flat().map((q) => q.answer))
    expect(positions.size).toBe(4)
  })

  it('rotates questions across repeat checks and never invents a bank', () => {
    const first = pickQuestions('phys.newton', 0).map((q) => q.id)
    const second = pickQuestions('phys.newton', 1).map((q) => q.id)
    expect(first).toHaveLength(5)
    expect(second).not.toEqual(first)
    expect(pickQuestions('made.up', 0)).toEqual([])
    expect(hasQuestionBank(undefined)).toBe(false)
    expect(hasQuestionBank('made.up')).toBe(false)
  })
})
