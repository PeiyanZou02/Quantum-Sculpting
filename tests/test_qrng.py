"""「演化」从 Atlas 取随机数：一池字节怎么发、怎么读 Atlas 的返回、提交什么参数。

运行：  python -m unittest discover -s tests -v
"""
import os
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import atlas     # noqa: E402
import nations   # noqa: E402
import qrng      # noqa: E402


def ball(n=24, radius=8):
    grid = np.indices((n, n, n)) - (n - 1) / 2
    return (grid ** 2).sum(axis=0) <= radius ** 2


class PoolTest(unittest.TestCase):
    def test_bytes_go_out_in_order_and_then_the_pool_is_stretched(self):
        pool = qrng.Pool(bytes(range(10)))
        self.assertEqual(pool.take(4), bytes([0, 1, 2, 3]))
        self.assertEqual((pool.used, pool.stretched), (4, 0))
        tail = pool.take(10)
        self.assertEqual(tail[:6], bytes([4, 5, 6, 7, 8, 9]))
        self.assertEqual((pool.used, pool.stretched), (14, 4))
        # 展开出来的部分只由这一池字节决定：分几次拿、拿多少，拿到的都是同一串
        whole = qrng.Pool(bytes(range(10))).take(9000)
        self.assertEqual(whole[:14], bytes([0, 1, 2, 3]) + tail)
        pieces = qrng.Pool(bytes(range(10)))
        self.assertEqual(b"".join(pieces.take(n) for n in (7, 1, 500, 4500, 3992)), whole)
        self.assertNotEqual(qrng.Pool(bytes(range(1, 11))).take(9000)[10:], whole[10:])
        with self.assertRaises(ValueError):
            qrng.Pool(b"")

    def test_draws_follow_the_odds_they_are_given(self):
        pool = qrng.Pool(os.urandom(40000))
        picks = np.bincount([pool.choice(3, p=[1.0, 2.0, 5.0]) for _ in range(6000)], minlength=3) / 6000
        np.testing.assert_allclose(picks, [0.125, 0.25, 0.625], atol=0.03)
        values = [pool.random() for _ in range(2000)]
        self.assertTrue(all(0.0 <= v < 1.0 for v in values))
        self.assertAlmostEqual(float(np.mean(values)), 0.5, delta=0.03)
        spread = pool.uniform(0.8, 1.25, size=(4, 3))
        self.assertEqual(spread.shape, (4, 3))
        self.assertTrue(((spread >= 0.8) & (spread < 1.25)).all())
        self.assertTrue(all(0 <= pool.integers(2 ** 31) < 2 ** 31 for _ in range(50)))
        self.assertEqual(pool.stretched, 0)
        # 一个选项的概率是 0，就永远选不到它
        self.assertNotIn(0, {qrng.Pool(bytes([0, 0]) * 4).choice(3, p=[0.0, 1.0, 1.0])})

    def test_the_same_bytes_give_the_same_history_and_other_bytes_another(self):
        data = os.urandom(4000)
        world, frames = nations.run(ball(), k=5, turns=10, reach=3.0, dice=qrng.Pool(data))
        again, same = nations.run(ball(), k=5, turns=10, reach=3.0, dice=qrng.Pool(data))
        self.assertEqual(world.history, again.history)
        for a, b in zip(frames, same):
            np.testing.assert_array_equal(a, b)
        other, _ = nations.run(ball(), k=5, turns=10, reach=3.0, dice=qrng.Pool(os.urandom(4000)))
        self.assertNotEqual(world.history, other.history)
        # 每回合用掉的字节不超过估的数
        pool = qrng.Pool(data)
        nations.run(ball(), k=5, turns=10, reach=3.0, dice=pool)
        self.assertGreater(pool.used, 10 * (5 * 2 + 6))
        self.assertLess(pool.used, qrng.need(10))

    def test_without_dice_nothing_changed(self):
        world, frames = nations.run(ball(), k=5, turns=6, seed=7, reach=3.0)
        again, same = nations.run(ball(), k=5, turns=6, seed=7, reach=3.0)
        self.assertEqual(world.history, again.history)
        np.testing.assert_array_equal(frames[-1], same[-1])


