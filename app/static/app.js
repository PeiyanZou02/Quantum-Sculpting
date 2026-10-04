// Quantum Sculpting 的界面。流程：模型 → 体素化 → 量子处理 → 转回模型。
// 本地的步骤（体素化、高斯替身、本地模拟、marching cubes）在控件变化时自动重算；
// 只有提交给 Atlas 需要点按钮。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fmt = (n) => Number(n).toLocaleString('en-US');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── 和本地服务通信 ───────────────────────────────────────────────────────

async function request(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch (e) {
    throw new Error('连不上本地服务。确认启动它的窗口还开着，然后刷新页面。');
  }
  if (!res.ok) {
    let message = `请求失败（HTTP ${res.status}）。`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch (e) { /* 不是 JSON，就用上面的通用说明 */ }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res;
}

const json = (data, method = 'POST') => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}),
});
const getJSON = async (path) => (await request(path)).json();
const postJSON = async (path, data) => (await request(path, json(data))).json();

// 服务端只发有东西的那个盒子，每个数一个字节；这里铺回 n³ 的数组
async function getGrid(path) {
  const { buffer, meta } = await getBinary(`${path}?compact=1`);
  const n = meta.n, n2 = n * n;
  const data = new Float32Array(n * n2);
  const bytes = new Uint8Array(buffer);
  const [[x0, x1], [y0, y1], [z0, z1]] = meta.box;
  const depth = z1 - z0;
  let i = 0;
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1; y++) {
      const row = x * n2 + y * n + z0;
      for (let z = 0; z < depth; z++) data[row + z] = bytes[i++] / 255;
    }
  }
  return { data, meta };
}

async function getBinary(path, options) {
  const res = await request(path, options);
  return { meta: JSON.parse(res.headers.get('X-Meta') || '{}'), buffer: await res.arrayBuffer() };
}

// ── 三维预览 ────────────────────────────────────────────────────────────
// 所有东西都画在「网格坐标」里（体素 (i,j,k) 的中心在点 (i,j,k)），
// 再整体缩放到单位立方体，所以四个视图的位置和大小完全对得上。

class Viewer {
  constructor(host) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.prepend(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
    this.camera.up.set(0, 0, 1);                       // Z 朝上，和打印方向一致
    this.scene.add(this.camera);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.addEventListener('change', () => { this.dirty = true; });

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 2.0);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);   // 跟着相机走，转到哪面都有明暗
    key.position.set(-0.6, 0.9, 1);
    this.camera.add(key);

    this.root = new THREE.Group();
    this.frame = new THREE.Group();
    this.root.add(this.frame);
    this.scene.add(this.root);

    this.box = new THREE.BoxGeometry(0.92, 0.92, 0.92);
    this.meshMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide,
    });
    this.voxelMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.lineMaterial = new THREE.LineBasicMaterial();
    this.layers = {};
    this.active = null;
    this.n = 0;
    this.applyTheme();

    this.framed = false;
    new ResizeObserver(() => this.resize(host)).observe(host);
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      if (this.dirty) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
      }
    });
  }

  resize(host) {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.framed) { this.resetView(); this.framed = true; }
    this.dirty = true;
  }

  resetView() {
    this.lookAt(new THREE.Vector3(0, 0, 0.47), 0.95);    // 让单位立方体的外接球刚好放得下
  }

  lookAt(target, radius) {
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const h = Math.atan(Math.tan(v) * this.camera.aspect);
    const distance = radius / Math.sin(Math.min(v, h));
    const direction = new THREE.Vector3(0.62, -0.72, 0.42).normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.controls.update();
    this.dirty = true;
  }

  // 把相机对准某一层的内容：瘦高的模型在整个网格里只占一小条，按网格取景会很小
  focus(name) {
    const layer = this.layers[name];
    if (!layer) { this.resetView(); return; }
    this.scene.updateMatrixWorld(true);
    const sphere = new THREE.Box3().setFromObject(layer).getBoundingSphere(new THREE.Sphere());
    if (!(sphere.radius > 0)) { this.resetView(); return; }
    this.lookAt(sphere.center, sphere.radius * 1.15);
  }

  applyTheme() {
    const color = (name) => new THREE.Color(cssVar(name));
    this.colors = { solid: color('--gray-700'), low: color('--gray-500'), high: color('--gray-1000') };
    this.meshMaterial.color.copy(this.colors.solid);
    this.lineMaterial.color.copy(color('--gray-500'));
    this.dirty = true;
  }

  // 网格边长变了：重新定缩放，并画出 n³ 的外框和底面格线
  setGrid(n) {
    this.n = n;
    const s = 1 / n;
    this.root.scale.setScalar(s);
    this.root.position.set(-(n - 1) / 2 * s, -(n - 1) / 2 * s, 0.5 * s);

    for (const child of [...this.frame.children]) {
      this.frame.remove(child);
      child.geometry.dispose();
    }
    const c = (n - 1) / 2;
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(n, n, n)), this.lineMaterial);
    outline.position.set(c, c, c);
    const floor = new THREE.GridHelper(n, 8);
    floor.material.dispose();
    floor.material = this.lineMaterial;
    floor.rotation.x = Math.PI / 2;
    floor.position.set(c, c, -0.5);
    this.frame.add(outline, floor);
    this.dirty = true;
  }

  clear(name) {
    const layer = this.layers[name];
    if (!layer) return;
    this.root.remove(layer);
    if (layer.isInstancedMesh) layer.dispose();
    else layer.geometry.dispose();
    delete this.layers[name];
    this.dirty = true;
  }

  put(name, object) {
    this.clear(name);
    object.visible = name === this.active;
    this.layers[name] = object;
    this.root.add(object);
    this.dirty = true;
  }

  // buffer 的格式：uint32 顶点数、uint32 面数、float32 顶点、uint32 面
  setMesh(name, buffer) {
    const head = new DataView(buffer);
    const nv = head.getUint32(0, true), nf = head.getUint32(4, true);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, 8, nv * 3), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, 8 + nv * 12, nf * 3), 1));
    this.put(name, new THREE.Mesh(geometry, this.meshMaterial));
  }

  // 原模型用自己的坐标发过来，这里用体素化给出的矩阵把它摆进网格坐标
  setTransform(name, rows) {
    const layer = this.layers[name];
    if (!layer) return;
    layer.matrixAutoUpdate = false;
    layer.matrix.set(...rows.flat());
    layer.matrixWorldNeedsUpdate = true;
    this.dirty = true;
  }

  // 只画表面的体素（至少有一个邻居低于阈值），返回阈值以上的格子总数
  setVoxels(name, data, n, threshold, shaded) {
    const n2 = n * n;
    const cells = [];
    let count = 0;
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        for (let z = 0; z < n; z++) {
          const i = x * n2 + y * n + z;
          if (data[i] < threshold) continue;
          count++;
          const exposed = x === 0 || x === n - 1 || y === 0 || y === n - 1 || z === 0 || z === n - 1
            || data[i - n2] < threshold || data[i + n2] < threshold
            || data[i - n] < threshold || data[i + n] < threshold
            || data[i - 1] < threshold || data[i + 1] < threshold;
          if (exposed) cells.push(x, y, z, data[i]);
        }
      }
    }
    const mesh = new THREE.InstancedMesh(this.box, this.voxelMaterial, cells.length / 4);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const span = Math.max(1 - threshold, 1e-6);
    for (let k = 0; k < cells.length / 4; k++) {
      matrix.makeTranslation(cells[k * 4], cells[k * 4 + 1], cells[k * 4 + 2]);
      mesh.setMatrixAt(k, matrix);
      if (shaded) color.copy(this.colors.low).lerp(this.colors.high, (cells[k * 4 + 3] - threshold) / span);
      else color.copy(this.colors.solid);
      mesh.setColorAt(k, color);
    }
    this.put(name, mesh);
    return count;
  }

  show(name) {
    this.active = name;
    for (const [key, layer] of Object.entries(this.layers)) layer.visible = key === name;
    this.frame.visible = this.n > 0;
    this.dirty = true;
  }
}

