"""本地流程的检查：测试杯子 → 体素化 → 模糊 → 转回模型。

运行：  python -m unittest discover -s tests -v   （在项目根目录，用 .quantum-cup 的 venv）
"""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import atlas      # noqa: E402
import emulator   # noqa: E402
import pipeline   # noqa: E402


class VoxelizeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cup = pipeline.make_test_cup()

    def test_cup_is_watertight(self):
        self.assertTrue(self.cup.is_watertight)
        np.testing.assert_allclose(self.cup.extents, [80, 80, 90], atol=0.5)

    def test_grid_is_a_hollow_cup(self):
        for n in (16, 32, 64):
            grid, scale, _ = pipeline.mesh_to_grid(self.cup, n=n)
            self.assertEqual(grid.shape, (n, n, n))
            self.assertEqual(set(np.unique(grid)), {0.0, 1.0})
            mid = grid[:, :, n // 2]
            c = n // 2
            self.assertEqual(mid[c, c], 0, f"n={n}: 杯子中心应该是空的")
            self.assertGreater(mid.sum(), 0, f"n={n}: 中间一层应该有杯壁")
            self.assertEqual(grid[c, c, 2], 1, f"n={n}: 杯底应该是实心的")
            self.assertGreater(scale, 0)

    def test_padding_is_empty(self):
        grid, _, _ = pipeline.mesh_to_grid(self.cup, n=32, pad=2)
        for sl in (grid[:2], grid[-2:], grid[:, :2], grid[:, -2:], grid[:, :, :2], grid[:, :, -2:]):
            self.assertEqual(sl.sum(), 0)

    def test_transform_maps_mesh_into_grid(self):
        grid, _, t = pipeline.mesh_to_grid(self.cup, n=32, pad=2)
        pts = np.c_[self.cup.vertices, np.ones(len(self.cup.vertices))] @ t.T
        solid = np.argwhere(grid > 0)
        np.testing.assert_allclose(pts[:, :3].min(0), solid.min(0), atol=0.51)
        np.testing.assert_allclose(pts[:, :3].max(0), solid.max(0), atol=0.51)

    def test_orient_turns_y_up_into_z_up(self):
        lying = self.cup.copy()
        lying.apply_transform([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]])  # z → y
        self.assertAlmostEqual(lying.extents[1], 90, delta=0.5)
        back = pipeline.orient(lying, "+y")
        self.assertAlmostEqual(back.extents[2], 90, delta=0.5)
        grid, _, _ = pipeline.mesh_to_grid(back, n=32)
        self.assertEqual(grid[16, 16, 2], 1)       # 杯底在下
        self.assertEqual(grid[16, 16, 20], 0)      # 杯口敞开


