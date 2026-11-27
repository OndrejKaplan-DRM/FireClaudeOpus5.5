// Menší rekvizity: svíčka, louč, ohniště, pneumatika, sud, granát, sud TNT, acetylenový sáček, bruska s nosníkem, louže.
import * as THREE from 'three';
import { segs, lathe, tube, mesh, blob, noise3, displace, mergeByMaterial } from './geo.js';
import { makeMaterial, texSet } from './textures.js';
import { applyChar } from '../fx/char.js';
import { mulberry32 } from '../engine/rng.js';

/** Převzorkování lomené čáry profilu na n bodů podle délky oblouku. */
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

function charMat(name, opts = {}, extra = {}) {
  const m = makeMaterial(name, extra); m.name = name;
  const u = applyChar(m, opts);
  return { m, u };
}

// ------------------------------------------------------------------------------------------- svíčka
export function candle({ lod = 2 }) {
  const R = 0.011, H = 0.1;
  const rad = segs(lod, 8, 24, 64, 220, 640), rows = segs(lod, 6, 18, 70, 220, 760);
  const prof = resample([[0.0005, 0], [R, 0], [R, H - 0.006], [R * 0.985, H - 0.001], [R * 0.8, H - 0.0015], [R * 0.45, H - 0.004], [0.0015, H - 0.005]], rows);
  const g = lathe(prof, rad);
  const n = noise3(3);
  if (lod >= 2) displace(g, (x, y, z) => (y > H * 0.55 ? 0.0009 * Math.max(0, n.fbm(Math.atan2(z, x) * 3, y * 120, 0, 3)) * ((y - H * 0.55) / (H * 0.45)) : 0) + 0.00015 * n(x * 900, y * 900, z * 900));
  const wax = makeMaterial('wax', { roughness: 0.4 }); wax.name = 'wax';
  // podpovrchový rozptyl vosku – levná náhrada: emisivní prosvícení u vrcholu (umělecké)
  wax.emissive = new THREE.Color(1.0, 0.5, 0.18); wax.emissiveIntensity = 0;
  { // prosvícení jen u horního okraje (v ≈ 1 u knotu)
    const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, '#1a1a1a'); gr.addColorStop(0.7, '#333'); gr.addColorStop(0.92, '#888'); gr.addColorStop(1, '#fff');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 64); wax.emissiveMap = new THREE.CanvasTexture(c); wax.emissiveMap.colorSpace = THREE.SRGBColorSpace;
  }
  const wick = tube(new THREE.Vector3(0, H - 0.005, 0), new THREE.Vector3(0.0012, H + 0.009, 0.0004), 0.0006, 0.0004, segs(lod, 4, 6, 8, 16, 32), segs(lod, 1, 2, 4, 8, 16));
  const wickM = new THREE.MeshStandardMaterial({ color: 0x070605, roughness: 0.9, name: 'wick' });
  const plate = lathe(resample([[0, 0], [0.04, 0], [0.042, 0.004], [0.04, 0.006], [R * 1.25, 0.006], [R * 1.25, 0.018], [R * 1.1, 0.018], [R * 1.1, 0.008], [0, 0.008]], segs(lod, 6, 12, 30, 90, 280)), rad);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.9, roughness: 0.35, name: 'brass' });
  const grp = new THREE.Group();
  const cm = mesh(g, wax, { name: 'wax' }); cm.position.y = 0.008; grp.add(cm);
  const wm = mesh(wick, wickM, { name: 'wick' }); wm.position.y = 0.008; grp.add(wm);
  grp.add(mesh(plate, brass, { name: 'holder' }));
  grp.userData = { flameAt: new THREE.Vector3(0.0012, H + 0.008 + 0.009, 0.0004), wax };
  return grp;
}

