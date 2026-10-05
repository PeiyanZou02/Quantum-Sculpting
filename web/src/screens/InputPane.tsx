// INPUT: only the things you set, in pipeline order. Each step folds to a one-line summary;
// the scrollbar carries an index (01–04) to jump between them. Results live in the Output column.
import { useRef, useState, type ReactNode } from 'react'
import { useStore, NATIONS_MAX_GRID, type Stage as StageName } from '../store'
import type { Fill, Field as FieldKind, UpAxis, Values, VFilter } from '../api'
import { QPill } from '../qs/QPill'
import { Segmented, AxisToggle } from '../qs/Segmented'
import { Slider, Select, Input } from '../qs/Slider'
import { ScrollArea } from '../qs/ScrollArea'
import { SectionTabs } from './SectionTabs'
import { Dot, Spinner, fmt } from './parts'
import './evolve.css'

export const MODEL_EXT = ['.stl', '.obj', '.ply', '.glb', '.off']
const MARKERS = [
  { id: 'in-01', label: 'Model', icon: 'model' }, { id: 'in-02', label: 'Voxelise', icon: 'grid' },
  { id: 'in-03', label: 'Quantum', icon: 'quantum' }, { id: 'in-04', label: 'Mesh', icon: 'print' },
]


function useFold() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('qs-fold') ?? '{}') } catch { return {} }
  })
  const toggle = (id: string) => setOpen((o) => {
    const n = { ...o, [id]: o[id] === false }
    try { localStorage.setItem('qs-fold', JSON.stringify(n)) } catch { /* per-viewer */ }
    return n
  })
  return { isOpen: (id: string) => open[id] !== false, toggle }
}

/** Touching a step's parameters points the workspace at that step (when it has something to show). */
function Step({ id, title, summary, state, off, fold, stage, children }: {
  id: string; no?: string; title: string; summary: ReactNode; state?: ReactNode; off?: boolean
  fold: ReturnType<typeof useFold>; stage: StageName; children: ReactNode
}) {
  const open = fold.isOpen(id)
  const setFocus = useStore((s) => s.setFocus)
  const on = useStore((s) => s.focus.stage === stage || (stage === 'quantum' && s.focus.stage === 'scan'))
  return (
    <section className={'sec' + (off ? ' sec--off' : '') + (open ? '' : ' sec--folded') + (on && !off ? ' sec--focus' : '')} data-mark={id}
      onPointerDown={() => { if (!off && !on) setFocus(stage, `Editing ${title}`) }}>
      <button className="sec__head" onClick={() => fold.toggle(id)} aria-expanded={open}>
        <span className="sec__title">{title}</span>
        <span className="sec__state">{state}</span>
        <span className={'sec__chev' + (open ? ' sec__chev--open' : '')} />
      </button>
      {open ? children : <div className="sec__summary">{summary}</div>}
    </section>
  )
}

export function InputPane() {
  const fold = useFold()
  return (
    <div className="panel" aria-label="Parameters">
      <ScrollArea markers={MARKERS} className="pane-scroll pane-scroll--tabs" bar={false} renderIndex={(ix) => <SectionTabs {...ix} label="Parameter sections" />}>
        <ModelIn fold={fold} />
        <VoxIn fold={fold} />
        <QuantumIn fold={fold} />
        <MeshIn fold={fold} />
        <div style={{ height: 40 }} />
      </ScrollArea>
    </div>
  )
}

type F = { fold: ReturnType<typeof useFold> }

const UP: { value: UpAxis; label: string }[] = [
  { value: '+z', label: '+Z · 3D print' }, { value: '+y', label: '+Y · Blender, glTF' }, { value: '+x', label: '+X' },
  { value: '-z', label: '−Z · upside down' }, { value: '-y', label: '−Y' }, { value: '-x', label: '−X' },
]

function ModelIn({ fold }: F) {
  const st = useStore()
  const file = useRef<HTMLInputElement>(null)
  const { model } = st
  return (
    <Step id="in-01" no="01" title="Model" fold={fold} stage="model"
      summary={model ? `${model.builtin ? 'test cup' : model.file} · up ${fmt.up(model.up)}` : 'no model'}
      state={st.busy.model ? <Spinner /> : model ? <Dot live /> : <Dot />}>
      <div className="row">
        <input ref={file} type="file" hidden accept={MODEL_EXT.join(',')} onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) st.upload(f)
          e.target.value = ''
        }} />
        <QPill kind="commit" size="s" label="Choose file" onClick={() => file.current?.click()} />
        <QPill kind="hair" size="s" label="Use test cup" onClick={st.useTestCup} />
      </div>
      {st.recent.length > 0 && (
        <Select label="From input/" value={model?.file ?? ''}
          options={[{ value: '', label: model ? '—' : 'Choose a model…' }, ...st.recent.map((r) => ({ value: r.name, label: `${r.name} · ${r.mb} MB` }))]}
          onChange={(v) => v && st.openRecent(v)} />
      )}
      <Select label="Up axis in the file" value={st.up} options={UP} onChange={(v) => st.setUp(v)} />
      {model?.lying && <p className="qs-help qs-help--warn">! Looks like it is lying along {model.lying}. Try another up axis.</p>}
    </Step>
  )
}

