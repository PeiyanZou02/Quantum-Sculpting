"""Moth's Entanglement Shader (entanglement-shader-v1) for the viewer's interference display mode.

The engine returns a zip with two Radiance .hdr lookup tables, reflectance R_lut.hdr and
transmission T_lut.hdr, plus a GLSL reference shader. Runs are cached under
<grids>/shaders/<job_id>/ (R_lut.hdr, T_lut.hdr, meta.json) so a finished run never costs a
second call.

  GET  /api/shader/live               cached runs that have both tables
  POST /api/shader/run {params}       submit a run → {job_id, params}
  GET  /api/shader/<job_id>           poll once; on completion download and extract → {status, ready, files}
  GET  /api/shader/<job_id>/<name>    one cached table

server.py wires it up with configure(load_key, base_getter, root_dir) and registers `bp`;
this module does not import server.py.
"""
import io
import json
import re
import threading
import time
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import requests
from flask import Blueprint, jsonify, request, send_from_directory

ENGINE = "entanglement-shader-v1"
DEFAULT_BASE = "https://api.mothquantum.com/api/v1"
USER_AGENT = "quantum-sculpting-prototype/0.1 (python-requests)"

STYLES = ("peaked", "frustrated", "3-body", "constrained")
DEFAULTS = {"style": "peaked", "layers": 3, "reflectance": 0.35, "absorption": 0.8,
            "incoming_rays": 6, "interaction": 1.0, "resolution": 48}
TABLES = ("R_lut.hdr", "T_lut.hdr")
DONE = {"completed", "succeeded", "success"}
FAILED = {"failed", "cancelled", "canceled"}
MAX_ZIP = 20 * 1024 * 1024
JOB_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{5,79}$")

bp = Blueprint("shaders", __name__)
_cfg = {"load_key": lambda: "", "base": lambda: DEFAULT_BASE, "root": None}
_download_lock = threading.Lock()


class MothError(RuntimeError):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def configure(load_key, base_getter, root_dir):
    """load_key() → key or (key, source); base_getter() → API base URL;
    root_dir: the grids/ directory, or a callable returning it (server.main() may move it)."""
    _cfg["load_key"] = load_key
    _cfg["base"] = base_getter if callable(base_getter) else (lambda: base_getter)
    _cfg["root"] = root_dir


def _shader_dir():
    root = _cfg["root"]
    root = root() if callable(root) else root
    if root is None:
        raise MothError("The shader service is not configured.", 500)
    return Path(root) / "shaders"


def _key():
    key = _cfg["load_key"]()
    if isinstance(key, tuple):
        key = key[0]
    key = (key or "").strip()
    if not key:
        raise MothError("No Moth API key is set. Add one in Settings first.", 400)
    return key


# ── params ─────────────────────────────────────────────────────────────

def _number(params, name, lo, hi, integer=False):
    raw = params.get(name, DEFAULTS[name])
    if isinstance(raw, bool):
        raise ValueError(f"{name} must be a number.")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number.") from None
    if value != value:                                  # NaN
        raise ValueError(f"{name} must be a number.")
    value = min(max(value, lo), hi)
    return int(round(value)) if integer else round(value, 4)


def max_rays(layers):
    # A real run used 8 rays through 2 layers; the engine's true limit is a qubit budget it
    # enforces itself, so only guard against absurd values here and let Moth reject the rest.
    return 16


def validate_params(params):
    """Check and clamp shader params. Unknown style or non-numbers raise ValueError; ranges are clamped."""
    if not isinstance(params, dict):
        raise ValueError("params must be an object.")
    style = str(params.get("style", DEFAULTS["style"])).strip().lower()
    if style not in STYLES:
        raise ValueError(f"Unknown style '{style}'. Use one of: {', '.join(STYLES)}.")
    layers = _number(params, "layers", 1, 9, integer=True)
    return {
        "style": style,
        "layers": layers,
        "reflectance": _number(params, "reflectance", 0.0, 1.0),
        "absorption": _number(params, "absorption", 0.0, 1.0),
        "incoming_rays": _number(params, "incoming_rays", 1, max_rays(layers), integer=True),
        "interaction": _number(params, "interaction", -2.0, 2.0),
        "resolution": _number(params, "resolution", 8, 64, integer=True),
    }


# ── Moth API ───────────────────────────────────────────────────────────

def _describe(r):
    try:
        body = r.json()
        detail = ": ".join(str(body.get(k)) for k in ("title", "detail") if body.get(k))
    except ValueError:
        detail = r.text[:300]
    hints = {401: "The API key is invalid or the account is not active. ",
             403: "This key may not use the Entanglement Shader. ",
             429: "Too many requests; wait a moment and try again. ",
             503: "Moth is temporarily unavailable. "}
    return f"Moth returned HTTP {r.status_code}. {hints.get(r.status_code, '')}{detail}".strip()


def _api(method, path, body=None, timeout=60):
    url = _cfg["base"]().rstrip("/") + path
    headers = {"Authorization": f"Bearer {_key()}", "Accept": "application/json", "User-Agent": USER_AGENT}
    try:
        r = requests.request(method, url, json=body, headers=headers, timeout=timeout)
    except requests.RequestException as e:
        raise MothError(f"Could not reach Moth ({type(e).__name__}). Check the network and try again.") from e
    if r.status_code >= 400:
        raise MothError(_describe(r), 502 if r.status_code >= 500 or r.status_code == 401 else r.status_code)
    try:
        return r.json()
    except ValueError as e:
        raise MothError(f"Moth returned something other than JSON (HTTP {r.status_code}).") from e


