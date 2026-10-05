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

## Quantum Sculptor interface

A redesigned interface built with our design system lives in `web/` (React + three.js, same Flask
API). `cd web && pnpm install && pnpm dev` runs it and the service together; after `pnpm build` the
service serves it at <http://127.0.0.1:8765/> and the original interface at `/classic`. See
`web/README.md`.

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
   - *Evolve*: split the model into "nations" and let them evolve turn by turn (see "Evolve"
     below). Runs locally.
4. **Back to a mesh** — choose how the surface is made (see "Level sets" below), drag the
   threshold or the push amount to see the shape change, then export the STL. The file is
   written to `output/` together with a `.json` that records every parameter used.

The interface is in Chinese.

## Evolve: voxel regions as nations

A different way to use a quantum model, after Moth's Motte model (James Wootton, "A quantum
procedure for map generation"): instead of filtering the whole shape, the model is split into
3–16 regions, each region is a nation and one qubit, and the voxels are its territory.

Before it is measured, every nation is in a superposition of doing and not doing: only the
odds are known. Each turn:

1. A quantum state is prepared. Every qubit is turned to the direction its nation wants — the
   three axes are attack, defend and explore, and since the direction lies on a sphere the
   three cannot all be at their maximum. Neighbouring nations are entangled in proportion to
   how close their relationship is.
2. Every nation is asked one question (attack, defend or explore — only one can be asked per
   turn) and all the answers are measured together. Close allies agree on the question.
3. What was asked and whether the answer was yes or no decides what the nation does, and every
   action leaves its own mark on the shape:

   | Asked | Yes | No |
   | --- | --- | --- |
   | attack | **attack**: take the layer of the least friendly neighbour that touches you. A defending neighbour holds against one attacker and breaks against two in the same turn; two nations attacking each other destroy both front lines, opening a crack; a neighbour with too little left is annexed whole | **flee**: break contact with the least friendly neighbour and move one voxel outward. A nation that has fled out of contact has left the continent |
   | defend | **fortify**: build a layer on the outer surface near the borders | **split**: the far half becomes a new, independent nation (only a nation that has outgrown its starting size can split) |
   | explore | **grow**: heal gaps inside its own body and grow outward in a cone, away from the centre | **wither**: the outermost surface voxels fall off; a nation that withers to nothing has died by itself |

   The less certain a nation is — the more it is entangled with others, the shorter its own
   Bloch vector — the closer its chance of answering no comes to a half. Relationships buy
   acting in step and cost a nation its own mind.
4. Wants and relationships are updated: losing territory makes a nation want to attack, a
   fight weakens a tie, and each nation cultivates only one tie at a time.

So nations ally, fall out, are annexed, declare independence, flee and die, and none of it is
decided before the measurement. Up to 16 nations are alive at once and 24 can appear over a
history of up to 300 turns; once all 24 have appeared the world can only consolidate.

