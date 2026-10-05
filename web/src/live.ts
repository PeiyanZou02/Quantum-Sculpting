// What the viewport shares with panels outside it (the Present panel): the engine and the probe's pins.
// Stage writes these as it renders and calls `bump()` when pins change.
import { useSyncExternalStore } from 'react'
import type { Engine } from './view/engine'
import type { ProbeController } from './qs/useProbe'

export const live: {
  engine?: Engine
  probe?: ProbeController
  /** Pins notable cells (peak, top, widest layer, base, most changed) with their readouts. */
  autoAnnotate?: () => number
} = {}

let version = 0
const subs = new Set<() => void>()
export function bump() {
  version++
  subs.forEach((f) => f())
}
/** Re-renders when Stage bumps (pins changed). */
export function useLive() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version)
  return live
}
