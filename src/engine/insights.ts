/**
 * Read-only views over AppData that the UI needs: per-topic insight, the next
 * session, today's flight plan, "am I behind?", and structured explanations.
 * Everything here is derived from the same engine functions the scheduler uses.
 */
import type { AppData, Exam, Explanation, ExplanationPrimary, QuizResult, Session, Subject, Topic } from '../types'
import { durationGroup, isInitialEstimate, pComplete } from './completion'
import { ENGINE as E } from './config'
import { isMissed, examFor, examStartAbs, sessionEndAbs, sessionStartAbs } from './plan'
import {
  projectionMemory,
  projectedRecall,
  recallAt,
  recallStatus,
  type PlannedReview,
  type RecallStatus,
} from './memory'
import { reviewsFromSessions } from './scheduler'
import { sessionMinutes, sessionSpan } from './slots'
import { diffDays, momentToAbs, toAbs, type LocalMoment } from './time'

export interface TopicInsight {
  topic: Topic
  subject: Subject
  exam: Exam | null
  examPassed: boolean
  daysToExam: number | null
  recallNow: number
  status: RecallStatus
  /** Forecast exam-day recall with the current plan. */
  projectedWith: number | null
  /** Forecast exam-day recall with no further review. */
  projectedWithout: number | null
  lastReviewAbs: number | null
  nextSession: Session | null
  recentQuizzes: QuizResult[]
  lastQuiz: QuizResult | null
  plannedMinutes: number
}

export function futureReviews(data: AppData, topicId: string, nowAbs: number): PlannedReview[] {
  return reviewsFromSessions(data.sessions, topicId, nowAbs, data.completion)
}

export function topicInsight(data: AppData, topic: Topic, now: LocalMoment): TopicInsight | null {
  const subject = data.subjects.find((s) => s.id === topic.subjectId)
  if (!subject) return null
  const nowAbs = momentToAbs(now)
  const exam = examFor(data, topic)
  const examAbs = examStartAbs(exam)
  const examPassed = examAbs !== null && examAbs <= nowAbs
  const mem = projectionMemory(topic.memory, topic.struggling)
  const recallNow = recallAt(mem, nowAbs)

  const quizzes = data.quizzes.filter((q) => q.topicId === topic.id).sort((a, b) => b.atAbs - a.atAbs)
  const doneSessions = data.sessions.filter(
    (s) => s.topicId === topic.id && (s.status === 'completed' || s.status === 'partial'),
  )
  const lastSessionAbs = doneSessions.reduce<number | null>((mx, s) => {
    const t = s.actual ? s.actual.startAbs + s.actual.minutes : sessionEndAbs(s)
    return mx === null || t > mx ? t : mx
  }, null)
  const lastQuizAbs = quizzes[0]?.atAbs ?? null
  const lastReviewAbs =
    lastSessionAbs === null ? lastQuizAbs : lastQuizAbs === null ? lastSessionAbs : Math.max(lastSessionAbs, lastQuizAbs)

  const future = data.sessions
    .filter((s) => s.topicId === topic.id && s.status === 'planned' && sessionEndAbs(s) > nowAbs)
    .sort((a, b) => sessionStartAbs(a) - sessionStartAbs(b))

  const live = examAbs !== null && !examPassed
  return {
    topic,
    subject,
    exam,
    examPassed,
    daysToExam: exam && !examPassed ? diffDays(now.date, exam.date) : null,
    recallNow,
    status: recallStatus(recallNow),
    projectedWith: live ? projectedRecall(mem, futureReviews(data, topic.id, nowAbs), examAbs!) : null,
    projectedWithout: live ? projectedRecall(mem, [], examAbs!) : null,
    lastReviewAbs,
    nextSession: future[0] ?? null,
    recentQuizzes: quizzes.slice(0, 3),
    lastQuiz: quizzes[0] ?? null,
    plannedMinutes: future.reduce((s, x) => s + x.durationMin, 0),
  }
}

export function allInsights(data: AppData, now: LocalMoment): TopicInsight[] {
  return data.topics.map((t) => topicInsight(data, t, now)).filter((x): x is TopicInsight => x !== null)
}

/** Topics ordered by how much attention they need: lowest forecast exam-day recall first. */
export function attentionOrder(insights: TopicInsight[]): TopicInsight[] {
  const live = insights.filter((i) => !i.examPassed && i.exam)
  return [...live].sort((a, b) => {
    const pa = a.projectedWith ?? a.recallNow
    const pb = b.projectedWith ?? b.recallNow
    // Weight by importance so a core topic at 50% outranks a minor one at 45%.
    const sa = (1 - pa) * (a.topic.importance / 3)
    const sb = (1 - pb) * (b.topic.importance / 3)
    return sb - sa || a.topic.name.localeCompare(b.topic.name)
  })
}

// ---- Sessions ----------------------------------------------------------------------

export type SessionState = 'upcoming' | 'now' | 'completed' | 'partial' | 'skipped' | 'missed'

