"""本地假的 Atlas 服务。

没有 API key 时，用它把「提交 → 轮询 → 取结果」整条路径走一遍：接口路径、
认证方式、错误体的格式都照 https://api.mothquantum.com/openapi.json 写，
结果用本地模拟器算。它只接受下面这个测试用的 key。
"""
import sys
import threading
import time
import uuid
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, request
from werkzeug.serving import make_server

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))
import emulator  # noqa: E402

TEST_KEY = "moth_test_key_for_local_fake_only"
ACCOUNT = "fake-account"
TOO_LARGE = "[TMPRL1103] Attempted to upload payloads with size that exceeded the error limit."


def problem(status, title, detail):
    resp = jsonify(title=title, detail=detail, status=status)
    resp.status_code = status
    resp.mimetype = "application/problem+json"
    return resp


def stamp(seconds):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(seconds))


class FakeAtlas:
    def __init__(self, port=0):
        self.bare_result = False      # True：结果直接是嵌套列表；False：{"output": [...]}
        self.fail_jobs = False        # True：任务进入 failed
        self.polls_needed = 3         # 第几次查询状态时完成
        self.max_values = None        # 结果超过这么多个数就失败，模拟真实服务约 2 MB 的上限
        self.throttle = 0             # 接下来这么多次提交返回 429
        self.stale_list = False       # True：任务列表里的状态停在 queued，模拟列表比实时状态慢
        self.submits = 0
        self.jobs = {}
        self.app = self._build()
        self.server = make_server("127.0.0.1", port, self.app, threaded=True)
        self.base = f"http://127.0.0.1:{self.server.server_port}/api/v1"

    def start(self):
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self

    def stop(self):
        self.server.shutdown()

    def add_job(self, engine_id="blur-core-v1", status="completed", age=3600, owner=ACCOUNT, error=None):
        """放一个不是本应用提交的任务（比如在 Atlas 网页上跑的），age 秒之前提交。"""
        job_id = str(uuid.uuid4())
        created = time.time() - age
        self.jobs[job_id] = {"params": None, "values": None, "polls": 0, "engine_id": engine_id,
                             "owner": owner, "status": status, "error": error,
                             "created": created, "updated": created + 6}
        return job_id

    def _build(self):
        app = Flask("fake_atlas")

        @app.before_request
        def auth():
            if request.headers.get("Authorization") != f"Bearer {TEST_KEY}":
                return problem(401, "Unauthorized", "Invalid credentials or inactive account.")

        @app.get("/api/v1/me")
        def me():
            return jsonify(id=ACCOUNT)

        @app.post("/api/v1/engines/blur-core-v1/process")
        def submit():
            params = (request.get_json(silent=True) or {}).get("params") or {}
            try:
                values = np.asarray(params["values"], dtype=np.float64)
            except (KeyError, ValueError, TypeError):
                return problem(422, "invalid_values", "`values` was not a rectangular nested list.")
            if values.min() < 0:
                return problem(422, "invalid_values", "`values` has a negative value.")
            qubits = sum(int(np.ceil(np.log2(s))) for s in values.shape if s > 1)
            if qubits > params.get("max_qubits", 20):
                return problem(422, "too_many_qubits",
                               "The shape of `values` requires more qubits than `max_qubits` allows.")
            if self.throttle > 0:
                self.throttle -= 1
                return problem(429, "Too Many Requests", "slow down")
            self.submits += 1
            job_id = str(uuid.uuid4())
            now = time.time()
            self.jobs[job_id] = {"params": params, "values": values, "polls": 0,
                                 "engine_id": "blur-core-v1", "owner": ACCOUNT, "status": "queued",
                                 "error": None, "created": now, "updated": now}
            resp = jsonify(job_id=job_id, status="queued", submitted_at=stamp(now))
            resp.status_code = 202
            return resp

        @app.get("/api/v1/jobs")
        def list_jobs():
            """新的在前；cursor 就是下一页从第几个开始。"""
            limit = min(max(request.args.get("limit", 50, type=int), 1), 200)
            start = request.args.get("cursor", 0, type=int)
            order = sorted(self.jobs.items(), key=lambda kv: kv[1]["created"], reverse=True)
            page = [{"job_id": job_id, "engine_id": job["engine_id"], "owner": job["owner"],
                     "status": "queued" if self.stale_list and job["values"] is not None else job["status"],
                     "gated_features": [], "created_at": stamp(job["created"]),
                     "updated_at": stamp(job["updated"])}
                    for job_id, job in order[start:start + limit]]
            body = {"jobs": page, "count": len(page)}
            if start + limit < len(order):
                body["next_cursor"] = str(start + limit)
            return jsonify(body)

        @app.get("/api/v1/jobs/<job_id>/status")
        def status(job_id):
            job = self.jobs.get(job_id)
            if job is None:
                return problem(404, "Not Found", "no such job")
            if job["values"] is None:                 # add_job() 放进来的：状态是定好的
                body = {"job_id": job_id, "engine_id": job["engine_id"], "status": job["status"],
                        "submitted_at": stamp(job["created"]), "updated_at": stamp(job["updated"])}
                if job["error"]:
                    body["error"] = {"type": "internal_error", "retryable": True, "message": job["error"]}
                return jsonify(body)
            job["polls"] += 1
            job["updated"] = time.time()
            body = {"job_id": job_id, "engine_id": "blur-core-v1",
                    "submitted_at": stamp(job["created"]), "updated_at": stamp(job["updated"])}
            if job["polls"] < self.polls_needed:
                body["status"] = "queued" if job["polls"] == 1 else "running"
                # 真实服务运行中的 step 叫什么没有见过，这里的名字是编的
                body["progress"] = {"step": "simulate", "detail": "Simulating the circuit"}
            elif self.max_values and job["values"].size > self.max_values:
                body["status"] = "failed"       # 真实服务就是这样：先接受任务，交结果时才失败
                body["error"] = {"type": "ApplicationError", "retryable": False, "message": TOO_LARGE}
            elif self.fail_jobs:
                body["status"] = "failed"
                body["error"] = {"type": "engine_error", "message": "simulated failure", "retryable": False}
            else:
                body["status"] = "completed"
                qubits = int(np.log2(job["values"].size))
                body["progress"] = {"step": "done", "detail": f"Recovered {qubits}-qubit grid from measurement"}
            job["status"] = body["status"]
            job["error"] = (body.get("error") or {}).get("message")
            return jsonify(body)

        @app.get("/api/v1/jobs/<job_id>/result")
        def result(job_id):
            job = self.jobs.get(job_id)
            if job is None or job["values"] is None:
                return problem(404, "Not Found", "no such job")
            p = job["params"]
            out = emulator.quantum_blur(job["values"], strength=p.get("strength", 0.5),
                                        style=p.get("style", "x"), reach=p.get("reach", 0.0),
                                        axes=p.get("axes"), shots=p.get("shots"), seed=0)
            nested = np.round(out.astype(np.float64), 6).tolist()
            return jsonify(result=nested if self.bare_result else {"output": nested}, outputs=None)

        return app
