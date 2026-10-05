// Centre: the volumetric workspace. Drag to orbit, scroll to zoom; the geometry is the only 3D thing.
import { useEffect, useRef, useState } from 'react'
import { useStore, type View } from '../store'
import { Engine, type LayerName } from '../view/engine'
import { QProbe, type ProbeHit } from '../qs/QProbe'
import { Segmented } from '../qs/Segmented'
import { QPill } from '../qs/QPill'
import { Spinner } from './parts'
import { MODEL_EXT } from './Sidebar'

const STATIONS = [
  { t: 'Front', az: 0, el: 0 }, { t: 'Side', az: 90, el: 0 }, { t: 'Top', az: 0, el: 89 }, { t: 'Iso', az: 35, el: 22 },
]

export function Stage() {
  const host = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [ang, setAng] = useState({ az: 35, el: 22 })
  const [over, setOver] = useState(false)
  const st = useStore()
  const { model, modelMesh, grid, gridData, procData, resultMesh, view, slice, m, proc } = st

  useEffect(() => {
    const e = new Engine(host.current!)
    e.onChange = () => setAng(e.angles())
    setEngine(e)
    return () => e.dispose()
  }, [])
  useEffect(() => { if (engine && grid) engine.setGrid(grid.n) }, [engine, grid])
  useEffect(() => {
    if (!engine || !modelMesh) return
    engine.setMesh('model', modelMesh, grid?.transform ?? Engine.placement(modelMesh, engine.n))
  }, [engine, modelMesh, grid])
  useEffect(() => { engine?.setVoxels('voxels', gridData, 0.5, false) }, [engine, gridData])
  useEffect(() => { engine?.setVoxels('processed', procData, m.level, true) }, [engine, procData, m.level])
  useEffect(() => { engine?.setMesh('result', resultMesh) }, [engine, resultMesh])
  useEffect(() => { engine?.show(view as LayerName) }, [engine, view, gridData, procData, resultMesh, modelMesh])
  useEffect(() => { engine?.setSlice(st.showSlice ? slice : null) }, [engine, slice, view, st.showSlice])

  const avail: Record<View, boolean> = { model: !!model, voxels: !!gridData, processed: !!procData, result: !!resultMesh }
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
    if (view === 'processed') return { x, y, z, lines: [cell, `input ${read(gridData).toFixed(2)} → ${read(procData).toFixed(2)}`] }
    const v = read(procData)
    return { x, y, z, lines: [cell, `${v.toFixed(2)} · ${v >= g.m.level ? 'kept' : 'removed'} at ${g.m.level.toFixed(2)}`] }
  }

  const foot = (() => {
    if (!model) return 'No model'
    if (view === 'model') return `${model.builtin ? 'test cup' : model.file} · ${model.faces.toLocaleString()} faces · ${model.extents.map((v) => v.toFixed(0)).join(' × ')} mm`
    if (view === 'voxels' && grid) return `${grid.n}³ grid · ${grid.solid.toLocaleString()} solid cells · ${grid.voxel_size} mm per cell`
    if (view === 'processed' && proc) return `${proc.mode === 'atlas' ? 'Atlas' : proc.mode === 'emulator' ? 'Emulation' : 'Gaussian'} result · shaded by value · cells ≥ ${m.level.toFixed(2)} shown`
    if (view === 'result' && st.report) return `${st.report.faces.toLocaleString()} faces · ${st.report.extents.join(' × ')} mm · ${st.report.watertight ? 'watertight' : 'not watertight'} · ${st.report.parts} part${st.report.parts > 1 ? 's' : ''}`
    return ''
  })()
  const busy = st.busy.model ? 'opening' : st.busy.vox ? 'voxelising' : st.busy.proc && st.q.mode !== 'atlas' ? 'processing' : st.busy.mesh ? 'meshing' : null

  return (
    <main className="stage">
      <div className="stage__bar">
        <Segmented<View>
          options={[
            { value: 'model', label: 'Model', disabled: !avail.model }, { value: 'voxels', label: 'Voxels', disabled: !avail.voxels },
            { value: 'processed', label: 'Processed', disabled: !avail.processed }, { value: 'result', label: 'Result', disabled: !avail.result },
          ]}
          value={view} onChange={st.setView}
        />
        <div className="row" style={{ gap: 6 }}>
          <span className="qs-mono" style={{ color: 'var(--qs-ink3)', marginRight: 6 }}>
            az {String(Math.round(ang.az)).padStart(3, '0')}° · el {Math.round(ang.el)}°
          </span>
          {STATIONS.map((s) => <QPill key={s.t} kind="hair" size="s" label={s.t} onClick={() => engine?.orbitTo(s.az, s.el)} />)}
          <QPill kind={st.showSlice ? 'active' : 'hair'} size="s" label="Slice plane" onClick={() => st.set({ showSlice: !st.showSlice })} />
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
        <ViewMarks />
        {!model && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
            <span style={{ font: '400 24px/1.1 var(--qs-sans)' }}>{over ? 'Release to open' : 'Start from a model'}</span>
            <span className="qs-cap">Choose a file or the test cup on the left, or drop {MODEL_EXT.join(' ')} here.</span>
          </div>
        )}
        {model && over && (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--qs-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '400 20px/1 var(--qs-sans)', pointerEvents: 'none' }}>
            Release to open
          </div>
        )}
        {model && engine && <QProbeSized pick={pick} n={grid?.n ?? 32} mm={grid?.voxel_size ?? 1} />}
      </div>

      <div className="stage__foot">
        {busy && <Spinner />}
        <span>{busy ? `${busy}…` : foot}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--qs-ink3)' }}>drag to orbit · right-drag to pan · scroll to zoom · click to pin</span>
      </div>
    </main>
  )
}

/** The probe needs pixel size; track the view box. */
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

/** 2D marks on the view: 18px corners and the centre crosshair. */
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
