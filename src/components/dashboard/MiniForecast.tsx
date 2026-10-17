import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { buildForecast } from '../../engine/forecast'
import { formatClock, formatDateShort, fromAbs, type LocalMoment } from '../../engine/time'
import type { AppData } from '../../types'
import { ChartLegend, ForecastChart, type ChartSeries } from '../charts/ForecastChart'
import { pct } from '../session-ui'

export function forecastSeries(f: NonNullable<ReturnType<typeof buildForecast>>): ChartSeries[] {
  return [
    { id: 'history', label: 'Model estimate so far', points: f.history, color: '#7C89A0', width: 2, opacity: 0.9 },
    { id: 'baseline', label: 'No further review', points: f.baseline, color: '#FFB681', dash: '7 6' },
    { id: 'plan', label: 'With planned reviews', points: f.plan, color: '#89AFFF' },
  ]
}

export function forecastLegend() {
  return [
    { label: 'With planned reviews', color: '#89AFFF' },
    { label: 'No further review', color: '#FFB681', dash: '7 6' },
    { label: 'Recall check', color: '#92D6BD', kind: 'ring' as const },
  ]
}

export function MiniForecast({ data, now, defaultTopicId }: { data: AppData; now: LocalMoment; defaultTopicId?: string }) {
  const candidates = useMemo(
    () => data.topics.filter((t) => buildForecast(data, t.id, now) !== null),
    [data, now],
  )
  const [topicId, setTopicId] = useState<string>('')
  useEffect(() => {
    if (!candidates.some((t) => t.id === topicId)) {
      setTopicId(candidates.find((t) => t.id === defaultTopicId)?.id ?? candidates[0]?.id ?? '')
    }
  }, [candidates, topicId, defaultTopicId])

  const f = useMemo(() => (topicId ? buildForecast(data, topicId, now) : null), [data, now, topicId])

  return (
    <section className="panel" aria-labelledby="mini-fc-h">
      <div className="panel__head">
        <div>
          <h2 id="mini-fc-h" className="panel__title">Memory forecast</h2>
        </div>
        <a className="btn btn--sm btn--ghost" href="#/forecast">
          Full forecast <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>
      {!f ? (
        <div className="empty empty--compact">
          <h3>No forecast yet</h3>
          <p>Add a subject with an upcoming exam date and Zuno will chart how much you are likely to remember.</p>
        </div>
      ) : (
        <div className="stack">
          <div className="row row--wrap">
            <label className="sr-only" htmlFor="mini-fc-topic">Topic for forecast</label>
            <select id="mini-fc-topic" className="select select--sm" style={{ maxWidth: 260 }} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {candidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="chip chip--peach">
              {f.subject.name} exam · {formatDateShort(f.exam.date)}, {formatClock(f.exam.startMin)}
            </span>
            <span className="chip">Estimate</span>
          </div>
          <ForecastChart
            series={forecastSeries(f)}
            startAbs={f.startAbs}
            nowAbs={f.nowAbs}
            examAbs={f.examAbs}
            examLabel={`Exam ${formatDateShort(fromAbs(f.examAbs).date)}`}
            dots={f.observed.map((o) => ({ atAbs: o.atAbs, value: o.value, label: `Recall check: ${o.correct}/${o.total}` }))}
            marks={f.reviews.map((r) => ({ atAbs: r.atAbs, label: `Planned review, ${r.durationMin} min` }))}
            height={250}
            endLabels={['plan', 'baseline']}
            ariaLabel={`Forecast for ${f.topic.name}: expected recall on exam day is ${pct(f.examPlan)} with planned reviews and ${pct(f.examBaseline)} with no further review.`}
          />
          <ChartLegend items={forecastLegend()} />
        </div>
      )}
    </section>
  )
}
