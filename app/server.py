"""Quantum Sculpting 的本地应用：一个只监听 127.0.0.1 的 Flask 服务 + static/ 里的界面。

状态都在内存里（单用户原型）：模型 → 体素网格 → 处理后的网格。
每一步改动会让它后面的结果失效，*_id 计数器让界面能丢掉过期的响应。
"""
import argparse
import hashlib
import json
import os
import re
import struct
import threading
import time
import traceback
import uuid
import webbrowser
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse

import numpy as np
from flask import Flask, Response, abort, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

import atlas
import emulator
import levelset
import pipeline
import tiling

ROOT = Path(__file__).resolve().parent.parent
STATIC = Path(__file__).resolve().parent / "static"
INPUT, GRIDS, OUTPUT = ROOT / "input", ROOT / "grids", ROOT / "output"

MODEL_TYPES = {".stl", ".obj", ".ply", ".glb", ".off"}
GRID_SIZES = (16, 32, 64, 128, 256)
MODES = ("gaussian", "emulator", "atlas")
ATLAS_TIMEOUT = 15 * 60
ATLAS_POLL = 2.0
ATLAS_PARALLEL = 3      # 同时在 Atlas 上跑的分块数
# 一个任务最多放 2**DEFAULT_BITS 个数。结果里每个数约 23 字节，2**16 个约 1.5 MB，在 2 MB 上限以内；
# 2**15（32³）已经在真实服务上成功过。真碰到上限时会自动减半并记下来。
DEFAULT_BITS = 16
MIN_BITS = 12
MAX_FINE = 256          # 水平集的细网格最大边长（量子网格 × 细化倍数）

# main() 可以改写：key 存放的目录（在 OneDrive 之外）和 Atlas 地址
def _default_home():
    """~/.quantum-sculpting。项目以前叫 Quantum cup：旧目录还在而新目录没有时，接着用旧的。"""
    new, old = Path.home() / ".quantum-sculpting", Path.home() / ".quantum-cup"
    return old if old.exists() and not new.exists() else new


HOME = Path(os.environ.get("QUANTUM_SCULPTING_HOME") or _default_home())
# 每次启动都不一样。模型、网格和结果只在内存里，页面靠它发现服务重启过、要把模型重新送回来
BOOT = uuid.uuid4().hex[:12]
ATLAS_BASE = os.environ.get("ATLAS_API_BASE") or atlas.DEFAULT_BASE

app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


class State:
    def __init__(self):
        self.lock = threading.RLock()
        self.raw_mesh = self.mesh = None
        self.name, self.file, self.up, self.model_id = None, None, "+z", 0
        self.builtin = False
        self.grid = self.scale = self.transform = None
        self.grid_params, self.grid_id = None, 0
        self.processed = None
        self.proc_meta, self.proc_id = None, 0
        self.tiles_cache = None
        self.levelset_cache = None
        self.advect_cache = None
        self.jobs = {}
        self.live = {}              # Atlas 任务号 → 自己轮询到的最新状态
        self.records_cache = {}     # grids/ 里的任务记录，按文件修改时间缓存
        self.account = None
        self.ticket = 0             # 每个重的请求领一个号，见 begin()
        self.latest = {}            # 页面 → 它在每一级最新的号


S = State()


# ── 通用 ────────────────────────────────────────────────────────────────

@app.before_request
def only_local_same_origin():
    """只接受本机页面发来的请求，避免别的网站借浏览器调用这个服务。"""
    if request.host.split(":")[0] not in ("127.0.0.1", "localhost"):
        abort(403)
    origin = request.headers.get("Origin")
    if origin and urlparse(origin).netloc != request.host:
        abort(403)


@app.after_request
def stamp_boot(resp):
    resp.headers["X-Boot"] = BOOT
    return resp


