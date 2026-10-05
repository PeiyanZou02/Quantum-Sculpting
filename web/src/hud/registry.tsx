// The mark registry: every family from the Quicksilver library and its variants, in library order.
// Kept apart from the marks so each mark file exports only components (Fast Refresh).
import type { ReactNode } from 'react'
import type { Family, FamilyDef, HudCtx, HudModule } from './types'
import * as orbit from './orbit'
import * as camera from './camera'
import * as dial from './dial'
import * as bounds from './bounds'
import * as focus from './focus'
import * as selection from './selection'
import * as callout from './callout'
import * as frame from './frame'
import * as meta from './meta'
import * as scan from './scan'
import * as steps from './steps'
import * as captures from './captures'
import * as cards from './cards'
import * as stages from './stages'
import * as glyphs from './glyphs'
import * as datamarks from './datamarks'
import * as navmore from './navmore'
import * as controls from './controls'
import * as evolve from './evolve'
import { GridOut, ModelOut, PrintOut, QuantumOut } from '../screens/OutputPane'

// ── orbit ────────────────────────────────────────────────────────────────────────────────────────

export const ORBIT_MODULES: HudModule[] = [
  {
    family: 'orbit',
    id: 'v1',
    label: 'gimbal',
    desc: 'Azimuth ring, elevation arc, camera node',
    slot: 'object',
    interactive: true,
    render: (ctx) => <orbit.GimbalRing ctx={ctx} />,
  },
  {
    family: 'orbit',
    id: 'v2',
    label: 'cage',
    desc: 'Latitude and meridians, for free orbit',
    slot: 'object',
    render: (ctx) => <orbit.Cage ctx={ctx} />,
  },
  {
    family: 'orbit',
    id: 'v3',
    label: 'stations',
    desc: 'Twelve fixed views, visited ones filled',
    slot: 'object',
    interactive: true,
    render: (ctx) => <orbit.Stations ctx={ctx} />,
  },
  {
    family: 'orbit',
    id: 'v4',
    label: 'live',
    desc: 'Shown only while the view is moving',
    slot: 'object',
    render: (ctx) => <orbit.LiveRing ctx={ctx} />,
  },
  {
    family: 'orbit',
    id: 'v5',
    label: 'gimbal states',
    desc: 'Scales appear only while the hand is on it',
    slot: 'bl',
    interactive: true,
    render: (ctx) => <orbit.GimbalStates ctx={ctx} />,
  },
]

// ── camera ───────────────────────────────────────────────────────────────────────────────────────

export const CAMERA_MODULES: HudModule[] = [
  { family: 'camera', id: 'c1', label: 'viewpoint', desc: 'Eye, view cone and target', slot: 'tr', render: (ctx) => <camera.Viewpoint ctx={ctx} /> },
  { family: 'camera', id: 'c2', label: 'frustum plan', desc: 'Top view; grid bounds dashed', slot: 'tr', render: (ctx) => <camera.FrustumPlan ctx={ctx} /> },
  { family: 'camera', id: 'c3', label: 'viewport', desc: 'Thirds, safe area, centre', slot: 'tr', render: (ctx) => <camera.Viewport ctx={ctx} /> },
  {
    family: 'camera',
    id: 'c4',
    label: 'az / el chart',
    desc: 'Sphere unwrapped, presets as rings',
    slot: 'tr',
    interactive: true,
    render: (ctx) => <camera.AzElChart ctx={ctx} />,
  },
  { family: 'camera', id: 'c5', label: 'three views', desc: 'Camera direction in plan and elevation', slot: 'tr', render: (ctx) => <camera.ThreeViews ctx={ctx} /> },
  { family: 'camera', id: 'c6', label: 'look-at', desc: 'Distance and up axis', slot: 'tr', render: (ctx) => <camera.LookAt ctx={ctx} /> },
]

// ── dial ─────────────────────────────────────────────────────────────────────────────────────────

export const DIAL_MODULES: HudModule[] = [
  {
    family: 'dial',
    id: 'o1',
    label: 'tick ring',
    desc: '72 ticks, one node, no ellipse',
    slot: 'br',
    interactive: true,
    render: (ctx) => <dial.TickRing ctx={ctx} />,
  },
  {
    family: 'dial',
    id: 'o2',
    label: 'split arcs',
    desc: 'Azimuth and elevation read apart',
    slot: 'br',
    interactive: true,
    render: (ctx) => <dial.SplitArcs ctx={ctx} />,
  },
  {
    family: 'dial',
    id: 'o3',
    label: 'edge rulers',
    desc: 'Azimuth on the floor edge, elevation on the side',
    slot: 'full',
    interactive: true,
    render: (ctx) => <dial.EdgeRulers ctx={ctx} />,
  },
  {
    family: 'dial',
    id: 'o4',
    label: 'polar',
    desc: 'Elevation inward, recent path dashed',
    slot: 'br',
    render: (ctx) => <dial.Polar ctx={ctx} />,
  },
]

