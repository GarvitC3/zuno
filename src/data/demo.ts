/**
 * Seeded demo student ("Maya") — clearly marked as sample data.
 *
 * Dates are relative to `now`, so the demo stays useful on any day. The history
 * below is *replayed through the real engine*: memory estimates come from
 * updateFromQuiz, and completion estimates come from the Beta model — nothing
 * on the dashboard is hard-coded.
 */
import type {
  AppData,
  Availability,
  Exam,
  Familiarity,
  Importance,
  QuizResult,
  Session,
  Subject,
  Topic,
} from '../types'
import { initialCompletionModel, outcomeFromMinutes, updateCompletion } from '../engine/completion'
import { ENGINE as E } from '../engine/config'
import { initialMemory, updateFromQuiz } from '../engine/memory'
import { replan, sortSessions } from '../engine/plan'
import { addDays, momentToAbs, toAbs, weekdayOf, type LocalMoment } from '../engine/time'

interface DemoTopic {
  key: string
  subject: 'math' | 'phys' | 'chem'
  name: string
  importance: Importance
  familiarity: Familiarity | null
  bankKey: string
}

const DEMO_TOPICS: DemoTopic[] = [
  { key: 'limits', subject: 'math', name: 'Limits', importance: 3, familiarity: 4, bankKey: 'math.limits' },
  { key: 'derivatives', subject: 'math', name: 'Derivatives', importance: 4, familiarity: 3, bankKey: 'math.derivatives' },
  { key: 'integration', subject: 'math', name: 'Integration basics', importance: 4, familiarity: null, bankKey: 'math.integration' },
  { key: 'kinematics', subject: 'phys', name: 'Kinematics', importance: 3, familiarity: 3, bankKey: 'phys.kinematics' },
  { key: 'newton', subject: 'phys', name: "Newton's laws", importance: 5, familiarity: 2, bankKey: 'phys.newton' },
  { key: 'energy', subject: 'phys', name: 'Work and energy', importance: 4, familiarity: 3, bankKey: 'phys.energy' },
  { key: 'atomic', subject: 'chem', name: 'Atomic structure', importance: 3, familiarity: 4, bankKey: 'chem.atomic' },
  { key: 'bonding', subject: 'chem', name: 'Chemical bonding', importance: 5, familiarity: 3, bankKey: 'chem.bonding' },
  { key: 'stoich', subject: 'chem', name: 'Stoichiometry', importance: 4, familiarity: null, bankKey: 'chem.stoich' },
]

interface HistoryItem {
  daysAgo: number
  slot: 0 | 1
  topic: string
  durationMin: number
  /** Minutes actually studied. 0 = skipped. */
  actualMin: number
  quiz?: [number, number]
}

/**
 * Two weeks of plausible behaviour. Patterns worth noticing (the engine finds
 * them on its own): 30-minute sessions are almost always finished; 45–60
 * minute sessions are often skipped or cut short; Newton's laws keeps scoring
 * 2/5 – 3/5 with the physics exam closest.
 */
const HISTORY: HistoryItem[] = [
  { daysAgo: 14, slot: 0, topic: 'limits', durationMin: 30, actualMin: 30, quiz: [3, 5] },
  { daysAgo: 13, slot: 0, topic: 'kinematics', durationMin: 30, actualMin: 30, quiz: [4, 5] },
  { daysAgo: 13, slot: 1, topic: 'atomic', durationMin: 30, actualMin: 30, quiz: [4, 5] },
  { daysAgo: 12, slot: 0, topic: 'derivatives', durationMin: 45, actualMin: 0 },
  { daysAgo: 11, slot: 0, topic: 'newton', durationMin: 45, actualMin: 25 },
  { daysAgo: 10, slot: 0, topic: 'bonding', durationMin: 30, actualMin: 30, quiz: [4, 5] },
  { daysAgo: 9, slot: 0, topic: 'derivatives', durationMin: 30, actualMin: 30, quiz: [3, 5] },
  { daysAgo: 8, slot: 0, topic: 'energy', durationMin: 30, actualMin: 30, quiz: [5, 5] },
  { daysAgo: 7, slot: 0, topic: 'limits', durationMin: 20, actualMin: 20, quiz: [4, 5] },
  { daysAgo: 6, slot: 0, topic: 'kinematics', durationMin: 30, actualMin: 0 },
  { daysAgo: 5, slot: 0, topic: 'newton', durationMin: 30, actualMin: 30, quiz: [1, 5] },
  { daysAgo: 4, slot: 0, topic: 'bonding', durationMin: 60, actualMin: 0 },
  { daysAgo: 2, slot: 0, topic: 'newton', durationMin: 30, actualMin: 30, quiz: [2, 5] },
  { daysAgo: 3, slot: 1, topic: 'derivatives', durationMin: 20, actualMin: 20, quiz: [4, 5] },
  { daysAgo: 3, slot: 0, topic: 'atomic', durationMin: 45, actualMin: 20 },
  { daysAgo: 1, slot: 1, topic: 'limits', durationMin: 30, actualMin: 30, quiz: [5, 5] },
  { daysAgo: 2, slot: 1, topic: 'bonding', durationMin: 30, actualMin: 30, quiz: [4, 5] },
]

