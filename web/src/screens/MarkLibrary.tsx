// The component library and the layer list. Components are grouped (frames, camera, data, pointers);
// each tile is a live preview of the mark, drawn from the current view and cropped to where it sits.
// Hovering a tile opens a larger preview beside the panel (nothing changes on the view). In Present,
// tiles are dragged onto the view or clicked to drop them in their usual place; the layer list is what
// is on the view, with visibility, emphasis, line weight, dash spacing and size for each.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

/** The MIME type a dragged library tile carries: "family:variant", or "text". */
export const MARK_MIME = 'application/x-qs-mark'

export const GROUPS: { id: string; title: string; fams: string[] }[] = [
  { id: 'frame', title: 'Frames and guides', fams: ['frame', 'focus', 'bounds'] },
  { id: 'camera', title: 'Camera and orbit', fams: ['orbit', 'camera', 'dial'] },
  { id: 'data', title: 'Data', fams: ['meta', 'cards', 'slicecard', 'stages', 'captures', 'steps'] },
  { id: 'point', title: 'Pointers and scan', fams: ['selection', 'callout', 'scan'] },
]

const SLOT_NAME: Record<string, string> = {
  tl: 'the top-left corner', tr: 'the top-right corner', bl: 'the bottom-left corner', br: 'the bottom-right corner',
  top: 'the top edge', bottom: 'the bottom edge', left: 'the left edge', right: 'the right edge',
}
/** Where a component goes, in words. */
export const whereOf = (m: HudModule) =>
  m.slot === 'object' ? 'Follows the model as it turns' : m.slot === 'full' ? 'Fills the frame' : `Starts in ${SLOT_NAME[m.slot] ?? 'its corner'}; drag it anywhere`

