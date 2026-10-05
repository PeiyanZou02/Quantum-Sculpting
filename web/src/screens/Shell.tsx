// Shell parts: the resizers between panels, the drawer under the view (runtime, Evolve log, Atlas
// jobs), and the Notes page.
import type { ReactNode } from 'react'
import { useShell, type DrawerTab } from '../shell'
import { useStore } from '../store'
import { RuntimePanel, AtlasPanel } from './Terminal'
import { EvolveLog } from './EvolveLog'
import { Icon, IconButton } from '../qs/Icon'
import { Now, AtlasStatus, ThemeButton } from './TopBar'

/** A drag handle on a panel edge. `dir` is the side the panel grows toward when dragged that way. */
export function Resizer({ edge, value, min, max, set }: { edge: 'left' | 'right' | 'top'; value: number; min: number; max: number; set: (v: number) => void }) {
  return (
    <div className={`ux-resize ux-resize--${edge}`} role="separator" aria-orientation={edge === 'top' ? 'horizontal' : 'vertical'}
      onPointerDown={(e) => {
        e.preventDefault()
        const x0 = e.clientX, y0 = e.clientY, v0 = value
        const move = (ev: PointerEvent) => {
          const d = edge === 'top' ? y0 - ev.clientY : edge === 'left' ? ev.clientX - x0 : x0 - ev.clientX
          set(Math.round(Math.min(max, Math.max(min, v0 + d))))
        }
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('ux-resizing') }
        document.body.classList.add('ux-resizing')
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }} />
  )
}

const DRAWER: { id: DrawerTab; t: string; icon: string; render: () => ReactNode }[] = [
  { id: 'runtime', t: 'Runtime', icon: 'terminal', render: () => <RuntimePanel /> },
  { id: 'evlog', t: 'Evolve log', icon: 'entangle', render: () => <EvolveLog /> },
  { id: 'atlas', t: 'Atlas jobs', icon: 'atlas', render: () => <AtlasPanel /> },
]

/** A side column: a title bar with its controls (swap sides, fold), or a slim strip when folded. */
export function Column({ side, title, icon, open, width, onWidth, onFold, onSwap, children }: {
  side: 'left' | 'right'; title: string; icon: string; open: boolean; width: number
  onWidth: (v: number) => void; onFold: (open: boolean) => void; onSwap?: () => void; children: ReactNode
}) {
  if (!open) {
    return (
      <aside className={`ux-side ux-side--${side} ux-side--folded`}>
        <button className="ux-strip" onClick={() => onFold(true)} data-tip={`Show ${title.toLowerCase()}`} data-tip-side={side === 'left' ? 'right' : 'left'}>
          <Icon name={icon} size={14} />
          <span className="ux-strip__t">{title}</span>
        </button>
      </aside>
    )
  }
  return (
    <aside className={`ux-side ux-side--${side}`} style={{ width }}>
      <header className="ux-col__h">
        <span className="ux-col__t">{title}</span>
        <span className="ux-col__tools">
          {onSwap && <button className="ux-ib" onClick={onSwap} data-tip="Move to the other side" aria-label="Move to the other side">⇄</button>}
          <button className="ux-ib" onClick={() => onFold(false)} data-tip={`Fold ${title.toLowerCase()}`} aria-label={`Fold ${title}`}>{side === 'left' ? '‹' : '›'}</button>
        </span>
      </header>
      <div className="ux-col__b">{children}</div>
      <Resizer edge={side === 'left' ? 'left' : 'right'} value={width} min={240} max={560} set={onWidth} />
    </aside>
  )
}

/** The drawer: runtime, Evolve log and Atlas jobs, and on its tab row the workspace's status (what is
 *  loaded, the latest event, Atlas, theme, help). Folds to that row; docks under the view or along the
 *  whole window. */
export function Drawer({ content = true }: { content?: boolean }) {
  const sh = useShell()
  const errors = useStore((s) => s.log.filter((l) => l.level === 'error').length)
  const cur = DRAWER.find((d) => d.id === sh.drawer) ?? DRAWER[0]
  return (
    <section className={'ux-drawer' + (sh.drawerOpen ? '' : ' ux-drawer--closed')} style={sh.drawerOpen ? { height: sh.bottom } : undefined}>
      {sh.drawerOpen && <Resizer edge="top" value={sh.bottom} min={96} max={Math.round(window.innerHeight * 0.6)} set={(v) => sh.setSize({ bottom: v })} />}
      <div className="ux-drawer__tabs" role="tablist">
        {DRAWER.map((d) => (
          <button key={d.id} role="tab" aria-selected={d.id === cur.id} className={'ux-tab' + (d.id === cur.id ? ' ux-tab--on' : '')} onClick={() => sh.setDrawer(d.id)}>
            <Icon name={d.icon} size={12} />{d.t}{d.id === 'runtime' && errors > 0 && <span className="ux-tab__n">{errors}</span>}
          </button>
        ))}
        <div className="ux-drawer__status"><Now /></div>
        <AtlasStatus />
        <ThemeButton />
        <IconButton name="help" size={22} title="Help · README" onClick={() => window.open('https://github.com/madebyrayz/quantum-sculptor#readme', '_blank')} />
        {content && <button className="ux-ib" onClick={() => sh.setLayout({ dock: sh.dock === 'view' ? 'full' : 'view' })}
          data-tip={sh.dock === 'view' ? 'Dock along the whole window' : 'Dock under the view'} aria-label="Change where the drawer docks">{sh.dock === 'view' ? '⤓' : '⤒'}</button>}
        <button className="ux-drawer__fold" onClick={() => sh.setDrawerOpen(!sh.drawerOpen)} aria-label={sh.drawerOpen ? 'Fold the drawer' : 'Open the drawer'} data-tip={sh.drawerOpen ? 'Fold' : 'Open'}>
          <span className={'ux-chev' + (sh.drawerOpen ? ' ux-chev--down' : ' ux-chev--up')} />
        </button>
      </div>
      {sh.drawerOpen && <div className="ux-drawer__b">{cur.render()}</div>}
    </section>
  )
}

/** Notes: the research behind the project. Peiyan is writing it; this is its place. */
export function NotesPage() {
  return (
    <div className="notes">
      <div className="notes__col">
        <span className="notes__k">Notes</span>
        <h1 className="notes__t">The research behind Quantum Sculpting</h1>
        <p className="notes__p">Peiyan is writing this part: the concept, the quantum procedures (Quantum Blur Core, the nations of Evolve), the method and the references. It will live here, beside the Lab that makes the geometry and the composer that presents it.</p>
        <p className="notes__p notes__p--dim">Placeholder · to be written.</p>
      </div>
    </div>
  )
}
