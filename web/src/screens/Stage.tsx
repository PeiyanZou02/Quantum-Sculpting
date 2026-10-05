// DISPLAY: the volumetric workspace, laid out like a 3D viewport (after Blender):
// header with the view switch and overlays; info top-left; axis gizmo and navigation icons top-right;
// contextual readouts bottom. The geometry is the only 3D element; everything over it is 2D.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useStore, type Hud, type View } from '../store'
import { Engine, type ViewName } from '../view/engine'
import { QProbe, useProbe, type ProbeHit } from '../qs/QProbe'
import { Segmented } from '../qs/Segmented'
import { QPill } from '../qs/QPill'
import { Icon, IconButton } from '../qs/Icon'
import { Spinner } from './parts'
import { MODEL_EXT } from './InputPane'

const SWEEP_SECONDS = 10

const OVERLAYS: { k: keyof Hud; t: string; d: string }[] = [
  { k: 'bounds', t: 'Grid box', d: 'dashed n³ outline' },
  { k: 'floor', t: 'Floor grid', d: 'lines under the model' },
  { k: 'axes', t: 'Axis gizmo', d: 'click an axis to look along it' },
  { k: 'camera', t: 'Camera', d: 'azimuth and elevation' },
  { k: 'caption', t: 'Info', d: 'what the view shows' },
  { k: 'frame', t: 'Frame', d: 'corners and centre cross' },
]

