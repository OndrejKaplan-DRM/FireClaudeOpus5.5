// Velké modely: stoh slámy (velké hranaté balíky), osobní auto (sedan), venkovský dům.
import * as THREE from 'three';
import { segs, mesh, noise3, mergeByMaterial, tube } from './geo.js';
import { makeMaterial } from './textures.js';
import { applyChar } from '../fx/char.js';
import { tireGeometry } from './props.js';
import { mulberry32 } from '../engine/rng.js';

// ------------------------------------------------------------------------------------------- stoh slámy
export function strawStack({ lod = 2, nx = 4, ny = 3, nz = 3, seed = 31 }) {
  const r = mulberry32(seed), n = noise3(seed);
  const bx = 2.4, by = 0.9, bz = 1.2; // velký hranatý balík [m]
  const m = makeMaterial('straw'); m.name = 'straw';
  const u = applyChar(m, { scale: 3 });
  u.uCharBase.value = 0; u.uCharH.value = ny * by;
  const parts = [];
  if (lod === 0) {
    const g = new THREE.BoxGeometry(nx * bx * 0.5 + 0.2, ny * by, nz * bz, 2, 2, 2); g.translate(0, (ny * by) / 2, 0);
    parts.push([g, m]);
  } else {
    const [sx, sy, sz] = [segs(lod, 1, 2, 8, 24, 80), segs(lod, 1, 1, 4, 10, 30), segs(lod, 1, 1, 4, 12, 40)];
    for (let k = 0; k < ny; k++) for (let j = 0; j < nz; j++) for (let i = 0; i < nx / 2; i++) {
      if (k === ny - 1 && (j === 0 || j === nz - 1) && r() < 0.5) continue; // nepravidelná koruna
      const g = new THREE.BoxGeometry(bx, by, bz, sx, sy, sz);
      const p = g.attributes.position;
      const ox = (i - (nx / 2 - 1) / 2) * bx + (r() - 0.5) * 0.06, oy = by / 2 + k * by, oz = (j - (nz - 1) / 2) * bz + (r() - 0.5) * 0.06;
      for (let q = 0; q < p.count; q++) {
        let x = p.getX(q), y = p.getY(q), z = p.getZ(q);
        // zaoblení hran (balík je stlačený, hrany vyboulené)
        const ex = Math.abs(x) / (bx / 2), ey = Math.abs(y) / (by / 2), ez = Math.abs(z) / (bz / 2);
        const corner = Math.max(0, (ey - 0.75) * 4) * Math.max(0, (Math.max(ex, ez) - 0.75) * 4);
        y *= 1 - 0.06 * corner; x *= 1 - 0.015 * corner; z *= 1 - 0.03 * corner;
        // vyboulení stran + stébla
        const bulge = 0.03 * (1 - ey * ey);
        const fuzz = lod >= 2 ? 0.02 * n.fbm((x + ox) * 3, (y + oy) * 3, (z + oz) * 3, 4) : 0;
        const s = 1 + (bulge + fuzz) / Math.max(bx, bz) * 2;
        p.setXYZ(q, x * s + ox, y + oy + (lod >= 3 ? fuzz * 0.3 : 0), z * s + oz);
      }
      g.computeVertexNormals();
      parts.push([g, m]);
    }
  }
  const grp = mergeByMaterial(parts, 'stack');
  grp.userData = { char: u, W: (nx / 2) * bx, D: nz * bz, H: ny * by };
  return grp;
}