// ── 状态 ────────────────────────────────────────────────────────────────

const VIEWS = ['model', 'voxels', 'processed', 'result'];
const MODE_LABEL = { gaussian: '高斯替身', emulator: '本地模拟', atlas: 'Atlas' };
const MODE_HELP = {
  gaussian: '普通的高斯模糊，只用来检查流程是否走得通，和量子效果无关。',
  emulator: '在本机近似模拟 Quantum Blur Core，分块方式和 Atlas 一样，拖动参数会实时更新。最终效果以 Atlas 的结果为准。',
  atlas: '把体素网格提交给 Atlas 的 blur-core-v1，大网格会自动分块。相同参数和实验名的结果会缓存，不会重复提交。',
};
const ATLAS_STATE = {
  submitting: '正在提交', queued: '排队中', pending: '排队中', running: '运行中', processing: '运行中',
};

const state = {
  key: null,
  model: null,          // 服务端返回的模型信息
  grid: null,           // 体素网格信息
  gridData: null,       // Float32Array，n³
  proc: null,           // 处理结果的信息
  procData: null,       // Float32Array，n³，已归一化到 0–1
  procCount: 0,
  report: null,         // 打印检查
  meshError: null,
  view: 'model',
  slicePref: 'processed',
  adopt: false,         // 服务端有新的处理结果等着取（Atlas 任务完成、或刷新页面后恢复）
  partial: false,       // 「处理后」里现在是 Atlas 算到一半的样子
  frameNext: false,     // 下一次体素化完成后把相机对准模型
  atlasJob: null,
  atlasStatus: null,    // [dot, text]
};

let viewer;

// ── 读控件 ──────────────────────────────────────────────────────────────

const segValue = (id) => $(id).querySelector('[aria-checked="true"]').dataset.value;

function setSeg(id, value) {
  for (const b of $(id).querySelectorAll('button')) {
    b.setAttribute('aria-checked', String(b.dataset.value === String(value)));
  }
}

function bindSeg(id, onChange) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || b.getAttribute('aria-checked') === 'true') return;
    setSeg(id, b.dataset.value);
    onChange(b.dataset.value);
  });
}

function paintSlider(el) {
  el.style.setProperty('--p', `${(el.value - el.min) / (el.max - el.min) * 100}%`);
}

