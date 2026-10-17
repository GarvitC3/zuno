import { Brain, CalendarRange, Rocket, Sparkles, TrendingUp } from 'lucide-react'
import { Astronaut } from '../components/brand/Astronaut'
import { Wordmark } from '../components/brand/Logo'
import { Starfield } from '../components/brand/Starfield'
import { useActions } from '../state/context'
import { navigate } from '../state/router'

export function Welcome({ notice }: { notice?: string | null }) {
  const store = useActions()
  return (
    <div className="app-root welcome">
      <Starfield />
      <main className="welcome__inner fade-in" id="main">
        <div className="welcome__hero">
          <Astronaut mood="wave" size={150} />
          <h1 className="welcome__brand">
            <Wordmark size={56} />
          </h1>
          <p className="welcome__tag">Your next move, calculated.</p>
          <p className="welcome__lede">
            Zuno is your personal mission control for studying. It plans around what you remember, how much time you really have, and how you actually study.
          </p>
          {notice ? (
            <p className="banner banner--peach" role="status" style={{ textAlign: 'left' }}>
              {notice}
            </p>
          ) : null}
          <div className="row row--wrap" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('/setup')}>
              <Rocket size={19} aria-hidden="true" /> Set up my plan
            </button>
            <button
              type="button"
              className="btn btn--lg"
              onClick={() => {
                store.loadDemo()
                navigate('/')
              }}
            >
              <Sparkles size={19} aria-hidden="true" /> Explore a demo
            </button>
          </div>
          <p className="small muted">The demo is a sample student with two weeks of history. You can clear it any time.</p>
        </div>
        <ul className="welcome__points">
          <li>
            <Brain size={22} aria-hidden="true" />
            <strong>Knows what you remember</strong>
            <span>Memory fades on a curve. Quick recall checks keep the estimate honest.</span>
          </li>
          <li>
            <CalendarRange size={22} aria-hidden="true" />
            <strong>Plans around real life</strong>
            <span>School, practice and sleep stay untouched. Sessions fit the gaps.</span>
          </li>
          <li>
            <TrendingUp size={22} aria-hidden="true" />
            <strong>Learns how you study</strong>
            <span>Finished, skipped or cut short, every session teaches the plan.</span>
          </li>
        </ul>
      </main>
    </div>
  )
}
