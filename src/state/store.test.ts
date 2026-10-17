import { describe, expect, it } from 'vitest'
import { upNext } from '../engine/insights'
import { suggestSlots } from '../engine/slots'
import { momentToAbs, toAbs } from '../engine/time'
import { NOW } from '../test-utils'
import { BACKUP_KEY, loadData, STORAGE_KEY, validateAppData, type StorageLike } from './persistence'
import { createStore } from './store'

class MemoryStorage implements StorageLike {
  map = new Map<string, string>()
  fail = false
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    if (this.fail) throw new Error('QuotaExceededError')
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
}

const open = (storage: MemoryStorage, clock = () => NOW) => createStore({ storage, clock })

describe('persistence', () => {
  it('survives a reload: profile, subjects, sessions, quizzes and model state', () => {
    const storage = new MemoryStorage()
    const a = open(storage)
    a.loadDemo()
    const next = upNext(a.getState().data, NOW)!
    a.finishSession({ sessionId: next.id, actualMin: next.durationMin, startAbs: toAbs(next.date, next.startMin), quiz: { correct: 2, total: 5, source: 'manual' } })
    a.toggleStruggle('demo-t-limits')
    const saved = a.getState().data

    const b = open(storage) // simulates a page reload
    const d = b.getState().data
    expect(d.profile).toEqual(saved.profile)
    expect(d.subjects).toEqual(saved.subjects)
    expect(d.topics).toEqual(saved.topics)
    expect(d.exams).toEqual(saved.exams)
    expect(d.availability).toEqual(saved.availability)
    expect(d.sessions).toEqual(saved.sessions)
    expect(d.quizzes).toEqual(saved.quizzes)
    expect(d.completion).toEqual(saved.completion)
    expect(d.quizzes.length).toBe(saved.quizzes.length)
    expect(d.onboarded).toBe(true)
    expect(b.getState().ui.notice).toBeNull()
  })

  it('does not reshuffle the plan on a reload within the same day', () => {
    const storage = new MemoryStorage()
    const a = open(storage)
    a.loadDemo()
    const before = a.getState().data.sessions
    const b = open(storage)
    b.refreshForNewDay()
    expect(b.getState().data.sessions).toEqual(before)
  })

  it('quietly refreshes the plan on a new day without touching history', () => {
    const storage = new MemoryStorage()
    open(storage).loadDemo()
    const tomorrow = { date: '2026-10-20', minute: 8 * 60 }
    const b = open(storage, () => tomorrow)
    const done = JSON.stringify(b.getState().data.sessions.filter((s) => s.status !== 'planned'))
    b.refreshForNewDay()
    expect(b.getState().data.planMeta.generatedFor).toBe('2026-10-20')
    expect(JSON.stringify(b.getState().data.sessions.filter((s) => s.status !== 'planned' && s.date < '2026-10-19'))).toBe(
      JSON.stringify(JSON.parse(done).filter((s: { date: string }) => s.date < '2026-10-19')),
    )
  })

  it('recovers from malformed JSON by backing it up and starting fresh', () => {
    const storage = new MemoryStorage()
    storage.map.set(STORAGE_KEY, '{ not json')
    const s = open(storage)
    expect(s.getState().data.onboarded).toBe(false)
    expect(s.getState().ui.notice).toMatch(/backup/i)
    expect(storage.map.get(BACKUP_KEY)).toBe('{ not json')
  })

  it('recovers from the wrong shape or a newer version', () => {
    for (const payload of [JSON.stringify({ hello: 1 }), JSON.stringify({ v: 99, data: { subjects: [], topics: [] } }), 'null', '42']) {
      const storage = new MemoryStorage()
      storage.map.set(STORAGE_KEY, payload)
      expect(loadData(storage).status).toBe('recovered')
      expect(storage.map.get(BACKUP_KEY)).toBe(payload)
    }
  })

  it('repairs damaged fields instead of crashing', () => {
    const storage = new MemoryStorage()
    const a = open(storage)
    a.loadDemo()
    const env = JSON.parse(storage.map.get(STORAGE_KEY)!)
    env.data.topics[0].memory = { recall: 'oops', stability: -4, anchor: null }
    env.data.sessions[0].date = '2026-13-45'
    env.data.sessions.push({ id: 'x', topicId: 'ghost', date: '2026-10-21', startMin: 10, durationMin: 20, status: 'planned' })
    env.data.completion.short = { alpha: -1, beta: 'x' }
    env.data.availability.windows[0].endMin = 5
    env.data.quizzes.push({ id: 'bad', topicId: env.data.topics[0].id, atAbs: 1, correct: 9, total: 5 })
    storage.map.set(STORAGE_KEY, JSON.stringify(env))
    const loaded = loadData(storage)
    expect(loaded.status).toBe('ok')
    const d = loaded.data!
    expect(d.topics[0].memory.stability).toBeGreaterThan(0)
    expect(d.topics[0].memory.recall).toBeGreaterThanOrEqual(0)
    expect(d.sessions.some((s) => s.id === 'x')).toBe(false)
    expect(d.sessions.length).toBe(env.data.sessions.length - 2)
    expect(d.completion.short.alpha).toBeGreaterThan(0)
    expect(d.availability.windows.length).toBe(env.data.availability.windows.length - 1)
    expect(d.quizzes.some((q) => q.id === 'bad')).toBe(false)
  })

  it('rejects data that is not an object', () => {
    expect(validateAppData(null)).toBeNull()
    expect(validateAppData([])).toBeNull()
    expect(validateAppData({ subjects: 'x', topics: [] })).toBeNull()
  })

  it('keeps working if storage is full or unavailable', () => {
    const storage = new MemoryStorage()
    const s = open(storage)
    storage.fail = true
    s.loadDemo()
    expect(s.getState().storageOk).toBe(false)
    expect(s.getState().data.topics.length).toBeGreaterThan(0)
    expect(createStore({ storage: null, clock: () => NOW }).getState().storageOk).toBe(false)
  })

  it('reset wipes saved data', () => {
    const storage = new MemoryStorage()
    const s = open(storage)
    s.loadDemo()
    s.reset()
    expect(storage.map.has(STORAGE_KEY)).toBe(false)
    expect(s.getState().data.onboarded).toBe(false)
    expect(open(storage).getState().data.topics).toHaveLength(0)
  })
})

