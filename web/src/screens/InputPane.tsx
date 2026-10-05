// Lab · inputs. Everything you set, and nothing you read: results live in the properties on the right.
// After Blender's properties editor: a rail of step tabs (Model, Voxelise, Quantum or Evolve, Mesh),
// one step at a time, each made of panels that fold. The rail follows the focus, so the step you open
// is the step the workspace shows, and the other way round. Steps and panels follow Peiyan's page.
import { useRef } from 'react'
import { useStore, NATIONS_MAX_GRID, type Stage as StageName } from '../store'
import type { Fill, Field as FieldKind, UpAxis, Values, VFilter } from '../api'
import { Segmented, AxisToggle } from '../qs/Segmented'
import { Slider, Select, Input } from '../qs/Slider'
import { Icon } from '../qs/Icon'
import { ScrollArea } from '../qs/ScrollArea'
import { Panel, Row, Note, Button, Buttons } from '../ui/Panel'
import { Spinner } from './parts'
import { fmt } from './fmt'
import { MODEL_EXT } from './modelExt'
import { RunBar } from './RunBar'
import { ShapePicker } from './Shapes'

type Step = 'model' | 'voxels' | 'quantum' | 'mesh'
const stepOf = (s: StageName): Step => (s === 'evolve' || s === 'scan' ? 'quantum' : s)

/** The left column of Lab: the step rail and the open step's panels. `only` shows one step without the rail (Explore). */
export function InputPane({ only }: { only?: Step }) {
  const focus = useStore((s) => s.focus.stage)
  const setFocus = useStore((s) => s.setFocus)
  const st = {
    model: useStore((s) => !!s.model), grid: useStore((s) => !!s.grid), proc: useStore((s) => !!s.proc), mesh: useStore((s) => !!s.report),
    mode: useStore((s) => s.q.mode),
    busy: useStore((s) => (s.busy.model ? 'model' : s.busy.vox ? 'voxels' : s.busy.proc || s.busy.evolve ? 'quantum' : s.busy.mesh ? 'mesh' : null)),
  }
  const evolve = st.mode === 'nations'
  const step = only ?? stepOf(focus)
  const RAIL: { id: Step; icon: string; t: string; done: boolean; off: boolean }[] = [
    { id: 'model', icon: 'model', t: 'Model', done: st.model, off: false },
    { id: 'voxels', icon: 'grid', t: 'Voxelise', done: st.grid, off: !st.model },
    { id: 'quantum', icon: evolve ? 'entangle' : 'quantum', t: evolve ? 'Evolve' : 'Quantum', done: st.proc, off: !st.grid },
    { id: 'mesh', icon: 'print', t: 'Mesh', done: st.mesh, off: !st.proc },
  ]
  const open = (r: (typeof RAIL)[number]) => setFocus(r.id === 'quantum' ? (evolve ? 'evolve' : 'quantum') : r.id, `Editing ${r.t.toLowerCase()}`)
  const cur = RAIL.find((r) => r.id === step)!
  return (
    <div className={'lab-in' + (only ? ' lab-in--only' : '')}>
      {!only && (
        <nav className="lab-rail" aria-label="Steps">
          {RAIL.map((r, i) => (
            <button key={r.id} className={'lab-rail__b' + (r.id === step ? ' lab-rail__b--on' : '')} disabled={r.off} onClick={() => open(r)}
              aria-current={r.id === step ? 'step' : undefined} data-tip={`${String(i + 1).padStart(2, '0')} ${r.t}`} data-tip-side="right">
              <Icon name={r.icon} size={16} />
              {st.busy === r.id ? <span className="lab-rail__busy" /> : r.done ? <span className="lab-rail__done" /> : null}
            </button>
          ))}
        </nav>
      )}
      <div className="lab-in__page">
        <header className="lab-in__head">
          <span className="lab-in__no">{String(RAIL.indexOf(cur) + 1).padStart(2, '0')}</span>
          <span className="lab-in__t">{cur.t}</span>
          {st.busy === cur.id && <Spinner />}
        </header>
        <ScrollArea className="lab-in__scroll" bar={false}>
          {step === 'model' && <ModelIn />}
          {step === 'voxels' && <VoxIn />}
          {step === 'quantum' && <QuantumIn />}
          {step === 'mesh' && <MeshIn />}
          <div style={{ height: 24 }} />
        </ScrollArea>
        <RunBar step={step} />
      </div>
    </div>
  )
}

// ── 01 model ─────────────────────────────────────────────────────────────────────────────────────
const UP: { value: UpAxis; label: string }[] = [
  { value: '+z', label: '+Z · 3D print' }, { value: '+y', label: '+Y · Blender, glTF' }, { value: '+x', label: '+X' },
  { value: '-z', label: '−Z · upside down' }, { value: '-y', label: '−Y' }, { value: '-x', label: '−X' },
]

