/**
 * Forecast view-model for one topic. Built from the SAME memory functions the
 * scheduler optimises, so what the chart shows is what the plan assumes.
 *
 * Three kinds of numbers are kept visibly separate:
 *  - observed:  raw recall-check scores (k / n) — what actually happened;
 *  - history:   the model's estimate before today (piecewise from each check);
 *  - forecast:  what the model expects from today to the exam
 *               (with planned reviews, and with no further review).
 */
import type { AppData, Exam, Subject, Topic } from '../types'
import { MIN_PER_DAY, momentToAbs, type LocalMoment } from './time'
import { examFor, examStartAbs } from './plan'
import { futureReviews } from './insights'
import { forecastCurve, projectionMemory, recallAt, type CurvePoint, type PlannedReview } from './memory'
import { ENGINE as E } from './config'

export interface ObservedPoint {
  atAbs: number
  value: number
  correct: number
  total: number
}

export interface ForecastView {
  topic: Topic
  subject: Subject
  exam: Exam
  startAbs: number
  nowAbs: number
  examAbs: number
  history: CurvePoint[]
  plan: CurvePoint[]
  baseline: CurvePoint[]
  observed: ObservedPoint[]
  reviews: PlannedReview[]
  recallNow: number
  examPlan: number
  examBaseline: number
  target: number
}

const STEP = 360 // minutes between samples (6 h)

export function buildForecast(data: AppData, topicId: string, now: LocalMoment): ForecastView | null {
  const topic = data.topics.find((t) => t.id === topicId)
  if (!topic) return null
  const subject = data.subjects.find((s) => s.id === topic.subjectId)
  const exam = examFor(data, topic)
  const examAbs = examStartAbs(exam)
  const nowAbs = momentToAbs(now)
  if (!subject || !exam || examAbs === null || examAbs <= nowAbs) return null

  const mem = projectionMemory(topic.memory, topic.struggling)
  const quizzes = data.quizzes.filter((q) => q.topicId === topicId).sort((a, b) => a.atAbs - b.atAbs)
  const lookback = nowAbs - 7 * MIN_PER_DAY
  const inRange = quizzes.filter((q) => q.atAbs >= lookback && q.atAbs <= nowAbs)
  const before = quizzes.filter((q) => q.atAbs < lookback)
  const lastBefore = before[before.length - 1]

  // ---- history (model estimate up to now) ----
  const history: CurvePoint[] = []
  const anchors: { at: number; a: number; s: number }[] = []
  if (lastBefore) anchors.push({ at: lookback, a: lastBefore.recallAfter * Math.exp(-(lookback - lastBefore.atAbs) / MIN_PER_DAY / lastBefore.stabilityAfter), s: lastBefore.stabilityAfter })
  for (const q of inRange) {
    if (anchors.length === 0) history.push({ atAbs: q.atAbs, recall: q.recallBefore })
    anchors.push({ at: q.atAbs, a: q.recallAfter, s: q.stabilityAfter })
  }
  if (anchors.length === 0 && topic.memory.anchor <= nowAbs) {
    anchors.push({ at: Math.max(topic.memory.anchor, lookback), a: recallAt(topic.memory, Math.max(topic.memory.anchor, lookback)), s: topic.memory.stability })
  }
  anchors.forEach((an, i) => {
    const end = i + 1 < anchors.length ? anchors[i + 1].at : nowAbs
    for (let t = an.at; t < end; t += STEP) history.push({ atAbs: t, recall: Math.min(1, an.a * Math.exp(-(t - an.at) / MIN_PER_DAY / an.s)) })
    if (i + 1 < anchors.length) history.push({ atAbs: end, recall: Math.min(1, an.a * Math.exp(-(end - an.at) / MIN_PER_DAY / an.s)) })
  })

  // ---- forecast (now → exam) ----
  const reviews = futureReviews(data, topicId, nowAbs)
  const plan = forecastCurve(mem, reviews, nowAbs, examAbs, STEP)
  const baseline = forecastCurve(mem, [], nowAbs, examAbs, STEP)

  const startAbs = history.length > 0 ? history[0].atAbs : nowAbs
  return {
    topic,
    subject,
    exam,
    startAbs,
    nowAbs,
    examAbs,
    history,
    plan,
    baseline,
    observed: inRange
      .concat(lastBefore && lastBefore.atAbs >= startAbs ? [lastBefore] : [])
      .filter((q) => q.atAbs >= startAbs)
      .map((q) => ({ atAbs: q.atAbs, value: q.correct / q.total, correct: q.correct, total: q.total })),
    reviews,
    recallNow: recallAt(mem, nowAbs),
    examPlan: plan[plan.length - 1]?.recall ?? 0,
    examBaseline: baseline[baseline.length - 1]?.recall ?? 0,
    target: E.TARGET_RECALL,
  }
}
