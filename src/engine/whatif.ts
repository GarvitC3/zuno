/**
 * What-If scenarios.
 *
 * A scenario is a list of availability tweaks applied to a COPY of the saved
 * data and re-planned with the same scheduler. The saved plan is never touched
 * until the student chooses "Apply changes".
 */
import type { AppData, Availability, DateKey } from '../types'
import { replan } from './plan'
import { uid } from './ids'
import type { LocalMoment } from './time'
import { allInsights } from './insights'

export type WhatIfOp =
  | { kind: 'skipDay'; date: DateKey }
  | { kind: 'addTime'; date: DateKey; startMin: number; durationMin: number }

export function applyOps(av: Availability, ops: readonly WhatIfOp[]): Availability {
  let next: Availability = {
    ...av,
    blockedDates: [...av.blockedDates],
    extraWindows: [...av.extraWindows],
  }
  for (const op of ops) {
    if (op.kind === 'skipDay') {
      if (!next.blockedDates.includes(op.date)) next = { ...next, blockedDates: [...next.blockedDates, op.date] }
    } else {
      next = {
        ...next,
        extraWindows: [
          ...next.extraWindows,
          { id: uid('extra'), date: op.date, startMin: op.startMin, endMin: op.startMin + op.durationMin },
        ],
      }
    }
  }
  return next
}

export interface PlanStats {
  futureMinutes: number
  futureSessions: number
  /** Importance-weighted mean forecast exam-day recall across topics with a live exam. */
  meanProjected: number | null
  meanWithout: number | null
}

export function planStats(data: AppData, now: LocalMoment): PlanStats {
  const insights = allInsights(data, now).filter((i) => i.projectedWith !== null)
  const w = (i: (typeof insights)[number]) => i.topic.importance
  const totalW = insights.reduce((s, i) => s + w(i), 0)
  const nowAbsDate = now.date
  const future = data.sessions.filter((s) => s.status === 'planned' && (s.date > nowAbsDate || (s.date === nowAbsDate && s.startMin + s.durationMin > now.minute)))
  return {
    futureMinutes: future.reduce((s, x) => s + x.durationMin, 0),
    futureSessions: future.length,
    meanProjected: totalW ? insights.reduce((s, i) => s + w(i) * (i.projectedWith as number), 0) / totalW : null,
    meanWithout: totalW ? insights.reduce((s, i) => s + w(i) * (i.projectedWithout as number), 0) / totalW : null,
  }
}

export interface Scenario {
  data: AppData
  stats: PlanStats
  /** Locked sessions that fall on a day the scenario blocks. */
  pinnedOnBlockedDays: number
}

/** Pure: returns a new AppData; `data` is not mutated. */
export function runScenario(data: AppData, now: LocalMoment, ops: readonly WhatIfOp[]): Scenario {
  const av = applyOps(data.availability, ops)
  const scenarioData: AppData = { ...data, availability: av }
  const { data: replanned } = replan(scenarioData, now)
  const blocked = new Set(av.blockedDates)
  return {
    data: replanned,
    stats: planStats(replanned, now),
    pinnedOnBlockedDays: replanned.sessions.filter((s) => s.locked && s.status === 'planned' && blocked.has(s.date)).length,
  }
}
