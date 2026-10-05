// OUTPUT: what each step produced. Read-only readouts and charts, plus the export.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { Segmented } from '../qs/Segmented'
import { Slider } from '../qs/Slider'
import { QReadout } from '../qs/QReadout'
import { QPill } from '../qs/QPill'
import { ScrollArea, type ScrollIndex } from '../qs/ScrollArea'
import { IconButton } from '../qs/Icon'
import { LevelHistogram } from '../qs/LevelHistogram'
import { histogram, solidPerLayer, type Axis } from '../qs/grid'
import { SectionMap } from './SectionMap'
import { fmt } from './parts'

const MARKERS = [
  { id: 'out-model', label: 'Model', icon: 'model' }, { id: 'out-grid', label: 'Grid', icon: 'grid' },
  { id: 'out-slice', label: 'Slice', icon: 'slice' }, { id: 'out-quantum', label: 'Quantum result', icon: 'quantum' },
  { id: 'out-print', label: 'Print check', icon: 'print' }, { id: 'out-export', label: 'Export', icon: 'export' },
]

/** Blender-style property tabs: one icon per output section, the active one inverted. */
function Tabs({ markers, active, go }: ScrollIndex) {
  return (
    <nav className="tabs" aria-label="Output sections">
      {markers.map((mk) => (
        <IconButton key={mk.id} name={mk.icon ?? 'grid'} title={mk.label} on={active === mk.id} onClick={() => go(mk.id)} />
      ))}
    </nav>
  )
}

function Blk({ id, label, note, tools, children }: { id: string; label: string; note?: ReactNode; tools?: ReactNode; children: ReactNode }) {
  return (
    <div className="blk" data-mark={id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 22 }}>
        <span className="qs-label">{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {note != null && <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>{note}</span>}
          {tools}
        </span>
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
      <ScrollArea markers={MARKERS} className="pane-scroll pane-scroll--tabs" bar={false} renderIndex={(ix) => <Tabs {...ix} />}>
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

/** A show/hide toggle for something this panel draws in the workspace. */
function Shows({ on, what, set }: { on: boolean; what: string; set: (v: boolean) => void }) {
  return <IconButton size={22} name={on ? 'eye' : 'eyeOff'} title={`${on ? 'Hide' : 'Show'} ${what} in the view`} on={on} onClick={() => set(!on)} />
}

function ModelOut() {
  const model = useStore((s) => s.model)
  const dims = useStore((s) => s.hud.dims)
  const setHud = useStore((s) => s.setHud)
  if (!model) return <Blk id="out-model" label="Model"><Empty>No model yet.</Empty></Blk>
  const max = Math.max(...model.extents)
  return (
    <Blk id="out-model" label="Model" note={model.builtin ? 'built-in' : model.file} tools={<Shows on={dims} what="size marks" set={(v) => setHud({ dims: v })} />}>
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
  const { slice, gridData, procData, m, hud, view, scan } = st
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
  const scanning = view === 'scan'
  const canScan = !!procData && !!gridData
  const live = st.job?.status === 'running'
  const sweep = () => {
    if (!scanning) st.setView('scan')
    st.setSlice({ axis: 'z', index: slice.index >= n - 1 || !scanning ? 0 : slice.index })
    st.setScan({ playing: true })
  }
  return (
    <Blk id="out-slice" label="Slice" note={`${slice.axis} ${slice.index} / ${n - 1}`}
      tools={<Shows on={hud.slice} what="the cutting plane" set={(v) => st.setHud({ slice: v })} />}>
      <div ref={box} style={{ width: '100%' }}>
        {g ? <SectionMap size={w} grid={g} input={src === 'processed' ? gridData : null} axis={slice.axis} index={slice.index} level={level} onIndex={(i) => st.setSlice({ index: i })} />
          : <Empty>Voxelise to slice the grid.</Empty>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <Segmented size="s" options={[{ value: 'input', label: 'Input' }, { value: 'processed', label: 'Processed', disabled: !procData }]} value={src} onChange={(v) => setSrc(v as 'input' | 'processed')} />
        <Segmented<Axis> size="s" options={(['x', 'y', 'z'] as Axis[]).map((a) => ({ value: a, label: a.toUpperCase(), disabled: scanning && a !== 'z' }))} value={slice.axis} onChange={(a) => st.setSlice({ axis: a })} />
      </div>
      <Slider label="Cutting plane" value={slice.index} min={0} max={n - 1} step={1} ticks={8} disabled={scanning && live}
        onChange={(v) => { st.setScan({ playing: false }); st.setSlice({ index: v }) }}
        format={(v) => `${v} · ${(v * (st.grid?.voxel_size ?? 0)).toFixed(1)} mm`} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 4 }}>
          <IconButton name={scan.playing ? 'pause' : slice.index >= n - 1 && scanning ? 'replay' : 'play'} disabled={!canScan || live}
            title={scan.playing ? 'Pause the sweep' : 'Sweep the plane bottom to top: result below, original above'}
            on={scan.playing} onClick={() => (scan.playing ? st.setScan({ playing: false }) : sweep())} />
          <IconButton name="scan" title={scanning ? 'Leave the scan view' : 'Scan view: result below the plane, original above'} on={scanning} disabled={!canScan}
            onClick={() => (scanning ? st.setView('processed') : st.setView('scan'))} />
        </div>
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>
          {live && st.job?.frontier != null ? 'following the Atlas run' : scanning ? 'scan · linked to the plane' : hud.slice ? 'plane shown in the view' : ''}
        </span>
      </div>
    </Blk>
  )
}

function QuantumOut() {
  const proc = useStore((s) => s.proc)
  const procData = useStore((s) => s.procData)
  const level = useStore((s) => s.m.level)
  const setM = useStore((s) => s.setM)
  const legend = useStore((s) => s.hud.legend)
  const setHud = useStore((s) => s.setHud)
  const bins = useMemo(() => (procData ? histogram(procData, 48) : new Array(48).fill(0)), [procData])
  if (!proc) return <Blk id="out-quantum" label="Quantum result"><Empty>Run the quantum step to see the result.</Empty></Blk>
  const src = proc.mode === 'atlas' ? (proc.cached ? 'Atlas · cache' : 'Atlas') : proc.mode === 'emulator' ? 'emulation' : 'gaussian'
  return (
    <Blk id="out-quantum" label="Quantum result" note={proc.run} tools={<Shows on={legend} what="value scale" set={(v) => setHud({ legend: v })} />}>
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
