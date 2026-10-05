// The composition Lab opens with, as laid out by hand: title, grid card, level sweep, shots, rotation and
// the log down the left; the step tabs on top; captures and the run timeline under the object; slice,
// viewport, relations, the run header and one nation down the right; 3D corners and the frame on the
// object. Positions are fractions of the view (top-left of each piece), anchored: the view keeps
// each piece there, and moves or shrinks one only when a smaller view leaves it on top of another.
import type { Saved } from '../present'

export const DEFAULT_ID = 'default'
export const DEFAULT_COMPOSITION: Saved = {
  id: DEFAULT_ID,
  name: 'Default',
  compose: {
    frame: 'v3', bounds: 'v1',
    meta: 'v5', cards: 'v4', levels: 'v1', shots: 'v1', rotation: 'v1', runtime: 'v3,v1',
    bars: 'v1', captures: 'v3', timeline: 'v1',
    slicecard: 'v2', camera: 'c3', evolve: 'v4,v7',
  },
  pos: {
    'meta:v5': { x: 0.015, y: 0.024, auto: true, anchor: true },
    'cards:v4': { x: 0.015, y: 0.208, auto: true, anchor: true },
    'levels:v1': { x: 0.013, y: 0.595, auto: true, anchor: true },
    'shots:v1': { x: 0.015, y: 0.707, auto: true, anchor: true },
    'rotation:v1': { x: 0.095, y: 0.707, auto: true, anchor: true },
    'runtime:v3': { x: 0.015, y: 0.828, auto: true, anchor: true },
    'bars:v1': { x: 0.42, y: 0.03, auto: true, anchor: true },
    'captures:v3': { x: 0.41, y: 0.871, auto: true, anchor: true },
    'timeline:v1': { x: 0.41, y: 0.922, auto: true, anchor: true },
    'slicecard:v2': { x: 0.875, y: 0.035, auto: true, anchor: true },
    'camera:c3': { x: 0.875, y: 0.09, auto: true, anchor: true },
    'evolve:v4': { x: 0.875, y: 0.376, auto: true, anchor: true },
    'runtime:v1': { x: 0.875, y: 0.636, auto: true, anchor: true },
    'evolve:v7': { x: 0.875, y: 0.767, auto: true, anchor: true },
  },
  looks: {},
  texts: [],
  guides: { box: false, floor: true, div: 4 },
}
/** The view's own controls in the default layout: the tool shelf and the camera readout, nothing else. */
export const DEFAULT_HUD = { tools: true, axes: false, nav: false, camera: true, caption: false, legend: false, frame: false, slice: true }
