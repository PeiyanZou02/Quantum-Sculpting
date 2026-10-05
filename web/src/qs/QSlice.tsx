import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react'
import { section, solidPerLayer } from './grid'
import type { Axis, Grid } from './grid'

export type QSliceLayout = 'compact' | 'inspector' | 'wide'

export interface QSliceProps {
  grid: Grid | null
  axis: Axis
  index: number
  onAxis: (a: Axis) => void
  onIndex: (i: number) => void
  /** compact 260 × 156 (diagram only), inspector 344 wide, wide 1100 wide. Default compact. */
  layout?: QSliceLayout
  /** Solid threshold. Default .5. */
  level?: number
  /** Millimetres per cell for the Layer readout. Default 3.2. */
  voxelMm?: number
  /** Section label in the inspector header. Default 'Slice'. */
  title?: string
  /** Source tag, e.g. 'input' or 'processed'. 'processed' shades cells by value instead of thresholding. */
  tag?: string
}

const INK = '#151618'
const INK2 = '#55575D'
const INK3 = '#8B8D93'
const INK4 = '#B3B5BB'
const BG = '#E3E4E7'
const CTL = 'rgba(21,22,24,.26)'
const SEL = '#CBCCD0'
const DOT = '#C4C6CB'
const MONO = "var(--qs-mono, 'TWK Everett Mono', monospace)"

const FLASH_MS = 240
const M = 300 // section map size
const KX = 0.433
const KY = 0.25
const LAYOUTS: Record<QSliceLayout, [number, number, number, number, number]> = {
  // W, H, px per cell at 32³, origin x, origin y
  compact: [260, 156, 2.9, 34, 132],
  inspector: [344, 220, 4.4, 30, 200],
  wide: [440, 320, 6, 40, 292],
}

type V2 = [number, number]
type V3 = [number, number, number]

const n1 = (v: number) => v.toFixed(1)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const fmt = (n: number) => n.toLocaleString('en-US')
const poly = (q: V2[]) => 'M' + q.map((t) => n1(t[0]) + ' ' + n1(t[1])).join('L') + 'Z'

/**
 * Fill the cells of a section into `ctx` (already transformed so a cell is the unit square at (a, b)).
 * Binary: cells ≥ level at full alpha. Shaded: alpha follows the value, quantised to 16 steps,
 * each step as one path so adjacent cells don't seam.
 */
function fillSection(ctx: CanvasRenderingContext2D, sec: Float32Array, n: number, level: number, shaded: boolean, color: string, alpha: number) {
  ctx.fillStyle = color
  if (!shaded) {
    const p = new Path2D()
    let any = false
    for (let b = 0; b < n; b++)
      for (let a = 0; a < n; a++)
        if (sec[b * n + a] >= level) {
          p.rect(a, b, 1, 1)
          any = true
        }
    if (any) {
      ctx.globalAlpha = alpha
      ctx.fill(p)
    }
  } else {
    const S = 16
    const paths: (Path2D | null)[] = new Array(S + 1).fill(null)
    for (let b = 0; b < n; b++)
      for (let a = 0; a < n; a++) {
        const q = Math.round(clamp(sec[b * n + a], 0, 1) * S)
        if (!q) continue
        ;(paths[q] ??= new Path2D()).rect(a, b, 1, 1)
      }
    paths.forEach((p, q) => {
      if (!p) return
      ctx.globalAlpha = (alpha * q) / S
      ctx.fill(p)
    })
  }
  ctx.globalAlpha = 1
}

/** Size a canvas to css W × H at device pixel ratio and return a cleared context, or null. */
function prep(c: HTMLCanvasElement | null, w: number, h: number) {
  if (!c) return null
  const dpr = window.devicePixelRatio || 1
  const pw = Math.round(w * dpr)
  const ph = Math.round(h * dpr)
  if (c.width !== pw) c.width = pw
  if (c.height !== ph) c.height = ph
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, pw, ph)
  return { ctx, dpr }
}

