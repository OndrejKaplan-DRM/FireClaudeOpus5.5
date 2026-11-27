// Trosky a střepiny: InstancedMesh s balistikou (odpor ∝ v², odrazy), rozžhavené úlomky chladnou (emise v instanceColor).
import * as THREE from 'three';
import { blackbody } from '../physics/blackbody.js';
import { mulberry32 } from '../engine/rng.js';
import { PRE, FLAMEK } from './shared.js';

function chunkGeo(seed) {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const r = mulberry32(seed), p = g.attributes.position;
  const sx = 0.6 + r(), sy = 0.3 + r() * 0.6, sz = 0.6 + r();
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * sx * (0.8 + r() * 0.4), p.getY(i) * sy * (0.8 + r() * 0.4), p.getZ(i) * sz * (0.8 + r() * 0.4));
  g.computeVertexNormals();
  return g;
}

export class Debris {
  constructor(scene, cap) {
    this.scene = scene; this.cap = cap; this.n = 0;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.8, metalness: 0.3 });
    this.mat.onBeforeCompile = (s) => {
      s.uniforms.uPreExp = PRE; s.uniforms.uFlameK = FLAMEK;
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uPreExp, uFlameK;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor * uFlameK * 0.4 * uPreExp;\n diffuseColor.rgb = vec3(0.12, 0.11, 0.1);\n#endif');
    };
    this.mesh = new THREE.InstancedMesh(chunkGeo(3), this.mat, Math.max(cap, 1));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(0, 0, 0));
    this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    if (cap <= 0) this.mesh.visible = false; // hostitel bez osvětlených materiálů (xEngine low, D-022)
    this.s = new Float32Array(Math.max(cap, 1) * 16);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._c = new THREE.Color();
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
  clear() { this.n = 0; this.mesh.count = 0; }
  /** o = { n, speed, size, hot (0..1), up (0..1 sklon nahoru), T } */
  burst(pos, o, r = Math.random) {
    for (let k = 0; k < o.n && this.n < this.cap; k++) {
      const i = this.n++, s = this.s, b = i * 16;
      const u = Math.max(-0.2, r() * 2 - 1) * (1 - (o.up ?? 0.5)) + (o.up ?? 0.5), a = r() * 6.283, sn = Math.sqrt(Math.max(0, 1 - u * u));
      const v = o.speed * (0.25 + 0.75 * r() ** 0.7);
      s[b] = pos.x; s[b + 1] = pos.y + 0.2; s[b + 2] = pos.z;
      s[b + 3] = Math.cos(a) * sn * v; s[b + 4] = Math.abs(u) * v; s[b + 5] = Math.sin(a) * sn * v;
      s[b + 6] = r() * 6; s[b + 7] = r() * 6; s[b + 8] = r() * 6;
      s[b + 9] = (r() - 0.5) * 20; s[b + 10] = (r() - 0.5) * 20; s[b + 11] = (r() - 0.5) * 20;
      s[b + 12] = o.size * (0.3 + 1.2 * r() ** 2);
      s[b + 13] = (o.hot ?? 0) > r() ? (o.T ?? 1300) : 0;
      s[b + 14] = 0; s[b + 15] = 0;
    }
  }
  update(dt, world) {
    const s = this.s, m = this._m;
    for (let i = 0; i < this.n; i++) {
      const b = i * 16, sz = s[b + 12];
      // odpor vzduchu: a = −k v |v|, k ~ 0,5 ρ Cd A / m ∝ 1/size
      const vx = s[b + 3], vy = s[b + 4], vz = s[b + 5], sp = Math.hypot(vx, vy, vz);
      const k = 0.06 / Math.max(sz, 0.005);
      const f = Math.max(0, 1 - k * sp * dt);
      if (s[b + 15] < 0.5) {
        s[b + 3] = vx * f; s[b + 4] = vy * f - 9.81 * dt; s[b + 5] = vz * f;
        s[b] += s[b + 3] * dt; s[b + 1] += s[b + 4] * dt; s[b + 2] += s[b + 5] * dt;
        s[b + 6] += s[b + 9] * dt; s[b + 7] += s[b + 10] * dt; s[b + 8] += s[b + 11] * dt;
        if (s[b + 1] < sz * 0.3) {
          s[b + 1] = sz * 0.3; s[b + 4] = -s[b + 4] * 0.3; s[b + 3] *= 0.5; s[b + 5] *= 0.5; s[b + 9] *= 0.5; s[b + 10] *= 0.5; s[b + 11] *= 0.5;
          if (Math.abs(s[b + 4]) < 0.6 && Math.hypot(s[b + 3], s[b + 5]) < 0.5) s[b + 15] = 1; // v klidu
        }
      }
      s[b + 14] += dt;
      // chladnutí + kouřová stopa horkých kusů
      let T = s[b + 13];
      if (T > 0) {
        T = 650 + (T - 650) * Math.exp(-s[b + 14] / (2 + sz * 20));
        if (s[b + 15] < 0.5 && world.layers.sparks && Math.random() < dt * 30) {
          world.sp.spawn({ x: s[b], y: s[b + 1], z: s[b + 2], vx: s[b + 3] * 0.2, vy: s[b + 4] * 0.2, vz: s[b + 5] * 0.2, life: 0.6, T: T, tauC: 0.3, size: sz * 0.15, drag: 0.3, grav: 0.2 });
        }
      }
      const c = T > 700 ? blackbody(T).rgb.map((v) => v * Math.min(1, Math.exp((T - 1300) / 160))) : [0, 0, 0];
      this._c.setRGB(c[0], c[1], c[2]); this.mesh.setColorAt(i, this._c);
      this._e.set(s[b + 6], s[b + 7], s[b + 8]); this._q.setFromEuler(this._e);
      m.compose(this._v.set(s[b], s[b + 1], s[b + 2]), this._q, new THREE.Vector3(sz, sz, sz));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
