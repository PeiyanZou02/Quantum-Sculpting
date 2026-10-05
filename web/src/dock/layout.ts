// Dock layout model: three zones (left, right, bottom), each a list of areas, each area a set of tabbed panels.
// Every operation is pure and returns a new, normalised layout (no empty areas, valid active tab, sizes averaging 1).

export type ZoneId = 'left' | 'right' | 'bottom'
export interface Area { id: string; tabs: string[]; active: string; size: number /* flex weight within its zone */ }
export interface DockLayout { zones: Record<ZoneId, Area[]>; width: { left: number; right: number }; height: { bottom: number }; hidden?: string[] }

export const ZONES: ZoneId[] = ['left', 'right', 'bottom']
export const SIDE_MIN = 220
export const SIDE_MAX = 560
export const BOTTOM_MIN = 120
export const bottomMax = () => Math.max(BOTTOM_MIN, Math.round((typeof window === 'undefined' ? 800 : window.innerHeight) * 0.6))

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Where a panel currently lives, or null when it is closed. */
export function findPanel(l: DockLayout, panel: string): { zone: ZoneId; index: number; area: Area } | null {
  for (const zone of ZONES) {
    const i = l.zones[zone].findIndex((a) => a.tabs.includes(panel))
    if (i >= 0) return { zone, index: i, area: l.zones[zone][i] }
  }
  return null
}

export function findArea(l: DockLayout, id: string): { zone: ZoneId; index: number; area: Area } | null {
  for (const zone of ZONES) {
    const i = l.zones[zone].findIndex((a) => a.id === id)
    if (i >= 0) return { zone, index: i, area: l.zones[zone][i] }
  }
  return null
}

function newAreaId(l: DockLayout): string {
  const taken = new Set(ZONES.flatMap((z) => l.zones[z].map((a) => a.id)))
  let id = ''
  do id = 'a-' + Math.random().toString(36).slice(2, 8); while (taken.has(id))
  return id
}

function normaliseZone(areas: Area[]): Area[] {
  const kept = areas.filter((a) => a.tabs.length > 0)
    .map((a) => ({ ...a, active: a.tabs.includes(a.active) ? a.active : a.tabs[0], size: Number.isFinite(a.size) && a.size > 0 ? a.size : 1 }))
  const sum = kept.reduce((s, a) => s + a.size, 0)
  if (!kept.length || sum <= 0) return kept
  const k = kept.length / sum
  return kept.map((a) => ({ ...a, size: a.size * k }))
}

function normalise(l: DockLayout): DockLayout {
  return {
    zones: { left: normaliseZone(l.zones.left), right: normaliseZone(l.zones.right), bottom: normaliseZone(l.zones.bottom) },
    width: { left: clamp(l.width.left, SIDE_MIN, SIDE_MAX), right: clamp(l.width.right, SIDE_MIN, SIDE_MAX) },
    height: { bottom: clamp(l.height.bottom, BOTTOM_MIN, bottomMax()) },
  }
}

/** Remove a panel from wherever it lives, leaving empty areas in place (normalise drops them). */
function detach(l: DockLayout, panel: string): DockLayout {
  const zones = { ...l.zones }
  for (const z of ZONES) {
    if (!zones[z].some((a) => a.tabs.includes(panel))) continue
    zones[z] = zones[z].map((a) => a.tabs.includes(panel) ? { ...a, tabs: a.tabs.filter((t) => t !== panel) } : a)
  }
  return { ...l, zones }
}

export function movePanel(l: DockLayout, panel: string, to: { zone: ZoneId; area?: string; index?: number }): DockLayout {
  if (l.hidden?.includes(panel)) l = { ...l, hidden: l.hidden.filter((h) => h !== panel) }
  const from = findPanel(l, panel)

  if (to.area != null) {
    const target = findArea(l, to.area)
    if (!target) return l
    if (from && from.area.id === to.area) return from.area.active === panel ? l : setActive(l, to.area, panel)
    const d = detach(l, panel)
    const zones = { ...d.zones }
    zones[target.zone] = zones[target.zone].map((a) => a.id === to.area ? { ...a, tabs: [...a.tabs, panel], active: panel } : a)
    return normalise({ ...d, zones })
  }

  const zoneAreas = l.zones[to.zone]
  let index = clamp(to.index ?? zoneAreas.length, 0, zoneAreas.length)
  if (from && from.zone === to.zone && from.area.tabs.length === 1 && (index === from.index || index === from.index + 1)) return l
  // the source area disappears when this was its last tab; indices after it shift down
  if (from && from.zone === to.zone && from.area.tabs.length === 1 && from.index < index) index -= 1
  const d = detach(l, panel)
  const zones = { ...d.zones }
  const live = zones[to.zone].filter((a) => a.tabs.length > 0)
  const size = live.length ? live.reduce((s, a) => s + a.size, 0) / live.length : 1
  const list = live.slice()
  list.splice(clamp(index, 0, list.length), 0, { id: newAreaId(l), tabs: [panel], active: panel, size })
  zones[to.zone] = list
  return normalise({ ...d, zones })
}

export function setActive(l: DockLayout, area: string, panel: string): DockLayout {
  const f = findArea(l, area)
  if (!f || !f.area.tabs.includes(panel) || f.area.active === panel) return l
  return { ...l, zones: { ...l.zones, [f.zone]: l.zones[f.zone].map((a) => a.id === area ? { ...a, active: panel } : a) } }
}

