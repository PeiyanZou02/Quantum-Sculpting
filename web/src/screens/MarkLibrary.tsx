// The component library and the layer list, as plain named rows. Library rows are grouped (frames and
// guides, camera and orbit, data, pointers and scan). Hovering a row shows it on the view with
// everything else dimmed; a click turns it on or off; in Present a row can be dragged onto the view to
// put it exactly there. The layer list is what is on the view: visibility, remove, and when opened its
// emphasis, line weight, dash spacing and size.
import { type ReactNode } from 'react'
import { useStore } from '../store'
import { usePresent, type Look } from '../present'
import { FAMILIES, chosenOf, keyOf, savePng, variantsOf } from '../hud/Composer'
import type { HudModule } from '../hud/types'
import { Slider } from '../qs/Slider'
import { Segmented } from '../qs/Segmented'
import { IconButton } from '../qs/Icon'

/** Sentence case for the library's short names ("polar" → "Polar"). */
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
export const familyOf = (id: string) => FAMILIES.find((f) => f.id === id)
export const nameOf = (m: HudModule) => `${familyOf(m.family)?.title ?? m.family} · ${cap(m.label)}`

/** The MIME type a dragged library row carries: "family:variant", or "text". */
export const MARK_MIME = 'application/x-qs-mark'

export const GROUPS: { id: string; title: string; fams: string[] }[] = [
  { id: 'frame', title: 'Frames and guides', fams: ['frame', 'focus', 'bounds'] },
  { id: 'camera', title: 'Camera and orbit', fams: ['orbit', 'camera', 'dial'] },
  { id: 'data', title: 'Data', fams: ['meta', 'cards', 'slicecard', 'stages', 'captures', 'steps'] },
  { id: 'point', title: 'Pointers and scan', fams: ['selection', 'callout', 'scan'] },
]

export const TIERS: { v: 1 | 2 | 3; t: string }[] = [{ v: 1, t: 'Primary' }, { v: 2, t: 'Secondary' }, { v: 3, t: 'Tertiary' }]

/** One library row: the name, and a dot when it is on. */
export function LibRow({ on, name, drag, onToggle, onHover, onDragStart }: {
  on: boolean; name: string; drag?: string
  onToggle: () => void; onHover?: (h: boolean) => void; onDragStart?: () => void
}) {
  return (
    <div role="switch" tabIndex={0} aria-checked={on} aria-label={name} className={'mk-row' + (on ? ' mk-row--on' : '') + (drag ? ' mk-row--drag' : '')}
      draggable={!!drag}
      onDragStart={(e) => {
        if (!drag) return
        onHover?.(false)
        e.dataTransfer.setData(MARK_MIME, drag)
        e.dataTransfer.effectAllowed = 'copy'
        onDragStart?.()
      }}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      onPointerEnter={() => onHover?.(true)} onFocus={() => onHover?.(true)} onPointerLeave={() => onHover?.(false)} onBlur={() => onHover?.(false)}>
      <span className="mk-row__t">{name}</span>
      <span className="mk-dot" aria-hidden />
    </div>
  )
}

/** Every component as a named row, grouped. Hover: see it on the view, the rest dimmed (one already on
 *  is singled out). Click: on, click again: off. Present: drag a row onto the view to put it there. */
