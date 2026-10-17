/**
 * First-time setup: draft types, field-level validation, and conversion of a
 * finished draft into a fully planned AppData (not saved until accepted).
 */
import type { AppData, Availability, DateKey, Familiarity, Importance } from '../types'
import { initialCompletionModel } from '../engine/completion'
import { ENGINE as E } from '../engine/config'
import { uid } from '../engine/ids'
import { initialMemory } from '../engine/memory'
import { replan } from '../engine/plan'
import { allInsights } from '../engine/insights'
import { commitmentsOn, mergeIntervals, subtractIntervals } from '../engine/slots'
import {
  addDays,
  diffDays,
  formatClock,
  formatDateWithWeekday,
  formatMinutes,
  isValidDateKey,
  momentToAbs,
  weekdayLong,
  weekdayShort,
  type LocalMoment,
} from '../engine/time'
import { emptyData } from '../state/persistence'
import { nextSubjectColor } from './ops'

export interface DraftTopic {
  id: string
  name: string
  importance: Importance
  familiarity: Familiarity | null
}
export interface DraftSubject {
  id: string
  name: string
  examDate: DateKey | ''
  topics: DraftTopic[]
}
export interface OnboardingDraft {
  name: string
  subjects: DraftSubject[]
  availability: Availability
}

export type FormErrors = Record<string, string>

export function newDraftTopic(): DraftTopic {
  return { id: uid('dt'), name: '', importance: 3, familiarity: null }
}

export function newDraftSubject(): DraftSubject {
  return { id: uid('ds'), name: '', examDate: '', topics: [newDraftTopic()] }
}

export function emptyDraft(): OnboardingDraft {
  return { name: '', subjects: [newDraftSubject()], availability: emptyData().availability }
}

// ---- Step 1: subjects -----------------------------------------------------------------

export const MAX_SUBJECTS = 8
export const MAX_TOPICS_PER_SUBJECT = 20

export function validateSubjects(draft: OnboardingDraft, today: DateKey): FormErrors {
  const errors: FormErrors = {}
  if (draft.subjects.length === 0) errors.subjects = 'Add at least one subject to get started.'
  const names = new Map<string, string>()
  for (const s of draft.subjects) {
    const name = s.name.trim()
    if (!name) errors[`subject:${s.id}:name`] = 'Give this subject a name.'
    else if (names.has(name.toLowerCase())) errors[`subject:${s.id}:name`] = `You already added ${name}.`
    else names.set(name.toLowerCase(), s.id)

    if (!s.examDate) errors[`subject:${s.id}:exam`] = 'Pick the exam date so Zuno knows your deadline.'
    else if (!isValidDateKey(s.examDate)) errors[`subject:${s.id}:exam`] = 'That date does not look right.'
    else if (diffDays(today, s.examDate) < 1) errors[`subject:${s.id}:exam`] = 'Pick a date after today. Zuno plans study time before the exam.'
    else if (diffDays(today, s.examDate) > 365) errors[`subject:${s.id}:exam`] = 'That is more than a year away. Pick a closer date.'

    if (s.topics.length === 0) errors[`subject:${s.id}:topics`] = 'Add at least one topic for this subject.'
    const topicNames = new Set<string>()
    for (const t of s.topics) {
      const tn = t.name.trim()
      if (!tn) errors[`topic:${t.id}:name`] = 'Name this topic.'
      else if (topicNames.has(tn.toLowerCase())) errors[`topic:${t.id}:name`] = `"${tn}" is already in this subject.`
      else topicNames.add(tn.toLowerCase())
    }
  }
  return errors
}

// ---- Step 2: availability ---------------------------------------------------------------

const REF_SUNDAY: DateKey = '2026-01-04'
const refDate = (weekday: number) => addDays(REF_SUNDAY, weekday)

