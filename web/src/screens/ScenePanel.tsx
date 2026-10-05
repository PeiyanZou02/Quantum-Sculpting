// SCENE: what exists in the workspace, after Blender's outliner. Click a row to show it; the eye draws
// it faintly with the current view (ghost); the arrow lets the probe read it.
import { useStore, type Layer, type View } from '../store'
import { Icon, IconButton } from '../qs/Icon'
import { fmt } from './parts'

export function ScenePanel() {
  const st = useStore()
  const { model, grid, proc, report, view, layers, hud, slice, gridData, procData, resultMesh, modelMesh } = st
  if (!model) return <div className="panel panel--empty"><p className="qs-help">Nothing in the scene yet. Use the test cup or import a model.</p></div>
  const rows: { id: Layer; view: View; icon: string; t: string; d: string; has: boolean }[] = [
    { id: 'model', view: 'model', icon: 'model', t: model.builtin ? 'test cup' : model.file, d: `${fmt.int(model.faces)} faces`, has: !!modelMesh },
    { id: 'voxels', view: 'voxels', icon: 'grid', t: 'Input grid', d: grid ? `${grid.n}³ · ${fmt.int(grid.solid)} solid` : 'not voxelised', has: !!gridData },
    { id: 'processed', view: 'processed', icon: 'quantum', t: 'Quantum result', d: proc ? `${proc.run} · ${proc.mode === 'emulator' ? 'emulation' : proc.mode === 'nations' ? 'Evolve' : proc.mode}` : 'not computed', has: !!procData },
    { id: 'result', view: 'result', icon: 'print', t: 'Surface', d: report ? `${fmt.int(report.faces)} faces` : 'not meshed', has: !!resultMesh },
  ]
  const shown = view === 'scan' ? 'processed' : view
  return (
    <div className="panel">
      <div className="outliner" role="tree" aria-label="Scene">
        <div className="outliner__root"><Icon name="layers" /> <span>Scene</span></div>
        {rows.map((r) => {
          const main = r.id === shown
          return (
            <div key={r.id} role="treeitem" aria-selected={main} className={'ol-row' + (main ? ' ol-row--on' : '') + (r.has ? '' : ' ol-row--off')}>
              <button className="ol-row__name" disabled={!r.has} onClick={() => st.setView(r.view)} data-tip={`Show the ${r.t.charAt(0).toLowerCase() + r.t.slice(1)}`}>
                <Icon name={r.icon} />
                <span className="ol-row__t">{r.t}</span>
                <span className="ol-row__d">{r.d}</span>
              </button>
              <IconButton size={22} name="navigate" title={layers[r.id].pickable ? 'Probe reads it · click to ignore' : 'Probe ignores it · click to read'} dim={!layers[r.id].pickable} disabled={!r.has}
                onClick={() => st.setLayer(r.id, { pickable: !layers[r.id].pickable })} />
              <IconButton size={22} name={main || layers[r.id].visible ? 'eye' : 'eyeOff'} title={main ? 'Shown in the view' : layers[r.id].visible ? 'Hide the ghost' : 'Show as a ghost with the view'}
                dim={!main && !layers[r.id].visible} disabled={!r.has || main} onClick={() => st.setLayer(r.id, { visible: !layers[r.id].visible })} />
            </div>
          )
        })}
        <div className={'ol-row' + (gridData ? '' : ' ol-row--off')}>
          <button className="ol-row__name" disabled={!gridData} onClick={() => st.setHud({ slice: !hud.slice })} data-tip="Cutting plane">
            <Icon name="slice" />
            <span className="ol-row__t">Cutting plane</span>
            <span className="ol-row__d">{slice.axis} {slice.index}</span>
          </button>
          <span />
          <IconButton size={22} name={hud.slice ? 'eye' : 'eyeOff'} title={hud.slice ? 'Hide the plane' : 'Show the plane'} dim={!hud.slice} disabled={!gridData} onClick={() => st.setHud({ slice: !hud.slice })} />
        </div>
      </div>
    </div>
  )
}
