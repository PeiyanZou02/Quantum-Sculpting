// Left rail: settings for the current step (from y 260) and the main action (y 1000).
import { useRef } from 'react'
import { useStore } from '../store'
import type { Fill, Field as FieldKind, UpAxis, VFilter } from '../api'
import { QPill } from '../qs/QPill'
import { Segmented, AxisToggle } from '../qs/Segmented'
import { QReadout } from '../qs/QReadout'
import { QDial } from '../qs/QDial'
import { QFader } from '../qs/QFader'
import { Stepper } from '../qs/Stepper'
import { TextField } from '../qs/TextField'
import { Abs, Col, Field, InlineField, Row, Spinner, StepHead, fmt } from './parts'
import { MODEL_EXT } from './StartView'

const ACCEPT = MODEL_EXT.join(',')

export function Rail() {
  const step = useStore((s) => s.step)
  const meshTab = useStore((s) => s.meshTab)
  return (
    <>
      <Abs x={48} y={260} w={344}>
        {step < 0 && <StartRail />}
        {step === 0 && <ModelRail />}
        {step === 1 && <VoxRail />}
        {step === 2 && <QuantumRail />}
        {step === 3 && (meshTab === 'export' ? <ExportRail /> : <MeshRail />)}
      </Abs>
      <Abs x={48} y={1000}><Action /></Abs>
    </>
  )
}

function FilePicker({ children }: { children: (open: () => void) => React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null)
  const upload = useStore((s) => s.upload)
  return (
    <>
      <input ref={ref} type="file" accept={ACCEPT} hidden onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) upload(f)
        e.target.value = ''
      }} />
      {children(() => ref.current?.click())}
    </>
  )
}

