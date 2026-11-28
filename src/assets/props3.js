// Rekvizity iterace 7: zbraně (pistole, kulomet, dělo), munice, zápalná láhev, plamenomet, proudnice, místnost s oknem,
// okenní tabule, litý disk, láhev propan-butanu s hořákem, odpalovací trubka, květináč s termitem, pytel mouky, postava
// jako měřítko. Vše procedurálně z kódu, LOD 0–4; kov s materiálem ohoření (stav plechu), dřevo se zuhelnatěním.
import * as THREE from 'three';
import { segs, lathe, tube, mesh, blob, mergeByMaterial } from './geo.js';
import { makeMaterial } from './textures.js';
import { applyChar } from '../fx/char.js';
import { mulberry32 } from '../engine/rng.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (color, rough = 0.6, metal = 0, name = '') => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, name });
const gunMetal = () => { const m = makeMaterial('steel'); m.name = 'gunmetal'; m.color = new THREE.Color(0x2a2c30); m.metalness = 0.75; m.roughness = 0.45; return m; };
const box = (parts, m, w, h, d, x, y, z, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); parts.push([g, m]); };

// ------------------------------------------------------------------------------------------- pistole
/** Samonabíjecí pistole 9 mm ve střelecké stolici, hlaveň míří do +X. userData.muzzle = ústí hlavně. */
export function pistol({ lod = 2 }) {
  const gm = gunMetal(), pol = std(0x191a1c, 0.75, 0.1, 'polymer'), wood = makeMaterial('woodPlank'), parts = [], H = 0.2;
  box(parts, gm, 0.185, 0.026, 0.026, 0.0, H + 0.02, 0);                                  // závěr
  box(parts, pol, 0.16, 0.022, 0.028, -0.008, H - 0.004, 0);                              // rám
  box(parts, pol, 0.036, 0.1, 0.03, -0.062, H - 0.06, 0, 0, 0.28);                        // rukojeť
  box(parts, pol, 0.05, 0.004, 0.012, -0.012, H - 0.04, 0);                               // lučík
  parts.push([tube(V3(0.05, H + 0.017, 0), V3(0.096, H + 0.017, 0), 0.0075, 0.0075, segs(lod, 6, 8, 14, 28, 64)), gm]); // hlaveň
  box(parts, wood, 0.16, 0.04, 0.09, -0.03, 0.02, 0); box(parts, wood, 0.05, H - 0.1, 0.05, -0.062, (H - 0.1) / 2 + 0.03, 0); // stolice
  const g = mergeByMaterial(parts, 'pistol'); g.userData = { muzzle: V3(0.097, H + 0.017, 0), dir: V3(1, 0, 0), eject: V3(0.0, H + 0.035, 0.014) };
  return g;
}