export function sessionState(s: Session, now: LocalMoment): SessionState {
  const nowAbs = momentToAbs(now)
  if (s.status === 'completed') return 'completed'
  if (s.status === 'partial') return 'partial'
  if (s.status === 'skipped') return 'skipped'
  if (isMissed(s, nowAbs)) return 'missed'
  if (sessionStartAbs(s) <= nowAbs && nowAbs < sessionEndAbs(s)) return 'now'
  return 'upcoming'
}

export function sessionsOn(data: AppData, date: string): Session[] {
  return data.sessions
    .filter((s) => sessionSpan(s).date === date)
    .sort((a, b) => sessionSpan(a).start - sessionSpan(b).start)
}

/** The next session the student should do: in progress first, otherwise the earliest upcoming. */
export function upNext(data: AppData, now: LocalMoment): Session | null {
  const nowAbs = momentToAbs(now)
  const live = data.sessions
    .filter((s) => s.status === 'planned' && sessionEndAbs(s) > nowAbs)
    .sort((a, b) => sessionStartAbs(a) - sessionStartAbs(b))
  return live[0] ?? null
}

export interface TodaySummary {
  sessions: Session[]
  plannedMinutes: number
  remainingMinutes: number
  doneCount: number
  totalCount: number
}

/** Planned = everything not skipped today; remaining = planned sessions still to do. */
export function todaySummary(data: AppData, now: LocalMoment): TodaySummary {
  const sessions = sessionsOn(data, now.date)
  const live = sessions.filter((s) => s.status !== 'skipped')
  return {
    sessions,
    plannedMinutes: live.reduce((sum, s) => sum + sessionMinutes(s), 0),
    remainingMinutes: live.filter((s) => s.status === 'planned' && !isMissed(s, momentToAbs(now))).reduce((sum, s) => sum + s.durationMin, 0),
    doneCount: live.filter((s) => s.status === 'completed' || s.status === 'partial').length,
    totalCount: live.length,
  }
}

export interface BehindStatus {
  behind: boolean
  missed: Session[]
  skippedRecently: number
  unmet: number
}

export function behindStatus(data: AppData, now: LocalMoment): BehindStatus {
  const nowAbs = momentToAbs(now)
  const missed = data.sessions.filter((s) => isMissed(s, nowAbs))
  const recentSkips = data.sessions.filter(
    (s) => s.status === 'skipped' && nowAbs - sessionStartAbs(s) <= 7 * 1440 && sessionStartAbs(s) <= nowAbs,
  ).length
  const unmet = data.planMeta.unmet.length
  return { behind: missed.length > 0 || unmet > 0 || recentSkips >= 3, missed, skippedRecently: recentSkips, unmet }
}

// ---- Explanations --------------------------------------------------------------------

/** The earliest upcoming exam date across topics (for "closest exam"). */
export function closestExamDate(data: AppData, now: LocalMoment): string | null {
  let best: string | null = null
  for (const t of data.topics) {
    const e = examFor(data, t)
    if (!e || diffDays(now.date, e.date) < 0) continue
    if (best === null || e.date < best) best = e.date
  }
  return best
}

/**
 * Build the structured facts behind one session, from live engine data.
 * Nothing here is invented: every number is recomputed from the memory model,
 * the Beta posterior, and the same marginal-gain formula the scheduler uses.
 */
