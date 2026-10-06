// Presets in motion: a whole composition at once, the pieces on the view and how it plays. Each turns
// every piece's motion on, sets the loop (which steps, how they give way to each other, how fast), the
// cutting plane, the split, what the slice shows, and starts playing.
import type { Reel, Split } from '../present'
import type { SliceColor, SliceOf } from '../qs/sectionColor'

export interface MotionPreset {
  id: string; title: string; desc: string
  /** The pieces: Lab's own layout, a category preset's (by id), or a set of its own for the engine. */
  pieces: { default: true } | { curated: string } | { own: (mode: string) => Record<string, string> }
  reel: Partial<Omit<Reel, 'segs'>> & { segs?: Partial<Reel['segs']> }
  split?: Partial<Split>
  slice?: { of: SliceOf; color: SliceColor }
  speed?: number
  /** Turntable speed in degrees a second; off when left out. */
  spin?: number
}

export const MOTION_PRESETS: MotionPreset[] = [
  {
    id: 'default-motion', title: 'Default, in motion',
    desc: 'Lab’s layout, every piece moving: the sphere to the mesh, each step growing through the plane.',
    pieces: { default: true },
    reel: { blend: 'wipe', plane: 'loop', planeSec: 8, planeMode: 'bounce' },
  },
  {
    id: 'grow', title: 'Growth',
    desc: 'The form alone as it changes: model, voxels, result, mesh, slowly, the view turning.',
    pieces: { own: () => ({ frame: 'v3', meta: 'v5', steps: 'v2', cards: 'v4', stages: 'v1' }) },
    reel: { sec: 5, tps: 4, blend: 'wipe', plane: 'off' },
    spin: 6,
  },
  {
    id: 'nations-film', title: 'Nations, turn by turn',
    desc: 'Evolve alone: the roster, territory, chronicle and relations play every turn of the history.',
    pieces: { curated: 'evolve' },
    reel: { segs: { model: false, voxels: false, quantum: true, mesh: false }, tps: 5, blend: 'off', plane: 'loop', planeSec: 10, planeMode: 'bounce' },
    slice: { of: 'result', color: 'nations' },
  },
  {
    id: 'cut-through', title: 'Cut through',
    desc: 'The plane divides the object, voxels under it and the result over it; the section in diffusion.',
    pieces: { own: (mode) => ({ frame: 'v3', meta: 'v5', slicecard: 'v2', scan: 'v3', ...(mode === 'nations' ? { evolve: 'v4' } : { cards: 'v1' }) }) },
    reel: { blend: 'off', plane: 'loop', planeSec: 6, planeMode: 'bounce' },
    split: { on: true, below: 'voxels', above: 'processed' },
    slice: { of: 'result', color: 'diffusion' },
  },
  {
    id: 'data-film', title: 'Data in motion',
    desc: 'Readouts, the result card, the level against what it keeps and the stages, counting as it plays.',
    pieces: { curated: 'data' },
    reel: { blend: 'fade', plane: 'mesh', planeSec: 6, planeMode: 'up' },
    slice: { of: 'auto', color: 'heat' },
    speed: 1,
  },
]