function bindSlider(id, digits, onInput) {
  const el = $(id), out = $(`${id}-out`);
  const paint = () => {
    paintSlider(el);
    if (out) out.textContent = Number(el.value).toFixed(digits);
  };
  el.addEventListener('input', () => { paint(); onInput(); });
  el.paint = paint;
  paint();
}

const level = () => Number($('level').value);

const voxelParams = () => ({
  n: Number(segValue('n-seg')),
  pad: Number($('pad-input').value),
  fill: $('fill-select').value,
  values: $('values-select').value,
});

const VALUES_HELP = {
  coverage: '先把模型变成距离场，再算每个格子被占的比例。0.5 的等值面就是模型真实的表面。',
  binary: '最初的做法。表面碰到的格子全算实心，模型会比原来胖半格多；以前用这种方式算过的 Atlas 结果可以直接读缓存。',
};

const processParams = () => ({
  mode: segValue('mode-seg'),
  tiling: segValue('tiling-seg'),
  run: $('run-input').value,
  sigma: Number($('sigma').value),
  strength: Number($('strength').value),
  reach: Number($('reach').value),
  style: $('style-select').value,
  axes: [0, 1, 2].filter((a) => $(`axis-${a}`).checked),
  shots: $('shots-input').value ? Number($('shots-input').value) : null,
});

const meshParams = () => ({
  level: level(),
  smooth: Number($('smooth').value),
  keep: segValue('keep-seg'),
  height: Number($('height-input').value) || 90,
  method: segValue('method-seg'),
  refine: Number($('refine-select').value),
  amount: Number($('amount').value),
  field: $('field-select').value,
  vfilter: $('vfilter-select').value,
  vwidth: Number($('vwidth').value),
  grow: Number($('grow').value),
  close: Number($('close').value),
});

const METHOD_HELP = {
  threshold: '在量子结果上直接取等值面。细节受量子网格分辨率的限制。',
  advect: '先把原模型变成细的距离场，再让量子结果推着它的表面走（Houdini 里 VDB Advect 的做法）。'
    + '量子计算用很粗的网格就行，细节留在细网格里。',
};

// 细化后的网格最多 256³：量子网格越大，能选的倍数越少
function syncRefine() {
  const select = $('refine-select');
  const n = state.grid ? state.grid.n : 32;
  for (const option of select.options) option.disabled = n * Number(option.value) > 256;
  if (select.selectedOptions[0].disabled) select.value = String(Math.max(1, 256 / n));
}

// ── 提示 ────────────────────────────────────────────────────────────────

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function toast(message, kind = 'err') {
  const host = $('toasts');
  for (const old of host.children) if (old.dataset.message === message) old.remove();
  const el = element('div', 'toast');
  el.dataset.message = message;
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  const close = element('button', '', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭');
  close.addEventListener('click', () => el.remove());
  el.append(element('span', `dot ${kind}`), element('span', '', message), close);
  host.append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 10000 : 5000);
}

function renderStats(id, rows) {
  const dl = $(id);
  dl.hidden = rows.length === 0;
  dl.replaceChildren(...rows.flatMap(([label, value, dot]) => {
    const dd = element('dd');
    if (dot) dd.append(element('span', `dot ${dot}`));
    dd.append(value);
    return [element('dt', '', label), dd];
  }));
}

function setStatusLine(id, status) {
  const el = $(id);
  el.hidden = !status;
  if (status) el.replaceChildren(element('span', `dot ${status[0]}`), element('span', '', status[1]));
}

// ── 重算：模型 → 体素 → 处理 → 模型 ─────────────────────────────────────────
// 控件一变就把对应的阶段标脏；同一时间只跑一条链，跑的时候又变了就从最早变的那一步重来。

const STAGE = { mesh: 1, process: 2, voxel: 3 };
let dirty = 0, pumping = false, timer = null;

function invalidate(stage, delay = 0) {
  dirty = Math.max(dirty, stage);
  clearTimeout(timer);
  timer = setTimeout(pump, delay);
}

async function pump() {
  if (pumping) return;
  pumping = true;
  $('spinner').hidden = false;
  try {
    while (dirty) {
      const stage = dirty;
      dirty = 0;
      try {
        if (stage >= STAGE.voxel) {
          await doVoxelize();
          if (dirty >= STAGE.voxel) continue;
        }
        if (stage >= STAGE.process) {
          await doProcess();
          if (dirty >= STAGE.process) continue;
        }
        await doMesh();
      } catch (e) {
        toast(e.message);
      }
      render();
    }
  } finally {
    pumping = false;
    $('spinner').hidden = true;
    render();
  }
}

async function idle() {
  while (pumping || dirty) await sleep(30);
}

async function doVoxelize() {
  if (!state.model) return;
  const info = await postJSON('/api/voxelize', voxelParams());
  const { data } = await getGrid('/api/grid/input');
  state.grid = info;
  state.gridData = data;
  state.proc = state.procData = state.report = state.meshError = null;
  state.adopt = state.partial = false;                 // 服务端换了网格，旧的处理结果已经作废
  $('pad-input').value = info.pad;
  viewer.setGrid(info.n);
  viewer.setTransform('model', info.transform);
  viewer.setVoxels('voxels', state.gridData, info.n, 0.5, false);
  viewer.clear('processed');
  viewer.clear('result');
  syncSliceRange();
  syncRefine();                                        // 网格变大了，细化倍数可能要跟着降
  if (state.frameNext) {                               // 新模型第一次体素化完，把相机对准它
    state.frameNext = false;
    viewer.focus('voxels');
  }
}

