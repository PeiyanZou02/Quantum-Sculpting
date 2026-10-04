"""把界面会调用的每个接口走一遍，Atlas 那条路径对着本地假服务跑。

所有文件都写到临时目录，不会碰项目里的 input/、grids/、output/ 和真实的 API key。
"""
import io
import json
import os
import struct
import sys
import tempfile
import time
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pipeline                              # noqa: E402
import server                                # noqa: E402
from fake_atlas import TEST_KEY, FakeAtlas   # noqa: E402


def parse_mesh(data):
    nv, nf = struct.unpack_from("<II", data, 0)
    assert len(data) == 8 + nv * 12 + nf * 12
    verts = np.frombuffer(data, dtype="<f4", count=nv * 3, offset=8).reshape(-1, 3)
    faces = np.frombuffer(data, dtype="<u4", count=nf * 3, offset=8 + nv * 12).reshape(-1, 3)
    return verts, faces


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        server.HOME = root / "home"
        server.INPUT, server.GRIDS, server.OUTPUT = root / "input", root / "grids", root / "output"
        for d in (server.INPUT, server.GRIDS, server.OUTPUT):
            d.mkdir()
        os.environ.pop("MOTH_API_KEY", None)
        cls.fake = FakeAtlas().start()
        server.ATLAS_BASE = cls.fake.base
        server.ATLAS_POLL = 0.02
        cls.c = server.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.fake.stop()
        cls.tmp.cleanup()

    def setUp(self):
        server.S = server.State()
        self.fake.bare_result = self.fake.fail_jobs = False
        self.c.delete("/api/key")

    def post(self, path, data=None, expect=200):
        r = self.c.post(path, json=data or {})
        if r.status_code != expect:
            self.fail(f"{path} → {r.status_code}（期望 {expect}）：{r.get_data(as_text=True)[:300]}")
        return r

    def ready(self, n=32):
        self.post("/api/model/test-cup")
        return self.post("/api/voxelize", {"n": n}).get_json()

    def wait_for_job(self, job_id):
        for _ in range(400):
            job = self.c.get(f"/api/process/{job_id}").get_json()
            if job["status"] != "running":
                return job
            time.sleep(0.02)
        self.fail("Atlas 任务一直没有结束")

    # ── 本地流程 ──

    def test_full_local_flow(self):
        model = self.post("/api/model/test-cup").get_json()
        self.assertTrue(model["watertight"])
        self.assertEqual(model["name"], "test_cup")
        self.assertTrue((server.INPUT / "test_cup.stl").exists())

        r = self.c.get("/api/model/mesh")
        verts, faces = parse_mesh(r.data)
        self.assertEqual(len(faces), model["faces"])

        grid = self.post("/api/voxelize", {"n": 32, "pad": 2, "fill": True}).get_json()
        self.assertEqual((grid["n"], grid["qubits"], grid["total"]), (32, 15, 32 ** 3))
        self.assertGreater(grid["solid"], 500)
        # 原模型经过 transform 应该正好落在实体格子的范围里
        t = np.array(grid["transform"])
        placed = (np.c_[verts, np.ones(len(verts))] @ t.T)[:, :3]
        self.assertGreaterEqual(placed.min(), 1.4)
        self.assertLessEqual(placed.max(), 29.6)

        r = self.c.get("/api/grid/input")
        raw = np.frombuffer(r.data, dtype="<f4")
        self.assertEqual(raw.size, 32 ** 3)
        self.assertEqual(int(raw.sum()), grid["solid"])

        done = self.post("/api/process", {"mode": "emulator", "strength": 0.3, "run": "r 1"}).get_json()
        self.assertEqual(done["status"], "done")
        self.assertEqual(done["meta"]["run"], "r_1")
        r = self.c.get("/api/grid/processed")
        meta = json.loads(r.headers["X-Meta"])
        self.assertEqual(meta["proc"]["mode"], "emulator")
        processed = np.frombuffer(r.data, dtype="<f4")
        self.assertLess(float(processed.min()), 1e-3)
        self.assertAlmostEqual(float(processed.max()), 1.0)

        r = self.post("/api/mesh", {"level": 0.4, "smooth": 5, "keep": "largest", "height": 120})
        report = json.loads(r.headers["X-Meta"])
        verts, faces = parse_mesh(r.data)
        self.assertEqual(report["faces"], len(faces))
        self.assertTrue(report["watertight"])
        self.assertAlmostEqual(report["extents"][2], 120, delta=0.2)
        self.assertTrue(-1 <= verts.min() and verts.max() <= 32, "预览模型应该在网格坐标里")

        out = self.post("/api/export", {"level": 0.4, "smooth": 5, "height": 120}).get_json()
        self.assertEqual(out["file"], "r_1_emulator_n32_L040.stl")
        exported = pipeline.load_mesh(server.OUTPUT / out["file"])
        self.assertAlmostEqual(float(exported.extents[2]), 120, delta=0.2)
        sidecar = json.loads((server.OUTPUT / "r_1_emulator_n32_L040.json").read_text(encoding="utf-8"))
        self.assertEqual(sidecar["process"]["params"]["strength"], 0.3)
        r = self.c.get(f"/api/download/{out['file']}")
        self.assertEqual(r.status_code, 200)
        r.close()

        state = self.c.get("/api/state").get_json()
        self.assertEqual(state["grid"]["n"], 32)
        self.assertEqual(state["processed"]["mode"], "emulator")

    def test_every_grid_size_and_mode(self):
        self.post("/api/model/test-cup")
        for n in (16, 32, 64):
            self.assertEqual(self.post("/api/voxelize", {"n": n}).get_json()["qubits"], 3 * int(np.log2(n)))
            for body in ({"mode": "gaussian", "sigma": 1.0},
                         {"mode": "emulator", "strength": 0.5, "reach": 0.2, "style": "xy", "axes": [0, 2]},
                         {"mode": "emulator", "strength": 0.4, "shots": 200000}):
                self.post("/api/process", body)
                report = json.loads(self.post("/api/mesh", {"level": 0.5}).headers["X-Meta"])
                self.assertGreater(report["faces"], 0, f"n={n} {body}")

    def test_voxelize_clears_the_processed_result(self):
        self.ready()
        self.post("/api/process", {"mode": "gaussian"})
        self.post("/api/voxelize", {"n": 16})
        self.assertEqual(self.c.get("/api/grid/processed").status_code, 404)
        self.post("/api/mesh", {"level": 0.5}, expect=400)

    def test_upload_and_orient(self):
        stl = pipeline.make_test_cup().export(file_type="stl")
        r = self.c.post("/api/model/upload", data={"file": (io.BytesIO(stl), "我的 杯子.stl"), "up": "+z"})
        self.assertEqual(r.status_code, 200, r.get_data(as_text=True))
        self.assertEqual(r.get_json()["name"], "我的_杯子")
        self.assertAlmostEqual(r.get_json()["extents"][2], 90, delta=0.5)
        turned = self.post("/api/model/orient", {"up": "+y"}).get_json()
        self.assertAlmostEqual(turned["extents"][1], 90, delta=0.5)
        self.assertEqual(turned["up"], "+y")

    def test_helpful_errors(self):
        self.assertIn("模型", self.post("/api/voxelize", expect=400).get_json()["error"])
        self.post("/api/process", {"mode": "emulator"}, expect=400)
        self.post("/api/model/orient", {"up": "+y"}, expect=400)
        self.post("/api/model/test-cup")
        self.post("/api/voxelize", {"n": 48}, expect=400)
        self.post("/api/voxelize", {"n": 32})
        self.post("/api/process", {"mode": "emulator", "axes": []}, expect=400)
        self.post("/api/process", {"mode": "emulator", "style": "xz"}, expect=400)
        self.post("/api/process", {"mode": "nope"}, expect=400)
        self.post("/api/mesh", {"level": 0.5}, expect=400)
        r = self.c.post("/api/model/upload", data={"file": (io.BytesIO(b"hello"), "notes.txt")})
        self.assertEqual(r.status_code, 400)
        r = self.c.post("/api/model/upload", data={"file": (io.BytesIO(b"not a mesh"), "broken.stl")})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.c.get("/api/process/nope").status_code, 404)

    def test_requests_from_other_sites_are_refused(self):
        r = self.c.post("/api/model/test-cup", headers={"Origin": "http://evil.example"})
        self.assertEqual(r.status_code, 403)
        r = self.c.get("/api/state", headers={"Host": "evil.example"})
        self.assertEqual(r.status_code, 403)

    # ── API key ──

    def test_key_is_stored_outside_the_project_and_never_echoed(self):
        self.assertFalse(self.c.get("/api/key").get_json()["set"])
        self.post("/api/key", {"key": ""}, expect=400)
        self.post("/api/key", {"key": "has space"}, expect=400)
        r = self.post("/api/key", {"key": f"  {TEST_KEY}\n"})
        status = r.get_json()
        self.assertEqual((status["set"], status["source"], status["hint"]), (True, "saved", TEST_KEY[-4:]))
        self.assertNotIn(TEST_KEY, r.get_data(as_text=True))
        self.assertNotIn(TEST_KEY, self.c.get("/api/state").get_data(as_text=True))
        self.assertTrue((server.HOME / "config.json").exists())
        self.assertTrue(self.post("/api/key/test").get_json()["ok"])
        self.assertFalse(self.c.delete("/api/key").get_json()["set"])
        self.post("/api/key/test", expect=502)

    def test_key_from_environment(self):
        os.environ["MOTH_API_KEY"] = TEST_KEY
        try:
            self.assertEqual(self.c.get("/api/key").get_json()["source"], "env")
            self.assertTrue(self.post("/api/key/test").get_json()["ok"])
        finally:
            del os.environ["MOTH_API_KEY"]

    def test_wrong_key_is_reported(self):
        self.post("/api/key", {"key": "moth_wrong_key_0000"})
        self.assertIn("401", self.post("/api/key/test", expect=502).get_json()["error"])
        self.ready(16)
        job = self.post("/api/process", {"mode": "atlas", "run": "wrongkey"}).get_json()
        job = self.wait_for_job(job["job_id"])
        self.assertEqual(job["status"], "failed")
        self.assertIn("401", job["error"])

    # ── Atlas ──

    def test_atlas_needs_a_key(self):
        self.ready(16)
        self.assertIn("API key", self.post("/api/process", {"mode": "atlas"}, expect=400).get_json()["error"])

    def test_atlas_flow_and_cache(self):
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(32)
        before = self.fake.submits
        body = {"mode": "atlas", "strength": 0.35, "reach": 0.1, "axes": [0, 1], "run": "q1"}
        job = self.post("/api/process", body).get_json()
        self.assertEqual(job["status"], "running")
        job = self.wait_for_job(job["job_id"])
        self.assertEqual(job["status"], "done", job["error"])
        self.assertFalse(job["stale"])
        self.assertEqual(job["meta"]["mode"], "atlas")
        self.assertTrue(job["meta"]["job_id"])

        sent = list(self.fake.jobs.values())[-1]["params"]
        self.assertEqual(np.array(sent["values"]).shape, (32, 32, 32))
        self.assertEqual((sent["strength"], sent["reach"], sent["style"], sent["axes"]), (0.35, 0.1, "x", [0, 1]))
        self.assertNotIn("shots", sent)

        report = json.loads(self.post("/api/mesh", {"level": 0.4}).headers["X-Meta"])
        self.assertGreater(report["faces"], 0)
        out = self.post("/api/export", {"level": 0.4}).get_json()
        self.assertEqual(out["file"], "q1_atlas_n32_L040.stl")

        # 同样的参数再来一次：读缓存，不再提交
        again = self.post("/api/process", body).get_json()
        self.assertEqual(again["status"], "done")
        self.assertTrue(again["meta"]["cached"])
        self.assertEqual(self.fake.submits, before + 1)

        # 换个实验名：重新提交
        job = self.post("/api/process", {**body, "run": "q2"}).get_json()
        self.assertEqual(self.wait_for_job(job["job_id"])["status"], "done")
        self.assertEqual(self.fake.submits, before + 2)

    def test_atlas_result_as_bare_list(self):
        self.fake.bare_result = True
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(16)
        job = self.post("/api/process", {"mode": "atlas", "run": "bare"}).get_json()
        self.assertEqual(self.wait_for_job(job["job_id"])["status"], "done")

    def test_atlas_failed_job_can_be_resubmitted(self):
        self.fake.fail_jobs = True
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(16)
        body = {"mode": "atlas", "run": "willfail"}
        job = self.wait_for_job(self.post("/api/process", body).get_json()["job_id"])
        self.assertEqual(job["status"], "failed")
        self.assertIn("simulated failure", job["error"])
        self.fake.fail_jobs = False
        job = self.wait_for_job(self.post("/api/process", body).get_json()["job_id"])
        self.assertEqual(job["status"], "done")

    def test_atlas_result_for_an_old_grid_is_not_applied(self):
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(16)
        job = self.post("/api/process", {"mode": "atlas", "run": "stale"}).get_json()
        self.post("/api/voxelize", {"n": 32})          # 等结果的时候换了网格
        job = self.wait_for_job(job["job_id"])
        self.assertEqual(job["status"], "done")
        self.assertTrue(job["stale"])
        self.assertEqual(self.c.get("/api/grid/processed").status_code, 404)

    def test_atlas_rejection_is_explained(self):
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(16)
        original = server.atlas.build_params
        server.atlas.build_params = lambda grid, **kw: {**original(grid, **kw), "max_qubits": 4}
        try:
            job = self.wait_for_job(self.post("/api/process", {"mode": "atlas", "run": "big"}).get_json()["job_id"])
        finally:
            server.atlas.build_params = original
        self.assertEqual(job["status"], "failed")
        self.assertIn("too_many_qubits", job["error"])


if __name__ == "__main__":
    unittest.main()
