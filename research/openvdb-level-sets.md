# OpenVDB level sets: how they work, and what transfers to Quantum cup

> 2026-10-04. Scope: why Houdini's VDB workflow is fast, what its smooth / reshape / advect / combine nodes compute, whether Blender and Rhino really differ, whether OpenVDB can be pip-installed here, and which ideas fit this project's dense-tile cloud pipeline.
>
> Conventions: every claim carries a link to the page that was opened. **[inference]** marks my own reasoning or arithmetic, not a statement from a source. **[measured]** marks a number from the read-only checks described in §6.5. **Not verified** means I could not confirm it in a primary source.

## Summary

- VDB is fast because it stores and computes only near the surface: a shallow, wide tree (root hash map → 32³ → 16³ → 8³ leaf blocks) holds values for a thin band of "active" voxels, and everything else is one constant per tile or a single background value. Cost follows surface area (×4 per doubling of resolution), not volume (×8).
- The other half is the representation: a narrow-band signed distance field (3 voxels each side by default) turns smoothing, offsetting, booleans and advection into simple operations on one scalar field, each followed by a "track" step that re-dilates, renormalises and trims the band.
- Blender uses the same library; the difference from Houdini is exposure, largely closed by the Blender 5.0 grid nodes. Rhino has no native volume object; the Grasshopper plug-in Dendro wraps OpenVDB.
- OpenVDB cannot be pip-installed on Windows for Python 3.11 (no `openvdb` project on PyPI; `pyopenvdb` is a Linux-only Python 3.7 wheel from 2020), and its Python module exposes "almost none" of the tools anyway. Re-implementing in numpy/scipy is the right call.
- The tree itself does not transfer: the engine needs dense, non-negative tiles and grids are ≤ 256³. What transfers is the SDF as the local representation, voxel-space filters and morphology, min/max booleans, tile skipping, and a coarse quantum result driving a fine level set.
- `app/levelset.py` is faithful to OpenVDB in offset / open / close and the mean filter. It departs in renormalisation (one-shot rebuild instead of an iterative PDE; it roughens the surface when repeated), in advection schemes, and in using a dense box instead of a tracked band.
- Two measured problems affect candidate (f) as wired today: the binary occupancy from `mesh_to_grid` is about 0.66 voxel fatter than the mesh, which biases both scalar speed fields, and the default `difference` field is unstable. A coverage-fraction input plus the `threshold` field fixes both in the test (§6.4, §6.5).

### Addendum: what changed in the code after these measurements

Sections 6.3–6.5 describe `app/levelset.py` as it was when the note was written. The three
problems found there were then fixed, and re-measured on the same test sphere:

| Finding | Change | After |
| --- | --- | --- |
| `rebuild` roughened the surface when repeated (0.013 → 0.045 → 0.116 voxel RMS after 1 / 5 / 20 calls) | Rewritten: distances in the band are now measured to the tangent plane at the nearest point where the surface crosses a grid edge; only the surface position is used | 0.014 / 0.015 / 0.015 after 1 / 5 / 20 calls; offsets of ±4, +8, −12 fine voxels land within 0.01 coarse voxel |
| The binary grid is about 0.7 voxel fatter than the mesh, which biased both scalar speed fields | A coverage-fraction input is available and is the default (`levelset.coverage`); `advect` also measures the mismatch between the reference grid and the level set (`levelset.fatness`) and works in the shifted frame | Coverage volume 6370 against an analytic 6371; a symmetric blur moves the surface by −0.03 voxel at `amount = 1` with either input (was +0.18 / −0.25) |
| The default `difference` field is unstable | The default is now `threshold`; `difference` is kept and labelled as unstable | Roughness 0.011 at `amount = 1` and 0.007 at `amount = 3` with coverage input |
| Exterior band 1–3 voxels out was too small by 0.25–0.32 voxel | The mask-distance cap is applied to interior voxels only | +0.014 to +0.017 |

Still true: advection is first order, there are no masks, the box is dense rather than a
tracked band, and "curvature" is Laplacian flow.

---

## 1. How OpenVDB stores a volume

**The tree.** A VDB is a height-balanced tree with a fixed depth and large, power-of-two branching factors: "short and wide", like a B+tree ([M13 §2.1, §2.4][M13]).

| Node | What it holds | Size in the default configuration |
| --- | --- | --- |
| `RootNode` | A sparse, resizable hash map of child pointers or tile values, plus the background value ([M13 §2.3][M13]). Not restricted in number of children, so index space is limited only by the 32-bit integer coordinates ([overview][OV]). | Each child spans 4096 voxels per side ([M13 §2.4][M13]) |
| `InternalNode` (level 2) | A dense table of 32×32×32 entries, each a child pointer or a tile value ([overview][OV]) | 2⁵ per side → covers 32×16×8 = 4096 voxels per side |
| `InternalNode` (level 1) | A dense table of 16×16×16 entries, each a leaf pointer or a tile value standing for an 8×8×8 block ([overview][OV]) | 2⁴ per side → covers 128 voxels per side **[inference: 16×8]** |
| `LeafNode` | An 8×8×8 block of voxel values ([overview][OV]) | 2³ per side |

"5-4-3" are the base-two logarithms of the branching factors, "read backwards from the leaf nodes up the tree" ([overview][OV]). Powers of two are required so that tree traversal reduces to bit operations ([M13 §2.3, §3.1][M13]).

**Three kinds of value.** A *voxel value* is stored in a leaf. A *tile value* is "a uniform value assigned to all voxels subsumed by a given node". The *background value* is returned for any coordinate that resolves to neither ([overview][OV]). `prune` replaces nodes whose voxels all share one value and state with a tile ([overview][OV]).

**Active vs inactive.** Every voxel and tile has a binary state. Its meaning is application-specific; for a narrow-band level set the band voxels are active and everything else is inactive with a constant distance whose sign says inside or outside ([M13 §2.2][M13], [overview][OV]).

**Bit masks.** Topology is stored separately from values. Every node has an `mValueMask` (active states); internal nodes also have an `mChildMask` (which entries are children rather than tiles). The masks serve five purposes: hierarchical topology encoding, fast sequential iteration, lossless compression, boolean operations, and topology dilation ([M13 §2.3][M13]). Dilation by one voxel is done with shifts and ORs on the masks, eight bits at a time; measured 17× faster than doing it with random voxel access ([M13 §4.1, §5.5][M13]).

**Access.**
- Random lookup, insert and delete are constant time on average, because every level below the root is a direct-access table indexed by bit-masking the global coordinates ([M13 §3.1][M13]).
- A `ValueAccessor` caches the nodes visited by the previous access and traverses bottom-up from them; for neighbouring voxels this usually ends at the first cached node. "A factor of three is typical" versus going through the tree root ([overview][OV], [M13 §3.2][M13]).
- Finite-difference stencils combine one sequential iterator (driven by the masks) with an accessor for the neighbours ([M13 §3.4][M13]).

