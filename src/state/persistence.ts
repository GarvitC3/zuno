/**
 * Versioned browser persistence with recovery from malformed data.
 *
 * Saved shape: { v: 1, savedAt, data: AppData } under STORAGE_KEY.
 * On load every field is validated and repaired; if the payload cannot be
 * trusted at all, the raw string is copied to BACKUP_KEY (so nothing is lost
 * silently) and the app starts fresh with a friendly notice.
 */
import type {
  ActiveTimer,
  AppData,
  Availability,
  Commitment,
  CommitmentKind,
  Exam,
  Importance,
  PlanMeta,
  QuizResult,
  Session,
  StudyWindow,
  Subject,
  SubjectColor,
  Topic,
  UnmetNeed,
} from '../types'
import { sanitizeCompletion } from '../engine/completion'
import { ENGINE as E } from '../engine/config'
import { sanitizeMemory } from '../engine/memory'
import { isValidDateKey, MIN_PER_DAY } from '../engine/time'

export const STORAGE_KEY = 'zuno:data'
export const BACKUP_KEY = 'zuno:data:backup'
export const STORAGE_VERSION = 1

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadStatus = 'empty' | 'ok' | 'recovered' | 'unavailable'
export interface LoadResult {
  data: AppData | null
  status: LoadStatus
  message?: string
}

export function emptyData(): AppData {
  return {
    version: 1,
    profile: { name: '', isSample: false, createdAt: 0 },
    onboarded: false,
    subjects: [],
    exams: [],
    topics: [],
    availability: defaultAvailability(),
    sessions: [],
    quizzes: [],
    completion: sanitizeCompletion(null),
    planMeta: { generatedFor: null, unmet: [] },
    activeTimer: null,
    settings: { timerByDefault: true },
  }
}

export function defaultAvailability(): Availability {
  return {
    windows: [],
    commitments: [],
    extraWindows: [],
    blockedDates: [],
    preferredSessionMin: 30,
    breakMin: 10,
    maxDailyMin: 120,
  }
}

// ---- Type guards ------------------------------------------------------------------

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const inRange = (x: unknown, lo: number, hi: number): x is number => isNum(x) && x >= lo && x <= hi
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])

const COLORS: SubjectColor[] = ['blue', 'peach', 'mint', 'lilac', 'rose', 'sky', 'gold']
const KINDS: CommitmentKind[] = ['school', 'work', 'practice', 'meals', 'sleep', 'other']
const STATUSES = ['planned', 'completed', 'partial', 'skipped'] as const