function VoxIn({ fold }: F) {
  const st = useStore()
  const { vox, model } = st
  const fill = { holes: 'enclosed', capped: 'capped', none: 'shell' }[vox.fill]
  return (
    <Step id="in-02" no="02" title="Voxelise" fold={fold} stage="voxels" off={!model}
      summary={`${vox.n}³ · ${fill} · ${vox.values} · pad ${vox.pad}`}
      state={st.busy.vox ? <Spinner /> : st.grid ? <Dot live /> : <Dot />}>
      <div className="seg-block">
        <span className="qs-field-label">Grid size</span>
        <Segmented size="s" options={[16, 32, 64, 128, 256].map((n) => ({ value: String(n), label: `${n}³` }))} value={String(vox.n)} onChange={(v) => st.setVox({ n: +v })} />
      </div>
      <Select<Fill> label="Inside" value={vox.fill} onChange={(v) => st.setVox({ fill: v })} options={[
        { value: 'holes', label: 'Fill enclosed interiors' },
        { value: 'capped', label: 'Cap the bottom, then fill' },
        { value: 'none', label: 'Shell only' },
      ]} />
      <Select<Values> label="Cell values" value={vox.values} onChange={(v) => st.setVox({ values: v })}
        options={[{ value: 'coverage', label: 'Coverage · 0.5 = surface' }, { value: 'binary', label: '0 or 1 · ½ voxel fat' }]} />
      <Slider label="Padding · cells" value={vox.pad} min={0} max={6} step={1} ticks={6} onChange={(v) => st.setVox({ pad: v })} />
    </Step>
  )
}

