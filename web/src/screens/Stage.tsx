// DISPLAY: the volumetric workspace, composed like a 3D editor viewport but for sculpting with
// quantum processes. Header: what is shown (left), then visibility, gizmos, overlays and shading
// popovers (right). In the view: tool shelf (top-left), info, axis gizmo and navigation (top-right).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useStore, type Layer, type Shading, type Tool, type View } from '../store'
import { Engine, type LayerName, type ViewName } from '../view/engine'
import { loadBundled, makeEntangleMaterial, type ShaderTables } from '../view/entangle'
import { QProbe, useProbe, type ProbeHit } from '../qs/QProbe'
import { Segmented } from '../qs/Segmented'
import { QPill } from '../qs/QPill'
import { Icon, IconButton } from '../qs/Icon'
import { Popover, PopSection, Check } from '../qs/Popover'
import { Slider } from '../qs/Slider'
import { Spinner } from './parts'
import { MODEL_EXT } from './InputPane'

const SWEEP_SECONDS = 10

const TOOLS: { id: Tool; icon: string; t: string; d: string; key: string }[] = [
  { id: 'navigate', icon: 'navigate', t: 'Navigate', d: 'Drag to orbit, right-drag to pan, scroll to zoom. Nothing is read or pinned.', key: 'V' },
  { id: 'probe', icon: 'probe', t: 'Probe', d: 'Hover a cell to read its value. Dragging still orbits.', key: 'R' },
  { id: 'annotate', icon: 'annotate', t: 'Annotate', d: 'Click to pin a note on a cell; it stays on the geometry as it turns. Click a pin to remove it.', key: 'N' },
  { id: 'measure', icon: 'measure', t: 'Measure', d: 'Click points; consecutive pins are joined with their distance in mm.', key: 'M' },
  { id: 'slice', icon: 'sliceTool', t: 'Slice', d: 'Drag up or down in the view to move the cutting plane through the grid.', key: 'S' },
]
const LAYERS: { id: Layer; icon: string; t: string }[] = [
  { id: 'model', icon: 'model', t: 'Original mesh' },
  { id: 'voxels', icon: 'grid', t: 'Input voxels' },
  { id: 'processed', icon: 'quantum', t: 'Quantum result' },
  { id: 'result', icon: 'print', t: 'Surface' },
]
const SHADINGS: { id: Shading; icon: string; t: string; d: string }[] = [
  { id: 'wire', icon: 'wire', t: 'Wireframe', d: 'Edges only: voxels as a lattice, meshes as triangles.' },
  { id: 'solid', icon: 'solid', t: 'Solid', d: 'Plain studio shading in one grey.' },
  { id: 'value', icon: 'value', t: 'Value', d: 'Cells shaded by their value: darker is denser.' },
  { id: 'entangle', icon: 'entangle', t: 'Entanglement', d: "Shaded with lookup tables computed by Moth's Entanglement Shader: thin-film interference driven by the cell values." },
]

