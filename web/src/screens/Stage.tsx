// DISPLAY: the volumetric workspace, composed like a 3D editor viewport but for sculpting with
// quantum processes. Header: what is shown (left), then visibility, gizmos, overlays and shading
// popovers (right). In the view: tool shelf (top-left), info, axis gizmo and navigation (top-right).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useStore, MORPH_MS, type Layer, type Shading, type Tool, type View, type Stage as StageName } from '../store'
import { Engine, type LayerName, type ViewName } from '../view/engine'
import { loadBundled, makeEntangleMaterial, type ShaderTables } from '../view/entangle'
import { QProbe } from '../qs/QProbe'
import { useProbe, type ProbeHit } from '../qs/useProbe'
import { Icon, IconButton } from '../qs/Icon'
import { Popover, PopSection } from '../qs/Popover'
import { Slider } from '../qs/Slider'
import { Spinner } from './parts'
import { HudLayer } from '../hud/Composer'
import { FAMILIES } from '../hud/registry'
import { chosenOf, toggleVariant, variantsOf } from '../hud/compose'
import { MARK_MIME } from './MarkLibrary'
import { usePresent } from '../present'
import { usePresentKeys } from './presentKeys'
import { useAnimator } from './animator'
import type { HudCtx, Vec3 } from '../hud/types'
import { MODEL_EXT } from './modelExt'
import { ShapePicker } from './Shapes'
import { live, bump } from '../live'
import { ownerPalette, nationName } from '../view/nations'
import { fit, frameOf } from '../frames'
import { sectionRGBA, useSliceScheme } from '../qs/sectionColor'

const MODE_LABEL: Record<string, string> = { gaussian: 'Gaussian', emulator: 'Emulation', atlas: 'Atlas', nations: 'Evolve' }
const modeLabel = (m: string) => MODE_LABEL[m] ?? m

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
const LIGHTS = [
  { id: 'studio', t: 'Key', d: 'A key light from the upper left of the camera, with sky fill.' },
  { id: 'soft', t: 'Soft', d: 'Mostly sky light; gentle shading, good for dense voxels.' },
  { id: 'flat', t: 'Flat', d: 'No shading at all: tone shows only the value.' },
  { id: 'rim', t: 'Rim', d: 'A backlight outlines the silhouette.' },
] as const
const BACKDROPS = [
  { id: 'plain', t: 'Plain', d: 'The page background.' },
  { id: 'dots', t: 'Dots', d: 'A 24 px dot grid behind the model.' },
  { id: 'lines', t: 'Grid', d: 'A fine square grid, like graph paper.' },
  { id: 'gradient', t: 'Vignette', d: 'Lighter at the centre, darker at the edges.' },
  { id: 'studio', t: 'Studio', d: 'A soft horizon, like a photo cyclorama.' },
] as const

const SHADINGS: { id: Shading; icon: string; t: string; d: string }[] = [
  { id: 'wire', icon: 'wire', t: 'Wireframe', d: 'Edges only: voxels as a lattice, meshes as triangles.' },
  { id: 'solid', icon: 'solid', t: 'Solid', d: 'Plain studio shading in one grey.' },
  { id: 'value', icon: 'value', t: 'Value', d: 'Cells shaded by their value: darker is denser.' },
  { id: 'entangle', icon: 'entangle', t: 'Entanglement', d: "Shaded with lookup tables computed by Moth's Entanglement Shader: thin-film interference driven by the cell values." },
]

