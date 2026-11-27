// Vegetace: borovice/smrk a keř (LOD 0–4) + instancovaný les/křoviny s per-instanční ohořelostí (atribut aChar).
import * as THREE from 'three';
import { segs, noise3, tube, mergeGeometries } from './geo.js';
import { makeMaterial } from './textures.js';
import { applyChar } from '../fx/char.js';
import { mulberry32 } from '../engine/rng.js';
import { LAYER_SHADOW } from '../engine/pipeline.js';

function strip(g) { const c = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k); return c; }

/** Geometrie stromu: kmen + přesleny (kužely) jehličí. Vrací { trunk, crown } normované na výšku 1 (škáluje se instancí). */
/** Textura karty jehličí (alfa): vlevo plný pruh kůry větví (u < 0,1), vpravo větvička s páry jehlic na průhledném pozadí. */
let _needleTex = null;
export function needleCardTexture() {
  if (_needleTex) return _needleTex;
  if (typeof document === 'undefined') return null;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), r = mulberry32(11);
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#3b2b1d'; g.fillRect(0, 0, S * 0.1, S);                         // kůra větví
  const x0 = S * 0.12, w = S * 0.88;
  for (let k = 0; k < 3; k++) {                                                    // 3 výhonky vedle sebe
    const cx = x0 + w * (0.2 + 0.3 * k + (r() - 0.5) * 0.08);
    g.strokeStyle = '#4a3a22'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(cx, S * 0.98); g.lineTo(cx + (r() - 0.5) * 8, S * 0.05); g.stroke();
    for (let i = 0; i < 70; i++) {                                                 // borovice: jehlice v párech, 4–7 cm, šikmo dopředu
      const t = 0.04 + 0.92 * (i / 70), y = S * (0.98 - 0.93 * t), side = i % 2 ? 1 : -1;
      const L = S * (0.13 + 0.07 * r()) * (1 - 0.35 * t), a = side * (0.55 + 0.35 * r()) - Math.PI / 2;
      const c = [20 + 30 * r(), 55 + 40 * r(), 25 + 25 * r()].map((v) => v | 0);
      g.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.lineWidth = 1.6 + r();
      g.beginPath(); g.moveTo(cx, y); g.lineTo(cx + Math.cos(a) * L, y + Math.sin(a) * L * 0.9); g.stroke();
    }
  }
  _needleTex = new THREE.CanvasTexture(cv); _needleTex.colorSpace = THREE.SRGBColorSpace; _needleTex.anisotropy = 4;
  return _needleTex;
}
/** Materiál korun z karet (LOD ≥ 2): alfa ořez, oboustranný. */
export function needleCardMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: needleCardTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  m.name = 'needle-cards';
  return m;
}

/** Přemapuje UV válce větve do pruhu kůry v textuře karet (u < 0,1). */
function barkStripUV(g) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 0.02 + uv.getX(i) * 0.06); return g; }

/**
 * Geometrie stromu normovaná na výšku 1 (škáluje se instancí). Vrací { trunk, crown, cards }.
 * LOD 0–1: přesleny kuželů (daleko). LOD 2+: přesleny větví s kartami jehličí (alfa) – zblízka čitelné větve a mezery
 * v koruně jako na fotkách borových porostů (iterace 5). Koruna lesní borovice zabírá horních ~60 % výšky ★3.
 */
