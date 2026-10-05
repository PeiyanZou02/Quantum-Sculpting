// Errors surface bottom-right, one card each: close one with ×, or it goes by itself after a while
// (longer for longer messages). The full history is in the runtime log.
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useStore } from '../store'

interface Toast { id: number; text: string }
const MAX = 3

export function Toasts() {
  const error = useStore((s) => s.error)
  const [list, setList] = useState<Toast[]>([])
  const seq = useRef(0)
  // every new error adds a card (the same text again replaces the card rather than stacking)
  useEffect(() => {
    if (!error) return
    const id = ++seq.current
    setList((l) => [...l.filter((t) => t.text !== error), { id, text: error }].slice(-MAX))
  }, [error])
  const close = (id: number) => setList((l) => l.filter((t) => t.id !== id))
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => <ToastCard key={t.id} t={t} onClose={() => close(t.id)} />)}
    </div>
  )
}

function ToastCard({ t, onClose }: { t: Toast; onClose: () => void }) {
  const [held, setHeld] = useState(false)
  const expire = useEffectEvent(onClose)
  // 6 s, plus a little per word; paused while the pointer is on it
  useEffect(() => {
    if (held) return
    const ms = 6000 + Math.min(8000, t.text.split(/\s+/).length * 250)
    const timer = setTimeout(() => expire(), ms)
    return () => clearTimeout(timer)
  }, [held, t.text])
  return (
    <div className="toast" role="status" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}>
      <span className="toast__mark" aria-hidden>!</span>
      <span className="toast__t">{t.text}</span>
      <button className="toast__x" onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  )
}