// ------------------------------------------------------------------------------------------- kulomet
/** Univerzální kulomet 7,62 mm na trojnožce, hlaveň do +X. Hlaveň má vlastní materiál se stavem plechu (žhnutí). */
export function machineGun({ lod = 2 }) {
  const gm = gunMetal(), barrelM = gunMetal(); barrelM.name = 'barrel';
  const u = applyChar(barrelM, { scale: 9, metal: true }); u.uCharBase.value = 0; u.uCharH.value = 3; u.uSoot.value = 0; u.uHeatFall.value = 0.02;
  const olive = makeMaterial('metalOlive'), wood = std(0x4a3524, 0.7, 0, 'stock'), brass = std(0xb08a35, 0.35, 0.9, 'brass'), parts = [], H = 0.42, rs = segs(lod, 6, 8, 16, 36, 90);
  box(parts, gm, 0.5, 0.075, 0.055, -0.1, H, 0);                                           // pouzdro závěru
  box(parts, gm, 0.3, 0.012, 0.06, -0.1, H + 0.044, 0);                                    // víko
  parts.push([tube(V3(0.15, H + 0.005, 0), V3(0.7, H + 0.005, 0), 0.014, 0.012, rs, segs(lod, 1, 2, 4, 10, 24)), barrelM]);
  parts.push([tube(V3(0.7, H + 0.005, 0), V3(0.78, H + 0.005, 0), 0.016, 0.019, rs), barrelM]);   // tlumič plamene
  parts.push([tube(V3(0.15, H - 0.025, 0), V3(0.45, H - 0.025, 0), 0.009, 0.009, Math.max(5, rs >> 1)), gm]); // plynový násadec
  box(parts, wood, 0.28, 0.07, 0.04, -0.48, H - 0.01, 0, 0, -0.08);                        // pažba
  box(parts, gm, 0.03, 0.09, 0.03, -0.2, H - 0.075, 0, 0, 0.2);                            // pistolová rukojeť
  box(parts, olive, 0.2, 0.13, 0.09, -0.08, H - 0.11, 0.09);                               // schránka s pásem
  for (let i = 0; i < segs(lod, 0, 4, 8, 12, 12); i++) parts.push([tube(V3(-0.1 + i * 0.012, H + 0.02 - i * 0.004, 0.035), V3(-0.1 + i * 0.012, H + 0.02 - i * 0.004, 0.09), 0.0055, 0.0055, 6), brass]);
  for (const [dx, dz] of [[0.5, 0], [-0.3, 0.32], [-0.3, -0.32]]) parts.push([tube(V3(0.05, H - 0.04, 0), V3(0.05 + dx, 0, dz), 0.013, 0.011, Math.max(5, rs >> 1)), olive]); // trojnožka
  const g = mergeByMaterial(parts, 'machineGun'); g.userData = { muzzle: V3(0.785, H + 0.005, 0), dir: V3(1, 0, 0), eject: V3(-0.05, H - 0.03, -0.035), char: u, barrelLen: 0.63 };
  return g;
}

// ------------------------------------------------------------------------------------------- dělo
/** Kanón 125 mm na kolové lafetě (zjednodušený), hlaveň do +X s náměrem elev [rad]. */
export function fieldGun({ lod = 2, elev = 0.05 }) {
  const olive = makeMaterial('metalOlive'), gm = gunMetal(), rub = makeMaterial('rubber'), parts = [], H = 1.15, rs = segs(lod, 8, 12, 24, 56, 140);
  const c = Math.cos(elev), s = Math.sin(elev), P = (d) => V3(d * c, H + d * s, 0);
  parts.push([tube(P(-0.6), P(5.4), 0.115, 0.085, rs, segs(lod, 1, 2, 6, 14, 30)), olive]);       // hlaveň 6 m
  parts.push([tube(P(2.6), P(3.2), 0.13, 0.13, rs), olive]);                                      // ejektor spalin
  parts.push([tube(P(5.35), P(5.4), 0.095, 0.095, rs), gm]);
  box(parts, olive, 0.9, 0.42, 0.42, -0.75 * c, H - 0.75 * s, 0, 0, elev);                        // závěr
  box(parts, olive, 1.5, 0.3, 0.5, 0.3, H - 0.32, 0);                                             // kolébka
  box(parts, olive, 0.05, 1.25, 2.1, 0.75, H + 0.05, 0, 0, -0.18);                                // štít
  for (const sz of [-1, 1]) {
    const w = new THREE.CylinderGeometry(0.46, 0.46, 0.24, segs(lod, 8, 12, 24, 48, 96)); w.rotateX(Math.PI / 2); w.translate(0.2, 0.46, sz * 0.95); parts.push([w, rub]);
    parts.push([tube(V3(-0.2, H - 0.45, sz * 0.3), V3(-3.6, 0.12, sz * 1.1), 0.075, 0.06, Math.max(6, rs >> 1)), olive]); // ramena lafety
    box(parts, olive, 0.4, 0.3, 0.06, -3.7, 0.15, sz * 1.12);                                     // rydla
  }
  parts.push([tube(V3(0.2, 0.46, -0.95), V3(0.2, 0.46, 0.95), 0.06, 0.06, 8), gm]);
  const g = mergeByMaterial(parts, 'fieldGun'); g.userData = { muzzle: P(5.42), dir: V3(c, s, 0), breech: P(-1.2) };
  return g;
}

