# Handoff: Quantum Sculptor

## Overview
Quantum Sculptor is a local web app (`127.0.0.1:8765`) that takes a mesh through four steps: **01 Model → 02 Voxelise → 03 Quantum → 04 Mesh**, then exports a printable STL. Step 03 blurs the voxel grid with Quantum Blur Core, either locally (Gaussian or emulation) or on Moth's Atlas service, where large grids run as tiles.

This bundle has two documents:

1. **`Quicksilver Library.dc.html`**: the component library. It covers type, marks, buttons, physical controls, navigation, quantum glyphs and data.
2. **`Quantum Sculptor Screens.dc.html`**: the base wireframe of ten screens at 1920 × 1080, each built from the library.

Every other file in the folder is a part of these two documents.

## About the design files
The files are **design references made in HTML**. They are prototypes that show the intended look and behaviour, not production code to copy. Rebuild them in the target codebase's environment (React, Vue, etc.) with its own patterns. The current repo (`PeiyanZou02/Quantum-Computing-3D-Test`) serves a Flask backend with a plain front end. If no front-end framework is chosen yet, React with SVG for the marks and three.js for the view is a good fit.

To view the files, open either `.dc.html` file directly in a browser. `support.js` is the small runtime that mounts the parts; `<dc-import name="X">` loads the sibling file `X.dc.html`. Keep all files in one folder.

## Fidelity
**High fidelity** for colours, type, strokes, marks, controls and interactions; recreate these exactly. Layout coordinates in the screens are exact at 1920 × 1080.

The following are **sample data**, not real output, and must come from the backend:
- Cell values, blur results and histograms (generated from an approximate cup).
- Timings, logs and job progress.
- File sizes and the API key format.

The 3D views come from `qvoxel.js`, a stand-in renderer (three.js 0.170 from a CDN) that imitates the pipeline. Replace it with the real viewer.

## Design tokens

### Colour (light theme only)
| Token | Value | Use |
|---|---|---|
| `bg` | `#E3E4E7` | App and screen background |
| `canvas` | `#D6D7DA` | Area around artboards (docs only) |
| `ink` | `#151618` | Primary text, marks, active strokes |
| `ink2` | `#55575D` | Secondary text |
| `ink3` | `#8B8D93` | Labels, context strokes, idle marks |
| `ink4` | `#B3B5BB` | Disabled text, hidden edges, idle bars |
| `line` | `rgba(21,22,24,.16)` | Rules between groups |
| `ctl` | `rgba(21,22,24,.26)` | Hairline border of pills and segmented controls |
| `sel` | `#CBCCD0` | Selected segment fill |
| `faint` | `rgba(21,22,24,.07)` | Faint pill fill |
| `dot` | `#C4C6CB` | Empty-view dot grid (1px dots, 24px pitch) |
| `scrim` | `rgba(227,228,231,.88)` | Overlay behind the API key form |

There are no accent colours. State changes are shown with ink weight, dashes and inversion: ink fill with `#E3E4E7` text.

### Metal (physical controls only)
Satin aluminium is used **only** on objects you turn, slide or aim: dials, faders, drums, the gimbal ring, yoke and bead. Buttons are never metal.
- **Band and ring gradient:** linear, `#A9ABB0` 0 → `#F1F2F3` .28 → `#C6C8CC` .5 → `#F5F6F7` .72 → `#A2A4A9` 1. Each band gets an edge stroke of `rgba(20,22,28,.3)`, 1.2px wider than the band.
- **Bead and puck:** radial at 40% / 32%: `#FFFFFF` 0 → `#E4E5E8` 38% → `#C3C5CA` 78% → `#AEB0B5` 100%.
- **Puck shadow:** `0 1px 1.5px rgba(20,22,28,.28), 0 5px 10px rgba(20,22,28,.16)`.
- **Recess:** `#C4C6CB` with `inset 0 1px 3px rgba(20,22,28,.4), 0 1px 0 rgba(255,255,255,.75)`.
- **Cast shadow (gimbal):** radial `#14161C` at 10% opacity, fading to 0.

### Type
- **TWK Everett Book** (`fonts/TWKEverett-Book.ttf`) is for titles and prose.
  - 96/1: doc title
  - 28/1.1: step title
  - 20/1: app name
  - 16/1.2: subsection title
  - 14/1.35: body
  - 13/1.35: inspector prose
  - 12/1.3: captions
