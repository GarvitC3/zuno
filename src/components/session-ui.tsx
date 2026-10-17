import { CheckCircle2, CircleSlash, Clock3, Hourglass, PlayCircle, SkipForward, type LucideIcon } from 'lucide-react'
import type { SessionState } from '../engine/insights'
import type { Subject } from '../types'

const STATE: Record<SessionState, { label: string; Icon: LucideIcon; tone: string }> = {
  upcoming: { label: 'Upcoming', Icon: Clock3, tone: 'blue' },
  now: { label: 'Happening now', Icon: PlayCircle, tone: 'blue' },
  completed: { label: 'Done', Icon: CheckCircle2, tone: 'mint' },
  partial: { label: 'Partly done', Icon: Hourglass, tone: 'mint' },
  skipped: { label: 'Skipped', Icon: SkipForward, tone: 'muted' },
  missed: { label: 'Not recorded', Icon: CircleSlash, tone: 'peach' },
}

export const stateLabel = (s: SessionState) => STATE[s].label

/** Icon + words for every session state, so colour is never the only signal. */
export function SessionStatusBadge({ state }: { state: SessionState }) {
  const { label, Icon, tone } = STATE[state]
  return (
    <span className={`chip chip--${tone === 'muted' ? 'plain' : tone}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  )
}

export function SubjectChip({ subject }: { subject: Pick<Subject, 'name' | 'color'> }) {
  return (
    <span className="chip chip--subj" data-color={subject.color}>
      <span className="subj-dot" aria-hidden="true" />
      {subject.name}
    </span>
  )
}

export function pct(x: number | null | undefined): string {
  return x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`
}