export function pineGeometry(lod, seed = 1) {
  const n = noise3(seed), r = mulberry32(seed);
  const radial = segs(lod, 4, 7, 14, 40, 120), hs = segs(lod, 1, 3, 10, 30, 90);
  const cards = lod >= 2;
  const trunk = tube(new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0, 0.98, 0), 0.016, 0.003,
    cards ? segs(lod, 4, 6, 8, 10, 16) : Math.max(4, radial >> 1), cards ? segs(lod, 1, 2, 6, 10, 20) : hs); // DBH ≈ 3 % výšky ★3
  const crowns = [];
  if (!cards) {
    const layers = segs(lod, 2, 4);
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1 || 1);
      const y0 = 0.25 + t * 0.62, h = 0.32 - t * 0.12, rad = 0.2 * (1 - t * 0.75) + 0.03;
      const g = new THREE.ConeGeometry(rad, h, radial, Math.max(1, hs >> 1), true);
      g.translate(0, y0 + h / 2, 0);
      const p = g.attributes.position;
      for (let q = 0; q < p.count; q++) {
        const x = p.getX(q), y = p.getY(q), z = p.getZ(q), a = Math.atan2(z, x);
        const k = 1 + 0.25 * n.fbm(Math.cos(a) * 2 + i, y * 8, Math.sin(a) * 2, 3);
        p.setXYZ(q, x * k, y - (1 - (y - y0) / h) * 0.03 * r(), z * k);
      }
      g.computeVertexNormals();
      crowns.push(strip(g));
    }
    return { trunk: strip(trunk), crown: mergeGeometries(crowns, false) };
  }
  // --- karty: přesleny větví
  const whorls = segs(lod, 0, 0, 8, 11, 15), perW = segs(lod, 0, 0, 5, 6, 8), clumps = segs(lod, 0, 0, 3, 5, 7);
  const pos = [], nor = [], uvs = [], idx = [];
  const quad = (a, b, c, d, nrm) => { // a,b na bázi; c,d na špičce
    const o = pos.length / 3;
    for (const [v, u, vv] of [[a, 0.12, 0], [b, 1, 0], [d, 1, 1], [c, 0.12, 1]]) { pos.push(v.x, v.y, v.z); nor.push(nrm.x, nrm.y, nrm.z); uvs.push(u, vv); }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const branches = [];
  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1), y = 0.4 + t * 0.55;
    const Lb = (0.21 * Math.pow(1 - t, 0.8) + 0.035) * (0.85 + 0.3 * r());
    const a0 = r() * 6.28;
    for (let j = 0; j < perW; j++) {
      const a = a0 + (j / perW) * 6.283 + (r() - 0.5) * 0.5;
      const d = new THREE.Vector3(Math.cos(a), -0.12 + 0.45 * t + (r() - 0.5) * 0.2, Math.sin(a)).normalize();
      const p0 = new THREE.Vector3(0, y, 0), p1 = p0.clone().addScaledVector(d, Lb);
      p1.y -= 0.03 * Lb / 0.2 * (1 - t);                                            // prověšení konce
      branches.push(barkStripUV(strip(tube(p0, p1, 0.0045 * (1 - 0.6 * t) + 0.0015, 0.001, 4, 1))));
      const dir = p1.clone().sub(p0).normalize(), side = tmp.crossVectors(dir, up).normalize().clone(), side2 = new THREE.Vector3().crossVectors(side, dir).normalize();
      const nrm = new THREE.Vector3(dir.x, 0.8, dir.z).normalize();               // listová normála „ven a nahoru“ (měkké světlo)
      for (let k = 0; k < clumps; k++) {
        const f = 0.25 + 0.75 * (k / Math.max(1, clumps - 1)), b = p0.clone().lerp(p1, f * 0.85);
        const lc = Lb * (0.38 + 0.15 * r()), wc = lc * (0.6 + 0.2 * r());
        const tip = b.clone().addScaledVector(dir, lc).add(new THREE.Vector3((r() - 0.5) * 0.02, 0.02 * r(), (r() - 0.5) * 0.02));
        for (const sv of [side, side2]) {
          const h = sv.clone().multiplyScalar(wc * 0.5);
          quad(b.clone().sub(h), b.clone().add(h), tip.clone().sub(h), tip.clone().add(h), nrm);
        }
      }
    }
  }
  // vršek: svislé karty
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * 3.14, sv = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.035);
    const b = new THREE.Vector3(0, 0.9, 0), tp = new THREE.Vector3(0, 1.01, 0);
    quad(b.clone().sub(sv), b.clone().add(sv), tp.clone().sub(sv), tp.clone().add(sv), up);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); cg.setIndex(idx);
  const crown = mergeGeometries([...branches, strip(cg)], false);
  // spodní uschlé větve (bez jehličí)
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28, y = 0.15 + r() * 0.22, L = 0.05 + 0.05 * r();
    crowns.push(strip(tube(new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(a) * L, y + 0.01 - 0.02 * r(), Math.sin(a) * L), 0.0022, 0.0006, 5, 1)));
  }
  return { trunk: mergeGeometries([strip(trunk), ...crowns], false), crown, cards: true };
}

