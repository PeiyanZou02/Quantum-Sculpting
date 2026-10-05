// Plays the composition's animation on one clock (present.ts · clockOf): the story of the run (model,
// voxels, the quantum step or Evolve turn by turn, mesh), each value track, and the look cycling. Every
// piece on the view reads the same state (the turn, the step on screen, the values), so they move
// together; scrubbing the clock shows any moment of the pass. Values that make the service compute
// are written at most a few times a second.
import { useEffect } from 'react'
import { clockOf, usePresent, type Cycles, type Reel, type Track } from '../present'
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

export interface Segment { stage: Stage; t: string; start: number; dur: number; turns?: number }
/** The story's segments for the run on screen, in order, with when each starts. */
export function storySegments(reel: Reel): Segment[] {
  if (!reel.on) return []
  const s = useStore.getState()
  const evolve = s.q.mode === 'nations', h = s.evolve.history
  const list: Omit<Segment, 'start'>[] = []
  if (reel.segs.model) list.push({ stage: 'model', t: 'Model', dur: reel.sec })
  if (reel.segs.voxels) list.push({ stage: 'voxels', t: 'Voxels', dur: reel.sec })
  if (reel.segs.quantum) {
    if (evolve && h) list.push({ stage: 'evolve', t: 'Evolve', dur: s.evolve.turns / Math.max(0.5, reel.tps), turns: s.evolve.turns })
    else list.push({ stage: evolve ? 'evolve' : 'quantum', t: evolve ? 'Evolve' : 'Quantum', dur: reel.sec })
  }
  if (reel.segs.mesh) list.push({ stage: 'mesh', t: 'Mesh', dur: reel.sec })
  let at = 0
  return list.map((x) => { const seg = { ...x, start: at }; at += x.dur; return seg })
}

/** Seconds for one pass: the longest track (there and back for a bounce), the story, one turn of each
 *  look cycle. */
export function passLength(tracks: Track[], reel: Reel, cycles: Cycles): number {
  const tr = tracks.map((t) => t.sec * (t.mode === 'bounce' ? 2 : 1))
  const st = storySegments(reel).reduce((a, x) => a + x.dur, 0)
  const cy = cycles.sec * Math.max(cycles.shading ? SHADINGS.length : 0, cycles.light ? LIGHTS.length : 0, cycles.backdrop ? BACKDROPS.length : 0)
  return Math.max(0, ...tr, st, cy)
}

/** Records one pass: rewinds, starts the recording, plays once from the start, stops both at the end. */
export async function recordPass() {
  const p = usePresent.getState()
  const len = passLength(p.tracks, p.stageReel, p.cycles)
  if (!len) return
  if (!isRecording()) await toggleRecording()
  if (!isRecording()) return   // the browser's capture was refused
  const loop = p.loop
  usePresent.setState({ loop: false })
  usePresent.getState().seek(0)
  usePresent.getState().setPlaying(true)
  setTimeout(() => {
    usePresent.getState().setPlaying(false)
    usePresent.setState({ loop })
    if (isRecording()) toggleRecording()
  }, (len / Math.max(0.1, p.speed)) * 1000 + 300)
}

/** Mounted once, by the view. */
export function useAnimator() {
  const playing = usePresent((p) => p.playing)
  const seekKey = usePresent((p) => p.seekKey)
  useEffect(() => {
    const last = new Map<string, { v: number; at: number }>()
    let stage = '', turn = -1, shade = -1, light = -1, back = -1, raf = 0
    // the state of everything at clock time t
    const apply = (t: number) => {
      const p = usePresent.getState(), st = useStore.getState(), now = Date.now()
      for (const tr of p.tracks) {
        const def = paramOf(tr.param)
        if (!def?.set || def.get(st) == null) continue
        const v = Math.round(trackAt(tr, t) / def.step) * def.step
        const prev = last.get(tr.id)
        if (prev && Math.abs(prev.v - v) < def.step / 2) continue
        if (prev && HEAVY.has(tr.param) && now - prev.at < HEAVY_MS && p.playing) continue
        last.set(tr.id, { v, at: now })
        def.set(+v.toFixed(4))
      }
      const segs = storySegments(p.stageReel)
      if (segs.length) {
        const seg = segs.find((x) => t < x.start + x.dur) ?? segs[segs.length - 1]
        if (seg.stage !== stage) { stage = seg.stage; turn = -1; st.pause(); st.setFocus(seg.stage, `Story · ${seg.t}`) }
        if (seg.turns != null) {
          // Evolve: the turn follows the clock, so scrubbing goes back and forth through the history
          const k = Math.max(0, Math.min(seg.turns, Math.floor((t - seg.start) * p.stageReel.tps)))
          if (k !== turn) { turn = k; st.setTurn(k) }
        }
      }
      const c = p.cycles, k = Math.floor(t / Math.max(0.5, c.sec))
      if (c.shading && k % SHADINGS.length !== shade) { shade = k % SHADINGS.length; st.setShading(SHADINGS[shade]) }
      if (c.light && k % LIGHTS.length !== light) { light = k % LIGHTS.length; st.setShading(useStore.getState().shading, { light: LIGHTS[light] }) }
      if (c.backdrop && k % BACKDROPS.length !== back) { back = k % BACKDROPS.length; st.setShading(useStore.getState().shading, { backdrop: BACKDROPS[back] }) }
    }
    const p0 = usePresent.getState()
    if (!playing) {
      // paused: show the moment the clock is at (after a seek)
      if (seekKey) apply(p0.t0)
      return
    }
    const tick = () => {
      const p = usePresent.getState()
      const len = passLength(p.tracks, p.stageReel, p.cycles)
      let t = clockOf(p, Date.now())
      if (len && t >= len) {
        if (p.loop) { t %= len; usePresent.setState({ t0: t, playFrom: Date.now() }) }
        else { apply(len - 0.001); usePresent.setState({ playing: false, t0: len }); return }
      }
      apply(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, seekKey])
}