// ── bounds ───────────────────────────────────────────────────────────────────────────────────────

export const BOUNDS_MODULES: HudModule[] = [
  { family: 'bounds', id: 'v1', label: 'corners in 3D', desc: 'Eight corners, no full wireframe', slot: 'object', render: (ctx) => <bounds.Corners3D ctx={ctx} /> },
  { family: 'bounds', id: 'v2', label: 'extents', desc: 'Width and height at print size', slot: 'object', render: (ctx) => <bounds.Extents ctx={ctx} /> },
  { family: 'bounds', id: 'v3', label: 'footprint', desc: 'Floor contact and height for Mesh', slot: 'object', render: (ctx) => <bounds.Footprint ctx={ctx} /> },
  { family: 'bounds', id: 'v4', label: 'drop area', desc: 'Dashed corners and a floor, no box', slot: 'object', render: (ctx) => <bounds.DropArea ctx={ctx} /> },
]

// ── focus ────────────────────────────────────────────────────────────────────────────────────────

export const FOCUS_MODULES: HudModule[] = [
  { family: 'focus', id: 'v1', label: 'grey corners', desc: 'Never confused with selection', slot: 'object', render: (ctx) => <focus.GreyCorners ctx={ctx} /> },
  { family: 'focus', id: 'v2', label: 'frame + tag', desc: 'For the processed and result views', slot: 'object', render: (ctx) => <focus.FrameTag ctx={ctx} /> },
  { family: 'focus', id: 'v3', label: 'depth band', desc: 'Near and far edges of the frame', slot: 'object', render: (ctx) => <focus.DepthBand ctx={ctx} /> },
  { family: 'focus', id: 'v4', label: 'refocusing', desc: 'Breathes once after reset view', slot: 'object', render: (ctx) => <focus.Refocusing ctx={ctx} /> },
]

// ── selection ────────────────────────────────────────────────────────────────────────────────────

export const SELECTION_MODULES: HudModule[] = [
  { family: 'selection', id: 'v1', label: 'square + tab', desc: 'Index sits on the frame, not inside', slot: 'object', render: (ctx) => <selection.SquareTab ctx={ctx} /> },
  { family: 'selection', id: 'v2', label: 'lock-on', desc: 'Corners close in over 240 ms', slot: 'object', render: (ctx) => <selection.LockOn ctx={ctx} /> },
  { family: 'selection', id: 'v3', label: 'target', desc: 'Axis ticks give the cell address', slot: 'object', render: (ctx) => <selection.Target ctx={ctx} /> },
  { family: 'selection', id: 'v4', label: 'cell in slice', desc: 'Row and column tinted', slot: 'object', render: (ctx) => <selection.CellInSlice ctx={ctx} /> },
]

// ── callout ──────────────────────────────────────────────────────────────────────────────────────

export const CALLOUT_MODULES: HudModule[] = [
  { family: 'callout', id: 'v1', label: 'dot leader', desc: 'Code label, lowercase', slot: 'object', render: (ctx) => <callout.DotLeader ctx={ctx} /> },
  { family: 'callout', id: 'v2', label: 'elbow', desc: 'Two lines of data on a shelf', slot: 'object', render: (ctx) => <callout.Elbow ctx={ctx} /> },
  { family: 'callout', id: 'v3', label: 'numbered', desc: 'Keeps labels off a busy object', slot: 'object', render: (ctx) => <callout.Numbered ctx={ctx} /> },
  { family: 'callout', id: 'v4', label: 'value flag', desc: 'Pill flag for a probed value', slot: 'object', render: (ctx) => <callout.ValueFlag ctx={ctx} /> },
]

// ── frame ────────────────────────────────────────────────────────────────────────────────────────

export const FRAME_MODULES: HudModule[] = [
  {
    family: 'frame',
    id: 'v1',
    label: 'registration',
    desc: 'Square dots along the edges and small crosses on the thirds, like a print sheet.',
    slot: 'full',
    render: (ctx) => <frame.Registration ctx={ctx} />,
  },
  {
    family: 'frame',
    id: 'v2',
    label: 'brackets',
    desc: 'Ink corner brackets around the view and a grey centre cross.',
    slot: 'full',
    render: (ctx) => <frame.Brackets ctx={ctx} />,
  },
  {
    family: 'frame',
    id: 'v3',
    label: 'bracket + dots',
    desc: 'Grey corners with sparse edge dots; the lightest frame.',
    slot: 'full',
    render: (ctx) => <frame.BracketDots ctx={ctx} />,
  },
  {
    family: 'frame',
    id: 'v4',
    label: 'safe area',
    desc: 'Dashed frame at 80% of the view with thirds, for framing a capture.',
    slot: 'full',
    render: (ctx) => <frame.SafeArea ctx={ctx} />,
  },
]