export function Stage() {
  const host = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [, setTick] = useState(0)
  const [over, setOver] = useState(false)
  const [tables, setTables] = useState<ShaderTables[]>([])
  const st = useStore()
  const { model, modelMesh, grid, gridData, procData, resultMesh, view, slice, m, hud, scan, theme, tool, shading, shade, layers } = st

  useEffect(() => {
    const e = new Engine(host.current!)
    e.onChange = () => setTick((t) => t + 1)
    setEngine(e)
    return () => e.dispose()
  }, [])
  useEffect(() => { loadBundled().then(setTables).catch(() => setTables([])) }, [])
  useEffect(() => { engine?.setTheme((k) => getComputedStyle(document.documentElement).getPropertyValue(k)) }, [engine, theme])
  useEffect(() => { if (engine && grid) engine.setGrid(grid.n) }, [engine, grid])
  useEffect(() => {
    if (!engine || !modelMesh) return
    engine.setMesh('model', modelMesh, grid?.transform ?? Engine.placement(modelMesh, engine.n))
  }, [engine, modelMesh, grid])
  const valued = shading === 'value' || shading === 'entangle'
  useEffect(() => { engine?.setVoxels('voxels', gridData, 0.5, valued) }, [engine, gridData, valued])
  useEffect(() => { engine?.setVoxels('processed', procData, m.level, valued) }, [engine, procData, m.level, valued])
  useEffect(() => { engine?.setMesh('result', resultMesh) }, [engine, resultMesh])
  useEffect(() => { engine?.show(view as ViewName) }, [engine, view, gridData, procData, resultMesh, modelMesh])
  useEffect(() => { engine?.setGhosts((Object.keys(layers) as Layer[]).filter((k) => layers[k].visible)) }, [engine, layers, gridData, procData, resultMesh, modelMesh])
  useEffect(() => { engine?.setFrame({ bounds: hud.bounds, floor: hud.floor }) }, [engine, hud.bounds, hud.floor, grid])
  useEffect(() => { engine?.setSlice(hud.slice || tool === 'slice' ? slice : null) }, [engine, slice, view, hud.slice, tool])
  useEffect(() => { if (engine && view === 'scan') engine.setScan(slice.axis === 'z' ? slice.index + 1 : 0) }, [engine, view, slice, grid])
  useEffect(() => { if (view === 'scan' && slice.axis !== 'z') st.setSlice({ axis: 'z' }) }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Entanglement shading: one material per layer kind, rebuilt when the tables or settings change
  const table = tables.find((t) => t.id === shade.tables) ?? tables[0]
  const entMats = useMemo(() => {
    if (!table) return null
    const opts = { thickness: shade.thickness }
    const mats = {
      mesh: makeEntangleMaterial(table, { ...opts, instanced: false }),
      voxels: makeEntangleMaterial(table, { ...opts, instanced: true }),
      processed: makeEntangleMaterial(table, { ...opts, instanced: true }),
    }
    for (const mat of Object.values(mats)) if (mat.uniforms.u_mix) mat.uniforms.u_mix.value = shade.mix
    return mats
  }, [table, shade.thickness, shade.mix])
  useEffect(() => {
    if (!engine) return
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--qs-bg').trim()
    if (entMats) for (const mat of Object.values(entMats)) if (mat.uniforms.u_bg) mat.uniforms.u_bg.value = new THREE.Color(bg)
    engine.setShading(shading === 'entangle' && !entMats ? 'value' : shading, entMats)
  }, [engine, shading, entMats, theme])

  // tools: the slice tool takes the left drag; navigate turns the probe off
  useEffect(() => { if (engine) engine.controls.enableRotate = tool !== 'slice' }, [engine, tool])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest('input,textarea,select')) return
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase())
      if (t) st.setTool(t.id)
      if (e.key === 'Home') engine?.home()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [engine]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const g = useStore.getState()
    const hit = engine?.pick(px, py, (k) => k === engine.active || (g.view === 'scan' && (k === 'voxels' || k === 'processed')) || g.layers[k as Layer]?.pickable)
    if (!hit) return null
    const [x, y, z] = hit.cell
    const p: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z]
    const read = (gr: typeof gridData) => (gr ? gr.data[(x * gr.n + y) * gr.n + z] : 0)
    const cell = `x ${x} · y ${y} · z ${z}`
    const L = hit.layer as LayerName
    if (L === 'model') {
      const t = g.grid?.transform ?? (modelMesh ? Engine.placement(modelMesh, engine!.n) : null)
      if (!t) return { x, y, z, p, lines: [cell, 'mesh surface'] }
      const s = t[0][0]
      return { x, y, z, p, lines: [`${((p[0] - t[0][3]) / s).toFixed(1)} · ${((p[1] - t[1][3]) / s).toFixed(1)} · ${((p[2] - t[2][3]) / s).toFixed(1)} mm`, `mesh surface · cell ${x} ${y} ${z}`] }
    }
    if (L === 'voxels') return { x, y, z, p, lines: [cell, `input coverage ${read(gridData).toFixed(2)}`] }
    if (L === 'processed') return { x, y, z, p, lines: [cell, `input ${read(gridData).toFixed(2)} → ${read(procData).toFixed(2)}`] }
    const val = read(procData)
    return { x, y, z, p, lines: [cell, `surface · ${val.toFixed(2)} ${val >= g.m.level ? '≥' : '<'} level ${g.m.level.toFixed(2)}`] }
  }
  const reading = tool === 'probe' || tool === 'annotate' || tool === 'measure'
  const probe = useProbe({ pick, enabled: !!model && reading, maxPins: tool === 'measure' ? 6 : 4, pinning: tool === 'annotate' || tool === 'measure' })
  const project = (h: ProbeHit) => {
    if (!engine) return null
    const [x, y] = engine.project(h.p ? new THREE.Vector3(...h.p) : new THREE.Vector3(h.x, h.y, h.z))
    return { x, y }
  }
  useEffect(() => { probe.clear() }, [model?.model_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // slice tool: vertical drag moves the cutting plane one layer per 6 px
  const sliceDrag = useRef<{ y: number; i: number } | null>(null)
  const sliceHandlers = tool === 'slice' && grid ? {
    onPointerDown: (e: React.PointerEvent) => { if (e.button === 0) { sliceDrag.current = { y: e.clientY, i: useStore.getState().slice.index }; st.setScan({ playing: false }) } },
    onPointerMove: (e: React.PointerEvent) => {
      const d = sliceDrag.current
      if (!d) return
      st.setSlice({ index: Math.max(0, Math.min(grid.n - 1, d.i + Math.round((d.y - e.clientY) / 6))) })
    },
    onPointerUp: () => { sliceDrag.current = null },
    onPointerLeave: () => { sliceDrag.current = null },
  } : {}

  const avail: Record<View, boolean> = { model: !!model, voxels: !!gridData, processed: !!procData, result: !!resultMesh, scan: !!procData && !!gridData }
  const info = (() => {
    if (!model) return null
    const name = model.builtin ? 'test cup' : model.file
    const mode = SHADINGS.find((x) => x.id === shading)!.t.toLowerCase()
    if (view === 'model') return [`Original mesh · ${mode}`, `${name} · ${model.faces.toLocaleString()} faces`]
    if (view === 'voxels' && grid) return [`Input grid · ${mode}`, `${grid.n}³ · ${grid.solid.toLocaleString()} solid cells`]
    if (view === 'processed' && st.proc) return [`Quantum result · ${mode}`, `${st.proc.mode === 'atlas' ? 'Atlas' : st.proc.mode === 'emulator' ? 'emulation' : 'Gaussian'} · cells ≥ ${m.level.toFixed(2)}`]
    if (view === 'result' && st.report) return [`Surface · ${mode}`, `${st.report.faces.toLocaleString()} faces · ${st.report.watertight ? 'watertight' : 'open'}`]
    if (view === 'scan') {
      const layered = st.job?.status === 'running' ? st.job.frontier != null : st.proc?.tiles?.mode === 'layers' && (st.proc.tiles.jobs ?? 1) > 1
      return [`Scan · ${mode}`, `z ${slice.index} · ${layered ? 'computed layer by layer' : 'result below, original above'}`]
    }
    return [name, 'not computed yet']
  })()
  const busy = st.busy.model ? 'Opening' : st.busy.vox ? 'Voxelising' : st.busy.proc && st.q.mode !== 'atlas' ? 'Processing' : st.busy.mesh ? 'Meshing' : null
  const shaded = view === 'processed' || view === 'scan'
  const ghostCount = LAYERS.filter((l) => layers[l.id].visible).length
  const overlayCount = (['bounds', 'floor', 'caption', 'frame', 'dims', 'slice', 'legend'] as const).filter((k) => hud[k]).length

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
        <div className="stage__tools">
          {busy && <span className="stage__busy"><Spinner /> {busy}</span>}
          <Popover icon="visibility" title="Visibility" desc="Draw other layers faintly with this view, and choose which ones the probe reads." on={ghostCount > 0} width={300}>
            <PopSection label="Layers">
              {LAYERS.map((l) => {
                const main = l.id === (view === 'scan' ? 'processed' : view)
                const has = { model: !!modelMesh, voxels: !!gridData, processed: !!procData, result: !!resultMesh }[l.id]
                return (
                  <div key={l.id} className={'vis-row' + (has ? '' : ' vis-row--off')}>
                    <Icon name={l.icon} />
                    <span className="vis-row__t">{l.t}{main ? <em> · shown</em> : ''}</span>
                    <IconButton size={24} name="navigate" title={layers[l.id].pickable ? 'Probe reads it' : 'Probe ignores it'} dim={!layers[l.id].pickable} disabled={!has}
                      onClick={() => st.setLayer(l.id, { pickable: !layers[l.id].pickable })} />
                    <IconButton size={24} name={main || layers[l.id].visible ? 'eye' : 'eyeOff'} title={main ? 'This is the shown view' : layers[l.id].visible ? 'Hide the ghost' : 'Show as a ghost'}
                      dim={!main && !layers[l.id].visible} disabled={!has || main} onClick={() => st.setLayer(l.id, { visible: !layers[l.id].visible })} />
                  </div>
                )
              })}
            </PopSection>
          </Popover>
          <Popover icon="gizmo" title="Gizmos" desc="Axis gizmo, navigation buttons, camera readout and tool shelf." on={hud.axes || hud.nav}
            onIcon={() => st.setHud({ axes: !(hud.axes || hud.nav), nav: !(hud.axes || hud.nav) })} width={260}>
            <PopSection label="Viewport">
              <Check label="Axis gizmo" note="click an axis to look along it" checked={hud.axes} onChange={(v) => st.setHud({ axes: v })} />
              <Check label="Navigation" note="orbit, pan, zoom, reset" checked={hud.nav} onChange={(v) => st.setHud({ nav: v })} />
              <Check label="Camera" note="azimuth, elevation" checked={hud.camera} onChange={(v) => st.setHud({ camera: v })} />
              <Check label="Tool shelf" note="probe, annotate, measure, slice" checked={hud.tools} onChange={(v) => st.setHud({ tools: v })} />
            </PopSection>
          </Popover>
          <Popover icon="layers" title="Overlays" desc="Guides and readouts drawn over the geometry." on={overlayCount > 0} width={300}>
            <PopSection label="Guides">
              <Check label="Grid box" note="dashed n³ outline" checked={hud.bounds} onChange={(v) => st.setHud({ bounds: v })} />
              <Check label="Floor" note="lines under the model" checked={hud.floor} onChange={(v) => st.setHud({ floor: v })} />
              <Check label="Cutting plane" note="the slice in the view" checked={hud.slice} onChange={(v) => st.setHud({ slice: v })} />
            </PopSection>
            <PopSection label="Readouts">
              <Check label="Info" note="what the view shows" checked={hud.caption} onChange={(v) => st.setHud({ caption: v })} />
              <Check label="Size marks" note="width and height in mm" checked={hud.dims} onChange={(v) => st.setHud({ dims: v })} />
              <Check label="Value scale" note="in shaded views" checked={hud.legend} onChange={(v) => st.setHud({ legend: v })} />
              <Check label="Frame" note="corners and centre cross" checked={hud.frame} onChange={(v) => st.setHud({ frame: v })} />
            </PopSection>
          </Popover>
          <div className="shading" role="radiogroup" aria-label="Shading">
            {SHADINGS.map((sh) => (
              <button key={sh.id} role="radio" aria-checked={shading === sh.id} className={'shading__b' + (shading === sh.id ? ' shading__b--on' : '')}
                data-tip={`${sh.t} shading`} data-tip-desc={sh.d} disabled={sh.id === 'entangle' && !tables.length} onClick={() => st.setShading(sh.id)}>
                <Icon name={sh.icon} />
              </button>
            ))}
          </div>
          <ShadingOptions tables={tables} />
        </div>
      </div>

      <div
        ref={host}
        className={'stage__view stage__view--' + tool}
        {...probe.handlers}
        {...sliceHandlers}
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
        {model && engine && <QProbeAnchored probe={probe} project={project} n={grid?.n ?? 32} mm={grid?.voxel_size ?? 1} measure={tool === 'measure'} />}

        {model && engine && (
          <div className="hud">
            {hud.dims && <SizeMarks engine={engine} />}
            {hud.legend && shaded && <Legend level={m.level} mode={shading} />}
          </div>
        )}

        {model && (
          <div className="vp-tl" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            {hud.tools && (
              <div className="toolshelf" role="toolbar" aria-label="Tools">
                {TOOLS.map((t, i) => (
                  <span key={t.id} style={{ display: 'contents' }}>
                    {i === 1 && <span className="toolshelf__sep" />}
                    {i === 4 && <span className="toolshelf__sep" />}
                    <IconButton name={t.icon} title={t.t} desc={t.d} hotkey={t.key} side="right" on={tool === t.id} onClick={() => st.setTool(t.id)} />
                  </span>
                ))}
                {probe.pins.length > 0 && (
                  <>
                    <span className="toolshelf__sep" />
                    <IconButton name="clear" title={`Clear ${probe.pins.length} pin${probe.pins.length === 1 ? '' : 's'}`} side="right" badge={probe.pins.length} onClick={() => probe.clear()} />
                  </>
                )}
              </div>
            )}
            {hud.caption && info && (
              <div className="hud__info">
                <span>{info[0]}</span>
                <span>{info[1]}</span>
                {tool === 'slice' && grid && <span>slice · drag up or down · z {slice.index}</span>}
              </div>
            )}
          </div>
        )}

        {model && engine && (hud.axes || hud.nav || hud.camera) && (
          <div className="nav" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            {hud.axes && <Gizmo engine={engine} />}
            {hud.camera && <CameraReadout engine={engine} />}
            {hud.nav && (
              <div className="nav__col">
                <DragButton name="zoom" title="Zoom" desc="Drag up or down here, or scroll in the view." onDrag={(_, dy) => engine.nudge({ zoom: dy })} />
                <DragButton name="pan" title="Pan" desc="Drag here, or right-drag in the view." onDrag={(dx, dy) => engine.nudge({ pan: [dx, dy] })} />
                <DragButton name="orbit" title="Orbit" desc="Drag here, or drag in the view." onDrag={(dx, dy) => engine.nudge({ orbit: [dx, dy] })} />
                <IconButton name="frame" title="Reset view" desc="Back to the starting angle, centred on the grid." hotkey="Home" side="left" onClick={() => engine.home()} />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function ShadingOptions({ tables }: { tables: ShaderTables[] }) {
  const st = useStore()
  const { shading, shade } = st
  const table = tables.find((t) => t.id === shade.tables) ?? tables[0]
  return (
    <Popover icon={SHADINGS.find((s) => s.id === shading)!.icon} title="Shading" desc="Options for the current shading mode." width={320} onIcon={undefined}>
      <PopSection label="Mode">
        <Segmented<Shading> size="s" value={shading} onChange={(v) => st.setShading(v)}
          options={SHADINGS.map((s) => ({ value: s.id, label: s.t, disabled: s.id === 'entangle' && !tables.length }))} />
        <p className="qs-help" style={{ marginTop: 8 }}>{SHADINGS.find((s) => s.id === shading)!.d}</p>
      </PopSection>
      <PopSection label="Entanglement shader">
        {tables.length === 0 ? <p className="qs-help">No shader tables found.</p> : (
          <>
            <div className="ent-list">
              {tables.map((t) => (
                <button key={t.id} className={'ent-row' + (t.id === table?.id ? ' ent-row--on' : '')} onClick={() => st.setShading('entangle', { tables: t.id })}>
                  <LutThumb t={t} />
                  <span className="ent-row__t">{t.label}</span>
                  <span className="ent-row__n">{t.source === 'live' ? 'your run' : 'Moth run'} · {t.job_id.slice(0, 8)}</span>
                </button>
              ))}
            </div>
            <Slider label="Film thickness" value={shade.thickness} min={0.2} max={2} step={0.05} defaultValue={0.9} onChange={(v) => st.setShading('entangle', { thickness: v })} />
            <Slider label="Quantum colour" value={shade.mix} min={0} max={1} step={0.05} defaultValue={1} onChange={(v) => st.setShading('entangle', { mix: v })} />
            <p className="qs-help">Each table is the real output of a Moth entanglement-shader-v1 job: reflectance and transmission by viewing angle and film phase. Cell values thicken the film, so the quantum result shows as interference colour.</p>
          </>
        )}
      </PopSection>
    </Popover>
  )
}

/** The reflectance table as a tiny image, so the choices read as what they are. */
function LutThumb({ t }: { t: ShaderTables }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const { width, height, data, max } = t.R
    c.width = width
    c.height = height
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(width, height)
    for (let i = 0; i < width * height; i++) {
      const v = Math.round(Math.min(1, data[i] / (max || 1)) * 255)
      img.data.set([v, v, v, 255], i * 4)
    }
    ctx.putImageData(img, 0, 0)
  }, [t])
  return <canvas ref={ref} className="ent-row__lut" />
}

function QProbeAnchored({ probe, project, n, mm, measure }: { probe: ReturnType<typeof useProbe>; project: (h: ProbeHit) => { x: number; y: number } | null; n: number; mm: number; measure: boolean }) {
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
      <QProbe w={size.w} h={size.h} n={n} probe={probe} project={project} mmPerCell={mm} hideClear measure={measure} />
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
function DragButton({ name, title, desc, onDrag }: { name: string; title: string; desc: string; onDrag: (dx: number, dy: number) => void }) {
  const [on, setOn] = useState(false)
  return (
    <IconButton name={name} title={title} desc={desc} side="left" on={on} onPointerDown={(e) => {
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

/** Flat axis gizmo; click an axis end to look along it. */
function Gizmo({ engine }: { engine: Engine }) {
  const ax = engine.axes2D()
  const R = 26, c = 36
  const ends = ax.flatMap(([x, y], i) => [
    { i, pos: true, x: c + x * R, y: c + y * R },
    { i, pos: false, x: c - x * R, y: c - y * R },
  ])
  const look = (i: number, pos: boolean) => {
    if (i === 2) return engine.orbitTo(0, pos ? 89 : -89)
    engine.orbitTo(i === 0 ? (pos ? 90 : 270) : (pos ? 180 : 0), 0)
  }
  return (
    <svg className="gizmo" width="72" height="72" viewBox="0 0 72 72">
      <circle cx={c} cy={c} r={R + 9} fill="var(--qs-faint)" />
      {ax.map(([x, y], i) => <line key={i} x1={c} y1={c} x2={c + x * R} y2={c + y * R} stroke="var(--qs-ink)" strokeWidth="1" />)}
      {ends.map((e) => (
        <g key={`${e.i}${e.pos}`} className="gizmo__end" onClick={() => look(e.i, e.pos)} data-tip={`View along ${e.pos ? '+' : '−'}${'XYZ'[e.i]}`} data-tip-side="left">
          <circle cx={e.x} cy={e.y} r={e.pos ? 7 : 4} fill={e.pos ? 'var(--qs-ink)' : 'var(--qs-bg)'} stroke="var(--qs-ink)" strokeWidth="1" />
          {e.pos && <text x={e.x} y={e.y + 3} textAnchor="middle" fontFamily="Geist Mono" fontSize="8.5" fill="var(--qs-bg)">{'XYZ'[e.i]}</text>}
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

function Legend({ level, mode }: { level: number; mode: Shading }) {
  if (mode !== 'value' && mode !== 'entangle') return null
  return (
    <div className="hud__legend">
      <span className="qs-small" style={{ color: 'var(--qs-ink2)' }}>0</span>
      <div style={{ position: 'relative', width: 140, height: 6, background: mode === 'entangle' ? 'linear-gradient(90deg,#8a7f9e,#c9b07a,#7fa6a0,#b58aa0)' : 'linear-gradient(90deg, var(--qs-ink4), var(--qs-ink))' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${level * 100}%`, background: 'var(--qs-bg)', opacity: 0.85 }} />
        <div style={{ position: 'absolute', left: `${level * 100}%`, top: -3, bottom: -3, width: 1, background: 'var(--qs-ink)' }} />
      </div>
      <span className="qs-small" style={{ color: 'var(--qs-ink2)' }}>1 · value · shown ≥ {level.toFixed(2)}</span>
    </div>
  )
}
