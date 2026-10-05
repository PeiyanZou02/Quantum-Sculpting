// Form controls in the app's one language. A number is a Blender-style field: label on the left, a field
// that fills to the value; drag across it, double-click (or Enter) to type, arrows to step.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './forms.css'

export interface SliderProps {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  format?: (v: number) => ReactNode
  /** Number of tick intervals (default: 10). */
  ticks?: number
  /** Value the track fills from (for signed ranges, e.g. 0 on −4…4). */
  origin?: number
  /** Double-click resets to this. */
  defaultValue?: number
  disabled?: boolean
  help?: ReactNode
}

export function Slider({ label, value, min, max, step = 0.01, onChange, onCommit, format, origin, defaultValue, disabled, help }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const [typing, setTyping] = useState<string | null>(null)
  const span = max - min || 1
  const f = (v: number) => (Math.min(max, Math.max(min, v)) - min) / span
  const o = f(origin ?? min)
  const p = f(value)
  const snap = (v: number) => {
    const s = Math.round((v - min) / step) * step + min
    return +Math.min(max, Math.max(min, s)).toFixed(6)
  }
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return snap(min + ((clientX - r.left) / r.width) * span)
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const commitTyped = () => {
    if (typing == null) return
    const t = typing.trim()
    const v = t === '' && defaultValue != null ? defaultValue : parseFloat(t)
    setTyping(null)
    if (Number.isFinite(v)) { const s = snap(v); onChange(s); onCommit?.(s) }
  }
  const tip = typeof help === 'string' ? help : undefined
  return (
    <div className={'ux-row ux-num' + (disabled ? ' ux-num--off' : '')}>
      <span className="ux-row__k" data-tip={tip && typeof label === 'string' ? label : undefined} data-tip-desc={tip}>{label}</span>
      <div className="ux-row__v">
        {typing != null ? (
          <input className="ux-num__in" autoFocus value={typing} onChange={(e) => setTyping(e.target.value)}
            onBlur={commitTyped} onKeyDown={(e) => { if (e.key === 'Enter') commitTyped(); if (e.key === 'Escape') setTyping(null) }} />
        ) : (
          <div
            ref={ref}
            className={'ux-num__f' + (drag ? ' ux-num__f--drag' : '')}
            role="slider"
            aria-label={typeof label === 'string' ? label : undefined}
            aria-valuetext={String(format ? format(value) : value)}
            tabIndex={disabled ? -1 : 0}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            data-tip={tip ? undefined : 'Drag, or double-click to type'}
            onPointerDown={(e) => {
              if (disabled || e.button !== 0 || e.detail > 1) return
              e.currentTarget.setPointerCapture(e.pointerId)
              setDrag(true)
              onChange(at(e.clientX))
            }}
            onPointerMove={(e) => drag && onChange(at(e.clientX))}
            onPointerUp={(e) => {
              if (!drag) return
              setDrag(false)
              onCommit?.(at(e.clientX))
            }}
            onDoubleClick={() => !disabled && setTyping(value.toFixed(decimals))}
            onKeyDown={(e) => {
              // arrows step (Shift: ten steps), Page Up/Down ten steps, Home/End the ends, Enter types
              const k = e.key
              if (k === 'Enter') { e.preventDefault(); setTyping(value.toFixed(decimals)); return }
              const d = k === 'ArrowRight' || k === 'ArrowUp' ? 1 : k === 'ArrowLeft' || k === 'ArrowDown' ? -1 : k === 'PageUp' ? 10 : k === 'PageDown' ? -10 : 0
              if (!d && k !== 'Home' && k !== 'End') return
              e.preventDefault()
              const v = k === 'Home' ? min : k === 'End' ? max : snap(value + d * step * (e.shiftKey ? 10 : 1))
              onChange(v)
              onCommit?.(v)
            }}
          >
            <span className="ux-num__fill" style={{ left: `${Math.min(o, p) * 100}%`, width: `${Math.abs(p - o) * 100}%` }} />
            <span className="ux-num__v">{format ? format(value) : value.toFixed(decimals)}</span>
          </div>
        )}
      </div>
      {help && typeof help !== 'string' && <p className="ux-note">{help}</p>}
    </div>
  )
}