// ------------------------------------------------------------------------------------------- osobní auto
export function car({ lod = 2, color = 'carPaint' }) {
  const L = 4.5, Wd = 1.8;
  const nu = segs(lod, 10, 36, 120, 300, 1000), nv = segs(lod, 10, 22, 60, 160, 480);
  // profily podél délky x ∈ [−L/2, L/2]
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const top = (x) => { // výška střechy/kapoty
    const t = (x + L / 2) / L;
    const hood = 0.95 + 0.08 * sm(0, 0.25, t), roof = 1.45;
    const cab = sm(0.28, 0.42, t) * (1 - sm(0.68, 0.84, t));
    const trunk = 1.0 - 0.06 * sm(0.85, 1, t);
    return t < 0.5 ? hood + (roof - hood) * cab : trunk + (roof - trunk) * cab;
  };
  const bot = (x) => 0.28 + 0.06 * sm(-L / 2, -L / 2 + 0.3, -x) + 0.05 * sm(L / 2 - 0.3, L / 2, x);
  const halfW = (x, y) => {
    const t = (x + L / 2) / L;
    const end = Math.min(sm(0, 0.08, t), sm(1, 0.93, t)) * 0.15 + 0.85;
    const tumble = y > 1.0 ? 1 - 0.22 * sm(1.0, 1.45, y) : 1;
    return (Wd / 2) * end * tumble;
  };
  const wheelX = [-1.35, 1.35], wheelR = 0.36;
  const pos = [], col = [], idx = [], uv = [];
  const paint = new THREE.Color(1, 1, 1), glass = new THREE.Color(0.04, 0.05, 0.06), trim = new THREE.Color(0.08, 0.08, 0.08);
  for (let i = 0; i <= nu; i++) {
    const x = -L / 2 + (L * i) / nu;
    const y0 = bot(x), y1 = top(x);
    for (let j = 0; j <= nv; j++) {
      const a = (j / nv) * Math.PI * 2;
      // superelipsa průřezu
      const c = Math.cos(a), s = Math.sin(a), e = 0.35;
      const sx = Math.sign(c) * Math.abs(c) ** e, sy = Math.sign(s) * Math.abs(s) ** e;
      const y = (y0 + y1) / 2 + ((y1 - y0) / 2) * sy;
      let z = halfW(x, y) * sx;
      let yy = y;
      // podběhy kol
      for (const wx of wheelX) {
        const dx = x - wx;
        if (Math.abs(dx) < wheelR + 0.08 && yy < 0.28 + wheelR + 0.06 && Math.abs(sx) > 0.6) {
          const arch = 0.28 + Math.sqrt(Math.max(0, (wheelR + 0.08) ** 2 - dx * dx)) * 0.95;
          if (yy < arch) yy = arch;
        }
      }
      pos.push(x, yy, z); uv.push(i / nu * 4, j / nv);
      // zasklení: nad pasem v kabině
      const t = (x + L / 2) / L;
      const isGlass = yy > 1.05 && yy < 1.41 && t > 0.3 && t < 0.83 && Math.abs(sy) < 0.985 && !(Math.abs(t - 0.56) < 0.012);
      const isTrim = yy < 0.42;
      const k = isGlass ? glass : isTrim ? trim : paint;
      col.push(k.r, k.g, k.b);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const bm = makeMaterial(color, { vertexColors: true, roughness: 0.35, metalness: 0.35 }); bm.name = 'body';
  const u = applyChar(bm, { scale: 2, metal: true }); u.uCharBase.value = 0.3; u.uCharH.value = 1.2;
  const grp = new THREE.Group();
  grp.add(mesh(g, bm, { name: 'body' }));
  // kola
  const tg = tireGeometry(Math.max(0, lod - 1));
  const rm = makeMaterial('rubber'); rm.name = 'tire';
  const tu = applyChar(rm, { scale: 20 }); tu.uCharH.value = 0.7;
  const steel = makeMaterial('steel'); steel.name = 'rim';
  const rimG = new THREE.CylinderGeometry(0.2, 0.2, 0.19, segs(lod, 6, 12, 32, 96, 300));
  for (const wx of wheelX) for (const wz of [-0.78, 0.78]) {
    const t = mesh(tg, rm, { name: 'tire' }); t.rotation.x = Math.PI / 2; t.scale.setScalar(wheelR / 0.316); t.position.set(wx, wheelR, wz); grp.add(t);
    const rr = mesh(rimG, steel, { name: 'rim' }); rr.rotation.x = Math.PI / 2; rr.position.set(wx, wheelR, wz); grp.add(rr);
  }
  // světla
  const lightM = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0x332a20, roughness: 0.2, name: 'lamp' });
  const tailM = new THREE.MeshStandardMaterial({ color: 0x550808, emissive: 0x200000, roughness: 0.3, name: 'tail' });
  for (const z of [-0.6, 0.6]) {
    const h = new THREE.BoxGeometry(0.05, 0.1, 0.32); h.translate(L / 2 - 0.02, 0.8, z); grp.add(mesh(h, lightM, { name: 'lamp' }));
    const t = new THREE.BoxGeometry(0.05, 0.1, 0.3); t.translate(-L / 2 + 0.03, 0.86, z); grp.add(mesh(t, tailM, { name: 'tail' }));
  }
  grp.userData = { char: u, tireChar: tu, L, W: Wd, body: bm };
  return grp;
}

