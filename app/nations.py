"""把体素分成几个「国家」，让它们一回合一回合地演化。

想法来自 Moth 的 Motte 模型（Wootton，A quantum procedure for map generation）：每个国家是一个量子比特，
它自己的三个量（Bloch 矢量的 X、Y、Z）是进攻、防守、探索三种倾向；相邻两国之间的纠缠是它们的关系。
体素是领土。

每个国家在被测量之前，处在「做」和「不做」的叠加里：只知道概率，不知道结果。每回合：

  1. 按各国「想要」的倾向和邻国之间的关系强度，制备一个量子态（每个量子比特转到想要的方向，
     相邻的两个之间加一个 ZZ 纠缠门，关系越紧转得越多）。
  2. 对每个国家问一件事（进攻、防守或探索里的一件，越想做的越容易被问到），所有国家一起测量。
     一次只能问一件，这是量子力学的限制。关系紧的两国会商量着问同一件事；它们各自看像抛硬币，
     却常常一起动或一起不动。
  3. 问的是什么、答的是「是」还是「否」，决定这个国家这一回合做什么，每种行动在形状上留下一种痕迹：

       问进攻   是 → 进攻：吃掉对方贴着自己的那一层。对方在防守时，一国打不动，两国同回合一起打才打得动；
                     互相进攻则两边的前线都打没了，裂开一道缝。对方剩得太少时整个吞并。
                否 → 逃离：和最不亲的邻国脱开接触，整个国家往外挪一格。逃得多了就离开大陆，成了孤岛。
       问防守   是 → 筑墙：在靠近边界的外表面上垒一层。
                否 → 分裂：守不住自己，离得远的那一半独立成一个新的国家（只有长大了的国家才分得开）。
       问探索   是 → 生长：把自己境内的缺口补上，并朝离开身体中心的方向往外长。
                否 → 萎缩：伸得最远的那些表面体素脱落。萎缩到一格不剩，这个国家就自己灭亡了。

     一个国家越是拿不定主意（和别国纠缠得越多，自己的 Bloch 矢量越短），答「否」的机会越接近一半：
     关系换来的是同进同退，代价是更容易退却、分裂和萎缩。
  4. 各国想要的倾向和彼此的关系跟着变：丢了领土更想进攻，得了领土更想守，刚问过的事暂时不那么想；
     打过仗关系变淡。每国每回合只用心经营一段关系（没打过仗的邻国里现在最亲的那个），两国互相看中时
     关系涨得快，没人经营的关系慢慢变淡。

为什么只经营一段：纠缠有排他性。实测过，如果和所有邻国的关系都一起变紧，每一对之间的默契反而被别的
关系冲掉，各国的行动变成互不相干的抛硬币。只有少数几段排他的关系，盟友才会真的一起行动。

量子的部分是真的线路模拟（状态矢量），每回合只有还活着的国家占量子比特，可以原样放到真实设备上跑。
随机数在模拟里用带种子的伪随机数代替测量的随机性，同样的种子得到同样的历史。也可以换成外面给的
一池随机字节（dice，见 qrng.Pool）：建国怎么分、每回合问什么、测出什么，都按顺序从那一池里拿。
"""
from dataclasses import dataclass, field

import numpy as np
from scipy import ndimage
from scipy.cluster.vq import kmeans2

MAX_ALIVE = 16                                 # 同时活着的国家数上限（每国一个量子比特）
MAX_TOTAL = 24                                 # 整段历史里出现过的国家数上限
ALLIED = 0.5                                   # 关系强度到这个数，两国就算盟友，会商量着行动
ASK = ("attack", "defend", "explore")          # 三个问题，对应 Bloch 矢量的 X、Y、Z
YES = ("attack", "fortify", "grow")            # 每个问题答「是」做什么
NO = ("flee", "split", "wither")               # 答「否」做什么
# 把要问的那个方向转到 Z 上再测量：X 用 H，Y 用 H·S†，Z 不用转
_H = np.array([[1, 1], [1, -1]], dtype=np.complex128) / np.sqrt(2)
_BASIS = (_H, _H @ np.array([[1, 0], [0, -1j]], dtype=np.complex128), np.eye(2, dtype=np.complex128))
_SHIFTS = [(axis, step) for axis in range(3) for step in (1, -1)]


# ── 量子的部分 ───────────────────────────────────────────────────────────