function dayList(x: unknown): number[] {
  return [...new Set(arr(x).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort()
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>()
  return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
}

function parseSubjects(x: unknown): Subject[] {
  return dedupeById(
    arr(x)
      .filter(isObj)
      .filter((s) => isStr(s.id) && isStr(s.name))
      .map((s) => ({
        id: s.id as string,
        name: (s.name as string).slice(0, 80),
        color: COLORS.includes(s.color as SubjectColor) ? (s.color as SubjectColor) : 'blue',
        sample: s.sample === true ? true : undefined,
      })),
  )
}

function parseExams(x: unknown, subjectIds: Set<string>): Exam[] {
  return dedupeById(
    arr(x)
      .filter(isObj)
      .filter((e) => isStr(e.id) && isStr(e.subjectId) && subjectIds.has(e.subjectId as string) && isValidDateKey(e.date))
      .map((e) => ({
        id: e.id as string,
        subjectId: e.subjectId as string,
        name: isStr(e.name) ? (e.name as string) : 'Exam',
        date: e.date as string,
        startMin: inRange(e.startMin, 0, MIN_PER_DAY - 1) ? (e.startMin as number) : E.DEFAULT_EXAM_START_MIN,
      })),
  )
}

function parseTopics(x: unknown, subjectIds: Set<string>, examIds: Set<string>, fallbackAnchor: number): Topic[] {
  return dedupeById(
    arr(x)
      .filter(isObj)
      .filter((t) => isStr(t.id) && isStr(t.name) && isStr(t.subjectId) && subjectIds.has(t.subjectId as string))
      .map((t) => ({
        id: t.id as string,
        subjectId: t.subjectId as string,
        examId: isStr(t.examId) && examIds.has(t.examId as string) ? (t.examId as string) : null,
        name: (t.name as string).slice(0, 80),
        importance: (inRange(t.importance, 1, 5) ? Math.round(t.importance as number) : 3) as Importance,
        struggling: t.struggling === true,
        prerequisites: arr(t.prerequisites).filter(isStr) as string[],
        memory: sanitizeMemory(isObj(t.memory) ? (t.memory as never) : null, fallbackAnchor),
        bankKey: isStr(t.bankKey) ? (t.bankKey as string) : undefined,
        sample: t.sample === true ? true : undefined,
      })),
  )
}

function parseSessions(x: unknown, topicIds: Set<string>): Session[] {
  return dedupeById(
    arr(x)
      .filter(isObj)
      .filter(
        (s) =>
          isStr(s.id) &&
          isStr(s.topicId) &&
          topicIds.has(s.topicId as string) &&
          isValidDateKey(s.date) &&
          inRange(s.startMin, 0, MIN_PER_DAY - 1) &&
          inRange(s.durationMin, 1, MIN_PER_DAY) &&
          STATUSES.includes(s.status as (typeof STATUSES)[number]),
      )
      .map((s) => {
        const actual =
          isObj(s.actual) && isNum(s.actual.startAbs) && inRange(s.actual.minutes, 0, MIN_PER_DAY)
            ? { startAbs: s.actual.startAbs as number, minutes: s.actual.minutes as number }
            : undefined
        const status = s.status as Session['status']
        return {
          id: s.id as string,
          topicId: s.topicId as string,
          date: s.date as string,
          startMin: Math.round(s.startMin as number),
          durationMin: Math.round(s.durationMin as number),
          status,
          locked: s.locked === true,
          vacated: arr(s.vacated).filter(isValidDateKey).length ? (arr(s.vacated).filter(isValidDateKey) as string[]) : undefined,
          actual: status === 'completed' || status === 'partial' ? actual : undefined,
          quizId: isStr(s.quizId) ? (s.quizId as string) : undefined,
          sample: s.sample === true ? true : undefined,
        }
      }),
  )
}

function parseQuizzes(x: unknown, topicIds: Set<string>): QuizResult[] {
  return dedupeById(
    arr(x)
      .filter(isObj)
      .filter(
        (q) =>
          isStr(q.id) &&
          isStr(q.topicId) &&
          topicIds.has(q.topicId as string) &&
          isNum(q.atAbs) &&
          Number.isInteger(q.total) &&
          (q.total as number) >= 1 &&
          Number.isInteger(q.correct) &&
          (q.correct as number) >= 0 &&
          (q.correct as number) <= (q.total as number),
      )
      .map((q) => ({
        id: q.id as string,
        topicId: q.topicId as string,
        sessionId: isStr(q.sessionId) ? (q.sessionId as string) : undefined,
        atAbs: q.atAbs as number,
        correct: q.correct as number,
        total: q.total as number,
        source: (q.source === 'bank' || q.source === 'sample' ? q.source : 'manual') as QuizResult['source'],
        recallBefore: inRange(q.recallBefore, 0, 1) ? (q.recallBefore as number) : 0,
        recallAfter: inRange(q.recallAfter, 0, 1) ? (q.recallAfter as number) : 0,
        stabilityBefore: isNum(q.stabilityBefore) ? (q.stabilityBefore as number) : E.DEFAULT_STABILITY_DAYS,
        stabilityAfter: isNum(q.stabilityAfter) ? (q.stabilityAfter as number) : E.DEFAULT_STABILITY_DAYS,
        sample: q.sample === true ? true : undefined,
      })),
  )
}

function parseWindows(x: unknown): StudyWindow[] {
  return dedupeById(
    arr(x)
      .filter(isObj)
      .filter((w) => isStr(w.id) && inRange(w.startMin, 0, MIN_PER_DAY - 1) && inRange(w.endMin, 1, MIN_PER_DAY) && (w.endMin as number) > (w.startMin as number))
      .map((w) => ({ id: w.id as string, days: dayList(w.days), startMin: w.startMin as number, endMin: w.endMin as number })),
  )
}

function parseCommitments(x: unknown): Commitment[] {
  return dedupeById(
    arr(x)
      .filter(isObj)
      .filter((c) => isStr(c.id) && isStr(c.label) && inRange(c.startMin, 0, MIN_PER_DAY) && inRange(c.endMin, 0, MIN_PER_DAY))
      .map((c) => ({
        id: c.id as string,
        label: (c.label as string).slice(0, 60),
        kind: KINDS.includes(c.kind as CommitmentKind) ? (c.kind as CommitmentKind) : 'other',
        days: dayList(c.days),
        startMin: c.startMin as number,
        endMin: c.endMin as number,
        onDate: isValidDateKey(c.onDate) ? (c.onDate as string) : undefined,
      })),
  )
}

function parseAvailability(x: unknown): Availability {
  const base = defaultAvailability()
  if (!isObj(x)) return base
  return {
    windows: parseWindows(x.windows),
    commitments: parseCommitments(x.commitments),
    extraWindows: dedupeById(
      arr(x.extraWindows)
        .filter(isObj)
        .filter((w) => isStr(w.id) && isValidDateKey(w.date) && inRange(w.startMin, 0, MIN_PER_DAY - 1) && inRange(w.endMin, 1, MIN_PER_DAY) && (w.endMin as number) > (w.startMin as number))
        .map((w) => ({ id: w.id as string, date: w.date as string, startMin: w.startMin as number, endMin: w.endMin as number })),
    ),
    blockedDates: [...new Set(arr(x.blockedDates).filter(isValidDateKey))] as string[],
    preferredSessionMin: inRange(x.preferredSessionMin, 15, 180) ? Math.round(x.preferredSessionMin as number) : base.preferredSessionMin,
    breakMin: inRange(x.breakMin, 0, 60) ? Math.round(x.breakMin as number) : base.breakMin,
    maxDailyMin: inRange(x.maxDailyMin, 15, MIN_PER_DAY) ? Math.round(x.maxDailyMin as number) : base.maxDailyMin,
  }
}

function parsePlanMeta(x: unknown, topicIds: Set<string>): PlanMeta {
  if (!isObj(x)) return { generatedFor: null, unmet: [] }
  const unmet: UnmetNeed[] = arr(x.unmet)
    .filter(isObj)
    .filter((u) => isStr(u.topicId) && topicIds.has(u.topicId as string) && isNum(u.projectedRecall) && isNum(u.extraMinutes))
    .map((u) => ({
      topicId: u.topicId as string,
      projectedRecall: u.projectedRecall as number,
      targetRecall: isNum(u.targetRecall) ? (u.targetRecall as number) : E.TARGET_RECALL,
      extraMinutes: u.extraMinutes as number,
      reason: (u.reason === 'budget' || u.reason === 'daily_limit' ? u.reason : 'no_free_time') as UnmetNeed['reason'],
    }))
  return { generatedFor: isValidDateKey(x.generatedFor) ? (x.generatedFor as string) : null, unmet }
}

function parseTimer(x: unknown, sessionIds: Set<string>): ActiveTimer | null {
  if (!isObj(x) || !isStr(x.sessionId) || !sessionIds.has(x.sessionId as string)) return null
  return {
    sessionId: x.sessionId as string,
    runningSince: isNum(x.runningSince) ? (x.runningSince as number) : null,
    accumulatedMs: isNum(x.accumulatedMs) && (x.accumulatedMs as number) >= 0 ? (x.accumulatedMs as number) : 0,
    useTimer: x.useTimer !== false,
  }
}

/** Validate and repair an unknown value into AppData; returns null if it is not usable at all. */
export function validateAppData(raw: unknown): AppData | null {
  if (!isObj(raw)) return null
  if (!Array.isArray(raw.subjects) || !Array.isArray(raw.topics)) return null
  const profile = isObj(raw.profile) ? raw.profile : {}
  const createdAt = isNum(profile.createdAt) ? (profile.createdAt as number) : 0
  const subjects = parseSubjects(raw.subjects)
  const subjectIds = new Set(subjects.map((s) => s.id))
  const exams = parseExams(raw.exams, subjectIds)
  const examIds = new Set(exams.map((e) => e.id))
  const topics = parseTopics(raw.topics, subjectIds, examIds, createdAt)
  const topicIds = new Set(topics.map((t) => t.id))
  const sessions = parseSessions(raw.sessions, topicIds)
  const sessionIds = new Set(sessions.map((s) => s.id))
  const settings = isObj(raw.settings) ? raw.settings : {}
  return {
    version: 1,
    profile: { name: isStr(profile.name) ? (profile.name as string).slice(0, 40) : '', isSample: profile.isSample === true, createdAt },
    onboarded: raw.onboarded === true,
    subjects,
    exams,
    topics,
    availability: parseAvailability(raw.availability),
    sessions,
    quizzes: parseQuizzes(raw.quizzes, topicIds),
    completion: sanitizeCompletion(isObj(raw.completion) ? (raw.completion as never) : null),
    planMeta: parsePlanMeta(raw.planMeta, topicIds),
    activeTimer: parseTimer(raw.activeTimer, sessionIds),
    settings: { timerByDefault: settings.timerByDefault !== false },
  }
}

// ---- Save / load -------------------------------------------------------------------

export function serialize(data: AppData): string {
  return JSON.stringify({ v: STORAGE_VERSION, savedAt: new Date().toISOString(), data })
}

export function saveData(data: AppData, storage: StorageLike | null): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, serialize(data))
    return true
  } catch {
    return false
  }
}

