// Which panels are open, per id, remembered in this browser (a per-viewer convenience).
import { useSyncExternalStore } from 'react'

const KEY = 'qs-panels'
let state: Record<string, boolean> = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
})()
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function setPanelOpen(id: string, open: boolean) {
  state = { ...state, [id]: open }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* per-viewer only */ }
  emit()
}

export function usePanelOpen(id: string, fallback: boolean): [boolean, () => void] {
  const open = useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f) } },
    () => state[id] ?? fallback,
  )
  return [open, () => setPanelOpen(id, !open)]
}
