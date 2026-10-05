// Inspector: 1528, 112, 344 wide. Changes with the step and is never hidden.
import { useMemo } from 'react'
import { useStore } from '../store'
import { QReadout } from '../qs/QReadout'
import { QSlice } from '../qs/QSlice'
import { QPill } from '../qs/QPill'
import { Abs, Col, Group, SectionHead, fmt } from './parts'
import { SectionMap } from './SectionMap'

function ProcessedSlice() {
  const st = useStore()
  const level = st.step === 3 ? st.m.level : 0.5
  const n = st.procData?.n ?? 32
  return (
    <Col gap={16}>
      <SectionHead label="SLICE" note={`processed · ${st.slice.axis} ${st.slice.index} of ${n - 1} · contour ${level.toFixed(2)}`} />
      <SectionMap grid={st.procData} input={st.gridData} axis={st.slice.axis} index={st.slice.index} level={level} onIndex={(i) => st.setSlice({ index: i })} />
    </Col>
  )
}

export function Inspector() {
  const step = useStore((s) => s.step)
  const meshTab = useStore((s) => s.meshTab)
  const job = useStore((s) => s.job)
  return (
    <Abs x={1528} y={112} w={344}>
      {step < 0 && <StartInspector />}
      {step === 0 && <ModelInspector />}
      {step === 1 && <SliceInspector which="input" />}
      {step === 2 && (job?.status === 'running' ? <AtlasInspector /> : <QuantumInspector />)}
      {step === 3 && (meshTab === 'export' ? <ExportInspector /> : <MeshInspector />)}
    </Abs>
  )
}

function StartInspector() {
  const key = useStore((s) => s.key)
  const flow = [
    'Open a mesh and set which way is up.',
    'Voxelise it, from 16³ to 256³.',
    'Blur it with Quantum Blur Core, on Atlas or locally.',
    'Make the surface, check it and export an STL.',
  ]
  return (
    <Col gap={34}>
      <Col gap={14}>
        <span className="qs-label">FLOW</span>
        <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', rowGap: 16, columnGap: 8 }}>
          {flow.map((t, i) => (
            <span key={i} style={{ display: 'contents' }}>
              <span style={{ font: '400 11px/1.6 var(--qs-mono)' }}>0{i + 1}</span>
              <span className="qs-prose">{t}</span>
            </span>
          ))}
        </div>
      </Col>
      <Group>
        <span className="qs-label">ATLAS</span>
        <span className="qs-body">
          {key?.set ? `Key set${key.hint ? ` · ends ${key.hint}` : ''}. Atlas runs are cached in grids/ and never submitted twice.` : 'No key set. The local emulation and the Gaussian stand-in work without one.'}
        </span>
        <div style={{ display: 'flex' }}>
          <QPill kind="hair" size="s" dot={key?.set ? 'on' : 'off'} label={key?.set ? 'Change key' : 'Set API key'} onClick={() => useStore.setState({ keyOpen: true })} />
        </div>
      </Group>
    </Col>
  )
}

function ModelInspector() {
  const model = useStore((s) => s.model)!
  const up = useStore((s) => s.up)
  const ok = (b: boolean) => (b ? '✓' : '!')
  return (
    <Col gap={32}>
      <QReadout
        title="Check" leader w={344}
        rows={[
          { k: 'Watertight', v: model.watertight ? 'yes' : 'no', flag: ok(model.watertight) },
          { k: 'Upright', v: model.lying ? `lying on ${model.lying}` : 'yes', flag: ok(!model.lying) },
          { k: 'Up axis', v: up.replace(/^(.)(.)$/, (_, s, a) => `${s}${a.toUpperCase()}`) },
          { k: 'Faces', v: fmt.int(model.faces) },
          { k: 'Vertices', v: fmt.int(model.vertices) },
        ]}
      />
      <Group>
        <span className="qs-label">ORIENTATION</span>
        <span className="qs-prose">
          {model.watertight ? '' : 'The mesh is not closed. Enclosed fill may leak; repair it in Meshmixer or Blender’s 3D Print Toolbox, or use Cap, then fill. '}
          If the model is lying on its side, change the up axis; the preview turns with it. Use the gimbal’s Front, Side and Top stations to check.
        </span>
      </Group>
    </Col>
  )
}

