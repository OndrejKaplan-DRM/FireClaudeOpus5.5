// Rekvizity iterace 6 (rozšíření palety): zapalovač, sud bez víka s kapalinou, pramínek paliva a rozteklý pruh,
// tlaková láhev (acetylen) a její úlomky, paleta, bedna. Vše procedurálně z kódu, LOD 0–4, hořlavé kusy s applyChar.
import * as THREE from 'three';
import { segs, lathe, tube, mesh, noise3, displace, mergeByMaterial } from './geo.js';
import { makeMaterial } from './textures.js';
import { applyChar } from '../fx/char.js';
import { mulberry32 } from '../engine/rng.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function resample(pts, n) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = [], tot = L[L.length - 1];
  for (let k = 0; k < n; k++) {
    const s = (tot * k) / (n - 1); let i = 1; while (i < L.length - 1 && L[i] < s) i++;
    const t = (s - L[i - 1]) / Math.max(L[i] - L[i - 1], 1e-9);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
  }
  return out;
}
const fuelMat = (name = 'diesel') => new THREE.MeshStandardMaterial({ color: 0x0b0a08, roughness: 0.05, metalness: 0, name });

// ------------------------------------------------------------------------------------------- zapalovač (křesací, plynový)
/** Jednorázový plynový zapalovač 81 × 25 × 12 mm: průsvitné tělo, kovový kryt, křesací kolečko, páčka ventilu. */
export function lighter({ lod = 2, color = 0xd8452a }) {
  const grp = new THREE.Group();
  const W = 0.025, D = 0.012, Hb = 0.062;
  const body = new THREE.BoxGeometry(W, Hb, D, segs(lod, 1, 2, 6, 16, 48), segs(lod, 1, 2, 8, 24, 80), segs(lod, 1, 2, 4, 12, 32));
  // zaoblení rohů: stažení k ose podle vzdálenosti od hran (superelipsa)
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (W / 2), z = p.getZ(i) / (D / 2), k = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25) || 1;
    const m = Math.max(Math.abs(x), Math.abs(z)) / k;
    p.setX(i, p.getX(i) * m); p.setZ(i, p.getZ(i) * m);
  }
  body.computeVertexNormals(); body.translate(0, Hb / 2, 0);
  const plastic = new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.82, name: 'lighterBody' });
  grp.add(mesh(body, plastic, { name: 'body' }));
  // kapalný butan uvnitř (tmavší spodní část)
  const liq = new THREE.BoxGeometry(W * 0.86, Hb * 0.55, D * 0.7); liq.translate(0, Hb * 0.3, 0);
  grp.add(mesh(liq, new THREE.MeshStandardMaterial({ color: 0x5a1408, roughness: 0.1, name: 'butane' }), { name: 'butane', cast: false }));
  const steel = makeMaterial('steel'); steel.name = 'lighterSteel';
  // kryt plamene (oválná trubka), vpředu
  const hood = new THREE.CylinderGeometry(0.0062, 0.0062, 0.017, segs(lod, 6, 10, 24, 64, 160), 1, true);
  hood.scale(1, 1, 0.82); hood.translate(-0.0048, Hb + 0.0085, 0);
  steel.side = THREE.DoubleSide; grp.add(mesh(hood, steel, { name: 'hood' }));
  // tryska
  const noz = new THREE.CylinderGeometry(0.0011, 0.0014, 0.011, segs(lod, 4, 6, 10, 20, 48)); noz.translate(-0.0048, Hb + 0.0055, 0);
  grp.add(mesh(noz, steel, { name: 'nozzle' }));
  // křesací kolečko (vroubkované) na vidlici vzadu
  const ws = segs(lod, 8, 12, 28, 72, 200);
  const wheelG = new THREE.CylinderGeometry(0.0042, 0.0042, 0.0058, ws, 1); wheelG.rotateX(Math.PI / 2);
  if (lod >= 2) { const q = wheelG.attributes.position; for (let i = 0; i < q.count; i++) { const a = Math.atan2(q.getY(i), q.getX(i)), r = Math.hypot(q.getX(i), q.getY(i)); if (r > 0.003) { const k = 1 + 0.06 * Math.sign(Math.sin(a * ws * 0.5)); q.setX(i, q.getX(i) * k); q.setY(i, q.getY(i) * k); } } wheelG.computeVertexNormals(); }
  const wheel = mesh(wheelG, steel, { name: 'wheel' }); wheel.position.set(0.0052, Hb + 0.0085, 0); grp.add(wheel);
  for (const sz of [-1, 1]) { const f = new THREE.BoxGeometry(0.008, 0.012, 0.0008); f.translate(0.005, Hb + 0.005, sz * 0.0036); grp.add(mesh(f, steel, { name: 'fork' })); }
  // páčka ventilu
  const lev = new THREE.BoxGeometry(0.0085, 0.0045, 0.0075); lev.translate(0.0078, Hb + 0.0025, 0);
  grp.add(mesh(lev, new THREE.MeshStandardMaterial({ color: 0xb01a14, roughness: 0.4, name: 'lever' }), { name: 'lever' }));
  grp.userData = { flameAt: V3(-0.0048, Hb + 0.0115, 0), sparkAt: V3(0.0012, Hb + 0.0095, 0), wheel, H: Hb + 0.017 };
  return grp;
}

