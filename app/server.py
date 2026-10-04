"""量子杯子的本地应用：一个只监听 127.0.0.1 的 Flask 服务 + static/ 里的界面。

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
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from flask import Flask, Response, abort, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

import atlas
import emulator
import pipeline

ROOT = Path(__file__).resolve().parent.parent
STATIC = Path(__file__).resolve().parent / "static"
INPUT, GRIDS, OUTPUT = ROOT / "input", ROOT / "grids", ROOT / "output"

MODEL_TYPES = {".stl", ".obj", ".ply", ".glb", ".off"}
GRID_SIZES = (16, 32, 64)
MODES = ("gaussian", "emulator", "atlas")
ATLAS_TIMEOUT = 15 * 60
ATLAS_POLL = 2.0

# main() 可以改写：key 存放的目录（在 OneDrive 之外）和 Atlas 地址
HOME = Path(os.environ.get("QCUP_HOME") or Path.home() / ".quantum-cup")
ATLAS_BASE = os.environ.get("ATLAS_API_BASE") or atlas.DEFAULT_BASE

app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


class State:
    def __init__(self):
        self.lock = threading.RLock()
        self.raw_mesh = self.mesh = None
        self.name, self.up, self.model_id = None, "+z", 0
        self.grid = self.scale = self.transform = None
        self.grid_params, self.grid_id = None, 0
        self.processed = None
        self.proc_meta, self.proc_id = None, 0
        self.jobs = {}


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


# ── 第一步：模型 ─────────────────────────────────────────────────────────

def set_model(mesh, name, up="+z"):
    with S.lock:
        S.raw_mesh, S.name, S.up = mesh, name, up
        S.mesh = pipeline.orient(mesh, up)
        S.model_id += 1
        S.grid = S.processed = S.proc_meta = None


def model_info():
    if S.mesh is None:
        return None
    return {"name": S.name, "up": S.up, "model_id": S.model_id, **pipeline.mesh_stats(S.mesh)}


@app.post("/api/model/test-cup")
def use_test_cup():
    cup = pipeline.make_test_cup()
    INPUT.mkdir(exist_ok=True)
    cup.export(INPUT / "test_cup.stl")
    set_model(cup, "test_cup")
    return jsonify(model_info())


@app.post("/api/model/upload")
def upload_model():
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
    try:
        mesh = pipeline.load_mesh(dest)
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"读不了 {f.filename}，文件可能损坏或不是网格模型。（{type(e).__name__}）") from e
    up = request.form.get("up", "+z")
    set_model(mesh, stem, up if up in pipeline.UP_AXES else "+z")
    return jsonify(model_info())


@app.post("/api/model/orient")
def orient_model():
    up = body().get("up", "+z")
    with S.lock:
        if S.raw_mesh is None:
            raise ValueError("还没有模型。")
        set_model(S.raw_mesh, S.name, up)
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
    return {"grid_id": S.grid_id, "n": n, "solid": int(S.grid.sum()), "total": int(S.grid.size),
            "qubits": pipeline.qubits_for(S.grid.shape), "transform": S.transform.tolist(),
            "voxel_size": pipeline.sig(1.0 / S.scale), **S.grid_params}


@app.post("/api/voxelize")
def voxelize():
    b = body()
    n = int(b.get("n", 32))
    if n not in GRID_SIZES:
        raise ValueError(f"网格尺寸只能是 {GRID_SIZES} 之一。")
    pad = int(clamp(b.get("pad", 2), 0, n // 2 - 2, 2))
    fill = bool(b.get("fill", True))
    with S.lock:
        if S.mesh is None:
            raise ValueError("先选择一个模型。")
        grid, scale, transform = pipeline.mesh_to_grid(S.mesh, n=n, pad=pad, fill=fill)
        if grid.sum() == 0:
            raise ValueError("体素化后没有任何实体格子，模型可能是空的。")
        S.grid, S.scale, S.transform = grid, scale, transform
        S.grid_params = {"pad": pad, "fill": fill}
        S.grid_id += 1
        S.processed = S.proc_meta = None
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
        return binary(np.ascontiguousarray(arr, dtype="<f4").tobytes(), meta)


# ── 第三步：量子处理 ──────────────────────────────────────────────────────

def read_process_request(b):
    mode = b.get("mode", "emulator")
    if mode not in MODES:
        raise ValueError(f"未知的模式 {mode}")
    run = re.sub(r"[^\w\-]+", "_", str(b.get("run") or "run1")).strip("_")[:40] or "run1"
    if mode == "gaussian":
        return mode, run, {"sigma": clamp(b.get("sigma"), 0.2, 6.0, 1.0)}
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
    }


def apply_processed(raw, meta):
    """调用方必须已经持有 S.lock。"""
    S.processed = pipeline.normalize(raw, float(S.grid.sum()))
    S.proc_id += 1
    S.proc_meta = {**meta, "proc_id": S.proc_id, "grid_id": S.grid_id,
                   "min": round(float(raw.min()), 5), "max": round(float(raw.max()), 5)}
    return S.proc_meta


@app.post("/api/process")
def process():
    mode, run, params = read_process_request(body())
    with S.lock:
        if S.grid is None:
            raise ValueError("先完成体素化。")
        grid, grid_id = S.grid, S.grid_id
        meta = {"mode": mode, "run": run, "params": params, "cached": False, "job_id": None}

        if mode != "atlas":
            t0 = time.time()
            if mode == "gaussian":
                raw = emulator.mock_blur(grid, **params)
            else:
                seed = int(hashlib.sha256(run.encode()).hexdigest()[:8], 16)
                raw = emulator.quantum_blur(grid, seed=seed, **params)
            meta["seconds"] = round(time.time() - t0, 3)
            return jsonify(status="done", meta=apply_processed(raw, meta))

        key, _ = load_key()
        if not key:
            raise ValueError("还没有设置 Atlas API key。点右上角的「设置 API key」。")
        # 地址也算进缓存键：指向测试服务时得到的结果，不会被当成正式服务的结果读出来
        digest = hashlib.sha256(
            grid.tobytes() + json.dumps([params, run, ATLAS_BASE], sort_keys=True).encode())
        stem = GRIDS / f"atlas_{digest.hexdigest()[:16]}"
        record = _read_record(stem)
        if record.get("finished") and stem.with_suffix(".npy").exists():
            raw = np.load(stem.with_suffix(".npy"))
            meta.update(cached=True, job_id=record.get("job_id"), seconds=record.get("seconds"))
            return jsonify(status="done", meta=apply_processed(raw, meta))

        job = {"id": uuid.uuid4().hex[:12], "status": "running", "atlas_status": "submitting",
               "started": time.time(), "error": None, "meta": None, "stale": False}
        S.jobs[job["id"]] = job
        threading.Thread(target=_run_atlas_job, daemon=True,
                         args=(job, grid, grid_id, params, meta, key, stem)).start()
        return jsonify(_job_view(job))


def _read_record(stem):
    try:
        return json.loads(stem.with_suffix(".json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _run_atlas_job(job, grid, grid_id, params, meta, key, stem):
    """提交 → 轮询 → 取结果。任务号先落盘，中途断了下次同参数会接着等，不会重复提交。"""
    record_file = stem.with_suffix(".json")
    try:
        GRIDS.mkdir(exist_ok=True)
        client = atlas.Atlas(key, ATLAS_BASE)
        record = _read_record(stem)
        resumed = bool(record.get("job_id"))
        if not resumed:
            accepted = client.submit(atlas.build_params(grid, **params))
            record = {"engine": atlas.ENGINE, "job_id": accepted["job_id"],
                      "submitted_at": accepted.get("submitted_at"), "params": params,
                      "run": meta["run"], "n": int(grid.shape[0])}
            record_file.write_text(json.dumps(record, indent=1), encoding="utf-8")
        job_id = record["job_id"]
        meta["job_id"] = job_id

        deadline = job["started"] + ATLAS_TIMEOUT
        while True:
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
            if state in atlas.DONE:
                break
            if state in atlas.FAILED:
                record_file.replace(stem.with_suffix(".failed.json"))   # 留作记录，但下次重新提交
                err = status.get("error")
                detail = err.get("message") if isinstance(err, dict) else err
                raise atlas.AtlasError(f"Atlas 任务 {state}：{detail or '没有给出原因'}")
            if time.time() > deadline:
                raise atlas.AtlasError(
                    f"等了 {ATLAS_TIMEOUT // 60} 分钟任务还是 {state}。任务号已保存，稍后用同样的参数再运行会接着等。")
            time.sleep(ATLAS_POLL)

        raw = atlas.extract_grid(client.result(job_id), grid.shape)
        seconds = round(time.time() - job["started"], 1)
        np.save(stem.with_suffix(".npy"), raw)
        record.update(finished=True, seconds=seconds)
        record_file.write_text(json.dumps(record, indent=1), encoding="utf-8")
        meta["seconds"] = seconds
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


def _job_view(job):
    return {"job_id": job["id"], "status": job["status"], "atlas_status": job["atlas_status"],
            "elapsed": round(time.time() - job["started"], 1), "error": job["error"],
            "meta": job["meta"], "stale": job["stale"]}


@app.get("/api/process/<job_id>")
def job_status(job_id):
    job = S.jobs.get(job_id)
    if job is None:
        abort(404)
    return jsonify(_job_view(job))


# ── 第四、五步：转回模型、打印检查、导出 ──────────────────────────────────────

def build_mesh(b):
    """调用方必须已经持有 S.lock。返回 (网格坐标里的模型, 毫米模型, 报告)。"""
    if S.processed is None:
        raise ValueError("先运行量子处理。")
    level = clamp(b.get("level"), 0.01, 0.99, 0.5)
    keep = "all" if b.get("keep") == "all" else "largest"
    smooth = int(clamp(b.get("smooth"), 0, 50, 0))
    height = clamp(b.get("height"), 5.0, 1000.0, 90.0)
    mesh, total = pipeline.grid_to_mesh(S.processed, level=level, keep=keep, smooth=smooth)
    printed, report = pipeline.prepare_for_print(mesh, S.scale, height)
    report.update(total_parts=total, level=level, keep=keep, smooth=smooth, height=height,
                  proc_id=S.proc_id)
    return mesh, printed, report


@app.post("/api/mesh")
def mesh_preview():
    with S.lock:
        mesh, _, report = build_mesh(body())
        return binary(mesh_bytes(mesh), report)


@app.post("/api/export")
def export():
    with S.lock:
        _, printed, report = build_mesh(body())
        meta = S.proc_meta
        n = S.grid.shape[0]
        name = f"{meta['run']}_{meta['mode']}_n{n}_L{int(round(report['level'] * 100)):03d}"
        OUTPUT.mkdir(exist_ok=True)
        printed.export(OUTPUT / f"{name}.stl")
        # 同名 .json 记下这次用的全部参数，方便复现和提交作品时说明流程
        sidecar = {"model": S.name, "up": S.up, "grid": {"n": n, **S.grid_params},
                   "process": {k: meta[k] for k in ("mode", "run", "params", "job_id", "min", "max")},
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
        return jsonify(model=model_info(), grid=grid_info(), processed=S.proc_meta, key=key_status())


@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


def main():
    global HOME, ATLAS_BASE, INPUT, GRIDS, OUTPUT
    p = argparse.ArgumentParser(description="量子杯子")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--open", action="store_true", help="启动后打开浏览器")
    p.add_argument("--home", help="存放 API key 的目录（默认 ~/.quantum-cup）")
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
    print(f"Quantum cup is running at {url}  (Ctrl+C to stop)", flush=True)
    if args.open:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    app.run(host="127.0.0.1", port=args.port, threaded=True, debug=False)


if __name__ == "__main__":
    main()