- **Geist Mono** (Google Fonts, 400/500/600) is for **every number** and all UI text: buttons, labels, readouts and logs.
  - 11/1: standard
  - 10/1: small
  - 13/1: field values
  - 40/1: hero numbers
  - Always `font-variant-numeric: tabular-nums`.
- **Capitals:** use them only for one-word section labels (`SLICE`, `DENSITY`, `CAMERA`, `LOG`), set at 600 10px with `letter-spacing: .04em`. Acronyms (`STL`, `API`), axes (`X Y Z`) and codes (`HTTP 401`, `TMPRL1103`) keep their natural capitals. Everything else is sentence case, including buttons and navigation.

### Shape, stroke and motion
- **Radius:** pills are `999px`. Nothing else is rounded, apart from round controls (dials, beads). Marks have square corners.
- **Strokes:** 1px hairlines everywhere. Dashes: `2 3` for guides and hidden edges, `3 3` for previews and measures, `1 2.5` for drop lines, `2 2` for the hover halo. Heavier strokes are allowed only for active sweeps (1.6px) and the hover cell (1.5px).
- **No panels or cards.** Group content with space and 1px rules, never with filled boxes.
- **Motion:**
  - Snap: 480ms, ease-out cubic.
  - Commit flash: 240ms.
  - Ruler fade: 160ms.
  - Pill transitions: 150ms.
  - Live dot blink: 1.2s.
  - Spinner: 0.9s linear.
  - Scan sweep: 3.2s.

## Components (library files)

### Buttons: `QPill`
`label`, `kind`, `size`, `dot`, `arrow`. The font is Geist Mono 400, and colour and border transitions take 150ms.

**Sizes**
| `size` | Height | Font | Horizontal padding |
|---|---|---|---|
| `s` | 22px | 10px | 10px |
| `m` | 30px | 11px | 14px |
| `l` | 40px | 12px | 20px |

**Kinds**
| `kind` | Border | Fill | Text | Notes |
|---|---|---|---|---|
| `line` | 1px ink | none | ink | |
| `hair` | 1px `ctl` | none | ink2 | |
| `ghost` | none | none | ink2 | |
| `faint` | none | `faint` | ink | |
| `active` | 1px ink | `sel` | ink | |
| `commit` | 1px ink | none | ink | Adds a `→` arrow |
| `disabled` | 1px dashed ink4 | none | ink4 | |

**Status dot** (6px)
- `on`: solid ink.
- `off`: hollow, with an ink3 ring.
- `busy`: half filled.

Hover, pressed, focus and loading states are shown in Buttons and inputs.

**Segmented control:** a 2px-padded pill with a `ctl` border. Each segment is 22–24px tall with 9–11px padding. The selected segment has a 1px ink border and a `sel` fill.

### Readout: `QReadout`
- Props: `title`, `rows`, `leader`, `kw`, `w`.
- `rows` is written as `"Key|Value|Flag;…"`.
- `title` renders as a capitals section label.
- `kw` sets the key column width and `w` the total width.
- `leader` draws dotted leaders between key and value.

### Physical controls
- **`QDial`**: `size`, `value` (0–1), `label`, `readout`, `param`, `min`, `max`, `ticks` (37), `major` (4), `detents`, `active`.
  - Arc dial with a satin cap.
  - States: rest, hover ring, turning (with a value flag), pressed (reset), scroll (±0.01).