async function doProcess() {
  if (!state.grid) return;
  if (state.adopt) {
    state.adopt = false;
    await adoptProcessed();
    return;
  }
  const params = processParams();
  if (params.mode === 'atlas') return;                 // Atlas 只在点按钮时提交
  if (params.axes.length === 0) throw new Error('至少选择一个模糊方向（X、Y 或 Z）。');
  await postJSON('/api/process', params);
  await adoptProcessed();
}

async function adoptProcessed() {
  const { data, meta } = await getGrid('/api/grid/processed');
  state.proc = meta.proc;
  state.partial = false;
  state.procData = data;
  // 服务端会把实验名整理成能当文件名的样子，写回来保持一致
  if (document.activeElement !== $('run-input')) $('run-input').value = meta.proc.run;
  paintProcessed();
}

function paintProcessed() {
  if (!state.procData) return;
  state.procCount = viewer.setVoxels('processed', state.procData, state.grid.n, level(), true);
}

async function doMesh() {
  state.report = state.meshError = null;
  if (!state.proc) {
    viewer.clear('result');
    return;
  }
  try {
    const { buffer, meta } = await getBinary('/api/mesh', json(meshParams()));
    viewer.setMesh('result', buffer);
    state.report = meta;
  } catch (e) {
    if (e.status !== 400) throw e;
    viewer.clear('result');                            // 比如阈值超出了数据范围
    state.meshError = e.message;
  }
}

// ── 模型 ────────────────────────────────────────────────────────────────

async function loadModel(send) {
  await idle();
  $('spinner').hidden = false;
  try {
    state.model = await send();
    $('up-select').value = state.model.up;
    const { buffer } = await getBinary('/api/model/mesh');
    // 换了模型，服务端已经清掉后面几步的结果，这里同步清掉
    state.grid = state.gridData = state.proc = state.procData = state.report = state.meshError = null;
    state.adopt = state.partial = false;
    for (const name of ['voxels', 'processed', 'result']) viewer.clear(name);
    viewer.setMesh('model', buffer);
    viewer.layers.model.visible = false;               // 等体素化给出位置再显示
    state.view = 'voxels';
    state.frameNext = true;
    $('export-result').hidden = true;
    refreshModels();
    invalidate(STAGE.voxel);
  } catch (e) {
    $('spinner').hidden = true;
    toast(e.message);
  }
}

// input/ 里已有的模型：重启或换机器之后不用再上传
async function refreshModels() {
  let models = [];
  try { models = await getJSON('/api/models'); } catch (e) { /* 列不出来就不显示这一栏 */ }
  const select = $('model-select');
  const current = state.model ? state.model.name : null;
  select.replaceChildren(new Option('选择一个打开…', ''),
    ...models.map((m) => new Option(m.mb >= 0.1 ? `${m.name}（${m.mb} MB）` : m.name, m.name)));
  const match = models.find((m) => m.name.replace(/\.[^.]+$/, '') === current);
  select.value = match ? match.name : '';
  $('model-list-field').hidden = models.length === 0;
}

function uploadFile(file) {
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  form.append('up', $('up-select').value);
  loadModel(async () => (await request('/api/model/upload', { method: 'POST', body: form })).json());
}

// ── Atlas ───────────────────────────────────────────────────────────────

async function submitAtlas() {
  if (state.atlasJob) return;
  await idle();
  if (!state.key || !state.key.set) {
    openKeyModal();
    return;
  }
  state.atlasStatus = ['info', '正在提交…'];
  render();
  try {
    const r = await postJSON('/api/process', processParams());
    if (r.status === 'done') {
      atlasFinished(true, r.meta);
      return;
    }
    state.atlasJob = r.job_id;
    render();
    let seen = -1, lastPartial = 0;
    while (state.atlasJob) {
      await sleep(1000);
      const job = await getJSON(`/api/process/${state.atlasJob}`);
      if (job.status === 'running') {
        const label = ATLAS_STATE[job.atlas_status] || job.atlas_status;
        const tiles = job.tiles_total > 1 ? `分块 ${job.tiles_done} / ${job.tiles_total} · ` : `${label} · `;
        state.atlasStatus = ['info', `${tiles}已等待 ${formatWait(job.elapsed)}${job.note ? `。${job.note}` : ''}`];
        const gap = state.grid && state.grid.n >= 256 ? 5000 : 2500;
        if (job.tiles_total > 1 && job.tiles_done > 0 && job.version !== seen
            && performance.now() - lastPartial > gap) {
          seen = job.version;
          lastPartial = performance.now();
          await showPartial(state.atlasJob);
        }
        render();
        continue;
      }
      state.atlasJob = null;
      if (job.status !== 'done' || job.stale) dropPartial();
      if (job.status === 'failed') state.atlasStatus = ['err', job.error];
      else if (job.stale) state.atlasStatus = ['warn', '结果已返回并缓存。等待期间体素网格改过，所以没有套用。'];
      else atlasFinished(false, job.meta);
    }
  } catch (e) {
    state.atlasJob = null;
    dropPartial();
    state.atlasStatus = ['err', e.message];
  }
  render();
}

