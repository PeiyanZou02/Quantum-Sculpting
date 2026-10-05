// Header popover, after Blender's viewport menus: a split button (icon + chevron) that opens a panel
// under it. Closes on outside click or Escape; stays inside the window.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import './popover.css'

export function Popover({ icon, title, desc, on, onIcon, children, width = 280, align = 'right' }: {
  icon: string
  title: string
  desc?: string
  /** The icon half shows this state (e.g. overlays on). */
  on?: boolean
  /** Clicking the icon half toggles something; the chevron opens the panel. Without it, both halves open the panel. */
  onIcon?: () => void
  children: ReactNode
  width?: number
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key) }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !panel.current) return setShift(0)
    const r = panel.current.getBoundingClientRect()
    setShift(r.left < 8 ? 8 - r.left : r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0)
  }, [open])

  return (
    <div className="qs-pop" ref={root}>
      <div className={'qs-pop__btn' + (open ? ' qs-pop__btn--open' : '')}>
        <button className={'qs-pop__icon' + (on ? ' qs-pop__icon--on' : '')} aria-label={title}
          data-tip={title} data-tip-desc={desc} onClick={() => (onIcon ? onIcon() : setOpen(!open))}>
          <Icon name={icon} />
        </button>
        <button className="qs-pop__chev" aria-label={`${title} options`} aria-expanded={open} data-tip={`${title} options`} onClick={() => setOpen(!open)}>
          <Icon name="chevDown" size={12} />
        </button>
      </div>
      {open && (
        <div ref={panel} className={'qs-pop__panel qs-pop__panel--' + align} style={{ width, transform: `translateX(${shift}px)` }} role="dialog" aria-label={title}>
          <span className="qs-pop__title">{title}</span>
          {children}
        </div>
      )}
    </div>
  )
}

/** A labelled section inside a popover. */
export function PopSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="qs-pop__sec">
      {label && <span className="qs-pop__label">{label}</span>}
      {children}
    </div>
  )
}

/** A checkbox row: square ink box and label. A note, if any, is the row's tooltip, not more text beside it. */
export function Check({ label, note, checked, onChange, disabled }: { label: string; note?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={'qs-check' + (disabled ? ' qs-check--off' : '')} data-tip={note ? label : undefined} data-tip-desc={note}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="qs-check__box" />
      <span className="qs-check__t">{label}</span>
    </label>
  )
}
