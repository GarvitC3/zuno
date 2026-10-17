import { CircleAlert, CircleCheck, CircleDot, TrendingDown } from 'lucide-react'
import { STATUS_LABEL, type RecallStatus } from '../../engine/memory'

const ICON = {
  strong: CircleCheck,
  steady: CircleDot,
  fading: TrendingDown,
  attention: CircleAlert,
} as const

/** Status in words + icon (never colour alone). */
export function StatusLabel({ status, label }: { status: RecallStatus; label?: string }) {
  const Icon = ICON[status]
  return (
    <span className={`status status--${status}`}>
      <Icon size={15} aria-hidden="true" />
      {label ?? STATUS_LABEL[status]}
    </span>
  )
}

/** Recall bar: length shows the value, the % and status words repeat it. */
export function RecallMeter({ value, status, label }: { value: number; status: RecallStatus; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      className="meter"
      data-status={status}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <div className="meter__fill" style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
    </div>
  )
}