const formatWait = (seconds) => (seconds < 90 ? `${Math.round(seconds)} 秒` : `${(seconds / 60).toFixed(1)} 分钟`);

// 分块一块一块算完，预览跟着一块一块变：没算完的块先显示原样
async function showPartial(jobId) {
  try {
    const { data, meta } = await getGrid(`/api/process/${jobId}/preview`);
    if (!state.grid || meta.n !== state.grid.n) return;
    state.procData = data;
    state.proc = state.report = null;
    state.partial = true;
    viewer.clear('result');
    state.view = 'processed';
    paintProcessed();
  } catch (e) { /* 正好算完了，取不到也没关系 */ }
}

function dropPartial() {
  if (!state.partial) return;
  state.partial = false;
  if (!state.proc) {
    state.procData = null;
    viewer.clear('processed');
  }
}

// 现在显示的是不是「当前这组参数」的 Atlas 结果
function atlasCurrent() {
  const p = state.proc;
  if (!p || p.mode !== 'atlas') return false;
  const c = processParams();
  const tiled = state.grid && state.grid.tiles.cube.total > 1;
  const shown = [p.run, p.params.strength, p.params.reach, p.params.style, p.params.axes, p.params.shots,
    tiled && p.tiles ? p.tiles.mode : null];
  const wanted = [c.run.trim(), c.strength, c.reach, c.style, c.axes.length === 3 ? null : c.axes, c.shots,
    tiled ? c.tiling : null];
  return JSON.stringify(shown) === JSON.stringify(wanted);
}

function atlasFinished(cached, meta) {
  state.partial = false;
  const jobs = meta.tiles && meta.tiles.jobs > 1 ? `${meta.tiles.jobs} 个分块，` : '';
  const reused = meta.tiles && meta.tiles.cached ? `其中 ${meta.tiles.cached} 个读的缓存，` : '';
  state.atlasStatus = ['ok', cached ? '已读取缓存的结果，没有重新提交。'
    : `完成：${jobs}${reused}用时 ${formatWait(meta.seconds)}。`];
  state.adopt = true;
  state.view = 'result';
  invalidate(STAGE.process);
}

// ── API key ─────────────────────────────────────────────────────────────

let keyMessage = null;

function renderKey() {
  const k = state.key;
  if (!k) return;
  $('key-dot').className = k.set ? 'dot ok' : 'dot';
  $('key-label').textContent = k.set ? 'Atlas key 已设置' : '设置 API key';
  const saved = k.source === 'env' ? '正在使用环境变量 MOTH_API_KEY。'
    : `已保存${k.hint ? `，结尾是 ${k.hint}` : ''}。`;
  setStatusLine('key-status', keyMessage || (k.set ? ['ok', saved] : ['', '还没有设置。']));
  $('key-base-note').hidden = k.official;
  $('key-base-note').textContent = `当前连接的是测试地址 ${k.base}，不是 Atlas 正式服务。`;
  $('key-clear').disabled = k.source !== 'saved';
  $('key-test').disabled = !k.set;
}

function openKeyModal() {
  keyMessage = null;
  $('key-input').value = '';
  renderKey();
  $('key-modal').showModal();
}

async function keyAction(run, done) {
  try {
    const result = await run();
    if (result && 'set' in result) state.key = result;
    keyMessage = done ? ['ok', done] : null;
  } catch (e) {
    keyMessage = ['err', e.message];
  }
  renderKey();
  render();
}

// ── 切片 ────────────────────────────────────────────────────────────────

function sliceSource() {
  if (state.slicePref === 'processed' && state.procData) return { data: state.procData, processed: true };
  if (state.gridData) return { data: state.gridData, processed: false };
  return null;
}

function syncSliceRange() {
  const slider = $('slice-index');
  const n = state.grid.n;
  const old = Number(slider.max) + 1;
  slider.max = n - 1;
  slider.value = Math.min(n - 1, Math.round(Number(slider.value) * n / old));
  paintSlider(slider);
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function drawSlice() {
  const canvas = $('slice-canvas');
  const ctx = canvas.getContext('2d');
  const size = Math.round((canvas.clientWidth || 280) * Math.min(window.devicePixelRatio || 1, 2));
  if (canvas.width !== size) canvas.width = canvas.height = size;
  const bg = hexToRgb(cssVar('--background-100')), fg = hexToRgb(cssVar('--gray-1000'));
  ctx.fillStyle = `rgb(${bg})`;
  ctx.fillRect(0, 0, size, size);

  const source = sliceSource();
  const axis = Number(segValue('slice-axis-seg'));
  const index = Number($('slice-index').value);
  $('slice-out').textContent = source ? `${'XYZ'[axis]} = ${index}` : '';
  setSeg('slice-source-seg', source && source.processed ? 'processed' : 'input');
  $('slice-source-seg').querySelector('[data-value="processed"]').disabled = !state.procData;
  if (!source) return;

  const n = state.grid.n, n2 = n * n, data = source.data;
  // (u, v) 是画面上的横、纵格子，v 朝上
  const at = axis === 2 ? (u, v) => data[u * n2 + v * n + index]
    : axis === 1 ? (u, v) => data[u * n2 + index * n + v]
    : (u, v) => data[index * n2 + u * n + v];

  const image = new ImageData(n, n);
  for (let v = 0; v < n; v++) {
    for (let u = 0; u < n; u++) {
      const t = Math.min(Math.max(at(u, v), 0), 1);
      const o = ((n - 1 - v) * n + u) * 4;
      for (let c = 0; c < 3; c++) image.data[o + c] = bg[c] + (fg[c] - bg[c]) * t;
      image.data[o + 3] = 255;
    }
  }
  const small = new OffscreenCanvas(n, n);
  small.getContext('2d').putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, size, size);

  if (!source.processed) return;
  // 阈值边界：相邻两格一个在阈值上、一个在阈值下，就在它们之间画一段线
  const cell = size / n, lv = level();
  const solid = (u, v) => u >= 0 && v >= 0 && u < n && v < n && at(u, v) >= lv;
  ctx.strokeStyle = cssVar('--blue-700');
  ctx.lineWidth = Math.max(1.5, size / 200);
  ctx.beginPath();
  for (let v = 0; v < n; v++) {
    for (let u = 0; u < n; u++) {
      if (!solid(u, v)) continue;
      const x = u * cell, y = (n - 1 - v) * cell;
      if (!solid(u - 1, v)) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
      if (!solid(u + 1, v)) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      if (!solid(u, v + 1)) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
      if (!solid(u, v - 1)) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
    }
  }
  ctx.stroke();
}