**Why cost follows surface area.**
- Nodes below the root are allocated only when something is inserted, and the design goal is "to consume only as much memory as is required to represent active voxels" ([M13 §2.2, §3.1][M13]). A dense grid's footprint instead "grows in proportion to the volume of the embedding space" ([M13 §1][M13]).
- A level set activates only the band around the surface; the interior and exterior are tiles and background ([overview][OV]).
- Evidence: a sphere level set at 4096³ effective resolution with a 10-voxel-wide band has 51,033,829 active voxels ([M13 §5][M13]) — 0.07 % of 4096³ **[inference: arithmetic]**. A production model with 228 million active voxels took 1 GB as a VDB versus ¼ TB dense ([M13 Fig. 4][M13]; the caption was partly garbled in my text extraction, the two footprint numbers are legible).
- The paper states the scaling directly when discussing a benchmark: a speed-up of four "corresponds to the increase in surface voxels for a doubling of the grid resolution" ([M13 §5][M13]).
- Algorithms also work per node rather than per voxel: CSG processes whole branches, so its cost "scales only with the number of intersecting LeafNodes" ([M13 §4.3][M13]).

---

## 2. Narrow-band level sets vs fog volumes; mesh ↔ volume

| | Narrow-band level set (SDF) | Fog volume |
| --- | --- | --- |
| Active voxels | A thin band, "normally three voxels wide on either side of the surface", holding signed distances ([overview][OV]) | The inside (value 1) and a thin band ramping "typically … linearly between zero and one" ([overview][OV]) |
| Inactive voxels | Outside: constant positive distance. Inside: constant negative distance ([overview][OV]) | Outside: 0 ([overview][OV]) |
| Default half width | `LEVEL_SET_HALF_WIDTH = 3` voxels ([Types.h][TYPES]); the background value equals half-width × voxel size (`getHalfWidth()` returns `background()/dx`, [LevelSetTracker.h][LST]). Houdini's tooltip: "Many level set operations require this to be a minimum of three voxels" ([SOP source][SOPF]). | — |
| Sign | Negative inside ([VDB from Polygons][HFP]) | — |

**SDF → fog** (`sdfToFogVolume`): the interior half of the band becomes a linear ramp 0→1, the inactive interior becomes active with value 1, the exterior becomes inactive 0 ([LevelSetUtil.h][LSU]). Houdini's *Convert SDF to Fog* does the same ([Convert VDB][HCV]).

**Fog → SDF** (`fogToSdf`): voxels above the iso value become negative (inside); voxels next to the iso-surface get a distance from linear interpolation along each axis, combined as `h / sqrt(Σ 1/dᵢ²)`; the rest is filled by solving the Eikonal equation |∇φ| = 1 with fast sweeping ([FastSweeping.h][FS]). Houdini's *Convert Fog to SDF* is described as surfacing at the iso value and converting to an SDF ([Convert VDB][HCV]).

### Mesh → level set (`meshToVolume`, Houdini "VDB from Polygons")

- Input must be triangles or quads; Houdini convexes anything else ([VDB from Polygons][HFP]).
- Distance: the closest point on a triangle to each voxel centre in the band ([MeshToVolume.h][MTV]).
- The signed conversion "requires a closed surface but not necessarily a manifold surface", supports self-intersections and degenerate faces, and "is independent of mesh surface normals" ([MeshToVolume.h][MTV]).
- **Sign**: a flood fill from outside. "All voxels that can be reached without crossing the rasterized polygons are marked as outside. Anything not reached is classified as inside." This handles self-intersecting and kit-bashed models but cannot represent internal cavities ([VDB from Polygons][HFP]). Signs of inactive voxels and tiles are then propagated bottom-up through the tree ([M13 §4.6][M13]).
- Houdini's *Preserve Holes* switches to the generalized winding number, which keeps cavities and closes small gaps better if polygon orientations are correct ([VDB from Polygons][HFP]).
- After voxelisation, optional steps remove voxels created by self-intersections, renormalise distances ("smooths out bumps caused by self intersecting or overlapping portions"), and trim voxels beyond the band; each can be disabled by a flag ([MeshToVolume.h][MTV]).
- **Non-watertight input**: with `UNSIGNED_DISTANCE_FIELD` only distances are computed and no closed mesh is needed ([MeshToVolume.h][MTV], [VDB from Polygons][HFP]). With the default signed conversion the flood fill enters through any opening wider than a voxel, so the interior is classified as outside and only a shell remains **[inference from the flood-fill description above; not stated verbatim in the docs]**. This project's "cap the bottom, then fill" mode addresses exactly that case.
- Parameters that matter in Houdini: *Voxel Size* (features smaller than this are lost), *Exterior / Interior Band Voxels*, *Fill Interior* (extend the signed value to the middle), *Unsigned Distance Field*, *Preserve Holes* ([VDB from Polygons][HFP]).

### Level set → mesh (`volumeToMesh`, Houdini "Convert VDB")

- Two entry points: uniform meshing that outputs quads only, and adaptive meshing that outputs quads plus triangles ([VolumeToMesh.h][VTM]).
- *Isovalue* picks the surface; *Adaptivity* (0–1) "determines how closely the isosurface is matched by the resulting mesh. Higher thresholds will allow more variation in polygon size, using fewer polygons" ([VolumeToMesh.h][VTM], [Convert VDB][HCV]).
- A surface mask restricts meshing to a region, and a scalar field can vary adaptivity in space ([VolumeToMesh.h][VTM], [Convert VDB][HCV]).
- The header does not name the meshing algorithm. Whether it is dual contouring or a marching-cubes variant: **not verified**.

---

## 3. The filters, node by node

Schemes shared by all level-set tools ([FiniteDifference.h][FD]): spatial gradient — 1st, 2nd or 3rd-order biased (upwind), 5th-order WENO, 5th-order HJ-WENO; time integration — Forward Euler (TVD-RK1), 2nd-order and 3rd-order TVD Runge–Kutta.

