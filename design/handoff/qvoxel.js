/* Quantum Cup — voxel pipeline visuals: voxelize → Quantum Blur Core (emulated) → threshold surface.
   3D  <div data-vox="grid|field|iso|series" data-theme="light|chrome" data-n="32" data-mode="qpu|sim|mock" data-run="1" data-level=".5" data-smooth="5" data-keep="largest|all" data-slice="12" data-fit="1.2" data-elev="20">
   2D  <canvas data-vslice="bin|field" data-z="12" data-theme="light|dark">   <canvas data-vhist data-level=".5" data-theme="light|dark"> */
(function () {
  const URL3 = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
  let P3 = null; const T3 = () => P3 || (P3 = import(URL3));
  const Rt = () => document.querySelector('[data-qs-root]');
  const motion = () => !(Rt() && Rt().getAttribute('data-motion') === 'false');
  const A = (el, k, d) => { const v = el.getAttribute('data-' + k); return v == null || v === '' ? d : v; };
  function rng(seed) { let a = (seed * 2654435761) >>> 0 || 7; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const VX = {}, FD = {};
  // Cup in mm: Ø80, H90, wall 6, base 6, looped handle. Fitted into n³ with pad 2 (longest edge = usable − 1).
  function voxelize(n) {
    if (VX[n]) return VX[n];
    const pad = 2, us = n - 2 * pad, sc = (us - 1) / 120, ox = pad + (us - 1 - 115 * sc) / 2, oy = pad + (us - 1 - 80 * sc) / 2, oz = pad;
    const inside = (x, y, z) => {
      if (z < 0 || z > 90) return false;
      const r = Math.hypot(x, y);
      if (r <= 40 && (r >= 34 || z <= 6)) return true;
      return x > 37 && Math.hypot(Math.hypot(x - 46, z - 50) - 22, y) <= 6.5;
    };
    const g = new Float32Array(n * n * n); let solid = 0;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let c = 0;
      for (let s = 0; s < 8; s++) {
        const x = (i + .25 + .5 * (s & 1) - ox) / sc - 40, y = (j + .25 + .5 * ((s >> 1) & 1) - oy) / sc - 40, z = (k + .25 + .5 * ((s >> 2) & 1) - oz) / sc;
        if (inside(x, y, z)) c++;
      }
      if (c >= 2) { g[i + n * (j + n * k)] = 1; solid++; }
    }
    return VX[n] = { g, n, sc, solid };
  }
  function norm(F) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < F.length; i++) { const v = F[i]; if (v < lo) lo = v; if (v > hi) hi = v; } const d = hi - lo || 1; for (let i = 0; i < F.length; i++) F[i] = (F[i] - lo) / d; return F; }
  // mock = gaussian σ1 stand-in. sim/qpu = amplitudes mixed across Gray-code bit-flip partners per axis (binary-offset echoes) + shot noise.
  function field(n, mode, run) {
    const key = n + mode + run; if (FD[key]) return FD[key];
    const N3 = n * n * n; let cur = Float32Array.from(voxelize(n).g);
    if (mode === 'mock') {
      const k = [.054, .242, .399, .242, .054];
      for (let ax = 0; ax < 3; ax++) {
        const st = ax === 0 ? 1 : ax === 1 ? n : n * n, out = new Float32Array(N3);
        for (let p = 0; p < N3; p++) {
          const c = ax === 0 ? p % n : ax === 1 ? ((p / n) | 0) % n : (p / (n * n)) | 0; let s = 0;
          for (let t = -2; t <= 2; t++) { const q = c + t; if (q >= 0 && q < n) s += k[t + 2] * cur[p + t * st]; }
          out[p] = s;
        }
        cur = out;
      }
      return FD[key] = norm(cur);
    }
    const nb = Math.round(Math.log2(n)), gray = x => x ^ (x >> 1), ig = g => { let x = g; for (let m = g >> 1; m; m >>= 1) x ^= m; return x; };
    const P = []; for (let x = 0; x < n; x++) { const row = []; for (let b = 0; b < nb; b++) row.push(ig(gray(x) ^ (1 << b))); P.push(row); }
    const w = []; let ws = 0; for (let b = 0; b < nb; b++) { const v = Math.exp(-b * 1.15); w.push(v); ws += v; }
    const a = .6, r = rng(run * 7919 + (mode === 'qpu' ? 31 : 3));
    for (let it = 0; it < 2; it++) {
      const out = new Float32Array(N3);
      for (let kz = 0; kz < n; kz++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const p = i + n * (j + n * kz); let acc = 0;
        for (let b = 0; b < nb; b++) acc += w[b] * (cur[P[i][b] + n * (j + n * kz)] + cur[i + n * (P[j][b] + n * kz)] + cur[i + n * (j + n * P[kz][b])]);
        out[p] = (1 - a) * cur[p] + a * acc / (3 * ws);
      }
      cur = out;
    }
    const hw = mode === 'qpu' ? .24 : .1, sp = mode === 'qpu' ? .0018 : .0008;
    for (let p = 0; p < N3; p++) cur[p] = Math.max(0, cur[p] * (1 + (r() - .5) * hw) + (r() < sp ? r() * .42 : 0));
    return FD[key] = norm(cur);
  }
  // Surface nets (stands in for marching cubes in the preview).
  function nets(F, n, L) {
    const m = n + 2, C = m - 1;
    const P = (i, j, k) => (i < 1 || j < 1 || k < 1 || i > n || j > n || k > n) ? 0 : F[(i - 1) + n * ((j - 1) + n * (k - 1))];
    const vid = new Int32Array(C * C * C).fill(-1), pos = [], cv = new Float32Array(8);
    const E = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
    for (let k = 0; k < C; k++) for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) { const v = P(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1)); cv[c] = v; if (v > L) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (let e = 0; e < 24; e += 2) {
        const a = E[e], b = E[e + 1];
        if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
        const t = (L - cv[a]) / (cv[b] - cv[a]);
        sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; cnt++;
      }
      vid[i + C * (j + C * k)] = pos.length / 3; pos.push(i + sx / cnt, j + sy / cnt, k + sz / cnt);
    }
    const cube = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= C || j >= C || k >= C) ? -1 : vid[i + C * (j + C * k)];
    const idx = [], quad = (a, b, c, d, f) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (f) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); };
    for (let k = 0; k < m; k++) for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const s = P(i, j, k) > L;
      if (i < m - 1 && j > 0 && k > 0 && (P(i + 1, j, k) > L) !== s) quad(cube(i, j - 1, k - 1), cube(i, j, k - 1), cube(i, j, k), cube(i, j - 1, k), s);
      if (j < m - 1 && i > 0 && k > 0 && (P(i, j + 1, k) > L) !== s) quad(cube(i - 1, j, k - 1), cube(i - 1, j, k), cube(i, j, k), cube(i, j, k - 1), s);
      if (k < m - 1 && i > 0 && j > 0 && (P(i, j, k + 1) > L) !== s) quad(cube(i - 1, j - 1, k), cube(i, j - 1, k), cube(i, j, k), cube(i - 1, j, k), s);
    }
    return { pos, idx };
  }
  function surface(T, F, n, L, smooth, keep, S) {
    const { pos, idx } = nets(F, n, L), V = pos.length / 3;
    const par = new Int32Array(V); for (let i = 0; i < V; i++) par[i] = i;
    const fd = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const un = (a, b) => { a = fd(a); b = fd(b); if (a !== b) par[b] = a; };
    for (let t = 0; t < idx.length; t += 3) { un(idx[t], idx[t + 1]); un(idx[t], idx[t + 2]); }
    const cnt = new Map(); for (let t = 0; t < idx.length; t += 3) { const r = fd(idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
    let best = -1, bc = 0; cnt.forEach((c, r) => { if (c > bc) { bc = c; best = r; } });
    const out = []; for (let t = 0; t < idx.length; t += 3) { const r = fd(idx[t]); if (keep === 'all' ? cnt.get(r) >= 12 : r === best) out.push(idx[t], idx[t + 1], idx[t + 2]); }
    const Q = Float32Array.from(pos);
    if (smooth > 0) {
      const nb = Array.from({ length: V }, () => []);
      for (let t = 0; t < out.length; t += 3) { const a = out[t], b = out[t + 1], c = out[t + 2]; nb[a].push(b, c); nb[b].push(a, c); nb[c].push(a, b); }
      const tmp = Float32Array.from(Q);
      const step = f => { for (let v = 0; v < V; v++) { const L2 = nb[v]; if (!L2.length) continue; let x = 0, y = 0, z = 0; for (const u of L2) { x += Q[u * 3]; y += Q[u * 3 + 1]; z += Q[u * 3 + 2]; } const k = 1 / L2.length; tmp[v * 3] = Q[v * 3] + f * (x * k - Q[v * 3]); tmp[v * 3 + 1] = Q[v * 3 + 1] + f * (y * k - Q[v * 3 + 1]); tmp[v * 3 + 2] = Q[v * 3 + 2] + f * (z * k - Q[v * 3 + 2]); } Q.set(tmp); };
      for (let s = 0; s < smooth; s++) { step(.55); step(-.58); }
    }
    const off = (n - 1) / 2, u = S / n, W = new Float32Array(V * 3);
    for (let v = 0; v < V; v++) { W[v * 3] = (Q[v * 3] - 1 - off) * u; W[v * 3 + 1] = (Q[v * 3 + 2] - 1 - off) * u; W[v * 3 + 2] = (Q[v * 3 + 1] - 1 - off) * u; }
    let vol = 0; for (let t = 0; t < out.length; t += 3) { const a = out[t] * 3, b = out[t + 1] * 3, c = out[t + 2] * 3; vol += W[a] * (W[b + 1] * W[c + 2] - W[b + 2] * W[c + 1]) - W[a + 1] * (W[b] * W[c + 2] - W[b + 2] * W[c]) + W[a + 2] * (W[b] * W[c + 1] - W[b + 1] * W[c]); }
    if (vol < 0) for (let t = 0; t < out.length; t += 3) { const x = out[t + 1]; out[t + 1] = out[t + 2]; out[t + 2] = x; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(W, 3)); g.setIndex(out); g.computeVertexNormals();
    return g;
  }
  function envTex(T, rd) {
    const s = new T.Scene(); s.background = new T.Color(0x2a2a2a);
    const add = (w, h, x, y, z, k) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
    add(24, 24, 0, 12, 0, 2.5); add(2, 13, -9, 3, 3, 2.6); add(2.6, 13, 9, 2, -3, 3.4); add(34, 1.1, 0, -.6, -14, 1.1); add(30, 14, 0, 2, -15, .35); add(30, 14, -15, 2, 0, .25); add(30, 14, 15, 2, 0, .3); add(14, 14, 0, -10, 0, .06);
    const pm = new T.PMREMGenerator(rd), t = pm.fromScene(s, .02).texture; pm.dispose(); return t;
  }
  const MW = 1280, MH = 1024; let SHP = null;
  const shared = () => SHP || (SHP = (async () => {
    const T = await T3();
    const rd = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    rd.setPixelRatio(1); rd.setSize(MW, MH, false); rd.shadowMap.enabled = true; rd.shadowMap.type = T.PCFSoftShadowMap; rd.toneMapping = T.NeutralToneMapping; rd.setScissorTest(true); rd.setClearColor(0x000000, 0);
    const S0 = { T, rd, env: envTex(T, rd), items: new Set() };
    let last = performance.now(), acc = 0;
    (function loop(t) {
      requestAnimationFrame(loop);
      const dt = Math.min(.05, (t - last) / 1000); last = t; acc += dt; const mo = motion();
      if (mo && acc < 1 / 30) return; const step = acc; acc = 0;
      S0.items.forEach(it => { if (!it.el.isConnected) { S0.items.delete(it); return; } if (!it.vis) return; if (mo) it.tick(step); if (mo || it.dirty) it.draw(); });
    })(last);
    return S0;
  })());
  async function mount(el) {
    el.__qv = 1; let S0;
    try { S0 = await shared(); } catch (e) { console.warn('three.js failed to load', e); return; }
    const { T, rd } = S0;
    const kind = A(el, 'vox', 'iso'), chrome = A(el, 'theme', 'light') === 'chrome', n = +A(el, 'n', 32), mode = A(el, 'mode', 'qpu'), run = +A(el, 'run', 1);
    const lvl = +A(el, 'level', .5), sm = +A(el, 'smooth', 5), keep = A(el, 'keep', 'largest'), zc = +A(el, 'slice', -1), fitK = +A(el, 'fit', 1.2), el0 = +A(el, 'elev', 20) * Math.PI / 180;
    const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'; el.appendChild(cv); const ctx = cv.getContext('2d');
    const sc = new T.Scene(), cam = new T.PerspectiveCamera(26, 1, .05, 80);
    if (chrome) { sc.environment = S0.env; sc.add(new T.HemisphereLight(0xffffff, 0x222222, .6)); const k = new T.DirectionalLight(0xffffff, 1.5); k.position.set(2, 4, 3); sc.add(k); }
    else {
      sc.add(new T.HemisphereLight(0xffffff, 0x8c8c8c, 1.15));
      const k = new T.DirectionalLight(0xffffff, 1.5); k.position.set(2.4, 5, 3.2); k.castShadow = true; k.shadow.mapSize.set(1024, 1024);
      Object.assign(k.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: .5, far: 24 }); k.shadow.bias = -.0005; k.shadow.normalBias = .02; sc.add(k);
      const f = new T.DirectionalLight(0xffffff, .35); f.position.set(-4, 2, 2); sc.add(f); const rm = new T.DirectionalLight(0xffffff, .6); rm.position.set(-1, 3, -4); sc.add(rm);
    }
    const S = 2, u = S / n, off = (n - 1) / 2, pivot = new T.Group(), grp = new T.Group(), meshes = [];
    if (kind === 'grid' || kind === 'field') {
      const src = kind === 'grid' ? voxelize(n).g : field(n, mode, run), cells = [];
      for (let p = 0; p < src.length; p++) if (src[p] > (kind === 'grid' ? .5 : .07)) cells.push(p);
      const mat = chrome ? new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: .85, roughness: .35, envMapIntensity: 2.6 }) : new T.MeshStandardMaterial({ color: 0xffffff, roughness: .82 });
      const im = new T.InstancedMesh(new T.BoxGeometry(u * .9, u * .9, u * .9), mat, cells.length);
      const m4 = new T.Matrix4(), q = new T.Quaternion(), s3 = new T.Vector3(), p3 = new T.Vector3(), col = new T.Color();
      cells.forEach((p, ix) => {
        const i = p % n, j = ((p / n) | 0) % n, k = (p / (n * n)) | 0, v = src[p];
        p3.set((i - off) * u, (k - off) * u, (j - off) * u); s3.setScalar(kind === 'grid' ? 1 : .3 + .7 * v); m4.compose(p3, q, s3); im.setMatrixAt(ix, m4);
        if (kind === 'grid') col.setScalar(k === zc ? (chrome ? 1 : .1) : (chrome ? .75 : .9)); else col.setScalar(chrome ? .7 + .3 * v : .96 - .84 * v);
        im.setColorAt(ix, col);
      });
      im.castShadow = im.receiveShadow = true; im.computeBoundingBox(); grp.add(im);
    } else {
      const F = field(n, mode, run), lv = kind === 'series' ? [.2, .35, .5, .65, .8] : [lvl];
      const mat = chrome ? new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: .2, envMapIntensity: 2.2 }) : new T.MeshStandardMaterial({ color: 0xE2E2E2, roughness: .72 });
      lv.forEach((L, ix) => { const me = new T.Mesh(surface(T, F, n, L, sm, keep, S), mat); me.castShadow = me.receiveShadow = true; if (kind === 'series') { me.position.x = (ix - 2) * 2.05; me.rotation.y = -.6; } grp.add(me); meshes.push(me); });
    }
    const bb = new T.Box3().setFromObject(grp), ctr = bb.getCenter(new T.Vector3()), size = bb.getSize(new T.Vector3());
    grp.position.set(-ctr.x, -bb.min.y, -ctr.z); pivot.add(grp); sc.add(pivot); if (kind !== 'series') pivot.rotation.y = -.6;
    if (!chrome) { const fl = new T.Mesh(new T.PlaneGeometry(80, 80), new T.ShadowMaterial({ opacity: .15 })); fl.rotation.x = -Math.PI / 2; fl.position.y = -.002; fl.receiveShadow = true; sc.add(fl); }
    const fit = asp => {
      const vf = Math.tan(cam.fov * Math.PI / 360), hh = size.y / 2 + .02, hw = (kind === 'series' ? size.x : Math.max(size.x, size.z)) / 2;
      const d = Math.max(hh / vf, hw / (vf * asp)) * fitK + Math.max(size.x, size.z) * (kind === 'series' ? .1 : .5), ty = size.y * .5;
      cam.position.set(0, ty + d * Math.sin(el0), d * Math.cos(el0)); cam.lookAt(0, ty * .9, 0);
    };
    const it = { el, vis: true, dirty: true, W: 0, H: 0, w: 0, h: 0 };
    it.tick = dt => { if (kind === 'series') meshes.forEach(me => me.rotation.y += dt * .2); else pivot.rotation.y += dt * .14; };
    it.draw = () => {
      const W = el.offsetWidth, H = el.offsetHeight; if (!W || !H) return;
      if (W !== it.W || H !== it.H) { it.W = W; it.H = H; const dpr = Math.min(1.5, window.devicePixelRatio || 1, MW / W, MH / H); it.w = Math.round(W * dpr); it.h = Math.round(H * dpr); cv.width = it.w; cv.height = it.h; cam.aspect = W / H; cam.updateProjectionMatrix(); fit(W / H); }
      rd.setViewport(0, 0, it.w, it.h); rd.setScissor(0, 0, it.w, it.h); rd.clear(); rd.render(sc, cam);
      ctx.clearRect(0, 0, it.w, it.h); ctx.drawImage(rd.domElement, 0, MH - it.h, it.w, it.h, 0, 0, it.w, it.h);
      it.dirty = false;
    };
    new IntersectionObserver(es => { it.vis = es[es.length - 1].isIntersecting; if (it.vis) it.dirty = true; }).observe(el);
    S0.items.add(it);
  }
  const isDark = c => { const t = A(c, 'theme', 'light'); return t === 'auto' ? getComputedStyle(c).getPropertyValue('--qs-mode').trim() === 'dark' : t === 'dark'; };
  function drawSlice(c) {
    const dark = isDark(c), n = +A(c, 'n', 32), kind = A(c, 'vslice', 'bin'), z = +A(c, 'z', 12);
    const src = kind === 'bin' ? voxelize(n).g : field(n, A(c, 'mode', 'qpu'), +A(c, 'run', 1));
    const W = c.offsetWidth, H = c.offsetHeight, dpr = 2; c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const cw = W / n, ch = H / n, fg = dark ? '#FFFFFF' : '#000000', dim = dark ? '#4A4A4A' : '#BBBBBB', ramp = ['·', '░', '▒', '▓', '█'];
    ctx.font = `400 ${Math.min(cw * 1.6, ch * 1.05).toFixed(1)}px 'Geist Mono', monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = src[i + n * (j + n * z)]; let g, col = fg;
      if (kind === 'bin') { g = v > .5 ? '█' : '·'; if (v <= .5) col = dim; } else { const k = Math.min(4, Math.floor(v * 5)); g = ramp[k]; if (!k) col = dim; }
      ctx.fillStyle = col; ctx.fillText(g, (j + .5) * cw, (i + .5) * ch);
    }
    const Lc = c.getAttribute('data-level');
    if (Lc != null && Lc !== '') {
      const L = +Lc, at = (i, j) => (i < 0 || j < 0 || i >= n || j >= n) ? 0 : src[i + n * (j + n * z)];
      ctx.strokeStyle = fg; ctx.lineWidth = 1.25; ctx.beginPath();
      for (let i = -1; i < n; i++) for (let j = -1; j < n; j++) {
        const s = at(i, j) > L;
        if ((at(i, j + 1) > L) !== s) { ctx.moveTo((j + 1) * cw, i * ch); ctx.lineTo((j + 1) * cw, (i + 1) * ch); }
        if ((at(i + 1, j) > L) !== s) { ctx.moveTo(j * cw, (i + 1) * ch); ctx.lineTo((j + 1) * cw, (i + 1) * ch); }
      }
      ctx.stroke();
    }
  }
  function drawHist(c) {
    const dark = isDark(c), L = +A(c, 'level', .5), F = field(+A(c, 'n', 32), A(c, 'mode', 'qpu'), +A(c, 'run', 1)), bins = 30, h = new Array(bins).fill(0);
    for (let i = 0; i < F.length; i++) if (F[i] > .03) h[Math.min(bins - 1, (F[i] * bins) | 0)]++;
    const W = c.offsetWidth, H = c.offsetHeight, dpr = 2; c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const fg = dark ? '#FFFFFF' : '#000000', dim = dark ? '#4A4A4A' : '#BBBBBB', lb = 16, gw = W / bins, mx = Math.max(...h.map(Math.sqrt)) || 1;
    h.forEach((v, i) => { const bh = Math.max(2, (H - lb - 6) * Math.sqrt(v) / mx); ctx.fillStyle = (i + .5) / bins >= L ? fg : dim; ctx.beginPath(); ctx.roundRect(i * gw + gw * .18, H - lb - bh, gw * .64, bh, Math.min(gw * .32, 3)); ctx.fill(); });
    const x = L * W; ctx.fillStyle = fg; ctx.fillRect(x - .5, 0, 1, H - lb + 4);
    ctx.font = "400 10px 'Geist Mono', monospace"; ctx.fillStyle = dark ? '#BBBBBB' : '#676767'; ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left'; ctx.fillText('0.0', 0, H); ctx.textAlign = 'right'; ctx.fillText('1.0', W, H); ctx.textAlign = 'center'; ctx.fillStyle = fg; ctx.fillText('level ' + L.toFixed(2), Math.min(W - 34, Math.max(34, x)), H);
  }
  const key = c => [...c.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name + a.value).join('|') + c.offsetWidth + 'x' + c.offsetHeight;
  function scan() {
    document.querySelectorAll('[data-vox]').forEach(el => { if (!el.__qv) mount(el); });
    document.querySelectorAll('canvas[data-vslice],canvas[data-vhist]').forEach(c => { const k = key(c); if (c.__qk === k || !c.offsetWidth) return; c.__qk = k; try { c.hasAttribute('data-vhist') ? drawHist(c) : drawSlice(c); } catch (e) { console.warn('qvoxel', e); } });
  }
  let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(scan, 60); };
  new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true });
  if (document.fonts) document.fonts.ready.then(() => { document.querySelectorAll('canvas[data-vslice],canvas[data-vhist]').forEach(c => c.__qk = ''); scan(); });
  window.addEventListener('load', scan); later();
  window.QVox = { voxelize, field };
})();
