// A column of icon tabs down the left edge of a panel, one per section (like Blender's property
// tabs). The active one follows the scroll; clicking jumps to that section.
import type { ScrollIndex } from '../qs/ScrollArea'
import { IconButton } from '../qs/Icon'

export function SectionTabs({ markers, active, go, label }: ScrollIndex & { label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {markers.map((mk) => (
        <IconButton key={mk.id} name={mk.icon ?? 'grid'} title={mk.label} side="right" on={active === mk.id} onClick={() => go(mk.id)} />
      ))}
    </nav>
  )
}
