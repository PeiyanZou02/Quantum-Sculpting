// The one section container of the app, after Blender's properties editor: a header bar with a
// chevron, a title and an aside (state, counts, tools), and a body that folds. Panels nest (`sub`).
// Open state is remembered per id in this browser.
import { useState, type ReactNode } from 'react'
import { usePanelOpen } from './panelState'
import './ui.css'

export function Panel({ id, title, aside, tools, open: forced, defaultOpen = true, sub, flush, onHeader, children }: {
  id: string
  title: ReactNode
  /** Right of the title: a state dot, a count, a short note. */
  aside?: ReactNode
  /** Small controls at the right end of the header; clicks on them do not fold the panel. */
  tools?: ReactNode
  /** Force open (e.g. while something inside is running). */
  open?: boolean
  defaultOpen?: boolean
  /** A panel inside a panel: lighter header, indented. */
  sub?: boolean
  /** Body without inner padding (lists, maps). */
  flush?: boolean
  /** Called when the header is pressed (before folding). */
  onHeader?: () => void
  children?: ReactNode
}) {
  const [isOpen, toggle] = usePanelOpen(id, defaultOpen)
  const open = forced ?? isOpen
  return (
    <section className={'ux-panel' + (sub ? ' ux-panel--sub' : '') + (open ? ' ux-panel--open' : '')} data-mark={id}>
      <div className="ux-panel__h">
        <button type="button" className="ux-panel__toggle" aria-expanded={open} onClick={() => { onHeader?.(); toggle() }}>
          <span className="ux-chev" aria-hidden />
          <span className="ux-panel__t">{title}</span>
          {aside != null && <span className="ux-panel__aside">{aside}</span>}
        </button>
        {tools && <span className="ux-panel__tools">{tools}</span>}
      </div>
      {open && <div className={'ux-panel__b' + (flush ? ' ux-panel__b--flush' : '')}>{children}</div>}
    </section>
  )
}

/** A property row: label on the left (right-aligned, as in Blender), the control on the right. */
export function Row({ label, tip, children, wide }: { label?: ReactNode; tip?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={'ux-row' + (wide ? ' ux-row--wide' : '')}>
      {!wide && <span className="ux-row__k" data-tip={tip ? (typeof label === 'string' ? label : undefined) : undefined} data-tip-desc={tip}>{label}</span>}
      <div className="ux-row__v">{children}</div>
    </div>
  )
}

/** A read-only fact: label and value, value in ink. */
export function Fact({ k, v, note }: { k: ReactNode; v: ReactNode; note?: ReactNode }) {
  return (
    <div className="ux-fact">
      <span className="ux-fact__k">{k}</span>
      <span className="ux-fact__v">{v}{note != null && <span className="ux-fact__n">{note}</span>}</span>
    </div>
  )
}

/** A short line of guidance; for empty states and warnings. */
export function Note({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return <p className={'ux-note' + (warn ? ' ux-note--warn' : '')}>{children}</p>
}

/** Buttons in a row, sharing the width. */
export function Buttons({ children }: { children: ReactNode }) {
  return <div className="ux-buttons">{children}</div>
}

/** A plain rectangular button: 'primary' (ink), default (field), 'quiet' (no fill). */
export function Button({ children, kind, onClick, disabled, tip, desc, active, icon }: {
  children?: ReactNode; kind?: 'primary' | 'quiet'; onClick?: () => void; disabled?: boolean
  tip?: string; desc?: string; active?: boolean; icon?: ReactNode
}) {
  return (
    <button type="button" className={'ux-btn' + (kind ? ` ux-btn--${kind}` : '') + (active ? ' ux-btn--on' : '')}
      onClick={onClick} disabled={disabled} data-tip={tip} data-tip-desc={desc} aria-pressed={active}>
      {icon}{children}
    </button>
  )
}

/** A checkbox with its label to the right (Blender's boolean row). */
export function Checkbox({ label, checked, onChange, disabled, tip }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; tip?: string }) {
  const [focus, setFocus] = useState(false)
  return (
    <label className={'ux-check' + (disabled ? ' ux-check--off' : '') + (focus ? ' ux-check--focus' : '')} data-tip={tip ? (typeof label === 'string' ? label : undefined) : undefined} data-tip-desc={tip}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
      <span className="ux-check__box" aria-hidden />
      <span className="ux-check__t">{label}</span>
    </label>
  )
}
