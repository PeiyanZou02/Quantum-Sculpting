"""VDB 式水平集运算的检查：用球这类知道正确答案的形状。

运行：  python -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import emulator   # noqa: E402
import levelset   # noqa: E402
import pipeline   # noqa: E402

RADIUS = 30.0


def radius_of(mesh, transform):
    """网格坐标里的模型，顶点到球心的平均距离和波动，换回模型单位。"""
    scale = float(transform[0, 0])
    r = np.linalg.norm(mesh.vertices - transform[:3, 3], axis=1) / scale
    return float(r.mean()), float(r.std())


class LevelSetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sphere = trimesh.creation.icosphere(subdivisions=5, radius=RADIUS)
        cls.grid, cls.scale, cls.t = pipeline.mesh_to_grid(cls.sphere, n=32)
        cls.voxel = 1.0 / cls.scale                    # 量子网格一格有多少模型单位
        cls.ls = levelset.from_mesh(cls.sphere, cls.t, 32, refine=2)

    def test_surface_is_placed_to_a_fraction_of_a_voxel(self):
        for refine in (1, 2, 4):
            ls = levelset.from_mesh(self.sphere, self.t, 32, refine)
            mesh = levelset.to_mesh(ls)
            mean, spread = radius_of(mesh, self.t)
            self.assertAlmostEqual(mean, RADIUS, delta=0.1 * self.voxel, msg=f"refine {refine}")
            self.assertLess(spread, 0.1 * self.voxel)
            self.assertTrue(mesh.is_watertight)
            self.assertGreater(mesh.volume, 0, "法线应该朝外")
        # 同样分辨率下，0/1 体素再取面要差得多
        binary, _ = pipeline.grid_to_mesh(self.grid, level=0.5)
        mean, spread = radius_of(binary, self.t)
        self.assertGreater(abs(mean - RADIUS) + spread, 0.4 * self.voxel)

    def test_thin_walled_model_keeps_its_volume_at_every_refinement(self):
        """杯壁只有一格多厚。表面采样留下的小孔曾经让填充失效，丢掉一半体积。"""
        cup = pipeline.make_test_cup()
        scale, t = pipeline.placement(cup, 32, pad=2)
        exact = cup.volume * scale ** 3
        for refine in (2, 4, 8):
            ls = levelset.from_mesh(cup, t, 32, refine)
            inside = float((ls.sdf < 0).sum()) / refine ** 3
            self.assertAlmostEqual(inside, exact, delta=0.04 * exact, msg=f"refine {refine}")
            self.assertAlmostEqual(float(levelset.coverage(ls).sum()), exact, delta=0.03 * exact,
                                   msg=f"refine {refine}")
            mesh = levelset.to_mesh(ls)
            self.assertTrue(mesh.is_watertight)
            self.assertEqual(len(mesh.split(only_watertight=False)), 1, f"refine {refine}: 杯子应该是完整的一块")

    def test_only_the_active_box_is_stored(self):
        ls = levelset.from_mesh(trimesh.creation.icosphere(subdivisions=4, radius=10.0),
                                np.diag([0.5, 0.5, 0.5, 1.0]) + np.array([[0, 0, 0, 16]] * 3 + [[0] * 4]), 32, 4)
        self.assertLess(ls.sdf.size, 0.2 * 128 ** 3)
        self.assertTrue(all(o > 0 for o in ls.origin))

    def test_fit_trims_spare_room_and_adds_room_to_grow(self):
        tight = levelset.fit(self.ls, 2)
        self.assertLess(tight.sdf.size, self.ls.sdf.size)
        mean, _ = radius_of(levelset.to_mesh(tight), self.t)
        self.assertAlmostEqual(mean, RADIUS, delta=0.1 * self.voxel)
        # 盒子只留 2 格余量，却要加厚 6 格：不补的话球会被盒子切平
        grown = levelset.to_mesh(levelset.offset(levelset.fit(tight, 8), 6.0))
        mean, spread = radius_of(grown, self.t)
        self.assertAlmostEqual(mean, RADIUS + 6 * self.voxel / 2, delta=0.3 * self.voxel)
        self.assertLess(spread, 0.2 * self.voxel)
        roomy = levelset.fit(tight, 500)
        self.assertEqual(roomy.sdf.shape, (64, 64, 64), "不会超出整个细网格")

    def test_rebuilding_again_and_again_does_not_roughen_the_surface(self):
        sdf = self.ls.sdf
        for _ in range(12):
            sdf = levelset.rebuild(sdf)
        mean, spread = radius_of(levelset.to_mesh(self.ls.with_sdf(sdf)), self.t)
        self.assertAlmostEqual(mean, RADIUS, delta=0.05 * self.voxel)
        self.assertLess(spread, 0.05 * self.voxel)

    def test_distance_is_accurate_across_the_band(self):
        idx = np.argwhere(np.abs(self.ls.sdf) < 3)
        pos = (idx + np.array(self.ls.origin) + 0.5) / 2 - 0.5
        exact = (np.linalg.norm(pos - self.t[:3, 3], axis=1) - RADIUS * self.scale) * 2
        error = self.ls.sdf[tuple(idx.T)] - exact
        for side in ((exact > 1) & (exact < 2), (exact < -1) & (exact > -2)):
            self.assertLess(abs(float(error[side].mean())), 0.08, "窄带里离表面一格以外也应该准")

    def test_coverage_has_the_true_volume_and_binary_voxels_are_fat(self):
        scale, t = pipeline.placement(self.sphere, 32, pad=2)
        ls = levelset.from_mesh(self.sphere, t, 32, 4)
        cover = levelset.coverage(ls)
        exact = 4 / 3 * np.pi * (RADIUS * scale) ** 3
        self.assertEqual(cover.shape, (32, 32, 32))
        self.assertTrue(0 <= cover.min() and cover.max() <= 1)
        self.assertAlmostEqual(float(cover.sum()), exact, delta=0.01 * exact)
        self.assertGreater(float(self.grid.sum()), 1.1 * exact, "0/1 体素化明显偏胖")
        self.assertAlmostEqual(levelset.fatness(ls, cover), 0.0, delta=0.05)
        self.assertGreater(levelset.fatness(self.ls, self.grid), 0.4)
        mean, spread = radius_of(pipeline.grid_to_mesh(cover, level=0.5)[0], t)
        self.assertAlmostEqual(mean, RADIUS, delta=0.1 / scale)

    def test_a_symmetric_blur_barely_moves_the_surface(self):
        """普通模糊两边对称，表面不该被推走。0/1 输入偏胖，不做对齐的话推出来的全是这个错位。"""
        scale, t = pipeline.placement(self.sphere, 32, pad=2)
        ls = levelset.from_mesh(self.sphere, t, 32, 4)
        for label, grid, base, tr in (("coverage", levelset.coverage(ls), ls, t),
                                      ("binary", self.grid, levelset.from_mesh(self.sphere, self.t, 32, 4), self.t)):
            blurred = pipeline.normalize(emulator.mock_blur(grid, sigma=1.0), grid.sum())
            for amount in (1.0, 3.0):
                mesh = levelset.to_mesh(levelset.advect(base, blurred, grid, amount, "threshold"))
                mean, spread = radius_of(mesh, tr)
                self.assertAlmostEqual(mean, RADIUS, delta=0.2 / float(tr[0, 0]), msg=f"{label} amount {amount}")
                self.assertLess(spread, 0.08 / float(tr[0, 0]), f"{label} amount {amount}")

    def test_rebuild_restores_a_distance_field_without_moving_the_surface(self):
        distorted = self.ls.with_sdf(self.ls.sdf * 3.0)
        fixed = levelset.rebuild(distorted.sdf)
        near = np.abs(fixed) < 2
        slopes = np.linalg.norm(np.gradient(fixed), axis=0)[near]
        self.assertAlmostEqual(float(np.median(slopes)), 1.0, delta=0.1)
        mean, _ = radius_of(levelset.to_mesh(self.ls.with_sdf(fixed)), self.t)
        self.assertAlmostEqual(mean, RADIUS, delta=0.1 * self.voxel)

    def test_offset_moves_the_surface_by_that_many_fine_voxels(self):
        fine = self.voxel / 2
        for distance in (2.0, -3.0):
            mean, spread = radius_of(levelset.to_mesh(levelset.offset(self.ls, distance)), self.t)
            self.assertAlmostEqual(mean, RADIUS + distance * fine, delta=0.2 * fine, msg=f"offset {distance}")
            self.assertLess(spread, 0.2 * fine)

    def test_open_and_close_leave_a_sphere_alone(self):
        fine = self.voxel / 2
        for op in (levelset.close, levelset.open_):
            mean, _ = radius_of(levelset.to_mesh(op(self.ls, 2.0)), self.t)
            self.assertAlmostEqual(mean, RADIUS, delta=0.25 * fine)

    def test_close_fills_a_narrow_gap(self):
        sdf = np.full((40, 40, 40), 5.0, dtype=np.float32)
        x = np.arange(40, dtype=np.float32)[:, None, None]
        slab = np.maximum(np.abs(x - 12) - 4, 0) - 0.5            # 两块板，中间隔 3 格
        other = np.maximum(np.abs(x - 24) - 4, 0) - 0.5
        ls = levelset.LevelSet(levelset.rebuild(np.minimum(slab, other) + 0 * sdf), (0, 0, 0), 40, 1)
        self.assertGreater(ls.sdf[18, 20, 20], 0, "缝里一开始是空的")
        self.assertLess(levelset.close(ls, 3.0).sdf[18, 20, 20], 0, "闭合之后缝被填上")
        self.assertGreater(levelset.close(ls, 3.0).sdf[2, 20, 20], 0, "外面没有被填")

    def test_smoothing_rounds_corners_and_keeps_flat_faces(self):
        box = trimesh.creation.box(extents=[40, 40, 40])
        _, _, t = pipeline.mesh_to_grid(box, n=32)
        ls = levelset.from_mesh(box, t, 32, 2)
        before = levelset.to_mesh(ls)
        for kind in ("gaussian", "mean", "median", "curvature"):
            after = levelset.to_mesh(levelset.smooth(ls, kind, 2.0))
            self.assertTrue(after.is_watertight, kind)
            self.assertLess(after.volume, before.volume, f"{kind}: 角被磨圆，体积应该变小")
            self.assertGreater(after.volume, 0.85 * before.volume, f"{kind}: 但不该缩掉太多")
            self.assertAlmostEqual(after.extents[0], before.extents[0], delta=1.0, msg=f"{kind}: 平的面基本不动")
        self.assertIs(levelset.smooth(ls, "none", 2.0), ls)

    def test_upsample_matches_the_fine_grid_positions(self):
        ramp = np.broadcast_to(np.arange(8, dtype=np.float32)[:, None, None], (8, 8, 8)).copy()
        fine = levelset.upsample(ramp, 4, (8, 8, 8), (12, 12, 12))
        want = (np.arange(8, 20) + 0.5) / 4 - 0.5            # 细网格第 j 格的中心在量子网格里的坐标
        np.testing.assert_allclose(fine[:, 3, 5], want, atol=1e-5)
        np.testing.assert_array_equal(levelset.upsample(ramp, 1, (2, 0, 0), (3, 8, 8))[:, 0, 0], [2, 3, 4])

    def test_no_quantum_effect_means_no_movement(self):
        for field in ("difference",):
            self.assertIs(levelset.advect(self.ls, self.grid, self.grid, 4.0, field), self.ls)
        self.assertIs(levelset.advect(self.ls, self.grid * 0.5, self.grid, 0.0), self.ls)

    def test_difference_field_grows_where_density_was_added(self):
        grown = np.clip(self.grid + np.roll(self.grid, 2, axis=0), 0, 1)     # 量子结果在 +x 一侧多出一层
        moved = levelset.to_mesh(levelset.advect(self.ls, grown, self.grid, 3.0, "difference"))
        before = levelset.to_mesh(self.ls)
        self.assertGreater(moved.bounds[1][0], before.bounds[1][0] + 0.5, "+x 一侧应该长出去")
        self.assertAlmostEqual(moved.bounds[0][0], before.bounds[0][0], delta=0.3, msg="-x 一侧不该动")

    def test_threshold_field_pulls_the_surface_toward_the_quantum_iso_surface(self):
        small = trimesh.creation.icosphere(subdivisions=4, radius=RADIUS * 0.6)
        target = pipeline.mesh_to_grid(small, n=32)[0] * 0          # 占位
        target, _, _ = self._grid_of(small)
        r = [radius_of(levelset.to_mesh(levelset.advect(self.ls, target, self.grid, a, "threshold")), self.t)[0]
             for a in (0.0, 2.0, 6.0)]
        self.assertGreater(r[0], r[1])
        self.assertGreater(r[1], r[2])
        self.assertGreater(r[2], RADIUS * 0.6 - self.voxel, "不会缩过阈值面")

    def _grid_of(self, mesh):
        """把另一个模型体素化到和 self.grid 同一个网格位置上。"""
        ls = levelset.from_mesh(mesh, self.t, 32, 1)
        full = np.zeros((32, 32, 32), dtype=np.float32)
        box = tuple(slice(o, o + s) for o, s in zip(ls.origin, ls.sdf.shape))
        full[box] = np.clip(0.5 - ls.sdf, 0, 1)
        return full, None, None

    def test_gradient_field_is_a_vector_advection(self):
        quantum = pipeline.normalize(emulator.quantum_blur(self.grid, strength=0.3), self.grid.sum())
        moved = levelset.advect(self.ls, quantum, self.grid, 1.0, "gradient")
        self.assertEqual(moved.sdf.shape, self.ls.sdf.shape)
        self.assertFalse(np.allclose(moved.sdf, self.ls.sdf, atol=0.1))

    def test_density_iso_surface(self):
        quantum = pipeline.normalize(emulator.mock_blur(self.grid, sigma=1.0), self.grid.sum())
        for refine in (1, 4):
            mesh = levelset.to_mesh(levelset.from_density(quantum, 0.5, refine))
            mean, _ = radius_of(mesh, self.t)
            self.assertAlmostEqual(mean, RADIUS, delta=0.7 * self.voxel)
            self.assertTrue(mesh.is_watertight)
        with self.assertRaises(ValueError):
            levelset.from_density(quantum, 1.01, 1)

    def test_open_bottom_model_is_solid_when_capped(self):
        dome = trimesh.creation.icosphere(subdivisions=4, radius=RADIUS)
        dome.update_faces(dome.triangles_center[:, 2] > -18)
        dome.remove_unreferenced_vertices()
        _, _, t = pipeline.mesh_to_grid(dome, n=32)
        capped = levelset.to_mesh(levelset.from_mesh(dome, t, 32, 2, fill="capped"))
        shell = levelset.to_mesh(levelset.from_mesh(dome, t, 32, 2, fill="none"))
        self.assertTrue(capped.is_watertight)
        self.assertGreater(capped.volume, 3 * shell.volume, "封底填实后体积应该大得多")

    def test_vanished_surface_and_bad_options_are_errors(self):
        with self.assertRaises(ValueError):
            levelset.to_mesh(levelset.offset(self.ls, -200.0))
        with self.assertRaises(ValueError):
            levelset.advect(self.ls, self.grid, self.grid, 1.0, "sideways")
        with self.assertRaises(ValueError):
            levelset.smooth(self.ls, "sharpen", 1.0)


if __name__ == "__main__":
    unittest.main()
