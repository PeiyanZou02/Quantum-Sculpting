// Quantum glyphs (design/handoff/QLGlyphs4.dc.html, "07 Quantum glyphs"): what happens behind the
// scenes, in the same pills and hairlines, fed from the live context. Maths follows app/emulator.py:
// each axis is Gray-coded onto qubits; qubit k turns by θ_k = π·strength·((1−reach)·2^−k + reach),
// once per letter of the style, and mixes cells 2^(k+1) apart. Display only, except the gray pairing
// (pick a qubit) and the pulse schedule with its playhead, which keep their own state and change nothing.
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react'
import type { GridInfo } from '../api'
import type { FamilyDef, HudCtx, Vec3 } from './types'
import './glyphs.css'

// ── maths and small helpers ─────────────────────────────────────────────────────────────────────

const AX = ['X', 'Y', 'Z'] as const
/** When this page loaded: the start of the session for the usage counts. */
const T0 = Date.now()
const BUDGET = 50 // Atlas jobs; the app has no budget setting yet, so the sheet's figure stands in
const PARALLEL = 3 // app/server.py ATLAS_PARALLEL
const LIMIT_BITS = 16 // app/server.py DEFAULT_BITS: 65,536 values (about 2 MB) per Atlas job

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const int = (v: number) => Math.round(v).toLocaleString('en-US')
const f2 = (v: number) => v.toFixed(2)
const weight = (k: number, reach: number) => (1 - reach) * 2 ** -k + reach
/** θ_k in units of π. */
const thetaPi = (k: number, strength: number, reach: number) => strength * weight(k, reach)
const gray = (i: number) => i ^ (i >> 1)
const styleOf = (s: string) => (/^[xy]+$/.test(s) ? s : 'x')
const gatesOf = (s: string) => styleOf(s).split('').map((L) => 'R' + L).join(' ')
const bitsFor = (len: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, len))))
/** Qubits per axis as the HUD contract has them: the emulator's register covers at most 32 cells. */
const perAxis = (n: number) => bitsFor(Math.min(n, 32))
const dur = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`)
const short = (v: number) => (v >= 1024 ? `${v / 1024}k` : String(v))

/** One rotation on qubit k of a state vector (re, im), as in app/emulator.py (x → Rx, y → Ry). */
function rotate(re: Float64Array, im: Float64Array, k: number, L: string, a: number) {
  const c = Math.cos(a / 2), s = Math.sin(a / 2), m = 1 << k
  for (let b = 0; b < re.length; b++) {
    if (b & m) continue
    const b1 = b | m, ar = re[b], ai = im[b], br = re[b1], bi = im[b1]
    if (L === 'x') { re[b] = c * ar + s * bi; im[b] = c * ai - s * br; re[b1] = s * ai + c * br; im[b1] = -s * ar + c * bi }
    else { re[b] = c * ar - s * br; im[b] = c * ai - s * bi; re[b1] = s * ar + c * br; im[b1] = s * ai + c * bi }
  }
}
/** Share of a cell's amplitude that one qubit's gates move to its partner. */
function moved(style: string, a: number) {
  const re = new Float64Array(2), im = new Float64Array(2)
  re[0] = 1
  for (const L of style) rotate(re, im, 0, L, a)
  return re[1] ** 2 + im[1] ** 2
}
/** One line of cells blurred alone: values → amplitudes, Gray-coded onto b qubits, rotated, read out. */
function blurLine(inp: number[], b: number, strength: number, reach: number, style: string): number[] {
  const N = 2 ** b, tot = inp.reduce((a, v) => a + Math.max(0, v), 0)
  if (tot <= 0) return inp.map(() => 0)
  const re = new Float64Array(N), im = new Float64Array(N)
  inp.forEach((v, i) => { re[gray(i)] = Math.sqrt(Math.max(0, v) / tot) })
  for (let k = 0; k < b; k++) for (const L of style) rotate(re, im, k, L, Math.PI * thetaPi(k, strength, reach))
  return inp.map((_, i) => (re[gray(i)] ** 2 + im[gray(i)] ** 2) * tot)
}

/** Edge lengths of one Atlas tile (the whole grid when it fits), from the service's tile summary. */
function tileOf(ctx: HudCtx): [number, number, number] {
  const n = Math.max(2, ctx.grid?.n ?? ctx.n)
  const s = ctx.grid?.tiles?.[ctx.q.tiling as keyof GridInfo['tiles']]?.shape
  if (s && s.length === 3 && s.every((v) => v > 0)) return [s[0], s[1], s[2]]
  const e = Math.min(n, 2 ** perAxis(n))
  return [e, e, e]
}
/** app/tiling.py tile_shape: power-of-two tiles of at most 2^bits values. */
function tileShape(n: number, mode: string, bits = LIMIT_BITS): [number, number, number] {
  const nb = Math.round(Math.log2(n))
  if (3 * nb <= bits) return [n, n, n]
  let bx: number, by: number, bz: number
  if (mode === 'layers') {
    bx = Math.min(nb, (bits + 1) >> 1)
    by = Math.min(nb, bits - bx)
    bz = Math.min(nb, bits - bx - by)
  } else {
    const base = Math.floor(bits / 3), extra = bits % 3
    bz = Math.min(nb, base + (extra >= 1 ? 1 : 0))
    by = Math.min(nb, base + (extra >= 2 ? 1 : 0))
    bx = Math.min(nb, base)
  }
  return [2 ** bx, 2 ** by, 2 ** bz]
}

/** The probed cell: under the probe, else the newest pin. */
function probed(ctx: HudCtx): { cell: Vec3; from: string } | null {
  if (ctx.hover) return { cell: ctx.hover.cell, from: 'probe' }
  const p = ctx.pins[ctx.pins.length - 1]
  return p ? { cell: p.cell, from: `pin ${p.n}` } : null
}

interface Net { t: number; path: string; status: string; ms: number }
const NET_RE = /^([A-Z]+)\s+(\S+)\s+(\S+)\s+(?:·\s*)?([\d.]+)\s*ms/
/** Requests from the runtime log ("GET  /api/state  200  26 ms"), oldest first. */
function useNet(log: HudCtx['log']): Net[] {
  return useMemo(() => {
    const out: Net[] = []
    for (const l of log) {
      if (l.level !== 'net') continue
      const m = NET_RE.exec(l.text)
      if (m) out.push({ t: l.t, path: m[2], status: m[3], ms: Number(m[4]) })
    }
    return out
  }, [log])
}

function useNow(every: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(id)
  }, [every])
  return now
}

function Head({ t, v, note }: { t: string; v?: ReactNode; note?: ReactNode }) {
  return (
    <div className="qg-head">
      <span><span className="qg-t">{t}</span>{v}</span>
      {note != null && <span className="qg-note">{note}</span>}
    </div>
  )
}
const Num = ({ children, c }: { children: ReactNode; c?: 1 | 2 | 3 | 4 }) => <span className={'qg-m' + (c ? ' qg-c' + c : '')}>{children}</span>
const Word = ({ children, c }: { children: ReactNode; c?: 1 | 2 | 3 | 4 }) => <span className={'qg-w' + (c ? ' qg-c' + c : '')}>{children}</span>

// ── Backend path ────────────────────────────────────────────────────────────────────────────────

type HopState = 'done' | 'cur' | 'todo'
interface Hop { t: string; d?: ReactNode; ms: string; state: HopState }
const LOCAL_ENGINE: Record<string, string> = { emulator: 'Emulator', gaussian: 'Gaussian', nations: 'Evolve' }
const HEAVY = /\/api\/(process|mesh|voxel|upload|export|nations)/

/** The hops a job takes, as they ran this session. Hops a run skipped (remote ones for local engines
 *  or a cached result) are left out. The active hop is `cur`; the link after it flows. */
function backendPath(ctx: HudCtx, net: Net[]) {
  const job = ctx.job
  const run = job && job.status === 'running' ? job : null
  const mode = run ? 'atlas' : ctx.proc?.mode ?? ctx.q.mode
  const atlas = mode === 'atlas'
  const fromCache = atlas && !run && !!ctx.proc?.cached
  const remote = atlas && !fromCache
  const light = net.filter((e) => !HEAVY.test(e.path) && /^\d+$/.test(e.status)).slice(-12).map((e) => e.ms).sort((a, b) => a - b)
  const last = (re: RegExp) => { for (let i = net.length - 1; i >= 0; i--) if (re.test(net[i].path)) return net[i]; return null }
  const submit = last(/\/api\/process/), mesh = last(/\/api\/mesh/)
  const st = (run?.atlas_status ?? '').toLowerCase()
  const queued = !!run && /queue|pend|submit|wait/.test(st)
  const engineS = run ? run.elapsed : ctx.proc?.seconds
  const all: (Omit<Hop, 'state'> & { skip?: boolean })[] = [
    { t: 'Browser', ms: '0 ms' },
    { t: 'Flask', d: <span className="qg-pill__d">local</span>, ms: light.length ? dur(light[light.length >> 1]) : '—' },
    { t: 'Atlas API', ms: remote && submit ? dur(submit.ms) : '—', skip: !remote },
    { t: 'Queue', ms: queued ? 'waiting' : '—', skip: !remote },
    { t: atlas ? 'Blur Core' : LOCAL_ENGINE[mode] ?? mode, d: atlas ? undefined : <span className="qg-pill__d">local</span>, ms: engineS != null ? dur(engineS * 1000) : '—', skip: fromCache },
    { t: 'Result', ms: run ? `${run.tiles_done} / ${run.tiles_total}` : ctx.proc?.tiles ? `${ctx.proc.tiles.jobs} job${ctx.proc.tiles.jobs === 1 ? '' : 's'}` : '—', skip: !remote },
    { t: 'Cache', d: <span className="qg-pill__d qg-m">grids/</span>, ms: fromCache ? 'hit' : !run && ctx.proc && atlas ? 'saved' : '—', skip: !atlas },
    { t: 'Marching cubes', ms: !run && mesh ? dur(mesh.ms) : '—' },
  ]
  let cur = -1
  if (run) cur = queued ? 3 : run.tiles_done > 0 ? 5 : /run|process|start/.test(st) ? 4 : 2
  else if (ctx.busy) cur = 1
  // idle: every hop that ran is done (up to the cache without a mesh, all of them with one)
  const reached = cur >= 0 ? cur : ctx.report ? all.length : ctx.proc ? all.length - 1 : 0
  const hops: Hop[] = all
    .map((h, i) => ({ ...h, state: (i === cur ? 'cur' : i < reached ? 'done' : 'todo') as HopState }))
    .filter((_, i) => !all[i].skip)
  const id = run?.job_id ?? ctx.proc?.job_id ?? null
  const cap = run || remote
    ? `Up to ${PARALLEL} jobs run at once; the repo reports 6–13 s per job.`
    : fromCache ? 'Read from the cache in grids/; nothing was sent to Atlas.'
      : mode === 'emulator' ? 'Emulation runs on this machine and skips the remote hops.'
        : 'This run stays on this machine and skips the remote hops.'
  return { hops, id, mode, cap }
}

/** The link between two hops: flows after the active hop, ink between hops that ran, grey ahead. */
const linkCls = (a: Hop, b: Hop) => (a.state === 'cur' ? 'qg-k1 qg-flow' : a.state === 'done' && b.state !== 'todo' ? 'qg-k1' : 'qg-k4')

function HopPill({ h }: { h: Hop }) {
  return (
    <span className={'qg-pill qg-pill--' + h.state}>
      {h.t}
      {h.d}
      {h.state === 'cur' && <span className="qg-ping" />}
    </span>
  )
}

function pathTitle(id: string | null, mode: string) {
  return id
    ? <><Word c={2}>job</Word><span className="qg-tv">{id.slice(0, 4)}</span></>
    : <Word c={2}>{mode === 'emulator' ? 'emulation' : mode === 'nations' ? 'evolve' : mode}</Word>
}

function BackendPath({ ctx }: { ctx: HudCtx }) {
  const net = useNet(ctx.log)
  const { hops, id, mode, cap } = backendPath(ctx, net)
  return (
    <div className="qg">
      <Head t="Backend path" v={pathTitle(id, mode)} note="The dashed line moves on the active hop" />
      <div className="qg-path">
        {hops.map((h, i) => (
          <div key={h.t} className="qg-hop">
            <div className="qg-hop__col">
              <HopPill h={h} />
              <span className="qg-m qg-hop__ms">{h.ms}</span>
            </div>
            {i < hops.length - 1 && (
              <svg className="qg-svg" width={30} height={20} viewBox="0 0 30 20" aria-hidden>
                <line x1={3} y1={10} x2={27} y2={10} className={linkCls(h, hops[i + 1])} strokeWidth={1} strokeDasharray="3 5" />
              </svg>
            )}
          </div>
        ))}
      </div>
      <p className="qg-cap">{cap}</p>
    </div>
  )
}

function BackendStack({ ctx }: { ctx: HudCtx }) {
  const net = useNet(ctx.log)
  const { hops, id, mode } = backendPath(ctx, net)
  return (
    <div className="qg" style={{ width: 210 }}>
      <Head t="Backend path" v={pathTitle(id, mode)} />
      <div className="qg-vpath">
        {hops.map((h, i) => (
          <Fragment key={h.t}>
            <span><HopPill h={h} /></span>
            <span className="qg-m qg-c3">{h.ms}</span>
            {i < hops.length - 1 && (
              <>
                <svg className="qg-svg" width={24} height={9} viewBox="0 0 24 9" aria-hidden>
                  <line x1={12} y1={0.5} x2={12} y2={8.5} className={linkCls(h, hops[i + 1])} strokeWidth={1} strokeDasharray="2 3" />
                </svg>
                <span />
              </>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// ── Register ────────────────────────────────────────────────────────────────────────────────────

function Register({ ctx }: { ctx: HudCtx }) {
  const pr = probed(ctx)
  const n = Math.max(2, ctx.grid?.n ?? ctx.n)
  const shape = tileOf(ctx)
  const tiled = shape.some((s) => s < n)
  const bits = shape.map(bitsFor)
  const q0 = bits[0] + bits[1] + bits[2]
  const rows = AX.map((ax, a) => {
    const b = bits[a], base = bits.slice(0, a).reduce((s, v) => s + v, 0)
    const blurred = ctx.q.axes.includes(a)
    if (!pr) return { ax, b, base, blurred, local: null as number | null, code: null as string | null, tile: 0 }
    const v = clamp(Math.round(pr.cell[a]), 0, n - 1)
    const tile = Math.floor(v / shape[a]), off = v % shape[a]
    const local = tile % 2 ? shape[a] - 1 - off : off // odd tiles are flipped before they are sent
    return { ax, b, base, blurred, local, code: gray(local).toString(2).padStart(b, '0'), tile }
  })
  const c = pr?.cell.map((v) => clamp(Math.round(v), 0, n - 1))
  return (
    <div className="qg">
      <Head
        t="Register"
        v={c ? <><Word c={2}>cell</Word><span className="qg-tv">({c.join(', ')})</span></> : <span className="qg-empty">no cell probed</span>}
        note={pr && tiled ? <><Word c={3}>tile</Word> <Num c={3}>({rows.map((r) => r.tile).join(', ')})</Num></> : <><Num c={3}>{q0}</Num> <Word c={3}>qubits</Word></>}
      />
      <div className="qg-reg">
        {rows.map((r) => (
          <div key={r.ax} className={'qg-reg__row' + (r.blurred ? '' : ' qg-reg__row--off')}>
            <span className="qg-reg__ax">{r.ax}</span>
            {Array.from({ length: r.b }, (_, i) => {
              const on = r.code?.[i] === '1'
              return (
                <span key={i} className={'qg-pill qg-pill--q' + (on ? ' qg-pill--done' : '') + (r.code ? '' : ' qg-pill--ghost')}>
                  q{r.base + r.b - 1 - i}
                </span>
              )
            })}
            <span className="qg-reg__v">
              {!r.blurred ? <Word c={3}>not blurred</Word>
                : r.code ? <><Num c={3}>{r.local}</Num><Word c={3}>→ gray</Word><Num c={3}>{r.code}</Num></>
                  : <Num c={4}>—</Num>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Rotation ────────────────────────────────────────────────────────────────────────────────────

function Rotation({ ctx }: { ctx: HudCtx }) {
  const s = Math.max(0, ctx.q.strength)
  const b = Math.max(...tileOf(ctx).map(bitsFor))
  const P = (t: number, r = 65) => [85 - r * Math.cos(t), 92 - r * Math.sin(t)] as const
  const t0 = Math.PI * Math.min(1, s)
  const [px, py] = P(t0)
  const ticks = Array.from({ length: Math.max(0, b - 1) }, (_, i) => {
    const t = Math.PI * Math.min(1, thetaPi(i + 1, s, ctx.q.reach))
    const [x1, y1] = P(t, 69), [x2, y2] = P(t, 74)
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`
  })
  return (
    <div className="qg" style={{ width: 200 }}>
      <Head t="Rotation" />
      <svg className="qg-svg" width={170} height={110} viewBox="0 0 170 110" aria-hidden>
        <path d="M20 92 A65 65 0 0 1 150 92" className="qg-k4" strokeWidth={1} />
        {ticks.length > 0 && <path d={ticks.join('')} className="qg-k3" strokeWidth={1} />}
        {t0 > 0.002 && <path d={`M20 92 A65 65 0 0 1 ${px.toFixed(1)} ${py.toFixed(1)}`} className="qg-k1" strokeWidth={1.5} />}
        <line x1={85} y1={92} x2={px} y2={py} className="qg-k1" strokeWidth={1} />
        <circle cx={85} cy={92} r={2.5} className="qg-f1" />
        <circle cx={px} cy={py} r={3} className="qg-f1" />
        <text x={14} y={106} className="qg-tx">0</text>
        <text x={146} y={106} className="qg-tx">π</text>
      </svg>
      <div className="qg-line">
        <span className="qg-m11">{gatesOf(ctx.q.style)} θ = {f2(s)}π</span>
        <Word c={3}>· strength</Word>
        <span className="qg-m11">{f2(s)}</span>
      </div>
    </div>
  )
}