// ------------------------------------------------------------------------------------------- dům
export function house({ lod = 2, seed = 41 }) {
  const r = mulberry32(seed);
  const W = 9, D = 7, Hw = 2.9, pitch = 0.62, ov = 0.45, th = 0.3;
  const grp = new THREE.Group();
  const plaster = makeMaterial('plaster'); plaster.name = 'plaster';
  const pu = applyChar(plaster, { scale: 3 }); pu.uCharBase.value = 0.8; pu.uCharH.value = 3;
  const roofM = makeMaterial('roof'); roofM.name = 'roof';
  const ru = applyChar(roofM, { scale: 3, hole: true }); ru.uCharBase.value = Hw; ru.uCharH.value = 3;
  const wood = makeMaterial('woodPlank'); wood.name = 'frames';
  const wu = applyChar(wood, { scale: 6, hole: true });
  const brick = makeMaterial('brick'); brick.name = 'brick';
  const glassM = new THREE.MeshStandardMaterial({ color: 0x0b1014, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55, name: 'glass' });
  // okna (fasáda: x podél W, z podél D)
  const wins = [
    { wall: 'S', u: -2.8, w: 1.2, h: 1.3, y: 0.9 }, { wall: 'S', u: 2.8, w: 1.2, h: 1.3, y: 0.9 }, { wall: 'S', u: 0, w: 1.0, h: 2.1, y: 0, door: true },
    { wall: 'N', u: -2.5, w: 1.2, h: 1.3, y: 0.9 }, { wall: 'N', u: 2.0, w: 0.8, h: 0.9, y: 1.3 },
    { wall: 'E', u: 0, w: 1.2, h: 1.3, y: 0.9 }, { wall: 'W', u: -1.2, w: 1.2, h: 1.3, y: 0.9 },
  ];
  const parts = [];
  const subdiv = segs(lod, 1, 1, 4, 12, 40);
  // stěna z obdélníků mezi otvory
  function wall(name, len, place) {
    const ow = wins.filter((w) => w.wall === name).sort((a, b) => a.u - b.u);
    const pieces = [];
    let cur = -len / 2;
    for (const o of ow) {
      const a = o.u - o.w / 2, b = o.u + o.w / 2;
      if (a > cur) pieces.push([cur, a, 0, Hw]);
      if (o.y > 0) pieces.push([a, b, 0, o.y]);
      pieces.push([a, b, o.y + o.h, Hw]);
      cur = b;
    }
    if (cur < len / 2) pieces.push([cur, len / 2, 0, Hw]);
    for (const [a, b, y0, y1] of pieces) {
      if (b - a < 1e-3 || y1 - y0 < 1e-3) continue;
      const g = new THREE.BoxGeometry(b - a, y1 - y0, th, Math.max(1, Math.round((b - a) * subdiv)), Math.max(1, Math.round((y1 - y0) * subdiv)), 1);
      g.translate((a + b) / 2, (y0 + y1) / 2, 0); place(g); parts.push([g, plaster]);
    }
    for (const o of ow) {
      if (lod >= 1) {
        // rám
        const fw = 0.07;
        const fr = [[o.w + fw * 2, fw, 0, o.y + o.h + fw / 2], [fw, o.h, -o.w / 2 - fw / 2, o.y + o.h / 2], [fw, o.h, o.w / 2 + fw / 2, o.y + o.h / 2]];
        if (!o.door) fr.push([o.w + fw * 2, fw, 0, o.y - fw / 2]);
        for (const [w, h, du, y] of fr) { const g = new THREE.BoxGeometry(w, h, th * 0.55); g.translate(o.u + du, y, th * 0.25); place(g); parts.push([g, wood]); }
        if (!o.door && lod >= 2) { const g = new THREE.BoxGeometry(0.05, o.h, 0.06); g.translate(o.u, o.y + o.h / 2, 0.05); place(g); parts.push([g, wood]); const g2 = new THREE.BoxGeometry(o.w, 0.05, 0.06); g2.translate(o.u, o.y + o.h * 0.6, 0.05); place(g2); parts.push([g2, wood]); }
      }
      const pane = new THREE.BoxGeometry(o.w, o.h, 0.01); pane.translate(o.u, o.y + o.h / 2, 0.02); place(pane);
      parts.push([pane, o.door ? wood : glassM]);
    }
  }
  wall('S', W, (g) => g.translate(0, 0, D / 2 - th / 2));
  wall('N', W, (g) => { g.rotateY(Math.PI); g.translate(0, 0, -D / 2 + th / 2); });
  wall('E', D - 2 * th, (g) => { g.rotateY(Math.PI / 2); g.translate(W / 2 - th / 2, 0, 0); });
  wall('W', D - 2 * th, (g) => { g.rotateY(-Math.PI / 2); g.translate(-W / 2 + th / 2, 0, 0); });
  // sokl
  for (const [w, d, x, z] of [[W + 0.06, 0.04, 0, D / 2 + 0.01], [W + 0.06, 0.04, 0, -D / 2 - 0.01], [0.04, D, W / 2 + 0.01, 0], [0.04, D, -W / 2 - 0.01, 0]]) {
    const g = new THREE.BoxGeometry(w, 0.45, d); g.translate(x, 0.225, z); parts.push([g, brick]);
  }
  // štíty (trojúhelníky)
  const rh = (D / 2) * Math.tan(pitch);
  for (const sx of [1, -1]) {
    const sh = new THREE.Shape(); sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(0, rh); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(sx * (W / 2) - (sx > 0 ? th : 0), Hw, 0);
    parts.push([g, plaster]);
  }
  // podlaha a vnitřní příčka (dva prostory pro požár)
  { const g = new THREE.BoxGeometry(W - 2 * th, 0.1, D - 2 * th); g.translate(0, 0.05, 0); parts.push([g, wood]); }
  { const g = new THREE.BoxGeometry(0.15, Hw, D - 2 * th); g.translate(0.8, Hw / 2, 0); parts.push([g, plaster]); }
  { const g = new THREE.BoxGeometry(W - 2 * th, 0.15, D - 2 * th); g.translate(0, Hw - 0.07, 0); parts.push([g, wood]); }
  // střecha
  const slopeL = (D / 2 + ov) / Math.cos(pitch);
  if (lod < 3) {
    for (const sz of [1, -1]) {
      const g = new THREE.BoxGeometry(W + 2 * ov, 0.12, slopeL, Math.max(1, subdiv * 3), 1, Math.max(1, subdiv * 2));
      g.translate(0, 0, (sz * slopeL) / 2); g.rotateX(sz * pitch); g.translate(0, Hw + rh + 0.06 - 0.0, 0);
      parts.push([g, roofM]);
    }
  } else {
    // jednotlivé tašky (bobrovky) – L3 ~1e5, L4 ~1e6 △
    const tw = 0.18, tl = 0.38, step = 0.15;
    const tseg = segs(lod, 1, 1, 1, 1, 4);
    const tile = new THREE.CylinderGeometry(tw * 0.55, tw * 0.55, tl, 4 * tseg, 2 * tseg, true, 0, Math.PI);
    tile.rotateX(Math.PI / 2); tile.scale(1, 0.25, 1);
    const cols = Math.ceil((W + 2 * ov) / tw), rows = Math.ceil(slopeL / step);
    const tgs = [];
    for (const sz of [1, -1]) for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const g = tile.clone();
      g.rotateX(-0.08);
      g.translate(-W / 2 - ov + (j + (i % 2) * 0.5) * tw, 0.06, sz * (i * step + tl / 2));
      g.rotateX(sz * pitch); g.translate(0, Hw + rh + 0.02, 0);
      tgs.push([g, roofM]);
    }
    parts.push(...tgs);
    // laťování pod taškami
    for (const sz of [1, -1]) { const g = new THREE.BoxGeometry(W + 2 * ov, 0.06, slopeL); g.translate(0, 0, (sz * slopeL) / 2); g.rotateX(sz * pitch); g.translate(0, Hw + rh, 0); parts.push([g, wood]); }
  }
  // komín
  { const g = new THREE.BoxGeometry(0.6, 1.8, 0.6, 1, Math.max(1, subdiv * 2), 1); g.translate(-2.2, Hw + rh, -0.8); parts.push([g, brick]); }
  const merged = mergeByMaterial(parts, 'house');
  grp.add(merged);
  void r;
  // místnosti pro scénář požáru (Ao = plocha otvorů, Ho = výška, AT = plocha povrchů)
  grp.userData = {
    char: { plaster: pu, roof: ru, wood: wu }, W, D, H: Hw + rh,
    rooms: [
      { name: 'obývák', x: -2.2, z: 0, w: 4.6, d: D - 0.6, wins: wins.filter((w) => (w.wall === 'S' && w.u < 0) || w.wall === 'W' || (w.wall === 'N' && w.u < 0)) },
      { name: 'kuchyně', x: 2.9, z: 0, w: 3.6, d: D - 0.6, wins: wins.filter((w) => (w.wall === 'S' && w.u > 0) || w.wall === 'E' || (w.wall === 'N' && w.u > 0)) },
    ],
    wins, th,
  };
  return grp;
}

export { tube };