// ------------------------------------------------------------------------------------------- sud bez víka s kapalinou
/** Sud 200 l bez víka: vnitřní stěna a hladina kapaliny (level 0..1 výšky). Lak s metal stavy (applyChar metal). */
export function barrelOpen({ lod = 2, paint = 'metalBlue', level = 0.8 }) {
  const R = 0.2865, H = 0.88, yl = H * level;
  const rad = segs(lod, 10, 28, 96, 400, 1300), rows = segs(lod, 10, 28, 90, 220, 400);
  const p = [[0, 0.004], [R - 0.01, 0.004], [R - 0.004, 0], [R + 0.006, 0.008], [R, 0.02]];
  for (const hy of [0.29, 0.59]) p.push([R, hy - 0.025], [R + 0.012, hy - 0.01], [R + 0.012, hy + 0.01], [R, hy + 0.025]);
  p.push([R, H - 0.02], [R + 0.007, H - 0.008], [R + 0.004, H], [R - 0.004, H - 0.002], [R - 0.006, H - 0.02], [R - 0.006, yl - 0.01]);
  const g = lathe(resample(p, rows), rad);
  const n = noise3(9);
  if (lod >= 2) displace(g, (x, y, z) => 0.002 * n.fbm(x * 9, y * 9, z * 9, 3));
  const m = makeMaterial(paint); m.name = paint; m.side = THREE.DoubleSide;
  const u = applyChar(m, { scale: 4, metal: true });
  u.uCharBase.value = yl; u.uCharH.value = -(H - yl) * 1.2; // horký konec nahoře u okraje, pod hladinou plech chladí kapalina
  u.uHeatFall.value = 1.6;
  const grp = new THREE.Group(); grp.add(mesh(g, m, { name: 'drum' }));
  const lq = new THREE.CircleGeometry(R - 0.007, segs(lod, 10, 24, 64, 200, 600)); lq.rotateX(-Math.PI / 2); lq.translate(0, yl, 0);
  const liquid = mesh(lq, fuelMat(), { name: 'liquid', cast: false }); grp.add(liquid);
  grp.userData = { char: u, H, R, liquidY: yl, liquid };
  return grp;
}