function ago(mtime?: number) {
  if (!mtime) return ''
  const d = new Date(mtime)
  const today = new Date()
  return d.toDateString() === today.toDateString() ? 'today' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function StartRail() {
  const st = useStore()
  return (
    <Col gap={30}>
      <Col gap={10}>
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>Start</span>
        <span className="qs-title">Open a model</span>
        <span className="qs-body" style={{ color: 'var(--qs-ink2)' }}>Choose a mesh, drop one onto the view, or start from the built-in test cup.</span>
      </Col>
      <Row gap={8}>
        <FilePicker>{(open) => <QPill kind="commit" label="Choose file" onClick={open} loading={st.busy.model} />}</FilePicker>
        <QPill kind="hair" label="Use test cup" onClick={st.useTestCup} />
      </Row>
      <Col gap={0}>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--qs-ink)' }}>
          <span className="qs-label">INPUT</span>
          <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>input/ · {st.recent.length} file{st.recent.length === 1 ? '' : 's'}</span>
        </div>
        {st.recent.slice(0, 8).map((f) => (
          <button
            key={f.name}
            onClick={() => st.openRecent(f.name)}
            className="qs-mono qs-row"
            style={{ all: 'unset', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 70px', padding: '10px 0', borderBottom: '1px solid var(--qs-line)', cursor: 'pointer', font: '400 11px/1 var(--qs-mono)' }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
            <span style={{ color: 'var(--qs-ink3)', textAlign: 'right' }}>{f.mb < 1 ? `${Math.round(f.mb * 1000)} KB` : `${f.mb} MB`}</span>
            <span style={{ color: 'var(--qs-ink3)', textAlign: 'right' }}>{ago()}</span>
          </button>
        ))}
      </Col>
      <span className="qs-mono" style={{ lineHeight: 1.5, color: 'var(--qs-ink3)' }}>Opens {MODEL_EXT.join(' ')}</span>
      {st.error && <span className="qs-cap" style={{ color: 'var(--qs-ink)' }}>{st.error}</span>}
    </Col>
  )
}

const UP: { value: UpAxis; label: string }[] = [
  { value: '+z', label: '+Z' }, { value: '+y', label: '+Y' }, { value: '-y', label: '−Y' },
  { value: '+x', label: '+X' }, { value: '-x', label: '−X' }, { value: '-z', label: '−Z' },
]

function ModelRail() {
  const st = useStore()
  const model = st.model!
  const [x, y, z] = model.extents
  return (
    <Col gap={28}>
      <StepHead kicker="Step 01" title="Model">
        Check the size and which way is up. {model.builtin ? 'The cup should stand mouth up on +Z.' : 'The model should stand upright on +Z for printing.'}
      </StepHead>
      <Field label="File" note={model.builtin ? 'radius 40 · height 90 · wall 4 · bottom 5 mm' : `input/${model.file}`}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--qs-ink)' }}>
          <span className="qs-field">{model.builtin ? 'Built-in test cup' : model.file}</span>
          <QPill kind="ghost" size="s" label="Change" onClick={() => st.set({ step: -1 })} />
        </div>
      </Field>
      <Field label="Up axis" note={model.lying ? `Lying along ${model.lying}: try another up axis` : '+Y for Blender and glTF exports'}>
        <Segmented options={UP} value={st.up} onChange={(v) => st.setUp(v)} />
      </Field>
      <QReadout
        title="Mesh" kw={96} w={344}
        rows={[
          { k: 'Faces', v: fmt.int(model.faces) },
          { k: 'Vertices', v: fmt.int(model.vertices) },
          { k: 'Extents', v: `${x.toFixed(0)} × ${y.toFixed(0)} × ${z.toFixed(0)} mm` },
          { k: 'Watertight', v: model.watertight ? 'yes' : 'no' },
        ]}
      />
    </Col>
  )
}

const SIZES = [16, 32, 64, 128, 256]

function VoxRail() {
  const st = useStore()
  const { vox, grid } = st
  const tiles = grid?.tiles.cube
  const qubits = 3 * Math.ceil(Math.log2(Math.min(vox.n, 32)))
  return (
    <Col gap={26}>
      <StepHead kicker="Step 02" title="Voxelise">
        Turn the mesh into a grid of values. With coverage, the 0.5 level sits on the true surface.
      </StepHead>
      <Field label="Grid size" note={tiles ? (tiles.jobs === 1 ? `One Atlas job · ${qubits} qubits` : `${tiles.jobs} Atlas jobs of ${tiles.shape.join(' × ')}`) : ' '}>
        <Segmented options={SIZES.map((n) => ({ value: String(n), label: `${n}³` }))} value={String(vox.n)} onChange={(v) => st.setVox({ n: +v })} />
      </Field>
      <Field label="Fill">
        <Segmented<Fill>
          options={[{ value: 'holes', label: 'Enclosed' }, { value: 'capped', label: 'Cap, then fill' }, { value: 'none', label: 'Shell' }]}
          value={vox.fill} onChange={(v) => st.setVox({ fill: v })}
        />
      </Field>
      <Field label="Values">
        <Segmented
          options={[{ value: 'coverage', label: 'Coverage' }, { value: 'binary', label: '0 or 1' }]}
          value={vox.values} onChange={(v) => st.setVox({ values: v as 'coverage' | 'binary' })}
        />
      </Field>
      <InlineField label="Padding · cells">
        <Stepper value={vox.pad} min={0} max={Math.max(0, vox.n / 2 - 2)} onChange={(v) => st.setVox({ pad: v })} />
      </InlineField>
      {grid && (
        <QReadout
          title="Grid" kw={96} w={344}
          rows={[
            { k: 'Solid', v: `${fmt.int(grid.solid)} cells`, flag: fmt.pct(grid.solid / grid.total).replace('%', '') + '%' },
            { k: 'Voxel', v: `${grid.voxel_size} mm` },
            { k: 'Shape', v: `${grid.n} × ${grid.n} × ${grid.n}` },
          ]}
        />
      )}
    </Col>
  )
}

function QuantumRail() {
  const st = useStore()
  const { q, job } = st
  const running = job?.status === 'running'
  if (running) {
    const p = job.params as Record<string, unknown>
    return (
      <Col gap={24}>
        <StepHead kicker="Step 03" title="Quantum">Running on Atlas. The preview fills in tile by tile; finished tiles are cached.</StepHead>
        <Segmented options={[{ value: 'gaussian', label: 'Gaussian', disabled: true }, { value: 'emulator', label: 'Emulation', disabled: true }, { value: 'atlas', label: 'Atlas' }]} value="atlas" onChange={() => {}} />
        <QReadout
          title="Sent" kw={96} w={344}
          rows={[
            { k: 'Strength', v: fmt.f2(Number(p.strength ?? 0)) },
            { k: 'Reach', v: fmt.f2(Number(p.reach ?? 0)) },
            { k: 'Style', v: String(p.style ?? 'x') },
            { k: 'Axes', v: p.axes ? (p.axes as number[]).map((a) => 'XYZ'[a]).join(' ') : 'X Y Z' },
            { k: 'Shots', v: p.shots ? fmt.int(Number(p.shots)) : 'exact' },
            { k: 'Run', v: job.run },
          ]}
        />
        <Field label="Tiling" note="Settings are locked while the run is going.">
          <Segmented options={[{ value: 'cube', label: 'Cubes', disabled: job.tiling !== 'cube' }, { value: 'layers', label: 'Layers', disabled: job.tiling !== 'layers' }]} value={job.tiling} onChange={() => {}} />
        </Field>
      </Col>
    )
  }
  const desc = {
    gaussian: 'An ordinary blur, only for checking that the pipeline works.',
    emulator: 'Blur the grid by quantum interference. The emulation updates as you turn the dials.',
    atlas: 'Blur the grid on Moth Atlas. Large grids are split into tiles; results are cached in grids/.',
  }[q.mode]
  return (
    <Col gap={24}>
      <StepHead kicker="Step 03" title="Quantum">{desc}</StepHead>
      <Segmented
        options={[{ value: 'gaussian', label: 'Gaussian' }, { value: 'emulator', label: 'Emulation' }, { value: 'atlas', label: 'Atlas' }]}
        value={q.mode} onChange={(v) => st.setQ({ mode: v as typeof q.mode })}
      />
      {q.mode === 'gaussian' ? (
        <Row style={{ justifyContent: 'center' }}>
          <QDial size={84} value={(q.sigma - 0.2) / 5.8} defaultValue={(1 - 0.2) / 5.8} onChange={(v) => st.setQ({ sigma: +(0.2 + v * 5.8).toFixed(2) })} label="Sigma" readout={q.sigma.toFixed(1)} min="0.2" max="6" />
        </Row>
      ) : (
        <>
          <Row between>
            <QDial size={84} value={q.strength} defaultValue={0.3} onChange={(v) => st.setQ({ strength: +v.toFixed(2) })} label="Strength" readout={fmt.f2(q.strength)} />
            <QDial size={84} value={q.reach} defaultValue={0} onChange={(v) => st.setQ({ reach: +v.toFixed(2) })} label="Reach" readout={fmt.f2(q.reach)} />
          </Row>
          <InlineField label="Style">
            <Segmented size="s" options={['x', 'y', 'xy', 'yx'].map((v) => ({ value: v, label: v }))} value={q.style} onChange={(v) => st.setQ({ style: v })} />
          </InlineField>
          <InlineField label="Blur axes">
            <AxisToggle value={q.axes.map((a) => 'xyz'[a] as 'x' | 'y' | 'z')} onChange={(v) => { if (v.length) st.setQ({ axes: v.map((a) => 'xyz'.indexOf(a)).sort() }) }} />
          </InlineField>
          <InlineField label="Shots">
            <Segmented size="s"
              options={[{ value: '0', label: 'exact' }, { value: '1000', label: '1k' }, { value: '10000', label: '10k' }, { value: '100000', label: '100k' }]}
              value={String(q.shots ?? 0)} onChange={(v) => st.setQ({ shots: +v || null })}
            />
          </InlineField>
          {(st.grid?.tiles.cube.jobs ?? 1) > 1 && (
            <InlineField label="Tiling">
              <Segmented size="s" options={[{ value: 'cube', label: 'Cubes' }, { value: 'layers', label: 'Layers' }]} value={q.tiling} onChange={(v) => st.setQ({ tiling: v as 'cube' | 'layers' })} />
            </InlineField>
          )}
          <Field label="Run name" gap={8}>
            <div style={{ flex: 1 }}><TextField value={q.run} onChange={(v: string) => st.setQ({ run: v })} /></div>
          </Field>
        </>
      )}
    </Col>
  )
}

const FILTERS: { value: VFilter; label: string }[] = [
  { value: 'none', label: 'Off' }, { value: 'gaussian', label: 'Gaussian' }, { value: 'mean', label: 'Mean' },
  { value: 'median', label: 'Median' }, { value: 'curvature', label: 'Flow' },
]
const FIELDS: { value: FieldKind; label: string; note: string }[] = [
  { value: 'threshold', label: 'toward result', note: 'Stable; pulls toward the threshold surface' },
  { value: 'difference', label: 'difference', note: 'Amplifies result − input; can fragment' },
  { value: 'gradient', label: 'gradient', note: 'Along the density gradient; mostly erodes' },
]

function MeshRail() {
  const st = useStore()
  const { m, grid } = st
  const fine = (grid?.n ?? 32) * m.refine
  return (
    <Col gap={24}>
      <StepHead kicker="Step 04" title="Mesh">
        {m.method === 'threshold'
          ? 'Make a surface from the blurred grid. Lower levels swell the shape; higher levels erode it.'
          : 'Let the quantum result move the original surface. Detail is kept and displaced; no new detail is added at the fine scale.'}
      </StepHead>
      <Segmented
        options={[{ value: 'threshold', label: 'Threshold' }, { value: 'advect', label: 'Push the surface' }]}
        value={m.method} onChange={(v) => st.setM({ method: v as 'threshold' | 'advect', refine: v === 'advect' ? Math.min(4, 256 / (grid?.n ?? 32)) : 1 })}
      />
      {m.method === 'threshold' ? (
        <>
          <Row style={{ justifyContent: 'center' }}>
            <QDial size={110} value={(m.level - 0.05) / 0.9} defaultValue={0.5} onChange={(v) => st.setM({ level: +(0.05 + v * 0.9).toFixed(2) })} label="Level" readout={fmt.f2(m.level)} min="0.05" max="0.95" />
          </Row>
          <Field label={`Smoothing${m.vfilter !== 'none' ? ` · ${m.vwidth.toFixed(1)} vox` : ''}`}>
            <Segmented size="s" options={FILTERS} value={m.vfilter} onChange={(v) => st.setM({ vfilter: v })} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24 }}>
            <Field label="Thicken / shrink" gap={8}>
              <Stepper value={m.grow} step={0.5} min={-8} max={8} valueWidth={64} format={(v: number) => `${v.toFixed(1)} vox`} onChange={(v) => st.setM({ grow: v })} />
            </Field>
            <Field label="Close gaps" gap={8}>
              <Stepper value={m.close} step={0.5} min={0} max={8} valueWidth={64} format={(v: number) => `${v.toFixed(1)} vox`} onChange={(v) => st.setM({ close: v })} />
            </Field>
          </div>
          <InlineField label="Keep">
            <Segmented size="s" options={[{ value: 'largest', label: 'Largest part' }, { value: 'all', label: 'All' }]} value={m.keep} onChange={(v) => st.setM({ keep: v as 'largest' | 'all' })} />
          </InlineField>
        </>
      ) : (
        <>
          <Field label="Field" note={FIELDS.find((f) => f.value === m.field)?.note}>
            <Segmented size="s" options={FIELDS} value={m.field} onChange={(v) => st.setM({ field: v })} />
          </Field>
          <QFader orient="h" len={300} min={0} max={8} step={0.1} steps={16} major={4} value={m.amount} onChange={(v) => st.setM({ amount: +v.toFixed(1) })} label="Amount" readout={`${m.amount.toFixed(1)} vox`} param="push distance" />
          <Field label="Refine" note={`Fine grid ${fine}³ from the ${grid?.n}³ result · max 256³`}>
            <Segmented size="s"
              options={[1, 2, 4, 8].map((r) => ({ value: String(r), label: `${r}×`, disabled: (grid?.n ?? 32) * r > 256 }))}
              value={String(m.refine)} onChange={(v) => st.setM({ refine: +v })}
            />
          </Field>
          {m.method === 'advect' && m.field === 'threshold' && (
            <Row style={{ justifyContent: 'center' }}>
              <QDial size={84} value={(m.level - 0.05) / 0.9} defaultValue={0.5} onChange={(v) => st.setM({ level: +(0.05 + v * 0.9).toFixed(2) })} label="Level" readout={fmt.f2(m.level)} />
            </Row>
          )}
        </>
      )}
    </Col>
  )
}

