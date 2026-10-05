import { useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'

/** Quicksilver colours, as literals so they work in any attribute. */
const INK = '#151618'
const INK2 = '#55575D'
const INK3 = '#8B8D93'
const INK4 = '#B3B5BB'
const BG = '#E3E4E7'
const MONO = 'var(--qs-mono)'

const fmt = (n: number) => n.toLocaleString('en-US')
const clampLevel = (v: number) => Math.max(0.05, Math.min(0.95, Math.round(v * 100) / 100))

export interface QDensityProps {
  /** Counts per bin over 0..1 (typically 48, e.g. from `histogram(grid)`). */
  bins: number[]
  /** Threshold level, 0.05–0.95. Controlled. */
  level: number
  /** Called while dragging (step 0.01). Without it the floor is read-only. */
  onLevel?: (v: number) => void
  /** Called once on release with the final level. */
  onCommit?: (v: number) => void
  w: number
  h: number
  /** Denominator of the header readout. Defaults to the sum of `bins`. */
  total?: number
  /** Unit word, default `cells`. */
  unit?: string
  /** Section label, default `DENSITY`. */
  title?: string
}

/** Cells in bins whose centre is at or above `L` (the same rule that inks the bars). */
function keptAt(bins: number[], L: number): number {
  const NB = bins.length
  let s = 0
  for (let b = 0; b < NB; b++) if ((b + 0.5) / NB >= L) s += bins[b]
  return s
}

/**
 * QDensity — the density floor. Square-root-scaled histogram, ink bars at or above the level,
 * a draggable level line with a pill flag (inverts while dragged) and a dashed hover ghost.
 */
export function QDensity({ bins, level, onLevel, onCommit, w, h, total, unit = 'cells', title = 'DENSITY' }: QDensityProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  const last = useRef(level)
  const [drag, setDrag] = useState(false)
  const [g, setG] = useState<number | null>(null)

  const NB = Math.max(1, bins.length)
  const BH = h - 38
  const hm = Math.sqrt(Math.max(0, ...bins)) || 1
  const L = level
  const sum = bins.reduce((a, b) => a + b, 0)
  const tot = total ?? sum
  const kv = keptAt(bins, L)
  const pct = tot > 0 ? Math.round((kv / tot) * 100) : 0

  const toL = (clientX: number) => {
    const el = plotRef.current
    if (!el) return L
    const rc = el.getBoundingClientRect()
    const x = ((clientX - rc.left) * w) / (rc.width || w)
    return clampLevel(x / w)
  }

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!onLevel || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const v = toL(e.clientX)
    last.current = v
    setDrag(true)
    if (v !== L) onLevel(v)
  }
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const v = toL(e.clientX)
    if (drag) {
      if (v !== last.current) {
        last.current = v
        onLevel?.(v)
      }
    } else if (v !== g) setG(v)
  }
  const end = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(false)
    setG(toL(e.clientX))
    onCommit?.(last.current)
  }
  const onPointerLeave = () => {
    if (!drag) setG(null)
  }

  const gOn = g != null && !drag && Math.abs(g - L) > 0.005
  const gb = gOn ? Math.min(NB - 1, Math.floor(g * NB)) : 0
  const flip = gOn && g > 0.8
  const cursor = drag ? 'grabbing' : onLevel ? 'ew-resize' : 'default'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: w, color: INK, fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ font: `600 10px/1 ${MONO}`, letterSpacing: '.04em' }}>{title}</span>
        <span style={{ font: `400 11px/1 ${MONO}`, color: INK2 }}>
          {`level ${L.toFixed(2)} · keeps ${fmt(kv)} of ${fmt(tot)} ${unit} · ${pct}%`}
        </span>
      </div>
      <div
        ref={plotRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={onPointerLeave}
        style={{ position: 'relative', width: w, height: h, cursor, userSelect: 'none', touchAction: 'none' }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 16, height: BH, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
          {bins.map((n, b) => (
            <span
              key={b}
              style={{
                flex: 1,
                height: n ? Math.max(1, Math.round((Math.sqrt(n) / hm) * BH)) : 0,
                background: (b + 0.5) / NB >= L ? INK : INK4,
              }}
            />
          ))}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 16, height: 1, background: INK4 }} />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span
            key={t}
            style={{
              position: 'absolute',
              left: +(t * w).toFixed(1),
              bottom: 0,
              transform: t === 0 ? 'none' : t === 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              font: `400 10px/1 ${MONO}`,
              color: INK3,
            }}
          >
            {String(t)}
          </span>
        ))}
        {gOn && (
          <>
            <div style={{ position: 'absolute', left: +(g * w).toFixed(1), top: 16, bottom: 16, borderLeft: `1px dashed ${INK3}` }} />
            <span
              style={{
                position: 'absolute',
                left: +(g * w + (flip ? -6 : 6)).toFixed(1),
                top: 30,
                transform: flip ? 'translateX(-100%)' : 'none',
                font: `400 10px/1 ${MONO}`,
                color: INK2,
                whiteSpace: 'nowrap',
              }}
            >
              {`${g.toFixed(2)} · ${fmt(bins[gb] ?? 0)} ${unit} · keeps ${fmt(keptAt(bins, g))}`}
            </span>
          </>
        )}
        <div style={{ position: 'absolute', left: +(L * w).toFixed(1), top: 12, bottom: 16, width: 1, background: INK }} />
        <span
          style={{
            position: 'absolute',
            left: +(L * w).toFixed(1),
            top: -4,
            transform: 'translateX(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            height: 20,
            padding: '0 9px',
            borderRadius: 999,
            border: `1px solid ${INK}`,
            background: drag ? INK : BG,
            color: drag ? BG : INK,
            font: `400 11px/1 ${MONO}`,
            boxSizing: 'border-box',
            whiteSpace: 'nowrap',
          }}
        >
          {L.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
