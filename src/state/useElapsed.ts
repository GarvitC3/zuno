import { useEffect, useState } from 'react'
import type { ActiveTimer } from '../types'

/** Milliseconds a session timer has run, re-rendering twice a second while it is running. */
export function useElapsedMs(timer: ActiveTimer | null): number {
  const [, force] = useState(0)
  const running = timer?.runningSince ?? null
  useEffect(() => {
    if (running === null) return
    const id = window.setInterval(() => force((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [running])
  if (!timer) return 0
  return timer.accumulatedMs + (timer.runningSince !== null ? Date.now() - timer.runningSince : 0)
}

export const formatElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