// ── meta ─────────────────────────────────────────────────────────────────────────────────────────

export const META_MODULES: HudModule[] = [
  {
    family: 'meta',
    id: 'v1',
    label: 'history',
    desc: 'Where this result came from: the model file, the grid and the run.',
    slot: 'tl',
    render: (ctx) => <meta.History ctx={ctx} />,
  },
  {
    family: 'meta',
    id: 'v2',
    label: 'scene',
    desc: 'How it was computed: samples, seed, engine, solid cells and level.',
    slot: 'tr',
    render: (ctx) => <meta.Scene ctx={ctx} />,
  },
  {
    family: 'meta',
    id: 'v3',
    label: 'both',
    desc: 'History and scene together in one corner.',
    slot: 'tl',
    render: (ctx) => <meta.Both ctx={ctx} />,
  },
  {
    family: 'meta',
    id: 'v4',
    label: 'quantum',
    desc: 'The quantum settings: qubits per axis, strength, reach, style and axes.',
    slot: 'tr',
    render: (ctx) => <meta.Quantum ctx={ctx} />,
  },
]

/** v3 split across both corners, for a composer that can place two blocks for one variant. */
export const META_SPLIT: HudModule[] = [
  { ...META_MODULES[0], id: 'v3-tl' },
  { ...META_MODULES[1], id: 'v3-tr' },
]

// ── scan ─────────────────────────────────────────────────────────────────────────────────────────

export const SCAN_MODULES: HudModule[] = [
  {
    family: 'scan',
    id: 'v1',
    label: 'sweep',
    desc: '3.2 s pass while a slice loads.',
    slot: 'object',
    render: (ctx) => <scan.Sweep ctx={ctx} />,
  },
  {
    family: 'scan',
    id: 'v2',
    label: 'plane + index',
    desc: 'Drag to move the plane; hover previews a layer.',
    slot: 'br',
    interactive: true,
    render: (ctx) => <scan.PlaneIndex ctx={ctx} />,
  },
  {
    family: 'scan',
    id: 'v3',
    label: 'layer stack',
    desc: 'For printing and the slice index.',
    slot: 'right',
    interactive: true,
    render: (ctx) => <scan.LayerStack ctx={ctx} />,
  },
  {
    family: 'scan',
    id: 'v4',
    label: 'marching',
    desc: 'Region being recomputed.',
    slot: 'object',
    render: (ctx) => <scan.Marching ctx={ctx} />,
  },
]

// ── steps ────────────────────────────────────────────────────────────────────────────────────────

export const STEPS_MODULES: HudModule[] = [
  {
    family: 'steps',
    id: 'v1',
    label: 'index bar',
    desc: 'The pill slides in 350 ms with ease-out. Done steps stay ink, later steps grey.',
    slot: 'top',
    interactive: true,
    render: (ctx) => <steps.IndexBar ctx={ctx} />,
  },
  {
    family: 'steps',
    id: 'v2',
    label: 'rail with nodes',
    desc: 'Progress line grows in 500 ms. The live node pings every 1.8 s.',
    slot: 'top',
    interactive: true,
    render: (ctx) => <steps.Rail ctx={ctx} />,
  },
  {
    family: 'steps',
    id: 'v3',
    label: 'side index',
    desc: 'The position bar moves in 300 ms. Fits a narrow left edge.',
    slot: 'left',
    interactive: true,
    render: (ctx) => <steps.SideIndex ctx={ctx} />,
  },
  {
    family: 'steps',
    id: 'v4',
    label: 'step ring',
    desc: 'Echoes the dials. The needle turns in 450 ms.',
    slot: 'tr',
    interactive: true,
    render: (ctx) => <steps.StepRing ctx={ctx} />,
  },
]

/** The default steps variant: v2, B · rail with nodes. */
export const STEPS_DEFAULT = 'v2'

// ── captures ─────────────────────────────────────────────────────────────────────────────────────

