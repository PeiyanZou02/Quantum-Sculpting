"""「演化」的检查：量子的部分有没有量子该有的性质，领土的规则是不是说的那样。

运行：  python -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import nations   # noqa: E402


def ball(n=24, radius=8):
    grid = np.indices((n, n, n)) - (n - 1) / 2
    return (grid ** 2).sum(axis=0) <= radius ** 2


class QuantumTest(unittest.TestCase):
    def test_without_ties_every_nation_keeps_the_character_it_wants(self):
        want = [[1, 0, 0], [0, 2, 0], [0, 0, 3], [1, 1, 1]]
        got = nations.bloch(nations.prepare(want, {}), 4)
        np.testing.assert_allclose(got[:3], np.eye(3), atol=1e-9)
        np.testing.assert_allclose(got[3], np.ones(3) / np.sqrt(3), atol=1e-9)     # 三样不能都拉满
        np.testing.assert_allclose(np.linalg.norm(got, axis=1), 1.0, atol=1e-9)

    def test_the_tighter_two_nations_are_tied_the_less_each_knows_its_own_mind(self):
        lengths = []
        for tie in (0.0, 0.5, 1.0):
            psi = nations.prepare([[1, 0, 0], [1, 0, 0]], {(0, 1): tie})
            lengths.append(np.linalg.norm(nations.bloch(psi, 2), axis=1)[0])
        self.assertAlmostEqual(lengths[0], 1.0)
        self.assertAlmostEqual(lengths[1], np.cos(np.pi / 4), places=6)
        self.assertAlmostEqual(lengths[2], 0.0, places=6)

    def test_fully_tied_nations_answer_like_coins_but_always_together(self):
        psi = nations.prepare([[1, 0, 0], [1, 0, 0]], {(0, 1): 1.0})
        self.assertAlmostEqual(nations.agreement(psi, 2, 0, 1, [0, 0]), 1.0, places=6)
        rng = np.random.default_rng(3)
        answers = [nations.measure(psi, 2, [0, 0], rng) for _ in range(600)]
        self.assertAlmostEqual(np.mean([a for a, _ in answers]), 0.5, delta=0.08)   # 单看一个：抛硬币
        self.assertTrue(all(a == b for a, b in answers))                            # 放在一起：总是一样
        # 没有关系的两国，答案互不相干
        free = nations.prepare([[1, 0, 1], [1, 0, 1]], {})
        self.assertAlmostEqual(nations.agreement(free, 2, 0, 1, [0, 0]), 0.0, places=6)

    def test_a_neighbour_turns_and_shrinks_what_a_nation_wants(self):
        """ZZ 门的效果有解析式：(x + iy) 乘上每个邻国的 (cos θ + i z_j sin θ)，z 不变。和模拟出来的对一下。"""
        want = np.array([[1.0, 0.4, 0.3], [0.2, 1.0, 0.8], [0.5, 0.5, 1.0]])
        ties = {(0, 1): 0.6, (0, 2): 0.3, (1, 2): 0.9}
        unit = want / np.linalg.norm(want, axis=1, keepdims=True)
        got = nations.bloch(nations.prepare(want, ties), 3)
        for i in range(3):
            xy = unit[i, 0] + 1j * unit[i, 1]
            for (a, b), tie in ties.items():
                if i in (a, b):
                    theta = tie * np.pi / 2
                    xy *= np.cos(theta) + 1j * unit[b if i == a else a, 2] * np.sin(theta)
            np.testing.assert_allclose(got[i], [xy.real, xy.imag, unit[i, 2]], atol=1e-9)

    def test_a_nation_asked_about_what_it_surely_wants_always_acts(self):
        psi = nations.prepare([[1, 0, 0], [0, 1, 0], [0, 0, 1]], {})
        rng = np.random.default_rng(0)
        for _ in range(20):
            self.assertEqual(nations.measure(psi, 3, [0, 1, 2], rng), [True, True, True])

    def test_too_many_nations_is_refused(self):
        with self.assertRaises(ValueError):
            nations.prepare(np.ones((21, 3)), {})


def world_of(owner, want, ties=None, unit=100.0):
    """手工摆一个世界：owner 里是各国的领土，want 是各国想要的进攻、防守、探索。"""
    owner = np.asarray(owner, dtype=np.int8)
    k = len(want)
    wants = np.ones((nations.MAX_TOTAL, 3))
    wants[:k] = want
    home = np.full((nations.MAX_TOTAL, 3), np.nan)
    for i in range(k):
        home[i] = np.argwhere(owner == i).mean(axis=0)
    return nations.World(owner.copy(), k, wants, dict(ties or {}), np.zeros(owner.shape),
                         np.argwhere(owner >= 0).mean(axis=0), home, unit, [None] * k)


def until(make, wanted, seeds=300):
    """测量结果是随机的：换着种子试，直到这一回合各国做的正好是 wanted。返回 (world, 记录)。"""
    for seed in range(seeds):
        world = make()
        record = nations.step(world, seed=seed, reach=0.0)
        if record["action"] == wanted:
            return world, record
    raise AssertionError(f"试了 {seeds} 个种子，没有出现 {wanted}")


ATTACK, DEFEND, EXPLORE = [9.0, 0.01, 0.01], [0.01, 9.0, 0.01], [0.01, 0.01, 9.0]


class TerritoryTest(unittest.TestCase):
    def test_founding_gives_every_voxel_to_one_of_the_nations(self):
        solid = ball()
        world = nations.found(solid, 6, seed=1)
        np.testing.assert_array_equal(world.owner >= 0, solid)
        self.assertEqual(sorted(set(world.owner[solid].tolist())), list(range(6)))
        self.assertEqual((world.total, world.parent), (6, [None] * 6))
        shared, exposed = nations.borders(world.owner, 6)
        np.testing.assert_array_equal(shared, shared.T)
        self.assertTrue((exposed > 0).all(), "球上每一块都有露在外面的面")
        self.assertEqual(set(world.ties), {(i, j) for i in range(6) for j in range(i + 1, 6) if shared[i, j]})
        with self.assertRaises(ValueError):
            nations.found(solid, nations.MAX_ALIVE + 1)

    def test_the_same_seed_gives_the_same_history(self):
        a, frames_a = nations.run(ball(), k=6, turns=12, seed=5)
        b, frames_b = nations.run(ball(), k=6, turns=12, seed=5)
        self.assertEqual(a.history, b.history)
        np.testing.assert_array_equal(frames_a[-1], frames_b[-1])
        # 前几回合的历史和一共跑多少回合无关：想停在哪一回合，把回合数设成那个数就行
        short, frames_s = nations.run(ball(), k=6, turns=5, seed=5)
        self.assertEqual(short.history, a.history[:5])
        np.testing.assert_array_equal(frames_s[-1], frames_a[5])
        _, frames_c = nations.run(ball(), k=6, turns=12, seed=6)
        self.assertFalse(np.array_equal(frames_a[-1], frames_c[-1]))

    def test_every_turn_is_a_question_a_probability_and_an_answer(self):
        world, frames = nations.run(ball(), k=6, turns=40, seed=4, reach=3.0)
        gone = set()
        for record, frame in zip(world.history, frames[1:]):
            total = len(record["size"])
            self.assertEqual(record["size"], np.bincount(frame[frame >= 0], minlength=total).tolist())
            self.assertLessEqual(sum(s > 0 for s in record["size"]), nations.MAX_ALIVE)
            for i in range(total):
                if record["action"][i] is None:
                    continue                               # 这一回合开始时就不在了，或者这一回合才独立出来
                self.assertIn(record["asked"][i], nations.ASK)
                self.assertTrue(0.0 <= record["odds"][i] <= 1.0)
                self.assertTrue(0.0 <= record["certainty"][i] <= 1.0 + 1e-6)
                axis = nations.ASK.index(record["asked"][i])
                expected = (nations.YES if record["said"][i] else nations.NO)[axis]
                self.assertIn(record["action"][i], (expected, "waver") if expected == "split" else (expected,))
            for i, j in record["attacks"]:
                self.assertEqual(record["action"][i], "attack")
                self.assertNotEqual(i, j)
            self.assertFalse(gone & {i for i, s in enumerate(record["size"]) if s > 0}, "灭亡的国家不会回来")
            gone |= {i for i, s in enumerate(record["size"]) if s == 0}
        self.assertLessEqual(world.total, nations.MAX_TOTAL)
        self.assertEqual(len(world.parent), world.total)
        kinds = {e["type"] for record in world.history for e in record["events"]}
        self.assertIn("ally", kinds, "四十回合里应该结过盟")
        did = {a for record in world.history for a in record["action"] if a}
        self.assertTrue({"attack", "fortify", "grow", "flee", "wither"} <= did, did)

    def test_mutual_attack_opens_a_crack(self):
        owner = np.full((6, 6, 6), -1)
        owner[:3], owner[3:] = 0, 1
        world, record = until(lambda: world_of(owner, [ATTACK, ATTACK], {(0, 1): 0.0}), ["attack", "attack"])
        self.assertEqual(record["wars"], [[0, 1]])
        self.assertIn({"type": "war", "who": 0, "whom": 1}, record["events"])
        self.assertTrue((world.owner[2:4] == -1).all(), "两边的前线都没了")
        self.assertTrue((world.owner[:2] == 0).all() and (world.owner[4:] == 1).all())
        self.assertLess(world.ties[(0, 1)], 0.01)

    def test_a_defence_holds_against_one_attacker_and_breaks_against_two(self):
        owner = np.full((9, 4, 4), -1)
        owner[:3], owner[3:6], owner[6:] = 0, 1, 2          # 1 夹在 0 和 2 中间
        ties = {(0, 1): 0.0, (1, 2): 0.0}
        world, record = until(lambda: world_of(owner, [ATTACK, DEFEND, EXPLORE], ties, unit=20.0),
                              ["attack", "fortify", "grow"])
        self.assertEqual(int((world.owner == 1).sum()), 48, "一国单独打，防守守得住")
        self.assertEqual(record["broken"], [])
        world, record = until(lambda: world_of(owner, [ATTACK, DEFEND, ATTACK], ties, unit=20.0),
                              ["attack", "fortify", "attack"])
        self.assertEqual(int((world.owner == 1).sum()), 16, "两国同一回合一起打，两边的前线都丢了")
        self.assertEqual(record["broken"], [1])
        self.assertIn({"type": "breach", "who": [0, 2], "whom": 1}, record["events"])

    def test_a_nation_with_too_little_left_is_annexed_whole(self):
        owner = np.full((9, 4, 4), -1)
        owner[:6], owner[6:8] = 0, 1                         # 1 只有两层，旁边还有一层空地
        world, record = until(lambda: world_of(owner, [ATTACK, EXPLORE], {(0, 1): 0.0}, unit=64.0),
                              ["attack", "grow"])
        self.assertIn({"type": "annex", "who": 0, "whom": 1}, record["events"])
        self.assertEqual(record["size"], [128, 0], "被吞并的那一回合，它原来想做的「生长」不会把它又长回来")
        self.assertFalse(any(e["type"] == "death" for e in record["events"]), "被吞并的不再另记一条灭亡")
        self.assertEqual(world.ties, {})

    def test_two_tied_nations_that_both_answer_no_flee_apart(self):
        owner = np.full((12, 4, 4), -1)
        owner[4:6], owner[6:8] = 0, 1
        # 关系拉满时两国各自像抛硬币，但总是一样：要么都进攻，要么都逃
        seen = set()
        for seed in range(40):
            world = world_of(owner, [ATTACK, ATTACK], {(0, 1): 1.0})
            seen.add(tuple(nations.step(world, seed=seed, reach=0.0)["action"]))
        self.assertEqual(seen, {("attack", "attack"), ("flee", "flee")})
        world, record = until(lambda: world_of(owner, [ATTACK, ATTACK], {(0, 1): 1.0}), ["flee", "flee"])
        left, right = np.argwhere(world.owner == 0)[:, 0], np.argwhere(world.owner == 1)[:, 0]
        self.assertLess(left.max(), 4, "0 往外退了")
        self.assertGreater(right.min(), 7, "1 往另一边退了")
        self.assertEqual({e["type"] for e in record["events"]}, {"exile"}, "两国都离开了大陆")
        self.assertEqual(record["exiled"], [0, 1])

    def test_a_nation_that_answers_no_to_exploring_withers(self):
        owner = np.full((9, 9, 9), -1)
        owner[2:7, 2:7, 2:7] = 0
        world, record = until(lambda: world_of(owner, [[1.0, 0.01, 0.2]]), ["wither"])
        self.assertLess(record["size"][0], 125)
        self.assertEqual(int(world.owner[4, 4, 4]), 0, "里面的还在")
        self.assertEqual(int(world.owner[2, 2, 2]), -1, "伸得最远的角先脱落")
        # 很小的国家，萎缩一次就没了
        tiny = np.full((5, 5, 5), -1)
        tiny[2, 2, 2] = 0
        world, record = until(lambda: world_of(tiny, [[1.0, 0.01, 0.2]]), ["wither"])
        self.assertEqual(record["size"], [0])
        self.assertIn({"type": "death", "who": 0, "cause": "withered", "by": None}, record["events"])

    def test_an_overgrown_nation_that_answers_no_to_defending_splits(self):
        owner = np.full((12, 6, 6), -1)
        owner[1:11, 1:5, 1:5] = 0                            # 160 格，是「一个国家该有的大小」的两倍
        world, record = until(lambda: world_of(owner, [[1.0, 0.25, 0.01]], unit=80.0), ["split", None])
        self.assertEqual((world.total, world.parent), (2, [None, 0]))
        self.assertIn({"type": "split", "who": 0, "whom": 1}, record["events"])
        self.assertEqual(sum(record["size"]), 160)
        self.assertGreaterEqual(min(record["size"]), 24)
        # 不够大的分不开
        world, record = until(lambda: world_of(owner, [[1.0, 0.25, 0.01]], unit=200.0), ["waver"])
        self.assertEqual(world.total, 1)

    def test_a_nation_cultivates_one_close_tie_and_the_rest_fade(self):
        world, _ = nations.run(ball(), k=6, turns=30, seed=3, reach=0.0)
        close = [pair for pair, tie in world.ties.items() if tie >= nations.ALLIED]
        self.assertGreater(len(close), 0, "三十回合里应该结成过盟友")
        partners = np.bincount(np.array(close).ravel())
        self.assertLessEqual(int(partners.max()), 2, "一国的铁盟友不会多")
        self.assertLess(len(close), len(world.ties), "不是和所有邻国都亲")

    def test_grooves_separate_the_nations(self):
        owner = np.full((6, 6, 6), -1, dtype=np.int8)
        owner[:3], owner[3:] = 0, 1
        cut = nations.grooves(owner)
        self.assertTrue((cut[2] == -1).all() and (cut[3] == 1).all() and (cut[:2] == 0).all())
        shared, _ = nations.borders(cut, 2)
        self.assertEqual(shared.sum(), 0)


if __name__ == "__main__":
    unittest.main()
