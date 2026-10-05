// The app shell: which tab is open (Lab, Explore, Compose, Notes), the side panel widths and the
// drawer under the view. Compose is Present mode: the HUD composer and the output frame.
import { create } from 'zustand'
import { usePresent } from './present'

export type Tab = 'lab' | 'explore' | 'compose' | 'notes'
export type DrawerTab = 'runtime' | 'evlog' | 'atlas'
export const TABS: { id: Tab; t: string; d: string; key: string }[] = [
  { id: 'lab', t: 'Lab', d: 'Make the geometry: model, voxels, quantum, mesh.', key: '1' },
  { id: 'explore', t: 'Explore', d: 'Look into the quantum step: the circuit, or Evolve’s nations turn by turn.', key: '2' },
  { id: 'compose', t: 'Compose', d: 'Compose the display: HUD, frames, images, video and 3D out.', key: '3' },
  { id: 'notes', t: 'Notes', d: 'The research behind the project.', key: '4' },
]

interface Shell {
  tab: Tab
  setTab: (t: Tab) => void
  left: number
  right: number
  bottom: number
  setSize: (p: Partial<Pick<Shell, 'left' | 'right' | 'bottom'>>) => void
  drawer: DrawerTab
  setDrawer: (d: DrawerTab) => void
  drawerOpen: boolean
  setDrawerOpen: (v: boolean) => void
}

const KEY = 'qs-shell'
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Shell> } catch { return {} } })()
const keep = (s: Shell) => {
  try { localStorage.setItem(KEY, JSON.stringify({ tab: s.tab, left: s.left, right: s.right, bottom: s.bottom, drawer: s.drawer, drawerOpen: s.drawerOpen })) } catch { /* per-viewer */ }
}

export const useShell = create<Shell>()((set, get) => {
  const up = (p: Partial<Shell>) => { set(p); keep(get()) }
  const first: Tab = saved.tab ?? (usePresent.getState().mode === 'present' ? 'compose' : 'lab')
  usePresent.getState().setMode(first === 'compose' ? 'present' : 'lab')
  return {
    tab: first,
    setTab: (t) => {
      usePresent.getState().setMode(t === 'compose' ? 'present' : 'lab')
      up({ tab: t })
    },
    left: saved.left ?? 288,
    right: saved.right ?? 312,
    bottom: saved.bottom ?? 168,
    setSize: (p) => up(p),
    drawer: saved.drawer ?? 'runtime',
    setDrawer: (d) => up({ drawer: d, drawerOpen: true }),
    drawerOpen: saved.drawerOpen ?? true,
    setDrawerOpen: (v) => up({ drawerOpen: v }),
  }
})

// Present's own way back (its bar's "← Lab", Esc) changes the mode: the tab follows
usePresent.subscribe((p, prev) => {
  if (p.mode === prev.mode) return
  const tab = useShell.getState().tab
  if (p.mode === 'lab' && tab === 'compose') useShell.setState({ tab: 'lab' })
  if (p.mode === 'present' && tab !== 'compose') useShell.setState({ tab: 'compose' })
})