def prepare(directions, ties):
    """制备这一回合的量子态。directions：每个国家想要的 Bloch 方向（k×3，会被归一化）；
    ties：{(i, j): 0..1}，相邻两国的关系强度，1 对应纠缠最强的 ZZ 门（转 π/2）。"""
    directions = np.asarray(directions, dtype=np.float64).reshape(-1, 3)
    k = len(directions)
    if k > 20:
        raise ValueError("国家数最多 20 个")
    psi = np.ones(1, dtype=np.complex128)
    for x, y, z in directions:
        norm = np.sqrt(x * x + y * y + z * z)
        if norm < 1e-12:
            x, y, z, norm = 0.0, 0.0, 1.0, 1.0
        theta, phi = np.arccos(np.clip(z / norm, -1, 1)), np.arctan2(y, x)
        psi = np.kron(psi, np.array([np.cos(theta / 2), np.exp(1j * phi) * np.sin(theta / 2)]))
    if ties:
        index = np.arange(2 ** k)
        sign = [1 - 2 * ((index >> (k - 1 - q)) & 1) for q in range(k)]     # 第 q 个量子比特的 Z 值
        angle = np.zeros(2 ** k)
        for (i, j), strength in ties.items():
            angle -= (np.pi / 4) * float(strength) * sign[i] * sign[j]      # exp(-i θ/2 ZZ)，θ = strength·π/2
        psi = psi * np.exp(1j * angle)
    return psi


def bloch(psi, k):
    """每个量子比特实际的 Bloch 矢量（k×3）。和别的量子比特纠缠得越多，它越短。"""
    out = np.zeros((k, 3))
    for q in range(k):
        part = psi.reshape(2 ** q, 2, -1)
        rho = np.einsum("aib,ajb->ij", part, part.conj())
        out[q] = 2 * rho[0, 1].real, -2 * rho[0, 1].imag, (rho[0, 0] - rho[1, 1]).real
    return out


def measure(psi, k, questions, rng):
    """每个量子比特按 questions 里指定的方向（0、1、2 = X、Y、Z）一起测一次。返回 k 个 True/False。"""
    state = psi.reshape([2] * k)
    for q, axis in enumerate(questions):
        if axis != 2:
            state = np.moveaxis(np.tensordot(_BASIS[axis], state, axes=([1], [q])), 0, q)
    prob = np.abs(state.ravel()) ** 2
    outcome = int(np.searchsorted(np.cumsum(prob), rng.random() * prob.sum()))
    outcome = min(outcome, 2 ** k - 1)
    return [((outcome >> (k - 1 - q)) & 1) == 0 for q in range(k)]


def agreement(psi, k, i, j, questions):
    """按这一回合问的方向，i 和 j 的答案有多一致（-1..1），减掉各自倾向能解释的部分。
    正数：一起动或一起不动；0：互不相干。"""
    state = psi.reshape([2] * k)
    for q in (i, j):
        if questions[q] != 2:
            state = np.moveaxis(np.tensordot(_BASIS[questions[q]], state, axes=([1], [q])), 0, q)
    prob = np.abs(state) ** 2
    pair = prob.sum(axis=tuple(q for q in range(k) if q not in (i, j)))
    if i > j:
        pair = pair.T
    zi, zj = pair[0].sum() - pair[1].sum(), pair[:, 0].sum() - pair[:, 1].sum()
    return float(pair[0, 0] + pair[1, 1] - pair[0, 1] - pair[1, 0] - zi * zj)


# ── 领土 ────────────────────────────────────────────────────────────────

