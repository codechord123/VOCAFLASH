// 아이콘 한 벌. 이모지(🔴🔥🚶)와 기호(▦ ✎ ↗ ❡ ✦)와 글자 화살표가 한
// 화면에 섞여 있던 것을 한 가지 선 아이콘으로 모은다. 24 격자, 선 굵기
// 1.75, 끝 둥글게 — 글자 옆에 놓아도 글자보다 튀지 않게.

const PATHS = {
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  map: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9h17M9 9v11" />
    </>
  ),
  note: (
    <>
      <path d="M5 19.5h4l10-10-4-4-10 10z" />
      <path d="M13 7.5l4 4" />
    </>
  ),
  trend: (
    <>
      <path d="M4 17l5-5 4 3 7-8" />
      <path d="M15 7h5v5" />
    </>
  ),
  rotate: (
    <>
      <path d="M5 12a7 7 0 1 0 2-5" />
      <path d="M5 4v4h4" />
    </>
  ),
  diamond: <path d="M12 3.5l7.5 8.5-7.5 8.5L4.5 12z" />,
  sparkle: <path d="M12 3.5l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5-6.5-2 6.5-2z" />,
  cards: (
    <>
      <rect x="4" y="6.5" width="12" height="13" rx="2" />
      <path d="M8 4h10a2 2 0 0 1 2 2v11" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z" />
      <path d="M20 5.5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" />
    </>
  ),
  flame: <path d="M12 21c-3.5 0-6-2.4-6-5.6 0-3.3 2.6-5.1 3.6-8.4.4 1.8 1.4 2.9 2.5 3.6.2-2.6 1.4-5 3.4-7.1-.2 3.4 2.5 5.6 2.5 9.4 0 4.6-2.6 8.1-6 8.1z" />,
  walker: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="M11 21l2-6-2.5-2.5 1-5 3 3h3" />
      <path d="M10.5 7.5L7 10v3.5M13 15l3 6" />
    </>
  ),
  sunrise: (
    <>
      <path d="M6.5 16a5.5 5.5 0 0 1 11 0" />
      <path d="M3 19.5h18M12 4.5v3M4.8 9.3l2 2M19.2 9.3l-2 2" />
    </>
  ),
  back: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  star: <path d="M12 4l2.5 5.2 5.7.8-4.1 4 1 5.7L12 17l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
}

export default function Icon({ name, size = 18, filled = false, className = '', title }) {
  const body = PATHS[name]
  if (!body) return null
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {body}
    </svg>
  )
}

/** 신호등 점 — 자평의 세 단계. 이모지 대신 같은 모양의 색 점. */
export function Dot({ tone }) {
  return <span className={`dot dot--${tone}`} aria-hidden="true" />
}