// ------------------------------------------------------------------------------------------- louč
export function torch({ lod = 2 }) {
  const rad = segs(lod, 5, 10, 24, 80, 260), rows = segs(lod, 4, 12, 40, 160, 600);
  const prof = resample([[0.012, 0], [0.014, 0.5], [0.016, 0.62], [0.026, 0.64], [0.03, 0.7], [0.028, 0.76], [0.022, 0.79], [0.004, 0.8]], rows);
  const g = lathe(prof, rad);
  const n = noise3(5);
  displace(g, (x, y, z) => {
    const a = Math.atan2(z, x);
    const wrap = y > 0.62 && y < 0.79 ? 0.0025 * Math.sin(a * 2 + y * 180) + 0.002 * n.fbm(a * 4, y * 60, 0, 3) : 0;
    return wrap + 0.0012 * n(x * 300, y * 40, z * 300);
  });
  const { m, u } = charMat('bark', { scale: 30 });
  u.uCharBase.value = 0.5; u.uCharH.value = -0.3; // ohořívá od hlavice dolů
  const grp = new THREE.Group();
  const t = mesh(g, m, { name: 'torch' }); t.rotation.z = 0.12; grp.add(t);
  // železný držák zapíchnutý v zemi
  const iron = new THREE.MeshStandardMaterial({ color: 0x222120, metalness: 0.8, roughness: 0.6, name: 'iron' });
  const spike = tube(new THREE.Vector3(0.0, -0.25, 0), new THREE.Vector3(-0.03, 0.42, 0), 0.006, 0.006, segs(lod, 4, 6, 10, 24, 64), 1);
  grp.add(mesh(spike, iron, { name: 'spike' }));
  const ring = new THREE.TorusGeometry(0.019, 0.004, segs(lod, 3, 6, 10, 24, 60), segs(lod, 8, 16, 32, 96, 300)); ring.rotateX(Math.PI / 2); ring.translate(-0.035, 0.42, 0);
  grp.add(mesh(ring, iron, { name: 'ring' }));
  const tip = new THREE.Vector3(0, 0.72, 0).applyEuler(new THREE.Euler(0, 0, 0.12));
  grp.userData = { flameAt: tip, char: u };
  return grp;
}

// ------------------------------------------------------------------------------------------- ohniště
export function campfire({ lod = 2, size = 'medium', seed = 11 }) {
  const r = mulberry32(seed);
  const S = { small: 0.45, medium: 1.0, large: 1.6 }[size] || 1;
  const nStones = { small: 7, medium: 12, large: 16 }[size];
  const nLogs = { small: 4, medium: 6, large: 9 }[size];
  const grp = new THREE.Group();
  const stone = makeMaterial('stone'); stone.name = 'stone';
  const parts = [];
  const sd = segs(lod, 0, 1, 3, 5, 7);
  for (let i = 0; i < nStones; i++) {
    const a = (i / nStones) * Math.PI * 2 + r() * 0.2, R = 0.55 * S + r() * 0.05 * S;
    const g = blob(0.09 * S * (0.8 + r() * 0.5), sd, seed + i, 0.35, [1.2, 0.7, 1]);
    g.rotateY(r() * 6); g.translate(Math.cos(a) * R, 0.04 * S, Math.sin(a) * R);
    parts.push([g, stone]);
  }
  grp.add(mergeByMaterial(parts, 'stones'));
  // polena (týpí) s kůrou, ohořelá
  const { m: bark, u } = charMat('bark', { scale: 8, alligator: [14, 20] });
  u.uCharBase.value = 0; u.uCharH.value = 0.6 * S;
  const n = noise3(seed + 9);
  const logs = [];
  for (let i = 0; i < nLogs; i++) {
    const a = (i / nLogs) * Math.PI * 2 + r() * 0.3;
    const base = new THREE.Vector3(Math.cos(a) * 0.38 * S, 0.02, Math.sin(a) * 0.38 * S);
    const top = new THREE.Vector3(Math.cos(a + 0.4) * 0.05 * S, 0.62 * S * (0.85 + r() * 0.3), Math.sin(a + 0.4) * 0.05 * S);
    const rr = 0.045 * S * (0.8 + r() * 0.5);
    const g = tube(base, top, rr, rr * 0.8, segs(lod, 5, 8, 16, 48, 160), segs(lod, 1, 4, 16, 64, 220));
    displace(g, (x, y, z) => 0.004 * S * n.fbm(x * 30, y * 30, z * 30, 3));
    logs.push(g);
  }
  // ležící polena (velký oheň)
  if (size !== 'small') for (let i = 0; i < 3; i++) {
    const a = r() * 6.28, b = new THREE.Vector3(Math.cos(a) * 0.5 * S, 0.05 * S, Math.sin(a) * 0.5 * S), c = new THREE.Vector3(-Math.cos(a) * 0.1 * S, 0.12 * S, -Math.sin(a) * 0.1 * S);
    const g = tube(b, c, 0.05 * S, 0.05 * S, segs(lod, 5, 8, 16, 48, 160), segs(lod, 1, 4, 12, 48, 180));
    displace(g, (x, y, z) => 0.004 * S * n.fbm(x * 30, y * 30, z * 30, 3));
    logs.push(g);
  }
  grp.add(mergeByMaterial(logs.map((g) => [g, bark]), 'logs'));
  // lože popela a žhavých uhlíků
  const ash = new THREE.CircleGeometry(0.5 * S, segs(lod, 8, 24, 64, 200, 500), 0, Math.PI * 2);
  ash.rotateX(-Math.PI / 2);
  if (lod >= 2) {
    // jemné zvlnění: nutné víc vrcholů uvnitř → nahradit polárním gridem
  }
  const ashM = new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 1, name: 'ash' });
  const au = applyChar(ashM, { scale: 25 }); au.uChar.value = 0.9; au.uGlow.value = 0.6;
  const am = mesh(ash, ashM, { name: 'ash' }); am.position.y = 0.006; grp.add(am);
  const coals = coalBed({ lod, R: 0.42 * S, S, seed: seed + 17 }); if (coals) grp.add(coals);
  grp.userData = { char: u, ashChar: au, coals, flameAt: new THREE.Vector3(0, 0.05, 0), D: 0.75 * S };
  return grp;
}