- **`QFader`**: `orient` (`v` or `h`), `len`, `min`, `max`, `value`, `steps`, `major`, `label`, `readout`, `param`.
- **`QCam`, the orbit gimbal.** It replaces the old orbit pad and is shown in the view's bottom-left corner.
  - **Props:** `az` ("035"), `el` ("22"), `dist` ("2.40"), `state` (`live`, `hover`, `drag` or `snap`; forced states are for documentation), `bare` (hides the readout and stations).
  - **Size:** the gimbal is 188 × 150 px. Next to it, after a 20px gap, sit a 150px readout and four station pills.
  - **Geometry:**
    - The turntable ring has radius 62 and is seen from above at a tilt with sin = 0.34.
    - The ring is a 6px satin band with 24 ticks: majors every 90° (ink), others every 15° (ink3 in front, ink4 behind).
    - The yoke is a 4.2px satin semicircle that follows the azimuth. The bead is 6.5px.
    - The bead hangs a dotted drop line to the floor and sends a ray, with a small frustum, to the model's bounding box at the centre.
    - The swept azimuth (from 0° to `az`) is drawn as an ink arc on the ring, and the elevation as an ink arc inside the yoke.
  - **Interaction:**
    - Drag: horizontal changes azimuth at 1.2°/px; vertical changes elevation at 0.8°/px, clamped to 0–89°.
    - Shift-drag dollies at 0.02/px, clamped to 0.6–8.
    - Double-click snaps back to the props.
    - Stations: Front 000°/0°, Side 090°/0°, Top 000°/89°, Iso 045°/35°. A snap tweens 480ms with an ease-out cubic along the shortest arc.
  - **States:**
    - Rest: no labels.
    - Hover: shows the ring labels (000, 090, 180, 270), yoke ticks every 15°, `az`/`el` values and a dashed halo (r 11.5) around the bead.
    - Drag: the halo turns solid, the bead grows to 7.5 and the readout adds the change since the press (`+12°`).
    - Snap: shows a dashed ghost bead at the target and a dashed path along the ring.

### Marks
- **Families:** orbit rings, selection, focus, bounds, scan and slice, and callouts. Each has four variants in the library.
- **Mark states:** every mark has three.
  - **Rest:** as drawn.
  - **Hover:** grey 10px corners at 10px outset and a data flag (hollow pill at the top right).
  - **Pinned (click):** ink corners and an inverted flag. Click again to unpin.
- **`QSlice`, the slice plane and index.**
  - **Props:** `layout` (`compact` 260 × 156, `inspector` 344 wide, `wide` 1100 wide), `axis` (`z`, `x` or `y`), `index` (0–31), `state` (`live`, `hover` or `drag`).
  - **Diagram:** a cabinet-projection cube of 32³ cells (receding axis × .433 / .25).
    - Hidden edges are dashed ink4; visible edges are ink3.
    - The plane is filled `rgba(21,22,24,.05)` with a 1px ink edge, and its real section cells are drawn in ink at 82%.
    - The index rail runs beside the axis edge, with ticks every 2 cells (3px) and every 8 (6px), and labels 0/8/16/24/31.
    - A leader runs from the plane to the rail, ending in an index tab pill (`z 16`).
  - **Inspector and wide layouts add:**
    - A 300 × 300 section map of 32 × 32 cells: solid cells in ink2, grid lines every 8 cells, corner marks and axis hints.
    - An X/Y/Z axis toggle.
    - A sparkline of solid cells per layer (32 bars, 44px tall).
    - A `Layer` readout: axis, index, position (index × 3.2 mm), solid cells, area (cells × 10.24 mm²) and share of all solid cells.
  - **Interaction:**
    - Hovering the cube previews a layer: a dashed plane, a dashed tab with the cell count, and the map shows the preview in ink3 tagged `preview`.
    - Press and drag sets the index, and the tab inverts while held. On release the plane fill flashes to .14 for 240ms.
    - Hover a bar to preview it; click a bar to jump to it.
    - Hover the map to see a cell outline (1.5px), dashed crosshairs and a readout such as `x 18 · y 16 · z 16 · solid`.
- **`QProbe`, the live layer over the 3D view.**
  - **Props:** `w`, `h`, `step` (0–3), `level`, `demo` (`live`, `hover` or `pins`).
  - **Mapping:** the 32-cell grid covers 30–70% of the width and 12–88% of the height (sample mapping). Replace it with real picking against the voxel grid.
  - **Hover:**
    - The cursor is hidden and a reticle takes its place: four arms, a 5px gap, 13px reach.
    - Rulers fade in over 160ms along the bottom and right edges, with ticks every 2 cells (4px) and every 8 (8px).
    - Triangle markers and `x n` / `z n` labels follow the cursor along the rulers, joined to the reticle by dashed guides.
    - A two-line flag sits at +18 / −34px from the cursor and flips left within 220px of the right edge. Its text has a 2–6px `#E3E4E7` halo, not a backdrop.
  - **Readouts by step:**
    - 0 (Model): mm position and distance to the surface.
    - 1 (Voxelise): coverage.
    - 2 (Quantum): input → blurred value.
    - 3 (Mesh): value, kept or removed at the level.
  - **Click pins** up to three notes; the oldest drops off, and clicking within 12px of a pin removes it. A pin is:
    - A 3.2px ink dot with an 8px ring.
    - An elbow leader: an 18px diagonal, then 34px across.
    - A 16px numbered ink disc followed by two lines of readout.
  - **Measure:** consecutive pins are joined by a dashed line with a `Δ 38.4 mm` chip.
  - **Clear:** `Clear N pins` (a hair pill at the bottom right) removes all pins.

