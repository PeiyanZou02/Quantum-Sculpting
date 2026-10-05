import type { CSSProperties } from 'react'

const INK = '#151618'
const INK3 = '#8B8D93'
const MONO = 'var(--qs-mono)'

const abs = (x: number, y: number, w: number, h: number): CSSProperties => ({
  position: 'absolute',
  left: x,
  top: y,
  width: w,
  height: h,
  overflow: 'visible',
  pointerEvents: 'none',
})

export interface CornersProps {
  x: number
  y: number
  w: number
  h: number
  /** Arm length. 18 for view corners, 10 for hover corners, 16 for the frame. */
  len?: number
  color?: string
  /** Positive moves the corners in; negative pushes them out (hover corners: inset −10, len 10). */
  inset?: number
  /** Optional dash, e.g. '2 3' for the drop zone. */
  dash?: string
}

/** Four L-shaped corner marks of a box, 1px, square ends, drawn inside the box edge like a CSS border. */
export function Corners({ x, y, w, h, len = 18, color = 'var(--qs-ink)', inset = 0, dash }: CornersProps) {
  const l = inset + 0.5, t = inset + 0.5, r = w - inset - 0.5, b = h - inset - 0.5
  const L = len - 0.5
  const d =
    `M${l} ${t + L}V${t}H${l + L}` +
    `M${r - L} ${t}H${r}V${t + L}` +
    `M${l} ${b - L}V${b}H${l + L}` +
    `M${r - L} ${b}H${r}V${b - L}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={abs(x, y, w, h)}>
      <path d={d} fill="none" style={{ stroke: color }} strokeWidth={1} strokeDasharray={dash} />
    </svg>
  )
}

export interface CrosshairProps {
  /** Centre. */
  x: number
  y: number
  size?: number
  color?: string
}

/** Centre crosshair of the view: 22px, 1px, ink3. */
export function Crosshair({ x, y, size = 22, color = INK3 }: CrosshairProps) {
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={abs(x - c, y - c, size, size)}>
      <path d={`M${c} 0V${size}M0 ${c}H${size}`} fill="none" style={{ stroke: color }} strokeWidth={1} />
    </svg>
  )
}

export interface CalloutProps {
  /** Anchor point (the dot). */
  x: number
  y: number
  /** Leader vector from the dot to the elbow (elbow) or to the label (dot). Default (50, −56). */
  dx?: number
  dy?: number
  /** `elbow`: diagonal then a shelf with two lines above/below it. `dot`: dotted (1 3) leader, one line. */
  kind?: 'elbow' | 'dot'
  /** Shelf length for `elbow`. Default 180. */
  shelf?: number
  /** First line ink 11px; second line ink3 10px (elbow only). */
  lines: [string] | [string, string]
  /** Dot radius. Default 3 (on the model); the library uses 2.5. */
  r?: number
}

/**
 * Callout — data attached to a point on the model (04a threshold screen, library family “Callouts”).
 * The shelf and label run in the direction of `dx`.
 */
export function Callout({ x, y, dx = 50, dy = -56, kind = 'elbow', shelf = 180, lines, r = 3 }: CalloutProps) {
  const sg = dx < 0 ? -1 : 1
  const anchor = sg < 0 ? 'end' : 'start'
  const ex = dx, ey = dy
  const txt = (tx: number, ty: number, s: string, small: boolean, base?: 'central') => (
    <text
      x={tx}
      y={ty}
      textAnchor={anchor}
      dominantBaseline={base}
      style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}
      fontSize={small ? 10 : 11}
      fill={small ? INK3 : INK}
    >
      {s}
    </text>
  )
  return (
    <svg width={1} height={1} style={abs(x, y, 1, 1)}>
      {kind === 'elbow' ? (
        <>
          <polyline points={`0,0 ${ex},${ey} ${ex + sg * shelf},${ey}`} fill="none" stroke={INK} strokeWidth={1} />
          {txt(ex + sg * 8, ey - 8, lines[0], false)}
          {lines[1] != null && txt(ex + sg * 8, ey + 16, lines[1], true)}
        </>
      ) : (
        <>
          <line x1={0} y1={0} x2={ex} y2={ey} stroke={INK} strokeWidth={1} strokeDasharray="1 3" />
          {txt(ex + sg * 4, ey, lines[0], false, 'central')}
        </>
      )}
      <circle cx={0} cy={0} r={r} fill={INK} />
    </svg>
  )
}
