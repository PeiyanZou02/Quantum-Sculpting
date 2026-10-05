// Present's tools, as the bar and the panel list them.
import type { Tool } from '../store'

export const PRESENT_TOOLS: { id: Tool; icon: string; t: string; d: string; key: string }[] = [
  { id: 'navigate', icon: 'navigate', t: 'Navigate', d: 'Drag to orbit, right-drag to pan, scroll to zoom.', key: 'V' },
  { id: 'annotate', icon: 'annotate', t: 'Annotate', d: 'Click the geometry to pin a note; it turns with the model.', key: 'N' },
  { id: 'measure', icon: 'measure', t: 'Measure', d: 'Click points; consecutive pins are joined with their distance in mm.', key: 'M' },
]
