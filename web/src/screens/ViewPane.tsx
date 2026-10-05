// The view: 1056 × 720 at (432, 112). three.js underneath, marks, probe and gimbal on top.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useStore, HOME_CAM, type View } from '../store'
import { Engine, type LayerName } from '../view/engine'
import { QCam } from '../qs/QCam'
import { QProbe, type ProbeHit } from '../qs/QProbe'
import { Corners, Dot, Spinner } from './parts'
import { StartView } from './StartView'
import { JobStrip } from './JobStrip'

const VX = 432, VY = 112, VW = 1056, VH = 720
const VIEWS: { v: View; t: string }[] = [
  { v: 'model', t: 'Model' }, { v: 'voxels', t: 'Voxels' }, { v: 'processed', t: 'Processed' }, { v: 'result', t: 'Result' },
]

export function ViewPane() {
  const host = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const st = useStore()
  const { model, modelMesh, grid, gridData, procData, resultMesh, view, camera, slice, step, m, job, proc } = st
  const [, force] = useState(0)

  useEffect(() => {
    const e = new Engine(host.current!)
    setEngine(e)
    return () => e.dispose()
  }, [])

  useEffect(() => { engine?.setCamera(camera); force((x) => x + 1) }, [engine, camera])
  useEffect(() => { if (engine && grid) engine.setGrid(grid.n) }, [engine, grid])
  useEffect(() => {
    if (!engine || !modelMesh) return
    engine.setMesh('model', modelMesh, grid?.transform ?? Engine.placement(modelMesh, engine.n))
  }, [engine, modelMesh, grid])
  useEffect(() => { engine?.setVoxels('voxels', gridData, 0.5, false) }, [engine, gridData])
  useEffect(() => { engine?.setVoxels('processed', procData, step >= 3 ? m.level : 0.5, true) }, [engine, procData, step, m.level])
  useEffect(() => { engine?.setMesh('result', resultMesh) }, [engine, resultMesh])
  useEffect(() => { engine?.show(view as LayerName) }, [engine, view, gridData, procData, resultMesh, modelMesh])
  useEffect(() => { engine?.setSlice(step === 1 || step === 2 ? slice : null) }, [engine, slice, step, view])

  const avail = model ? (proc ? (st.resultMesh ? 4 : 3) : grid ? 2 : 1) : 0
  const mmPerCell = grid?.voxel_size ?? 1
  const n = grid?.n ?? engine?.n ?? 32

  const pick = (px: number, py: number): ProbeHit | null => {
    const hit = engine?.pick(px, py)
    if (!hit) return null
    const [x, y, z] = hit.cell
    const g = useStore.getState()
    const cell = `x ${x} · y ${y} · z ${z}`
    const read = (gr: typeof gridData) => (gr ? gr.data[(x * gr.n + y) * gr.n + z] : 0)
    if (g.step <= 0 || view === 'model') {
      const p = hit.point
      const t = g.grid?.transform
      const s = t ? t[0][0] : 1
      const mm = (v: number, o: number) => ((v - o) / s).toFixed(1)
      return { x, y, z, lines: [t ? `${mm(p.x, t[0][3])} · ${mm(p.y, t[1][3])} · ${mm(p.z, t[2][3])} mm` : cell, 'on the surface'] }
    }
    if (view === 'voxels') return { x, y, z, lines: [cell, `coverage ${read(gridData).toFixed(2)}`] }
    if (view === 'processed') return { x, y, z, lines: [cell, `${read(gridData).toFixed(2)} → ${read(procData).toFixed(2)}`] }
    const v = read(procData)
    return { x, y, z, lines: [cell, `${v.toFixed(2)} · ${v >= g.m.level ? 'kept' : 'removed'} at ${g.m.level.toFixed(2)}`] }
  }

  return (
    <>
      <div
        ref={host}
        style={{ position: 'absolute', left: VX, top: VY, width: VW, height: VH, overflow: 'hidden' }}
      >
        {!model && <StartView />}
        {model && engine && (
          <QProbe w={VW} h={VH} n={n} pick={pick} mmPerCell={mmPerCell} enabled={!!model} />
        )}
        {model && engine && step === 0 && <SizeMarks engine={engine} />}
      </div>

      <div style={{ position: 'absolute', left: VX, top: VY, width: VW, height: VH, pointerEvents: 'none' }}>
        <Corners w={VW} h={VH} />
        <span style={{
          position: 'absolute', left: VW / 2 - 11, top: VH / 2 - 11, width: 22, height: 22,
          background: 'linear-gradient(var(--qs-ink3),var(--qs-ink3)) center/1px 100% no-repeat,linear-gradient(var(--qs-ink3),var(--qs-ink3)) center/100% 1px no-repeat',
        }} />
      </div>

      {/* status line / job strip across the top of the view */}
      {step === 2 && job?.status === 'running' ? <JobStrip /> : step === 2 && proc && <LiveLine />}
      {step === 3 && m.method === 'advect' && st.meshTab !== 'export' && (
        <div className="qs-mono" style={{ position: 'absolute', left: 472, top: 134, color: 'var(--qs-ink2)' }}>
          Surface speed = {m.field === 'threshold' ? 'result − level' : m.field === 'difference' ? 'result − input' : 'density gradient'}, along the normal
        </div>
      )}

      {/* view switch */}
      <div style={{ position: 'absolute', right: 448, top: 128, display: 'inline-flex', padding: 2, borderRadius: 999, border: '1px solid var(--qs-ctl)' }}>
        {VIEWS.map(({ v, t }, i) => {
          const on = v === view && avail > 0, can = i < avail
          return (
            <button
              key={v}
              disabled={!can}
              onClick={() => st.setView(v)}
              style={{
                all: 'unset', display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 11px', borderRadius: 999, boxSizing: 'border-box',
                border: `1px solid ${on ? 'var(--qs-ink)' : 'transparent'}`, background: on ? 'var(--qs-sel)' : 'transparent',
                color: on ? 'var(--qs-ink)' : can ? 'var(--qs-ink2)' : 'var(--qs-ink4)', font: '400 11px/1 var(--qs-mono)',
                cursor: can && !on ? 'pointer' : 'default', transition: 'all 150ms',
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      {model && (
        <div style={{ position: 'absolute', left: 452, top: 648 }}>
          <QCam value={camera} onChange={st.setCamera} home={HOME_CAM} />
        </div>
      )}

      {(st.busy.mesh || st.busy.vox || (st.busy.proc && st.q.mode !== 'atlas')) && (
        <div className="qs-mono" style={{ position: 'absolute', left: 1470 - 140, top: 806, width: 140, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, color: 'var(--qs-ink2)' }}>
          <Spinner /> {st.busy.vox ? 'voxelising' : st.busy.proc ? 'processing' : 'meshing'}
        </div>
      )}
    </>
  )
}

function LiveLine() {
  const proc = useStore((s) => s.proc)!
  const [now, setNow] = useState(Date.now())
  const [stamp, setStamp] = useState(Date.now())
  useEffect(() => setStamp(Date.now()), [proc.proc_id])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const label = { gaussian: 'Gaussian stand-in', emulator: 'Emulation', atlas: 'Atlas' }[proc.mode]
  const ago = Math.max(0, (now - stamp) / 1000)
  return (
    <div className="qs-mono" style={{ position: 'absolute', left: 472, top: 134, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Dot live />
      {label} · {proc.mode === 'atlas' ? (proc.cached ? 'cached' : 'done') : 'live'} · {proc.seconds != null ? `${proc.seconds}s · ` : ''}updated {ago < 60 ? `${ago.toFixed(1)} s` : `${Math.round(ago / 60)} min`} ago
    </div>
  )
}

/** 01 Model: width and height measures around the model's projected bounds. */
function SizeMarks({ engine }: { engine: Engine }) {
  const model = useStore((s) => s.model)!
  const modelMesh = useStore((s) => s.modelMesh)
  const camera = useStore((s) => s.camera)
  const grid = useStore((s) => s.grid)
  const box = useMemo(() => {
    if (!modelMesh) return null
    const t = grid?.transform ?? Engine.placement(modelMesh, engine.n)
    const mtx = new THREE.Matrix4().set(...(t.flat() as Parameters<THREE.Matrix4['set']>))
    const b = new THREE.Box3()
    const v = new THREE.Vector3()
    for (let i = 0; i < modelMesh.vertices.length; i += 3) b.expandByPoint(v.fromArray(modelMesh.vertices, i).applyMatrix4(mtx))
    const pts: [number, number][] = []
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(engine.project(new THREE.Vector3(x, y, z)))
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) }
    // camera changes move the projection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelMesh, grid, engine, camera])
  if (!box) return null
  const [ex, , ez] = model.extents
  const top = Math.max(40, box.t - 34), right = Math.min(1040, box.r + 30)
  const line = { position: 'absolute', background: 'var(--qs-ink)', pointerEvents: 'none' } as const
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ ...line, left: box.l, top, width: box.r - box.l, height: 1 }} />
      <div style={{ ...line, left: box.l, top: top - 7, width: 1, height: 15 }} />
      <div style={{ ...line, left: box.r - 1, top: top - 7, width: 1, height: 15 }} />
      <span className="qs-mono" style={{ position: 'absolute', left: (box.l + box.r) / 2, top: top - 6, transform: 'translateX(-50%)', padding: '0 8px', background: 'var(--qs-bg)' }}>{ex.toFixed(0)} mm</span>
      <div style={{ ...line, left: right, top: box.t, width: 1, height: box.b - box.t }} />
      <div style={{ ...line, left: right - 7, top: box.t, width: 15, height: 1 }} />
      <div style={{ ...line, left: right - 7, top: box.b - 1, width: 15, height: 1 }} />
      <span className="qs-mono" style={{ position: 'absolute', left: right + 14, top: (box.t + box.b) / 2 - 5 }}>{ez.toFixed(0)} mm</span>
    </div>
  )
}
