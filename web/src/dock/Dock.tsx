// Blender-like docking workspace: left | centre (viewport over the bottom zone) | right. Each zone stacks areas,
// each area is a tab strip of panels with an editor-type menu. Tabs drag between areas, into new areas, or into
// empty zones. All layout changes go out through onLayout; the layout model lives in ./layout.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, PointerEvent as RPointerEvent, KeyboardEvent as RKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon, IconButton } from '../qs/Icon'
import '../qs/forms.css'
import './dock.css'
import type { Area, DockLayout, ZoneId } from './layout'
import { closePanel, findArea, findPanel, movePanel, resizeAreas, setActive, setZoneSize } from './layout'

export interface PanelDef { id: string; title: string; icon: string; render: () => ReactNode; badge?: ReactNode }

type Target =
  | { kind: 'tab'; area: string }
  | { kind: 'split'; area: string; zone: ZoneId; index: number; edge: 'before' | 'after' }
  | { kind: 'empty'; zone: ZoneId }

const AREA_MIN = 64 // px, an area never shrinks below its header plus a little body

function applyTarget(l: DockLayout, panel: string, t: Target): DockLayout {
  if (t.kind === 'tab') {
    const f = findArea(l, t.area)
    return f ? movePanel(l, panel, { zone: f.zone, area: t.area }) : l
  }
  if (t.kind === 'split') return movePanel(l, panel, { zone: t.zone, index: t.edge === 'before' ? t.index : t.index + 1 })
  return movePanel(l, panel, { zone: t.zone, index: 0 })
}

const sameTarget = (a: Target | null, b: Target | null) => JSON.stringify(a) === JSON.stringify(b)