export const CAPTURES_MODULES: HudModule[] = [
  {
    family: 'captures',
    id: 'v1',
    label: 'dots',
    desc: 'One dot per run: grey for past runs, a ring for the newest, empty rings to ten.',
    slot: 'bottom',
    render: (ctx) => <captures.Dots ctx={ctx} labels={false} />,
  },
  {
    family: 'captures',
    id: 'v2',
    label: 'dots with labels',
    desc: 'The same dots; hover one to read its run.',
    slot: 'bottom',
    interactive: true,
    render: (ctx) => <captures.Dots ctx={ctx} labels />,
  },
  {
    family: 'captures',
    id: 'v3',
    label: 'timeline',
    desc: 'Runs on a time axis, first run to the newest.',
    slot: 'bottom',
    interactive: true,
    render: (ctx) => <captures.Timeline ctx={ctx} />,
  },
  {
    family: 'captures',
    id: 'v4',
    label: 'strength × reach',
    desc: 'Past runs plotted by strength and reach; the cross is the current setting.',
    slot: 'bottom',
    interactive: true,
    render: (ctx) => <captures.Scatter ctx={ctx} />,
  },
]

// ── cards ────────────────────────────────────────────────────────────────────────────────────────

export const SLICECARD_MODULES: HudModule[] = [
  { family: 'slicecard', id: 'v1', label: 'section', desc: 'The section map under the cutting plane', slot: 'bl', render: () => <cards.SliceCard /> },
  { family: 'slicecard', id: 'v2', label: 'section + layers', desc: 'The section map and solid cells per layer', slot: 'bl', render: () => <cards.SliceCard layers /> },
  { family: 'slicecard', id: 'v3', label: 'density', desc: 'Cells by value against the level', slot: 'bl', render: () => <cards.DensityCard /> },
]

export const CARDS_MODULES: HudModule[] = [
  { family: 'cards', id: 'v1', label: 'quantum result', desc: 'Peak value, time and the density histogram', slot: 'br', render: () => <cards.Card><QuantumOut /></cards.Card> },
  { family: 'cards', id: 'v2', label: 'print check', desc: 'Volume, parts and the print checks', slot: 'br', render: () => <cards.Card><PrintOut /></cards.Card> },
  { family: 'cards', id: 'v3', label: 'model', desc: 'Size and faces of the original mesh', slot: 'br', render: () => <cards.Card><ModelOut /></cards.Card> },
  { family: 'cards', id: 'v4', label: 'grid', desc: 'Solid cells and voxel size', slot: 'br', render: () => <cards.Card><GridOut /></cards.Card> },
  { family: 'cards', id: 'v5', label: 'result + print', desc: 'The quantum result and the print check together', slot: 'right', render: () => <cards.Card><QuantumOut /><PrintOut /></cards.Card> },
]

// ── stages ───────────────────────────────────────────────────────────────────────────────────────

export const STAGES_MODULES: HudModule[] = [
  { family: 'stages', id: 'v1', label: 'four stages', desc: 'Model, voxels, quantum and mesh in a row', slot: 'bottom', render: (c) => <stages.Stages ctx={c} which={['model', 'voxels', 'processed', 'result']} w={132} h={96} dir="row" /> },
  { family: 'stages', id: 'v2', label: 'column', desc: 'The four stages down the side', slot: 'left', render: (c) => <stages.Stages ctx={c} which={['model', 'voxels', 'processed', 'result']} w={120} h={86} dir="column" /> },
  { family: 'stages', id: 'v3', label: 'before / after', desc: 'The original mesh beside the sculpted surface', slot: 'bottom', render: (c) => <stages.Stages ctx={c} which={['model', 'result']} w={180} h={130} dir="row" /> },
  { family: 'stages', id: 'v4', label: 'input / quantum', desc: 'The voxel grid beside the quantum result', slot: 'bottom', render: (c) => <stages.Stages ctx={c} which={['voxels', 'processed']} w={180} h={130} dir="row" /> },
]

// ── glyphs ───────────────────────────────────────────────────────────────────────────────────────

