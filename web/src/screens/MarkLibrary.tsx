// The component library and the layer list, as compact rows. Library rows are grouped (frames and
// guides, camera and orbit, data, pointers and scan); each has a small live preview of the mark.
// Hovering a row shows it on the view with everything else dimmed; a click turns it on or off; in
// Present a row can be dragged onto the view to put it exactly there. The layer list is what is on the
// view: visibility, remove, and when opened its emphasis, line weight, dash spacing and size.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { usePresent, type Look } from '../present'
import { FAMILIES, MarkThumb, chosenOf, keyOf, savePng, variantsOf } from '../hud/Composer'
import type { HudCtx, HudModule } from '../hud/types'
import { live } from '../live'
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

/** A still of the view and the HUD context, taken when asked and when what is shown changes. */
export function useSnap() {
  const [snap, setSnap] = useState<{ ctx: HudCtx | undefined; bg: string | null }>(() => ({ ctx: live.ctx, bg: live.engine?.snapshot(420) ?? null }))
  const view = useStore((s) => s.view), proc = useStore((s) => s.procData), grid = useStore((s) => s.gridData)
  const shading = useStore((s) => s.shading), theme = useStore((s) => s.theme), model = useStore((s) => s.model)
  const turn = useStore((s) => s.evolve.frameTurn)
  const take = () => setSnap({ ctx: live.ctx, bg: live.engine?.snapshot(420) ?? null })
  useEffect(() => {
    const t = [setTimeout(take, 450), setTimeout(take, 1600)]   // the second catches a view still settling after a load
    return () => t.forEach(clearTimeout)
  }, [view, proc, grid, shading, theme, model, turn])
  // a still taken while the page was hidden or another size is stale: take it again
  useEffect(() => {
    let t = 0
    const again = () => { clearTimeout(t); t = window.setTimeout(() => { if (document.visibilityState === 'visible') take() }, 300) }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('resize', again)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', again); window.removeEventListener('resize', again) }
  }, [])
  return { ...snap, refresh: take }
}

/** Mounts children only once scrolled near, so a long library stays light. */
function Lazy({ h, children }: { h: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setSeen(true) }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return <div ref={ref} style={seen ? undefined : { height: h }}>{seen && children}</div>
}

export const TIERS: { v: 1 | 2 | 3; t: string; d: string }[] = [
  { v: 1, t: 'Primary', d: 'Full ink: what the picture is about.' },
  { v: 2, t: 'Secondary', d: 'A step back: supporting readouts.' },
  { v: 3, t: 'Tertiary', d: 'Faint: structure and context.' },
]

const ROW = 34
/** One library row: a small preview, the name, and a dot when it is on. */
export function LibRow({ on, thumb, name, note, drag, onToggle, onHover, onDragStart }: {
  on: boolean; thumb: ReactNode; name: string; note?: string; drag?: string
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
      {thumb}
      <span className="mk-row__t">{name}{note && <em>{note}</em>}</span>
      <span className="mk-dot" aria-hidden />
    </div>
  )
}

/** Every component as a row, grouped. Hover: see it on the view, the rest dimmed (one already on is
 *  singled out). Click: on, click again: off. Present: drag a row onto the view to put it there. */