// ------------------------------------------------------------------------------------------- munice
const SHELL = [[0, 0], [0.074, 0], [0.0775, 0.02], [0.0775, 0.42], [0.072, 0.5], [0.05, 0.6], [0.022, 0.68], [0.008, 0.7], [0, 0.7]];
/** Dělostřelecký granát 155 mm (délka 0,7 m, ~43 kg) nastojato. */
export function shell({ lod = 2 }) {
  const m = makeMaterial('metalOlive'); m.name = 'shell'; const u = applyChar(m, { scale: 8, metal: true }); u.uCharBase.value = 0; u.uCharH.value = 0.7;
  const g = new THREE.Group(); g.add(mesh(lathe(SHELL, segs(lod, 6, 10, 20, 48, 120)), m, { name: 'shell' }));
  const band = lathe([[0.0785, 0.05], [0.0795, 0.055], [0.0795, 0.075], [0.0785, 0.08]], segs(lod, 6, 10, 20, 48, 120)); g.add(mesh(band, std(0xb87333, 0.4, 0.9, 'band'), { name: 'band' }));
  g.userData = { char: u, H: 0.7, R: 0.0775 };
  return g;
}
/** Paleta s n × n granáty (stoh munice). userData.shells = jednotlivé granáty (pro rozmetání). */
export function shellStack({ lod = 2, n = 3, seed = 1 }) {
  const grp = new THREE.Group(), wood = makeMaterial('woodPlank'), parts = [], r = mulberry32(seed), shells = [];
  box(parts, wood, 0.2 * n + 0.1, 0.1, 0.2 * n + 0.1, 0, 0.05, 0);
  grp.add(mergeByMaterial(parts, 'stackBase'));
  let char = null;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const s = shell({ lod: Math.min(lod, 2) }); s.position.set((i - (n - 1) / 2) * 0.19, 0.1, (j - (n - 1) / 2) * 0.19); s.rotation.y = r() * 6; grp.add(s); shells.push(s); char = char || s.userData.char; }
  grp.userData = { shells, char, n: n * n };
  return grp;
}

// ------------------------------------------------------------------------------------------- zápalná láhev, plamenomet, proudnice
/** Zápalná láhev 0,7 l s hadrem v hrdle. userData.wick = konec hadru. */
export function molotov({ lod = 2 }) {
  const glass = new THREE.MeshStandardMaterial({ color: 0x2f4a26, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.75, name: 'bottle' });
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.036, 0], [0.038, 0.01], [0.038, 0.16], [0.03, 0.2], [0.015, 0.24], [0.014, 0.29], [0.016, 0.3]], segs(lod, 6, 10, 20, 40, 96)), glass, { name: 'bottle' }));
  const rag = blob(0.02, segs(lod, 0, 1, 2, 3, 4), 4, 0.5, [0.8, 2.2, 0.8]); rag.translate(0, 0.325, 0); g.add(mesh(rag, std(0xd8d2c0, 0.95, 0, 'rag'), { name: 'rag' }));
  g.userData = { wick: V3(0, 0.36, 0), volumeL: 0.7 };
  return g;
}
/** Plamenomet: dvě nádrže na stojanu a tryska do +X. */
export function flamethrower({ lod = 2 }) {
  const olive = makeMaterial('metalOlive'), gm = gunMetal(), parts = [], rs = segs(lod, 6, 10, 18, 40, 96);
  for (const z of [-0.09, 0.09]) parts.push([lathe([[0, 0.25], [0.07, 0.26], [0.08, 0.3], [0.08, 0.72], [0.06, 0.78], [0, 0.8]], rs).translate(-0.5, 0, z), olive]);
  parts.push([new THREE.SphereGeometry(0.06, rs, Math.max(4, rs >> 1)).translate(-0.5, 0.86, 0), olive]);
  for (const [x, z] of [[-0.65, -0.2], [-0.65, 0.2], [-0.3, 0]]) parts.push([tube(V3(-0.5, 0.3, 0), V3(x, 0, z), 0.012, 0.012, 6), gm]);
  parts.push([tube(V3(-0.42, 0.7, 0), V3(0.1, 1.0, 0), 0.012, 0.012, 6), gm]);                    // hadice
  parts.push([tube(V3(0.1, 1.0, 0), V3(0.75, 1.02, 0), 0.016, 0.014, rs), gm]);                   // proudnice
  parts.push([tube(V3(0.75, 1.02, 0), V3(0.8, 1.02, 0), 0.022, 0.022, rs), gm]);
  parts.push([tube(V3(0.45, 0.6, 0), V3(0.45, 1.0, 0), 0.012, 0.012, 6), gm]); box(parts, gm, 0.3, 0.02, 0.3, 0.45, 0.01, 0); parts.push([tube(V3(0.45, 0, 0), V3(0.45, 0.6, 0), 0.015, 0.015, 6), gm]);
  const g = mergeByMaterial(parts, 'flamethrower'); g.userData = { muzzle: V3(0.81, 1.02, 0), dir: V3(1, 0.03, 0).normalize() };
  return g;
}
/** Proudnice (hasičská) na stojanu s kusem hadice, míří do +X s náměrem. */
export function nozzle({ lod = 2, elev = 0.25 }) {
  const red = makeMaterial('metalRed'), gm = gunMetal(), hose = std(0xcfc8b4, 0.9, 0, 'hose'), parts = [], rs = segs(lod, 6, 8, 14, 28, 64), c = Math.cos(elev), s = Math.sin(elev);
  parts.push([tube(V3(0, 0.9, 0), V3(0.35 * c, 0.9 + 0.35 * s, 0), 0.03, 0.018, rs), red]);
  for (const [x, z] of [[-0.4, -0.3], [-0.4, 0.3], [0.35, 0]]) parts.push([tube(V3(0, 0.88, 0), V3(x, 0, z), 0.012, 0.012, 6), gm]);
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(V3(-t * 2.6, 0.9 * (1 - t) ** 2 + 0.035, 0.5 * Math.sin(t * 5) * t)); }
  parts.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs(lod, 6, 10, 20, 40, 80), 0.032, Math.max(5, rs >> 1), false), hose]);
  const g = mergeByMaterial(parts, 'nozzle'); g.userData = { muzzle: V3(0.36 * c, 0.9 + 0.36 * s, 0), dir: V3(c, s, 0) };
  return g;
}