class AtlasAnswerTest(unittest.TestCase):
    # 真实服务返回的样子（2026-10-05，ibm_boston 上的一次，只留用得到的字段）
    OUTPUT = {
        "random": {"hex": "9f3a00ff", "bytes": 4, "bits": 32, "requested_bytes": 4, "derived": {}},
        "entropy_report": {"grade": "hardware-accounted", "entropy_accounted": True, "h_bit": 0.658816700758044,
                           "health_passed": True, "budget_bits": 540358.5577551622, "statements": ["…"],
                           "witness_violates_classical": True},
        "entropy": {"h_bit": 0.658816700758044, "raw_bits": 1000000, "ordering_penalty_bits": 118458.14300288181},
        "provenance": {"mode": "qpu", "backend": "ibm_boston", "provider_job_id": "abc", "qpu_seconds": 5},
        "bell_witness": {"enabled": True, "S": 2.7166, "sigma_S": 0.014678617509833819,
                         "violates_classical_3sigma": True, "kind": "chsh_fidelity_witness"},
        "raw": {"counts": {"0110": 1}},
    }

    def test_bytes_and_where_they_came_from(self):
        data, summary, detail = qrng.parse({"result": {"output": self.OUTPUT}})
        self.assertEqual(data, bytes([0x9f, 0x3a, 0x00, 0xff]))
        self.assertEqual(summary, {
            "bytes": 4, "accounted": True, "grade": "hardware-accounted", "h_bit": 0.658816700758044,
            "healthy": True, "device": "qpu", "backend": "ibm_boston", "qpu_seconds": 5.0,
            "bell": {"s": 2.7166, "sigma": 0.014678617509833819, "violates": True}})
        self.assertEqual(sorted(detail), ["bell_witness", "entropy", "entropy_report", "provenance"],
                         "全部测量结果太大，不留")
        self.assertEqual(qrng.summarise(4, detail), summary, "留档的说明足够把摘要重算出来")

    def test_the_simulator_is_a_baseline_and_has_no_bell_test(self):
        emu = {**self.OUTPUT,
               "entropy_report": {"grade": "simulator-baseline", "entropy_accounted": False, "h_bit": 0.93,
                                  "health_passed": True, "witness_violates_classical": None},
               "provenance": {"mode": "emu", "backend": "aer", "qpu_seconds": None},
               "bell_witness": {"enabled": False}}
        _, summary, _ = qrng.parse({"result": {"output": emu}})
        self.assertEqual((summary["accounted"], summary["grade"], summary["device"], summary["backend"]),
                         (False, "simulator-baseline", "emu", "aer"))
        self.assertEqual((summary["qpu_seconds"], summary["bell"]), (None, None))

    def test_only_the_bytes_are_required(self):
        data, summary, _ = qrng.parse({"result": {"random": {"hex": "00ff"}}})
        self.assertEqual(data, b"\x00\xff")
        self.assertEqual((summary["bytes"], summary["accounted"], summary["device"], summary["bell"]),
                         (2, None, None, None))
        # 引擎的说明里写的是 certificate；真实的响应里没有，万一以后有了也读得出来
        _, summary, _ = qrng.parse({"result": {"output": {
            "random": {"hex": "00"}, "certificate": {"certified": True, "grade": "hardware", "h_bit": 0.91}}}})
        self.assertEqual((summary["accounted"], summary["grade"], summary["h_bit"]), (True, "hardware", 0.91))

    def test_answers_that_cannot_be_used_are_refused(self):
        for body in ({"result": {"output": {"random": {"hex": ""}}}},        # 能提取的熵是 0
                     {"result": {"output": {"certificate": {}}}},
                     {"result": {"output": {"random": {"hex": "xyz"}}}},
                     {"result": [1, 2, 3]}, {}):
            with self.assertRaises(atlas.AtlasError, msg=str(body)):
                qrng.parse(body)

    def test_what_is_asked_of_each_device(self):
        params, mode = qrng.request("emu", qrng.need(60))
        self.assertIsNone(mode)
        self.assertEqual((params["mode"], params["output_bytes"]), ("emu", 128 + 64 * 60))
        self.assertLessEqual(params["num_qubits"] + (8 if params["bell_witness"] else 0), 20, "模拟器最多 20 个量子比特")
        params, mode = qrng.request("qpu", 10 ** 9)
        self.assertEqual(mode, "qpu")
        self.assertNotIn("mode", params)
        self.assertTrue(params["bell_witness"])
        self.assertEqual(params["output_bytes"], 1_000_000)
        for params, _ in (qrng.request("emu", 1), qrng.request("qpu", 1)):
            self.assertLessEqual(params["shots"], 10000)
            self.assertFalse(params["include_raw_counts"])


if __name__ == "__main__":
    unittest.main()