### Data
- **`QDensity`, the density floor.**
  - **Props:** `w`, `h`, `level` (0.05–0.95, step 0.01).
  - **Bars:** 48 bins, square-root scaled. Bars at or above the level are ink; the rest are ink4.
  - **Level:** an ink line with a pill flag that inverts while dragged.
  - **Hover:** a dashed ghost line with `0.62 · N cells · keeps N`.
  - **Header readout:** `level 0.50 · keeps 2,102 of 2,914 cells · 72%`.
- **The rest of the Data section** (levels, runtime, polling, log, histories) and **Quantum glyphs** (`QCircuit` with `per`, `axes`, `gate`, `reach`, `theta`; pulse schedule, sonification, Atlas cost and limits, the request path, shots against error) are documented in the library with captions.

## Screens (`Quantum Sculptor Screens.dc.html`)
Each screen is 1920 × 1080 on `bg`. `SculptorChrome` draws the shared frame and takes these props:
- `step`: −1 to 3.
- `run`: the run line, split on `|`; the first item is ink.
- `atlas`: `off`, `on`, `busy` or `bad`.
- `view`: the active view.
- `avail`: how many views are available.
- `cam`: shows the gimbal.
- `probe`: shows the live layer. It defaults to on when there is a model.

**Fixed zones** (x, y, width × height)
| Zone | Position | Contents |
|---|---|---|
| Frame | 16px corners at 24px inset | 4px edge dots at x = 30 and 1890, from y 200 to 880 |
| Top bar | y 24–88 | App name (Everett 20) at 48, 36; `local · 127.0.0.1:8765` in ink3; run line (mono 11) at 432, 41; Atlas status pill and Help at the right, 48px in |
| Rail | 48, 112, 344 wide | Step list (mono 11, 16px gap) with a 1px ink4 rule and a 4 × 24 ink marker on the live step; settings from y 260; main action at y 1000 |
| View | 432, 112, 1056 × 720 | 18px ink corners; centre crosshair 22px in ink3; view switch (Model, Voxels, Processed, Result) at right 448, top 128; gimbal at 452, 648; live layer over the whole view |
| Inspector | 1528, 112, 344 wide | Changes with the step |
| Floor | 432, 864, 1056 × 168 | Data for the step |

**The ten screens**
1. **00 Start, no model.**
   - Dot-grid view with a 560 × 320 drop area marked by corners.
   - Recent files from `input/`.
   - `Choose file` (commit) and `Use test cup` (hair).
   - A four-step flow and an Atlas note with `Set API key`.
   - No probe and no gimbal.
2. **01 Model.**
   - Size marks (80 mm, 90 mm) and an axis gnomon.
   - File, Up axis (`+Z · 3D print`) and a Mesh readout.
   - Inspector: check readout and orientation thumbnails.
   - Floor: extents bars.
   - Action: `Voxelise`.
3. **02 Voxelise.**
   - Settings: grid size 16³–256³, Fill (Enclosed, Cap then fill, Shell), Values (Coverage, 0 or 1), padding stepper and a Grid readout.
   - Inspector: `QSlice` in the inspector layout.
   - Floor: solid cells per layer.
   - Action: `Quantum`.
4. **03a Quantum, emulation.**
   - Mode (Gaussian, Emulation, Atlas), Strength and Reach dials, style (x, y, xy, yx), blur axes, shots and run name.
   - Inspector: processed slice and a qubit table.
   - Floor: `QDensity`.
   - Action: `Submit to Atlas`.
