// Every setting that can sit on the view as a piece (the Parameters family) and be animated (Compose ·
// Animate): how to read it, its range, how to write it, how to show it.
import { useStore } from '../store'

type S = ReturnType<typeof useStore.getState>
export interface ParamDef {
  id: string
  t: string
  desc: string
  get: (s: S) => number | null
  set?: (v: number) => void
  min: (s: S) => number
  max: (s: S) => number
  /** Snap when animated (integers, steps). */
  step: number
  fmt: (v: number, s: S) => string
  /** Which step it belongs to, for the library's order and the animation menu. */
  group: 'voxels' | 'quantum' | 'evolve' | 'mesh' | 'view'
}

const st = () => useStore.getState()
const f2 = (v: number) => v.toFixed(2)

export const PARAMS: ParamDef[] = [
  { id: 'grid', t: 'Grid', desc: 'Cells a side of the voxel grid.', group: 'voxels', step: 1,
    get: (s) => s.vox.n, min: () => 16, max: () => 256, fmt: (v) => `${v}³` },
  { id: 'strength', t: 'Strength', desc: 'How far the lowest qubit turns: θ = strength · π.', group: 'quantum', step: 0.01,
    get: (s) => (s.q.mode === 'gaussian' || s.q.mode === 'nations' ? null : s.q.strength), set: (v) => st().setQ({ strength: v }), min: () => 0, max: () => 1, fmt: f2 },
  { id: 'reach', t: 'Reach', desc: 'How much of the turn the higher qubits keep.', group: 'quantum', step: 0.01,
    get: (s) => (s.q.mode === 'gaussian' || s.q.mode === 'nations' ? null : s.q.reach), set: (v) => st().setQ({ reach: v }), min: () => 0, max: () => 1, fmt: f2 },
  { id: 'sigma', t: 'Sigma', desc: 'The width of the Gaussian blur, in cells.', group: 'quantum', step: 0.1,
    get: (s) => (s.q.mode === 'gaussian' ? s.q.sigma : null), set: (v) => st().setQ({ sigma: v }), min: () => 0.3, max: () => 3, fmt: (v) => v.toFixed(1) },
  { id: 'turn', t: 'Turn', desc: 'The turn of the Evolve history on screen.', group: 'evolve', step: 1,
    get: (s) => (s.evolve.history ? s.evolve.turn : null), set: (v) => { st().setTurn(v) }, min: () => 0, max: (s) => s.evolve.turns || 60, fmt: (v, s) => `${Math.round(v)} / ${s.evolve.turns}` },
  { id: 'nations', t: 'Nations', desc: 'Regions the model splits into, one qubit each.', group: 'evolve', step: 1,
    get: (s) => (s.q.mode === 'nations' ? s.q.k : null), set: (v) => st().setQ({ k: v }), min: () => 3, max: () => 16, fmt: (v) => String(Math.round(v)) },
  { id: 'turns', t: 'Turns', desc: 'How long the history runs.', group: 'evolve', step: 5,
    get: (s) => (s.q.mode === 'nations' ? s.q.turns : null), set: (v) => st().setQ({ turns: v }), min: () => 5, max: () => 300, fmt: (v) => String(Math.round(v)) },
  { id: 'growth', t: 'Growth reach', desc: 'How far growth may reach past the surface.', group: 'evolve', step: 0.5,
    get: (s) => (s.q.mode === 'nations' ? s.q.spread : null), set: (v) => st().setQ({ spread: v }), min: () => 0, max: () => 8, fmt: (v) => `${v.toFixed(1)} %` },
  { id: 'level', t: 'Surface level', desc: 'Where the surface is cut: lower swells, higher erodes.', group: 'mesh', step: 0.01,
    get: (s) => s.m.level, set: (v) => st().setM({ level: v }), min: () => 0.05, max: () => 0.95, fmt: f2 },
  { id: 'smooth', t: 'Smoothing', desc: 'Passes of mesh smoothing.', group: 'mesh', step: 1,
    get: (s) => s.m.smooth, set: (v) => st().setM({ smooth: v }), min: () => 0, max: () => 30, fmt: (v) => `${Math.round(v)} passes` },
  { id: 'thicken', t: 'Thicken', desc: 'Grow or shrink the surface, in voxels.', group: 'mesh', step: 0.25,
    get: (s) => s.m.grow, set: (v) => st().setM({ grow: v }), min: () => -4, max: () => 4, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}` },
  { id: 'slice', t: 'Cutting plane', desc: 'The layer the plane cuts through.', group: 'view', step: 1,
    get: (s) => (s.grid ? s.slice.index : null), set: (v) => st().setSlice({ index: v }), min: () => 0, max: (s) => (s.grid?.n ?? 32) - 1, fmt: (v, s) => `${s.slice.axis} ${Math.round(v)}` },
  { id: 'film', t: 'Film thickness', desc: 'Entanglement shading: how thick the film is.', group: 'view', step: 0.05,
    get: (s) => s.shade.thickness, set: (v) => st().setShading(st().shading, { thickness: v }), min: () => 0.2, max: () => 2, fmt: f2 },
  { id: 'mix', t: 'Quantum colour', desc: 'Entanglement shading: how much colour the result gives.', group: 'view', step: 0.05,
    get: (s) => s.shade.mix, set: (v) => st().setShading(st().shading, { mix: v }), min: () => 0, max: () => 1, fmt: f2 },
]

export const paramOf = (id: string) => PARAMS.find((p) => p.id === id)
