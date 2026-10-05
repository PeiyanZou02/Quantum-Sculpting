// Flat 2D slider: hairline track, ink fill to the value, a small square thumb, tick marks.
// Label and value sit on one line above it (the research layout's "field-head").
import { useRef, useState, type ReactNode } from 'react'
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

export function Slider({ label, value, min, max, step = 0.01, onChange, onCommit, format, ticks = 10, origin, defaultValue, disabled, help }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
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
  return (
    <div className={'qs-slider' + (disabled ? ' qs-slider--off' : '')}>
      <div className="qs-field-head">
        <span>{label}</span>
        <output>{format ? format(value) : value.toFixed(decimals)}</output>
      </div>
      <div
        ref={ref}
        className={'qs-slider__track' + (drag ? ' qs-slider__track--drag' : '')}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={(e) => {
          if (disabled) return
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
        onDoubleClick={() => defaultValue != null && (onChange(defaultValue), onCommit?.(defaultValue))}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
          if (!d) return
          e.preventDefault()
          const v = snap(value + d * step * (e.shiftKey ? 10 : 1))
          onChange(v)
          onCommit?.(v)
        }}
      >
        <svg className="qs-slider__ticks" preserveAspectRatio="none" viewBox="0 0 100 6">
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <line key={i} x1={(i / ticks) * 100} x2={(i / ticks) * 100} y1={i % 5 === 0 ? 0 : 2} y2="6" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="qs-slider__rail" />
        <div className="qs-slider__fill" style={{ left: `${Math.min(o, p) * 100}%`, width: `${Math.abs(p - o) * 100}%` }} />
        <div className="qs-slider__thumb" style={{ left: `${p * 100}%` }} />
      </div>
      {help && <p className="qs-help">{help}</p>}
    </div>
  )
}

/** Native select, drawn as a hairline pill. */
export function Select<T extends string>({ label, value, options, onChange, help, disabled }: {
  label?: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; help?: ReactNode; disabled?: boolean
}) {
  return (
    <label className="qs-select-field">
      {label && <span className="qs-field-label">{label}</span>}
      <span className="qs-select">
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </span>
      {help && <span className="qs-help">{help}</span>}
    </label>
  )
}

/** Underlined numeric/text input with a label. */
export function Input({ label, value, onChange, type = 'text', placeholder, min, max, step, suffix, help }: {
  label: ReactNode; value: string | number; onChange: (v: string) => void; type?: 'text' | 'number'
  placeholder?: string; min?: number; max?: number; step?: number; suffix?: ReactNode; help?: ReactNode
}) {
  return (
    <label className="qs-input-field">
      <span className="qs-field-label">{label}</span>
      <span className="qs-input">
        <input type={type} value={value} placeholder={placeholder} min={min} max={max} step={step} spellCheck={false}
          onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="qs-input__suffix">{suffix}</span>}
      </span>
      {help && <span className="qs-help">{help}</span>}
    </label>
  )
}
