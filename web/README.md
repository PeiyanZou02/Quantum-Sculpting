# Quantum Sculptor — interface

The design layer for Quantum Sculpting: the Quicksilver component library and the Quantum Sculptor
screens (design handoff in `../design/handoff/`), built in React + TypeScript + three.js on top of
the Flask service in `../app/`.

## Run it (development)

```
# 1. the service (from the repo root)
.venv/bin/python app/server.py --port 8770      # or run.bat on Windows (port 8765)

# 2. the interface
cd web
pnpm install
pnpm dev --port 5190                            # http://localhost:5190/studio/
```

`vite.config.ts` proxies `/api` to the service (`QS_API`, default `http://localhost:8770`) and
rewrites `Origin`, because the service only accepts same-origin requests.

## Build

`pnpm build` writes to `app/static/studio/`, which the service serves at
`http://127.0.0.1:8765/studio/`. Peiyan's original interface stays at `/`.

## Font

TWK Everett is commercially licensed and not in the repo. Put `TWKEverett-Book.ttf` in
`web/public/fonts/` (git-ignored). Without it the page falls back to system sans. Geist Mono
comes from Google Fonts.

## Layout

```
src/qs/          Quicksilver library: QPill, Segmented, AxisToggle, QReadout, QDial, QFader,
                 Stepper, TextField, QCam (gimbal), QSlice, QProbe, QDensity, QCircuit, Marks
src/view/        three.js engine (grid coordinates, controlled camera, picking)
src/screens/     SculptorChrome, rail, view, inspector, floor, API key — one 1920 × 1080 stage
src/api.ts       typed client for every route in app/server.py
src/store.ts     pipeline state (zustand), mirroring the handoff's "State" section
```
