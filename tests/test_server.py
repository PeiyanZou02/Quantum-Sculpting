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

import emulator                              # noqa: E402
import pipeline                              # noqa: E402
import server                                # noqa: E402
import tiling                                # noqa: E402
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
        server.atlas.RETRY_SCALE = 0.005
        cls.c = server.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.fake.stop()
        cls.tmp.cleanup()

    def setUp(self):
        server.S = server.State()
        self.fake.bare_result = self.fake.fail_jobs = False
        self.fake.max_values, self.fake.throttle, self.fake.polls_needed = None, 0, 3
        self.fake.stale_list = False
        (server.HOME / "limits.json").unlink(missing_ok=True)
        self.c.delete("/api/key")

    def post(self, path, data=None, expect=200):
        r = self.c.post(path, json=data or {})
        if r.status_code != expect:
            self.fail(f"{path} → {r.status_code}（期望 {expect}）：{r.get_data()[:300].decode('utf-8', 'replace')}")
        return r

    @staticmethod
    def unpack(response):
        """把紧凑格式（有东西的盒子、每个数一个字节）还原成整块，和界面做的一样。"""
        meta = json.loads(response.headers["X-Meta"])
        full = np.zeros((meta["n"],) * 3, dtype=np.float32)
        box = tuple(slice(a, b) for a, b in meta["box"])
        full[box] = np.frombuffer(response.data, dtype=np.uint8).reshape(full[box].shape) / 255.0
        return full

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
        self.assertEqual((grid["n"], grid["total"]), (32, 32 ** 3))
        self.assertEqual(grid["tiles"]["cube"], {"shape": [32, 32, 32], "jobs": 1, "total": 1})
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
        for n in (16, 32, 64, 128):
            tiles = self.post("/api/voxelize", {"n": n}).get_json()["tiles"]
            self.assertEqual(tiles["cube"]["jobs"] > 1, n > 32)
            for body in ({"mode": "gaussian", "sigma": 1.0},
                         {"mode": "emulator", "strength": 0.5, "reach": 0.2, "style": "xy", "axes": [0, 2]},
                         {"mode": "emulator", "strength": 0.3, "tiling": "layers"},
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

    def test_models_already_in_input_can_be_reopened(self):
        self.post("/api/model/test-cup")
        names = [m["name"] for m in self.c.get("/api/models").get_json()]
        self.assertIn("test_cup.stl", names)
        opened = self.post("/api/model/open", {"name": "test_cup.stl", "up": "+y"}).get_json()
        self.assertEqual((opened["name"], opened["up"]), ("test_cup", "+y"))
        self.assertAlmostEqual(opened["extents"][1], 90, delta=0.5)
        self.post("/api/model/open", {"name": "../app/server.py"}, expect=400)
        self.post("/api/model/open", {"name": "missing.stl"}, expect=400)

    def test_fill_modes(self):
        self.post("/api/model/test-cup")
        for fill in ("holes", "capped", "none", True, False):
            self.post("/api/voxelize", {"n": 16, "fill": fill})
        self.assertEqual(self.post("/api/voxelize", {"n": 16, "fill": "capped"}).get_json()["fill"], "capped")
        self.post("/api/voxelize", {"n": 16, "fill": "solid"}, expect=400)

    def test_compact_grid_is_the_same_data_in_far_fewer_bytes(self):
        self.ready(64)
        plain = self.c.get("/api/grid/input")
        small = self.c.get("/api/grid/input?compact=1")
        grid = np.frombuffer(plain.data, dtype="<f4").reshape(64, 64, 64)
        np.testing.assert_array_equal(self.unpack(small), grid)
        self.assertLess(len(small.data), len(plain.data) / 4)
        self.post("/api/process", {"mode": "emulator", "strength": 0.3})
        processed = np.frombuffer(self.c.get("/api/grid/processed").data, dtype="<f4").reshape(64, 64, 64)
        r = self.c.get("/api/grid/processed?compact=1")
        np.testing.assert_allclose(self.unpack(r), processed, atol=1 / 255)
        self.assertEqual(json.loads(r.headers["X-Meta"])["proc"]["mode"], "emulator")

    def test_coverage_voxelisation(self):
        self.post("/api/key", {"key": TEST_KEY})
        self.post("/api/model/test-cup")
        binary = self.post("/api/voxelize", {"n": 32, "values": "binary"}).get_json()
        info = self.post("/api/voxelize", {"n": 32, "values": "coverage"}).get_json()
        self.assertEqual((binary["values"], info["values"]), ("binary", "coverage"))
        self.assertLess(info["solid"], 0.8 * binary["solid"], "薄壁杯子在 0/1 体素化下胖了不少")
        grid = np.frombuffer(self.c.get("/api/grid/input").data, dtype="<f4")
        self.assertTrue(((grid > 0.05) & (grid < 0.95)).any(), "应该有不是 0 也不是 1 的格子")
        np.testing.assert_allclose(self.unpack(self.c.get("/api/grid/input?compact=1")).ravel(), grid, atol=1 / 255)

        self.post("/api/process", {"mode": "emulator", "strength": 0.3})
        plain = json.loads(self.post("/api/mesh", {"level": 0.5}).headers["X-Meta"])
        # 杯壁只有一格多厚，模糊之后大多低于 0.5；阈值放低一些，推移量也小一些
        moved = json.loads(self.post("/api/mesh", {"method": "advect", "refine": 4, "amount": 0.5,
                                                   "level": 0.3}).headers["X-Meta"])
        self.assertEqual(moved["field"], "threshold")
        gone = self.post("/api/mesh", {"method": "advect", "refine": 4, "amount": 0.5, "grow": -8}, expect=400)
        self.assertIn("表面消失了", gone.get_json()["error"])
        self.assertGreater(moved["faces"], plain["faces"])

        # 小数也能交给 Atlas
        job = self.wait_for_job(self.post("/api/process", {"mode": "atlas", "run": "cover"}).get_json()["job_id"])
        self.assertEqual(job["status"], "done", job["error"])
        sent = np.array(list(self.fake.jobs.values())[-1]["params"]["values"])
        self.assertTrue(((sent > 0.05) & (sent < 0.95)).any())
        self.assertEqual(self.c.get("/api/state").get_json()["grid"]["values"], "coverage")

    def test_level_set_route_to_a_mesh(self):
        self.ready(32)
        self.post("/api/process", {"mode": "emulator", "strength": 0.3})
        plain = json.loads(self.post("/api/mesh", {"level": 0.5}).headers["X-Meta"])
        self.assertEqual((plain["method"], plain["refine"]), ("threshold", 1))

        # 没有推移量时，「推动表面」给出的就是原模型本身，只是更细
        r = self.post("/api/mesh", {"method": "advect", "refine": 4, "amount": 0})
        still = json.loads(r.headers["X-Meta"])
        verts, faces = parse_mesh(r.data)
        self.assertTrue(still["watertight"])
        self.assertEqual((still["method"], still["refine"], still["fine_voxel_mm"] < still["voxel_mm"]),
                         ("advect", 4, True))
        self.assertTrue(-1 <= verts.min() and verts.max() <= 32, "预览模型应该在量子网格坐标里")
        self.assertAlmostEqual(still["extents"][0] / still["extents"][2], 80 / 90, delta=0.03)
        self.assertGreater(len(faces), 4 * plain["faces"])

        moved = json.loads(self.post("/api/mesh", {"method": "advect", "refine": 4, "amount": 3,
                                                   "field": "difference"}).headers["X-Meta"])
        self.assertNotEqual(moved["faces"], still["faces"])
        for body in ({"refine": 2}, {"vfilter": "gaussian", "vwidth": 1.5}, {"grow": 1.0}, {"close": 1.5},
                     {"method": "advect", "refine": 2, "amount": 2, "field": "threshold", "vfilter": "curvature"},
                     {"method": "advect", "refine": 2, "amount": 1, "field": "gradient", "grow": 1, "close": 1}):
            report = json.loads(self.post("/api/mesh", {"level": 0.4, **body}).headers["X-Meta"])
            self.assertGreater(report["faces"], 0, body)

        thick = json.loads(self.post("/api/mesh", {"grow": 2.0}).headers["X-Meta"])
        self.assertGreater(thick["volume_cm3"], plain["volume_cm3"])

        out = self.post("/api/export", {"method": "advect", "refine": 4, "amount": 2.5, "level": 0.5}).get_json()
        self.assertEqual(out["file"], "run1_emulator_n32_L050_adv2.5_x4.stl")
        sidecar = json.loads((server.OUTPUT / "run1_emulator_n32_L050_adv2.5_x4.json").read_text(encoding="utf-8"))
        self.assertEqual((sidecar["mesh"]["method"], sidecar["mesh"]["amount"]), ("advect", 2.5))

        self.post("/api/mesh", {"refine": 3}, expect=400)
        self.post("/api/mesh", {"grow": -8.0}, expect=400)
        self.post("/api/voxelize", {"n": 64})
        self.post("/api/process", {"mode": "gaussian"})
        self.post("/api/mesh", {"refine": 8}, expect=400)          # 64 × 8 超过 256

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

    def test_large_grid_is_sent_to_atlas_in_tiles(self):
        self.post("/api/key", {"key": TEST_KEY})
        info = self.ready(64)
        self.assertEqual(info["tiles"]["cube"], {"shape": [32, 32, 64], "jobs": 4, "total": 4})
        before = self.fake.submits
        body = {"mode": "atlas", "strength": 0.3, "style": "xy", "run": "tiled"}
        job = self.wait_for_job(self.post("/api/process", body).get_json()["job_id"])
        self.assertEqual(job["status"], "done", job["error"])
        self.assertEqual((job["tiles_total"], job["tiles_done"], job["tiles_cached"]), (4, 4, 0))
        self.assertEqual(self.fake.submits, before + 4)
        self.assertEqual(job["meta"]["tiles"], {"mode": "cube", "shape": [32, 32, 64], "jobs": 4, "cached": 0})
        for sent in list(self.fake.jobs.values())[-4:]:
            self.assertEqual(np.array(sent["params"]["values"]).shape, (32, 32, 64))

        # 拼起来的结果应该和本地按同样方式分块的模拟一致（假服务用的就是本地模拟）
        got = np.frombuffer(self.c.get("/api/grid/processed").data, dtype="<f4").reshape(64, 64, 64)
        grid = np.frombuffer(self.c.get("/api/grid/input").data, dtype="<f4").reshape(64, 64, 64)
        want = pipeline.normalize(
            emulator.quantum_blur_tiled(grid, (32, 32, 64), strength=0.3, style="xy"), grid.sum())
        np.testing.assert_allclose(got, want, atol=2e-3)
        self.post("/api/process", {"mode": "emulator", "strength": 0.3, "style": "xy"})
        local = np.frombuffer(self.c.get("/api/grid/processed").data, dtype="<f4").reshape(64, 64, 64)
        np.testing.assert_allclose(local, want, atol=1e-6)

        # 再来一次：四块都读缓存
        again = self.post("/api/process", body).get_json()
        self.assertEqual((again["status"], again["meta"]["cached"]), ("done", True))
        self.assertEqual(self.fake.submits, before + 4)

        # 换成按层分块：又是 4 个新任务，每个是 64×64×16
        job = self.wait_for_job(self.post("/api/process", {**body, "tiling": "layers"}).get_json()["job_id"])
        self.assertEqual(job["meta"]["tiles"]["shape"], [64, 64, 16])
        self.assertEqual(self.fake.submits, before + 8)

    def test_identical_and_uniform_tiles_are_not_submitted_twice(self):
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(64)
        rng = np.random.default_rng(7)
        block = (rng.random((32, 32, 64)) > 0.5).astype(np.float32)
        mirrored = np.zeros((64, 64, 64), dtype=np.float32)
        mirrored[:32, :32] = block
        mirrored[32:, :32] = block[::-1]
        mirrored[:32, 32:] = block[:, ::-1]
        mirrored[32:, 32:] = block[::-1, ::-1]
        with server.S.lock:
            server.S.grid, server.S.grid_id = mirrored, server.S.grid_id + 1
        before = self.fake.submits
        job = self.wait_for_job(self.post("/api/process", {"mode": "atlas", "run": "mirror"}).get_json()["job_id"])
        self.assertEqual(job["status"], "done", job["error"])
        self.assertEqual((job["tiles_total"], job["tiles_done"], job["tiles_cached"]), (4, 4, 3))
        self.assertEqual(self.fake.submits, before + 1, "四块镜像之后一样，只应该提交一次")
        got = np.frombuffer(self.c.get("/api/grid/processed").data, dtype="<f4").reshape(64, 64, 64)
        want = pipeline.normalize(emulator.quantum_blur_tiled(mirrored, (32, 32, 64), strength=0.5), mirrored.sum())
        np.testing.assert_allclose(got, want, atol=2e-3)

        solid = np.zeros((64, 64, 64), dtype=np.float32)
        solid[:32, :32] = 1                               # 一整块实心，其余是空的
        with server.S.lock:
            server.S.grid, server.S.grid_id = solid, server.S.grid_id + 1
        before = self.fake.submits
        job = self.wait_for_job(self.post("/api/process", {"mode": "atlas", "run": "solid"}).get_json()["job_id"])
        self.assertEqual(job["status"], "done", job["error"])
        self.assertEqual(self.fake.submits, before, "均匀的实心块 Rx 不会改变它，不用提交")
        job = self.wait_for_job(self.post("/api/process", {"mode": "atlas", "run": "solid", "style": "xy"})
                                .get_json()["job_id"])
        self.assertEqual(self.fake.submits, before + 1, "带 Ry 的门会改变它，要提交")

    def test_tiles_are_halved_when_atlas_rejects_their_size(self):
        self.fake.max_values = 40_000          # 像真实服务一样：6.5 万个数的结果交不上去
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(64)
        before = self.fake.submits
        job = self.wait_for_job(self.post("/api/process", {"mode": "atlas", "run": "limit"}).get_json()["job_id"])
        self.assertEqual(job["status"], "done", job["error"])
        self.assertEqual(job["tile_shape"], [32, 32, 32])
        self.assertEqual(job["tiles_total"], 8)
        self.assertIn("小一半", job["note"])
        self.assertEqual(self.fake.submits, before + 1 + 8, "只应该浪费一个探路的任务")
        self.assertEqual(server.atlas_bits(), 15, "上限应该被记住")
        with server.S.lock:
            self.assertEqual(server.grid_tiles()["cube"]["shape"], [32, 32, 32])

    def test_a_failed_tile_stops_the_run_and_finished_tiles_are_kept(self):
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(64)
        body = {"mode": "atlas", "run": "partial"}
        original = server.atlas.Atlas.result
        calls = {"n": 0}

        def flaky(client, job_id):
            calls["n"] += 1
            if calls["n"] == 3:
                raise server.atlas.AtlasError("simulated network drop")
            return original(client, job_id)

        server.atlas.Atlas.result = flaky
        try:
            job = self.wait_for_job(self.post("/api/process", body).get_json()["job_id"])
        finally:
            server.atlas.Atlas.result = original
        self.assertEqual(job["status"], "failed")
        self.assertIn("simulated network drop", job["error"])
        before = self.fake.submits
        job = self.wait_for_job(self.post("/api/process", body).get_json()["job_id"])
        self.assertEqual(job["status"], "done", job["error"])
        self.assertGreaterEqual(job["tiles_cached"], 2, "之前算完的分块应该直接读缓存")
        self.assertEqual(self.fake.submits, before, "已经提交过的任务不应该再提交一遍")

    def test_partial_result_can_be_previewed_while_tiles_are_running(self):
        self.fake.polls_needed = 12
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(64)
        job_id = self.post("/api/process", {"mode": "atlas", "run": "preview"}).get_json()["job_id"]
        seen = None
        for _ in range(400):
            r = self.c.get(f"/api/process/{job_id}/preview")
            if r.status_code == 200:
                seen = self.unpack(r)
                break
            time.sleep(0.01)
        self.assertIsNotNone(seen, "运行中应该能取到部分结果")
        self.assertEqual(seen.shape, (64, 64, 64))
        self.assertEqual(self.wait_for_job(job_id)["status"], "done")
        self.assertEqual(self.c.get(f"/api/process/{job_id}/preview").status_code, 404)

    def test_rate_limited_submissions_are_retried(self):
        self.fake.throttle = 2
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(16)
        job = self.wait_for_job(self.post("/api/process", {"mode": "atlas", "run": "busy"}).get_json()["job_id"])
        self.assertEqual(job["status"], "done", job["error"])

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

    # ── 账户里的任务列表 ──

    def test_job_list_needs_a_key(self):
        self.assertIn("API key", self.c.get("/api/atlas/jobs").get_json()["error"])
        self.assertEqual(self.c.get("/api/atlas/jobs").status_code, 400)

    def test_job_list_marks_the_jobs_this_app_submitted(self):
        self.fake.jobs.clear()
        elsewhere = self.fake.add_job("qrc-image-v1", "completed", age=7200)
        colleague = self.fake.add_job("blur-core-v1", "failed", age=9000, owner="someone-else")
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(64)
        body = {"mode": "atlas", "strength": 0.3, "style": "xy", "run": "listed"}
        self.assertEqual(self.wait_for_job(self.post("/api/process", body).get_json()["job_id"])["status"], "done")

        r = self.c.get("/api/atlas/jobs")
        self.assertNotIn(TEST_KEY, r.get_data(as_text=True))
        page = r.get_json()
        self.assertIsNone(page["next_cursor"])
        jobs = page["jobs"]
        self.assertEqual([j["job_id"] for j in jobs[4:]], [elsewhere, colleague], "新的在前")
        mine = jobs[:4]
        self.assertEqual({j["status"] for j in mine}, {"completed"})
        self.assertEqual({j["engine"] for j in mine}, {"blur-core-v1"})
        self.assertEqual({j["local"]["run"] for j in mine}, {"listed"})
        self.assertEqual(sorted(tuple(j["local"]["tile"]) for j in mine), [(0, 0, 0), (0, 1, 0), (1, 0, 0), (1, 1, 0)])
        self.assertEqual(mine[0]["local"]["shape"], [32, 32, 64])
        self.assertEqual(mine[0]["local"]["params"]["style"], "xy")
        self.assertTrue(all(j["mine"] for j in mine))
        self.assertTrue(mine[0]["created_at"].endswith("Z"))

        other = {j["job_id"]: j for j in jobs[4:]}
        self.assertIsNone(other[elsewhere]["local"], "别处提交的任务没有本地记录")
        self.assertEqual((other[elsewhere]["engine"], other[elsewhere]["mine"]), ("qrc-image-v1", True))
        self.assertEqual((other[colleague]["status"], other[colleague]["mine"]), ("failed", False))

    def test_job_list_is_paged(self):
        self.fake.jobs.clear()
        ids = [self.fake.add_job(age=100 * (i + 1)) for i in range(5)]
        self.post("/api/key", {"key": TEST_KEY})
        first = self.c.get("/api/atlas/jobs?limit=2").get_json()
        self.assertEqual([j["job_id"] for j in first["jobs"]], ids[:2])
        self.assertTrue(first["next_cursor"])
        rest = self.c.get(f"/api/atlas/jobs?limit=200&cursor={first['next_cursor']}").get_json()
        self.assertEqual([j["job_id"] for j in rest["jobs"]], ids[2:])
        self.assertIsNone(rest["next_cursor"])

    def test_job_list_uses_the_status_this_app_polled_when_the_list_lags(self):
        self.fake.jobs.clear()
        self.fake.stale_list = True            # 列表里一直是 queued
        self.fake.polls_needed = 40
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(16)
        job_id = self.post("/api/process", {"mode": "atlas", "run": "live"}).get_json()["job_id"]
        seen = set()
        for _ in range(400):
            rows = self.c.get("/api/atlas/jobs").get_json()["jobs"]
            if rows:
                seen.add((rows[0]["status"], rows[0]["progress"]))
            if ("running", "Simulating the circuit") in seen:
                break
            time.sleep(0.01)
        self.assertIn(("running", "Simulating the circuit"), seen, "运行中应该显示轮询到的状态和进度")
        self.assertEqual(self.wait_for_job(job_id)["status"], "done")
        self.assertEqual(self.c.get("/api/atlas/jobs").get_json()["jobs"][0]["status"], "completed")

    def test_job_detail_gives_the_reason_a_job_failed(self):
        self.fake.jobs.clear()
        failed = self.fake.add_job(status="failed", error="[TMPRL1103] payload too large")
        self.post("/api/key", {"key": TEST_KEY})
        detail = self.c.get(f"/api/atlas/jobs/{failed}").get_json()
        self.assertEqual((detail["status"], detail["error"]), ("failed", "[TMPRL1103] payload too large"))
        self.assertEqual(self.c.get("/api/atlas/jobs/not-a-job-id").status_code, 404)
        self.assertEqual(self.c.get("/api/atlas/jobs/..%2Fme").status_code, 404)
        missing = self.c.get("/api/atlas/jobs/00000000-0000-0000-0000-000000000000")
        self.assertEqual(missing.status_code, 502)
        self.assertIn("404", missing.get_json()["error"])

    def test_a_running_atlas_job_can_be_found_again_and_blocks_a_second_one(self):
        self.fake.polls_needed = 40
        self.post("/api/key", {"key": TEST_KEY})
        self.ready(16)
        self.assertIsNone(self.c.get("/api/state").get_json()["job"])
        body = {"mode": "atlas", "strength": 0.4, "run": "first"}
        job = self.post("/api/process", body).get_json()
        self.assertEqual((job["run"], job["params"]["strength"], job["tiling"]), ("first", 0.4, "cube"))
        # 刷新页面后靠这个接回去
        self.assertEqual(self.c.get("/api/state").get_json()["job"]["job_id"], job["job_id"])
        before = self.fake.submits
        refused = self.post("/api/process", {**body, "run": "second"}, expect=409).get_json()
        self.assertIn("first", refused["error"])
        self.assertEqual(self.fake.submits, before)
        self.assertEqual(self.wait_for_job(job["job_id"])["status"], "done")
        self.assertIsNone(self.c.get("/api/state").get_json()["job"])
        second = self.post("/api/process", {**body, "run": "second"}).get_json()
        self.assertEqual(self.wait_for_job(second["job_id"])["status"], "done")

    # ── 服务重启之后 ──

    def test_every_response_says_which_start_of_the_service_it_came_from(self):
        boots = {self.c.get(path).headers.get("X-Boot") for path in ("/", "/api/state", "/api/grid/input")}
        self.assertEqual(boots, {server.BOOT})
        cup = self.post("/api/model/test-cup").get_json()
        self.assertEqual((cup["file"], cup["builtin"]), ("test_cup.stl", True))
        self.assertTrue(self.post("/api/model/orient", {"up": "+y"}).get_json()["builtin"])
        data = {"file": (io.BytesIO((server.INPUT / "test_cup.stl").read_bytes()), "my cup.stl"), "up": "+y"}
        r = self.c.post("/api/model/upload", data=data, content_type="multipart/form-data")
        self.assertEqual((r.get_json()["file"], r.get_json()["builtin"]), ("my_cup.stl", False))
        self.assertEqual(self.post("/api/model/orient", {"up": "+z"}).get_json()["file"], "my_cup.stl")

    def test_a_reopened_model_gives_exactly_the_same_grid(self):
        """Atlas 的缓存按网格内容找，所以服务重启后重新打开的模型必须体素化出一模一样的网格。"""
        self.post("/api/model/test-cup")
        data = {"file": (io.BytesIO((server.INPUT / "test_cup.stl").read_bytes()), "scan.stl")}
        model = self.c.post("/api/model/upload", data=data, content_type="multipart/form-data").get_json()
        for values in ("coverage", "binary"):
            self.post("/api/voxelize", {"n": 64, "values": values})
            before = self.c.get("/api/grid/input").data
            server.S = server.State()
            self.post("/api/model/open", {"name": model["file"], "up": model["up"]})
            self.post("/api/voxelize", {"n": 64, "values": values})
            self.assertEqual(self.c.get("/api/grid/input").data, before, values)

    def test_after_a_restart_the_model_and_the_cached_atlas_result_can_be_put_back(self):
        self.post("/api/key", {"key": TEST_KEY})
        model = self.post("/api/model/test-cup").get_json()
        self.post("/api/voxelize", {"n": 64, "values": "coverage"})
        body = {"mode": "atlas", "strength": 0.3, "run": "kept"}
        self.assertEqual(self.wait_for_job(self.post("/api/process", body).get_json()["job_id"])["status"], "done")
        before = self.c.get("/api/grid/processed").data
        submits = self.fake.submits

        server.S = server.State()                       # 重启：内存里什么都没有了
        self.assertIn("量子处理", self.post("/api/mesh", {"level": 0.5}, expect=400).get_json()["error"])
        self.assertIn("体素化", self.post("/api/process", {"mode": "emulator"}, expect=400).get_json()["error"])

        # 页面做的事：把模型送回来（内置的杯子是重新造一个），用原来的参数体素化，再去读缓存
        self.assertTrue(model["builtin"])
        self.post("/api/model/test-cup")
        self.post("/api/voxelize", {"n": 64, "values": "coverage"})
        missing = self.post("/api/process", {**body, "run": "never-submitted", "cached_only": True}).get_json()
        self.assertEqual(missing, {"status": "missing"})
        self.assertIsNone(self.c.get("/api/state").get_json()["job"])
        back = self.post("/api/process", {**body, "cached_only": True}).get_json()
        self.assertEqual((back["status"], back["meta"]["cached"]), ("done", True))
        self.assertEqual(self.c.get("/api/grid/processed").data, before, "读回来的应该和重启前一模一样")
        self.assertEqual(self.fake.submits, submits, "恢复不应该向 Atlas 提交任何任务")


if __name__ == "__main__":
    unittest.main()
