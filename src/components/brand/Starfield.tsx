import { useMemo } from 'react'

/** Deterministic pseudo-random so stars never jump between renders. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** A few dozen faint stars, fixed behind the app. Panels are opaque, so stars only show in open gaps. */
export function Starfield() {
  const stars = useMemo(() => {
    const r = rng(20261017)
    return Array.from({ length: 46 }, (_, i) => ({
      id: i,
      x: r() * 100,
      y: r() * 100,
      size: 1 + Math.round(r() * 1.4),
      o: 0.22 + r() * 0.42,
    }))
  }, [])
  return (
    <div className="starfield" aria-hidden="true">
      {stars.map((s) => (
        <span
          key={s.id}
          className="star"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, opacity: s.o }}
        />
      ))}
    </div>
  )
}