class EmulatorTest(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(0)
        self.grid = (rng.random((8, 8, 8)) > 0.6).astype(np.float32)

    def test_zero_strength_is_identity(self):
        out = emulator.quantum_blur(self.grid, strength=0.0)
        np.testing.assert_allclose(out, self.grid, atol=1e-6)

    def test_total_is_conserved(self):
        for style in ("x", "y", "xy"):
            out = emulator.quantum_blur(self.grid, strength=0.6, reach=0.3, style=style)
            self.assertAlmostEqual(float(out.sum()), float(self.grid.sum()), places=3)
            self.assertGreaterEqual(out.min(), 0)

    def test_blur_spreads_an_impulse_to_neighbours_first(self):
        grid = np.zeros(16, dtype=np.float32)
        grid[5] = 1
        out = emulator.quantum_blur(grid, strength=0.3)
        self.assertLess(out[5], 1)
        self.assertGreater(out[4], out[0])          # 邻居比远处拿到更多

    def test_axes_limit_the_blur(self):
        grid = np.zeros((8, 8), dtype=np.float32)
        grid[3, 3] = 1
        out = emulator.quantum_blur(grid, strength=0.5, axes=[0])
        self.assertAlmostEqual(float(out[:, 3].sum()), 1.0, places=5)   # 只沿第 0 轴扩散

    def test_non_power_of_two_shape_is_kept(self):
        out = emulator.quantum_blur(np.ones((5, 6, 7), dtype=np.float32), strength=0.4)
        self.assertEqual(out.shape, (5, 6, 7))

    def test_shots_are_reproducible_per_seed(self):
        a = emulator.quantum_blur(self.grid, strength=0.5, shots=2000, seed=1)
        b = emulator.quantum_blur(self.grid, strength=0.5, shots=2000, seed=1)
        c = emulator.quantum_blur(self.grid, strength=0.5, shots=2000, seed=2)
        np.testing.assert_array_equal(a, b)
        self.assertFalse(np.array_equal(a, c))

    def test_bad_input_is_rejected(self):
        with self.assertRaises(ValueError):
            emulator.quantum_blur(-self.grid)
        with self.assertRaises(ValueError):
            emulator.quantum_blur(self.grid, style="z")
        with self.assertRaises(ValueError):
            emulator.quantum_blur(self.grid, strength=[0.1, 0.2])


class RoundTripTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.grid, cls.scale, _ = pipeline.mesh_to_grid(pipeline.make_test_cup(), n=32)

    def check(self, processed, levels):
        processed = pipeline.normalize(processed, self.grid.sum())
        for level in levels:
            mesh, total = pipeline.grid_to_mesh(processed, level=level, smooth=5)
            printed, report = pipeline.prepare_for_print(mesh, self.scale, 90.0)
            self.assertGreaterEqual(total, 1)
            self.assertAlmostEqual(report["extents"][2], 90.0, delta=0.2)
            self.assertTrue(report["watertight"], f"阈值 {level} 的模型不封闭")
            self.assertEqual(report["parts"], 1)

    def test_gaussian_stand_in(self):
        self.check(emulator.mock_blur(self.grid, sigma=1.0), (0.3, 0.4, 0.5, 0.6))

    def test_local_quantum_emulator(self):
        self.check(emulator.quantum_blur(self.grid, strength=0.4), (0.2, 0.35, 0.5))

    def test_keep_all_keeps_more_pieces(self):
        raw = emulator.quantum_blur(self.grid, strength=0.8, reach=0.2)
        processed = pipeline.normalize(raw, self.grid.sum())
        one, total = pipeline.grid_to_mesh(processed, level=0.5, keep="largest")
        many, _ = pipeline.grid_to_mesh(processed, level=0.5, keep="all", min_faces=1)
        self.assertGreater(total, 1)
        self.assertGreater(len(many.faces), len(one.faces))

    def test_level_outside_range_is_an_error(self):
        with self.assertRaises(ValueError):
            pipeline.grid_to_mesh(pipeline.normalize(self.grid, self.grid.sum()), level=1.5)

    def test_normalize_is_independent_of_how_the_engine_scales(self):
        raw = emulator.quantum_blur(self.grid, strength=0.3)
        a = pipeline.normalize(raw, self.grid.sum())
        b = pipeline.normalize(raw / raw.max(), self.grid.sum())      # 引擎按输出最大值缩放
        np.testing.assert_allclose(a, b, atol=1e-5)
        self.assertLess(float(a.min()), 1e-3)
        self.assertEqual(float(a.max()), 1.0)       # 超过 1 的热点被截到 1
        # 强度为 0 时原样返回
        same = pipeline.normalize(emulator.quantum_blur(self.grid, strength=0), self.grid.sum())
        np.testing.assert_allclose(same, self.grid, atol=1e-5)

    def test_the_largest_piece_is_still_most_of_the_cup(self):
        processed = pipeline.normalize(emulator.quantum_blur(self.grid, strength=0.3), self.grid.sum())
        one, _ = pipeline.grid_to_mesh(processed, level=0.5, keep="largest")
        many, _ = pipeline.grid_to_mesh(processed, level=0.5, keep="all", min_faces=1)
        self.assertGreater(len(one.faces), 0.8 * len(many.faces))

    def test_useless_results_are_errors(self):
        with self.assertRaises(ValueError):
            pipeline.normalize(np.ones((4, 4, 4)), 64)
        with self.assertRaises(ValueError):
            pipeline.normalize(np.zeros((4, 4, 4)), 10)


class AtlasPayloadTest(unittest.TestCase):
    def test_binary_grid_is_sent_as_integers(self):
        grid = np.zeros((2, 2, 2), dtype=np.float32)
        grid[0, 0, 0] = 1
        p = atlas.build_params(grid, strength=0.5, axes=[0, 2], shots=100)
        self.assertEqual(p["values"][0][0][0], 1)
        self.assertIsInstance(p["values"][0][0][0], int)
        self.assertEqual(p["axes"], [0, 2])
        self.assertEqual(p["shots"], 100)

    def test_optional_params_are_omitted(self):
        p = atlas.build_params(np.ones((2, 2, 2)))
        self.assertNotIn("axes", p)
        self.assertNotIn("shots", p)

    def test_result_shapes(self):
        nested = np.arange(8, dtype=float).reshape(2, 2, 2).tolist()
        for body in ({"result": nested}, {"result": {"output": nested}}, {"result": {"blurred": nested}}):
            np.testing.assert_array_equal(atlas.extract_grid(body, (2, 2, 2)).ravel(), np.arange(8))
        with self.assertRaises(atlas.AtlasError):
            atlas.extract_grid({"result": [1, 2, 3]}, (2, 2, 2))
        with self.assertRaises(atlas.AtlasError):
            atlas.extract_grid({"result": None}, (2, 2, 2))


if __name__ == "__main__":
    unittest.main()
