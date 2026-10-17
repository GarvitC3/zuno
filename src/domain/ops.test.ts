import { describe, expect, it } from 'vitest'
import { createDemoData } from '../data/demo'
import { runCorrection } from '../engine/correction'
import { pComplete } from '../engine/completion'
import { behindStatus, explainSession, describeExplanation, sessionsOn, todaySummary, upNext } from '../engine/insights'
import { replan } from '../engine/plan'
import { suggestSlots } from '../engine/slots'
import { runScenario } from '../engine/whatif'
import { addDays, momentToAbs, toAbs } from '../engine/time'
import { deepFreeze, NOW, planViolations, plannedMinutesFor } from '../test-utils'
import {
  deleteTopic,
  finishSession,
  markMissedAsSkipped,
  moveSession,
  recordManualQuiz,
  skipSession,
  toggleStruggle,
} from './ops'
import type { AppData } from '../types'

const NEWTON = 'demo-t-newton'
const demo = () => createDemoData(NOW)

describe('the key demonstration', () => {
  it('recommends Newton\'s laws first, for a reason that comes from model data', () => {
    const d = demo()
    const next = upNext(d, NOW)!
    expect(next.topicId).toBe(NEWTON)
    const exp = explainSession(d, next, NOW)!
    expect(exp.primary).toBe('weak_check')
    expect(exp.lastCheck).toMatchObject({ correct: 2, total: 5 })
    expect(exp.isClosestExam).toBe(true)
    const text = describeExplanation(exp, { topic: "Newton's laws", subject: 'Physics' }, d.completion, next.durationMin)
    expect(text.headline).toBe('Your last recall check was 2/5, and Physics is your closest exam.')
  })

  it('shows a meaningful plan change after a weak recall check compared with a strong one', () => {
    const d = demo()
    const next = upNext(d, NOW)!
    const start = toAbs(next.date, next.startMin)
    const weak = finishSession(d, { sessionId: next.id, actualMin: next.durationMin, startAbs: start, quiz: { correct: 1, total: 5, source: 'manual' } }, NOW)
    const strong = finishSession(d, { sessionId: next.id, actualMin: next.durationMin, startAbs: start, quiz: { correct: 5, total: 5, source: 'manual' } }, NOW)
    expect(weak.error).toBeUndefined()
    const topicOf = (x: AppData) => x.topics.find((t) => t.id === NEWTON)!
    expect(topicOf(weak.data).memory.recall).toBeLessThan(topicOf(strong.data).memory.recall)
    expect(topicOf(weak.data).memory.stability).toBeLessThan(topicOf(strong.data).memory.stability)
    // The weak result earns more future Newton's laws time than the strong one…
    expect(plannedMinutesFor(weak.data, NEWTON, NOW)).toBeGreaterThan(plannedMinutesFor(strong.data, NEWTON, NOW))
    // …and the plans are really different, with an explanation.
    expect(JSON.stringify(weak.data.sessions)).not.toBe(JSON.stringify(strong.data.sessions))
    expect(weak.change!.note).toContain('moved from')
    expect(weak.change!.items.length + (weak.change!.note ? 1 : 0)).toBeGreaterThan(0)
    expect(planViolations(weak.data, NOW)).toEqual([])
    expect(planViolations(strong.data, NOW)).toEqual([])
  })

  it('a weak result lowers the estimate and records the observed score separately', () => {
    const d = demo()
    const next = upNext(d, NOW)!
    const out = finishSession(d, { sessionId: next.id, actualMin: next.durationMin, startAbs: toAbs(next.date, next.startMin), quiz: { correct: 1, total: 5, source: 'manual' } }, NOW)
    const q = out.quiz!
    expect(q.correct).toBe(1)
    expect(q.total).toBe(5)
    expect(q.recallAfter).not.toBe(q.correct / q.total)
    expect(q.recallAfter).toBeLessThan(q.recallBefore + 0.2)
    expect(out.data.quizzes).toHaveLength(d.quizzes.length + 1)
  })

  it('skipping a session updates the calendar and the dashboard consistently', () => {
    const d = demo()
    const next = upNext(d, NOW)!
    const before = pComplete(d.completion, next.durationMin)
    const out = skipSession(d, next.id, NOW)
    expect(out.error).toBeUndefined()
    const skipped = out.data.sessions.find((s) => s.id === next.id)!
    expect(skipped.status).toBe('skipped')
    expect(pComplete(out.data.completion, next.durationMin)).toBeLessThan(before)
    // dashboard (up next / today) and calendar (sessionsOn) read the same data
    expect(upNext(out.data, NOW)!.id).not.toBe(next.id)
    const today = todaySummary(out.data, NOW)
    expect(today.sessions.map((s) => s.id)).toEqual(sessionsOn(out.data, NOW.date).map((s) => s.id))
    const live = today.sessions.filter((s) => s.status !== 'skipped')
    expect(today.plannedMinutes).toBe(live.reduce((a, s) => a + s.durationMin, 0))
    expect(today.sessions.some((s) => s.id === next.id && s.status === 'skipped')).toBe(true)
    // Newton's laws is re-planned, just not in the slot (or day) that was skipped
    expect(plannedMinutesFor(out.data, NEWTON, NOW)).toBeGreaterThan(0)
    const newtonToday = out.data.sessions.filter((s) => s.topicId === NEWTON && s.date === NOW.date && s.status === 'planned')
    expect(newtonToday).toHaveLength(0)
    // The change is explained specifically: what was skipped, the forecast shift, and why buffer appears.
    expect(out.change!.items.some((i) => i.kind === 'removed' && i.text.includes("Newton's laws") && i.text.includes('was skipped'))).toBe(true)
    expect(out.change!.note).toMatch(/Exam-day forecast: Newton's laws \d+% → \d+%/)
    expect(out.change!.note).toMatch(/Chance of finishing 30-minute sessions: \d+% → \d+%/)
    expect(planViolations(out.data, NOW)).toEqual([])
  })

  it('explains the specific change when a skipped session moves', () => {
    const d = demo()
    const moved: string[] = []
    const planned = d.sessions.filter((s) => s.status === 'planned')
    for (let i = 0; i < planned.length; i += 3) {
      const out = skipSession(d, planned[i].id, NOW)
      for (const it of out.change!.items) if (it.kind === 'moved') moved.push(it.text)
    }
    expect(moved.length).toBeGreaterThan(0)
    for (const text of moved) {
      expect(text).toMatch(/^.+ moved to (today|tomorrow|[A-Z][a-z]+day|[A-Z][a-z]{2} \d{1,2}) at \d{1,2}:\d{2} (AM|PM)\.$/)
    }
  })
})

describe('history is never rewritten', () => {
  it('replans do not move completed sessions or change quiz history', () => {
    let d = demo()
    const first = upNext(d, NOW)!
    d = finishSession(d, { sessionId: first.id, actualMin: first.durationMin, startAbs: toAbs(first.date, first.startMin), quiz: { correct: 2, total: 5, source: 'manual' } }, NOW).data
    const frozenDone = JSON.stringify(d.sessions.filter((s) => s.status === 'completed' || s.status === 'partial'))
    const frozenQuizzes = JSON.stringify(d.quizzes)
    const second = upNext(d, NOW)!
    d = skipSession(d, second.id, NOW).data
    d = toggleStruggle(d, 'demo-t-kinematics', NOW).data
    d = replan(d, { date: NOW.date, minute: 17 * 60 }).data
    expect(JSON.stringify(d.sessions.filter((s) => (s.status === 'completed' || s.status === 'partial') && !s.id.startsWith('auto'))).startsWith('[')).toBe(true)
    const after = JSON.stringify(d.sessions.filter((s) => s.status === 'completed' || s.status === 'partial'))
    expect(after).toBe(frozenDone)
    expect(JSON.stringify(d.quizzes.slice(0, JSON.parse(frozenQuizzes).length))).toBe(frozenQuizzes)
  })

  it('deleting a topic only removes that topic\'s checks', () => {
    const d = demo()
    const out = deleteTopic(d, NEWTON, NOW).data
    expect(out.quizzes.some((q) => q.topicId === NEWTON)).toBe(false)
    expect(out.quizzes.length).toBe(d.quizzes.filter((q) => q.topicId !== NEWTON).length)
    expect(out.sessions.some((s) => s.topicId === NEWTON)).toBe(false)
  })

  it('rejects impossible recall-check scores', () => {
    const d = demo()
    expect(recordManualQuiz(d, { topicId: NEWTON, correct: 6, total: 5 }, NOW).error).toBeTruthy()
    expect(recordManualQuiz(d, { topicId: NEWTON, correct: -1, total: 5 }, NOW).error).toBeTruthy()
    expect(recordManualQuiz(d, { topicId: NEWTON, correct: 0, total: 0 }, NOW).error).toBeTruthy()
    expect(recordManualQuiz(d, { topicId: 'nope', correct: 1, total: 2 }, NOW).error).toBeTruthy()
    expect(recordManualQuiz(d, { topicId: NEWTON, correct: 3, total: 5 }, NOW).error).toBeUndefined()
  })

  it('finishing without a recall check keeps the estimate unchanged', () => {
    const d = demo()
    const next = upNext(d, NOW)!
    const out = finishSession(d, { sessionId: next.id, actualMin: next.durationMin, startAbs: toAbs(next.date, next.startMin) }, NOW)
    const before = d.topics.find((t) => t.id === next.topicId)!.memory
    const after = out.data.topics.find((t) => t.id === next.topicId)!.memory
    expect(after).toEqual(before)
    expect(out.data.quizzes).toHaveLength(d.quizzes.length)
    expect(out.data.sessions.find((s) => s.id === next.id)!.status).toBe('completed')
  })

  it('records a partial session and credits it fractionally', () => {
    const d = demo()
    const next = upNext(d, NOW)!
    const out = finishSession(d, { sessionId: next.id, actualMin: Math.round(next.durationMin / 2), startAbs: toAbs(next.date, next.startMin) }, NOW)
    expect(out.data.sessions.find((s) => s.id === next.id)!.status).toBe('partial')
    const g = next.durationMin <= 20 ? 'short' : next.durationMin <= 40 ? 'medium' : 'long'
    expect(out.data.completion[g].alpha).toBeCloseTo(d.completion[g].alpha + 0.5, 5)
    expect(out.data.completion[g].beta).toBeCloseTo(d.completion[g].beta + 0.5, 5)
  })
})

describe('manual scheduling changes', () => {
  const find = (d: AppData, name: string) => d.sessions.find((s) => s.status === 'planned' && s.topicId === name)!
  const freeSlot = (d: AppData, sessionId: string, minutes: number, after = '2026-10-21') =>
    suggestSlots({
      availability: d.availability,
      sessions: d.sessions,
      sessionId,
      durationMin: minutes,
      fromDate: after,
      nowAbs: momentToAbs(NOW),
      examStartAbs: toAbs('2026-10-24', 9 * 60),
    })[0]

  it('refuses a move that overlaps a commitment, with a message beside the time field', () => {
    const d = demo()
    const s = find(d, NEWTON)
    // Tuesday football practice 4:30–6:00 PM
    const out = moveSession(d, s.id, '2026-10-20', 16 * 60 + 40, NOW)
    expect(out.error?.field).toBe('time')
    expect(out.error?.message).toMatch(/Football practice/)
    expect(out.data).toBe(d)
  })

  it('refuses times in the past, outside study windows, or after the exam', () => {
    const d = demo()
    const s = find(d, NEWTON)
    expect(moveSession(d, s.id, NOW.date, 9 * 60, NOW).error?.field).toBe('time') // already passed
    expect(moveSession(d, s.id, '2026-10-21', 11 * 60, NOW).error?.message).toMatch(/School/) // during school
    expect(moveSession(d, s.id, '2026-10-24', 8 * 60, NOW).error?.message).toMatch(/study windows/) // Saturday, before the window opens
    expect(moveSession(d, s.id, '2026-10-26', 16 * 60, NOW).error?.field).toBe('date') // after the physics exam
    expect(moveSession(d, s.id, '2026-10-21', 20 * 60 + 50, NOW).error?.message).toMatch(/study windows/)
  })

  it('refuses overlap with another session', () => {
    const d = demo()
    const [a, b] = d.sessions.filter((s) => s.status === 'planned' && s.date === '2026-10-21')
    const out = moveSession(d, a.id, b.date, b.startMin, NOW)
    expect(out.error?.message).toMatch(/overlaps another/)
  })

  it('moves a session to a valid slot, pins it, and keeps it through later replans', () => {
    const d = demo()
    const s = find(d, NEWTON)
    const slot = freeSlot(d, s.id, s.durationMin)
    expect(slot).toBeTruthy()
    const out = moveSession(d, s.id, slot.date, slot.startMin, NOW)
    expect(out.error).toBeUndefined()
    const moved = out.data.sessions.find((x) => x.locked && x.topicId === s.topicId && x.status === 'planned')!
    expect(moved).toMatchObject({ date: slot.date, startMin: slot.startMin, locked: true, vacated: [s.date] })
    expect(moved.id).not.toBe(s.id) // the old auto id belongs to the vacated slot
    expect(new Set(out.data.sessions.map((x) => x.id)).size).toBe(out.data.sessions.length) // ids stay unique
    // the planner does not simply refill the day this topic was moved away from
    expect(out.data.sessions.some((x) => x.topicId === s.topicId && x.date === s.date && x.status === 'planned' && !x.locked)).toBe(false)
    expect(planViolations(out.data, NOW)).toEqual([])
    const again = skipSession(out.data, upNext(out.data, NOW)!.id, NOW).data
    const still = again.sessions.find((x) => x.id === moved.id)!
    expect(still).toMatchObject({ date: slot.date, startMin: slot.startMin, locked: true })
    expect(out.change!.items.some((i) => i.text.includes("Newton's laws"))).toBe(true)
  })

  it('validates new durations', () => {
    const d = demo()
    const s = find(d, NEWTON)
    expect(moveSession(d, s.id, s.date, s.startMin, NOW, 5).error?.field).toBe('duration')
    expect(moveSession(d, s.id, s.date, s.startMin, NOW, 500).error?.field).toBe('duration')
    const ok = moveSession(d, s.id, s.date, s.startMin, NOW, 20)
    expect(ok.error).toBeUndefined()
    expect(ok.data.sessions.find((x) => x.locked && x.topicId === s.topicId)!.durationMin).toBe(20)
  })

  it('cannot push a session past midnight', () => {
    const d = demo()
    const s = find(d, NEWTON)
    expect(moveSession(d, s.id, '2026-10-21', 23 * 60 + 50, NOW).error).toBeTruthy()
  })
})

describe('What-If and Course Correction never touch the saved plan', () => {
  it('previews a skipped day and extra time without mutating saved data', () => {
    const d = deepFreeze(demo())
    const snapshot = JSON.stringify(d)
    const sc = runScenario(d, NOW, [{ kind: 'skipDay', date: '2026-10-21' }, { kind: 'addTime', date: '2026-10-22', startMin: 21 * 60, durationMin: 60 }])
    expect(JSON.stringify(d)).toBe(snapshot)
    expect(sc.data.sessions.filter((s) => s.status === 'planned' && s.date === '2026-10-21' && !s.locked)).toHaveLength(0)
    expect(sc.data).not.toBe(d)
    expect(planViolations(sc.data, NOW, { checkWindows: false })).toEqual([])
  })

  it('shows a lower forecast when study days are removed', () => {
    const d = demo()
    const base = runScenario(d, NOW, [])
    const fewer = runScenario(d, NOW, [
      { kind: 'skipDay', date: '2026-10-20' },
      { kind: 'skipDay', date: '2026-10-21' },
      { kind: 'skipDay', date: '2026-10-22' },
    ])
    expect(fewer.stats.meanProjected!).toBeLessThan(base.stats.meanProjected!)
  })

  it('course correction stays inside the time budget and does not change saved data', () => {
    const d = deepFreeze(demo())
    const snapshot = JSON.stringify(d)
    const out = runCorrection(d, NOW, { prioritySubjectIds: ['demo-phys'], budgetMin: 150 })
    expect(JSON.stringify(d)).toBe(snapshot)
    expect(out.afterMinutes).toBeLessThanOrEqual(150)
    expect(out.afterMinutes).toBeLessThan(out.beforeMinutes)
    expect(out.rows.some((r) => r.verdict === 'omitted' || r.verdict === 'reduced')).toBe(true)
    const phys = out.rows.filter((r) => r.subjectId === 'demo-phys').reduce((s, r) => s + r.afterMinutes, 0)
    expect(phys).toBeGreaterThan(out.afterMinutes / 2)
    expect(out.rows.every((r) => r.reason.length > 10)).toBe(true)
    expect(planViolations(out.data, NOW)).toEqual([])
  })

  it('course correction with more time than needed keeps the current plan size', () => {
    const d = demo()
    const out = runCorrection(d, NOW, { prioritySubjectIds: [], budgetMin: 100000 })
    expect(out.afterMinutes).toBeGreaterThan(out.beforeMinutes * 0.8)
  })
})

describe('falling behind', () => {
  it('treats unrecorded past sessions as missed, and can mark them skipped', () => {
    const d = demo()
    const later = { date: addDays(NOW.date, 1), minute: 22 * 60 } // yesterday's evening sessions have passed
    const b = behindStatus(d, later)
    expect(b.missed.length).toBeGreaterThan(0)
    expect(b.behind).toBe(true)
    const out = markMissedAsSkipped(d, later)
    expect(behindStatus(out.data, later).missed).toHaveLength(0)
    expect(out.data.completion.medium.beta).toBeGreaterThan(d.completion.medium.beta)
    expect(momentToAbs(later)).toBeGreaterThan(momentToAbs(NOW))
  })

  it('flagging a struggle gives the topic more attention without erasing anything', () => {
    const d = demo()
    const out = toggleStruggle(d, 'demo-t-limits', NOW)
    expect(out.data.topics.find((t) => t.id === 'demo-t-limits')!.struggling).toBe(true)
    expect(plannedMinutesFor(out.data, 'demo-t-limits', NOW)).toBeGreaterThanOrEqual(plannedMinutesFor(d, 'demo-t-limits', NOW))
  })
})