// ------------------------------------------------------------------------------------------- místnost, zeď, okno
function crackTexture(seed, n = 26) {
  const S = 512, cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = cv.getContext('2d'), r = mulberry32(seed); g.clearRect(0, 0, S, S); g.strokeStyle = 'rgba(235,245,250,0.9)'; g.lineCap = 'round';
  const cx = S * (0.3 + 0.4 * r()), cy = S * (0.05 + 0.2 * r()); // praskliny vybíhají od okraje (tam je sklo nejstudenější a nejvíc napjaté)
  for (let i = 0; i < n; i++) {
    let x = cx + (r() - 0.5) * 30, y = cy, a = Math.PI * (0.1 + 0.8 * r()); g.lineWidth = 0.8 + 1.6 * r(); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 14; k++) { a += (r() - 0.5) * 0.7; x += Math.cos(a) * S * 0.07; y += Math.sin(a) * S * 0.07; g.lineTo(x, y); if (r() < 0.12) { g.stroke(); g.beginPath(); g.moveTo(x, y); a += (r() - 0.5) * 2; } }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Okenní tabule w × h: sklo + vrstva prasklin (userData.setCrack(0..1)), userData.setSoot(0..1). Leží v rovině XY, střed v počátku. */
export function glassPane({ w = 1.2, h = 1.4, seed = 3 }) {
  const grp = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: 0x8fb3c4, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.22, side: THREE.DoubleSide, name: 'glass', depthWrite: false });
  const cm = new THREE.MeshBasicMaterial({ map: crackTexture(seed), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, name: 'cracks' });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gm), cr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cm); cr.position.z = 0.002; cr.renderOrder = 2;
  grp.add(pane, cr);
  grp.userData = { w, h, setCrack: (k) => { cm.opacity = Math.min(1, k); }, setSoot: (k) => { gm.color.setRGB(0.56 * (1 - 0.9 * k), 0.7 * (1 - 0.9 * k), 0.77 * (1 - 0.9 * k)); gm.opacity = 0.22 + 0.7 * k; } };
  return grp;
}
/**
 * Místnost w × d × H s jedním oknem v čelní stěně (+Z): omítnuté zdivo, podlaha, strop. Bez zadní stěny (aby bylo vidět dovnitř),
 * pokud open = true. userData: window { cx, cy, w, h } (střed okna na čelní stěně), front = z čelní stěny.
 */