/** Pramínek kapaliny z otvoru: parabola (v vodorovně, volný pád), trubička o poloměru r. */
export function fuelJet({ lod = 2, v = 3.1, h = 0.3, r = 0.0045 }) {
  const pts = [], T = Math.sqrt((2 * h) / 9.81), n = segs(lod, 3, 5, 10, 24, 60);
  for (let i = 0; i <= n; i++) { const t = (T * i) / n; pts.push(V3(v * t, h - 0.5 * 9.81 * t * t, 0)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, r, segs(lod, 3, 5, 8, 12, 24), false);
  const m = new THREE.MeshStandardMaterial({ color: 0x3a2a0c, roughness: 0.08, transparent: true, opacity: 0.85, name: 'fuelJet' });
  const o = mesh(g, m, { name: 'jet', cast: false }); o.userData = { reach: v * T };
  return o;
}

/** Rozteklý pruh kapaliny po zemi ve směru +x: úzký u zdroje, širší dole, laločnatý okraj. */
export function spillStrip({ lod = 2, len = 8, w = 0.6, seed = 5 }) {
  const n = noise3(seed), nu = segs(lod, 6, 16, 60, 200, 600), pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const t = i / nu, x = t * len;
    const half = (w / 2) * (0.35 + 0.65 * Math.min(1, t * 3)) * (1 + 0.35 * n.fbm(x * 0.9, 0, seed, 3)) * (t > 0.9 ? Math.sqrt(Math.max(0, (1 - t) / 0.1)) * 0.9 + 0.25 : 1) * (1 + 0.5 * Math.max(0, t - 0.75) * 4 * 0.5);
    const cz = 0.25 * w * n.fbm(x * 0.35, 3.3, seed, 2);
    pos.push(x, 0.004, cz - half, x, 0.004, cz + half); uv.push(t, 0, t, 1);
    if (i < nu) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const o = mesh(g, fuelMat('spill'), { name: 'spill', cast: false });
  return o;
}

// ------------------------------------------------------------------------------------------- tlaková láhev (acetylen)
const CYL_PROFILE = [[0, 0.012], [0.07, 0.006], [0.098, 0], [0.102, 0.012], [0.102, 0.96], [0.094, 1.02], [0.07, 1.07], [0.04, 1.1], [0.03, 1.115], [0.03, 1.15], [0, 1.15]];
/** Acetylenová láhev 50 l (průměr 204 mm, výška 1,15 m + ventil s kloboukem), kaštanové hrdlo. */
export function gasCylinder({ lod = 2 }) {
  const grp = new THREE.Group();
  const g = lathe(resample(CYL_PROFILE, segs(lod, 8, 18, 48, 140, 320)), segs(lod, 8, 20, 64, 220, 640));
  const m = makeMaterial('acetylene'); m.name = 'cylinder';
  const u = applyChar(m, { scale: 5, metal: true }); u.uCharBase.value = 0; u.uCharH.value = 1.15; u.uHeatFall.value = 0.15;
  grp.add(mesh(g, m, { name: 'shell' }));
  const brass = new THREE.MeshStandardMaterial({ color: 0xa8842e, roughness: 0.35, metalness: 0.9, name: 'brass' });
  const valve = new THREE.CylinderGeometry(0.014, 0.018, 0.06, segs(lod, 5, 8, 14, 32, 80)); valve.translate(0, 1.18, 0);
  grp.add(mesh(valve, brass, { name: 'valve' }));
  const hand = new THREE.CylinderGeometry(0.03, 0.03, 0.012, segs(lod, 6, 10, 20, 48, 120)); hand.translate(0, 1.215, 0);
  grp.add(mesh(hand, brass, { name: 'handwheel' }));
  const out = new THREE.CylinderGeometry(0.008, 0.008, 0.035, segs(lod, 4, 6, 10, 20, 48)); out.rotateZ(Math.PI / 2); out.translate(0.03, 1.18, 0);
  grp.add(mesh(out, brass, { name: 'outlet' }));
  grp.userData = { char: u, H: 1.15, R: 0.102 };
  return grp;
}
/** Úlomky roztržené láhve: spodek s roztřepeným okrajem, hrdlo s ventilem, 3 pláty pláště. Ohořelý plech (bez laku, okuje). */
export function cylinderFragments({ lod = 2, seed = 3 }) {
  const r = mulberry32(seed), n = noise3(seed);
  const m = makeMaterial('steel'); m.name = 'cylBurnt'; m.side = THREE.DoubleSide; m.metalness = 0.6; m.roughness = 0.6;
  const u = applyChar(m, { scale: 6, metal: true }); u.uTmax.value = 1000; u.uTnow.value = 900; u.uSoot.value = 0.5; u.uHeatFall.value = 0.1;
  const rad = segs(lod, 8, 16, 48, 160, 480), parts = [];
  const jag = (g, yEdge, amp) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - yEdge) < 1e-4) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, yEdge + amp * (n.fbm(Math.cos(a) * 3, Math.sin(a) * 3, seed, 3) + 0.4 * Math.sin(a * 5))); } g.computeVertexNormals(); return g; };
  const bottom = new THREE.Group(); bottom.add(mesh(jag(new THREE.CylinderGeometry(0.102, 0.102, 0.5, rad, segs(lod, 1, 2, 6, 16, 40), true).translate(0, 0.25, 0), 0.5, 0.09), m, { name: 'bottom' }));
  const disc = new THREE.CircleGeometry(0.1, rad); disc.rotateX(Math.PI / 2); disc.translate(0, 0.005, 0); bottom.add(mesh(disc, m, { name: 'base' }));
  const top = new THREE.Group(); top.add(mesh(jag(lathe(resample([[0.102, 0], [0.102, 0.2], [0.094, 0.26], [0.07, 0.31], [0.04, 0.34], [0.03, 0.355], [0.03, 0.39], [0, 0.39]], segs(lod, 6, 10, 24, 60, 140)), rad), 0, 0.07), m, { name: 'top' }));
  parts.push(bottom, top);
  for (let i = 0; i < 3; i++) { // utržené pláty: část válcové plochy, zkroucená
    const g = new THREE.CylinderGeometry(0.102, 0.102, 0.22 + 0.15 * r(), segs(lod, 3, 5, 12, 32, 90), segs(lod, 1, 2, 5, 12, 30), true, r() * 6.28, 0.9 + 0.8 * r());
    const p = g.attributes.position; const tw = (r() - 0.5) * 3;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k), a = y * tw, x = p.getX(k), z = p.getZ(k); p.setX(k, x * Math.cos(a) - z * Math.sin(a)); p.setZ(k, x * Math.sin(a) + z * Math.cos(a)); }
    g.computeVertexNormals(); const pl = new THREE.Group(); pl.add(mesh(g, m, { name: 'plate' })); parts.push(pl);
  }
  return { parts, char: u };
}

