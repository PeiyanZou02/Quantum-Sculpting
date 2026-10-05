"""VDB 式的水平集工具：网格 → 有符号距离场 → 平滑 / 膨胀腐蚀 / 平流 → 网格。

Houdini 的 VDB 流程是 VDB from Polygons → 在体素上运算 → Convert VDB。它高效主要靠两点：
只在表面附近存数、算数（稀疏），以及存的是「到表面的有符号距离」（SDF）而不是 0/1。
距离场里表面的位置精确到体素以下，平滑、偏移、平流都变成对一个标量场的简单运算。

这里没有用 OpenVDB 本身，而是用 numpy/scipy 做同样几种运算，并且只在「活动包围盒」里算：
盒子外面都是背景，不占内存也不参与计算。

约定：sdf < 0 在物体内部，单位是细网格的体素。细网格 = 量子网格 × refine：
量子计算可以在很粗的网格上做（一个任务），几何细节留在细的水平集里。
"""
from dataclasses import dataclass, replace

import numpy as np
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage import measure

import pipeline

SAMPLES_PER_VOXEL = 12        # 每平方体素的表面采样点数：够密，窄带里的距离才准
BAND = 3                      # 表面两侧各几个体素用精确距离，再远用近似的
REACH = 4                     # 一步一步推表面时，只在表面两侧这么多格里算，再远的只留正负号
FIELDS = ("difference", "threshold", "gradient")
FILTERS = ("none", "gaussian", "mean", "median", "curvature")


def keep_going():
    pass


# 循环的每一步会调用一次。服务把它换成「结果已经没人要了就抛异常」的函数，算到一半的就能停下
checkpoint = keep_going


@dataclass
class LevelSet:
    sdf: np.ndarray       # 活动包围盒里的有符号距离
    origin: tuple         # 盒子在细网格里的起点
    n: int                # 量子网格的边长
    refine: int           # 细网格每格是量子网格的 1/refine

    def with_sdf(self, sdf):
        return replace(self, sdf=np.asarray(sdf, dtype=np.float32))


# ── 基本运算 ─────────────────────────────────────────────────────────────

def _mask_sdf(inside):
    """由内外掩膜得到的有符号距离，精度是半个体素。"""
    d_out = ndimage.distance_transform_edt(~inside)
    d_in = ndimage.distance_transform_edt(inside)
    return np.where(inside, 0.5 - d_in, d_out - 0.5).astype(np.float32)


def _slope(sdf):
    """|∇sdf|，每个轴取前向、后向差分里较陡的一个。

    用中心差分的话，薄壁中间、尖角这些地方两边一正一负会抵消成 0，修正时就会把薄的地方越修越厚。
    """
    total = np.zeros(sdf.shape, dtype=np.float32)
    for axis in range(3):
        step = np.abs(np.diff(sdf, axis=axis))
        pad = [(0, 0)] * 3
        pad[axis] = (0, 1)
        forward = np.pad(step, pad)
        pad[axis] = (1, 0)
        backward = np.pad(step, pad)
        steep = np.maximum(forward, backward)
        total += steep * steep
    return np.sqrt(total)


def _gradient_at(sdf, index):
    """sdf 在这些体素上的梯度（中心差分，盒子边上用单侧差分）。只算这些点。"""
    parts = []
    for axis in range(3):
        lo, hi = list(index), list(index)
        lo[axis] = np.maximum(index[axis] - 1, 0)
        hi[axis] = np.minimum(index[axis] + 1, sdf.shape[axis] - 1)
        parts.append((sdf[tuple(hi)] - sdf[tuple(lo)]) / np.maximum(hi[axis] - lo[axis], 1))
    return np.stack(parts, axis=1)


def _crossings(sdf):
    """表面穿过网格棱的那些点（亚体素位置），以及每个点处的单位法线。"""
    points, normals = [], []
    for axis in range(3):
        field = np.moveaxis(sdf, axis, 0)
        low, high = field[:-1], field[1:]
        where = np.nonzero((low < 0) != (high < 0))            # 第 0 维是 axis 方向
        a, b = np.abs(low[where]), np.abs(high[where])
        t = (a / (a + b + 1e-12)).astype(np.float32)
        lower = [None] * 3
        lower[axis] = where[0]
        for other, values in zip([x for x in range(3) if x != axis], where[1:]):
            lower[other] = values
        upper = list(lower)
        upper[axis] = where[0] + 1
        point = np.stack(lower, axis=1).astype(np.float32)
        point[:, axis] += t
        points.append(point)
        normals.append((1 - t)[:, None] * _gradient_at(sdf, lower) + t[:, None] * _gradient_at(sdf, upper))
    points = np.concatenate(points).astype(np.float32)
    normals = np.concatenate(normals).astype(np.float32)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
    return points, normals


