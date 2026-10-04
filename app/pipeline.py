"""模型 ⇄ 体素网格：量子杯子流程里除量子处理以外的所有步骤。

坐标约定：grid[x, y, z]，杯口朝 +Z。「网格坐标」指体素下标空间，
体素 (i, j, k) 的中心就在点 (i, j, k)，所有预览都画在这个空间里。
"""
import numpy as np
import trimesh
from skimage import measure

# 把模型里指定的轴转成 +Z（杯口方向）
UP_AXES = {
    "+z": None,
    "-z": ([1, 0, 0], np.pi),
    "+y": ([1, 0, 0], np.pi / 2),
    "-y": ([1, 0, 0], -np.pi / 2),
    "+x": ([0, 1, 0], -np.pi / 2),
    "-x": ([0, 1, 0], np.pi / 2),
}


def make_test_cup(radius=40.0, height=90.0, wall=4.0, bottom=5.0):
    """生成一个简单的圆柱杯子，单位：毫米。"""
    outer = trimesh.creation.cylinder(radius=radius, height=height, sections=96)
    # 内部圆柱向上移，保证杯口是开的、杯底有厚度
    inner = trimesh.creation.cylinder(radius=radius - wall, height=height, sections=96)
    inner.apply_translation([0, 0, bottom])
    cup = outer.difference(inner)          # 布尔运算，需要 manifold3d
    cup.apply_translation(-cup.bounds[0])  # 把模型挪到坐标原点
    return cup


def load_mesh(path):
    """读取 .obj / .stl / .ply / .glb 等，多个物体会合并成一个。"""
    mesh = trimesh.load(path, force="mesh")
    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
        raise ValueError("文件里没有三角面。请导出为带网格的 .stl、.obj、.ply 或 .glb。")
    return mesh


def orient(mesh, up="+z"):
    """返回一份杯口朝 +Z 的拷贝。up 是原模型里朝上的那个轴。"""
    if up not in UP_AXES:
        raise ValueError(f"不支持的朝向 {up}")
    out = mesh.copy()
    rot = UP_AXES[up]
    if rot is not None:
        axis, angle = rot
        out.apply_transform(trimesh.transformations.rotation_matrix(angle, axis))
    return out


def sig(value, digits=3):
    """保留几位有效数字：模型可能以毫米为单位（80），也可能以米为单位（0.08）。"""
    return float(f"{float(value):.{digits}g}")


def mesh_stats(mesh):
    return {
        "faces": int(len(mesh.faces)),
        "vertices": int(len(mesh.vertices)),
        "extents": [sig(v) for v in mesh.extents],
        "watertight": bool(mesh.is_watertight),
    }


def qubits_for(shape):
    """Quantum Blur Core 把每个轴编码成 ceil(log2(长度)) 个量子比特。"""
    return int(sum(int(np.ceil(np.log2(s))) if s > 1 else 0 for s in shape))


def mesh_to_grid(mesh, n=32, pad=2, fill=True):
    """把网格模型转成 n×n×n 的 0/1 数组。

    pad：四周留出的空格子数，给量子模糊「向外扩散」的空间。
    返回 (grid, scale, transform)：
      scale 是 体素/毫米，用于最后把模型缩放回毫米；
      transform 是 4×4 矩阵，把原模型坐标变到网格坐标（给预览叠加用）。
    """
    usable = n - 2 * pad
    if usable < 4:
        raise ValueError(f"留白 {pad} 对 {n}³ 的网格来说太大了")
    mesh = mesh.copy()
    lo = mesh.bounds[0].copy()
    mesh.apply_translation(-lo)
    scale = (usable - 1) / float(mesh.extents.max())   # 最长边刚好占满可用空间
    mesh.apply_scale(scale)

    vox = mesh.voxelized(pitch=1.0)
    if fill:
        vox = vox.fill()                               # 填满封闭的内部
    m = np.asarray(vox.matrix, dtype=np.float32)
    origin = np.asarray(vox.translation, dtype=np.float64)  # 下标 0 的体素中心

    grid = np.zeros((n, n, n), dtype=np.float32)
    sx, sy, sz = (min(s, usable) for s in m.shape)
    ox = pad + (usable - sx) // 2                      # x、y 居中
    oy = pad + (usable - sy) // 2
    oz = pad                                           # z 从底部开始
    grid[ox:ox + sx, oy:oy + sy, oz:oz + sz] = m[:sx, :sy, :sz]

    transform = np.eye(4)
    transform[:3, :3] *= scale
    transform[:3, 3] = -lo * scale - origin + np.array([ox, oy, oz])
    return grid, scale, transform


