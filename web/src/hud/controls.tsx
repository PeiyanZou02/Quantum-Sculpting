// Controls as readouts (QLControls4 · "05 Physical controls"): the satin dial builds, the number
// controls "beyond the arc" and the view camera as an object. For the presentation view they show the
// live values from HudCtx; nothing here takes the pointer. Values ease when they change, the way a
// needle turns. The orbit gimbal and its states are orbit.tsx v1 and v5.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { HudCtx } from './types'
import './controls.css'

const RAD = Math.PI / 180
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const num = (v: unknown, d: number) => (fin(v) ? v : d)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const n1 = (v: number) => v.toFixed(1)
const wrap360 = (v: number) => ((v % 360) + 360) % 360
/** Signed shortest-arc difference b − a in (−180, 180]. */
const dArc = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180
const a3 = (v: number) => String(Math.round(wrap360(v)) % 360).padStart(3, '0') + '°'
const int = (v: number) => Math.round(v).toLocaleString('en-US')
/** +0.5, −1.25, 0 */
const signed = (v: number) => {
  const s = String(+Math.abs(v).toFixed(2))
  return v > 1e-9 ? '+' + s : v < -1e-9 ? '−' + s : '0'
}
const pct = (f: number) => String(Math.round(f * 100))

const INK = 'var(--qs-ink)'
const INK3 = 'var(--qs-ink3)'
const INK4 = 'var(--qs-ink4)'

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** The shown value eases toward the target (cubic out), so a needle turns instead of jumping. */
function useEased(target: number, ms = 480): number {
  const [shown, setShown] = useState(target)
  const st = useRef({ cur: target, raf: 0 })
  useEffect(() => {
    const s = st.current
    cancelAnimationFrame(s.raf)
    if (!fin(target) || s.cur === target) return
    const from = s.cur
    if (reducedMotion() || !fin(from)) {
      s.cur = target
      setShown(target)
      return
    }
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      s.cur = from + (target - from) * (1 - (1 - k) ** 3)
      setShown(s.cur)
      if (k < 1) s.raf = requestAnimationFrame(step)
    }
    s.raf = requestAnimationFrame(step)
  }, [target, ms])
  useEffect(() => {
    const s = st.current
    return () => cancelAnimationFrame(s.raf)
  }, [])
  return fin(target) ? shown : 0
}

/** A rotation that always takes the short way round, for a CSS transition on transform. */
function useTurn(deg: number): number {
  const [s, setS] = useState({ deg, turn: deg })
  if (s.deg === deg) return s.turn
  const turn = s.turn + dArc(s.turn, deg)
  setS({ deg, turn })
  return turn
}

/** Strength, style and shots drive the emulator and Atlas only. */
const MODE_NAME: Record<string, string> = { gaussian: 'Gaussian', nations: 'Evolve' }
const notUsed = (ctx: HudCtx) => (MODE_NAME[ctx.q.mode] ? `not used in ${MODE_NAME[ctx.q.mode]}` : null)

/** Shots, or null for exact. */
const shotsOf = (ctx: HudCtx) => (fin(ctx.q.shots) && ctx.q.shots > 0 ? ctx.q.shots : null)