def rebuild(sdf):
    """重新整理成距离场（VDB 里叫 renormalize）：运算会让它不再是「距离」，梯度不再是 1。

    表面附近的窄带里：找到表面穿过网格棱的那些点，每个体素到最近那个点处切平面的距离就是它的值。
    对平面是精确的，也只用到表面的位置，所以已经是距离场的再整理一遍基本不变，输入不必本来就是距离。
    窄带以外用到对面最近体素的距离顶上，只要求单调，不要求准。
    """
    checkpoint()
    sdf = np.asarray(sdf, dtype=np.float32)
    inside = sdf < 0
    if not inside.any() or inside.all():
        return sdf
    far = _mask_sdf(inside)
    band = np.abs(far) <= BAND
    points, normals = _crossings(sdf)
    centers = np.argwhere(band)
    _, nearest = cKDTree(points).query(centers, workers=-1)
    plane = np.abs(np.einsum("ij,ij->i", centers - points[nearest], normals[nearest]))
    # 切平面距离在表面拐弯处会偏小，不让它小于到对面体素的距离减去半格太多
    plane = np.maximum(plane, np.abs(far[tuple(centers.T)]) - 0.5)
    out = far.copy()
    out[tuple(centers.T)] = np.where(inside[tuple(centers.T)], -plane, plane)
    return out


def _tidy(sdf):
    """一步一步推表面时用的快速整理：只重算表面两侧 REACH 格以内的距离，不做整盒的距离变换。

    这一圈里的体素取到最近的「表面穿过网格棱的点」处切平面的距离，和 rebuild 一样；更远的只留
    正负号（固定在 ±REACH）。所以两次整理之间表面不能走出这一圈，全部推完后要用 rebuild 把远处补上。
    大网格上 rebuild 的两次整盒距离变换是最费时间的部分，推几十步就要做几十次。
    """
    checkpoint()
    sdf = np.asarray(sdf, dtype=np.float32)
    inside = sdf < 0
    if not inside.any() or inside.all():
        return sdf
    points, normals = _crossings(sdf)
    size = 2 * REACH + 1
    near = ndimage.maximum_filter(inside, size=size) != ndimage.minimum_filter(inside, size=size)
    centers = np.argwhere(near)
    distance, nearest = cKDTree(points).query(centers, workers=-1)
    plane = np.abs(np.einsum("ij,ij->i", centers - points[nearest], normals[nearest]))
    # 切平面距离在表面拐弯处会偏小，不让它比到那个交点的直线距离小太多
    plane = np.minimum(np.maximum(plane, distance - 1.0), REACH).astype(np.float32)
    at = tuple(centers.T)
    out = np.where(inside, -float(REACH), float(REACH)).astype(np.float32)
    out[at] = np.where(inside[at], -plane, plane)
    return out


def _window(sdf, origin, size, margin=REACH + 4):
    """把盒子换成正好围住表面、四周留 margin 格的那一个。返回 (新盒子里的场, 新起点)。

    推表面的时候让盒子跟着表面走，每一步只在它周围算，而不是一开始就把「最远能走到的地方」全留出来。
    盒子外面补出来的地方都算外部：调用之前表面离旧盒子的边还有距离，或者那一面已经是整个网格的边。
    """
    lo, hi = _box(sdf < 0, 10 ** 9, margin=0)
    lo = [max(a + o - margin, 0) for a, o in zip(lo, origin)]
    hi = [min(b + o + margin, size) for b, o in zip(hi, origin)]
    out = np.full([b - a for a, b in zip(lo, hi)], float(REACH), dtype=np.float32)
    source, target = [], []
    for a, b, o, s in zip(lo, hi, origin, sdf.shape):
        start, stop = max(a, o), min(b, o + s)
        source.append(slice(start - o, stop - o))
        target.append(slice(start - a, stop - a))
    out[tuple(target)] = sdf[tuple(source)]
    return out, tuple(lo)