export const GLYPH_FAMILIES: FamilyDef[] = [
  {
    id: 'backend', title: 'Backend path', desc: 'The hops a job takes; the dashed line moves on the active hop',
    modules: [
      { family: 'backend', id: 'v1', label: 'path', desc: 'Browser to marching cubes, with this session\'s timings. Local runs skip the remote hops.', slot: 'bottom', render: (ctx) => <glyphs.BackendPath ctx={ctx} /> },
      { family: 'backend', id: 'v2', label: 'path, stacked', desc: 'The same hops as a column for a side edge.', slot: 'left', render: (ctx) => <glyphs.BackendStack ctx={ctx} /> },
    ],
  },
  {
    id: 'register', title: 'Register', desc: 'The qubits of the probed cell',
    modules: [
      { family: 'register', id: 'v1', label: 'cell', desc: 'Each axis of the probed cell, Gray-coded onto its qubits; the 1-bits are filled.', slot: 'bl', render: (ctx) => <glyphs.Register ctx={ctx} /> },
    ],
  },
  {
    id: 'rotation', title: 'Rotation', desc: 'Rx θ = strength · π on a half circle',
    modules: [
      { family: 'rotation', id: 'v1', label: 'rotation', desc: 'The turn of q0 on a half circle from 0 to π; ticks mark the higher qubits.', slot: 'br', render: (ctx) => <glyphs.Rotation ctx={ctx} /> },
    ],
  },
  {
    id: 'shots', title: 'Shots and error', desc: 'Sampling error falls as 1/√shots',
    modules: [
      { family: 'shots', id: 'v1', label: 'shots and error', desc: 'Error falls as 1/√shots. Leave shots empty for exact.', slot: 'br', render: (ctx) => <glyphs.Shots ctx={ctx} /> },
      { family: 'shots', id: 'v2', label: 'hear the run', desc: 'Measured bitstrings as a piano roll: one note per qubit, one shot per sixteenth.', slot: 'bl', render: (ctx) => <glyphs.HearRun ctx={ctx} /> },
    ],
  },
  {
    id: 'processing', title: 'Processing', desc: 'Which engine made the result',
    modules: [
      { family: 'processing', id: 'v1', label: 'engines', desc: 'Gaussian stand-in, local emulation or Atlas blur-core-v1; the one in use is ink.', slot: 'tr', render: (ctx) => <glyphs.Processing ctx={ctx} /> },
    ],
  },
  {
    id: 'blur', title: 'How the blur works', desc: 'Strength, reach, style, and what each qubit mixes',
    modules: [
      { family: 'blur', id: 'v1', label: 'settings', desc: 'Strength, reach and style as they are set.', slot: 'tl', render: (ctx) => <glyphs.BlurSettings ctx={ctx} /> },
      { family: 'blur', id: 'v2', label: 'qubits', desc: 'Per qubit: weight, θ, the span it mixes within and the share it moves.', slot: 'tr', render: (ctx) => <glyphs.QubitTable ctx={ctx} /> },
      { family: 'blur', id: 'v3', label: 'gray pairing', desc: 'Which cells a qubit pairs on one row of the grid, and that row blurred alone.', slot: 'bottom', interactive: true, render: (ctx) => <glyphs.GrayPairing ctx={ctx} /> },
      { family: 'blur', id: 'v4', label: 'how it works', desc: 'Three steps in words, and the sums in and out: the blur moves value, it does not add any.', slot: 'right', render: (ctx) => <glyphs.HowItWorks ctx={ctx} /> },
    ],
  },
  {
    id: 'pulse', title: 'Pulse schedule', desc: 'Rx and Ry rotations as drive pulses on the qubit lines',
    modules: [
      { family: 'pulse', id: 'v1', label: 'exploration', desc: 'How the rotations could map to drive pulses, with amplitude set by strength.', slot: 'br', render: (ctx) => <glyphs.PulseExplore ctx={ctx} /> },
      { family: 'pulse', id: 'v2', label: 'drag the playhead', desc: 'Pulse height is the angle. Drag the playhead to apply the gates one at a time.', slot: 'bottom', interactive: true, render: (ctx) => <glyphs.PulseDrag ctx={ctx} /> },
    ],
  },
  {
    id: 'usage', title: 'Atlas usage', desc: 'Jobs this session, result size by grid, request rate',
    modules: [
      { family: 'usage', id: 'v1', label: 'this session', desc: 'Jobs sent and read from cache this session, against a budget.', slot: 'tr', render: (ctx) => <glyphs.UsageSession ctx={ctx} /> },
      { family: 'usage', id: 'v2', label: 'result size by grid', desc: 'Values per grid against the 2 MB line per job; larger grids are split into tiles.', slot: 'bl', render: (ctx) => <glyphs.ResultSize ctx={ctx} /> },
      { family: 'usage', id: 'v3', label: 'request rate', desc: 'Requests in the last 60 s around a clock; status polls every 2 s.', slot: 'tr', render: (ctx) => <glyphs.RequestRate ctx={ctx} /> },
    ],
  },
]

// ── datamarks ────────────────────────────────────────────────────────────────────────────────────

const mod = (family: HudModule['family'], id: string, label: string, desc: string, slot: HudModule['slot'], Body: (p: { ctx: HudCtx }) => ReactNode, interactive?: boolean): HudModule => ({
  family, id, label, desc, slot, interactive,
  render: (ctx) => <datamarks.Safe data={ctx.data.proc ?? ctx.data.grid}><Body ctx={ctx} /></datamarks.Safe>,
})