// ── Shots and error ─────────────────────────────────────────────────────────────────────────────

const SHOT_LO = 6, SHOT_HI = 18, SHOT_W = 240, SHOT_END = 204 // 64 … 262,144 shots on a log axis; exact beyond
const shotX = (l: number) => ((l - SHOT_LO) / (SHOT_HI - SHOT_LO)) * SHOT_END
const shotErr = (v: number) => 1 / Math.sqrt(v)
/** Error on a square-root scale, so the fall stays readable across three decades of shots. */
const shotY = (e: number) => 100 - 88 * Math.sqrt(e / shotErr(2 ** SHOT_LO))
const SHOT_CURVE = Array.from({ length: 49 }, (_, i) => {
  const l = SHOT_LO + ((SHOT_HI - SHOT_LO) * i) / 48
  return `${shotX(l).toFixed(1)},${shotY(shotErr(2 ** l)).toFixed(1)}`
}).join(' ')

function Shots({ ctx }: { ctx: HudCtx }) {
  const shots = ctx.q.shots && ctx.q.shots > 0 ? ctx.q.shots : null
  const W = SHOT_W, xs = shotX, ys = shotY, err = shotErr, conv = SHOT_CURVE
  const l = shots ? clamp(Math.log2(shots), SHOT_LO, SHOT_HI) : null
  const cx = l == null ? W - 6 : xs(l)
  const cy = shots ? ys(err(2 ** (l as number))) : 100
  const label = shots ? `${int(shots)} · ±${(err(shots) * 100).toFixed(1)}%` : null
  const right = cx > 130
  return (
    <div className="qg" style={{ width: W }}>
      <Head t="Shots and error" />
      <svg className="qg-svg" width={W} height={120} viewBox={`0 0 ${W} 120`} aria-hidden>
        <line x1={0} y1={104} x2={W} y2={104} className="qg-k4" strokeWidth={1} />
        <polyline points={conv} className="qg-k1" strokeWidth={1.25} />
        <line x1={0} y1={100} x2={W} y2={100} className="qg-k3" strokeWidth={1} strokeDasharray="2 3" />
        <text x={W} y={93} className={shots ? 'qg-tx' : 'qg-tx1'} textAnchor="end">exact</text>
        {[6, 10, 14, 18].map((v) => (
          <text key={v} x={xs(v)} y={116} className="qg-tx" textAnchor={v === SHOT_LO ? 'start' : 'middle'}>{short(2 ** v)}</text>
        ))}
        <circle cx={cx} cy={cy} r={3.5} className="qg-f1" />
        {label && <text x={right ? cx - 7 : cx + 6} y={cy - 8} className="qg-tx1" textAnchor={right ? 'end' : 'start'}>{label}</text>}
      </svg>
      <p className="qg-cap">Error falls as 1/√shots. Leave shots empty for exact.</p>
    </div>
  )
}