export function room({ lod = 2, w = 4, d = 3.5, H = 2.6, win = [1.2, 1.4], sill = 0.9, open = false, wallT = 0.25 }) {
  const pl = makeMaterial('plaster'), fl = makeMaterial('woodPlank'), parts = [], [ww, wh] = win, zf = d / 2;
  const B = (m, sx, sy, sz, x, y, z) => { const g = new THREE.BoxGeometry(sx, sy, sz, segs(lod, 1, 1, 2, 4, 8), segs(lod, 1, 1, 2, 4, 8), 1); g.translate(x, y, z); parts.push([g, m]); };
  B(fl, w, 0.06, d, 0, 0.03, 0); B(pl, w + 2 * wallT, 0.18, d + 2 * wallT, 0, H + 0.09, 0);          // podlaha, strop
  B(pl, wallT, H, d, -w / 2 - wallT / 2, H / 2, 0); B(pl, wallT, H, d, w / 2 + wallT / 2, H / 2, 0);   // boční stěny
  if (!open) B(pl, w + 2 * wallT, H, wallT, 0, H / 2, -zf - wallT / 2);
  // čelní stěna s oknem: pod parapetem, nad nadpražím, vlevo a vpravo
  const z = zf + wallT / 2, top = sill + wh, side = (w + 2 * wallT - ww) / 2;
  B(pl, w + 2 * wallT, sill, wallT, 0, sill / 2, z); B(pl, w + 2 * wallT, H - top, wallT, 0, top + (H - top) / 2, z);
  B(pl, side, wh, wallT, -(ww + side) / 2, sill + wh / 2, z); B(pl, side, wh, wallT, (ww + side) / 2, sill + wh / 2, z);
  const fr = std(0xe8e6df, 0.6, 0, 'frame');
  B(fr, ww, 0.05, 0.08, 0, sill + 0.025, z); B(fr, ww, 0.05, 0.08, 0, top - 0.025, z); B(fr, 0.05, wh, 0.08, -ww / 2 + 0.025, sill + wh / 2, z); B(fr, 0.05, wh, 0.08, ww / 2 - 0.025, sill + wh / 2, z);
  const g = mergeByMaterial(parts, 'room'); g.userData = { window: { cx: 0, cy: sill + wh / 2, w: ww, h: wh, z: zf + wallT }, front: zf + wallT, H, w, d, wallT };
  return g;
}
/** Volně stojící omítnutá zeď w × h (tloušťka t), střed paty v počátku, líc do +Z. */
export function wall({ lod = 2, w = 4, h = 3, t = 0.3, mat = 'plaster' }) {
  const g = new THREE.BoxGeometry(w, h, t, segs(lod, 1, 2, 4, 8, 16), segs(lod, 1, 2, 4, 8, 16), 1); g.translate(0, h / 2, 0);
  const grp = new THREE.Group(); grp.add(mesh(g, makeMaterial(mat), { name: 'wall' })); grp.userData = { w, h, t };
  return grp;
}

