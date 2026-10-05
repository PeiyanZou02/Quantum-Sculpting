# Quantum Sculptor — interface

The design layer for Quantum Sculptor: the Quicksilver component library and its
screens (design handoff in `../design/handoff/`), built in React + TypeScript + three.js on top of
the Flask service in `../app/`. The research pipeline (voxelising, Quantum Blur Core, level sets,
Evolve) lives in `../app/` and is documented in the top-level `README.md`; this folder only talks to
it through `/api`.

It is laid out as an app with two tabs:

- **Lab** is the one workspace. Parameters (inputs) in one column, the view in the middle, Properties
  in the other column, and the drawer (runtime, Evolve log, Atlas jobs) with the workspace's status
  on its row. Properties has six groups on its rail: one per step (Model, Grid, Quantum or Evolve,
  Mesh), then **Compose** (presets, what the view's own controls show, the component library,
  annotations, saved compositions) and **Output** (frame, image, video, 3D, motion). Columns fold,
  swap sides and resize from their inner edge; the drawer folds and docks under the view or along
  the whole window.
- **Research** holds the research behind the project, set as an article (a working draft for Peiyan to revise; `src/screens/Research.tsx`).

Lab opens on its default layout (Properties · Compose · Presets · Default): readouts down the sides,
the steps on top, the run underneath; the pieces scale with the room the panels leave. The title in
the top bar opens the start page: what Quantum Sculptor is, how a model goes through it, and the ways
in (with a model open it asks first, and offers to export the mesh).
Start from a built-in shape (the test cup, a sphere, cube, pyramid, cylinder, cone or torus) or
import your own model. Each step's action sits at the foot of Parameters: Voxelise, Run (Run on Atlas
with a key, Set API key otherwise; Run Evolve and Play turns), Build the mesh. The built-in shapes run
their steps by themselves, one into the next as settings change; your own models wait for each Run
(or *Run all*, which does whatever is missing or out of date), since they can be large. The switch
*Run steps by themselves* sits under the actions.

Evolve's random numbers come from this machine (seeded by the run name) or from Atlas: under
*Random numbers*, *Atlas* makes the step's action **Run on Atlas**, which asks the comet-qrng-v1
engine for a pool of random bytes (one job, on the simulator or a real chip). Once the bytes are on
this computer, changing a setting evolves from the same bytes again without asking; Properties ·
Evolve result says where they came from. Details in the top-level README.

The drawer's row is the status line: what is running and how far along (Atlas tiles and Evolve turns
as a share, with a bar; other steps with the time they have taken), or what the workspace waits for,
then the latest line of the runtime log.

Every tab uses one control language (`src/ui/`), after Blender's properties editor: panels with a
header bar that fold, property rows (label | control), number fields that fill to their value
(drag across, double-click or Enter to type, arrows to step), flat segments, rectangular buttons,
square checkboxes. 11 px mono, sentence case, never all caps; light and dark.

## Run it

**While the work is going on (macOS, Linux):** from the repo root, once:

```
./dev.sh            # http://localhost:5109 ; ./dev.sh 5200 for another port
```

It serves the interface with the Flask service and follows the branch you are on: every 20 s it
fetches from GitHub and fast-forwards to new commits, so the page reloads by itself. When an update
changes dependencies or the Python service it installs and restarts them. It never pulls over your
own uncommitted changes or unpushed commits (it says so and waits). The first run creates `.venv`
and installs everything. Ctrl+C stops it all.

**By hand:**

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

- **Input** (left): only parameters. A rail of steps (01 Model, 02 Voxelise, 03 Quantum or
  Evolve, 04 Mesh) shows one step at a time, made of panels in Peiyan's order (source and
  orientation; grid and fill; engine, blur or nations, circuit and run; surface, voxel operations,
  mesh and print). The rail follows the focus: open a step and the view shows it.
- **Display** (centre): the workspace, with the layers, lighting, and the overlays and HUD elements,
  each switchable under *Overlays*. What it shows is not picked by hand; it follows the focus (below).
- **Output** (right): readouts only: model, grid, slice, quantum result, print check, export.
- **Runtime terminal** (bottom): resizable drawer with the event and request log, the Evolve log
  (one line per turn, streaming as the turns play) and the Atlas jobs list (Atlas mode only).