export function validateAvailability(av: Availability): FormErrors {
  const errors: FormErrors = {}
  if (av.windows.length === 0) errors.windows = 'Add at least one time you could study. Zuno only plans inside these windows.'

  // Windows
  av.windows.forEach((w) => {
    if (w.days.length === 0) errors[`window:${w.id}`] = 'Choose at least one day.'
    else if (w.endMin <= w.startMin) errors[`window:${w.id}`] = 'The end time must be after the start time.'
    else if (w.endMin - w.startMin < E.MIN_SESSION_MIN) errors[`window:${w.id}`] = `Study windows should be at least ${E.MIN_SESSION_MIN} minutes long.`
  })
  // Overlaps between windows on a shared day
  for (let d = 0; d < 7; d++) {
    const here = av.windows.filter((w) => w.days.includes(d) && w.endMin > w.startMin).sort((a, b) => a.startMin - b.startMin)
    for (let i = 1; i < here.length; i++) {
      if (here[i].startMin < here[i - 1].endMin && !errors[`window:${here[i].id}`]) {
        errors[`window:${here[i].id}`] = `This overlaps another study window on ${weekdayLong(d)}.`
      }
    }
  }
  // Windows fully covered by commitments
  av.windows.forEach((w) => {
    if (errors[`window:${w.id}`]) return
    for (const d of w.days) {
      const free = subtractIntervals([{ start: w.startMin, end: w.endMin }], commitmentsOn(av, refDate(d)))
      if (free.reduce((s, i) => s + (i.end - i.start), 0) < E.MIN_SESSION_MIN) {
        errors[`window:${w.id}`] = `Your commitments already cover this whole window on ${weekdayLong(d)}.`
        return
      }
    }
  })

  // Commitments
  av.commitments.forEach((c) => {
    if (!c.label.trim()) errors[`commitment:${c.id}`] = 'Give this commitment a name.'
    else if (!c.onDate && c.days.length === 0) errors[`commitment:${c.id}`] = 'Choose at least one day.'
    else if (c.startMin === c.endMin) errors[`commitment:${c.id}`] = 'Start and end times cannot be the same.'
  })

  if (!Number.isFinite(av.preferredSessionMin) || av.preferredSessionMin < 15 || av.preferredSessionMin > 120) {
    errors.session = 'Choose a session length between 15 and 120 minutes.'
  }
  if (!Number.isFinite(av.breakMin) || av.breakMin < 0 || av.breakMin > 30) errors.break = 'Breaks can be 0 to 30 minutes.'
  if (!Number.isFinite(av.maxDailyMin) || av.maxDailyMin < 15) errors.daily = 'Set a daily limit of at least 15 minutes.'
  else if (av.maxDailyMin < Math.min(av.preferredSessionMin, 30) && !errors.session) {
    errors.daily = 'Your daily limit is shorter than a single session. Raise it or shorten your session length.'
  }

  if (!errors.windows && Object.keys(errors).every((k) => !k.startsWith('window:'))) {
    let free = 0
    for (let d = 0; d < 7; d++) {
      const wins = mergeIntervals(av.windows.filter((w) => w.days.includes(d)).map((w) => ({ start: w.startMin, end: w.endMin })))
      free += subtractIntervals(wins, commitmentsOn(av, refDate(d))).reduce((s, i) => s + (i.end - i.start), 0)
    }
    if (free < E.MIN_SESSION_MIN) errors.capacity = 'After your commitments there is no free study time. Adjust a window or a commitment.'
  }
  return errors
}

/** Non-blocking hints, shown beside the relevant field. */
export function availabilityWarnings(av: Availability): FormErrors {
  const warn: FormErrors = {}
  for (const w of av.windows) {
    if (w.endMin > w.startMin && w.endMin - w.startMin < av.preferredSessionMin) {
      warn[`window:${w.id}`] = `Shorter than your ${av.preferredSessionMin}-minute session length. Zuno will plan shorter sessions here.`
    }
  }
  return warn
}

// ---- Build the plan -----------------------------------------------------------------------

export function draftToData(draft: OnboardingDraft, now: LocalMoment): AppData {
  const nowAbs = momentToAbs(now)
  const base = emptyData()
  const used: ReturnType<typeof nextSubjectColor>[] = []
  const subjects = draft.subjects.map((s) => {
    const color = nextSubjectColor(used)
    used.push(color)
    return { id: uid('subj'), name: s.name.trim(), color, draftId: s.id }
  })
  const exams = draft.subjects.map((s, i) => ({
    id: uid('exam'),
    subjectId: subjects[i].id,
    name: `${s.name.trim()} exam`,
    date: s.examDate as DateKey,
    startMin: E.DEFAULT_EXAM_START_MIN,
  }))
  const topics = draft.subjects.flatMap((s, i) =>
    s.topics.map((t) => ({
      id: uid('topic'),
      subjectId: subjects[i].id,
      examId: exams[i].id,
      name: t.name.trim(),
      importance: t.importance,
      struggling: false,
      prerequisites: [] as string[],
      memory: initialMemory(t.familiarity, nowAbs),
    })),
  )
  const data: AppData = {
    ...base,
    profile: { name: draft.name.trim(), isSample: false, createdAt: nowAbs },
    onboarded: true,
    subjects: subjects.map(({ id, name, color }) => ({ id, name, color })),
    exams,
    topics,
    availability: draft.availability,
    completion: initialCompletionModel(),
  }
  return replan(data, now).data
}

