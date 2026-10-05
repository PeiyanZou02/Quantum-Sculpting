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

// 服务每次启动有一个新的编号。编号变了说明它重启过：内存里的模型、网格和结果都没了，
// 页面上显示的东西它已经不认识，要把模型重新送回去（见 recover）
let boot = null;

// 每个标签页一个编号。服务端凭它知道「这个页面又发来了更新的请求」，把它之前还在算的那一次停掉。
// 存在 sessionStorage 里，刷新之后还是同一个：嫌慢刷新了页面，刷新前还在算的那一次也会被顶掉
const CLIENT = (() => {
  const fresh = Math.random().toString(36).slice(2, 10);
  try {
    const kept = sessionStorage.getItem('quantum-sculpting-client') || fresh;
    sessionStorage.setItem('quantum-sculpting-client', kept);
    return kept;
  } catch (e) {
    return fresh;
  }
})();

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { ...options, headers: { ...options.headers, 'X-Client': CLIENT } });
  } catch (e) {
    const cancelled = e.name === 'AbortError';         // 自己取消的：控件又动了，这一次的结果不要了
    const err = new Error(cancelled ? '已取消。' : '连不上本地服务。确认启动它的窗口还开着，然后刷新页面。');
    err.quiet = cancelled;
    throw err;
  }
  const seen = res.headers.get('X-Boot');
  const restarted = !!(boot && seen && seen !== boot);
  if (seen) boot = seen;
  if (restarted) setTimeout(recover, 0);
  if (!res.ok) {
    let message = `请求失败（HTTP ${res.status}）。`;
    let superseded = false;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
      superseded = !!data.superseded;
    } catch (e) { /* 不是 JSON，就用上面的通用说明 */ }
    const err = new Error(message);
    err.status = res.status;
    err.restarted = restarted;
    // 不用告诉用户的失败：服务重启了（恢复之后会重算），或者被这个页面更新的请求取代了
    err.quiet = restarted || superseded;
    throw err;
  }
  return res;
}

const json = (data, method = 'POST') => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}),
});
const getJSON = async (path) => (await request(path)).json();
const postJSON = async (path, data, signal) => (await request(path, { ...json(data), signal })).json();

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
    this.renderer.localClippingEnabled = true;         // 扫描视图用裁剪面把两层体素各切掉一半
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
    // 原来的体素和处理后的体素各用一份材质：扫描时一个只画扫描面以上，一个只画以下
    this.voxelMaterials = {
      voxels: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      processed: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    };
    this.cut = {
      voxels: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),       // 留下面以上的
      processed: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),   // 留下面以下的
    };
    this.scanning = false;
    this.scanner = new THREE.Group();                  // 扫描面：一张半透明的片和它的边
    this.scanner.visible = false;
    this.scanFill = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false,
    });
    this.scanEdge = new THREE.LineBasicMaterial();
    this.lineMaterial = new THREE.LineBasicMaterial();
    this.layers = {};
    this.active = null;
    this.n = 0;
    this.root.add(this.scanner);
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
    const layer = this.layers[name === 'scan' ? 'voxels' : name];
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
    this.scanFill.color.copy(color('--gray-1000'));
    this.scanEdge.color.copy(color('--gray-1000'));
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

    for (const child of [...this.scanner.children]) {
      this.scanner.remove(child);
      child.geometry.dispose();
    }
    const h = n / 2;
    const rim = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    this.scanner.add(new THREE.Mesh(new THREE.PlaneGeometry(n, n), this.scanFill),
      new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rim), this.scanEdge));
    this.scanner.position.set(c, c, -0.5);
    this.dirty = true;
  }

  // 扫描面停在第 z 层的底面（z 可以是小数）：它下面画处理后的体素，上面画原来的。null 是不扫描。
  // 只动裁剪面，不重建体素，所以 256³ 也能一帧一帧地走
  setScan(z) {
    const on = z !== null;
    if (on !== this.scanning) {
      this.scanning = on;
      for (const [name, material] of Object.entries(this.voxelMaterials)) {
        material.clippingPlanes = on ? [this.cut[name]] : null;
        material.needsUpdate = true;
      }
    }
    if (on && this.n) {
      // 网格坐标里第 z 层的底面在 z - 0.5，换成画面里的高度正好是 z / n
      this.cut.processed.constant = z / this.n;
      this.cut.voxels.constant = -z / this.n;
      this.scanner.position.z = z - 0.5;
    }
    this.dirty = true;
  }

  shows(name) {
    return this.active === 'scan' ? name === 'voxels' || name === 'processed' : name === this.active;
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
    object.visible = this.shows(name);
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
    const material = this.voxelMaterials[name] || this.voxelMaterials.voxels;
    const mesh = new THREE.InstancedMesh(this.box, material, cells.length / 4);
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

  // 「演化」的一帧：bytes 是盒子 box 里每格属于哪个国家（0 是空的），只画露在外面的，按国家上色
  setOwners(name, bytes, box, n) {
    const [[x0, x1], [y0, y1], [z0, z1]] = box;
    const sy = y1 - y0, sz = z1 - z0, sx = x1 - x0;
    const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz
      ? 0 : bytes[(x * sy + y) * sz + z]);
    const cells = [];
    let count = 0;
    for (let x = 0; x < sx; x++) {
      for (let y = 0; y < sy; y++) {
        for (let z = 0; z < sz; z++) {
          const who = bytes[(x * sy + y) * sz + z];
          if (!who) continue;
          count++;
          if (!at(x - 1, y, z) || !at(x + 1, y, z) || !at(x, y - 1, z) || !at(x, y + 1, z)
              || !at(x, y, z - 1) || !at(x, y, z + 1)) cells.push(x + x0, y + y0, z + z0, who);
        }
      }
    }
    const mesh = new THREE.InstancedMesh(this.box, this.voxelMaterials[name] || this.voxelMaterials.voxels,
      cells.length / 4);
    const matrix = new THREE.Matrix4();
    for (let k = 0; k < cells.length / 4; k++) {
      matrix.makeTranslation(cells[k * 4], cells[k * 4 + 1], cells[k * 4 + 2]);
      mesh.setMatrixAt(k, matrix);
      mesh.setColorAt(k, NATION_COLORS[(cells[k * 4 + 3] - 1) % NATION_COLORS.length]);
    }
    this.put(name, mesh);
    return count;
  }

  show(name) {
    this.active = name;
    for (const [key, layer] of Object.entries(this.layers)) layer.visible = this.shows(key);
    this.scanner.visible = name === 'scan';
    this.frame.visible = this.n > 0;
    this.dirty = true;
  }
}

// 国家的颜色。这里颜色是有意义的（区分是哪一国），深浅两种主题下都看得清
const NATION_HEX = ['#d9634c', '#4b8fd9', '#6fb85e', '#e0b040', '#9a6cd6', '#45b5b5', '#e07fb0', '#8f8f8f',
  '#c7783c', '#6478c8', '#a9c450', '#d6508a', '#57a882', '#cf9f78', '#7a66a8', '#b8b864',
  '#508c64', '#c86464', '#64b4dc', '#b48cc8', '#e6965a', '#78c8a0', '#96785a', '#5a5aa0'];
