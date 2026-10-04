# Quantum cup

Voxelise a 3D model, hand the voxel grid to Moth Atlas's **Quantum Blur Core** so the whole
shape is deformed by quantum interference, then turn the result back into a printable STL.

A local web app prototype: a small Python (Flask) service plus a browser interface with a live
3D preview.

## Start

Double-click `run.bat`. The first run creates a Python environment in
`%USERPROFILE%\.quantum-cup\venv` and installs the dependencies (a few minutes); after that it
opens <http://127.0.0.1:8765> straight away.

Requirements: Windows, Python 3.10 or newer, and an internet connection (the 3D preview loads
three.js from a CDN, and Atlas is a cloud service).

The Python environment and your API key live in your user folder, not in this project, so they
are never committed or synced. On a new machine the first run rebuilds the environment and you
enter the key once.

## How to use it

1. **Model** — choose a `.stl`, `.obj`, `.ply`, `.glb` or `.off` file, or drag it onto the
   preview. A built-in test cup is available. If the model is not standing upright, change
   "up axis".
2. **Voxelise** — pick a grid size. The grid is recomputed immediately, the preview switches to
   the voxel view, and the slice panel lets you inspect it layer by layer.
3. **Quantum processing**
   - *Gaussian stand-in*: an ordinary blur, only for checking that the pipeline works.
   - *Local emulation*: approximates Quantum Blur Core on your machine and updates live as you
     drag the parameters.
   - *Atlas*: click "Set API key" (top right), paste your key, then "Submit to Atlas". Results
     for the same parameters and run name are cached in `grids/` and are never submitted twice.
4. **Back to a mesh** — drag the threshold to see the shape change, then export the STL. The
   file is written to `output/` together with a `.json` that records every parameter used.

The interface is in Chinese.

## Layout

```
app/pipeline.py     mesh <-> voxel grid, marching cubes, print checks
app/emulator.py     Gaussian stand-in + local approximation of Quantum Blur Core
app/atlas.py        Atlas API client (blur-core-v1)
app/server.py       local service (Flask, listens on 127.0.0.1 only)
app/static/         the interface
tests/              unit tests, API tests, and a fake Atlas server
input/ grids/ output/   your models, cached Atlas results, exported STLs (not committed)
```

## Atlas API

Taken from the official OpenAPI document, <https://api.mothquantum.com/openapi.json>:

- `POST /api/v1/engines/blur-core-v1/process` with
  `{"params": {"values": <nested list>, "strength", "style", "reach", "axes", "shots"}}`
  returns a `job_id`
- `GET /api/v1/jobs/{job_id}/status` — poll until `completed`
- `GET /api/v1/jobs/{job_id}/result` — fetch the result
- Authentication: `Authorization: Bearer <key>`

One job's result is limited to about 2 MB. A 32³ grid (32,768 values) works; a 64³ grid
(262,144 values) fails with `TMPRL1103`.

## Tests

```
%USERPROFILE%\.quantum-cup\venv\Scripts\python.exe -m unittest discover -s tests
```

`tests/run_with_fake_atlas.py` starts a fake Atlas server and a copy of the app pointed at it
(port 8766), so the Atlas path can be exercised without a real key. Its key and outputs live in
a temporary folder.

## Notes

- The local emulation infers each qubit's rotation angle from public information. Compared with
  two real Atlas results (32³), the correlation is 0.999 and the mean deviation is below 1% of
  the solid density. Atlas remains the reference.
- Values are normalised by conserving their total rather than by min–max scaling: the blur
  produces a few hot spots well above 1, and scaling by the maximum would push everything else
  down. After normalisation the threshold means "density relative to the original solid".
- The interface uses the TWK Everett typeface, which is commercially licensed and not included.
  See `app/static/fonts/README.md`; without the font files the page falls back to system fonts.
