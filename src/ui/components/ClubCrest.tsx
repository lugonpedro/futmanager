import type { Club } from '../../engine/model/types.ts'

/**
 * A generic crest drawn from the club's colours and short name: a shield
 * split in the two colours with the letters across. Never a real badge.
 */
export function ClubCrest(props: { club: Club; className?: string }) {
  const { club } = props
  const { primary, secondary } = club.colors
  const id = `crest-${club.id}`
  return (
    <svg
      viewBox="0 0 40 48"
      className={props.className ?? 'size-8'}
      role="img"
      aria-label={`Escudo do ${club.name}`}
    >
      <defs>
        <clipPath id={id}>
          <path d="M20 2 L37 7 V22 C37 34 29 42 20 46 C11 42 3 34 3 22 V7 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="48" fill={primary} />
        <path d="M0 30 L40 18 V48 H0 Z" fill={secondary} />
      </g>
      <path
        d="M20 2 L37 7 V22 C37 34 29 42 20 46 C11 42 3 34 3 22 V7 Z"
        fill="none"
        stroke={secondary}
        strokeWidth="2"
      />
      <path
        d="M20 2 L37 7 V22 C37 34 29 42 20 46 C11 42 3 34 3 22 V7 Z"
        fill="none"
        stroke="#000"
        strokeOpacity="0.35"
        strokeWidth="0.75"
      />
      <text
        x="20"
        y="24"
        textAnchor="middle"
        fontSize={club.shortName.length > 3 ? 9 : 11}
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        fill={readableOn(primary, secondary)}
        stroke={primary}
        strokeWidth="0.6"
        paintOrder="stroke"
      >
        {club.shortName}
      </text>
    </svg>
  )
}

/** The second colour if it stands out against the first, otherwise black or white. */
function readableOn(background: string, preferred: string): string {
  const light = luminance(background)
  if (Math.abs(light - luminance(preferred)) > 0.35) return preferred
  return light > 0.5 ? '#111' : '#fff'
}

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