export interface ProposalSummary {
  headline: string
  bullets: string[]
  totalMinutes: number
  sessionCount: number
}

/** Short, data-backed explanation of a proposed plan. */
export function proposalSummary(data: AppData, now: LocalMoment): ProposalSummary {
  const planned = data.sessions.filter((s) => s.status === 'planned')
  const totalMinutes = planned.reduce((s, x) => s + x.durationMin, 0)
  const insights = allInsights(data, now)
  const bullets: string[] = []

  const bySubject = new Map<string, number>()
  for (const s of planned) {
    const t = data.topics.find((x) => x.id === s.topicId)
    if (t) bySubject.set(t.subjectId, (bySubject.get(t.subjectId) ?? 0) + s.durationMin)
  }
  const top = [...bySubject.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top) {
    const subj = data.subjects.find((s) => s.id === top[0])
    const exam = data.exams.find((e) => e.subjectId === top[0])
    if (subj && exam) {
      bullets.push(
        `Most time goes to ${subj.name} (${formatMinutes(top[1])}) because its exam is ${diffDays(now.date, exam.date) === 1 ? 'tomorrow' : `on ${formatDateWithWeekday(exam.date)}`} and the starting estimates show the most to gain.`,
      )
    }
  }
  const first = planned[0]
  if (first) {
    const t = data.topics.find((x) => x.id === first.topicId)
    bullets.push(
      `Your first session is ${t?.name ?? 'a topic'} for ${first.durationMin} minutes on ${formatDateWithWeekday(first.date)} at ${formatClock(first.startMin)}.`,
    )
  }
  const unsure = data.topics.filter((t) => t.memory.source === 'unsure').length
  if (unsure > 0) {
    bullets.push(`${unsure} ${unsure === 1 ? 'topic is' : 'topics are'} still on a neutral starting estimate. A quick recall check after each session will sharpen it.`)
  }
  bullets.push(
    `Your chance of finishing each session starts at an assumed average (${Math.round(E.COMPLETION_PRIORS.medium.alpha / (E.COMPLETION_PRIORS.medium.alpha + E.COMPLETION_PRIORS.medium.beta) * 100)}% for ${E.SHORT_MAX_MIN + 1}–${E.MEDIUM_MAX_MIN} minute blocks). Zuno learns your real pattern from sessions you complete or skip.`,
  )
  if (data.planMeta.unmet.length > 0) {
    const names = data.planMeta.unmet
      .map((u) => data.topics.find((t) => t.id === u.topicId)?.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ')
    bullets.push(`Heads up: there is not enough free time to fully prepare ${names}${data.planMeta.unmet.length > 3 ? ' and more' : ''}. You can add study time, or use Course Correction later to choose priorities.`)
  }
  const nearest = insights.filter((i) => i.daysToExam !== null).sort((a, b) => (a.daysToExam as number) - (b.daysToExam as number))[0]
  return {
    headline:
      planned.length === 0
        ? 'There is no room for sessions yet'
        : `${planned.length} sessions, ${formatMinutes(totalMinutes)} of study${nearest ? `, starting with your ${nearest.subject.name} exam in ${nearest.daysToExam} ${nearest.daysToExam === 1 ? 'day' : 'days'}` : ''}`,
    bullets,
    totalMinutes,
    sessionCount: planned.length,
  }
}

// Convenience presets for the "Your week" step -------------------------------------------------

export const WEEKDAYS = [1, 2, 3, 4, 5]
export const WEEKEND = [0, 6]

export function weekdayChipLabel(d: number): string {
  return weekdayShort(d)
}
