import type { SubjectColor } from '../../types'

/** A small planet that stands in for a subject. Colour comes from the subject. */
export function Planet({ color, size = 36, ring = false, label }: { color: SubjectColor; size?: number; ring?: boolean; label?: string }) {
  return (
    <svg
      data-color={color}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ flex: 'none' }}
    >
      {ring ? <path d="M3 24c0-6 8-11 18-12" fill="none" stroke="var(--subj)" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" transform="rotate(-18 20 20)" /> : null}
      <circle cx="20" cy="20" r="12.5" fill="var(--subj)" />
      <path d="M8.6 22c5 2.4 12 2.6 22.8-1.2" fill="none" stroke="#0C1220" strokeOpacity="0.16" strokeWidth="3" strokeLinecap="round" />
      <path d="M10.4 14.8c4-2 10-2.2 19.2 0" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="14.5" cy="14" r="2.6" fill="#fff" fillOpacity="0.22" />
      {ring ? <path d="M37 17c0 6-8 11-18 12" fill="none" stroke="var(--subj)" strokeWidth="2.2" strokeLinecap="round" transform="rotate(-18 20 20)" /> : null}
    </svg>
  )
}
