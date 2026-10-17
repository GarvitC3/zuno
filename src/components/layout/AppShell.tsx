import { BookOpen, CalendarDays, Rocket, Settings, TrendingUp, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useActions, useData } from '../../state/context'
import { Wordmark } from '../brand/Logo'
import { Starfield } from '../brand/Starfield'
import { Toaster } from '../ui/Toaster'

interface NavItem {
  path: string
  label: string
  Icon: LucideIcon
}

const NAV: NavItem[] = [
  { path: '/', label: 'Mission Control', Icon: Rocket },
  { path: '/calendar', label: 'Study calendar', Icon: CalendarDays },
  { path: '/subjects', label: 'Subjects', Icon: BookOpen },
  { path: '/forecast', label: 'Memory forecast', Icon: TrendingUp },
]

const SHORT: Record<string, string> = {
  '/': 'Mission',
  '/calendar': 'Calendar',
  '/subjects': 'Subjects',
  '/forecast': 'Forecast',
  '/settings': 'Settings',
}

const isActive = (item: string, path: string) => (item === '/' ? path === '/' : path === item || path.startsWith(`${item}/`))

export function AppShell({ path, title, children }: { path: string; title: string; children: ReactNode }) {
  const data = useData()
  const store = useActions()
  const main = useRef<HTMLElement>(null)
  const first = useRef(true)

  // After navigating, move focus to the page so screen-reader and keyboard users start at the top.
  useEffect(() => {
    document.title = `${title} · Zuno`
    if (first.current) {
      first.current = false
      return
    }
    // A "what changed" note belongs to the page where it happened; clear it when you move on.
    store.dismissStaleChange()
    main.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [path, title, store])

  const initial = (data.profile.name.trim()[0] ?? 'Z').toUpperCase()

  return (
    <div className="app-root">
      <Starfield />
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>
        Skip to content
      </a>
      <div className="shell">
        <nav className="sidebar" aria-label="Main">
          <a href="#/" className="sidebar__brand" aria-label="Zuno, go to Mission Control">
            <Wordmark size={27} label={false} />
          </a>
          <ul className="sidebar__nav">
            {NAV.map(({ path: p, label, Icon }) => (
              <li key={p}>
                <a href={`#${p}`} className="navlink" aria-current={isActive(p, path) ? 'page' : undefined}>
                  <Icon size={22} aria-hidden="true" />
                  <span>{label}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="sidebar__foot">
            <a href="#/settings" className="navlink" aria-current={path === '/settings' ? 'page' : undefined}>
              <Settings size={22} aria-hidden="true" />
              <span>Settings</span>
            </a>
            <a href="#/settings" className="profile" aria-label={`Profile: ${data.profile.name || 'Student'}`}>
              <span className="profile__avatar" aria-hidden="true">{initial}</span>
              <span className="profile__name">{data.profile.name || 'You'}</span>
            </a>
          </div>
        </nav>

        <main id="main" ref={main} tabIndex={-1} className="main">
          <div className="main__inner">{children}</div>
        </main>

        <nav className="bottomnav" aria-label="Main">
          {[...NAV, { path: '/settings', label: 'Settings', Icon: Settings }].map(({ path: p, Icon }) => (
            <a key={p} href={`#${p}`} className="bottomnav__item" aria-current={isActive(p, path) ? 'page' : undefined}>
              <Icon size={22} aria-hidden="true" />
              <span>{SHORT[p]}</span>
            </a>
          ))}
        </nav>
      </div>
      <Toaster />
    </div>
  )
}