// ── 把状态画到页面上 ───────────────────────────────────────────────────────

const yesNo = (ok) => (ok ? '是' : '否');
const dims = (extents) => extents.join(' × ');

function available(view) {
  return { model: !!state.model && !!state.grid, voxels: !!state.gridData,
    processed: !!state.procData, result: !!state.report }[view];
}

function currentView() {
  // 想看的视图还没有数据时，退回到它前面最近的一个有数据的视图
  for (let i = VIEWS.indexOf(state.view); i >= 0; i--) if (available(VIEWS[i])) return VIEWS[i];
  return VIEWS.find(available) || null;
}

function footText(view) {
  const { model: m, grid: g, report: r } = state;
  if (view === 'model') return `${m.name} · ${fmt(m.faces)} 个面 · ${dims(m.extents)}`;
  if (view === 'voxels') return `${g.n}³ 网格 · ${fmt(g.solid)} 个实体格子`;
  if (view === 'processed') return `阈值 ${level().toFixed(2)} · ${fmt(state.procCount)} 个格子在阈值以上`;
  if (view === 'result') return `${fmt(r.faces)} 个面 · ${r.parts} 块 · ${dims(r.extents)} mm`;
  return '';
}

function render() {
  const { model: m, grid: g, proc: p, report: r } = state;
  const mode = segValue('mode-seg');

  renderStats('model-stats', m ? [
    ['名称', m.name],
    ['面数', fmt(m.faces)],
    ['尺寸', dims(m.extents)],
    ['封闭', yesNo(m.watertight), m.watertight ? 'ok' : 'warn'],
  ] : []);
  $('values-help').textContent = VALUES_HELP[$('values-select').value];
  $('lying-hint').hidden = !(m && m.lying);
  if (m && m.lying) {
    $('lying-hint').textContent = `这个模型最长的方向是 ${m.lying}，现在是横着的。如果它应该竖着，把上面改成 +${m.lying} 或 −${m.lying}。`;
  }

  const tiles = g ? g.tiles[segValue('tiling-seg')] : null;
  const tileText = tiles ? tiles.shape.join('×') : '';
  renderStats('grid-stats', g ? [
    ['实体格子', `${fmt(g.solid)} / ${fmt(g.total)}`],
    ['每格边长', `${g.voxel_size} 模型单位`],
    ['Atlas 任务数', tiles.total > 1 ? `${tiles.jobs}（分块 ${tileText}）` : '1（不用分块）'],
  ] : []);
  $('tiling-field').hidden = mode === 'gaussian' || !tiles || tiles.total === 1;
  if (tiles) {
    $('tiling-help').textContent = segValue('tiling-seg') === 'cube'
      ? `切成 ${tileText} 的块，三个方向都参与模糊，最接近整块计算。有东西的块共 ${tiles.jobs} 个，每个是一次 Atlas 任务。`
      : `每 ${tiles.shape[2]} 层一块（${tileText}），从下往上一块一块算，共 ${tiles.jobs} 个 Atlas 任务。水平方向完整，竖直方向只在这几层之间模糊。`;
  }

  $('gaussian-params').hidden = mode !== 'gaussian';
  $('quantum-params').hidden = mode === 'gaussian';
  $('atlas-actions').hidden = mode !== 'atlas';
  $('mode-help').textContent = MODE_HELP[mode];
  $('atlas-jobs-note').hidden = !(tiles && tiles.total > 1);
  if (tiles && tiles.total > 1) {
    $('atlas-jobs-note').textContent = `会提交 ${tiles.jobs} 个任务，大约 ${formatWait(tiles.jobs * 4 + 10)}。`
      + '已经算过的分块读缓存，中途失败再点一次只会补算剩下的。';
  }
  setStatusLine('atlas-status', state.atlasStatus);
  renderStats('process-stats', state.partial ? [['当前结果', 'Atlas 计算中，逐块更新']] : p ? [
    ['当前结果', MODE_LABEL[p.mode] + (p.cached ? '（缓存）' : '')],
    ...(p.tiles && p.tiles.jobs > 1 ? [['分块', `${p.tiles.jobs} 个 ${p.tiles.shape.join('×')}`]] : []),
    ['原始数值范围', `${p.min} – ${p.max}`],
    ...(p.seconds != null ? [['用时', `${p.seconds} 秒`]] : []),
    ...(p.job_id ? [['任务号', p.job_id]] : []),
  ] : []);
  const needAtlas = mode === 'atlas' && !!g && !atlasCurrent();
  $('atlas-stale-note').hidden = !(needAtlas && p && !state.atlasJob);

  $('report-empty').hidden = !!r || !!state.meshError;
  renderStats('report-stats', r ? [
    ['尺寸（mm）', dims(r.extents)],
    ['封闭', yesNo(r.watertight), r.watertight ? 'ok' : 'warn'],
    ...(r.watertight ? [['体积', `${r.volume_cm3} cm³`]] : []),
    ['碎块', r.total_parts > r.parts ? `保留 ${r.parts}，共 ${fmt(r.total_parts)}` : String(r.parts),
      r.parts === 1 ? 'ok' : 'warn'],
    ['面数', fmt(r.faces)],
    ['量子网格一格', `${r.voxel_mm} mm`],
    ...(r.refine > 1 ? [['细网格一格', `${r.fine_voxel_mm} mm`]] : []),
  ] : []);
  const method = segValue('method-seg');
  $('method-help').textContent = METHOD_HELP[method];
  $('advect-params').hidden = method !== 'advect';
  syncRefine();
  const fine = g ? g.n * Number($('refine-select').value) : 0;
  $('refine-help').textContent = g
    ? `表面在 ${fine}³ 的网格上取。${fine >= 256 ? '这个大小每次调整要等几秒到十几秒。' : ''}` : '';
  const notes = [];
  if (state.meshError) notes.push(state.meshError.replace(/。$/, '') + '。');
  if (r && !r.watertight) notes.push('模型不封闭，切片前先用 Meshmixer 的 Inspector 或 Blender 的 3D Print Toolbox 修补。');
  if (r && r.parts > 1) notes.push('有多块互不相连的碎块，悬空的小块打印时会掉下来。');
  $('report-note').hidden = notes.length === 0;
  $('report-note').textContent = notes.join(' ');

  // 一个界面只有一个主按钮：指向当前该做的那一步
  const primary = !m ? 'pick-file' : needAtlas ? 'submit-atlas' : r ? 'export' : null;
  for (const id of ['pick-file', 'submit-atlas', 'export']) {
    $(id).classList.toggle('btn-primary', id === primary);
    $(id).classList.toggle('btn-secondary', id !== primary);
  }
  $('export').disabled = !r;
  $('submit-atlas').disabled = !g || !!state.atlasJob;

  const view = currentView();
  for (const b of $('view-seg').querySelectorAll('button')) {
    b.disabled = !available(b.dataset.value);
    b.setAttribute('aria-checked', String(b.dataset.value === view));
  }
  viewer.show(view);
  $('empty').hidden = !!m;
  $('stage-foot-text').textContent = view ? footText(view) : '';
  renderKey();
  drawSlice();
}