export function MarkLibrary({ compose, drag = false, onToggle, onPreview, onDragStart, guides, extra }: {
  compose: Record<string, string>; drag?: boolean
  onToggle: (fam: string, id: string, on: boolean) => void
  /** Hovering: the row's key and whether it is on already; null when the pointer leaves. */
  onPreview?: (key: string | null, on: boolean) => void
  onDragStart?: () => void
  /** Rows at the top of "Frames and guides" (Present: the bounding box and print grid). */
  guides?: ReactNode
  /** Rows after the groups (Present: free text). */
  extra?: ReactNode
}) {
  return (
    <div className="mk" onPointerLeave={() => onPreview?.(null, false)}>
      {GROUPS.map((g) => (
        <div key={g.id} className="mk-group">
          <span className="mk-group__t">{g.title}</span>
          {g.id === 'frame' && guides}
          {g.fams.map((fid) => {
            const f = familyOf(fid)
            if (!f) return null
            const on = variantsOf(compose, f.id)
            return (
              <div key={f.id} className="mk-fam">
                <span className="mk-fam__t">{f.title}</span>
                {f.modules.map((m) => {
                  const isOn = on.includes(m.id)
                  return (
                    <LibRow key={m.id} on={isOn} name={cap(m.label)} drag={drag ? keyOf(m) : undefined}
                      onToggle={() => { onToggle(f.id, m.id, !isOn); onPreview?.(keyOf(m), !isOn) }}
                      onHover={(h) => onPreview?.(h ? keyOf(m) : null, isOn)}
                      onDragStart={onDragStart} />
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
      {extra}
    </div>
  )
}

/** The element a piece is drawn in on the view (for PNGs). */
const pieceEl = (k: string) =>
  document.querySelector<HTMLElement>(`.stage__view .hud-layer > [data-hud="${k}"], .stage__view [data-hud="${k}"] > .hud-piece__body`)

/** The print grid's cell size, in mm when the grid is known. */
export function FloorSize() {
  const p = usePresent()
  const grid = useStore((s) => s.grid)
  const side = grid ? grid.n * grid.voxel_size : null
  return (
    <Slider label="Cell size" value={p.guides.div} min={1} max={32} step={1} ticks={8}
      format={(v) => (side ? `${(side / v).toFixed(side / v < 10 ? 1 : 0)} mm` : `${v} a side`)}
      onChange={(v) => p.setGuides({ div: v })} />
  )
}

/** What is on the view, one row each. Click a row to open its settings (a piece selected on the view
 *  opens its row too): emphasis, line weight, dash spacing, size, back to its place, PNG. */
export function LayerList() {
  const p = usePresent()
  const mods = chosenOf(p.compose)
  const items: { k: string; name: string; m?: HudModule; text?: string; guide?: 'box' | 'floor' }[] = [
    ...(p.guides.box ? [{ k: 'guide:box', name: 'Bounding box', guide: 'box' as const }] : []),
    ...(p.guides.floor ? [{ k: 'guide:floor', name: 'Print grid', guide: 'floor' as const }] : []),
    ...mods.map((m) => ({ k: keyOf(m), name: nameOf(m), m })),
    ...p.texts.map((t) => ({ k: `text:${t.id}`, name: `Text · ${t.text}`, text: t.text })),
  ]
  if (!items.length) return <span className="pd-empty">Nothing on the view yet.</span>
  return (
    <div className="ly" onPointerLeave={() => p.setHl(null)}>
      {items.map(({ k, name, m, text, guide }) => {
        const look = p.looks[k] ?? {}
        const open = p.sel === k
        const moved = !!p.pos[`present|${k}`]
        const sized = !guide && (!m || (m.slot !== 'object' && m.slot !== 'full'))
        const changed = ['tier', 'weight', 'dash', 'size'].some((x) => look[x as keyof Look] != null)
        const remove = () => (guide ? p.setGuides({ [guide]: false }) : p.removePiece(k))
        const hasProps = !guide || guide === 'floor'
        const toggle = () => hasProps && p.setSel(open ? null : k)
        return (
          <div key={k} className={'ly-row' + (open ? ' ly-row--open' : '') + (look.hidden ? ' ly-row--hidden' : '')} onPointerEnter={() => p.setHl(k)}>
            <div className="ly-row__main" role="button" tabIndex={0} aria-expanded={hasProps ? open : undefined}
              onClick={toggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}>
              <span className="ly-row__t">{name}</span>
              <span className="ly-row__tools" onClick={(e) => e.stopPropagation()}>
                {!guide && <IconButton name={look.hidden ? 'eyeOff' : 'eye'} size={22} dim={look.hidden} title={look.hidden ? 'Show' : 'Hide'} onClick={() => p.setLook(k, { hidden: !look.hidden })} />}
                <IconButton name="clear" size={22} title="Remove" onClick={remove} />
              </span>
            </div>
            {open && guide === 'floor' && <div className="ly-props"><FloorSize /></div>}
            {open && !guide && (
              <div className="ly-props">
                {text != null && <input className="pd-in" value={text} aria-label="Text" onChange={(e) => p.setText(k.slice(5), e.target.value)} />}
                <Segmented<string> size="s" value={String(look.tier ?? 1)} onChange={(v) => p.setLook(k, { tier: +v as 1 | 2 | 3 })}
                  options={TIERS.map((t) => ({ value: String(t.v), label: t.t }))} />
                {m && <Slider label="Line weight" value={look.weight ?? 1} min={0.25} max={3} step={0.05} ticks={11} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => p.setLook(k, { weight: v })} />}
                {m && <Slider label="Dash spacing" value={look.dash ?? 1} min={0} max={3} step={0.05} ticks={12} format={(v) => (v === 0 ? 'solid' : `${v.toFixed(2)}×`)} onChange={(v) => p.setLook(k, { dash: v })} />}
                {sized && <Slider label="Size" value={look.size ?? 1} min={0.6} max={2.4} step={0.05} ticks={10} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => p.setLook(k, { size: v })} />}
                <div className="pd-row">
                  {moved && m && <button className="pd-chip pd-chip--s" onClick={() => p.setPos(`present|${k}`, null)}>Back to its place</button>}
                  <button className="pd-chip pd-chip--s" onClick={() => { const el = pieceEl(k); if (el) savePng(el, m ? nameOf(m) : 'text').catch(() => {}) }}>Save PNG</button>
                  <span className="pd-grow" />
                  {changed && <button className="pd-chip pd-chip--s" onClick={() => p.setLook(k, { tier: undefined, weight: undefined, dash: undefined, size: undefined })}>Reset</button>}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