/** Name in sans, value in mono, words in sans, then a light italic note. */
function Line({ k, v, w, note, mt }: { k: string; v?: string; w?: string; note?: string | null; mt?: number }) {
  return (
    <div className="qc-line" style={mt ? { marginTop: mt } : undefined}>
      <span className="qc-k">{k}</span>
      {v != null && <span className="qc-v">{v}</span>}
      {w != null && <span className="qc-w">{w}</span>}
      {note && <span className="qc-n">{note}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// The arc dial (QDial): ticks over 270°, satin body and face, an ink index line

interface ArcProps {
  /** 0..1, already eased. */
  v: number
  size: number
  min?: string
  max?: string
  pressed?: boolean
  children?: ReactNode
}

function ArcDial({ v, size, min, max, pressed, children }: ArcProps) {
  const pad = Math.max(24, Math.round(size * 0.3))
  const box = size + pad * 2
  const c = box / 2
  const r0 = size / 2 + 7
  const face = Math.round(size * 0.78)
  const fo = (size - face) / 2
  const it = Math.round(size * 0.12)
  const il = Math.round(size * 0.22)
  const ticks: ReactNode[] = []
  for (let i = 0; i < 37; i++) {
    const f = i / 36
    ticks.push(
      <div
        key={i}
        className="qc-abs"
        style={{
          left: c,
          top: c,
          width: i % 4 === 0 ? 9 : 5,
          height: 1,
          marginTop: -0.5,
          background: f <= v + 1e-6 ? INK : INK4,
          transformOrigin: '0 50%',
          transform: `rotate(${n1(-225 + 270 * f)}deg) translateX(${r0}px)`,
        }}
      />,
    )
  }
  const ends: [number, string | undefined][] = [
    [0, min],
    [1, max],
  ]
  return (
    <div className="qc-art" style={{ width: box, height: box }}>
      {ticks}
      {ends.map(([f, t]) => {
        if (!t) return null
        const a = (-225 + 270 * f) * RAD
        return (
          <span key={f} className="qc-abs qc-m" style={{ left: n1(c + (r0 + 18) * Math.cos(a)) + 'px', top: n1(c + (r0 + 18) * Math.sin(a)) + 'px', transform: 'translate(-50%,-50%)', fontSize: 9 }}>
            {t}
          </span>
        )
      })}
      <div className={'qc-abs qc-press' + (pressed ? ' qc-pressed' : '')} style={{ left: pad, top: pad, width: size, height: size }}>
        <div className="qc-abs qc-knob" style={{ inset: 0 }} />
        <div className="qc-abs qc-face" style={{ left: fo, top: fo, width: face, height: face }} />
        <div className="qc-abs" style={{ inset: 0, transform: `rotate(${n1(-135 + 270 * v)}deg)` }}>
          <div className="qc-abs qc-ink" style={{ left: '50%', top: it, width: 1.5, height: il, marginLeft: -0.75, borderRadius: 1 }} />
        </div>
        {pressed && <div className="qc-abs qc-pressed-in" style={{ inset: 0 }} />}
      </div>
      {children}
    </div>
  )
}

// D1 · arc dial, the base build: strength ------------------------------------------------------

export function D1Arc({ ctx }: { ctx: HudCtx }) {
  // as in the sheet: the threshold (mesh level) on 0.05–0.95
  const level = clamp(num(ctx.level, 0.5), 0.05, 0.95)
  const v = useEased((level - 0.05) / 0.9)
  return (
    <div className="qc qc--c">
      <ArcDial v={v} size={100} min="0.05" max="0.95" />
      <Line k="Threshold" v={level.toFixed(2)} mt={-12} />
    </div>
  )
}

// D2 · ring dial, value in the hole: strength --------------------------------------------------

export function D2Ring({ ctx }: { ctx: HudCtx }) {
  const s = clamp(num(ctx.q.strength, 0), 0, 1)
  const v = useEased(s)
  const idle = notUsed(ctx)
  const ticks: ReactNode[] = []
  for (let i = 0; i < 37; i++) {
    const f = i / 36
    ticks.push(
      <div
        key={i}
        className="qc-abs"
        style={{
          left: 100,
          top: 100,
          width: i % 4 === 0 ? 9 : 5,
          height: 1,
          marginTop: -0.5,
          background: f <= v + 1e-6 ? INK : INK4,
          transformOrigin: '0 50%',
          transform: `rotate(${n1(-225 + 270 * f)}deg) translateX(86px)`,
        }}
      />,
    )
  }
  return (
    <div className={'qc' + (idle ? ' qc--idle' : '')}>
      <div className="qc-art" style={{ width: 200, height: 200 }}>
        {ticks}
        <div className="qc-abs qc-ringwrap" style={{ left: 24, top: 24, width: 152, height: 152 }}>
          <div className="qc-knob qc-ring" style={{ width: 152, height: 152, boxShadow: 'none' }} />
        </div>
        <div className="qc-abs" style={{ left: 24, top: 24, width: 152, height: 152, transform: `rotate(${n1(-135 + 270 * v)}deg)` }}>
          <div className="qc-abs qc-ink" style={{ left: 75, top: 4, width: 2, height: 16, borderRadius: 1 }} />
        </div>
        <div
          className="qc-abs"
          style={{ left: 49, top: 49, width: 102, height: 102, borderRadius: '50%', border: `1px solid ${INK4}`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <span style={{ font: '400 22px/1 var(--qs-mono)', fontVariantNumeric: 'tabular-nums', color: INK }}>{v.toFixed(2)}</span>
          <span className="qc-s">Strength</span>
        </div>
      </div>
      {idle && <Line k="Strength" note={idle} />}
    </div>
  )
}

// D3 · coarse ring, fine cap: level as 0.05 detents plus the rest -----------------------------

const STEP = 0.05
function splitLevel(x: number): [number, number] {
  const c = clamp(Math.floor(x / STEP + 1e-6) * STEP, 0.05, 0.95)
  return [c, x - c]
}

export function D3CoarseFine({ ctx }: { ctx: HudCtx }) {
  const L = clamp(num(ctx.level, 0.5), 0, 1)
  const Le = useEased(L)
  const [c, f] = splitLevel(L)
  const [ce, fe] = splitLevel(Le)
  const coarseA = -135 + (270 * (ce - 0.05)) / 0.9
  const fineA = (fe / STEP) * 360
  return (
    <div className="qc qc--c">
      <div className="qc-art" style={{ width: 180, height: 180 }}>
        <div className="qc-abs qc-knob" style={{ left: 20, top: 20, width: 140, height: 140 }} />
        <div className="qc-abs qc-click" style={{ left: 20, top: 20, width: 140, height: 140, transform: `rotate(${n1(coarseA)}deg)` }}>
          <div className="qc-abs qc-ink" style={{ left: 69, top: 3, width: 2, height: 14 }} />
        </div>
        <div className="qc-abs qc-cap" style={{ left: 50, top: 50, width: 80, height: 80 }} />
        <div className="qc-abs" style={{ left: 50, top: 50, width: 80, height: 80, transform: `rotate(${n1(fineA)}deg)` }}>
          <div className="qc-abs qc-ink" style={{ left: 39.25, top: 8, width: 1.5, height: 20 }} />
        </div>
        <span className="qc-abs qc-s" style={{ left: 0, top: 0 }}>Coarse</span>
        <span className="qc-abs qc-s" style={{ right: 0, top: 0 }}>Fine</span>
      </div>
      <Line k="Level" v={`${c.toFixed(2)} + ${Math.max(0, f).toFixed(3)}`} />
    </div>
  )
}

// D4 · engraved detents, fixed index: gate style -----------------------------------------------

const STYLES = ['x', 'y', 'xy', 'yx']
const STYLE_GATES: Record<string, string> = { x: 'Rx', y: 'Ry', xy: 'Rx then Ry', yx: 'Ry then Rx' }
/** Detent label positions on the 110 px knob: top, right, bottom, left (x, y, rotation). */
const DET_P: [number, number, number][] = [
  [55, 16, 0],
  [94, 55, 90],
  [55, 94, 180],
  [16, 55, 270],
]

export function D4Detents({ ctx }: { ctx: HudCtx }) {
  const st = ctx.q.style
  const i = STYLES.indexOf(st)
  const turn = useTurn(i >= 0 ? -90 * i : 0)
  const idle = notUsed(ctx)
  return (
    <div className={'qc qc--c' + (idle ? ' qc--idle' : '')}>
      <div className="qc-art" style={{ width: 160, height: 146 }}>
        <span className="qc-abs" style={{ left: 74, top: 0, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `8px solid ${INK}` }} />
        <div className="qc-abs qc-cap qc-lift" style={{ left: 25, top: 30, width: 110, height: 110 }} />
        <div className="qc-abs qc-turn" style={{ left: 25, top: 30, width: 110, height: 110, transform: `rotate(${turn}deg)` }}>
          {STYLES.map((t, k) => (
            <span
              key={t}
              className={'qc-abs qc-m qc-engr' + (k === i ? ' qc-on' : '')}
              style={{ left: DET_P[k][0], top: DET_P[k][1], fontSize: 11, transform: `translate(-50%,-50%) rotate(${DET_P[k][2]}deg)` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <Line k="Style" v={i >= 0 ? st : '—'} w={i >= 0 ? '· ' + STYLE_GATES[st] : undefined} note={idle} />
    </div>
  )
}

// D5 · edge wheel for long ranges: shots -------------------------------------------------------

const WHEEL_STOPS: { t: string; lg: number | null }[] = [
  { t: '1k', lg: 10 },
  { t: '4k', lg: 12 },
  { t: '16k', lg: 14 },
  { t: 'exact', lg: null },
]

export function D5EdgeWheel({ ctx }: { ctx: HudCtx }) {
  const shots = shotsOf(ctx)
  const lg = shots ? Math.log2(shots) : 18
  const roll = useEased(lg, 640)
  let on = 3
  if (shots) {
    on = 0
    for (let k = 1; k < 3; k++) if (Math.abs(lg - (WHEEL_STOPS[k].lg ?? 0)) < Math.abs(lg - (WHEEL_STOPS[on].lg ?? 0))) on = k
  }
  const idle = notUsed(ctx)
  return (
    <div className={'qc qc--c' + (idle ? ' qc--idle' : '')} style={{ width: 220 }}>
      <Line k="Shots" v={shots ? int(shots) : undefined} w={shots ? undefined : 'exact'} note={idle} />
      <div className="qc-art qc-recess" style={{ width: 220, height: 34, borderRadius: 6, marginTop: 2 }}>
        <div className="qc-abs qc-knurl" style={{ left: 6, right: 6, top: 5, bottom: 5, borderRadius: 3, backgroundPositionX: n1(roll * 10.5) + 'px' }} />
        <div className="qc-abs qc-wheelshade" style={{ left: 6, right: 6, top: 5, bottom: 5, borderRadius: 3 }} />
        <div className="qc-abs qc-ink" style={{ left: 109.5, top: -6, width: 1, height: 46 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: 220, marginTop: 2 }}>
        {WHEEL_STOPS.map((s, k) => (
          <span key={s.t} className={(s.lg == null ? 'qc-s' : 'qc-m') + (k === on ? ' qc-on' : '')}>
            {s.t}
          </span>
        ))}
      </div>
    </div>
  )
}

// Dial states: same object, five moments, driven by what the value is doing --------------------

type DState = 'rest' | 'hover' | 'turning' | 'pressed' | 'scroll'
const STATE_ROWS: [DState, string, string?][] = [
  ['rest', 'Rest'],
  ['hover', 'Hover · ring'],
  ['turning', 'Turning · value flag'],
  ['pressed', 'Pressed · reset'],
  ['scroll', 'Scroll · ', '±0.01'],
]
const LEVEL_DEFAULT = 0.5

/** Turning after a change, scroll after a 0.01 step, pressed on a return to the default; the ring
 *  while the app is busy (recomputing); rest otherwise. */
function useDialState(v: number, def: number, busy: boolean): { kind: DState; up: boolean } {
  const [ev, setEv] = useState<{ kind: DState; up: boolean; until: number }>({ kind: 'rest', up: true, until: 0 })
  const prev = useRef(v)
  useEffect(() => {
    const p = prev.current
    prev.current = v
    if (p === v) return
    const kind: DState = Math.abs(v - def) < 1e-6 ? 'pressed' : Math.abs(v - p) <= 0.0105 ? 'scroll' : 'turning'
    setEv({ kind, up: v > p, until: performance.now() + (kind === 'pressed' ? 700 : 1600) })
  }, [v, def])
  useEffect(() => {
    if (ev.kind === 'rest') return
    const id = window.setTimeout(() => setEv((e) => ({ ...e, kind: 'rest' })), Math.max(0, ev.until - performance.now()))
    return () => window.clearTimeout(id)
  }, [ev])
  return { kind: ev.kind === 'rest' && busy ? 'hover' : ev.kind, up: ev.up }
}

/** The level on the arc, as the sheet's base build reads its threshold: 0.05–0.95. */
export function DialStates({ ctx }: { ctx: HudCtx }) {
  const L = clamp(num(ctx.level, LEVEL_DEFAULT), 0.05, 0.95)
  const v = useEased((L - 0.05) / 0.9)
  const { kind, up } = useDialState(L, LEVEL_DEFAULT, ctx.busy)
  return (
    <div className="qc">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <ArcDial v={v} size={64} pressed={kind === 'pressed'}>
          {kind === 'hover' && <div className="qc-abs qc-ringmark qc-breathe" style={{ left: 18, top: 18, width: 76, height: 76 }} />}
          {kind === 'turning' && <span className="qc-flag">{L.toFixed(2)} ↻</span>}
          {kind === 'scroll' && (
            <span className="qc-abs qc-m" style={{ right: -14, top: 36, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className={up ? 'qc-on' : undefined}>↑</span>
              <span className={up ? undefined : 'qc-on'}>↓</span>
            </span>
          )}
        </ArcDial>
        <div className="qc-states">
          {STATE_ROWS.map(([k, t, m]) => (
            <span key={k} className={'qc-state' + (k === kind ? ' qc-state--on' : '')}>
              <i />
              <span>
                {t}
                {m && <span className="qc-v">{m}</span>}
              </span>
            </span>
          ))}
        </div>
      </div>
      <Line k="Level" v={L.toFixed(2)} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// N1 · drum: level, 0.05 a number, foreshortened toward the edges

export function N1Drum({ ctx }: { ctx: HudCtx }) {
  const L = clamp(num(ctx.level, 0.5), 0, 1)
  const Le = useEased(L)
  const k0 = Math.round(Le / STEP)
  const nums: ReactNode[] = []
  for (let k = k0 - 3; k <= k0 + 3; k++) {
    const val = k * STEP
    if (val < -1e-9 || val > 1 + 1e-9) continue
    const th = ((val - Le) / STEP) * 30
    if (Math.abs(th) >= 84) continue
    const co = Math.cos(th * RAD)
    const near = Math.max(0, 1 - Math.abs(th) / 30)
    nums.push(
      <span
        key={k}
        className="qc-drumnum"
        style={{
          left: n1(100 + 80 * Math.sin(th * RAD)) + 'px',
          fontSize: n1(12 + 3 * near) + 'px',
          color: Math.abs(th) < 15 ? INK : undefined,
          opacity: +(0.25 + 0.75 * co * co).toFixed(2),
          transform: `translate(-50%,-50%) scaleX(${Math.max(0.2, co).toFixed(2)})`,
        }}
      >
        {val.toFixed(2)}
      </span>,
    )
  }
  return (
    <div className="qc">
      <div className="qc-art" style={{ width: 240, height: 96 }}>
        <div className="qc-abs qc-drum" style={{ left: 20, top: 22, width: 200, height: 52 }}>
          {nums}
        </div>
        <span className="qc-abs qc-ink" style={{ left: 119.5, top: 6, width: 1, height: 14 }} />
        <span className="qc-abs qc-ink" style={{ left: 119.5, top: 76, width: 1, height: 14 }} />
      </div>
      <Line k="Level" v={L.toFixed(2)} />
    </div>
  )
}

// N2 · odometer: shots, one wheel per digit ----------------------------------------------------

const ROLL = [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]

export function N2Odometer({ ctx }: { ctx: HudCtx }) {
  const shots = shotsOf(ctx)
  const digits = (shots ? String(Math.round(shots)).padStart(5, '0') : '00000').split('').map(Number)
  const idle = notUsed(ctx)
  return (
    <div className={'qc' + (idle ? ' qc--idle' : '')}>
      <div className="qc-art" style={{ display: 'flex', alignItems: 'center', height: 64 }}>
        <div className={'qc-odo qc-recess' + (shots ? '' : ' qc-odo--exact')}>
          {digits.map((d, i) => (
            <div key={digits.length - i} className="qc-digit">
              <div className="qc-digitwin">
                <div className="qc-digits" style={{ transform: `translateY(${18 - ((d + 1) * 19 + 9.5)}px)` }}>
                  {ROLL.map((x, j) => (
                    <span key={j}>{x}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <span className={'qc-s' + (shots ? '' : ' qc-on')} style={{ marginLeft: 14, fontSize: 11 }}>
          {shots ? 'Exact ⟲' : 'Exact'}
        </span>
      </div>
      <Line k="Shots" v={shots ? int(shots) : undefined} w={shots ? undefined : 'exact'} note={idle} />
    </div>
  )
}

// N3 · pull rod: push amount (quantum cells, 0–8) ----------------------------------------------

const PUSH_MAX = 8

export function N3PullRod({ ctx }: { ctx: HudCtx }) {
  const r = ctx.report
  const push = r?.method === 'advect'
  const amt = push ? clamp(num(r.amount, 0), 0, PUSH_MAX) : 0
  const ae = useEased(amt)
  const x = 60 + (ae / PUSH_MAX) * 180
  const note = !r ? 'no mesh yet' : push ? null : 'threshold, no push'
  return (
    <div className="qc">
      <div className="qc-art" style={{ width: 250, height: 90 }}>
        <div className="qc-abs qc-recess" style={{ left: 0, top: 28, width: 60, height: 24, borderRadius: 4 }} />
        <div className="qc-abs qc-rod" style={{ left: 26, top: 34, width: Math.max(12, x - 26), height: 12 }} />
        <div className="qc-abs qc-grad" style={{ left: 62, top: 34, width: Math.max(0, x - 18 - 62), height: 12 }} />
        <div className="qc-abs qc-bead" style={{ left: x - 11, top: 29, width: 22, height: 22 }} />
        <div className="qc-abs" style={{ left: 60, top: 66, width: 180, height: 6, borderLeft: `1px solid ${INK3}`, borderRight: `1px solid ${INK3}`, borderBottom: `1px solid ${INK4}`, boxSizing: 'border-box' }} />
        {x > 76 && (
          <span className="qc-abs qc-m" style={{ left: 60, top: 78, transform: 'translateX(-50%)' }}>
            0
          </span>
        )}
        <span className="qc-abs qc-m qc-on" style={{ left: n1(x) + 'px', top: 78, transform: 'translateX(-50%)' }}>
          {ae.toFixed(2)}
        </span>
        {x < 220 && (
          <span className="qc-abs qc-m" style={{ left: 240, top: 78, transform: 'translateX(-50%)' }}>
            {PUSH_MAX}
          </span>
        )}
      </div>
      <Line k="Push" v={amt.toFixed(2)} w="cells" note={note} />
    </div>
  )
}

// N4 · centre-detent slide: thicken / shrink in voxels (−4 … +4) ------------------------------

export function N4DetentSlide({ ctx }: { ctx: HudCtx }) {
  const r = ctx.report
  const g = r ? clamp(num(r.grow, 0), -4, 4) : 0
  const ge = useEased(g)
  const x = 130 + ge * 30
  return (
    <div className="qc">
      <div className="qc-art" style={{ width: 260, height: 90 }}>
        <div className="qc-abs qc-recess" style={{ left: 10, top: 44, width: 240, height: 6, borderRadius: 3 }} />
        <span className="qc-abs" style={{ left: 126, top: 34, width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `6px solid ${INK}` }} />
        <div className="qc-abs qc-ink" style={{ left: n1(Math.min(130, x)) + 'px', top: 40, width: n1(Math.abs(x - 130)) + 'px', height: 2 }} />
        <div className="qc-abs qc-ticks30" style={{ left: 10, top: 62, width: 241, height: 8 }} />
        <div className="qc-abs qc-thumb" style={{ left: n1(x - 9) + 'px', top: 33, width: 18, height: 28 }}>
          <div className="qc-abs qc-ink" style={{ top: 4, bottom: 4, left: 8.5, width: 1 }} />
        </div>
        <span className="qc-abs qc-m qc-on" style={{ left: n1(x) + 'px', top: 14, fontSize: 11, transform: 'translateX(-50%)' }}>
          {signed(Math.round(ge * 100) / 100)}
        </span>
        <span className="qc-abs" style={{ left: 10, top: 78 }}>
          <span className="qc-s">Shrink </span>
          <span className="qc-m">−4</span>
        </span>
        <span className="qc-abs qc-m" style={{ left: 130, top: 78, transform: 'translateX(-50%)' }}>
          0
        </span>
        <span className="qc-abs" style={{ right: 9, top: 78 }}>
          <span className="qc-m">+4</span>
          <span className="qc-s"> thicken</span>
        </span>
      </div>
      <Line k="Thicken / shrink" v={signed(g)} w="voxels" note={r ? null : 'no mesh yet'} />
    </div>
  )
}

// N5 · shift gate: push field, three slots; moving between them passes through neutral --------

const GATE = [
  { id: 'threshold', t: 'Toward result', w: 'toward the result' },
  { id: 'difference', t: 'Difference', w: 'difference' },
  { id: 'gradient', t: 'Gradient', w: 'gradient' },
]
const GX = [40, 120, 200]
const G_TOP = 29
const G_N = 78
const G_PATH = 'M40 28V78H200V28M120 28V78'

/** The knob's position, travelling down to the neutral bar, across, and up into the new slot. */
function useGate(slot: number): [number, number] {
  const tx = slot >= 0 ? GX[slot] : 120
  const ty = slot >= 0 ? G_TOP : G_N
  const [pos, setPos] = useState<[number, number]>([tx, ty])
  const st = useRef({ cur: [tx, ty] as [number, number], raf: 0 })
  useEffect(() => {
    const s = st.current
    cancelAnimationFrame(s.raf)
    const from = s.cur
    if (from[0] === tx && from[1] === ty) return
    if (reducedMotion()) {
      s.cur = [tx, ty]
      setPos(s.cur)
      return
    }
    const pts: [number, number][] = [from, [from[0], G_N], [tx, G_N], [tx, ty]]
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
    const total = lens.reduce((a, b) => a + b, 0)
    const ms = 260 + total * 2.4
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2
      let d = e * total
      let p: [number, number] = [tx, ty]
      for (let i = 0; i < lens.length; i++) {
        if (d <= lens[i] || i === lens.length - 1) {
          const f = lens[i] > 0 ? Math.min(1, d / lens[i]) : 1
          p = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]
          break
        }
        d -= lens[i]
      }
      s.cur = p
      setPos(p)
      if (k < 1) s.raf = requestAnimationFrame(step)
    }
    s.raf = requestAnimationFrame(step)
  }, [tx, ty])
  useEffect(() => {
    const s = st.current
    return () => cancelAnimationFrame(s.raf)
  }, [])
  return pos
}

export function N5ShiftGate({ ctx }: { ctx: HudCtx }) {
  const r = ctx.report
  const push = r?.method === 'advect'
  const slot = push ? GATE.findIndex((g) => g.id === r.field) : -1
  const [kx, ky] = useGate(slot)
  const note = !r ? 'no mesh yet' : push ? null : 'threshold surface'
  return (
    <div className="qc">
      <div className="qc-art" style={{ width: 240, height: 90 }}>
        <svg className="qc-svg" width="240" height="90" viewBox="0 0 240 90">
          <path d={G_PATH} className="qc-gate-shadow" fill="none" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" transform="translate(0 1.5)" />
          <path d={G_PATH} className="qc-gate" fill="none" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
          {GATE.map((g, k) => (
            <text key={g.id} x={GX[k]} y="11" textAnchor="middle" className={'qc-ts' + (k === slot ? ' qc-t1' : '')}>
              {g.t}
            </text>
          ))}
        </svg>
        <div className="qc-abs qc-bead" style={{ left: n1(kx - 11) + 'px', top: n1(ky - 11) + 'px', width: 22, height: 22 }} />
      </div>
      <Line k="Push field" w={slot >= 0 ? GATE[slot].w : 'neutral'} note={note} />
    </div>
  )
}

// N6 · cursor on a dual scale: level above, share of the input kept below ---------------------

interface Kept {
  /** Share of the input solid kept at level l (cells of the result ≥ l over the input's summed coverage). */
  at: (l: number) => number
  /** The level where the share crosses 100%, if inside 0.05–0.95. */
  full: number | null
}

function useKept(ctx: HudCtx): Kept | null {
  const pd = ctx.data.proc
  const gd = ctx.data.grid
  return useMemo(() => {
    if (!pd || !gd || !pd.data.length || !gd.data.length) return null
    const g = gd.data
    let solid = 0
    for (let i = 0; i < g.length; i++) {
      const v = g[i]
      if (v > 0) solid += v > 1 ? 1 : v
    }
    if (!(solid > 0)) return null
    // counts ≥ b / 1000, from a one-pass histogram
    const B = 1000
    const ge = new Float64Array(B + 2)
    const p = pd.data
    for (let i = 0; i < p.length; i++) {
      const v = p[i]
      if (v > 0) ge[v >= 1 ? B : Math.floor(v * B)]++
    }
    for (let b = B - 1; b >= 0; b--) ge[b] += ge[b + 1]
    const k = g.length / (p.length * solid)
    const at = (l: number) => ge[clamp(Math.ceil(l * B - 1e-6), 0, B + 1)] * k
    let full: number | null = null
    if (at(0.05) > 1) {
      for (let b = 51; b <= 950; b++) {
        if (ge[b] * k <= 1) {
          full = b / B
          break
        }
      }
    }
    return { at, full }
  }, [pd, gd])
}

const KEPT_AT = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]
const S_X0 = 16
const S_LEN = 220
const sx = (l: number) => S_X0 + ((l - 0.05) / 0.9) * S_LEN

export function N6DualScale({ ctx }: { ctx: HudCtx }) {
  const kept = useKept(ctx)
  const L = clamp(num(ctx.level, 0.5), 0.05, 0.95)
  const Le = useEased(L)
  const rx = sx(Le)
  const kNow = kept ? kept.at(L) : null
  return (
    <div className="qc">
      <div className="qc-art" style={{ width: 252, height: 92 }}>
        <span className="qc-abs" style={{ left: S_X0 - 6, top: 6 }}>
          <span className="qc-s" style={{ fontSize: 9.5 }}>Level </span>
          <span className="qc-m" style={{ fontSize: 9 }}>0.05</span>
        </span>
        <span className="qc-abs qc-m" style={{ left: S_X0 + S_LEN - 12, top: 6, fontSize: 9 }}>
          0.95
        </span>
        <div className="qc-abs" style={{ left: S_X0, top: 22, width: S_LEN + 1, height: 8, background: `repeating-linear-gradient(90deg, ${INK3} 0 1px, transparent 1px ${(S_LEN / 18).toFixed(3)}px)` }} />
        <div className="qc-abs qc-ink" style={{ left: S_X0, top: 30, width: S_LEN + 1, height: 1 }} />
        <div className="qc-abs qc-ink" style={{ left: S_X0, top: 62, width: S_LEN + 1, height: 1 }} />
        {KEPT_AT.map((l, i) => {
          const x = sx(l)
          return (
            <span key={l}>
              <span className="qc-abs qc-ink" style={{ left: n1(x) + 'px', top: 62, width: 1, height: 8 }} />
              {Math.abs(x - rx) > 17 && (
                <span className="qc-abs qc-m" style={{ left: n1(x) + 'px', top: 76, fontSize: 9, transform: 'translateX(-50%)' }}>
                  {kept ? pct(kept.at(l)) + (i === 0 ? '%' : '') : '—'}
                </span>
              )}
            </span>
          )
        })}
        {kept?.full != null && <span className="qc-abs" style={{ left: n1(sx(kept.full)) + 'px', top: 54, width: 0, height: 8, borderLeft: `1px dashed ${INK3}` }} />}
        <div className="qc-abs" style={{ left: n1(rx - 14) + 'px', top: 16, width: 28, height: 60 }}>
          <div className="qc-abs qc-runrail" style={{ left: 0, top: 0, bottom: 0, width: 2 }} />
          <div className="qc-abs qc-runrail" style={{ right: 0, top: 0, bottom: 0, width: 2 }} />
          <div className="qc-abs qc-runbar" style={{ left: 0, right: 0, top: 0, height: 8 }} />
          <div className="qc-abs qc-runbar" style={{ left: 0, right: 0, bottom: 0, height: 8 }} />
          <div className="qc-abs qc-ink" style={{ left: 13.5, top: 0, bottom: 0, width: 1 }} />
        </div>
        <span className="qc-abs qc-m qc-on" style={{ left: n1(rx) + 'px', top: 80, fontSize: 9.5, transform: 'translateX(-50%)' }}>
          {kNow != null ? pct(kNow) + '%' : '—'}
        </span>
      </div>
      <div className="qc-line">
        <span className="qc-k">Level</span>
        <span className="qc-v">{L.toFixed(2)}</span>
        <span className="qc-k" style={{ marginLeft: 8 }}>Kept</span>
        <span className="qc-v">{kNow != null ? pct(kNow) + '%' : '—'}</span>
        {!kept && <span className="qc-n">no result yet</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Trackball: the world sphere seen from the front, a little above; the dot marks the camera

/** The sheet draws the equator 69 × 20, i.e. the ball seen from about 17° up. */
const TB_SIN = 20 / 69
const TB_COS = Math.sqrt(1 - TB_SIN * TB_SIN)

export function Trackball({ ctx }: { ctx: HudCtx }) {
  const az = num(ctx.cam.az, 0)
  const el = clamp(num(ctx.cam.el, 0), -89.9, 89.9)
  const g = useMemo(() => {
    const R = 69
    const C = 70
    // screen x, screen y, depth toward the viewer
    const P = (x: number, y: number, z: number): [number, number, number] => [C + R * x, C - R * (z * TB_COS + y * TB_SIN), -y * TB_COS + z * TB_SIN]
    const a = az * RAD
    const e = el * RAD
    const hx = Math.sin(a)
    const hy = -Math.cos(a)
    let mer = ''
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * 2 * Math.PI
      const q = P(Math.cos(t) * hx, Math.cos(t) * hy, Math.sin(t))
      mer += (i ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1])
    }
    const dot = P(Math.cos(e) * hx, Math.cos(e) * hy, Math.sin(e))
    return {
      mer,
      lat: { cy: C - R * Math.sin(e) * TB_COS, rx: R * Math.cos(e), ry: R * Math.cos(e) * TB_SIN },
      dot,
    }
  }, [az, el])
  return (
    <div className="qc">
      <div className="qc-art" style={{ width: 170, height: 170 }}>
        <div className="qc-abs qc-bezel" style={{ inset: 0 }} />
        <div className="qc-abs qc-ball" style={{ left: 15, top: 15, width: 140, height: 140 }} />
        <svg className="qc-svg" width="140" height="140" viewBox="0 0 140 140" style={{ left: 15, top: 15 }}>
          <ellipse cx="70" cy="70" rx="69" ry="20" className="qc-k3" opacity=".75" />
          <ellipse cx="70" cy={n1(g.lat.cy)} rx={n1(g.lat.rx)} ry={n1(g.lat.ry)} className="qc-k3" opacity=".55" style={{ strokeWidth: 0.8 }} />
          <path d={g.mer} className="qc-k3" opacity=".75" />
          {g.dot[2] >= 0 ? (
            <circle cx={n1(g.dot[0])} cy={n1(g.dot[1])} r="3" className="qc-f1" />
          ) : (
            <circle cx={n1(g.dot[0])} cy={n1(g.dot[1])} r="2.6" className="qc-k1 qc-dot" />
          )}
        </svg>
      </div>
      <Line k="Camera" v={`az ${a3(az)} · el ${Math.round(el)}°`} />
    </div>
  )
}

// View camera from the top: station ring, frustum, near plane --------------------------------

const T_CX = 140
const T_CY = 86
const T_RX = 104
const T_RY = 40

function CamObject({ x, y, rot, hood = true }: { x: number; y: number; rot: number; hood?: boolean }) {
  return (
    <div className="qc-cam" style={{ left: n1(x) + 'px', top: n1(y) + 'px', transform: `rotate(${n1(rot)}deg)` }}>
      {hood && <div className="qc-cam__hood" />}
      <div className="qc-cam__lens" />
    </div>
  )
}

const focalMm = (fov: number) => 12 / Math.tan((clamp(fov, 1, 170) / 2) * RAD)

export function CamTop({ ctx }: { ctx: HudCtx }) {
  const az = wrap360(num(ctx.cam.az, 0))
  const fov = num(ctx.cam.fov, 35)
  const aspect = ctx.h > 0 && ctx.w > 0 ? ctx.w / ctx.h : 1.6
  const g = useMemo(() => {
    // plan (u right, v toward the viewer, ring radius 1) → screen; az 0 is the front, 90 the right
    const S = (u: number, v: number): [number, number] => [T_CX + T_RX * u, T_CY + T_RY * v]
    const a = az * RAD
    const cs = S(Math.sin(a), Math.cos(a))
    const rot = Math.atan2(T_CY - cs[1], T_CX - cs[0]) / RAD
    // the lens, in front of the body, back in plan units
    const A: [number, number] = [cs[0] + 20 * Math.cos(rot * RAD), cs[1] + 20 * Math.sin(rot * RAD)]
    const au = (A[0] - T_CX) / T_RX
    const av = (A[1] - T_CY) / T_RY
    const dl = Math.hypot(au, av) || 1
    const du = -au / dl
    const dv = -av / dl
    const hh = Math.min(Math.atan(Math.tan((clamp(fov, 1, 170) / 2) * RAD) * aspect), 40 * RAD)
    const ray = (side: number, d: number): [number, number] => {
      const c = Math.cos(side * hh)
      const s = Math.sin(side * hh)
      const L = d / Math.cos(hh)
      return S(au + (du * c - dv * s) * L, av + (du * s + dv * c) * L)
    }
    const far = dl + 0.12
    const f1 = ray(-1, far)
    const f2 = ray(1, far)
    const m1 = ray(-1, far * 0.36)
    const m2 = ray(1, far * 0.36)
    const st = Array.from({ length: 12 }, (_, i) => {
      const t = i * 30
      const p = S(Math.sin(t * RAD), Math.cos(t * RAD))
      return { i, p, show: Math.abs(dArc(az, t)) >= 12, swept: t < az - 1e-6 }
    })
    return { cs, rot, A, frustum: `${n1(A[0])},${n1(A[1])} ${n1(f1[0])},${n1(f1[1])} ${n1(f2[0])},${n1(f2[1])}`, near: [m1, m2], st, hfov: (2 * hh) / RAD }
  }, [az, fov, aspect])
  const cam = (Math.round(az / 30) % 12) + 1
  return (
    <div className="qc">
      <div className="qc-art" style={{ width: 260, height: 160 }}>
        <svg className="qc-svg" width="260" height="160" viewBox="0 0 260 160">
          <ellipse cx={T_CX} cy={T_CY} rx={T_RX} ry={T_RY} className="qc-k3" />
          {g.st.map((s) =>
            s.show ? <circle key={s.i} cx={n1(s.p[0])} cy={n1(s.p[1])} r="2" className={'qc-k3' + (s.swept ? ' qc-f3' : '')} /> : null,
          )}
          <polygon points={g.frustum} className="qc-k3 qc-fv" />
          <line x1={n1(g.near[0][0])} y1={n1(g.near[0][1])} x2={n1(g.near[1][0])} y2={n1(g.near[1][1])} className="qc-k3" />
          <path d={`M${T_CX - 6} ${T_CY}H${T_CX + 6}M${T_CX} ${T_CY - 6}V${T_CY + 6}`} className="qc-k1" />
          <text x="14" y="18">
            <tspan className="qc-ts qc-t1">Cam </tspan>
            <tspan className="qc-tm qc-t1">{String(cam).padStart(2, '0') + ' · ' + Math.round(focalMm(fov)) + ' mm'}</tspan>
          </text>
        </svg>
        <CamObject x={g.cs[0]} y={g.cs[1]} rot={g.rot} />
      </div>
      <Line k="From the top" v={`az ${a3(az)} · hfov ${Math.round(g.hfov)}°`} />
    </div>
  )
}

// View camera from the side: elevation arc over the build floor --------------------------------

const S_O: [number, number] = [130, 130]
const S_R = 90
const sidePt = (deg: number, r = S_R): [number, number] => [S_O[0] - r * Math.cos(deg * RAD), S_O[1] - r * Math.sin(deg * RAD)]

export function CamSide({ ctx }: { ctx: HudCtx }) {
  const el = num(ctx.cam.el, 0)
  const e = clamp(el, -30, 90)
  const fov = num(ctx.cam.fov, 35)
  const cs = sidePt(e)
  const A: [number, number] = [cs[0] + 15 * Math.cos(e * RAD), cs[1] + 15 * Math.sin(e * RAD)]
  const h = (clamp(fov, 1, 120) / 2) * RAD
  const ray = (s: number) => {
    const t = e * RAD + s * h
    return `M${n1(A[0])} ${n1(A[1])}L${n1(A[0] + 76 * Math.cos(t))} ${n1(A[1] + 76 * Math.sin(t))}`
  }
  const ea = sidePt(e, 30)
  const elArc = Math.abs(e) > 0.5 ? `M100 130A30 30 0 0 ${e > 0 ? 1 : 0} ${n1(ea[0])} ${n1(ea[1])}` : ''
  const below = e < 0 ? `M40 130A90 90 0 0 0 ${n1(cs[0])} ${n1(cs[1])}` : ''
  return (
    <div className="qc">
      <div className="qc-art" style={{ width: 240, height: 160 }}>
        <svg className="qc-svg" width="240" height="160" viewBox="0 0 240 160">
          <line x1="10" y1="130" x2="230" y2="130" className="qc-k4" />
          <path d="M40 130A90 90 0 0 1 130 40" className="qc-k3 qc-dash" />
          {below && <path d={below} className="qc-k3 qc-dot" />}
          {[30, 60, 90].map((d) => {
            const p = sidePt(d)
            return <circle key={d} cx={n1(p[0])} cy={n1(p[1])} r="1.8" className="qc-f3" />
          })}
          <path d={ray(-1) + ray(1)} className="qc-k3" />
          {elArc && <path d={elArc} className="qc-k1" />}
          <text x="96" y={e < 0 ? 120 : 146} textAnchor="end" className="qc-tm qc-t1">{`el ${Math.round(el)}°`}</text>
          <path d="M124 130H136M130 124V136" className="qc-k1" />
          <text x="124" y="34" className="qc-tm qc-tm9">90</text>
          <text x="22" y="134" className="qc-tm qc-tm9">0</text>
        </svg>
        <CamObject x={cs[0]} y={cs[1]} rot={e} hood={false} />
      </div>
      <Line k="From the side" v={`el ${Math.round(el)}° · dist ${num(ctx.cam.dist, 0).toFixed(2)}`} />
    </div>
  )
}
