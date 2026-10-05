// The HUD composer's contract. Every mark family from the Quicksilver library (design/handoff/QLMarks4,
// QLNav4, QLControls4, QLOverlay4, QLGlyphs4, QLData4) is ported as HudModules that draw over the
// 3D view from this context. The composer turns on any number of variants per family.
import type { ReactNode } from 'react'
import type { AtlasJobRow, GridInfo, JobView, MeshReport, ModelInfo, ProcMeta } from '../api'
import type { Axis } from '../qs/grid'

export type Vec3 = [number, number, number]
export interface Rect { l: number; r: number; t: number; b: number }

export type Family =
  | 'frame'      // lab frame: registration dots, crosses, corner brackets
  | 'meta'       // metadata blocks (HISTORY / SCENE style readouts)
  | 'orbit'      // orbit rings around the object (gimbal, cage, stations, live)
  | 'camera'     // camera, abstracted (viewpoint, frustum plan, viewport, az/el chart, three views, look-at)
  | 'dial'       // orbit, abstracted (tick ring, split arcs, edge rulers, polar)
  | 'bounds'     // corners in 3D, extents, footprint, drop area
  | 'focus'      // grey corners, frame + tag, depth band, refocusing
  | 'selection'  // the probed cell: square + tab, lock-on, target, cell in slice
  | 'callout'    // pins: dot leader, elbow, numbered, value flag
  | 'scan'       // sweep, plane + index, layer stack, marching
  | 'steps'      // pipeline navigation: index bar, rail with nodes, side index, step ring
  | 'captures'   // run history as dots (CAPTURES)
  | 'slicecard'  // the section map and cutting plane, infographic
  | 'cards'      // infographic data cards: quantum result, print check, model, grid
  | 'stages'     // the four stages side by side, rendered live from the same camera
  // Navigation (QLNav4 E–K)
  | 'timeline'   // run timeline: steps as time ranges, tiles as lanes
  | 'bars'       // tabs with a sliding underline, segmented progress, breadcrumb with values
  | 'indexes'    // ruler index, expanding index
  // Quantum glyphs (QLGlyphs4)
  | 'backend'    // backend path of a job: hops, the active one dashed
  | 'register'   // the qubit register of a cell: qubits, weights, rotation
  | 'rotation'   // Rx θ on a circle, strength
  | 'shots'      // shots and error: 1/√shots
  | 'processing' // which engine: Gaussian, emulation, Atlas
  | 'blur'       // how the blur works: strength, reach, style, qubit weights, mixing
  | 'pulse'      // pulse schedule: Rx / Ry gates on qubit lines
  | 'usage'      // Atlas usage, result size by grid, request rate
  // Data and runtime (QLData4)
  | 'figures'    // readout + ruler, kept volume, chip, level vs kept
  | 'density'    // the value histogram with the level
  | 'runtime'    // the runtime log
  | 'tiles'      // tiles of the grid and their state
  | 'field'      // signed distance on the slice
  | 'values'     // voxel values, coverage
  | 'levels'     // level sweep: one field at five thresholds
  // Controls as readouts (QLControls4)
  | 'dials'      // dials D1–D5 showing a parameter
  | 'numbers'    // number controls N1–N6: drum, odometer, pull rod, detent slide, gate, dual scale
  | 'viewcam'    // trackball, view camera from the top and from the side

export interface HudPin { n: number; cell: Vec3; p?: Vec3; lines: [string, string]; x: number | null; y: number | null }

export interface HudCtx {
  /** Viewport size in CSS px; every module draws inside an absolutely positioned w × h box. */
  w: number
  h: number
  /** Changes whenever the camera moves; modules that project points re-render with it. */
  tick: number
  /** Camera angles in degrees; dist is the camera distance in grid-box units (≈ 1–8). fov in degrees. */
  cam: { az: number; el: number; dist: number; fov: number }
  /** Grid-space point (voxel (i,j,k) at (i,j,k), z up) → viewport px, or null if behind the camera. */
  project: (p: Vec3) => [number, number] | null
  /** Grid-space bounding box of what is shown (model/voxels/result), and its screen rectangle. */
  box: { min: Vec3; max: Vec3 } | null
  rect: Rect | null
  /** Grid edge length n (cells); mm per cell. */
  n: number
  mm: number
  view: 'model' | 'voxels' | 'processed' | 'result' | 'scan'
  tool: 'navigate' | 'probe' | 'annotate' | 'measure' | 'slice'
  model: ModelInfo | null
  grid: GridInfo | null
  proc: ProcMeta | null
  job: JobView | null
  report: MeshReport | null
  q: { mode: string; sigma: number; strength: number; reach: number; style: string; axes: number[]; shots: number | null; run: string; tiling: string }
  level: number
  slice: { axis: Axis; index: number }
  /** Hovered cell under the probe (px in viewport), or null. */
  hover: { x: number; y: number; cell: Vec3; value: number | null; lines: [string, string] } | null
  pins: HudPin[]
  /** Pipeline: 0 model, 1 voxels, 2 quantum, 3 mesh; which are done. */
  steps: { done: boolean[]; live: number; labels: [string, string][] }
  /** Past processing runs this session, newest last (for CAPTURES). */
  runs: { id: number; label: string; mode: string; strength: number; reach: number; t: number }[]
  busy: boolean
  // actions the marks may offer
  orbitTo: (az: number, el: number) => void
  setSlice: (p: { axis?: Axis; index?: number }) => void
  /** Sets the mesh level (rebuilds the mesh locally, as the level slider does). */
  setLevel?: (v: number) => void
  goStep: (i: number) => void
  /** Off-screen renders of single layers from the current camera (PNG data URLs). */
  thumbs?: (names: ('model' | 'voxels' | 'processed' | 'result')[], w: number, h: number) => Partial<Record<string, string>>
  /** Raw grids for views of the data: input coverage and the quantum result, index (x·n + y)·n + z, z up. */
  data: { grid: { n: number; data: Float32Array } | null; proc: { n: number; data: Float32Array } | null }
  /** The runtime log, newest last (level 'net' lines are requests: "GET /api/… 200 · 12 ms"). */
  log: { t: number; text: string; level?: 'info' | 'warn' | 'error' | 'net' }[]
  /** Atlas jobs the service knows about (never fetched by a module). */
  atlasJobs: AtlasJobRow[]
}

/** A family of variants, as listed in the compose library. */
export interface FamilyDef { id: Family; title: string; desc: string; modules: HudModule[] }

export interface HudModule {
  family: Family
  /** Variant id, e.g. 'v1', unique within the family. */
  id: string
  /** Short name as in the library, e.g. 'gimbal', 'lock-on'. */
  label: string
  /** One line: what it shows (from the library captions). */
  desc: string
  /** Where it sits, so the composer can keep modules apart: 'object' follows the model; corners are fixed slots. */
  slot: 'object' | 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'full'
  /** Interactive modules set this; they receive pointer events, others are pointer-events:none. */
  interactive?: boolean
  render: (ctx: HudCtx) => ReactNode
}
