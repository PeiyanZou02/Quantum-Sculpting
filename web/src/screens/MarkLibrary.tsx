// The mark library and the layer list. Every variant is shown as a live preview: the mark drawn from
// the current view, cropped to where it sits, over a still of the geometry. Families take any number
// of variants. The layer list (Present) is what is on, with each mark's emphasis, line weight, dash
// spacing and size.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { usePresent, type Look } from '../present'
import { FAMILIES, MarkThumb, chosenOf, keyOf, toggleVariant, variantsOf } from '../hud/Composer'
import type { HudCtx, HudModule } from '../hud/types'
import { live } from '../live'
import { Slider } from '../qs/Slider'
import { IconButton } from '../qs/Icon'

/** A still of the view and the HUD context, taken when asked and when what is shown changes. */
export function useSnap() {
  const [snap, setSnap] = useState<{ ctx: HudCtx | undefined; bg: string | null }>(() => ({ ctx: live.ctx, bg: live.engine?.snapshot(420) ?? null }))
  const view = useStore((s) => s.view), proc = useStore((s) => s.procData), grid = useStore((s) => s.gridData)
  const shading = useStore((s) => s.shading), theme = useStore((s) => s.theme), model = useStore((s) => s.model)
  const take = () => setSnap({ ctx: live.ctx, bg: live.engine?.snapshot(420) ?? null })
  useEffect(() => {
    const t = setTimeout(take, 450)
    return () => clearTimeout(t)
  }, [view, proc, grid, shading, theme, model])
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
function Lazy({ h, children }: { h: number; children: React.ReactNode }) {
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

export function TierSwitch({ value, onChange }: { value: 1 | 2 | 3; onChange: (v: 1 | 2 | 3) => void }) {
  return (
    <span className="tier" role="radiogroup" aria-label="Emphasis">
      {TIERS.map((t) => (
        <button key={t.v} role="radio" aria-checked={value === t.v} className={'tier__b tier__b--' + t.v + (value === t.v ? ' tier__b--on' : '')}
          onClick={(e) => { e.stopPropagation(); onChange(t.v) }} data-tip={t.t} data-tip-desc={t.d}><span /></button>
      ))}
    </span>
  )
}

/** Every family's variants as preview tiles; click to add or remove, hover to see it in the view. */
export function MarkLibrary({ compose, onToggle, onPreview, looks = {}, cols = 2, tile = 146 }: {
  compose: Record<string, string>; onToggle: (fam: string, id: string) => void; onPreview?: (c: Record<string, string> | null) => void
  looks?: Record<string, Look>; cols?: number; tile?: number
}) {
  const { ctx, bg, refresh } = useSnap()
  const th = Math.round(tile * 0.62)
  return (
    <div className="mk" onPointerEnter={refresh} onPointerLeave={() => onPreview?.(null)}>
      {FAMILIES.map((f) => {
        const on = variantsOf(compose, f.id)
        return (
          <div key={f.id} className="mk-fam">
            <div className="mk-fam__head">
              <span className="mk-fam__t">{f.title}</span>
              <span className="mk-fam__d">{on.length ? `${on.length} on` : f.desc}</span>
            </div>
            <Lazy h={Math.ceil(f.modules.length / cols) * (th + 30)}>
              <div className="mk-tiles" style={{ gridTemplateColumns: `repeat(${cols}, ${tile}px)` }}>
                {f.modules.map((m, i) => {
                  const isOn = on.includes(m.id)
                  const tier = looks[keyOf(m)]?.tier ?? 1
                  return (
                    <div key={m.id} role="button" tabIndex={0} className={'mk-tile' + (isOn ? ' mk-tile--on mk-tile--t' + tier : '')} aria-pressed={isOn}
                      onClick={() => { onToggle(f.id, m.id); onPreview?.(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(f.id, m.id) } }}
                      onPointerEnter={() => onPreview?.(isOn ? null : { ...compose, [f.id]: toggleVariant(compose, f.id, m.id) })}
                      data-tip={`${f.title} · ${m.label}`} data-tip-desc={`${m.desc}${isOn ? ' · click to remove' : ' · click to add'}`}>
                      {ctx ? <MarkThumb m={m} ctx={ctx} bg={bg} w={tile} h={th} look={looks[keyOf(m)]} /> : <span className="mini mk-tile__empty" style={{ width: tile, height: th }}>Open a model to preview</span>}
                      <span className="mk-tile__t"><span className="mk-tile__n">v{i + 1}</span>{m.label}{isOn && <span className="mk-tile__on" />}</span>
                    </div>
                  )
                })}
              </div>
            </Lazy>
          </div>
        )
      })}
    </div>
  )
}

const label = (m: HudModule) => `${FAMILIES.find((f) => f.id === m.family)?.title ?? m.family} · ${m.label}`

/** What is on, as layers: emphasis, line weight, dash spacing, size; hover one to single it out. */
export function LayerList() {
  const p = usePresent()
  const { ctx, bg } = useSnap()
  const [open, setOpen] = useState<string | null>(null)
  const mods = chosenOf(p.compose)
  if (!mods.length) return <span className="pd-empty">Nothing on yet. Add marks from the library below, or pick a composition.</span>
  return (
    <div className="ly" onPointerLeave={() => p.setHl(null)}>
      {mods.map((m) => {
        const k = keyOf(m)
        const look = p.looks[k] ?? {}
        const isOpen = open === k
        const slot = m.slot !== 'object' && m.slot !== 'full'
        const changed = Object.keys(look).length > 0
        return (
          <div key={k} className={'ly-row' + (isOpen ? ' ly-row--open' : '')} onPointerEnter={() => p.setHl(k)}>
            <div className="ly-row__main" role="button" tabIndex={0} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : k) } }}
              data-tip={isOpen ? 'Close' : 'Adjust'} data-tip-desc="Line weight, dash spacing and size.">
              {ctx && <MarkThumb m={m} ctx={ctx} bg={bg} w={58} h={38} look={look} />}
              <span className="ly-row__t">{label(m)}{changed && <span className="ly-row__mod">adjusted</span>}</span>
              <TierSwitch value={look.tier ?? 1} onChange={(v) => p.setLook(k, { tier: v })} />
              <span onClick={(e) => e.stopPropagation()}>
                <IconButton name="clear" size={24} title="Remove" desc="Take this mark off the view." onClick={() => { p.setCompose({ [m.family]: toggleVariant(p.compose, m.family, m.id) }); p.setHl(null) }} />
              </span>
            </div>
            {isOpen && (
              <div className="ly-props">
                <Slider label="Line weight" value={look.weight ?? 1} min={0.25} max={3} step={0.05} ticks={11} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => p.setLook(k, { weight: v })} />
                <Slider label="Dash spacing" value={look.dash ?? 1} min={0} max={3} step={0.05} ticks={12} format={(v) => (v === 0 ? 'solid' : `${v.toFixed(2)}×`)} onChange={(v) => p.setLook(k, { dash: v })} />
                {slot && <Slider label="Size" value={look.size ?? 1} min={0.6} max={1.8} step={0.05} ticks={12} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => p.setLook(k, { size: v })} />}
                <div className="pd-row">
                  <span className="pd-grow" />
                  <button className="pd-chip pd-chip--s" disabled={!changed} onClick={() => p.setLook(k, null)}>Reset</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
