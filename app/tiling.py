"""把大网格切成 Atlas 一次算得动的小块。

Atlas 一个任务的结果不能超过约 2 MB：32³（3.3 万个数）没问题，64³（26 万个数）会失败。
所以大网格要分块，每块单独提交，再拼回去。

为什么分块不会改变效果的「性格」：Quantum Blur Core 把每个轴用 Gray 码排到量子比特上，
低位的量子比特只在小范围里搬运数值，高位的才跨越大范围，而且（reach=0 时）位越高转得越少。
把一个轴切成长度为 2^b 的块，等于只保留最低的 b 个量子比特 —— 丢掉的是转得最少的那几个。
Gray 码是「反射」的：奇数号的块在整条轴上是倒着排的，所以提交前把它翻过来、拿回结果再翻回去，
这样拼出来的结果和「整块计算但不转高位」完全一致（tests 里有验证）。
"""
import hashlib
from dataclasses import dataclass

import numpy as np

MODES = ("cube", "layers")


def tile_shape(n, mode="cube", budget_bits=15):
    """每个轴上分块的长度（都是 2 的次方），保证一块的格子数不超过 2**budget_bits。

    cube：三个方向尽量一样长，三个方向都保留尽量多的量子比特，最接近整块计算。
    layers：水平方向尽量铺满，竖直方向只取几层 —— 一层一层往上算，和 3D 打印的方式对应；
            代价是竖直方向的模糊只在这几层之间发生。
    """
    if mode not in MODES:
        raise ValueError(f"未知的分块方式 {mode}")
    nb = int(np.log2(n))
    if 3 * nb <= budget_bits:
        return (n, n, n)
    if mode == "layers":
        bx = min(nb, (budget_bits + 1) // 2)
        by = min(nb, budget_bits - bx)
        bz = min(nb, budget_bits - bx - by)
    else:
        base, extra = divmod(budget_bits, 3)
        bz = min(nb, base + (1 if extra >= 1 else 0))     # 多出来的位先给竖直方向
        by = min(nb, base + (1 if extra >= 2 else 0))
        bx = min(nb, base)
    return (2 ** bx, 2 ** by, 2 ** bz)


@dataclass
class Tile:
    index: tuple       # 第几块 (i, j, k)
    slices: tuple      # 在整个网格里的位置
    flips: tuple       # 提交前要翻转的轴（奇数号的块）
    data: np.ndarray   # 已经翻好的、连续存放的数据


def split(grid, shape):
    """按 shape 切块。全空的块也会给出来，由调用方决定跳不跳过。"""
    counts = [grid.shape[a] // shape[a] for a in range(3)]
    for i in range(counts[0]):
        for j in range(counts[1]):
            for k in range(counts[2]):
                index = (i, j, k)
                slices = tuple(slice(index[a] * shape[a], (index[a] + 1) * shape[a]) for a in range(3))
                flips = tuple(a for a in range(3) if index[a] % 2)
                data = np.ascontiguousarray(np.flip(grid[slices], flips) if flips else grid[slices])
                yield Tile(index, slices, flips, data)


def place(out, tile, result):
    """把一块的结果放回去。

    每个任务的输出都被引擎按自己的最大值缩放过，块和块之间不可比；
    模糊不改变数值总量，所以把这块的总量调回它输入的总量，各块就回到同一把尺子上。
    """
    result = np.asarray(result, dtype=np.float64)
    total = float(result.sum())
    if not np.isfinite(total) or total <= 0:
        raise ValueError("有一个分块的结果全是 0，可能处理失败了")
    result = result * (float(tile.data.sum()) / total)
    out[tile.slices] = np.flip(result, tile.flips) if tile.flips else result


def summary(grid, shape):
    """这个网格按 shape 分块后的情况，给界面显示用。jobs 是真正要算的块数：空块不算，内容相同的只算一次。"""
    distinct = {hashlib.sha1(t.data.tobytes()).digest() for t in split(grid, shape) if t.data.any()}
    total = int(np.prod([grid.shape[a] // shape[a] for a in range(3)]))
    return {"shape": list(shape), "jobs": len(distinct), "total": total}


def is_untouched(tile, params):
    """这一块交给引擎也不会变，可以不提交。

    整块都是同一个非零值时，编码出来是所有量子比特都在 |+> 上的均匀叠加态，它是 Rx 的本征态，
    怎么转都只多一个整体相位，读出来和输入一样。带 Ry 的门或者有限次测量就不成立了。
    """
    data = tile.data
    return (set(params.get("style") or "x") == {"x"} and not params.get("shots")
            and float(data.min()) == float(data.max()) > 0)