const NATION_COLORS = NATION_HEX.map((hex) => new THREE.Color(hex));
const NATION_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWX';

// ── 状态 ────────────────────────────────────────────────────────────────

const VIEWS = ['model', 'voxels', 'processed', 'result', 'scan'];
const MODE_LABEL = { gaussian: '高斯替身', emulator: '本地模拟', atlas: 'Atlas', nations: '演化' };
const MODE_HELP = {
  gaussian: '普通的高斯模糊，只用来检查流程是否走得通，和量子效果无关。',
  emulator: '在本机近似模拟 Quantum Blur Core，分块方式和 Atlas 一样，拖动参数会实时更新。最终效果以 Atlas 的结果为准。',
  atlas: '把体素网格提交给 Atlas 的 blur-core-v1，大网格会自动分块。相同参数和实验名的结果会缓存，不会重复提交。',
  nations: '把模型分成几块，每块是一个「国家」、对应一个量子比特。测量之前每国都处在「做」和「不做」的叠加里；'
    + '每回合问它一件事，测出来是什么就做什么：进攻或逃离，筑墙或分裂，生长或萎缩。国家会结盟、被吞并、'
    + '独立、逃离大陆、灭亡。在本机模拟，不找 Atlas。换一个实验名就是另一段历史。',
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
  frame: null,          // 「演化」现在显示的那一回合：{ turn, turns, bytes, box, record }
  saga: null,           // 「演化」的整段历史：每回合各国问了什么、答了什么、做了什么，关系和大事
  recovered: false,     // 服务重启后刚把模型送回去：Atlas 的结果从缓存里读回来
  atlasJob: null,
  run: null,            // 正在 Atlas 上跑的那次提交：分块进度、实验名
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
  k: Number($('nations-k').value),
  turns: Number($('nations-turns').value),
  spread: Number($('nations-spread').value),
  grooves: $('nations-grooves').checked,
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
  const dl = typeof id === 'string' ? $(id) : id;
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
// 正在等服务算的那一步如果已经没用了（它自己或它的上游又变了），马上放弃，不等它算完：
// 服务端收到更新的请求后也会把旧的那次停下。调参时拖一下滑块不会被上一次的计算卡住。

const STAGE = { mesh: 1, process: 2, voxel: 3 };
let dirty = 0, pumping = false, timer = null;
let flight = null;        // 正在等服务算的那一步：{ stage, abort }
let quietUntil = 0;       // 控件还在动，过了这个时刻再发请求
let loading = false;      // 正在换模型：这期间不重算，也不接受再换一个

function invalidate(stage, delay = 0) {
  dirty = Math.max(dirty, stage);
  quietUntil = performance.now() + delay;
  if (flight && flight.stage <= stage) flight.abort();
  clearTimeout(timer);
  timer = setTimeout(pump, delay);
}

async function pump() {
  if (pumping || loading) return;
  pumping = true;
  $('spinner').hidden = false;
  try {
    while (dirty) {
      const wait = quietUntil - performance.now();
      if (wait > 0) {
        await sleep(wait);
        continue;
      }
      const stage = dirty;
      dirty = 0;
      try {
        for (const [s, run] of [[STAGE.voxel, doVoxelize], [STAGE.process, doProcess], [STAGE.mesh, doMesh]]) {
          if (s > stage) continue;                     // 这一级没变，不用重算
          if (dirty > s) break;                        // 上游又变了：从那里重来
          dirty = 0;                                   // 这一级和下游刚变的，接下来都会算到
          const ctl = new AbortController();
          flight = { stage: s, abort: () => ctl.abort() };
          try {
            await run(ctl.signal);
          } finally {
            flight = null;
          }
        }
      } catch (e) {
        if (!e.quiet) toast(e.message);
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

// 换模型之前：排着队要算的、正在算的都作废，等手头那一步停下
async function halt() {
  dirty = 0;
  if (flight) flight.abort();
  while (pumping) await sleep(30);
}

async function doVoxelize(signal) {
  if (!state.model) return;
  const info = await postJSON('/api/voxelize', voxelParams(), signal);
  const { data } = await getGrid('/api/grid/input');
  state.grid = info;
  state.gridData = data;
  state.proc = state.procData = state.report = state.meshError = state.frame = null;
  state.adopt = state.partial = false;                 // 服务端换了网格，旧的处理结果已经作废
  stopScan();
  scan.z = scan.goal = 0;
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

async function doProcess(signal) {
  if (!state.grid) return;
  if (state.adopt) {
    state.adopt = false;
    await adoptProcessed();
    return;
  }
  const params = processParams();
  const recovered = state.recovered;
  state.recovered = false;
  if (params.mode === 'atlas') {
    // Atlas 只在点按钮时提交。服务重启后例外：算过的结果都在缓存里，读回来不用提交
    if (!recovered) return;
    let found = null;
    try { found = await postJSON('/api/process', { ...params, cached_only: true }); } catch (e) { /* 读不回来就等用户自己点 */ }
    if (found && found.status === 'done') await adoptProcessed();
    return;
  }
  if (params.axes.length === 0) throw new Error('至少选择一个模糊方向（X、Y 或 Z）。');
  await postJSON('/api/process', params, signal);
  await adoptProcessed();
}

async function adoptProcessed() {
  const { data, meta } = await getGrid('/api/grid/processed');
  state.proc = meta.proc;
  state.partial = false;
  state.procData = data;
  stopTurns();
  state.frame = null;
  state.saga = null;
  if (meta.proc.mode === 'nations') {
    state.saga = await getJSON('/api/nations/history');
    sagaBuilt = null;
    state.frame = await getTurn(meta.proc.nations.turns);     // 先显示最后一回合
  }
  // 服务端会把实验名整理成能当文件名的样子，写回来保持一致
  if (document.activeElement !== $('run-input')) $('run-input').value = meta.proc.run;
  paintProcessed();
}

function paintProcessed() {
  if (!state.procData) return;
  if (state.frame) {
    state.procCount = viewer.setOwners('processed', state.frame.bytes, state.frame.box, state.grid.n);
    return;
  }
  state.procCount = viewer.setVoxels('processed', state.procData, state.grid.n, level(), true);
}

// ── 演化：一回合一回合地看 ───────────────────────────────────────────────────

const turns = { timer: null, busy: false };

async function getTurn(turn) {
  const { buffer, meta } = await getBinary(`/api/nations/frame/${turn}`);
  return { turn: meta.turn, turns: meta.turns, box: meta.box, bytes: new Uint8Array(buffer),
    record: state.saga ? state.saga.turns[meta.turn] : null };
}

async function showTurn(turn) {
  if (turns.busy || !state.frame) return;
  turns.busy = true;
  try {
    state.frame = await getTurn(Math.min(Math.max(turn, 0), state.frame.turns));
    paintProcessed();
  } catch (e) {
    stopTurns();                                       // 结果已经换掉了，这一段历史取不到了
  }
  turns.busy = false;
  renderTurns();
  renderSaga();
}

function stopTurns() {
  clearInterval(turns.timer);
  turns.timer = null;
}

function playTurns() {
  if (!state.frame) return;
  const from = state.frame.turn >= state.frame.turns ? 0 : state.frame.turn + 1;
  showTurn(from);
  turns.timer = setInterval(() => {
    if (!state.frame || state.frame.turn >= state.frame.turns) {
      stopTurns();
      renderTurns();
    } else {
      showTurn(state.frame.turn + 1);
    }
  }, Math.max(120, Math.min(350, 15000 / state.frame.turns)));     // 历史长就放快一点，整段大约 15 秒
}

function renderTurns() {
  const view = currentView();
  const on = !!state.frame && (view === 'processed' || view === 'scan');
  $('turn-bar').hidden = !on || view === 'scan';
  if (!on) return;
  const f = state.frame;
  $('turn-t').max = f.turns;
  $('turn-t').value = f.turn;
  paintSlider($('turn-t'));
  $('turn-out').textContent = `第 ${f.turn} / ${f.turns} 回合`;
  $('turn-play').textContent = turns.timer ? '暂停' : f.turn >= f.turns ? '重放' : '播放';
  if (view === 'processed') $('stage-foot-text').textContent = footText('processed');
}

// ── 演化的侧栏：国家之间的关系、这一回合的事、大事记 ─────────────────────────────

const ASK_LABEL = { attack: '进攻', defend: '防守', explore: '探索' };
const DEATH_CAUSE = { conquered: '领土被占光', withered: '自己萎缩殆尽', war: '毁于战争', fled: '在逃离中消失', gone: '' };
const MAJOR = new Set(['annex', 'death', 'split', 'exile', 'breach', 'ally', 'rift', 'war']);
const SVG = 'http://www.w3.org/2000/svg';
let sagaBuilt = null;     // 大事记是给哪一段历史建的

function nationTag(i) {
  const tag = element('span', 'nation');
  const swatch = element('i');
  swatch.style.background = NATION_HEX[i % NATION_HEX.length];
  tag.append(swatch, NATION_NAMES[i % NATION_NAMES.length]);
  return tag;
}

// 把一件事写成一句话。数组里的数字是国家，会换成带颜色的名字
function eventParts(e) {
  if (e.type === 'annex') return [e.who, ' 吞并了 ', e.whom];
  if (e.type === 'death') return [e.who, ' 灭亡了', DEATH_CAUSE[e.cause] ? `（${DEATH_CAUSE[e.cause]}）` : ''];
  if (e.type === 'split') return [e.whom, ' 从 ', e.who, ' 独立'];
  if (e.type === 'exile') return [e.who, ' 逃离了大陆'];
  if (e.type === 'ally') return [e.who, ' 和 ', e.whom, ' 结盟'];
  if (e.type === 'rift') return [e.who, ' 和 ', e.whom, ' 决裂'];
  if (e.type === 'war') return [e.who, ' 和 ', e.whom, ' 互相开战，边界裂开'];
  if (e.type === 'breach') return [...e.who.flatMap((a, n) => (n ? ['、', a] : [a])), ' 联手攻破了 ', e.whom, ' 的防守'];
  return [e.type];
}

function sentence(parts) {
  const line = element('span');
  line.append(...parts.map((part) => (typeof part === 'number' ? nationTag(part) : part)));
  return line;
}

// 这个国家这一回合做了什么。进攻的话返回 null，由调用的地方写上打的是谁
function actionText(r, i) {
  if (r.action[i] === 'attack') return r.attacks.some(([from]) => from === i) ? null : '进攻（没有邻国）';
  return { fortify: '筑墙', grow: '生长', flee: '逃离', split: '分裂', wither: '萎缩',
    waver: '想分裂，没分成' }[r.action[i]] || '';
}

function svgNode(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function renderSaga() {
  const f = state.frame, saga = state.saga;
  const on = !!f && !!saga && !!f.record;
  $('saga-card').hidden = !on;
  if (!on) return;
  const r = f.record;
  $('saga-turn').textContent = `第 ${f.turn} / ${f.turns} 回合`;

  // 关系图：位置就是各国在模型上的位置（正面看），逃走的会飘出去
  if (!saga.frame) {
    const homes = saga.turns.flatMap((t) => t.home.filter(Boolean));
    const spread = (axis) => Math.max(...homes.map((h) => h[axis])) - Math.min(...homes.map((h) => h[axis]));
    const across = spread(0) >= spread(1) ? 0 : 1;
    const range = (axis) => [Math.min(...homes.map((h) => h[axis])), Math.max(...homes.map((h) => h[axis]))];
    saga.frame = { across, x: range(across), z: range(2) };
  }
  const { across, x: [x0, x1], z: [z0, z1] } = saga.frame;
  const place = (h) => [28 + 224 * (h[across] - x0) / Math.max(x1 - x0, 1), 252 - 224 * (h[2] - z0) / Math.max(z1 - z0, 1)];
  const biggest = Math.max(...r.size, 1);
  const radius = (i) => 5 + 11 * Math.sqrt(r.size[i] / biggest);
  const at = r.home.map((h) => (h ? place(h) : null));
  const graph = $('saga-graph');
  const parts = [];
  const tie = new Map(r.ties.map(([i, j, t]) => [`${i}-${j}`, t]));
  for (const [i, j] of r.borders) {
    if (!at[i] || !at[j]) continue;
    const t = tie.get(`${i}-${j}`) || 0;
    parts.push(svgNode('line', { x1: at[i][0], y1: at[i][1], x2: at[j][0], y2: at[j][1],
      'stroke-width': 1 + 4 * t, 'stroke-linecap': 'round',
      style: `stroke: var(${t >= 0.5 ? '--ink' : '--gray-600'}); opacity: ${0.3 + 0.7 * t}` }));
  }
  for (const [i, j] of r.attacks) {
    if (!at[i] || !at[j]) continue;
    const dx = at[j][0] - at[i][0], dy = at[j][1] - at[i][1], d = Math.hypot(dx, dy) || 1;
    const stop = Math.max(d - radius(j) - 5, 0) / d;                 // 箭头停在对方圆的边上
    parts.push(svgNode('line', { x1: at[i][0], y1: at[i][1], x2: at[i][0] + dx * stop, y2: at[i][1] + dy * stop,
      'stroke-width': 1.5, 'marker-end': 'url(#saga-arrow)', style: 'stroke: var(--red-700)' }));
  }
  r.size.forEach((size, i) => {
    if (!size || !at[i]) return;
    if (r.exiled.includes(i)) {
      parts.push(svgNode('circle', { cx: at[i][0], cy: at[i][1], r: radius(i) + 3.5, fill: 'none',
        'stroke-dasharray': '2 3', style: 'stroke: var(--ink-muted)' }));
    }
    parts.push(svgNode('circle', { cx: at[i][0], cy: at[i][1], r: radius(i), fill: NATION_HEX[i % NATION_HEX.length],
      'stroke-width': 1.5, style: 'stroke: var(--surface)' }));
    const label = svgNode('text', { x: at[i][0] + radius(i) + 3, y: at[i][1] + 4 });
    label.textContent = NATION_NAMES[i % NATION_NAMES.length];
    parts.push(label);
  });
  const defs = svgNode('defs', {});
  const marker = svgNode('marker', { id: 'saga-arrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7,
    markerHeight: 7, orient: 'auto' });
  marker.append(svgNode('path', { d: 'M0 0 8 4 0 8Z', style: 'fill: var(--red-700)' }));
  defs.append(marker);
  graph.replaceChildren(defs, ...parts);

  // 这一回合的事
  const happened = r.events.map((e) => sentence(eventParts(e)));
  if (f.turn === 0) happened.unshift(sentence([`建国：${saga.k} 个国家。`]));
  if (!happened.length) happened.push(sentence(['这一回合没有大事。']));
  $('saga-now').replaceChildren(...happened.map((line) => {
    const li = element('li');
    li.append(line);
    return li;
  }));

  // 每个国家：地盘、被问了什么、测量前的概率、结果
  const rows = [];
  r.size.forEach((size, i) => {
    const name = nationTag(i);
    const bar = element('span', 'bar');
    const fill = element('span');
    fill.style.width = `${100 * size / biggest}%`;
    bar.append(fill);
    const did = element('span', 'did');
    if (!size) {
      name.classList.add('gone');
      did.classList.add('gone');
      did.textContent = '已灭亡';
    } else if (!r.action[i]) {
      did.textContent = `${fmt(size)} 格`;
    } else {
      const text = actionText(r, i);
      const target = (r.attacks.find(([from]) => from === i) || [])[1];
      did.append(`问${ASK_LABEL[r.asked[i]]} ${Math.round(100 * r.odds[i])}% → ${r.said[i] ? '是' : '否'}：`,
        ...(text === null ? ['进攻 ', nationTag(target)] : [text]));
    }
    rows.push(name, bar, did);
  });
  $('saga-nations').replaceChildren(...rows);

  // 大事记：整段历史只建一次，之后只标出现在放到哪里
  const log = $('saga-log');
  if (sagaBuilt !== saga) {
    sagaBuilt = saga;
    const items = saga.turns.flatMap((t) => t.events.filter((e) => MAJOR.has(e.type)).map((e) => {
      const li = element('li');
      li.dataset.turn = t.turn;
      const jump = element('button', '', String(t.turn));
      jump.type = 'button';
      jump.setAttribute('aria-label', `跳到第 ${t.turn} 回合`);
      jump.addEventListener('click', () => {
        stopTurns();
        showTurn(t.turn);
      });
      li.append(jump, sentence(eventParts(e)));
      return li;
    }));
    if (!items.length) items.push(Object.assign(element('li'), { textContent: '这段历史里没有大事。' }));
    log.replaceChildren(...items);
  }
  let current = null;
  for (const li of log.children) {
    const turn = Number(li.dataset.turn);
    li.classList.toggle('later', turn > f.turn);
    li.classList.toggle('now', turn === f.turn);
    if (turn <= f.turn) current = li;
  }
  if (current) log.scrollTop = Math.max(current.offsetTop - log.offsetTop - log.clientHeight / 2, 0);
}

async function doMesh(signal) {
  state.report = state.meshError = null;
  if (!state.proc) {
    viewer.clear('result');
    return;
  }
  try {
    const { buffer, meta } = await getBinary('/api/mesh', { ...json(meshParams()), signal });
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
  if (loading) return;                                 // 上一个还没载入完，不排队
  loading = true;
  await halt();
  $('spinner').hidden = false;
  render();
  try {
    state.model = await send();
    $('up-select').value = state.model.up;
    const { buffer } = await getBinary('/api/model/mesh');
    // 换了模型，服务端已经清掉后面几步的结果，这里同步清掉
    state.grid = state.gridData = state.proc = state.procData = state.report = state.meshError = null;
    state.frame = null;
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
    if (!e.quiet) toast(e.message);
  }
  loading = false;
  render();
}

// 本地服务重启过：把正在用的模型从 input/ 重新打开，再按页面上现在的参数从体素化重算一遍
let recovering = false;

async function recover() {
  if (recovering || loading || !state.model) return;
  recovering = loading = true;
  try {
    await halt();
    const up = $('up-select').value;
    const turned = up !== state.model.up;
    toast('本地服务重启过，正在重新载入模型并重算。', 'info');
    $('spinner').hidden = false;
    if (state.model.builtin) {
      // 测试杯子要重新造：从 test_cup.stl 读回来的有浮点误差，Atlas 的缓存会对不上
      state.model = await postJSON('/api/model/test-cup');
      if (up !== '+z') state.model = await postJSON('/api/model/orient', { up });
    } else {
      // 文件名一般跟着模型信息来；没有的话，「已经在 input/ 里的模型」那一栏选中的就是它
      const name = state.model.file || $('model-select').value;
      state.model = await postJSON('/api/model/open', { name, up });
    }
    if (turned) {                                      // 重启前正好在改朝向：模型也要换成转过的
      viewer.setMesh('model', (await getBinary('/api/model/mesh')).buffer);
      viewer.layers.model.visible = false;
      state.frameNext = true;
    }
    state.recovered = true;
    invalidate(STAGE.voxel);
  } catch (e) {
    $('spinner').hidden = true;
    toast(`本地服务重启过，模型没能重新载入，请重新选择模型。（${e.message}）`);
  }
  recovering = loading = false;
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
    if (r.status === 'done') atlasFinished(true, r.meta);
    else watchAtlas(r);
  } catch (e) {
    state.atlasStatus = ['err', e.message];
    render();
  }
}

// 跟着一次提交直到它结束。刷新页面后也从这里接回去
async function watchAtlas(job) {
  state.atlasJob = job.job_id;
  state.run = job;
  stopScan();
  scan.z = scan.goal = 0;                              // 扫描面从底下重新开始
  revealJobs();
  render();
  let seen = -1, lastPartial = 0;
  try {
    while (state.atlasJob) {
      await sleep(1000);
      job = await getJSON(`/api/process/${state.atlasJob}`);
      state.run = job;
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
    state.atlasStatus = ['err', e.restarted || e.status === 404
      ? '本地服务重启了，这次提交中断了。已经提交的分块留着任务号，再点一次「提交到 Atlas」会接着等，不会重复提交。'
      : e.message];
  }
  render();
  refreshJobs();
}

const formatWait = (seconds) => (seconds < 90 ? `${Math.round(seconds)} 秒` : `${(seconds / 60).toFixed(1)} 分钟`);

// 分块一块一块算完，预览跟着一块一块变：没算完的块先显示原样
async function showPartial(jobId) {
  try {
    const { data, meta } = await getGrid(`/api/process/${jobId}/preview`);
    if (!state.grid || meta.n !== state.grid.n) return;
    state.procData = data;
    state.proc = state.report = state.frame = null;
    state.partial = true;
    viewer.clear('result');
    // 一层一层往上算的：用扫描视图，扫描面走到已经连续算完的那一层。别的切法照旧一块一块显示
    state.view = meta.frontier == null ? 'processed' : 'scan';
    paintProcessed();
    if (meta.frontier != null) scanTo(meta.frontier, 2);
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
  // 刚看着它一层层算完的：留在扫描视图，让扫描面走到顶；其他情况直接看结果
  const watched = !cached && state.view === 'scan' && state.grid;
  state.view = watched ? 'scan' : 'result';
  if (watched) scanTo(state.grid.n, 2);
  invalidate(STAGE.process);
}

// ── 扫描 ────────────────────────────────────────────────────────────────
// 一个水平面从下往上走，它下面画量子结果，上面画原来的体素。按层分块提交 Atlas 时，这个面跟着
// 真实的进度走（服务端报告已经连续算完到第几层）；有了结果以后可以重放，也可以拖着它上下看。

const SCAN_SECONDS = 10;                               // 从底到顶放一遍的时间
const scan = { z: 0, goal: 0, speed: 0, last: 0, frame: null, timer: null };

// 下一步：平时跟着屏幕刷新走；页面没在画的时候（比如切到了后台）屏幕刷新不来，就靠定时器接着走
function scanNext() {
  scan.frame = requestAnimationFrame(scanStep);
  scan.timer = setTimeout(() => scanStep(performance.now()), 300);
}

// 让扫描面在 seconds 秒里走到 goal 层
function scanTo(goal, seconds) {
  const n = state.grid.n;
  scan.goal = Math.min(Math.max(goal, 0), n);
  scan.speed = Math.max(Math.abs(scan.goal - scan.z) / seconds, n / 120);
  if (scan.frame === null && scan.z !== scan.goal) {
    scan.last = performance.now();
    scanNext();
  }
  renderScan();
}

function scanStep(now) {
  stopScan(false);
  if (!state.grid) return;
  const step = scan.speed * Math.min((now - scan.last) / 1000, 1);   // 画面卡了也按真实时间走
  scan.last = now;
  const left = scan.goal - scan.z;
  scan.z = Math.abs(left) <= step ? scan.goal : scan.z + Math.sign(left) * step;
  if (scan.z !== scan.goal) scanNext();
  renderScan();
}

function stopScan(here = true) {
  if (scan.frame !== null) cancelAnimationFrame(scan.frame);
  clearTimeout(scan.timer);
  scan.frame = null;
  if (here) scan.goal = scan.z;                        // 停在现在的位置；false 只是取消已经排好的下一步
}

function playScan(fromBottom) {
  if (!state.grid) return;
  if (fromBottom) scan.z = 0;
  scanTo(state.grid.n, SCAN_SECONDS * (1 - scan.z / state.grid.n));
}

function renderScan() {
  const on = currentView() === 'scan';
  $('scan-bar').hidden = !on;
  viewer.setScan(on ? scan.z : null);
  if (!on) return;
  const n = state.grid.n;
  const live = !!state.atlasJob;                       // 跟着 Atlas 的进度走的时候不能自己拖
  const slider = $('scan-z');
  slider.max = n;
  slider.value = Math.round(scan.z);
  slider.disabled = live;
  paintSlider(slider);
  $('scan-out').textContent = `${Math.round(scan.z)} / ${n} 层`;
  $('scan-play').textContent = scan.frame !== null && !live ? '暂停' : scan.z >= n ? '重放' : '播放';
  $('scan-play').disabled = live;
}

// ── Atlas 任务列表 ─────────────────────────────────────────────────────────
// 账户里的任务，新的在前；本应用提交的标上实验名和分块。这一栏只在 Atlas 模式下出现，
// 用本地模拟调参时页面不会向 Atlas 发任何请求。出现并且展开时：有任务在跑 3 秒更新一次，
// 否则 30 秒一次，页面不在前台时停下。

const JOB_STATE = {
  queued: ['', '排队中'], pending: ['', '排队中'],
  processing: ['info', '运行中'], running: ['info', '运行中'],
  completed: ['ok', '已完成'], succeeded: ['ok', '已完成'], success: ['ok', '已完成'],
  failed: ['err', '失败'], cancelled: ['warn', '已取消'], canceled: ['warn', '已取消'],
};
const FILTER_LABEL = { active: '进行中', completed: '已完成', failed: '失败或取消' };
const DAY = 864e5;
const JOBS_STEP = 50;
const calm = matchMedia('(prefers-reduced-motion: reduce)');

const jobs = {
  open: false,
  pref: null,           // 用户自己点过展开或收起（'open' / 'closed'）
  byId: new Map(),      // 任务号 → 服务端给的那一行
  rows: new Map(),      // 任务号 → 页面上的那一行
  cursor: null,         // 更早的任务从哪里接着取
  loaded: false,
  shown: JOBS_STEP,
  filter: 'all',
  expanded: new Set(),
  details: new Map(),   // 展开时另外查到的失败原因
  busy: false,
  error: null,
  updated: null,
  fetched: 0,           // 上一次向 Atlas 要数据的时刻
  timer: null,
  epoch: 0,             // 换 key 之后加一，丢掉还在路上的旧响应
};

function jobGroup(status) {
  const dot = (JOB_STATE[status] || [''])[0];
  return dot === 'ok' ? 'completed' : dot === 'err' || dot === 'warn' ? 'failed' : 'active';
}

const sortedJobs = () => [...jobs.byId.values()].sort((a, b) =>
  String(b.created_at).localeCompare(String(a.created_at)) || a.job_id.localeCompare(b.job_id));

const jobsActive = () => !!state.atlasJob
  || sortedJobs().slice(0, JOBS_STEP).some((j) => jobGroup(j.status) === 'active');

const jobPage = (limit, cursor) =>
  getJSON(`/api/atlas/jobs?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);

// 第一次一页取 200 个；这一页全在 24 小时以内就接着取，最多三页，「过去 24 小时」的数才准
async function loadJobs(epoch) {
  let cursor = null;
  for (let pages = 0; pages < 3; pages++) {
    const page = await jobPage(200, cursor);
    if (epoch !== jobs.epoch) return;
    for (const job of page.jobs) jobs.byId.set(job.job_id, job);
    cursor = page.next_cursor;
    const last = page.jobs[page.jobs.length - 1];
    if (!cursor || !last || Date.now() - Date.parse(last.created_at) > DAY) break;
  }
  jobs.cursor = cursor;
  jobs.loaded = true;
}

// 回到前台、切回 Atlas 模式时：离上次更新不够久就只把定时器续上，不马上再问一次
function resumeJobs() {
  clearTimeout(jobs.timer);
  const wait = (jobsActive() ? 3000 : 30000) - (Date.now() - jobs.fetched);
  if (wait > 0 && jobs.loaded) jobs.timer = setTimeout(refreshJobs, wait);
  else refreshJobs();
}

async function refreshJobs() {
  clearTimeout(jobs.timer);
  if ($('jobs').hidden || !jobs.open || document.hidden || jobs.busy) return;
  if (!state.key || !state.key.set) {
    renderJobs();
    return;
  }
  const epoch = jobs.epoch;
  jobs.busy = true;
  try {
    if (!jobs.loaded) {
      renderJobs();
      await loadJobs(epoch);
    } else {
      const page = await jobPage(JOBS_STEP);
      if (epoch === jobs.epoch) {
        if (page.jobs.length && jobs.byId.size && !page.jobs.some((j) => jobs.byId.has(j.job_id))) {
          jobs.byId.clear();                           // 离开太久，新任务和已有的接不上了：重新载入
          await loadJobs(epoch);
        } else {
          for (const job of page.jobs) jobs.byId.set(job.job_id, job);
        }
      }
    }
    if (epoch === jobs.epoch) {
      jobs.error = null;
      jobs.updated = new Date();
    }
  } catch (e) {
    if (epoch === jobs.epoch) jobs.error = e.message;
  }
  jobs.busy = false;
  jobs.fetched = Date.now();
  if (epoch !== jobs.epoch) {
    refreshJobs();
    return;
  }
  renderJobs(true);
  jobs.timer = setTimeout(refreshJobs, jobsActive() ? 3000 : 30000);
}

function resetJobs() {
  jobs.epoch++;
  jobs.byId.clear();
  jobs.details.clear();
  jobs.expanded.clear();
  Object.assign(jobs, { cursor: null, loaded: false, shown: JOBS_STEP, error: null, updated: null });
  renderJobs();
  refreshJobs();
}

async function moreJobs() {
  jobs.shown += JOBS_STEP;
  const have = jobs.filter === 'all' ? jobs.byId.size
    : sortedJobs().filter((j) => jobGroup(j.status) === jobs.filter).length;
  if (jobs.shown > have && jobs.cursor && !jobs.busy) {
    const epoch = jobs.epoch;
    jobs.busy = true;
    try {
      const page = await jobPage(200, jobs.cursor);
      if (epoch === jobs.epoch) {
        for (const job of page.jobs) jobs.byId.set(job.job_id, job);
        jobs.cursor = page.next_cursor;
      }
    } catch (e) {
      if (epoch === jobs.epoch) jobs.error = e.message;
    }
    jobs.busy = false;
  }
  renderJobs();
  refreshJobs();                                       // 取更早的任务时可能错过了一次定时更新
}

function setJobsOpen(open, byUser) {
  jobs.open = open;
  if (byUser) {
    jobs.pref = open ? 'open' : 'closed';
    try { localStorage.setItem('quantum-sculpting-jobs', jobs.pref); } catch (e) { /* 存不了就下次用默认的 */ }
  }
  $('jobs-body').hidden = !open;
  $('jobs-toggle').setAttribute('aria-expanded', String(open));
  renderJobs();
  refreshJobs();
}

// 提交任务或存好 key 之后把列表展开，除非用户自己收起过
function revealJobs() {
  if (!jobs.open && jobs.pref !== 'closed') setJobsOpen(true, false);
  else refreshJobs();
}

async function toggleJob(id) {
  if (jobs.expanded.delete(id)) {
    renderJobs();
    return;
  }
  jobs.expanded.add(id);
  renderJobs();
  const job = jobs.byId.get(id);
  if (!job || jobGroup(job.status) === 'completed') return;   // 完成的任务再查一次会把整个结果下载下来
  try {
    jobs.details.set(id, await getJSON(`/api/atlas/jobs/${id}`));
  } catch (e) {
    jobs.details.set(id, { note: `查不到更多信息：${e.message}` });
  }
  renderJobs();
}

function ago(iso, now) {
  const s = (now - Date.parse(iso)) / 1000;
  if (Number.isNaN(s)) return '';
  if (s < 60) return `${Math.max(0, Math.floor(s))} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

function clock(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN', { hour12: false });
}

function setText(el, value) {
  if (el.textContent !== value) el.textContent = value;
}

function makeJobRow(job) {
  const item = element('div', 'jobs-item');
  const row = element('div', 'jobs-row');
  row.setAttribute('role', 'row');
  const cell = {};
  for (const name of ['n', 'when', 'engine', 'id', 'source', 'status']) {
    cell[name] = element('span', `jobs-${name}`);
    cell[name].setAttribute('role', 'cell');
    row.append(cell[name]);
  }
  const open = element('button', 'jobs-open');
  open.type = 'button';
  open.setAttribute('aria-label', '任务详情');
  cell.no = element('span', 'mono muted');
  cell.n.append(open, cell.no);
  cell.engine.classList.add('mono');
  cell.id.classList.add('mono');
  cell.id.textContent = `${job.job_id.slice(0, 8)}…`;
  cell.id.title = job.job_id;
  const detail = element('dl', 'stats jobs-detail');
  item.append(row, detail);
  row.addEventListener('click', () => {
    if (!String(getSelection())) toggleJob(job.job_id);   // 在行里选文字不算点击
  });
  return { item, row, cell, open, detail, status: null, source: null, detailKey: null };
}

function paintJobRow(view, job, index, now) {
  const { cell } = view;
  setText(cell.no, String(index + 1));
  setText(cell.when, ago(job.created_at, now));
  cell.when.title = clock(job.created_at);
  setText(cell.engine, job.engine || '');

  const local = job.local;
  const source = JSON.stringify(local ? [local.run, local.tile] : job.mine);
  if (view.source !== source) {
    view.source = source;
    cell.source.replaceChildren(...(local
      ? [element('span', '', local.run || '本应用'),
        ...(local.tile ? [element('span', 'muted', `块 ${local.tile.join(',')}`)] : [])]
      : [element('span', 'muted', job.mine === false ? '组织里的其他成员' : '个人账户')]));
  }

  if (view.status !== job.status) {
    const [dot, label] = JOB_STATE[job.status] || ['', job.status || '未知'];
    const parts = [element('span', `dot ${dot}`), element('span', '', label)];
    if (jobGroup(job.status) === 'active') {
      // Atlas 不报百分比，这一小条只表示走到了哪个阶段
      const bar = element('span', `progress${dot === 'info' ? ' busy' : ''}`);
      bar.append(element('span'));
      bar.firstChild.style.width = dot === 'info' ? '60%' : '15%';
      parts.push(bar);
    }
    cell.status.replaceChildren(...parts);
    if (view.status !== null) {                        // 状态变了，闪一下
      view.row.classList.remove('changed');
      void view.row.offsetWidth;
      view.row.classList.add('changed');
    }
    view.status = job.status;
  }
  cell.status.title = job.progress || '';

  const expanded = jobs.expanded.has(job.job_id);
  view.open.setAttribute('aria-expanded', String(expanded));
  view.detail.hidden = !expanded;
  if (expanded) paintJobDetail(view, job);
}

function paintJobDetail(view, job) {
  const extra = jobs.details.get(job.job_id) || {};
  const key = JSON.stringify([job, extra]);
  if (view.detailKey === key) return;                  // 没变就不重画，选中的文字不会丢
  view.detailKey = key;

  const id = document.createDocumentFragment();
  const copy = element('button', '', '复制');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(job.job_id);
      toast('已复制任务号。', 'ok');
    } catch (e) {
      toast('复制不了，手动选中任务号再复制。');
    }
  });
  id.append(job.job_id, copy);

  const local = job.local;
  const p = local && local.params;
  const ended = jobGroup(job.status) !== 'active';
  const took = (Date.parse(job.updated_at) - Date.parse(job.created_at)) / 1000;
  const progress = job.progress || (ended ? null : extra.progress);
  renderStats(view.detail, [
    ['任务号', id],
    ['提交时间', clock(job.created_at)],
    [ended ? '结束时间' : '最后更新', clock(job.updated_at)],
    ...(ended && took >= 0 ? [['在 Atlas 上用时', formatWait(took)]] : []),
    ['来源', local ? '本应用提交' : job.mine === false ? '组织里其他成员提交的' : '个人账户，不是从这个项目文件夹提交的'],
    ...(local && local.run ? [['实验名', local.run]] : []),
    ...(local && local.shape ? [['分块', local.shape.join('×') + (local.tile ? `，位置 ${local.tile.join(', ')}` : '')]] : []),
    ...(p ? [['参数', [`strength ${p.strength}`, `reach ${p.reach}`, `style ${p.style}`,
      ...(p.axes ? [`axes ${p.axes.map((a) => 'XYZ'[a]).join('')}`] : []),
      ...(p.shots ? [`shots ${fmt(p.shots)}`] : [])].join(' · ')]] : []),
    ...(progress ? [['进度', progress]] : []),
    ...(extra.error ? [['失败原因', extra.error]] : []),
    ...(extra.note ? [['详情', extra.note]] : []),
  ]);
}

// animate：数据更新时让各行滑到新位置，新来的行从上面淡入
function renderJobs(animate = false) {
  const hasKey = !!(state.key && state.key.set);
  const now = Date.now();
  const all = sortedJobs();
  const matching = jobs.filter === 'all' ? all : all.filter((j) => jobGroup(j.status) === jobs.filter);
  const shown = jobs.open && hasKey ? matching.slice(0, jobs.shown) : [];
  const list = $('jobs-list');

  const move = animate && !calm.matches && jobs.rows.size > 0;
  const before = new Map();
  if (move) for (const [id, view] of jobs.rows) before.set(id, view.item.getBoundingClientRect().top);

  const keep = new Set();
  let anchor = null;
  shown.forEach((job, index) => {
    let view = jobs.rows.get(job.job_id);
    if (!view) {
      view = makeJobRow(job);
      jobs.rows.set(job.job_id, view);
    }
    paintJobRow(view, job, index, now);
    const next = anchor ? anchor.nextSibling : list.firstChild;
    if (next !== view.item) list.insertBefore(view.item, next);
    anchor = view.item;
    keep.add(job.job_id);
  });
  for (const [id, view] of jobs.rows) {
    if (keep.has(id)) continue;
    view.item.remove();
    jobs.rows.delete(id);
  }

  if (move) {
    const frame = $('jobs-table').getBoundingClientRect();
    for (const id of keep) {
      const { item } = jobs.rows.get(id);
      const top = item.getBoundingClientRect().top;
      if (top > frame.bottom + 200) break;             // 看不见的行不用动
      if (!before.has(id)) {
        item.animate([{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'none' }],
          { duration: 500, easing: 'ease-out' });
      } else if (Math.abs(before.get(id) - top) > 0.5) {
        item.animate([{ transform: `translateY(${before.get(id) - top}px)` }, { transform: 'none' }],
          { duration: 600, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      }
    }
  }

  const ready = jobs.open && hasKey && jobs.loaded;
  const day = all.filter((j) => now - Date.parse(j.created_at) < DAY);
  const active = all.filter((j) => jobGroup(j.status) === 'active').length;
  const failed = day.filter((j) => (JOB_STATE[j.status] || [])[0] === 'err').length;
  // 载入的全在 24 小时以内、后面还有没载入的：实际数量只会更多
  const atLeast = jobs.cursor && day.length === all.length ? '+' : '';
  $('jobs-summary').textContent = !ready ? '' : [
    `过去 24 小时 ${fmt(day.length)}${atLeast} 个任务`,
    ...(active ? [`${active} 个进行中`] : []),
    ...(failed ? [`${failed} 个失败`] : []),
  ].join(' · ');

  const empty = !hasKey ? '设置 Atlas API key 后，这里会列出账户里的任务。点右上角的「设置 API key」。'
    : !jobs.loaded ? (jobs.error ? '读不到任务列表。' : '正在读取…')
      : all.length === 0 ? '账户里还没有任务。提交一次 Atlas 处理后会出现在这里。'
        : matching.length === 0 ? `最近 ${fmt(all.length)} 个任务里没有${FILTER_LABEL[jobs.filter]}的。` : '';
  $('jobs-empty').hidden = !empty;
  $('jobs-empty').textContent = empty;
  $('jobs-foot').hidden = !ready || matching.length === 0;
  $('jobs-more').hidden = !(matching.length > jobs.shown || jobs.cursor);
  $('jobs-count').textContent = `显示 ${fmt(shown.length)} / ${fmt(matching.length)} 个`
    + (jobs.cursor ? '，更早的还没有载入。' : '。');
  setStatusLine('jobs-status', !hasKey ? null : jobs.error ? ['err', jobs.error]
    : !jobs.updated ? null : jobsActive() ? ['info', '有任务在运行，每 3 秒更新']
      : ['', `${jobs.updated.toLocaleTimeString('zh-CN', { hour12: false })} 更新`]);
  $('jobs-refresh').disabled = !hasKey;
}

// 任务栏右边的进度条：这次提交算完了几块
function renderRun() {
  const run = state.atlasJob ? state.run : null;
  $('jobs-run').hidden = !run;
  if (!run) return;
  const bar = $('jobs-run-bar');
  const tiled = run.tiles_total > 1;
  $('jobs-run-text').textContent = tiled ? `${run.run} · 分块 ${run.tiles_done} / ${run.tiles_total}`
    : `${run.run} · ${ATLAS_STATE[run.atlas_status] || run.atlas_status}`;
  bar.classList.toggle('indeterminate', !tiled);
  bar.firstElementChild.style.width = tiled ? `${run.tiles_done / run.tiles_total * 100}%` : '';
  bar.setAttribute('aria-valuemax', run.tiles_total);
  if (tiled) bar.setAttribute('aria-valuenow', run.tiles_done);
  else bar.removeAttribute('aria-valuenow');
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
    if (result && 'set' in result) {
      state.key = result;
      resetJobs();                                     // 换了 key 就是换了账户
      if (result.set) revealJobs();
    }
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
    processed: !!state.procData, result: !!state.report,
    scan: !!state.gridData && !!state.procData }[view];
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
  if (view === 'processed' && state.frame) {
    const r = state.frame.record;
    const alive = r ? r.size.filter((s) => s > 0).length : state.proc.nations.k;
    if (!r || !state.frame.turn) return `建国：${alive} 个国家 · ${fmt(state.procCount)} 个体素`;
    const did = (what) => r.action.filter((a) => a === what).length;
    return `还有 ${alive} 国 · ${fmt(state.procCount)} 个体素 · 进攻 ${did('attack')} · 筑墙 ${did('fortify')}`
      + ` · 生长 ${did('grow')} · 逃离 ${did('flee')} · 萎缩 ${did('wither')}`;
  }
  if (view === 'processed') return `阈值 ${level().toFixed(2)} · ${fmt(state.procCount)} 个格子在阈值以上`;
  if (view === 'result') return `${fmt(r.faces)} 个面 · ${r.parts} 块 · ${dims(r.extents)} mm`;
  if (view === 'scan') {
    if (state.atlasJob) return 'Atlas 正在一层一层往上算，扫描面以下是已经算完的';
    const t = state.proc && state.proc.tiles;
    return '扫描面以下是量子结果，以上是原来的体素'
      + (t && t.mode === 'layers' && t.jobs > 1 ? ' · 这个结果就是这样从下往上一层层算出来的' : '');
  }
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
  $('tiling-field').hidden = mode === 'gaussian' || mode === 'nations' || !tiles || tiles.total === 1;
  if (tiles) {
    $('tiling-help').textContent = segValue('tiling-seg') === 'cube'
      ? `切成 ${tileText} 的块，三个方向都参与模糊，最接近整块计算。有东西的块共 ${tiles.jobs} 个，每个是一次 Atlas 任务。`
      : `每 ${tiles.shape[2]} 层一块（${tileText}），从下往上一块一块算，共 ${tiles.jobs} 个 Atlas 任务。水平方向完整，竖直方向只在这几层之间模糊。`;
  }

  $('gaussian-params').hidden = mode !== 'gaussian';
  $('nations-params').hidden = mode !== 'nations';
  $('quantum-params').hidden = mode === 'gaussian' || mode === 'nations';
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
    ...(p.nations ? [
      ['国家', `${p.nations.k} 个开始，前后 ${p.nations.total} 个，${p.nations.turns} 回合后还有 ${p.nations.alive} 个`],
      ['独立 / 吞并 / 灭亡', `${p.nations.split} / ${p.nations.annexed} / ${p.nations.died}`],
      ['逃离大陆 / 互相开战', `${p.nations.exiled} / ${p.nations.wars}`],
      ['体素', `${fmt(p.nations.start)} → ${fmt(p.nations.end)}`],
    ] : [['原始数值范围', `${p.min} – ${p.max}`]]),
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
  $('empty').hidden = !!m || loading;
  $('stage-foot-text').textContent = loading ? '正在载入模型…' : view ? footText(view) : '';
  for (const id of ['pick-file', 'use-test-cup', 'model-select', 'up-select']) $(id).disabled = loading;

  // 任务栏只在 Atlas 模式下（或有一次提交还在跑时）出现
  const showJobs = mode === 'atlas' || !!state.atlasJob;
  if ($('jobs').hidden === showJobs) {
    $('jobs').hidden = !showJobs;
    if (showJobs) resumeJobs();
    else clearTimeout(jobs.timer);
  }
  renderScan();
  renderTurns();
  renderSaga();
  renderRun();
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
    if (loading) toast('上一个模型还在载入，等它好了再换。', 'info');
    else uploadFile(e.dataTransfer.files[0]);
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

  // 演化要算一整段历史，滑块停下来稍久一点再算
  const invalidateNations = () => {
    if (state.view !== 'result') state.view = 'processed';
    invalidate(STAGE.process, 400);
  };
  const processChanged = () => {
    if (segValue('mode-seg') === 'atlas') {
      if (!state.atlasJob) state.atlasStatus = null;   // 参数变了，上一次提交的状态不再适用
      render();
      return;
    }
    if (state.view !== 'result') state.view = 'processed';
    render();                                          // 模式对应的控件、任务栏马上跟着变，不等算完
    invalidate(STAGE.process, 120);
  };
  bindSeg('mode-seg', processChanged);
  bindSeg('tiling-seg', processChanged);
  for (const id of ['sigma', 'strength', 'reach']) bindSlider(id, 2, processChanged);
  for (const id of ['nations-k', 'nations-turns']) bindSlider(id, 0, () => invalidateNations());
  bindSlider('nations-spread', 1, () => invalidateNations());
  $('nations-grooves').addEventListener('change', processChanged);
  $('turn-play').addEventListener('click', () => {
    if (turns.timer) stopTurns();
    else playTurns();
    renderTurns();
  });
  $('turn-t').addEventListener('input', (e) => {      // 拖着看：停下播放，直接跳到那一回合
    stopTurns();
    showTurn(Number(e.target.value));
  });
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
      if (!e.quiet) toast(e.message);
    }
  });

  bindSeg('view-seg', (value) => {
    state.view = value;
    render();
    if (value === 'scan' && !state.atlasJob) playScan(true);   // 切过来就从底下放一遍
  });
  $('scan-play').addEventListener('click', () => {
    if (scan.frame !== null) {
      stopScan();
      renderScan();
    } else {
      playScan(scan.z >= state.grid.n);
    }
  });
  $('scan-z').addEventListener('input', (e) => {      // 拖着看：停下播放，面跟着手走
    stopScan();
    scan.z = scan.goal = Number(e.target.value);
    renderScan();
  });
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

  $('jobs-toggle').addEventListener('click', () => setJobsOpen(!jobs.open, true));
  bindSeg('jobs-filter-seg', (value) => {
    jobs.filter = value;
    jobs.shown = JOBS_STEP;
    $('jobs-table').scrollTop = 0;
    renderJobs();
  });
  $('jobs-refresh').addEventListener('click', refreshJobs);
  $('jobs-more').addEventListener('click', moreJobs);
  document.addEventListener('visibilitychange', resumeJobs);
  setInterval(() => {                                  // 「几秒前」自己往前走，不用等下一次向 Atlas 要数据
    if (!$('jobs').hidden && jobs.open && !document.hidden && jobs.rows.size) renderJobs();
  }, 5000);

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

// 把第三步的控件设成某一次处理用的参数
function showProcessParams(mode, run, params, tiling) {
  setSeg('mode-seg', mode);
  if (tiling) setSeg('tiling-seg', tiling);
  $('run-input').value = run;
  if (mode === 'gaussian') {
    $('sigma').value = params.sigma;
  } else if (mode === 'nations') {
    $('nations-k').value = params.k;
    $('nations-turns').value = params.turns;
    $('nations-spread').value = params.reach;
    $('nations-grooves').checked = !!params.grooves;
    for (const id of ['nations-k', 'nations-turns', 'nations-spread']) $(id).paint();
  } else {
    $('strength').value = params.strength;
    $('reach').value = params.reach;
    $('style-select').value = params.style;
    $('shots-input').value = params.shots || '';
    for (const a of [0, 1, 2]) $(`axis-${a}`).checked = !params.axes || params.axes.includes(a);
  }
  for (const id of ['sigma', 'strength', 'reach']) $(id).paint();
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
    showProcessParams(p.mode, p.run, p.params, p.tiles && p.tiles.mode);
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
  refreshModels();
  try {
    const saved = await getJSON('/api/state');
    state.key = saved.key;
    try { jobs.pref = localStorage.getItem('quantum-sculpting-jobs'); } catch (e) { /* 用默认的 */ }
    // 有 key 就默认展开任务列表；手机宽度上它会把控件挤到很下面，默认收起
    setJobsOpen(jobs.pref ? jobs.pref === 'open' : saved.key.set && matchMedia('(min-width: 761px)').matches, false);
    if (saved.model && !loading && !state.model) {
      loading = true;                                  // 接回来的过程中不让别的流程插进来
      try {
        await restore(saved);
      } finally {
        loading = false;
      }
    }
    if (saved.job) {                                   // 有一次提交还在 Atlas 上跑：接回去看着它
      showProcessParams('atlas', saved.job.run, saved.job.params, saved.job.tiling);
      watchAtlas(saved.job);
    }
  } catch (e) {
    toast(e.message);
  }
  render();
}

init();