### Focus: what the workspace shows

The workspace follows the step you are working on, and the strip over it says which step that is
and what you just did ("Grid size 64³"). Its steps (Model, Voxels, Quantum or Evolve, Mesh, Scan)
are also buttons: a click shows that step until you work on another. The input rail follows too.

| You… | Workspace and input rail | Drawer |
| --- | --- | --- |
| open a model or the test cup | each stage in turn as it finishes, ending on the surface (on Evolve's history in Evolve mode) | Runtime |
| open Model or change the up axis | the original mesh | Runtime |
| open Voxelise or change a setting there | the input voxels | Runtime |
| open Quantum or change a setting there | the quantum result | Runtime (Atlas jobs in Atlas mode) |
| an Atlas run tiled in layers comes back | the scan, following the run | Atlas jobs |
| choose Evolve, change its settings, play or scrub turns | the nations, turn by turn | Evolve log |
| open Mesh, change a setting there, or export | the surface | Runtime |

Downstream steps still update silently (a new grid is processed and meshed again), but the view
stays on the step you are working on. When that step's own result is not ready yet, the strip says
what is shown meanwhile. The side panels are resizable and the drawer folds; both are remembered per
browser. A new tab starts empty, on the landing guide; a reload during work picks up the model the
service holds.

Viewport tools (the tool shelf on the left of the view):

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

## Compose and Output

The view carries a composition: pieces from the Quicksilver library laid out around the object, which
always stays in the centre. **Properties · Compose** holds it:

1. **Presets** — **Default** (Lab's own layout), then one per category of the library, each with one
   piece from every family in it on top of the scene's guides: **Marks**, **Navigation**, **Evolve**, **Glyphs**, **Data**, and
   **Composite**, the most telling piece of each together (it follows the engine in use). A preset lays
   its pieces out around the object, which stays in the centre; in a small view the whole plate scales
   down rather than lose pieces. *Lay out again* re-runs the layout for the frame (all pieces, without
   repeats, or only the essentials); *Arrange* (C) lets you drag, resize by the corner, select and
   remove pieces on the view; *Clear* takes them all off.
2. **On the view** — the view's own controls (tool shelf, navigation, axis gizmo, camera, info, value
   scale, corners) and the scene guides (grid box, print grid with its cell size, cutting plane).
   Pieces show figures, bars and charts only; *Explanations in pieces* brings back their captions and
   notes.
3. **Library** — the full Quicksilver library, by category, family and variant. Hover a row to
   preview it on the view; click to turn it on or off; drag it onto the view to place it there.
   Besides marks, glyphs and data, the library holds **Parameters** (any setting as a readout: grid,
   strength, reach, sigma, turn, nations, turns, growth, level, smoothing, thicken, cutting plane,
   film, colour) and live feeds: the runtime log, the Atlas jobs, the Evolve log and one nation.
   Every piece with something to animate has a **motion switch** (▶) beside its dot: filled, it moves
   with the clock; empty, it holds still, keeping what it showed when the animation began. All pieces
   read the same run, so the ones that move stay in step.
4. **Animate** — the rhythm of one clock. The **timeline** shows the pass to scale with the step on
   screen; drag on it to scrub. **Play** (P), **Start**, **Record** (one pass from the start, to
   WebM), speed 0.25× to 4×, and loop.
   *Steps* cycles the run from the original geometry to the mesh (on by default): Model, Voxels,
   Evolve (or Quantum) and Mesh, each a toggle, so the loop can be Evolve alone or any mix; seconds
   per step, and for Evolve turns per second (every turn of the history plays, the territory morphing
   from one to the next). *Blend between steps* fades each step in and raises the result out of the
   voxels on a plane before it plays.
   *Cutting plane*: off, through the whole loop, or with the mesh; up and down, up or down; one pass
   in so many seconds, between two layers. The plane on the view, the slice card and the layer stack
   follow it.
   *Camera*: turntable, and saved shots to fly through. *Look*: cycle the shading, the light, the
   backdrop, and the saved compositions.
   As the clock runs, figures count to their new value, bars and rules ease, the chronicle and logs
   add their lines, the territory playhead glides, the layer stack's cursor slides with the plane, and
   Relations (Peiyan's nation graph: each nation where it sits on the model, seen from the front,
   sized by territory; borders weighted by their ties, heavy at alliances; this turn's attacks in red;
   exiles ringed) drifts, swells and thickens with the turns.
5. **Annotate** — notes and measurements pinned to the geometry.
6. **Saved compositions** — saved by name and cycled with `[` `]` or 1–9.

**Properties · Output** holds the frame (window, 16:9, 21:9, 1.91:1, 1:1, 4:5, 9:16, 1:2, A-series)
and its export size, images (the frame as PNG, a screen grab, the geometry alone, the pieces alone),
video (a WebM of the view, cropped to the frame where the browser can; one pass of the animation)
with *Hide controls* (H) for clean takes, and 3D (STL, GLB).

Properties keeps the group you pick on its rail; it does not follow the step open in Parameters.
Sections (Grid · Slice, the slice card, and the cutting plane in the view, which shows itself when you
move it) are coloured Auto, Grey, Heat or Nations: Auto is Nations while an Evolve turn is on screen.

The drawer has three feeds, each a different source: **Runtime** is this app and the local service
(requests, steps, warnings); **Evolve log** is the story of the Evolve run, turn by turn; **Atlas
jobs** is your account on Atlas, including jobs from other sessions. Each is also a piece for the view.

| Key | Anywhere in Lab (not while typing) |
| --- | --- |
| C | Arrange on/off: drag, select (click) and remove pieces |
| Backspace / Delete | Remove the selected piece (while arranging) |
| H | Hide all controls, for a clean frame |
| T | Turntable on/off |
| P | Play or stop the animation |
| `[` `]` | Previous / next saved composition |
| 1–9 | Load saved composition 1–9 |
| ← → | Previous / next shot |
| Esc | Deselect, stop arranging, show controls, or stop a recording |

## What is kept, and where

All of it is in the browser's local storage, per machine and per browser: the open tab, panel widths,
which panels are folded, theme,
HUD settings, saved compositions and their pieces, and which Input steps are folded. Nothing of the
interface is written to the service or to the repo. Models, Atlas results and exports are the
service's, in `input/`, `grids/` and `output/`.

## Font

One family throughout: TWK Everett Mono, commercially licensed and not in the repo. Put
`TWKEverettMono-Regular.woff2`, `-Medium.woff2` and `-Bold.woff2` in `web/public/fonts/`
(git-ignored). Without them the page falls back to the system monospace.

## Code layout

```
src/qs/          Quicksilver library: QPill, Segmented, QReadout, QDial, QFader, Stepper,
                 TextField, QCam (gimbal), QSlice, QProbe, QDensity, QCircuit, Marks
src/hud/         HUD pieces (frame, orbit, camera, dial, bounds, focus, callouts, scan, steps,
                 cards, stages, …) and the Composer that places them
src/view/        three.js engine (grid coordinates, controlled camera, picking), entanglement
                 shading (entangle.ts, hdr.ts), nation colours for Evolve
src/ui/          the control language: Panel, Row, Fact, Button, Checkbox (ui.css)
src/screens/     TopBar, Shell (drawer, resizers), Research (the article), InputPane, Stage (display + HUD),
                 OutputPane, QuantumPanel, EvolvePanel, PresentPanel (Compose and Output),
                 RunBar, Shapes, Terminal, EvolveLog, KeyDialog, MarkLibrary, capture
src/shell.ts     the open tab, panel sizes and the drawer
src/api.ts       typed client for every route in app/server.py
src/store.ts     pipeline state (zustand), mirroring the handoff's "State" section
src/present.ts   the composition: pieces, presets, shots, motion, capture
src/primitives.ts  the built-in shapes, made as STL in the browser
```

## What this folder changes outside `web/`

Kept small so it merges cleanly with the research side:

- `app/server.py` — serves the build at `/` and `/studio/`, keeps the original interface at
  `/classic`, and registers the shader routes.
- `app/shaders.py` (+ `tests/test_shaders.py`) — the Entanglement Shader client and cache.
- `.gitignore` — `web/node_modules/`, the font files, and the build in `app/static/studio/`.
- `README.md` — a pointer to this file.

When `app/server.py` gains or changes a route, update `src/api.ts` to match.