export function MarkLibrary({ compose, looks = {}, drag = false, onToggle, onPreview, onDragStart, guides, extra }: {
  compose: Record<string, string>; looks?: Record<string, Look>; drag?: boolean
  onToggle: (fam: string, id: string, on: boolean) => void
  /** Hovering: the row's key and whether it is on already; null when the pointer leaves. */
  onPreview?: (key: string | null, on: boolean) => void
  onDragStart?: () => void
  /** Rows at the top of "Frames and guides" (Present: the bounding box and print grid). */
  guides?: ReactNode
  /** Rows after the groups (Present: free text). */
  extra?: ReactNode
}) {
  const { ctx, bg, refresh } = useSnap()
  return (
    <div className="mk" onPointerEnter={refresh} onPointerLeave={() => onPreview?.(null, false)}>
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
                <span className="mk-fam__t">{f.title}{on.length > 0 && <em>{on.length} on</em>}</span>
                <Lazy h={f.modules.length * ROW}>
                  {f.modules.map((m) => {
                    const isOn = on.includes(m.id)
                    return (
                      <LibRow key={m.id} on={isOn} name={cap(m.label)} drag={drag ? keyOf(m) : undefined}
                        thumb={ctx ? <MarkThumb m={m} ctx={ctx} bg={bg} w={44} h={28} look={looks[keyOf(m)]} /> : <span className="mini" style={{ width: 44, height: 28 }} />}
                        onToggle={() => { onToggle(f.id, m.id, !isOn); onPreview?.(keyOf(m), !isOn) }}
                        onHover={(h) => onPreview?.(h ? keyOf(m) : null, isOn)}
                        onDragStart={onDragStart} />
                    )
                  })}
                </Lazy>
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

/** The print grid's cell size: lines across the floor, shown in mm when the grid is known. */
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

/** What is on the view, as rows. Click a row to open its settings (a piece selected on the view opens
 *  its row too): emphasis, line weight, dash spacing, size, back to its place, PNG. */
export function LayerList() {
  const p = usePresent()
  const { ctx, bg } = useSnap()
  const mods = chosenOf(p.compose)
  const items: { k: string; title: string; sub: string; m?: HudModule; text?: string; guide?: 'box' | 'floor' }[] = [
    ...(p.guides.box ? [{ k: 'guide:box', title: 'Bounding box', sub: 'the grid volume', guide: 'box' as const }] : []),
    ...(p.guides.floor ? [{ k: 'guide:floor', title: 'Print grid', sub: `${p.guides.div} cells a side`, guide: 'floor' as const }] : []),
    ...mods.map((m) => ({ k: keyOf(m), title: familyOf(m.family)?.title ?? m.family, sub: cap(m.label), m })),
    ...p.texts.map((t) => ({ k: `text:${t.id}`, title: 'Text', sub: t.text, text: t.text })),
  ]
  if (!items.length) return <span className="pd-empty">Nothing on the view yet. Turn components on in the library.</span>
  return (
    <div className="ly" onPointerLeave={() => p.setHl(null)}>
      {items.map(({ k, title, sub, m, text, guide }) => {
        const look = p.looks[k] ?? {}
        const open = p.sel === k
        const moved = !!p.pos[`present|${k}`]
        const sized = !guide && (!m || (m.slot !== 'object' && m.slot !== 'full'))
        const changed = ['tier', 'weight', 'dash', 'size'].some((x) => look[x as keyof Look] != null)
        const remove = () => (guide ? p.setGuides({ [guide]: false }) : p.removePiece(k))
        const hasProps = !guide || guide === 'floor'
        return (
          <div key={k} className={'ly-row' + (open ? ' ly-row--open' : '') + (look.hidden ? ' ly-row--hidden' : '')} onPointerEnter={() => p.setHl(k)}>
            <div className="ly-row__main" role="button" tabIndex={0} aria-expanded={open}
              onClick={() => hasProps && p.setSel(open ? null : k)}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && hasProps) { e.preventDefault(); p.setSel(open ? null : k) } }}>
              {m && ctx ? <MarkThumb m={m} ctx={ctx} bg={bg} w={40} h={26} look={look} /> : <span className="mini ly-row__txt" style={{ width: 40, height: 26 }}>{guide ? (guide === 'box' ? '⬚' : '#') : 'Aa'}</span>}
              <span className="ly-row__t">{title}<em>{sub}{changed ? ' · adjusted' : ''}{moved ? ' · moved' : ''}</em></span>
              <span className="ly-row__tools" onClick={(e) => e.stopPropagation()}>
                {!guide && <IconButton name={look.hidden ? 'eyeOff' : 'eye'} size={22} dim={look.hidden} title={look.hidden ? 'Show' : 'Hide'} desc="Keep it in the composition but leave it off the view." onClick={() => p.setLook(k, { hidden: !look.hidden })} />}
                <IconButton name="clear" size={22} title="Remove" desc="Take it off the view." onClick={remove} />
              </span>
            </div>
            {open && guide === 'floor' && <div className="ly-props"><FloorSize /></div>}
            {open && !guide && (
              <div className="ly-props">
                {text != null && (
                  <label className="pd-field"><span className="pd-k">Text</span>
                    <input className="pd-in" value={text} onChange={(e) => p.setText(k.slice(5), e.target.value)} />
                  </label>
                )}
                <div className="pd-field"><span className="pd-k">Emphasis</span>
                  <Segmented<string> size="s" value={String(look.tier ?? 1)} onChange={(v) => p.setLook(k, { tier: +v as 1 | 2 | 3 })}
                    options={TIERS.map((t) => ({ value: String(t.v), label: t.t }))} />
                </div>
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
