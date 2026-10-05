// The probe's state and pointer logic (see QProbe.tsx for the two ways to wire it).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject, PointerEvent as RPointerEvent } from 'react'

const CLICK_SLOP = 4
const PIN_HIT = 12

export interface ProbeHit {
  /** Grid cell. */
  x: number
  y: number
  z: number
  /** Two-line flag text. */
  lines: [string, string]
  /** Optional exact hit point (grid coordinates), used by the host to anchor pins. */
  p?: [number, number, number]
}

export interface ProbePin {
  /** Overlay pixel position when pinned. */
  px: number
  py: number
  hit: ProbeHit
}

export interface ProbeHover {
  px: number
  py: number
  hit: ProbeHit
}

/** Anything with client coordinates: React or native pointer events both fit. */
interface PtrLike {
  clientX: number
  clientY: number
  button: number
  target: EventTarget | null
}

export interface UseProbeOptions {
  pick: (px: number, py: number) => ProbeHit | null
  enabled?: boolean
  /** Default 3; the oldest pin drops when exceeded. */
  maxPins?: number
  /** Clicking adds or removes pins (default true). Off: hover readout only. */
  pinning?: boolean
}

type PH = (e: RPointerEvent<HTMLElement>) => void

export interface ProbeController {
  /** Attach to the overlay root (QProbe does this). Coordinates are measured against it. */
  rootRef: RefObject<HTMLDivElement | null>
  hover: ProbeHover | null
  pins: ProbePin[]
  /** True while an orbit drag (≥ 4px) is in progress. */
  dragging: boolean
  enabled: boolean
  clear: () => void
  setPins: (pins: ProbePin[]) => void
  /** Spread onto the view container: `<div {...probe.handlers}>`. */
  handlers: {
    onPointerDown: PH
    onPointerMove: PH
    onPointerUp: PH
    onPointerCancel: PH
    onPointerLeave: PH
  }
  /** Same handlers for native events (used by QProbe's auto mode). */
  native: {
    down: (e: PtrLike) => void
    move: (e: PtrLike) => void
    up: (e: PtrLike) => void
    cancel: () => void
    leave: () => void
  }
}

const isProbeUi = (t: EventTarget | null) => t instanceof Element && !!t.closest('[data-qs-probe-ui]')

/** State and pointer logic of the live layer. */
export function useProbe({ pick, enabled = true, maxPins = 3, pinning = true }: UseProbeOptions): ProbeController {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<ProbeHover | null>(null)
  const [pins, setPins] = useState<ProbePin[]>([])
  const [dragging, setDragging] = useState(false)

  const cfg = useRef({ pick, enabled, maxPins, pinning })
  useEffect(() => {
    cfg.current = { pick, enabled, maxPins, pinning }
  }, [pick, enabled, maxPins, pinning])

  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const pending = useRef<{ x: number; y: number } | null>(null)
  const raf = useRef(0)

  const local = useCallback((e: { clientX: number; clientY: number }) => {
    const el = rootRef.current
    if (!el) return null
    const rc = el.getBoundingClientRect()
    // offsetWidth/Height are the logical (unscaled) w×h, so this undoes any CSS scale on the stage.
    const kx = el.offsetWidth / (rc.width || el.offsetWidth || 1)
    const ky = el.offsetHeight / (rc.height || el.offsetHeight || 1)
    return { x: (e.clientX - rc.left) * kx, y: (e.clientY - rc.top) * ky }
  }, [])

  const flush = useCallback(() => {
    raf.current = 0
    const q = pending.current
    pending.current = null
    if (!q || !cfg.current.enabled || down.current?.moved) return
    const hit = cfg.current.pick(q.x, q.y)
    setHover(hit ? { px: q.x, py: q.y, hit } : null)
  }, [])

  const schedule = useCallback(
    (q: { x: number; y: number }) => {
      pending.current = q
      if (!raf.current) raf.current = requestAnimationFrame(flush)
    },
    [flush],
  )

  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  // turning the probe off drops the hover
  if (!enabled && hover) setHover(null)

  const native = useMemo(() => {
    const leave = () => {
      pending.current = null
      if (!down.current) setHover(null)
    }
    const cancel = () => {
      down.current = null
      setDragging(false)
      setHover(null)
    }
    return {
      down: (e: PtrLike) => {
        if (e.button !== 0 || isProbeUi(e.target)) return
        down.current = { x: e.clientX, y: e.clientY, moved: false }
      },
      move: (e: PtrLike) => {
        const d = down.current
        if (d && !d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CLICK_SLOP) {
          d.moved = true
          setDragging(true)
          setHover(null)
        }
        if (d?.moved) return
        const q = local(e)
        if (q) schedule(q)
      },
      up: (e: PtrLike) => {
        const d = down.current
        down.current = null
        if (!d) return
        const q = local(e)
        if (d.moved) {
          setDragging(false)
          if (q) schedule(q)
          return
        }
        const c = cfg.current
        if (!q || !c.enabled || !c.pinning || isProbeUi(e.target)) return
        setPins((cur) => {
          const i = cur.findIndex((p) => Math.hypot(p.px - q.x, p.py - q.y) < PIN_HIT)
          if (i >= 0) return cur.filter((_, j) => j !== i)
          const hit = c.pick(q.x, q.y)
          if (!hit) return cur
          const next = [...cur, { px: q.x, py: q.y, hit }]
          while (next.length > Math.max(1, c.maxPins)) next.shift()
          return next
        })
      },
      cancel,
      leave,
    }
  }, [local, schedule])

  const handlers = useMemo(
    () => ({
      onPointerDown: (e: RPointerEvent<HTMLElement>) => native.down(e),
      onPointerMove: (e: RPointerEvent<HTMLElement>) => native.move(e),
      onPointerUp: (e: RPointerEvent<HTMLElement>) => native.up(e),
      onPointerCancel: () => native.cancel(),
      onPointerLeave: () => native.leave(),
    }),
    [native],
  )

  const clear = useCallback(() => setPins([]), [])

  return { rootRef, hover, pins, dragging, enabled, clear, setPins, handlers, native }
}
