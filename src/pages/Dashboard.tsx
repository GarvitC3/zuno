import { Lightbulb, LifeBuoy, Play, TimerReset, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Attention } from '../components/dashboard/Attention'
import { FlightPlan } from '../components/dashboard/FlightPlan'
import { MiniForecast } from '../components/dashboard/MiniForecast'
import { UpNext } from '../components/dashboard/UpNext'
import { ChangeBanner } from '../components/ChangeBanner'
import { HowItWorks } from '../components/HowItWorks'
import { SessionDetail } from '../components/SessionDetail'
import { Astronaut } from '../components/brand/Astronaut'
import { diffDays, formatDateLong, formatMinutes } from '../engine/time'
import { useActions, useData, useDerived, useNow, useUi } from '../state/context'
import { navigate } from '../state/router'
import { formatElapsed, useElapsedMs } from '../state/useElapsed'
import { IMPORTANCE_LABEL } from '../engine/insights'

function greeting(hour: number, name: string): string {
  const part = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}.` : `${part}.`
}

export function Dashboard() {
  const data = useData()
  const now = useNow()
  const store = useActions()
  const ui = useUi()
  const d = useDerived(data, now)
  const [how, setHow] = useState(false)
  const [detail, setDetail] = useState<{ id: string; mode: 'view' | 'move' } | null>(null)

  const closest = useMemo(() => {
    const live = d.insights.filter((i) => i.daysToExam !== null).sort((a, b) => (a.daysToExam as number) - (b.daysToExam as number))
    return live[0]
  }, [d.insights])

  const unmet = data.planMeta.unmet
  const unmetNames = unmet
    .map((u) => data.topics.find((t) => t.id === u.topicId)?.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ')
  const missedCount = d.behind.missed.length
  const timer = data.activeTimer
  const timedSession = timer ? data.sessions.find((s) => s.id === timer.sessionId && s.status === 'planned') : undefined
  const timedTopic = timedSession ? data.topics.find((t) => t.id === timedSession.topicId) : undefined
  const elapsed = useElapsedMs(timedSession ? timer : null)

  return (
    <>
      <div className="context-row">
        <p className="context-row__date">{formatDateLong(now.date)}</p>
        <div className="row row--wrap">
          {closest ? (
            <span className="chip chip--peach">
              {closest.subject.name} exam in {closest.daysToExam} {closest.daysToExam === 1 ? 'day' : 'days'}
            </span>
          ) : null}
          {data.profile.isSample ? <span className="chip chip--mint">Sample data</span> : null}
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setHow(true)}>
            <Lightbulb size={15} aria-hidden="true" /> How Zuno thinks
          </button>
        </div>
      </div>

      <header className="page-head">
        <div>
          <h1>{greeting(Math.floor(now.minute / 60), data.profile.name)}</h1>
          <p>A little progress. A clearer path.</p>
        </div>
      </header>

      {ui.notice ? (
        <div className="banner banner--peach" role="status">
          <div className="banner__icon"><TriangleAlert size={18} aria-hidden="true" /></div>
          <div className="banner__body">
            <p>{ui.notice}</p>
            <div className="banner__actions">
              <button type="button" className="btn btn--sm" onClick={() => store.dismissNotice()}>Got it</button>
            </div>
          </div>
        </div>
      ) : null}

      {timedSession && timedTopic ? (
        <section className="banner banner--mint" aria-label="Session in progress">
          <div className="banner__icon"><TimerReset size={18} aria-hidden="true" /></div>
          <div className="banner__body">
            <p className="banner__title">Session in progress: {timedTopic.name}</p>
            <p className="muted small">
              {timer?.useTimer ? `${formatElapsed(elapsed)} of ${timedSession.durationMin} min so far${timer.runningSince === null ? ' (paused)' : ''}.` : 'Timer off.'} Pick up where you left off.
            </p>
            <div className="banner__actions">
              <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate(`/session/${timedSession.id}`)}>
                <Play size={15} aria-hidden="true" /> Resume session
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => store.cancelSession()}>Discard timer</button>
            </div>
          </div>
        </section>
      ) : null}

      <ChangeBanner />

      {d.behind.behind && !ui.change ? (
        <section className="banner banner--peach" aria-label="Falling behind">
          <div className="banner__icon"><LifeBuoy size={18} aria-hidden="true" /></div>
          <div className="banner__body">
            <p className="banner__title">Plans change. We can work with that.</p>
            <p className="muted small">
              {missedCount > 0 ? `${missedCount} earlier ${missedCount === 1 ? 'session was' : 'sessions were'} not recorded. ` : ''}
              {unmet.length > 0 ? `There may not be enough time to fully prepare ${unmetNames}${unmet.length > 3 ? ' and more' : ''}. ` : ''}
              Course Correction builds a realistic plan from the time you actually have.
            </p>
            <div className="banner__actions">
              <a className="btn btn--sm btn--peach" href="#/correction">Open Course Correction</a>
              {missedCount > 0 ? (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => store.markMissedAsSkipped()}>
                  Mark earlier sessions as skipped
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <div className="dash-grid">
        <UpNext data={data} now={now} session={d.next} onMove={(id) => setDetail({ id, mode: 'move' })} />
        <FlightPlan data={data} now={now} summary={d.today} onOpen={(id) => setDetail({ id, mode: 'view' })} />
      </div>

      <div className="dash-grid dash-grid--lower">
        <MiniForecast data={data} now={now} defaultTopicId={d.next?.topicId} />
        <Attention items={d.attention} />
      </div>

      {unmet.length > 0 ? (
        <section className="banner banner--coral" aria-label="Not enough study time">
          <div className="banner__icon"><TriangleAlert size={18} aria-hidden="true" /></div>
          <div className="banner__body">
            <p className="banner__title">Not enough free time for everything</p>
            <ul className="banner__list">
              {unmet.slice(0, 4).map((u) => {
                const t = data.topics.find((x) => x.id === u.topicId)
                if (!t) return null
                const exam = data.exams.find((e) => e.id === t.examId)
                const why = u.reason === 'no_free_time' ? 'no free study time before the exam' : u.reason === 'daily_limit' ? 'your daily study limit is reached' : 'the time budget is used up'
                return (
                  <li key={u.topicId}>
                    {t.name} ({IMPORTANCE_LABEL[t.importance].toLowerCase()}): forecast {Math.round(u.projectedRecall * 100)}% on exam day, below the {Math.round(u.targetRecall * 100)}% target. About {formatMinutes(u.extraMinutes)} more would help, but {why}
                    {exam ? ` (exam in ${diffDays(now.date, exam.date)} days)` : ''}.
                  </li>
                )
              })}
            </ul>
            <div className="banner__actions">
              <a className="btn btn--sm" href="#/correction">Use Course Correction</a>
              <a className="btn btn--sm btn--ghost" href="#/settings">Add study time</a>
            </div>
          </div>
        </section>
      ) : null}

      {d.today.totalCount > 0 && d.today.doneCount === d.today.totalCount ? (
        <section className="banner banner--mint">
          <div className="banner__icon"><Astronaut mood="cheer" size={30} /></div>
          <div className="banner__body">
            <p className="banner__title">Today's plan is complete</p>
            <p className="muted small">A little progress. A clearer path. See you at the next session.</p>
          </div>
        </section>
      ) : null}

      <SessionDetail data={data} now={now} sessionId={detail?.id ?? null} mode={detail?.mode} onClose={() => setDetail(null)} />
      <HowItWorks open={how} onClose={() => setHow(false)} data={data} now={now} topicId={d.next?.topicId} />
    </>
  )
}