describe('undo', () => {
  it('restores the plan after an accidental skip', () => {
    const s = open(new MemoryStorage())
    s.loadDemo()
    const before = s.getState().data
    const next = upNext(before, NOW)!
    s.skipSession(next.id)
    expect(s.getState().data).not.toEqual(before)
    expect(s.getState().ui.toast?.undoable).toBe(true)
    s.undo()
    expect(s.getState().data).toEqual(before)
  })

  it('restores a move', () => {
    const s = open(new MemoryStorage())
    s.loadDemo()
    const before = s.getState().data
    const target = before.sessions.find((x) => x.status === 'planned' && x.topicId === 'demo-t-newton')!
    const slot = suggestSlots({ availability: before.availability, sessions: before.sessions, sessionId: target.id, durationMin: target.durationMin, fromDate: '2026-10-21', nowAbs: momentToAbs(NOW), examStartAbs: toAbs('2026-10-24', 540) })[0]
    expect(s.moveSession(target.id, slot.date, slot.startMin)).toBeNull()
    expect(s.getState().data).not.toEqual(before)
    s.undo()
    expect(s.getState().data).toEqual(before)
  })

  it('cannot undo past a recall check, so history is never erased', () => {
    const s = open(new MemoryStorage())
    s.loadDemo()
    const first = upNext(s.getState().data, NOW)!
    s.skipSession(first.id)
    const second = upNext(s.getState().data, NOW)!
    const out = s.finishSession({ sessionId: second.id, actualMin: second.durationMin, startAbs: toAbs(second.date, second.startMin), quiz: { correct: 3, total: 5, source: 'manual' } })
    expect(out.quiz).toBeTruthy()
    const quizCount = s.getState().data.quizzes.length
    s.undo()
    expect(s.getState().data.quizzes).toHaveLength(quizCount)
    expect(s.getState().data.sessions.find((x) => x.id === second.id)!.status).toBe('completed')
  })

  it('failed moves leave the store untouched', () => {
    const s = open(new MemoryStorage())
    s.loadDemo()
    const before = s.getState()
    const target = before.data.sessions.find((x) => x.status === 'planned')!
    const err = s.moveSession(target.id, '2026-10-20', 16 * 60 + 40)
    expect(err?.field).toBe('time')
    expect(s.getState().data).toBe(before.data)
    expect(s.getState().ui.undo).toHaveLength(0)
  })
})

describe('timer', () => {
  it('tracks pause and resume without drift', () => {
    let t = 1_000_000
    const s = createStore({ storage: new MemoryStorage(), clock: () => NOW, nowMs: () => t })
    s.loadDemo()
    const next = upNext(s.getState().data, NOW)!
    s.startSession(next.id)
    t += 60_000
    s.pauseTimer()
    expect(s.getState().data.activeTimer).toMatchObject({ runningSince: null, accumulatedMs: 60_000 })
    t += 600_000
    s.resumeTimer()
    t += 30_000
    s.pauseTimer()
    expect(s.getState().data.activeTimer!.accumulatedMs).toBe(90_000)
  })
})
