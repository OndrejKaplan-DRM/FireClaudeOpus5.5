// Procedurální textury (vlastní): 2D periodický hodnotový šum + fbm → albedo, výška → normálová mapa, drsnost.
import * as THREE from 'three';
import { mulberry32 } from '../engine/rng.js';

const cache = new Map();

function makeNoise2(seed, P) {
  const r = mulberry32(seed), v = new Float32Array(P * P);
  for (let i = 0; i < v.length; i++) v[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const X0 = ((xi % P) + P) % P, Y0 = ((yi % P) + P) % P, X1 = (X0 + 1) % P, Y1 = (Y0 + 1) % P;
    const a = v[X0 + Y0 * P], b = v[X1 + Y0 * P], c = v[X0 + Y1 * P], d = v[X1 + Y1 * P];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}
/** Periodický fbm na [0,1)² s periodou 1. */
export function fbm2(seed, base = 4, oct = 5) {
  const ns = []; for (let o = 0; o < oct; o++) ns.push(makeNoise2(seed + o * 17, base << o));
  return (x, y) => { let s = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { s += ns[o](x * (base << o), y * (base << o)) * a; n += a; a *= 0.5; } return s / n; };
}

function canvasTex(size, fn, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, gg, b] = fn(x / size, y / size); const i = (x + y * size) * 4;
    d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = b * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.canvas = c;
  return t;
}

function heightToNormal(size, hfn, strength = 2) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[x + y * size] = hfn(x / size, y / size);
  return canvasTex(size, (u, v) => {
    const x = Math.round(u * size), y = Math.round(v * size);
    const at = (i, j) => H[((i + size) % size) + ((j + size) % size) * size];
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [(-dx / l) * 0.5 + 0.5, (-dy / l) * 0.5 + 0.5, 1 / l * 0.5 + 0.5];
  }, { srgb: false });
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sat = (x) => Math.max(0, Math.min(1, x));

export let TEX_SIZE = 256;
export function setTextureSize(s) { TEX_SIZE = s; cache.clear(); }