// ── 接线 ────────────────────────────────────────────────────────────────

function bind() {
  $('pick-file').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (e) => {
    uploadFile(e.target.files[0]);
    e.target.value = '';
  });
  $('use-test-cup').addEventListener('click', () => loadModel(() => postJSON('/api/model/test-cup')));
  $('up-select').addEventListener('change', (e) => {
    if (state.model) loadModel(() => postJSON('/api/model/orient', { up: e.target.value }));
  });

  const viewport = $('viewport');
  const dragging = (on) => {
    viewport.classList.toggle('dragging', on);
    $('drop-hint').hidden = !on;
  };
  viewport.addEventListener('dragover', (e) => { e.preventDefault(); dragging(true); });
  viewport.addEventListener('dragleave', (e) => { if (!viewport.contains(e.relatedTarget)) dragging(false); });
  viewport.addEventListener('drop', (e) => {
    e.preventDefault();
    dragging(false);
    uploadFile(e.dataTransfer.files[0]);
  });

  const voxelChanged = () => { state.view = 'voxels'; invalidate(STAGE.voxel, 120); };
  bindSeg('n-seg', voxelChanged);
  $('pad-input').addEventListener('change', voxelChanged);
  $('fill-select').addEventListener('change', voxelChanged);
  $('values-select').addEventListener('change', voxelChanged);
  $('model-select').addEventListener('change', (e) => {
    const name = e.target.value;
    if (name) loadModel(() => postJSON('/api/model/open', { name, up: $('up-select').value }));
  });

  const processChanged = () => {
    if (segValue('mode-seg') === 'atlas') {
      if (!state.atlasJob) state.atlasStatus = null;   // 参数变了，上一次提交的状态不再适用
      render();
      return;
    }
    if (state.view !== 'result') state.view = 'processed';
    invalidate(STAGE.process, 120);
  };
  bindSeg('mode-seg', processChanged);
  bindSeg('tiling-seg', processChanged);
  for (const id of ['sigma', 'strength', 'reach']) bindSlider(id, 2, processChanged);
  for (const id of ['style-select', 'shots-input', 'run-input', 'axis-0', 'axis-1', 'axis-2']) {
    $(id).addEventListener('change', processChanged);
  }
  $('submit-atlas').addEventListener('click', submitAtlas);

  bindSlider('level', 2, () => {
    if (state.view !== 'processed') state.view = 'result';
    paintProcessed();                                  // 体素和切片直接在浏览器里更新
    render();
    invalidate(STAGE.mesh, 120);
  });
  const meshChanged = () => { state.view = 'result'; render(); invalidate(STAGE.mesh, 150); };
  bindSlider('smooth', 0, meshChanged);
  bindSeg('keep-seg', meshChanged);
  $('height-input').addEventListener('change', meshChanged);
  bindSeg('method-seg', (value) => {
    // 推动表面的意义就在于细网格：第一次切过来时自动选一个细一些的
    const n = state.grid ? state.grid.n : 32;
    if (value === 'advect' && $('refine-select').value === '1') {
      $('refine-select').value = String([4, 2, 1].find((k) => n * k <= 256));
    }
    meshChanged();
  });
  for (const id of ['amount', 'vwidth', 'grow', 'close']) bindSlider(id, 2, meshChanged);
  for (const id of ['field-select', 'refine-select', 'vfilter-select']) {
    $(id).addEventListener('change', meshChanged);
  }

  $('export').addEventListener('click', async () => {
    await idle();
    try {
      const r = await postJSON('/api/export', meshParams());
      const link = element('a', '', '下载');
      link.href = `/api/download/${encodeURIComponent(r.file)}`;
      $('export-result').replaceChildren(`已保存到 ${r.folder}/${r.file}，同名 .json 里记着这次的全部参数。`, link);
      $('export-result').hidden = false;
    } catch (e) {
      toast(e.message);
    }
  });

  bindSeg('view-seg', (value) => { state.view = value; render(); });
  $('reset-view').addEventListener('click', () => viewer.focus(currentView()));

  bindSeg('slice-source-seg', (value) => { state.slicePref = value; drawSlice(); });
  bindSeg('slice-axis-seg', drawSlice);
  bindSlider('slice-index', 0, drawSlice);
  new ResizeObserver(drawSlice).observe($('slice-canvas'));

  $('theme-button').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('quantum-sculpting-theme', next); } catch (e) { /* 隐私模式下存不了，不影响使用 */ }
    viewer.applyTheme();
    if (state.gridData) viewer.setVoxels('voxels', state.gridData, state.grid.n, 0.5, false);
    paintProcessed();
    render();
  });

  $('key-button').addEventListener('click', openKeyModal);
  $('key-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();                                // 回车是保存，不是关掉对话框
    $('key-save').click();
  });
  $('key-save').addEventListener('click', () => keyAction(async () => {
    const saved = await postJSON('/api/key', { key: $('key-input').value });
    $('key-input').value = '';
    return saved;
  }, '已保存。'));
  $('key-test').addEventListener('click', () => {
    keyMessage = ['info', '正在连接…'];
    renderKey();
    keyAction(() => postJSON('/api/key/test'), '连接成功，key 有效。');
  });
  $('key-clear').addEventListener('click', () => keyAction(
    async () => (await request('/api/key', { method: 'DELETE' })).json(), null));
}

