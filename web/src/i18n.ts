// The service (Peiyan's app/*.py) writes its messages in Chinese. Translate them here so the
// interface, the runtime log and every report stay in English, without diverging from upstream.
// Patterns are matched in order; captured groups are kept (numbers, names, details).

const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  // levels and meshing
  [/^阈值 ([\d.]+) 不在数据范围 \[([\d.]+), ([\d.]+)\] 内/, (_, l, a, b) => `Level ${l} is outside the data range [${a}, ${b}]. Lower the level or raise the strength.`],
  [/^阈值 ([\d.]+) 以上没有任何格子/, (_, l) => `No cells at or above level ${l}. Lower the level.`],
  [/^表面消失了/, 'The surface vanished: the shape shrank away or filled the whole box. Reduce the push or shrink amount.'],
  [/^细化后的网格不能超过 (\d+)³/, (_, n) => `The refined grid cannot exceed ${n}³.`],
  [/^结果全是 0/, 'The result is all zeros; processing probably failed.'],
  [/^结果是常数数组/, 'The result is constant; processing probably failed.'],
  [/^有一个分块的结果全是 0/, 'One tile came back all zeros; processing probably failed.'],
  // model and voxels
  [/^先选择一个模型/, 'Choose a model first.'],
  [/^还没有模型/, 'No model loaded yet.'],
  [/^先完成体素化/, 'Voxelise first.'],
  [/^先运行量子处理/, 'Run the quantum step first.'],
  [/^没有收到文件/, 'No file was received.'],
  [/^input\/ 里没有这个模型文件/, 'That model is not in input/.'],
  [/^不支持 (.+?) 文件/, (_, e) => `${e === '这种' ? 'This file type' : e} is not supported. Use .stl, .obj, .ply, .glb or .off.`],
  [/^读不了 (.+?)，文件可能损坏或不是网格模型。（(.+)）/, (_, f, e) => `Cannot read ${f}; the file may be damaged or not a mesh (${e}).`],
  [/^文件里没有三角面/, 'The file has no triangles. Export it as a mesh (.stl, .obj, .ply or .glb).'],
  [/^文件超过 300 MB/, 'The file is over 300 MB. Simplify it in Blender or MeshLab first.'],
  [/^体素化后没有任何实体格子/, 'Voxelising produced no solid cells; the model may be empty.'],
  [/^留白 (\d+) 对 (\d+)³ 的网格来说太大了/, (_, p, n) => `Padding ${p} is too large for a ${n}³ grid.`],
  [/^网格尺寸只能是 (.+) 之一/, (_, s) => `Grid size must be one of ${s}.`],
  [/^填充方式只能是 (.+) 之一/, (_, s) => `Fill must be one of ${s}.`],
  [/^不支持的朝向 (.+)/, (_, u) => `Unsupported up axis ${u}.`],
  [/^这不是一个布局/, 'That is not a composition (it has no compose or pos).'],
  // Evolve (app/nations.py, server.evolve)
  [/^未知的模式 nations/, 'This service does not know Evolve yet. Restart the local service to load it.'],
  [/^「演化」最大支持 (\d+)³ 的网格/, (_, n) => `Evolve works on grids up to ${n}³. Choose a smaller grid size first.`],
  [/^体素网格里没有实体格子/, 'The voxel grid has no solid cells.'],
  [/^实体体素比国家数还少/, 'There are fewer solid voxels than nations. Use fewer nations or a larger grid.'],
  [/^国家数要在 (\d+) 到 (\d+) 之间/, (_, a, b) => `The number of nations must be between ${a} and ${b}.`],
  [/^国家数最多 (\d+) 个/, (_, n) => `At most ${n} nations can be simulated at once.`],
  [/^未知的(模式|分块方式|场|填充方式|平滑方式) (.+)/, (_, k, v) => `Unknown ${({ 模式: 'mode', 分块方式: 'tiling', 场: 'field', 填充方式: 'fill', 平滑方式: 'smoothing' } as Record<string, string>)[k]} ${v}.`],
  // quantum parameters
  [/^至少选择一个模糊方向/, 'Choose at least one blur axis (X, Y or Z).'],
  [/^style 只能由 x、y 组成/, 'Style may only contain x and y (up to 4 letters).'],
  [/^strength 列表的长度要和 axes 一致/, 'The strength list must match the axes.'],
  [/^values 不能有负数/, 'Values cannot be negative.'],
  [/^values 全是 0/, 'Values are all zero.'],
  // API key and Atlas
  [/^先粘贴 API key/, 'Paste an API key first.'],
  [/^API key 里不应该有空格或换行/, 'The API key should not contain spaces or line breaks.'],
  [/^还没有设置 Atlas API key/, 'No Atlas API key set. Use Set API key under Quantum, or Atlas at the top right.'],
  [/^「(.+)」还在 Atlas 上运行/, (_, r) => `${r} is still running on Atlas. Wait for it to finish before submitting.`],
  [/^这次计算被更新的请求取代了/, 'Superseded by a newer request.'],
  [/^连不上 Atlas（(.+)）/, (_, e) => `Cannot reach Atlas (${e}). Check the network and try again.`],
  [/^Atlas 返回的不是 JSON（HTTP (\d+)）/, (_, c) => `Atlas did not return JSON (HTTP ${c}).`],
  [/^Atlas 返回 HTTP (\d+)。(.*)$/, (_, c, rest) => `Atlas returned HTTP ${c}. ${translateAtlasHint(rest)}`.trim()],
  [/^Atlas 任务 (\w+)：(.+)/, (_, s, d) => `Atlas job ${s}: ${d === '没有给出原因' ? 'no reason given' : d}`],
  [/^Atlas 的结果里没有数组/, 'The Atlas result has no array.'],
  [/^Atlas 返回的数组不是规则的数值网格/, 'Atlas returned an irregular array.'],
  [/^Atlas 返回了 (\d+) 个数，和输入的 (\d+) 个对不上/, (_, a, b) => `Atlas returned ${a} values; ${b} were sent.`],
  [/^看不懂 Atlas 的返回结构，字段有：(.+)/, (_, f) => `Unexpected Atlas result; fields: ${f}`],
  [/^之前保存的任务已经查不到了，再运行一次会重新提交。（(.+)）/, (_, e) => `A saved job can no longer be found; run again to resubmit (${e}).`],
  // Evolve's random numbers from Atlas (app/qrng.py, server.evolve_with_atlas)
  [/^之前保存的任务已经查不到了，再点一次「开始运行」会重新提交。（(.+)）/, (_, e) => `The saved job can no longer be found; run on Atlas again to resubmit (${e}).`],
  [/^这一池随机字节在本机找不到了/, 'Those random bytes are no longer on this computer. Run on Atlas to ask for new ones.'],
  [/^接着等上次没等完的那个任务，没有重新提交/, 'Picked up the job that was still waiting from last time; nothing new was submitted.'],
  [/^comet-qrng-v1 这次没有给出随机字节/, 'Atlas returned no random bytes this time: the measured data held no extractable entropy.'],
  [/^comet-qrng-v1 返回的随机数不是十六进制/, 'Atlas returned the random numbers in a form this app cannot read.'],
  [/^看不懂 comet-qrng-v1 的返回结构，字段有：(.+)/, (_, f) => `Unexpected answer from comet-qrng-v1; fields: ${f}`],
  [/^另一个分块失败了，已停止等待/, 'Another tile failed; stopped waiting.'],
  [/^已停止/, 'Stopped.'],
  [/^数据超过了 Atlas 单个任务约 2 MB 的上限，分得再小也不行。（(.+)）/, (_, d) => `The data is over Atlas's ~2 MB per-job limit even at the smallest tiles (${d}).`],
  [/^这个大小的分块超出了 Atlas 的上限/, 'Tiles of this size were over the Atlas limit (TMPRL1103); resubmitted at half the size and the limit is remembered.'],
  [/^等了 (\d+) 分钟任务还是 (\w+)/, (_, m, s) => `Still ${s} after ${m} minutes. The job id is saved; run again with the same settings to keep waiting.`],
  [/^程序出错了：(.+)/, (_, e) => `Service error: ${e}`],
  [/^请求失败（HTTP (\d+)）/, (_, c) => `Request failed (HTTP ${c}).`],
]

const HINTS: [RegExp, string][] = [
  [/API key 无效，或账户未激活。/, 'The API key is invalid or the account is not active. '],
  [/这个 key 没有权限使用该引擎。/, 'This key may not use this engine. '],
  [/这个账户没有权限这样使用该引擎。/, 'This account may not use the engine this way. '],
  [/请求太频繁，稍等一会儿再试。/, 'Too many requests; polling slows down. '],
  [/Atlas 暂时不可用，稍后重试。/, 'Atlas is temporarily unavailable. '],
  [/：/g, ': '],
]
function translateAtlasHint(s: string) {
  let out = s
  for (const [re, t] of HINTS) out = out.replace(re, t)
  return out
}

const HAN = /[一-鿿]/

export function en(msg: string): string {
  if (!msg || !HAN.test(msg)) return msg
  for (const [re, t] of RULES) {
    const m = msg.match(re)
    if (m) return typeof t === 'string' ? t : t(...(m as unknown as string[]))
  }
  return 'The service reported an error (untranslated). Details are in the runtime log.'
}