def normalize(grid, total):
    """换算成「相对原模型实体的密度」：原来的实体格子是 1，空格子是 0。

    total 是输入网格的数值总和。量子模糊不改变总量，所以不管引擎返回时怎么缩放，
    把总量调回 total 就回到了同一把尺子上。干涉叠加出的少数热点会超过 1，截到 1；
    否则按最大值缩放时，这些热点会把整体压低，同一个阈值在不同参数下意思就不一样了。
    """
    grid = np.asarray(grid, dtype=np.float64)
    current = float(grid.sum())
    if not np.isfinite(current) or current <= 0:
        raise ValueError("结果全是 0，可能处理失败了")
    out = np.clip(grid * (float(total) / current), 0.0, 1.0)
    if float(out.max() - out.min()) < 1e-9:
        raise ValueError("结果是常数数组，可能处理失败了")
    return out.astype(np.float32)


def grid_to_mesh(grid, level=0.5, keep="largest", min_faces=200, smooth=0):
    """阈值 + marching cubes，把数组转回网格模型（仍在网格坐标里）。

    keep："largest" 只保留最大的一块；"all" 保留所有不太小的碎块
    smooth：Taubin 平滑次数，0 表示保留方块感
    返回 (mesh, 碎块总数)。
    """
    lo, hi = float(grid.min()), float(grid.max())
    if not (lo < level < hi):
        raise ValueError(f"阈值 {level:.2f} 不在数据范围 [{lo:.2f}, {hi:.2f}] 内")

    padded = np.pad(grid, 1, mode="constant", constant_values=0)  # 边界补零，保证表面封闭
    verts, faces, _, _ = measure.marching_cubes(padded, level=level)
    verts -= 1
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)

    parts = mesh.split(only_watertight=False)
    total = max(len(parts), 1)
    if len(parts) > 1:
        largest = max(parts, key=lambda p: len(p.faces))
        if keep == "largest":
            mesh = largest
        else:
            big = [p for p in parts if len(p.faces) >= min_faces]
            mesh = trimesh.util.concatenate(big) if big else largest

    if smooth > 0:
        trimesh.smoothing.filter_taubin(mesh, iterations=int(smooth))
    mesh.fix_normals()
    return mesh, total


def prepare_for_print(mesh, scale, target_height=90.0):
    """网格坐标 → 毫米，缩放到目标高度，尝试修补，并给出检查报告。"""
    out = mesh.copy()
    out.apply_scale(1.0 / scale)                        # 体素单位 → 原始毫米
    out.apply_scale(target_height / float(out.extents[2]))
    out.apply_translation(-out.bounds[0])

    if not out.is_watertight:
        trimesh.repair.fill_holes(out)
        trimesh.repair.fix_normals(out)

    report = {
        "extents": [round(float(v), 1) for v in out.extents],
        "watertight": bool(out.is_watertight),
        "faces": int(len(out.faces)),
        "parts": int(len(out.split(only_watertight=False))),
        # 一个体素在打印尺寸下的边长，用来估计最薄的壁
        "voxel_mm": round(float(target_height / mesh.extents[2]), 2),
    }
    if report["watertight"]:
        report["volume_cm3"] = round(float(abs(out.volume)) / 1000.0, 1)
    return out, report