export function bushGeometry(lod, seed = 2) {
  const n = noise3(seed), r = mulberry32(seed);
  const det = segs(lod, 0, 1, 3, 5, 7);
  const blobs = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.IcosahedronGeometry(0.32 + r() * 0.12, det);
    const p = g.attributes.position;
    for (let q = 0; q < p.count; q++) {
      const x = p.getX(q), y = p.getY(q), z = p.getZ(q);
      const k = 1 + 0.45 * n.fbm(x * 4 + i, y * 4, z * 4, 4);
      p.setXYZ(q, x * k, Math.max(-0.05, y * k * 0.75), z * k);
    }
    g.computeVertexNormals();
    g.translate((r() - 0.5) * 0.45, 0.32 + r() * 0.12, (r() - 0.5) * 0.45);
    blobs.push(strip(g));
  }
  const stems = [];
  for (let i = 0; i < (lod >= 2 ? 7 : 2); i++) {
    const a = r() * 6.28;
    stems.push(strip(tube(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.3, 0.45 + r() * 0.2, Math.sin(a) * 0.3), 0.012, 0.004, 4, 1)));
  }
  return { trunk: mergeGeometries(stems, false), crown: mergeGeometries(blobs, false) };
}

export function pine({ lod = 2, seed = 1, height = 14 }) {
  const { trunk, crown, cards } = pineGeometry(lod, seed);
  const bark = makeMaterial('bark'); bark.name = 'bark';
  const nee = cards ? needleCardMaterial() : makeMaterial('needles', { side: THREE.DoubleSide }); nee.name = 'needles';
  const u1 = applyChar(bark, { scale: 10 }), u2 = applyChar(nee, { scale: 10 });
  const grp = new THREE.Group();
  const a = new THREE.Mesh(trunk, bark), b = new THREE.Mesh(crown, nee);
  a.castShadow = b.castShadow = true; grp.add(a, b); grp.scale.setScalar(height);
  grp.userData = { char: [u1, u2] };
  return grp;
}
export function bush({ lod = 2, seed = 2, size = 1.4 }) {
  const { trunk, crown } = bushGeometry(lod, seed);
  const tw = makeMaterial('bark'); tw.name = 'twigs';
  const lv = makeMaterial('leaves', { side: THREE.DoubleSide }); lv.name = 'leaves';
  const u1 = applyChar(tw, { scale: 10 }), u2 = applyChar(lv, { scale: 10 });
  const grp = new THREE.Group(); grp.add(new THREE.Mesh(trunk, tw), new THREE.Mesh(crown, lv)); grp.scale.setScalar(size);
  grp.userData = { char: [u1, u2] };
  return grp;
}

/**
 * Instancovaný porost se třemi prstenci LOD (blízko / střed / daleko) a per-instanční ohořelostí.
 * items: [{x, z, s, rot}] ; kind: 'pine' | 'bush'. nearFrac < 1 zapne střední prstenec (lodMid) mezi nearFrac·nearDist a nearDist.
 */