function SliceInspector({ which }: { which: 'input' | 'processed' }) {
  const st = useStore()
  const g = which === 'input' ? st.gridData : st.procData
  return (
    <QSlice
      grid={g} axis={st.slice.axis} index={st.slice.index}
      onAxis={(a) => st.setSlice({ axis: a })} onIndex={(i) => st.setSlice({ index: i })}
      layout="inspector" level={st.step === 3 ? st.m.level : 0.5} voxelMm={st.grid?.voxel_size ?? 3.2}
      tag={which}
    />
  )
}

/** θ_k = π · strength · ((1 − reach) · 2^−k + reach), from app/emulator.py. */
function QuantumInspector() {
  const q = useStore((s) => s.q)
  const n = useStore((s) => s.grid?.n ?? 32)
  const proc = useStore((s) => s.proc)
  const bits = Math.ceil(Math.log2(Math.min(n, 32)))
  const total = bits * q.axes.length
  const rows = Array.from({ length: Math.min(bits, 5) }, (_, k) => {
    const w = (1 - q.reach) * 2 ** -k + q.reach
    return { q: `q${k}`, w: w.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0'), t: `${(q.strength * w).toFixed(3)}π`, m: 2 ** (k + 1) }
  })
  return (
    <Col gap={16}>
      <ProcessedSlice />
      {q.mode !== 'gaussian' ? (
        <Col gap={0} style={{ marginTop: 14 }}>
          <SectionHead label="QUBITS" note={`${'xyz'[q.axes[0]]} axis · ${rows.length} of ${total}`} rule />
          {rows.map((r) => (
            <div key={r.q} className="qs-mono" style={{ display: 'grid', gridTemplateColumns: '40px 60px 70px minmax(0,1fr)', padding: '8px 0', borderBottom: '1px solid var(--qs-line)' }}>
              <span>{r.q}</span><span style={{ color: 'var(--qs-ink2)' }}>{r.w}</span><span>{r.t}</span>
              <span style={{ color: 'var(--qs-ink3)', textAlign: 'right' }}>mixes {r.m} cells</span>
            </div>
          ))}
          <span className="qs-cap" style={{ paddingTop: 10, color: 'var(--qs-ink3)' }}>
            {q.reach === 0 ? 'With reach 0, each higher qubit turns half as far, so the blur stays local.' : `With reach ${q.reach.toFixed(2)}, higher qubits keep turning, so the blur acts over longer distances${n > 32 ? ' (up to the tile size)' : ''}.`}
          </span>
        </Col>
      ) : (
        <span className="qs-cap">The Gaussian stand-in is only for checking the pipeline; it has nothing to do with the quantum effect.</span>
      )}
      {proc?.mode === 'atlas' && (
        <QReadout title="Atlas result" w={344} kw={96} rows={[
          { k: 'Run', v: proc.run }, { k: 'Source', v: proc.cached ? 'cache · grids/' : 'Atlas' },
          { k: 'Tiles', v: proc.tiles ? `${proc.tiles.jobs} of ${proc.tiles.shape?.join(' × ') ?? ''}` : '1' },
          { k: 'Time', v: `${proc.seconds ?? '—'} s` },
        ]} />
      )}
    </Col>
  )
}

function AtlasInspector() {
  const job = useStore((s) => s.job)!
  const log = useStore((s) => s.log)
  const shape = job.tile_shape
  const tiles = Array.from({ length: Math.min(job.tiles_total, 8) }, (_, i) => i < job.tiles_done ? 'done' : i < job.tiles_done + 3 ? 'running' : 'queued')
  return (
    <Col gap={26}>
      <Col gap={12}>
        <SectionHead label="TILES" note={`${shape.join(' × ')} · ${job.tiling === 'cube' ? 'cubes' : 'layers'}`} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
          {tiles.map((s, i) => (
            <div key={i} style={{
              position: 'relative', height: 72, border: s === 'queued' ? '1px solid var(--qs-ink4)' : '1px solid var(--qs-ink)',
              background: s === 'done' ? 'var(--qs-ink)' : s === 'running' ? 'linear-gradient(0deg,var(--qs-ink) 30%,transparent 30%)' : 'transparent',
            }}>
              <span className="qs-small" style={{ position: 'absolute', left: 7, top: 7, padding: '2px 5px', background: 'var(--qs-bg)' }}>Tile {i + 1}</span>
              <span className="qs-small" style={{ position: 'absolute', left: 7, bottom: 7, padding: '2px 5px', background: 'var(--qs-bg)', color: 'var(--qs-ink2)' }}>
                {s === 'done' ? (i < job.tiles_cached ? 'done · cached' : 'done') : s}
              </span>
            </div>
          ))}
        </div>
        {job.tiles_total > 8 && <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>+ {job.tiles_total - 8} more tiles</span>}
      </Col>
      <Group gap={9} pad={18}>
        <span className="qs-label">PATH</span>
        {[['Browser', 2], ['Flask · local', 2], ['Atlas API', 2], ['Queue', job.atlas_status === 'queued' || job.atlas_status === 'pending' ? 1 : 2], ['Blur Core', job.atlas_status === 'running' ? 1 : job.tiles_done ? 2 : 0], ['Cache · grids/', job.tiles_done ? 2 : 0], ['Stitch', 0]].map(([t, s]) => (
          <div key={t as string} className="qs-mono" style={{ display: 'grid', gridTemplateColumns: '16px minmax(0,1fr)', alignItems: 'center', color: s ? 'var(--qs-ink)' : 'var(--qs-ink3)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1px solid currentColor', background: s === 2 ? 'currentColor' : 'transparent', animation: s === 1 ? 'qs-blink 1.2s infinite' : undefined }} />
            <span>{t}</span>
          </div>
        ))}
      </Group>
      <LogBlock lines={log.slice(-6)} />
    </Col>
  )
}

export function LogBlock({ lines }: { lines: { t: number; text: string; level?: string }[] }) {
  const time = (t: number) => new Date(t).toTimeString().slice(0, 8)
  return (
    <Group gap={7} pad={18}>
      <span className="qs-label" style={{ marginBottom: 3 }}>LOG</span>
      {lines.length === 0 && <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>Nothing yet</span>}
      {lines.map((l, i) => (
        <span key={i} style={{ font: '400 11px/1.3 var(--qs-mono)', color: l.level === 'info' && i < lines.length - 1 ? 'var(--qs-ink2)' : 'var(--qs-ink)' }}>
          {time(l.t)}  {l.level !== 'info' ? '! ' : ''}{l.text}
        </span>
      ))}
    </Group>
  )
}

function MeshInspector() {
  const st = useStore()
  const { procData, gridData, m, report, grid } = st
  // Kept share against level: cells ≥ level in the result over solid input cells
  const curve = useMemo(() => {
    if (!procData || !gridData) return null
    const levels = Array.from({ length: 19 }, (_, i) => 0.05 + i * 0.05)
    let input = 0
    for (const v of gridData.data) if (v >= 0.5) input++
    const counts = levels.map(() => 0)
    for (const v of procData.data) for (let i = 0; i < levels.length && v >= levels[i]; i++) counts[i]++
    return { levels, share: counts.map((c) => c / Math.max(1, input)), input }
  }, [procData, gridData])
  const kept = useMemo(() => {
    if (!procData || !curve) return 0
    let c = 0
    for (const v of procData.data) if (v >= m.level) c++
    return c / Math.max(1, curve.input)
  }, [procData, curve, m.level])

  const W = 344, H = 96, max = curve ? Math.max(1.2, ...curve.share) : 1.2
  const x = (l: number) => ((l - 0.05) / 0.9) * W
  const y = (s: number) => 88 - (s / max) * 80
  return (
    <Col gap={16}>
      <ProcessedSlice />
      <Group gap={10} pad={18}>
        <span className="qs-label">KEPT</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="qs-hero">{Math.round(kept * 100)}%</span>
          <span className="qs-cap" style={{ color: 'var(--qs-ink3)' }}>of the input solid</span>
        </div>
        <div style={{ display: 'flex', gap: 2, height: 8 }}>
          <div style={{ width: `${Math.min(100, kept * 100)}%`, background: 'var(--qs-ink)' }} />
          <div style={{ flex: 1, background: 'rgba(21,22,24,.1)' }} />
        </div>
        {curve && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <line x1="0" y1="88" x2={W} y2="88" stroke="var(--qs-ink4)" />
            <line x1="0" y1={y(1)} x2={W} y2={y(1)} stroke="var(--qs-ink3)" strokeDasharray="2 3" />
            <text x={W - 34} y={y(1) - 5} fontFamily="Geist Mono" fontSize="9" fill="var(--qs-ink3)">input</text>
            <polyline points={curve.levels.map((l, i) => `${x(l).toFixed(1)},${y(curve.share[i]).toFixed(1)}`).join(' ')} fill="none" stroke="var(--qs-ink)" strokeWidth="1.25" />
            <circle cx={x(m.level)} cy={y(kept)} r="3.5" fill="var(--qs-ink)" />
            <line x1={x(m.level)} y1={y(kept)} x2={x(m.level)} y2="88" stroke="var(--qs-ink)" strokeDasharray="1 3" />
          </svg>
        )}
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>level 0.05 → 0.95</span>
      </Group>
      {m.method === 'advect' && report && (
        <QReadout title="Level set" kw={96} w={344} rows={[
          { k: 'Fine grid', v: `${(grid?.n ?? 0) * m.refine}³` },
          { k: 'Fine voxel', v: `${report.fine_voxel_mm} mm` },
          { k: 'Field', v: m.field },
          { k: 'Amount', v: `${m.amount.toFixed(1)} vox` },
        ]} />
      )}
    </Col>
  )
}

