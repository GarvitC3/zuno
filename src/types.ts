/**
 * Zuno domain types.
 *
 * Everything the app persists is described here. The maths engine (src/engine)
 * and the UI both import from this file; neither imports from the other.
 *
 * Time conventions
 * ----------------
 * - A calendar day is a local `DateKey` ("YYYY-MM-DD").
 * - A moment within a day is "minutes since local midnight" (0..1439).
 * - "Absolute minutes" (`abs`) = (days since 1970-01-01 of that local date) * 1440 + minute.
 *   Every local day counts as exactly 1440 minutes, so DST changes never shift a plan.
 */

export type DateKey = string
export type ID = string

export type SubjectColor = 'blue' | 'peach' | 'mint' | 'lilac' | 'rose' | 'sky' | 'gold'

export interface Subject {
  id: ID
  name: string
  color: SubjectColor
  sample?: boolean
}

export interface Exam {
  id: ID
  subjectId: ID
  name: string
  date: DateKey
  /** Minute of the day the exam starts. Study must finish before this. */
  startMin: number
}

/** 1 = minor … 5 = essential. */
export type Importance = 1 | 2 | 3 | 4 | 5
/** 1 = brand new … 5 = confident. null = "I'm not sure yet". */
export type Familiarity = 1 | 2 | 3 | 4 | 5

export type MemorySource = 'unsure' | 'familiarity' | 'quiz'

/**
 * The memory model for one topic: R(t) = A * exp(-t / S)
 *  - `recall`    A: recall probability at the reference time (latest assessment)
 *  - `stability` S: days; larger = slower forgetting
 *  - `anchor`    reference time (absolute local minutes)
 */
export interface MemoryState {
  anchor: number
  recall: number
  stability: number
  source: MemorySource
  /** Number of recall checks that have shaped this estimate. */
  assessments: number
}

export interface Topic {
  id: ID
  subjectId: ID
  examId: ID | null
  name: string
  importance: Importance
  /** Student manually flagged "I'm struggling with this". */
  struggling: boolean
  /**
   * Prerequisite topic ids. Not used by the engine yet — reserved for the
   * second-pass Orbit Map (subjects as planets, topics as moons).
   */
  prerequisites: ID[]
  memory: MemoryState
  /** Key into the local question bank, when one exists. */
  bankKey?: string
  sample?: boolean
}

export type SessionStatus = 'planned' | 'completed' | 'partial' | 'skipped'

export type ExplanationPrimary =
  | 'weak_check' // last recall check was poor
  | 'flagged' // student flagged the topic
  | 'closest_exam' // nearest exam
  | 'fading' // memory estimate is low
  | 'first_look' // no history, starting estimate only
  | 'spacing' // a well-timed spaced review
  | 'importance' // high importance topic
  | 'locked' // manually placed by the student

/** Structured, engine-produced facts behind one recommendation. The UI turns this into words. */
export interface Explanation {
  primary: ExplanationPrimary
  recallNow: number
  /** Whole days from the session to the exam (rounded down). */
  daysToExam: number
  isClosestExam: boolean
  importance: Importance
  struggling: boolean
  lastCheck: { correct: number; total: number; daysAgo: number } | null
  hasHistory: boolean
  pComplete: number
  durationGroup: DurationGroup
  /** Expected exam-day recall gain if this session is completed (absolute probability). */
  examGain: number
  /** importance weight × pComplete × gain ÷ minutes (the greedy score, before nudges). */
  score: number
  projectedWith: number
  projectedWithout: number
}

export interface Session {
  id: ID
  topicId: ID
  date: DateKey
  startMin: number
  durationMin: number
  status: SessionStatus
  /** Pinned by the student: the scheduler keeps it exactly where it is. */
  locked: boolean
  /** Days this topic's review was moved away from (the planner will not refill them). */
  vacated?: DateKey[]
  /** What really happened, when the student did the session. */
  actual?: { startAbs: number; minutes: number }
  quizId?: ID
  sample?: boolean
}

export type DurationGroup = 'short' | 'medium' | 'long'
export interface BetaParams {
  alpha: number
  beta: number
}
export type CompletionModel = Record<DurationGroup, BetaParams>

export interface QuizResult {
  id: ID
  topicId: ID
  sessionId?: ID
  atAbs: number
  correct: number
  total: number
  source: 'bank' | 'manual' | 'sample'
  /** Model estimate immediately before the check (forecast). */
  recallBefore: number
  /** Model estimate immediately after the check (blend of forecast and evidence). */
  recallAfter: number
  stabilityBefore: number
  stabilityAfter: number
  sample?: boolean
}

export type CommitmentKind = 'school' | 'work' | 'practice' | 'meals' | 'sleep' | 'other'

export interface StudyWindow {
  id: ID
  /** 0 = Sunday … 6 = Saturday */
  days: number[]
  startMin: number
  endMin: number
}

export interface Commitment {
  id: ID
  label: string
  kind: CommitmentKind
  days: number[]
  startMin: number
  /** If endMin <= startMin the commitment runs overnight (e.g. sleep 23:00–07:00). */
  endMin: number
  /** One-off commitment on a specific date (days is ignored). */
  onDate?: DateKey
}

export interface ExtraWindow {
  id: ID
  date: DateKey
  startMin: number
  endMin: number
}

export interface Availability {
  windows: StudyWindow[]
  commitments: Commitment[]
  /** One-off extra study time (e.g. from What-If "add an hour"). */
  extraWindows: ExtraWindow[]
  /** Days with no study at all (e.g. What-If "skip a study day"). */
  blockedDates: DateKey[]
  preferredSessionMin: number
  breakMin: number
  maxDailyMin: number
}

export interface UnmetNeed {
  topicId: ID
  projectedRecall: number
  targetRecall: number
  /** Rough extra study time that would be needed to reach the target. */
  extraMinutes: number
  reason: 'no_free_time' | 'daily_limit' | 'budget'
}

export interface PlanMeta {
  generatedFor: DateKey | null
  unmet: UnmetNeed[]
}

export interface ActiveTimer {
  sessionId: ID
  /** Epoch ms when the current running stretch started (null while paused). */
  runningSince: number | null
  /** Milliseconds accumulated before the current stretch. */
  accumulatedMs: number
  useTimer: boolean
}

export interface AppData {
  version: 1
  profile: { name: string; isSample: boolean; createdAt: number }
  onboarded: boolean
  subjects: Subject[]
  exams: Exam[]
  topics: Topic[]
  availability: Availability
  sessions: Session[]
  quizzes: QuizResult[]
  completion: CompletionModel
  planMeta: PlanMeta
  activeTimer: ActiveTimer | null
  settings: { timerByDefault: boolean }
}

/** One human-readable line describing what a replan changed. */
export interface PlanChange {
  kind: 'moved' | 'added' | 'removed' | 'resized'
  topicId: ID
  text: string
}

export interface ChangeSummary {
  id: string
  title: string
  items: PlanChange[]
  /** Extra sentence of context (e.g. why the plan reacted). */
  note?: string
  canUndo: boolean
}
