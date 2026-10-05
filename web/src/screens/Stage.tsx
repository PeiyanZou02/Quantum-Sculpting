// DISPLAY: the volumetric workspace. The bar above chooses what is shown and which overlays and
// HUD elements are on; the geometry is the only 3D element, everything drawn over it is 2D.
import { useEffect, useRef, useState } from 'react'
import { useStore, type Hud, type View } from '../store'
import { Engine, type ViewName } from '../view/engine'
import { QProbe, type ProbeHit } from '../qs/QProbe'
import { Segmented } from '../qs/Segmented'
import { QPill } from '../qs/QPill'
import { Spinner } from './parts'
import { MODEL_EXT } from './InputPane'

const STATIONS = [{ t: 'Front', az: 0, el: 0 }, { t: 'Side', az: 90, el: 0 }, { t: 'Top', az: 0, el: 89 }, { t: 'Iso', az: 35, el: 22 }]
const SCAN_SECONDS = 10

const HUD_ITEMS: { group: string; items: { k: keyof Hud; t: string; d: string }[] }[] = [
  { group: 'Scene', items: [
    { k: 'bounds', t: 'Grid box', d: 'dashed n³ outline' },
    { k: 'floor', t: 'Floor grid', d: 'lines under the model' },
    { k: 'slice', t: 'Slice plane', d: 'the inspected layer, in voxel views' },
  ] },
  { group: 'HUD', items: [
    { k: 'probe', t: 'Probe', d: 'hover readout, click to pin' },
    { k: 'dims', t: 'Size marks', d: 'width and height in mm' },
    { k: 'axes', t: 'Axes', d: 'X Y Z gnomon' },
    { k: 'camera', t: 'Camera', d: 'azimuth and elevation' },
    { k: 'legend', t: 'Value scale', d: 'shading of processed cells' },
    { k: 'caption', t: 'Caption', d: 'what the view shows' },
    { k: 'frame', t: 'Frame', d: 'corners and centre cross' },
  ] },
]

