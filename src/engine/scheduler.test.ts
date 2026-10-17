import { describe, expect, it } from 'vitest'
import { createDemoData } from '../data/demo'
import { basicData, NOW, planViolations, plannedMinutesFor } from '../test-utils'
import { updateCompletion } from './completion'
import { explainSession } from './insights'
import { replan } from './plan'
import { addDays, momentToAbs } from './time'
import type { AppData } from '../types'

const planned = (d: AppData) => d.sessions.filter((s) => s.status === 'planned')

describe('scheduler constraints', () => {
  it('produces a valid demo plan: no overlaps, no commitment clashes, nothing after an exam', () => {
    const d = createDemoData(NOW)
    expect(planned(d).length).toBeGreaterThan(10)
    expect(planViolations(d, NOW)).toEqual([])
  })

  it('stays valid for many different "now" moments, including late evening and weekends', () => {
    for (let day = 0; day < 9; day++) {
      for (const minute of [0, 8 * 60, 15 * 60 + 40, 18 * 60 + 29, 20 * 60 + 55, 23 * 60 + 59]) {
        const now = { date: addDays('2026-10-17', day), minute }
        const d = createDemoData(now)
        expect(planViolations(d, now), `${now.date} ${minute}`).toEqual([])
        for (const s of planned(d)) expect(s.date >= now.date).toBe(true)
      }
    }
  })

  it('is deterministic', () => {
    const a = JSON.stringify(createDemoData(NOW).sessions)
    const b = JSON.stringify(createDemoData(NOW).sessions)
    expect(a).toBe(b)
  })

  it('never schedules more than one session per topic per day, or beyond the daily limit', () => {
    const d = createDemoData(NOW)
    const seen = new Set<string>()
    const perDay = new Map<string, number>()
    for (const s of planned(d)) {
      const k = `${s.topicId}|${s.date}`
      expect(seen.has(k)).toBe(false)
      seen.add(k)
      perDay.set(s.date, (perDay.get(s.date) ?? 0) + s.durationMin)
    }
    for (const m of perDay.values()) expect(m).toBeLessThanOrEqual(d.availability.maxDailyMin)
  })

  it('does not schedule topics whose exam has passed', () => {
    const d = basicData(NOW, { plan: false })
    d.exams[0] = { ...d.exams[0], date: addDays(NOW.date, -1) }
    const out = replan(d, NOW).data
    expect(planned(out).filter((s) => s.topicId.startsWith('sA')).length).toBe(0)
    expect(planned(out).filter((s) => s.topicId.startsWith('sB')).length).toBeGreaterThan(0)
  })

  it('returns no sessions and an honest reason when there is no availability at all', () => {
    const d = basicData(NOW, { availability: { windows: [] }, plan: false })
    const out = replan(d, NOW).data
    expect(planned(out)).toHaveLength(0)
    expect(out.planMeta.unmet.length).toBeGreaterThan(0)
    expect(out.planMeta.unmet.every((u) => u.reason === 'no_free_time')).toBe(true)
  })

  it('reports unmet need instead of overlapping when the workload is impossible', () => {
    // 6 topics, exams within days, but only one 30-minute window on a single day.
    const d = basicData(NOW, {
      examA: 3,
      examB: 4,
      availability: { windows: [{ id: 'tiny', days: [2], startMin: 16 * 60, endMin: 16 * 60 + 30 }], maxDailyMin: 120 },
      plan: false,
    })
    const out = replan(d, NOW).data
    expect(planned(out).length).toBeLessThanOrEqual(1)
    expect(planViolations(out, NOW)).toEqual([])
    expect(out.planMeta.unmet.length).toBeGreaterThanOrEqual(4)
    for (const u of out.planMeta.unmet) {
      expect(u.extraMinutes).toBeGreaterThan(0)
      expect(u.projectedRecall).toBeLessThan(u.targetRecall)
      expect(['no_free_time', 'daily_limit', 'budget']).toContain(u.reason)
    }
  })

  it('blames the daily limit when free time exists but the cap is reached', () => {
    const d = basicData(NOW, { examA: 2, examB: 2, perSubject: 4, availability: { maxDailyMin: 30 }, plan: false })
    const out = replan(d, NOW).data
    expect(out.planMeta.unmet.some((u) => u.reason === 'daily_limit')).toBe(true)
    expect(planViolations(out, NOW)).toEqual([])
  })

  it('respects a total-time budget', () => {
    const d = basicData(NOW, { plan: false })
    const { result } = replan(d, NOW, { budgetMin: 90 })
    expect(result.totalMinutes).toBeLessThanOrEqual(90)
    expect(result.totalMinutes).toBeGreaterThan(0)
  })

  it('does not review a topic that is already strong', () => {
    const d = basicData(NOW, { plan: false })
    d.topics = d.topics.map((t, i) => (i === 0 ? { ...t, memory: { ...t.memory, recall: 0.99, stability: 120 } } : t))
    const out = replan(d, NOW).data
    expect(plannedMinutesFor(out, d.topics[0].id, NOW)).toBe(0)
  })

  it('spends scarce time on important, weak topics first', () => {
    const d = basicData(NOW, { plan: false })
    d.topics = d.topics.map((t) =>
      t.id === 'sA-t1'
        ? { ...t, importance: 5, memory: { ...t.memory, recall: 0.15 } }
        : t.id === 'sA-t3'
          ? { ...t, importance: 1, memory: { ...t.memory, recall: 0.7 } }
          : t,
    )
    const out = replan(d, NOW, { budgetMin: 60 }).data
    expect(plannedMinutesFor(out, 'sA-t1', NOW)).toBeGreaterThanOrEqual(30)
    expect(plannedMinutesFor(out, 'sA-t3', NOW)).toBe(0)
  })

  it('stops adding reviews once more would be of little use (diminishing marginal gains)', () => {
    const d = basicData(NOW, { examA: 20, examB: 20, perSubject: 1, availability: { maxDailyMin: 240 }, plan: false })
    const out = replan(d, NOW)
    for (const t of d.topics) {
      const mine = planned(out.data).filter((s) => s.topicId === t.id)
      expect(mine.length).toBeLessThan(20) // 20 days are available; not a session every day
      expect(mine.length).toBeGreaterThan(1)
      // every kept session still adds something once the others are in the plan
      for (const s of mine) {
        const e = explainSession(out.data, s, NOW)!
        expect(e.examGain).toBeGreaterThanOrEqual(0)
      }
    }
    for (const tp of Object.values(out.result.perTopic)) {
      expect(tp.projectedWith).toBeGreaterThan(tp.projectedWithout)
      expect(tp.projectedWith).toBeLessThanOrEqual(1)
    }
  })

  it('prefers shorter sessions when the student abandons long ones', () => {
    let d = basicData(NOW, { availability: { preferredSessionMin: 60 }, plan: false })
    for (let i = 0; i < 6; i++) d = { ...d, completion: updateCompletion(d.completion, 60, { kind: 'skipped' }) }
    for (let i = 0; i < 6; i++) d = { ...d, completion: updateCompletion(d.completion, 40, { kind: 'completed' }) }
    const out = replan(d, NOW).data
    expect(Math.max(...planned(out).map((s) => s.durationMin))).toBeLessThanOrEqual(40)
  })

  it('keeps the preferred length when the student reliably finishes it', () => {
    let d = basicData(NOW, { availability: { preferredSessionMin: 60 }, plan: false })
    for (let i = 0; i < 10; i++) d = { ...d, completion: updateCompletion(d.completion, 60, { kind: 'completed' }) }
    for (let i = 0; i < 10; i++) d = { ...d, completion: updateCompletion(d.completion, 40, { kind: 'skipped' }) }
    const out = replan(d, NOW).data
    expect(planned(out).some((s) => s.durationMin === 60)).toBe(true)
  })

  it('never plans a session starting in the past', () => {
    const late = { date: NOW.date, minute: 17 * 60 + 40 }
    const d = basicData(late, { plan: false })
    const out = replan(d, late).data
    const nowAbs = momentToAbs(late)
    for (const s of planned(out)) expect(s.date > late.date || s.startMin >= late.minute).toBe(true)
    expect(nowAbs).toBeGreaterThan(0)
  })
})
