export type AstronautMood = 'idle' | 'wave' | 'cheer' | 'think' | 'rest'

/**
 * Zuno the astronaut: rounded cream suit, dark navy visor, small orange gear.
 * Original SVG; the silhouette (round helmet + visor + stubby body) reads at 32px.
 */
export function Astronaut({
  mood = 'idle',
  size = 96,
  title,
}: {
  mood?: AstronautMood
  size?: number
  title?: string
}) {
  const waving = mood === 'wave'
  const cheering = mood === 'cheer'
  const thinking = mood === 'think'
  const resting = mood === 'rest'
  return (
    <svg
      className="astronaut"
      width={size}
      height={(size * 140) / 120}
      viewBox="0 0 120 140"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {/* backpack + orange side tank */}
      <rect x="25" y="64" width="70" height="46" rx="15" fill="#E4DAC1" />
      <rect x="90" y="72" width="9" height="26" rx="4.5" fill="#FFB681" />
      {/* legs + boots */}
      <rect x="39" y="102" width="18" height="24" rx="9" fill="#F6EFDD" />
      <rect x="63" y="102" width="18" height="24" rx="9" fill="#F6EFDD" />
      <rect x="37" y="119" width="22" height="12" rx="6" fill="#E4DAC1" />
      <rect x="61" y="119" width="22" height="12" rx="6" fill="#E4DAC1" />
      {/* arms */}
      <g>
        {/* left arm */}
        {cheering ? (
          <g transform="rotate(32 36 78)">
            <rect x="26" y="52" width="16" height="32" rx="8" fill="#F6EFDD" />
            <circle cx="34" cy="52" r="7.5" fill="#E4DAC1" />
          </g>
        ) : (
          <g transform="rotate(14 36 80)">
            <rect x="24" y="72" width="16" height="30" rx="8" fill="#F6EFDD" />
            <circle cx="32" cy="101" r="7.5" fill="#E4DAC1" />
          </g>
        )}
        {/* right arm */}
        {waving || cheering ? (
          <g transform={`rotate(${cheering ? -32 : -20} 84 78)`}>
            <rect x="78" y={cheering ? 52 : 50} width="16" height="32" rx="8" fill="#F6EFDD" />
            <circle cx="86" cy={cheering ? 52 : 50} r="7.5" fill="#E4DAC1" />
          </g>
        ) : thinking ? (
          <g transform="rotate(-62 84 78)">
            <rect x="76" y="62" width="16" height="30" rx="8" fill="#F6EFDD" />
            <circle cx="84" cy="62" r="7.5" fill="#E4DAC1" />
          </g>
        ) : (
          <g transform="rotate(-14 84 80)">
            <rect x="80" y="72" width="16" height="30" rx="8" fill="#F6EFDD" />
            <circle cx="88" cy="101" r="7.5" fill="#E4DAC1" />
          </g>
        )}
      </g>
      {/* body */}
      <rect x="33" y="64" width="54" height="48" rx="23" fill="#F6EFDD" />
      <path d="M72 66c10 2 15 12 15 25 0 11-5 20-14 21 4-9 5-30-1-46z" fill="#E4DAC1" opacity="0.55" />
      {/* chest controls */}
      <rect x="45" y="82" width="30" height="15" rx="6" fill="#E4DAC1" />
      <circle cx="54" cy="89.5" r="3.4" fill="#FFB681" />
      <circle cx="64" cy="89.5" r="2.4" fill="#92D6BD" />
      <rect x="68.5" y="88.2" width="3.5" height="2.6" rx="1.3" fill="#B7AB8D" />
      {/* helmet */}
      <rect x="57.5" y="9" width="5" height="10" rx="2.5" fill="#E4DAC1" />
      <circle cx="60" cy="8" r="4.6" fill="#FFB681" />
      <circle cx="24" cy="47" r="6.5" fill="#E4DAC1" />
      <circle cx="96" cy="47" r="6.5" fill="#E4DAC1" />
      <circle cx="60" cy="47" r="35" fill="#F6EFDD" />
      <path d="M86 30c6 8 8 20 3 31-4 8-11 13-18 15 9-9 14-27 15-46z" fill="#E4DAC1" opacity="0.5" />
      {/* visor */}
      <rect x="33" y="31" width="54" height="34" rx="17" fill="#121A2E" stroke="#2A3548" strokeWidth="2" />
      <path d="M40 40c3-4 8-6 14-6" fill="none" stroke="#BFD4FF" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
      <circle cx="78" cy="38" r="1.8" fill="#BFD4FF" opacity="0.6" />
      {/* face: a slightly curious look to one side */}
      {resting ? (
        <>
          <path d="M47 49q4 3.5 8 0M65 49q4 3.5 8 0" fill="none" stroke="#BFE3FF" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M57 57q5 2.5 10 0" fill="none" stroke="#BFE3FF" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="53" cy="48" rx="3.6" ry="4.6" fill="#BFE3FF" />
          <ellipse cx="70" cy="48" rx="3.6" ry="4.6" fill="#BFE3FF" />
          <circle cx="54.2" cy="46.4" r="1.2" fill="#121A2E" />
          <circle cx="71.2" cy="46.4" r="1.2" fill="#121A2E" />
          <path d="M57 57q5 3.6 11 0" fill="none" stroke="#BFE3FF" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