/** θ_k = π · strength · ((1 − reach) · 2^−k + reach), as in app/emulator.py. Drawn next to the sliders it explains. */
function QubitBars() {
  const q = useStore((s) => s.q)
  const n = useStore((s) => s.grid?.n ?? 32)
  const bits = Math.ceil(Math.log2(Math.min(n, 32)))
  const th = Array.from({ length: bits }, (_, k) => q.strength * ((1 - q.reach) * 2 ** -k + q.reach))
  const W = 300, H = 48, bw = W / bits
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="qs-field-head"><span>Rotation per qubit</span><output>θ / π</output></div>
      <svg width="100%" viewBox={`0 -12 ${W} ${H + 26}`} style={{ overflow: 'visible' }}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--qs-ink4)" />
        <line x1="0" x2={W} y1={0} y2={0} stroke="var(--qs-ink4)" strokeDasharray="2 3" />
        {th.map((t, k) => (
          <g key={k}>
            <rect x={k * bw + 6} y={H - t * H} width={bw - 12} height={Math.max(0.5, t * H)} fill="var(--qs-ink)" />
            <text x={k * bw + bw / 2} y={H + 12} textAnchor="middle" fontFamily="TWK Everett Mono, ui-monospace, monospace" fontSize="11" fill="var(--qs-ink2)">q{k}</text>
            <text x={k * bw + bw / 2} y={H - t * H - 4} textAnchor="middle" fontFamily="TWK Everett Mono, ui-monospace, monospace" fontSize="11" fill="var(--qs-ink)">{t.toFixed(2)}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

const MODE_HELP = {
  gaussian: 'An ordinary blur, only for checking the pipeline.',
  emulator: 'Local approximation of Quantum Blur Core, same tiling as Atlas. Updates live.',
  atlas: 'Submits to Atlas blur-core-v1. Results are cached in grids/ and never submitted twice.',
  nations: 'Splits the model into nations, one qubit each, that evolve turn by turn: every nation is asked one question a turn and all the answers are measured together. Runs on this machine.',
}
const MODE_LABEL = { gaussian: 'gaussian', emulator: 'emulation', atlas: 'atlas', nations: 'evolve' }

function QuantumIn({ fold }: F) {
  const st = useStore()
  const { q, grid, job, key, proc } = st
  const running = job?.status === 'running'
  const summary = q.mode === 'gaussian' ? `gaussian · σ ${q.sigma}`
    : q.mode === 'nations' ? `evolve · ${q.k} nations · ${q.turns} turns · reach ${q.spread}% · ${q.run}`
    : `${MODE_LABEL[q.mode]} · s ${fmt.f2(q.strength)} · r ${fmt.f2(q.reach)} · ${q.style} · ${q.run}`
  return (
    <Step id="in-03" no="03" title={q.mode === 'nations' ? 'Evolve' : 'Quantum'} fold={fold} stage={q.mode === 'nations' ? 'evolve' : 'quantum'} off={!grid} summary={summary}
      state={running ? <><Spinner /> {job.tiles_done}/{job.tiles_total}</> : st.busy.proc ? <Spinner /> : proc ? <Dot live /> : <Dot />}>
      <div className="seg-block ev-modes">
        <Segmented options={[{ value: 'gaussian', label: 'Gauss' }, { value: 'emulator', label: 'Emulate' }, { value: 'atlas', label: 'Atlas' }, { value: 'nations', label: 'Evolve' }]}
          value={q.mode} onChange={(v) => st.setQ({ mode: v as typeof q.mode })} aria-label="Quantum mode" />
        <p className="qs-help">{MODE_HELP[q.mode]}</p>
      </div>
      {q.mode === 'gaussian' ? (
        <Slider label="Sigma" value={q.sigma} min={0.3} max={3} step={0.1} defaultValue={1} onChange={(v) => st.setQ({ sigma: v })} />
      ) : q.mode === 'nations' ? (
        <EvolveIn />
      ) : (
        <>
          <Slider label="Strength" value={q.strength} min={0} max={1} step={0.01} defaultValue={0.3} onChange={(v) => st.setQ({ strength: v })} />
          <Slider label="Reach" value={q.reach} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => st.setQ({ reach: v })} />
          <QubitBars />
          <div className="pair">
            <Select label="Gate style" value={q.style} onChange={(v) => st.setQ({ style: v })} options={[
              { value: 'x', label: 'x · Rx' }, { value: 'y', label: 'y · Ry' }, { value: 'xy', label: 'xy · Rx, Ry' }, { value: 'yx', label: 'yx · Ry, Rx' },
            ]} />
            <Input label="Shots" type="number" value={q.shots ?? ''} placeholder="exact" min={1} step={1000} onChange={(v) => st.setQ({ shots: v ? Math.max(1, +v) : null })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="qs-field-label">Blur axes</span>
            <AxisToggle value={q.axes.map((a) => 'xyz'[a] as 'x' | 'y' | 'z')} onChange={(v) => { if (v.length) st.setQ({ axes: v.map((a) => 'xyz'.indexOf(a)).sort() }) }} />
          </div>
          {grid && grid.tiles.cube.jobs > 1 && (
            <div className="seg-block">
              <span className="qs-field-label">Tiling</span>
              <Segmented size="s" options={[{ value: 'cube', label: 'Cubes' }, { value: 'layers', label: 'Layers · scannable' }]} value={q.tiling} onChange={(v) => st.setQ({ tiling: v as 'cube' | 'layers' })} />
            </div>
          )}
        </>
      )}
      <Input label="Run name" value={q.run} onChange={(v) => st.setQ({ run: v.replace(/[^\w-]/g, '_').slice(0, 40) })}
        help={q.mode === 'nations' ? 'The run name seeds the measurements: the same name gives the same history, another name another one.' : undefined} />
      {q.mode === 'atlas' && (
        <div className="row">
          <QPill kind={key?.set && !running ? 'commit' : 'disabled'} size="s"
            label={running ? 'Running on Atlas' : proc?.mode === 'atlas' && proc.cached ? 'Cached · submit again' : 'Submit to Atlas'}
            loading={running} onClick={() => st.process({ submit: true })} />
          {!key?.set && <QPill kind="ghost" size="s" label="Set API key" onClick={() => st.set({ keyOpen: true })} />}
        </div>
      )}
    </Step>
  )
}

/** Evolve's settings (app/nations.py through /api/process mode "nations"). */
function EvolveIn() {
  const q = useStore((s) => s.q)
  const n = useStore((s) => s.grid?.n ?? null)
  const setQ = useStore((s) => s.setQ)
  return (
    <>
      {n != null && n > NATIONS_MAX_GRID && (
        <p className="qs-help qs-help--warn">! Evolve works on grids up to {NATIONS_MAX_GRID}³; this one is {n}³. Choose a smaller grid size under Voxelise.</p>
      )}
      <Slider label="Nations" value={q.k} min={3} max={16} step={1} ticks={13} defaultValue={12} onChange={(v) => setQ({ k: v })}
        help="Regions the model is split into at the start, one qubit each. Nations can split later; at most 16 are alive at once." />
      <Slider label="Turns" value={q.turns} min={5} max={300} step={5} ticks={10} defaultValue={60} onChange={(v) => setQ({ turns: v })}
        help="How long the history runs. It stops early if every nation dies; a shorter run is exactly the beginning of a longer one." />
      <Slider label="Growth reach · % of the grid" value={q.spread} min={0} max={8} step={0.5} ticks={8} defaultValue={4} format={(v) => `${v.toFixed(1)}%`}
        onChange={(v) => setQ({ spread: v })}
        help="How far walls and new growth may reach beyond the original surface. At 0 the shape only loses voxels: annexing, cracks, fleeing and withering." />
      <div className="seg-block">
        <span className="qs-field-label">Final borders</span>
        <Segmented size="s" options={[{ value: 'flush', label: 'Flush' }, { value: 'grooves', label: 'Carve grooves' }]}
          value={q.grooves ? 'grooves' : 'flush'} onChange={(v) => setQ({ grooves: v === 'grooves' })} aria-label="Final borders" />
        <p className="qs-help">Grooves cut a one-voxel channel along every border of the last turn, so the nations still read on a one-colour print.</p>
      </div>
    </>
  )
}

const FILTERS: { value: VFilter; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'gaussian', label: 'Gaussian' }, { value: 'mean', label: 'Mean' },
  { value: 'median', label: 'Median' }, { value: 'curvature', label: 'Laplacian flow' },
]
const FIELDS: { value: FieldKind; label: string }[] = [
  { value: 'threshold', label: 'Toward the result (stable)' },
  { value: 'difference', label: 'Amplify the difference' },
  { value: 'gradient', label: 'Along the density gradient' },
]

function MeshIn({ fold }: F) {
  const st = useStore()
  const { m, proc, grid, report } = st
  const n = grid?.n ?? 32
  return (
    <Step id="in-04" no="04" title="Mesh" fold={fold} stage="mesh" off={!proc}
      summary={`${m.method === 'advect' ? `push ${m.amount}` : 'threshold'} · level ${fmt.f2(m.level)} · ×${m.refine} · ${m.height} mm`}
      state={st.busy.mesh ? <Spinner /> : report ? <Dot live /> : <Dot />}>
      <Slider label="Level" value={m.level} min={0.05} max={0.95} step={0.01} defaultValue={0.5} onChange={(v) => st.setM({ level: v })}
        help="Relative to the original solid (1). Lower swells and fuses; higher erodes." />
      <div className="seg-block">
        <span className="qs-field-label">Surface from</span>
        <Segmented size="s" options={[{ value: 'threshold', label: 'Threshold' }, { value: 'advect', label: 'Push the surface' }]}
          value={m.method} onChange={(v) => st.setM({ method: v as 'threshold' | 'advect' })} />
      </div>
      {m.method === 'advect' && (
        <>
          <Slider label="Push · quantum cells" value={m.amount} min={0} max={8} step={0.25} ticks={8} onChange={(v) => st.setM({ amount: v })} />
          <Select<FieldKind> label="Field" value={m.field} options={FIELDS} onChange={(v) => st.setM({ field: v })} />
        </>
      )}
      <Select label="Refine" value={String(m.refine)} onChange={(v) => st.setM({ refine: +v })}
        options={[1, 2, 4, 8].filter((r) => n * r <= 256).map((r) => ({ value: String(r), label: r === 1 ? '×1 · quantum grid' : `×${r} · ${n * r}³` }))} />
      <span className="sub">Voxel operations</span>
      <div className="pair">
        <Select<VFilter> label="Smooth" value={m.vfilter} options={FILTERS} onChange={(v) => st.setM({ vfilter: v })} />
        <Slider label="Width" value={m.vwidth} min={0.5} max={4} step={0.25} ticks={7} disabled={m.vfilter === 'none'} onChange={(v) => st.setM({ vwidth: v })} />
      </div>
      <Slider label="Thicken / shrink" value={m.grow} min={-4} max={4} step={0.25} ticks={8} origin={0} defaultValue={0} onChange={(v) => st.setM({ grow: v })} />
      <Slider label="Close gaps" value={m.close} min={0} max={4} step={0.5} ticks={8} defaultValue={0} onChange={(v) => st.setM({ close: v })} />
      <span className="sub">Mesh</span>
      <Slider label="Smoothing passes" value={m.smooth} min={0} max={30} step={1} ticks={6} defaultValue={5} onChange={(v) => st.setM({ smooth: v })} />
      <div className="seg-block">
        <span className="qs-field-label">Fragments</span>
        <Segmented size="s" options={[{ value: 'largest', label: 'Largest part' }, { value: 'all', label: 'All large parts' }]} value={m.keep} onChange={(v) => st.setM({ keep: v as 'largest' | 'all' })} />
      </div>
      <Input label="Print height" type="number" value={m.height} min={5} max={1000} step={1} suffix="mm" onChange={(v) => st.setM({ height: Math.max(5, Math.min(1000, +v || 90)) })} />
    </Step>
  )
}