export const DATA_FAMILIES: FamilyDef[] = [
  {
    id: 'figures', title: 'Figures', desc: 'The mesh level and what it keeps',
    modules: [
      mod('figures', 'v1', 'readout + ruler', 'The level as a large number on a ruler from swell to erode.', 'tl', datamarks.Readout),
      mod('figures', 'v2', 'kept volume', 'Cells kept at the level, as a share of the input solid.', 'tr', datamarks.Kept),
      mod('figures', 'v3', 'chip', 'Level and kept share in one pill, for the run header.', 'top', datamarks.Chip),
      mod('figures', 'v4', 'level vs kept', 'Kept share at every level; the dashed line is the input solid.', 'br', datamarks.LevelKept),
    ],
  },
  {
    id: 'density', title: 'Density', desc: 'Cells by value against the level',
    modules: [
      mod('density', 'v1', 'density', 'Hover a bin to read it; drag to try a level. Bars at or above the level are ink.', 'bottom', datamarks.Density, true),
    ],
  },
  {
    id: 'runtime', title: 'Runtime', desc: 'The run as it happens: counters, steps, log and runs',
    modules: [
      mod('runtime', 'v1', 'run header', 'Run, mode and live counters: elapsed, tiles, polls, cache hits, sent and received.', 'tr', datamarks.RunHeader),
      mod('runtime', 'v2', 'steps', 'Each pipeline step as a time range, from the requests in the log.', 'bl', datamarks.Steps),
      mod('runtime', 'v3', 'log', 'The newest lines of the runtime log.', 'br', datamarks.LogList),
      mod('runtime', 'v4', 'runs', 'Runs this session: mode, grid, level, time and cache.', 'br', datamarks.RunsTable),
    ],
  },
  {
    id: 'tiles', title: 'Tiles', desc: 'Tiles of the grid and their state',
    modules: [
      mod('tiles', 'v1', 'tiles', 'Atlas tiles as cubes or layers: done, running, queued, cached, empty; halved after a size error.', 'bl', datamarks.Tiles, true),
    ],
  },
  {
    id: 'field', title: 'Signed distance', desc: 'Distance to the surface on the cutting plane',
    modules: [
      mod('field', 'v1', 'signed distance', 'Negative inside, positive outside; grey lines are 1-voxel steps in the 3-voxel band.', 'left', datamarks.FieldMap, true),
    ],
  },
  {
    id: 'values', title: 'Voxel values', desc: 'Coverage against 0 or 1 where the surface crosses',
    modules: [
      mod('values', 'v1', 'voxel values', 'Coverage, where the 0.5 level is the true surface, beside 0 or 1, about half a voxel fat.', 'bl', datamarks.VoxelValues),
      mod('values', 'v2', 'coverage', 'The coverage of each cell where the surface crosses the slice.', 'bl', datamarks.Coverage),
    ],
  },
  {
    id: 'levels', title: 'Level sweep', desc: 'One field at five thresholds',
    modules: [
      mod('levels', 'v1', 'level sweep', 'One field, five thresholds, with the share kept and the parts at each.', 'bottom', datamarks.Sweep),
    ],
  },
]

// ── navmore ──────────────────────────────────────────────────────────────────────────────────────

const TIMELINE: HudModule[] = [
  {
    family: 'timeline',
    id: 'v1',
    label: 'run timeline',
    desc: 'Steps as time ranges, for reviewing a finished run. Not to scale.',
    slot: 'bottom',
    render: (ctx) => <navmore.RunTimeline ctx={ctx} />,
  },
  {
    family: 'timeline',
    id: 'v2',
    label: 'with tiles',
    desc: 'Local work, the three Atlas slots and the 2 s polls, to scale. Drag to scrub.',
    slot: 'bottom',
    interactive: true,
    render: (ctx) => <navmore.RunTiles ctx={ctx} />,
  },
]

const BARS: HudModule[] = [
  {
    family: 'bars',
    id: 'v1',
    label: 'tabs',
    desc: 'Values sit under each tab, so the bar is also a summary. The underline moves in 350 ms.',
    slot: 'top',
    interactive: true,
    render: (ctx) => <navmore.Tabs ctx={ctx} />,
  },
  {
    family: 'bars',
    id: 'v2',
    label: 'segmented progress',
    desc: 'The live step fills with its own progress, here tiles returned.',
    slot: 'bottom',
    interactive: true,
    render: (ctx) => <navmore.Segmented ctx={ctx} />,
  },
  {
    family: 'bars',
    id: 'v3',
    label: 'breadcrumb',
    desc: 'Reads as one sentence about the run. The current step is outlined in ink.',
    slot: 'top',
    interactive: true,
    render: (ctx) => <navmore.Breadcrumb ctx={ctx} />,
  },
]

