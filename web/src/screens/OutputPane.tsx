// OUTPUT: what each step produced. Read-only readouts and charts, plus the export.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { Segmented } from '../qs/Segmented'
import { Slider } from '../qs/Slider'
import { QReadout } from '../qs/QReadout'
import { QPill } from '../qs/QPill'
import { ScrollArea } from '../qs/ScrollArea'
import { LevelHistogram } from '../qs/LevelHistogram'
import { histogram, solidPerLayer, type Axis } from '../qs/grid'
import { SectionMap } from './SectionMap'
import { fmt } from './parts'

const MARKERS = [
  { id: 'out-model', label: 'M' }, { id: 'out-grid', label: 'G' }, { id: 'out-slice', label: 'S' },
  { id: 'out-quantum', label: 'Q' }, { id: 'out-print', label: 'P' }, { id: 'out-export', label: 'E' },
]

function Blk({ id, label, note, children }: { id: string; label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="blk" data-mark={id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="qs-label">{label}</span>
        {note != null && <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>{note}</span>}
      </div>
      {children}
    </div>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="qs-help">{children}</p>

export function OutputPane() {
  return (
    <aside className="insp" aria-label="Output">
      <div className="pane-head"><span className="qs-label">Output</span><span className="pane-head__note">results</span></div>
      <ScrollArea markers={MARKERS} className="pane-scroll">
        <ModelOut />
        <GridOut />
        <SliceOut />
        <QuantumOut />
        <PrintOut />
        <ExportOut />
        <div style={{ height: 40 }} />
      </ScrollArea>
    </aside>
  )
}

function ModelOut() {
  const model = useStore((s) => s.model)
  if (!model) return <Blk id="out-model" label="Model"><Empty>No model yet.</Empty></Blk>
  const max = Math.max(...model.extents)
  return (
    <Blk id="out-model" label="Model" note={model.builtin ? 'built-in' : model.file}>
      <QReadout w="100%" kw={92} rows={[
        { k: 'Faces', v: fmt.int(model.faces) },
        { k: 'Vertices', v: fmt.int(model.vertices) },
        { k: 'Watertight', v: model.watertight ? 'yes' : 'no', flag: model.watertight ? '✓' : '!' },
      ]} />
      <div className="qs-mono" style={{ display: 'grid', gridTemplateColumns: '14px 1fr 44px', rowGap: 8, alignItems: 'center' }}>
        {model.extents.map((v, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <span style={{ color: 'var(--qs-ink2)' }}>{'XYZ'[i]}</span>
            <span style={{ height: 6, background: 'var(--qs-line)', position: 'relative' }}>
              <span style={{ position: 'absolute', inset: 0, width: `${(v / max) * 100}%`, background: 'var(--qs-ink)' }} />
            </span>
            <span style={{ textAlign: 'right' }}>{v.toFixed(0)}</span>
          </span>
        ))}
      </div>
    </Blk>
  )
}

function GridOut() {
  const grid = useStore((s) => s.grid)
  const g = useStore((s) => s.gridData)
  const sliceIdx = useStore((s) => s.slice)
  const counts = useMemo(() => (g ? solidPerLayer(g, 'z') : []), [g])
  if (!grid) return <Blk id="out-grid" label="Grid"><Empty>Voxelise to see the grid.</Empty></Blk>
  const cube = grid.tiles.cube
  const peak = Math.max(1, ...counts)
  return (
    <Blk id="out-grid" label="Grid" note={`${grid.n}³`}>
      <QReadout w="100%" kw={92} rows={[
        { k: 'Solid', v: `${fmt.int(grid.solid)}`, flag: `${((grid.solid / grid.total) * 100).toFixed(1)}%` },
        { k: 'Voxel', v: `${grid.voxel_size} mm` },
        { k: 'Atlas', v: cube.jobs > 1 ? `${cube.jobs} jobs · ${cube.shape.join('×')}` : 'one job' },
      ]} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="qs-field-head"><span>Solid cells per layer · z</span><output>max {fmt.int(peak)}</output></div>
        <svg width="100%" height="40" viewBox={`0 0 ${counts.length} 40`} preserveAspectRatio="none">
          {counts.map((c, i) => (
            <rect key={i} x={i + 0.15} width={0.7} y={40 - (c / peak) * 39} height={(c / peak) * 39}
              fill={sliceIdx.axis === 'z' && i === sliceIdx.index ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />
          ))}
        </svg>
      </div>
    </Blk>
  )
}

function SliceOut() {
  const st = useStore()
  const { slice, gridData, procData, m } = st
  const [src, setSrc] = useState<'input' | 'processed'>('input')
  const g = src === 'processed' && procData ? procData : gridData
  const n = g?.n ?? 32
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(260)
  useEffect(() => {
    const ro = new ResizeObserver(() => box.current && setW(box.current.clientWidth))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { setSrc(procData ? 'processed' : 'input') }, [!!procData]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (slice.index > n - 1) st.setSlice({ index: Math.floor(n / 2) }) }, [n]) // eslint-disable-line react-hooks/exhaustive-deps
  const level = src === 'processed' ? m.level : 0.5
  return (
    <Blk id="out-slice" label="Slice" note={`${slice.axis} ${slice.index} / ${n - 1}`}>
      <div ref={box} style={{ width: '100%' }}>
        {g ? <SectionMap size={w} grid={g} input={src === 'processed' ? gridData : null} axis={slice.axis} index={slice.index} level={level} onIndex={(i) => st.setSlice({ index: i })} />
          : <Empty>Voxelise to slice the grid.</Empty>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <Segmented size="s" options={[{ value: 'input', label: 'Input' }, { value: 'processed', label: 'Processed', disabled: !procData }]} value={src} onChange={(v) => setSrc(v as 'input' | 'processed')} />
        <Segmented<Axis> size="s" options={[{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }]} value={slice.axis} onChange={(a) => st.setSlice({ axis: a })} />
      </div>
      <Slider label="Position" value={slice.index} min={0} max={n - 1} step={1} ticks={8} onChange={(v) => st.setSlice({ index: v })}
        format={(v) => `${v} · ${(v * (st.grid?.voxel_size ?? 0)).toFixed(1)} mm`} />
    </Blk>
  )
}

function QuantumOut() {
  const proc = useStore((s) => s.proc)
  const procData = useStore((s) => s.procData)
  const level = useStore((s) => s.m.level)
  const setM = useStore((s) => s.setM)
  const bins = useMemo(() => (procData ? histogram(procData, 48) : new Array(48).fill(0)), [procData])
  if (!proc) return <Blk id="out-quantum" label="Quantum result"><Empty>Run the quantum step to see the result.</Empty></Blk>
  const src = proc.mode === 'atlas' ? (proc.cached ? 'Atlas · cache' : 'Atlas') : proc.mode === 'emulator' ? 'emulation' : 'gaussian'
  return (
    <Blk id="out-quantum" label="Quantum result" note={proc.run}>
      <QReadout w="100%" kw={92} rows={[
        { k: 'Source', v: src },
        { k: 'Time', v: proc.seconds != null ? `${proc.seconds} s` : '—' },
        { k: 'Range', v: `${proc.min.toFixed(3)} – ${proc.max.toFixed(3)}` },
        ...(proc.tiles ? [{ k: 'Tiles', v: `${proc.tiles.jobs} · ${proc.tiles.mode}` }] : []),
      ]} />
      <div style={{ paddingTop: 4 }}>
        <LevelHistogram bins={bins} level={level} onLevel={(v) => setM({ level: v })} height={64} />
      </div>
    </Blk>
  )
}

function PrintOut() {
  const r = useStore((s) => s.report)
  if (!r) return <Blk id="out-print" label="Print check"><Empty>After the mesh step, the check of the printed model appears here.</Empty></Blk>
  return (
    <Blk id="out-print" label="Print check" note={r.method === 'advect' ? 'push' : 'threshold'}>
      <QReadout w="100%" leader rows={[
        { k: 'Size mm', v: r.extents.map((v) => v.toFixed(1)).join(' × ') },
        { k: 'Watertight', v: r.watertight ? 'yes' : 'no', flag: r.watertight ? '✓' : '!' },
        { k: 'Volume', v: r.volume_cm3 != null ? `${r.volume_cm3} cm³` : '—' },
        { k: 'Parts', v: r.total_parts > r.parts ? `${r.parts} of ${r.total_parts}` : String(r.parts), flag: r.parts === 1 ? '✓' : '!' },
        { k: 'Faces', v: fmt.int(r.faces) },
        { k: 'Cell', v: r.refine > 1 ? `${r.fine_voxel_mm} mm fine` : `${r.voxel_mm} mm` },
      ]} />
      {!r.watertight && <p className="qs-help" style={{ color: 'var(--qs-ink)' }}>! Not watertight. Try closing gaps or a lower level.</p>}
    </Blk>
  )
}

function ExportOut() {
  const st = useStore()
  return (
    <Blk id="out-export" label="Export" note="output/">
      <div className="row">
        <QPill kind={st.report ? 'commit' : 'disabled'} size="s" label="Export STL" loading={st.busy.export} onClick={st.exportStl} />
        {st.exported && <QPill kind="hair" size="s" label="Download" onClick={() => window.open(`/api/download/${encodeURIComponent(st.exported!.file)}`)} />}
      </div>
      {st.exported ? (
        <div className="qs-mono" style={{ display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.3 }}>
          <span>{st.exported.file}</span>
          <span style={{ color: 'var(--qs-ink2)' }}>{st.exported.file.replace(/\.stl$/, '.json')} · every setting</span>
        </div>
      ) : <Empty>Writes an STL at the print height and a .json with every setting used.</Empty>}
    </Blk>
  )
}