// ── Hear the run ────────────────────────────────────────────────────────────────────────────────

const SHOTS_PLAYED = 32, ROLL_W = 288, ROLL_H = 80
/** Small seeded generator, so the same result always plays the same tune. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Cells drawn by value, as measurement would draw them: one pass over the data, no copies. */
function draw(data: Float32Array, count: number, seed: number): number[] {
  let tot = 0, lastNz = -1
  for (let i = 0; i < data.length; i++) if (data[i] > 0) { tot += data[i]; lastNz = i }
  if (tot <= 0) return []
  const r = rng(seed)
  const us = Array.from({ length: count }, (_, i) => ({ u: r() * tot, i })).sort((a, b) => a.u - b.u)
  const out = new Array<number>(count).fill(lastNz)
  let acc = 0, j = 0
  for (let c = 0; c < data.length && j < count; c++) {
    const v = data[c]
    if (!(v > 0)) continue
    acc += v
    while (j < count && us[j].u < acc) out[us[j++].i] = c
  }
  return out
}

function HearRun({ ctx }: { ctx: HudCtx }) {
  const g = ctx.data.proc
  const [sx, sy, sz] = tileOf(ctx)
  const lanes = bitsFor(sx) + bitsFor(sy) + bitsFor(sz)
  const seed = ctx.proc?.proc_id ?? 1
  const tune = useMemo(() => {
    if (!g) return null
    const n = g.n
    const shape = [sx, sy, sz], bits = shape.map(bitsFor)
    const cells = draw(g.data, SHOTS_PLAYED, seed * 2654435761)
    if (!cells.length) return null
    const on: boolean[][] = Array.from({ length: lanes }, () => new Array<boolean>(SHOTS_PLAYED).fill(false))
    const count = new Array<number>(SHOTS_PLAYED).fill(0)
    cells.forEach((c, s) => {
      const p = [Math.floor(c / (n * n)), Math.floor(c / n) % n, c % n]
      let q = 0
      for (let a = 0; a < 3; a++) {
        const t = Math.floor(p[a] / shape[a]), off = p[a] % shape[a]
        const code = gray(t % 2 ? shape[a] - 1 - off : off)
        for (let k = 0; k < bits[a]; k++) if ((code >> k) & 1) { on[q + k][s] = true; count[s]++ }
        q += bits[a]
      }
    })
    return { on, count }
  }, [g, seed, sx, sy, sz, lanes])
  const step = ROLL_W / SHOTS_PLAYED, lp = ROLL_H / lanes
  // one sixteenth per shot: every 1-bit is struck again on each shot
  const notes: { x: number; y: number }[] = []
  tune?.on.forEach((row, q) => row.forEach((on, s) => { if (on) notes.push({ x: s * step + 2, y: ROLL_H - (q + 0.5) * lp }) }))
  const wave = useMemo(() => {
    // loudness follows the notes per shot, eased between shots so the line stays smooth
    const peak = Math.max(1, ...(tune?.count ?? [1]))
    const env = (x: number) => {
      if (!tune) return 0.15
      const u = (x % ROLL_W) / step - 0.5, i = Math.floor(u), f = u - i
      const a = tune.count[(i + SHOTS_PLAYED) % SHOTS_PLAYED], b = tune.count[(i + 1) % SHOTS_PLAYED]
      return (a + (b - a) * f) / peak
    }
    const pts: string[] = []
    for (let x = 0; x <= ROLL_W * 2; x += 2) {
      const v = 9 * Math.sin((x * Math.PI) / 16) + 4 * Math.sin((x * Math.PI) / 48)
      pts.push(`${x},${(14 - env(x) * v).toFixed(1)}`)
    }
    return pts.join(' ')
  }, [tune, step])
  return (
    <div className="qg" style={{ width: ROLL_W }}>
      <Head t="Hear the run" note="exploration" />
      <div style={{ position: 'relative', width: ROLL_W, height: ROLL_H }}>
        <svg className="qg-svg" width={ROLL_W} height={ROLL_H} viewBox={`0 0 ${ROLL_W} ${ROLL_H}`} aria-hidden>
          {Array.from({ length: lanes }, (_, q) => (
            <line key={q} x1={0} x2={ROLL_W} y1={ROLL_H - (q + 0.5) * lp} y2={ROLL_H - (q + 0.5) * lp} className="qg-kl" strokeWidth={1} />
          ))}
          {notes.length > 0 && (
            <path d={notes.map((nt) => `M${(nt.x + 1.5).toFixed(1)} ${nt.y.toFixed(1)}h${(step - 7).toFixed(1)}`).join('')} className="qg-k1" strokeWidth={3} strokeLinecap="round" />
          )}
        </svg>
        {tune ? <span className="qg-play" style={{ '--qg-dur': '4s' } as CSSProperties} /> : (
          <span className="qg-empty" style={{ position: 'absolute', left: 0, top: ROLL_H / 2 - 6 }}>No result to play yet</span>
        )}
      </div>
      <div style={{ position: 'relative', width: ROLL_W, height: 28, overflow: 'hidden' }}>
        <svg className={'qg-svg' + (tune ? ' qg-wave' : '')} width={ROLL_W * 2} height={28} viewBox={`0 0 ${ROLL_W * 2} 28`} style={{ '--qg-w': `${ROLL_W}px` } as CSSProperties} aria-hidden>
          <polyline points={wave} className={tune ? 'qg-k1' : 'qg-k4'} strokeWidth={1} />
        </svg>
      </div>
      <div className="qg-readout">
        <span>Pitch</span><span>one note per qubit, q0 lowest</span>
        <span>Rhythm</span><span>one shot per sixteenth</span>
        <span>Tempo</span><span className="qg-m11">120 bpm</span>
      </div>
      <p className="qg-cap">Each measured bitstring plays its 1-bits as notes{tune ? `: ${SHOTS_PLAYED} shots drawn from this result.` : '.'}</p>
    </div>
  )
}

