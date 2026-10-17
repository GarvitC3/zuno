/** The lowercase "zuno" wordmark: the last "o" carries a small orbit. */
export function OrbitMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <ellipse cx="16" cy="16" rx="13" ry="5.2" fill="none" stroke="#89AFFF" strokeWidth="1.8" transform="rotate(-24 16 16)" opacity="0.9" />
      <circle cx="16" cy="16" r="6.4" fill="#F6EFDD" />
      <path d="M11.2 17.6a6.4 6.4 0 0 0 9.6 0" fill="none" stroke="#E4DAC1" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="27.4" cy="10.4" r="2.6" fill="#FFB681" />
    </svg>
  )
}

export function Wordmark({ size = 26, label = true }: { size?: number; label?: boolean }) {
  return (
    <span
      className="wordmark"
      style={{ fontSize: size }}
      role={label ? 'img' : undefined}
      aria-label={label ? 'Zuno' : undefined}
      aria-hidden={label ? undefined : true}
    >
      <span aria-hidden="true">zun</span>
      <svg className="wordmark__o" viewBox="0 0 34 30" aria-hidden="true" focusable="false">
        <ellipse cx="17" cy="16" rx="15.5" ry="5.4" fill="none" stroke="#89AFFF" strokeWidth="1.7" transform="rotate(-22 17 16)" opacity="0.95" />
        <circle cx="17" cy="17" r="7.2" fill="none" stroke="currentColor" strokeWidth="3.6" />
        <circle cx="30.4" cy="9.2" r="2.7" fill="#FFB681" />
      </svg>
    </span>
  )
}