/** Sada textur podle jména; každá vrací { map, normalMap?, roughness } */
export function texSet(name) {
  if (cache.has(name)) return cache.get(name);
  const S = TEX_SIZE;
  let out;
  switch (name) {
    case 'bark': {
      const f = fbm2(11, 3, 5), g = fbm2(12, 2, 3);
      const h = (u, v) => { const s = Math.abs(Math.sin((u * 12 + g(u, v) * 2.5) * Math.PI)); return 0.6 * Math.pow(s, 0.35) + 0.4 * f(u * 2, v * 0.5); };
      out = { map: canvasTex(S, (u, v) => { const k = h(u, v); return mix3([0.06, 0.045, 0.035], [0.32, 0.24, 0.17], k); }), normalMap: heightToNormal(S, h, 5), roughness: 0.95 };
      break;
    }
    case 'woodEnd': {
      const f = fbm2(13, 4, 4);
      out = { map: canvasTex(S, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2 + f(u, v) * 0.15; const ring = 0.5 + 0.5 * Math.sin(r * 60); return r > 0.93 ? [0.2, 0.14, 0.09] : mix3([0.55, 0.42, 0.28], [0.72, 0.58, 0.4], ring); }, { repeat: false }), roughness: 0.8 };
      break;
    }
    case 'woodPlank': {
      const f = fbm2(14, 2, 5);
      out = { map: canvasTex(S, (u, v) => { const g = 0.5 + 0.5 * Math.sin((v * 40 + f(u * 0.3, v) * 6) * Math.PI); return mix3([0.36, 0.24, 0.14], [0.55, 0.4, 0.25], g * 0.6 + f(u, v) * 0.4); }), roughness: 0.75 };
      break;
    }
    case 'wax': out = { map: canvasTex(64, () => [0.93, 0.9, 0.82]), roughness: 0.45 }; break;
    case 'rubber': {
      const f = fbm2(21, 8, 3);
      const h = (u, v) => { const lug = (Math.abs(((u * 24 + Math.abs(v - 0.5) * 6) % 1) - 0.5) < 0.18 ? 1 : 0) * (Math.abs(v - 0.5) < 0.45 ? 1 : 0); return lug * 0.8 + f(u, v) * 0.2; };
      out = { map: canvasTex(S, (u, v) => { const k = 0.03 + f(u, v) * 0.025; return [k, k, k * 1.02]; }), normalMap: heightToNormal(S, h, 6), roughness: 0.92 };
      break;
    }
    case 'metalRed': case 'metalBlue': case 'metalGreen': case 'metalOlive': case 'carPaint': {
      const base = { metalRed: [0.55, 0.06, 0.04], metalBlue: [0.06, 0.16, 0.42], metalGreen: [0.12, 0.3, 0.14], metalOlive: [0.24, 0.26, 0.14], carPaint: [0.5, 0.52, 0.55] }[name];
      const f = fbm2(31 + name.length, 3, 6), rust = fbm2(37, 2, 5);
      out = { map: canvasTex(S, (u, v) => { const r = sat((rust(u, v) - 0.58) * 6); const c = mix3(base, [0.28, 0.12, 0.05], r); return mix3(c, [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7], f(u, v) * 0.5); }), roughness: 0.55, metalness: name === 'carPaint' ? 0.3 : 0.6 };
      break;
    }
    case 'steel': { const f = fbm2(41, 6, 4); out = { map: canvasTex(S, (u, v) => { const k = 0.45 + f(u, v) * 0.15; return [k, k, k * 1.03]; }), roughness: 0.4, metalness: 0.9 }; break; }
    case 'straw': {
      const f = fbm2(51, 16, 3), g = fbm2(52, 3, 4);
      const h = (u, v) => { const fib = 0.5 + 0.5 * Math.sin((u * 140 + g(u, v) * 9) * Math.PI); return fib * 0.6 + f(u, v) * 0.4; };
      out = { map: canvasTex(S, (u, v) => { const k = h(u, v); return mix3([0.42, 0.33, 0.14], [0.86, 0.73, 0.38], k); }), normalMap: heightToNormal(S, h, 3), roughness: 0.9 };
      break;
    }
    case 'plaster': { const f = fbm2(61, 6, 5); out = { map: canvasTex(S, (u, v) => { const k = 0.68 + f(u, v) * 0.12; return [k, k * 0.97, k * 0.9]; }), roughness: 0.95 }; break; }
    case 'brick': {
      const f = fbm2(62, 8, 4);
      const h = (u, v) => { const row = Math.floor(v * 16), off = (row % 2) * 0.5; const bu = (u * 8 + off) % 1, bv = (v * 16) % 1; return bu < 0.06 || bv < 0.1 ? 0 : 0.7 + f(u, v) * 0.3; };
      out = { map: canvasTex(S, (u, v) => { const k = h(u, v); return k === 0 ? [0.55, 0.52, 0.48] : mix3([0.42, 0.14, 0.08], [0.6, 0.24, 0.14], f(u * 3, v * 3)); }), normalMap: heightToNormal(S, h, 4), roughness: 0.9 };
      break;
    }
    case 'roof': {
      const f = fbm2(63, 4, 4);
      const h = (u, v) => { const bv = (v * 20) % 1; return bv < 0.15 ? 0 : bv; };
      out = { map: canvasTex(S, (u, v) => { const k = h(u, v); return mix3([0.18, 0.07, 0.05], [0.45, 0.16, 0.1], k * 0.6 + f(u, v) * 0.4); }), normalMap: heightToNormal(S, h, 6), roughness: 0.85 };
      break;
    }
    case 'needles': { const f = fbm2(71, 8, 4); out = { map: canvasTex(S, (u, v) => mix3([0.03, 0.08, 0.03], [0.1, 0.2, 0.07], f(u, v))), roughness: 0.9 }; break; }
    case 'leaves': { const f = fbm2(72, 8, 4); out = { map: canvasTex(S, (u, v) => mix3([0.2, 0.18, 0.06], [0.45, 0.38, 0.14], f(u, v))), roughness: 0.9 }; break; }
    case 'stone': {
      const f = fbm2(81, 4, 6);
      out = { map: canvasTex(S, (u, v) => { const k = f(u, v); return mix3([0.22, 0.21, 0.2], [0.5, 0.48, 0.45], k); }), normalMap: heightToNormal(S, f, 4), roughness: 0.85 };
      break;
    }
    case 'tnt': { const f = fbm2(91, 4, 4); out = { map: canvasTex(S, (u, v) => { const band = Math.abs(v - 0.5) < 0.07 ? 1 : 0; const c = band ? [0.75, 0.6, 0.1] : [0.2, 0.22, 0.12]; return mix3(c, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6], f(u, v) * 0.6); }), roughness: 0.6, metalness: 0.5 }; break; }
    case 'acetylene': { const f = fbm2(92, 4, 4); out = { map: canvasTex(S, (u, v) => { const c = v > 0.82 ? [0.6, 0.05, 0.04] : [0.62, 0.6, 0.55]; return mix3(c, [0.2, 0.18, 0.15], f(u, v) * 0.25); }), roughness: 0.5, metalness: 0.4 }; break; }
    case 'glass': out = { map: canvasTex(16, () => [0.05, 0.07, 0.08]), roughness: 0.05, metalness: 0.2 }; break;
    case 'asphaltCar': { const f = fbm2(93, 8, 4); out = { map: canvasTex(S, (u, v) => { const k = 0.06 + f(u, v) * 0.05; return [k, k, k]; }), roughness: 0.9 }; break; }
    default: out = { map: canvasTex(16, () => [0.5, 0.5, 0.5]), roughness: 0.8 };
  }
  cache.set(name, out);
  return out;
}

export function groundTexture(kind) {
  const key = 'ground:' + kind;
  if (cache.has(key)) return cache.get(key);
  const S = Math.max(256, TEX_SIZE), f = fbm2(101, 4, 6), g = fbm2(102, 16, 3);
  const pal = {
    dirt: [[0.08, 0.065, 0.05], [0.2, 0.16, 0.12]],
    grass: [[0.05, 0.07, 0.03], [0.16, 0.18, 0.08]],
    dryGrass: [[0.16, 0.13, 0.07], [0.42, 0.34, 0.18]],
    forest: [[0.05, 0.04, 0.03], [0.17, 0.12, 0.08]],
    asphalt: [[0.05, 0.05, 0.05], [0.12, 0.12, 0.12]],
    concrete: [[0.28, 0.27, 0.25], [0.46, 0.45, 0.42]],
  }[kind] || [[0.1, 0.1, 0.1], [0.3, 0.3, 0.3]];
  const t = canvasTex(S, (u, v) => mix3(pal[0], pal[1], sat(f(u, v) * 0.75 + g(u, v) * 0.35)));
  cache.set(key, t);
  return t;
}

export function makeMaterial(name, extra = {}) {
  const s = texSet(name);
  return new THREE.MeshStandardMaterial({
    map: s.map, normalMap: s.normalMap || null, roughness: s.roughness ?? 0.8, metalness: s.metalness ?? 0, ...extra,
  });
}