| Houdini node | OpenVDB tool | What it computes | Parameters that matter |
| --- | --- | --- | --- |
| **VDB Smooth** (fog / scalar) | [`tools::Filter`][FILT] | Replaces each active voxel by the mean or median of a surrounding cube. Mean is a separable box filter `2·width+1` voxels wide; "Gaussian" is four passes of that box; median is not separable and slow. By default only active voxels are filtered and active tiles are left alone ([Filter.h][FILT]). | *Operation* (Mean Value, Median Value); *Filter Voxel Radius* (in voxels; the region is a cube); *Iterations* — "for a gaussian, multiply the radius by 0.33 and use four passes"; optional alpha mask from the second input ([VDB Smooth][HSM]). |
| **VDB Smooth SDF** | [`tools::LevelSetFilter`][LSF] | Same filters applied to φ, plus two flows, each followed by interface tracking. Mean-curvature flow: φ ← φ + Δt·κ\|∇φ\| with Δt = Δx²/3, i.e. ∂φ/∂t = κ\|∇φ\|. Laplacian flow: φ ← φ + Δt·∇²φ with Δt = Δx²/6, i.e. ∂φ/∂t = ∇²φ ([LevelSetFilter.h][LSF]). | *Operation*: Mean Value, Median Value, Mean Curvature Flow, Laplacian Flow ([VDB Smooth SDF][HSS]). The library and the open-source SOP also have Gaussian, and a newer `fillet` that offsets only where a principal curvature is negative ([LevelSetFilter.h][LSF], [SOP source][SOPF]). *Filter Voxel Radius*, *Iterations* (SOP defaults 1 and 4, [SOP source][SOPF]), *Trim*, alpha mask. |
| **VDB Reshape SDF** | `LevelSetFilter::offset` | Adds a constant to φ in steps of at most half a voxel, tracking after each step ([LevelSetFilter.h][LSF]). Dilate = `offset(−d)`, Erode = `offset(+d)`, Open = erode then dilate, Close = dilate then erode ([SOP source][SOPF]). | *Operation*; *Offset* (voxels or world units); *Renorm Accuracy*; *Trim*; alpha mask. Open "causes isolated hills and islands to be erased", Close "causes holes and valleys to be filled" ([VDB Reshape SDF][HRS]). |
| **VDB Advect** | [`tools::LevelSetAdvection`][LSA] for SDFs, [`tools::VolumeAdvection`][VA] for other grids | Moves VDBs along a **vector-valued** VDB plugged into the second input ([VDB Advect][HAD]). For level sets: ∂φ/∂t + **V**·∇φ = 0, discretised as φ − Δt·**V**·∇φ with an upwind-biased gradient, TVD-RK time stepping, CFL-limited sub-steps and tracking after every step ([LevelSetAdvect.h][LSA]). For other grids: semi-Lagrangian back-tracing plus interpolation ([VolumeAdvect.h][VA]). | See below. |
| **VDB Advect Points** | — | Moves points, not volumes: along a velocity VDB, onto a surface via a closest-point VDB, or both ("constrained advection") ([VDB Advect Points][HAP]). Not relevant to moving a level set. | *Operation*, *Integration*, *Timestep*, *Substeps*. |
| **VDB Morph SDF** | [`tools::LevelSetMorphing`][LSM] | "Advect a source narrow band signed distance field towards a target" ([VDB Morph SDF][HMO]). Motion in the normal direction with a scalar speed: φ ← φ − Δt·S·\|∇φ\|, where S is sampled from the target SDF (`s -= target.wsSample(...)`), so the surface stops where the target is zero ([LevelSetMorph.h][LSM]). | *Timestep* (how far to go), spatial and temporal scheme, renormalisation steps, alpha mask from the third input. |
| **VDB Combine** | [`tools::csgUnion / csgIntersection / csgDifference`][COMP] | CSG on level sets as per-voxel comparisons: union keeps the smaller value (min), intersection the larger (max), difference max(A, −B) ([Composite.h][COMP]). Whole branches are handled at once where only one operand has data ([M13 §4.3][M13]). | *Operation*: SDF Union / Intersection / Difference, plus arithmetic ops for fog volumes; *Resample* when transforms differ (level sets need matching band widths); *Signed-Flood-Fill Output* ([VDB Combine][HCO]). "Subtracting holes" in the tutorial is SDF Difference. |
| **VDB Renormalize SDF** | `LevelSetTracker::normalize` | Iteratively restores \|∇φ\| = 1. "This requires proper signed distance fields for the results to be meaningful"; badly broken inputs should be rebuilt by converting to polygons and back ([VDB Renormalize SDF][HRN]). | *Iterations*, *Renorm Accuracy*. |

### Why renormalisation and tracking are needed

- After a filter or a move, φ is no longer a distance: "After moving the signed distance field, it will often no longer be a proper signed distance field. A number of renormalization passes can be performed to convert it back" ([VDB Advect][HAD]). VDB Smooth SDF differs from VDB Smooth precisely in that it "ensures the SDF remains valid" ([VDB Smooth SDF][HSS]).
- The band has to follow the surface. `LevelSetTracker::track()` does three things: dilate the active band by one voxel, normalise, prune voxels outside the band ([LevelSetTracker.h][LST]). The paper gives the reason for dilating exactly once: the CFL condition means "the interface never moves more than one voxel per integration" ([M13 §4.2][M13]).
- Normalisation is an iterative PDE, not a one-shot rebuild. Each pass updates φ ← φ − Δt·S(φ)·(|∇φ| − 1) with the smoothed sign S = φ / sqrt(φ² + |∇φ|²) and Δt = Δx × 0.3 / 0.9 / 1.0 for RK1 / RK2 / RK3. Defaults: HJ-WENO5 gradient, Forward Euler, 3 passes per call ([LevelSetTracker.h][LST]). Because the update is proportional to (|∇φ| − 1), a field that is already a distance field is left unchanged.

### VDB Advect in detail

- **Field**: a vector VDB; a `vel.[xyz]` triple must first be merged into one primitive ([VDB Advect][HAD]).
- **Respect Grid Class**: on — level sets use the finite-difference path; off — everything uses the general (semi-Lagrangian) path ([VDB Advect][HAD]).
- **Level-set path**: *Spatial Scheme* and *Temporal Scheme* as listed above. The time step is `min(Δt, CFL·Δx / max|V|)` with CFL = 0.3 / 0.9 / 1.0 for RK1 / RK2 / RK3, divided by √3; the loop repeats until the requested time is reached and calls `track()` after each step ([LevelSetAdvect.h][LSA]).
- **General path** ([VolumeAdvect.h][VA]):

| Scheme | Order time / space |
| --- | --- |
| Semi-Lagrangian | 1 / 1 |
| Mid-Point | 2 / 1 |
| 3rd-order Runge–Kutta | 3 / 1 |
| 4th-order Runge–Kutta | 4 / 1 |
| MacCormack | 2 / 2 |
| BFECC | 2 / 2 |

- **Limiter** (for MacCormack and BFECC): *Clamp* or *Revert* to first order when the corrected value leaves the range of the interpolation cell; this suppresses the oscillations the error-correcting schemes can produce ([VolumeAdvect.h][VA], [VDB Advect][HAD]).
- **Substeps** exist for memory, not accuracy: the grid is pre-dilated by the maximum travel distance, so large moves in one step make the active region large ([VolumeAdvect.h][VA], [VDB Advect][HAD]).
- **Renormalization**: *Steps* per sub-step, with its own spatial and temporal scheme ([VDB Advect][HAD]).
- The node is not a feedback loop; to animate, put it in a SOP Solver ([VDB Advect][HAD]).

---

## 4. Blender and Rhino, factually

| Tool | Does it use OpenVDB? | What is exposed |
| --- | --- | --- |
| Blender volume object | Yes. "Volume objects are containers used to represent OpenVDB files" ([manual][BINTRO]); added in 2.83 ([release notes][B283]). | Import, display, render. The manual lists as limitations that sparse volumes "are still rendered as dense volumes" and that level-set grids can be read but not rendered as surfaces ([manual][BINTRO]). |
| Blender *Mesh to Volume* modifier | Yes: `openvdb::tools::meshToVolume` followed by `sdfToFogVolume` ([source][BM2V]). | Produces a fog grid named `density`, not an SDF. Options: Density, Interior Band Width, Voxel Amount / Voxel Size ([manual][BM2VDOC]). |
| Blender *Volume to Mesh* modifier | Yes: `openvdb::tools::volumeToMesh` ([source][BV2M]). | Threshold, Adaptivity, resolution mode ([manual][BV2MDOC]). |
| Blender voxel remesher | Yes: `meshToLevelSet` then `volumeToMesh` ([source][BREMESH]). Introduced in 2.81 ([release notes][B281]). | Voxel Size, Adaptivity, Fix Poles, Preserve Volume ([manual][BRETOPO]). A single mesh → SDF → mesh round trip with no operations in between. |
| Blender 5.0 Geometry Nodes | Yes; the release notes show "Smoothing SDF Grids using OpenVDB operators" ([release notes][B50]). | A grid socket and nodes: Mesh to SDF Grid, Points to SDF Grid, Mesh to Density Grid, Grid to Mesh, SDF Grid Boolean, SDF Grid Offset / Fillet / Laplacian / Mean / Median, Advect Grid, Prune Grid, Voxelize Grid, Sample Grid and others ([release notes][B50]). |
| Rhino | No native volume object. The help lists points, curves, surfaces, polysurfaces, extrusions, meshes and SubD ([Rhino objects][ROBJ]). | *ShrinkWrap* (Rhino 8) builds a watertight mesh around meshes, NURBS, SubD and point clouds, with offset and smoothing options ([command help][RSW], [feature page][RSWF]). Neither page says how it works internally; whether it is voxel- or OpenVDB-based is **not verified**. |
| Dendro (Grasshopper) | Yes: "a volumetric modeling plug-in for Grasshopper-3D built on top of the OpenVDB library" ([GitHub][DENDRO]). | Boolean, smoothing, offset and morphing components; builds against Rhino 8; MPL-2.0 ([GitHub][DENDRO]). The Food4Rhino page returned HTTP 403 and was not read. |