export function demoAvailability(): Availability {
  const weekdays = [1, 2, 3, 4, 5]
  return {
    windows: [
      { id: 'demo-w-wk1', days: weekdays, startMin: 15 * 60 + 45, endMin: 18 * 60 + 30 },
      { id: 'demo-w-wk2', days: weekdays, startMin: 19 * 60 + 30, endMin: 21 * 60 },
      { id: 'demo-w-sat1', days: [6], startMin: 10 * 60, endMin: 12 * 60 + 30 },
      { id: 'demo-w-sat2', days: [6], startMin: 14 * 60, endMin: 17 * 60 },
      { id: 'demo-w-sun1', days: [0], startMin: 10 * 60, endMin: 12 * 60 + 30 },
      { id: 'demo-w-sun2', days: [0], startMin: 15 * 60, endMin: 18 * 60 },
    ],
    commitments: [
      { id: 'demo-c-school', label: 'School', kind: 'school', days: weekdays, startMin: 8 * 60 + 30, endMin: 15 * 60 + 30 },
      { id: 'demo-c-football', label: 'Football practice', kind: 'practice', days: [2, 4], startMin: 16 * 60 + 30, endMin: 18 * 60 },
      { id: 'demo-c-dinner', label: 'Dinner', kind: 'meals', days: [0, 1, 2, 3, 4, 5, 6], startMin: 18 * 60 + 30, endMin: 19 * 60 + 30 },
      { id: 'demo-c-sleep', label: 'Sleep', kind: 'sleep', days: [0, 1, 2, 3, 4, 5, 6], startMin: 23 * 60, endMin: 7 * 60 },
    ],
    extraWindows: [],
    blockedDates: [],
    preferredSessionMin: 45,
    breakMin: 10,
    maxDailyMin: 120,
  }
}

export const DEMO_STUDENT_NAME = 'Maya'

export function createDemoData(now: LocalMoment): AppData {
  const today = now.date
  const nowAbs = momentToAbs(now)

  const subjects: Subject[] = [
    { id: 'demo-math', name: 'Mathematics', color: 'blue', sample: true },
    { id: 'demo-phys', name: 'Physics', color: 'peach', sample: true },
    { id: 'demo-chem', name: 'Chemistry', color: 'mint', sample: true },
  ]
  const examOffset = { math: 13, phys: 7, chem: 20 } as const
  const exams: Exam[] = (['math', 'phys', 'chem'] as const).map((k) => ({
    id: `demo-exam-${k}`,
    subjectId: `demo-${k}`,
    name: `${subjects.find((s) => s.id === `demo-${k}`)!.name} exam`,
    date: addDays(today, examOffset[k]),
    startMin: E.DEFAULT_EXAM_START_MIN,
  }))

  // Topics start from a self-rated estimate. Those with history were rated two weeks ago;
  // the two the student has not been checked on yet were rated recently.
  const ratedAt = (key: string) => toAbs(addDays(today, key === 'integration' || key === 'stoich' ? -3 : -15), 12 * 60)
  const topics: Topic[] = DEMO_TOPICS.map((d) => ({
    id: `demo-t-${d.key}`,
    subjectId: `demo-${d.subject}`,
    examId: `demo-exam-${d.subject}`,
    name: d.name,
    importance: d.importance,
    struggling: false,
    prerequisites: d.key === 'integration' ? ['demo-t-derivatives'] : d.key === 'derivatives' ? ['demo-t-limits'] : [],
    memory: initialMemory(d.familiarity, ratedAt(d.key)),
    bankKey: d.bankKey,
    sample: true,
  }))

  // Replay the history in time order.
  let completion = initialCompletionModel()
  const sessions: Session[] = []
  const quizzes: QuizResult[] = []
  const ordered = [...HISTORY].sort((a, b) => b.daysAgo - a.daysAgo || a.slot - b.slot)
  ordered.forEach((h, i) => {
    const date = addDays(today, -h.daysAgo)
    const weekend = weekdayOf(date) === 0 || weekdayOf(date) === 6
    const base = weekend ? 10 * 60 : 19 * 60 + 30
    const startMin = base + h.slot * 70
    const topicId = `demo-t-${h.topic}`
    const outcome = outcomeFromMinutes(h.durationMin, h.actualMin)
    completion = updateCompletion(completion, h.durationMin, outcome)
    const status: Session['status'] =
      outcome.kind === 'completed' ? 'completed' : outcome.kind === 'partial' ? 'partial' : 'skipped'
    const session: Session = {
      id: `demo-s${i + 1}`,
      topicId,
      date,
      startMin,
      durationMin: h.durationMin,
      status,
      locked: false,
      actual: status === 'skipped' ? undefined : { startAbs: toAbs(date, startMin), minutes: h.actualMin },
      sample: true,
    }
    if (h.quiz && status !== 'skipped') {
      const at = toAbs(date, startMin + h.actualMin)
      const topic = topics.find((t) => t.id === topicId)!
      const upd = updateFromQuiz(topic.memory, { correct: h.quiz[0], total: h.quiz[1] }, at)
      topic.memory = upd.next
      const quiz: QuizResult = {
        id: `demo-q${quizzes.length + 1}`,
        topicId,
        sessionId: session.id,
        atAbs: at,
        correct: h.quiz[0],
        total: h.quiz[1],
        source: 'sample',
        recallBefore: upd.recallBefore,
        recallAfter: upd.next.recall,
        stabilityBefore: upd.stabilityBefore,
        stabilityAfter: upd.stabilityAfter,
        sample: true,
      }
      quizzes.push(quiz)
      session.quizId = quiz.id
    }
    sessions.push(session)
  })

  const base: AppData = {
    version: 1,
    profile: { name: DEMO_STUDENT_NAME, isSample: true, createdAt: nowAbs },
    onboarded: true,
    subjects,
    exams,
    topics,
    availability: demoAvailability(),
    sessions: sortSessions(sessions),
    quizzes,
    completion,
    planMeta: { generatedFor: null, unmet: [] },
    activeTimer: null,
    settings: { timerByDefault: true },
  }
  return replan(base, now).data
}