/**
 * Lože žhavého uhlí: instancované zuhelnatělé kusy (1 volání kreslení), každý s vlastním žhnutím (atribut aChar).
 * Velikosti log-normálně 1,5–5 cm × S, hustěji ke středu; žhnutí „dýchá“ (applyChar coal). LOD0 bez uhlí.
 */
export function coalBed({ lod = 2, R = 0.42, S = 1, seed = 5, n = null }) {
  const N = n ?? Math.round([0, 10, 28, 70, 380][Math.min(lod, 4)] * Math.max(0.6, S));
  if (!N) return null;
  const r = mulberry32(seed);
  const g = blob(0.5, [0, 0, 1, 2, 3][Math.min(lod, 4)], seed, 0.45, [1.3, 0.55, 1]);
  const aChar = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
  g.setAttribute('aChar', aChar);
  const m = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.95, name: 'coal' });
  applyChar(m, { instanced: true, scale: 30, coal: true });
  const im = new THREE.InstancedMesh(g, m, N); im.name = 'coals'; im.castShadow = false; im.receiveShadow = true;
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, rr = R * Math.pow(r(), 0.75);
    const sz = 0.03 * S * Math.exp((r() - 0.5) * 1.1);
    p.set(Math.cos(a) * rr, 0.006 + sz * 0.2, Math.sin(a) * rr);
    e.set((r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6); q.setFromEuler(e);
    sc.set(sz, sz * (0.7 + 0.5 * r()), sz * (0.8 + 0.4 * r()));
    im.setMatrixAt(i, M.compose(p, q, sc));
    aChar.setXY(i, 1, (0.45 + 0.55 * r()) * (1 - 0.45 * rr / R));
  }
  im.instanceMatrix.needsUpdate = true;
  im.userData.char = m.userData.char;
  return im;
}