function ExportRail() {
  const st = useStore()
  const { m, proc, grid } = st
  const name = proc && grid
    ? `${proc.run}_${proc.mode}_n${grid.n}_L${String(Math.round(m.level * 100)).padStart(3, '0')}${m.method === 'advect' ? `_adv${m.amount}` : ''}${m.refine > 1 ? `_x${m.refine}` : ''}`
    : '—'
  return (
    <Col gap={26}>
      <StepHead kicker="Step 04 · export" title="Export">
        Scale to the print height and write the STL. A .json next to it records every setting used.
      </StepHead>
      <QFader orient="h" len={300} min={40} max={180} step={1} steps={14} major={2} value={m.height} onChange={(v) => st.setM({ height: Math.round(v) })} label="Height" readout={`${m.height} mm`} param="print height" />
      <Field label="File name" gap={8}>
        <div className="qs-field" style={{ flex: 1, display: 'flex', justifyContent: 'space-between', paddingBottom: 7, borderBottom: '1px solid var(--qs-ink)' }}>
          <span>{name}</span><span style={{ color: 'var(--qs-ink3)' }}>.stl + .json</span>
        </div>
      </Field>
      <Field label="Folder" gap={8}><span className="qs-field">output/</span></Field>
      <QPill kind="ghost" size="s" label="← Back to the surface" onClick={() => st.set({ meshTab: m.method === 'advect' ? 'push' : 'threshold' })} />
    </Col>
  )
}

