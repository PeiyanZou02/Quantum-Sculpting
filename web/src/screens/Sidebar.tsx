// Left column: every option, choice and parameter, in pipeline order (01 → 04), always visible.
import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from '../store'
import type { Fill, Field as FieldKind, UpAxis, Values, VFilter } from '../api'
import { QPill } from '../qs/QPill'
import { Segmented, AxisToggle } from '../qs/Segmented'
import { QReadout } from '../qs/QReadout'
import { LevelHistogram } from '../qs/LevelHistogram'
import { Slider, Select, Input } from '../qs/Slider'
import { histogram } from '../qs/grid'
import { Dot, Spinner, fmt } from './parts'

export const MODEL_EXT = ['.stl', '.obj', '.ply', '.glb', '.off']

function Sec({ no, title, off, state, children }: { no: string; title: string; off?: boolean; state?: ReactNode; children: ReactNode }) {
  return (
    <section className={'sec' + (off ? ' sec--off' : '')}>
      <header className="sec__head">
        <span className="sec__no">{no}</span>
        <span className="sec__title">{title}</span>
        {state && <span className="sec__state">{state}</span>}
      </header>
      {children}
    </section>
  )
}

export function Sidebar() {
  return (
    <aside className="side" aria-label="Pipeline">
      <ModelSec />
      <VoxSec />
      <QuantumSec />
      <MeshSec />
    </aside>
  )
}

const UP: { value: UpAxis; label: string }[] = [
  { value: '+z', label: '+Z · 3D print' }, { value: '+y', label: '+Y · Blender, glTF' }, { value: '+x', label: '+X' },
  { value: '-z', label: '−Z · upside down' }, { value: '-y', label: '−Y' }, { value: '-x', label: '−X' },
]

function ModelSec() {
  const st = useStore()
  const file = useRef<HTMLInputElement>(null)
  const { model } = st
  return (
    <Sec no="01" title="Model" state={st.busy.model ? <><Spinner /> opening</> : model ? <><Dot live /> loaded</> : undefined}>
      <div className="row">
        <input ref={file} type="file" hidden accept={MODEL_EXT.join(',')} onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) st.upload(f)
          e.target.value = ''
        }} />
        <QPill kind="commit" size="s" label="Choose file" onClick={() => file.current?.click()} />
        <QPill kind="hair" size="s" label="Use test cup" onClick={st.useTestCup} />
      </div>
      <p className="qs-help">{MODEL_EXT.join(' ')} — or drag a file onto the workspace.</p>
      {st.recent.length > 0 && (
        <Select
          label="Already in input/"
          value={model?.file ?? ''}
          options={[{ value: '', label: model ? '—' : 'Choose a model…' }, ...st.recent.map((r) => ({ value: r.name, label: `${r.name} · ${r.mb} MB` }))]}
          onChange={(v) => v && st.openRecent(v)}
        />
      )}
      <Select label="Up axis in the file" value={st.up} options={UP} onChange={(v) => st.setUp(v)} />
      {model?.lying && <p className="qs-help" style={{ color: 'var(--qs-ink)' }}>! The model looks like it is lying along {model.lying}. Try another up axis.</p>}
      {model && (
        <QReadout w="100%" kw={96} rows={[
          { k: 'Name', v: model.builtin ? 'test cup (built-in)' : model.file },
          { k: 'Faces', v: fmt.int(model.faces) },
          { k: 'Extents', v: `${model.extents.map((v) => v.toFixed(0)).join(' × ')} mm` },
          { k: 'Watertight', v: model.watertight ? 'yes' : 'no', flag: model.watertight ? '✓' : '!' },
        ]} />
      )}
    </Sec>
  )
}

