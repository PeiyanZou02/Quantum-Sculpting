"""手动测试用：启动一个假的 Atlas，再启动指向它的应用（http://127.0.0.1:8766）。

API key 和所有输出都放在临时目录，不碰真实的 key，也不碰项目里的 input/、grids/、output/。
在界面里填 fake_atlas.TEST_KEY，就能在没有真 key 的情况下把 Atlas 那条路径点一遍。
"""
import sys
import tempfile
from pathlib import Path

here = Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "app"))
sys.path.insert(0, str(here))

import server                                # noqa: E402
from fake_atlas import TEST_KEY, FakeAtlas   # noqa: E402

fake = FakeAtlas(port=8799).start()
fake.polls_needed = 4                        # 配合 2 秒一次的轮询，任务大约跑 6 秒
scratch = tempfile.mkdtemp(prefix="quantum-sculpting-test-")
print(f"Fake Atlas at {fake.base} | test key: {TEST_KEY} | scratch: {scratch}", flush=True)
sys.argv = [sys.argv[0], "--port", "8766", "--atlas-base", fake.base, "--home", scratch, "--data", scratch]
server.main()