In the app: the *processed* view colours the voxels by nation, with a bar to play or scrub the
turns. A panel on the right shows, for the turn on screen, a graph of the nations (size,
relationships, alliances, this turn's attacks, exiles), what happened, and for every nation
the question it was asked, its odds before the measurement and the answer; below that, a
chronicle of the whole history whose entries jump to their turn. The final shape goes on to
step 4 like any other result. The run name is the seed: the same name gives the same history,
and a shorter run is exactly the beginning of a longer one.

Things measured on the statue, worth knowing:

- Left alone it never settles: after 400 turns under the first, simpler rules about a hundred
  voxels were still changing hands every turn.
- If every pair of neighbours grows close, the entanglement changes nothing: histories are
  statistically the same as when each nation flips its own coin with the same odds. Ties with
  everyone wash each other out.
- With one close tie per nation, allies act in step 60% of the time against 54% for
  independent coins (5.7 standard errors apart). The effect on the final shape is small: the
  form comes mostly from the rules.

The quantum part is a real circuit simulation (state vector, one qubit per living nation)
that could be sent to hardware as it is; in the simulation a seeded generator stands in for
measurement randomness. Grids up to 128³: about 25 ms a turn at 64³ and 170 ms at 128³.

## Scan view

The preview has a fifth view, *scan*: a horizontal plane sweeps from the bottom of the grid to
the top, with the quantum result drawn below it and the original voxels above it, like a CT
scan or a print growing layer by layer.

- With any processed result, switching to the view plays the sweep once (10 seconds). The bar
  at the bottom left pauses, replays, or lets you drag the plane to any layer.
- During an Atlas run tiled in layers, the plane follows the real progress: the service
  reports the height up to which every slab has come back, and the plane rises to it. This is
  the one part of a real quantum run that can be shown as it happens — what goes on inside a
  single job cannot be observed. When the run ends the view stays on the finished sweep.
- For a result that was not computed in layers the sweep is only a before-and-after
  comparison; the caption says which case you are looking at.

Only two clipping planes move while it plays, so it is smooth at 256³ as well.

## Atlas jobs panel

The panel appears only in Atlas mode (or while a run is in progress). With the Gaussian
stand-in or local emulation selected, the page makes no requests to Atlas at all.

In Atlas mode, below the preview there is a panel that lists the jobs in your Atlas account, newest first:
when each was submitted, the engine, the job ID, where it came from and its status. Jobs this
app submitted are labelled with the run name and the tile they computed; anything else in the
account shows as "personal account". Click a row for the full job ID, timings, the tile's
parameters and, for a failed job, the reason Atlas gave.

While a run is in progress the bar at the top of the panel shows how many tiles are done, and
the list updates every 3 seconds: new jobs slide in at the top and rows change state as they
finish. When nothing is running it refreshes every 30 seconds, and it stops asking Atlas
altogether while the panel is collapsed or the tab is in the background. The summary line
counts the jobs of the last 24 hours. Atlas does not report a percentage for a single job, so
the small bar on a running row only shows the stage (queued or running).

If you reload the page during a run, the app picks the run up again. A second run cannot be
submitted until the first one has finished.

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

Operations that move the surface step by step (pushing, thickening, closing, Laplacian flow)
work in a narrow band: only the voxels within four of the surface are recomputed at each
step, inside a box that follows the surface as it moves, and a push stops as soon as the
surface has arrived at the iso-surface it is heading for. On the statue used during
development (500k faces, 256³ fine grid) every setting takes 1–3 seconds; a model that fills
the whole 256³ grid takes 10–20 seconds, mostly for meshing about a million faces.

`research/openvdb-level-sets.md` documents how OpenVDB does each of these, with sources, and
where this implementation departs from it.

## Staying responsive while tuning

Voxelising, emulating and meshing run one at a time, outside the lock that guards the
service's state, so reloading the page or choosing another model never waits for a
computation. When a control changes while its result is still being computed, the page drops
the request and the service stops that computation at its next step and starts the new one.
A page reloaded mid-computation takes over from where the old page was. Use one page at a
time: all pages share the one model the service holds.

## Layout

```
app/pipeline.py     mesh <-> voxel grid, fill modes, marching cubes, print checks
app/levelset.py     signed distance fields: from a mesh, smooth, offset, advect, to a mesh
app/tiling.py       cutting a grid into Atlas-sized tiles and stitching results
app/emulator.py     Gaussian stand-in + local approximation of Quantum Blur Core
app/nations.py      voxel regions as nations: one qubit each, evolving turn by turn
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
- `GET /api/v1/jobs?limit=&cursor=` — the account's jobs, newest first, 200 per page at most
- `GET /api/v1/me` — the account behind the key
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
exercised without a real key. Its key and outputs live in a temporary folder, and its job list
starts with about 250 made-up jobs so the panel has something to show.

## Notes

- The local emulation infers each qubit's rotation angle from public information. Compared with
  two real Atlas results (32³), the correlation is 0.999 and the mean deviation is below 1% of
  the solid density. Atlas remains the reference.
- Values are normalised by conserving their total rather than by min–max scaling: the blur
  produces a few hot spots well above 1, and scaling by the maximum would push everything else
  down. After normalisation the threshold means "density relative to the original solid".
- With `reach > 0` the blur is meant to act over long distances; tiling limits that to the
  size of a tile.
- The model, the voxel grid and the processed result live in the service's memory. If the
  service is restarted while a page is open, the page notices on its next request, reopens the
  model from `input/` and recomputes with the parameters on screen; Atlas results are read back
  from the cache, never resubmitted. A page opened fresh after a restart starts empty: pick the
  model again from the list of files in `input/`.
- The built-in test cup and the same cup reopened from `input/test_cup.stl` differ by
  floating-point noise, enough to change a few voxels and therefore the cache key of an Atlas
  result. Use one or the other consistently when you want cached results to be found.
- Coverage (fractional) input has been run through the local emulation and the fake Atlas
  server only. It has not yet been submitted to the real service.
- The interface uses the TWK Everett typeface, which is commercially licensed and not included.
  See `app/static/fonts/README.md`; without the font files the page falls back to system fonts.
