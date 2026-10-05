import { useEffect, useMemo, useRef, useState } from 'react'
import { useProbe, type ProbeController, type ProbeHit } from './useProbe'

/*
 * QProbe — the live layer over the 3D view.
 *
 * Event model (why it never blocks orbiting):
 *   The overlay itself is `pointer-events: none` (only the `Clear N pins` pill takes clicks).
 *   Pointer events land on the three.js canvas underneath and bubble to the view container,
 *   where the probe listens. A pointerdown → pointerup with < 4px of travel counts as a click
 *   (pin / unpin); anything longer is an orbit drag, during which the reticle hides.
 *
 * Two ways to wire it:
 *   A. Auto (simplest): put <QProbe … pick={pick}/> as a child of the view container (the
 *      element that also contains the canvas). It attaches native listeners to its parentElement.
 *
 *   B. Explicit handlers:
 *        const probe = useProbe({ pick, enabled, maxPins })
 *        <div style={{ position: 'relative' }} {...probe.handlers}>
 *          <canvas …/>
 *          <QProbe probe={probe} w={w} h={h} n={n} />
 *        </div>
 *      `pick` / `enabled` / `maxPins` on <QProbe> are then ignored (they live in the hook).
 *
 * In both, `pick(px, py)` receives coordinates in overlay pixels (0..w, 0..h, top-left origin),
 * which equal canvas CSS pixels when the overlay covers the canvas exactly.
 * While a hit is shown the probe sets `cursor: none` on the overlay's parent element (and restores
 * it after); the canvas must not set its own cursor for this to show (OrbitControls does not).
 */

// theme tokens, so pins read in light and dark
const INK = 'var(--qs-ink)'
const INK2 = 'var(--qs-ink2)'
const INK3 = 'var(--qs-ink3)'
const BG = 'var(--qs-bg)'
const CTL = 'var(--qs-ctl)'
const MONO = 'var(--qs-mono)'
const HALO = `0 0 2px ${BG},0 0 6px ${BG}`

export interface QProbeProps {
  w: number
  h: number
  /** Grid size, for the rulers. */
  n: number
  /** Picking against the voxel grid, in overlay pixels. Required unless `probe` is given. */
  pick?: (px: number, py: number) => ProbeHit | null
  enabled?: boolean
  maxPins?: number
  /** Millimetres per cell for the measure chip. Default 3.2. */
  mmPerCell?: number
  /** Forwarded native pointer events from the container (auto mode only). */
  onPointer?: (e: PointerEvent) => void
  /** Use an external controller from `useProbe` (explicit-handler mode). */
  probe?: ProbeController
  /**
   * Optional: project a pinned cell back to overlay pixels so pins follow the model when the
   * camera orbits. Re-render QProbe on camera change for this to update. Return null to hide.
   */
  project?: (hit: ProbeHit) => { x: number; y: number } | null
  /** Hide the built-in `Clear N pins` pill (the host draws its own control). */
  hideClear?: boolean
  /** Join consecutive pins with a dashed line and a Δ distance chip (default true). */
  measure?: boolean
  /** The composer draws the hover mark / the pins itself (HUD selection / callout families). */
  hideHover?: boolean
  hidePins?: boolean
  /** Draw the pins even while the probe is off (Present keeps its annotations on screen). */
  showPins?: boolean
}

const noPick = () => null
const n1 = (v: number) => +v.toFixed(1)