function VoxSec() {
  const st = useStore()
  const { vox, grid, model } = st
  const cube = grid?.tiles.cube
  return (
    <Sec no="02" title="Voxelise" off={!model} state={st.busy.vox ? <><Spinner /> voxelising</> : grid ? <><Dot live /> {grid.n}³</> : undefined}>
      <div className="seg-block" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="qs-field-label">Grid size</span>
        <Segmented size="s" options={[16, 32, 64, 128, 256].map((n) => ({ value: String(n), label: `${n}³` }))} value={String(vox.n)} onChange={(v) => st.setVox({ n: +v })} />
      </div>
      <Select<Fill> label="Inside" value={vox.fill} onChange={(v) => st.setVox({ fill: v })} options={[
        { value: 'holes', label: 'Fill enclosed interiors' },
        { value: 'capped', label: 'Cap the bottom, then fill (open scans)' },
        { value: 'none', label: 'Shell only' },
      ]} />
      <Select<Values> label="Cell values" value={vox.values} onChange={(v) => st.setVox({ values: v })}
        help={vox.values === 'coverage' ? 'Each cell holds how much of it the model occupies, so the 0.5 level is the true surface.' : 'Every cell the surface touches counts as solid; the model comes out about half a voxel fat.'}
        options={[{ value: 'coverage', label: 'Coverage (more accurate)' }, { value: 'binary', label: '0 or 1' }]} />
      <Slider label="Padding · cells" value={vox.pad} min={0} max={6} step={1} ticks={6} onChange={(v) => st.setVox({ pad: v })} />
      {grid && (
        <QReadout w="100%" kw={96} rows={[
          { k: 'Solid', v: `${fmt.int(grid.solid)} / ${fmt.int(grid.total)}`, flag: `${((grid.solid / grid.total) * 100).toFixed(1)}%` },
          { k: 'Voxel', v: `${grid.voxel_size} mm` },
          { k: 'Atlas', v: cube && cube.jobs > 1 ? `${cube.jobs} jobs of ${cube.shape.join(' × ')}` : 'one job' },
        ]} />
      )}
    </Sec>
  )
}

const MODE_HELP = {
  gaussian: 'An ordinary Gaussian blur, only for checking the pipeline. It has nothing to do with the quantum effect.',
  emulator: 'Approximates Quantum Blur Core locally with the same tiling as Atlas, and updates live as you drag.',
  atlas: 'Submits the grid to Atlas blur-core-v1; large grids are tiled. Results are cached in grids/ and never submitted twice.',
}

