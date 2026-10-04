"""量子处理的两个本地版本：高斯替身，和 Quantum Blur Core 的本地近似模拟。

本地模拟按 Atlas 文档描述的做法实现：数值做振幅编码，每个轴用 Gray 码排到
量子比特上（相邻格子只差一位），对每个量子比特做一次单比特旋转，再读出概率。
参数名和 blur-core-v1 一致，所以预览时调好的参数可以原样提交给 Atlas。

注意：每个量子比特的旋转角是按公开信息推断的，没有用真实任务校准过，
所以它只用来预览效果的「性格」，最终结果以 Atlas 返回的为准。
"""
import numpy as np
from scipy.ndimage import gaussian_filter

# strength=1 时最低位量子比特的旋转角
MAX_ANGLE = np.pi


def mock_blur(grid, sigma=1.0):
    """替身：普通高斯模糊。仅用于测试流程。"""
    return gaussian_filter(np.asarray(grid, dtype=np.float32), sigma=float(sigma))


def _gate(style, theta):
    """style 里的每个字母依次作用（x → Rx，y → Ry），共用同一个角度。"""
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    gates = {
        "x": np.array([[c, -1j * s], [-1j * s, c]]),
        "y": np.array([[c, -s], [s, c]], dtype=np.complex128),
    }
    u = np.eye(2, dtype=np.complex128)
    for letter in style:
        u = gates[letter] @ u
    return u


def _qubit_weights(bits, reach):
    """reach=0：位越高转得越少（只影响附近）；reach=1：所有量子比特转得一样多。"""
    local = 2.0 ** -np.arange(bits)        # 第 0 位是 Gray 码最低位，连接相邻格子
    return (1.0 - reach) * local + reach


def quantum_blur(values, strength=0.5, style="x", reach=0.0, axes=None, shots=None, seed=None):
    """Quantum Blur Core 的本地近似。输入输出形状相同，strength=0 时原样返回。"""
    values = np.asarray(values, dtype=np.float64)
    if values.min() < 0:
        raise ValueError("values 不能有负数")
    if not style or any(ch not in "xy" for ch in style):
        raise ValueError("style 只能由 x、y 组成")
    total = values.sum()
    if total <= 0:
        raise ValueError("values 全是 0")

    nd = values.ndim
    axes = list(range(nd)) if axes is None else [a % nd for a in axes]
    strengths = list(strength) if np.ndim(strength) else [float(strength)] * len(axes)
    if len(strengths) != len(axes):
        raise ValueError("strength 列表的长度要和 axes 一致")

    # 每个轴补到 2 的次方，多出来的格子振幅为 0
    bits = [int(np.ceil(np.log2(s))) if s > 1 else 0 for s in values.shape]
    padded = np.zeros([2 ** b for b in bits])
    padded[tuple(slice(0, s) for s in values.shape)] = values
    psi = np.sqrt(padded / total).astype(np.complex128)

    for ax, s in zip(axes, strengths):
        nb = bits[ax]
        if nb == 0 or s == 0:
            continue
        size = 2 ** nb
        gray = np.arange(size) ^ (np.arange(size) >> 1)
        psi = np.moveaxis(psi, ax, 0)
        rest = psi.shape[1:]
        state = np.empty_like(psi)
        state[gray] = psi                                 # 位置 i 放到基态 gray(i)
        state = state.reshape((2,) * nb + (-1,))          # 最高位在前
        weights = _qubit_weights(nb, reach)
        for k in range(nb):
            u = _gate(style, MAX_ANGLE * s * weights[k])
            q = nb - 1 - k
            state = np.moveaxis(np.tensordot(u, state, axes=([1], [q])), 0, q)
        psi = np.moveaxis(state.reshape((size,) + rest)[gray], 0, ax)

    prob = np.abs(psi) ** 2
    if shots:
        rng = np.random.default_rng(seed)
        flat = prob.ravel() / prob.sum()
        prob = rng.multinomial(int(shots), flat).reshape(prob.shape) / float(shots)
    out = prob * total
    return out[tuple(slice(0, s) for s in values.shape)].astype(np.float32)
