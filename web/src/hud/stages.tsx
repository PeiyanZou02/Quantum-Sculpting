// The four stages side by side, each rendered live from the same camera: the original mesh, the
// input voxels, the quantum result and the surface. Refreshes shortly after the camera settles
// or the data changes, so it costs nothing while you orbit.
import { useEffect, useEffectEvent, useState } from 'react'
import type { HudCtx } from './types'
import './cards.css'

type L = 'model' | 'voxels' | 'processed' | 'result'
const ALL: { id: L; n: string; t: string }[] = [
  { id: 'model', n: '01', t: 'Model' }, { id: 'voxels', n: '02', t: 'Voxels' },
  { id: 'processed', n: '03', t: 'Quantum' }, { id: 'result', n: '04', t: 'Mesh' },
]

export function Stages({ ctx, which, w, h, dir }: { ctx: HudCtx; which: L[]; w: number; h: number; dir: 'row' | 'column' }) {
  const [imgs, setImgs] = useState<Partial<Record<string, string>>>({})
  const key = `${ctx.tick}|${ctx.grid?.grid_id}|${ctx.proc?.proc_id}|${ctx.report?.faces}|${ctx.model?.model_id}|${ctx.level}`
  // reads the latest ctx when it fires; only `key` (camera or data) restarts the wait
  const refresh = useEffectEvent(() => { if (ctx.thumbs) setImgs(ctx.thumbs(which, w, h)) })
  useEffect(() => {
    const t = setTimeout(refresh, 260)
    return () => clearTimeout(t)
  }, [key])
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
