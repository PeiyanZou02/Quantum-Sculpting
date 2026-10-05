// Whether a piece moves with the clock. Every piece reads the same run, so all of them can play with
// it; a piece set to hold still (Library · its motion switch) keeps showing what it showed when the
// clock took over (playing, or scrubbed away from the start) and drops its own easing and motion.
import { createContext, useContext, useState } from 'react'
import { usePresent } from '../present'
import type { HudModule } from './types'

export const MotionCtx = createContext(true)

/** True when this piece moves with the clock (the default). */
export const useMoves = () => useContext(MotionCtx)

/** True while this piece holds still: it doesn't move, and the clock is engaged. */
export function useHolding(): boolean {
  const moves = useContext(MotionCtx)
  const engaged = usePresent((p) => p.playing || p.t0 > 0)
  return !moves && engaged
}

/** `v` as the piece shows it: live, or what it was when the piece began holding. */
export function useHeld<T>(v: T): T {
  const hold = useHolding()
  const [held, setHeld] = useState<{ v: T } | null>(null)
  // taken as it begins holding, let go when it stops
  if (hold && !held) setHeld({ v })
  if (!hold && held) setHeld(null)
  return hold && held ? held.v : v
}

/** Pieces with something to animate: everything placed beside the object. Marks drawn on the object
 *  itself (frames, bounds, focus, callouts) follow it as it is, so they have no switch. */
export const animatable = (m: Pick<HudModule, 'family' | 'slot'>) =>
  m.slot !== 'object' && m.slot !== 'full' && m.family !== 'frame'