def _crowded(sdf, origin, size):
    """表面是不是快碰到盒子的边了（那一面已经是整个网格的边就不算），或者盒子比需要的大太多。"""
    lo, hi = _box(sdf < 0, 10 ** 9, margin=0)
    for a, b, o, s in zip(lo, hi, origin, sdf.shape):
        before, after = a, s - b
        if (before < REACH + 2 and o > 0) or (after < REACH + 2 and o + s < size):
            return True
        if before > 3 * REACH + 8 or after > 3 * REACH + 8:
            return True
    return False


def _box(mask_any_axes, size, margin):
    """mask 在三个轴上的范围，向外留 margin，裁到网格以内。"""
    lo, hi = [], []
    for axis in range(3):
        other = tuple(a for a in range(3) if a != axis)
        hit = np.flatnonzero(mask_any_axes.any(axis=other))
        lo.append(max(int(hit[0]) - margin, 0))
        hi.append(min(int(hit[-1]) + margin + 1, size))
    return tuple(lo), tuple(hi)


def upsample(coarse, refine, origin, shape):
    """把量子网格上的场三线性插值到细网格的一个盒子里。

    细网格第 j 格的中心对应量子网格坐标 (j + 0.5) / refine - 0.5。
    """
    coarse = np.asarray(coarse, dtype=np.float32)
    if refine == 1:
        return coarse[tuple(slice(o, o + s) for o, s in zip(origin, shape))]
    # 只放大盒子覆盖到的那部分（外加一圈），不放大整个网格
    c0 = [max(o // refine - 1, 0) for o in origin]
    c1 = [min(-(-(o + s) // refine) + 1, coarse.shape[a]) for a, (o, s) in enumerate(zip(origin, shape))]
    block = coarse[tuple(slice(a, b) for a, b in zip(c0, c1))]
    fine = ndimage.zoom(block, refine, order=1, mode="nearest", grid_mode=True)
    start = [o - c * refine for o, c in zip(origin, c0)]
    return fine[tuple(slice(s, s + n) for s, n in zip(start, shape))]


def fit(ls, reach):
    """让盒子正好盖住「表面最多能走到的地方」（离现在的表面 reach 个体素以内）。

    多出来的部分裁掉，省时间；不够的地方补上，免得表面长到盒子边上被切平。不会超出整个细网格。
    """
    inside = ls.sdf < 0
    if not inside.any():
        return ls
    size = ls.n * ls.refine
    margin = int(np.ceil(reach)) + 2
    lo, hi = _box(inside, 10 ** 9, margin=0)
    lo = [max(a + o - margin, 0) for a, o in zip(lo, ls.origin)]            # 换成细网格里的位置
    hi = [min(b + o + margin, size) for b, o in zip(hi, ls.origin)]
    before = [max(o - a, 0) for a, o in zip(lo, ls.origin)]
    after = [max(b - (o + s), 0) for b, o, s in zip(hi, ls.origin, ls.sdf.shape)]
    sdf, origin = ls.sdf, list(ls.origin)
    if any(before) or any(after):
        sdf = rebuild(np.pad(sdf, list(zip(before, after)), mode="edge"))    # 补出来的地方重新算距离
        origin = [o - b for o, b in zip(origin, before)]
    box = tuple(slice(a - o, b - o) for a, b, o in zip(lo, hi, origin))
    return replace(ls, sdf=np.ascontiguousarray(sdf[box]), origin=tuple(lo))


# ── 网格 → 水平集（VDB from Polygons） ───────────────────────────────────────

def from_mesh(mesh, transform, n, refine=1, fill="holes"):
    """在表面附近的窄带里算有符号距离。transform 把模型坐标变到量子网格坐标。

    做法：在表面上撒足够密的点 → 点落到的体素是「壳」→ 填充得到内外 →
    窄带里的体素到最近采样点的距离就是无符号距离，符号由内外决定。
    采样点数只和表面积有关，和三角形的形状无关，所以面数很少的模型也快。
    """
    size = n * refine
    scale = float(transform[0, 0]) * refine                 # 细网格体素 / 模型单位
    count = int(np.clip(mesh.area * scale * scale * SAMPLES_PER_VOXEL, 50_000, 6_000_000))
    points, face_index = trimesh.sample.sample_surface(mesh, count, seed=0)
    normals = np.asarray(mesh.face_normals)[face_index]
    points = np.asarray(points) @ transform[:3, :3].T + transform[:3, 3]
    points = (points + 0.5) * refine - 0.5                  # 量子网格坐标 → 细网格下标

    margin = 3 * refine + 4          # 给表面往外长留的余地
    lo = np.clip(np.floor(points.min(axis=0)).astype(int) - margin, 0, size)
    hi = np.clip(np.ceil(points.max(axis=0)).astype(int) + margin + 1, 0, size)
    shape = tuple(int(v) for v in hi - lo)

    touched = np.zeros(shape, dtype=bool)
    cell = np.clip(np.rint(points).astype(int) - lo, 0, np.array(shape) - 1)
    touched[cell[:, 0], cell[:, 1], cell[:, 2]] = True
    band = ndimage.distance_transform_edt(~touched) <= BAND + 1
    checkpoint()
    centers = np.argwhere(band)
    distance, nearest = cKDTree(points).query(centers + lo, workers=-1)
    distance = distance.astype(np.float32)

    # 壳 = 中心离表面不到一格的体素。只用「采样点落到的格子」当壳会漏：表面只擦过一个角的格子
    # 可能一个点都没落到，填充时外面就从这些小孔灌进去了。表面穿过的格子中心离它最多 0.87 格，
    # 所以按距离取一定是封闭的。
    checkpoint()
    shell = np.zeros(shape, dtype=bool)
    shell[tuple(centers.T)] = distance <= 1.0
    if fill == "holes":
        inside = ndimage.binary_fill_holes(shell)
    elif fill == "capped":
        inside = pipeline.fill_capped(shell)
    else:
        inside = shell

    sdf = _mask_sdf(inside)
    at = tuple(centers.T)
    if fill == "none":
        # 只要外壳：把它当成一张有厚度的薄片
        sdf[at] = distance - 0.75
        sdf[~band] = np.maximum(sdf[~band], BAND - 0.75)
        return LevelSet(sdf, tuple(int(v) for v in lo), n, refine)

    # 壳上的体素，中心可能在表面的任意一侧：看它在最近那个面的法线的哪一边
    side = np.einsum("ij,ij->i", centers + lo - points[nearest], normals[nearest]) >= 0
    sure_out = ~inside[at]
    if sure_out.any() and side[sure_out].mean() < 0.5:
        side = ~side                                        # 模型的法线整体朝里
    agree = side[sure_out].mean() if sure_out.any() else 1.0
    on_shell = shell[at]
    outside = np.where(on_shell, side, sure_out) if agree > 0.8 else sure_out
    # 封底时垫出来的底面上没有采样点，那里（只在内部）用掩膜距离；别处用采样点的精确距离
    capped = np.minimum(distance, np.abs(sdf[at]) + 0.5)
    sdf[at] = np.where(outside, distance, -capped)
    return LevelSet(sdf, tuple(int(v) for v in lo), n, refine)


def coverage(ls):
    """水平集 → 量子网格上的覆盖率（VDB 里的 SDF → fog）：每个格子有多大比例在物体里面。

    0/1 体素化会把表面碰到的格子全算成实心，整个模型胖出半格多；覆盖率的 0.5 等值面就是真实表面。
    """
    size = ls.n * ls.refine
    fine = np.zeros((size,) * 3, dtype=np.float32)
    box = tuple(slice(o, o + s) for o, s in zip(ls.origin, ls.sdf.shape))
    fine[box] = np.clip(0.5 - ls.sdf, 0.0, 1.0)             # 表面穿过的细格子按距离取 0–1
    k = ls.refine
    return fine.reshape(ls.n, k, ls.n, k, ls.n, k).mean(axis=(1, 3, 5))


def fatness(ls, occupancy):
    """量子网格上的占据比水平集的真实表面平均「胖」出多少（单位：量子网格的格）。

    体积差除以表面积。覆盖率输入时约为 0，0/1 输入时约 0.6–0.7。
    """
    volume = float((ls.sdf < 0).sum()) / ls.refine ** 3
    area = float((np.abs(ls.sdf) < 0.5).sum()) / ls.refine ** 2
    return (float(np.asarray(occupancy).sum()) - volume) / max(area, 1.0)


# ── 密度 → 水平集（Convert VDB：fog → SDF） ──────────────────────────────────

def from_density(density, level, refine=1):
    """量子处理后的密度，在阈值处取等值面，变成水平集。"""
    density = np.asarray(density, dtype=np.float32)
    n = density.shape[0]
    solid = density >= level
    if not solid.any():
        raise ValueError(f"阈值 {level:.2f} 以上没有任何格子")
    lo, hi = _box(solid, n, margin=2)
    origin = tuple(v * refine for v in lo)
    shape = tuple((b - a) * refine for a, b in zip(lo, hi))
    field = level - upsample(density, refine, origin, shape)   # 内部为负
    return LevelSet(rebuild(field), origin, n, refine)


# ── 平流（VDB Advect） ────────────────────────────────────────────────────

def advect(ls, density, occupancy, amount, field="threshold", level=0.5):
    """让表面沿着由量子结果导出的场移动。amount 以量子网格的格子为单位。

    threshold： 法向速度 = 量子结果 - 阈值。表面从两侧被吸向「阈值等值面」，是稳定的
                （Houdini 的 VDB Morph SDF 就是这样）。量越大越接近直接取阈值的结果，原模型的细节越少。
    difference：法向速度 = 量子结果 - 原始占据。没有量子效果时速度处处为 0。它不稳定：
                表面稍微偏外就被继续往外推，偏里就继续往里缩，量大了会碎裂。
    gradient：  速度 = 量子结果的梯度，一个矢量速度场（VDB Advect 本来的用法）。
                梯度在表面处指向实心内部，所以效果是整体向内收，密度边缘越陡收得越多。

    两个标量场都是在量子网格上算的，而 0/1 的量子输入比真实表面胖半格多。
    所以先把表面往外挪到和输入对齐的位置再推，推完挪回来，否则推出来的大部分是这个错位。
    """
    if field not in FIELDS:
        raise ValueError(f"未知的场 {field}")
    total = float(amount) * ls.refine                        # 细网格体素
    if total <= 0:
        return ls
    size = ls.n * ls.refine
    density = np.asarray(density, dtype=np.float32)

    if field == "gradient":
        # 矢量场：半拉格朗日法，每个体素沿速度往回找它原来的值
        grads = np.gradient(ndimage.gaussian_filter(density, 0.7))
        peak = max(float(np.sqrt(sum(g * g for g in grads)).max()), 1e-9)
        grads = [g / peak for g in grads]
        steps = max(1, int(np.ceil(total)))                  # 速度最大是 1，每步最多走一个体素
        dt = total / steps
        sdf, origin = _window(ls.sdf, ls.origin, size)
        pull = None
        for step in range(steps):
            checkpoint()
            if pull is None:                                 # 盒子换了：这个盒子里每个体素往回找的位置
                grid = np.meshgrid(*[np.arange(s, dtype=np.float32) for s in sdf.shape], indexing="ij")
                pull = [g - upsample(v, ls.refine, origin, sdf.shape) * dt for g, v in zip(grid, grads)]
                del grid
            sdf = ndimage.map_coordinates(sdf, pull, order=1, mode="nearest")
            if step % 2 == 1 or step == steps - 1:
                sdf = _tidy(sdf)
                if _crowded(sdf, origin, size):
                    (sdf, origin), pull = _window(sdf, origin, size), None
        return replace(ls, sdf=rebuild(sdf), origin=origin)

    # 标量速度：水平集方程 ∂φ/∂t + F|∇φ| = 0
    source = density - (np.asarray(occupancy, dtype=np.float32) if field == "difference" else level)
    fastest = float(np.abs(source).max())
    if fastest < 1e-6:
        return ls                                           # 没有量子效果：原样不动
    shift = fatness(ls, occupancy) * ls.refine              # 输入比真实表面胖出来的量
    sdf, origin = _window(ls.sdf.astype(np.float32) - shift, ls.origin, size)
    steps = max(1, int(np.ceil(total * fastest / 0.75)))    # 每步最多移动不到一个体素
    dt = total / steps
    speed = anchor = trend = None
    tidied = 0
    for step in range(steps):
        checkpoint()
        if speed is None:
            speed = upsample(source, ls.refine, origin, sdf.shape)
        sdf = sdf - dt * speed * np.minimum(_slope(sdf), 2.0)
        if step % 2 == 1 or step == steps - 1:               # 整理距离场最费时间，隔一步做一次
            sdf = _tidy(sdf)
            if _crowded(sdf, origin, size):
                (sdf, origin), speed, anchor, trend = _window(sdf, origin, size), None, None, None
            elif anchor is None:
                anchor, tidied = sdf, 0
            else:
                tidied += 1
                if tidied == 4:
                    # 表面到了它要去的等值面就停下，不用把剩下的步数走完。它是越走越慢地靠过去的：
                    # 每隔几步量一次这段时间走了多远，按变慢的比例估计剩下的路，不到四分之一格就算到了
                    near = np.abs(sdf) < 1.0
                    moved = float(np.percentile(np.abs(sdf - anchor)[near], 99)) if near.any() else 0.0
                    slowing = trend is not None and moved < trend
                    if moved < 0.02 or (slowing and moved * moved / (trend - moved) < 0.25):
                        break
                    anchor, trend, tidied = sdf, moved, 0
    sdf = _shift(sdf, shift)
    return replace(ls, sdf=rebuild(sdf), origin=origin)


# ── 平滑（VDB Smooth SDF）和改形（VDB Reshape SDF） ───────────────────────────

def _shift(sdf, distance):
    """把表面沿法线挪 distance 格（正数向里）。每次最多挪两格再整理，保证它一直在算得准的那一圈里。

    进来的场只要表面两侧 REACH 格以内是准的就行；出去的也是（远处要用 rebuild 补）。
    """
    steps = int(np.ceil(abs(distance) / (REACH - 2.0)))
    for _ in range(steps):
        sdf = _tidy(sdf + float(distance) / steps)
    return sdf


def smooth(ls, kind="gaussian", width=1.0):
    """在体素上平滑表面。width 以细网格体素为单位。

    gaussian / mean / median 是对距离场直接滤波；curvature 是平均曲率流：
    小步高斯扩散和重新整理距离场交替进行，尖的地方退得快，平的地方几乎不动。
    """
    if kind not in FILTERS:
        raise ValueError(f"未知的平滑方式 {kind}")
    if kind == "none" or width <= 0:
        return ls
    sdf = ls.sdf
    if kind == "gaussian":
        sdf = ndimage.gaussian_filter(sdf, float(width))
    elif kind == "mean":
        sdf = ndimage.uniform_filter(sdf, size=2 * max(1, int(round(width))) + 1)
    elif kind == "median":
        for _ in range(max(1, int(round(width)))):
            checkpoint()
            sdf = ndimage.median_filter(sdf, size=3)
    else:
        for _ in range(int(np.clip(round(2 * width * width), 1, 12))):
            sdf = _tidy(ndimage.gaussian_filter(sdf, 0.7))
    return ls.with_sdf(rebuild(sdf))


def offset(ls, distance):
    """正数整体加厚（dilate），负数收缩（erode）。以细网格体素为单位。"""
    if distance == 0:
        return ls
    return ls.with_sdf(rebuild(_shift(ls.sdf, -float(distance))))


def close(ls, radius):
    """闭合：先加厚再收缩同样的量。比 radius 窄的缝和小孔会被填上，别处基本不变。"""
    return ls if radius <= 0 else offset(offset(ls, radius), -radius)


def open_(ls, radius):
    """开运算：先收缩再加厚。比 radius 细的刺和连丝会被去掉。"""
    return ls if radius <= 0 else offset(offset(ls, -radius), radius)


# ── 水平集 → 网格（Convert VDB） ────────────────────────────────────────────

def to_mesh(ls):
    """在距离为 0 的地方取表面，顶点换回量子网格坐标。"""
    sdf = ls.sdf
    if not (sdf.min() < 0 < sdf.max()):
        raise ValueError("表面消失了：整个形状被收缩没了，或者填满了整个盒子。把推移量或收缩量调小。")
    padded = np.pad(sdf, 1, mode="constant", constant_values=float(max(sdf.max(), 1.0)))
    verts, faces, _, _ = measure.marching_cubes(padded, level=0.0, gradient_direction="descent")
    verts = (verts - 1 + np.array(ls.origin) + 0.5) / ls.refine - 0.5
    return trimesh.Trimesh(vertices=verts, faces=faces, process=False)