export function Dock({ panels, layout, onLayout, center, onReset }: {
  panels: PanelDef[]; layout: DockLayout; onLayout: (l: DockLayout) => void; center: ReactNode; onReset?: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const ghostPos = useRef({ x: 0, y: 0 })
  const suppressClick = useRef(false)
  const layoutRef = useRef(layout)
  const onLayoutRef = useRef(onLayout)
  useLayoutEffect(() => { layoutRef.current = layout; onLayoutRef.current = onLayout })

  const [draft, setDraft] = useState<DockLayout | null>(null) // live layout while a splitter is held
  const [drag, setDrag] = useState<{ panel: string; target: Target | null } | null>(null)
  const [menu, setMenu] = useState<{ area: string; anchor: DOMRect } | null>(null)

  const byId = new Map(panels.map((p) => [p.id, p]))
  const view = draft ?? layout

  // ---------- tab drag ----------

  const hitTest = useCallback((x: number, y: number, panel: string): Target | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    if (!el || !rootRef.current?.contains(el)) return null
    let t: Target | null = null
    const empty = el.closest<HTMLElement>('[data-qd-empty]')
    const head = el.closest<HTMLElement>('[data-qd-head]')
    const areaEl = el.closest<HTMLElement>('[data-qd-area]')
    if (empty) t = { kind: 'empty', zone: empty.dataset.qdEmpty as ZoneId }
    else if (head) t = { kind: 'tab', area: head.dataset.qdHead! }
    else if (areaEl) {
      const zone = areaEl.dataset.qdZone as ZoneId
      const r = areaEl.getBoundingClientRect()
      const before = zone === 'bottom' ? x < r.left + r.width / 2 : y < r.top + r.height / 2
      t = { kind: 'split', area: areaEl.dataset.qdArea!, zone, index: Number(areaEl.dataset.qdIndex), edge: before ? 'before' : 'after' }
    }
    if (!t) return null
    const l = layoutRef.current
    return applyTarget(l, panel, t) === l ? null : t // its own place: no-op, no highlight
  }, [])

  const placeGhost = () => {
    const g = ghostRef.current
    if (!g) return
    const { x, y } = ghostPos.current
    const w = g.offsetWidth, h = g.offsetHeight
    g.style.transform = `translate(${Math.min(x + 12, innerWidth - w - 4)}px, ${Math.min(y + 14, innerHeight - h - 4)}px)`
  }
  useLayoutEffect(placeGhost, [drag?.panel])

  const startTabDrag = (e: RPointerEvent<HTMLButtonElement>, panel: string) => {
    suppressClick.current = false
    if (e.button !== 0 || drag) return
    const el = e.currentTarget
    const pid = e.pointerId
    const sx = e.clientX, sy = e.clientY
    let active = false
    let target: Target | null = null

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return
        active = true
        try { el.setPointerCapture(pid) } catch { /* element gone: window listeners still work */ }
        document.documentElement.classList.add('qd-dragging')
        setMenu(null)
        ghostPos.current = { x: ev.clientX, y: ev.clientY }
        setDrag({ panel, target: null })
      }
      ev.preventDefault()
      ghostPos.current = { x: ev.clientX, y: ev.clientY }
      placeGhost()
      const t = hitTest(ev.clientX, ev.clientY, panel)
      if (!sameTarget(t, target)) { target = t; setDrag({ panel, target: t }) }
    }
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      if (!active) return
      suppressClick.current = true
      try { el.releasePointerCapture(pid) } catch { /* already released */ }
      document.documentElement.classList.remove('qd-dragging')
      setDrag(null)
      if (commit && target) {
        const l = layoutRef.current
        const next = applyTarget(l, panel, target)
        if (next !== l) onLayoutRef.current(next)
      }
    }
    const up = (ev: PointerEvent) => { if (ev.pointerId === pid) finish(true) }
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === pid) finish(false) }
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !active) return
      ev.preventDefault(); ev.stopPropagation()
      finish(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  // ---------- splitters ----------

  const startZoneResize = (e: RPointerEvent<HTMLDivElement>, zone: ZoneId) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    try { el.setPointerCapture(e.pointerId) } catch { /* synthetic or stale pointer */ }
    const base = layoutRef.current
    const start = zone === 'bottom' ? base.height.bottom : base.width[zone]
    const sx = e.clientX, sy = e.clientY
    let last = base
    document.documentElement.classList.add(zone === 'bottom' ? 'qd-resizing-row' : 'qd-resizing-col')
    const move = (ev: PointerEvent) => {
      const d = zone === 'left' ? ev.clientX - sx : zone === 'right' ? sx - ev.clientX : sy - ev.clientY
      last = setZoneSize(base, zone, start + d)
      setDraft(last)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      document.documentElement.classList.remove('qd-resizing-row', 'qd-resizing-col')
      setDraft(null)
      if (last !== base) onLayoutRef.current(last)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const zoneKey = (e: RKeyboardEvent, zone: ZoneId) => {
    const grow = zone === 'left' ? 'ArrowRight' : zone === 'right' ? 'ArrowLeft' : 'ArrowUp'
    const shrink = zone === 'left' ? 'ArrowLeft' : zone === 'right' ? 'ArrowRight' : 'ArrowDown'
    if (e.key !== grow && e.key !== shrink) return
    e.preventDefault()
    const l = layoutRef.current
    const cur = zone === 'bottom' ? l.height.bottom : l.width[zone]
    onLayoutRef.current(setZoneSize(l, zone, cur + (e.key === grow ? 16 : -16)))
  }

  /** Splitter between areas i and j (layout indices) of a zone. */
  const startAreaResize = (e: RPointerEvent<HTMLDivElement>, zone: ZoneId, i: number, j: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    const zoneEl = el.parentElement
    const a = zoneEl?.querySelector<HTMLElement>(`[data-qd-index="${i}"]`)
    const b = zoneEl?.querySelector<HTMLElement>(`[data-qd-index="${j}"]`)
    if (!a || !b) return
    try { el.setPointerCapture(e.pointerId) } catch { /* synthetic or stale pointer */ }
    const horiz = zone === 'bottom'
    const pa = horiz ? a.offsetWidth : a.offsetHeight
    const pb = horiz ? b.offsetWidth : b.offsetHeight
    const total = pa + pb
    const base = layoutRef.current
    const sizes = base.zones[zone].map((ar) => ar.size)
    const weight = sizes[i] + sizes[j]
    const s0 = horiz ? e.clientX : e.clientY
    let last = base
    document.documentElement.classList.add(horiz ? 'qd-resizing-col' : 'qd-resizing-row')
    const move = (ev: PointerEvent) => {
      if (total <= 2 * AREA_MIN) return
      const na = Math.min(total - AREA_MIN, Math.max(AREA_MIN, pa + (horiz ? ev.clientX : ev.clientY) - s0))
      const next = sizes.slice()
      next[i] = weight * na / total
      next[j] = weight - next[i]
      last = resizeAreas(base, zone, next)
      setDraft(last)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      document.documentElement.classList.remove('qd-resizing-row', 'qd-resizing-col')
      setDraft(null)
      if (last !== base) onLayoutRef.current(last)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  // ---------- menu actions ----------

  const choose = (areaId: string, panel: string) => {
    const l = layoutRef.current
    const f = findArea(l, areaId)
    if (!f) return
    onLayout(f.area.tabs.includes(panel) ? setActive(l, areaId, panel) : movePanel(l, panel, { zone: f.zone, area: areaId }))
  }

  // ---------- render ----------

  const renderZone = (zone: ZoneId) => {
    // areas with no panel this app knows about are not drawn; indices stay those of the layout
    const areas = view.zones[zone].map((a, index) => ({ a, index, tabs: a.tabs.filter((t) => byId.has(t)) })).filter((x) => x.tabs.length)
    if (!areas.length) {
      return (
        <div className={`qd-void qd-void--${zone}`} key={`void-${zone}`}>
          {drag && (
            <div className={'qd-drop' + (drag.target?.kind === 'empty' && drag.target.zone === zone ? ' qd-drop--on' : '')} data-qd-empty={zone}>
              <span>Dock here</span>
            </div>
          )}
        </div>
      )
    }
    const sizeStyle = zone === 'bottom' ? { height: view.height.bottom } : { width: view.width[zone] }
    const items: ReactNode[] = []
    areas.forEach(({ a, index, tabs }, k) => {
      if (k > 0) {
        const prev = areas[k - 1].index
        items.push(
          <div key={`s-${a.id}`} className={`qd-split qd-split--${zone === 'bottom' ? 'col' : 'row'}`} role="separator"
            aria-orientation={zone === 'bottom' ? 'vertical' : 'horizontal'} onPointerDown={(e) => startAreaResize(e, zone, prev, index)} />,
        )
      }
      items.push(
        <AreaView key={a.id} zone={zone} index={index} area={a} tabs={tabs} byId={byId}
          target={drag?.target && 'area' in drag.target && drag.target.area === a.id ? drag.target : null}
          menuOpen={menu?.area === a.id}
          onTabDown={startTabDrag}
          onTabClick={(p) => {
            if (suppressClick.current) { suppressClick.current = false; return }
            onLayout(setActive(layoutRef.current, a.id, p))
          }}
          onMenu={(anchor) => setMenu((m) => m?.area === a.id ? null : { area: a.id, anchor })} />,
      )
    })
    return (
      <section key={`zone-${zone}`} className={`qd-zone qd-zone--${zone}`} style={sizeStyle} aria-label={`${zone} dock`}>
        {items}
      </section>
    )
  }

  const zoneSplit = (zone: ZoneId) => {
    if (!view.zones[zone].some((a) => a.tabs.some((t) => byId.has(t)))) return null
    const vertical = zone !== 'bottom'
    const now = zone === 'bottom' ? view.height.bottom : view.width[zone]
    return (
      <div key={`zs-${zone}`} className={`qd-split qd-split--${vertical ? 'col' : 'row'} qd-split--zone`} role="separator" tabIndex={0}
        aria-orientation={vertical ? 'vertical' : 'horizontal'} aria-label={`Resize ${zone} dock`} aria-valuenow={now}
        data-tip={`Resize ${zone} dock`} data-tip-desc="Drag, or use the arrow keys"
        onPointerDown={(e) => startZoneResize(e, zone)} onKeyDown={(e) => zoneKey(e, zone)} />
    )
  }

  const menuArea = menu ? findArea(layout, menu.area) : null
  const dragDef = drag ? byId.get(drag.panel) : undefined

  return (
    <div ref={rootRef} className={'qd' + (drag ? ' qd--drag' : '')}>
      {renderZone('left')}
      {zoneSplit('left')}
      <div className="qd-center">
        <div className="qd-view">{center}</div>
        {zoneSplit('bottom')}
        {renderZone('bottom')}
      </div>
      {zoneSplit('right')}
      {renderZone('right')}

      {menu && menuArea && createPortal(
        <AreaMenu anchor={menu.anchor} area={menuArea.area} panels={panels} layout={layout}
          onClose={() => setMenu(null)}
          onChoose={(p) => { choose(menu.area, p); setMenu(null) }}
          onCloseTab={() => { onLayout(closePanel(layoutRef.current, menuArea.area.active)); setMenu(null) }}
          onReset={onReset && (() => { setMenu(null); onReset() })} />,
        document.body,
      )}
      {drag && dragDef && createPortal(
        <div ref={ghostRef} className="qd-ghost" aria-hidden>
          <Icon name={dragDef.icon} size={14} />
          <span>{dragDef.title}</span>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ---------- area ----------

function AreaView({ zone, index, area, tabs, byId, target, menuOpen, onTabDown, onTabClick, onMenu }: {
  zone: ZoneId; index: number; area: Area; tabs: string[]; byId: Map<string, PanelDef>; target: Target | null
  menuOpen: boolean
  onTabDown: (e: RPointerEvent<HTMLButtonElement>, panel: string) => void
  onTabClick: (panel: string) => void
  onMenu: (anchor: DOMRect) => void
}) {
  const menuWrap = useRef<HTMLSpanElement>(null)
  const active = tabs.includes(area.active) ? area.active : tabs[0]
  const def = byId.get(active)!
  const bodyId = `qd-body-${area.id}`
  const tabOn = target?.kind === 'tab'
  const split = target?.kind === 'split' ? target.edge : null

  return (
    <div className="qd-area" data-qd-area={area.id} data-qd-zone={zone} data-qd-index={index}
      style={{ flex: `${area.size} 1 0px` }}>
      <div className={'qd-head' + (tabOn ? ' qd-head--on' : '')} data-qd-head={area.id}>
        <div className="qd-tabs" role="tablist" aria-label="Panels">
          {tabs.map((id) => {
            const p = byId.get(id)!
            const on = id === active
            return (
              <button key={id} type="button" role="tab" aria-selected={on} aria-controls={on ? bodyId : undefined}
                className={'qd-tab' + (on ? ' qd-tab--on' : '')}
                onPointerDown={(e) => onTabDown(e, id)} onClick={() => onTabClick(id)}>
                <Icon name={p.icon} size={14} />
                <span className="qd-tab__title">{p.title}</span>
                {p.badge != null && <span className="qd-tab__badge">{p.badge}</span>}
              </button>
            )
          })}
        </div>
        <span ref={menuWrap} className="qd-head__menu"
          onClickCapture={() => { const r = menuWrap.current?.getBoundingClientRect(); if (r) onMenu(r) }}>
          <IconButton name="chevDown" size={22} title="Panel menu" desc="Switch this area to another panel, close the tab, or reset the layout" on={menuOpen} />
        </span>
      </div>
      <div className="qd-body" id={bodyId} role="tabpanel" aria-label={def.title}>
        {def.render()}
      </div>
      {split && <div className={`qd-ins qd-ins--${zone === 'bottom' ? (split === 'before' ? 'l' : 'r') : (split === 'before' ? 't' : 'b')}`} />}
    </div>
  )
}

// ---------- editor-type menu ----------

function Check() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" aria-hidden style={{ display: 'block' }}>
      <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function AreaMenu({ anchor, area, panels, layout, onClose, onChoose, onCloseTab, onReset }: {
  anchor: DOMRect; area: Area; panels: PanelDef[]; layout: DockLayout
  onClose: () => void; onChoose: (panel: string) => void; onCloseTab: () => void; onReset?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const closeRef = useRef(onClose)
  useLayoutEffect(() => { closeRef.current = onClose })

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const w = m.offsetWidth, h = m.offsetHeight, pad = 6
    let left = anchor.right - w
    let top = anchor.bottom + 4
    if (top + h > innerHeight - pad) top = Math.max(pad, anchor.top - h - 4)
    left = Math.min(Math.max(pad, left), innerWidth - w - pad)
    top = Math.min(Math.max(pad, top), innerHeight - h - pad)
    setPos({ left, top })
  }, [anchor])

  // focus once the menu is placed and visible (a hidden element cannot take focus)
  const placed = pos != null
  useEffect(() => {
    if (!placed) return
    const m = ref.current
    const cur = m?.querySelector<HTMLButtonElement>('.qd-menu__item--on')
    ;(cur ?? m?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)'))?.focus({ preventScroll: true })
  }, [placed])

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      // the toggle button handles its own click
      if (t instanceof Element && t.closest('.qd-head__menu')) return
      closeRef.current()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeRef.current() } }
    const away = () => closeRef.current()
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', away)
    window.addEventListener('blur', away)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', away)
      window.removeEventListener('blur', away)
    }
  }, [])

  const nav = (e: RKeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(e.key)) return
    if (e.key === 'Tab') { onClose(); return }
    e.preventDefault()
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])]
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[n].focus()
  }

  return (
    <div ref={ref} className="qd-menu" role="menu" aria-label="Panel" onKeyDown={nav}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}>
      <div className="qd-menu__label">Panel</div>
      {panels.map((p) => {
        const here = area.tabs.includes(p.id)
        const where = here ? null : findPanel(layout, p.id)
        return (
          <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={here}
            className={'qd-menu__item' + (p.id === area.active ? ' qd-menu__item--on' : '')} onClick={() => onChoose(p.id)}>
            <span className="qd-menu__check">{here && <Check />}</span>
            <Icon name={p.icon} size={14} />
            <span className="qd-menu__title">{p.title}</span>
            <span className="qd-menu__hint">{where ? where.zone : here ? '' : 'closed'}</span>
          </button>
        )
      })}
      <div className="qd-menu__rule" role="separator" />
      <button type="button" role="menuitem" className="qd-menu__item" onClick={onCloseTab}>
        <span className="qd-menu__check" />
        <Icon name="clear" size={14} />
        <span className="qd-menu__title">Close tab</span>
      </button>
      {onReset && (
        <button type="button" role="menuitem" className="qd-menu__item" onClick={onReset}>
          <span className="qd-menu__check" />
          <Icon name="grid" size={14} />
          <span className="qd-menu__title">Reset layout</span>
        </button>
      )}
    </div>
  )
}
