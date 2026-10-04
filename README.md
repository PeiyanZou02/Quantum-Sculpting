# Quantum cup

把一个 3D 模型体素化，交给 Moth Atlas 的 Quantum Blur Core 做整体变形，再转回可打印的 STL。
依据《量子杯子：AI × 摄影测量 × Quantum Blur Core 实操指南》做的本地应用原型。

## 启动

双击 `run.bat`。第一次会在 `%USERPROFILE%\.quantum-cup\venv` 建 Python 环境并安装依赖（几分钟），
之后直接打开 <http://127.0.0.1:8765>。需要 Python 3.10 以上，界面的三维预览需要联网加载 three.js。

Python 环境和 API key 都放在用户目录而不是这个文件夹里，所以不会被 OneDrive 同步；
换一台机器第一次运行会自动重建环境，key 需要重新填一次。

## 用法

1. **模型**：选择 .stl / .obj / .ply / .glb / .off，或把文件拖进预览窗口；也可以先用测试杯子。杯口不朝上时改「模型里朝上的轴」。
2. **体素化**：选 16³ / 32³ / 64³。改完立即重算，预览切到「体素」，右侧切片可以逐层检查。
3. **量子处理**
   - 高斯替身：普通模糊，只用来检查流程。
   - 本地模拟：在本机近似模拟 Quantum Blur Core，拖动参数实时更新。
   - Atlas：点右上角「设置 API key」填入 key，再点「提交到 Atlas」。同一组参数和实验名的结果缓存在 `grids/`，不会重复提交。
4. **转回模型**：拖阈值看形态变化，点「导出 STL」。文件写到 `output/`，同名 `.json` 记录这次用的全部参数。

## 目录

```
app/pipeline.py     模型 ⇄ 体素网格、marching cubes、打印检查
app/emulator.py     高斯替身 + Quantum Blur Core 的本地近似模拟
app/atlas.py        Atlas API 客户端（blur-core-v1）
app/server.py       本地服务（Flask，只监听 127.0.0.1）
app/static/         界面，样式遵循 Meridian 设计规范
tests/              单元测试、接口测试、假的 Atlas 服务
input/ grids/ output/   原始模型、Atlas 结果缓存、导出的 STL
```

## Atlas 接口

取自官方 OpenAPI 文档 <https://api.mothquantum.com/openapi.json>：

- `POST /api/v1/engines/blur-core-v1/process`，请求体 `{"params": {"values": 嵌套列表, "strength", "style", "reach", "axes", "shots"}}`，返回 `job_id`
- `GET /api/v1/jobs/{job_id}/status` 轮询到 `completed`
- `GET /api/v1/jobs/{job_id}/result` 取结果
- 认证：`Authorization: Bearer <key>`

## 测试

```
%USERPROFILE%\.quantum-cup\venv\Scripts\python.exe -m unittest discover -s tests
```

`tests/run_with_fake_atlas.py` 会启动一个假的 Atlas 和一个指向它的应用（端口 8766），
用来在没有真 key 的情况下点一遍 Atlas 那条路径；它的 key 和输出都在临时目录里。

## 已知的不确定之处

- 本地模拟里每个量子比特的旋转角是按公开信息推断的，没有用真实任务校准，只适合预览效果的「性格」。
- 64³ 的结果有 26 万多个数，可能超过 Atlas 单次结果约 2 MB 的上限（来自别人项目的经验，未亲自验证）。
- Atlas 结果的字段名文档写的是「嵌套列表」，别人项目里实际读到的是 `{"output": [...]}`，代码两种都接受。