// ── Processing ──────────────────────────────────────────────────────────────────────────────────

const BELL = 'M2 30C14 30 16 4 26 4S38 30 50 30'
function Processing({ ctx }: { ctx: HudCtx }) {
  const run = ctx.job && ctx.job.status === 'running' ? ctx.job : null
  const mode = run ? 'atlas' : ctx.proc?.mode ?? ctx.q.mode
  const engine = ctx.atlasJobs.find((j) => j.engine)?.engine ?? 'blur-core-v1'
  const secs = ctx.proc?.seconds
  const detail = (id: string): ReactNode => {
    if (id !== mode) return null
    if (id === 'atlas' && run) return <Num c={2}>{run.elapsed.toFixed(1)} s · {run.tiles_done} / {run.tiles_total}</Num>
    if (id === 'atlas' && ctx.proc?.cached) return <Word c={2}>from cache</Word>
    const t = secs != null ? <Num c={2}>{dur(secs * 1000)}</Num> : null
    if (id === 'gaussian') return <span className="qg-line"><Num c={2}>σ {ctx.q.sigma}</Num>{t && <>{' · '}{t}</>}</span>
    return t
  }
  const rows: { id: string; name: string; d: ReactNode; glyph: (on: boolean) => ReactNode }[] = [
    { id: 'gaussian', name: 'Gaussian', d: <Word c={3}>· stand-in</Word>, glyph: (on) => <path d={BELL} className={on ? 'qg-k1' : 'qg-k4'} strokeWidth={1} /> },
    {
      id: 'emulator', name: 'Emulation', d: <Word c={3}>· local</Word>, glyph: (on) => (
        <>
          <path d="M2 30H10V26H16V14H22V5H30V14H36V26H42V30H50" className={on ? 'qg-k1' : 'qg-k4'} strokeWidth={1} />
          <path d={BELL} className={on ? 'qg-k3' : 'qg-k4'} strokeWidth={1} strokeDasharray="2 2" />
        </>
      ),
    },
    {
      id: 'atlas', name: 'Atlas', d: <><Word c={3}>·</Word><Num c={3}>{engine}</Num></>, glyph: (on) => (
        <>
          <circle cx={26} cy={16} r={13} className={on ? 'qg-k1' : 'qg-k4'} strokeWidth={1} />
          <circle cx={26} cy={16} r={7} className={on ? 'qg-k3' : 'qg-k4'} strokeWidth={1} />
          <circle cx={26} cy={16} r={2.5} className={on ? 'qg-f1' : 'qg-f4'} />
        </>
      ),
    },
  ]
  const known = rows.some((r) => r.id === mode)
  return (
    <div className="qg">
      <Head t="Processing" />
      <div className="qg-eng">
        {rows.map((r) => {
          const on = r.id === mode
          return (
            <div key={r.id} className="qg-eng__r">
              <svg className="qg-svg" width={52} height={32} viewBox="0 0 52 32" aria-hidden>{r.glyph(on)}</svg>
              <span className="qg-eng__l">
                <span className="qg-line">
                  <span className="qg-w" style={{ fontWeight: on ? 500 : 400, color: on ? 'var(--qs-ink)' : 'var(--qs-ink3)' }}>{r.name}</span>
                  {r.d}
                </span>
                {detail(r.id)}
              </span>
            </div>
          )
        })}
      </div>
      {!known && <span className="qg-empty">This run is {mode === 'nations' ? 'Evolve' : mode}, not a blur.</span>}
    </div>
  )
}