function ExportInspector() {
  const st = useStore()
  const { report: r, grid, proc, m, model } = st
  if (!r) return <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>Building the surface…</span>
  const p = (proc?.params ?? {}) as Record<string, unknown>
  return (
    <Col gap={26}>
      <QReadout
        title="Print check" leader w={344}
        rows={[
          { k: 'Watertight', v: String(r.watertight), flag: r.watertight ? '✓' : '!' },
          { k: 'Parts', v: `${r.parts}${r.total_parts > r.parts ? ` of ${r.total_parts}` : ''}`, flag: r.parts === 1 ? '✓' : '!' },
          { k: 'Faces', v: fmt.int(r.faces) },
          { k: 'Voxel', v: `${r.fine_voxel_mm} mm`, flag: r.fine_voxel_mm <= 4 ? '✓' : '!' },
          { k: 'Volume', v: r.volume_cm3 != null ? `${r.volume_cm3} cm³` : '—' },
          { k: 'Extents', v: r.extents.map((v) => v.toFixed(0)).join(' × '), flag: '✓' },
        ]}
      />
      <Group gap={10} pad={18}>
        <SectionHead label="JSON" note={st.exported ? st.exported.file.replace('.stl', '.json') : 'written on export'} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, font: '400 11px/1.3 var(--qs-mono)', color: 'var(--qs-ink2)' }}>
          <span>model {model?.file} · up {model?.up}</span>
          <span>grid {grid?.n} · fill {grid?.fill} · values {grid?.values}</span>
          <span>mode {proc?.mode} · strength {String(p.strength ?? '—')} · reach {String(p.reach ?? '—')}</span>
          <span>style {String(p.style ?? '—')} · axes {p.axes ? (p.axes as number[]).map((a) => 'xyz'[a]).join(' ') : 'x y z'} · shots {String(p.shots ?? 'none')}</span>
          <span>mesh {m.method} · level {m.level}{m.method === 'advect' ? ` · amount ${m.amount} · refine ${m.refine}` : ''}</span>
          <span>smooth {m.vfilter} {m.vwidth} · offset {m.grow} · close {m.close}</span>
          <span>keep {m.keep} · height_mm {m.height}</span>
        </div>
      </Group>
    </Col>
  )
}