export function explainSession(data: AppData, session: Session, now: LocalMoment): Explanation | null {
  const topic = data.topics.find((t) => t.id === session.topicId)
  if (!topic) return null
  const nowAbs = momentToAbs(now)
  const exam = examFor(data, topic)
  const examAbs = examStartAbs(exam)
  const mem = projectionMemory(topic.memory, topic.struggling)
  const recallNow = recallAt(mem, nowAbs)
  const others = futureReviews(
    { ...data, sessions: data.sessions.filter((s) => s.id !== session.id) },
    topic.id,
    nowAbs,
  )
  const at = sessionStartAbs(session)
  const pc = pComplete(data.completion, session.durationMin)
  const live = examAbs !== null && examAbs > at
  const base = live ? projectedRecall(mem, others, examAbs!) : recallNow
  const ifDone = live
    ? projectedRecall(mem, [...others, { atAbs: at, durationMin: session.durationMin, pComplete: 1 }], examAbs!)
    : recallNow
  const withPlan = live
    ? projectedRecall(mem, [...others, { atAbs: at, durationMin: session.durationMin, pComplete: pc }], examAbs!)
    : recallNow
  const gain = Math.max(0, ifDone - base)
  const w = Math.max(0.2, topic.importance / 3)
  const last = data.quizzes.filter((q) => q.topicId === topic.id).sort((a, b) => b.atAbs - a.atAbs)[0]
  const lastCheck = last
    ? { correct: last.correct, total: last.total, daysAgo: Math.max(0, Math.floor((nowAbs - last.atAbs) / 1440)) }
    : null
  const closest = closestExamDate(data, now)
  const isClosestExam = !!exam && closest === exam.date
  const hasHistory = !!last || topic.memory.source === 'quiz'

  let primary: ExplanationPrimary
  if (session.locked && !lastCheck) primary = 'locked'
  else if (lastCheck && lastCheck.total > 0 && lastCheck.correct / lastCheck.total <= 0.5 && lastCheck.daysAgo <= 21) primary = 'weak_check'
  else if (topic.struggling) primary = 'flagged'
  else if (isClosestExam) primary = 'closest_exam'
  else if (!hasHistory) primary = 'first_look'
  else if (recallNow < 0.55) primary = 'fading'
  else if (topic.importance >= 4) primary = 'importance'
  else primary = 'spacing'

  return {
    primary,
    recallNow,
    daysToExam: exam ? diffDays(now.date, exam.date) : 0,
    isClosestExam,
    importance: topic.importance,
    struggling: topic.struggling,
    lastCheck,
    hasHistory,
    pComplete: pc,
    durationGroup: durationGroup(session.durationMin),
    examGain: gain,
    score: (w * pc * gain) / Math.max(1, session.durationMin),
    projectedWith: withPlan,
    projectedWithout: live ? projectedRecall(mem, [], examAbs!) : recallNow,
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`

export interface ExplanationText {
  headline: string
  details: string[]
}

/** Turn engine facts into friendly sentences. Every phrase is backed by a field of `exp`. */
export function describeExplanation(
  exp: Explanation,
  names: { topic: string; subject: string },
  completion: AppData['completion'],
  sessionMin: number,
  preferredMin?: number,
): ExplanationText {
  const subj = names.subject
  const examClause = exp.isClosestExam
    ? `${subj} is your closest exam`
    : exp.daysToExam <= 0
      ? `your ${subj} exam is today`
      : `your ${subj} exam is in ${exp.daysToExam} ${exp.daysToExam === 1 ? 'day' : 'days'}`

  let headline: string
  switch (exp.primary) {
    case 'weak_check':
      headline = `Your last recall check was ${exp.lastCheck!.correct}/${exp.lastCheck!.total}, and ${examClause}.`
      break
    case 'flagged':
      headline = `You flagged ${names.topic} as a struggle, and ${examClause}.`
      break
    case 'closest_exam':
      headline = exp.hasHistory
        ? `${subj} is your closest exam, and your estimated recall for ${names.topic} is ${pct(exp.recallNow)}.`
        : `${subj} is your closest exam, and your starting estimate for ${names.topic} is ${pct(exp.recallNow)} (no recall check yet).`
      break
    case 'first_look':
      headline = `${names.topic} hasn't had a recall check yet. Starting from a ${pct(exp.recallNow)} estimate, ${examClause}.`
      break
    case 'fading':
      headline = `Your recall for ${names.topic} is estimated at ${pct(exp.recallNow)} and fading, and ${examClause}.`
      break
    case 'importance':
      headline = `${names.topic} is one of your most important topics, and ${examClause}.`
      break
    case 'locked':
      headline = `You placed this session yourself, so Zuno keeps it fixed and plans around it.`
      break
    default:
      headline = `A well-timed review: it lifts your expected exam-day recall for ${names.topic} from ${pct(exp.projectedWithout)} to ${pct(exp.projectedWith)}.`
  }

  const group = durationGroup(sessionMin)
  const initial = isInitialEstimate(completion, group)
  const details = [
    `Estimated recall now: ${pct(exp.recallNow)}${exp.hasHistory ? '' : ' (starting estimate)'}`,
    `Expected exam-day recall: ${pct(exp.projectedWithout)} with no more review → ${pct(exp.projectedWith)} with this plan`,
    `Chance you complete a ${sessionMin}-min session: ${pct(exp.pComplete)}${initial ? ' (initial estimate)' : ''}`,
    `Added by this session alone, on top of the rest of the plan: +${(exp.examGain * 100).toFixed(1)} points of exam-day recall`,
    `Ranking score: importance ${(Math.max(0.2, exp.importance / 3)).toFixed(2)} × completion ${pct(exp.pComplete)} × gain ${(exp.examGain * 100).toFixed(1)} pts ÷ ${sessionMin} min`,
  ]
  if (preferredMin && sessionMin < preferredMin) {
    const prefGroup = durationGroup(preferredMin)
    if (prefGroup !== group) {
      details.push(
        `Shorter than your ${preferredMin}-min preference: you finish this length about ${pct(pComplete(completion, sessionMin))} of the time vs ${pct(pComplete(completion, preferredMin))} for longer blocks`,
      )
    }
  }
  return { headline, details }
}

export const IMPORTANCE_LABEL: Record<number, string> = {
  1: 'Minor',
  2: 'Light',
  3: 'Standard',
  4: 'Major',
  5: 'Essential',
}

/** Re-exported so UI doesn't reach into config. */
export const TARGET_RECALL = E.TARGET_RECALL
export { toAbs }