// ── How the blur works ──────────────────────────────────────────────────────────────────────────

const STYLES = ['x', 'y', 'xy', 'yx']

function Ruler({ k, v }: { k: string; v: number }) {
  const p = clamp(v, 0, 1) * 100
  return (
    <div>
      <div className="qg-set__k"><Word>{k}</Word><span className="qg-m11">{f2(v)}</span></div>
      <div className="qg-ruler">
        <span className="qg-ruler__track" />
        {[0, 25, 50, 75, 100].map((t) => <span key={t} className="qg-ruler__tick" style={{ left: `${t}%` }} />)}
        <span className="qg-ruler__fill" style={{ width: `${p}%` }} />
        <span className="qg-ruler__dot" style={{ left: `${p}%` }} />
      </div>
    </div>
  )
}

function BlurSettings({ ctx }: { ctx: HudCtx }) {
  const st = styleOf(ctx.q.style)
  const axes = ctx.q.axes.map((a) => AX[a]).filter(Boolean).join(' ')
  return (
    <div className="qg">
      <Head t="Blur settings" note={<><Word c={3}>axes</Word> <span className="qg-m qg-c3">{axes || '—'}</span></>} />
      <div className="qg-set">
        <Ruler k="Strength" v={ctx.q.strength} />
        <Ruler k="Reach" v={ctx.q.reach} />
        <div className="qg-head" style={{ alignItems: 'center' }}>
          <Word>Style</Word>
          <span className="qg-seg">
            {STYLES.map((t) => <span key={t} className={'qg-pill' + (t === st ? ' qg-pill--done' : '')}>{t}</span>)}
          </span>
        </div>
      </div>
    </div>
  )
}

