import { useEffect } from 'react'
import { navigate } from './state/router'
import { AppShell } from './components/layout/AppShell'
import { Toaster } from './components/ui/Toaster'
import { Calendar } from './pages/Calendar'
import { Correction } from './pages/Correction'
import { Dashboard } from './pages/Dashboard'
import { Forecast } from './pages/Forecast'
import { Onboarding } from './pages/Onboarding'
import { Session } from './pages/Session'
import { Settings } from './pages/Settings'
import { Subjects } from './pages/Subjects'
import { Welcome } from './pages/Welcome'
import { useActions, useData, useNow, useUi } from './state/context'
import { useRoute } from './state/router'

const TITLES: Record<string, string> = {
  '/': 'Mission Control',
  '/calendar': 'Study calendar',
  '/subjects': 'Subjects',
  '/forecast': 'Memory forecast',
  '/correction': 'Course Correction',
  '/settings': 'Settings',
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to), [to])
  return null
}

export default function App() {
  const data = useData()
  const ui = useUi()
  const store = useActions()
  const now = useNow()
  const { path } = useRoute()

  // A new day quietly refreshes the plan so "today" reflects today's memory.
  useEffect(() => {
    store.refreshForNewDay()
  }, [store, now.date, data.onboarded])

  if (!data.onboarded) {
    if (path === '/setup') return <><Onboarding /><Toaster /></>
    return <><Welcome notice={ui.notice} /><Toaster /></>
  }

  if (path.startsWith('/session/')) {
    return <><Session id={decodeURIComponent(path.slice('/session/'.length))} /><Toaster /></>
  }

  let page = <Dashboard />
  let key = '/'
  if (path === '/calendar') { page = <Calendar />; key = path }
  else if (path === '/subjects') { page = <Subjects />; key = path }
  else if (path === '/forecast') { page = <Forecast />; key = path }
  else if (path === '/correction') { page = <Correction />; key = path }
  else if (path === '/settings') { page = <Settings />; key = path }
  else if (path === '/setup') {
    // Setup would replace existing data; people with a plan are sent home instead.
    return <Redirect to="/" />
  }

  return (
    <AppShell path={path} title={TITLES[key] ?? 'Mission Control'}>
      {page}
    </AppShell>
  )
}
