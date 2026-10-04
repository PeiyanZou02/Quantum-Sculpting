"""Moth Atlas 上 Quantum Blur Core（blur-core-v1）的客户端。

接口取自官方 OpenAPI 文档 https://api.mothquantum.com/openapi.json ：
  POST /engines/blur-core-v1/process  {"params": {...}} → 202 {"job_id", "status", "submitted_at"}
  GET  /jobs/{job_id}/status          → {"status", "error", ...}
  GET  /jobs/{job_id}/result          → {"result": ...}
  GET  /me                            → 当前账户（用来检查 key）
认证：Authorization: Bearer <moth_ API key>
"""
import time

import numpy as np
import requests

DEFAULT_BASE = "https://api.mothquantum.com/api/v1"
ENGINE = "blur-core-v1"

# API 前面的 Cloudflare 会拒绝部分默认 UA，这里如实标明自己
USER_AGENT = "quantum-sculpting-prototype/0.1 (python-requests)"

RETRY_SCALE = 1.0       # 测试里调小，免得真的等

DONE = {"completed", "succeeded", "success"}
FAILED = {"failed", "cancelled", "canceled"}

_HINTS = {
    401: "API key 无效，或账户未激活。",
    403: "这个 key 没有权限使用该引擎。",
    429: "请求太频繁，稍等一会儿再试。",
    503: "Atlas 暂时不可用，稍后重试。",
}


class AtlasError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status          # HTTP 状态码；不是 HTTP 错误时为 None


class PayloadTooLarge(AtlasError):
    """任务的数据超过了 Atlas 单个任务约 2 MB 的上限（错误码 TMPRL1103）。"""


def is_payload_error(detail):
    text = str(detail or "").lower()
    return "tmprl1103" in text or ("payload" in text and "size" in text)


class Atlas:
    def __init__(self, key, base=None):
        key = (key or "").strip()
        if not key:
            raise AtlasError("还没有设置 Atlas API key。")
        self.base = (base or DEFAULT_BASE).rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        }

    def _request(self, method, path, body=None, timeout=120):
        for attempt in range(6):
            try:
                r = requests.request(method, self.base + path, json=body,
                                     headers=self._headers, timeout=timeout)
            except requests.RequestException as e:
                raise AtlasError(f"连不上 Atlas（{type(e).__name__}）。检查网络后重试。") from e
            if r.status_code != 429 or attempt == 5:
                break
            # 分块时会连续提交很多任务，被限流就按服务端要求（或逐次加倍）等一会儿
            wait = r.headers.get("Retry-After", "")
            time.sleep(min(float(wait) if wait.isdigit() else 2.0 * 2 ** attempt, 60.0) * RETRY_SCALE)
        if r.status_code >= 400:
            raise AtlasError(_describe_error(r), status=r.status_code)
        try:
            return r.json()
        except ValueError as e:
            raise AtlasError(f"Atlas 返回的不是 JSON（HTTP {r.status_code}）。") from e

    def me(self):
        return self._request("GET", "/me")

    def submit(self, params):
        return self._request("POST", f"/engines/{ENGINE}/process", {"params": params})

    def status(self, job_id):
        return self._request("GET", f"/jobs/{job_id}/status")

    def result(self, job_id):
        return self._request("GET", f"/jobs/{job_id}/result", timeout=300)


def _describe_error(r):
    """错误体是 application/problem+json：{"title", "detail", ...}。"""
    title = detail = ""
    try:
        body = r.json()
        title, detail = str(body.get("title") or ""), str(body.get("detail") or "")
    except ValueError:
        detail = r.text[:300]
    hint = _HINTS.get(r.status_code, "")
    extra = "：".join(p for p in (title, detail) if p)
    return f"Atlas 返回 HTTP {r.status_code}。{hint}{extra}".strip()


def build_params(grid, strength=0.5, style="x", reach=0.0, axes=None, shots=None):
    """把三维数组和参数整理成 blur-core-v1 的 params。"""
    grid = np.asarray(grid)
    if np.array_equal(grid, grid.astype(np.int64)):
        values = grid.astype(np.int64).tolist()         # 0/1 网格发整数，请求体小很多
    else:
        values = np.round(grid.astype(np.float64), 5).tolist()
    params = {"values": values, "strength": float(strength), "style": style, "reach": float(reach)}
    if axes is not None:
        params["axes"] = [int(a) for a in axes]
    if shots:
        params["shots"] = int(shots)
    return params


def extract_grid(body, shape):
    """从 /result 的响应里取出和输入同形状的数组。

    文档说结果是「和输入同形状的嵌套列表」，实际观察到的是 {"output": [...]}，两种都接受。
    """
    result = body.get("result") if isinstance(body, dict) else body
    if isinstance(result, dict):
        for name in ("output", "values", "result", "data"):
            if isinstance(result.get(name), list):
                result = result[name]
                break
        else:
            lists = [v for v in result.values() if isinstance(v, list)]
            if len(lists) != 1:
                raise AtlasError(f"看不懂 Atlas 的返回结构，字段有：{sorted(result)}")
            result = lists[0]
    if not isinstance(result, list):
        raise AtlasError("Atlas 的结果里没有数组。")
    try:
        arr = np.asarray(result, dtype=np.float32)
    except (ValueError, TypeError) as e:
        raise AtlasError("Atlas 返回的数组不是规则的数值网格。") from e
    if arr.size != int(np.prod(shape)):
        raise AtlasError(f"Atlas 返回了 {arr.size} 个数，和输入的 {int(np.prod(shape))} 个对不上。")
    return arr.reshape(shape)