// ------------------------------------------------------------------------------------------- pneumatika
export function tireGeometry(lod) {
  const Ro = 0.316, Ri = 0.203, W = 0.205;
  const around = segs(lod, 12, 36, 120, 480, 2000), rows = segs(lod, 6, 14, 40, 104, 240);
  // průřez v rovině (r, y) – y = osa kola
  const sec = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, ang = -Math.PI / 2 + t * Math.PI;
    const r = Ri + 0.02 + (Ro - Ri - 0.02) * (0.5 + 0.5 * Math.cos(ang - Math.PI / 2) ** 0.35 * Math.sign(Math.cos(ang - Math.PI / 2)));
    sec.push([Math.max(Ri, r), (W / 2) * Math.sin(ang) * 1.02]);
  }
  // vnější běhoun plošší
  const prof = resample([[Ri, -W * 0.42], [Ri + 0.03, -W * 0.5], [Ro - 0.03, -W * 0.52], [Ro - 0.006, -W * 0.47], [Ro, -W * 0.4], [Ro, W * 0.4], [Ro - 0.006, W * 0.47], [Ro - 0.03, W * 0.52], [Ri + 0.03, W * 0.5], [Ri, W * 0.42]], rows);
  void sec;
  const g = lathe(prof.map(([r, y]) => [r, y]), around);
  if (lod >= 2) {
    // dezén: drážky v běhounu
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, z);
      if (rr > Ro - 0.004 && Math.abs(y) < W * 0.4) {
        const a = Math.atan2(z, x), lug = ((a * 60 / Math.PI + Math.abs(y) * 40) % 2 + 2) % 2;
        const groove = Math.abs(y) % 0.045 < 0.008 || lug < 0.35 ? 0.008 : 0;
        const k = (rr - groove) / rr; p.setXYZ(i, x * k, y, z * k);
      }
    }
    g.computeVertexNormals();
  }
  return g;
}
export function tire({ lod = 2, rim = true }) {
  const grp = new THREE.Group();
  const { m, u } = charMat('rubber', { scale: 20 });
  u.uCharBase.value = 0; u.uCharH.value = 0.6;
  const t = mesh(tireGeometry(lod), m, { name: 'tire' }); t.rotation.x = Math.PI / 2; t.position.y = 0.316; grp.add(t);
  if (rim) {
    const rg = lathe(resample([[0.0, -0.03], [0.06, -0.035], [0.17, -0.05], [0.203, -0.09], [0.205, -0.1], [0.205, 0.1], [0.198, 0.09], [0.17, 0.03], [0.06, 0.02], [0, 0.02]], segs(lod, 5, 10, 24, 64, 160)), segs(lod, 8, 24, 64, 240, 900));
    const steel = makeMaterial('steel'); steel.name = 'rim';
    const rm = mesh(rg, steel, { name: 'rim' }); rm.rotation.x = Math.PI / 2; rm.position.y = 0.316; grp.add(rm);
  }
  grp.userData = { char: u };
  return grp;
}
/** Hromada pneumatik (vrstvené, sdílená geometrie) */
export function tirePile({ lod = 2, n = 5, seed = 3 }) {
  const r = mulberry32(seed), grp = new THREE.Group();
  const { m, u } = charMat('rubber', { scale: 20 }); u.uCharH.value = 1.2;
  const g = tireGeometry(lod);
  for (let i = 0; i < n; i++) {
    const t = mesh(g, m, { name: 'tire' + i });
    t.position.set((r() - 0.5) * 0.08, 0.105 + i * 0.205, (r() - 0.5) * 0.08); t.rotation.set((r() - 0.5) * 0.08, r() * 3, (r() - 0.5) * 0.08);
    grp.add(t);
  }
  grp.userData = { char: u, H: n * 0.205 };
  return grp;
}

// ------------------------------------------------------------------------------------------- sud 200 l
export function barrel({ lod = 2, paint = 'metalRed' }) {
  const R = 0.2865, H = 0.88;
  const rad = segs(lod, 10, 28, 96, 400, 1300), rows = segs(lod, 8, 24, 80, 200, 370);
  const p = [[0, 0.004], [R - 0.01, 0.004], [R - 0.004, 0], [R + 0.006, 0.008], [R, 0.02]];
  for (const hy of [0.29, 0.59]) p.push([R, hy - 0.025], [R + 0.012, hy - 0.01], [R + 0.012, hy + 0.01], [R, hy + 0.025]);
  p.push([R, H - 0.02], [R + 0.006, H - 0.008], [R - 0.004, H], [R - 0.012, H - 0.006], [0, H - 0.006]);
  const g = lathe(resample(p, rows), rad);
  const n = noise3(7);
  if (lod >= 2) displace(g, (x, y, z) => 0.0015 * n.fbm(x * 10, y * 10, z * 10, 3)); // důlky
  const { m, u } = charMat(paint, { scale: 4 });
  u.uCharBase.value = 0; u.uCharH.value = H;
  const grp = new THREE.Group();
  grp.add(mesh(g, m, { name: 'drum' }));
  for (const [x, rr] of [[0.18, 0.03], [-0.17, 0.018]]) {
    const b = new THREE.CylinderGeometry(rr, rr, 0.012, segs(lod, 6, 10, 20, 48, 120)); b.translate(x, H - 0.0, 0);
    grp.add(mesh(b, m, { name: 'bung' }));
  }
  grp.userData = { char: u, H, R };
  return grp;
}

