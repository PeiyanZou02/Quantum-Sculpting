import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import './qs.css'

export interface QFaderProps {
  /** 'v' (190 wide, scale on the left, label to the right of the puck) or 'h' (label above, scale below). Default 'v'. */
  orient?: 'v' | 'h'
  /** Track length, px. Default 200. */
  len?: number
  min?: number
  max?: number
  value: number
  /** Value increment for snapping, keys and wheel. Default (max − min) / steps. */
  step?: number
  /** Number of tick intervals. Default max − min. */
  steps?: number
  /** Every n-th tick is major and numbered. Default 8. */
  major?: number
  label?: string
  /** Default `${value} / ${max}`. */
  readout?: string
  param?: string
  /** Fires live while dragging, on wheel and on keys. */
  onChange?: (v: number) => void
  /** Fires on release, after a wheel burst settles, and on keys. */
  onCommit?: (v: number) => void
}

const PUCK_V = 'linear-gradient(180deg,#F8F9FA 0%,#E3E4E7 38%,#C8C9CD 52%,#DCDDE0 70%,#F1F2F3 100%)'
const PUCK_H = 'linear-gradient(90deg,#F8F9FA 0%,#E3E4E7 38%,#C8C9CD 52%,#DCDDE0 70%,#F1F2F3 100%)'
const PUCK_SH = '0 1px 1.5px rgba(20,22,28,.24),0 6px 12px rgba(20,22,28,.12)'
const TRACK_SH = 'inset 0 1px 2px rgba(20,22,28,.35),0 1px 0 rgba(255,255,255,.75)'
const mono = (px: number) => `400 ${px}px/1 var(--qs-mono)`