// 刷新页面后，把服务端还留着的模型和结果接回来
async function restore(saved) {
  state.model = saved.model;
  $('up-select').value = saved.model.up;
  viewer.setMesh('model', (await getBinary('/api/model/mesh')).buffer);
  if (!saved.grid) {
    state.view = 'voxels';
    invalidate(STAGE.voxel);
    return;
  }
  setSeg('n-seg', saved.grid.n);
  $('pad-input').value = saved.grid.pad;
  $('fill-select').value = saved.grid.fill;
  $('values-select').value = saved.grid.values;
  state.grid = saved.grid;
  state.gridData = (await getGrid('/api/grid/input')).data;
  viewer.setGrid(saved.grid.n);
  viewer.setTransform('model', saved.grid.transform);
  viewer.setVoxels('voxels', state.gridData, saved.grid.n, 0.5, false);
  viewer.focus('voxels');
  syncSliceRange();

  const p = saved.processed;
  if (p) {
    setSeg('mode-seg', p.mode);
    if (p.tiles && p.tiles.mode) setSeg('tiling-seg', p.tiles.mode);
    $('run-input').value = p.run;
    if (p.mode === 'gaussian') {
      $('sigma').value = p.params.sigma;
    } else {
      $('strength').value = p.params.strength;
      $('reach').value = p.params.reach;
      $('style-select').value = p.params.style;
      $('shots-input').value = p.params.shots || '';
      for (const a of [0, 1, 2]) $(`axis-${a}`).checked = !p.params.axes || p.params.axes.includes(a);
    }
    for (const id of ['sigma', 'strength', 'reach']) $(id).paint();
    state.adopt = true;
    state.view = 'result';
  } else {
    state.view = 'voxels';
  }
  invalidate(STAGE.process);
}

async function init() {
  viewer = new Viewer($('viewport'));
  bind();
  render();
  try {
    const saved = await getJSON('/api/state');
    state.key = saved.key;
    refreshModels();
    if (saved.model) await restore(saved);
  } catch (e) {
    toast(e.message);
  }
  render();
}

init();