// ------------------------------------------------------------------------------------------- granát (M67-like)
export function grenade({ lod = 2 }) {
  const grp = new THREE.Group();
  const body = new THREE.SphereGeometry(0.032, segs(lod, 8, 16, 48, 200, 640), segs(lod, 6, 12, 36, 150, 480));
  const olive = makeMaterial('metalOlive'); olive.name = 'body';
  grp.add(mesh(body, olive, { name: 'body' }));
  const steel = makeMaterial('steel'); steel.name = 'fuze';
  const fz = lathe(resample([[0, 0.028], [0.012, 0.028], [0.012, 0.05], [0.008, 0.055], [0, 0.055]], segs(lod, 4, 8, 16, 48, 160)), segs(lod, 6, 12, 32, 120, 400));
  grp.add(mesh(fz, steel, { name: 'fuze' }));
  const lever = new THREE.BoxGeometry(0.008, 0.07, 0.002, 1, segs(lod, 1, 4, 12, 40, 120), 1);
  const lp = lever.attributes.position;
  for (let i = 0; i < lp.count; i++) { const y = lp.getY(i); lp.setZ(i, lp.getZ(i) + 0.034 * Math.sin(((y + 0.035) / 0.07) * 1.4)); }
  lever.computeVertexNormals(); lever.translate(0, 0.015, 0.0);
  grp.add(mesh(lever, steel, { name: 'lever' }));
  const ring = new THREE.TorusGeometry(0.012, 0.0012, segs(lod, 3, 6, 10, 24, 48), segs(lod, 8, 16, 32, 96, 300)); ring.translate(0.022, 0.05, 0);
  grp.add(mesh(ring, steel, { name: 'pin' }));
  grp.userData = { H: 0.087 };
  return grp;
}