function ModelIn() {
  const st = useStore()
  const file = useRef<HTMLInputElement>(null)
  const { model } = st
  return (
    <>
      <Panel id="in-model-source" title="Source" aside={model ? (model.builtin ? 'test cup' : model.file) : 'none'}>
        <input ref={file} type="file" hidden accept={MODEL_EXT.join(',')} onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) st.upload(f)
          e.target.value = ''
        }} />
        <Buttons>
          <Button kind="primary" onClick={() => file.current?.click()} tip="Open a mesh" desc={MODEL_EXT.join(' ')}>Open file…</Button>
        </Buttons>
        <Row label="Or start from a shape"><ShapePicker /></Row>
        {st.recent.length > 0 && (
          <Select label="Recent" value={model?.file ?? ''}
            options={[{ value: '', label: model ? '—' : 'Choose…' }, ...st.recent.map((r) => ({ value: r.name, label: `${r.name} · ${r.mb} MB` }))]}
            onChange={(v) => v && st.openRecent(v)} />
        )}
      </Panel>
      <Panel id="in-model-orient" title="Orientation">
        <Select label="Up axis" value={st.up} options={UP} onChange={(v) => st.setUp(v)} help="Which axis is up in the file." />
        {model?.lying && <Note warn>Looks like it is lying along {model.lying}. Try another up axis.</Note>}
      </Panel>
    </>
  )
}

// ── 02 voxelise ──────────────────────────────────────────────────────────────────────────────────
function VoxIn() {
  const st = useStore()
  const { vox } = st
  return (
    <>
      <Panel id="in-vox-grid" title="Grid" aside={`${vox.n}³`}>
        <Row label="Resolution">
          <Segmented size="s" options={[16, 32, 64, 128, 256].map((n) => ({ value: String(n), label: `${n}` }))} value={String(vox.n)} onChange={(v) => st.setVox({ n: +v })} aria-label="Resolution" />
        </Row>
        <Slider label="Padding" value={vox.pad} min={0} max={6} step={1} format={(v) => `${v} cells`} onChange={(v) => st.setVox({ pad: v })} help="Empty cells kept around the model." />
      </Panel>
      <Panel id="in-vox-fill" title="Fill">
        <Select<Fill> label="Inside" value={vox.fill} onChange={(v) => st.setVox({ fill: v })} options={[
          { value: 'holes', label: 'Fill enclosed' },
          { value: 'capped', label: 'Cap, then fill' },
          { value: 'none', label: 'Shell only' },
        ]} help="How the inside is filled. Cap first for scans that are open underneath." />
        <Select<Values> label="Cell values" value={vox.values} onChange={(v) => st.setVox({ values: v })}
          options={[{ value: 'coverage', label: 'Coverage' }, { value: 'binary', label: '0 or 1' }]}
          help="Coverage stores how much of each cell the model occupies, so 0.5 is the true surface. 0 or 1 comes out about half a voxel fat." />
      </Panel>
    </>
  )
}

// ── 03 quantum ───────────────────────────────────────────────────────────────────────────────────
/** θ_k = π · strength · ((1 − reach) · 2^−k + reach), as in app/emulator.py. */
function QubitBars() {
  const q = useStore((s) => s.q)
  const n = useStore((s) => s.grid?.n ?? 32)
  const bits = Math.ceil(Math.log2(Math.min(n, 32)))
  const th = Array.from({ length: bits }, (_, k) => q.strength * ((1 - q.reach) * 2 ** -k + q.reach))
  const W = 240, H = 36, bw = W / bits
  return (
    <svg width="100%" viewBox={`0 -12 ${W} ${H + 26}`} className="lab-qbars" aria-label="Rotation per qubit, θ / π">
      <line x1="0" x2={W} y1={H} y2={H} className="lab-qbars__base" />
      {th.map((t, k) => (
        <g key={k}>
          <rect x={k * bw + 5} y={H - t * H} width={bw - 10} height={Math.max(0.5, t * H)} />
          <text x={k * bw + bw / 2} y={H + 12} textAnchor="middle" className="lab-qbars__k">q{k}</text>
          <text x={k * bw + bw / 2} y={H - t * H - 4} textAnchor="middle">{t.toFixed(2)}</text>
        </g>
      ))}
    </svg>
  )
}

