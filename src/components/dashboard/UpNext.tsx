import { CalendarClock, CalendarPlus, Clock, Play, SkipForward, Hourglass } from 'lucide-react'
import { useMemo } from 'react'
import { describeExplanation, explainSession, sessionState } from '../../engine/insights'
import { examFor } from '../../engine/plan'
import { diffDays, formatClock, formatDateWithWeekday, relativeDay, type LocalMoment } from '../../engine/time'
import { useActions } from '../../state/context'
import { navigate } from '../../state/router'
import type { AppData, Session } from '../../types'
import { Astronaut } from '../brand/Astronaut'
import { SubjectChip } from '../session-ui'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface Props {
  data: AppData
  now: LocalMoment
  session: Session | null
  onMove: (id: string) => void
}

export function UpNext({ data, now, session, onMove }: Props) {
  const store = useActions()
  const topic = session ? data.topics.find((t) => t.id === session.topicId) : undefined
  const subject = topic ? data.subjects.find((s) => s.id === topic.subjectId) : undefined
  const exam = topic ? examFor(data, topic) : null

  const text = useMemo(() => {
    if (!session || !topic || !subject) return null
    const exp = explainSession(data, session, now)
    return exp ? describeExplanation(exp, { topic: topic.name, subject: subject.name }, data.completion, session.durationMin, data.availability.preferredSessionMin) : null
  }, [data, now, session, topic, subject])

  if (!session || !topic || !subject) return <UpNextEmpty data={data} now={now} />

  const state = sessionState(session, now)
  const day = relativeDay(session.date, now.date)
  const examDays = exam ? diffDays(now.date, exam.date) : null

  return (
    <section className="panel panel--glow upnext" aria-labelledby="upnext-h">
      <div className="upnext__main stack">
        <div className="row row--wrap">
          <span className="chip chip--blue">{state === 'now' ? 'Happening now' : 'Up next'}</span>
          <SubjectChip subject={subject} />
        </div>
        <div>
          <h2 id="upnext-h" className="upnext__title">{topic.name}</h2>
          <ul className="upnext__meta">
            <li>
              <Clock size={16} aria-hidden="true" />
              <span>
                {cap(day)} · {formatClock(session.startMin)} – {formatClock(session.startMin + session.durationMin)}
              </span>
            </li>
            <li>
              <Hourglass size={16} aria-hidden="true" />
              <span>{session.durationMin} min</span>
            </li>
            {exam && examDays !== null ? (
              <li>
                <CalendarClock size={16} aria-hidden="true" />
                <span>
                  {subject.name} exam {examDays === 0 ? 'today' : examDays === 1 ? 'tomorrow' : `in ${examDays} days`} <span className="muted">({formatDateWithWeekday(exam.date)})</span>
                </span>
              </li>
            ) : null}
          </ul>
        </div>

        {text ? (
          <div className="reason">
            <p className="eyebrow">Why this session</p>
            <p className="reason__headline">{text.headline}</p>
            <details className="disclosure">
              <summary>
                <ChevronIcon /> Show the math
              </summary>
              <ul className="kbd-list small muted" style={{ marginTop: 6 }}>
                {text.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <p className="small muted" style={{ marginTop: 8 }}>
                All forecasts are estimates, not promises.
              </p>
            </details>
          </div>
        ) : null}

        <div className="row row--wrap">
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => {
              store.startSession(session.id)
              navigate(`/session/${session.id}`)
            }}
          >
            <Play size={19} aria-hidden="true" /> Start session
          </button>
          <button type="button" className="btn" onClick={() => onMove(session.id)}>
            <CalendarClock size={17} aria-hidden="true" /> Move
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => store.skipSession(session.id)}>
            <SkipForward size={17} aria-hidden="true" /> Skip
          </button>
        </div>
      </div>
      <div className="upnext__mascot" aria-hidden="true">
        <Astronaut mood="wave" size={118} />
        <p className="bubble">Ready when you are.</p>
      </div>
    </section>
  )
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function UpNextEmpty({ data, now }: { data: AppData; now: LocalMoment }) {
  const hasWindows = data.availability.windows.length > 0
  const liveTopics = data.topics.filter((t) => {
    const e = data.exams.find((x) => x.id === t.examId)
    return e && diffDays(now.date, e.date) >= 0
  })
  let title = 'You are all caught up'
  let body = 'Nothing needs review right now. Zuno will bring the next session up as soon as one is worthwhile.'
  let cta: { label: string; path: string } | null = null
  if (data.topics.length === 0) {
    title = 'Add a subject to get started'
    body = 'Tell Zuno what you are studying and when the exam is, and it will plan your first session.'
    cta = { label: 'Add a subject', path: '/subjects' }
  } else if (liveTopics.length === 0) {
    title = 'Your exams have passed'
    body = 'There is nothing left to plan. Add a new subject or exam date when the next one comes up.'
    cta = { label: 'Open subjects', path: '/subjects' }
  } else if (!hasWindows) {
    title = 'No study time set aside yet'
    body = 'Add the times you could study and Zuno will plan around your commitments.'
    cta = { label: 'Add study times', path: '/settings' }
  } else if (data.planMeta.unmet.length > 0) {
    title = 'No free time left before your exams'
    body = 'Your study windows are full or end before the exams. Add study time, or use Course Correction to choose priorities.'
    cta = { label: 'Open Course Correction', path: '/correction' }
  }
  return (
    <section className="panel upnext upnext--empty" aria-labelledby="upnext-h">
      <div className="stack">
        <span className="chip chip--blue">Up next</span>
        <h2 id="upnext-h" className="upnext__title">{title}</h2>
        <p className="muted">{body}</p>
        {cta ? (
          <div>
            <a className="btn btn--primary" href={`#${cta.path}`}>
              <CalendarPlus size={17} aria-hidden="true" /> {cta.label}
            </a>
          </div>
        ) : null}
      </div>
      <div className="upnext__mascot" aria-hidden="true">
        <Astronaut mood="rest" size={110} />
        <p className="bubble">A good place to pick things back up.</p>
      </div>
    </section>
  )
}