export class InstancedFlora {
  constructor(scene, kind, items, { lodNear = 2, lodMid = null, lodFar = 0, nearDist = 40, nearFrac = 1, seed = 1 } = {}) {
    this.scene = scene; this.items = items; this.nearDist = nearDist; this.rNear = nearDist * Math.min(1, nearFrac);
    const gen = kind === 'pine' ? pineGeometry : bushGeometry;
    const mk = (lod) => gen(lod, seed);
    const barkM = makeMaterial('bark'); barkM.name = kind + '-bark';
    const leafM = makeMaterial(kind === 'pine' ? 'needles' : 'leaves', { side: THREE.DoubleSide }); leafM.name = kind + '-leaf';
    applyChar(barkM, { instanced: true, scale: 10 }); applyChar(leafM, { instanced: true, scale: 10 });
    let cardM = null;
    const leafFor = (geo) => { if (!geo.cards) return leafM; if (!cardM) { cardM = needleCardMaterial(); applyChar(cardM, { instanced: true, scale: 10 }); } return cardM; };
    const N = items.length;
    this.aChar = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2); this.aChar.setUsage(THREE.DynamicDrawUsage);
    this.meshes = [];
    this.levels = nearFrac < 1 ? ['near', 'mid', 'far'] : ['near', 'far'];
    const lodOf = { near: lodNear, mid: lodMid ?? Math.max(lodFar, lodNear - 2), far: lodFar };
    for (const lvl of this.levels) {
      const geo = mk(lodOf[lvl]);
      for (const [part, mat] of [['trunk', barkM], ['crown', leafFor(geo)]]) {
        const g = geo[part].clone(); g.setAttribute('aChar', this.aChar);
        const m = new THREE.InstancedMesh(g, mat, N); m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;
        m.userData = { lvl, part }; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(m); this.meshes.push(m);
      }
    }
    // stín od ohně vrhají levné náhrady blízkých kusů (LOD o 2 níž, kužely) jen ve vrstvě stínové mapy: bodové světlo
    // kreslí stín 6× (stěny krychle) → dřív 3,6 M △ × 6 = 21 M △ na snímek u křoví T3 (iterace 5, D-034)
    const sh = mk(Math.min(1, Math.max(0, lodNear - 2))), shM = new THREE.MeshBasicMaterial();
    for (const part of ['trunk', 'crown']) {
      const m = new THREE.InstancedMesh(sh[part].clone(), shM, N); m.castShadow = true; m.frustumCulled = false;
      m.layers.set(LAYER_SHADOW); m.userData = { lvl: 'near', part, shadow: true }; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m); this.meshes.push(m);
    }
    this.mats = []; const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const it of items) this.mats.push(mm.compose(new THREE.Vector3(it.x, 0, it.z), q.setFromAxisAngle(up, it.rot || 0), new THREE.Vector3(it.s, it.s * (it.sy || 1), it.s)).clone());
    // atribut aChar je sdílený a indexovaný instancí – pořadí instancí se nemění, jen počet podle LOD → přeskládáme matice
    this.order = { near: new Uint32Array(N), mid: new Uint32Array(N), far: new Uint32Array(N) };
    this.cnt = { near: 0, mid: 0, far: 0 };
    this.charState = new Float32Array(N * 2);
    this.lastUpd = -1;
  }
  setChar(i, c, glow) { this.charState[i * 2] = c; this.charState[i * 2 + 1] = glow; }
  update(camera, time) {
    // LOD přeskládání po 0,25 s
    if (time - this.lastUpd > 0.25 || this.lastUpd < 0) {
      this.lastUpd = time;
      const cp = camera.position, rN2 = this.rNear ** 2, rM2 = this.nearDist ** 2, mid = this.levels.length === 3, c = { near: 0, mid: 0, far: 0 };
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i], d2 = (it.x - cp.x) ** 2 + (it.z - cp.z) ** 2;
        const l = d2 < rN2 ? 'near' : mid && d2 < rM2 ? 'mid' : 'far';
        this.order[l][c[l]++] = i;
      }
      this.cnt = c; this.nn = c.near; this.nf = c.far;
      for (const m of this.meshes) {
        const ord = this.order[m.userData.lvl], cnt = c[m.userData.lvl];
        for (let k = 0; k < cnt; k++) m.setMatrixAt(k, this.mats[ord[k]]);
        m.count = cnt; m.instanceMatrix.needsUpdate = true;
      }
    }
    // aChar: per-mesh vlastní pole (pořadí se liší podle prstence)
    for (const m of this.meshes) {
      if (m.userData.shadow) continue;
      const ord = this.order[m.userData.lvl], cnt = m.count;
      let a = m.geometry.attributes.aChar;
      if (a === this.aChar) { a = new THREE.InstancedBufferAttribute(new Float32Array(this.items.length * 2), 2); a.setUsage(THREE.DynamicDrawUsage); m.geometry.setAttribute('aChar', a); }
      for (let k = 0; k < cnt; k++) { const i = ord[k]; a.array[k * 2] = this.charState[i * 2]; a.array[k * 2 + 1] = this.charState[i * 2 + 1]; }
      a.needsUpdate = true;
    }
  }
  tris() { let t = 0; for (const m of this.meshes) if (!m.userData.shadow) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * m.count; return Math.round(t); }
  dispose() { for (const m of this.meshes) { this.scene.remove(m); m.geometry.dispose(); } }
}