const MODES = [{ value: 'gaussian', label: 'Gauss' }, { value: 'emulator', label: 'Emulate' }, { value: 'atlas', label: 'Atlas' }, { value: 'nations', label: 'Evolve' }]
const MODE_HELP = {
  gaussian: 'A plain blur, to check the pipeline.',
  emulator: 'Quantum Blur Core, approximated locally. Live.',
  atlas: 'Runs on Atlas blur-core-v1. Cached in grids/.',
  nations: 'Nations, one qubit each, evolve turn by turn. Local.',
}

export function QuantumIn() {
  const st = useStore()
  const { q, grid, job } = st
  const running = job?.status === 'running'
  return (
    <>
      <Panel id="in-q-engine" title="Engine" aside={running ? <><Spinner /> {job.tiles_done}/{job.tiles_total}</> : st.busy.proc ? <Spinner /> : null}>
        <Segmented size="s" options={MODES} value={q.mode} onChange={(v) => st.setQ({ mode: v as typeof q.mode })} aria-label="Quantum engine" />
        <Note>{MODE_HELP[q.mode]}</Note>
      </Panel>
      {q.mode === 'gaussian' ? (
        <Panel id="in-q-gauss" title="Blur">
          <Slider label="Sigma" value={q.sigma} min={0.3} max={3} step={0.1} defaultValue={1} onChange={(v) => st.setQ({ sigma: v })} />
        </Panel>
      ) : q.mode === 'nations' ? (
        <EvolveIn />
      ) : (
        <>
          <Panel id="in-q-blur" title="Blur">
            <Slider label="Strength" value={q.strength} min={0} max={1} step={0.01} defaultValue={0.3} onChange={(v) => st.setQ({ strength: v })} help="How far each qubit rotates: θ = strength · π for the lowest." />
            <Slider label="Reach" value={q.reach} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => st.setQ({ reach: v })} help="How much of the rotation the higher qubits keep: 0 blurs locally, 1 mixes far cells as much as near ones." />
            <Panel id="in-q-qubits" title="Rotation per qubit" aside="θ / π" sub defaultOpen={false}>
              <QubitBars />
            </Panel>
          </Panel>
          <Panel id="in-q-circuit" title="Circuit" defaultOpen={false}>
            <Select label="Gate style" value={q.style} onChange={(v) => st.setQ({ style: v })} options={[
              { value: 'x', label: 'x · Rx' }, { value: 'y', label: 'y · Ry' }, { value: 'xy', label: 'xy · Rx, Ry' }, { value: 'yx', label: 'yx · Ry, Rx' },
            ]} />
            <Input label="Shots" type="number" value={q.shots ?? ''} placeholder="exact" min={1} step={1000} onChange={(v) => st.setQ({ shots: v ? Math.max(1, +v) : null })} help="Leave empty for the exact state." />
            <Row label="Axes">
              <AxisToggle value={q.axes.map((a) => 'xyz'[a] as 'x' | 'y' | 'z')} onChange={(v) => { if (v.length) st.setQ({ axes: v.map((a) => 'xyz'.indexOf(a)).sort() }) }} />
            </Row>
            {grid && grid.tiles.cube.jobs > 1 && (
              <Row label="Tiling">
                <Segmented size="s" options={[{ value: 'cube', label: 'Cubes' }, { value: 'layers', label: 'Layers' }]} value={q.tiling} onChange={(v) => st.setQ({ tiling: v as 'cube' | 'layers' })} />
              </Row>
            )}
          </Panel>
        </>
      )}
      <Panel id="in-q-run" title="Run" aside={q.run}>
        <Input label="Name" value={q.run} onChange={(v) => st.setQ({ run: v.replace(/[^\w-]/g, '_').slice(0, 40) })}
          help={q.mode === 'nations' ? 'The run name seeds the measurements: the same name gives the same history.' : 'Results are filed under this name.'} />
      </Panel>
    </>
  )
}

/** Evolve's settings (app/nations.py through /api/process mode "nations"). */
function EvolveIn() {
  const q = useStore((s) => s.q)
  const n = useStore((s) => s.grid?.n ?? null)
  const setQ = useStore((s) => s.setQ)
  return (
    <Panel id="in-q-nations" title="Nations" aside={`${q.k} · ${q.turns} turns`}>
      {n != null && n > NATIONS_MAX_GRID && <Note warn>Evolve works on grids up to {NATIONS_MAX_GRID}³; this one is {n}³.</Note>}
      <Slider label="Nations" value={q.k} min={3} max={16} step={1} defaultValue={12} onChange={(v) => setQ({ k: v })}
        help="Regions the model is split into at the start, one qubit each. At most 16 are alive at once." />
      <Slider label="Turns" value={q.turns} min={5} max={300} step={5} defaultValue={60} onChange={(v) => setQ({ turns: v })}
        help="How long the history runs. A shorter run is exactly the beginning of a longer one." />
      <Slider label="Growth reach" value={q.spread} min={0} max={8} step={0.5} defaultValue={4} format={(v) => `${v.toFixed(1)} %`}
        onChange={(v) => setQ({ spread: v })}
        help="How far walls and growth may reach beyond the original surface, as a share of the grid. At 0 the shape only loses voxels." />
      <Row label="Borders" tip="Grooves cut a one-voxel channel along every border of the last turn, so the nations still read on a one-colour print.">
        <Segmented size="s" options={[{ value: 'flush', label: 'Flush' }, { value: 'grooves', label: 'Grooves' }]}
          value={q.grooves ? 'grooves' : 'flush'} onChange={(v) => setQ({ grooves: v === 'grooves' })} aria-label="Borders" />
      </Row>
    </Panel>
  )
}