// ------------------------------------------------------------------------------------------- paleta, bedna
function plankMat(scale = 8) { const m = makeMaterial('woodPlank'); m.name = 'plank'; const u = applyChar(m, { scale, alligator: [10, 14] }); return { m, u }; }
/** Europaleta 1200 × 800 × 144 mm (~22 kg smrku, ~3,5 m² povrchu prken). */
export function pallet({ lod = 2 }) {
  const { m, u } = plankMat(8), parts = [], s = segs(lod, 1, 1, 2, 6, 16);
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d, s * 2, 1, s); g.translate(x, y, z); parts.push([g, m]); };
  for (const z of [-0.3275, -0.165, 0, 0.165, 0.3275]) box(1.2, 0.022, z === 0 || Math.abs(z) > 0.3 ? 0.145 : 0.1, 0, 0.133, z);
  for (const x of [-0.5275, 0, 0.5275]) { box(0.145, 0.022, 0.8, x, 0.111, 0); for (const z of [-0.3275, 0, 0.3275]) box(0.145, 0.078, 0.1, x, 0.061, z); }
  for (const z of [-0.35, 0, 0.35]) box(1.2, 0.022, 0.1, 0, 0.011, z);
  const grp = mergeByMaterial(parts, 'pallet'); u.uCharBase.value = 0; u.uCharH.value = 0.3;
  grp.userData = { char: u, mass: 22, area: 3.5, size: 1.2 };
  return grp;
}
/** Dřevěná bedna z prken, hrana s [m] (0,6 m ≈ 9 kg, 2,2 m² povrchu). */
export function crate({ lod = 2, s = 0.6 }) {
  const { m, u } = plankMat(10), parts = [], q = segs(lod, 1, 1, 2, 6, 16), t = 0.018, nb = 4;
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d, q, q, q); g.translate(x, y, z); parts.push([g, m]); };
  for (let i = 0; i < nb; i++) { const y = (s / nb) * (i + 0.5); for (const sg of [-1, 1]) { box(s, s / nb - 0.008, t, 0, y, sg * (s / 2 - t / 2)); box(t, s / nb - 0.008, s - 2 * t, sg * (s / 2 - t / 2), y, 0); } }
  box(s - 2 * t, t, s - 2 * t, 0, t / 2, 0); box(s, t, s, 0, s + t / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.04, s, 0.04, sx * (s / 2 + 0.002), s / 2, sz * (s / 2 + 0.002));
  const grp = mergeByMaterial(parts, 'crate'); u.uCharBase.value = 0; u.uCharH.value = s;
  grp.userData = { char: u, mass: 9 * (s / 0.6) ** 2, area: 2.2 * (s / 0.6) ** 2 * 1.0, size: s };
  return grp;
}
