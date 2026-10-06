// The Default: the one preset, the whole composition as designed (pieces, annotations, animation,
// shading, lighting and what the view shows). It lives in defaultComposition.json, written by
// Compose · Saved compositions · Publish as Default (POST /api/default-composition), which raises
// `rev`; a browser that last saw a lower rev puts the new Default on screen when it opens.
import type { Saved } from '../present'
import data from './defaultComposition.json'

export const DEFAULT_ID = 'default'
export const DEFAULT_COMPOSITION = data as Saved
/** The view's own controls for a Default saved before compositions kept them: the tool shelf, the camera
 *  readout and the cutting plane. */
export const DEFAULT_HUD = { tools: true, axes: false, nav: false, camera: true, caption: false, legend: false, frame: false, slice: true }
