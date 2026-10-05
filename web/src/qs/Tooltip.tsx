// One tooltip for the whole page. Any element with data-tip="Name" (optional data-tip-desc,
// data-tip-key, data-tip-side) gets it on hover or keyboard focus, after a short delay.
// A rounded pill with a small pointer. It tries every side and takes the one that covers the fewest
// other controls, so it never sits on the next icon; it stays away while a menu is open.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './tooltip.css'

type Side = 'top' | 'bottom' | 'left' | 'right'
interface Tip { name: string; desc?: string; key?: string; side?: Side; el: HTMLElement }

const GAP = 10
const CONTROLS = 'button, [data-tip], input, select, [role=tab], [role=slider], .qs-pop__panel, .qd-menu, .qs-dd__list'

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number; side: Side; arrow: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warm = useRef(0)

  useEffect(() => {
    let current: HTMLElement | null = null
    const menuOpen = (el: HTMLElement) => {
      const panel = document.querySelector('.qs-pop__panel, .qd-menu, .qs-dd__list')
      return !!panel && !panel.contains(el)
    }
    const show = (el: HTMLElement) => {
      const name = el.dataset.tip
      if (!name || menuOpen(el)) return
      setTip({ name, desc: el.dataset.tipDesc, key: el.dataset.tipKey, side: el.dataset.tipSide as Side | undefined, el })
      warm.current = Date.now()
    }
    const enter = (el: HTMLElement | null) => {
      if (el === current) return
      current = el
      if (timer.current) clearTimeout(timer.current)
      if (!el) { setTip(null); return }
      const delay = Date.now() - warm.current < 600 ? 60 : 420
      timer.current = setTimeout(() => current === el && document.contains(el) && show(el), delay)
    }
    const over = (e: Event) => enter((e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null)
    const hide = () => { if (current) warm.current = Date.now(); enter(null) }
    const down = () => { if (timer.current) clearTimeout(timer.current); setTip(null); current = null }
    document.addEventListener('pointerover', over)
    document.addEventListener('focusin', over)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', down, true)
    document.addEventListener('wheel', down, { capture: true, passive: true })
    window.addEventListener('blur', hide)
    document.documentElement.addEventListener('pointerleave', hide)
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('focusin', over)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', down, true)
      document.removeEventListener('wheel', down, true)
      window.removeEventListener('blur', hide)
      document.documentElement.removeEventListener('pointerleave', hide)
    }
  }, [])

  useLayoutEffect(() => {
    if (!tip || !box.current) { setPos(null); return }
    const b = box.current.getBoundingClientRect(), r = tip.el.getBoundingClientRect()
    const W = window.innerWidth, H = window.innerHeight
    const place = (side: Side) => {
      let x = side === 'right' ? r.right + GAP : side === 'left' ? r.left - GAP - b.width : r.left + r.width / 2 - b.width / 2
      let y = side === 'bottom' ? r.bottom + GAP : side === 'top' ? r.top - GAP - b.height : r.top + r.height / 2 - b.height / 2
      const fits = x >= 4 && y >= 4 && x + b.width <= W - 4 && y + b.height <= H - 4
      x = Math.max(4, Math.min(W - b.width - 4, x))
      y = Math.max(4, Math.min(H - b.height - 4, y))
      return { x, y, side, fits }
    }
    // controls the tooltip would cover, other than the one it belongs to
    const others = [...document.querySelectorAll<HTMLElement>(CONTROLS)]
      .filter((el) => el !== tip.el && !el.contains(tip.el) && !tip.el.contains(el) && !box.current!.contains(el))
      .map((el) => el.getBoundingClientRect())
      .filter((q) => q.width > 0 && q.height > 0 && q.bottom > 0 && q.top < H)
    const covers = (p: { x: number; y: number }) =>
      others.filter((q) => !(q.right <= p.x || q.left >= p.x + b.width || q.bottom <= p.y || q.top >= p.y + b.height)).length
    // prefer the sides that leave a vertical stack's neighbours alone, then the asked-for side
    const parent = tip.el.parentElement
    const column = parent && getComputedStyle(parent).flexDirection.startsWith('column')
    const order: Side[] = column ? ['right', 'left', 'bottom', 'top'] : ['bottom', 'top', 'right', 'left']
    if (tip.side) order.unshift(tip.side)
    const tried = [...new Set(order)].map(place).filter((p) => p.fits)
    const best = (tried.length ? tried : [place('bottom')]).reduce((a, p) => (covers(p) < covers(a) ? p : a))
    const arrow = best.side === 'top' || best.side === 'bottom'
      ? Math.max(12, Math.min(b.width - 12, r.left + r.width / 2 - best.x))
      : Math.max(10, Math.min(b.height - 10, r.top + r.height / 2 - best.y))
    setPos({ x: best.x, y: best.y, side: best.side, arrow })
  }, [tip])

  if (!tip) return null
  return (
    <div ref={box} role="tooltip"
      className={'qs-tip' + (pos ? ' qs-tip--on' : '') + (tip.desc ? ' qs-tip--rich' : '')}
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, ['--arrow' as string]: `${pos?.arrow ?? 0}px` }}
      data-side={pos?.side}>
      <div className="qs-tip__head">
        <span className="qs-tip__name">{tip.name}</span>
        {tip.key && <kbd className="qs-tip__key">{tip.key}</kbd>}
      </div>
      {tip.desc && <span className="qs-tip__desc">{tip.desc}</span>}
    </div>
  )
}