export function closePanel(l: DockLayout, panel: string): DockLayout {
  const f = findPanel(l, panel)
  if (!f) return l
  const zones = { ...l.zones }
  zones[f.zone] = zones[f.zone].map((a) => {
    if (a.id !== f.area.id) return a
    const tabs = a.tabs.filter((t) => t !== panel)
    // the neighbouring tab takes over, as browsers do
    const i = a.tabs.indexOf(panel)
    const active = a.active === panel ? (tabs[Math.min(i, tabs.length - 1)] ?? '') : a.active
    return { ...a, tabs, active }
  })
  return normalise({ ...l, zones, hidden: [...new Set([...(l.hidden ?? []), panel])] })
}

export function resizeAreas(l: DockLayout, zone: ZoneId, sizes: number[]): DockLayout {
  if (sizes.length !== l.zones[zone].length) return l
  return normalise({ ...l, zones: { ...l.zones, [zone]: l.zones[zone].map((a, i) => ({ ...a, size: sizes[i] })) } })
}

export function setZoneSize(l: DockLayout, zone: ZoneId, px: number): DockLayout {
  if (zone === 'bottom') return { ...l, height: { bottom: clamp(Math.round(px), BOTTOM_MIN, bottomMax()) } }
  return { ...l, width: { ...l.width, [zone]: clamp(Math.round(px), SIDE_MIN, SIDE_MAX) } }
}

// ---- persistence ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function parse(raw: unknown, fallback: DockLayout): DockLayout | null {
  if (!isObj(raw) || !isObj(raw.zones)) return null
  const zones = {} as Record<ZoneId, Area[]>
  for (const z of ZONES) {
    const list = raw.zones[z]
    zones[z] = Array.isArray(list) ? list.filter(isObj).map((a, i) => ({
      id: typeof a.id === 'string' && a.id ? a.id : `${z}-${i}`,
      tabs: Array.isArray(a.tabs) ? a.tabs.filter((t): t is string => typeof t === 'string') : [],
      active: typeof a.active === 'string' ? a.active : '',
      size: typeof a.size === 'number' ? a.size : 1,
    })) : []
  }
  const w = isObj(raw.width) ? raw.width : {}
  const h = isObj(raw.height) ? raw.height : {}
  const num = (v: unknown, d: number) => typeof v === 'number' && Number.isFinite(v) ? v : d
  return {
    zones,
    width: { left: num(w.left, fallback.width.left), right: num(w.right, fallback.width.right) },
    height: { bottom: num(h.bottom, fallback.height.bottom) },
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((t): t is string => typeof t === 'string') : [],
  }
}

export function loadLayout(key: string, fallback: DockLayout, known: string[]): DockLayout {
  const knownSet = new Set(known)
  let stored: DockLayout | null = null
  try {
    const s = localStorage.getItem(key)
    if (s) stored = parse(JSON.parse(s), fallback)
  } catch { stored = null }
  let l = stored ?? structuredClone(fallback)

  // drop unknown and duplicate panel ids; make area ids unique
  const seen = new Set<string>()
  const ids = new Set<string>()
  const zones = {} as Record<ZoneId, Area[]>
  for (const z of ZONES) {
    zones[z] = l.zones[z].map((a) => {
      const tabs = a.tabs.filter((t) => knownSet.has(t) && !seen.has(t))
      tabs.forEach((t) => seen.add(t))
      let id = a.id
      while (ids.has(id)) id += '_'
      ids.add(id)
      return { ...a, id, tabs }
    })
  }
  l = normalise({ ...l, zones })

  // known panels missing from the layout go back where the fallback puts them
  for (const p of known) {
    if (findPanel(l, p) || l.hidden?.includes(p)) continue
    const home = findPanel(fallback, p)
    if (home) {
      if (findArea(l, home.area.id)) l = movePanel(l, p, { zone: home.zone, area: home.area.id })
      else {
        const before = fallback.zones[home.zone].slice(0, home.index).map((a) => a.id)
        const index = l.zones[home.zone].filter((a) => before.includes(a.id)).length
        l = movePanel(l, p, { zone: home.zone, index })
        // keep the fallback's area id so later panels from the same fallback area can join it
        const f = findPanel(l, p)
        if (f) l = { ...l, zones: { ...l.zones, [f.zone]: l.zones[f.zone].map((a) => a.id === f.area.id ? { ...a, id: home.area.id } : a) } }
      }
    } else {
      // not placed by the fallback either: add it as a tab of the first area anywhere, else a new right area
      const first = ZONES.map((z) => l.zones[z][0]).find(Boolean)
      l = first ? movePanel(l, p, { zone: findArea(l, first.id)!.zone, area: first.id }) : movePanel(l, p, { zone: 'right' })
      // keep whatever tab was active before
      const f = findArea(l, first?.id ?? '')
      if (f && first) l = setActive(l, first.id, first.active)
    }
  }
  return normalise(l)
}

export function saveLayout(key: string, l: DockLayout): void {
  try { localStorage.setItem(key, JSON.stringify(l)) } catch { /* storage full or blocked: layout just won't persist */ }
}