**Plain answer.** The premise "Houdini uses VDB, Blender and Rhino use something slower" is wrong for Blender: it is the same library. What differs is the workflow. Houdini exposes the whole chain — SDF from polygons, filter, reshape, combine, advect, back to polygons — as separate nodes that all operate on the sparse grid (VDB Advect is documented as available since 12.5, [VDB Advect][HAD]). In Blender before 5.0 the user-facing tools were a fog-density modifier pair and a one-shot remesher, so any "operate on voxels" step had to happen on meshes or dense data. Blender 5.0 closes most of that gap. Rhino has no built-in equivalent; Dendro supplies one. I found no first-party benchmark comparing the three, so the perceived speed difference itself is **not verified**.

---

## 5. Python availability

Checked on 2026-10-04 against PyPI's JSON and simple-index endpoints. Nothing was installed.

| Package name | Result |
| --- | --- |
| `openvdb` | No such project on PyPI: [JSON API][PYOVJ] and [simple index][PYOVS] both return HTTP 404. |
| `pyopenvdb` | Third-party (author Alex Braun, repo `theNewFlesh/docker_pyopenvdb`). Latest 0.1.4, one file: `pyopenvdb-0.1.4-cp37-none-any.whl`, uploaded 2020-03-12 ([JSON API][PYPVJ]). The description says "Currently only for linux systems with x86_64" and requires adding the `.so` directory to `LD_LIBRARY_PATH` ([project page][PYPV]). |
| `pyopenvdb-3.8` | Same author; one file, `pyopenvdb_3.8-0.1.5-cp38-none-any.whl`, 2020-12-04 ([JSON API][PYPV38]). |

- **No wheel exists for Windows or for CPython 3.11** under any of these names. The `none-any` platform tag on the `pyopenvdb` wheels is misleading: the payload is a Linux shared library.
- The official bindings are built from source. The repository's `pyproject.toml` declares `name = "openvdb"`, `requires-python = ">=3.10"`, build backend `scikit_build_core` with `nanobind`, and switches on `OPENVDB_BUILD_PYTHON_MODULE` ([pyproject.toml][PYPROJ]). On Windows that means a C++ toolchain plus OpenVDB's native dependencies.
- conda-forge has an `openvdb` package (13.0.0 when checked) ([anaconda.org][CONDA]). Whether it ships Windows builds with the Python module: **not verified** — the page did not show platforms.
- Even with a working build, the documented Python module covers grids, accessors, NumPy exchange (`copyFromArray` / `copyToArray`), mesh ↔ level set conversion and I/O, "but almost none of the many tools" ([Python doc source][PYDOC]). The filter, advection and morph tools of §3 are C++ only as far as that page says; whether the newer nanobind module exposes more is **not verified**.

**Decision this supports:** do not depend on OpenVDB; implement the handful of operations with numpy / scipy / scikit-image, which the project already has.

---

## 6. What transfers to this project, and what does not

Project constraints used below, from the project's own files: the engine takes a dense array per job and each job is limited to 65,536 values ([README](../README.md)); values are amplitude-encoded as `sqrt(values / total)`, so they must be non-negative and the total is conserved ([app/emulator.py](../app/emulator.py)); empty tiles are skipped and identical tiles are computed once ([README](../README.md), [app/tiling.py](../app/tiling.py)).

### 6.1 Ranked