/** θ_k = π · strength · ((1 − reach) · 2^−k + reach), as in app/emulator.py. */
function QubitBars() {
  const q = useStore((s) => s.q)
  const n = useStore((s) => s.grid?.n ?? 32)
  const bits = Math.ceil(Math.log2(Math.min(n, 32)))
  const ks = Array.from({ length: bits }, (_, k) => k)
  const th = ks.map((k) => q.strength * ((1 - q.reach) * 2 ** -k + q.reach))
  const W = 300, H = 64, bw = (W - 40) / bits
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="qs-field-head"><span>Rotation per qubit · one axis</span><output>θ / π</output></div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 16}`} style={{ overflow: 'visible' }}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--qs-ink4)" />
        <line x1="0" x2={W} y1={0} y2={0} stroke="var(--qs-ink4)" strokeDasharray="2 3" />
        <text x={W} y={-4} textAnchor="end" fontFamily="Geist Mono" fontSize="9" fill="var(--qs-ink3)">π</text>
        {th.map((t, k) => (
          <g key={k}>
            <rect x={k * bw + 4} y={H - t * H} width={bw - 8} height={Math.max(0.5, t * H)} fill="var(--qs-ink)" />
            <text x={k * bw + bw / 2} y={H + 12} textAnchor="middle" fontFamily="Geist Mono" fontSize="9" fill="var(--qs-ink2)">q{k}</text>
            <text x={k * bw + bw / 2} y={H - t * H - 4} textAnchor="middle" fontFamily="Geist Mono" fontSize="9" fill="var(--qs-ink)">{t.toFixed(2)}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function QuantumSec() {
  const st = useStore()
  const { q, grid, proc, job, key } = st
  const running = job?.status === 'running'
  const tiles = grid?.tiles[q.tiling]
  return (
    <Sec no="03" title="Quantum" off={!grid}
      state={running ? <><Spinner /> Atlas {job.tiles_done}/{job.tiles_total}</> : st.busy.proc ? <><Spinner /> processing</> : proc ? <><Dot live /> {MODE_SHORT[proc.mode]}{proc.seconds != null ? ` · ${proc.seconds}s` : ''}</> : undefined}>
      <div className="seg-block">
        <Segmented options={[{ value: 'gaussian', label: 'Gaussian' }, { value: 'emulator', label: 'Emulation' }, { value: 'atlas', label: 'Atlas' }]}
          value={q.mode} onChange={(v) => st.setQ({ mode: v as typeof q.mode })} />
      </div>
      <p className="qs-help">{MODE_HELP[q.mode]}</p>
      {q.mode === 'gaussian' ? (
        <Slider label="Sigma" value={q.sigma} min={0.3} max={3} step={0.1} defaultValue={1} onChange={(v) => st.setQ({ sigma: v })} />
      ) : (
        <>
          <Slider label="Strength" value={q.strength} min={0} max={1} step={0.01} defaultValue={0.3} onChange={(v) => st.setQ({ strength: v })} />
          <Slider label="Reach" value={q.reach} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => st.setQ({ reach: v })} />
          <QubitBars />
          <div className="pair">
            <Select label="Gate style" value={q.style} onChange={(v) => st.setQ({ style: v })} options={[
              { value: 'x', label: 'x · Rx' }, { value: 'y', label: 'y · Ry' }, { value: 'xy', label: 'xy · Rx then Ry' }, { value: 'yx', label: 'yx · Ry then Rx' },
            ]} />
            <Input label="Shots" type="number" value={q.shots ?? ''} placeholder="exact" min={1} step={1000} onChange={(v) => st.setQ({ shots: v ? Math.max(1, +v) : null })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="qs-field-label">Blur axes</span>
            <AxisToggle value={q.axes.map((a) => 'xyz'[a] as 'x' | 'y' | 'z')} onChange={(v) => { if (v.length) st.setQ({ axes: v.map((a) => 'xyz'.indexOf(a)).sort() }) }} />
          </div>
        </>
      )}
      {grid && grid.tiles.cube.jobs > 1 && q.mode !== 'gaussian' && (
        <div className="seg-block" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="qs-field-label">Tiling</span>
          <Segmented size="s" options={[{ value: 'cube', label: 'Cubes' }, { value: 'layers', label: 'Layers' }]} value={q.tiling} onChange={(v) => st.setQ({ tiling: v as 'cube' | 'layers' })} />
          <p className="qs-help">{tiles ? `${tiles.jobs} jobs of ${tiles.shape.join(' × ')}. ` : ''}{q.tiling === 'cube' ? 'Blur in all three directions; closest to processing the grid whole.' : 'One slab of layers per job; vertical blur only inside a slab.'}</p>
        </div>
      )}
      <Input label="Run name" value={q.run} onChange={(v) => st.setQ({ run: v.replace(/[^\w-]/g, '_').slice(0, 40) })}
        help="Used in the cache and export file names. To submit the same settings again, change the name." />
      {q.mode === 'atlas' && (
        <div className="row">
          <QPill kind={key?.set && !running ? 'commit' : 'disabled'} size="s" label={running ? 'Running on Atlas' : proc?.mode === 'atlas' && proc.cached ? 'Cached · submit again' : 'Submit to Atlas'}
            loading={st.busy.proc || running} onClick={() => st.process({ submit: true })} />
          {!key?.set && <QPill kind="ghost" size="s" label="Set API key" onClick={() => st.set({ keyOpen: true })} />}
        </div>
      )}
      {q.mode === 'atlas' && !proc && !running && grid && <p className="qs-help">No Atlas result yet for these settings. The workspace shows the input until you submit.</p>}
      {proc && (
        <QReadout w="100%" kw={96} rows={[
          { k: 'Source', v: proc.mode === 'atlas' ? (proc.cached ? 'Atlas · cache' : 'Atlas') : MODE_SHORT[proc.mode] },
          { k: 'Range', v: `${proc.min.toFixed(3)} – ${proc.max.toFixed(3)}` },
          ...(proc.tiles ? [{ k: 'Tiles', v: `${proc.tiles.jobs} · ${proc.tiles.mode}` }] : []),
        ]} />
      )}
    </Sec>
  )
}
const MODE_SHORT = { gaussian: 'gaussian', emulator: 'emulation', atlas: 'atlas' } as const

const FILTERS: { value: VFilter; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'gaussian', label: 'Gaussian' }, { value: 'mean', label: 'Mean' },
  { value: 'median', label: 'Median' }, { value: 'curvature', label: 'Laplacian flow' },
]
const FIELDS: { value: FieldKind; label: string }[] = [
  { value: 'threshold', label: 'Toward the result (stable)' },
  { value: 'difference', label: 'Amplify the difference (unstable)' },
  { value: 'gradient', label: 'Along the density gradient' },
]

function MeshSec() {
  const st = useStore()
  const { m, proc, grid, report, procData } = st
  const bins = useMemo(() => (procData ? histogram(procData, 48) : new Array(48).fill(0)), [procData])
  const n = grid?.n ?? 32
  return (
    <Sec no="04" title="Mesh" off={!proc} state={st.busy.mesh ? <><Spinner /> meshing</> : report ? <><Dot live /> {fmt.int(report.faces)} faces</> : undefined}>
      <div style={{ paddingTop: 6 }}>
        <LevelHistogram bins={bins} level={m.level} onLevel={(v) => st.setM({ level: v })} />
      </div>
      <Slider label="Level" value={m.level} min={0.05} max={0.95} step={0.01} defaultValue={0.5} onChange={(v) => st.setM({ level: v })}
        help="Relative to the original solid, which is 1. Lower swells and fuses; higher erodes and fragments." />
      <div className="seg-block" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="qs-field-label">Surface from</span>
        <Segmented size="s" options={[{ value: 'threshold', label: 'Threshold' }, { value: 'advect', label: 'Push the surface' }]}
          value={m.method} onChange={(v) => st.setM({ method: v as 'threshold' | 'advect' })} />
        <p className="qs-help">{m.method === 'threshold' ? 'The iso-surface of the quantum result. Detail is limited by the quantum grid.' : 'A fine distance field of the original model, moved by the quantum result. Keeps the original detail.'}</p>
      </div>
      {m.method === 'advect' && (
        <>
          <Slider label="Push · quantum cells" value={m.amount} min={0} max={8} step={0.25} ticks={8} onChange={(v) => st.setM({ amount: v })} />
          <Select<FieldKind> label="Field" value={m.field} options={FIELDS} onChange={(v) => st.setM({ field: v })} />
        </>
      )}
      <Select label="Refine" value={String(m.refine)} onChange={(v) => st.setM({ refine: +v })}
        options={[1, 2, 4, 8].filter((r) => n * r <= 256).map((r) => ({ value: String(r), label: r === 1 ? '×1 · same as the quantum grid' : `×${r} · ${n * r}³` }))} />

      <span className="sub">Voxel operations</span>
      <div className="pair">
        <Select<VFilter> label="Smooth" value={m.vfilter} options={FILTERS} onChange={(v) => st.setM({ vfilter: v })} />
        <Slider label="Width" value={m.vwidth} min={0.5} max={4} step={0.25} ticks={7} disabled={m.vfilter === 'none'} onChange={(v) => st.setM({ vwidth: v })} />
      </div>
      <Slider label="Thicken / shrink · fine cells" value={m.grow} min={-4} max={4} step={0.25} ticks={8} origin={0} defaultValue={0} onChange={(v) => st.setM({ grow: v })} />
      <Slider label="Close gaps · fine cells" value={m.close} min={0} max={4} step={0.5} ticks={8} defaultValue={0} onChange={(v) => st.setM({ close: v })}
        help="Done on the voxels before the surface is taken, like Houdini's VDB Smooth SDF and Reshape SDF." />

      <span className="sub">Mesh</span>
      <Slider label="Mesh smoothing · passes" value={m.smooth} min={0} max={30} step={1} ticks={6} defaultValue={5} onChange={(v) => st.setM({ smooth: v })} />
      <div className="seg-block" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="qs-field-label">Fragments</span>
        <Segmented size="s" options={[{ value: 'largest', label: 'Largest part' }, { value: 'all', label: 'All large parts' }]} value={m.keep} onChange={(v) => st.setM({ keep: v as 'largest' | 'all' })} />
      </div>
      <Input label="Print height" type="number" value={m.height} min={5} max={1000} step={1} suffix="mm" onChange={(v) => st.setM({ height: Math.max(5, Math.min(1000, +v || 90)) })} />
      <div className="row">
        <QPill kind={report ? 'commit' : 'disabled'} size="s" label="Export STL" loading={st.busy.export} onClick={st.exportStl} />
        {st.exported && <QPill kind="ghost" size="s" label="Download" onClick={() => window.open(`/api/download/${encodeURIComponent(st.exported!.file)}`)} />}
      </div>
      {st.exported && <p className="qs-help">Wrote {st.exported.folder}/{st.exported.file} and a .json with every setting.</p>}
    </Sec>
  )
}