/** Dropdown in the design language: a pill trigger opening a list of pill rows (not the OS menu).
 *  Keyboard: Enter/Space/↓ opens; ↑ ↓ Home End move; Enter picks; Esc closes. */
export function Select<T extends string>({ label, value, options, onChange, help, disabled }: {
  label?: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; help?: ReactNode; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ x: number; y: number; w: number; up: boolean } | null>(null)
  const cur = options.find((o) => o.value === value)
  const openList = () => {
    if (disabled) return
    const r = btn.current!.getBoundingClientRect()
    const need = Math.min(280, options.length * 30 + 10)
    const up = r.bottom + need > window.innerHeight - 8 && r.top > need
    setRect({ x: r.left, y: up ? r.top - 6 : r.bottom + 6, w: r.width, up })
    setHi(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('pointerdown', down, true); window.removeEventListener('resize', close) }
  }, [open])
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>('[data-hi="1"]')?.scrollIntoView({ block: 'nearest' }) }, [open, hi])
  const pick = (v: T) => { setOpen(false); if (v !== value) onChange(v); btn.current?.focus() }
  const key = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openList() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0) }
    else if (e.key === 'End') { e.preventDefault(); setHi(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[hi].value) }
    else if (e.key === 'Tab') setOpen(false)
  }
  return (
    <div className={label ? 'ux-row' : 'ux-row ux-row--wide'}>
      {label && <span className="ux-row__k" data-tip={typeof help === 'string' && typeof label === 'string' ? label : undefined} data-tip-desc={typeof help === 'string' ? help : undefined}>{label}</span>}
      <button ref={btn} type="button" className={'qs-dd' + (open ? ' qs-dd--open' : '')} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? setOpen(false) : openList())} onKeyDown={key}>
        <span className="qs-dd__v">{cur?.label ?? '—'}</span>
        <span className="qs-dd__chev" />
      </button>
      {open && rect && createPortal(
        <div ref={list} className={'qs-dd__list' + (rect.up ? ' qs-dd__list--up' : '')} role="listbox"
          style={{ left: rect.x, top: rect.up ? undefined : rect.y, bottom: rect.up ? window.innerHeight - rect.y : undefined, minWidth: rect.w }}>
          {options.map((o, i) => (
            <div key={o.value} role="option" aria-selected={o.value === value} data-hi={i === hi ? '1' : undefined}
              className={'qs-dd__opt' + (o.value === value ? ' qs-dd__opt--on' : '') + (i === hi ? ' qs-dd__opt--hi' : '')}
              onPointerEnter={() => setHi(i)} onClick={() => pick(o.value)}>
              <span className="qs-dd__tick" />
              <span>{o.label}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
      {help && typeof help !== 'string' && <span className="ux-note">{help}</span>}
    </div>
  )
}

/** Underlined numeric/text input with a label. */
export function Input({ label, value, onChange, type = 'text', placeholder, min, max, step, suffix, help }: {
  label: ReactNode; value: string | number; onChange: (v: string) => void; type?: 'text' | 'number'
  placeholder?: string; min?: number; max?: number; step?: number; suffix?: ReactNode; help?: ReactNode
}) {
  return (
    <label className="ux-row">
      <span className="ux-row__k" data-tip={typeof help === 'string' && typeof label === 'string' ? label : undefined} data-tip-desc={typeof help === 'string' ? help : undefined}>{label}</span>
      <span className="qs-input">
        <input type={type} value={value} placeholder={placeholder} min={min} max={max} step={step} spellCheck={false}
          onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="qs-input__suffix">{suffix}</span>}
      </span>
      {help && typeof help !== 'string' && <span className="ux-note">{help}</span>}
    </label>
  )
}