// ------------------------------------------------------------------------------------------- litý disk, propan, pyrotechnika, kovy
/** Litý hliníkový disk 16″ naležato. userData.char = stav plechu; tavení řeší scénář (zmenšení + louže). */
export function aluWheel({ lod = 2 }) {
  const m = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.32, metalness: 0.95, name: 'alu' });
  const rs = segs(lod, 8, 14, 28, 64, 160), parts = [];
  parts.push([lathe([[0.17, 0], [0.205, 0.0], [0.212, 0.015], [0.2, 0.03], [0.2, 0.17], [0.212, 0.185], [0.205, 0.2], [0.185, 0.2], [0.185, 0.17], [0.18, 0.05], [0.17, 0.03]], rs), m]);
  parts.push([new THREE.CylinderGeometry(0.055, 0.06, 0.05, rs).translate(0, 0.16, 0), m]);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.2832, g = new THREE.BoxGeometry(0.14, 0.022, 0.045); g.translate(0.115, 0.165, 0); g.rotateY(a); parts.push([g, m]); }
  const g = mergeByMaterial(parts, 'aluWheel'); g.userData = { R: 0.21, H: 0.2, mat: m };
  return g;
}
/** Louže ztuhlého hliníku: plochý nepravidelný disk o poloměru R (roste měřítkem). */
export function meltPuddle({ lod = 2, R = 0.4, seed = 7 }) {
  const g = blob(1, segs(lod, 1, 2, 3, 4, 5), seed, 0.35, [1, 0.03, 1]);
  const m = new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.22, metalness: 1, name: 'aluMelt', emissive: 0x000000 });
  const o = mesh(g, m, { name: 'puddle' }); o.scale.setScalar(0.001); o.userData = { R, mat: m };
  return o;
}
/** Láhev propan-butanu 10 kg s hořákem na hadici (hořák míří vzhůru šikmo). userData.nozzle = ústí hořáku, valve = ventil. */
export function propaneCylinder({ lod = 2, burner = true }) {
  const m = makeMaterial('steel'); m.color = new THREE.Color(0x8d99a6); m.name = 'lpg';
  const u = applyChar(m, { scale: 5, metal: true }); u.uCharBase.value = 0; u.uCharH.value = 0.6; u.uHeatFall.value = 0.2;
  const g = new THREE.Group(), rs = segs(lod, 8, 12, 24, 56, 140), gm = gunMetal();
  g.add(mesh(lathe([[0, 0.03], [0.13, 0.03], [0.15, 0.06], [0.152, 0.1], [0.152, 0.42], [0.14, 0.5], [0.09, 0.55], [0.03, 0.57], [0, 0.57]], rs), m, { name: 'shell' }));
  g.add(mesh(lathe([[0.12, 0], [0.135, 0], [0.135, 0.04], [0.12, 0.04]], rs), m, { name: 'foot' }));
  g.add(mesh(lathe([[0.1, 0.52], [0.11, 0.52], [0.11, 0.64], [0.1, 0.64]], rs, Math.PI * 1.5), m, { name: 'collar' }));
  g.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.06, Math.max(6, rs >> 1)).translate(0, 0.6, 0), std(0xa8842e, 0.35, 0.9, 'brass'), { name: 'valve' }));
  const ud = { char: u, H: 0.57, R: 0.152, valve: V3(0, 0.63, 0) };
  if (burner) {
    const pts = [V3(0.02, 0.6, 0), V3(0.25, 0.45, 0.1), V3(0.5, 0.06, 0.2), V3(0.9, 0.04, 0.1), V3(1.15, 0.3, 0)];
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs(lod, 6, 10, 20, 40, 80), 0.008, 6, false), std(0xd0651a, 0.8, 0, 'hose'), { name: 'hose' }));
    g.add(mesh(tube(V3(1.15, 0.3, 0), V3(1.3, 0.62, 0), 0.01, 0.01, 6), gm, { name: 'lance' }));
    g.add(mesh(tube(V3(1.3, 0.62, 0), V3(1.34, 0.72, 0), 0.02, 0.03, Math.max(6, rs >> 1), 1, true), gm, { name: 'burner' }));
    for (const [x, z] of [[1.0, -0.2], [1.0, 0.2], [1.4, 0]]) g.add(mesh(tube(V3(1.22, 0.45, 0), V3(x, 0, z), 0.008, 0.008, 5), gm, { name: 'leg' }));
    ud.nozzle = V3(1.345, 0.73, 0); ud.dir = V3(0.37, 0.93, 0).normalize();
  }
  g.userData = ud; return g;
}
/** Odpalovací trubky (moždíře) v dřevěném stojanu: n trubek ráže cal [mm]. userData.tubes = ústí. */
export function mortarRack({ lod = 2, n = 3, cal = 100 }) {
  const wood = makeMaterial('woodPlank'), hd = std(0x1c1c1e, 0.7, 0.1, 'hdpe'), parts = [], r = cal / 2000 + 0.006, L = cal * 0.006 + 0.2, tubes = [];
  for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * (2 * r + 0.08); parts.push([tube(V3(x, 0.05, 0), V3(x, 0.05 + L, 0), r, r, segs(lod, 8, 10, 18, 40, 96), 1, true), hd]); tubes.push(V3(x, 0.06 + L, 0)); }
  const W = n * (2 * r + 0.08) + 0.1;
  box(parts, wood, W, 0.05, 0.4, 0, 0.025, 0); box(parts, wood, W, 0.06, 0.03, 0, L * 0.5, r + 0.03); box(parts, wood, W, 0.06, 0.03, 0, L * 0.5, -r - 0.03);
  const g = mergeByMaterial(parts, 'mortarRack'); g.userData = { tubes, L };
  return g;
}
/** Květináč s termitem na ocelové desce na cihlách. userData.top = hladina směsi, plate = deska (stav plechu). */
export function thermitePot({ lod = 2 }) {
  const terra = std(0xa9542d, 0.9, 0, 'terracotta'), mix = std(0x5a3626, 1, 0, 'thermite'), brick = makeMaterial('brick'), g = new THREE.Group(), rs = segs(lod, 8, 12, 24, 56, 140);
  const st = makeMaterial('steel'); st.name = 'plate'; const u = applyChar(st, { scale: 7, metal: true }); u.uCharBase.value = 0; u.uCharH.value = 0.5; u.uSoot.value = 0;
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.008, 0.5).translate(0, 0.134, 0), st, { name: 'plate' }));
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.065, 0.2).translate(x, 0.0325, z), brick, { name: 'brick' }), mesh(new THREE.BoxGeometry(0.1, 0.065, 0.2).translate(x, 0.0975, z), brick, { name: 'brick' }));
  const pot = lathe([[0.012, 0.55], [0.05, 0.55], [0.085, 0.69], [0.092, 0.69], [0.092, 0.7], [0.078, 0.7], [0.045, 0.565], [0.012, 0.565]], rs); g.add(mesh(pot, terra, { name: 'pot' }));
  g.add(mesh(new THREE.CylinderGeometry(0.072, 0.05, 0.1, rs).translate(0, 0.62, 0), mix, { name: 'mix' }));
  for (const [x, z] of [[-0.11, -0.11], [0.11, -0.11], [0, 0.14]]) g.add(mesh(tube(V3(x * 0.6, 0.6, z * 0.6), V3(x * 1.6, 0.138, z * 1.6), 0.006, 0.006, 5), gunMetal(), { name: 'stand' }));
  g.userData = { top: V3(0, 0.68, 0), drip: V3(0, 0.54, 0), plateY: 0.14, char: u };
  return g;
}
/** Pytel mouky 25 kg (nebo hromada prachu) – měkký tvar. */
export function sack({ lod = 2, seed = 5 }) {
  const g = blob(0.3, segs(lod, 1, 2, 3, 4, 5), seed, 0.12, [1.25, 0.55, 0.8]); g.translate(0, 0.16, 0);
  const o = new THREE.Group(); o.add(mesh(g, std(0xd9cfb4, 0.95, 0, 'sack'), { name: 'sack' })); o.userData = { mass: 25 };
  return o;
}
/** Postava 1,8 m jako měřítko (šedá figurína). */
export function figure({ lod = 2 }) {
  const m = std(0x6f747a, 0.85, 0, 'figure'), parts = [], rs = segs(lod, 5, 8, 12, 20, 32);
  parts.push([new THREE.SphereGeometry(0.11, rs, rs).translate(0, 1.69, 0), m]);
  parts.push([new THREE.CapsuleGeometry(0.17, 0.42, 2, rs).translate(0, 1.25, 0), m]);
  for (const s of [-1, 1]) { parts.push([new THREE.CapsuleGeometry(0.075, 0.72, 2, rs).translate(s * 0.1, 0.44, 0), m]); parts.push([new THREE.CapsuleGeometry(0.055, 0.55, 2, rs).translate(s * 0.26, 1.2, 0), m]); }
  const g = mergeByMaterial(parts, 'figure'); g.userData = { H: 1.8 };
  return g;
}
