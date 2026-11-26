// Vegetace: borovice/smrk a keř (LOD 0–4) + instancovaný les/křoviny s per-instanční ohořelostí (atribut aChar).
import * as THREE from 'three';
import { segs, noise3, tube, mergeGeometries } from './geo.js';
import { makeMaterial } from './textures.js';
import { applyChar } from '../fx/char.js';
import { mulberry32 } from '../engine/rng.js';

function strip(g) { const c = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k); return c; }

/** Geometrie stromu: kmen + přesleny (kužely) jehličí. Vrací { trunk, crown } normované na výšku 1 (škáluje se instancí). */
export function pineGeometry(lod, seed = 1) {
  const n = noise3(seed), r = mulberry32(seed);
  const radial = segs(lod, 4, 7, 14, 40, 120), hs = segs(lod, 1, 3, 10, 30, 90);
  const trunk = tube(new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0, 0.98, 0), 0.025, 0.004, Math.max(4, radial >> 1), hs);
  const layers = segs(lod, 2, 4, 7, 10, 14);
  const crowns = [];
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1 || 1);
    const y0 = 0.25 + t * 0.62, h = 0.32 - t * 0.12, rad = 0.2 * (1 - t * 0.75) + 0.03;
    const g = new THREE.ConeGeometry(rad, h, radial, Math.max(1, hs >> 1), true);
    g.translate(0, y0 + h / 2, 0);
    const p = g.attributes.position;
    for (let q = 0; q < p.count; q++) {
      const x = p.getX(q), y = p.getY(q), z = p.getZ(q), a = Math.atan2(z, x);
      const k = 1 + 0.25 * n.fbm(Math.cos(a) * 2 + i, y * 8, Math.sin(a) * 2, 3) + (lod >= 2 ? 0.12 * Math.sin(a * 7 + i) : 0);
      p.setXYZ(q, x * k, y - (1 - (y - y0) / h) * 0.03 * r(), z * k);
    }
    g.computeVertexNormals();
    crowns.push(strip(g));
  }
  // spodní uschlé větve (L2+)
  if (lod >= 2) for (let i = 0; i < 6; i++) {
    const a = r() * 6.28, y = 0.12 + r() * 0.15;
    crowns.push(strip(tube(new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(a) * 0.12, y + 0.03, Math.sin(a) * 0.12), 0.004, 0.001, 4, 1)));
  }
  return { trunk: strip(trunk), crown: mergeGeometries(crowns, false) };
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
  const { trunk, crown } = pineGeometry(lod, seed);
  const bark = makeMaterial('bark'); bark.name = 'bark';
  const nee = makeMaterial('needles', { side: THREE.DoubleSide }); nee.name = 'needles';
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
 * Instancovaný porost se dvěma LOD (blízko/daleko) a per-instanční ohořelostí.
 * items: [{x, z, s, rot}] ; kind: 'pine' | 'bush'
 */
export class InstancedFlora {
  constructor(scene, kind, items, { lodNear = 2, lodFar = 0, nearDist = 40, seed = 1 } = {}) {
    this.scene = scene; this.items = items; this.nearDist = nearDist;
    const gen = kind === 'pine' ? pineGeometry : bushGeometry;
    const mk = (lod) => gen(lod, seed);
    const near = mk(lodNear), far = mk(lodFar);
    const barkM = makeMaterial('bark'); barkM.name = kind + '-bark';
    const leafM = makeMaterial(kind === 'pine' ? 'needles' : 'leaves', { side: THREE.DoubleSide }); leafM.name = kind + '-leaf';
    applyChar(barkM, { instanced: true, scale: 10 }); applyChar(leafM, { instanced: true, scale: 10 });
    const N = items.length;
    this.aChar = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2); this.aChar.setUsage(THREE.DynamicDrawUsage);
    this.meshes = [];
    for (const [lvl, geo] of [['near', near], ['far', far]]) for (const [part, mat] of [['trunk', barkM], ['crown', leafM]]) {
      const g = geo[part].clone(); g.setAttribute('aChar', this.aChar);
      const m = new THREE.InstancedMesh(g, mat, N); m.castShadow = lvl === 'near'; m.receiveShadow = true; m.frustumCulled = false;
      m.userData = { lvl, part }; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m); this.meshes.push(m);
    }
    this.mats = []; const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const it of items) this.mats.push(mm.compose(new THREE.Vector3(it.x, 0, it.z), q.setFromAxisAngle(up, it.rot || 0), new THREE.Vector3(it.s, it.s * (it.sy || 1), it.s)).clone());
    // atribut aChar je sdílený a indexovaný instancí – pořadí instancí se nemění, jen počet podle LOD → přeskládáme matice
    this.order = { near: new Uint32Array(N), far: new Uint32Array(N) };
    this.charState = new Float32Array(N * 2);
    this.lastUpd = -1;
  }
  setChar(i, c, glow) { this.charState[i * 2] = c; this.charState[i * 2 + 1] = glow; }
  update(camera, time) {
    // LOD přeskládání po 0,25 s
    if (time - this.lastUpd > 0.25 || this.lastUpd < 0) {
      this.lastUpd = time;
      let nn = 0, nf = 0; const cp = camera.position;
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i], d2 = (it.x - cp.x) ** 2 + (it.z - cp.z) ** 2;
        if (d2 < this.nearDist * this.nearDist) this.order.near[nn++] = i; else this.order.far[nf++] = i;
      }
      this.nn = nn; this.nf = nf;
      for (const m of this.meshes) {
        const ord = m.userData.lvl === 'near' ? this.order.near : this.order.far, cnt = m.userData.lvl === 'near' ? nn : nf;
        for (let k = 0; k < cnt; k++) m.setMatrixAt(k, this.mats[ord[k]]);
        m.count = cnt; m.instanceMatrix.needsUpdate = true;
      }
    }
    // aChar: per-mesh vlastní pole (pořadí se liší pro near/far)
    for (const m of this.meshes) {
      const ord = m.userData.lvl === 'near' ? this.order.near : this.order.far, cnt = m.count;
      let a = m.geometry.attributes.aChar;
      if (a === this.aChar) { a = new THREE.InstancedBufferAttribute(new Float32Array(this.items.length * 2), 2); a.setUsage(THREE.DynamicDrawUsage); m.geometry.setAttribute('aChar', a); }
      for (let k = 0; k < cnt; k++) { const i = ord[k]; a.array[k * 2] = this.charState[i * 2]; a.array[k * 2 + 1] = this.charState[i * 2 + 1]; }
      a.needsUpdate = true;
    }
  }
  tris() { let t = 0; for (const m of this.meshes) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * m.count; return Math.round(t); }
  dispose() { for (const m of this.meshes) { this.scene.remove(m); m.geometry.dispose(); } }
}