function QubitTable({ ctx }: { ctx: HudCtx }) {
  const st = styleOf(ctx.q.style)
  const b = Math.max(...tileOf(ctx).map(bitsFor))
  const rows = Array.from({ length: b }, (_, k) => {
    const t = thetaPi(k, ctx.q.strength, ctx.q.reach)
    return { k, w: weight(k, ctx.q.reach), t, span: 2 ** (k + 1), pm: moved(st, Math.PI * t) }
  })
  return (
    <div className="qg">
      <Head t="Qubits" note={<><Num c={3}>{b}</Num> <Word c={3}>per axis</Word></>} />
      <div className="qg-tab">
        <div className="qg-tab__r qg-tab__h"><span>Qubit</span><span>Weight</span><span>θ</span><span>Mixes within</span><span>Moved</span></div>
        {rows.map((r) => (
          <div key={r.k} className="qg-tab__r">
            <span>q{r.k}</span>
            <span>{f2(r.w)}</span>
            <span>{f2(r.t)}π</span>
            <span><span className="qg-m">{r.span}</span> <span className="qg-w qg-c3">cells</span></span>
            <span>{(r.pm * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The line of input cells the pairing shows: through the probed cell along X, else the middle row at
 *  the slice (or the nearest row that has anything in it), one register long. */
function useLine(ctx: HudCtx) {
  const g = ctx.data.grid
  const len = Math.min(tileOf(ctx)[0], g?.n ?? 32)
  const pr = probed(ctx)
  const mid = Math.floor((g?.n ?? 32) / 2)
  const want: Vec3 = pr ? pr.cell : [mid, mid, ctx.slice.axis === 'z' ? ctx.slice.index : mid]
  const [cx, cy, cz] = want.map((v) => Math.round(v))
  const search = !pr
  return useMemo(() => {
    if (!g) return null
    const n = g.n
    const x0 = Math.floor(clamp(cx, 0, n - 1) / len) * len
    const row = (y: number, z: number) => Array.from({ length: len }, (_, i) => Math.max(0, g.data[((x0 + i) * n + y) * n + z] || 0))
    let y = clamp(cy, 0, n - 1), z = clamp(cz, 0, n - 1)
    let inp = row(y, z)
    if (search && !inp.some((v) => v > 0)) {
      // look outward from the middle for a row with something in it
      search: for (let d = 1; d < n; d++) {
        for (const [dy, dz] of [[0, d], [0, -d], [d, 0], [-d, 0], [d, d], [-d, -d]]) {
          const yy = y + dy, zz = z + dz
          if (yy < 0 || zz < 0 || yy >= n || zz >= n) continue
          const r = row(yy, zz)
          if (r.some((v) => v > 0)) { y = yy; z = zz; inp = r; break search }
        }
      }
    }
    return { inp, x0, y, z, len }
  }, [g, len, cx, cy, cz, search])
}

function GrayPairing({ ctx }: { ctx: HudCtx }) {
  const line = useLine(ctx)
  const len = line?.len ?? Math.min(tileOf(ctx)[0], 32)
  const b = bitsFor(len)
  const [selRaw, setSel] = useState(0)
  const sel = Math.min(selRaw, b - 1)
  const st = styleOf(ctx.q.style)
  const blurX = ctx.q.axes.includes(0)
  const out = useMemo(
    () => (line ? (blurX ? blurLine(line.inp, b, ctx.q.strength, ctx.q.reach, st) : line.inp.slice()) : null),
    [line, b, blurX, ctx.q.strength, ctx.q.reach, st],
  )
  const W = 300, L = 22, R = 28
  const p = (W - L - R) / len, cs = Math.max(3, Math.min(12, p - 2))
  const cx = (i: number) => L + i * p + p / 2
  const mask = (1 << (sel + 1)) - 1
  const arcs: string[] = []
  for (let i = 0; i < len; i++) {
    const j = i ^ mask
    if (j < len && i < j) {
      const rx = (cx(j) - cx(i)) / 2, ry = Math.min(40, rx * 0.35 + 4)
      arcs.push(`M${cx(i).toFixed(1)} 46A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 1 ${cx(j).toFixed(1)} 46`)
    }
  }
  const cTop = 49, base = cTop + cs + 74, hMax = 62, top = 1.25
  const level = ctx.level
  const ly = base - (Math.min(level, top) / top) * hMax
  const kept = out ? out.filter((v) => v >= level).length : 0
  return (
    <div className="qg qg--live">
      <div className="qg-head" style={{ alignItems: 'center' }}>
        <span><span className="qg-t">Gray pairing</span><Word c={2}>of</Word><span className="qg-tv">q{sel}</span><Word c={3}>· input · result</Word></span>
        <span className="qg-seg">
          {Array.from({ length: b }, (_, k) => (
            <button key={k} type="button" className={'qg-pill qg-btn' + (k === sel ? ' qg-pill--done' : '')} aria-pressed={k === sel}
              data-tip={`q${k} · mixes within ${2 ** (k + 1)} cells`} onClick={() => setSel(k)}>q{k}</button>
          ))}
        </span>
      </div>
      <svg className="qg-svg" width={W} height={base + 4} viewBox={`0 0 ${W} ${base + 4}`} aria-hidden>
        {arcs.map((d, i) => <path key={i} d={d} className="qg-k1" strokeWidth={1} />)}
        {(line?.inp ?? new Array<number>(len).fill(0)).map((v, i) => (
          <rect key={i} x={cx(i) - cs / 2} y={cTop} width={cs} height={cs}
            className={v >= 0.5 ? 'qg-f1' : v > 0 ? 'qg-f4' : 'qg-k4'} strokeWidth={1} />
        ))}
        <line x1={L} y1={base + 0.5} x2={W - R + 2} y2={base + 0.5} className="qg-k4" strokeWidth={1} />
        <line x1={L} y1={ly} x2={W - R + 2} y2={ly} className="qg-k1" strokeWidth={1} strokeDasharray="2 3" />
        <text x={W - R + 5} y={ly + 3} className="qg-tx2">{f2(level)}</text>
        {out?.map((v, i) => {
          const h = (Math.min(v, top) / top) * hMax
          return <rect key={i} x={cx(i) - cs / 2} y={base - h} width={cs} height={h} className={v >= level ? 'qg-f1' : 'qg-f3'} />
        })}
        <text x={0} y={cTop + cs - 1} className="qg-tl">in</text>
        <text x={0} y={base - 1} className="qg-tl">out</text>
      </svg>
      {line ? (
        <div className="qg-head">
          <span className="qg-line"><Word c={3}>row</Word><Num c={3}>y {line.y} · z {line.z}{line.x0 ? ` · x ${line.x0}–${line.x0 + len - 1}` : ''}</Num></span>
          <span className="qg-line"><Num c={2}>{kept} of {len}</Num><Word c={3}>{blurX ? 'at or above the level' : 'X is not blurred'}</Word></span>
        </div>
      ) : <span className="qg-empty">Voxelise a model to see one of its rows here.</span>}
    </div>
  )
}

function HowItWorks({ ctx }: { ctx: HudCtx }) {
  const n = Math.max(2, ctx.grid?.n ?? ctx.n)
  const b = Math.max(...tileOf(ctx).map(bitsFor))
  const s = ctx.q.strength, r = ctx.q.reach
  // the sums of one row blurred alone, as on the sheet (the view's copy of the 3D result is clipped to 0–1)
  const line = useLine(ctx)
  const st = styleOf(ctx.q.style)
  const sums = useMemo(() => {
    if (!line) return null
    const out = blurLine(line.inp, bitsFor(line.len), s, r, st)
    return { inp: line.inp.reduce((a, v) => a + v, 0), out: out.reduce((a, v) => a + v, 0), y: line.y, z: line.z }
  }, [line, s, r, st])
  const how = [
    `Values become amplitudes, and each axis of ${Math.min(n, 2 ** b)} cells is Gray-coded onto ${b} qubits.`,
    `Each qubit turns by θ = π × ${f2(s)} × weight. ${r < 0.05 ? 'With reach at 0 each higher qubit turns half as far, so long-distance mixing stays weak.' : `Reach ${f2(r)} evens the turns out, so the high qubits turn ${r > 0.8 ? 'nearly' : 'partly'} as far as q0.`}`,
    `q0 swaps neighbours, q${b - 1} mirrors the whole axis. That mirror is why odd tiles are flipped before they are sent.`,
  ]
  return (
    <div className="qg">
      <Head t="How the blur works" />
      <div className="qg-how">
        {how.map((t, i) => (
          <div key={i} className="qg-how__i"><span className="qg-how__n">{i + 1}</span><span className="qg-how__t">{t}</span></div>
        ))}
        <span className="qg-how__sum">
          {!sums ? <i>No grid yet: the sums appear once a model is voxelised.</i>
            : <><span className="qg-w">Row </span>y {sums.y} · z {sums.z}<span className="qg-w"> · sum in </span>{f2(sums.inp)}<span className="qg-w"> · sum out </span>{f2(sums.out)}<br /><i>The blur moves value, it does not add any.</i></>}
        </span>
      </div>
    </div>
  )
}

// ── Pulse schedule ──────────────────────────────────────────────────────────────────────────────

/** A drive pulse of width w and height a on a lane at y (the sheet's bump). */
const bump = (x: number, y: number, w: number, a: number) => {
  const f = (v: number) => v.toFixed(1)
  return `M${f(x)} ${f(y)}C${f(x + 0.265 * w)} ${f(y)} ${f(x + 0.32 * w)} ${f(y - a)} ${f(x + 0.5 * w)} ${f(y - a)}S${f(x + 0.735 * w)} ${f(y)} ${f(x + w)} ${f(y)}`
}

function PulseExplore({ ctx }: { ctx: HudCtx }) {
  const st = styleOf(ctx.q.style)
  const b = Math.max(...tileOf(ctx).map(bitsFor))
  const W = 300, L0 = 24, R0 = 268, track = R0 - L0, pitch = 22, top = 16, pw = 22
  const H = top + (b - 1) * pitch + 10
  const y = (k: number) => top + k * pitch
  // amplitude set by strength: the sheet's 14 px at strength 0.30, capped at the lane pitch
  const amp = (k: number) => clamp((14 / 0.3) * thetaPi(k, ctx.q.strength, ctx.q.reach), 2, 18)
  const at = [0.052, 0.207]
  const pulses: { d: string; dash?: string }[] = []
  for (let k = 0; k < b; k++) {
    st.slice(0, 2).split('').forEach((L, i) => {
      const x = L0 + at[i] * track + (i === 0 ? (k % 3) * 4 : (k % 2) * 5)
      pulses.push({ d: bump(x, y(k), pw, amp(k)), dash: L === 'y' ? '3 2' : undefined })
    })
  }
  const links: { x: number; a: number; b: number }[] = []
  for (let k = 0; k + 1 < b; k += 2) links.push({ x: L0 + 0.397 * track, a: k, b: k + 1 })
  for (let k = 1; k + 1 < b; k += 2) links.push({ x: L0 + 0.5 * track, a: k, b: k + 1 })
  return (
    <div className="qg" style={{ width: W }}>
      <Head t="Pulse schedule" v={<Word c={2}>exploration</Word>} />
      <div style={{ position: 'relative', width: W, height: H }}>
        <svg className="qg-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
          {Array.from({ length: b }, (_, k) => (
            <g key={k}>
              <line x1={L0} y1={y(k)} x2={R0} y2={y(k)} className="qg-k4" strokeWidth={1} />
              <text x={0} y={y(k) + 3.5} className="qg-tx">q{k}</text>
              <rect x={R0 + 5} y={y(k) - 6} width={24} height={12} rx={6} className="qg-k1" strokeWidth={1} />
              <text x={R0 + 17} y={y(k) + 3} className="qg-tx2" textAnchor="middle">M</text>
            </g>
          ))}
          {pulses.map((p, i) => <path key={i} d={p.d} className="qg-k1" strokeWidth={1.25} strokeDasharray={p.dash} />)}
          {links.map((l, i) => (
            <g key={i}>
              <line x1={l.x} y1={y(l.a)} x2={l.x} y2={y(l.b)} className="qg-k1" strokeWidth={1} />
              <circle cx={l.x} cy={y(l.a)} r={2.5} className="qg-f1" />
              <circle cx={l.x} cy={y(l.b)} r={4.5} className="qg-k1 qg-fbg" strokeWidth={1} />
            </g>
          ))}
        </svg>
        <div style={{ position: 'absolute', left: L0, top: 2, width: track, height: H - 4, opacity: 0.5 }}>
          <span className="qg-play" style={{ '--qg-dur': '6s' } as CSSProperties} />
        </div>
      </div>
      <span className="qg-note">Rx solid · Ry dashed · link · measure</span>
      <p className="qg-cap">How the {gatesOf(st).replace(' ', ' and ')} rotations could map to drive pulses, with amplitude set by strength. The app sends circuit settings to Atlas, not pulses.</p>
    </div>
  )
}

function PulseDrag({ ctx }: { ctx: HudCtx }) {
  const st = styleOf(ctx.q.style)
  const b = Math.max(...tileOf(ctx).map(bitsFor))
  const { strength, reach } = ctx.q
  const G = useMemo(() => {
    const g: { k: number; L: string }[] = []
    for (let k = 0; k < b; k++) for (const L of st) g.push({ k, L })
    return g
  }, [b, st])
  const [up, setUp] = useState<number | null>(null) // null: every gate applied
  const [sel, setSel] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)
  const upto = up == null ? G.length : Math.min(up, G.length)
  const W = 340, L0 = 30, R0 = W - 38, track = R0 - L0, sw = track / G.length, pw = Math.min(34, sw - 4)
  const pitch = 26, top = 28, H = top + (b - 1) * pitch + 22
  const y = (k: number) => top + k * pitch
  const pick = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - r.left) / Math.max(1, r.width)) * W
    setUp(clamp(Math.round((fx - L0) / sw), 0, G.length))
  }
  const nx = G[upto]
  const lane = (k: number) => (sel == null || sel === k ? 'qg-k1' : 'qg-k4')
  const phX = L0 + upto * sw
  return (
    <div className="qg qg--live" style={{ width: W }}>
      <div className="qg-head" style={{ alignItems: 'center' }}>
        <span style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <span className="qg-t">Pulse schedule</span>
          <span className="qg-m qg-c2">{nx ? `gate ${upto} / ${G.length} · next q${nx.k} R${nx.L} ${f2(thetaPi(nx.k, strength, reach))}π` : `all ${G.length} gates applied`}</span>
        </span>
        <button type="button" className={'qg-pill qg-btn' + (up == null ? '' : ' qg-pill--cur')} onClick={() => setUp(null)} data-tip="Apply every gate">All gates</button>
      </div>
      <div className="qg-drag" style={{ width: W, height: H }}
        onPointerDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); pick(e) }}
        onPointerMove={(e) => { if (drag) pick(e) }}
        onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}>
        <svg className="qg-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {Array.from({ length: b }, (_, k) => (
            <g key={k}>
              <line x1={L0} y1={y(k)} x2={R0} y2={y(k)} className={lane(k)} strokeWidth={1} opacity={0.5} />
              <text x={2} y={y(k) + 3.5} className={sel === k ? 'qg-tx2' : 'qg-tx'}>q{k}</text>
              <rect x={R0 + 8} y={y(k) - 7} width={26} height={14} rx={7} className={lane(k)} strokeWidth={1} />
              <text x={R0 + 21} y={y(k) + 3} className={sel == null || sel === k ? 'qg-tx2' : 'qg-tx'} textAnchor="middle">M</text>
              <rect x={0} y={y(k) - 12} width={L0 - 4} height={24} className="qg-lane-hit" fill="transparent"
                onPointerDown={(e) => { e.stopPropagation(); setSel(sel === k ? null : k) }} />
            </g>
          ))}
          {G.map((g, i) => {
            const x = L0 + (i + 0.5) * sw - pw / 2, a = 20 * Math.min(1, thetaPi(g.k, strength, reach))
            const cls = i < upto && (sel == null || sel === g.k) ? 'qg-k1' : 'qg-k4'
            return (
              <g key={i}>
                <path d={bump(x, y(g.k), pw, Math.max(1, a))} className={cls} strokeWidth={1.25} strokeDasharray={g.L === 'y' ? '3 2' : undefined} />
                <text x={x + pw * 0.5} y={y(g.k) + 12} className="qg-tx" textAnchor="middle" opacity={i < upto ? 1 : 0.6}>R{g.L}</text>
              </g>
            )
          })}
          <line x1={phX} y1={4} x2={phX} y2={H - 6} className="qg-k1" strokeWidth={1} />
          <circle cx={phX} cy={4} r={4.5} className="qg-f1" />
        </svg>
      </div>
      <p className="qg-cap">
        Pulse height is the angle; Rx solid, Ry dashed. {reach < 0.05 ? 'With reach at 0 each higher qubit turns half as far, so long-distance mixing stays weak.' : `Reach ${f2(reach)} keeps the higher qubits turning.`} Drag the playhead to apply the gates one at a time.
      </p>
    </div>
  )
}

