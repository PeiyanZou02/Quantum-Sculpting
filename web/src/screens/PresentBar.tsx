// With every control hidden (H) for clean frames: the way back.
import { usePresent } from '../present'

/** With every control hidden (H): a quiet corner that brings them back. Nothing while recording. */
export function BarePeek() {
  const bare = usePresent((p) => p.bare)
  const recording = usePresent((p) => p.recording)
  const setBare = usePresent((p) => p.setBare)
  if (!bare || recording) return null
  return <button className="present-peek" onClick={() => setBare(false)} data-tip="Show controls" data-tip-key="H" aria-label="Show controls" />
}