/** Satin fader (QFader.dc.html): recessed 4px track, metal puck with an ink index line. */
export function QFader(props: QFaderProps) {
  const { orient = 'v', len = 200, min = 0, max = 31, value, major = 8, label = '', param } = props
  const steps = props.steps ?? Math.max(1, Math.round(max - min))
  const step = props.step ?? (max - min) / steps
  const vert = orient === 'v'
  const span = max - min || 1
  const f = Math.max(0, Math.min(1, (value - min) / span))
  const pos = (vert ? 1 - f : f) * len
  const readout = props.readout ?? `${value} / ${max}`
  const text = label ? `${label} ${readout}` : readout

  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [dragging, setDragging] = useState(false)

  const snap = (x: number) => {
    const s = step > 0 ? Math.round((x - min) / step) * step + min : x
    return Math.round(Math.max(min, Math.min(max, s)) * 1e6) / 1e6
  }
  const live = useRef({ props, value, snap })
  live.current = { props, value, snap }
  const set = (x: number) => {
    const n = live.current.snap(x)
    if (n !== live.current.value) live.current.props.onChange?.(n)
    return n
  }

  const drag = useRef<{ off: number; last: number } | null>(null)
  const hitRef = useRef<HTMLDivElement>(null)
  const commitT = useRef<number | undefined>(undefined)
  useEffect(() => () => clearTimeout(commitT.current), [])

  /** pointer → value; `off` is the grab offset from the puck centre in px along the track */
  /** pointer → logical px along the hit area, minus its 8px overhang. Normalised by the rect so a CSS-scaled stage works. */
  const along = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const L = len + 16
    return (vert ? (e.clientY - r.top) * (L / (r.height || L)) : (e.clientX - r.left) * (L / (r.width || L))) - 8
  }
  const fromPointer = (e: PointerEvent<HTMLDivElement>, off: number) => {
    const p = along(e) - off
    const t = Math.max(0, Math.min(1, p / len))
    return min + span * (vert ? 1 - t : t)
  }

  useEffect(() => {
    const el = hitRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX
      if (!d) return
      e.preventDefault()
      const { props: p, value: cur } = live.current
      const st = p.step ?? ((p.max ?? 31) - (p.min ?? 0)) / (p.steps ?? Math.max(1, Math.round((p.max ?? 31) - (p.min ?? 0))))
      const n = set(cur + Math.sign(d) * st)
      clearTimeout(commitT.current)
      commitT.current = window.setTimeout(() => live.current.props.onCommit?.(n), 350)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = along(e)
    const off = Math.abs(p - pos) <= 8 ? p - pos : 0 // grabbed the puck: keep the offset; else jump
    drag.current = { off, last: value }
    setDragging(true)
    drag.current.last = set(fromPointer(e, off))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current
    if (!g) return
    g.last = set(fromPointer(e, g.off))
  }
  const endDrag = () => {
    const g = drag.current
    drag.current = null
    setDragging(false)
    if (g) props.onCommit?.(g.last)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let n: number | null = null
    const big = step * major
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') n = value + (e.shiftKey ? big : step)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') n = value - (e.shiftKey ? big : step)
    else if (e.key === 'PageUp') n = value + big
    else if (e.key === 'PageDown') n = value - big
    else if (e.key === 'Home') n = min
    else if (e.key === 'End') n = max
    if (n == null) return
    e.preventDefault()
    props.onCommit?.(set(n))
  }

  const ticks = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const M = i % major === 0 || i === steps
    ticks.push({ pos: vert ? len * (1 - t) : len * t, l: M ? 9 : 5, col: M ? 'var(--qs-ink3)' : 'var(--qs-ink4)', num: String(Math.round(min + (max - min) * t)), M })
  }

  const cls = ['qs-fader', hover && 'qs-fader--hover', focus && 'qs-fader--focus', dragging && 'qs-fader--drag'].filter(Boolean).join(' ')
  const hit = (
    <div
      ref={hitRef}
      className="qs-fader__hit"
      style={vert ? { left: 26, top: -8, width: 40, height: len + 16 } : { left: -8, top: 22, width: len + 16, height: 36 }}
      role="slider"
      tabIndex={0}
      aria-label={label || param}
      aria-orientation={vert ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={readout}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onFocus={e => setFocus(e.currentTarget.matches(':focus-visible'))}
      onBlur={() => setFocus(false)}
    />
  )

  if (vert) {
    return (
      <div className={cls} style={{ width: 190, height: len, margin: '10px 0' }}>
        {ticks.map((t, i) => (
          <span key={i}>
            <div style={{ position: 'absolute', left: 34 - t.l, top: +t.pos.toFixed(1), width: t.l, height: 1, background: t.col }} />
            {t.M && <span style={{ position: 'absolute', left: 0, top: +t.pos.toFixed(1), transform: 'translateY(-50%)', font: mono(9), fontVariantNumeric: 'tabular-nums', color: 'var(--qs-ink3)' }}>{t.num}</span>}
          </span>
        ))}
        <div style={{ position: 'absolute', left: 44, top: -8, bottom: -8, width: 4, borderRadius: 2, background: 'var(--qs-recess)', boxShadow: TRACK_SH }} />
        <div className="qs-fader__puck" style={{ position: 'absolute', left: 30, top: +pos.toFixed(1), width: 32, height: 16, marginTop: -8, borderRadius: 3, background: PUCK_V, boxShadow: PUCK_SH }}>
          <div style={{ position: 'absolute', left: 4, right: 4, top: 7.5, height: 1, background: 'var(--qs-ink)' }} />
        </div>
        <div style={{ position: 'absolute', left: 66, top: +pos.toFixed(1), width: 26, height: 1, background: 'var(--qs-ink)' }} />
        <div style={{ position: 'absolute', left: 98, top: +pos.toFixed(1), transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ font: mono(11), color: 'var(--qs-ink)' }}>{text}</span>
          {param && <span style={{ font: mono(10), color: 'var(--qs-ink3)' }}>{param}</span>}
        </div>
        {hit}
      </div>
    )
  }
  return (
    <div className={cls} style={{ width: len, height: 100, margin: '0 10px' }}>
      <span style={{ position: 'absolute', left: +pos.toFixed(1), top: 0, transform: 'translateX(-50%)', font: mono(11), fontVariantNumeric: 'tabular-nums', color: 'var(--qs-ink)', whiteSpace: 'nowrap' }}>{text}</span>
      <div style={{ position: 'absolute', left: +pos.toFixed(1), top: 16, width: 1, height: 10, background: 'var(--qs-ink)' }} />
      <div style={{ position: 'absolute', left: -8, right: -8, top: 38, height: 4, borderRadius: 2, background: 'var(--qs-recess)', boxShadow: TRACK_SH }} />
      {ticks.map((t, i) => (
        <span key={i}>
          <div style={{ position: 'absolute', left: +t.pos.toFixed(1), top: 58, width: 1, height: t.l, background: t.col }} />
          {t.M && <span style={{ position: 'absolute', left: +t.pos.toFixed(1), top: 72, transform: 'translateX(-50%)', font: mono(9), fontVariantNumeric: 'tabular-nums', color: 'var(--qs-ink3)' }}>{t.num}</span>}
        </span>
      ))}
      <div className="qs-fader__puck" style={{ position: 'absolute', left: +pos.toFixed(1), top: 26, width: 16, height: 28, marginLeft: -8, borderRadius: 3, background: PUCK_H, boxShadow: PUCK_SH }}>
        <div style={{ position: 'absolute', top: 4, bottom: 4, left: 7.5, width: 1, background: 'var(--qs-ink)' }} />
      </div>
      {param && <span style={{ position: 'absolute', left: 0, top: 88, font: mono(10), color: 'var(--qs-ink3)' }}>{param}</span>}
      {hit}
    </div>
  )
}