@app.errorhandler(ValueError)
def bad_request(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(atlas.AtlasError)
def atlas_failed(e):
    return jsonify(error=str(e)), 502


@app.errorhandler(413)
def too_large(e):
    return jsonify(error="文件超过 300 MB。先在 Blender 或 MeshLab 里简化模型再上传。"), 413


@app.errorhandler(Exception)
def crashed(e):
    if isinstance(e, HTTPException):                   # abort() 之类的 HTTP 错误
        return jsonify(error=e.description), e.code
    traceback.print_exc()
    return jsonify(error=f"程序出错了：{type(e).__name__}: {e}"), 500


def body():
    return request.get_json(silent=True) or {}


def clamp(value, lo, hi, default):
    try:
        return min(max(float(value), lo), hi)
    except (TypeError, ValueError):
        return default


def binary(payload, meta):
    resp = Response(payload, mimetype="application/octet-stream")
    resp.headers["X-Meta"] = json.dumps(meta)          # ensure_ascii，放进响应头是安全的
    resp.headers["Cache-Control"] = "no-store"
    return resp


def mesh_bytes(mesh):
    v = np.ascontiguousarray(mesh.vertices, dtype="<f4")
    f = np.ascontiguousarray(mesh.faces, dtype="<u4")
    return struct.pack("<II", len(v), len(f)) + v.tobytes() + f.tobytes()


# ── 重的计算：在状态锁外面做，一次只跑一个，被新请求取代的中途停下 ─────────────────
# S.lock 只在读写状态的一瞬间拿着。体素化、模拟、取面可能要算很久，拿着它算的话，
# 刷新页面、换模型都会卡在这把锁上，看起来就是整个程序死了。

WORK = threading.Lock()
MESH, PROCESS, VOXEL, MODEL = range(4)      # 越靠后越上游：上游变了，下游正在算的都作废


class Superseded(Exception):
    """这次计算的结果没人要了：同一个页面发来了更新的请求，或者它依据的模型、网格已经换了。"""


@app.errorhandler(Superseded)
def superseded(e):
    return jsonify(error="这次计算被更新的请求取代了。", superseded=True), 409


def begin(stage):
    """登记一次请求，返回检查函数：同一个页面之后又发来同级或上游的请求，它就抛出 Superseded。"""
    with S.lock:
        S.ticket += 1
        ticket = S.ticket
        latest = S.latest.setdefault(request.headers.get("X-Client", ""), [0, 0, 0, 0])
        latest[stage] = ticket

    def check():
        if max(latest[stage:]) > ticket:
            raise Superseded()
    return check


@contextmanager
def heavy(stage):
    """排队做一次重的计算。轮到的时候如果已经被取代，直接放弃；算的过程中每一步也会问一次。"""
    check = begin(stage)
    with WORK:
        check()
        levelset.checkpoint = check
        try:
            yield check
        finally:
            levelset.checkpoint = levelset.keep_going


# ── API key（只存在本机用户目录，不进 OneDrive，也不回传给页面） ────────────

def _config_file():
    return HOME / "config.json"


def load_key():
    try:
        saved = json.loads(_config_file().read_text(encoding="utf-8")).get("moth_api_key", "")
    except (OSError, ValueError):
        saved = ""
    if saved.strip():
        return saved.strip(), "saved"
    env = os.environ.get("MOTH_API_KEY", "").strip()
    return (env, "env") if env else ("", None)


def key_status():
    key, source = load_key()
    return {"set": bool(key), "source": source, "hint": key[-4:] if len(key) >= 12 else "",
            "base": ATLAS_BASE, "official": ATLAS_BASE == atlas.DEFAULT_BASE}


@app.get("/api/key")
def get_key():
    return jsonify(key_status())


@app.post("/api/key")
def set_key():
    key = str(body().get("key", "")).strip()
    if not key:
        raise ValueError("先粘贴 API key。")
    if any(ch.isspace() for ch in key):
        raise ValueError("API key 里不应该有空格或换行。")
    HOME.mkdir(parents=True, exist_ok=True)
    _config_file().write_text(json.dumps({"moth_api_key": key}), encoding="utf-8")
    return jsonify(key_status())


@app.delete("/api/key")
def clear_key():
    _config_file().unlink(missing_ok=True)
    return jsonify(key_status())


@app.post("/api/key/test")
def test_key():
    key, _ = load_key()
    atlas.Atlas(key, ATLAS_BASE).me()
    return jsonify(ok=True)


def atlas_bits():
    """一个 Atlas 任务最多放多少个数（2 的几次方）。按服务地址分别记。"""
    try:
        return int(json.loads((HOME / "limits.json").read_text(encoding="utf-8"))[ATLAS_BASE])
    except (OSError, ValueError, KeyError, TypeError):
        return DEFAULT_BITS


def remember_bits(bits):
    try:
        data = json.loads((HOME / "limits.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    data[ATLAS_BASE] = int(bits)
    HOME.mkdir(parents=True, exist_ok=True)
    (HOME / "limits.json").write_text(json.dumps(data), encoding="utf-8")


# ── 第一步：模型 ─────────────────────────────────────────────────────────

def set_model(mesh, name, file, up="+z", builtin=False):
    """file 是模型在 input/ 里的文件名：服务重启后页面凭它把模型重新打开。

    builtin 是程序里现造的测试杯子。它和从 test_cup.stl 读回来的差在浮点误差上，体素网格
    有个别格子不一样，Atlas 的缓存就对不上，所以恢复时要重新造一个，而不是去读文件。
    """
    with S.lock:
        S.raw_mesh, S.name, S.file, S.up, S.builtin = mesh, name, file, up, builtin
        S.mesh = pipeline.orient(mesh, up)
        S.model_id += 1
        S.grid = S.processed = S.proc_meta = None


def model_info():
    if S.mesh is None:
        return None
    return {"name": S.name, "file": S.file, "builtin": S.builtin, "up": S.up, "model_id": S.model_id,
            **pipeline.mesh_stats(S.mesh)}


@app.post("/api/model/test-cup")
def use_test_cup():
    begin(MODEL)
    cup = pipeline.make_test_cup()
    INPUT.mkdir(exist_ok=True)
    cup.export(INPUT / "test_cup.stl")
    set_model(cup, "test_cup", "test_cup.stl", builtin=True)
    return jsonify(model_info())


@app.post("/api/model/upload")
def upload_model():
    begin(MODEL)
    f = request.files.get("file")
    if f is None or not f.filename:
        raise ValueError("没有收到文件。")
    ext = Path(f.filename).suffix.lower()
    if ext not in MODEL_TYPES:
        raise ValueError(f"不支持 {ext or '这种'} 文件。请用 .stl、.obj、.ply、.glb 或 .off。")
    stem = re.sub(r"[^\w\-]+", "_", Path(f.filename).stem).strip("_") or "model"
    INPUT.mkdir(exist_ok=True)
    dest = INPUT / f"{stem}{ext}"
    f.save(dest)
    up = request.form.get("up", "+z")
    set_model(_load(dest, f.filename), stem, dest.name, up if up in pipeline.UP_AXES else "+z")
    return jsonify(model_info())


def _load(path, label):
    try:
        return pipeline.load_mesh(path)
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"读不了 {label}，文件可能损坏或不是网格模型。（{type(e).__name__}）") from e


@app.get("/api/models")
def list_models():
    """input/ 里已有的模型，新的在前。重启之后不用再上传一遍。"""
    files = [f for f in INPUT.glob("*") if f.is_file() and f.suffix.lower() in MODEL_TYPES]
    files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return jsonify([{"name": f.name, "mb": round(f.stat().st_size / 1e6, 1)} for f in files])


@app.post("/api/model/open")
def open_model():
    begin(MODEL)
    b = body()
    path = INPUT / Path(str(b.get("name", ""))).name       # 只取文件名，不让路径跑到 input/ 外面
    if path.suffix.lower() not in MODEL_TYPES or not path.is_file():
        raise ValueError("input/ 里没有这个模型文件。")
    up = b.get("up", "+z")
    set_model(_load(path, path.name), path.stem, path.name, up if up in pipeline.UP_AXES else "+z")
    return jsonify(model_info())


@app.post("/api/model/orient")
def orient_model():
    begin(MODEL)
    up = body().get("up", "+z")
    with S.lock:
        if S.raw_mesh is None:
            raise ValueError("还没有模型。")
        set_model(S.raw_mesh, S.name, S.file, up, S.builtin)
        return jsonify(model_info())


@app.get("/api/model/mesh")
def model_mesh():
    with S.lock:
        if S.mesh is None:
            abort(404)
        return binary(mesh_bytes(S.mesh), {"model_id": S.model_id})


# ── 第二步：体素化 ────────────────────────────────────────────────────────

def grid_info():
    if S.grid is None:
        return None
    n = S.grid.shape[0]
    return {"grid_id": S.grid_id, "n": n, "solid": int(round(float(S.grid.sum()))), "total": int(S.grid.size),
            "transform": S.transform.tolist(), "voxel_size": pipeline.sig(1.0 / S.scale),
            "tiles": grid_tiles(), **S.grid_params}


def grid_tiles():
    """两种分块方式各要几个 Atlas 任务。调用方必须已经持有 S.lock。"""
    key = (S.grid_id, atlas_bits())
    if S.tiles_cache is None or S.tiles_cache[0] != key:
        n = S.grid.shape[0]
        S.tiles_cache = (key, {m: tiling.summary(S.grid, tiling.tile_shape(n, m, key[1]))
                               for m in tiling.MODES})
    return S.tiles_cache[1]


@app.post("/api/voxelize")
def voxelize():
    b = body()
    n = int(b.get("n", 32))
    if n not in GRID_SIZES:
        raise ValueError(f"网格尺寸只能是 {GRID_SIZES} 之一。")
    pad = int(clamp(b.get("pad", 2), 0, n // 2 - 2, 2))
    fill = {True: "holes", False: "none"}.get(b.get("fill", "holes"), b.get("fill", "holes"))
    if fill not in pipeline.FILL_MODES:
        raise ValueError(f"填充方式只能是 {pipeline.FILL_MODES} 之一。")
    values = "coverage" if b.get("values") == "coverage" else "binary"
    with S.lock:
        if S.mesh is None:
            raise ValueError("先选择一个模型。")
        mesh, model_id = S.mesh, S.model_id
    with heavy(VOXEL):
        cached = None
        if values == "coverage":
            # VDB 的做法：网格 → 有符号距离场 → 每个格子的覆盖率。0.5 等值面就是真实表面
            scale, transform = pipeline.placement(mesh, n=n, pad=pad)
            refine = max(1, min(4, MAX_FINE // n))
            cached = (refine, levelset.from_mesh(mesh, transform, n, refine, fill=fill))
            grid = levelset.coverage(cached[1])
        else:
            grid, scale, transform = pipeline.mesh_to_grid(mesh, n=n, pad=pad, fill=fill)
        if grid.sum() == 0:
            raise ValueError("体素化后没有任何实体格子，模型可能是空的。")
        with S.lock:
            if S.model_id != model_id:
                raise Superseded()                   # 算的时候模型换了
            S.grid, S.scale, S.transform = grid, scale, transform
            S.grid_params = {"pad": pad, "fill": fill, "values": values}
            S.grid_id += 1
            S.processed = S.proc_meta = None
            if cached:                                   # 后面「推动表面」用同样的细化倍数时不用再算
                S.levelset_cache = ((S.model_id, S.grid_id, cached[0]), cached[1])
            return jsonify(grid_info())


@app.get("/api/grid/<which>")
def get_grid(which):
    with S.lock:
        arr = {"input": S.grid, "processed": S.processed}.get(which)
        if arr is None:
            abort(404)
        meta = {"n": int(arr.shape[0]), "grid_id": S.grid_id}
        if which == "processed":
            meta["proc"] = S.proc_meta       # 数据和它的说明一起发，界面上两者不会对不上
        if request.args.get("compact"):
            return binary(*compact(arr, meta))
        return binary(np.ascontiguousarray(arr, dtype="<f4").tobytes(), meta)


def compact(arr, meta):
    """只发有东西的那个盒子，每个数压成一个字节。256³ 整个发是 64 MB，这样通常不到 2 MB。"""
    active = arr > 0.5 / 255
    box = []
    for axis in range(3):
        hit = np.flatnonzero(active.any(axis=tuple(a for a in range(3) if a != axis)))
        box.append((int(hit[0]), int(hit[-1]) + 1) if hit.size else (0, 0))
    crop = arr[tuple(slice(a, b) for a, b in box)]
    data = np.rint(np.clip(crop, 0.0, 1.0) * 255).astype(np.uint8)
    return np.ascontiguousarray(data).tobytes(), {**meta, "box": box}


# ── 第三步：量子处理 ──────────────────────────────────────────────────────

def read_process_request(b):
    mode = b.get("mode", "emulator")
    if mode not in MODES:
        raise ValueError(f"未知的模式 {mode}")
    run = re.sub(r"[^\w\-]+", "_", str(b.get("run") or "run1")).strip("_")[:40] or "run1"
    tile_mode = b.get("tiling") if b.get("tiling") in tiling.MODES else "cube"
    if mode == "gaussian":
        return mode, run, {"sigma": clamp(b.get("sigma"), 0.2, 6.0, 1.0)}, tile_mode
    style = str(b.get("style") or "x")
    if not re.fullmatch(r"[xy]{1,4}", style):
        raise ValueError("style 只能由 x、y 组成，最多 4 个字母。")
    axes = sorted({int(a) for a in (b.get("axes") if b.get("axes") is not None else [0, 1, 2])})
    if not axes or any(a not in (0, 1, 2) for a in axes):
        raise ValueError("至少选择一个模糊方向（X、Y 或 Z）。")
    shots = b.get("shots")
    shots = int(clamp(shots, 1, 10_000_000, 0)) if shots not in (None, "", 0) else None
    return mode, run, {
        "strength": clamp(b.get("strength"), 0.0, 1.0, 0.5),
        "style": style,
        "reach": clamp(b.get("reach"), 0.0, 1.0, 0.0),
        "axes": None if axes == [0, 1, 2] else axes,
        "shots": shots or None,
    }, tile_mode


def apply_processed(raw, meta):
    """调用方必须已经持有 S.lock。"""
    S.processed = pipeline.normalize(raw, float(S.grid.sum()))
    S.proc_id += 1
    S.proc_meta = {**meta, "proc_id": S.proc_id, "grid_id": S.grid_id,
                   "min": round(float(raw.min()), 5), "max": round(float(raw.max()), 5)}
    return S.proc_meta


@app.post("/api/process")
def process():
    b = body()
    mode, run, params, tile_mode = read_process_request(b)
    with S.lock:
        if S.grid is None:
            raise ValueError("先完成体素化。")
        grid, grid_id = S.grid, S.grid_id
    meta = {"mode": mode, "run": run, "params": params, "cached": False, "job_id": None, "tiles": None}

    if mode != "atlas":
        with heavy(PROCESS) as check:
            t0 = time.time()
            if mode == "gaussian":
                raw = emulator.mock_blur(grid, **params)
            else:
                # 和 Atlas 用同样的分块，预览才和真正提交的结果对应
                shape = tiling.tile_shape(grid.shape[0], tile_mode, atlas_bits())
                seed = int(hashlib.sha256(run.encode()).hexdigest()[:8], 16)
                raw = emulator.quantum_blur_tiled(grid, shape, seed=seed, check=check, **params)
            meta["seconds"] = round(time.time() - t0, 3)
            with S.lock:
                if S.grid_id != grid_id:
                    raise Superseded()               # 算的时候网格换了
                if mode == "emulator":
                    meta["tiles"] = {"mode": tile_mode, **grid_tiles()[tile_mode]}
                return jsonify(status="done", meta=apply_processed(raw, meta))

    with S.lock:
        if S.grid is None:
            raise ValueError("先完成体素化。")
        grid, grid_id = S.grid, S.grid_id
        shape = tiling.tile_shape(grid.shape[0], tile_mode, atlas_bits())
        key, _ = load_key()
        if not key:
            raise ValueError("还没有设置 Atlas API key。点右上角的「设置 API key」。")
        busy = running_job()
        if busy:      # 两边同时提交会把还没提交的分块各交一遍
            abort(409, f"「{busy['run']}」还在 Atlas 上运行，等它结束再提交。")
        # 每一块都已经有缓存：直接拼起来，不用再找 Atlas
        every = list(tiling.split(grid, shape))
        todo = [t for t in every if t.data.any()]
        found = [_load_cached(_tile_stem(t, params, run)) for t in todo]
        if all(arr is not None for arr, _ in found):
            raw = np.zeros(grid.shape, dtype=np.float64)
            for tile, (arr, _) in zip(todo, found):
                tiling.place(raw, tile, arr)
            records = [record for _, record in found]
            meta.update(cached=True, job_id=records[0].get("job_id") if len(todo) == 1 else None,
                        seconds=round(sum(r.get("seconds") or 0 for r in records), 1),
                        tiles={"mode": tile_mode, "shape": list(shape), "jobs": len(todo),
                               "cached": len(todo)})
            return jsonify(status="done", meta=apply_processed(raw, meta))
        if b.get("cached_only"):      # 只想知道有没有现成的结果（服务重启后恢复用），没有也不提交
            return jsonify(status="missing")

        job = {"id": uuid.uuid4().hex[:12], "status": "running", "atlas_status": "submitting",
               "started": time.time(), "finished": None, "error": None, "meta": None,
               "stale": False, "note": None, "tiles_total": len(todo), "tiles_done": 0,
               "tiles_cached": 0, "tile_shape": list(shape), "version": 0, "partial": None,
               "cancel": False, "lock": threading.Lock(), "run": run, "params": params,
               "tiling": tile_mode, "layers": _layers(grid.shape[0], shape, every), "done": set()}
        S.jobs[job["id"]] = job
        threading.Thread(target=_run_atlas_job, daemon=True,
                         args=(job, grid, grid_id, params, meta, key, tile_mode)).start()
        return jsonify(_job_view(job))


def _read_record(stem):
    try:
        return json.loads(stem.with_suffix(".json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _tile_stem(tile, params, run):
    """一个分块的缓存文件名。地址也算进去：指向测试服务时得到的结果，不会被当成正式服务的结果。"""
    digest = hashlib.sha256(
        tile.data.tobytes() + json.dumps([params, run, ATLAS_BASE], sort_keys=True).encode())
    return GRIDS / f"atlas_{digest.hexdigest()[:16]}"


def _load_cached(stem):
    record = _read_record(stem)
    if record.get("finished") and stem.with_suffix(".npy").exists():
        return np.load(stem.with_suffix(".npy")), record
    return None, record


def _run_atlas_job(job, grid, grid_id, params, meta, key, tile_mode):
    """把网格按分块逐个交给 Atlas，再拼起来。碰到大小上限就把分块减半重来。"""
    try:
        GRIDS.mkdir(exist_ok=True)
        client = atlas.Atlas(key, ATLAS_BASE)
        bits = atlas_bits()
        while True:
            shape = tiling.tile_shape(grid.shape[0], tile_mode, bits)
            every = list(tiling.split(grid, shape))
            todo = [t for t in every if t.data.any()]
            raw = np.zeros(grid.shape, dtype=np.float64)
            with job["lock"]:
                job.update(tiles_total=len(todo), tiles_done=0, tiles_cached=0,
                           tile_shape=list(shape), partial=grid.copy(),   # 没算完的块先显示原样
                           layers=_layers(grid.shape[0], shape, every), done=set())
                job["version"] += 1
            try:
                first_id = _run_tiles(client, job, todo, raw, params, meta["run"])
                break
            except atlas.PayloadTooLarge:
                size_bits = int(np.log2(np.prod(shape)))
                if size_bits <= MIN_BITS:
                    raise
                bits = size_bits - 1
                remember_bits(bits)
                job["note"] = "这个大小的分块超出了 Atlas 的上限，已改用小一半的分块重新提交。"

        meta.update(seconds=round(time.time() - job["started"], 1),
                    job_id=first_id if len(todo) == 1 else None,
                    cached=job["tiles_cached"] == len(todo),
                    tiles={"mode": tile_mode, "shape": list(shape), "jobs": len(todo),
                           "cached": job["tiles_cached"]})
        with S.lock:
            if S.grid_id == grid_id:
                job["meta"] = apply_processed(raw, meta)
            else:
                job["stale"] = True       # 等结果的时候体素网格变了：结果已缓存，但不套用
        job["status"] = "done"
    except Exception as e:
        if not isinstance(e, (atlas.AtlasError, ValueError)):
            traceback.print_exc()
        job["error"] = str(e) if isinstance(e, (atlas.AtlasError, ValueError)) else f"{type(e).__name__}: {e}"
        job["status"] = "failed"
    finally:
        job["finished"] = time.time()
        job["partial"] = None


def _run_tiles(client, job, todo, raw, params, run):
    # 内容相同的分块（对称的模型常有）归成一组，只提交一次
    groups = {}
    for tile in todo:
        groups.setdefault(_tile_stem(tile, params, run), []).append(tile)
    groups = list(groups.values())

    def one(group):
        if tiling.is_untouched(group[0], params):
            result, cached, atlas_job_id = group[0].data, True, None     # 引擎不会改变它，不用提交
        else:
            result, cached, atlas_job_id = _atlas_tile(client, job, group[0], params, run)
        with job["lock"]:
            for tile in group:
                tiling.place(raw, tile, result)
                job["partial"][tile.slices] = np.clip(raw[tile.slices], 0.0, 1.0)
                job["done"].add(tile.index)
            job["tiles_done"] += len(group)
            job["tiles_cached"] += len(group) if cached else len(group) - 1
            job["version"] += 1
        return atlas_job_id

    first_id = one(groups[0])   # 第一块单独跑：万一超出大小上限，只浪费一个任务
    if len(groups) > 1:
        with ThreadPoolExecutor(max_workers=ATLAS_PARALLEL) as pool:
            futures = [pool.submit(one, group) for group in groups[1:]]
            try:
                for future in as_completed(futures):
                    future.result()
            except Exception:
                job["cancel"] = True          # 让还在等的分块停下来；已提交的任务号留着，下次接着等
                for future in futures:
                    future.cancel()
                raise
    return first_id


def _atlas_tile(client, job, tile, params, run):
    """一个分块：读缓存，或者 提交 → 轮询 → 取结果。返回 (结果, 是否来自缓存, Atlas 任务号)。

    任务号先落盘，中途断了下次同参数会接着等，不会重复提交。
    """
    stem = _tile_stem(tile, params, run)
    record_file = stem.with_suffix(".json")
    cached, record = _load_cached(stem)
    if cached is not None:
        return cached, True, record.get("job_id")

    resumed = bool(record.get("job_id"))
    if not resumed:
        if job["cancel"]:
            raise atlas.AtlasError("已停止。")
        accepted = client.submit(atlas.build_params(tile.data, **params))
        record = {"engine": atlas.ENGINE, "job_id": accepted["job_id"],
                  "submitted_at": accepted.get("submitted_at"), "params": params, "run": run,
                  "shape": list(tile.data.shape), "tile": list(tile.index)}
        record_file.write_text(json.dumps(record, indent=1), encoding="utf-8")
        S.live[record["job_id"]] = {"status": str(accepted.get("status") or "queued").lower()}
    job_id = record["job_id"]

    started = time.time()
    while True:
        if job["cancel"]:
            raise atlas.AtlasError("另一个分块失败了，已停止等待。")
        try:
            status = client.status(job_id)
        except atlas.AtlasError as e:
            if resumed and e.status == 404:   # 以前存下的任务号查不到了：挪开记录，下次重新提交
                record_file.replace(stem.with_suffix(".failed.json"))
                raise atlas.AtlasError(f"之前保存的任务已经查不到了，再运行一次会重新提交。（{e}）") from e
            raise
        resumed = False
        state = str(status.get("status", "")).lower()
        job["atlas_status"] = state
        S.live[job_id] = {"status": state, "progress": status.get("progress")}
        if state in atlas.DONE:
            break
        if state in atlas.FAILED:
            record_file.replace(stem.with_suffix(".failed.json"))   # 留作记录，但下次重新提交
            err = status.get("error")
            detail = err.get("message") if isinstance(err, dict) else err
            if atlas.is_payload_error(detail):
                raise atlas.PayloadTooLarge(
                    f"数据超过了 Atlas 单个任务约 2 MB 的上限，分得再小也不行。（{detail}）")
            raise atlas.AtlasError(f"Atlas 任务 {state}：{detail or '没有给出原因'}")
        if time.time() - started > ATLAS_TIMEOUT:
            raise atlas.AtlasError(
                f"等了 {ATLAS_TIMEOUT // 60} 分钟任务还是 {state}。任务号已保存，稍后用同样的参数再运行会接着等。")
        time.sleep(ATLAS_POLL)

    result = atlas.extract_grid(client.result(job_id), tile.data.shape)
    np.save(stem.with_suffix(".npy"), result)
    record.update(finished=True, seconds=round(time.time() - started, 1))
    record_file.write_text(json.dumps(record, indent=1), encoding="utf-8")
    return result, False, job_id


def _layers(n, shape, tiles):
    """水平方向不切、只沿竖直方向分成一层层的块时：每块几层、共几块、哪几块是空的。别的切法返回 None。"""
    if shape[0] != n or shape[1] != n or shape[2] == n:
        return None
    return {"thickness": shape[2], "count": n // shape[2],
            "empty": {t.index[2] for t in tiles if not t.data.any()}}


def _frontier(job):
    """一层层往上算的时候，从底下数已经连续算完到第几层（界面上的扫描面就停在这里）。"""
    layers = job["layers"]
    if not layers:
        return None
    done = {index[2] for index in job["done"]}
    k = 0
    while k < layers["count"] and (k in layers["empty"] or k in done):
        k += 1
    return k * layers["thickness"]


def running_job():
    return next((job for job in S.jobs.values() if job["status"] == "running"), None)


def _job_view(job):
    return {"job_id": job["id"], "status": job["status"], "atlas_status": job["atlas_status"],
            "run": job["run"], "params": job["params"], "tiling": job["tiling"],
            "elapsed": round((job["finished"] or time.time()) - job["started"], 1),
            "error": job["error"], "meta": job["meta"], "stale": job["stale"], "note": job["note"],
            "tiles_total": job["tiles_total"], "tiles_done": job["tiles_done"],
            "tiles_cached": job["tiles_cached"], "tile_shape": job["tile_shape"],
            "version": job["version"], "frontier": _frontier(job)}


@app.get("/api/process/<job_id>/preview")
def job_preview(job_id):
    """算到一半的样子：已完成的分块用结果，没完成的先用原样。"""
    job = S.jobs.get(job_id)
    if job is None:
        abort(404)
    with job["lock"]:
        partial = job["partial"]
        if partial is None:
            abort(404)
        return binary(*compact(partial, {"n": int(partial.shape[0]), "version": job["version"],
                                         "frontier": _frontier(job)}))


@app.get("/api/process/<job_id>")
def job_status(job_id):
    job = S.jobs.get(job_id)
    if job is None:
        abort(404)
    return jsonify(_job_view(job))


# ── Atlas 账户里的任务列表 ─────────────────────────────────────────────────

JOB_ID = re.compile(r"[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")


def local_records():
    """本应用提交过的任务：Atlas 任务号 → grids/ 里的记录。文件没变就不重读，轮询时不用每次读几百个文件。"""
    fresh = {}
    try:
        entries = [e for e in os.scandir(GRIDS) if e.name.startswith("atlas_") and e.name.endswith(".json")]
    except OSError:
        entries = []
    for entry in entries:
        stamp = entry.stat().st_mtime_ns
        hit = S.records_cache.get(entry.name)
        if hit is None or hit[0] != stamp:
            try:
                record = json.loads(Path(entry.path).read_text(encoding="utf-8"))
            except (OSError, ValueError):
                record = {}
            hit = (stamp, record if isinstance(record, dict) else {})
        fresh[entry.name] = hit
    S.records_cache = fresh
    return {record["job_id"]: record for _, record in fresh.values() if record.get("job_id")}


def account_id(client, key):
    """这个 key 所属账户的 id，用来区分自己的任务和组织里别人的。查不到就不区分。"""
    tag = hashlib.sha256(f"{key} {ATLAS_BASE}".encode()).hexdigest()
    if S.account is None or S.account[0] != tag:
        try:
            S.account = (tag, client.me().get("id"))
        except atlas.AtlasError:
            return None
    return S.account[1]


def job_row(item, records, me):
    job_id = str(item.get("job_id") or "")
    status, progress = str(item.get("status") or "").lower(), None
    live = S.live.get(job_id)
    if live and status not in atlas.DONE | atlas.FAILED:
        # 列表里的状态是服务端最后记下来的，会慢半拍；自己正在轮询的任务用轮询到的
        status, progress = live["status"], live.get("progress")
    record = records.get(job_id)
    return {
        "job_id": job_id, "engine": item.get("engine_id"), "status": status,
        "created_at": item.get("created_at"), "updated_at": item.get("updated_at"),
        "mine": None if me is None else item.get("owner") == me,
        "progress": progress.get("detail") if isinstance(progress, dict) else None,
        "local": None if record is None else {
            k: record.get(k) for k in ("run", "tile", "shape", "params", "seconds")},
    }


def atlas_client():
    key, _ = load_key()
    if not key:
        raise ValueError("还没有设置 Atlas API key。")
    return atlas.Atlas(key, ATLAS_BASE), key


@app.get("/api/atlas/jobs")
def atlas_jobs():
    """账户里的 Atlas 任务，新的在前。本应用提交的带上实验名和分块位置。"""
    client, key = atlas_client()
    limit = int(clamp(request.args.get("limit"), 1, 200, 50))
    page = client.jobs(limit=limit, cursor=request.args.get("cursor") or None)
    records, me = local_records(), account_id(client, key)
    return jsonify(jobs=[job_row(item, records, me) for item in page.get("jobs") or []],
                   next_cursor=page.get("next_cursor") or None)


@app.get("/api/atlas/jobs/<job_id>")
def atlas_job_detail(job_id):
    """一个任务现在的状态和失败原因。结果不转发：完成的任务会带着整个数组。"""
    if not JOB_ID.fullmatch(job_id):
        abort(404)
    status = atlas_client()[0].status(job_id)
    error, progress = status.get("error"), status.get("progress")
    return jsonify(
        job_id=job_id, status=str(status.get("status") or "").lower(),
        error=(error.get("message") if isinstance(error, dict) else error) or None,
        progress=progress.get("detail") if isinstance(progress, dict) else None,
        warnings=[str(w) for w in status.get("warnings") or []])


# ── 第四、五步：转回模型、打印检查、导出 ──────────────────────────────────────

def snapshot():
    """现在的模型、网格和处理结果。这些数组只会被整个换掉，不会被就地修改，拿到引用就能在锁外用。"""
    with S.lock:
        if S.processed is None:
            raise ValueError("先运行量子处理。")
        return SimpleNamespace(
            mesh=S.mesh, grid=S.grid, processed=S.processed, scale=S.scale, transform=S.transform,
            grid_params=S.grid_params, meta=S.proc_meta, name=S.name, up=S.up,
            model_id=S.model_id, grid_id=S.grid_id, proc_id=S.proc_id)


def base_levelset(now, refine):
    """原模型的水平集（VDB from Polygons）。同一个模型、网格和细化倍数只算一次。"""
    key = (now.model_id, now.grid_id, refine)
    hit = S.levelset_cache
    if hit is None or hit[0] != key:
        hit = (key, levelset.from_mesh(now.mesh, now.transform, now.grid.shape[0], refine,
                                       fill=now.grid_params["fill"]))
        S.levelset_cache = hit
    return hit[1]


def build_mesh(b, now, check):
    """返回 (网格坐标里的模型, 毫米模型, 报告)。now 是 snapshot()，check 在每个阶段之间问一次还要不要算。

    默认是在量子结果上直接取阈值。用到细化、体素平滑、加厚收缩、闭合或「推动表面」时，
    改走水平集：模型（或量子结果的等值面）→ 有符号距离场 → 在体素上运算 → 取面。
    """
    n = now.grid.shape[0]
    level = clamp(b.get("level"), 0.01, 0.99, 0.5)
    keep = "all" if b.get("keep") == "all" else "largest"
    smooth = int(clamp(b.get("smooth"), 0, 50, 0))
    height = clamp(b.get("height"), 5.0, 1000.0, 90.0)
    method = "advect" if b.get("method") == "advect" else "threshold"
    refine = int(clamp(b.get("refine"), 1, 8, 1))
    if refine not in (1, 2, 4, 8) or n * refine > MAX_FINE:
        raise ValueError(f"细化后的网格不能超过 {MAX_FINE}³。")
    amount = clamp(b.get("amount"), 0.0, 16.0, 0.0)
    field = b.get("field") if b.get("field") in levelset.FIELDS else "threshold"
    vfilter = b.get("vfilter") if b.get("vfilter") in levelset.FILTERS else "none"
    vwidth = clamp(b.get("vwidth"), 0.0, 6.0, 1.0)
    grow = clamp(b.get("grow"), -8.0, 8.0, 0.0)
    close = clamp(b.get("close"), 0.0, 8.0, 0.0)

    voxel_ops = vfilter != "none" or grow != 0 or close > 0
    if method == "threshold" and refine == 1 and not voxel_ops:
        mesh, total = pipeline.grid_to_mesh(now.processed, level=level, keep=keep, smooth=smooth)
    else:
        if method == "advect":
            # 平流最费时间；只调后面的体素运算时不用重算
            key = (now.model_id, now.grid_id, now.proc_id, refine, amount, field,
                   level if field == "threshold" else None)
            hit = S.advect_cache
            if hit is None or hit[0] != key:
                hit = (key, levelset.advect(base_levelset(now, refine), now.processed, now.grid,
                                            amount, field, level))
                S.advect_cache = hit
            shape = hit[1]
        else:
            shape = levelset.from_density(now.processed, level, refine)
        check()
        shape = levelset.fit(shape, abs(grow) + close + vwidth + 4)
        shape = levelset.smooth(shape, vfilter, vwidth)
        shape = levelset.close(shape, close)
        shape = levelset.offset(shape, grow)
        check()
        mesh, total = pipeline.finish_mesh(levelset.to_mesh(shape), keep=keep, smooth=smooth)

    check()
    printed, report = pipeline.prepare_for_print(mesh, now.scale, height)
    report.update(total_parts=total, level=level, keep=keep, smooth=smooth, height=height,
                  method=method, refine=refine, amount=amount, field=field, vfilter=vfilter,
                  vwidth=vwidth, grow=grow, close=close, proc_id=now.proc_id,
                  fine_voxel_mm=round(report["voxel_mm"] / refine, 3))
    return mesh, printed, report


@app.post("/api/mesh")
def mesh_preview():
    b = body()
    snapshot()                                   # 还没有处理结果就马上说，不用排队
    with heavy(MESH) as check:
        mesh, _, report = build_mesh(b, snapshot(), check)
    return binary(mesh_bytes(mesh), report)


@app.post("/api/export")
def export():
    b = body()
    snapshot()
    with heavy(MESH) as check:
        now = snapshot()
        _, printed, report = build_mesh(b, now, check)
        meta = now.meta
        n = now.grid.shape[0]
        name = f"{meta['run']}_{meta['mode']}_n{n}_L{int(round(report['level'] * 100)):03d}"
        if report["method"] == "advect":
            name += f"_adv{report['amount']:g}"
        if report["refine"] > 1:
            name += f"_x{report['refine']}"
        OUTPUT.mkdir(exist_ok=True)
        printed.export(OUTPUT / f"{name}.stl")
        # 同名 .json 记下这次用的全部参数，方便复现和提交作品时说明流程
        sidecar = {"model": now.name, "up": now.up, "grid": {"n": n, **now.grid_params},
                   "process": {k: meta.get(k) for k in
                               ("mode", "run", "params", "tiles", "job_id", "min", "max")},
                   "mesh": report, "exported_at": time.strftime("%Y-%m-%d %H:%M:%S")}
        (OUTPUT / f"{name}.json").write_text(
            json.dumps(sidecar, indent=1, ensure_ascii=False), encoding="utf-8")
        return jsonify(file=f"{name}.stl", folder="output", report=report)


@app.get("/api/download/<path:name>")
def download(name):
    return send_from_directory(OUTPUT, name, as_attachment=True)


# ── 页面 ────────────────────────────────────────────────────────────────

@app.get("/api/state")
def state():
    with S.lock:
        busy = running_job()
        return jsonify(model=model_info(), grid=grid_info(), processed=S.proc_meta, key=key_status(),
                       job=_job_view(busy) if busy else None)


@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


# Quantum Sculptor 界面（web/ 用 Vite 构建到 static/studio/）
@app.get("/studio/")
@app.get("/studio/<path:name>")
def studio(name="index.html"):
    if not (STATIC / "studio" / "index.html").exists():
        abort(404, "Build the interface first: cd web && pnpm install && pnpm build")
    path = STATIC / "studio" / name
    return send_from_directory(STATIC / "studio", name if path.is_file() else "index.html")


def main():
    global HOME, ATLAS_BASE, INPUT, GRIDS, OUTPUT
    p = argparse.ArgumentParser(description="Quantum Sculpting")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--open", action="store_true", help="启动后打开浏览器")
    p.add_argument("--home", help="存放 API key 的目录（默认 ~/.quantum-sculpting）")
    p.add_argument("--data", help="input/、grids/、output/ 所在的目录（默认是项目文件夹）")
    p.add_argument("--atlas-base", help="Atlas API 地址（测试时指向本地假服务）")
    args = p.parse_args()
    if args.home:
        HOME = Path(args.home)
    if args.data:
        INPUT, GRIDS, OUTPUT = (Path(args.data) / d for d in ("input", "grids", "output"))
    if args.atlas_base:
        ATLAS_BASE = args.atlas_base

    for d in (INPUT, GRIDS, OUTPUT):
        d.mkdir(parents=True, exist_ok=True)
    url = f"http://127.0.0.1:{args.port}"
    print(f"Quantum Sculpting is running at {url}  (Ctrl+C to stop)", flush=True)
    if args.open:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    app.run(host="127.0.0.1", port=args.port, threaded=True, debug=False)


if __name__ == "__main__":
    main()