// ------------------------------------------------------------------------------------------- 1 t TNT v sudu
function labelTexture(lines) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#353a20'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#c9a419'; g.fillRect(0, 100, 1024, 40);
  g.fillStyle = '#d8d0b0'; g.font = 'bold 54px monospace'; g.textAlign = 'center';
  lines.forEach((l, i) => g.fillText(l, 256 + 512 * (i % 2), 70 + 150 * Math.floor(i / 2) + (i > 1 ? 20 : 0)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
export function tntDrum({ lod = 2 }) {
  const R = 0.47, H = 1.0;
  const p = [[0, 0.01], [R - 0.02, 0.01], [R, 0], [R + 0.012, 0.015], [R, 0.03]];
  for (const hy of [0.33, 0.66]) p.push([R, hy - 0.03], [R + 0.015, hy - 0.012], [R + 0.015, hy + 0.012], [R, hy + 0.03]);
  p.push([R, H - 0.03], [R + 0.012, H - 0.015], [R, H], [R - 0.02, H - 0.01], [0, H - 0.01]);
  const g = lathe(resample(p, segs(lod, 8, 24, 80, 220, 400)), segs(lod, 10, 28, 96, 420, 1200));
  const mat = new THREE.MeshStandardMaterial({ map: labelTexture(['TNT', '1000 kg', 'VÝBUŠNINA 1.1D', 'UN 0209']), roughness: 0.55, metalness: 0.4, name: 'tnt' });
  const grp = new THREE.Group(); grp.add(mesh(g, mat, { name: 'drum' }));
  // paleta pod sudem
  const wood = makeMaterial('woodPlank'); wood.name = 'pallet';
  const parts = [];
  for (let i = 0; i < 5; i++) { const b = new THREE.BoxGeometry(1.2, 0.022, 0.14); b.translate(0, 0.133, -0.5 + i * 0.25); parts.push([b, wood]); }
  for (let i = 0; i < 3; i++) { const b = new THREE.BoxGeometry(0.1, 0.1, 1.2); b.translate(-0.55 + i * 0.55, 0.05 + 0.022, 0); parts.push([b, wood]); }
  const pal = mergeByMaterial(parts, 'pallet'); grp.add(pal);
  grp.children[0].position.y = 0.144;
  grp.userData = { H: H + 0.144 };
  return grp;
}

// ------------------------------------------------------------------------------------------- acetylen: PE sáček se směsí + láhev
export function acetyleneBag({ lod = 2 }) {
  const grp = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 30; i++) { const t = i / 30, y = t * 0.62; const r = Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7 * 0.22 * (1 - 0.25 * t) + 0.012; prof.push([r, y]); }
  prof.push([0.012, 0.66], [0.006, 0.7], [0, 0.7]);
  const g = lathe(resample(prof, segs(lod, 6, 16, 48, 180, 600)), segs(lod, 8, 20, 64, 240, 800));
  const n = noise3(13);
  displace(g, (x, y, z) => 0.008 * n.fbm(x * 8, y * 8, z * 8, 3)); // vrásky fólie
  const pe = new THREE.MeshStandardMaterial({ color: 0xdfe8ec, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false, name: 'pe' });
  const bag = mesh(g, pe, { name: 'bag', cast: false }); bag.position.y = 0.05; grp.add(bag);
  // kolík a provázek
  const wood = makeMaterial('woodPlank'); wood.name = 'stake';
  grp.add(mesh(tube(new THREE.Vector3(0.35, -0.2, 0), new THREE.Vector3(0.35, 0.5, 0), 0.015, 0.012, segs(lod, 4, 6, 12, 32, 96), 1), wood, { name: 'stake' }));
  const cord = new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.9, name: 'cord' });
  grp.add(mesh(tube(new THREE.Vector3(0, 0.75, 0), new THREE.Vector3(0.35, 0.45, 0), 0.002, 0.002, 4, segs(lod, 1, 4, 8, 16, 32)), cord, { name: 'cord' }));
  // láhev s acetylenem (kaštanová) opodál
  const cyl = lathe(resample([[0, 0], [0.1, 0], [0.11, 0.02], [0.11, 0.85], [0.08, 0.95], [0.035, 0.98], [0.035, 1.05], [0, 1.05]], segs(lod, 6, 16, 40, 120, 300)), segs(lod, 8, 20, 64, 200, 600));
  const am = makeMaterial('acetylene'); am.name = 'cylinder';
  const cm = mesh(cyl, am, { name: 'cylinder' }); cm.position.set(-0.9, 0, 0.4); grp.add(cm);
  grp.userData = { H: 0.75 };
  return grp;
}