const INDEXES: HudModule[] = [
  {
    family: 'indexes',
    id: 'v1',
    label: 'ruler index',
    desc: 'Steps as long ticks on a scale. The live step lists its settings.',
    slot: 'left',
    interactive: true,
    render: (ctx) => <navmore.Ruler ctx={ctx} />,
  },
  {
    family: 'indexes',
    id: 'v2',
    label: 'expanding index',
    desc: 'One step open at a time; a line, not a box, holds its settings.',
    slot: 'right',
    interactive: true,
    render: (ctx) => <navmore.Expanding ctx={ctx} />,
  },
]

export const NAV_FAMILIES: FamilyDef[] = [
  { id: 'timeline', title: 'Run timeline', desc: 'The last run, step by step and tile by tile', modules: TIMELINE },
  { id: 'bars', title: 'Bars', desc: 'Tabs, progress and a breadcrumb through the steps', modules: BARS },
  { id: 'indexes', title: 'Indexes', desc: 'Step indexes that open onto their settings', modules: INDEXES },
]

// ── controls ─────────────────────────────────────────────────────────────────────────────────────

const DIALS: HudModule[] = [
  { family: 'dials', id: 'v1', label: 'arc dial', desc: 'The base build: the threshold on a 270° arc of ticks', slot: 'bl', render: (ctx) => <controls.D1Arc ctx={ctx} /> },
  { family: 'dials', id: 'v2', label: 'ring dial', desc: 'Strength in the hole of a satin ring', slot: 'br', render: (ctx) => <controls.D2Ring ctx={ctx} /> },
  { family: 'dials', id: 'v3', label: 'coarse ring, fine cap', desc: 'Level: the ring clicks in 0.05 steps, the cap turns once per step', slot: 'br', render: (ctx) => <controls.D3CoarseFine ctx={ctx} /> },
  { family: 'dials', id: 'v4', label: 'engraved detents', desc: 'Gate style on detents under a fixed index', slot: 'bl', render: (ctx) => <controls.D4Detents ctx={ctx} /> },
  { family: 'dials', id: 'v5', label: 'edge wheel', desc: 'Shots on a thumbwheel, for long ranges', slot: 'bottom', render: (ctx) => <controls.D5EdgeWheel ctx={ctx} /> },
  {
    family: 'dials',
    id: 'v6',
    label: 'dial states',
    desc: 'Level on one dial in five moments: rest, ring while busy, turning, reset, a 0.01 step',
    slot: 'br',
    render: (ctx) => <controls.DialStates ctx={ctx} />,
  },
]

const NUMBERS: HudModule[] = [
  { family: 'numbers', id: 'v1', label: 'drum', desc: 'Level on a drum; numbers foreshorten toward the edges', slot: 'bottom', render: (ctx) => <controls.N1Drum ctx={ctx} /> },
  { family: 'numbers', id: 'v2', label: 'odometer', desc: 'Shots, one wheel per digit; exact when reset', slot: 'bl', render: (ctx) => <controls.N2Odometer ctx={ctx} /> },
  { family: 'numbers', id: 'v3', label: 'pull rod', desc: 'Push amount: how far the quantum result moves the surface', slot: 'bl', render: (ctx) => <controls.N3PullRod ctx={ctx} /> },
  { family: 'numbers', id: 'v4', label: 'centre-detent slide', desc: 'Thicken or shrink; the ink bar shows the offset in voxels', slot: 'bottom', render: (ctx) => <controls.N4DetentSlide ctx={ctx} /> },
  { family: 'numbers', id: 'v5', label: 'shift gate', desc: 'Push field: toward the result, difference or gradient', slot: 'br', render: (ctx) => <controls.N5ShiftGate ctx={ctx} /> },
  { family: 'numbers', id: 'v6', label: 'dual scale', desc: 'Level above, share of the input kept below; dashed tick is 100%', slot: 'bottom', render: (ctx) => <controls.N6DualScale ctx={ctx} /> },
]

const VIEWCAM: HudModule[] = [
  { family: 'viewcam', id: 'v1', label: 'trackball', desc: 'The world sphere; the dot marks the camera', slot: 'br', render: (ctx) => <controls.Trackball ctx={ctx} /> },
  { family: 'viewcam', id: 'v2', label: 'from the top', desc: 'Station ring, frustum, near plane', slot: 'tr', render: (ctx) => <controls.CamTop ctx={ctx} /> },
  { family: 'viewcam', id: 'v3', label: 'from the side', desc: 'Elevation arc over the build floor', slot: 'tr', render: (ctx) => <controls.CamSide ctx={ctx} /> },
]

export const CONTROL_FAMILIES: FamilyDef[] = [
  { id: 'dials', title: 'Dials', desc: 'Five dial builds and their states, each showing a parameter', modules: DIALS },
  { id: 'numbers', title: 'Number controls', desc: 'Beyond the arc: drum, odometer, rod, slide, gate, dual scale', modules: NUMBERS },
  { id: 'viewcam', title: 'View camera', desc: 'The view camera as an object: trackball, top, side', modules: VIEWCAM },
]