// ── Atlas usage ─────────────────────────────────────────────────────────────────────────────────

const SUBMIT_RE = /^Submitted .+ to Atlas · (\d+) tiles?/
function UsageSession({ ctx }: { ctx: HudCtx }) {
  const { sent, cache } = useMemo(() => {
    const t0 = Math.min(T0, ctx.log[0]?.t ?? T0)
    const rows = ctx.atlasJobs.filter((j) => j.mine !== false && Date.parse(j.created_at) >= t0).length
    let logged = 0, hits = 0
    for (const l of ctx.log) {
      if (l.t < t0 || l.level === 'net') continue
      const m = SUBMIT_RE.exec(l.text)
      if (m) logged += Number(m[1])
      else if (/read from cache/.test(l.text)) hits += 1
    }
    // a submitted run counts all its tiles; the ones found in the cache on the way were never sent
    const tc = ctx.job?.tiles_cached ?? 0
    return { sent: Math.max(rows, logged - tc), cache: hits + tc }
  }, [ctx.atlasJobs, ctx.log, ctx.job?.tiles_cached])
  const left = Math.max(0, BUDGET - sent)
  return (
    <div className="qg" style={{ width: 296 }}>
      <Head t="Atlas usage" note="this session" />
      <div className="qg-cells">
        {Array.from({ length: BUDGET }, (_, i) => <span key={i} className={i < sent ? 'is-sent' : i < sent + cache ? 'is-cache' : ''} />)}
      </div>
      <div className="qg-legend">
        <span><span className="qg-sw" /><Num>{sent}</Num><Word>sent</Word></span>
        <span><span className="qg-sw qg-sw--cache" /><Num>{cache}</Num><Word>from cache</Word></span>
        <span><Num c={3}>{left}</Num><Word c={3}>left of a budget of</Word><Num c={3}>{BUDGET}</Num></span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
        <span className="qg-pill qg-pill--ghost" style={{ borderColor: 'var(--qs-ink3)', color: 'var(--qs-ink2)' }}>Pricing not confirmed</span>
        <span className="qg-cap">A budget of {BUDGET} jobs is assumed here; cost per job comes once Moth publishes it.</span>
      </div>
    </div>
  )
}

const SIZES = [16, 32, 64, 128, 256]
function ResultSize({ ctx }: { ctx: HudCtx }) {
  const cur = ctx.grid?.n ?? null
  const mode = ctx.q.tiling
  const list = cur && !SIZES.includes(cur) ? [...SIZES, cur].sort((a, b) => a - b) : SIZES
  const TRACK = 124, LINE = 112 // the line is 2 MB, one Atlas job
  const rows = list.map((n) => {
    const values = n ** 3, mb = values / 32768
    const shape = cur === n ? tileOf(ctx) : tileShape(n, mode)
    const tiles = Math.round(values / (shape[0] * shape[1] * shape[2]))
    const real = cur === n ? ctx.grid?.tiles?.[mode as keyof GridInfo['tiles']] : undefined
    const t = tiles <= 1 ? `${int(values)} values · 1 job`
      : real && real.jobs < tiles ? `${tiles} tiles · ${real.jobs} to send`
        : tiles <= 8 ? `${tiles} tiles of ${shape.join('×')}`
          : `${tiles} tiles · ${PARALLEL} at a time`
    return { n, w: Math.min(TRACK, (mb / 2) * LINE), tiled: tiles > 1, t, on: cur === n }
  })
  return (
    <div className="qg">
      <Head t="Result size by grid" note={<Word c={3}>{mode} tiles</Word>} />
      <div className="qg-size">
        {rows.map((r) => (
          <Fragment key={r.n}>
            <span className={'qg-m11 ' + (r.on ? 'qg-c1' : 'qg-c3')} style={{ fontWeight: r.on ? 500 : 400 }}>{r.n}³</span>
            <div className={'qg-size__bar' + (r.on ? ' is-cur' : '')}>
              <span className={r.tiled ? 'is-tiled' : ''} style={{ width: Math.max(1, r.w) }} />
              <span className="qg-size__limit" style={{ left: LINE }} />
            </div>
            <span className={'qg-m ' + (r.on ? 'qg-c1' : 'qg-c3')}>{r.t}</span>
          </Fragment>
        ))}
      </div>
      <p className="qg-cap" style={{ paddingLeft: 44, maxWidth: 250 }}>Line at 2 MB per job. Larger grids are split into tiles.</p>
    </div>
  )
}

