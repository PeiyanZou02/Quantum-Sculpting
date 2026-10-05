"""本地假的 Atlas 服务。

没有 API key 时，用它把「提交 → 轮询 → 取结果」整条路径走一遍：接口路径、
认证方式、错误体的格式都照 https://api.mothquantum.com/openapi.json 写，
结果用本地模拟器算。它只接受下面这个测试用的 key。

comet-qrng-v1（量子随机数）的返回结构照 2026-10-05 在真实服务上见到的写（比它在 OpenAPI 里的说明
多了 entropy_report，少了 certificate），数值是编的。
"""
import os
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
        self.qrng_bytes = None        # comet-qrng 最多给这么多字节，模拟「能提取的熵不够」；None：要多少给多少
        self.gate_qpu = False         # True：账户没有在真芯片上跑的权限，mode=qpu 会被拒绝
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

        @app.post("/api/v1/engines/comet-qrng-v1/process")
        def submit_qrng():
            body = request.get_json(silent=True) or {}
            params = body.get("params") or {}
            if body.get("mode") and "mode" in params:
                return problem(422, "Unprocessable Entity", "Set mode at the top level or in params, never both.")
            mode = body.get("mode") or params.get("mode", "emu")
            if mode == "qpu" and self.gate_qpu:
                return problem(403, "Forbidden", "mode=qpu requires the run_quantum feature.")
            qubits, shots = params.get("num_qubits", 12), params.get("shots", 4096)
            want = params.get("output_bytes", 32)
            witness = 8 if params.get("bell_witness", True) else 0
            if (mode not in ("emu", "qpu") or not 1 <= qubits <= 256 or not 0 < shots <= 10000
                    or not 1 <= want <= 1_000_000 or (mode == "emu" and qubits + witness > 20)):
                return problem(422, "invalid_params", "One or more params fields failed validation.")
            self.submits += 1
            job_id = str(uuid.uuid4())
            now = time.time()
            given = os.urandom(want if self.qrng_bytes is None else min(want, self.qrng_bytes))
            self.jobs[job_id] = {"params": params, "values": None, "qrng": {"mode": mode, "bytes": given},
                                 "polls": 0, "engine_id": "comet-qrng-v1", "owner": ACCOUNT,
                                 "status": "queued", "error": None, "created": now, "updated": now}
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
                     "status": "queued" if self.stale_list and job["params"] is not None else job["status"],
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
            if job["params"] is None:                 # add_job() 放进来的：状态是定好的
                body = {"job_id": job_id, "engine_id": job["engine_id"], "status": job["status"],
                        "submitted_at": stamp(job["created"]), "updated_at": stamp(job["updated"])}
                if job["error"]:
                    body["error"] = {"type": "internal_error", "retryable": True, "message": job["error"]}
                return jsonify(body)
            job["polls"] += 1
            job["updated"] = time.time()
            body = {"job_id": job_id, "engine_id": job["engine_id"],
                    "submitted_at": stamp(job["created"]), "updated_at": stamp(job["updated"])}
            if job["polls"] < self.polls_needed:
                body["status"] = "queued" if job["polls"] == 1 else "running"
                # 真实服务运行中的 step 叫什么没有见过，这里的名字是编的
                body["progress"] = {"step": "simulate", "detail": "Simulating the circuit"}
            elif self.max_values and job["values"] is not None and job["values"].size > self.max_values:
                body["status"] = "failed"       # 真实服务就是这样：先接受任务，交结果时才失败
                body["error"] = {"type": "ApplicationError", "retryable": False, "message": TOO_LARGE}
            elif self.fail_jobs:
                body["status"] = "failed"
                body["error"] = {"type": "engine_error", "message": "simulated failure", "retryable": False}
            elif "qrng" in job:
                body["status"] = "completed"
                body["progress"] = {"step": "format", "detail": f"Extracted {len(job['qrng']['bytes'])} bytes"}
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
            if job is not None and "qrng" in job:
                return jsonify(result={"output": self._qrng_output(job)}, outputs=None)
            if job is None or job["values"] is None:
                return problem(404, "Not Found", "no such job")
            p = job["params"]
            out = emulator.quantum_blur(job["values"], strength=p.get("strength", 0.5),
                                        style=p.get("style", "x"), reach=p.get("reach", 0.0),
                                        axes=p.get("axes"), shots=p.get("shots"), seed=0)
            nested = np.round(out.astype(np.float64), 6).tolist()
            return jsonify(result=nested if self.bare_result else {"output": nested}, outputs=None)

        return app

    @staticmethod
    def _qrng_output(job):
        data, real = job["qrng"]["bytes"], job["qrng"]["mode"] == "qpu"
        witness = job["params"].get("bell_witness", True)
        h_bit = 0.66 if real else 0.93
        return {
            "random": {"hex": data.hex(), "bytes": len(data), "bits": 8 * len(data),
                       "requested_bytes": job["params"].get("output_bytes", 32), "derived": {}},
            "entropy_report": {"grade": "hardware-accounted" if real else "simulator-baseline",
                               "entropy_accounted": real, "h_bit": h_bit, "health_passed": True,
                               "output_bits": 8 * len(data), "epsilon_log2": 64,
                               "statements": ["made up by the fake service"],
                               "witness_violates_classical": True if real and witness else None},
            "entropy": {"readout": "counts", "h_bit": h_bit},
            "extractor": {"kind": "toeplitz", "output_bits": 8 * len(data), "public_seed": "toeplitz-v1"},
            "provenance": {"mode": job["qrng"]["mode"], "backend": "ibm_fake" if real else "aer",
                           "provider_job_id": "fake-provider-job", "qpu_seconds": 5 if real else None,
                           "circuit_hash": "0" * 64},
            "bell_witness": ({"enabled": True, "kind": "chsh_fidelity_witness", "S": 2.61 if real else 2.83,
                              "sigma_S": 0.012, "violates_classical_3sigma": True}
                             if witness else {"enabled": False}),
            "raw": {"counts_sha256": "0" * 64},
        }
