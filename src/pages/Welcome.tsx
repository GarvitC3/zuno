import { Rocket, Sparkles } from 'lucide-react'
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
          <p className="welcome__lede">Your personal mission control for studying.</p>
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
        </div>
      </main>
    </div>
  )
}
