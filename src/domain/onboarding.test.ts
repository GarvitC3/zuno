import { describe, expect, it } from 'vitest'
import { NOW, planViolations } from '../test-utils'
import { addDays } from '../engine/time'
import { explainSession, describeExplanation, upNext } from '../engine/insights'
import {
  availabilityWarnings,
  draftToData,
  emptyDraft,
  newDraftSubject,
  newDraftTopic,
  proposalSummary,
  validateAvailability,
  validateSubjects,
  type OnboardingDraft,
} from './onboarding'
import type { Availability } from '../types'

const av = (over: Partial<Availability> = {}): Availability => ({
  windows: [{ id: 'w', days: [1, 2, 3, 4, 5], startMin: 16 * 60, endMin: 18 * 60 }],
  commitments: [],
  extraWindows: [],
  blockedDates: [],
  preferredSessionMin: 30,
  breakMin: 10,
  maxDailyMin: 120,
  ...over,
})

function validDraft(): OnboardingDraft {
  const s = newDraftSubject()
  s.name = 'Biology'
  s.examDate = addDays(NOW.date, 10)
  s.topics = [{ ...newDraftTopic(), name: 'Cells', importance: 4, familiarity: 2 }, { ...newDraftTopic(), name: 'Genetics', importance: 3, familiarity: null }]
  return { name: 'Alex', subjects: [s], availability: av() }
}

describe('setup validation explains errors beside the field', () => {
  it('accepts a complete draft', () => {
    expect(validateSubjects(validDraft(), NOW.date)).toEqual({})
    expect(validateAvailability(validDraft().availability)).toEqual({})
  })

  it('flags missing names, dates and topics with field-specific keys', () => {
    const d = emptyDraft()
    const e = validateSubjects(d, NOW.date)
    const s = d.subjects[0]
    expect(e[`subject:${s.id}:name`]).toMatch(/name/i)
    expect(e[`subject:${s.id}:exam`]).toMatch(/exam date/i)
    expect(e[`topic:${s.topics[0].id}:name`]).toBeTruthy()
  })

  it('rejects exam dates that are today, in the past, or too far away', () => {
    const d = validDraft()
    for (const date of [NOW.date, addDays(NOW.date, -3), addDays(NOW.date, 500), '2026-02-31']) {
      d.subjects[0].examDate = date
      expect(validateSubjects(d, NOW.date)[`subject:${d.subjects[0].id}:exam`], date).toBeTruthy()
    }
  })

  it('rejects duplicate subject and topic names', () => {
    const d = validDraft()
    const s2 = newDraftSubject()
    s2.name = 'biology'
    s2.examDate = addDays(NOW.date, 5)
    s2.topics[0].name = 'x'
    d.subjects.push(s2)
    d.subjects[0].topics[1].name = 'cells'
    const e = validateSubjects(d, NOW.date)
    expect(e[`subject:${s2.id}:name`]).toMatch(/already/)
    expect(e[`topic:${d.subjects[0].topics[1].id}:name`]).toMatch(/already/)
  })

  it('catches contradictory availability', () => {
    expect(validateAvailability(av({ windows: [] })).windows).toBeTruthy()
    expect(validateAvailability(av({ windows: [{ id: 'a', days: [1], startMin: 18 * 60, endMin: 16 * 60 }] }))['window:a']).toMatch(/after the start/)
    expect(validateAvailability(av({ windows: [{ id: 'a', days: [], startMin: 16 * 60, endMin: 17 * 60 }] }))['window:a']).toMatch(/day/)
    expect(validateAvailability(av({ windows: [{ id: 'a', days: [1], startMin: 16 * 60, endMin: 16 * 60 + 5 }] }))['window:a']).toMatch(/at least/)
    const overlap = validateAvailability(av({ windows: [{ id: 'a', days: [1], startMin: 16 * 60, endMin: 18 * 60 }, { id: 'b', days: [1], startMin: 17 * 60, endMin: 19 * 60 }] }))
    expect(overlap['window:b']).toMatch(/overlaps/)
    const covered = validateAvailability(
      av({ commitments: [{ id: 'c', label: 'Work', kind: 'work', days: [1, 2, 3, 4, 5], startMin: 15 * 60, endMin: 19 * 60 }] }),
    )
    expect(covered['window:w']).toMatch(/commitments already cover/)
    expect(validateAvailability(av({ commitments: [{ id: 'c', label: '', kind: 'other', days: [1], startMin: 600, endMin: 660 }] }))['commitment:c']).toMatch(/name/)
    expect(validateAvailability(av({ commitments: [{ id: 'c', label: 'x', kind: 'other', days: [1], startMin: 600, endMin: 600 }] }))['commitment:c']).toMatch(/same/)
    expect(validateAvailability(av({ maxDailyMin: 10 })).daily).toBeTruthy()
    expect(validateAvailability(av({ preferredSessionMin: 5 })).session).toBeTruthy()
  })

  it('allows overnight commitments like sleep', () => {
    const e = validateAvailability(av({ commitments: [{ id: 's', label: 'Sleep', kind: 'sleep', days: [0, 1, 2, 3, 4, 5, 6], startMin: 23 * 60, endMin: 7 * 60 }] }))
    expect(e).toEqual({})
  })

  it('warns, without blocking, when a window is shorter than the session length', () => {
    const w = availabilityWarnings(av({ windows: [{ id: 'a', days: [1], startMin: 16 * 60, endMin: 16 * 60 + 20 }], preferredSessionMin: 45 }))
    expect(w['window:a']).toMatch(/Shorter than/)
  })
})

describe('building the first plan', () => {
  it('produces a valid, explained plan for a new student', () => {
    const data = draftToData(validDraft(), NOW)
    expect(data.onboarded).toBe(true)
    expect(data.topics).toHaveLength(2)
    expect(data.sessions.every((s) => s.status === 'planned')).toBe(true)
    expect(data.sessions.length).toBeGreaterThan(0)
    expect(planViolations(data, NOW)).toEqual([])
    const sum = proposalSummary(data, NOW)
    expect(sum.sessionCount).toBe(data.sessions.length)
    expect(sum.bullets.join(' ')).toMatch(/neutral starting estimate/)
    expect(sum.bullets.join(' ')).toMatch(/assumed average/)
  })

  it('uses the student\'s preferred length until their own history says otherwise', () => {
    const d = validDraft()
    d.availability = av({ preferredSessionMin: 45, windows: [{ id: 'w', days: [0, 1, 2, 3, 4, 5, 6], startMin: 16 * 60, endMin: 19 * 60 }] })
    const data = draftToData(d, NOW)
    expect(data.sessions.length).toBeGreaterThan(0)
    expect(data.sessions.every((s) => s.durationMin === 45)).toBe(true)
  })

  it('explains a first recommendation from known inputs and labels the estimate', () => {
    const data = draftToData(validDraft(), NOW)
    const next = upNext(data, NOW)!
    const exp = explainSession(data, next, NOW)!
    expect(exp.hasHistory).toBe(false)
    const text = describeExplanation(exp, { topic: 'Cells', subject: 'Biology' }, data.completion, next.durationMin)
    expect(text.headline).toMatch(/starting estimate/)
    expect(text.details.join(' ')).toMatch(/initial estimate/)
  })

  it('is honest when there is no study time at all', () => {
    const d = validDraft()
    d.availability = av({ windows: [] })
    const data = draftToData(d, NOW)
    expect(data.sessions).toHaveLength(0)
    expect(data.planMeta.unmet.length).toBeGreaterThan(0)
    expect(proposalSummary(data, NOW).headline).toMatch(/no room/i)
  })
})
