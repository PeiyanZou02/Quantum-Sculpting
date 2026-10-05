// A shared clock, so components read the time from a store instead of calling Date.now() while rendering.
import { useCallback, useSyncExternalStore } from 'react'

interface Clock { ms: number; now: number; subs: Set<() => void>; iv: ReturnType<typeof setInterval> | null }
const clocks = new Map<number, Clock>()
const clockOf = (ms: number) => {
  let c = clocks.get(ms)
  if (!c) clocks.set(ms, (c = { ms, now: Date.now(), subs: new Set(), iv: null }))
  return c
}

function subscribe(c: Clock, cb: () => void) {
  c.subs.add(cb)
  c.iv ??= setInterval(() => { c.now = Date.now(); c.subs.forEach((f) => f()) }, c.ms)
  return () => {
    c.subs.delete(cb)
    if (!c.subs.size && c.iv) { clearInterval(c.iv); c.iv = null }
  }
}

/** A clock that is not running yet is re-read once it is a tick old, so turning one on never starts stale. */
function read(c: Clock, on: boolean) {
  if (on && !c.iv && Date.now() - c.now >= c.ms) c.now = Date.now()
  return c.now
}

/** The time now, re-read every `ms` while `on` (and fresh the moment it turns on); off, the last reading. */
export function useNow(on = true, ms = 1000): number {
  const c = clockOf(ms)
  const sub = useCallback((cb: () => void) => (on ? subscribe(c, cb) : () => {}), [c, on])
  return useSyncExternalStore(sub, () => read(c, on))
}
