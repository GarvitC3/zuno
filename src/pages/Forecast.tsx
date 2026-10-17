import { Check, FlaskConical, Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ChartLegend, ForecastChart, type ChartSeries } from '../components/charts/ForecastChart'
import { forecastLegend, forecastSeries } from '../components/dashboard/MiniForecast'
import { ChangeBanner } from '../components/ChangeBanner'
import { Field } from '../components/ui/Field'
import { pct } from '../components/session-ui'
import { buildForecast } from '../engine/forecast'
import type { CurvePoint } from '../engine/memory'
import { commitmentsOn, subtractIntervals, windowsOn } from '../engine/slots'
import { runScenario, type WhatIfOp } from '../engine/whatif'
import { addDays, diffDays, formatClock, formatDateShort, formatDateWithWeekday, fromAbs, inputToMinutes, MIN_PER_DAY, momentToAbs, type LocalMoment } from '../engine/time'
import { useActions, useData, useDerived, useNow } from '../state/context'
import { navigate } from '../state/router'
import type { AppData } from '../types'

const sampleAt = (pts: CurvePoint[], abs: number): number | null => {
  let v: number | null = null
  for (const p of pts) {
    if (p.atAbs <= abs) v = p.recall
    else break
  }
  return v
}

export function Forecast() {
  const data = useData()
  const now = useNow()
  const store = useActions()
  const d = useDerived(data, now)
  const live = useMemo(() => data.topics.filter((t) => buildForecast(data, t.id, now) !== null), [data, now])
  const [topicId, setTopicId] = useState('')
  const [ops, setOps] = useState<WhatIfOp[]>([])

  const subjects = useMemo(() => data.subjects.filter((s) => live.some((t) => t.subjectId === s.id)), [data.subjects, live])
  useEffect(() => {
    const first = live.find((t) => t.id === d.next?.topicId) ?? live[0]
    if (!live.some((t) => t.id === topicId) && first) setTopicId(first.id)
  }, [live, topicId, d.next?.topicId])

  const f = useMemo(() => (topicId ? buildForecast(data, topicId, now) : null), [data, now, topicId])
  const scenario = useMemo(() => (ops.length ? runScenario(data, now, ops) : null), [data, now, ops])
  const fs = useMemo(() => (scenario && topicId ? buildForecast(scenario.data, topicId, now) : null), [scenario, topicId, now])
  const base = useMemo(() => runScenario(data, now, []).stats, [data, now])

  if (live.length === 0) {
    return (
      <>
        <header className="page-head">
          <h1>Memory forecast</h1>
        </header>
        <section className="panel empty">
          <h3>Nothing to forecast yet</h3>
          <p>Add a subject with an upcoming exam date and some topics.</p>
          <a className="btn btn--primary" href="#/subjects">Open subjects</a>
        </section>
      </>
    )
  }

  const series: ChartSeries[] = f ? forecastSeries(f) : []
  if (fs) series.push({ id: 'scenario', label: 'What-If preview', points: fs.plan, color: '#92D6BD', dash: '2 5', width: 3 })
  const legend: { label: string; color: string; dash?: string; kind?: 'line' | 'ring' | 'tri' | 'exam' }[] = [
    ...forecastLegend(),
    { label: 'Past estimate', color: '#7C89A0' },
  ]
  if (fs) legend.splice(2, 0, { label: 'What-If preview', color: '#92D6BD', dash: '2 5' })
  const reviews = f ? [...f.reviews].sort((a, b) => a.atAbs - b.atAbs) : []

  return (
    <>
      <header className="page-head">
        <h1>Memory forecast</h1>
      </header>

      <ChangeBanner />

      <div className="forecast-grid">
      <section className="panel stack stack--lg" aria-labelledby="fc-h">
        <div className="fc-head">
          <div className="stack stack--sm">
            <h2 id="fc-h" className="fc-title">{f ? f.topic.name : 'Forecast'}</h2>
            {f ? (
              <div className="row row--wrap">
                <span className="chip chip--peach">{f.subject.name} exam · {formatDateWithWeekday(f.exam.date)}, {formatClock(f.exam.startMin)}</span>
                <span className="chip">Estimate</span>
              </div>
            ) : null}
          </div>
          <div className="fc-pick">
            <label className="sr-only" htmlFor="fc-topic">Topic</label>
            <select id="fc-topic" className="select" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {subjects.map((s) => (
                <optgroup key={s.id} label={s.name}>
                  {live.filter((t) => t.subjectId === s.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {f ? (
          <>
            <ForecastChart
              series={series}
              startAbs={f.startAbs}
              nowAbs={f.nowAbs}
              examAbs={f.examAbs}
              examLabel={`Exam ${formatDateShort(fromAbs(f.examAbs).date)}`}
              dots={f.observed.map((o) => ({ atAbs: o.atAbs, value: o.value, label: `Recall check: ${o.correct}/${o.total}` }))}
              marks={f.reviews.map((r) => ({ atAbs: r.atAbs, label: `Planned review, ${r.durationMin} min` }))}
              height={340}
              endLabels={fs ? ['scenario', 'plan', 'baseline'] : ['plan', 'baseline']}
              ariaLabel={`Forecast for ${f.topic.name}: on exam day, ${pct(f.examPlan)} with planned reviews and ${pct(f.examBaseline)} with no further review${fs ? `; the What-If preview gives ${pct(fs.examPlan)}` : ''}.`}
            />
            <ChartLegend items={legend} />

            <div className="stats">
              <div>
                <p className="eyebrow">Today</p>
                <p className="stat">{pct(f.recallNow)}</p>
              </div>
              <div>
                <p className="eyebrow">Exam day · with plan</p>
                <p className="stat" style={{ color: 'var(--blue)' }}>{pct(f.examPlan)}</p>
              </div>
              <div>
                <p className="eyebrow">Exam day · no review</p>
                <p className="stat" style={{ color: 'var(--peach)' }}>{pct(f.examBaseline)}</p>
              </div>
              {fs ? (
                <div>
                  <p className="eyebrow">Exam day · What-If</p>
                  <p className="stat" style={{ color: 'var(--mint)' }}>{pct(fs.examPlan)}</p>
                </div>
              ) : null}
            </div>

            <details className="disclosure">
              <summary><ChevronRight /> View as a table</summary>
              <DataTable f={f} fs={fs} now={now} />
            </details>
          </>
        ) : null}
      </section>

      <aside className="stack">
        <section className="panel" aria-labelledby="rev-h">
          <h2 id="rev-h" className="panel__title" style={{ marginBottom: 'var(--s-3)' }}>Planned reviews</h2>
          {reviews.length > 0 && f ? (
            <>
              <ol className="reviews">
                {reviews.slice(0, 5).map((r) => {
                  const m = fromAbs(r.atAbs)
                  const after = f.plan.filter((p) => p.atAbs === r.atAbs)[1]
                  return (
                    <li key={r.atAbs}>
                      <span>
                        <strong>{formatDateWithWeekday(m.date)}</strong>
                        <span className="muted"> · {formatClock(m.minute)} · {r.durationMin} min</span>
                      </span>
                      {after ? <span className="rev__after">→ {pct(after.recall)}</span> : null}
                    </li>
                  )
                })}
              </ol>
              {reviews.length > 5 ? <p className="muted small" style={{ marginTop: 'var(--s-3)' }}>+{reviews.length - 5} more</p> : null}
            </>
          ) : (
            <p className="muted">None planned.</p>
          )}
        </section>

        <WhatIf data={data} now={now} ops={ops} setOps={setOps} baseStats={base} scenarioStats={scenario?.stats ?? null} pinned={scenario?.pinnedOnBlockedDays ?? 0} onApply={() => { store.applyWhatIf(ops); setOps([]); navigate('/') }} />
      </aside>
      </div>
    </>
  )
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function DataTable({ f, fs, now }: { f: NonNullable<ReturnType<typeof buildForecast>>; fs: ReturnType<typeof buildForecast>; now: LocalMoment }) {
  const rows: { date: string; plan: number | null; base: number | null; sc: number | null }[] = []
  const days = Math.min(40, diffDays(now.date, fromAbs(f.examAbs).date))
  for (let i = 0; i <= days; i++) {
    const date = addDays(now.date, i)
    const abs = Math.min(f.examAbs, momentToAbs({ date, minute: 12 * 60 }))
    rows.push({ date, plan: sampleAt(f.plan, abs), base: sampleAt(f.baseline, abs), sc: fs ? sampleAt(fs.plan, abs) : null })
  }
  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <table className="datatable">
        <caption className="sr-only">Estimated recall at midday on each day until the exam</caption>
        <thead>
          <tr><th scope="col">Date</th><th scope="col">With planned reviews</th><th scope="col">No further review</th>{fs ? <th scope="col">What-If</th> : null}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}><th scope="row">{formatDateWithWeekday(r.date)}</th><td>{pct(r.plan)}</td><td>{pct(r.base)}</td>{fs ? <td>{pct(r.sc)}</td> : null}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- What-If -------------------------------------------------------------------------

const EXTRA_LENGTHS = [30, 45, 60, 90, 120]

function WhatIf({ data, now, ops, setOps, baseStats, scenarioStats, pinned, onApply }: { data: AppData; now: LocalMoment; ops: WhatIfOp[]; setOps: (o: WhatIfOp[]) => void; baseStats: ReturnType<typeof runScenario>['stats']; scenarioStats: ReturnType<typeof runScenario>['stats'] | null; pinned: number; onApply: () => void }) {
  const dayOptions = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(now.date, i)), [now.date])
  const skippable = dayOptions.filter((d) => windowsOn(data.availability, d).length > 0 && !data.availability.blockedDates.includes(d) && !ops.some((o) => o.kind === 'skipDay' && o.date === d))
  const [skipDay, setSkipDay] = useState('')
  const [addDay, setAddDay] = useState(addDays(now.date, 1))
  const [addStart, setAddStart] = useState('19:00')
  const [addLen, setAddLen] = useState(60)
  const [err, setErr] = useState<string | undefined>()

  useEffect(() => {
    if (skipDay && !skippable.includes(skipDay)) setSkipDay('')
  }, [skippable, skipDay])

  const addTime = () => {
    const start = inputToMinutes(addStart)
    if (start === null) return setErr('Pick a start time.')
    if (start + addLen > MIN_PER_DAY) return setErr('That would run past midnight. Pick an earlier start or a shorter block.')
    if (diffDays(now.date, addDay) < 0 || (addDay === now.date && start < now.minute)) return setErr('That time has already passed.')
    const free = subtractIntervals([{ start, end: start + addLen }], commitmentsOn(data.availability, addDay)).reduce((s, i) => s + (i.end - i.start), 0)
    if (free < 15) return setErr('Your commitments already fill that time. Pick a gap.')
    setErr(undefined)
    setOps([...ops, { kind: 'addTime', date: addDay, startMin: start, durationMin: addLen }])
  }

  // Difference of the rounded percentages shown, so "86% → 85%" never reads "(0 pts)".
  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round(b * 100) - Math.round(a * 100))

  return (
    <section className="panel" aria-labelledby="wi-h">
      <div className="panel__head">
        <h2 id="wi-h" className="panel__title"><FlaskConical size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />What-If</h2>
        <span className="chip chip--mint">Preview only</span>
      </div>
      <div className="stack">
        <div className="wi-grid">
          <Field label="Skip a study day">
            {(p) => (
              <div className="row">
                <select {...p} className="select select--sm" style={{ flex: 1, minWidth: 0 }} value={skipDay} onChange={(e) => setSkipDay(e.target.value)}>
                  <option value="">Choose a day…</option>
                  {skippable.map((d) => <option key={d} value={d}>{formatDateWithWeekday(d)}</option>)}
                </select>
                <button type="button" className="btn btn--sm" disabled={!skipDay} onClick={() => { setOps([...ops, { kind: 'skipDay', date: skipDay }]); setSkipDay('') }}>
                  <Plus size={15} aria-hidden="true" /> Add
                </button>
              </div>
            )}
          </Field>

          <fieldset className="stack stack--sm" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="field__label" style={{ marginBottom: 6 }}>Add study time</legend>
            <div className="wi-add">
              <Field label="Day" hideLabel>{(p) => <select {...p} aria-label="Day for extra study time" className="select select--sm" value={addDay} onChange={(e) => setAddDay(e.target.value)}>{dayOptions.map((d) => <option key={d} value={d}>{formatDateWithWeekday(d)}</option>)}</select>}</Field>
              <Field label="Start" hideLabel>{(p) => <input {...p} aria-label="Start time for extra study time" type="time" step={300} className="input select--sm" value={addStart} onChange={(e) => setAddStart(e.target.value)} />}</Field>
              <Field label="Length" hideLabel>{(p) => <select {...p} aria-label="Length of extra study time" className="select select--sm" value={addLen} onChange={(e) => setAddLen(Number(e.target.value))}>{EXTRA_LENGTHS.map((l) => <option key={l} value={l}>{l} min</option>)}</select>}</Field>
              <button type="button" className="btn btn--sm" onClick={addTime}><Plus size={15} aria-hidden="true" /> Add</button>
            </div>
            {err ? <p className="field__error" role="alert">{err}</p> : null}
          </fieldset>
        </div>

        {ops.length > 0 ? (
          <ul className="row row--wrap" aria-label="Scenario changes">
            {ops.map((o, i) => (
              <li key={i} className="chip chip--mint">
                {o.kind === 'skipDay' ? `Skip ${formatDateWithWeekday(o.date)}` : `+${o.durationMin} min on ${formatDateShort(o.date)} at ${formatClock(o.startMin)}`}
                <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Remove this change" onClick={() => setOps(ops.filter((_, j) => j !== i))}><X size={14} /></button>
              </li>
            ))}
          </ul>
        ) : null}

        {scenarioStats ? (
          <div className="whatif-result" role="status">
            <dl className="compare">
              <div><dt>Study time</dt><dd>{Math.round(baseStats.futureMinutes / 60 * 10) / 10} h → <strong>{Math.round(scenarioStats.futureMinutes / 60 * 10) / 10} h</strong></dd></div>
              <div><dt>Sessions</dt><dd>{baseStats.futureSessions} → <strong>{scenarioStats.futureSessions}</strong></dd></div>
              <div>
                <dt>Exam-day recall</dt>
                <dd>{pct(baseStats.meanProjected)} → <strong>{pct(scenarioStats.meanProjected)}</strong>{delta(baseStats.meanProjected, scenarioStats.meanProjected) !== null ? <span className="muted small"> ({(delta(baseStats.meanProjected, scenarioStats.meanProjected) as number) > 0 ? '+' : ''}{delta(baseStats.meanProjected, scenarioStats.meanProjected)} pts)</span> : null}</dd>
              </div>
            </dl>
            {pinned > 0 ? <p className="field__warn">{pinned} {pinned === 1 ? 'session you placed yourself falls' : 'sessions you placed yourself fall'} on a skipped day and will stay put.</p> : null}
            <div className="row row--wrap">
              <button type="button" className="btn btn--primary" onClick={onApply}><Check size={16} aria-hidden="true" /> Apply changes</button>
              <button type="button" className="btn btn--ghost" onClick={() => setOps([])}><RotateCcw size={16} aria-hidden="true" /> Discard</button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
