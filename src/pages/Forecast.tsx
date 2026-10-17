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
  const [subjectId, setSubjectId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [ops, setOps] = useState<WhatIfOp[]>([])

  const subjects = useMemo(() => data.subjects.filter((s) => live.some((t) => t.subjectId === s.id)), [data.subjects, live])
  useEffect(() => {
    const first = live.find((t) => t.id === d.next?.topicId) ?? live[0]
    if (!live.some((t) => t.id === topicId) && first) {
      setTopicId(first.id)
      setSubjectId(first.subjectId)
    }
  }, [live, topicId, d.next?.topicId])

  const topicsHere = live.filter((t) => t.subjectId === subjectId)
  const f = useMemo(() => (topicId ? buildForecast(data, topicId, now) : null), [data, now, topicId])
  const scenario = useMemo(() => (ops.length ? runScenario(data, now, ops) : null), [data, now, ops])
  const fs = useMemo(() => (scenario && topicId ? buildForecast(scenario.data, topicId, now) : null), [scenario, topicId, now])
  const base = useMemo(() => runScenario(data, now, []).stats, [data, now])

  if (live.length === 0) {
    return (
      <>
        <header className="page-head">
          <div>
            <h1>Memory forecast</h1>
            <p>See how much you are likely to remember on exam day.</p>
          </div>
        </header>
        <section className="panel empty">
          <h3>Nothing to forecast yet</h3>
          <p>Add a subject with an upcoming exam date and some topics. Zuno will chart your expected recall with and without planned reviews.</p>
          <a className="btn btn--primary" href="#/subjects">Open subjects</a>
        </section>
      </>
    )
  }

  const series: ChartSeries[] = f ? forecastSeries(f) : []
  if (fs) series.push({ id: 'scenario', label: 'What-If preview', points: fs.plan, color: '#92D6BD', dash: '2 5', width: 3 })
  const legend = forecastLegend()
  if (fs) legend.splice(1, 0, { label: 'What-If preview (not saved)', color: '#92D6BD', dash: '2 5' } as never)

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Memory forecast</h1>
          <p>Estimated recall over time, up to the exam. All forecasts are estimates, not promises.</p>
        </div>
      </header>

      <ChangeBanner />

      <div className="forecast-grid">
        <section className="panel" aria-labelledby="fc-h">
          <div className="panel__head">
            <div>
              <h2 id="fc-h" className="panel__title">{f ? f.topic.name : 'Forecast'}</h2>
              <p className="panel__sub">{f ? `${f.subject.name} exam on ${formatDateWithWeekday(f.exam.date)} at ${formatClock(f.exam.startMin)}` : ''}</p>
            </div>
            <div className="row row--wrap">
              <label className="sr-only" htmlFor="fc-subject">Subject</label>
              <select id="fc-subject" className="select select--sm" value={subjectId} onChange={(e) => { const sid = e.target.value; setSubjectId(sid); setTopicId(live.find((t) => t.subjectId === sid)?.id ?? '') }}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <label className="sr-only" htmlFor="fc-topic">Topic</label>
              <select id="fc-topic" className="select select--sm" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                {topicsHere.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {f ? (
            <div className="stack">
              <ForecastChart
                series={series}
                startAbs={f.startAbs}
                nowAbs={f.nowAbs}
                examAbs={f.examAbs}
                examLabel={`Exam ${formatDateShort(fromAbs(f.examAbs).date)}`}
                dots={f.observed.map((o) => ({ atAbs: o.atAbs, value: o.value, label: `Recall check: ${o.correct}/${o.total}` }))}
                marks={f.reviews.map((r) => ({ atAbs: r.atAbs, label: `Planned review, ${r.durationMin} min` }))}
                height={320}
                endLabels={fs ? ['scenario', 'plan', 'baseline'] : ['plan', 'baseline']}
                ariaLabel={`Forecast for ${f.topic.name}: on exam day, ${pct(f.examPlan)} with planned reviews and ${pct(f.examBaseline)} with no further review${fs ? `; the What-If preview gives ${pct(fs.examPlan)}` : ''}.`}
              />
              <ChartLegend items={legend} />

              <div className="stats">
                <div>
                  <p className="eyebrow">Recall today (estimate)</p>
                  <p className="stat">{pct(f.recallNow)}</p>
                </div>
                <div>
                  <p className="eyebrow">Exam day · planned reviews</p>
                  <p className="stat" style={{ color: 'var(--blue)' }}>{pct(f.examPlan)}</p>
                </div>
                <div>
                  <p className="eyebrow">Exam day · no more review</p>
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
            </div>
          ) : null}
        </section>

        <aside className="stack">
          <section className="panel" aria-labelledby="rev-h">
            <h2 id="rev-h" className="panel__title" style={{ marginBottom: 'var(--s-3)' }}>Planned reviews</h2>
            {f && f.reviews.length > 0 ? (
              <ol className="reviews">
                {[...f.reviews].sort((a, b) => a.atAbs - b.atAbs).map((r) => {
                  const m = fromAbs(r.atAbs)
                  const after = f.plan.filter((p) => p.atAbs === r.atAbs)[1]
                  return (
                    <li key={r.atAbs}>
                      <strong>{formatDateWithWeekday(m.date)}</strong> · {formatClock(m.minute)}
                      <span className="muted small"> · {r.durationMin} min · {pct(r.pComplete)} likely to happen{after ? ` · recall after ≈ ${pct(after.recall)}` : ''}</span>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="muted small">No further reviews are planned for this topic. {f ? `Forecast recall on exam day is ${pct(f.examBaseline)}.` : ''}</p>
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

  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round((b - a) * 100))

  return (
    <section className="panel" aria-labelledby="wi-h">
      <div className="panel__head">
        <div>
          <h2 id="wi-h" className="panel__title"><FlaskConical size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />What-If</h2>
          <p className="panel__sub">Try a change and preview the result. Nothing is saved until you choose Apply changes.</p>
        </div>
      </div>
      <div className="stack">
        <div className="stack stack--sm">
          <Field label="Skip a study day">
            {(p) => (
              <div className="row row--wrap">
                <select {...p} className="select select--sm" style={{ flex: 1, minWidth: 160 }} value={skipDay} onChange={(e) => setSkipDay(e.target.value)}>
                  <option value="">Choose a day…</option>
                  {skippable.map((d) => <option key={d} value={d}>{formatDateWithWeekday(d)}</option>)}
                </select>
                <button type="button" className="btn btn--sm" disabled={!skipDay} onClick={() => { setOps([...ops, { kind: 'skipDay', date: skipDay }]); setSkipDay('') }}>
                  <Plus size={15} aria-hidden="true" /> Add
                </button>
              </div>
            )}
          </Field>
        </div>

        <fieldset className="stack stack--sm" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="field__label">Add study time</legend>
          <Field label="Day" hideLabel>{(p) => <select {...p} aria-label="Day for extra study time" className="select select--sm" value={addDay} onChange={(e) => setAddDay(e.target.value)}>{dayOptions.map((d) => <option key={d} value={d}>{formatDateWithWeekday(d)}</option>)}</select>}</Field>
          <div className="grid-2">
            <Field label="Start" hideLabel>{(p) => <input {...p} aria-label="Start time for extra study time" type="time" step={300} className="input select--sm" value={addStart} onChange={(e) => setAddStart(e.target.value)} />}</Field>
            <Field label="Length" hideLabel>{(p) => <select {...p} aria-label="Length of extra study time" className="select select--sm" value={addLen} onChange={(e) => setAddLen(Number(e.target.value))}>{EXTRA_LENGTHS.map((l) => <option key={l} value={l}>{l} min</option>)}</select>}</Field>
          </div>
          {err ? <p className="field__error" role="alert">{err}</p> : null}
          <div><button type="button" className="btn btn--sm" onClick={addTime}><Plus size={15} aria-hidden="true" /> Add time</button></div>
        </fieldset>

        {ops.length > 0 ? (
          <ul className="row row--wrap" aria-label="Scenario changes">
            {ops.map((o, i) => (
              <li key={i} className="chip chip--mint">
                {o.kind === 'skipDay' ? `Skip ${formatDateWithWeekday(o.date)}` : `+${o.durationMin} min on ${formatDateShort(o.date)} at ${formatClock(o.startMin)}`}
                <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Remove this change" onClick={() => setOps(ops.filter((_, j) => j !== i))}><X size={14} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Add a change above to see a preview.</p>
        )}

        {scenarioStats ? (
          <div className="whatif-result" role="status">
            <p className="chip chip--mint" style={{ justifySelf: 'start' }}>Preview only · not saved</p>
            <dl className="compare">
              <div><dt>Study time ahead</dt><dd>{Math.round(baseStats.futureMinutes / 60 * 10) / 10} h → <strong>{Math.round(scenarioStats.futureMinutes / 60 * 10) / 10} h</strong></dd></div>
              <div><dt>Sessions ahead</dt><dd>{baseStats.futureSessions} → <strong>{scenarioStats.futureSessions}</strong></dd></div>
              <div>
                <dt>Exam-day recall (importance-weighted)</dt>
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