export function loadData(storage: StorageLike | null): LoadResult {
  if (!storage) return { data: null, status: 'unavailable', message: 'Browser storage is unavailable, so progress will not be saved.' }
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { data: null, status: 'unavailable', message: 'Browser storage is unavailable, so progress will not be saved.' }
  }
  if (raw === null) return { data: null, status: 'empty' }

  const recover = (why: string): LoadResult => {
    try {
      storage.setItem(BACKUP_KEY, raw!)
      storage.removeItem(STORAGE_KEY)
    } catch {
      /* best effort */
    }
    return {
      data: null,
      status: 'recovered',
      message: `${why} We kept a backup of the old data and started fresh.`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return recover('Saved data could not be read.')
  }
  if (!isObj(parsed) || !isObj(parsed.data)) return recover('Saved data had an unexpected shape.')
  if (typeof parsed.v !== 'number' || parsed.v > STORAGE_VERSION) {
    return recover('Saved data came from a newer version of Zuno.')
  }
  // Future migrations: switch (parsed.v) { case 0: ... }
  const data = validateAppData(parsed.data)
  if (!data) return recover('Saved data was incomplete.')
  return { data, status: 'ok' }
}

export function clearData(storage: StorageLike | null): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** localStorage if usable (it can throw in private windows), otherwise null. */
export function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage
    const probe = '__zuno_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}