1. **Keep geometry in a fine SDF, keep the quantum job coarse** (candidate f). The only item that changes the number of 8-second jobs: the statue at 256³ in layer mode was 252 jobs (from the project's working notes, which are not in the repository); a 32³ field is one. It works in the test only with two conditions, both in 6.4: the quantum input must agree with the fine surface, and the speed must attract the surface to a target rather than push it away from a reference.
2. **SDF as the local representation** (a). Smoothing, offset and booleans become array arithmetic, and marching cubes gets a field that is linear across the surface. Measured on a sphere: surface roughness 0.015 voxel RMS from the SDF versus 0.21 from the binary grid (§6.5).
3. **Voxel-space filters and morphology before meshing** (d, e). Direct analogues of VDB Smooth SDF and VDB Reshape SDF.
4. **Booleans as min / max** (not in the candidate list). `np.minimum(a, b)` is union, `np.maximum(a, b)` intersection, `np.maximum(a, -b)` difference ([Composite.h][COMP]). Useful to re-cut the cup opening or add a flat base after the quantum step. **[inference]** The result is not an exact distance field near the seam, so rebuild before offsetting it.
5. **Tile skipping** (c). Already implemented; small remaining gains (6.2).
6. **Restricting local work to the active region** (b). Minor at these sizes.

**Does not transfer**

- **The tree.** Its benefit is for sparse data at high resolution ([FAQ][FAQ]); here the engine needs dense tiles, and a 256³ float32 array is 64 MiB **[inference: arithmetic]**. A Python-level tree would give up numpy's vectorisation for no gain **[inference]**.
- **Sparsity inside a tile.** A submitted tile is dense by contract; sparsity only decides which tiles are sent.
- **An SDF as engine input.** Signed values cannot be amplitude-encoded ([app/emulator.py](../app/emulator.py) rejects negatives). The engine works on density; the SDF lives only on the local side.
- **High-order schemes** (HJ-WENO5 with RK3). They exist for long advections where dissipation accumulates — the paper's benchmark is the Enright deformation test ([M13 §5][M13]). For a displacement of a few voxels, first order is adequate **[inference]**.
- **Adaptive meshing.** `skimage.measure.marching_cubes` has no adaptivity parameter; it does have `step_size` and a `mask` that limits computation to chosen voxels ([scikit-image][SKMC]).
- **Value accessors and bit masks.** Boolean numpy arrays already play the role of masks; there is no per-voxel traversal to accelerate.

### 6.2 Candidates (a)–(f)

| | Verdict | Reasons and corrections |
| --- | --- | --- |
| (a) SDF for sub-voxel accuracy | Confirmed, with two corrections | (1) Sub-voxel accuracy comes only from measuring distance to the mesh. A distance transform of a 0/1 grid is exact between voxel centres ([scipy][EDT]) but the surface it implies is still the staircase — as `_mask_sdf`'s docstring says. (2) The engine never sees the SDF. The quantum input is still the binary grid from `mesh_to_grid`, which is not only stair-stepped but fat: on a sphere of radius 11.5 voxels it has 18 % more volume than the mesh, equivalent to +0.66 voxel of radius **[measured]**. Deriving the input from the SDF as a coverage fraction per coarse voxel — the fog-volume idea of [LevelSetUtil.h][LSU] — gave the right volume (6374 vs 6371) and a smooth ½-level **[measured]**. Whether the real engine handles fractional values as the emulator does is untested. |
| (b) Work only in the active box / band | Confirmed, low priority | VDB's gain comes from band ≪ volume at thousands of voxels per side ([M13 §5][M13]). At 16³–256³ dense numpy is fine. `marching_cubes(mask=...)` exists if meshing becomes the bottleneck ([scikit-image][SKMC]). |
| (c) Skip empty or constant tiles | Already done; one addition | Empty tiles are skipped and identical tiles deduplicated ([README](../README.md)), so all fully solid tiles already cost one job in total. A uniform tile needs no job at all for style `x`: the emulator returns it unchanged; for `y` and `xy` it does not **[measured in the emulator; not checked on Atlas]**. Because interior tiles deduplicate, the job count already scales with the tiles the surface crosses — the VDB scaling. A further saving: crop each axis to its own power of two around the model, so tiles can be longer in the short directions **[inference]**. |
| (d) Filter density or SDF before meshing | Confirmed | Filtering the density is VDB Smooth; it moves the threshold surface in a level-dependent way and changes what the threshold means. Filtering the SDF is VDB Smooth SDF and must be followed by a rebuild ([VDB Smooth SDF][HSS]). On the test sphere, Gaussian or mean filtering of the SDF cut roughness by a factor of about 3–4 and moved the surface by about 0.01 voxel or less **[measured]**. Curvature-type flows shrink convex features and thin walls **[inference: standard property, not from a source opened here]**, so cap the width. Taubin smoothing of the mesh becomes optional. |
| (e) Dilate / erode / open / close | Confirmed | Semantics as in [VDB Reshape SDF][HRS]. Offsets of ±1 coarse voxel landed within 0.02 voxel of the target radius **[measured]**. **[inference]** Open by r removes parts thinner than 2r, close by r fills gaps narrower than 2r, and both round corners by r — a usable minimum-wall and minimum-gap check for printing. |
| (f) Coarse quantum result drives a fine level set | Partly confirmed | Both standard formulations exist in OpenVDB and both are valid (6.4). Limits: it cannot reproduce fine-scale structure the engine would have produced at high resolution — the fine detail in the output is the *original* model's detail, displaced — and iterated to convergence toward an iso-surface it returns the coarse result. It is a blend controlled by `amount`, not a substitute for a fine quantum run. As wired today (default `difference` field, binary occupancy as reference) the motion on a test sphere was mostly artefact; see 6.4. |

### 6.3 `app/levelset.py` versus OpenVDB

The file was being edited while this note was written. This section and §6.5 describe the version on disk at 18:57 on 2026-10-04 (the one with `fit`, and with `advect` rebuilding every second step).

| Aspect | OpenVDB / Houdini | `app/levelset.py` | Assessment |
| --- | --- | --- | --- |
| Representation | Active band of ±3 voxels; constant ±background elsewhere; band follows the surface in an unbounded index space ([overview][OV], [M13 §1.2][M13]) | Dense float32 array over a bounding box (`LevelSet.sdf`, `origin`) with distances everywhere in the box; `fit` re-crops or pads the box to the reach of the next operation | Different. This is what Houdini calls a dense SDF. `fit` is the analogue of dilating and trimming the band, done once per operation instead of once per step. Simpler, but cost follows box volume, and the box cannot extend past the fine grid, so growth beyond the grid's padding is cut flat by `to_mesh`. |
| Mesh → SDF distance | Exact closest point on a triangle per band voxel ([MeshToVolume.h][MTV]) | Distance to the nearest of ~12 random surface samples per voxel² via KD-tree | Good approximation at the surface. **[measured]** No wrong signs; \|φ\| too large by 0.05–0.06 voxel on average in the first half voxel (the nearest sample is never exactly at the foot point), worst case 0.49; resulting surface is unbiased with 0.06 fine-voxel RMS roughness. Interior band beyond half a voxel: mean error under 0.01. **Exterior band 1–3 voxels out is too small by 0.25–0.32 voxel on average** — probably the cap `min(distance, |mask sdf| + 0.5)`, since the mask counts shell voxels as inside **[inference]**. This matters for filters wider than one voxel, not for the surface position. |
| Mesh → SDF sign | Flood fill from outside; optional winding number ([VDB from Polygons][HFP]) | `binary_fill_holes` of the sampled shell, plus a normal-side test for shell voxels with a majority vote on orientation | Same principle and same limitation (no internal cavities; open meshes need the "capped" mode). The normal-side refinement has no OpenVDB counterpart. |
| Band width | `LEVEL_SET_HALF_WIDTH = 3` ([Types.h][TYPES]) | `BAND = 3` for the exact distances | Faithful. |
| Renormalisation | Iterative PDE φ ← φ − Δt·S(φ)(\|∇φ\| − 1), upwind HJ-WENO5 by default, 3 passes per `track()`; leaves a valid SDF unchanged ([LevelSetTracker.h][LST]) | `rebuild`: one-shot. First ring: φ / \|∇φ\|. Beyond: Euclidean distance to the nearest voxel of the other sign, plus that voxel's own first-ring value. | **The largest departure.** Closer to `fogToSdf` / `sdfToSdf` than to *VDB Renormalize SDF*; OpenVDB's fast-sweeping initialiser also sets the first ring by first-order interpolation, as `h / sqrt(Σ 1/dᵢ²)` across sign changes only ([FastSweeping.h][FS]). `rebuild` recomputes every value whether or not the field was already a distance field, and it is not idempotent: on a sphere the mean radius stayed put but roughness grew from 0.013 to 0.045 to 0.116 coarse voxels RMS after 1, 5 and 20 calls at refine 4 — that is 0.05, 0.18 and 0.46 fine voxels **[measured]**. Every offset step, advection step and curvature iteration calls it. |
| Offset (dilate / erode) | Add a constant in steps ≤ 0.5 voxel, `track()` after each ([LevelSetFilter.h][LSF]) | Add a constant in steps ≤ 0.75 voxel, `rebuild` after each | Faithful in method; steps 1.5× larger. Accurate in the mean (±1 coarse voxel gave 12.496 and 10.519 for targets 12.5 and 10.5); roughness about doubles from the six rebuilds **[measured]**. Sign convention is reversed relative to the C++ call (there `offset(+d)` erodes) and matches Houdini's Dilate / Erode. |
| Open / close | Erode→dilate / dilate→erode ([SOP source][SOPF]) | Same | Faithful. On a sphere both return the original radius within 0.003 voxel **[measured]**. |
| Mean filter | Separable box `2w+1`, then track ([LevelSetFilter.h][LSF]) | `uniform_filter(size=2w+1)`, then rebuild | Faithful, except it filters the whole box rather than the band. |
| Gaussian | Four passes of the `2w+1` box ([LevelSetFilter.h][LSF]) | True Gaussian with σ = `width` | Different meaning of the parameter. Four box passes of half-width w have σ = sqrt(4w(w+1)/3): 1.63 for w = 1, 2.83 for w = 2 **[inference: arithmetic]**. |
| Median | One (2w+1)³ median per iteration; "relatively slow" ([LevelSetFilter.h][LSF]) | 3³ median repeated `round(width)` times | Approximation: an iterated 3³ median is not a (2w+1)³ median. |
| "curvature" | Mean-curvature flow uses κ\|∇φ\| with Δt = Δx²/3; Laplacian flow uses ∇²φ with Δt = Δx²/6 ([LevelSetFilter.h][LSF]) | Gaussian blur σ = 0.7 then rebuild, repeated `clip(round(2w²), 1, 12)` times | This is OpenVDB's **Laplacian flow**, not its mean-curvature operator: a small Gaussian blur is a step of ∂φ/∂t = ∇²φ of duration σ²/2 ≈ 0.245 Δx², about 1.5 OpenVDB Laplacian iterations **[inference]**. Blender's notes describe the Laplacian filter the same way: it "approximates mean curvature flow for true SDFs" ([Blender 5.0][B50]). The iteration cap limits the total to about σ ≈ 2.4 voxels. |
| Normal-speed advection | φ ← φ − Δt·S·\|∇φ\| with upwind gradient, TVD-RK, Δt ≤ CFL·Δx/max\|S\|, CFL = 0.3/√3 ≈ 0.17 for Forward Euler; track after each step ([LevelSetMorph.h][LSM]) | Forward Euler, \|∇φ\| from the steeper one-sided difference (not upwind) clamped to ≤ 2, step sized so the fastest point moves ≤ 0.75 voxel, rebuild after every second step | Approximation. The step is about 4× what OpenVDB allows for Euler, and OpenVDB renormalises after every step. It holds together because the rebuild restores \|∇φ\| ≈ 1, which makes the update effectively a spatially varying offset **[inference]**. Speed is sampled per voxel without extension off the surface — same as OpenVDB's morph. With an attracting speed and a consistent input it behaved well: roughness stayed at 0.011 voxel at `amount = 3` **[measured]**. |
| Vector advection | For SDFs: finite-difference upwind path as above ([LevelSetAdvect.h][LSA]). Semi-Lagrangian is the path for non-SDF grids ([VolumeAdvect.h][VA], [VDB Advect][HAD]) | Semi-Lagrangian back-trace with trilinear `map_coordinates`, steps ≤ 1 voxel, rebuild every third step | Corresponds to Houdini's *general* scheme "Semi-Lagrangian" (order 1 / 1), i.e. *Respect Grid Class* off — not to its level-set path. Stable at any step but the most diffusive option in the table of §3; no MacCormack / BFECC correction. Not measured. |
| Fog → SDF | `fogToSdf(grid, iso)`; above iso is inside ([FastSweeping.h][FS]) | `from_density`: `level − upsample(density)`, then `rebuild` | Same convention and intent. Trilinear upsampling adds no information: the surface is the coarse grid's trilinear iso-surface. |
| SDF → mesh | Quads, optional adaptivity ([VolumeToMesh.h][VTM]) | `marching_cubes(level=0)`, triangles, no adaptivity | Different mesher; fine for STL. |
| Masks | Every filter accepts an alpha mask ([LevelSetFilter.h][LSF]) | None | Not implemented. Would allow, e.g., protecting the rim or base **[inference]**. |
| Memory | Proportional to band voxels | `rebuild` runs two distance transforms with `return_indices=True` over the whole box | **[inference]** Roughly 40 bytes of temporaries per box voxel, so under 1 GB at the current `MAX_FINE = 256`. Raising the limit to 512 multiplies that by 8; that is where a real narrow band would pay off. |

### 6.4 Candidate (f): formulations and numerical care

**The two standard formulations**

- *Advection by a vector field*: ∂φ/∂t + **V**·∇φ = 0. Every level set is carried along **V**. This is VDB Advect ([LevelSetAdvect.h][LSA]). It needs a vector field, which a scalar quantum result does not directly provide.
- *Motion in the normal direction with scalar speed F*: ∂φ/∂t + F|∇φ| = 0 — the level-set equation. This is VDB Morph SDF, with F taken from the target SDF ([LevelSetMorph.h][LSM]), and VDB Reshape SDF, with F constant ([LevelSetFilter.h][LSF]). A scalar field fits this form naturally.
- Both are instances of the two-step pattern the paper describes: update values by solving a Hamilton–Jacobi equation, then rebuild the band ([M13 §4.2][M13]).
- I did not open the original level-set literature (Osher & Sethian 1988; Osher & Fedkiw 2002, which the paper cites); the equations above are as they appear in OpenVDB's code and comments.

**Numerical care, as OpenVDB does it**

1. **Time step (CFL).** Δt ≤ CFL·Δx / max|speed|, with CFL = 0.3, 0.9, 1.0 (÷√3) for RK1, RK2, RK3 ([LevelSetAdvect.h][LSA], [LevelSetMorph.h][LSM]). Forward Euler is allowed only the smallest step.
2. **Upwind gradient.** The gradient is one-sided, chosen by the direction information travels; central differences are not used for the transport term ([FiniteDifference.h][FD], [LevelSetAdvect.h][LSA]).
3. **Renormalise and re-band after every step**, with a scheme that does not disturb a field that is already a distance field ([LevelSetTracker.h][LST]).
4. **Semi-Lagrangian alternative.** Unconstrained by CFL but smoothing; MacCormack or BFECC with a limiter recover second order ([VolumeAdvect.h][VA]).
5. **Speed defined off the surface.** OpenVDB provides extension of a field off an iso-surface (`fogToExt` / `sdfToExt`, [FastSweeping.h][FS]) for cases where the speed is only meaningful on the interface.

**Specific to this project** (measurements in §6.5; the explanations are **[inference]**)

- **The reference must agree with the fine surface.** `server.py` passes `S.grid`, the binary grid from `mesh_to_grid`, as `occupancy`. That grid's ½-level sits 0.66 voxel outside the true surface. With a symmetric Gaussian blur that moves the coarse iso-surface by only −0.08 voxel, the two scalar fields moved the fine surface in opposite directions: `difference` by −0.25 and `threshold` by +0.18 at `amount = 1`. Both numbers are the mismatch, not the blur.
- **`difference` (the default) is unstable.** Blurring removes density just inside the surface and adds it just outside, so F = q − occupancy is negative inside and positive outside: a front slightly outside is pushed further out, one slightly inside further in. With the mismatch removed (coverage input, below), roughness under `difference` still grew from 0.048 voxel RMS at `amount = 1` to 0.38 at `amount = 3`, with a peak-to-peak of 1.7 voxels. Under `threshold` it stayed at 0.011.
- **`threshold` is a morph and is stable.** F = q − level is positive inside the target surface and negative outside, so the surface is attracted to {q = level} from both sides, as in VDB Morph SDF. As `amount` grows it converges to the coarse result and the original detail fades.
- **A consistent input gives `threshold` the property `difference` was chosen for.** If the engine input is the coverage fraction derived from the fine SDF, its ½-level *is* the fine surface (radius 11.489 vs 11.500). With no quantum effect, q equals the input, F = q − ½ vanishes on the surface, and nothing moves — a stable version of "no effect, no motion".
- **`gradient`**: ∇q points into the solid at the surface, so this mode moves the surface inward everywhere, more where the density edge is sharp. It is a modulated erosion, not a transport of the shape toward where density went. Not measured.
- Whatever the field, the displacement is bounded by `amount` × max|F|; `advect` re-fits the box to that reach first, within the fine grid (6.3, first row).

### 6.5 Measurements behind the **[measured]** tags

Made with throw-away scripts in the session scratchpad that import `app/levelset.py`, `app/pipeline.py` and `app/emulator.py` read-only; nothing was written to the project and the scripts are not saved in it. One shape only, so treat the numbers as indicative.

Set-up: an icosphere (5 subdivisions) of radius 11.5 coarse voxels at an off-grid centre, `n = 32`, `pad = 4`, `refine = 4`. Radii are distances of marching-cubes vertices from the true centre, in coarse voxels; "RMS" is their standard deviation, "span" is max − min. "Gaussian" is `emulator.mock_blur` with σ = 1.

| Surface | Mean radius | RMS | Span |
| --- | --- | --- | --- |
| True sphere | 11.500 | — | — |
| Binary grid from `mesh_to_grid`, meshed at 0.5 (7532 solid voxels; analytic volume 6371) | 12.159 | 0.207 | 0.91 |
| Coverage fraction from the fine SDF, meshed at 0.5 (sum 6374) | 11.489 | 0.040 | 0.20 |
| `levelset.from_mesh` → `to_mesh` | 11.499 | 0.015 | 0.15 |
| … after 1 / 5 / 20 × `rebuild` | 11.499 / 11.501 / 11.507 | 0.013 / 0.045 / 0.116 | 0.13 / 0.32 / 0.48 |
| `offset` +4 / −4 fine voxels | 12.496 / 10.519 | 0.040 / 0.029 | 0.27 / 0.18 |
| `close` / `open_` with r = 4 fine voxels | 11.502 / 11.503 | 0.033 / 0.035 | 0.23 / 0.26 |
| `smooth` gaussian w = 1 / 2 | 11.503 / 11.510 | 0.003 / 0.005 | 0.03 / 0.04 |
| `smooth` curvature w = 1 / 2 | 11.497 / 11.483 | 0.006 / 0.017 | 0.05 / 0.10 |
| Gaussian of the binary grid, meshed at 0.5 | 12.077 | 0.065 | 0.27 |
| Gaussian of the coverage grid, meshed at 0.5 | 11.403 | 0.008 | 0.04 |

`advect` on the fine level set, Gaussian stand-in:

| Input and reference | Field | `amount` 0.5 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- | --- |
| Binary grid | `difference` — mean radius | 11.378 | 11.252 | 11.039 | 10.845 |
| | RMS / span | 0.026 / 0.23 | 0.039 / 0.37 | 0.047 / 0.62 | 0.072 / 1.61 |
| Binary grid | `threshold` — mean radius | 11.587 | 11.676 | 11.814 | 11.905 |
| | RMS / span | 0.013 / 0.13 | 0.028 / 0.25 | 0.039 / 0.25 | 0.043 / 0.26 |
| Coverage grid | `difference` — mean radius | — | 11.466 | — | 11.349 |
| | RMS / span | — | 0.048 / 0.37 | — | 0.380 / 1.72 |
| Coverage grid | `threshold` — mean radius | — | 11.468 | — | 11.416 |
| | RMS / span | — | 0.011 / 0.10 | — | 0.011 / 0.08 |

Other checks:
- Speed sampled on the fine surface: q − occupancy averages −0.24 with the binary grid and −0.02 with the coverage grid; q − 0.5 averages +0.20 and −0.04.
- `from_mesh` against the analytic distance, in fine voxels: mean error +0.064 outside and −0.051 inside for |d| < 0.5; −0.25 and −0.32 outside for |d| in 1–2 and 2–3; within 0.003 inside for the same ranges; no wrong signs.
- A uniform 8³ tile through `emulator.quantum_blur` at strength 0.5: unchanged for style `x`; range 0–105 for `y` and `xy`.
- The same sphere through the quantum emulation (strength 0.5, `x`), meshed at 0.5 after normalisation: mean radius 11.91 from the binary input and 10.89 from the coverage input. Changing the input changes the result by about a voxel, so this is a visible change to existing behaviour, not a refinement.

---

## Sources

Pages opened for this note. Raw GitHub URLs are the `master` branch as of 2026-10-04.

**Paper**
- [M13] K. Museth, "VDB: High-Resolution Sparse Volumes with Dynamic Topology", ACM TOG 32(3), 2013, DOI 10.1145/2487228.2487235 — <https://www.museth.org/Ken/Publications_files/Museth_TOG13.pdf>

**OpenVDB documentation and source**
- [OV] Overview — <https://www.openvdb.org/documentation/doxygen/overview.html>
- [FAQ] FAQ — <https://www.openvdb.org/documentation/doxygen/faq.html>
- [PYDOC] Python doc (rendered: <https://www.openvdb.org/documentation/doxygen/python.html>; source: <https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/doc/python.txt>)
- [PYPROJ] `pyproject.toml` — <https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/pyproject.toml>
- [TYPES] `Types.h`; [MTV] `tools/MeshToVolume.h`; [VTM] `tools/VolumeToMesh.h`; [LSU] `tools/LevelSetUtil.h`; [FS] `tools/FastSweeping.h`; [FILT] `tools/Filter.h`; [LSF] `tools/LevelSetFilter.h`; [LST] `tools/LevelSetTracker.h`; [LSA] `tools/LevelSetAdvect.h`; [LSM] `tools/LevelSetMorph.h`; [VA] `tools/VolumeAdvect.h`; `tools/Morphology.h`; [COMP] `tools/Composite.h`; [FD] `math/FiniteDifference.h` — all under <https://github.com/AcademySoftwareFoundation/openvdb/tree/master/openvdb/openvdb>
- [SOPF] `SOP_OpenVDB_Filter_Level_Set.cc` — <https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb_houdini/openvdb_houdini/SOP_OpenVDB_Filter_Level_Set.cc>

**SideFX Houdini node documentation**
- [HFP] VDB from Polygons; [HCV] Convert VDB; [HSM] VDB Smooth; [HSS] VDB Smooth SDF; [HRS] VDB Reshape SDF; [HRN] VDB Renormalize SDF; [HAD] VDB Advect (the page lives at `vdbadvectsdf.html`; `vdbadvect.html` returns 404); [HAP] VDB Advect Points; [HMO] VDB Morph SDF; [HCO] VDB Combine — all under <https://www.sidefx.com/docs/houdini/nodes/sop/>

**Blender**
- [BINTRO] Manual, Volumes introduction; [BM2VDOC] Mesh to Volume modifier; [BV2MDOC] Volume to Mesh modifier; [BRETOPO] Retopology / Remeshing — manual sources under <https://projects.blender.org/blender/blender-manual/src/branch/main/manual/modeling>
- [BREMESH] `mesh_remesh_voxel.cc`; [BM2V] `mesh_to_volume.cc`; [BV2M] `volume_to_mesh.cc` — under <https://projects.blender.org/blender/blender/src/branch/main/source/blender>
- [B281] 2.81 Sculpt notes; [B283] 2.83 Volumes notes; [B50] 5.0 Geometry Nodes notes — under <https://developer.blender.org/docs/release_notes/>

**Rhino**
- [ROBJ] Rhino objects; [RSW] ShrinkWrap command — under <https://docs.mcneel.com/rhino/8/help/en-us/>
- [RSWF] ShrinkWrap feature page — <https://www.rhino3d.com/features/shrinkwrap/>
- [DENDRO] Dendro — <https://github.com/ryein/dendro>

**Packaging**
- [PYOVJ] <https://pypi.org/pypi/openvdb/json> (404); [PYOVS] <https://pypi.org/simple/openvdb/> (404)
- [PYPVJ] <https://pypi.org/pypi/pyopenvdb/json>; [PYPV] <https://pypi.org/project/pyopenvdb/>; [PYPV38] <https://pypi.org/pypi/pyopenvdb-3.8/json>
- [CONDA] <https://anaconda.org/conda-forge/openvdb>

**Libraries the project already uses**
- [SKMC] `skimage.measure.marching_cubes` — <https://scikit-image.org/docs/stable/api/skimage.measure.html>
- [EDT] `scipy.ndimage.distance_transform_edt` — <https://docs.scipy.org/doc/scipy/reference/generated/scipy.ndimage.distance_transform_edt.html>
- `scipy.ndimage.map_coordinates` — <https://docs.scipy.org/doc/scipy/reference/generated/scipy.ndimage.map_coordinates.html>
- `trimesh.proximity` — <https://trimesh.org/trimesh.proximity.html> (note: `signed_distance` is positive *inside*, the opposite of OpenVDB and of `levelset.py`)

**Project files read**: `README.md`, the project's working notes (not in the repository), `app/pipeline.py`, `app/tiling.py`, `app/emulator.py`, `app/levelset.py`, and the `levelset` call sites in `app/server.py`.

## Open questions

1. **Does the real engine respond to a fractional (coverage) input the way the emulator does?** The emulator accepts any non-negative values, but amplitude encoding takes a square root, so a 0–1 ramp at the surface is not treated linearly. One Atlas job on the sphere, binary versus coverage, would answer it.
2. **Do the §6.5 findings hold on real models?** One sphere was tested. The cup (thin wall, concave interior) and the statue are the cases that matter; thin walls are where an unstable speed field and a roughening rebuild would show first.
3. **What should replace `rebuild` when it is called many times?** OpenVDB's answer is a correction proportional to (|∇φ| − 1). Whether a few such relaxation passes, or the intercept formula of the fast-sweeping initialiser, removes the roughening here is untested.
4. **Is the exterior-band bias in `from_mesh` caused by the cap, as guessed?** Applying the cap only in "capped" mode and re-running the comparison would tell.
5. **Is a uniform tile a fixed point on the real engine for `x` style?** True in the emulator; one Atlas job would confirm.
6. **Which algorithm does `volumeToMesh` use, and how does ShrinkWrap work internally?** Neither is stated in the pages read.
7. **Does conda-forge's `openvdb` include the Python module on Windows, and does the current nanobind module expose the level-set tools?** Only relevant if a real OpenVDB backend is ever wanted for cross-checking results.
8. **No first-party benchmark** was found comparing Houdini, Blender and Rhino volume workflows; the speed difference the user observed is explained here by architecture and exposure, not measured.

[M13]: https://www.museth.org/Ken/Publications_files/Museth_TOG13.pdf
[OV]: https://www.openvdb.org/documentation/doxygen/overview.html
[FAQ]: https://www.openvdb.org/documentation/doxygen/faq.html
[PYDOC]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/doc/python.txt
[PYPROJ]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/pyproject.toml
[TYPES]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/Types.h
[MTV]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/MeshToVolume.h
[VTM]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/VolumeToMesh.h
[LSU]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/LevelSetUtil.h
[FS]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/FastSweeping.h
[FILT]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/Filter.h
[LSF]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/LevelSetFilter.h
[LST]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/LevelSetTracker.h
[LSA]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/LevelSetAdvect.h
[LSM]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/LevelSetMorph.h
[VA]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/VolumeAdvect.h
[COMP]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/tools/Composite.h
[FD]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb/openvdb/math/FiniteDifference.h
[SOPF]: https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/openvdb_houdini/openvdb_houdini/SOP_OpenVDB_Filter_Level_Set.cc
[HFP]: https://www.sidefx.com/docs/houdini/nodes/sop/vdbfrompolygons.html
[HCV]: https://www.sidefx.com/docs/houdini/nodes/sop/convertvdb.html
[HSM]: https://www.sidefx.com/docs/houdini/nodes/sop/vdbsmooth.html
[HSS]: https://www.sidefx.com/docs/houdini/nodes/sop/vdbsmoothsdf.html
[HRS]: https://www.sidefx.com/docs/houdini/nodes/sop/vdbreshapesdf.html
[HRN]: https://www.sidefx.com/docs/houdini/nodes/sop/vdbrenormalizesdf.html
[HAD]: https://www.sidefx.com/docs/houdini/nodes/sop/vdbadvectsdf.html
[HAP]: https://www.sidefx.com/docs/houdini/nodes/sop/vdbadvectpoints.html
[HMO]: https://www.sidefx.com/docs/houdini/nodes/sop/vdbmorphsdf.html
[HCO]: https://www.sidefx.com/docs/houdini/nodes/sop/vdbcombine.html
[BINTRO]: https://projects.blender.org/blender/blender-manual/raw/branch/main/manual/modeling/volumes/introduction.rst
[BM2VDOC]: https://projects.blender.org/blender/blender-manual/raw/branch/main/manual/modeling/modifiers/generate/mesh_to_volume.rst
[BV2MDOC]: https://projects.blender.org/blender/blender-manual/raw/branch/main/manual/modeling/modifiers/generate/volume_to_mesh.rst
[BRETOPO]: https://projects.blender.org/blender/blender-manual/raw/branch/main/manual/modeling/meshes/retopology.rst
[BREMESH]: https://projects.blender.org/blender/blender/raw/branch/main/source/blender/blenkernel/intern/mesh_remesh_voxel.cc
[BM2V]: https://projects.blender.org/blender/blender/raw/branch/main/source/blender/geometry/intern/mesh_to_volume.cc
[BV2M]: https://projects.blender.org/blender/blender/raw/branch/main/source/blender/blenkernel/intern/volume_to_mesh.cc
[B281]: https://developer.blender.org/docs/release_notes/2.81/sculpt/
[B283]: https://developer.blender.org/docs/release_notes/2.83/volumes/
[B50]: https://developer.blender.org/docs/release_notes/5.0/geometry_nodes/
[ROBJ]: https://docs.mcneel.com/rhino/8/help/en-us/information/rhinoobjects.htm
[RSW]: https://docs.mcneel.com/rhino/8/help/en-us/commands/shrinkwrap.htm
[RSWF]: https://www.rhino3d.com/features/shrinkwrap/
[DENDRO]: https://github.com/ryein/dendro
[PYOVJ]: https://pypi.org/pypi/openvdb/json
[PYOVS]: https://pypi.org/simple/openvdb/
[PYPVJ]: https://pypi.org/pypi/pyopenvdb/json
[PYPV]: https://pypi.org/project/pyopenvdb/
[PYPV38]: https://pypi.org/pypi/pyopenvdb-3.8/json
[CONDA]: https://anaconda.org/conda-forge/openvdb
[SKMC]: https://scikit-image.org/docs/stable/api/skimage.measure.html
[EDT]: https://docs.scipy.org/doc/scipy/reference/generated/scipy.ndimage.distance_transform_edt.html
