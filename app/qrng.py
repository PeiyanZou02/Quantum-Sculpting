"""「演化」的随机数也可以从 Atlas 的 Comet Quantum RNG（comet-qrng-v1）取。

引擎做的事（见 https://api.mothquantum.com/openapi.json 里它的说明）：把一排量子比特制备到 |+⟩，
在模拟器（emu）或 IBM 的芯片（qpu）上测量，估计测到的数据里有多少熵，再提取成均匀的随机字节，
连同一份说明这批字节来历的证书一起返回。

  POST /engines/comet-qrng-v1/process  {"params": {...}}，要真芯片时再加顶层的 "mode": "qpu"
  结果在 result.output：random.hex 是字节，entropy_report / provenance / bell_witness 是来历

两种设备差别很大，界面上要照实说：
  emu  Atlas 的模拟器。出来的是伪随机数，引擎自己评为 "simulator-baseline"，只作对照。
  qpu  真的 IBM 量子芯片，用的是 Moth 自己的 IBM 账户。引擎评为 "hardware-accounted"：
       熵是按测到的数据核算的。附带的 Bell 检验只说明这块芯片的纠缠门和读出够好，引擎自己写明
       它不是「与设备无关的认证」。

在真实服务上见过的（2026-10-05）：模拟器一次；真芯片三次，分别落在 ibm_marrakesh、ibm_boston、ibm_fez，
每次占用芯片 5 秒，从提交到取回约 2 分钟。API 的总说明里写 mode=qpu 需要账户有 run_quantum 权限，
但没有这个权限的账户也跑通了（任务的 gated_features 是空的）；被拒绝时是 403，不花额度。

一次运行只提交一个任务（5 个 credits）。取回的那一池字节按顺序用：建国怎么分、每回合问什么、
测出什么，都从里面拿。用完了就接着用这一池字节展开出来的（SHAKE-256），并记下是从哪一回合开始的。
"""
import hashlib

import numpy as np

import atlas

ENGINE = "comet-qrng-v1"
CREDITS = 5                 # 每次运行花的额度（引擎页上标的 credits_per_run）
DEVICES = ("emu", "qpu")


def need(turns):
    """演化 turns 回合大约要多少字节。每回合：每国 2 个字节决定问什么，6 个字节决定测出什么，
    偶尔有国家分裂再用 8 个；按 16 国、留一倍余量估。"""
    return 128 + 64 * int(turns)


def request(device, want):
    """交给 Atlas.submit 的 (params, mode)。

    能提取多少字节，取决于 量子比特数 × 测量次数：引擎只拿得到每种结果出现了几次，拿不到先后顺序，
    所以每次测量要扣掉大约 log2(测量次数) 个比特。模拟器整个线路最多 20 个量子比特，Bell 检验要占 8 个，
    只剩 12 个时几乎提取不出东西，所以模拟器上不做 Bell 检验，20 个全用来出随机数。
    实测：模拟器 20 个量子比特 × 10000 次给了 8,388 字节；真芯片 100 个量子比特给 8 千到 6 万多字节，
    差在最偏的那个量子比特上（引擎按最差的一个估每比特的熵）。
    """
    want = int(min(max(want, 32), 1_000_000))
    common = {"shots": 10000, "output_bytes": want, "include_raw_counts": False}
    if device == "qpu":
        return {"num_qubits": 100, "bell_witness": True, **common}, "qpu"
    return {"mode": "emu", "num_qubits": 20, "bell_witness": False, **common}, None


def _number(value):
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _text(value):
    return value[:80] if isinstance(value, str) and value else None


