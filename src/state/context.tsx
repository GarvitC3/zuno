import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { allInsights, attentionOrder, behindStatus, todaySummary, upNext, type BehindStatus, type TodaySummary, type TopicInsight } from '../engine/insights'
import { nowMoment, type LocalMoment } from '../engine/time'
import type { AppData, Session } from '../types'
import { browserStorage } from './persistence'
import { createStore, type StoreState, type ZunoStore } from './store'

const StoreContext = createContext<ZunoStore | null>(null)

export function StoreProvider({ children, store }: { children: ReactNode; store?: ZunoStore }) {
  const ref = useRef<ZunoStore | null>(store ?? null)
  if (!ref.current) ref.current = createStore({ storage: browserStorage(), clock: nowMoment })
  return <StoreContext.Provider value={ref.current}>{children}</StoreContext.Provider>
}

/** The store itself, for calling actions. */
export function useActions(): ZunoStore {
  const s = useContext(StoreContext)
  if (!s) throw new Error('StoreProvider is missing')
  return s
}

function useSnapshot(): StoreState {
  const s = useActions()
  return useSyncExternalStore(s.subscribe, s.getState, s.getState)
}

export function useData(): AppData {
  return useSnapshot().data
}
export function useUi() {
  return useSnapshot().ui
}
export function useStorageOk(): boolean {
  return useSnapshot().storageOk
}

/** Current local date/minute; refreshes every 30s and when the tab regains focus. */
export function useNow(): LocalMoment {
  const store = useActions()
  const [now, setNow] = useState<LocalMoment>(() => store.now())
  useEffect(() => {
    const tick = () =>
      setNow((prev) => {
        const n = store.now()
        return prev.date === n.date && prev.minute === n.minute ? prev : n
      })
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [store])
  return now
}

export interface Derived {
  insights: TopicInsight[]
  attention: TopicInsight[]
  next: Session | null
  today: TodaySummary
  behind: BehindStatus
}

export function useDerived(data: AppData, now: LocalMoment): Derived {
  return useMemo(() => {
    const insights = allInsights(data, now)
    return {
      insights,
      attention: attentionOrder(insights),
      next: upNext(data, now),
      today: todaySummary(data, now),
      behind: behindStatus(data, now),
    }
    // `now` is a new object only when the minute changes.
  }, [data, now])
}