def _asset_url_ok(url):
    """Result zips live behind presigned storage URLs; only follow Moth's own hosts."""
    u = urlparse(str(url or ""))
    host = (u.hostname or "").lower()
    return u.scheme == "https" and (
        bool(re.fullmatch(r"moth-api-assets[\w.-]*\.amazonaws\.com", host))
        or host == "mothquantum.com" or host.endswith(".mothquantum.com"))


def _download(url):
    if not _asset_url_ok(url):
        raise MothError("Refused to download the result: it is not a Moth asset URL.")
    try:
        # presigned URL: no Authorization header (the key must not go to the storage host)
        r = requests.get(url, timeout=120, headers={"User-Agent": USER_AGENT})
    except requests.RequestException as e:
        raise MothError(f"Could not download the result ({type(e).__name__}).") from e
    if r.status_code >= 400:
        raise MothError(f"Downloading the result failed (HTTP {r.status_code}).")
    data = r.content
    if len(data) > MAX_ZIP:
        raise MothError("The result zip is unexpectedly large; not extracting it.")
    return data


def _extract(data, dest):
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise MothError("The result is not a valid zip file.") from e
    found = {}
    with zf:
        for info in zf.infolist():
            name = Path(info.filename).name                     # ignore folders inside the zip
            if name in TABLES + ("entanglement_texture.glsl",) and info.file_size <= MAX_ZIP:
                found[name] = zf.read(info)
    missing = [t for t in TABLES if t not in found]
    if missing:
        raise MothError(f"The result zip has no {', '.join(missing)}.")
    for t in TABLES:
        if not found[t].startswith(b"#?"):
            raise MothError(f"{t} in the result is not a Radiance .hdr file.")
    dest.mkdir(parents=True, exist_ok=True)
    for name, blob in found.items():
        tmp = dest / (name + ".part")
        tmp.write_bytes(blob)
        tmp.replace(dest / name)
    return sorted(found)


# ── cache ──────────────────────────────────────────────────────────────

def _job_dir(job_id):
    if not JOB_ID.match(job_id or ""):
        raise MothError("That is not a valid job id.", 400)
    return _shader_dir() / job_id


def _read_meta(d):
    try:
        return json.loads((d / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_meta(d, meta):
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "meta.json.part"
    tmp.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    tmp.replace(d / "meta.json")


def _ready(d):
    return all((d / t).is_file() for t in TABLES)


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ── routes ─────────────────────────────────────────────────────────────

@bp.errorhandler(MothError)
def _moth_failed(e):
    return jsonify(error=str(e)), e.status


@bp.errorhandler(ValueError)
def _bad_params(e):
    return jsonify(error=str(e)), 400


@bp.get("/api/shader/live")
def live():
    root = _shader_dir()
    runs = []
    if root.is_dir():
        for d in root.iterdir():
            meta = _read_meta(d) if d.is_dir() else None
            if meta and _ready(d):
                runs.append({k: meta.get(k) for k in ("job_id", "engine", "params", "submitted_at",
                                                        "completed_at", "seconds", "files")})
    runs.sort(key=lambda m: str(m.get("completed_at") or ""), reverse=True)
    return jsonify(runs=runs)


@bp.post("/api/shader/run")
def run():
    body = request.get_json(silent=True) or {}
    params = validate_params(body.get("params", body) if isinstance(body, dict) else body)
    job = _api("POST", f"/engines/{ENGINE}/process", {"params": params})
    job_id = str(job.get("job_id") or "")
    d = _job_dir(job_id)
    _write_meta(d, {"job_id": job_id, "engine": ENGINE, "params": params, "status": job.get("status", "queued"),
                    "submitted_at": _now(), "t0": time.time()})
    return jsonify(job_id=job_id, params=params)


@bp.get("/api/shader/<job_id>")
def poll(job_id):
    d = _job_dir(job_id)
    meta = _read_meta(d)
    if meta is None:
        raise MothError("This app has no record of that shader job.", 404)
    if _ready(d):
        return jsonify(status="completed", ready=True, files=list(TABLES), params=meta.get("params"))
    st = _api("GET", f"/jobs/{job_id}/status", timeout=30)
    status = str(st.get("status") or "unknown").lower()
    if status in FAILED:
        err = st.get("error") or {}
        message = err.get("message") if isinstance(err, dict) else str(err)
        meta.update(status=status, error=message)
        _write_meta(d, meta)
        return jsonify(status=status, ready=False, files=[], error=message or f"The job {status}.")
    if status not in DONE:
        if meta.get("status") != status:
            meta["status"] = status
            _write_meta(d, meta)
        return jsonify(status=status, ready=False, files=[], progress=st.get("progress"))
    with _download_lock:
        if not _ready(d):                                   # another poll may have fetched it meanwhile
            res = _api("GET", f"/jobs/{job_id}/result", timeout=120)
            outputs = res.get("outputs") or []
            out = next((o for o in outputs if o.get("slot") == "result"), outputs[0] if outputs else None)
            if not out or not out.get("url"):
                raise MothError("The finished job has no result file.")
            files = _extract(_download(out["url"]), d)
            t0 = meta.pop("t0", None)
            meta.update(status="completed", completed_at=_now(), files=files,
                        output_asset_id=out.get("output_asset_id"), size_bytes=out.get("size_bytes"),
                        seconds=round(time.time() - t0, 1) if t0 else None)
            _write_meta(d, meta)
    return jsonify(status="completed", ready=True, files=list(TABLES), params=meta.get("params"))


@bp.get("/api/shader/<job_id>/<name>")
def table(job_id, name):
    if name not in TABLES:
        raise MothError("Only R_lut.hdr and T_lut.hdr can be fetched.", 404)
    d = _job_dir(job_id)
    if not (d / name).is_file():
        raise MothError("That table is not cached yet.", 404)
    resp = send_from_directory(d, name, mimetype="application/octet-stream")
    resp.headers["Cache-Control"] = "no-store"
    return resp