// ── library ────────────────────────────────────────────────────────────────────────────────────────

export const EVOLVE_MODULES: HudModule[] = [
  { family: 'evolve', id: 'v1', label: 'nations', desc: 'This turn’s nations by territory, with what each did.', slot: 'tr', render: () => <evolve.Nations /> },
  { family: 'evolve', id: 'v2', label: 'territory', desc: 'Every nation’s share of the territory over the whole history; wars, annexations and splits marked under it.', slot: 'bottom', render: () => <evolve.Territory /> },
  { family: 'evolve', id: 'v3', label: 'chronicle', desc: 'The latest wars, annexations, splits, exiles and deaths up to this turn.', slot: 'bl', render: () => <evolve.Chronicle /> },
  { family: 'evolve', id: 'v4', label: 'relations', desc: 'Nations on a ring: alliances as heavy lines, this turn’s attacks as dashed arrows.', slot: 'br', render: () => <evolve.Relations /> },
  { family: 'evolve', id: 'v5', label: 'record', desc: 'Alive, wars, annexations and splits so far, as figures.', slot: 'tl', render: () => <evolve.Record /> },
]

export const FAMILIES: FamilyDef[] = [
  { id: 'frame', title: 'Frame', desc: 'Registration marks around the view', modules: FRAME_MODULES },
  { id: 'meta', title: 'Readouts', desc: 'History, scene and quantum blocks in the corners', modules: META_MODULES },
  { id: 'steps', title: 'Steps', desc: 'Where you are in the pipeline', modules: STEPS_MODULES },
  { id: 'orbit', title: 'Orbit rings', desc: 'Where the view camera is, and where it can go', modules: ORBIT_MODULES },
  { id: 'camera', title: 'Camera, abstracted', desc: 'The view camera as a diagram', modules: CAMERA_MODULES },
  { id: 'dial', title: 'Orbit, abstracted', desc: 'Position as numbers on scales', modules: DIAL_MODULES },
  { id: 'bounds', title: 'Bounds', desc: 'The grid volume and the print size', modules: BOUNDS_MODULES },
  { id: 'focus', title: 'Focus', desc: 'What the view camera is looking at', modules: FOCUS_MODULES },
  { id: 'selection', title: 'Selection', desc: 'The probed cell', modules: SELECTION_MODULES },
  { id: 'callout', title: 'Callouts', desc: 'Data attached to a point', modules: CALLOUT_MODULES },
  { id: 'scan', title: 'Scan and slice', desc: 'The layer being read or printed', modules: SCAN_MODULES },
  { id: 'captures', title: 'Captures', desc: 'Runs or shots this session', modules: CAPTURES_MODULES },
  { id: 'slicecard', title: 'Slice card', desc: 'The section under the cutting plane', modules: SLICECARD_MODULES },
  { id: 'cards', title: 'Data cards', desc: 'Quantum result, print check, model, grid', modules: CARDS_MODULES },
  { id: 'stages', title: 'Stages', desc: 'Model, voxels, quantum and mesh side by side', modules: STAGES_MODULES },
  ...NAV_FAMILIES, ...GLYPH_FAMILIES, ...DATA_FAMILIES, ...CONTROL_FAMILIES,
  { id: 'evolve', title: 'Evolve', desc: 'Nations: roster, territory over the history, chronicle, relations, record', modules: EVOLVE_MODULES },
]

/** The library's categories, in the Quicksilver Library's order: each holds families, each family variants. */
export const CATEGORIES: { id: string; title: string; icon: string; fams: Family[] }[] = [
  { id: 'marks', title: 'Marks', icon: 'frame', fams: ['frame', 'orbit', 'camera', 'dial', 'bounds', 'focus', 'selection', 'callout', 'scan'] },
  { id: 'nav', title: 'Navigation', icon: 'navigate', fams: ['steps', 'timeline', 'bars', 'indexes', 'captures'] },
  { id: 'evolve', title: 'Evolve', icon: 'entangle', fams: ['evolve'] },
  { id: 'glyphs', title: 'Quantum glyphs', icon: 'quantum', fams: ['backend', 'register', 'rotation', 'shots', 'processing', 'blur', 'pulse', 'usage'] },
  { id: 'data', title: 'Data and runtime', icon: 'grid', fams: ['meta', 'cards', 'figures', 'density', 'runtime', 'tiles', 'field', 'values', 'levels', 'slicecard', 'stages'] },
  { id: 'controls', title: 'Controls', icon: 'orbit', fams: ['dials', 'numbers', 'viewcam'] },
]
