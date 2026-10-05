# Quantum Sculptor — interface

The design layer for Quantum Sculpting: the Quicksilver component library and the Quantum Sculptor
screens (design handoff in `../design/handoff/`), built in React + TypeScript + three.js on top of
the Flask service in `../app/`.

## Run it

One command, one server:

```
cd web
pnpm install
pnpm dev --port 5190          # http://localhost:5190
```

`pnpm dev` also starts the Flask service (`app/server.py`, port 8770, using the repo's `.venv`) and
stops it on exit. The dev server proxies `/api` to it and rewrites `Origin`, because the service only
accepts same-origin requests. Set `QS_API=http://localhost:8765` to use a service you started yourself.

Without Node: `pnpm build` writes to `app/static/studio/`, and the service then serves this interface
at `/` (`run.bat`, port 8765). Peiyan's original interface stays at `/classic`.

## Layout of the screen

- **Input** (left): only parameters, 01 model → 04 mesh. Steps fold to a one-line summary; the
  scrollbar carries an index to jump between them.
- **Display** (centre): what the workspace shows (model, voxels, processed, result, scan) and the
  overlays and HUD elements, each switchable under *Overlays*.
- **Output** (right): readouts only: model, grid, slice, quantum result, print check, export.
- **Runtime terminal** (bottom): resizable drawer with the event and request log, and the Atlas
  jobs list (Atlas mode only).

## Font

TWK Everett is commercially licensed and not in the repo. Put `TWKEverett-Book.ttf` in
`web/public/fonts/` (git-ignored). Without it the page falls back to system sans. Geist Mono
comes from Google Fonts.

## Layout

```
src/qs/          Quicksilver library: QPill, Segmented, AxisToggle, QReadout, QDial, QFader,
                 Stepper, TextField, QCam (gimbal), QSlice, QProbe, QDensity, QCircuit, Marks
src/view/        three.js engine (grid coordinates, controlled camera, picking)
src/screens/     TopBar, InputPane, Stage (display + HUD), OutputPane, Terminal, KeyDialog
src/api.ts       typed client for every route in app/server.py
src/store.ts     pipeline state (zustand), mirroring the handoff's "State" section
```