5. **03b Quantum, Atlas tiled run.**
   - A job strip of 4 tiles across the top of the view and a locked `Sent` readout.
   - A `Running · 1 of 4 tiles` spinner pill with `Cancel`.
   - Inspector: tile grid, request path and log.
   - Floor: run timeline with Local, Slot 1–3 and Polls lanes and a time cursor.
6. **04a Mesh, threshold.**
   - Level dial, smoothing, thicken or close gaps, and Keep.
   - Callouts on the model.
   - Inspector: kept share and curve.
   - Floor: `QDensity`.
   - Action: `Export`.
7. **04b Mesh, push the surface.**
   - Field gate, amount pull rod and refine 1×–8×.
   - Inspector: signed distance slice and a Level set readout.
   - Floor: displacement histogram.
8. **04c Export.**
   - Dimensions, print-height fader, file name and folder.
   - Inspector: print check and the JSON settings.
   - Floor: run summary.
   - Actions: `Export STL` and `Open folder`.
9. **API key.**
   - A scrim over the screen, a key field, the validation state and `Save key`, `Test connection` and `Cancel`.
   - A dotted leader from the top-bar status pill.
10. **Errors.**
    - Size limit (`TMPRL1103`: halve the tiles and remember the limit), rate limit (`HTTP 429`: slow polling) and a rejected key (`HTTP 401`: pause, keep the cached tiles).
    - `Resume · 4 tiles left` and `Discard run`.
    - Floor: a table of the errors.

## Interactions and behaviour
- The live layer, gimbal, slice and density floor are interactive in both documents. Everything else in the screens is static.
- The step rail is the only way between steps. The main action at the bottom of the rail moves to the next step.
- The inspector changes with the step and is never hidden.
- **Atlas runs:**
  - Settings lock while a run is going.
  - Tiles run three at a time, with status polled every 2s.
  - Finished tiles are cached in `grids/` and survive errors.
  - On `TMPRL1103`, halve the tiles and carry on.
  - On `HTTP 429`, double the polling interval.
  - On `HTTP 401`, pause the run until a new key is saved.
- **API key:** stored in the user folder (`%USERPROFILE%\.quantum-sculpting`), never in the project. It is sent as `Authorization: Bearer` to `api.mothquantum.com/api/v1`.

## State
- **Pipeline:** `step`; model (`file`, `upAxis`); voxelise (`grid`, `fill`, `values`, `pad`); quantum (`mode`, `strength`, `reach`, `style`, `axes`, `shots`, `runName`); mesh (`method`, `level`, `smooth`, `offset`, `close`, `keep`, `field`, `amount`, `refine`); export (`heightMm`, `fileName`).
- **View:** `view` (Model, Voxels, Processed or Result), `camera` (`az`, `el`, `dist`), `slice` (`axis`, `index`), `pins[]` (up to 3).
- **Jobs:** an array of tiles with `id`, `status` (`queued`, `running`, `done` or `error`), `progress` and `cached`, plus `pollMs` and a log.
- **Atlas:** `keyState` (`off`, `on`, `busy` or `bad`).

## Assets
- `fonts/TWKEverett-Book.ttf` is a licensed typeface; check the licence before you ship it.
- Geist Mono is loaded from Google Fonts.
- There are no images or icons. All marks are 1px SVG or CSS lines.

## Files
**Entry documents**
- `Quicksilver Library.dc.html`
- `Quantum Sculptor Screens.dc.html`

**Library sections**
- `QLOverlay4` (overlay in use), `QLType`, `QLMarks4`, `QLButtons4`, `QLControls4`, `QLNav4`, `QLGlyphs4`, `QLData4`

**Components**
- `QPill`, `QReadout`, `QDial`, `QFader`, `QCam` (gimbal), `QSlice`, `QProbe`, `QDensity`, `QCircuit`

**Screens**
- `SculptorChrome`, `Sc00Start`, `Sc01Model`, `Sc02Voxelise`, `Sc03Emulation`, `Sc04Atlas`, `Sc05Threshold`, `Sc06Push`, `Sc07Export`, `Sc08Key`, `Sc09Errors`

**Support**
- `support.js` (runtime for the HTML references only)
- `qvoxel.js` (stand-in 3D and slice renderer)
- `fonts/`
