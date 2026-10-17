import { useEffect, useMemo, useRef, useState } from 'react'
import type { CurvePoint } from '../../engine/memory'
import { fromAbs, MIN_PER_DAY, formatClock, formatDateShort, formatDateWithWeekday } from '../../engine/time'

export interface ChartSeries {
  id: string
  label: string
  points: CurvePoint[]
  color: string
  dash?: string
  width?: number
  opacity?: number
}

export interface ChartDot {
  atAbs: number
  value: number
  label: string
}

export interface ChartMark {
  atAbs: number
  label: string
}

interface Props {
  series: ChartSeries[]
  startAbs: number
  nowAbs: number
  examAbs: number
  examLabel: string
  dots?: ChartDot[]
  marks?: ChartMark[]
  height?: number
  ariaLabel: string
  /** Series ids that get a value label at the exam end. */
  endLabels?: string[]
}

function useWidth(ref: React.RefObject<HTMLElement | null>, fallback = 640) {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setW(Math.max(280, Math.floor(el.clientWidth)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

const FONT = 12.5

/**
 * Hand-built SVG line chart. Labelled axes, readable units, direct value labels,
 * line style (solid / dashed / dotted) as well as colour, and a hover read-out.
 * A data table alternative is provided by the parent.
 */
export function ForecastChart({ series, startAbs, nowAbs, examAbs, examLabel, dots = [], marks = [], height = 280, ariaLabel, endLabels = [] }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const width = useWidth(wrap)
  const [hover, setHover] = useState<number | null>(null)

  const m = { top: 30, right: 54, bottom: 56, left: 52 }
  const compact = width < 460
  const h = compact ? Math.min(height, 250) : height
  const iw = width - m.left - m.right
  const ih = h - m.top - m.bottom
  const span = Math.max(1, examAbs - startAbs)
  const x = (abs: number) => m.left + ((abs - startAbs) / span) * iw
  const y = (v: number) => m.top + (1 - Math.max(0, Math.min(1, v))) * ih

  const xTicks = useMemo(() => {
    const days = span / MIN_PER_DAY
    const out: { abs: number; label: string }[] = []
    if (days <= 2.2) {
      const first = Math.ceil(startAbs / 360) * 360
      for (let t = first; t <= examAbs; t += 360) {
        const mm = fromAbs(t)
        out.push({ abs: t, label: mm.minute === 0 ? formatDateShort(mm.date) : formatClock(mm.minute).replace(':00', '') })
      }
      return out.length > 7 ? out.filter((_, i) => i % 2 === 0) : out
    }
    const step = Math.max(1, Math.ceil(days / (compact ? 4 : 7)))
    const firstDay = Math.ceil(startAbs / MIN_PER_DAY)
    for (let d = firstDay; d * MIN_PER_DAY <= examAbs; d += step) out.push({ abs: d * MIN_PER_DAY, label: formatDateShort(fromAbs(d * MIN_PER_DAY).date) })
    return out
  }, [startAbs, examAbs, span, compact])

  const path = (pts: CurvePoint[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.atAbs).toFixed(1)} ${y(p.recall).toFixed(1)}`).join(' ')

  const valueAt = (s: ChartSeries, abs: number): number | null => {
    let v: number | null = null
    for (const p of s.points) {
      if (p.atAbs <= abs) v = p.recall
      else break
    }
    return v
  }

  const endVals = endLabels
    .map((id) => series.find((s) => s.id === id))
    .filter((s): s is ChartSeries => !!s && s.points.length > 0)
    .map((s) => ({ s, v: s.points[s.points.length - 1].recall }))
    .sort((a, b) => b.v - a.v)
  const labelY: number[] = []
  endVals.forEach((e, i) => {
    let ly = y(e.v)
    if (i > 0 && ly - labelY[i - 1] < 16) ly = labelY[i - 1] + 16
    labelY.push(ly)
  })

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * iw
    setHover(startAbs + (px / iw) * span)
  }

  const nowX = x(nowAbs)
  const showNow = nowAbs > startAbs + 60

  return (
    <div ref={wrap} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={h} role="img" aria-label={ariaLabel} style={{ display: 'block', overflow: 'visible' }}>
        {/* grid + y axis */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={m.left} x2={m.left + iw} y1={y(v)} y2={y(v)} stroke="#2A3548" strokeOpacity={v === 0 ? 1 : 0.6} strokeDasharray={v === 0 ? undefined : '2 5'} />
            <text x={m.left - 8} y={y(v) + 4} textAnchor="end" fontSize={FONT} fill="#A4B0C5">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        <text transform={`translate(13 ${m.top + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={FONT} fill="#A4B0C5">
          Estimated recall
        </text>

        {/* x axis */}
        {xTicks.map((t) => (
          <g key={t.abs}>
            <line x1={x(t.abs)} x2={x(t.abs)} y1={m.top + ih} y2={m.top + ih + 5} stroke="#2A3548" />
            <text x={x(t.abs)} y={m.top + ih + 20} textAnchor="middle" fontSize={FONT} fill="#A4B0C5">
              {t.label}
            </text>
          </g>
        ))}
        <text x={m.left + iw / 2} y={h - 8} textAnchor="middle" fontSize={FONT} fill="#A4B0C5">
          Date
        </text>

        {/* now + exam markers */}
        {showNow ? (
          <g>
            <line x1={nowX} x2={nowX} y1={m.top} y2={m.top + ih} stroke="#A4B0C5" strokeOpacity={0.5} strokeDasharray="1 4" />
            <text x={nowX + 5} y={m.top + 12} fontSize={FONT} fill="#A4B0C5">
              Today
            </text>
          </g>
        ) : null}
        <g>
          <line x1={x(examAbs)} x2={x(examAbs)} y1={m.top - 6} y2={m.top + ih} stroke="#FFB681" strokeWidth={1.6} />
          <text x={x(examAbs) - 6} y={m.top - 12} textAnchor="end" fontSize={FONT} fill="#FFB681" fontWeight={600}>
            {examLabel}
          </text>
        </g>

        {/* series */}
        {series.map((s) => (
          <path
            key={s.id}
            d={path(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width ?? 2.6}
            strokeDasharray={s.dash}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={s.opacity ?? 1}
          />
        ))}

        {/* planned review markers on the axis */}
        {marks.map((mk, i) => (
          <g key={`${mk.atAbs}-${i}`}>
            <path d={`M${x(mk.atAbs)} ${m.top + ih - 2} l-5 -9 h10 z`} fill="#89AFFF" stroke="#0C1220" strokeWidth={1}>
              <title>{mk.label}</title>
            </path>
          </g>
        ))}

        {/* observed recall checks: hollow rings, distinct from the modelled line */}
        {dots.map((d, i) => (
          <g key={`${d.atAbs}-${i}`}>
            <circle cx={x(d.atAbs)} cy={y(d.value)} r={6} fill="#0C1220" stroke="#92D6BD" strokeWidth={2.4}>
              <title>{d.label}</title>
            </circle>
            <circle cx={x(d.atAbs)} cy={y(d.value)} r={1.8} fill="#92D6BD" />
          </g>
        ))}

        {/* direct value labels at the exam */}
        {endVals.map((e, i) => (
          <g key={e.s.id}>
            <circle cx={x(examAbs)} cy={y(e.v)} r={4} fill={e.s.color} stroke="#0C1220" strokeWidth={1.5} />
            <text x={x(examAbs) + 9} y={labelY[i] + 4} fontSize={FONT + 0.5} fontWeight={700} fill={e.s.color}>
              {Math.round(e.v * 100)}%
            </text>
          </g>
        ))}

        {/* hover read-out */}
        {hover !== null ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} stroke="#F2F4F8" strokeOpacity={0.5} />
          </g>
        ) : null}
        <rect
          x={m.left}
          y={m.top}
          width={iw}
          height={ih}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={onMove}
        />
      </svg>
      {hover !== null ? (
        <div
          className="chart__tip"
          style={{ left: Math.min(Math.max(x(hover) + 12, 8), width - 190), top: m.top + 4 }}
          aria-hidden="true"
        >
          <strong>{formatDateWithWeekday(fromAbs(hover).date)}</strong>
          {series
            .filter((s) => s.id !== 'history')
            .map((s) => {
              const v = valueAt(s, hover)
              return v === null ? null : (
                <span key={s.id}>
                  <i style={{ background: s.color }} /> {s.label}: {Math.round(v * 100)}%
                </span>
              )
            })}
        </div>
      ) : null}
    </div>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string; dash?: string; kind?: 'line' | 'ring' | 'tri' | 'exam' }[] }) {
  return (
    <ul className="legend" aria-label="Chart legend">
      {items.map((it) => (
        <li key={it.label}>
          <svg width="30" height="12" aria-hidden="true">
            {it.kind === 'ring' ? (
              <>
                <circle cx="15" cy="6" r="5" fill="#0C1220" stroke={it.color} strokeWidth="2.2" />
                <circle cx="15" cy="6" r="1.6" fill={it.color} />
              </>
            ) : it.kind === 'tri' ? (
              <path d="M15 1 l5 9 h-10 z" fill={it.color} />
            ) : it.kind === 'exam' ? (
              <line x1="15" x2="15" y1="0" y2="12" stroke={it.color} strokeWidth="2" />
            ) : (
              <line x1="1" x2="29" y1="6" y2="6" stroke={it.color} strokeWidth="2.6" strokeDasharray={it.dash} strokeLinecap="round" />
            )}
          </svg>
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  )
}
