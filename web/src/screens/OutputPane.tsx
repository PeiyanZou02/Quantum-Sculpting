// OUTPUT: what each step produced. Read-only readouts and charts, plus the export.
import { useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import type { QrngSummary } from '../api'
import { Segmented } from '../qs/Segmented'
import { Slider } from '../qs/Slider'
import { QReadout } from '../qs/QReadout'
import { QPill } from '../qs/QPill'
import { Icon } from '../qs/Icon'
import { EvolveSections } from './EvolvePanel'
import { QuantumSections } from './QuantumPanel'
import { IconButton } from '../qs/Icon'
import { LevelHistogram } from '../qs/LevelHistogram'
import { histogram, solidPerLayer, type Axis } from '../qs/grid'
import { SectionMap } from './SectionMap'
import { fmt } from './fmt'
import { SLICE_COLORS, useSliceScheme, type SliceColor } from '../qs/sectionColor'
import { Panel, Row } from '../ui/Panel'
import { PresentStyle } from './presentStyle'
import { ComposeSections, OutputSections } from './PresentPanel'
import { RunBar } from './RunBar'
import { Count } from '../hud/Num'


/** A block: a folding panel in Lab; plain (title and content) when drawn as a HUD card. */
function Blk({ id, label, note, tools, children }: { id: string; label: string; note?: ReactNode; tools?: ReactNode; children: ReactNode }) {
  const card = useContext(PresentStyle)
  if (!card) return <Panel id={id} title={label} aside={note} tools={tools}>{children}</Panel>
  return (
    <div className="blk" data-mark={id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 22 }}>
        <span className="blk__title">{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {note != null && <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>{note}</span>}
          {tools}
        </span>
      </div>
      {children}
    </div>
  )
}

/** A large number with its label, infographic style. */
function Hero({ k, v, unit, note, wide }: { k: string; v: ReactNode; unit?: string; note?: ReactNode; wide?: boolean }) {
  return (
    <div className={'hero' + (wide ? ' hero--wide' : '')}>
      <span className="hero__k">{k}</span>
      <span className="hero__v"><Count>{v}</Count>{unit && <small>{unit}</small>}</span>
      {note != null && <span className="hero__n">{note}</span>}
    </div>
  )
}

interface Fig { k: string; v: ReactNode; unit?: string; note?: ReactNode; wide?: boolean }
function Figures({ items }: { items: Fig[] }) {
  const present = useContext(PresentStyle)
  if (present) return <div className="heroes">{items.map((f) => <Hero key={f.k} {...f} />)}</div>
  return (
    <div className="figs">
      {items.map((f) => (
        <div key={f.k} className="figs__row">
          <span className="figs__k">{f.k}</span>
          <span className="figs__v">{f.v}{f.unit && <small> {f.unit}</small>}</span>
          {f.note != null && <span className="figs__n">{f.note}</span>}
        </div>
      ))}
    </div>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="qs-help ux-note">{children}</p>

/** The groups of Properties: one per step, so the rail matches the Parameters rail, then what goes on
 *  the view (Compose) and what leaves the app (Output). */
const GROUPS: { id: GroupId; icon: string; t: string }[] = [
  { id: 'model', icon: 'model', t: 'Model' },
  { id: 'voxels', icon: 'grid', t: 'Grid' },
  { id: 'quantum', icon: 'quantum', t: 'Quantum' },
  { id: 'mesh', icon: 'print', t: 'Mesh' },
  { id: 'compose', icon: 'layers', t: 'Compose' },
  { id: 'output', icon: 'export', t: 'Output' },
]
type GroupId = 'model' | 'voxels' | 'quantum' | 'mesh' | 'compose' | 'output'
const KEY = 'qs-props'
const savedGroup = (): GroupId => {
  try { const v = localStorage.getItem(KEY); return GROUPS.some((x) => x.id === v) ? (v as GroupId) : 'model' } catch { return 'model' }
}

/** Lab · properties, one group at a time: what a step produced, or the composition and the output.
 *  It has its own rail and keeps what you pick on it, whatever step Parameters has open. */
export function OutputPane() {
  const evolve = useStore((s) => s.q.mode === 'nations')
  // nothing computed yet for this mode: the run sits on top of the quantum group
  const ran = useStore((s) => (s.q.mode === 'nations' ? !!s.evolve.history : !!s.proc && s.proc.mode !== 'nations'))
  const [g, setG] = useState<GroupId>(savedGroup)
  const pick = (x: GroupId) => { setG(x); try { localStorage.setItem(KEY, x) } catch { /* per-viewer */ } }
  return (
    <div className="lab-in lab-in--right">
      <div className="lab-in__page">
        <header className="lab-in__head">
          <span className="lab-in__no">{String(GROUPS.findIndex((x) => x.id === g) + 1).padStart(2, '0')}</span>
          <span className="lab-in__t">{g === 'quantum' && evolve ? 'Evolve' : GROUPS.find((x) => x.id === g)!.t}</span>
        </header>
        <div className="lab-props" key={g}>
          {g === 'model' && <ModelOut />}
          {g === 'voxels' && <><GridOut /><SliceOut /></>}
          {g === 'quantum' && <>{!ran && <RunBar inline />}<QuantumOut />{evolve ? <EvolveSections /> : <QuantumSections />}</>}
          {g === 'mesh' && <><PrintOut /><ExportOut /></>}
          {g === 'compose' && <ComposeSections />}
          {g === 'output' && <OutputSections />}
          <div style={{ height: 24 }} />
        </div>
      </div>
      <nav className="lab-rail lab-rail--right" aria-label="Properties by stage">
        {GROUPS.map((x, k) => (
          <button key={x.id} className={'lab-rail__b' + (g === x.id ? ' lab-rail__b--on' : '') + (x.id === 'compose' ? ' lab-rail__b--sep' : '')} onClick={() => pick(x.id)}
            aria-current={g === x.id ? 'page' : undefined} data-tip={`${String(k + 1).padStart(2, '0')} ${x.id === 'quantum' && evolve ? 'Evolve' : x.t}`} data-tip-side="left">
            <Icon name={x.id === 'quantum' && evolve ? 'entangle' : x.icon} size={16} />
          </button>
        ))}
      </nav>
    </div>
  )
}

/** A show/hide toggle for something this panel draws in the workspace. */
function Shows({ on, what, set }: { on: boolean; what: string; set: (v: boolean) => void }) {
  return <IconButton size={22} name={on ? 'eye' : 'eyeOff'} title={`${on ? 'Hide' : 'Show'} ${what} in the view`} on={on} onClick={() => set(!on)} />
}

export function ModelOut() {
  const model = useStore((s) => s.model)
  const dims = useStore((s) => s.hud.dims)
  const setHud = useStore((s) => s.setHud)
  if (!model) return <Blk id="out-model" label="Model"><Empty>No model yet.</Empty></Blk>
  const max = Math.max(...model.extents)
  return (
    <Blk id="out-model" label="Model" note={model.builtin ? 'built-in' : model.file} tools={<Shows on={dims} what="size marks" set={(v) => setHud({ dims: v })} />}>
      <Figures items={[
        { wide: true, k: 'Size', v: model.extents.map((v) => v.toFixed(0)).join(' × '), unit: 'mm' },
        { k: 'Faces', v: fmt.int(model.faces), note: `${fmt.int(model.vertices)} vertices · ${model.watertight ? 'watertight' : 'open'}` },
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

export function GridOut() {
  const grid = useStore((s) => s.grid)
  const g = useStore((s) => s.gridData)
  const sliceIdx = useStore((s) => s.slice)
  const setSlice = useStore((s) => s.setSlice)
  const counts = useMemo(() => (g ? solidPerLayer(g, 'z') : []), [g])
  if (!grid) return <Blk id="out-grid" label="Grid"><Empty>Voxelise to see the grid.</Empty></Blk>
  const cube = grid.tiles.cube
  const peak = Math.max(1, ...counts)
  return (
    <Blk id="out-grid" label="Grid" note={`${grid.n}³`}>
      <Figures items={[
        { k: 'Solid cells', v: fmt.int(grid.solid), note: `${((grid.solid / grid.total) * 100).toFixed(1)}% of ${grid.n}³` },
        { k: 'Voxel', v: grid.voxel_size, unit: 'mm', note: cube.jobs > 1 ? `${cube.jobs} Atlas jobs` : 'one Atlas job' },
      ]} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="qs-field-head"><span>Solid cells per layer</span><output>max {fmt.int(peak)}</output></div>
        <svg width="100%" height="40" viewBox={`0 0 ${counts.length} 40`} preserveAspectRatio="none">
          {counts.map((c, i) => (
            <g key={i} className="spark-bar" onClick={() => setSlice({ axis: 'z', index: i })} data-tip={`z ${i} · ${c} solid cells`} data-tip-side="top">
              <rect x={i} width={1} y={0} height={40} fill="transparent" />
              <rect x={i + 0.15} width={0.7} y={40 - (c / peak) * 39} height={(c / peak) * 39}
                fill={sliceIdx.axis === 'z' && i === sliceIdx.index ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />
            </g>
          ))}
        </svg>
        <p className="qs-help">Click a bar to cut there.</p>
      </div>
    </Blk>
  )
}

export function SliceOut() {
  const st = useStore()
  const { slice, gridData, procData, m, hud, view, scan } = st
  const [src, setSrc] = useState<'input' | 'processed'>(procData ? 'processed' : 'input')
  // a result arriving (or going) switches the source to it; otherwise the choice is the user's
  const hasProc = !!procData
  const [srcFor, setSrcFor] = useState(hasProc)
  if (srcFor !== hasProc) {
    setSrcFor(hasProc)
    setSrc(hasProc ? 'processed' : 'input')
  }
  const g = src === 'processed' && procData ? procData : gridData
  const n = g?.n ?? 32
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(260)
  useEffect(() => {
    const ro = new ResizeObserver(() => box.current && setW(box.current.clientWidth))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])
  // only a new grid size re-centres the slice; the index itself is read, not watched
  const fitSlice = useEffectEvent(() => { if (slice.index > n - 1) st.setSlice({ index: Math.floor(n / 2) }) })
  useEffect(() => { fitSlice() }, [n])
  const level = src === 'processed' ? m.level : 0.5
  const colors = useSliceScheme(src === 'processed')
  const nationsOn = st.proc?.mode === 'nations'
  const scanning = view === 'scan'
  const canScan = !!procData && !!gridData
  const live = st.job?.status === 'running'
  const sweep = () => {
    if (!scanning) st.setFocus('scan', 'Scan sweep')
    st.setSlice({ axis: 'z', index: slice.index >= n - 1 || !scanning ? 0 : slice.index })
    st.setScan({ playing: true })
  }
  return (
    <Blk id="out-slice" label="Slice" note={`${slice.axis} ${slice.index} / ${n - 1}`}
      tools={<Shows on={hud.slice} what="the cutting plane" set={(v) => st.setHud({ slice: v })} />}>
      <div ref={box} style={{ width: '100%' }}>
        {g ? <SectionMap size={w} grid={g} input={src === 'processed' ? gridData : null} axis={slice.axis} index={slice.index} level={level} scheme={colors.scheme} owner={colors.owner}
          onIndex={(i) => { st.setSlice({ index: i }); if (!hud.slice) st.setHud({ slice: true }) }} />
          : <Empty>Voxelise to slice the grid.</Empty>}
      </div>
      <div className="out-pair">
        <Segmented size="s" options={[{ value: 'input', label: 'Input' }, { value: 'processed', label: 'Processed', disabled: !procData }]} value={src} onChange={(v) => setSrc(v as 'input' | 'processed')} />
        <Segmented<Axis> size="s" options={(['x', 'y', 'z'] as Axis[]).map((a) => ({ value: a, label: a.toUpperCase(), disabled: scanning && a !== 'z' }))} value={slice.axis} onChange={(a) => st.setSlice({ axis: a })} />
      </div>
      <Row label="Colour">
        <Segmented<SliceColor> size="s" options={SLICE_COLORS.map((c) => ({ ...c, disabled: c.value === 'nations' && !nationsOn }))} value={st.sliceColor} onChange={st.setSliceColor} aria-label="Section colour" />
      </Row>
      <Slider label="Cutting plane" value={slice.index} min={0} max={n - 1} step={1} ticks={8} disabled={scanning && live}
        onChange={(v) => { st.setScan({ playing: false }); st.setSlice({ index: v }); if (!hud.slice) st.setHud({ slice: true }) }}
        format={(v) => `${v} · ${(v * (st.grid?.voxel_size ?? 0)).toFixed(1)} mm`} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 4 }}>
          <IconButton name={scan.playing ? 'pause' : slice.index >= n - 1 && scanning ? 'replay' : 'play'} disabled={!canScan || live}
            title={scan.playing ? 'Pause the sweep' : 'Sweep the plane bottom to top: result below, original above'}
            on={scan.playing} onClick={() => (scan.playing ? st.setScan({ playing: false }) : sweep())} />
          <IconButton name="scan" title={scanning ? 'Leave the scan view' : 'Scan view: result below the plane, original above'} on={scanning} disabled={!canScan}
            onClick={() => (scanning ? st.setFocus(st.proc?.mode === 'nations' ? 'evolve' : 'quantum', 'Left the scan') : st.setFocus('scan', 'Scan view'))} />
        </div>
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>
          {live && st.job?.frontier != null ? 'following the Atlas run' : scanning ? 'scan · linked to the plane' : hud.slice ? 'plane shown in the view' : ''}
        </span>
      </div>
    </Blk>
  )
}

/** Where an Evolve history's random bytes came from, in the engine's own terms (see app/qrng.py). */
function diceNote(d: QrngSummary) {
  return [
    d.device === 'qpu' ? `IBM processor${d.qpu_seconds != null ? ` · ${d.qpu_seconds} s` : ''}` : 'pseudo-random',
    d.grade,
    d.stretched ? `${fmt.int(d.bytes)} bytes, used up in turn ${d.dry_turn}` : `${fmt.int(d.used)} of ${fmt.int(d.bytes)} bytes used`,
    d.bell ? `Bell S ${d.bell.s.toFixed(2)}` : null,
    d.reused ? 'same bytes again' : null,
  ].filter(Boolean).join(' · ')
}

export function QuantumOut() {
  const proc = useStore((s) => s.proc)
  const procData = useStore((s) => s.procData)
  const level = useStore((s) => s.m.level)
  const setM = useStore((s) => s.setM)
  const legend = useStore((s) => s.hud.legend)
  const setHud = useStore((s) => s.setHud)
  const bins = useMemo(() => (procData ? histogram(procData, 48) : new Array(48).fill(0)), [procData])
  if (!proc) return <Blk id="out-quantum" label="Quantum result"><Empty>Run the quantum step to see the result.</Empty></Blk>
  const src = proc.mode === 'atlas' ? (proc.cached ? 'Atlas · cache' : 'Atlas') : proc.mode === 'emulator' ? 'emulation' : 'gaussian'
  const nat = proc.mode === 'nations' ? proc.nations : undefined
  if (nat) return (
    <Blk id="out-quantum" label="Evolve result" note={proc.run}>
      <Figures items={[
        { k: 'Nations', v: `${nat.alive}`, note: `alive of ${nat.total} after ${nat.turns} turns` },
        { k: 'Wars', v: nat.wars, note: `${nat.annexed} annexed · ${nat.died} fell` },
        { k: 'Splits', v: nat.split, note: `${nat.exiled} left the continent` },
        { k: 'Solid cells', v: fmt.int(nat.end), note: `${fmt.int(nat.start)} at the start · +${fmt.int(nat.grown)} grown · −${fmt.int(nat.carved)} carved` },
        ...(proc.qrng ? [{ k: 'Random numbers', v: proc.qrng.device === 'qpu' ? proc.qrng.backend ?? 'real chip' : 'simulator', note: diceNote(proc.qrng) }] : []),
      ]} />
    </Blk>
  )
  return (
    <Blk id="out-quantum" label="Quantum result" note={proc.run} tools={<Shows on={legend} what="value scale" set={(v) => setHud({ legend: v })} />}>
      <Figures items={[
        { k: 'Peak value', v: proc.max.toFixed(2), note: `range ${proc.min.toFixed(2)} – ${proc.max.toFixed(2)}` },
        { k: 'Computed', v: proc.seconds != null ? (proc.seconds < 1 ? Math.round(proc.seconds * 1000) : proc.seconds) : '—', unit: proc.seconds != null && proc.seconds < 1 ? 'ms' : 's',
          note: `${src}${proc.tiles ? ` · ${proc.tiles.jobs} tile${proc.tiles.jobs === 1 ? '' : 's'}` : ''}` },
      ]} />
      <div style={{ paddingTop: 4 }}>
        <LevelHistogram bins={bins} level={level} onLevel={(v) => setM({ level: v })} height={64} />
      </div>
    </Blk>
  )
}

export function PrintOut() {
  const r = useStore((s) => s.report)
  if (!r) return <Blk id="out-print" label="Print check"><Empty>After the mesh step, the check of the printed model appears here.</Empty></Blk>
  return (
    <Blk id="out-print" label="Print check" note={r.method === 'advect' ? 'push' : 'threshold'}>
      <Figures items={[
        { k: 'Volume', v: r.volume_cm3 ?? '—', unit: r.volume_cm3 != null ? 'cm³' : undefined, note: r.extents.map((v) => v.toFixed(0)).join(' × ') + ' mm' },
        { k: 'Parts', v: r.parts, note: r.total_parts > r.parts ? `kept ${r.parts} of ${r.total_parts}` : 'single piece' },
      ]} />
      <QReadout w="100%" leader rows={[
        { k: 'Watertight', v: r.watertight ? 'yes' : 'no', flag: r.watertight ? '✓' : '!' },
        { k: 'Faces', v: fmt.int(r.faces) },
        { k: 'Cell', v: r.refine > 1 ? `${r.fine_voxel_mm} mm fine` : `${r.voxel_mm} mm` },
      ]} />
      {!r.watertight && <p className="qs-help qs-help--warn">! Not watertight. Try closing gaps or a lower level.</p>}
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
