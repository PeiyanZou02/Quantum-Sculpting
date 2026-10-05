// A piece on the view with its motion switch applied: holding still, it reads the view as it was when
// it began holding, and its own transitions and keyframes stop.
import type { ReactNode } from 'react'
import { usePresent } from '../present'
import { MotionCtx, useHeld } from './motion'
import type { HudCtx } from './types'

export function Moving({ k, ctx, render }: { k: string; ctx: HudCtx; render: (ctx: HudCtx) => ReactNode }) {
  const moves = usePresent((p) => !p.still[k])
  return (
    <MotionCtx.Provider value={moves}>
      {moves ? <Held ctx={ctx} render={render} /> : <div className="hud-still"><Held ctx={ctx} render={render} /></div>}
    </MotionCtx.Provider>
  )
}

function Held({ ctx, render }: { ctx: HudCtx; render: (ctx: HudCtx) => ReactNode }) {
  const c = useHeld(ctx)
  return <>{render(c)}</>
}