def partition(solid, k, seed=0):
    """把实心的体素按位置分成 k 块（k-means），返回每个体素属于哪一块，空的是 -1。"""
    points = np.argwhere(solid)
    if len(points) < k:
        raise ValueError("实体体素比国家数还少")
    np.random.seed(seed % (2 ** 32))                    # kmeans2 的初始化用的是全局随机数
    _, label = kmeans2(points.astype(np.float64), k, minit="++", seed=seed % (2 ** 32))
    for missing in sorted(set(range(k)) - set(label.tolist())):   # 偶尔会有空的一类：从最大的一类里分一半
        big = np.flatnonzero(label == np.bincount(label, minlength=k).argmax())
        label[big[: len(big) // 2]] = missing
    owner = np.full(solid.shape, -1, dtype=np.int8)
    owner[tuple(points.T)] = label
    return owner


def _neighbour(owner, axis, step):
    """每个体素在某个方向上隔壁那一格属于谁；网格外面算 -2。"""
    out = np.full(owner.shape, -2, dtype=owner.dtype)
    src = [slice(None)] * 3
    dst = [slice(None)] * 3
    src[axis] = slice(1, None) if step == 1 else slice(None, -1)
    dst[axis] = slice(None, -1) if step == 1 else slice(1, None)
    out[tuple(dst)] = owner[tuple(src)]
    return out


def borders(owner, k):
    """相邻关系：shared[i, j] 是 i、j 两国贴着的面数，exposed[i] 是 i 露在外面（挨着空格子）的面数。"""
    shared = np.zeros((k, k), dtype=np.int64)
    exposed = np.zeros(k, dtype=np.int64)
    own = owner >= 0
    for axis, step in _SHIFTS:
        other = _neighbour(owner, axis, step)
        touch = own & (other >= 0) & (other != owner)
        np.add.at(shared, (owner[touch], other[touch]), 1)
        np.add.at(exposed, owner[own & (other == -1)], 1)
    return shared, exposed


@dataclass
class World:
    owner: np.ndarray                 # 每个体素属于哪个国家，-1 是空的
    total: int                        # 到现在为止出现过几个国家（编号 0..total-1，灭亡的不重新用）
    want: np.ndarray                  # MAX_TOTAL×3：各国想要的进攻、防守、探索
    ties: dict                        # {(i, j)}：相邻两国的关系强度 0..1
    away: np.ndarray                  # 每个格子离原来的形状有多远（体素）
    centre: np.ndarray                # 整个形状的中心
    home: np.ndarray                  # MAX_TOTAL×3：各国现在的中心
    unit: float                       # 建国时一个国家平均有多少体素，各种门槛按它来定
    parent: list = field(default_factory=list)      # 各国是从谁那里独立出来的，建国时就有的是 None
    exiled: set = field(default_factory=set)        # 已经离开大陆的国家
    turn: int = 0
    history: list = field(default_factory=list)


def found(solid, k, seed=0, dice=None):
    """建国：分块，再按每块在身体上的位置定它一开始的性格。
    露在外面的面多 → 想探索；被邻国围着的面多 → 想防守；地盘小 → 想进攻。
    dice：随机数的来源；不给就用种子。"""
    solid = np.asarray(solid) > 0.5
    if not 2 <= k <= MAX_ALIVE:
        raise ValueError(f"国家数要在 2 到 {MAX_ALIVE} 之间")
    owner = partition(solid, k, seed if dice is None else dice.integers(2 ** 31))
    shared, exposed = borders(owner, k)
    size = np.bincount(owner[owner >= 0], minlength=k).astype(np.float64)
    faces = shared.sum(axis=1) + exposed + 1e-9
    rng = dice if dice is not None else np.random.default_rng(seed)
    want = np.ones((MAX_TOTAL, 3))
    want[:k] = np.clip(np.stack([size.mean() / (size + 1e-9), 2.0 * shared.sum(axis=1) / faces,
                                 2.0 * exposed / faces], axis=1), 0.3, 3.0) * rng.uniform(0.8, 1.25, size=(k, 3))
    home = np.full((MAX_TOTAL, 3), np.nan)
    home[:k] = np.array(ndimage.center_of_mass(solid, owner + 1, np.arange(1, k + 1)))
    ties = {(i, j): 0.15 for i in range(k) for j in range(i + 1, k) if shared[i, j] > 0}
    return World(owner, k, want, ties, ndimage.distance_transform_edt(~solid),
                 np.array(ndimage.center_of_mass(solid)), home, float(size.mean()), [None] * k)


def step(world, seed=0, reach=6.0, memory=0.8, dice=None):
    """演化一回合，就地修改 world，返回这一回合的记录。
    reach：长出来的东西最多离原来的表面多远（体素）；memory：性格变化的惯性；
    dice：随机数的来源，不给就用种子和回合数。"""
    owner = world.owner
    rng = dice if dice is not None else np.random.default_rng([seed % (2 ** 32), world.turn])
    shared, exposed = borders(owner, MAX_TOTAL)
    size = np.bincount(owner[owner >= 0], minlength=MAX_TOTAL)
    alive = [i for i in range(world.total) if size[i] > 0]
    slot = {i: q for q, i in enumerate(alive)}              # 国家 → 这一回合它占第几个量子比特
    kq = len(alive)
    ties = {pair: t for pair, t in world.ties.items()
            if pair[0] in slot and pair[1] in slot and shared[pair] > 0}
    events = []

    # 1. 量子：制备。测量之前每个国家都是「做」和「不做」的叠加，只有概率
    psi = prepare(world.want[alive], {(slot[i], slot[j]): t for (i, j), t in ties.items()})
    real = bloch(psi, kq)
    asked = {i: int(rng.choice(3, p=world.want[i] / world.want[i].sum())) for i in alive}
    allied = set()
    for (i, j), tie in sorted(ties.items(), key=lambda item: -item[1]):
        # 关系紧的两国商量着来，这一回合问同一件事（每国只跟关系最紧的那一个盟友商量）
        if tie >= ALLIED and i not in allied and j not in allied:
            both = world.want[i] + world.want[j]
            asked[i] = asked[j] = int(rng.choice(3, p=both / both.sum()))
            allied.update((i, j))
    odds = {i: float(np.clip((1 + real[slot[i], asked[i]]) / 2, 0, 1)) for i in alive}
    # 2. 一起测量：叠加在这一刻变成确定的「是」或「否」
    answers = measure(psi, kq, [asked[i] for i in alive], rng) if kq else []
    said = {i: bool(answers[slot[i]]) for i in alive}
    action = {i: (YES if said[i] else NO)[asked[i]] for i in alive}

    # 3. 改领土。先看好每个体素六个方向上是谁，再按顺序改
    new = owner.copy()
    around = [_neighbour(owner, axis, step_) for axis, step_ in _SHIFTS]
    beside = lambda who: np.any([other == who for other in around], axis=0)      # noqa: E731  挨着 who 的格子

    def weakest(i):
        """i 最不亲的邻国：关系最淡的，一样淡就挑边界最长的。"""
        rivals = [j for j in alive if j != i and shared[i, j] > 0]
        if not rivals:
            return None
        return min(rivals, key=lambda j: (ties.get((min(i, j), max(i, j)), 0.0), -shared[i, j]))

    # 进攻
    target = {i: weakest(i) for i in alive if action[i] == "attack"}
    target = {i: j for i, j in target.items() if j is not None}
    pressure = np.bincount(np.array(list(target.values()), dtype=np.int64), minlength=MAX_TOTAL)   # 被几国同时进攻
    fought, wars, broken, taken = set(), [], [], {}
    for i, j in target.items():
        fought.add((min(i, j), max(i, j)))
        front = (owner == j) & beside(i)                  # j 贴着 i 的那一层
        if target.get(j) == i:
            new[front] = -1                               # 互相进攻：两边的前线都打没了，裂开一道缝
            if i < j:
                wars.append([i, j])
                events.append({"type": "war", "who": i, "whom": j})
        elif action[j] != "fortify" or pressure[j] >= 2:
            new[front] = i                                # 没在防守，或者被两国以上同时进攻
            taken.setdefault(j, []).append(i)
            if action[j] == "fortify" and j not in broken:
                broken.append(j)
                events.append({"type": "breach", "who": [a for a, b in target.items() if b == j], "whom": j})
    for j, attackers in taken.items():                    # 剩得太少的，整个被吞并
        left = int((new == j).sum())
        if 0 < left < max(6.0, 0.3 * world.unit):
            winner = max(attackers, key=lambda a: shared[a, j])
            new[new == j] = winner
            events.append({"type": "annex", "who": winner, "whom": j})
    # 这一回合领土已经丢光的国家不再行动：不然它原来要做的「生长」会在旧地盘旁边把它又长回来
    fallen = {j for j in taken if not (new == j).any()}

    empty = (owner == -1) & (world.away <= reach)
    grid = np.stack(np.meshgrid(*[np.arange(s) for s in owner.shape], indexing="ij"), axis=-1)
    for i in alive:
        if i in fallen:
            continue
        if action[i] == "fortify":
            # 筑墙：在靠近边界的外表面上垒一层（离原来的表面不超过 reach 的一半）
            foreign = ndimage.binary_dilation((owner >= 0) & (owner != i), iterations=2)
            zone = (owner == i) & foreign
            wall = empty & (world.away <= reach / 2) & np.any(
                [_neighbour(zone.astype(np.int8), axis, step_) == 1 for axis, step_ in _SHIFTS], axis=0)
            new[wall & (new == -1)] = i
        elif action[i] == "grow":
            # 生长：补上境内的缺口（原来的身体里空出来的地方），并朝离开身体中心的方向长，
            # 只长在一个圆锥里，所以伸出来的是一个角而不是整体变胖
            near = (owner == -1) & beside(i)
            out = world.home[i] - world.centre
            out = out / max(np.linalg.norm(out), 1e-9)
            offset = grid - world.home[i]
            cone = (offset @ out) >= 0.75 * np.linalg.norm(offset, axis=-1)       # 夹角约 41° 以内
            new[near & ((world.away == 0) | (cone & (world.away <= reach))) & (new == -1)] = i
        elif action[i] == "wither":
            # 萎缩：露在外面的体素里，离本国中心比一半体素都远的那些脱落
            mine = owner == i
            far = np.linalg.norm(grid - world.home[i], axis=-1)
            skin = mine & np.any([other == -1 for other in around], axis=0) & (far >= np.median(far[mine]))
            new[skin & (new == i)] = -1

    # 分裂：离得远的那一半独立
    for i in alive:
        if action[i] != "split" or i in fallen:
            continue
        points = np.argwhere(new == i)
        living = len(np.unique(new[new >= 0]))
        parts = None
        # 只有长得比建国时的平均大小大出一截的国家才分得开：帝国会分裂，小国不会
        if len(points) >= 1.3 * world.unit and world.total < MAX_TOTAL and living < MAX_ALIVE:
            np.random.seed(int(rng.integers(2 ** 31)))
            _, label = kmeans2(points.astype(np.float64), 2, minit="++", seed=int(rng.integers(2 ** 31)))
            parts = [points[label == 0], points[label == 1]]
            if min(len(parts[0]), len(parts[1])) < 0.3 * world.unit:
                parts = None
        if parts is None:
            action[i] = "waver"                           # 想分也分不了：太小了，或者世界上的国家已经满了
            continue
        leaving = max(parts, key=lambda part: np.linalg.norm(part.mean(axis=0) - world.home[i]))
        staying = parts[0] if leaving is parts[1] else parts[1]
        child = world.total
        world.total += 1
        world.parent.append(i)
        new[tuple(leaving.T)] = child
        world.home[child], world.home[i] = leaving.mean(axis=0), staying.mean(axis=0)
        world.want[child] = world.want[i] * [1.5, 1.0, 1.0]       # 新独立的更好斗一点
        events.append({"type": "split", "who": i, "whom": child})

    # 逃离：和最不亲的邻国脱开，整个往外挪一格
    for i in alive:
        if action[i] != "flee" or i in fallen:
            continue
        threat = weakest(i)
        if threat is not None:
            new[(owner == i) & beside(threat) & (new == i)] = -1
        mine = new == i
        if not mine.any():
            continue
        out = world.home[i] - world.centre
        move = np.rint(out / max(np.abs(out).max(), 1e-9)).astype(int)        # 最主要的方向上一格，斜着走也行
        landed = np.argwhere(mine) + move
        if move.any() and (landed >= 0).all() and (landed < np.array(owner.shape)).all():
            new[mine] = -1
            free = new[tuple(landed.T)] == -1                             # 撞到别国的那些体素就丢了
            new[tuple(landed[free].T)] = i
            world.home[i] = world.home[i] + move
    world.owner = new

    # 4. 清点：谁灭亡了，谁离开了大陆；性格和关系跟着变
    after = np.bincount(new[new >= 0], minlength=MAX_TOTAL)
    new_shared, _ = borders(new, MAX_TOTAL)
    annexed = {e["whom"] for e in events if e["type"] == "annex"}
    for i in alive:
        if after[i] == 0 and i not in annexed:
            cause = ("conquered" if i in taken else "withered" if action[i] == "wither"
                     else "war" if any(i in pair for pair in wars) else "fled" if action[i] == "flee" else "gone")
            events.append({"type": "death", "who": i, "cause": cause, "by": taken.get(i)})
        elif after[i] > 0 and action[i] == "flee" and new_shared[i].sum() == 0 and i not in world.exiled:
            world.exiled.add(i)
            events.append({"type": "exile", "who": i})
    change = (after - size) / np.maximum(size, 1)
    want = world.want.copy()
    for i in alive:
        want[i, asked[i]] *= 0.6 if said[i] else 0.85         # 刚问过的事，暂时不那么想
    lost = np.array([after[i] < size[i] and i in taken for i in range(MAX_TOTAL)])
    want[:, 0] += 3.0 * np.maximum(-change, 0) * lost + 0.6 * lost    # 被抢了领土：更想进攻
    want[:, 1] += 3.0 * np.clip(change, 0, 1)                         # 得了领土：更想守住
    world.want = np.clip(memory * want + (1 - memory) * 1.0, 0.1, 6.0)

    favourite = {}
    for i in alive:                                           # 每国这一回合用心经营的那一段关系
        friends = [j for j in alive if j != i and (min(i, j), max(i, j)) in ties
                   and (min(i, j), max(i, j)) not in fought]
        if friends:
            favourite[i] = max(friends, key=lambda j: (ties[(min(i, j), max(i, j))], shared[i, j]))
    for pair in list(world.ties):
        i, j = pair
        before = world.ties[pair]
        if after[i] == 0 or after[j] == 0:
            del world.ties[pair]
            continue
        if pair in fought:
            world.ties[pair] = max(before - 0.35, 0.0)
        elif pair in ties:
            chosen = (favourite.get(i) == j) + (favourite.get(j) == i)
            if chosen == 2:
                world.ties[pair] = before + 0.3 * (1.0 - before)      # 互相看中：很快变紧
            elif chosen == 1:
                world.ties[pair] = before + 0.03 * (1.0 - before)     # 一厢情愿：慢慢涨一点
            else:
                world.ties[pair] = before * 0.85                      # 没人经营：变淡
        elif new_shared[pair] == 0:
            world.ties[pair] = before * 0.7                           # 已经不挨着了
        if before < ALLIED <= world.ties[pair]:
            events.append({"type": "ally", "who": i, "whom": j})
        elif world.ties[pair] < ALLIED <= before:
            events.append({"type": "rift", "who": i, "whom": j})
    for i in range(world.total):                              # 新挨上的邻国，从没有关系开始
        for j in range(i + 1, world.total):
            if new_shared[i, j] > 0 and (i, j) not in world.ties:
                world.ties[(i, j)] = 0.0

    listed = lambda values: [values.get(i) for i in range(world.total)]      # noqa: E731  按国家编号排成表
    record = {
        "turn": world.turn + 1,
        "size": after[:world.total].tolist(),
        "asked": listed({i: ASK[a] for i, a in asked.items()}),
        "odds": listed({i: round(p, 3) for i, p in odds.items()}),           # 测量之前答「是」的概率
        "said": listed(said),
        "action": listed(action),
        "certainty": listed({i: round(float(np.linalg.norm(real[slot[i]])), 3) for i in alive}),
        "attacks": [[i, j] for i, j in target.items()],
        "ties": [[i, j, round(t, 2)] for (i, j), t in sorted(world.ties.items())
                 if t >= 0.05 and after[i] > 0 and after[j] > 0],
        "borders": [[i, j] for i in range(world.total) for j in range(i + 1, world.total) if new_shared[i, j] > 0],
        "home": [None if after[i] == 0 else np.round(np.argwhere(new == i).mean(axis=0), 1).tolist()
                 for i in range(world.total)],
        "exiled": sorted(world.exiled),
        "events": events,
        "wars": wars,
        "broken": broken,
    }
    world.turn += 1
    world.history.append(record)
    return record


def run(solid, k=12, turns=30, seed=0, reach=6.0, dice=None):
    """从一个体素网格开始演化 turns 回合，全都灭亡了就提前停。
    返回 (world, 每回合结束时的领土图)，第 0 张是建国时的。"""
    world = found(solid, k, seed, dice=dice)
    frames = [world.owner.copy()]
    for _ in range(turns):
        step(world, seed=seed, reach=reach, dice=dice)
        frames.append(world.owner.copy())
        if not (world.owner >= 0).any():
            break
    return world, frames


def grooves(owner):
    """在国与国的边界上刻一道一格宽的沟（去掉编号较小一侧贴着边界的那一层），单色打印也看得出疆界。"""
    cut = np.zeros(owner.shape, dtype=bool)
    for axis, step_ in _SHIFTS:
        other = _neighbour(owner, axis, step_)
        cut |= (owner >= 0) & (other >= 0) & (other > owner)
    out = owner.copy()
    out[cut] = -1
    return out