// ------------------------------------------------------------------------------------------- jiskry: bruska na ocelovém nosníku
export function grinderRig({ lod = 2 }) {
  const grp = new THREE.Group();
  const steel = makeMaterial('steel'); steel.name = 'beam';
  // profil IPE 160 vytažený
  const sh = new THREE.Shape();
  const b = 0.082, h = 0.16, tw = 0.005, tf = 0.0074;
  sh.moveTo(-b / 2, 0); sh.lineTo(b / 2, 0); sh.lineTo(b / 2, tf); sh.lineTo(tw / 2, tf); sh.lineTo(tw / 2, h - tf); sh.lineTo(b / 2, h - tf); sh.lineTo(b / 2, h); sh.lineTo(-b / 2, h); sh.lineTo(-b / 2, h - tf); sh.lineTo(-tw / 2, h - tf); sh.lineTo(-tw / 2, tf); sh.lineTo(-b / 2, tf); sh.closePath();
  const beam = new THREE.ExtrudeGeometry(sh, { depth: 1.2, steps: segs(lod, 1, 4, 24, 200, 900), bevelEnabled: false });
  beam.translate(0, 0.45, -0.6);
  grp.add(mesh(beam, steel, { name: 'beam' }));
  // kozy
  const wood = makeMaterial('woodPlank'); wood.name = 'trestle';
  for (const z of [-0.45, 0.45]) { const t = new THREE.BoxGeometry(0.5, 0.45, 0.08, 1, segs(lod, 1, 2, 4, 16, 40), 1); t.translate(0, 0.225, z); grp.add(mesh(t, wood, { name: 'trestle' })); }
  // bruska
  const body = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c3a5e, roughness: 0.6, name: 'grinder' });
  const blk = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7, name: 'grip' });
  body.add(mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.28, segs(lod, 6, 12, 32, 96, 300), segs(lod, 1, 2, 8, 32, 96)).rotateZ(Math.PI / 2).translate(-0.14, 0, 0), dark, { name: 'motor' }));
  body.add(mesh(new THREE.BoxGeometry(0.07, 0.06, 0.07, 1, 1, 1).translate(0.02, 0.0, 0), dark, { name: 'head' }));
  const disc = new THREE.CylinderGeometry(0.0625, 0.0625, 0.0025, segs(lod, 10, 24, 64, 240, 800), 1);
  disc.translate(0.03, -0.045, 0);
  body.add(mesh(disc, new THREE.MeshStandardMaterial({ color: 0x5c5a55, roughness: 0.9, name: 'disc' }), { name: 'disc' }));
  body.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8).translate(0.02, 0.06, 0), blk, { name: 'handle' }));
  body.rotation.set(0.25, 0.4, -0.35);
  body.position.set(-0.02, 0.45 + 0.16 + 0.07, 0.05);
  grp.add(body);
  grp.userData = { sparkAt: new THREE.Vector3(0.0, 0.45 + 0.16, 0.05), sparkDir: new THREE.Vector3(-0.8, 0.25, 0.55).normalize() };
  return grp;
}

// ------------------------------------------------------------------------------------------- louže nafty
export function puddle({ lod = 2, R = 2.0, seed = 21 }) {
  const n = noise3(seed);
  const around = segs(lod, 12, 48, 160, 600, 2000), rings = segs(lod, 1, 6, 30, 80, 240);
  const pos = [], idx = [], uv = [];
  pos.push(0, 0, 0); uv.push(0.5, 0.5);
  for (let j = 1; j <= rings; j++) for (let i = 0; i < around; i++) {
    const a = (i / around) * Math.PI * 2, t = j / rings;
    const rr = R * t * (0.82 + 0.3 * n.fbm(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4, 0, 4) + 0.08 * Math.sin(a * 3 + 1));
    pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr); uv.push(0.5 + Math.cos(a) * rr / (2 * R), 0.5 + Math.sin(a) * rr / (2 * R));
  }
  for (let i = 0; i < around; i++) idx.push(0, 1 + ((i + 1) % around), 1 + i);
  for (let j = 1; j < rings; j++) for (let i = 0; i < around; i++) {
    const a = 1 + (j - 1) * around + i, b = 1 + (j - 1) * around + ((i + 1) % around), c = a + around, d = b + around;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: 0x0b0a08, roughness: 0.04, metalness: 0.0, name: 'diesel' });
  // tenký film: duhový odlesk závislý na úhlu a tloušťce (umělecká aproximace interference)
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
        vec3 film = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + fr * 2.5 + vFilm.x * 1.7 + vFilm.y * 1.3));
        totalEmissiveRadiance += film * fr * 0.02; }`).replace('#include <common>', '#include <common>\nvarying vec2 vFilm;');
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFilm;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFilm = position.xz;');
  };
  const pm = mesh(g, m, { name: 'puddle', cast: false }); pm.position.y = 0.004;
  const grp = new THREE.Group(); grp.add(pm);
  // plechový kanystr převrhnutý
  const can = new THREE.BoxGeometry(0.34, 0.47, 0.16, 1, segs(lod, 1, 2, 6, 24, 80), 1); can.rotateZ(Math.PI / 2 - 0.1); can.translate(R * 0.95, 0.09, 0.3);
  const cm = makeMaterial('metalRed'); cm.name = 'jerrycan';
  grp.add(mesh(can, cm, { name: 'jerrycan' }));
  grp.userData = { R };
  return grp;
}

export { texSet };
