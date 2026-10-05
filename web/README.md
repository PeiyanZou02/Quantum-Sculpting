# Quantum Sculptor — interface

The design layer for Quantum Sculpting: the Quicksilver component library and the Quantum Sculptor
screens (design handoff in `../design/handoff/`), built in React + TypeScript + three.js on top of
the Flask service in `../app/`. The research pipeline (voxelising, Quantum Blur Core, level sets,
Evolve) lives in `../app/` and is documented in the top-level `README.md`; this folder only talks to
it through `/api`.

The interface has two modes, switched at the top of the window:

- **Lab**, the research workspace: parameters, algorithms, readouts and the runtime log.
- **Present**, the display: the same geometry in a HUD you compose yourself, for screenshots,
  recordings and diagrams.

## Run it

Needs Node 20+ and [pnpm](https://pnpm.io) (the lockfile is `pnpm-lock.yaml`; `npm ci` will not work).

One command, one server:

```
cd web
pnpm install
pnpm dev --port 5190          # http://localhost:5190
```

`pnpm dev` also starts the Flask service (`app/server.py`, port 8770) and stops it on exit. It uses
`.venv` in the repo root if there is one, otherwise `python3`, so install `requirements.txt` there
first. The dev server proxies `/api` to the service and rewrites `Origin`, because the service only
accepts same-origin requests. Set `QS_API=http://localhost:8765` to use a service you started
yourself, for example with `run.bat`.

Without Node at run time: `pnpm build` writes to `app/static/studio/`, and the service then serves
this interface at `/` (`run.bat`, port 8765). Peiyan's original interface stays at `/classic`. The
build is git-ignored, so each machine builds it once; without a build, `/` falls back to the
original interface.

```
pnpm build      # type-check, then build into ../app/static/studio/
pnpm lint       # oxlint
```

## Lab

- **Input** (left): only parameters, 01 model → 04 mesh. Steps fold to a one-line summary; the
  scrollbar carries an index to jump between them. Evolve (Peiyan's nations mode) adds its
  parameters here and its own panel: turns, nations, relationships and the chronicle.
- **Display** (centre): the workspace, with the layers, lighting, and the overlays and HUD elements,
  each switchable under *Overlays*. What it shows is not picked by hand; it follows the focus (below).
- **Output** (right): readouts only: model, grid, slice, quantum result, print check, export.
- **Runtime terminal** (bottom): resizable drawer with the event and request log, the Evolve log
  (one line per turn, streaming as the turns play) and the Atlas jobs list (Atlas mode only).

### Focus: what the workspace shows

There is no Model / Voxels / Processed / Result switch. The workspace follows the step you are
working on, and the strip over it says which step that is and what you just did ("Grid size 64³").

| You… | Workspace shows | Side tab | Drawer |
| --- | --- | --- | --- |
| open a model or the test cup | each stage in turn as it finishes, ending on the surface (on Evolve's history in Evolve mode) | Properties | Runtime |
| touch Model or change the up axis | the original mesh | Properties | Runtime |
| touch Voxelise or change a setting there | the input voxels | Properties | Runtime |
| touch Quantum or change a setting there | the quantum result | Quantum | Runtime (Atlas jobs in Atlas mode) |
| an Atlas run tiled in layers comes back | the scan, following the run | Quantum | Atlas jobs |
| choose Evolve, change its settings, play or scrub turns | the nations, turn by turn | Evolve | Evolve log |
| touch Mesh, change a setting there, or export | the surface | Properties | Runtime |
| press the sweep or scan button under Slice | the scan sweep | Quantum | Runtime |

Downstream steps still update silently (a new grid is processed and meshed again), but the view
stays on the step you are working on. When that step's own result is not ready yet, the strip says
what is shown meanwhile. Moving a panel elsewhere in the dock is fine: the tab is brought forward
wherever it is.

Panels live in a dock: drag them between zones, resize the zones, show or hide them. The layout is
remembered per browser. A new tab starts empty, on the landing guide; a reload during work picks up
the model the service holds.

Viewport tools (also in Present):

| Key | Tool | What it does |
| --- | --- | --- |
| V | Navigate | Drag to orbit, right-drag to pan, scroll to zoom |
| R | Probe | Hover a cell to read its value |
| N | Annotate | Click to pin a note on a cell; it turns with the geometry |
| M | Measure | Click points; consecutive pins are joined with their distance in mm |
| S | Slice | Drag up or down to move the cutting plane through the grid |
| Home | | Back to the home camera |

Shading:

- **Wireframe** — edges only: voxels as a lattice, meshes as triangles.
- **Solid** — plain studio shading in one grey.
- **Value** — cells shaded by their value, darker is denser.
- **Entanglement** — thin-film interference driven by the cell values, from lookup tables computed
  by Moth's Entanglement Shader (`app/shaders.py`, routes under `/api/shader/`). Under Evolve,
  nations keep their own colours and value shading.

## Present

Present starts clean. Nothing is placed on the view until you put it there, and nothing on the view
moves unless you are arranging.

The **compose panel** (layers button in the bar) has six sections, reached from the nav at its
bottom:

1. **View** — which stage is shown (model, voxels, quantum, mesh, scan) and its shading.
2. **Layers and saved compositions** — everything on the view, with show/hide and remove; for the
   selected piece its emphasis, line weight, dash spacing, size, back to its place, and save as
   PNG. Compositions are saved by name and cycled with `[` `]` or 1–9.
3. **Library** — the full Quicksilver library (115 variants), by category, family and variant, with
   a count of what is on at each level: marks, navigation, quantum glyphs, data and runtime,
   controls as readouts, plus the scene's own guides (bounding box, print grid with its cell size in
   mm) and free text. Hover a row to preview it on the view with everything else dimmed; click to
   turn it on, click again to turn it off; drag it onto the view to place it exactly where you drop
   it. Every piece reads the app's live state and makes no requests of its own.
4. **Annotate** — notes and measurements pinned to the geometry.
5. **Motion** — shots (saved cameras) and the reel that flies through them, the turntable, and the
   slice sweep: plane position, range, step, seconds per pass and direction, applied while it runs.
6. **Capture** — screenshot, WebM recording of the view with its motion, a render of the geometry
   alone, and the HUD alone as a transparent PNG with dark or light ink.

Pieces keep clear of each other and of the top and bottom strips; corner pieces lean away and shrink
on smaller windows (checked at 1280, 1440 and 1920 wide).

| Key | In Present |
| --- | --- |
| C | Arrange on/off: drag, select (click) and remove pieces |
| Backspace / Delete | Remove the selected piece (while arranging) |
| H | Hide all controls, for a clean frame |
| T | Turntable on/off |
| `[` `]` | Previous / next saved composition |
| 1–9 | Load saved composition 1–9 |
| ← → | Previous / next shot |
| Esc | Deselect, stop arranging, show controls, or stop a recording |

## What is kept, and where

All of it is in the browser's local storage, per machine and per browser: the dock layout, theme,
HUD settings, saved compositions and their pieces, and which Input steps are folded. Nothing of the
interface is written to the service or to the repo. Models, Atlas results and exports are the
service's, in `input/`, `grids/` and `output/`.

## Font

TWK Everett is commercially licensed and not in the repo. Put `TWKEverett-Book.ttf` in
`web/public/fonts/` (git-ignored). Without it the page falls back to system sans. Geist Mono
comes from Google Fonts.

## Code layout

```
src/qs/          Quicksilver library: QPill, Segmented, QReadout, QDial, QFader, Stepper,
                 TextField, QCam (gimbal), QSlice, QProbe, QDensity, QCircuit, Marks
src/hud/         HUD pieces (frame, orbit, camera, dial, bounds, focus, callouts, scan, steps,
                 cards, stages, …) and the Composer that places them
src/view/        three.js engine (grid coordinates, controlled camera, picking), entanglement
                 shading (entangle.ts, hdr.ts), nation colours for Evolve
src/dock/        the dockable panel layout
src/screens/     TopBar, InputPane, Stage (display + HUD), OutputPane, Terminal, KeyDialog,
                 EvolvePanel, PresentBar, PresentPanel, MarkLibrary, capture
src/api.ts       typed client for every route in app/server.py
src/store.ts     pipeline state (zustand), mirroring the handoff's "State" section
src/present.ts   Present state: compositions, pieces, shots, motion, capture
```

## What this folder changes outside `web/`

Kept small so it merges cleanly with the research side:

- `app/server.py` — serves the build at `/` and `/studio/`, keeps the original interface at
  `/classic`, and registers the shader routes.
- `app/shaders.py` (+ `tests/test_shaders.py`) — the Entanglement Shader client and cache.
- `.gitignore` — `web/node_modules/`, the font files, and the build in `app/static/studio/`.
- `README.md` — a pointer to this file.

When `app/server.py` gains or changes a route, update `src/api.ts` to match.
