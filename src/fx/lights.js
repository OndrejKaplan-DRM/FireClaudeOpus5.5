// Světla ohně: pevný bazén PointLight (stálý počet = žádné překládání shaderů), požadavky se slučují podle důležitosti.
import * as THREE from 'three';
import { LAYER_SHADOW } from '../engine/pipeline.js';
import { blackbody } from '../physics/blackbody.js';
import { PRE } from './shared.js';

const bbCache = new Map();
export function bbRGB(T) {
  const k = Math.round(T / 25) * 25;
  if (!bbCache.has(k)) { const c = blackbody(k).rgb; const m = Math.max(...c); bbCache.set(k, c.map((v) => v / m)); }
  return bbCache.get(k);
}

export class FireLights {
  constructor(scene, tier) {
    this.scene = scene; this.pool = []; this.req = [];
    this.setTier(tier);
  }
  setTier(tier) {
    for (const l of this.pool) if (l.isObject3D) this.scene.remove(l);
    this.pool = [];
    // lightObjects === false: virtuální světla (jen seznam pro podsvícení kouře a pro hostitele – xEngine svítí po vrcholech)
    this.virtual = tier.lightObjects === false;
    for (let i = 0; i < tier.lights; i++) {
      if (this.virtual) { this.pool.push({ intensity: 0, position: new THREE.Vector3(), color: new THREE.Color(), userData: {} }); continue; }
      const L = new THREE.PointLight(0xffaa66, 0, 0, 2);
      if (tier.shadows && i < 1) {
        L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.002; L.shadow.normalBias = 0.02; L.shadow.radius = 6;
        // dosah stínu 80 m (dál je oheň jen bod, stín nečitelný); vrstva LAYER_SHADOW = levné náhrady porostu (iterace 5)
        L.shadow.camera.near = 0.05; L.shadow.camera.far = 80; L.shadow.camera.layers.set(0); L.shadow.camera.layers.enable(LAYER_SHADOW);
      }
      this.scene.add(L); this.pool.push(L);
    }
    this.tier = tier;
  }
  begin() { this.req.length = 0; }
  /** I [cd], T [K], r = poloměr zdroje (proti singularitě), pos */
  /** k [1/m] = extinkce kouře vlastního sloupce (stínění podsvícení kouře výš ve sloupci) */
  add(x, y, z, I, T, r = 0.3, k = 0) { if (I > 0) this.req.push({ x, y, z, I, T, r, k }); }
  end(camera) {
    const reqs = this.req, n = this.pool.length;
    const cp = camera.position;
    // důležitost ~ I / d²; nadbytečné sloučit do nejbližšího silnějšího (vážený střed)
    reqs.forEach((q) => { const d2 = (q.x - cp.x) ** 2 + (q.y - cp.y) ** 2 + (q.z - cp.z) ** 2; q.w = q.I / (d2 + 1); });
    reqs.sort((a, b) => b.w - a.w);
    const keep = reqs.slice(0, n);
    for (let i = n; i < reqs.length; i++) {
      const q = reqs[i]; let best = 0, bd = 1e30;
      keep.forEach((k, j) => { const d = (k.x - q.x) ** 2 + (k.y - q.y) ** 2 + (k.z - q.z) ** 2; if (d < bd) { bd = d; best = j; } });
      const k = keep[best]; if (!k) continue;
      const s = k.I + q.I;
      k.x = (k.x * k.I + q.x * q.I) / s; k.y = (k.y * k.I + q.y * q.I) / s; k.z = (k.z * k.I + q.z * q.I) / s;
      k.T = (k.T * k.I + q.T * q.I) / s; k.r = Math.max(k.r, Math.sqrt(bd) * 0.5); k.I = s; k.k = Math.max(k.k || 0, q.k || 0);
    }
    this.active = [];
    for (let i = 0; i < n; i++) {
      const L = this.pool[i], q = keep[i];
      if (!q) { L.intensity = 0; L.userData.I = 0; continue; }
      L.position.set(q.x, q.y, q.z); L.userData.I = q.I; L.intensity = q.I * PRE.value;
      const c = bbRGB(q.T * 1.28); L.color.setRGB(c[0], c[1], c[2]); // barevná teplota sazového plamene (viz sootColor)
      this.active.push({ on: true, x: q.x, y: q.y, z: q.z, I: q.I, r: q.r, c, k: q.k || 0, T: q.T });
    }
    return this.active;
  }
  /** Před-expozice těsně před kreslením (intenzita = I [cd] × expozice) */
  applyPre(on = true) { for (const L of this.pool) L.intensity = on ? (L.userData.I || 0) * PRE.value : 0; }
  /** Odhad osvětlení v bodě (pro auto-expozici) [lx] */
  illuminanceAt(p) {
    let E = 0;
    for (const a of this.active || []) { const d2 = (a.x - p.x) ** 2 + (a.y - p.y) ** 2 + (a.z - p.z) ** 2; E += a.I / (d2 + a.r * a.r); }
    return E;
  }
}