function RequestRate({ ctx }: { ctx: HudCtx }) {
  const net = useNet(ctx.log)
  const now = useNow(1000)
  const [phase] = useState(() => Date.now() % 60000) // the hand follows the wall clock: up is :00
  const recent = net.filter((e) => now - e.t < 60000 && e.t <= now + 1000)
  const errs = recent.filter((e) => !/^2\d\d$/.test(e.status)).length
  const slow = recent.filter((e) => e.status === '429').length
  const ms = recent.map((e) => e.ms).sort((a, b) => a - b)
  return (
    <div className="qg" style={{ width: 200 }}>
      <Head t="Request rate" note="last 60 s" />
      <div className="qg-rate">
        <span className="qg-rate__ring" />
        {recent.map((e, i) => {
          const a = ((e.t % 60000) / 60000) * Math.PI * 2 - Math.PI / 2
          const age = (now - e.t) / 60000
          return (
            <span key={i} className={'qg-rate__dot' + (/^2\d\d$/.test(e.status) ? '' : ' qg-rate__dot--err')}
              style={{ left: 60 + 50 * Math.cos(a), top: 60 + 50 * Math.sin(a), opacity: 1 - 0.65 * clamp(age, 0, 1) }} />
          )
        })}
        <span className="qg-rate__hand qg-spin" style={{ animationDelay: `-${phase}ms`, transform: `rotate(${((now % 60000) / 60000) * 360}deg)` }}><span /></span>
        <span className="qg-rate__n">{recent.length}</span>
      </div>
      <div className="qg-line">
        {recent.length ? <><Num c={2}>{dur(ms[ms.length >> 1])}</Num><Word c={3}>median</Word>{errs > 0 && <><Word c={3}>·</Word><Num c={2}>{slow ? `${slow} × 429` : `${errs} failed`}</Num></>}</>
          : <span className="qg-empty">No requests in the last minute</span>}
      </div>
      <p className="qg-cap">Status polls every 2 s, up to {PARALLEL} jobs at once. HTTP 429 means slow down.</p>
    </div>
  )
}

// ── families ────────────────────────────────────────────────────────────────────────────────────

export const GLYPH_FAMILIES: FamilyDef[] = [
  {
    id: 'backend', title: 'Backend path', desc: 'The hops a job takes; the dashed line moves on the active hop',
    modules: [
      { family: 'backend', id: 'v1', label: 'path', desc: 'Browser to marching cubes, with this session\'s timings. Local runs skip the remote hops.', slot: 'bottom', render: (ctx) => <BackendPath ctx={ctx} /> },
      { family: 'backend', id: 'v2', label: 'path, stacked', desc: 'The same hops as a column for a side edge.', slot: 'left', render: (ctx) => <BackendStack ctx={ctx} /> },
    ],
  },
  {
    id: 'register', title: 'Register', desc: 'The qubits of the probed cell',
    modules: [
      { family: 'register', id: 'v1', label: 'cell', desc: 'Each axis of the probed cell, Gray-coded onto its qubits; the 1-bits are filled.', slot: 'bl', render: (ctx) => <Register ctx={ctx} /> },
    ],
  },
  {
    id: 'rotation', title: 'Rotation', desc: 'Rx θ = strength · π on a half circle',
    modules: [
      { family: 'rotation', id: 'v1', label: 'rotation', desc: 'The turn of q0 on a half circle from 0 to π; ticks mark the higher qubits.', slot: 'br', render: (ctx) => <Rotation ctx={ctx} /> },
    ],
  },
  {
    id: 'shots', title: 'Shots and error', desc: 'Sampling error falls as 1/√shots',
    modules: [
      { family: 'shots', id: 'v1', label: 'shots and error', desc: 'Error falls as 1/√shots. Leave shots empty for exact.', slot: 'br', render: (ctx) => <Shots ctx={ctx} /> },
      { family: 'shots', id: 'v2', label: 'hear the run', desc: 'Measured bitstrings as a piano roll: one note per qubit, one shot per sixteenth.', slot: 'bl', render: (ctx) => <HearRun ctx={ctx} /> },
    ],
  },
  {
    id: 'processing', title: 'Processing', desc: 'Which engine made the result',
    modules: [
      { family: 'processing', id: 'v1', label: 'engines', desc: 'Gaussian stand-in, local emulation or Atlas blur-core-v1; the one in use is ink.', slot: 'tr', render: (ctx) => <Processing ctx={ctx} /> },
    ],
  },
  {
    id: 'blur', title: 'How the blur works', desc: 'Strength, reach, style, and what each qubit mixes',
    modules: [
      { family: 'blur', id: 'v1', label: 'settings', desc: 'Strength, reach and style as they are set.', slot: 'tl', render: (ctx) => <BlurSettings ctx={ctx} /> },
      { family: 'blur', id: 'v2', label: 'qubits', desc: 'Per qubit: weight, θ, the span it mixes within and the share it moves.', slot: 'tr', render: (ctx) => <QubitTable ctx={ctx} /> },
      { family: 'blur', id: 'v3', label: 'gray pairing', desc: 'Which cells a qubit pairs on one row of the grid, and that row blurred alone.', slot: 'bottom', interactive: true, render: (ctx) => <GrayPairing ctx={ctx} /> },
      { family: 'blur', id: 'v4', label: 'how it works', desc: 'Three steps in words, and the sums in and out: the blur moves value, it does not add any.', slot: 'right', render: (ctx) => <HowItWorks ctx={ctx} /> },
    ],
  },
  {
    id: 'pulse', title: 'Pulse schedule', desc: 'Rx and Ry rotations as drive pulses on the qubit lines',
    modules: [
      { family: 'pulse', id: 'v1', label: 'exploration', desc: 'How the rotations could map to drive pulses, with amplitude set by strength.', slot: 'br', render: (ctx) => <PulseExplore ctx={ctx} /> },
      { family: 'pulse', id: 'v2', label: 'drag the playhead', desc: 'Pulse height is the angle. Drag the playhead to apply the gates one at a time.', slot: 'bottom', interactive: true, render: (ctx) => <PulseDrag ctx={ctx} /> },
    ],
  },
  {
    id: 'usage', title: 'Atlas usage', desc: 'Jobs this session, result size by grid, request rate',
    modules: [
      { family: 'usage', id: 'v1', label: 'this session', desc: 'Jobs sent and read from cache this session, against a budget.', slot: 'tr', render: (ctx) => <UsageSession ctx={ctx} /> },
      { family: 'usage', id: 'v2', label: 'result size by grid', desc: 'Values per grid against the 2 MB line per job; larger grids are split into tiles.', slot: 'bl', render: (ctx) => <ResultSize ctx={ctx} /> },
      { family: 'usage', id: 'v3', label: 'request rate', desc: 'Requests in the last 60 s around a clock; status polls every 2 s.', slot: 'tr', render: (ctx) => <RequestRate ctx={ctx} /> },
    ],
  },
]