function Action() {
  const st = useStore()
  const { step, job, q } = st
  if (step < 0) return null
  if (step === 0) return <QPill kind="commit" label="Voxelise" loading={st.busy.vox} onClick={() => st.voxelize()} />
  if (step === 1) return <QPill kind={st.grid ? 'commit' : 'disabled'} label="Quantum" loading={st.busy.proc} onClick={async () => { st.goStep(2); if (!st.proc && q.mode !== 'atlas') await st.process() }} />
  if (step === 2) {
    if (job?.status === 'running') {
      return (
        <Row gap={8}>
          <span className="qs-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 14px', borderRadius: 999, border: '1px solid var(--qs-ink)', color: 'var(--qs-ink2)' }}>
            <Spinner /> Running · {job.tiles_done} of {job.tiles_total} tiles
          </span>
          <QPill kind="ghost" label="Stop watching" onClick={st.cancelWatch} />
        </Row>
      )
    }
    if (q.mode === 'atlas') {
      return (
        <Row gap={12}>
          <QPill kind={st.key?.set ? 'commit' : 'disabled'} label="Submit to Atlas" loading={st.busy.proc} onClick={() => st.process({ submit: true })} />
          {!st.key?.set ? <QPill kind="ghost" label="Set API key" onClick={() => st.set({ keyOpen: true })} />
            : st.proc && <QPill kind="hair" label="Mesh" arrow onClick={() => st.goStep(3)} />}
        </Row>
      )
    }
    return (
      <Row gap={12}>
        <QPill kind={st.proc ? 'commit' : 'disabled'} label="Mesh" onClick={() => st.goStep(3)} />
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>or submit the same settings to Atlas</span>
      </Row>
    )
  }
  if (st.meshTab !== 'export') return <QPill kind={st.report ? 'commit' : 'disabled'} label="Export" onClick={() => st.set({ meshTab: 'export' })} />
  return (
    <Row gap={8}>
      <QPill kind="commit" label="Export STL" loading={st.busy.export} onClick={st.exportStl} />
      {st.exported && <QPill kind="ghost" label="Download" onClick={() => window.open(`/api/download/${encodeURIComponent(st.exported!.file)}`)} />}
    </Row>
  )
}
