// Hairline icon set, 16 × 16, 1px strokes in currentColor, square caps. Same language as the marks.
import type { CSSProperties } from 'react'

const P: Record<string, string> = {
  orbit: 'M8 2.5a5.5 5.5 0 1 1-5.2 3.7M2.5 3v3.2h3.2M8 6.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8',
  pan: 'M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2',
  zoom: 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9M10.3 10.3l4.2 4.2M5 7h4M7 5v4',
  frame: 'M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5M6 6h4v4H6z',
  pin: 'M8 1.8a3.6 3.6 0 0 1 3.6 3.6C11.6 8.4 8 14.2 8 14.2S4.4 8.4 4.4 5.4A3.6 3.6 0 0 1 8 1.8M8 4.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4',
  probe: 'M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M8 7.4v1.2',
  clear: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  layers: 'M8 2 14.5 5.5 8 9 1.5 5.5zM1.5 8.2 8 11.7l6.5-3.5M1.5 10.9 8 14.4l6.5-3.5',
  sun: 'M8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13',
  moon: 'M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5',
  auto: 'M8 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12M8 2v12',
  help: 'M8 1.8a6.2 6.2 0 1 1 0 12.4A6.2 6.2 0 0 1 8 1.8M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.2v.6M8 11.4v.4',
  key: 'M5.5 7a3 3 0 1 1 0 .1M8.4 8h6.1M12.5 8v2.5M14.5 8v2',
  terminal: 'M2 3h12v10H2zM4.5 6l2 2-2 2M8 10.5h3.5',
  atlas: 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2M2 8h12M8 2c-2.2 2.2-2.2 9.8 0 12M8 2c2.2 2.2 2.2 9.8 0 12',
  chevDown: 'M4 6.5 8 10.5l4-4',
  chevRight: 'M6.5 4l4 4-4 4',
  play: 'M5 3.5v9l7.5-4.5z',
  pause: 'M5 3.5v9M11 3.5v9',
  replay: 'M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.6h2.6',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8M8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4',
  eyeOff: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8M2.5 13.5l11-11',
  model: 'M8 1.8 13.5 5v6L8 14.2 2.5 11V5zM2.5 5 8 8.2 13.5 5M8 8.2v6',
  grid: 'M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11',
  slice: 'M2 10.5 6.5 7H14l-4.5 3.5zM8 1.5v4M8 12v2.5',
  quantum: 'M8 6.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4M8 2.5c3.5 0 6 2.5 6 5.5S11.5 13.5 8 13.5 2 11 2 8s2.5-5.5 6-5.5M3.2 4.6c2-2.9 5.3-2.7 7.6 1.6s2.1 7.5-.6 8.1',
  print: 'M3 13.5h10M4.5 13.5V9.5h7v4M6 9.5V6.5h4v3M7.2 6.5V4h1.6v2.5',
  export: 'M8 2v8.5M4.8 7.3 8 10.5l3.2-3.2M2.5 11.5v2h11v-2',
  scan: 'M2 8h12M3.5 3.5h9M3.5 12.5h9',
  upload: 'M8 13V4.5M4.8 7.7 8 4.5l3.2 3.2M2.5 2.5h11',
  cup: 'M3.5 3.5h7.5v6.5a2.5 2.5 0 0 1-2.5 2.5h-2.5A2.5 2.5 0 0 1 3.5 10zM11 5.5h1.2a1.5 1.5 0 0 1 0 3H11',
  // tools
  navigate: 'M3 2.5 12.5 7l-4 1.5L7 12.5z',
  annotate: 'M2.5 13.5h4M10.5 2.5l3 3-7.5 7.5H3v-3zM9 4l3 3',
  measure: 'M2 11.5 11.5 2l2.5 2.5L4.5 14zM5 9.5l1.2 1.2M7 7.5l1.2 1.2M9 5.5l1.2 1.2',
  sliceTool: 'M1.5 9.5 5 6.5h9.5L11 9.5zM8 1.5v3.5M6.5 3.5 8 5l1.5-1.5M8 14.5V11M6.5 12.5 8 11l1.5 1.5',
  // header popovers
  visibility: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8M8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4',
  gizmo: 'M8 8V2.5M8 8l5 3M8 8l-5 3M8 2.5 6.8 3.7M8 2.5l1.2 1.2',
  // shading
  wire: 'M2.5 5 8 2l5.5 3v6L8 14l-5.5-3zM2.5 5 8 8l5.5-3M8 8v6M2.5 11 8 8M13.5 11 8 8',
  solid: 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2M5 5.5a3.5 3.5 0 0 1 3-1.5',
  value: 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2M8 2v12M4 3.6v8.8M12 3.6v8.8',
  entangle: 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2M3.2 6.5c1.6 1.4 3.2-1.4 4.8 0s3.2 1.4 4.8 0M3.2 9.5c1.6 1.4 3.2-1.4 4.8 0s3.2 1.4 4.8 0',
  dots: 'M3.5 8h.1M8 8h.1M12.5 8h.1',
  drag: 'M6 3.5h.1M10 3.5h.1M6 8h.1M10 8h.1M6 12.5h.1M10 12.5h.1',
  reset: 'M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.6h2.6',
}

export type IconName = keyof typeof P

export function Icon({ name, size = 16, style, title }: { name: IconName | string; size?: number; style?: CSSProperties; title?: string }) {
  const filled = name === 'play'
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: 'block', flex: 'none', ...style }} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name] ?? P.help} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1" strokeLinecap="square" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Square icon button. `on` inverts it (ink fill), as the design system shows state. */
export function IconButton({ name, title, desc, hotkey, side, onClick, on, dim, size = 28, badge, disabled, onPointerDown, drag }: {
  name: IconName | string; title: string; desc?: string; hotkey?: string; side?: 'top' | 'bottom' | 'left' | 'right'
  /** Quiet off-state for toggles that are usually on (drawn ink4 instead of inverted when on). */
  dim?: boolean
  onClick?: () => void; on?: boolean; size?: number; badge?: number | string; disabled?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  /** Marks a drag control (cursor shows how it moves). */
  drag?: string
}) {
  return (
    <button className={'qs-ib' + (on ? ' qs-ib--on' : '') + (dim ? ' qs-ib--dim' : '')} style={{ width: size, height: size }} aria-label={title} aria-pressed={on}
      data-tip={title} data-tip-desc={desc} data-tip-key={hotkey} data-tip-side={side} data-drag={drag}
      onClick={onClick} disabled={disabled} onPointerDown={onPointerDown}>
      <Icon name={name} />
      {badge != null && badge !== 0 && <span className="qs-ib__badge">{badge}</span>}
    </button>
  )
}
