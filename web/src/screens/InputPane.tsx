// INPUT: only the things you set, in pipeline order. Each step folds to a one-line summary;
// the scrollbar carries an index (01–04) to jump between them. Results live in the Output column.
import { useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import type { Fill, Field as FieldKind, UpAxis, Values, VFilter } from '../api'
import { QPill } from '../qs/QPill'
import { Segmented, AxisToggle } from '../qs/Segmented'
import { Slider, Select, Input } from '../qs/Slider'
import { ScrollArea, type ScrollIndex } from '../qs/ScrollArea'
import { Dot, Spinner, fmt } from './parts'

export const MODEL_EXT = ['.stl', '.obj', '.ply', '.glb', '.off']
const MARKERS = [{ id: 'in-01', label: 'Model' }, { id: 'in-02', label: 'Voxelise' }, { id: 'in-03', label: 'Quantum' }, { id: 'in-04', label: 'Mesh' }]

/** A vertical bar with one knot per step: click a knot to go to the step. No numbers, no scrollbar. */
export function Knots({ markers, active, go, frac }: ScrollIndex) {
  return (
    <div className="knots" aria-label="Steps">
      <span className="knots__line" />
      {markers.map((mk) => (
        <button key={mk.id} className={'knots__k' + (active === mk.id ? ' knots__k--on' : '')} style={{ top: `calc(${(frac(mk.id) * 100).toFixed(2)}% + 14px)` }}
          onClick={() => go(mk.id)} aria-label={mk.label}>
          <span className="knots__tip">{mk.label}</span>
        </button>
      ))}
    </div>
  )
}

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

function Step({ id, title, summary, state, off, fold, children }: {
  id: string; no?: string; title: string; summary: ReactNode; state?: ReactNode; off?: boolean
  fold: ReturnType<typeof useFold>; children: ReactNode
}) {
  const open = fold.isOpen(id)
  return (
    <section className={'sec' + (off ? ' sec--off' : '') + (open ? '' : ' sec--folded')} data-mark={id}>
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
    <aside className="side" aria-label="Input">
      <div className="pane-head"><span className="qs-label">Input</span><span className="pane-head__note">parameters</span></div>
      <ScrollArea markers={MARKERS} className="pane-scroll pane-scroll--knots" bar={false} renderIndex={(ix) => <Knots {...ix} />}>
        <ModelIn fold={fold} />
        <VoxIn fold={fold} />
        <QuantumIn fold={fold} />
        <MeshIn fold={fold} />
        <div style={{ height: 40 }} />
      </ScrollArea>
    </aside>
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
    <Step id="in-01" no="01" title="Model" fold={fold}
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
      {model?.lying && <p className="qs-help" style={{ color: 'var(--qs-ink)' }}>! Looks like it is lying along {model.lying}. Try another up axis.</p>}
    </Step>
  )
}

function VoxIn({ fold }: F) {
  const st = useStore()
  const { vox, model } = st
  const fill = { holes: 'enclosed', capped: 'capped', none: 'shell' }[vox.fill]
  return (
    <Step id="in-02" no="02" title="Voxelise" fold={fold} off={!model}
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
        options={[{ value: 'coverage', label: 'Coverage · 0.5 is the true surface' }, { value: 'binary', label: '0 or 1 · about half a voxel fat' }]} />
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
            <text x={k * bw + bw / 2} y={H + 12} textAnchor="middle" fontFamily="Geist Mono" fontSize="9" fill="var(--qs-ink2)">q{k}</text>
            <text x={k * bw + bw / 2} y={H - t * H - 4} textAnchor="middle" fontFamily="Geist Mono" fontSize="9" fill="var(--qs-ink)">{t.toFixed(2)}</text>
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
}

function QuantumIn({ fold }: F) {
  const st = useStore()
  const { q, grid, job, key, proc } = st
  const running = job?.status === 'running'
  const summary = q.mode === 'gaussian' ? `gaussian · σ ${q.sigma}` : `${q.mode === 'atlas' ? 'atlas' : 'emulation'} · s ${fmt.f2(q.strength)} · r ${fmt.f2(q.reach)} · ${q.style} · ${q.run}`
  return (
    <Step id="in-03" no="03" title="Quantum" fold={fold} off={!grid} summary={summary}
      state={running ? <><Spinner /> {job.tiles_done}/{job.tiles_total}</> : st.busy.proc ? <Spinner /> : proc ? <Dot live /> : <Dot />}>
      <div className="seg-block">
        <Segmented options={[{ value: 'gaussian', label: 'Gaussian' }, { value: 'emulator', label: 'Emulation' }, { value: 'atlas', label: 'Atlas' }]}
          value={q.mode} onChange={(v) => st.setQ({ mode: v as typeof q.mode })} />
        <p className="qs-help">{MODE_HELP[q.mode]}</p>
      </div>
      {q.mode === 'gaussian' ? (
        <Slider label="Sigma" value={q.sigma} min={0.3} max={3} step={0.1} defaultValue={1} onChange={(v) => st.setQ({ sigma: v })} />
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
      <Input label="Run name" value={q.run} onChange={(v) => st.setQ({ run: v.replace(/[^\w-]/g, '_').slice(0, 40) })} />
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
    <Step id="in-04" no="04" title="Mesh" fold={fold} off={!proc}
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
