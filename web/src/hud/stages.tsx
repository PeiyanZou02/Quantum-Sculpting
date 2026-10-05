// The four stages side by side, each rendered live from the same camera: the original mesh, the
// input voxels, the quantum result and the surface. Refreshes shortly after the camera settles
// or the data changes, so it costs nothing while you orbit.
import { useEffect, useRef, useState } from 'react'
import type { HudCtx, HudModule } from './types'
import './cards.css'

type L = 'model' | 'voxels' | 'processed' | 'result'
const ALL: { id: L; n: string; t: string }[] = [
  { id: 'model', n: '01', t: 'Model' }, { id: 'voxels', n: '02', t: 'Voxels' },
  { id: 'processed', n: '03', t: 'Quantum' }, { id: 'result', n: '04', t: 'Mesh' },
]

function Stages({ ctx, which, w, h, dir }: { ctx: HudCtx; which: L[]; w: number; h: number; dir: 'row' | 'column' }) {
  const [imgs, setImgs] = useState<Partial<Record<string, string>>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const key = `${ctx.tick}|${ctx.grid?.grid_id}|${ctx.proc?.proc_id}|${ctx.report?.faces}|${ctx.model?.model_id}|${ctx.level}`
  useEffect(() => {
    if (!ctx.thumbs) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setImgs(ctx.thumbs!(which, w, h)), 260)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const items = ALL.filter((a) => which.includes(a.id))
  return (
    <div className={'hud-stages hud-stages--' + dir}>
      {items.map((a, i) => (
        <div key={a.id} className={'hud-stage' + (ctx.view === a.id || (ctx.view === 'scan' && a.id === 'processed') ? ' hud-stage--on' : '')}>
          <div className="hud-stage__img" style={{ width: w, height: h }}>
            {imgs[a.id] ? <img src={imgs[a.id]} width={w} height={h} alt={a.t} /> : <span className="hud-stage__empty">not computed</span>}
          </div>
          <div className="hud-stage__cap"><span className="hud-stage__n">{a.n}</span><span>{a.t}</span></div>
          {dir === 'row' && i < items.length - 1 && <span className="hud-stage__arrow">→</span>}
        </div>
      ))}
    </div>
  )
}

export const STAGES_MODULES: HudModule[] = [
  { family: 'stages', id: 'v1', label: 'four stages', desc: 'Model, voxels, quantum and mesh in a row', slot: 'bottom', render: (c) => <Stages ctx={c} which={['model', 'voxels', 'processed', 'result']} w={132} h={96} dir="row" /> },
  { family: 'stages', id: 'v2', label: 'column', desc: 'The four stages down the side', slot: 'left', render: (c) => <Stages ctx={c} which={['model', 'voxels', 'processed', 'result']} w={120} h={86} dir="column" /> },
  { family: 'stages', id: 'v3', label: 'before / after', desc: 'The original mesh beside the sculpted surface', slot: 'bottom', render: (c) => <Stages ctx={c} which={['model', 'result']} w={180} h={130} dir="row" /> },
  { family: 'stages', id: 'v4', label: 'input / quantum', desc: 'The voxel grid beside the quantum result', slot: 'bottom', render: (c) => <Stages ctx={c} which={['voxels', 'processed']} w={180} h={130} dir="row" /> },
]