export function Stage() {
  const host = useRef<HTMLDivElement>(null)
  // Present with a frame: the view becomes an artboard of the frame's shape, centred in the window
  const mainRef = useRef<HTMLElement>(null)
  const [room, setRoom] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setRoom({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [engine, setEngine] = useState<Engine | null>(null)
  const [tick, setTick] = useState(0)
  const [over, setOver] = useState(false)
  const [markOver, setMarkOver] = useState(false)
  const [tables, setTables] = useState<ShaderTables[]>([])
  const st = useStore()
  const pr = usePresent()
  usePresentKeys()
  useAnimator()
  // a component previewed from the library is drawn on top of the composition as it is now
  const pv = pr.preview && !pr.preview.startsWith('guide:') ? pr.preview.split(':') : null
  const shown: Record<string, string> = pv && !variantsOf(pr.compose, pv[0]).includes(pv[1]) ? { ...pr.compose, [pv[0]]: toggleVariant(pr.compose, pv[0], pv[1]) } : pr.compose
  // the view's control strips (tools left, gizmo and navigation right): the same room is kept on both sides
  const side = pr.bare ? 0 : st.hud.axes || st.hud.camera || st.hud.nav ? 88 : st.hud.tools ? 56 : 0
  // with pieces composed around the object, the view's own caption and value scale give way to them
  const composed = chosenOf(pr.compose).some((m) => m.slot !== 'object' && m.slot !== 'full') || pr.texts.length > 0
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
  // Evolve draws the turn on screen, each cell in its nation's colour; other modes draw the result by value
  const ev = st.evolve
  const nations = useMemo(() => (st.proc?.mode === 'nations' && ev.owner && ev.n ? { owner: ev.owner, n: ev.n } : null), [st.proc?.mode, ev.owner, ev.n])
  const isNations = !!nations
  useEffect(() => {
    if (!engine) return
    if (!nations) { engine.setVoxels('processed', procData, m.level, valued); return }
    // from turn to turn the territory morphs (snaps when off or when the viewer asks for less motion)
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setLabels('processed', nations.owner, nations.n, ownerPalette(theme), still ? 0 : MORPH_MS[useStore.getState().morph])
  }, [engine, procData, m.level, valued, nations, theme])
  useEffect(() => { engine?.setMesh('result', resultMesh) }, [engine, resultMesh])
  useEffect(() => { engine?.show(view as ViewName) }, [engine, view, gridData, procData, resultMesh, modelMesh])
  useEffect(() => { engine?.setGhosts((Object.keys(layers) as Layer[]).filter((k) => layers[k].visible)) }, [engine, layers, gridData, procData, resultMesh, modelMesh])
  // the bounding box and print grid (a guide previewed from the library shows too)
  const guides = { ...pr.guides, box: pr.guides.box || pr.preview === 'guide:box', floor: pr.guides.floor || pr.preview === 'guide:floor' }
  useEffect(() => { engine?.setFrame({ bounds: guides.box, floor: guides.floor, divisions: guides.div }) }, [engine, guides.box, guides.floor, guides.div, grid])
  const planeOn = hud.slice || tool === 'slice' || pr.sweep || (shown.slicecard ?? 'off') !== 'off'
  useEffect(() => { engine?.setSlice(planeOn ? slice : null) }, [engine, slice, view, planeOn])
  // the cutting plane carries the section itself, coloured as the Slice panel says (nations in Evolve)
  const planeProcessed = (view === 'processed' || view === 'result' || view === 'scan') && !!procData
  const planeColors = useSliceScheme(planeProcessed)
  useEffect(() => {
    if (!engine) return
    const g = planeProcessed ? procData : gridData
    if (!planeOn || !g || g.n !== engine.n) { engine.setSliceImage(null, 0, 'z'); return }
    engine.setSliceImage(sectionRGBA(g, slice.axis, slice.index, planeColors.scheme, theme, planeColors.owner), g.n, slice.axis)
  }, [engine, planeOn, planeProcessed, procData, gridData, slice.axis, slice.index, planeColors.scheme, planeColors.owner, theme])
  useEffect(() => { if (engine && view === 'scan') engine.setScan(slice.axis === 'z' ? slice.index + 1 : 0) }, [engine, view, slice, grid])
  // entering the scan view turns the plane to z (only then: the axis is read, not watched)
  useEffect(() => { const s = useStore.getState(); if (view === 'scan' && s.slice.axis !== 'z') s.setSlice({ axis: 'z' }) }, [view])

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
    // entanglement reads a voxel's colour as film thickness, so Evolve's nation colours keep plain value shading
    engine.setShading(shading === 'entangle' && (!entMats || isNations) ? 'value' : shading, entMats)
  }, [engine, shading, entMats, theme, isNations])

  useEffect(() => { engine?.setLighting(shade.light) }, [engine, shade.light])
  // motion: turntable, and a reel that flies through the saved shots
  useEffect(() => { engine?.setSpin(pr.spin, pr.spinSpeed * pr.spinDir) }, [engine, pr.spin, pr.spinSpeed, pr.spinDir])
  useEffect(() => {
    if (!engine || !pr.fly) return
    const p = usePresent.getState()   // pr.fly asks for the flight; the shot is read, not watched
    const sh = p.shots[p.shot]
    if (sh) engine.flyTo(sh.az, sh.el, sh.dist)
  }, [engine, pr.fly])
  useEffect(() => {
    if (!pr.reel || pr.shots.length < 2) return
    const t = setInterval(() => { const p = usePresent.getState(); p.setShot((p.shot + 1) % p.shots.length) }, pr.reelSec * 1000)
    return () => clearInterval(t)
  }, [pr.reel, pr.shots.length, pr.reelSec])
  useEffect(() => { if (engine) { (window as unknown as { __qsEngine?: Engine }).__qsEngine = engine; live.engine = engine } }, [engine])
  // the cutting plane sweeps up and down; compositions can cycle on their own
  useEffect(() => {
    if (!pr.sweep || !grid) return
    // within its range, `step` layers at a time, one pass in `sec` seconds; changes apply as it runs
    const { from, to, step, sec, mode } = pr.sweepCfg
    const lo = Math.round(Math.min(from, to) * (grid.n - 1)), hi = Math.round(Math.max(from, to) * (grid.n - 1))
    let dir = mode === 'down' ? -1 : 1
    const s0 = useStore.getState().slice.index
    if (s0 < lo || s0 > hi) useStore.getState().setSlice({ index: mode === 'down' ? hi : lo })
    const t = setInterval(() => {
      const i = useStore.getState().slice.index
      let next = i + dir * step
      if (next > hi || next < lo) {
        if (mode === 'bounce') { dir = -dir; next = Math.min(hi, Math.max(lo, i + dir * step)) }
        else next = mode === 'up' ? lo : hi
      }
      useStore.getState().setSlice({ index: next })
    }, (sec * 1000 * step) / Math.max(1, hi - lo))
    return () => clearInterval(t)
  }, [pr.sweep, grid, pr.sweepCfg])
  useEffect(() => {
    if (!pr.cycle) return
    const t = setInterval(() => {
      const p = usePresent.getState()   // step through the saved compositions
      if (p.saved.length < 2) return
      const i = p.saved.findIndex((x) => x.id === p.current)
      p.load(p.saved[(i + 1) % p.saved.length].id)
    }, pr.cycleSec * 1000)
    return () => clearInterval(t)
  }, [pr.cycle, pr.cycleSec])

  // tools: the slice tool takes the left drag; navigate turns the probe off
  useEffect(() => { engine?.setRotate(tool !== 'slice') }, [engine, tool])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]'))) return
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase())
      if (t) useStore.getState().setTool(t.id)
      if (e.key === 'Home') engine?.home()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [engine])

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
    if (L === 'processed') {
      const ev = useStore.getState().evolve
      const who = g.proc?.mode === 'nations' && ev.owner && ev.n ? ev.owner[(x * ev.n + y) * ev.n + z] - 1 : -1
      if (who >= 0) return { x, y, z, p, lines: [`nation ${nationName(who)}`, `${cell} · click to pick`] }
      return { x, y, z, p, lines: [cell, `input ${read(gridData).toFixed(2)} → ${read(procData).toFixed(2)}`] }
    }
    const val = read(procData)
    return { x, y, z, p, lines: [cell, `surface · ${val.toFixed(2)} ${val >= g.m.level ? '≥' : '<'} level ${g.m.level.toFixed(2)}`] }
  }
  const down = useRef<[number, number] | null>(null)
  const reading = tool === 'probe' || tool === 'annotate' || tool === 'measure'
  const probe = useProbe({ pick, enabled: !!model && reading, maxPins: tool === 'measure' ? 6 : 8, pinning: tool === 'annotate' || tool === 'measure' })
  const project = (h: ProbeHit) => {
    if (!engine) return null
    const [x, y] = engine.project(h.p ? new THREE.Vector3(...h.p) : new THREE.Vector3(h.x, h.y, h.z))
    return { x, y }
  }
  const clearPins = probe.clear   // stable
  useEffect(() => { clearPins() }, [model?.model_id, clearPins])
  useEffect(() => { live.probe = probe })   // for the Present panel; set before the bump below
  useEffect(() => { bump() }, [probe.pins])

  /** Auto-annotate: pins the notable cells of what was computed last (quantum result, else the voxels). */
  const autoAnnotate = () => {
    const g = useStore.getState()
    const src = g.procData ?? g.gridData
    if (!src || !engine) return 0
    const n = src.n, d = src.data, lvl = g.procData ? m.level : 0.5, mmc = grid?.voxel_size ?? 1
    const cnt = new Array<number>(n).fill(0)
    let peak = -Infinity, pk: Vec3 = [0, 0, 0], top = -1, base = n, sx = 0, sy = 0, total = 0
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
      const v = d[(x * n + y) * n + z]
      if (v > peak || (v === peak && (x - n / 2) ** 2 + (y - n / 2) ** 2 < (pk[0] - n / 2) ** 2 + (pk[1] - n / 2) ** 2)) { peak = v; pk = [x, y, z] }
      if (v >= lvl) { cnt[z]++; total++; sx += x; sy += y; if (z > top) top = z; if (z < base) base = z }
    }
    if (!total) return 0
    const cx = sx / total, cy = sy / total
    const wz = cnt.indexOf(Math.max(...cnt))
    const inLayer = (z: number, far: boolean): Vec3 => {
      let best: Vec3 = [Math.round(cx), Math.round(cy), z], bd = far ? -1 : Infinity
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
        if (d[(x * n + y) * n + z] < lvl) continue
        const dd = (x - cx) ** 2 + (y - cy) ** 2
        if (far ? dd > bd : dd < bd) { bd = dd; best = [x, y, z] }
      }
      return best
    }
    const notes: [Vec3, string, string][] = [
      [pk, 'Peak', `value ${peak.toFixed(2)} · cell ${pk.join(' ')}`],
      [inLayer(top, false), 'Top', `layer ${top} · ${((top + 1) * mmc).toFixed(1)} mm up`],
      [inLayer(wz, true), 'Widest layer', `layer ${wz} · ${cnt[wz]} cells`],
      [inLayer(base, false), 'Base', `layer ${base} · footprint ${cnt[base]} cells`],
    ]
    if (g.procData && g.gridData && g.gridData.n === n) {
      let dm = -1, dc: Vec3 = [0, 0, 0], a = 0, b = 0
      for (let i = 0; i < d.length; i++) {
        const dv = Math.abs(d[i] - g.gridData.data[i])
        if (dv > dm) { dm = dv; a = g.gridData.data[i]; b = d[i]; dc = [Math.floor(i / (n * n)), Math.floor(i / n) % n, i % n] }
      }
      if (dm > 0.01) notes.push([dc, 'Most changed', `${a.toFixed(2)} → ${b.toFixed(2)} · cell ${dc.join(' ')}`])
    }
    const seen = new Set<string>()
    const uniq = notes.filter(([c]) => { const k = c.join(); if (seen.has(k)) return false; seen.add(k); return true })
    probe.setPins(uniq.map(([c, t, info]) => {
      const [px, py] = engine.project(new THREE.Vector3(...c))
      return { px, py, hit: { x: c[0], y: c[1], z: c[2], p: c, lines: [t, info] as [string, string] } }
    }))
    return uniq.length
  }
  useEffect(() => { live.autoAnnotate = autoAnnotate })

  // slice tool: vertical drag moves the cutting plane one layer per 6 px
  const sliceDrag = useRef<{ y: number; i: number } | null>(null)
  const sliceHandlers = tool === 'slice' && grid ? {
    onPointerDown: (e: React.PointerEvent) => { if (e.button === 0) { e.preventDefault(); sliceDrag.current = { y: e.clientY, i: useStore.getState().slice.index }; st.setScan({ playing: false }) } },
    onPointerMove: (e: React.PointerEvent) => {
      const d = sliceDrag.current
      if (!d) return
      st.setSlice({ index: Math.max(0, Math.min(grid.n - 1, d.i + Math.round((d.y - e.clientY) / 6))) })
    },
    onPointerUp: () => { sliceDrag.current = null },
    onPointerLeave: () => { sliceDrag.current = null },
  } : {}

  // live size of the view, for the HUD
  const [vsize, setVsize] = useState({ w: 800, h: 600 })
  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(() => setVsize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // when the view changes size (panels, resizers, the window), lay the pieces out again for it, unless
  // some were placed by hand (those stay where they were put)
  useEffect(() => {
    if (vsize.w < 50) return
    const t = setTimeout(() => {
      const p = usePresent.getState()
      const mine = Object.entries(p.pos).filter(([k]) => k.startsWith('present|') && !k.startsWith('present|chrome:'))
      if (mine.length && mine.every(([, v]) => v.auto)) p.tidyUp()
    }, 220)
    return () => clearTimeout(t)
  }, [vsize.w, vsize.h])
  // after a layout the user asked for (a preset, a tidy, a frame), the object is framed in the room the
  // pieces leave, centred in the view so it never drifts to one side
  const aimed = useRef(pr.aim)
  const onHero = (r: { l: number; r: number; t: number; b: number }) => {
    if (!engine || aimed.current === usePresent.getState().aim) return
    aimed.current = usePresent.getState().aim
    const cx = vsize.w / 2, cy = vsize.h / 2
    // the largest box centred in the view that stays in that room
    const hw = Math.max(vsize.w * 0.12, Math.min(cx - r.l, r.r - cx)), hh = Math.max(vsize.h * 0.12, Math.min(cy - r.t, r.b - cy))
    engine.frameInto({ l: cx - hw, r: cx + hw, t: cy - hh, b: cy + hh })
  }
  const hudCtx = (e: Engine): HudCtx => {
    const a = e.angles(), lens = e.lens()
    const done = [!!model, !!gridData, !!procData, !!st.report]
    const modeName = modeLabel(st.proc?.mode ?? st.q.mode)
    const bits = Math.ceil(Math.log2(Math.min(grid?.n ?? 32, 32)))
    return {
      w: vsize.w, h: vsize.h, tick,
      cam: { az: a.az, el: a.el, dist: lens.dist, fov: lens.fov },
      project: (p: Vec3) => {
        const [x, y] = e.project(new THREE.Vector3(...p))
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
      },
      box: e.boxGrid(), rect: e.bounds2D(),
      n: grid?.n ?? e.n, mm: grid?.voxel_size ?? 1,
      view, tool, model, grid, proc: st.proc, job: st.job, report: st.report,
      q: { ...st.q, shots: st.q.shots ?? null },
      level: m.level, slice,
      hover: probe.hover?.hit ? { x: probe.hover.px, y: probe.hover.py, cell: [probe.hover.hit.x, probe.hover.hit.y, probe.hover.hit.z], value: null, lines: probe.hover.hit.lines } : null,
      pins: probe.pins.map((pin, i) => {
        const pos = project(pin.hit)
        return { n: i + 1, cell: [pin.hit.x, pin.hit.y, pin.hit.z] as Vec3, p: pin.hit.p, lines: pin.hit.lines, x: pos?.x ?? null, y: pos?.y ?? null }
      }),
      steps: {
        done, live: Math.max(0, done.lastIndexOf(true)),
        labels: [
          ['Model', model ? (model.builtin ? 'test_cup.stl' : model.file) : '—'],
          ['Voxelise', grid ? `${grid.n}³ · ${bits * 3} qubits` : '—'],
          [st.q.mode === 'nations' ? 'Evolve' : 'Quantum', st.proc ? `${modeName} · ${st.job?.status === 'running' ? 'running' : 'live'}` : '—'],
          ['Mesh', st.report ? `Level ${m.level.toFixed(2)}` : '—'],
        ],
      },
      runs: st.runs,
      busy: Object.values(st.busy).some(Boolean),
      orbitTo: (az, el) => e.orbitTo(az, el),
      thumbs: (names, tw, th) => e.thumbs(names, tw, th),
      data: { grid: gridData, proc: procData },
      log: st.log,
      atlasJobs: st.atlasJobs,
      setSlice: (p) => st.setSlice(p),
      setLevel: (v) => st.setM({ level: Math.min(0.95, Math.max(0.05, v)) }),
      goStep: (i) => { const v = (['model', 'voxels', 'processed', 'result'] as View[])[i]; if (avail[v]) st.setFocus((['model', 'voxels', st.proc?.mode === 'nations' ? 'evolve' : 'quantum', 'mesh'] as StageName[])[i], 'Picked on the view') },
    }
  }

  const avail: Record<View, boolean> = { model: !!model, voxels: !!gridData, processed: !!procData, result: !!resultMesh, scan: !!procData && !!gridData }
  const info = (() => {
    if (!model) return null
    const name = model.builtin ? 'test cup' : model.file
    const mode = SHADINGS.find((x) => x.id === shading)!.t.toLowerCase()
    if (view === 'model') return [`Original mesh · ${mode}`, `${name} · ${model.faces.toLocaleString()} faces`]
    if (view === 'voxels' && grid) return [`Input grid · ${mode}`, `${grid.n}³ · ${grid.solid.toLocaleString()} solid cells`]
    if (view === 'processed' && st.proc) return [`Quantum result · ${mode}`, st.proc.mode === 'nations' ? `Evolve · turn ${ev.turn} of ${ev.turns} · one colour per nation` : `${modeLabel(st.proc.mode)} · cells ≥ ${m.level.toFixed(2)}`]
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
  const frame = frameOf(pr.frame)
  const framed = frame.ratio != null
  // the artboard has a margin all round (none while capturing)
  const pad = pr.bare ? 0 : 24
  const board = framed && room.w > 0 ? fit(frame.ratio!, room.w - 2 * pad, room.h - 2 * pad - (pr.bare ? 0 : 40)) : null

  return (
    <main className={'stage' + (framed ? ' stage--framed' : '')} ref={mainRef}>
      <div className="stage__bar">
        <FocusStrip />
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
          <ShadingOptions tables={tables} />
          <IconButton name="drag" title={pr.composing ? 'Done arranging' : 'Arrange the view'} desc="Drag pieces around the view, resize them by the corner, select and remove them. Everything else is under Properties · Compose." hotkey="C" on={pr.composing} onClick={() => pr.setComposing(!pr.composing)} />
        </div>
      </div>

      <div
        ref={host}
        className={'stage__view stage__view--' + tool + (model ? ' backdrop--' + shade.backdrop : '') + (markOver ? ' stage__view--drop' : '')}
        {...probe.handlers}
        {...sliceHandlers}
        onClick={(e) => {
          // Evolve: a click (not a drag) on a nation picks it; its properties show under Evolve
          const d = down.current
          if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4 || tool !== 'probe') return
          const hit = probe.hover?.hit, ev = st.evolve
          if (!hit || st.proc?.mode !== 'nations' || !ev.owner || !ev.n) { if (st.evolveSel != null && !hit) st.setEvolveSel(null); return }
          const who = ev.owner[(hit.x * ev.n + hit.y) * ev.n + hit.z] - 1
          st.setEvolveSel(who >= 0 && who !== st.evolveSel ? who : null)
        }}
        onPointerDown={(e) => {
          down.current = [e.clientX, e.clientY]
          // compose mode: a click on the view outside every piece clears the selection
          if (pr.composing && !(e.target instanceof Element && e.target.closest('.hud-piece'))) pr.setSel(null)
          if ('onPointerDown' in sliceHandlers && sliceHandlers.onPointerDown) sliceHandlers.onPointerDown(e)
          else probe.handlers.onPointerDown(e)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (e.dataTransfer.types.includes(MARK_MIME)) { e.dataTransfer.dropEffect = 'copy'; setMarkOver(true) } else setOver(true)
        }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setOver(false); setMarkOver(false) } }}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          setMarkOver(false)
          // a component from the library: placed where it was dropped
          const mark = e.dataTransfer.getData(MARK_MIME)
          if (mark) {
            const r = e.currentTarget.getBoundingClientRect()
            const at = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
            if (mark === 'text') pr.addText(at)
            else {
              const [f, id] = mark.split(':')
              const slot = FAMILIES.find((x) => x.id === f)?.modules.find((x) => x.id === id)?.slot
              pr.place(f, id, slot === 'object' || slot === 'full' ? undefined : at)   // marks on the model have no place of their own
            }
            pr.setComposing(true)
            return
          }
          const f = e.dataTransfer.files[0]
          if (f) st.upload(f)
        }}
        style={{ background: model ? undefined : 'radial-gradient(circle,var(--qs-dot) 1px,transparent 1.5px) 12px 12px/24px 24px', ...(board ? { width: board.w, height: board.h, flex: 'none' } : null) }}
      >
        {hud.frame && !board && !variantsOf(shown, 'frame').length && <ViewMarks />}
        {!model && <Landing over={over} />}
        {model && over && <div className="stage__drop">Release to open</div>}
        {model && engine && (
          <QProbeAnchored probe={probe} project={project} n={grid?.n ?? 32} mm={grid?.voxel_size ?? 1} measure={tool === 'measure'}
            hideHover={(shown.selection ?? 'off') !== 'off'} hidePins={(shown.callout ?? 'off') !== 'off'} showPins />
        )}

        {model && engine && (
          <HudLayer ctx={hudCtx(engine)} compose={shown}
            edit={pr.composing && !pr.bare && !pr.recording ? { sel: pr.sel, onSelect: pr.setSel, onRemove: pr.removePiece, onResize: (k, size) => pr.setLook(k, { size }) } : undefined}
            looks={pr.looks} hl={pr.hl} ghost={pr.preview}
            texts={pr.texts} onText={pr.setText}
            autoArrange onCrowded={pr.setCrowded} onLeftOut={pr.setLeftOut} tidyKey={pr.tidyKey} onHero={onHero}
            inset={{ l: side, r: side, t: 0, b: 0 }}
            positions={Object.fromEntries(Object.entries(pr.pos).filter(([k]) => k.startsWith('present|')).map(([k, v]) => [k.slice(8), v]))}
            onMove={(k, p) => pr.setPos(`present|${k}`, p)}
            chrome={pr.bare ? {} : {
            left: hud.tools ? (
              <div className="toolshelf hud-chrome" role="toolbar" aria-label="Tools" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
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
            ) : undefined,
            tl: hud.caption && info && !composed ? (
              <div className="hud__info">
                <span>{info[0]}</span>
                <span>{info[1]}</span>
                {tool === 'slice' && grid && <span>slice · drag up or down · z {slice.index}</span>}
              </div>
            ) : undefined,
            // the axis gizmo, the camera readout and navigation share one strip down the right edge
            right: hud.axes || hud.camera || hud.nav ? (
              <div className="nav-strip hud-chrome" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
            ) : undefined,
            br: hud.legend && !composed && shaded && !(nations && (view === 'processed' || view === 'scan')) ? <Legend level={m.level} mode={shading} /> : undefined,
          }} />
        )}
      </div>
      {board && !pr.bare && <div className="stage__board-label" data-no-export>{frame.t} · {frame.use}{frame.sizes[0] ? ` · ${frame.sizes[Math.min(pr.outSize, frame.sizes.length - 1)].join(' × ')} px` : ''}</div>}
    </main>
  )
}

