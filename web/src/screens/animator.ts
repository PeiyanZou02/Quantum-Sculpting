// Plays the composition's animation: each track's value at the time since Play, the look cycling, and
// the stage reel. Values that make the service compute (strength, reach, the level's mesh) are written
// at most a few times a second; the rest every frame they change.
import { useEffect } from 'react'
import { usePresent, type Cycles, type Reel, type Track } from '../present'
import { useStore, type Shading, type Stage } from '../store'
import { paramOf } from '../hud/paramDefs'
import { isRecording, toggleRecording } from './capture'

const SHADINGS: Shading[] = ['solid', 'value', 'wire', 'entangle']
const LIGHTS = ['studio', 'soft', 'rim', 'flat'] as const
const BACKDROPS = ['plain', 'dots', 'lines', 'gradient', 'studio'] as const
/** Params whose every change asks the service for work: written at most this often. */
const HEAVY = new Set(['strength', 'reach', 'sigma', 'nations', 'turns', 'growth', 'smooth', 'thicken', 'grid'])
const HEAVY_MS = 400

/** A track's value `t` seconds in. */
export function trackAt(tr: Track, t: number): number {
  const k = tr.keys
  if (k.length < 2) return k[0] ?? 0
  const len = Math.max(0.1, tr.sec)
  let f = t / len
  if (tr.mode === 'once') f = Math.min(1, f)
  else if (tr.mode === 'loop') f = f % 1
  else { f = f % 2; if (f > 1) f = 2 - f }
  const x = f * (k.length - 1), i = Math.min(k.length - 2, Math.floor(x))
  // ease in and out between keys, so values settle on each keyframe for a moment
  const u = x - i, e = u * u * (3 - 2 * u)
  return k[i] + (k[i + 1] - k[i]) * e
}

/** The stages the reel walks through, in order. */
export const reelStages = (): Stage[] => ['model', 'voxels', useStore.getState().q.mode === 'nations' ? 'evolve' : 'quantum', 'mesh']

/** Seconds for one pass of everything that is set to play: the longest track (there and back for a
 *  bounce), the stage reel, and one turn of each look cycle. */
export function passLength(tracks: Track[], reel: Reel, cycles: Cycles): number {
  const tr = tracks.map((t) => t.sec * (t.mode === 'bounce' ? 2 : 1))
  const rl = reel.on ? reel.sec * reelStages().length : 0
  const cy = cycles.sec * Math.max(cycles.shading ? SHADINGS.length : 0, cycles.light ? LIGHTS.length : 0, cycles.backdrop ? BACKDROPS.length : 0)
  return Math.max(0, ...tr, rl, cy)
}

/** Records one pass: starts the recording, plays from the start, stops both at the end. */
export async function recordPass() {
  const p = usePresent.getState()
  const len = passLength(p.tracks, p.stageReel, p.cycles)
  if (!len) return
  if (!isRecording()) await toggleRecording()
  if (!isRecording()) return   // the browser's capture was refused
  usePresent.getState().setPlaying(true)
  setTimeout(() => {
    usePresent.getState().setPlaying(false)
    if (isRecording()) toggleRecording()
  }, len * 1000 + 300)
}

/** Mounted once, by the view. */
export function useAnimator() {
  const playing = usePresent((p) => p.playing)
  const from = usePresent((p) => p.playFrom)
  useEffect(() => {
    if (!playing) return
    const last = new Map<string, { v: number; at: number }>()
    let stage = -1, shade = -1, light = -1, back = -1, raf = 0
    const tick = () => {
      const p = usePresent.getState(), st = useStore.getState()
      const t = (Date.now() - from) / 1000, now = Date.now()
      for (const tr of p.tracks) {
        const def = paramOf(tr.param)
        if (!def?.set || def.get(st) == null) continue
        const v = Math.round(trackAt(tr, t) / def.step) * def.step
        const prev = last.get(tr.id)
        if (prev && Math.abs(prev.v - v) < def.step / 2) continue
        if (prev && HEAVY.has(tr.param) && now - prev.at < HEAVY_MS) continue
        last.set(tr.id, { v, at: now })
        def.set(+v.toFixed(4))
      }
      const { cycles: c, stageReel: r } = p
      if (r.on) {
        const list = reelStages(), i = Math.floor(t / Math.max(0.5, r.sec)) % list.length
        if (i !== stage) {
          stage = i
          st.setFocus(list[i], `Reel · ${list[i]}`)
          // Evolve plays its history while it is on screen
          if (list[i] === 'evolve' && st.evolve.history) { st.setTurn(0); setTimeout(() => useStore.getState().play(), 60) }
        }
      }
      const k = Math.floor(t / Math.max(0.5, c.sec))
      if (c.shading && k % SHADINGS.length !== shade) { shade = k % SHADINGS.length; st.setShading(SHADINGS[shade]) }
      if (c.light && k % LIGHTS.length !== light) { light = k % LIGHTS.length; st.setShading(useStore.getState().shading, { light: LIGHTS[light] }) }
      if (c.backdrop && k % BACKDROPS.length !== back) { back = k % BACKDROPS.length; st.setShading(useStore.getState().shading, { backdrop: BACKDROPS[back] }) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, from])
}
