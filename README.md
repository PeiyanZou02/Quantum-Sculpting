# Quantum Sculpting

Voxelise a 3D model, hand the voxel grid to Moth Atlas's **Quantum Blur Core** so the whole
shape is deformed by quantum interference, then turn the result back into a printable STL.

A local web app prototype: a small Python (Flask) service plus a browser interface with a live
3D preview.

## Start

Double-click `run.bat`. The first run creates a Python environment in
`%USERPROFILE%\.quantum-sculpting\venv` and installs the dependencies (a few minutes); after that it
opens <http://127.0.0.1:8765> straight away.

Requirements: Windows, Python 3.10 or newer, and an internet connection (the 3D preview loads
three.js from a CDN, and Atlas is a cloud service).

The Python environment and your API key live in your user folder, not in this project, so they
are never committed or synced. On a new machine the first run rebuilds the environment and you
enter the key once.

## How to use it

1. **Model** — choose a `.stl`, `.obj`, `.ply`, `.glb` or `.off` file, or drag it onto the
   preview. Files already in `input/` can be reopened from a list, and a built-in test cup is
   available. If the model is lying on its side, change the "up axis".
2. **Voxelise** — pick a grid size from 16³ to 256³, how the inside is filled, and what a
   voxel holds:
   - fill: enclosed interiors (the default); cap the bottom first, then fill — for scans that
     are open underneath, such as statues; or shell only.
   - values: *coverage* (the default) stores how much of each voxel the model occupies, so the
     0.5 level is the model's true surface; *0 or 1* is the original behaviour, where every
     voxel the surface touches counts as solid and the model comes out about half a voxel fat.
3. **Quantum processing**
   - *Gaussian stand-in*: an ordinary blur, only for checking that the pipeline works.
   - *Local emulation*: approximates Quantum Blur Core on your machine and updates live as you
     drag the parameters.
   - *Atlas*: click the key button (top right), paste your key, then submit. Results are cached
     in `grids/` and never submitted twice.
4. **Back to a mesh** — choose how the surface is made (see "Level sets" below), drag the
   threshold or the push amount to see the shape change, then export the STL. The file is
   written to `output/` together with a `.json` that records every parameter used.

The interface is in Chinese.

## Large grids: tiling

One Atlas job can return about 2 MB, which is roughly 65,000 values. A 32³ grid fits in one
job; anything larger is split into tiles, each tile is submitted as its own job, and the
results are stitched back together. Up to three jobs run at a time, the preview updates tile
by tile, finished tiles are cached, and a run that fails part-way only recomputes what is
missing when you submit again. If Atlas rejects a tile for its size, the tiles are halved
automatically and the limit is remembered.

Two ways to cut the grid:

| Mode | Tile (128³ grid) | What it gives |
| --- | --- | --- |
| Cubes | 32 × 32 × 64 | Blur in all three directions; closest to processing the grid whole |
| Layers | 128 × 128 × 4 | One slab of layers per job, bottom to top; full blur within a layer, vertical blur only inside the slab |

Why tiling keeps the character of the effect: Quantum Blur Core lays each axis onto qubits
with a Gray code. Low qubits move values over short distances, high qubits over long ones,
and with `reach = 0` the higher the qubit the less it is rotated. Cutting an axis into tiles
of length 2^b keeps exactly the lowest b qubits and drops the ones that rotate least. Because
the Gray code is reflected, odd-numbered tiles are mirrored before they are sent and mirrored
back afterwards; in the local emulation this reproduces "the whole grid without its top
qubits" exactly (see `tests/test_pipeline.py`).

Each job's output is rescaled by the engine to its own maximum, so tiles are put back on a
common scale by restoring each tile's total, which the blur conserves.

The local emulation uses the same tiling, so the preview corresponds to what Atlas will
return. Empty tiles are skipped, identical tiles are computed once, and a tile that is one
uniform value is not submitted when only Rx gates are used, because the engine returns it
unchanged.

## Level sets: mesh → distance field → voxel operations → mesh