const abs: CSSProperties = { position: 'absolute', left: 0, top: 0 }
const mono10: CSSProperties = { font: `400 10px/1 ${MONO}`, whiteSpace: 'nowrap' }

/** QSlice, the slice plane and index, drawn from a real voxel grid. Controlled axis and index. */
export function QSlice({
  grid,
  axis: ax,
  index,
  onAxis,
  onIndex,
  layout = 'compact',
  level = 0.5,
  voxelMm = 3.2,
  title = 'Slice',
  tag,
}: QSliceProps) {
  const N = grid?.n ?? 32
  const has = grid != null
  const shaded = tag === 'processed'
  const k = clamp(Math.round(index), 0, N - 1)

  const [hkRaw, setHk] = useState<number | null>(null)
  const [drag, setDrag] = useState<number | null>(null) // pointer id while held
  const [flash, setFlash] = useState(false)
  const [mc, setMc] = useState<{ a: number; b: number } | null>(null)
  const ft = useRef(0)
  useEffect(() => () => clearTimeout(ft.current), [])

  const hk = hkRaw == null || !has ? null : clamp(hkRaw, 0, N - 1)
  const gOn = hk != null && hk !== k
  const dragging = drag != null

  // ---- data ----
  const counts = useMemo(() => (grid ? solidPerLayer(grid, ax, level) : new Array<number>(N).fill(0)), [grid, ax, level, N])
  const tot = useMemo(() => counts.reduce((s, v) => s + v, 0), [counts])
  const mx = Math.max(1, ...counts)
  const secK = useMemo(() => (grid ? section(grid, ax, k) : null), [grid, ax, k])
  const mk = gOn ? hk : k
  const secM = useMemo(() => (grid ? (mk === k ? secK : section(grid, ax, mk)) : null), [grid, ax, mk, k, secK])

  // ---- cabinet projection ----
  const [W, H, u32, ox, oy] = LAYOUTS[layout] ?? LAYOUTS.compact
  const u = (u32 * 32) / N
  const { P, p3 } = useMemo(() => {
    const P = (i: number, j: number, kk: number): V2 => [ox + u * (i + j * KX), oy - u * (kk + j * KY)]
    const p3 = (a: number, b: number, L: number): V2 => (ax === 'z' ? P(a, b, L) : ax === 'x' ? P(L, a, b) : P(a, L, b))
    return { P, p3 }
  }, [u, ox, oy, ax])
  const quad = (L: number) => poly(([[0, 0], [N, 0], [N, N], [0, N]] as V2[]).map(([a, b]) => p3(a, b, L)))

  let hid = ''
  let vis = ''
  {
    const C8: V3[] = []
    for (const z of [0, N]) for (const j of [0, N]) for (const i of [0, N]) C8.push([i, j, z])
    for (let a = 0; a < 8; a++)
      for (let b = a + 1; b < 8; b++) {
        const A = C8[a]
        const B = C8[b]
        if (A.filter((x, t) => x !== B[t]).length !== 1) continue
        const pa = P(...A)
        const pb = P(...B)
        const sgm = `M${n1(pa[0])} ${n1(pa[1])}L${n1(pb[0])} ${n1(pb[1])}`
        if ([A, B].some((q) => q[0] === 0 && q[1] === N && q[2] === 0)) hid += sgm
        else vis += sgm
      }
  }

  const RB: (t: number) => V3 = ax === 'z' ? (t) => [N, N, t] : ax === 'x' ? (t) => [t, 0, 0] : (t) => [N, t, 0]
  const OF: V2 = ax === 'z' ? [14, 0] : ax === 'x' ? [0, 14] : [12, 7]
  const TD: V2 = ax === 'z' ? [1, 0] : ax === 'x' ? [0, 1] : [0.5, 0.87]
  const Rr = (t: number): V2 => {
    const q = P(...RB(t))
    return [q[0] + OF[0], q[1] + OF[1]]
  }
  const r0 = Rr(0)
  const r1 = Rr(N)
  // 16 intervals along the rail whatever n is: every 2 / 8 cells at 32³.
  const rt = Array.from({ length: 17 }, (_, i) => {
    const q = Rr((i * N) / 16)
    const mj = i % 4 === 0
    const L = mj ? 6 : 3
    return { x1: n1(q[0]), y1: n1(q[1]), x2: n1(q[0] + TD[0] * L), y2: n1(q[1] + TD[1] * L), c: mj ? INK3 : INK4 }
  })
  const near = (2 * N) / 32
  const labelTs = layout === 'compact' ? [0, N - 1] : [0, Math.round(N / 4), Math.round(N / 2), Math.round((3 * N) / 4), N - 1]
  const rl = labelTs
    .filter((t) => Math.abs(t - k) > near && !(gOn && Math.abs(t - (hk as number)) <= near))
    .map((t) => {
      const q = Rr(t + 0.5)
      return ax === 'x'
        ? { x: q[0], y: q[1] + 9, t: String(t), tr: 'translate(-50%,0)' }
        : { x: q[0] + TD[0] * 10, y: q[1] + TD[1] * 10, t: String(t), tr: 'translate(0,-50%)' }
    })
  const A0 = P(...RB(k + 0.5))
  const T0 = Rr(k + 0.5)
  const tab = (c: number): V2 => {
    const q = Rr(c + 0.5)
    return [q[0] + TD[0] * 9, q[1] + TD[1] * 9]
  }
  const TT = tab(k)
  const GT = gOn ? tab(hk as number) : null
  const ttr = ax === 'z' ? 'translate(0,-50%)' : ax === 'x' ? 'translate(-50%,0)' : 'translate(0,-20%)'

  const toIdx = (e: RPointerEvent<HTMLElement>) => {
    const rc = e.currentTarget.getBoundingClientRect()
    const sc = W / (rc.width || W)
    const mxp = (e.clientX - rc.left) * sc
    const myp = (e.clientY - rc.top) * sc
    const dx = r1[0] - r0[0]
    const dy = r1[1] - r0[1]
    return clamp(Math.round((((mxp - r0[0]) * dx + (myp - r0[1]) * dy) / (dx * dx + dy * dy)) * N - 0.5), 0, N - 1)
  }

  // ---- canvases ----
  const cubeCv = useRef<HTMLCanvasElement>(null)
  const mapCv = useRef<HTMLCanvasElement>(null)
  const showMap = layout !== 'compact'

  useLayoutEffect(() => {
    const r = prep(cubeCv.current, W, H)
    if (!r || !secK) return
    const { ctx, dpr } = r
    const L = k + 0.5
    const O = p3(0, 0, L)
    const ea = p3(1, 0, L)
    const eb = p3(0, 1, L)
    ctx.setTransform(dpr * (ea[0] - O[0]), dpr * (ea[1] - O[1]), dpr * (eb[0] - O[0]), dpr * (eb[1] - O[1]), dpr * O[0], dpr * O[1])
    fillSection(ctx, secK, N, level, shaded, INK, 0.82)
  }, [secK, N, level, shaded, W, H, p3, k])

  const sc = M / N
  useLayoutEffect(() => {
    if (!showMap) return
    const r = prep(mapCv.current, M, M)
    if (!r || !secM) return
    const { ctx, dpr } = r
    // Cell (a, b) at x = a·sc, y = (N − 1 − b)·sc: v runs up.
    ctx.setTransform(dpr * sc, 0, 0, -dpr * sc, 0, dpr * M)
    fillSection(ctx, secM, N, level, shaded, gOn ? INK3 : INK2, 1)
  }, [showMap, secM, N, level, shaded, gOn, sc])

  // ---- handlers ----
  const dDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!has || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const i = toIdx(e)
    setDrag(e.pointerId)
    setHk(i)
    if (i !== k) onIndex(i)
  }
  const dMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!has) return
    const i = toIdx(e)
    if (dragging) {
      if (e.pointerId !== drag) return
      if (i !== k) onIndex(i)
    }
    if (i !== hkRaw) setHk(i)
  }
  const dUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dragging || e.pointerId !== drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
    setFlash(true)
    clearTimeout(ft.current)
    ft.current = window.setTimeout(() => setFlash(false), FLASH_MS)
  }
  const dLeave = () => {
    if (!dragging) setHk(null)
  }

  const mMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!has) return
    const rc = e.currentTarget.getBoundingClientRect()
    const q = M / (rc.width || M)
    const a = clamp(Math.floor(((e.clientX - rc.left) * q) / sc), 0, N - 1)
    const b = clamp(N - 1 - Math.floor(((e.clientY - rc.top) * q) / sc), 0, N - 1)
    if (!mc || mc.a !== a || mc.b !== b) setMc({ a, b })
  }

  const AX = ax.toUpperCase()
  const coord = (c: number, a: number, b: number) =>
    ax === 'z' ? `x ${a} · y ${b} · z ${c}` : ax === 'x' ? `x ${c} · y ${a} · z ${b}` : `x ${a} · y ${c} · z ${b}`
  let mRead = has ? 'Hover the section to read a cell' : 'No grid loaded'
  if (mc && secM) {
    const v = secM[mc.b * N + mc.a]
    mRead = `${coord(mk, mc.a, mc.b)} · ${shaded ? v.toFixed(2) + ' · ' : ''}${v >= level ? 'solid' : 'empty'}`
  }

  const cn = counts[k] ?? 0
  const rows: [string, string][] = has
    ? [
        ['Axis', AX],
        ['Index', `${k} / ${N - 1}`],
        ['Position', `${(k * voxelMm).toFixed(1)} mm`],
        ['Solid', `${fmt(cn)} cells`],
        ['Area', `${((cn * voxelMm * voxelMm) / 100).toFixed(1)} cm²`],
        ['Share', `${(tot ? (cn / tot) * 100 : 0).toFixed(1)}% of solid`],
      ]
    : [
        ['Axis', AX],
        ['Index', '—'],
        ['Position', '—'],
        ['Solid', '—'],
        ['Area', '—'],
        ['Share', '—'],
      ]

  const SW = layout === 'wide' ? 300 : 344
  const wide = layout === 'wide'

  // ---- sparkline geometry ----
  const gap = N <= 64 ? 2 : N <= 128 ? 1 : 0
  const bw = (SW - gap * (N - 1)) / N
  const barAt = (e: { clientX: number; currentTarget: SVGSVGElement }) => {
    const rc = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rc.left) * SW) / (rc.width || SW)
    return clamp(Math.floor((x * N) / (SW + gap)), 0, N - 1)
  }

  const diagram = (
    <div
      onPointerDown={dDown}
      onPointerMove={dMove}
      onPointerUp={dUp}
      onPointerCancel={dUp}
      onPointerLeave={dLeave}
      style={{
        order: wide ? 1 : 2,
        position: 'relative',
        flex: 'none',
        width: W,
        height: H,
        cursor: !has ? 'default' : dragging ? 'grabbing' : 'ns-resize',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ ...abs, overflow: 'visible' }}>
        <path d={hid} fill="none" stroke={INK4} strokeWidth="1" strokeDasharray="2 3" />
        {gOn && <path d={quad((hk as number) + 0.5)} fill="none" stroke={INK2} strokeWidth="1" strokeDasharray="3 3" />}
        <path
          d={quad(k + 0.5)}
          fill={flash ? 'rgba(21,22,24,.14)' : 'rgba(21,22,24,.05)'}
          stroke={has ? INK : INK4}
          strokeWidth="1"
          strokeDasharray={has ? undefined : '2 3'}
        />
      </svg>
      <canvas ref={cubeCv} style={{ ...abs, width: W, height: H, pointerEvents: 'none' }} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ ...abs, overflow: 'visible', pointerEvents: 'none' }}>
        <path d={vis} fill="none" stroke={INK3} strokeWidth="1" />
        <path d={`M${n1(A0[0])} ${n1(A0[1])}L${n1(T0[0])} ${n1(T0[1])}`} fill="none" stroke={has ? INK : INK4} strokeWidth="1" />
        <path d={`M${n1(r0[0])} ${n1(r0[1])}L${n1(r1[0])} ${n1(r1[1])}`} fill="none" stroke={INK3} strokeWidth="1" />
        {rt.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.c} strokeWidth="1" />
        ))}
      </svg>
      {rl.map((l) => (
        <span
          key={l.t}
          style={{ position: 'absolute', left: +n1(l.x), top: +n1(l.y), transform: l.tr, font: `400 9px/1 ${MONO}`, color: INK3, whiteSpace: 'nowrap', pointerEvents: 'none' }}
        >
          {l.t}
        </span>
      ))}
      {GT && (
        <span style={{ ...tabStyle, left: +n1(GT[0]), top: +n1(GT[1]), transform: ttr, border: `1px dashed ${INK2}`, color: INK2 }}>
          {`${ax} ${hk} · ${fmt(counts[hk as number] ?? 0)}`}
        </span>
      )}
      <span
        style={{
          ...tabStyle,
          left: +n1(TT[0]),
          top: +n1(TT[1]),
          transform: ttr,
          border: `1px ${has ? 'solid' : 'dashed'} ${has ? INK : INK4}`,
          background: dragging ? INK : BG,
          color: !has ? INK4 : dragging ? BG : INK,
        }}
      >
        {has ? `${ax} ${k}` : `${ax} —`}
      </span>
    </div>
  )

  const mapCorners = `M0 14V0H14M${M - 14} 0H${M}V14M${M} ${M - 14}V${M}H${M - 14}M14 ${M}H0V${M - 14}`
  let mGrid = ''
  for (const t of [N / 4, N / 2, (3 * N) / 4]) mGrid += `M${n1(t * sc)} 0V${M}M0 ${n1(t * sc)}H${M}`

  const map = showMap && (
    <div style={{ order: wide ? 2 : 1, display: 'flex', flexDirection: 'column', gap: 10, width: M }}>
      <div onPointerMove={mMove} onPointerLeave={() => setMc(null)} style={{ position: 'relative', width: M, height: M, cursor: has ? 'crosshair' : 'default' }}>
        <svg width={M} height={M} viewBox={`0 0 ${M} ${M}`} style={abs}>
          <path d={mGrid} fill="none" stroke="rgba(21,22,24,.1)" strokeWidth="1" />
        </svg>
        <canvas ref={mapCv} style={{ ...abs, width: M, height: M, pointerEvents: 'none' }} />
        <svg width={M} height={M} viewBox={`0 0 ${M} ${M}`} style={{ ...abs, pointerEvents: 'none' }}>
          <path d={mapCorners} fill="none" stroke={has ? INK : INK4} strokeWidth="1" />
          {mc && (
            <>
              <path
                d={`M0 ${n1((N - 0.5 - mc.b) * sc)}H${M}M${n1((mc.a + 0.5) * sc)} 0V${M}`}
                fill="none"
                stroke={INK3}
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <rect x={n1(mc.a * sc)} y={n1((N - 1 - mc.b) * sc)} width={n1(sc)} height={n1(sc)} fill="none" stroke={INK} strokeWidth="1.5" />
            </>
          )}
        </svg>
        <span style={{ ...mono10, position: 'absolute', left: 10, top: 10, color: !has ? INK4 : gOn ? INK3 : INK }}>
          {!has ? 'no grid' : gOn ? `${ax} ${hk} · preview` : `${ax} ${k}`}
        </span>
        <span style={{ ...mono10, position: 'absolute', right: 10, bottom: 10, color: INK3 }}>{ax === 'x' ? 'y' : 'x'} →</span>
        <span style={{ ...mono10, position: 'absolute', left: 10, bottom: 10, color: INK3 }}>↑ {ax === 'z' ? 'y' : 'z'}</span>
      </div>
      <span style={{ height: 11, font: `400 11px/1 ${MONO}`, color: has ? INK2 : INK4, whiteSpace: 'nowrap' }}>{mRead}</span>
    </div>
  )

  const side = showMap && (
    <div style={{ order: 3, display: 'flex', flexDirection: 'column', gap: 18, width: SW }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ font: `400 11px/1 ${MONO}`, color: INK3 }}>Axis</span>
        <div style={{ display: 'inline-flex', padding: 2, borderRadius: 0, border: `1px solid ${CTL}` }}>
          {(['x', 'y', 'z'] as Axis[]).map((a) => {
            const on = a === ax
            return (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setHk(null)
                  setMc(null)
                  if (!on) onAxis(a)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 22,
                  padding: '0 10px',
                  margin: 0,
                  borderRadius: 0,
                  border: `1px solid ${on ? INK : 'transparent'}`,
                  background: on ? SEL : 'transparent',
                  color: on ? INK : INK2,
                  font: `400 11px/1 ${MONO}`,
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  transition: 'color 150ms, border-color 150ms, background-color 150ms',
                }}
              >
                {a.toUpperCase()}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ ...mono10, display: 'flex', justifyContent: 'space-between', color: INK3 }}>
          <span>Solid cells per layer</span>
          <span>max {has ? fmt(Math.max(0, ...counts)) : '—'}</span>
        </div>
        <div style={{ height: 44, borderBottom: `1px solid ${INK4}` }}>
          <svg
            width={SW}
            height={43}
            viewBox={`0 0 ${SW} 43`}
            style={{ display: 'block', cursor: has ? 'pointer' : 'default' }}
            onPointerMove={(e) => {
              if (!has) return
              const c = barAt(e)
              if (c !== hkRaw) setHk(c)
            }}
            onPointerLeave={() => setHk(null)}
            onClick={(e) => {
              if (!has) return
              const c = barAt(e)
              if (c !== k) onIndex(c)
            }}
          >
            {counts.map((n, c) => {
              const h = has ? Math.max(1, Math.round((n / mx) * 42)) : 1
              const fill = !has ? INK4 : c === k ? INK : gOn && c === hk ? INK3 : DOT
              return <rect key={c} x={c * (bw + gap)} y={43 - h} width={bw} height={h} fill={fill} shapeRendering="crispEdges" />
            })}
          </svg>
        </div>
        <div style={{ ...mono10, display: 'flex', justifyContent: 'space-between', color: INK3 }}>
          <span>{AX} 0</span>
          <span>{N - 1}</span>
        </div>
      </div>
      <LayerReadout rows={rows} w={SW} />
    </div>
  )

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 24,
        alignItems: 'flex-start',
        maxWidth: wide ? 1100 : W,
        color: INK,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {layout === 'inspector' && (
        <div style={{ order: 0, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ font: '600 11.5px/1 var(--qs-sans)' }}>{title}</span>
          <span style={{ font: `400 11px/1 ${MONO}`, color: INK3 }}>
            {has ? `${tag ?? 'input'} · ${ax} ${k} of ${N - 1}` : `${tag ?? 'input'} · no grid`}
          </span>
        </div>
      )}
      {map}
      {diagram}
      {side}
    </div>
  )
}

const tabStyle: CSSProperties = {
  position: 'absolute',
  display: 'inline-flex',
  alignItems: 'center',
  height: 18,
  padding: '0 7px',
  borderRadius: 0,
  font: `400 10px/1 ${MONO}`,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  pointerEvents: 'none',
}

/** QReadout, grid form: title "Layer", kw 80. */
function LayerReadout({ rows, w }: { rows: [string, string][]; w: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: w }}>
      <span style={{ font: '600 11.5px/1 var(--qs-sans)', color: INK }}>Layer</span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '80px minmax(0,1fr) auto',
          columnGap: 14,
          rowGap: 4,
          font: `400 10px/1.3 ${MONO}`,
          fontVariantNumeric: 'tabular-nums',
          color: INK,
        }}
      >
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <span>{k}</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
            <span />
          </div>
        ))}
      </div>
    </div>
  )
}