def summarise(nbytes, detail):
    """给界面看的摘要。字段照真实服务返回的写：评级在 entropy_report 里；说明里写的 certificate
    真实的响应里没有，留着只是以防它以后出现。"""
    part = lambda name: detail[name] if isinstance(detail.get(name), dict) else {}     # noqa: E731
    report, cert, source, bell = part("entropy_report"), part("certificate"), part("provenance"), part("bell_witness")
    flag = lambda value: value if isinstance(value, bool) else None                    # noqa: E731
    accounted = flag(report.get("entropy_accounted"))
    h_bit = _number(report.get("h_bit"))
    return {
        "bytes": nbytes,
        "accounted": accounted if accounted is not None else flag(cert.get("certified")),   # 熵有没有按测到的数据核算
        "grade": _text(report.get("grade")) or _text(cert.get("grade")),
        "h_bit": h_bit if h_bit is not None else _number(cert.get("h_bit")),   # 每个测到的比特里估出来有多少熵
        "healthy": flag(report.get("health_passed")),
        "device": _text(source.get("mode")),
        "backend": _text(source.get("backend")),
        "qpu_seconds": _number(source.get("qpu_seconds")),
        "bell": None if _number(bell.get("S")) is None else {
            "s": _number(bell.get("S")), "sigma": _number(bell.get("sigma_S")),
            "violates": bell.get("violates_classical_3sigma") is True},
    }


def parse(body):
    """从 /jobs/{id}/result 的响应里取出 (随机字节, 给界面看的摘要, 留档用的全部说明)。
    除了字节本身，别的缺了都不算错。"""
    out = body.get("result") if isinstance(body, dict) else None
    if isinstance(out, dict) and isinstance(out.get("output"), dict):
        out = out["output"]
    random = out.get("random") if isinstance(out, dict) else None
    text = random.get("hex") if isinstance(random, dict) else None
    if not isinstance(text, str):
        fields = sorted(out) if isinstance(out, dict) else type(out).__name__
        raise atlas.AtlasError(f"看不懂 {ENGINE} 的返回结构，字段有：{fields}")
    try:
        data = bytes.fromhex(text)
    except ValueError as e:
        raise atlas.AtlasError(f"{ENGINE} 返回的随机数不是十六进制。") from e
    if not data:
        raise atlas.AtlasError(f"{ENGINE} 这次没有给出随机字节：测到的数据里能提取的熵是 0。")
    detail = {k: v for k, v in out.items() if k not in ("random", "raw")}        # raw 是全部测量结果，太大
    return data, summarise(len(data), detail), detail


class Pool:
    """一池随机字节，按顺序往外发；接口是 nations 用到的那几个 numpy 随机数方法。

    发完以后不停：接着发的是从这一池字节展开出来的（SHAKE-256），stretched 记着这样发了多少。
    同一池字节、同样的调用顺序，得到同样的结果，所以一段历史可以原样重放。
    """

    def __init__(self, data):
        self.data = bytes(data)
        if not self.data:
            raise ValueError("随机字节是空的")
        self.used = 0                # 一共发出去多少字节
        self._more = b""

    @property
    def stretched(self):
        """发出去的字节里，有多少已经不是池子里原来的。"""
        return max(self.used - len(self.data), 0)

    def take(self, n):
        start, self.used = self.used, self.used + n
        out = self.data[start:start + n]
        if len(out) < n:
            a = max(start - len(self.data), 0)
            b = self.used - len(self.data)
            if b > len(self._more):                         # SHAKE 的输出是前缀一致的，不够就多要一些
                self._more = hashlib.shake_256(b"quantum sculpting " + self.data).digest(max(2 * b, 4096))
            out += self._more[a:b]
        return out

    def _unit(self, n):
        """n 个字节换成 [0, 1) 里的一个数。"""
        return int.from_bytes(self.take(n), "big") / float(1 << (8 * n))

    def random(self):
        return self._unit(6)

    def choice(self, n, p=None):
        p = np.full(n, 1.0 / n) if p is None else np.asarray(p, dtype=np.float64)
        return int(min(np.searchsorted(np.cumsum(p), self._unit(2) * p.sum(), side="right"), n - 1))

    def integers(self, high):
        return int.from_bytes(self.take(4), "big") % int(high)

    def uniform(self, low, high, size):
        values = np.array([self._unit(2) for _ in range(int(np.prod(size)))]).reshape(size)
        return low + (high - low) * values