/** A still of the view and the HUD context, taken when asked and when what is shown changes. */
export function useSnap() {
  const [snap, setSnap] = useState<{ ctx: HudCtx | undefined; bg: string | null }>(() => ({ ctx: live.ctx, bg: live.engine?.snapshot(420) ?? null }))
  const view = useStore((s) => s.view), proc = useStore((s) => s.procData), grid = useStore((s) => s.gridData)
  const shading = useStore((s) => s.shading), theme = useStore((s) => s.theme), model = useStore((s) => s.model)
  const turn = useStore((s) => s.evolve.frameTurn)
  const take = () => setSnap({ ctx: live.ctx, bg: live.engine?.snapshot(420) ?? null })
  useEffect(() => {
    const t = setTimeout(take, 450)
    return () => clearTimeout(t)
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

/** The larger preview beside the panel while a tile is hovered. */
function HoverCard({ m, at, edge, ctx, bg, on }: { m: HudModule; at: DOMRect; edge: number; ctx: HudCtx | undefined; bg: string | null; on: boolean }) {
  const W = 320, H = 200
  const top = Math.max(12, Math.min(window.innerHeight - H - 120, at.top + at.height / 2 - (H + 90) / 2))
  const left = Math.max(12, edge - (W + 24) - 14)   // beside the panel, never over it
  return createPortal(
    <div className="mk-pop" style={{ top, left, width: W + 24 }} aria-hidden>
      {ctx ? <MarkThumb m={m} ctx={ctx} bg={bg} w={W} h={H} /> : <span className="mini mk-tile__empty" style={{ width: W, height: H }}>Open a model to preview</span>}
      <span className="mk-pop__t">{nameOf(m)}{on && <span className="mk-pop__on">On the view</span>}</span>
      <span className="mk-pop__d">{m.desc}</span>
      <span className="mk-pop__w">{whereOf(m)}</span>
    </div>,
    document.body,
  )
}

/** Every component as a preview tile, grouped. Present: drag onto the view, or click to drop it in its
 *  usual place (a tile already on the view selects it). Lab: click to turn it on or off. */
export function MarkLibrary({ compose, looks = {}, cols = 2, tile = 146, drag = false, onAdd, onRemove, onSelect, onDragStart, extra }: {
  compose: Record<string, string>; looks?: Record<string, Look>; cols?: number; tile?: number; drag?: boolean
  onAdd: (fam: string, id: string) => void; onRemove?: (fam: string, id: string) => void; onSelect?: (key: string) => void
  onDragStart?: () => void
  /** Tiles that are not marks (Present: free text), shown first. */
  extra?: ReactNode
}) {
  const { ctx, bg, refresh } = useSnap()
  const [hover, setHover] = useState<{ m: HudModule; at: DOMRect; edge: number } | null>(null)
  const th = Math.round(tile * 0.62)
  const jump = (id: string) => document.getElementById(`mk-g-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return (
    <div className="mk" onPointerEnter={refresh} onPointerLeave={() => setHover(null)}>
      <div className="mk-groups" role="navigation" aria-label="Library groups">
        {GROUPS.map((g) => <button key={g.id} className="pd-chip pd-chip--s" onClick={() => jump(g.id)}>{g.title}</button>)}
      </div>
      {extra}
      {GROUPS.map((g) => (
        <div key={g.id} id={`mk-g-${g.id}`} className="mk-group">
          <span className="mk-group__t">{g.title}</span>
          {g.fams.map((fid) => {
            const f = familyOf(fid)
            if (!f) return null
            const on = variantsOf(compose, f.id)
            return (
              <div key={f.id} className="mk-fam">
                <div className="mk-fam__head">
                  <span className="mk-fam__t">{f.title}</span>
                  <span className="mk-fam__d">{on.length ? `${on.length} on the view` : f.desc}</span>
                </div>
                <Lazy h={Math.ceil(f.modules.length / cols) * (th + 30)}>
                  <div className="mk-tiles" style={{ gridTemplateColumns: `repeat(${cols}, ${tile}px)` }}>
                    {f.modules.map((m) => {
                      const isOn = on.includes(m.id)
                      const tier = looks[keyOf(m)]?.tier ?? 1
                      const click = () => {
                        setHover(null)
                        if (!isOn) onAdd(f.id, m.id)
                        else if (onSelect) onSelect(keyOf(m))
                        else onRemove?.(f.id, m.id)
                      }
                      return (
                        <div key={m.id} role="button" tabIndex={0} aria-pressed={isOn} aria-label={nameOf(m)}
                          className={'mk-tile' + (isOn ? ' mk-tile--on mk-tile--t' + tier : '') + (drag ? ' mk-tile--drag' : '')}
                          draggable={drag}
                          onDragStart={(e) => {
                            setHover(null)
                            e.dataTransfer.setData(MARK_MIME, keyOf(m))
                            e.dataTransfer.effectAllowed = 'copy'
                            const img = e.currentTarget.querySelector('.mini')
                            if (img) e.dataTransfer.setDragImage(img, tile / 2, th / 2)
                            onDragStart?.()
                          }}
                          onClick={click}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click() } }}
                          onPointerEnter={(e) => { const at = e.currentTarget.getBoundingClientRect(); setHover({ m, at, edge: e.currentTarget.closest('.pd, .qs-pop__panel')?.getBoundingClientRect().left ?? at.left }) }}
                          onPointerLeave={() => setHover(null)}>
                          {ctx ? <MarkThumb m={m} ctx={ctx} bg={bg} w={tile} h={th} look={looks[keyOf(m)]} /> : <span className="mini mk-tile__empty" style={{ width: tile, height: th }}>Open a model to preview</span>}
                          <span className="mk-tile__t">{cap(m.label)}{isOn && <span className="mk-tile__on">on</span>}</span>
                        </div>
                      )
                    })}
                  </div>
                </Lazy>
              </div>
            )
          })}
        </div>
      ))}
      {hover && <HoverCard m={hover.m} at={hover.at} edge={hover.edge} ctx={ctx} bg={bg} on={variantsOf(compose, hover.m.family).includes(hover.m.id)} />}
    </div>
  )
}

/** The element a piece is drawn in on the view (for PNGs). */
const pieceEl = (k: string) =>
  document.querySelector<HTMLElement>(`.stage__view .hud-layer > [data-hud="${k}"], .stage__view [data-hud="${k}"] > .hud-piece__body`)

/** What is on the view, as layers. A row selects its piece (and a piece selected on the view opens its
 *  row): visibility, emphasis, line weight, dash spacing, size, back to its place, PNG, remove. */
export function LayerList() {
  const p = usePresent()
  const { ctx, bg } = useSnap()
  const row = useRef<Record<string, HTMLDivElement | null>>({})
  useEffect(() => { if (p.sel) row.current[p.sel]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [p.sel])
  const mods = chosenOf(p.compose)
  const items: { k: string; title: string; sub: string; m?: HudModule; text?: string }[] = [
    ...mods.map((m) => ({ k: keyOf(m), title: familyOf(m.family)?.title ?? m.family, sub: cap(m.label), m })),
    ...p.texts.map((t) => ({ k: `text:${t.id}`, title: 'Text', sub: t.text, text: t.text })),
  ]
  if (!items.length) return <span className="pd-empty">Nothing on the view yet. Drag components from the library below, or add text.</span>
  return (
    <div className="ly" onPointerLeave={() => p.setHl(null)}>
      {items.map(({ k, title, sub, m, text }) => {
        const look = p.looks[k] ?? {}
        const open = p.sel === k
        const moved = !!p.pos[`present|${k}`]
        const sized = !m || (m.slot !== 'object' && m.slot !== 'full')
        const changed = ['tier', 'weight', 'dash', 'size'].some((x) => look[x as keyof Look] != null)
        return (
          <div key={k} ref={(el) => { row.current[k] = el }} className={'ly-row' + (open ? ' ly-row--open' : '') + (look.hidden ? ' ly-row--hidden' : '')}
            onPointerEnter={() => p.setHl(k)}>
            <div className="ly-row__main" role="button" tabIndex={0} aria-expanded={open}
              onClick={() => { p.setSel(open ? null : k); if (!open) p.setComposing(true) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.setSel(open ? null : k) } }}>
              {m && ctx ? <MarkThumb m={m} ctx={ctx} bg={bg} w={52} h={34} look={look} /> : <span className="mini ly-row__txt" style={{ width: 52, height: 34 }}>Aa</span>}
              <span className="ly-row__t">{title}<span className="ly-row__s">{sub}{changed ? ' · adjusted' : ''}{moved ? ' · moved' : ''}</span></span>
              <span className="ly-row__tools" onClick={(e) => e.stopPropagation()}>
                <IconButton name={look.hidden ? 'eyeOff' : 'eye'} size={24} dim={look.hidden} title={look.hidden ? 'Show' : 'Hide'} desc="Keep it in the composition but leave it off the view." onClick={() => p.setLook(k, { hidden: !look.hidden })} />
                <IconButton name="clear" size={24} title="Remove" desc="Take it off the view." onClick={() => p.removePiece(k)} />
              </span>
            </div>
            {open && (
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
                  <button className="pd-chip pd-chip--s" disabled={!changed} onClick={() => p.setLook(k, { tier: undefined, weight: undefined, dash: undefined, size: undefined })}>Reset look</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
