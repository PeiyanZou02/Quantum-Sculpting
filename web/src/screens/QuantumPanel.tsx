// QUANTUM: the library's quantum glyphs and data views, bound to the live settings, grid, job and runs.
// Maths follows app/emulator.py: each axis of n cells is Gray-coded onto b = ceil(log2 n) qubits;
// qubit k turns by θ_k = π·strength·((1−reach)·2^−k + reach), gates from `style`, and mixes cells 2^(k+1) apart.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { useStore } from '../store'
import type { Mode, ProcMeta } from '../api'
import { ScrollArea } from '../qs/ScrollArea'
import { SectionTabs } from './SectionTabs'
import { QCircuit, type QGate } from '../qs/QCircuit'
import { at, histogram } from '../qs/grid'
import { fmt } from './fmt'
import './quantum.css'

const MARKERS = [
  { id: 'q-register', label: 'Register', icon: 'dots' },
  { id: 'q-circuit', label: 'Circuit', icon: 'quantum' },
  { id: 'q-blur', label: 'How the blur works', icon: 'entangle' },
  { id: 'q-pulse', label: 'Pulse schedule', icon: 'play' },
  { id: 'q-atlas', label: 'Atlas', icon: 'atlas' },
  { id: 'q-shots', label: 'Shots and error', icon: 'probe' },
  { id: 'q-runs', label: 'Runs', icon: 'replay' },
  { id: 'q-levels', label: 'Levels', icon: 'layers' },
]

const ATLAS_LIMIT = 65536
const GATES: QGate[] = ['x', 'y', 'xy', 'yx']
const AXN = ['X', 'Y', 'Z']

// ── maths ────────────────────────────────────────────────────────────────────────────────────────
const bitsFor = (n: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))))
const weight = (k: number, reach: number) => (1 - reach) * Math.pow(2, -k) + reach
/** θ_k in units of π. */
const thetaPi = (k: number, strength: number, reach: number) => strength * weight(k, reach)
const gray = (i: number) => i ^ (i >> 1)
const gateOf = (style: string): QGate => (GATES.includes(style as QGate) ? (style as QGate) : 'x')

/** One rotation on qubit k of a state vector (re, im), as in app/emulator.py. */
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

// ── run history: module state that outlives the panel ────────────────────────────────────────────
interface RunRec {
  id: number; run: string; mode: Mode; strength: number; reach: number; style: string; axes: number[]
  shots: number | null; tiling: 'cube' | 'layers'; seconds: number | null; max: number; cached: boolean; t: number
}
let runs: RunRec[] = []
const runSubs = new Set<() => void>()
const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d)

function record(p: ProcMeta | null) {
  // Evolve runs have no strength or reach to compare; they live in the Evolve panel's history
  if (!p || p.mode === 'nations' || runs.some((r) => r.id === p.proc_id)) return
  const q = useStore.getState().q
  const pa = p.params ?? {}
  const axes = Array.isArray(pa.axes) ? (pa.axes as unknown[]).filter((a): a is number => typeof a === 'number') : q.axes
  runs = [...runs, {
    id: p.proc_id, run: p.run, mode: p.mode,
    strength: num(pa.strength, q.strength), reach: num(pa.reach, q.reach),
    style: typeof pa.style === 'string' ? pa.style : q.style, axes,
    shots: pa.shots == null ? null : num(pa.shots, 0) || null,
    tiling: p.tiles?.mode ?? q.tiling, seconds: p.seconds ?? null, max: p.max, cached: p.cached, t: Date.now(),
  }].slice(-200)
  runSubs.forEach((f) => f())
}
record(useStore.getState().proc)
useStore.subscribe((s, prev) => { if (s.proc !== prev.proc) record(s.proc) })
const subscribeRuns = (f: () => void) => { runSubs.add(f); return () => { runSubs.delete(f) } }
const useRuns = () => useSyncExternalStore(subscribeRuns, () => runs)

