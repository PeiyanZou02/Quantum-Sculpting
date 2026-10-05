// The composition's keys. Everything the old present bar held lives in Properties · Compose and Output.
// Keys: C arrange, H hide every control for clean frames, 1–9 or [ ] saved compositions, ← → shots,
// T turntable, ⌫ removes the selected piece, Esc steps back out.
import { useEffect } from 'react'
import { usePresent } from '../present'
import { isRecording, toggleRecording } from './capture'

/** Step through the saved compositions. */
function step(d: number) {
  const p = usePresent.getState()
  const n = p.saved.length
  if (!n) return
  const i = p.saved.findIndex((x) => x.id === p.current)
  p.load(p.saved[i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n].id)
}

/** The composition's keyboard: used once, by the view. */
export function usePresentKeys() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]')) || e.metaKey || e.ctrlKey || e.altKey) return
      const s = usePresent.getState()
      if (e.key === 'Escape' && isRecording()) { toggleRecording(); return }
      if (e.key === 'h' || e.key === 'H') s.setBare(!s.bare)
      else if (e.key === 'c' || e.key === 'C') s.setComposing(!s.composing)
      else if ((e.key === 'Backspace' || e.key === 'Delete') && s.composing && s.sel) { e.preventDefault(); s.removePiece(s.sel) }
      else if (e.key === 'Escape') { if (s.sel) s.setSel(null); else if (s.composing) s.setComposing(false); else if (s.bare) s.setBare(false) }
      else if (e.key === ']') step(1)
      else if (e.key === '[') step(-1)
      else if (e.key === 't' || e.key === 'T') s.setSpin(!s.spin)
      else if (/^[1-9]$/.test(e.key) && s.saved[+e.key - 1]) s.load(s.saved[+e.key - 1].id)
      else if (e.key === 'ArrowRight' && s.shots.length) s.setShot((s.shot + 1) % s.shots.length)
      else if (e.key === 'ArrowLeft' && s.shots.length) s.setShot((s.shot - 1 + s.shots.length) % s.shots.length)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
}
