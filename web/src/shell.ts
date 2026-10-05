// The app shell: which tab is open (Lab, Research), the side panel widths and the drawer under the
// view. Lab is one workspace: it makes the geometry, composes the view over it and sends it out.
import { create } from 'zustand'

export type Tab = 'lab' | 'research'
export type DrawerTab = 'runtime' | 'evlog' | 'atlas'
export const TABS: { id: Tab; t: string; d: string; key: string }[] = [
  { id: 'lab', t: 'Lab', d: 'Make the geometry, compose the view over it and export: model, voxels, quantum or Evolve, mesh, compose, output.', key: '1' },
  { id: 'research', t: 'Research', d: 'The research behind the project.', key: '2' },
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
  /** Workspace layout: inputs and outputs swap sides; each column folds; the drawer sits under the
   *  view or runs the full width of the window. */
  swap: boolean
  leftOpen: boolean
  rightOpen: boolean
  dock: 'view' | 'full'
  setLayout: (p: Partial<Pick<Shell, 'swap' | 'leftOpen' | 'rightOpen' | 'dock'>>) => void
  /** Asking whether to leave the model for the start page. */
  homeAsk: boolean
  setHomeAsk: (v: boolean) => void
}

const KEY = 'qs-shell'
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Shell> } catch { return {} } })()
const keep = (s: Shell) => {
  try { localStorage.setItem(KEY, JSON.stringify({ tab: s.tab, left: s.left, right: s.right, bottom: s.bottom, drawer: s.drawer, drawerOpen: s.drawerOpen, swap: s.swap, leftOpen: s.leftOpen, rightOpen: s.rightOpen, dock: s.dock })) } catch { /* per-viewer */ }
}

export const useShell = create<Shell>()((set, get) => {
  const up = (p: Partial<Shell>) => { set(p); keep(get()) }
  // Explore and Compose were tabs of their own; both are part of Lab now. Notes is Research.
  const was = saved.tab as string | undefined
  const first: Tab = was === 'notes' || was === 'research' ? 'research' : 'lab'
  return {
    tab: first,
    setTab: (t) => up({ tab: t }),
    left: saved.left ?? 288,
    right: saved.right ?? 312,
    bottom: saved.bottom ?? 168,
    setSize: (p) => up(p),
    drawer: saved.drawer ?? 'runtime',
    setDrawer: (d) => up({ drawer: d, drawerOpen: true }),
    drawerOpen: saved.drawerOpen ?? true,
    setDrawerOpen: (v) => up({ drawerOpen: v }),
    swap: saved.swap ?? false,
    leftOpen: saved.leftOpen ?? true,
    rightOpen: saved.rightOpen ?? true,
    dock: saved.dock ?? 'view',
    setLayout: (p) => up(p),
    homeAsk: false,
    setHomeAsk: (v) => set({ homeAsk: v }),
  }
})
