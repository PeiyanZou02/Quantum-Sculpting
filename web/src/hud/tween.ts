// Values that ease to where they are going instead of jumping: numbers count, so a piece reads as
// motion when the data under it changes (a turn, a run, a scrub). Respects reduced motion.
import { useEffect, useRef, useState } from 'react'

const still = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** `value`, eased over `ms` each time it changes (ease-out). */
export function useTween(value: number, ms = 420): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const cur = useRef(value)
  useEffect(() => {
    if (!Number.isFinite(value)) return
    if (still() || Math.abs(value - cur.current) < 1e-9) { cur.current = value; setShown(value); return }
    from.current = cur.current
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const f = Math.min(1, (now - t0) / ms), e = 1 - (1 - f) ** 3
      cur.current = from.current + (value - from.current) * e
      setShown(cur.current)
      if (f < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}
