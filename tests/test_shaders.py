"""app/shaders.py against a fake HTTP layer. Nothing here touches the network or a real key."""
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace

from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import shaders  # noqa: E402

HDR = b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 2\n" + bytes([128, 128, 128, 129] * 2)
ASSET = "https://moth-api-assets-test.s3.amazonaws.com/out/result.zip?sig=x"


def result_zip(names=("R_lut.hdr", "T_lut.hdr", "entanglement_texture.glsl")):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for n in names:
            z.writestr(f"out/{n}", HDR if n.endswith(".hdr") else b"// glsl")
    return buf.getvalue()


class Resp:
    def __init__(self, status=200, body=None, content=b""):
        self.status_code, self._body, self.content = status, body, content
        self.text = json.dumps(body) if body is not None else ""

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


class FakeHTTP:
    """Stands in for the `requests` module inside shaders."""
    RequestException = Exception

    def __init__(self):
        self.calls = []
        self.status = "processing"
        self.zip = result_zip()
        self.asset_url = ASSET

    def request(self, method, url, json=None, headers=None, timeout=None):
        self.calls.append((method, url, json, headers))
        assert url.startswith("https://fake.moth/api/v1/"), url
        assert headers["Authorization"] == "Bearer test-key"
        path = url[len("https://fake.moth/api/v1"):]
        if method == "POST" and path == f"/engines/{shaders.ENGINE}/process":
            return Resp(202, {"job_id": "job-0001-abcd", "status": "queued"})
        if path == "/jobs/job-0001-abcd/status":
            return Resp(200, {"status": self.status})
        if path == "/jobs/job-0001-abcd/result":
            return Resp(200, {"outputs": [{"slot": "result", "url": self.asset_url, "size_bytes": len(self.zip),
                                           "output_asset_id": "asset-1", "content_type": "application/zip"}]})
        return Resp(404, {"title": "Not Found"})

    def get(self, url, timeout=None, headers=None):
        self.calls.append(("GET-ASSET", url, None, headers))
        assert "Authorization" not in (headers or {})
        return Resp(200, content=self.zip)


class ValidateTest(unittest.TestCase):
    def test_defaults_and_clamping(self):
        p = shaders.validate_params({"style": "Peaked", "layers": 20, "reflectance": 3, "absorption": -1,
                                     "incoming_rays": 99, "interaction": -7, "resolution": 500})
        self.assertEqual(p, {"style": "peaked", "layers": 9, "reflectance": 1.0, "absorption": 0.0,
                             "incoming_rays": 16, "interaction": -2.0, "resolution": 64})
        self.assertEqual(shaders.validate_params({})["style"], "peaked")

    def test_rays_follow_layers(self):
        # a real run used 8 rays through 2 layers: allowed; the engine enforces its own budget
        self.assertEqual(shaders.validate_params({"layers": 2, "incoming_rays": 8})["incoming_rays"], 8)
        self.assertEqual(shaders.validate_params({"layers": 0, "incoming_rays": 0})["layers"], 1)
        self.assertEqual(shaders.validate_params({"layers": 0, "incoming_rays": 0})["incoming_rays"], 1)

    def test_rejects(self):
        for bad in ({"style": "glossy"}, {"layers": "many"}, {"reflectance": None}, {"interaction": True},
                    {"resolution": float("nan")}, []):
            with self.assertRaises(ValueError):
                shaders.validate_params(bad)

    def test_asset_hosts(self):
        self.assertTrue(shaders._asset_url_ok(ASSET))
        self.assertTrue(shaders._asset_url_ok("https://cdn.mothquantum.com/x.zip"))
        self.assertFalse(shaders._asset_url_ok("http://moth-api-assets.s3.amazonaws.com/x.zip"))
        self.assertFalse(shaders._asset_url_ok("https://evil.example/mothquantum.com"))
        self.assertFalse(shaders._asset_url_ok("https://evilmothquantum.com/x.zip"))


class RoutesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.key = ("test-key", "saved")
        shaders.configure(lambda: self.key, lambda: "https://fake.moth/api/v1", lambda: self.root)
        self.http = FakeHTTP()
        self._real = shaders.requests
        shaders.requests = self.http
        app = Flask(__name__)
        app.register_blueprint(shaders.bp)
        self.client = app.test_client()

    def tearDown(self):
        shaders.requests = self._real
        self.tmp.cleanup()

    def test_full_run(self):
        r = self.client.post("/api/shader/run", json={"params": {"style": "3-body", "layers": 3, "incoming_rays": 6}})
        self.assertEqual(r.status_code, 200, r.get_json())
        job = r.get_json()["job_id"]
        self.assertEqual(job, "job-0001-abcd")
        self.assertEqual(self.http.calls[0][2]["params"]["style"], "3-body")

        r = self.client.get(f"/api/shader/{job}")
        self.assertEqual(r.get_json(), {"status": "processing", "ready": False, "files": [], "progress": None})
        self.assertEqual(self.client.get("/api/shader/live").get_json(), {"runs": []})

        self.http.status = "completed"
        r = self.client.get(f"/api/shader/{job}").get_json()
        self.assertTrue(r["ready"])
        self.assertEqual(r["files"], ["R_lut.hdr", "T_lut.hdr"])
        d = self.root / "shaders" / job
        self.assertEqual((d / "R_lut.hdr").read_bytes(), HDR)
        meta = json.loads((d / "meta.json").read_text())
        self.assertEqual(meta["status"], "completed")
        self.assertNotIn("t0", meta)

        # cached: no further network
        n = len(self.http.calls)
        self.assertTrue(self.client.get(f"/api/shader/{job}").get_json()["ready"])
        f = self.client.get(f"/api/shader/{job}/T_lut.hdr")
        self.assertEqual(f.status_code, 200)
        self.assertEqual(f.data, HDR)
        runs = self.client.get("/api/shader/live").get_json()["runs"]
        self.assertEqual([x["job_id"] for x in runs], [job])
        self.assertEqual(runs[0]["params"]["style"], "3-body")
        self.assertEqual(len(self.http.calls), n)

    def test_serving_guards(self):
        d = self.root / "shaders" / "job-cached-1"
        d.mkdir(parents=True)
        (d / "R_lut.hdr").write_bytes(HDR)
        self.assertEqual(self.client.get("/api/shader/job-cached-1/R_lut.hdr").data, HDR)
        self.assertEqual(self.client.get("/api/shader/job-cached-1/T_lut.hdr").status_code, 404)
        self.assertEqual(self.client.get("/api/shader/job-cached-1/meta.json").status_code, 404)
        self.assertIn(self.client.get("/api/shader/..%2F..%2Fetc/R_lut.hdr").status_code, (400, 404))
        self.assertEqual(self.client.get("/api/shader/../R_lut.hdr").status_code, 400)
        r = self.client.get("/api/shader/bad.id/R_lut.hdr")
        self.assertEqual(r.status_code, 400)
        self.assertIn("error", r.get_json())
        self.assertEqual(self.client.get("/api/shader/unknown-job-9").status_code, 404)
        self.assertEqual(self.http.calls, [])

    def test_errors(self):
        r = self.client.post("/api/shader/run", json={"params": {"style": "glossy"}})
        self.assertEqual(r.status_code, 400)
        self.assertIn("Unknown style", r.get_json()["error"])
        self.key = ("", None)
        r = self.client.post("/api/shader/run", json={"params": {}})
        self.assertEqual(r.status_code, 400)
        self.assertIn("No Moth API key", r.get_json()["error"])
        self.assertEqual(self.http.calls, [])

    def test_refuses_foreign_download_and_bad_zip(self):
        self.key = ("test-key", "saved")
        job = self.client.post("/api/shader/run", json={"params": {}}).get_json()["job_id"]
        self.http.status = "completed"
        self.http.asset_url = "https://evil.example/result.zip"
        r = self.client.get(f"/api/shader/{job}")
        self.assertEqual(r.status_code, 502)
        self.assertIn("not a Moth asset URL", r.get_json()["error"])
        self.http.asset_url = ASSET
        self.http.zip = result_zip(("R_lut.hdr",))
        r = self.client.get(f"/api/shader/{job}")
        self.assertEqual(r.status_code, 502)
        self.assertIn("T_lut.hdr", r.get_json()["error"])
        self.assertFalse((self.root / "shaders" / job / "R_lut.hdr").exists())

    def test_failed_job(self):
        job = self.client.post("/api/shader/run", json={"params": {}}).get_json()["job_id"]
        self.http.status = "failed"
        r = self.client.get(f"/api/shader/{job}").get_json()
        self.assertEqual(r["status"], "failed")
        self.assertFalse(r["ready"])


if __name__ == "__main__":
    unittest.main()
