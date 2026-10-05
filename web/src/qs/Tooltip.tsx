// One tooltip for the whole page. Any element with data-tip="Name" (optional data-tip-desc,
// data-tip-key, data-tip-side) gets it on hover or keyboard focus, after a short delay.
// Ink box, mono name, sans description, square corners; it flips to stay inside the window.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './tooltip.css'

interface Tip { name: string; desc?: string; key?: string; side: string; rect: DOMRect }

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number; side: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warm = useRef(0)            // once one tip has shown, neighbours show at once

  useEffect(() => {
    let current: HTMLElement | null = null
    const show = (el: HTMLElement) => {
      const name = el.dataset.tip
      if (!name) return
      setTip({ name, desc: el.dataset.tipDesc, key: el.dataset.tipKey, side: el.dataset.tipSide ?? 'auto', rect: el.getBoundingClientRect() })
      warm.current = Date.now()
    }
    const enter = (el: HTMLElement | null) => {
      if (el === current) return
      current = el
      if (timer.current) clearTimeout(timer.current)
      if (!el) { setTip(null); return }
      const delay = Date.now() - warm.current < 600 ? 0 : 380
      timer.current = setTimeout(() => current === el && document.contains(el) && show(el), delay)
    }
    const over = (e: Event) => enter((e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null)
    const hide = () => { if (current) warm.current = Date.now(); enter(null) }
    const down = () => { if (timer.current) clearTimeout(timer.current); setTip(null); current = null }
    document.addEventListener('pointerover', over)
    document.addEventListener('focusin', over)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', down, true)
    window.addEventListener('blur', hide)
    document.addEventListener('pointerleave', hide)
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('focusin', over)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', down, true)
      window.removeEventListener('blur', hide)
      document.removeEventListener('pointerleave', hide)
    }
  }, [])

  useLayoutEffect(() => {
    if (!tip || !box.current) { setPos(null); return }
    const b = box.current.getBoundingClientRect(), r = tip.rect, gap = 8, W = window.innerWidth, H = window.innerHeight
    const fits = {
      bottom: r.bottom + gap + b.height < H - 4,
      top: r.top - gap - b.height > 4,
      right: r.right + gap + b.width < W - 4,
      left: r.left - gap - b.width > 4,
    }
    const order = tip.side !== 'auto' ? [tip.side, 'bottom', 'top', 'right', 'left'] : ['bottom', 'top', 'right', 'left']
    const side = order.find((s) => fits[s as keyof typeof fits]) ?? 'bottom'
    let x = side === 'right' ? r.right + gap : side === 'left' ? r.left - gap - b.width : r.left + r.width / 2 - b.width / 2
    let y = side === 'bottom' ? r.bottom + gap : side === 'top' ? r.top - gap - b.height : r.top + r.height / 2 - b.height / 2
    x = Math.max(4, Math.min(W - b.width - 4, x))
    y = Math.max(4, Math.min(H - b.height - 4, y))
    setPos({ x, y, side })
  }, [tip])

  if (!tip) return null
  return (
    <div ref={box} className={'qs-tip' + (pos ? ' qs-tip--on' : '')} role="tooltip"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }} data-side={pos?.side}>
      <div className="qs-tip__head">
        <span className="qs-tip__name">{tip.name}</span>
        {tip.key && <kbd className="qs-tip__key">{tip.key}</kbd>}
      </div>
      {tip.desc && <span className="qs-tip__desc">{tip.desc}</span>}
    </div>
  )
}