function ShadingOptions({ tables }: { tables: ShaderTables[] }) {
  const st = useStore()
  const { shading, shade } = st
  const table = tables.find((t) => t.id === shade.tables) ?? tables[0]
  return (
    <Popover icon={SHADINGS.find((x) => x.id === shading)!.icon} title="Shading and render" desc="Shading mode, lighting, backdrop and the entanglement shader." width={340}>
      <PopSection label="Shading">
        <div className="swatches swatches--4">
          {SHADINGS.map((sh) => (
            <button key={sh.id} className={'swatch' + (shading === sh.id ? ' swatch--on' : '')} aria-pressed={shading === sh.id} aria-label={sh.t}
              disabled={sh.id === 'entangle' && !tables.length} onClick={() => st.setShading(sh.id)} data-tip={sh.t} data-tip-desc={sh.d}>
              <Icon name={sh.icon} size={22} />
              <span className="swatch__t">{sh.t}</span>
            </button>
          ))}
        </div>
      </PopSection>
      <PopSection label="Lighting">
        <div className="swatches">
          {LIGHTS.map((l) => (
            <button key={l.id} className={'swatch' + (shade.light === l.id ? ' swatch--on' : '')} onClick={() => st.setShading(shading, { light: l.id })} data-tip={l.t} data-tip-desc={l.d}>
              <span className={'swatch__ball swatch__ball--' + l.id} />
              <span className="swatch__t">{l.t}</span>
            </button>
          ))}
        </div>
      </PopSection>
      <PopSection label="Backdrop">
        <div className="swatches">
          {BACKDROPS.map((b) => (
            <button key={b.id} className={'swatch' + (shade.backdrop === b.id ? ' swatch--on' : '')} onClick={() => st.setShading(shading, { backdrop: b.id })} data-tip={b.t} data-tip-desc={b.d}>
              <span className={'swatch__bd backdrop--' + b.id} />
              <span className="swatch__t">{b.t}</span>
            </button>
          ))}
        </div>
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

function QProbeAnchored({ probe, project, n, mm, measure, hideHover, hidePins, showPins }: { probe: ReturnType<typeof useProbe>; project: (h: ProbeHit) => { x: number; y: number } | null; n: number; mm: number; measure: boolean; hideHover: boolean; hidePins: boolean; showPins: boolean }) {
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
      <QProbe w={size.w} h={size.h} n={n} probe={probe} project={project} mmPerCell={mm} hideClear measure={measure} hideHover={hideHover} hidePins={hidePins} showPins={showPins} />
    </>
  )
}

/** First landing: a shape to start from or your own model, and the four steps ahead. */
function Landing({ over }: { over: boolean }) {
  const st = useStore()
  const file = useRef<HTMLInputElement>(null)
  return (
    <div className="landing">
      <div className="landing__card">
        <span className="landing__title">{over ? 'Release to open the model' : 'What would you like to sculpt?'}</span>
        <section className="landing__sec">
          <span className="landing__k">Start from a shape</span>
          <ShapePicker big />
        </section>
        <section className="landing__sec">
          <span className="landing__k">Or your own model</span>
          <button className={'landing__import' + (over ? ' landing__import--over' : '')} onClick={() => file.current?.click()}>
            <Icon name="upload" size={24} />
            <span className="landing__ct">Import a model</span>
            <span className="landing__ext">{MODEL_EXT.join(' ')}</span>
          </button>
        </section>
        <input ref={file} type="file" hidden accept={MODEL_EXT.join(',')} onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) st.upload(f)
          e.target.value = ''
        }} />
        <ol className="landing__steps" aria-label="The steps">
          {[['model', 'Model'], ['grid', 'Voxelise'], ['quantum', 'Quantum'], ['print', 'Mesh']].map(([i, t], k) => (
            <li key={t}><Icon name={i} size={24} /><span>{String(k + 1).padStart(2, '0')} {t}</span></li>
          ))}
        </ol>
        {st.recent.length > 0 && (
          <div className="landing__recent">
            <span className="landing__k">Recent</span>
            {st.recent.slice(0, 4).map((r) => <button key={r.name} className="landing__file" onClick={() => st.openRecent(r.name)}>{r.name}</button>)}
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
    <IconButton name={name} title={title} desc={desc} side="left" on={on} drag={name} onPointerDown={(e) => {
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
      <div style={{ ...c, left: 24, top: 24, borderLeft: b, borderTop: b }} />
      <div style={{ ...c, right: 24, top: 24, borderRight: b, borderTop: b }} />
      <div style={{ ...c, left: 24, bottom: 24, borderLeft: b, borderBottom: b }} />
      <div style={{ ...c, right: 24, bottom: 24, borderRight: b, borderBottom: b }} />
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
          <circle cx={e.x} cy={e.y} r={9} fill="transparent" />
          <circle cx={e.x} cy={e.y} r={e.pos ? 7 : 4} fill={e.pos ? 'var(--qs-ink)' : 'var(--qs-bg)'} stroke="var(--qs-ink)" strokeWidth="1" />
          {e.pos && <text x={e.x} y={e.y + 3} textAnchor="middle" fontFamily="TWK Everett Mono, ui-monospace, monospace" fontSize="8.5" fill="var(--qs-bg)">{'XYZ'[e.i]}</text>}
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

function Legend({ level, mode }: { level: number; mode: Shading }) {
  if (mode !== 'value' && mode !== 'entangle') return null
  return (
    <div className="hud__legend">
      <span className="qs-small" style={{ color: 'var(--qs-ink2)' }}>0</span>
      <div style={{ position: 'relative', width: 140, height: 6, background: mode === 'entangle' ? 'linear-gradient(90deg,#8a7f9e,#c9b07a,#7fa6a0,#b58aa0)' : 'linear-gradient(90deg, var(--qs-ink4), var(--qs-ink))' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${level * 100}%`, background: 'var(--qs-bg)', opacity: 0.85 }} />
        <div style={{ position: 'absolute', left: `${level * 100}%`, top: -3, bottom: -3, width: 1, background: 'var(--qs-ink)' }} />
      </div>
      <span className="qs-small" style={{ color: 'var(--qs-ink2)' }}>1 · {mode === 'entangle' ? 'film phase' : 'value'} · shown ≥ {level.toFixed(2)}</span>
    </div>
  )
}

/** What the workspace is showing and why. It follows what you do — the step whose
 *  parameters you touch, a model being opened, Evolve's turns, an Atlas run coming back in layers —
 *  and a click on a step shows that step until you work on another. */
function FocusStrip() {
  const focus = useStore((s) => s.focus)
  const view = useStore((s) => s.view)
  const st = {
    model: useStore((s) => !!s.model), grid: useStore((s) => !!s.gridData), proc: useStore((s) => !!s.procData),
    mesh: useStore((s) => !!s.resultMesh), mode: useStore((s) => s.q.mode), shown: useStore((s) => s.proc?.mode ?? null),
  }
  const working = useStore((s) => s.busy.model ? 'opening' : s.busy.vox ? 'voxelising' : s.busy.proc || s.busy.evolve ? (s.q.mode === 'nations' ? 'evolving' : 'processing') : s.busy.mesh ? 'meshing' : null)
  const ev = useStore((s) => s.evolve)
  const setFocus = useStore((s) => s.setFocus)
  const evolve = st.mode === 'nations'
  const steps: { id: StageName; t: string; done: boolean }[] = [
    { id: 'model', t: 'Model', done: st.model },
    { id: 'voxels', t: 'Voxels', done: st.grid },
    { id: evolve ? 'evolve' : 'quantum', t: evolve ? 'Evolve' : 'Quantum', done: st.proc },
    { id: 'mesh', t: 'Mesh', done: st.mesh },
  ]
  const at = focus.stage === 'scan' ? (evolve ? 'evolve' : 'quantum') : focus.stage
  // the stage's own view may not exist yet: say what is on screen meanwhile
  const VIEW_T: Record<View, string> = { model: 'original mesh', voxels: 'input voxels', processed: evolve ? 'nations' : 'quantum result', result: 'surface', scan: 'scan sweep' }
  const wanted: Record<StageName, View> = { model: 'model', voxels: 'voxels', quantum: 'processed', evolve: 'processed', mesh: 'result', scan: 'scan' }
  // the stage's own result is not the one on screen yet: another view, or the previous mode's result
  const stale = (focus.stage === 'evolve' && st.shown !== 'nations') || (focus.stage === 'quantum' && st.shown === 'nations')
  const waiting = st.model && (wanted[focus.stage] !== view || stale)
  if (!st.model) return <div className="focus-strip"><span className="focus-strip__why">Open a model to begin</span></div>
  return (
    <div className="focus-strip" aria-live="polite">
      <ol className="focus-strip__steps" aria-label="Show">
        {steps.map((x) => {
          // the scan sweep belongs to the quantum step (and is a piece in the library)
          const on = x.id === at
          return (
            <li key={x.id}>
              <button className={'focus-strip__s' + (on ? ' focus-strip__s--on' : '') + (x.done ? ' focus-strip__s--done' : '')}
                disabled={!x.done} aria-pressed={on} onClick={() => setFocus(x.id, `Showing the ${VIEW_T[wanted[x.id]]}`)}>{x.t}</button>
            </li>
          )
        })}
      </ol>
      <span key={focus.t} className="focus-strip__why">
        {focus.why || `Showing the ${VIEW_T[view]}`}
        {focus.stage === 'evolve' && ev.history ? <em> · turn {ev.turn} / {ev.turns}</em> : null}
        {waiting ? <em> · showing the {stale ? 'previous result' : VIEW_T[view]} until {working ? `${working} is done` : 'it is ready'}</em> : null}
      </span>
    </div>
  )
}
