// Scroll container with a drawn scrollbar: a 1px rail, a 3px ink thumb, and optional index markers
// (one per section, labelled, clickable) that also act as a scroll-spy.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import './scroll.css'

export interface ScrollMarker { id: string; label: string; icon?: string }
export interface ScrollIndex { markers: ScrollMarker[]; active: string | null; go: (id: string) => void; pos: Record<string, number>; frac: (id: string) => number }

export function ScrollArea({ children, markers, className, style, follow, onActive, bar = true, renderIndex, tail = false }: {
  children: ReactNode
  /** Draw the scrollbar rail and thumb (default true). */
  bar?: boolean
  /** Draw the section index yourself (knots, icon tabs); the built-in labelled markers are skipped. */
  renderIndex?: (index: ScrollIndex) => ReactNode
  /** Section anchors: elements inside with data-mark="<id>". */
  markers?: ScrollMarker[]
  className?: string
  style?: CSSProperties
  /** Stick to the bottom while new content arrives (terminal). */
  follow?: boolean
  /** Room after the last section so every section, the last too, can scroll to the top (section index). */
  tail?: boolean
  onActive?: (id: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)
  const [m, setM] = useState({ top: 0, h: 1, sh: 1 })
  const [pos, setPos] = useState<Record<string, number>>({})
  const [active, setActive] = useState<string | null>(null)
  const [drag, setDrag] = useState<null | { y: number; top: number }>(null)
  const stuck = useRef(true)

  const measure = useCallback(() => {
    const el = box.current
    if (!el) return
    if (tailRef.current && markers?.length) {
      const last = el.querySelector<HTMLElement>(`[data-mark="${markers[markers.length - 1].id}"]`)
      if (last) tailRef.current.style.height = `${Math.max(24, el.clientHeight - last.offsetHeight - 8)}px`
    }
    setM({ top: el.scrollTop, h: el.clientHeight, sh: el.scrollHeight })
    if (markers) {
      const p: Record<string, number> = {}
      let cur: string | null = null
      for (const mk of markers) {
        const t = el.querySelector<HTMLElement>(`[data-mark="${mk.id}"]`)
        if (!t) continue
        p[mk.id] = t.offsetTop
        if (t.offsetTop - 40 <= el.scrollTop) cur = mk.id
      }
      if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2 && markers.length) cur = markers[markers.length - 1].id
      setPos(p)
      cur ??= markers[0]?.id ?? null
      setActive((a) => {
        if (a !== cur && cur) onActive?.(cur)
        return cur
      })
    }
  }, [markers, onActive])

  useLayoutEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const mo = new MutationObserver(() => {
      if (follow && stuck.current) el.scrollTop = el.scrollHeight
      measure()
    })
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    for (const c of Array.from(el.children)) ro.observe(c)
    measure()
    return () => { ro.disconnect(); mo.disconnect() }
  }, [measure, follow])

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const el = box.current!
      const rail = el.clientHeight
      el.scrollTop = drag.top + ((e.clientY - drag.y) / rail) * el.scrollHeight
    }
    const up = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [drag])

  const scrollable = m.sh > m.h + 1
  const th = Math.max(24, (m.h / m.sh) * m.h)
  const ty = scrollable ? (m.top / (m.sh - m.h)) * (m.h - th) : 0
  // read the section's place when asked: content above it may have grown since the last measure
  const go = (id: string) => {
    const el = box.current, t = el?.querySelector<HTMLElement>(`[data-mark="${id}"]`)
    if (!el || !t) return
    el.scrollTo({ top: Math.max(0, t.offsetTop - 4), behavior: 'smooth' })
    setActive(id)   // the index answers the click at once; the scroll-spy agrees once the scroll lands
  }
  const frac = (id: string) => (pos[id] ?? 0) / Math.max(1, m.sh)

  return (
    <div className={'qs-scroll' + (className ? ` ${className}` : '')} style={style}>
      <div
        ref={box}
        className="qs-scroll__box"
        onScroll={(e) => {
          const el = e.currentTarget
          stuck.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
          measure()
        }}
      >
        {children}
        {tail && <div ref={tailRef} aria-hidden />}
      </div>
      {renderIndex && markers && renderIndex({ markers, active, go, pos, frac })}
      {bar && <div className={'qs-scroll__rail' + (scrollable ? '' : ' qs-scroll__rail--idle') + (markers && !renderIndex ? ' qs-scroll__rail--index' : '')}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return
          const r = e.currentTarget.getBoundingClientRect()
          const f = (e.clientY - r.top) / r.height
          box.current?.scrollTo({ top: f * m.sh - m.h / 2, behavior: 'smooth' })
        }}
      >
        <span className="qs-scroll__line" />
        {scrollable && (
          <span
            className={'qs-scroll__thumb' + (drag ? ' qs-scroll__thumb--drag' : '')}
            style={{ top: ty, height: th }}
            onPointerDown={(e) => { e.preventDefault(); setDrag({ y: e.clientY, top: box.current!.scrollTop }) }}
          />
        )}
        {!renderIndex && markers?.map((mk) => pos[mk.id] != null && (
          <button
            key={mk.id}
            className={'qs-scroll__mark' + (active === mk.id ? ' qs-scroll__mark--on' : '')}
            style={{ top: scrollable ? (pos[mk.id] / m.sh) * m.h : (pos[mk.id] / Math.max(1, m.sh)) * m.h }}
            onClick={() => go(mk.id)}
            title={mk.label}
          >
            <span>{mk.label}</span>
          </button>
        ))}
      </div>}
    </div>
  )
}