export function Stage() {
  const host = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [, setTick] = useState(0)
  const [over, setOver] = useState(false)
  const [menu, setMenu] = useState(false)
  const st = useStore()
  const { model, modelMesh, grid, gridData, procData, resultMesh, view, slice, m, hud, scan, theme } = st

  useEffect(() => {
    const e = new Engine(host.current!)
    e.onChange = () => setTick((t) => t + 1)
    setEngine(e)
    return () => e.dispose()
  }, [])
  useEffect(() => { engine?.setTheme((k) => getComputedStyle(document.documentElement).getPropertyValue(k)) }, [engine, theme])
  useEffect(() => { if (engine && grid) engine.setGrid(grid.n) }, [engine, grid])
  useEffect(() => {
    if (!engine || !modelMesh) return
    engine.setMesh('model', modelMesh, grid?.transform ?? Engine.placement(modelMesh, engine.n))
  }, [engine, modelMesh, grid])
  useEffect(() => { engine?.setVoxels('voxels', gridData, 0.5, false) }, [engine, gridData])
  useEffect(() => { engine?.setVoxels('processed', procData, m.level, true) }, [engine, procData, m.level])
  useEffect(() => { engine?.setMesh('result', resultMesh) }, [engine, resultMesh])
  useEffect(() => { engine?.show(view as ViewName) }, [engine, view, gridData, procData, resultMesh, modelMesh])
  useEffect(() => { engine?.setFrame({ bounds: hud.bounds, floor: hud.floor }) }, [engine, hud.bounds, hud.floor, grid])
  useEffect(() => { engine?.setSlice(hud.slice ? slice : null) }, [engine, slice, view, hud.slice])
  // the scan plane is the slice: result below it, original above
  useEffect(() => { if (engine && view === 'scan') engine.setScan(slice.axis === 'z' ? slice.index + 1 : 0) }, [engine, view, slice, grid])
  useEffect(() => { if (view === 'scan' && slice.axis !== 'z') st.setSlice({ axis: 'z' }) }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  // sweep: step the slice from where it is to the top over ~10 s
  useEffect(() => {
    if (!scan.playing || !grid) return
    const t = setInterval(() => {
      const s = useStore.getState()
      const next = s.slice.index + 1
      if (next > grid.n - 1) { s.setScan({ playing: false }); return }
      s.setSlice({ index: next })
    }, (SWEEP_SECONDS * 1000) / grid.n)
    return () => clearInterval(t)
  }, [scan.playing, grid])

  const pick = (px: number, py: number): ProbeHit | null => {
    const hit = engine?.pick(px, py)
    if (!hit) return null
    const [x, y, z] = hit.cell
    const g = useStore.getState()
    const v = g.view
    const p: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z]
    const read = (gr: typeof gridData) => (gr ? gr.data[(x * gr.n + y) * gr.n + z] : 0)
    const cell = `x ${x} · y ${y} · z ${z}`
    if (v === 'model') {
      const t = g.grid?.transform ?? (modelMesh ? Engine.placement(modelMesh, engine!.n) : null)
      if (!t) return { x, y, z, p, lines: [cell, 'surface'] }
      const s = t[0][0]
      return { x, y, z, p, lines: [`${((p[0] - t[0][3]) / s).toFixed(1)} · ${((p[1] - t[1][3]) / s).toFixed(1)} · ${((p[2] - t[2][3]) / s).toFixed(1)} mm`, `surface · cell ${x} ${y} ${z}`] }
    }
    if (v === 'voxels') return { x, y, z, p, lines: [cell, `coverage ${read(gridData).toFixed(2)}`] }
    if (v === 'processed' || v === 'scan') return { x, y, z, p, lines: [cell, `input ${read(gridData).toFixed(2)} → ${read(procData).toFixed(2)}`] }
    const val = read(procData)
    return { x, y, z, p, lines: [cell, `${val.toFixed(2)} · ${val >= g.m.level ? 'kept' : 'removed'} at ${g.m.level.toFixed(2)}`] }
  }
  const probe = useProbe({ pick, enabled: !!model && hud.probe, maxPins: 3 })
  // pins are anchored to the point that was clicked, so they move with the geometry
  const project = (h: ProbeHit) => {
    if (!engine) return null
    const [x, y] = engine.project(h.p ? new THREE.Vector3(...h.p) : new THREE.Vector3(h.x, h.y, h.z))
    return { x, y }
  }
  useEffect(() => { probe.clear() }, [model?.model_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const avail: Record<View, boolean> = { model: !!model, voxels: !!gridData, processed: !!procData, result: !!resultMesh, scan: !!procData && !!gridData }
  const info = (() => {
    if (!model) return null
    const name = model.builtin ? 'test cup' : model.file
    if (view === 'model') return [`Original mesh`, `${name} · ${model.faces.toLocaleString()} faces`]
    if (view === 'voxels' && grid) return ['Input grid', `${grid.n}³ · ${grid.solid.toLocaleString()} solid cells`]
    if (view === 'processed' && st.proc) return ['Quantum result', `${st.proc.mode === 'atlas' ? 'Atlas' : st.proc.mode === 'emulator' ? 'emulation' : 'Gaussian'} · cells ≥ ${m.level.toFixed(2)}`]
    if (view === 'result' && st.report) return ['Surface', `${st.report.faces.toLocaleString()} faces · ${st.report.watertight ? 'watertight' : 'open'}`]
    if (view === 'scan') {
      const layered = st.job?.status === 'running' ? st.job.frontier != null : st.proc?.tiles?.mode === 'layers' && (st.proc.tiles.jobs ?? 1) > 1
      return ['Scan', `z ${slice.index} · ${layered ? 'computed layer by layer' : 'result below, original above'}`]
    }
    return null
  })()
  const busy = st.busy.model ? 'Opening' : st.busy.vox ? 'Voxelising' : st.busy.proc && st.q.mode !== 'atlas' ? 'Processing' : st.busy.mesh ? 'Meshing' : null
  const shaded = view === 'processed' || view === 'scan'
  const onCount = OVERLAYS.filter((o) => hud[o.k]).length

  return (
    <main className="stage">
      <div className="stage__bar">
        <Segmented<View>
          options={[
            { value: 'model', label: 'Model', disabled: !avail.model }, { value: 'voxels', label: 'Voxels', disabled: !avail.voxels },
            { value: 'processed', label: 'Processed', disabled: !avail.processed }, { value: 'result', label: 'Result', disabled: !avail.result },
            { value: 'scan', label: 'Scan', disabled: !avail.scan },
          ]}
          value={view} onChange={st.setView}
        />
        <div className="row" style={{ gap: 4 }}>
          {busy && <span className="qs-mono" style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--qs-ink2)', marginRight: 8 }}><Spinner /> {busy}</span>}
          <IconButton name="layers" title={`Viewport overlays (${onCount} on)`} on={menu} onClick={() => setMenu(!menu)} badge={onCount} />
        </div>
      </div>

      <div
        ref={host}
        className="stage__view"
        {...probe.handlers}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) st.upload(f)
        }}
        style={{ background: model ? undefined : 'radial-gradient(circle,var(--qs-dot) 1px,transparent 1.5px) 12px 12px/24px 24px' }}
      >
        {hud.frame && <ViewMarks />}
        {!model && <Landing over={over} />}
        {model && over && <div className="stage__drop">Release to open</div>}
        {model && engine && <QProbeAnchored probe={probe} project={project} n={grid?.n ?? 32} mm={grid?.voxel_size ?? 1} />}

        {model && engine && (
          <div className="hud">
            {hud.caption && info && (
              <div className="hud__info">
                <span>{info[0]}</span>
                <span>{info[1]}</span>
              </div>
            )}
            {hud.dims && <SizeMarks engine={engine} />}
            {hud.legend && shaded && <Legend level={m.level} />}
          </div>
        )}

        {model && engine && (
          <div className="nav" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            {hud.axes && <Gizmo engine={engine} />}
            {hud.camera && <CameraReadout engine={engine} />}
            <div className="nav__col">
              <DragButton name="orbit" title="Orbit · drag here, or drag in the view" onDrag={(dx, dy) => engine.nudge({ orbit: [dx, dy] })} />
              <DragButton name="pan" title="Pan · drag here, or right-drag in the view" onDrag={(dx, dy) => engine.nudge({ pan: [dx, dy] })} />
              <DragButton name="zoom" title="Zoom · drag up and down here, or scroll in the view" onDrag={(_, dy) => engine.nudge({ zoom: dy })} />
              <IconButton name="frame" title="Reset the view" onClick={() => engine.home()} />
              <span className="nav__sep" />
              <IconButton name="probe" title={hud.probe ? 'Probe on: hover reads a cell, click pins it' : 'Probe off'} on={hud.probe} onClick={() => st.setHud({ probe: !hud.probe })} />
              <IconButton name="clear" title={`Clear ${probe.pins.length} pin${probe.pins.length === 1 ? '' : 's'}`} disabled={!probe.pins.length} badge={probe.pins.length || undefined} onClick={() => probe.clear()} />
            </div>
          </div>
        )}

        {menu && (
          <div className="hudmenu" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <span className="qs-label">Viewport overlays</span>
            <div className="hudmenu__group">
              {OVERLAYS.map((it) => (
                <label key={it.k} className="hudmenu__item">
                  <input type="checkbox" checked={hud[it.k]} onChange={(e) => st.setHud({ [it.k]: e.target.checked })} />
                  <span className="hudmenu__box" />
                  <span className="hudmenu__t">{it.t}</span>
                  <span className="hudmenu__d">{it.d}</span>
                </label>
              ))}
            </div>
            <p className="qs-help">Overlays that belong to a result live with it: size marks under Model, the cutting plane and scan under Slice, the value scale under Quantum result.</p>
          </div>
        )}
      </div>
    </main>
  )
}