// ── small parts ──────────────────────────────────────────────────────────────────────────────────
/** Content width of a box, for glyphs drawn at true pixel size. */
function useWidth() {
  const [w, setW] = useState(0)
  // measured from the ref callback as the box mounts (before paint), then followed
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    setW(Math.floor(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function usePrefersStill() {
  const [still, setStill] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setStill(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return still
}

function Blk({ id, label, note, tools, children }: { id: string; label: string; note?: ReactNode; tools?: ReactNode; children: ReactNode }) {
  return (
    <div className="blk" data-mark={id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 22, gap: 8 }}>
        <span className="blk__title">{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {note != null && <span className="qp-num qp-num--dim" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</span>}
          {tools}
        </span>
      </div>
      {children}
    </div>
  )
}

/** A key figure as a compact row (Lab is for reading numbers; the big infographic figures are Present's). */
function Hero({ k, v, unit, note }: { k: string; v: ReactNode; unit?: string; note?: ReactNode }) {
  return (
    <div className="figs__row">
      <span className="figs__k">{k}</span>
      <span className="figs__v">{v}{unit && <small> {unit}</small>}</span>
      {note != null && <span className="figs__n">{note}</span>}
    </div>
  )
}

function Pill({ on, tip, desc, onClick, children }: { on?: boolean; tip: string; desc?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={'qp-pill' + (on ? ' qp-pill--on' : '')} data-tip={tip} data-tip-desc={desc} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="qs-help">{children}</p>

/** Qubits per axis from the grid, or 32³ while there is none. */
function useBits() {
  const n = useStore((s) => s.grid?.n ?? null)
  return { n: n ?? 32, b: bitsFor(n ?? 32), assumed: n == null }
}

// ── panel ────────────────────────────────────────────────────────────────────────────────────────
export function QuantumPanel() {
  const [sel, setSel] = useState<number | null>(null)
  return (
    <div className="panel" aria-label="Quantum">
      <ScrollArea markers={MARKERS} className="pane-scroll pane-scroll--tabs" bar={false} renderIndex={(ix) => <SectionTabs {...ix} label="Quantum sections" />}>
        <RegisterBlk sel={sel} setSel={setSel} />
        <CircuitBlk />
        <BlurBlk sel={sel} />
        <PulseBlk sel={sel} />
        <AtlasBlk />
        <ShotsBlk />
        <RunsBlk />
        <LevelsBlk />
        <div style={{ height: 40 }} />
      </ScrollArea>
    </div>
  )
}

// 1 · Register ─────────────────────────────────────────────────────────────────────────────────────
function RegisterBlk({ sel, setSel }: { sel: number | null; setSel: (k: number | null) => void }) {
  const q = useStore((s) => s.q)
  const { n, b, assumed } = useBits()
  const on = new Set(q.axes)
  const nq = b * on.size
  let qi = 0
  return (
    <Blk id="q-register" label="Register" note={`${n}³${assumed ? ' · preview' : ''}`}>
      <div className="figs">
        <Hero k="Qubits" v={nq} note={`${b} per axis × ${on.size} ax${on.size === 1 ? 'is' : 'es'}`} />
        <Hero k="Amplitudes" v={fmt.int(2 ** b)} note={`per axis line of ${n} cells`} />
      </div>
      <div className="qp-reg" style={{ ['--b' as string]: b }}>
        {AXN.map((ax, ai) => {
          const live = on.has(ai)
          return (
            <span key={ax} style={{ display: 'contents' }}>
              <span className={'qp-reg__ax' + (live ? '' : ' qp-reg__ax--off')}>{ax}</span>
              {Array.from({ length: b }, (_, k) => {
                if (!live) return <span key={k} className="qp-cell qp-cell--off" data-tip={`${ax} is not blurred`} data-tip-desc="Turn the axis on under Blur axes">–</span>
                const t = thetaPi(k, q.strength, q.reach)
                const shade = 6 + Math.min(1, t) * 76
                const id = qi++
                const m = moved(q.style, Math.PI * t)
                return (
                  <button type="button" key={k} className={'qp-cell' + (sel === k ? ' qp-cell--sel' : '')}
                    style={{ background: `color-mix(in srgb, var(--qs-ink) ${shade.toFixed(0)}%, transparent)`, color: shade > 44 ? 'var(--qs-bg)' : 'var(--qs-ink)' }}
                    data-tip={`q${id} · θ ${t.toFixed(3)}π`}
                    data-tip-desc={`${ax} bit ${k} · mixes 2^${k + 1} = ${2 ** (k + 1)} cells · moves ${(m * 100).toFixed(1)}% · click to trace it`}
                    onClick={() => setSel(sel === k ? null : k)}>
                    q{id}
                  </button>
                )
              })}
            </span>
          )
        })}
      </div>
      <div className="qp-scale">
        <span className="qp-num qp-num--dim">0</span><span className="qp-scale__bar" /><span className="qp-num qp-num--dim">π</span>
      </div>
      <p className="qp-note">Shade is each qubit’s turn θ/π. q0 swaps neighbours; the top qubit mirrors the whole axis. {q.reach < 0.2 ? 'Reach is low, so the high qubits barely turn and long-range mixing stays weak.' : 'Reach evens the turns out, so far cells mix too.'}</p>
    </Blk>
  )
}

// 2 · Circuit ──────────────────────────────────────────────────────────────────────────────────────
function CircuitBlk() {
  const q = useStore((s) => s.q)
  const { n, b } = useBits()
  const [ref, w] = useWidth()
  const gate = gateOf(q.style)
  const axes = q.axes.map((a) => 'xyz'[a]).join('') || 'x'
  const minW = gate.length > 1 ? 340 : 250
  const drawW = Math.max(w, minW)
  const scale = w ? Math.min(1, w / drawW) : 1
  const rowH = 16
  const h = 34 + (b * axes.length - 1) * rowH + 14
  return (
    <Blk id="q-circuit" label="Circuit" note={`${b * axes.length} qubits · ${gate}`}>
      <div ref={ref} className="qp-measure qp-circuit" style={{ height: h * scale }}>
        {w > 0 && (
          <div className="qp-circuit__inner" style={{ transform: `scale(${scale})`, width: drawW }}>
            <QCircuit per={b} axes={axes} gate={gate} reach={q.reach} strength={q.strength} w={drawW} rowH={rowH} title={`Circuit · ${n}³`}
              sub={`style ${gate} · s ${q.strength.toFixed(2)} · r ${q.reach.toFixed(2)}`} />
          </div>
        )}
      </div>
    </Blk>
  )
}

// 3 · How the blur works ───────────────────────────────────────────────────────────────────────────
const DEMO_N = 16, DEMO_B = 4
const DEMO_IN: number[] = Array.from({ length: DEMO_N }, (_, i) => (i >= 5 && i <= 9 ? 1 : 0))

function BlurBlk({ sel }: { sel: number | null }) {
  const q = useStore((s) => s.q)
  const level = useStore((s) => s.m.level)
  const still = usePrefersStill()
  const [playing, setPlaying] = useState(true)
  const [step, setStep] = useState(0)
  const style = gateOf(q.style)
  const G = useMemo(() => { const g: { k: number; L: string }[] = []; for (let k = 0; k < DEMO_B; k++) for (const L of style) g.push({ k, L }); return g }, [style])
  const animate = playing && !still
  useEffect(() => {
    if (!animate) return
    const id = setInterval(() => setStep((s) => (s + 1) % (G.length + 3)), 1100)
    return () => clearInterval(id)
  }, [animate, G.length])
  const upto = animate ? Math.min(step, G.length) : G.length
  const out = useMemo(() => {
    const tot = DEMO_IN.reduce((a, v) => a + v, 0)
    const re = new Float64Array(DEMO_N), im = new Float64Array(DEMO_N)
    for (let i = 0; i < DEMO_N; i++) re[gray(i)] = Math.sqrt(DEMO_IN[i] / tot)
    G.slice(0, upto).forEach((g) => rotate(re, im, g.k, g.L, Math.PI * thetaPi(g.k, q.strength, q.reach)))
    return DEMO_IN.map((_, i) => (re[gray(i)] ** 2 + im[gray(i)] ** 2) * tot)
  }, [G, upto, q.strength, q.reach])
  const cur = upto > 0 ? G[upto - 1] : null
  const k = sel != null && sel < DEMO_B ? sel : cur?.k ?? 0
  const [ref, w] = useWidth()
  const L = 34, W = Math.min(w, 620), cw = Math.max(4, (W - L) / DEMO_N), sq = Math.min(cw - 2, 14)
  const cx = (i: number) => L + i * cw + cw / 2
  const mask = (1 << (k + 1)) - 1
  const arcs: string[] = []
  for (let i = 0; i < DEMO_N; i++) {
    const j = i ^ mask
    if (i < j) { const rx = (cx(j) - cx(i)) / 2, ry = Math.min(30, rx * 0.45 + 4); arcs.push(`M${cx(i).toFixed(1)} 58 A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 0 ${cx(j).toFixed(1)} 58`) }
  }
  const base = 176, hMax = 70, top = 1.25
  const sumOut = out.reduce((a, v) => a + v, 0)
  return (
    <Blk id="q-blur" label="How the blur works" tools={
      <Pill tip={animate ? 'Pause' : 'Play'} desc="Apply the rotations one at a time" onClick={() => { setPlaying(!playing); if (!playing) setStep(0) }}>{animate ? 'Pause' : 'Play'}</Pill>
    }>
      <div className="qp-row">
        <span className="qp-num">{upto < G.length ? `gate ${upto} / ${G.length}${cur ? ` · q${cur.k} R${cur.L} ${thetaPi(cur.k, q.strength, q.reach).toFixed(2)}π` : ''}` : `all ${G.length} gates`}</span>
        <span className="qp-num qp-num--dim">arcs · q{k} pairs</span>
      </div>
      <div ref={ref} className="qp-measure">
        {W > 0 && (
          <svg className="qp-svg" width={W} height={base + 6} viewBox={`0 0 ${W} ${base + 6}`}>
            <text x={0} y={19} fontSize={11} fill="var(--qs-ink3)">in</text>
            <text x={0} y={42} fontSize={11} fill="var(--qs-ink3)">gray</text>
            <text x={0} y={72} fontSize={11} fill="var(--qs-ink3)">turn</text>
            <text x={0} y={base - 2} fontSize={11} fill="var(--qs-ink3)">out</text>
            {DEMO_IN.map((v, i) => (
              <rect key={'i' + i} x={cx(i) - sq / 2} y={8} width={sq} height={sq} rx={2} fill={v ? 'var(--qs-ink)' : 'none'} stroke={v ? 'var(--qs-ink)' : 'var(--qs-ink4)'} strokeWidth={1} />
            ))}
            {DEMO_IN.map((_, i) => Array.from({ length: DEMO_B }, (_, bit) => {
              const one = (gray(i) >> bit) & 1
              return <circle key={`g${i}-${bit}`} cx={cx(i)} cy={30 + bit * 4} r={one ? 1.5 : 0.6} fill={bit === k ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />
            }))}
            {arcs.map((d, i) => <path key={'a' + i} d={d} fill="none" stroke="var(--qs-ink)" strokeWidth={1} opacity={0.75} />)}
            <line x1={L} x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--qs-ink4)" strokeWidth={1} />
            <line x1={L} x2={W} y1={base - (level / top) * hMax} y2={base - (level / top) * hMax} stroke="var(--qs-ink3)" strokeWidth={1} strokeDasharray="2 3" />
            {out.map((v, i) => {
              const hin = (DEMO_IN[i] / top) * hMax, h = (Math.min(v, top) / top) * hMax
              return (
                <g key={'o' + i}>
                  {DEMO_IN[i] > 0 && <rect x={cx(i) - sq / 2 + 0.5} y={base - hin} width={sq - 1} height={hin} fill="none" stroke="var(--qs-ink4)" strokeWidth={1} />}
                  <rect x={cx(i) - sq / 2} y={base - h} width={sq} height={h} fill={v >= level ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <p className="qp-note">A line of 16 cells is Gray-coded onto 4 qubits; each qubit turns by θ = π × strength × weight and swaps value with the cells its arcs join. The blur moves value, it does not add any: sum in {DEMO_IN.reduce((a, v) => a + v, 0).toFixed(2)} · out {sumOut.toFixed(2)}.</p>
      <LiveRow />
    </Blk>
  )
}

/** The centre row along X at the slice, input against result. */
function LiveRow() {
  const g = useStore((s) => s.gridData)
  const p = useStore((s) => s.procData)
  const slice = useStore((s) => s.slice)
  const level = useStore((s) => s.m.level)
  const [ref, w] = useWidth()
  if (!g) return <Empty>Voxelise a model to see one of its rows blurred here.</Empty>
  const n = g.n
  const y = Math.floor(n / 2)
  const z = slice.axis === 'z' ? Math.min(n - 1, slice.index) : Math.floor(n / 2)
  const inp = Array.from({ length: n }, (_, x) => at(g, x, y, z))
  const res = p && p.n === n ? Array.from({ length: n }, (_, x) => at(p, x, y, z)) : null
  const top = Math.max(1, ...inp, ...(res ?? []))
  const H = 64, bw = w / n
  return (
    <div className="qp-col">
      <div className="qp-row">
        <span className="qp-k">Live row · y {y} · z {z}</span>
        <span className="qp-num qp-num--dim">{res ? `in ${inp.reduce((a, v) => a + v, 0).toFixed(1)} · out ${res.reduce((a, v) => a + v, 0).toFixed(1)}` : 'no result yet'}</span>
      </div>
      <div ref={ref} className="qp-measure">
        {w > 0 && (
          <svg className="qp-svg" width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
            <line x1={0} x2={w} y1={H - 0.5} y2={H - 0.5} stroke="var(--qs-ink4)" strokeWidth={1} />
            <line x1={0} x2={w} y1={H - (level / top) * (H - 2)} y2={H - (level / top) * (H - 2)} stroke="var(--qs-ink3)" strokeWidth={1} strokeDasharray="2 3" />
            {inp.map((v, x) => {
              const r = res ? res[x] : null
              const hi = (Math.max(0, v) / top) * (H - 2), hr = r == null ? 0 : (Math.max(0, r) / top) * (H - 2)
              return (
                <g key={x} data-tip={`x ${x}`} data-tip-desc={`in ${v.toFixed(2)}${r == null ? '' : ` · out ${r.toFixed(2)}`}`} data-tip-side="top">
                  <rect x={x * bw} y={0} width={bw} height={H} fill="transparent" />
                  <rect x={x * bw + bw * 0.1} y={H - hi} width={Math.max(0.5, bw * 0.8)} height={hi} fill="var(--qs-ink4)" />
                  {r != null && <rect x={x * bw + bw * 0.3} y={H - hr} width={Math.max(0.5, bw * 0.4)} height={hr} fill="var(--qs-ink)" />}
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <p className="qp-note">Grey is the voxel row, ink the processed one; the dashed line is the mesh level.</p>
    </div>
  )
}

// 4 · Pulse schedule ───────────────────────────────────────────────────────────────────────────────
function PulseBlk({ sel }: { sel: number | null }) {
  const q = useStore((s) => s.q)
  const { b } = useBits()
  const style = gateOf(q.style)
  const still = usePrefersStill()
  const ths = Array.from({ length: b }, (_, k) => thetaPi(k, q.strength, q.reach))
  const slot = Math.max(1e-6, ...ths) // each letter gets a column as long as the longest turn
  const span = slot * style.length * 1.08
  return (
    <Blk id="q-pulse" label="Pulse schedule" note={`${style.split('').map((L) => 'R' + L).join(' · ')} · per axis`}>
      <div className="qp-pulse">
        {ths.map((t, k) => (
          <div key={k} className={'qp-lane' + (sel == null || sel === k ? ' qp-lane--sel' : '')}>
            <span className="qp-lane__q">q{k}</span>
            <span className="qp-lane__track">
              {style.split('').map((L, li) => (
                <span key={li} className={L === 'x' ? 'qp-seg-x' : 'qp-seg-y'}
                  style={{ left: `${((li * slot * 1.04) / span) * 100}%`, width: `${(t / span) * 100}%` }}
                  data-tip={`q${k} · R${L} ${t.toFixed(3)}π`} data-tip-desc="Pulse length ∝ angle" data-tip-side="top" />
              ))}
            </span>
            <span className="qp-lane__m">M</span>
          </div>
        ))}
        {!still && <span className="qp-playhead" style={{ marginLeft: 34 }} aria-hidden />}
      </div>
      <div className="qp-legend qp-num qp-num--dim">
        <span><span className="qp-seg-x" style={{ position: 'static', width: 14, height: 6 }} />Rx</span>
        <span><span className="qp-seg-y" style={{ position: 'static', width: 14, height: 6 }} />Ry</span>
        <span>longest {(slot).toFixed(2)}π</span>
      </div>
      <p className="qp-note">How the rotations could map to drive pulses on one axis (X, Y and Z run the same). The app sends circuit settings to Atlas, not pulses; this is a way to read them.</p>
    </Blk>
  )
}

// 5 · Atlas ────────────────────────────────────────────────────────────────────────────────────────
const PATH = ['Browser', 'Flask', 'Atlas API', 'Queue', 'Blur Core', 'Result', 'Cache', 'Stitch']
const REMOTE = new Set([2, 3, 4, 5])

function AtlasBlk() {
  const grid = useStore((s) => s.grid)
  const q = useStore((s) => s.q)
  const job = useStore((s) => s.job)
  const proc = useStore((s) => s.proc)
  const busy = useStore((s) => !!s.busy.proc)
  const setQ = useStore((s) => s.setQ)
  if (!grid) return <Blk id="q-atlas" label="Atlas"><Empty>Voxelise a model to see how it splits into Atlas jobs.</Empty></Blk>
  const tl = grid.tiles[q.tiling]
  const perJob = tl.shape.reduce((a, v) => a * v, 1)
  const running = job?.status === 'running'
  const live = job && !job.stale
  const total = live ? job.tiles_total : tl.jobs
  const cached = live ? job.tiles_cached : proc?.tiles?.cached ?? 0
  const doneN = live ? Math.max(job.tiles_done, cached) : proc && proc.mode === 'atlas' ? total : 0
  const runN = running ? Math.min(3, Math.max(0, total - doneN)) : 0
  const tiles = Array.from({ length: total }, (_, i) => (i < cached ? 'cached' : i < doneN ? 'done' : i < doneN + runN ? 'running' : running ? 'queued' : 'idle'))

  // request path stage
  let cur = -1
  if (running) {
    const s = (job.atlas_status || '').toLowerCase()
    cur = /queue|pend|submit|wait/.test(s) ? 3 : job.tiles_done > 0 ? 5 : /run|process/.test(s) ? 4 : 2
  } else if (busy) cur = 1
  else if (proc) cur = PATH.length
  const skip = (i: number) => (q.mode !== 'atlas' || (proc?.cached && !running)) && REMOTE.has(i)

  return (
    <Blk id="q-atlas" label="Atlas" note={job ? `job ${job.job_id.slice(0, 6)} · ${job.atlas_status || job.status}` : q.mode} tools={
      <span className="qp-seg">
        {(['cube', 'layers'] as const).map((t) => (
          <Pill key={t} on={q.tiling === t} tip={t === 'cube' ? 'Cube tiles' : 'Layer slabs'} desc={t === 'cube' ? 'Split the grid into blocks' : 'Send slabs bottom to top'} onClick={() => setQ({ tiling: t })}>{t}</Pill>
        ))}
      </span>
    }>
      <div className="figs">
        <Hero k="Jobs" v={fmt.int(tl.jobs)} note={`${tl.shape.join(' × ')} per tile`} />
        <Hero k="Per job" v={fmt.int(perJob)} note="values, of 65,536" />
        {job && <Hero k="Elapsed" v={job.elapsed.toFixed(1)} unit="s" note={running ? 'running' : job.status} />}
      </div>
      <div className="qp-col">
        <div className="qp-row"><span className="qp-k">Values per job</span><span className="qp-num">{((perJob / ATLAS_LIMIT) * 100).toFixed(0)}% of limit</span></div>
        <div className="qp-limit" data-tip={`${fmt.int(perJob)} values per job`} data-tip-desc="Atlas takes at most 65,536 values (2^16) per job; larger grids are tiled">
          <span className={'qp-limit__fill' + (perJob > ATLAS_LIMIT ? ' qp-limit__fill--over' : '')} style={{ width: `${Math.min(100, (perJob / ATLAS_LIMIT) * 100)}%` }} />
        </div>
      </div>
      <div className="qp-col">
        <div className="qp-row">
          <span className="qp-k">Tiles · {total}</span>
          <span className="qp-num qp-num--dim" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={'qp-poll' + (running ? ' qp-poll--on' : '')} />
            {running ? `polls every 2 s · ${runN} running` : 'polls every 2 s · 3 at a time'}
          </span>
        </div>
        <div className="qp-tiles">
          {tiles.map((t, i) => <span key={i} className={'qp-tile qp-tile--' + t} data-tip={`Tile ${i + 1}`} data-tip-desc={t} data-tip-side="top" />)}
        </div>
        <div className="qp-legend qp-num qp-num--dim">
          <span><span className="qp-tile qp-tile--done" />{Math.max(0, doneN - cached)} done</span>
          <span><span className="qp-tile qp-tile--cached" />{cached} cached</span>
          {running && <span><span className="qp-tile qp-tile--running" />{runN} running</span>}
          {live && job.frontier != null && <span>complete to z {job.frontier}</span>}
          {live && <span>v{job.version}</span>}
        </div>
      </div>
      <div className="qp-col">
        <span className="qp-k">Request path</span>
        <div className="qp-path">
          {PATH.map((t, i) => {
            const state = i < cur ? 'past' : i === cur ? 'cur' : 'todo'
            return (
              <span key={t} className="qp-hop">
                <span className={'qp-node' + (state === 'todo' ? '' : ' qp-node--' + state) + (skip(i) ? ' qp-node--skip' : '')}>{t}</span>
                {i < PATH.length - 1 && <span className={'qp-link' + (i + 1 < cur ? ' qp-link--past' : i + 1 === cur ? ' qp-link--cur' : '')} />}
              </span>
            )
          })}
        </div>
        <p className="qp-note">{q.mode === 'atlas' ? 'Up to three jobs run at once; cached tiles are not sent again and empty tiles are skipped.' : 'Emulation runs on this machine and skips the remote hops.'}</p>
      </div>
    </Blk>
  )
}

// 6 · Shots and error ──────────────────────────────────────────────────────────────────────────────
const SHOT_PRESETS: (number | null)[] = [256, 1024, 4096, 16384, 65536, null]
const shortN = (v: number) => (v >= 1024 ? `${v / 1024}k` : String(v))

function ShotsBlk() {
  const shots = useStore((s) => s.q.shots)
  const setQ = useStore((s) => s.setQ)
  const [ref, w] = useWidth()
  const W = Math.min(w, 560), H = 112, padR = 40, base = H - 18, hTop = 10
  const lo = 6, hi = 16 // log2 domain 64 … 65,536
  const xs = (l: number) => ((l - lo) / (hi - lo)) * (W - padR)
  const err = (s: number) => 1 / Math.sqrt(s)
  const ys = (e: number) => base - (e / err(2 ** lo)) * (base - hTop)
  const pts = Array.from({ length: 41 }, (_, i) => { const l = lo + ((hi - lo) * i) / 40; return `${xs(l).toFixed(1)},${ys(err(2 ** l)).toFixed(1)}` }).join(' ')
  const exactX = W - 14
  const mx = shots ? xs(Math.min(hi, Math.max(lo, Math.log2(shots)))) : exactX
  const my = shots ? ys(err(Math.max(2 ** lo, shots))) : base
  const label = shots ? `${fmt.int(shots)} · ±${(err(shots) * 100).toFixed(1)}%` : 'exact'
  return (
    <Blk id="q-shots" label="Shots and error" note={label}>
      <div ref={ref} className="qp-measure">
        {W > 0 && (
          <svg className="qp-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--qs-ink4)" strokeWidth={1} />
            <polyline points={pts} fill="none" stroke="var(--qs-ink)" strokeWidth={1} />
            <line x1={xs(hi)} x2={exactX} y1={base - 0.5} y2={base - 0.5} stroke="var(--qs-ink3)" strokeWidth={1} strokeDasharray="2 3" />
            {[6, 8, 10, 12, 14, 16].map((l) => <text key={l} x={xs(l)} y={H - 3} fontSize={11} fill="var(--qs-ink3)" textAnchor={l === lo ? 'start' : 'middle'}>{shortN(2 ** l)}</text>)}
            <text x={exactX} y={H - 3} fontSize={11} fill="var(--qs-ink3)" textAnchor="end">exact</text>
            <line x1={mx} x2={mx} y1={my} y2={base} stroke="var(--qs-ink)" strokeWidth={1} strokeDasharray="1 2" />
            <circle cx={mx} cy={my} r={3.5} fill="var(--qs-ink)" />
            <text x={Math.min(mx + 7, W - 4)} y={my - 7} fontSize={11} fill="var(--qs-ink)" textAnchor={mx + 90 > W ? 'end' : 'start'}>{label}</text>
          </svg>
        )}
      </div>
      <div className="qp-seg" style={{ alignSelf: 'flex-start' }}>
        {SHOT_PRESETS.map((s) => (
          <Pill key={String(s)} on={shots === s || (s == null && !shots)} tip={s ? `${fmt.int(s)} shots` : 'Exact'}
            desc={s ? `About ±${(err(s) * 100).toFixed(1)}% per cell` : 'No sampling: the state vector is read exactly'}
            onClick={() => setQ({ shots: s })}>{s ? shortN(s) : 'exact'}</Pill>
        ))}
      </div>
      <p className="qp-note">Measured values carry sampling noise that falls as 1/√shots. Leave shots empty for exact.</p>
    </Blk>
  )
}

// 7 · Runs ─────────────────────────────────────────────────────────────────────────────────────────
function RunsBlk() {
  const list = useRuns()
  const q = useStore((s) => s.q)
  const proc = useStore((s) => s.proc)
  const [ref, w] = useWidth()
  const restore = (r: RunRec) => useStore.getState().setQ({ mode: r.mode, strength: r.strength, reach: r.reach, style: r.style, axes: r.axes, shots: r.shots, tiling: r.tiling })
  if (!list.length) return <Blk id="q-runs" label="Runs"><Empty>Each processing run this session lands here, so you can compare and go back to one.</Empty></Blk>
  const W = Math.min(w, 360), H = Math.min(150, Math.max(110, W * 0.42)), P = 16
  const sx = (v: number) => P + Math.min(1, Math.max(0, v)) * (W - 2 * P)
  const sy = (v: number) => H - P - Math.min(1, Math.max(0, v)) * (H - 2 * P)
  const rows = [...list].reverse().slice(0, 12)
  return (
    <Blk id="q-runs" label="Runs" note={`${list.length} this session`}>
      <div ref={ref} className="qp-measure">
        {W > 0 && (
          <svg className="qp-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} rx={10} fill="none" stroke="var(--qs-line)" strokeWidth={1} />
            <text x={P} y={H - 3} fontSize={11} fill="var(--qs-ink3)">strength →</text>
            <text x={P - 4} y={P - 5} fontSize={11} fill="var(--qs-ink3)">↑ reach</text>
            <line x1={sx(q.strength)} x2={sx(q.strength)} y1={P} y2={H - P} stroke="var(--qs-ink4)" strokeWidth={1} strokeDasharray="2 3" />
            <line x1={P} x2={W - P} y1={sy(q.reach)} y2={sy(q.reach)} stroke="var(--qs-ink4)" strokeWidth={1} strokeDasharray="2 3" />
            {list.map((r, i) => (
              <g key={r.id} className="qp-dot" onClick={() => restore(r)} data-tip={`${r.run} · ${r.mode}`}
                data-tip-desc={`strength ${r.strength.toFixed(2)} · reach ${r.reach.toFixed(2)} · ${r.style} · click to restore`}>
                <circle cx={sx(r.strength)} cy={sy(r.reach)} r={9} fill="transparent" />
                <circle cx={sx(r.strength)} cy={sy(r.reach)} r={proc?.proc_id === r.id ? 4.5 : 3}
                  fill={proc?.proc_id === r.id ? 'var(--qs-ink)' : 'var(--qs-bg)'} stroke={i === list.length - 1 || proc?.proc_id === r.id ? 'var(--qs-ink)' : 'var(--qs-ink3)'} strokeWidth={1} />
              </g>
            ))}
          </svg>
        )}
      </div>
      <div className="qp-runs" role="list">
        <div className="qp-run qp-run--head"><span>Run</span><span>Mode</span><span>Str</span><span>Reach</span><span className="qp-wide">Time</span><span className="qp-wide">Max</span></div>
        {rows.map((r) => (
          <button type="button" key={r.id} role="listitem" className={'qp-run' + (proc?.proc_id === r.id ? ' qp-run--cur' : '')} onClick={() => restore(r)}
            data-tip={`Restore ${r.run}`} data-tip-desc={`${r.mode} · style ${r.style} · axes ${r.axes.map((a) => 'XYZ'[a]).join('')}${r.shots ? ` · ${fmt.int(r.shots)} shots` : ''}${r.cached ? ' · from cache' : ''}`}>
            <span>{r.run}</span><span>{r.mode === 'emulator' ? 'emulation' : r.mode}</span>
            <span>{r.strength.toFixed(2)}</span><span>{r.reach.toFixed(2)}</span>
            <span className="qp-wide">{r.seconds == null ? '—' : `${r.seconds.toFixed(1)} s`}</span>
            <span className="qp-wide">{r.max.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </Blk>
  )
}

// 8 · Levels ───────────────────────────────────────────────────────────────────────────────────────
function LevelsBlk() {
  const p = useStore((s) => s.procData)
  const level = useStore((s) => s.m.level)
  const setM = useStore((s) => s.setM)
  const bins = useMemo(() => (p ? histogram(p, 40) : []), [p])
  const [ref, w] = useWidth()
  const [drag, setDrag] = useState(false)
  if (!p) return <Blk id="q-levels" label="Levels"><Empty>Process the grid to see how its densities fall against the mesh level.</Empty></Blk>
  const n = bins.length, H = 64, bw = w / n
  const total = Math.max(1, bins.reduce((a, b) => a + b, 0))
  const peak = Math.sqrt(Math.max(1, ...bins))
  // kept share: of the non-empty cells, the part at or above each level
  const share: number[] = []
  let acc = total
  for (const b of bins) { share.push(acc / total); acc -= b }
  const kept = bins.reduce((a, b, i) => ((i + 0.5) / n >= level ? a + b : a), 0)
  const curve = share.map((s, i) => `${(i * bw).toFixed(1)},${(H - 1 - s * (H - 4)).toFixed(1)}`).join(' ')
  const pick = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setM({ level: Math.min(0.95, Math.max(0.05, +((e.clientX - r.left) / r.width).toFixed(2))) })
  }
  return (
    <Blk id="q-levels" label="Levels" note={`level ${level.toFixed(2)}`}>
      <div className="figs">
        <Hero k="Kept" v={fmt.pct(kept / total)} note={`${fmt.int(kept)} of ${fmt.int(total)} cells`} />
      </div>
      <div ref={ref} className="qp-measure qp-levels" data-tip="Drag to set the level" data-tip-desc="Bars at or above the level become the mesh; the curve is the share kept at each level" data-tip-side="top"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); pick(e) }}
        onPointerMove={(e) => { if (drag) pick(e) }} onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}>
        {w > 0 && (
          <svg className="qp-svg" width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
            {bins.map((b, i) => {
              const h = (Math.sqrt(b) / peak) * (H - 4)
              return <rect key={i} x={i * bw + bw * 0.12} y={H - h} width={bw * 0.76} height={h} fill={(i + 0.5) / n >= level ? 'var(--qs-ink)' : 'var(--qs-ink4)'} />
            })}
            <polyline points={curve} fill="none" stroke="var(--qs-ink2)" strokeWidth={1} />
            <line x1={0} x2={w} y1={H - 0.5} y2={H - 0.5} stroke="var(--qs-ink4)" strokeWidth={1} />
            <line x1={level * w} x2={level * w} y1={0} y2={H} stroke="var(--qs-ink)" strokeWidth={1} />
            <circle cx={level * w} cy={3} r={3} fill="var(--qs-ink)" />
          </svg>
        )}
      </div>
      <div className="qp-row"><span className="qp-num qp-num--dim">0</span><span className="qp-num qp-num--dim">density √count · kept share</span><span className="qp-num qp-num--dim">1</span></div>
    </Blk>
  )
}
