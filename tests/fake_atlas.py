"""本地假的 Atlas 服务。

没有 API key 时，用它把「提交 → 轮询 → 取结果」整条路径走一遍：接口路径、
认证方式、错误体的格式都照 https://api.mothquantum.com/openapi.json 写，
结果用本地模拟器算。它只接受下面这个测试用的 key。
"""
import sys
import threading
import uuid
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, request
from werkzeug.serving import make_server

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))
import emulator  # noqa: E402

TEST_KEY = "moth_test_key_for_local_fake_only"


def problem(status, title, detail):
    resp = jsonify(title=title, detail=detail, status=status)
    resp.status_code = status
    resp.mimetype = "application/problem+json"
    return resp


class FakeAtlas:
    def __init__(self, port=0):
        self.bare_result = False      # True：结果直接是嵌套列表；False：{"output": [...]}
        self.fail_jobs = False        # True：任务进入 failed
        self.polls_needed = 3         # 第几次查询状态时完成
        self.max_values = None        # 结果超过这么多个数就失败，模拟真实服务约 2 MB 的上限
        self.throttle = 0             # 接下来这么多次提交返回 429
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

    def _build(self):
        app = Flask("fake_atlas")

        @app.before_request
        def auth():
            if request.headers.get("Authorization") != f"Bearer {TEST_KEY}":
                return problem(401, "Unauthorized", "Invalid credentials or inactive account.")

        @app.get("/api/v1/me")
        def me():
            return jsonify(id="fake-account")

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
            self.jobs[job_id] = {"params": params, "values": values, "polls": 0}
            resp = jsonify(job_id=job_id, status="queued", submitted_at="2026-10-04T00:00:00Z")
            resp.status_code = 202
            return resp

        @app.get("/api/v1/jobs/<job_id>/status")
        def status(job_id):
            job = self.jobs.get(job_id)
            if job is None:
                return problem(404, "Not Found", "no such job")
            job["polls"] += 1
            body = {"job_id": job_id, "engine_id": "blur-core-v1",
                    "submitted_at": "2026-10-04T00:00:00Z", "updated_at": "2026-10-04T00:00:01Z"}
            if job["polls"] < self.polls_needed:
                body["status"] = "queued" if job["polls"] == 1 else "running"
            elif self.max_values and job["values"].size > self.max_values:
                body["status"] = "failed"       # 真实服务就是这样：先接受任务，交结果时才失败
                body["error"] = {"type": "ApplicationError", "retryable": False, "message":
                                 "[TMPRL1103] Attempted to upload payloads with size that exceeded the error limit."}
            elif self.fail_jobs:
                body["status"] = "failed"
                body["error"] = {"type": "engine_error", "message": "simulated failure", "retryable": False}
            else:
                body["status"] = "completed"
            return jsonify(body)

        @app.get("/api/v1/jobs/<job_id>/result")
        def result(job_id):
            job = self.jobs.get(job_id)
            if job is None:
                return problem(404, "Not Found", "no such job")
            p = job["params"]
            out = emulator.quantum_blur(job["values"], strength=p.get("strength", 0.5),
                                        style=p.get("style", "x"), reach=p.get("reach", 0.0),
                                        axes=p.get("axes"), shots=p.get("shots"), seed=0)
            nested = np.round(out.astype(np.float64), 6).tolist()
            return jsonify(result=nested if self.bare_result else {"output": nested}, outputs=None)

        return app
