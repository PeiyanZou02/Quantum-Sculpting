import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import './qs.css'

export interface TextFieldProps {
  value: string
  onChange: (v: string) => void
  /** Fires on Enter and on blur. */
  onCommit?: (v: string) => void
  /** 11px ink3 label above the line ("Run name", "File name"). */
  label?: string
  placeholder?: string
  /** Fixed ink3 text at the right end of the line (".stl + .json"). */
  suffix?: ReactNode
  /** Error message: the line turns dashed ink and the message shows below as "! message". */
  error?: string
  disabled?: boolean
  style?: CSSProperties
}

/**
 * Underlined 13px mono field (QLButtons4 "Text field"; Sc03 "Run name", Sc07 "File name").
 * Empty: ink4 line, ink3 placeholder. Filled: ink line. Focus: 2px ink line. Error: dashed ink. Disabled: dashed ink4.
 */
export function TextField({ value, onChange, onCommit, label, placeholder, suffix, error, disabled = false, style }: TextFieldProps) {
  const id = useId()
  const cls = ['qs-field', !value && 'qs-field--empty', error && 'qs-field--error', disabled && 'qs-field--disabled'].filter(Boolean).join(' ')
  return (
    <div className={cls} style={style}>
      {label && <label className="qs-field__label" htmlFor={id}>{label}</label>}
      <div className="qs-field__line">
        <input
          id={id}
          className="qs-field__input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!error || undefined}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onCommit?.(value); e.currentTarget.blur() } }}
          onBlur={() => onCommit?.(value)}
        />
        {suffix != null && <span className="qs-field__suffix">{suffix}</span>}
      </div>
      {error && <span className="qs-field__msg">! {error}</span>}
    </div>
  )
}
