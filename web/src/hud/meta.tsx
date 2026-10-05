// Metadata blocks in the lab style: "HISTORY — BASE … / TYPE …", "SCENE — SAMPLES …, SEED …, MODEL …".
// Intrinsically sized; the composer puts them in the tl / tr slots.
import type { HudCtx, HudModule } from './types'
import './lab.css'

type Row = [string, string, boolean?] // key, value, dim

const fmt = (n: number) => n.toLocaleString('en-US')
const AX = ['X', 'Y', 'Z']
const MODE: Record<string, string> = { gaussian: 'Gaussian', emulator: 'Emulator', atlas: 'Atlas', nations: 'Evolve' }
const modeName = (m: string) => MODE[m] ?? m

function base(path: string) {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i >= 0 ? path.slice(i + 1) : path
}

/** FNV-1a, 8 hex digits: a stable seed-like tag for a run when there is no job id. */
function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Qubits per axis for an n-cell edge: the emulator caps the register at 32 positions. */
const qubitsPerAxis = (n: number) => Math.ceil(Math.log2(Math.max(2, Math.min(n, 32))))

function Block({ title, tag, rows }: { title: string; tag?: string; rows: Row[] }) {
  return (
    <div className="qs-lab-meta">
      <div className="qs-lab-meta__title">
        <span>{title}</span>
        {tag && <i>— {tag}</i>}
      </div>
      {rows.map(([k, v, dim]) => (
        <div key={k} className="qs-lab-meta__row">
          <span className="qs-lab-meta__k">{k}</span>
          <span className={'qs-lab-meta__v' + (dim ? ' qs-lab-meta__v--dim' : '')}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function historyRows(c: HudCtx): Row[] {
  const g = c.grid
  const file = c.model ? base(c.model.file || c.model.name) : null
  const run = c.proc?.run ?? c.q.run
  return [
    ['Base', file ?? 'no model', !file],
    ['Type', g ? `${g.n}³ · ${g.values}` : `${c.n}³ · —`, !g],
    ['Run', `${run} · ${modeName(c.proc?.mode ?? c.q.mode).toLowerCase()}`],
  ]
}

function sceneRows(c: HudCtx): Row[] {
  const seed = c.job?.job_id ?? c.proc?.job_id ?? hash(JSON.stringify([c.q.run, c.q.mode, c.q.strength, c.q.reach, c.q.style, c.q.axes, c.n]))
  const cells = c.grid ? `${fmt(c.grid.solid)} / ${fmt(c.grid.total)}` : '—'
  return [
    ['Samples', c.q.shots != null ? fmt(c.q.shots) : 'exact'],
    ['Seed', seed.slice(0, 9)],
    ['Model', `${modeName(c.q.mode)} · ${c.q.tiling}`],
    ['Cells', cells, !c.grid],
    ['Level', c.level.toFixed(2)],
  ]
}

function quantumRows(c: HudCtx): Row[] {
  const qa = qubitsPerAxis(c.n)
  const axes = c.q.axes.length ? c.q.axes.map((a) => AX[a] ?? String(a)).join(' ') : '—'
  return [
    ['Qubits', `${qa} per axis · ${qa * 3}`],
    ['Strength', c.q.strength.toFixed(2)],
    ['Reach', c.q.reach.toFixed(2)],
    ['Style', c.q.style],
    ['Axes', axes],
  ]
}

const History = ({ ctx }: { ctx: HudCtx }) => <Block title="History" tag={ctx.model ? 'base' : undefined} rows={historyRows(ctx)} />
const Scene = ({ ctx }: { ctx: HudCtx }) => <Block title="Scene" rows={sceneRows(ctx)} />
const Quantum = ({ ctx }: { ctx: HudCtx }) => <Block title="Quantum" tag={modeName(ctx.q.mode).toLowerCase()} rows={quantumRows(ctx)} />

/** History and scene side by side (v3), for one corner slot. */
const Both = ({ ctx }: { ctx: HudCtx }) => (
  <div className="qs-lab-meta-pair">
    <History ctx={ctx} />
    <Scene ctx={ctx} />
  </div>
)

export const META_MODULES: HudModule[] = [
  {
    family: 'meta',
    id: 'v1',
    label: 'history',
    desc: 'Where this result came from: the model file, the grid and the run.',
    slot: 'tl',
    render: (ctx) => <History ctx={ctx} />,
  },
  {
    family: 'meta',
    id: 'v2',
    label: 'scene',
    desc: 'How it was computed: samples, seed, engine, solid cells and level.',
    slot: 'tr',
    render: (ctx) => <Scene ctx={ctx} />,
  },
  {
    family: 'meta',
    id: 'v3',
    label: 'both',
    desc: 'History and scene together in one corner.',
    slot: 'tl',
    render: (ctx) => <Both ctx={ctx} />,
  },
  {
    family: 'meta',
    id: 'v4',
    label: 'quantum',
    desc: 'The quantum settings: qubits per axis, strength, reach, style and axes.',
    slot: 'tr',
    render: (ctx) => <Quantum ctx={ctx} />,
  },
]

/** v3 split across both corners, for a composer that can place two blocks for one variant. */
export const META_SPLIT: HudModule[] = [
  { ...META_MODULES[0], id: 'v3-tl' },
  { ...META_MODULES[1], id: 'v3-tr' },
]