export function Stage() {
  const host = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [tick, setTick] = useState(0)
  const [over, setOver] = useState(false)
  const [hudOpen, setHudOpen] = useState(false)
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
  useEffect(() => { engine?.setScan(scan.z) }, [engine, scan.z, grid])

  // scan sweep: plays once on entering the view, ~10 s bottom to top
  useEffect(() => {
    if (view === 'scan' && st.job?.status !== 'running') st.setScan({ z: 0, playing: true })
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!scan.playing || !grid) return
    let raf = 0, last = performance.now()
    const step = (now: number) => {
      const s = useStore.getState().scan
      const z = Math.min(grid.n, s.z + (grid.n / SCAN_SECONDS) * Math.min((now - last) / 1000, 0.1))
      last = now
      useStore.getState().setScan({ z, playing: z < grid.n })
      if (z < grid.n) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [scan.playing, grid])

  const avail: Record<View, boolean> = { model: !!model, voxels: !!gridData, processed: !!procData, result: !!resultMesh, scan: !!procData && !!gridData }
  const pick = (px: number, py: number): ProbeHit | null => {
    const hit = engine?.pick(px, py)
    if (!hit) return null
    const [x, y, z] = hit.cell
    const g = useStore.getState()
    const read = (gr: typeof gridData) => (gr ? gr.data[(x * gr.n + y) * gr.n + z] : 0)
    const cell = `x ${x} · y ${y} · z ${z}`
    if (view === 'model') {
      const t = g.grid?.transform ?? (modelMesh ? Engine.placement(modelMesh, engine!.n) : null)
      if (!t) return { x, y, z, lines: [cell, 'surface'] }
      const s = t[0][0], p = hit.point
      return { x, y, z, lines: [`${((p.x - t[0][3]) / s).toFixed(1)} · ${((p.y - t[1][3]) / s).toFixed(1)} · ${((p.z - t[2][3]) / s).toFixed(1)} mm`, `surface · cell ${x} ${y} ${z}`] }
    }
    if (view === 'voxels') return { x, y, z, lines: [cell, `coverage ${read(gridData).toFixed(2)}`] }
    if (view === 'processed' || view === 'scan') return { x, y, z, lines: [cell, `input ${read(gridData).toFixed(2)} → ${read(procData).toFixed(2)}`] }
    const v = read(procData)
    return { x, y, z, lines: [cell, `${v.toFixed(2)} · ${v >= g.m.level ? 'kept' : 'removed'} at ${g.m.level.toFixed(2)}`] }
  }

  const caption = (() => {
    if (!model) return ''
    if (view === 'model') return `Original mesh · ${model.faces.toLocaleString()} faces`
    if (view === 'voxels' && grid) return `Input grid · ${grid.n}³ · ${grid.solid.toLocaleString()} solid cells`
    if (view === 'processed' && st.proc) return `Quantum result · ${st.proc.mode === 'atlas' ? 'Atlas' : st.proc.mode === 'emulator' ? 'emulation' : 'gaussian'} · cells ≥ ${m.level.toFixed(2)}`
    if (view === 'result' && st.report) return `Surface · ${st.report.faces.toLocaleString()} faces · ${st.report.watertight ? 'watertight' : 'open'}`
    if (view === 'scan') {
      const layered = st.job?.status === 'running' ? st.job.frontier != null : st.proc?.tiles?.mode === 'layers' && (st.proc.tiles.jobs ?? 1) > 1
      return layered ? 'Scan · computed layer by layer: the plane is where the result has come back' : 'Scan · before and after: result below the plane, original above'
    }
    return ''
  })()
  const busy = st.busy.model ? 'opening' : st.busy.vox ? 'voxelising' : st.busy.proc && st.q.mode !== 'atlas' ? 'processing' : st.busy.mesh ? 'meshing' : null
  const onCount = Object.values(hud).filter(Boolean).length
  const shaded = view === 'processed' || view === 'scan'
  const live = st.job?.status === 'running'

  return (
    <main className="stage">
      <div className="stage__bar">
        <div className="row" style={{ gap: 12 }}>
          <span className="qs-label">Display</span>
          <Segmented<View>
            options={[
              { value: 'model', label: 'Model', disabled: !avail.model }, { value: 'voxels', label: 'Voxels', disabled: !avail.voxels },
              { value: 'processed', label: 'Processed', disabled: !avail.processed }, { value: 'result', label: 'Result', disabled: !avail.result },
              { value: 'scan', label: 'Scan', disabled: !avail.scan },
            ]}
            value={view} onChange={st.setView}
          />
        </div>
        <div className="row" style={{ gap: 6 }}>
          {STATIONS.map((s) => <QPill key={s.t} kind="ghost" size="s" label={s.t} onClick={() => engine?.orbitTo(s.az, s.el)} />)}
          <span style={{ width: 1, height: 16, background: 'var(--qs-line)', margin: '0 4px' }} />
          <QPill kind={hudOpen ? 'active' : 'hair'} size="s" label={`Overlays · ${onCount}`} onClick={() => setHudOpen(!hudOpen)} />
        </div>
      </div>

      <div
        ref={host}
        className="stage__view"
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
        {!model && (
          <div className="stage__empty">
            <span style={{ font: '400 24px/1.1 var(--qs-sans)' }}>{over ? 'Release to open' : 'Start from a model'}</span>
            <span className="qs-cap">Choose a file or the test cup in Input, or drop {MODEL_EXT.join(' ')} here.</span>
          </div>
        )}
        {model && over && <div className="stage__drop">Release to open</div>}
        {model && engine && hud.probe && <QProbeSized pick={pick} n={grid?.n ?? 32} mm={grid?.voxel_size ?? 1} />}

        {model && engine && (
          <div className="hud" data-tick={tick}>
            {hud.caption && caption && <div className="hud__caption">{caption}</div>}
            {hud.dims && <SizeMarks engine={engine} />}
            <div className="hud__corner">
              {hud.axes && <Gnomon engine={engine} />}
              {hud.camera && <CameraReadout engine={engine} />}
            </div>
            {hud.legend && shaded && <Legend level={m.level} />}
          </div>
        )}

        {view === 'scan' && grid && (
          <div className="scanbar">
            <QPill kind="hair" size="s" label={live ? 'Live' : scan.playing ? 'Pause' : scan.z >= grid.n ? 'Replay' : 'Play'}
              onClick={() => { if (live) return; if (scan.playing) st.setScan({ playing: false }); else st.setScan({ z: scan.z >= grid.n ? 0 : scan.z, playing: true }) }} />
            <input className="scanbar__range" type="range" min={0} max={grid.n} step={0.1} value={scan.z} disabled={live}
              onChange={(e) => st.setScan({ z: +e.target.value, playing: false })} />
            <span className="qs-mono" style={{ minWidth: 64, textAlign: 'right' }}>{Math.round(scan.z)} / {grid.n}</span>
          </div>
        )}

        {hudOpen && (
          <div className="hudmenu" onPointerDown={(e) => e.stopPropagation()}>
            {HUD_ITEMS.map((g) => (
              <div key={g.group} className="hudmenu__group">
                <span className="qs-label">{g.group}</span>
                {g.items.map((it) => (
                  <label key={it.k} className="hudmenu__item">
                    <input type="checkbox" checked={hud[it.k]} onChange={(e) => st.setHud({ [it.k]: e.target.checked })} />
                    <span className="hudmenu__box" />
                    <span className="hudmenu__t">{it.t}</span>
                    <span className="hudmenu__d">{it.d}</span>
                  </label>
                ))}
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <QPill kind="ghost" size="s" label="All off" onClick={() => st.setHud(Object.fromEntries(Object.keys(hud).map((k) => [k, false])) as unknown as Hud)} />
              <QPill kind="ghost" size="s" label="Done" onClick={() => setHudOpen(false)} />
            </div>
          </div>
        )}
      </div>

      <div className="stage__foot">
        {busy && <Spinner />}
        <span>{busy ? `${busy}…` : ''}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--qs-ink3)' }}>drag to orbit · right-drag to pan · scroll to zoom{hud.probe ? ' · click to pin' : ''}</span>
      </div>
    </main>
  )
}

function QProbeSized({ pick, n, mm }: { pick: (x: number, y: number) => ProbeHit | null; n: number; mm: number }) {
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
      <QProbe w={size.w} h={size.h} n={n} pick={pick} mmPerCell={mm} enabled />
    </>
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

function Gnomon({ engine }: { engine: Engine }) {
  const ax = engine.axes2D()
  const R = 22, c = 28
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" style={{ overflow: 'visible' }}>
      {ax.map(([x, y], i) => (
        <g key={i}>
          <line x1={c} y1={c} x2={c + x * R} y2={c + y * R} stroke="var(--qs-ink)" strokeWidth="1" strokeDasharray={i === 1 ? '2 2' : undefined} />
          <text x={c + x * (R + 7)} y={c + y * (R + 7) + 3} textAnchor="middle" fontFamily="Geist Mono" fontSize="9" fill="var(--qs-ink)">{'XYZ'[i]}</text>
        </g>
      ))}
      <circle cx={c} cy={c} r="2" fill="var(--qs-ink)" />
    </svg>
  )
}

function CameraReadout({ engine }: { engine: Engine }) {
  const a = engine.angles()
  return (
    <div className="qs-mono" style={{ display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--qs-ink2)' }}>
      <span>az <span style={{ color: 'var(--qs-ink)' }}>{String(Math.round(a.az)).padStart(3, '0')}°</span></span>
      <span>el <span style={{ color: 'var(--qs-ink)' }}>{String(Math.round(a.el)).padStart(2, '0')}°</span></span>
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
      <span className="qs-small" style={{ color: 'var(--qs-ink2)' }}>value</span>
      <div style={{ position: 'relative', width: 140, height: 6, background: 'linear-gradient(90deg, var(--qs-ink4), var(--qs-ink))' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${level * 100}%`, background: 'var(--qs-bg)', opacity: 0.85 }} />
        <div style={{ position: 'absolute', left: `${level * 100}%`, top: -3, bottom: -3, width: 1, background: 'var(--qs-ink)' }} />
      </div>
      <span className="qs-small" style={{ color: 'var(--qs-ink2)' }}>shown ≥ {level.toFixed(2)}</span>
    </div>
  )
}
