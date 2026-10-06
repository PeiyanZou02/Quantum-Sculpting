// Plays the composition's animation on one clock (present.ts · clockOf): the loop through the run (model,
// voxels, Evolve turn by turn or the quantum result, mesh), each step growing up out of the last through
// a rising plane (or fading in), the cutting plane sweeping with it, and the look cycling. Every piece on the view reads the same state (the turn, the step on
// screen, the slice), so they move together; scrubbing the clock shows any moment of the pass.
import { useEffect } from 'react'
import { clockOf, usePresent, type Cycles, type Reel, type SplitLayer } from '../present'
import { useStore, type Shading, type Stage } from '../store'
import { isRecording, toggleRecording } from './capture'

const SHADINGS: Shading[] = ['solid', 'value', 'wire', 'entangle']
const LIGHTS = ['studio', 'soft', 'rim', 'flat'] as const
const BACKDROPS = ['plain', 'dots', 'lines', 'gradient', 'studio'] as const

/** One step of the loop: when it starts and how long it holds; `wipe` seconds at its start it grows up
 *  through the plane out of the step before; Evolve plays `turns` after that. */
export interface Segment { stage: Stage; t: string; start: number; dur: number; turns?: number; wipe?: number }

/** The layer of the view a step shows. */
export const layerOf = (st: Stage): SplitLayer => (st === 'model' ? 'model' : st === 'voxels' ? 'voxels' : st === 'mesh' ? 'result' : 'processed')
/** Whether a layer has something to draw yet. */
function drawn(l: SplitLayer): boolean {
  const s = useStore.getState()
  return l === 'model' ? !!s.modelMesh : l === 'voxels' ? !!s.gridData : l === 'processed' ? !!s.procData : !!s.resultMesh
}

/** Seconds of one full cutting-plane cycle (there and back when it bounces). */
const planeCycle = (r: Reel) => r.planeSec * (r.planeMode === 'bounce' ? 2 : 1)

/** The loop's segments for the run on screen, in order, with when each starts. */
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
  // with the plane running during the mesh, the mesh holds at least one full sweep
  if (reel.segs.mesh) list.push({ stage: 'mesh', t: 'Mesh', dur: reel.plane === 'mesh' ? Math.max(reel.sec, planeCycle(reel)) : reel.sec })
  // each step grows up out of the one before it (the first out of the last, when the loop goes round)
  const wipe = Math.min(3, Math.max(1.2, reel.sec * 0.6))
  list.forEach((x, i) => {
    const prev = list[i - 1] ?? (usePresent.getState().loop && list.length > 1 ? list[list.length - 1] : null)
    if (reel.blend !== 'wipe' || !prev || layerOf(prev.stage) === layerOf(x.stage) || !drawn(layerOf(prev.stage)) || !drawn(layerOf(x.stage))) return
    x.wipe = wipe
    if (x.turns != null) x.dur += wipe   // Evolve's turns play once it has risen
  })
  let at = 0
  return list.map((x) => { const seg = { ...x, start: at }; at += x.dur; return seg })
}

/** Where the plane is `u` seconds into its sweep, 0..1 of its range. */
function sweepAt(r: Reel, u: number): number {
  const f = Math.max(0, u) / Math.max(0.5, r.planeSec)
  if (r.planeMode === 'up') return f % 1
  if (r.planeMode === 'down') return 1 - (f % 1)
  const b = f % 2
  return b > 1 ? 2 - b : b
}

/** Seconds for one pass: the loop, one turn of each look cycle, and the plane's own cycle when it runs
 *  through the whole loop. */
export function passLength(reel: Reel, cycles: Cycles): number {
  const st = storySegments(reel).reduce((a, x) => a + x.dur, 0)
  const cy = cycles.sec * Math.max(cycles.shading ? SHADINGS.length : 0, cycles.light ? LIGHTS.length : 0, cycles.backdrop ? BACKDROPS.length : 0)
  const pl = reel.on && reel.plane === 'loop' && !st ? planeCycle(reel) : 0
  return Math.max(0, st, cy, pl)
}

/** Records one pass: rewinds, starts the recording, plays once from the start, stops both at the end. */
export async function recordPass() {
  const p = usePresent.getState()
  const len = passLength(p.stageReel, p.cycles)
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
    let stage = '', turn = -1, plane = -1, shade = -1, light = -1, back = -1, raf = 0
    const setPlane = (live: boolean) => { if (usePresent.getState().planeLive !== live) usePresent.setState({ planeLive: live }) }
    const setWipe = (w: { below: SplitLayer; above: SplitLayer } | null) => {
      const now = usePresent.getState().wipe
      if (now?.below !== w?.below || now?.above !== w?.above) usePresent.setState({ wipe: w })
    }
    // the state of everything at clock time t
    const apply = (t: number) => {
      const p = usePresent.getState(), st = useStore.getState(), r = p.stageReel
      const n = st.grid?.n ?? 0
      const lo = Math.round(Math.min(r.from, r.to) * (n - 1)), hi = Math.round(Math.max(r.from, r.to) * (n - 1))
      const putPlane = (f: number, axis?: 'z') => {
        const k = Math.round(lo + f * (hi - lo)), turn = axis && useStore.getState().slice.axis !== axis
        if (k !== plane || turn) { plane = k; useStore.getState().setSlice(turn ? { axis, index: k } : { index: k }) }
      }
      const segs = storySegments(r)
      let planeLive = false, wipe: { below: SplitLayer; above: SplitLayer } | null = null
      if (segs.length) {
        const seg = segs.find((x) => t < x.start + x.dur) ?? segs[segs.length - 1]
        const prev = segs[segs.indexOf(seg) - 1] ?? segs[segs.length - 1]
        if (seg.stage !== stage) {
          stage = seg.stage
          st.pause()
          // the turn the step shows: Evolve starts from the founding, the mesh shows the end of the history
          if (seg.turns != null) { turn = 0; st.setTurn(0) }
          if (seg.stage === 'mesh' && st.evolve.history) { turn = st.evolve.turns; st.setTurn(st.evolve.turns) }
          st.setFocus(seg.stage, `Loop · ${seg.t}`)
        }
        const u = t - seg.start, rising = !!seg.wipe && u < seg.wipe
        if (seg.turns != null) {
          // Evolve: the turn follows the clock, so scrubbing goes back and forth through the history
          const k = Math.max(0, Math.min(seg.turns, Math.floor((u - (seg.wipe ?? 0)) * r.tps)))
          if (k !== turn) { turn = k; st.setTurn(k) }
        }
        if (rising) wipe = { below: layerOf(seg.stage), above: layerOf(prev.stage) }
        if (n) {
          // a wipe owns the plane while the step rises; otherwise it sweeps as set
          if (rising) { planeLive = true; putPlane(u / seg.wipe!, 'z') }
          else if (r.plane === 'loop') { planeLive = true; putPlane(sweepAt(r, t)) }
          else if (r.plane === 'mesh' && seg.stage === 'mesh') { planeLive = true; putPlane(sweepAt(r, u)) }
        }
      } else if (r.on && r.plane === 'loop' && n) { planeLive = true; putPlane(sweepAt(r, t)) }
      setPlane(planeLive)
      setWipe(wipe)
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
      const len = passLength(p.stageReel, p.cycles)
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
