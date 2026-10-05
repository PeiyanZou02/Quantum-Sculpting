import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import './qs.css'

export interface QDialProps {
  /** 0..1. Ignored when `detents` is set (the position comes from `active`). */
  value: number
  /** Fires live while turning, on wheel and on keys. */
  onChange?: (v: number) => void
  /** Fires on release, after a wheel burst settles, on keys and on reset. */
  onCommit?: (v: number) => void
  /** Knob diameter, px. Default 96. */
  size?: number
  label?: string
  /** Shown in ink2 after the label, and in the value flag while turning. */
  readout?: string
  /** Third line in ink3. */
  param?: string
  /** End labels at the arc ends. */
  min?: string
  max?: string
  /** Tick count. Default 37. */
  ticks?: number
  /** Every n-th tick is major. Default 4. */
  major?: number
  /** Detent mode: labels around the arc; the dial snaps to them. */
  detents?: string[]
  /** Active detent index. */
  active?: number
  onDetent?: (i: number) => void
  /** Double-click resets to this value (0..1). No reset when omitted. */
  defaultValue?: number
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const tidy = (x: number) => Math.round(x * 1e4) / 1e4
/** Drag sensitivity: px of travel (right or up) for the full 0..1 range. Shift is 5x finer. */
const RANGE_PX = 200

/** Arc dial with a satin cap (QDial.dc.html); states from QLControls4 "Dial states". */
export function QDial(props: QDialProps) {
  const { size = 96, label, readout, param, min, max, ticks: nTicks = 37, major = 4, detents, active = 0 } = props
  const pad = Math.max(24, Math.round(size * 0.3))
  const box = size + pad * 2
  const c = box / 2
  const r0 = size / 2 + 7
  const det = detents && detents.length ? detents : null
  const nDet = det ? det.length : 0
  const v = det ? (nDet > 1 ? active / (nDet - 1) : 0) : clamp01(props.value)

  const [hover, setHover] = useState(false)
  const [turning, setTurning] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [scrolling, setScrolling] = useState(false)

  const live = useRef({ props, v })
  live.current = { props, v }
  const drag = useRef<{ sx: number; sy: number; sv: number; moved: boolean; last: number } | null>(null)
  const hitRef = useRef<HTMLDivElement>(null)
  const timers = useRef<{ scroll?: number; commit?: number; press?: number }>({})

  useEffect(() => () => { const t = timers.current; clearTimeout(t.scroll); clearTimeout(t.commit); clearTimeout(t.press) }, [])

  /** Apply a new 0..1 position. Returns the committed value (detent fraction or value). */
  const apply = (nv: number): number => {
    const p = live.current.props
    const d = p.detents && p.detents.length ? p.detents : null
    if (d) {
      const n = d.length
      const i = n > 1 ? Math.round(clamp01(nv) * (n - 1)) : 0
      if (i !== (p.active ?? 0)) p.onDetent?.(i)
      return n > 1 ? i / (n - 1) : 0
    }
    const x = tidy(clamp01(nv))
    if (x !== live.current.v) p.onChange?.(x)
    return x
  }

  // wheel: ±0.01 (or ±1 detent); non-passive so the page does not scroll
  useEffect(() => {
    const el = hitRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX
      if (!dy) return
      e.preventDefault()
      const s = Math.sign(dy)
      const { props: p, v: cur } = live.current
      const d = p.detents && p.detents.length ? p.detents : null
      const committed = d ? apply(cur + s / Math.max(1, d.length - 1)) : apply(cur + 0.01 * s)
      setScrolling(true)
      const t = timers.current
      clearTimeout(t.scroll)
      t.scroll = window.setTimeout(() => setScrolling(false), 700)
      clearTimeout(t.commit)
      t.commit = window.setTimeout(() => live.current.props.onCommit?.(committed), 350)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, sv: v, moved: false, last: v }
    setPressed(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current
    if (!g) return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 3) return
      g.moved = true
      setPressed(false)
      setTurning(true)
    }
    const k = e.shiftKey ? 1 / (RANGE_PX * 5) : 1 / RANGE_PX
    g.last = apply(g.sv + (dx - dy) * k)
  }
  const endDrag = () => {
    const g = drag.current
    drag.current = null
    setPressed(false)
    setTurning(false)
    if (g?.moved) props.onCommit?.(g.last)
  }
  const reset = () => {
    const dv = props.defaultValue
    if (dv == null) return
    setPressed(true)
    clearTimeout(timers.current.press)
    timers.current.press = window.setTimeout(() => setPressed(false), 160)
    props.onCommit?.(apply(dv))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const fine = det ? 1 / Math.max(1, nDet - 1) : 0.01
    const coarse = det ? fine : 0.1
    let nv: number | null = null
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') nv = v + (e.shiftKey ? coarse : fine)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') nv = v - (e.shiftKey ? coarse : fine)
    else if (e.key === 'PageUp') nv = v + coarse
    else if (e.key === 'PageDown') nv = v - coarse
    else if (e.key === 'Home') nv = 0
    else if (e.key === 'End') nv = 1
    else if ((e.key === 'Backspace' || e.key === 'Delete') && props.defaultValue != null) { e.preventDefault(); reset(); return }
    if (nv == null) return
    e.preventDefault()
    props.onCommit?.(apply(nv))
  }

  // geometry (QDial.dc.html)
  const at = (f: number, R: number) => {
    const a = ((-225 + 270 * f) * Math.PI) / 180
    return [c + R * Math.cos(a), c + R * Math.sin(a)]
  }
  const tickEls: { a: number; len: number; col: string }[] = []
  const labelEls: { x: number; y: number; t: string; col: string; i?: number }[] = []
  if (det) {
    det.forEach((t, i) => {
      const f = nDet > 1 ? i / (nDet - 1) : 0.5
      const [x, y] = at(f, r0 + 20)
      const on = i === active
      tickEls.push({ a: -225 + 270 * f, len: 8, col: on ? 'var(--qs-ink)' : 'var(--qs-ink4)' })
      labelEls.push({ x, y, t, col: on ? 'var(--qs-ink)' : 'var(--qs-ink3)', i })
    })
  } else {
    for (let i = 0; i < nTicks; i++) {
      const f = nTicks > 1 ? i / (nTicks - 1) : 0
      const M = i % major === 0 || i === nTicks - 1
      tickEls.push({ a: -225 + 270 * f, len: M ? 9 : 5, col: f <= v + 1e-6 ? 'var(--qs-ink)' : 'var(--qs-ink4)' })
    }
    ;([[0, min], [1, max]] as const).forEach(([f, t]) => {
      if (t == null || t === '') return
      const [x, y] = at(f, r0 + 18)
      labelEls.push({ x, y, t, col: 'var(--qs-ink3)' })
    })
  }
  const face = Math.round(size * 0.78)
  const fo = pad + (size - face) / 2
  const angle = -135 + 270 * v
  const it = Math.round(size * 0.12)
  const il = Math.round(size * 0.22)
  const flagText = det ? det[active] ?? '' : readout || v.toFixed(2)

  const cls = ['qs-dial', hover && !turning && 'qs-dial--hover', turning && 'qs-dial--turning', pressed && 'qs-dial--pressed'].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      <div className="qs-dial__box" style={{ width: box, height: box }}>
        <div className="qs-dial__body">
          {tickEls.map((t, i) => (
            <div key={i} style={{ position: 'absolute', left: c, top: c, width: t.len, height: 1, marginTop: -0.5, background: t.col, transformOrigin: '0 50%', transform: `rotate(${t.a.toFixed(1)}deg) translateX(${r0}px)` }} />
          ))}
          {labelEls.map((l, i) => (
            <span
              key={i}
              className={l.i != null ? 'qs-dial__det' : undefined}
              onClick={l.i != null ? () => { if (l.i !== active) props.onDetent?.(l.i!); props.onCommit?.(nDet > 1 ? l.i! / (nDet - 1) : 0) } : undefined}
              style={{ position: 'absolute', left: +l.x.toFixed(1), top: +l.y.toFixed(1), transform: 'translate(-50%,-50%)', font: "400 9px/1 var(--qs-mono)", fontVariantNumeric: 'tabular-nums', color: l.col, whiteSpace: 'nowrap', zIndex: 1 }}
            >
              {l.t}
            </span>
          ))}
          <div style={{ position: 'absolute', left: pad, top: pad, width: size, height: size, borderRadius: '50%', background: 'repeating-conic-gradient(from 0deg,rgba(255,255,255,.65) 0deg 1.2deg,rgba(40,42,48,.09) 1.2deg 3.6deg),conic-gradient(from 210deg,#F3F4F5,#CACBCF,#F0F1F2,#C4C5C9,#F3F4F5)', boxShadow: '0 1px 1.5px rgba(20,22,28,.18),0 10px 22px rgba(20,22,28,.12)' }} />
          <div style={{ position: 'absolute', left: fo, top: fo, width: face, height: face, borderRadius: '50%', background: 'repeating-radial-gradient(circle at 50% 50%,rgba(255,255,255,.2) 0 1px,rgba(255,255,255,0) 1px 2.5px),radial-gradient(circle at 50% 26%,rgba(255,255,255,.92) 0%,rgba(255,255,255,0) 60%),conic-gradient(from 15deg,#EDEEF0,#D2D3D7,#F6F7F8,#CDCED2,#EEEFF1,#D0D1D5,#F5F6F7,#CBCCD0,#EDEEF0)', boxShadow: '0 0 0 1px rgba(255,255,255,.6),0 1px 2px rgba(20,22,28,.2)' }} />
          <div style={{ position: 'absolute', left: pad, top: pad, width: size, height: size, transform: `rotate(${angle.toFixed(1)}deg)` }}>
            <div style={{ position: 'absolute', left: '50%', top: it, width: 1.5, height: il, marginLeft: -0.75, borderRadius: 1, background: 'var(--qs-ink)' }} />
          </div>
          {pressed && <div style={{ position: 'absolute', left: pad, top: pad, width: size, height: size, borderRadius: '50%', boxShadow: 'inset 0 2px 6px rgba(20,22,28,.35)', pointerEvents: 'none' }} />}
        </div>
        <div
          ref={hitRef}
          className="qs-dial__hit"
          style={{ left: pad, top: pad, width: size, height: size }}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={det ? nDet - 1 : 1}
          aria-valuenow={det ? active : v}
          aria-valuetext={det ? det[active] : readout || v.toFixed(2)}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={reset}
          onKeyDown={onKeyDown}
        />
        <div className="qs-dial__ring" style={{ left: pad - 6, top: pad - 6, width: size + 12, height: size + 12 }} />
        {turning && <span className="qs-dial__flag">{flagText} ↻</span>}
        {scrolling && (
          <span className="qs-dial__scroll" style={{ right: -14, top: c - 20 }} aria-hidden>
            <span>↑</span>
            <span>↓</span>
          </span>
        )}
      </div>
      {label && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          <span style={{ font: '400 10px/1 var(--qs-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--qs-ink)' }}>
            {label} <span style={{ color: 'var(--qs-ink2)' }}>{readout}</span>
          </span>
          {param && <span style={{ font: '400 10px/1 var(--qs-mono)', color: 'var(--qs-ink3)' }}>{param}</span>}
        </div>
      )}
    </div>
  )
}
