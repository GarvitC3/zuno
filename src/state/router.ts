import { useCallback, useSyncExternalStore } from 'react'

function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/'
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn)
  return () => window.removeEventListener('hashchange', fn)
}

export function navigate(path: string) {
  if (currentPath() === path) return
  window.location.hash = path
}

/** Tiny hash router: "#/calendar", "#/session/abc". Deep links and Back both work. */
export function useRoute() {
  const path = useSyncExternalStore(subscribe, currentPath, () => '/')
  const go = useCallback((p: string) => navigate(p), [])
  return { path, navigate: go }
}