export function QProbe({ w, h, n, pick, enabled, maxPins, mmPerCell = 3.2, onPointer, probe, project, hideClear, measure = true, hideHover = false, hidePins = false, showPins = false }: QProbeProps) {
  const own = useProbe({ pick: pick ?? noPick, enabled, maxPins })
  const p = probe ?? own
  const { rootRef } = p
  const auto = !probe

  // Auto mode: listen on the parent (the view container); events from the canvas bubble there.
  const fwd = useRef(onPointer)
  useEffect(() => {
    fwd.current = onPointer
  }, [onPointer])
  useEffect(() => {
    if (!auto) return
    const parent = own.rootRef.current?.parentElement
    if (!parent) return
    const nat = own.native
    const on = (f: (e: PointerEvent) => void) => (e: PointerEvent) => {
      f(e)
      fwd.current?.(e)
    }
    const dn = on(nat.down), mv = on(nat.move), up = on(nat.up), cc = on(nat.cancel), lv = on(nat.leave)
    parent.addEventListener('pointerdown', dn)
    parent.addEventListener('pointermove', mv)
    parent.addEventListener('pointerup', up)
    parent.addEventListener('pointercancel', cc)
    parent.addEventListener('pointerleave', lv)
    return () => {
      parent.removeEventListener('pointerdown', dn)
      parent.removeEventListener('pointermove', mv)
      parent.removeEventListener('pointerup', up)
      parent.removeEventListener('pointercancel', cc)
      parent.removeEventListener('pointerleave', lv)
    }
  }, [auto, own.native, own.rootRef])

  const on = p.enabled
  const hv = on && !p.dragging ? p.hover : null

  // Hide the system cursor while the reticle stands in for it.
  useEffect(() => {
    const parent = rootRef.current?.parentElement
    if (!parent || !hv) return
    const prev = parent.style.cursor
    parent.style.setProperty('cursor', 'none')
    return () => {
      parent.style.cursor = prev
    }
  }, [hv, rootRef])

  // Rulers: cell index mapped linearly across the view, 48px in from each end.
  const ruler = useMemo(() => {
    const M = 48
    const x0 = M, x1 = w - M, yT = M, yB = h - M
    const X = (t: number) => x0 + ((x1 - x0) * t) / n
    const Y = (t: number) => yB - ((yB - yT) * t) / n
    const minor = Math.max(2, 2 ** Math.round(Math.log2(Math.max(1, n) / 16)))
    const major = minor * 4
    let b = `M${n1(x0)} ${h - 0.5}H${n1(x1)}`
    let r = `M${w - 0.5} ${n1(yT)}V${n1(yB)}`
    const lab: { x: number; y: number; t: string; tr: string }[] = []
    for (let t = 0; t <= n; t += minor) {
      const L = t % major ? 4 : 8
      b += `M${n1(X(t))} ${h}v-${L}`
      r += `M${w} ${n1(Y(t))}h-${L}`
      if (t % major === 0) {
        lab.push({ x: n1(X(t)), y: n1(h - 11), t: String(t), tr: 'translate(-50%,-100%)' })
        lab.push({ x: n1(w - 12), y: n1(Y(t)), t: String(t), tr: 'translate(-100%,-50%)' })
      }
    }
    return { b, r, lab }
  }, [w, h, n])

  const ro = hv ? 1 : 0

  const pins = on || showPins
    ? p.pins.flatMap((q, i) => {
        const pos = project ? project(q.hit) : { x: q.px, y: q.py }
        if (!pos) return []
        const { x, y } = pos
        const flip = x > w - 340
        const sg = flip ? -1 : 1
        return [
          {
            key: i,
            x,
            y,
            hit: q.hit,
            n: String(i + 1),
            ld: `M${n1(x + sg * 5.7)} ${n1(y - 5.7)}L${n1(x + sg * 18)} ${n1(y - 18)}H${n1(x + sg * 52)}`,
            tx: n1(x + sg * 56),
            ty: n1(y - 18),
            tr: flip ? 'translate(-100%,-9px)' : 'translate(0,-9px)',
          },
        ]
      })
    : []

  let meas = ''
  const chips: { x: number; y: number; t: string }[] = []
  for (let i = 1; measure && !hidePins && i < pins.length; i++) {
    const a = pins[i - 1], b = pins[i]
    meas += `M${n1(a.x)} ${n1(a.y)}L${n1(b.x)} ${n1(b.y)}`
    const [ax, ay, az] = a.hit.p ?? [a.hit.x, a.hit.y, a.hit.z], [bx, by, bz] = b.hit.p ?? [b.hit.x, b.hit.y, b.hit.z]
    const d = Math.hypot(ax - bx, ay - by, az - bz) * mmPerCell
    chips.push({ x: n1((a.x + b.x) / 2), y: n1((a.y + b.y) / 2), t: `Δ ${d.toFixed(1)} mm` })
  }

  const [clrHover, setClrHover] = useState(false)
  const flagFont = `400 11px/1.2 ${MONO}`

  let hvEl = null
  if (hv) {
    const { px: x, py: y, hit } = hv
    const flip = x > w - 320
    hvEl = { x, y, hit, flip }
  }

  return (
    <div
      ref={rootRef}
      style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, pointerEvents: 'none', userSelect: 'none', fontVariantNumeric: 'tabular-nums', color: INK }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <g opacity={ro} style={{ transition: 'opacity .16s' }}>
          <path d={ruler.b} fill="none" stroke={INK3} strokeWidth={1} />
          <path d={ruler.r} fill="none" stroke={INK3} strokeWidth={1} />
        </g>
        {hvEl && !hideHover && (
          <>
            <path
              d={`M${n1(hvEl.x)} ${n1(hvEl.y + 16)}V${h - 18}M${n1(hvEl.x + 16)} ${n1(hvEl.y)}H${w - 18}`}
              fill="none"
              stroke={INK3}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <path
              d={`M${n1(hvEl.x - 4)} ${h - 15}H${n1(hvEl.x + 4)}L${n1(hvEl.x)} ${h - 10}ZM${w - 15} ${n1(hvEl.y - 4)}V${n1(hvEl.y + 4)}L${w - 10} ${n1(hvEl.y)}Z`}
              fill={INK}
            />
            <path
              d={`M${n1(hvEl.x - 13)} ${n1(hvEl.y)}H${n1(hvEl.x - 5)}M${n1(hvEl.x + 5)} ${n1(hvEl.y)}H${n1(hvEl.x + 13)}M${n1(hvEl.x)} ${n1(hvEl.y - 13)}V${n1(hvEl.y - 5)}M${n1(hvEl.x)} ${n1(hvEl.y + 5)}V${n1(hvEl.y + 13)}`}
              fill="none"
              stroke={INK}
              strokeWidth={1}
            />
          </>
        )}
        {meas && <path d={meas} fill="none" stroke={INK} strokeWidth={1} strokeDasharray="3 3" />}
        {(hidePins ? [] : pins).map((q) => (
          <g key={q.key}>
            <circle cx={n1(q.x)} cy={n1(q.y)} r={3.2} fill={INK} />
            <circle cx={n1(q.x)} cy={n1(q.y)} r={8} fill="none" stroke={INK} strokeWidth={1} />
            <path d={q.ld} fill="none" stroke={INK} strokeWidth={1} />
          </g>
        ))}
      </svg>

      <div style={{ position: 'absolute', inset: 0, opacity: ro, transition: 'opacity .16s', pointerEvents: 'none' }}>
        {ruler.lab.map((l, i) => (
          <span
            key={i}
            style={{ position: 'absolute', left: l.x, top: l.y, transform: l.tr, font: `400 9px/1 ${MONO}`, color: INK3, whiteSpace: 'nowrap' }}
          >
            {l.t}
          </span>
        ))}
      </div>

      {hvEl && !hideHover && (
        <>
          <div
            style={{
              position: 'absolute',
              left: n1(hvEl.flip ? hvEl.x - 18 : hvEl.x + 18),
              top: n1(hvEl.y - 34),
              transform: hvEl.flip ? 'translateX(-100%)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              font: flagFont,
              whiteSpace: 'nowrap',
              textShadow: HALO,
              pointerEvents: 'none',
            }}
          >
            <span>{hvEl.hit.lines[0]}</span>
            <span style={{ color: INK2 }}>{hvEl.hit.lines[1]}</span>
          </div>
          <span
            style={{ position: 'absolute', left: n1(hvEl.x), top: h - 30, transform: 'translateX(-50%)', font: `400 10px/1 ${MONO}`, whiteSpace: 'nowrap' }}
          >
            {`x ${hvEl.hit.x}`}
          </span>
          <span
            style={{ position: 'absolute', left: w - 20, top: n1(hvEl.y), transform: 'translate(-100%,-50%)', font: `400 10px/1 ${MONO}`, whiteSpace: 'nowrap' }}
          >
            {`z ${hvEl.hit.z}`}
          </span>
        </>
      )}

      {(hidePins ? [] : pins).map((q) => (
        <div
          key={q.key}
          style={{
            position: 'absolute',
            left: q.tx,
            top: q.ty,
            transform: q.tr,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            font: flagFont,
            whiteSpace: 'nowrap',
            textShadow: HALO,
            pointerEvents: 'none',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: INK,
                color: BG,
                fontSize: 11,
                textShadow: 'none',
              }}
            >
              {q.n}
            </span>
            {q.hit.lines[0]}
          </span>
          <span style={{ color: INK2, paddingLeft: 22 }}>{q.hit.lines[1]}</span>
        </div>
      ))}

      {chips.map((m, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: m.x,
            top: m.y,
            transform: 'translate(-50%,-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            height: 18,
            padding: '0 7px',
            borderRadius: 999,
            border: `1px solid ${INK}`,
            background: BG,
            font: `400 10px/1 ${MONO}`,
            whiteSpace: 'nowrap',
            boxSizing: 'border-box',
          }}
        >
          {m.t}
        </span>
      ))}

      {pins.length > 0 && !hideClear && (
        <span
          data-qs-probe-ui=""
          role="button"
          onClick={(e) => {
            e.stopPropagation()
            p.clear()
          }}
          onPointerEnter={() => setClrHover(true)}
          onPointerLeave={() => setClrHover(false)}
          style={{
            position: 'absolute',
            right: 28,
            bottom: 30,
            display: 'inline-flex',
            alignItems: 'center',
            height: 22,
            padding: '0 10px',
            borderRadius: 999,
            border: `1px solid ${clrHover ? INK : CTL}`,
            font: `400 11px/1 ${MONO}`,
            color: clrHover ? INK : INK2,
            cursor: 'pointer',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            transition: 'color .15s, border-color .15s',
          }}
        >
          {`Clear ${pins.length} pin${pins.length > 1 ? 's' : ''}`}
        </span>
      )}
    </div>
  )
}