// ── 04 mesh ──────────────────────────────────────────────────────────────────────────────────────
const FILTERS: { value: VFilter; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'gaussian', label: 'Gaussian' }, { value: 'mean', label: 'Mean' },
  { value: 'median', label: 'Median' }, { value: 'curvature', label: 'Laplacian flow' },
]
const FIELDS: { value: FieldKind; label: string }[] = [
  { value: 'threshold', label: 'Toward the result' },
  { value: 'difference', label: 'Amplify difference' },
  { value: 'gradient', label: 'Along the gradient' },
]

function MeshIn() {
  const st = useStore()
  const { m, grid } = st
  const n = grid?.n ?? 32
  return (
    <>
      <Panel id="in-mesh-surface" title="Surface" aside={`${m.method === 'advect' ? 'push' : 'threshold'} ${fmt.f2(m.level)}`}>
        <Slider label="Level" value={m.level} min={0.05} max={0.95} step={0.01} defaultValue={0.5} onChange={(v) => st.setM({ level: v })}
          help="Relative to the original solid (1). Lower swells and fuses; higher erodes." />
        <Row label="From">
          <Segmented size="s" options={[{ value: 'threshold', label: 'Threshold' }, { value: 'advect', label: 'Push' }]}
            value={m.method} onChange={(v) => st.setM({ method: v as 'threshold' | 'advect' })} aria-label="Surface from" />
        </Row>
        {m.method === 'advect' && (
          <>
            <Slider label="Push" value={m.amount} min={0} max={8} step={0.25} format={(v) => `${v} cells`} onChange={(v) => st.setM({ amount: v })} help="How far the quantum result moves the surface, in quantum cells." />
            <Select<FieldKind> label="Field" value={m.field} options={FIELDS} onChange={(v) => st.setM({ field: v })} />
          </>
        )}
        <Select label="Refine" value={String(m.refine)} onChange={(v) => st.setM({ refine: +v })}
          options={[1, 2, 4, 8].filter((r) => n * r <= 256).map((r) => ({ value: String(r), label: r === 1 ? '×1 · quantum grid' : `×${r} · ${n * r}³` }))} />
      </Panel>
      <Panel id="in-mesh-vox" title="Voxel operations" defaultOpen={false}>
        <Select<VFilter> label="Smooth" value={m.vfilter} options={FILTERS} onChange={(v) => st.setM({ vfilter: v })} />
        <Slider label="Width" value={m.vwidth} min={0.5} max={4} step={0.25} disabled={m.vfilter === 'none'} onChange={(v) => st.setM({ vwidth: v })} />
        <Slider label="Thicken" value={m.grow} min={-4} max={4} step={0.25} origin={0} defaultValue={0} onChange={(v) => st.setM({ grow: v })} help="Positive thickens, negative shrinks, in voxels." />
        <Slider label="Close gaps" value={m.close} min={0} max={4} step={0.5} defaultValue={0} onChange={(v) => st.setM({ close: v })} />
      </Panel>
      <Panel id="in-mesh-mesh" title="Mesh" defaultOpen={false}>
        <Slider label="Smoothing" value={m.smooth} min={0} max={30} step={1} defaultValue={5} format={(v) => `${v} passes`} onChange={(v) => st.setM({ smooth: v })} />
        <Row label="Keep">
          <Segmented size="s" options={[{ value: 'largest', label: 'Largest' }, { value: 'all', label: 'All large' }]} value={m.keep} onChange={(v) => st.setM({ keep: v as 'largest' | 'all' })} aria-label="Fragments" />
        </Row>
      </Panel>
      <Panel id="in-mesh-print" title="Print">
        <Input label="Height" type="number" value={m.height} min={5} max={1000} step={1} suffix="mm" onChange={(v) => st.setM({ height: Math.max(5, Math.min(1000, +v || 90)) })} />
      </Panel>
    </>
  )
}