Borrowed from the way Houdini's VDB tools work (VDB from Polygons → operate on voxels →
Convert VDB). The model, or the thresholded quantum result, is held as a signed distance
field: negative inside, positive outside, zero on the surface. The surface position is then
known to a fraction of a voxel, and smoothing, thickening and moving the surface become
arithmetic on one array. `app/levelset.py` implements this with numpy and scipy inside the
model's bounding box only; OpenVDB itself is not used (it has no pip package for Windows).

Two ways to make the final surface:

- **Threshold** — take the iso-surface of the quantum result. Detail is limited by the
  resolution of the quantum grid.
- **Push the surface** — build a fine distance field of the *original* model (up to 8× finer
  than the quantum grid, 256³ at most) and let the quantum result move its surface. One 32³
  job can then drive a 256³ result. Three fields are offered:
  - *toward the quantum result* (default): normal speed = result − threshold. The surface is
    attracted to the threshold iso-surface from both sides, as in VDB Morph SDF. Stable. The
    larger the amount, the closer to the plain threshold result and the less original detail
    remains.
  - *amplify the difference*: normal speed = result − input. Zero when there is no quantum
    effect, but unstable — it pushes the surface away from where it starts and fragments it.
  - *along the density gradient*: a vector velocity field, as in VDB Advect. Since the
    gradient points into the solid, this mostly erodes.

  This keeps the original model's detail and displaces it; it does not create quantum detail
  at the fine scale. For that, run the quantum step itself on a fine grid with tiling.

Voxel operations, applied before meshing with either method:

| Control | What it does | Houdini counterpart |
| --- | --- | --- |
| Voxel smoothing: Gaussian, mean, median, Laplacian flow | Smooths the surface in the distance field | VDB Smooth SDF |
| Thicken / shrink | Moves the whole surface out or in by a distance | VDB Reshape SDF: dilate, erode |
| Close gaps | Thickens then shrinks by the same amount; gaps narrower than that are filled | VDB Reshape SDF: close |

`research/openvdb-level-sets.md` documents how OpenVDB does each of these, with sources, and
where this implementation departs from it.

## Layout

```
app/pipeline.py     mesh <-> voxel grid, fill modes, marching cubes, print checks
app/levelset.py     signed distance fields: from a mesh, smooth, offset, advect, to a mesh
app/tiling.py       cutting a grid into Atlas-sized tiles and stitching results
app/emulator.py     Gaussian stand-in + local approximation of Quantum Blur Core
app/atlas.py        Atlas API client (blur-core-v1)
app/server.py       local service (Flask, listens on 127.0.0.1 only)
app/static/         the interface
tests/              unit tests, API tests, and a fake Atlas server
research/           notes with sources (OpenVDB and level sets)
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

Observed on the real service: jobs of 32³, 32 × 32 × 64 and 256 × 256 × 1 values complete in
6–13 seconds; a 64³ job (262,144 values) fails with
`[TMPRL1103] Attempted to upload payloads with size that exceeded the error limit`.

## Tests

```
%USERPROFILE%\.quantum-sculpting\venv\Scripts\python.exe -m unittest discover -s tests
```

`tests/run_with_fake_atlas.py` starts a fake Atlas server and a copy of the app pointed at it
(port 8766), so the Atlas path — including tiling, size limits and rate limiting — can be
exercised without a real key. Its key and outputs live in a temporary folder.

## Notes

- The local emulation infers each qubit's rotation angle from public information. Compared with
  two real Atlas results (32³), the correlation is 0.999 and the mean deviation is below 1% of
  the solid density. Atlas remains the reference.
- Values are normalised by conserving their total rather than by min–max scaling: the blur
  produces a few hot spots well above 1, and scaling by the maximum would push everything else
  down. After normalisation the threshold means "density relative to the original solid".
- With `reach > 0` the blur is meant to act over long distances; tiling limits that to the
  size of a tile.
- Coverage (fractional) input has been run through the local emulation and the fake Atlas
  server only. It has not yet been submitted to the real service.
- The interface uses the TWK Everett typeface, which is commercially licensed and not included.
  See `app/static/fonts/README.md`; without the font files the page falls back to system fonts.