function QProbeAnchored({ probe, project, n, mm }: { probe: ReturnType<typeof useProbe>; project: (h: ProbeHit) => { x: number; y: number } | null; n: number; mm: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  useEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <>
      <div ref={ref} style={{ display: 'none' }} />
      <QProbe w={size.w} h={size.h} n={n} probe={probe} project={project} mmPerCell={mm} hideClear />
    </>
  )
}

/** First landing: two clear ways in, and the four steps ahead. */
function Landing({ over }: { over: boolean }) {
  const st = useStore()
  const file = useRef<HTMLInputElement>(null)
  return (
    <div className="landing">
      <div className="landing__card">
        <span className="qs-label">Start</span>
        <span className="landing__title">{over ? 'Release to open the model' : 'What would you like to sculpt?'}</span>
        <div className="landing__choices">
          <button className="landing__choice" onClick={st.useTestCup} disabled={st.busy.model}>
            <Icon name="cup" size={28} />
            <span className="landing__ct">Use the test cup</span>
            <span className="landing__cd">Built in · 80 × 80 × 90 mm · ready in a second</span>
          </button>
          <button className={'landing__choice' + (over ? ' landing__choice--over' : '')} onClick={() => file.current?.click()}>
            <Icon name="upload" size={28} />
            <span className="landing__ct">Import your own model</span>
            <span className="landing__cd">Drop it anywhere here, or browse · {MODEL_EXT.join(' ')}</span>
          </button>
        </div>
        <input ref={file} type="file" hidden accept={MODEL_EXT.join(',')} onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) st.upload(f)
          e.target.value = ''
        }} />
        <ol className="landing__steps">
          {[['model', 'Model', 'set which way is up'], ['grid', 'Voxelise', '16³ to 256³'], ['quantum', 'Quantum', 'blur on Atlas or locally'], ['print', 'Mesh', 'check and export STL']].map(([i, t, d]) => (
            <li key={t}><Icon name={i} /><span>{t}</span><span>{d}</span></li>
          ))}
        </ol>
        {st.recent.length > 0 && (
          <div className="landing__recent">
            <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>Recent in input/</span>
            {st.recent.slice(0, 4).map((r) => <QPill key={r.name} kind="hair" size="s" label={r.name} onClick={() => st.openRecent(r.name)} />)}
          </div>
        )}
      </div>
    </div>
  )
}

/** An icon button you drag: orbit, pan or zoom like Blender's navigation buttons. */
function DragButton({ name, title, onDrag }: { name: string; title: string; onDrag: (dx: number, dy: number) => void }) {
  const [on, setOn] = useState(false)
  return (
    <IconButton name={name} title={title} on={on} onPointerDown={(e) => {
      e.preventDefault()
      e.stopPropagation()
      setOn(true)
      let x = e.clientX, y = e.clientY
      const move = (ev: PointerEvent) => { onDrag(ev.clientX - x, ev.clientY - y); x = ev.clientX; y = ev.clientY }
      const up = () => { setOn(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }} />
  )
}

function ViewMarks() {
  const b = '1px solid var(--qs-ink)'
  const c = { position: 'absolute', width: 18, height: 18, pointerEvents: 'none' } as const
  return (
    <>
      <div style={{ ...c, left: 0, top: 0, borderLeft: b, borderTop: b }} />
      <div style={{ ...c, right: 0, top: 0, borderRight: b, borderTop: b }} />
      <div style={{ ...c, left: 0, bottom: 0, borderLeft: b, borderBottom: b }} />
      <div style={{ ...c, right: 0, bottom: 0, borderRight: b, borderBottom: b }} />
      <span style={{
        position: 'absolute', left: '50%', top: '50%', width: 22, height: 22, marginLeft: -11, marginTop: -11, pointerEvents: 'none',
        background: 'linear-gradient(var(--qs-ink3),var(--qs-ink3)) center/1px 100% no-repeat,linear-gradient(var(--qs-ink3),var(--qs-ink3)) center/100% 1px no-repeat',
      }} />
    </>
  )
}

/** 2D axis gizmo; click an axis end to look along it (Blender's navigation gizmo, drawn flat). */
function Gizmo({ engine }: { engine: Engine }) {
  const ax = engine.axes2D()
  const R = 26, c = 36
  const ends = ax.flatMap(([x, y], i) => [
    { i, pos: true, x: c + x * R, y: c + y * R, depth: 0 },
    { i, pos: false, x: c - x * R, y: c - y * R, depth: 1 },
  ])
  const look = (i: number, pos: boolean) => {
    // camera on the +axis side, looking back at the model
    if (i === 2) return engine.orbitTo(0, pos ? 89 : -89)
    const az = i === 0 ? (pos ? 90 : 270) : (pos ? 180 : 0)
    engine.orbitTo(az, 0)
  }
  return (
    <svg className="gizmo" width="72" height="72" viewBox="0 0 72 72">
      <circle cx={c} cy={c} r={R + 9} fill="var(--qs-faint)" />
      {ax.map(([x, y], i) => <line key={i} x1={c} y1={c} x2={c + x * R} y2={c + y * R} stroke="var(--qs-ink)" strokeWidth="1" />)}
      {ends.map((e) => (
        <g key={`${e.i}${e.pos}`} className="gizmo__end" onClick={() => look(e.i, e.pos)}>
          <circle cx={e.x} cy={e.y} r={e.pos ? 7 : 4} fill={e.pos ? 'var(--qs-ink)' : 'var(--qs-bg)'} stroke="var(--qs-ink)" strokeWidth="1" />
          {e.pos && <text x={e.x} y={e.y + 3} textAnchor="middle" fontFamily="Geist Mono" fontSize="8.5" fill="var(--qs-bg)">{'XYZ'[e.i]}</text>}
          <title>{`View along ${e.pos ? '+' : '−'}${'XYZ'[e.i]}`}</title>
        </g>
      ))}
    </svg>
  )
}

function CameraReadout({ engine }: { engine: Engine }) {
  const a = engine.angles()
  return (
    <div className="qs-small nav__cam">
      <span>az {String(Math.round(a.az)).padStart(3, '0')}°</span>
      <span>el {Math.round(a.el)}°</span>
    </div>
  )
}

function SizeMarks({ engine }: { engine: Engine }) {
  const model = useStore((s) => s.model)
  const report = useStore((s) => s.report)
  const view = useStore((s) => s.view)
  const box = engine.bounds2D()
  if (!box || !model) return null
  const ext = view === 'result' && report ? report.extents : model.extents
  const top = Math.max(24, box.t - 26), right = box.r + 22
  const ln = { position: 'absolute', background: 'var(--qs-ink)' } as const
  return (
    <>
      <div style={{ ...ln, left: box.l, top, width: box.r - box.l, height: 1 }} />
      <div style={{ ...ln, left: box.l, top: top - 5, width: 1, height: 11 }} />
      <div style={{ ...ln, left: box.r - 1, top: top - 5, width: 1, height: 11 }} />
      <span className="hud__tag" style={{ left: (box.l + box.r) / 2, top: top - 6, transform: 'translateX(-50%)' }}>{ext[0].toFixed(0)} mm</span>
      <div style={{ ...ln, left: right, top: box.t, width: 1, height: box.b - box.t }} />
      <div style={{ ...ln, left: right - 5, top: box.t, width: 11, height: 1 }} />
      <div style={{ ...ln, left: right - 5, top: box.b - 1, width: 11, height: 1 }} />
      <span className="hud__tag" style={{ left: right + 10, top: (box.t + box.b) / 2 - 6 }}>{ext[2].toFixed(0)} mm</span>
    </>
  )
}

function Legend({ level }: { level: number }) {
  return (
    <div className="hud__legend">
      <span className="qs-small" style={{ color: 'var(--qs-ink2)' }}>0</span>
      <div style={{ position: 'relative', width: 140, height: 6, background: 'linear-gradient(90deg, var(--qs-ink4), var(--qs-ink))' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${level * 100}%`, background: 'var(--qs-bg)', opacity: 0.85 }} />
        <div style={{ position: 'absolute', left: `${level * 100}%`, top: -3, bottom: -3, width: 1, background: 'var(--qs-ink)' }} />
      </div>
      <span className="qs-small" style={{ color: 'var(--qs-ink2)' }}>1 · value, shown ≥ {level.toFixed(2)}</span>
    </div>
  )
}
