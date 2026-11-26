// Geometrické pomůcky pro procedurální modely: soustružení, posun podle šumu, slučování, počty trojúhelníků.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../engine/rng.js';

export { mergeGeometries };

/** Úroveň detailu → násobek segmentů. LOD 0..4 cílí na ~1e2, 1e3, 1e4, 1e5, 1e6 △ u „hrdinských" modelů. */
export const LOD_NAMES = ['L0 ~10²', 'L1 ~10³', 'L2 ~10⁴', 'L3 ~10⁵', 'L4 ~10⁶'];
export const segs = (lod, l0, ...more) => [l0, ...more][Math.min(lod, more.length)];

export function tris(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry; const c = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    n += c * (o.isInstancedMesh ? o.count : 1);
  });
  return Math.round(n);
}

/** 3D hodnotový šum pro posuny vrcholů (CPU, deterministický). */
export function noise3(seed = 1) {
  const r = mulberry32(seed), P = 64, perm = new Uint8Array(512), val = new Float32Array(P * P * P / 64);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const g = new Float32Array(256); for (let i = 0; i < 256; i++) g[i] = r() * 2 - 1;
  const h = (x, y, z) => g[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = sm(x - X), v = sm(y - Y), w = sm(z - Z);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h(X, Y, Z), h(X + 1, Y, Z), u), l(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u), v),
      l(l(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), l(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u), v), w);
  };
  n.fbm = (x, y, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += n(x * f, y * f, z * f) * a; a *= 0.5; f *= 2.03; } return s; };
  void val;
  return n;
}

/** Posun vrcholů ve směru normály: fn(x,y,z,nx,ny,nz) → délka posunu. */
export function displace(geo, fn) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, nrm = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    const d = fn(x, y, z, nx, ny, nz);
    p.setXYZ(i, x + nx * d, y + ny * d, z + nz * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Svaření švů (UV švy zachová, odstraní duplicitní pozice pro hladký posun) */
export function weld(geo) { const g = geo.index ? geo : mergeVertices(geo); return g; }

/** Soustružený profil [[r,y],...] s počtem segmentů. */
export function lathe(profile, seg, phi = Math.PI * 2) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg, 0, phi);
}

/** Válec mezi body a→b (pro větve, polena) */
export function tube(a, b, r0, r1, radial = 8, hseg = 1, open = false) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, hseg, open);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
  return g;
}

export function mesh(geo, mat, { cast = true, recv = true, name = '' } = {}) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; m.name = name;
  return m;
}

/** Sloučí seznam [geometrie, materiál] do jednoho Mesh se skupinami (méně draw callů). */
export function mergeByMaterial(parts, name = '') {
  const byMat = new Map();
  for (const [g, m] of parts) { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g.index ? g.toNonIndexed() : g); }
  const grp = new THREE.Group(); grp.name = name;
  for (const [m, gs] of byMat) {
    gs.forEach((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); });
    const merged = mergeGeometries(gs, false);
    grp.add(mesh(merged, m, { name: name + ':' + (m.name || 'mat') }));
  }
  return grp;
}

/** Box s posunutím (deformovaný), např. kámen nebo balík. */
export function blob(radius, detail, seed, rough = 0.25, stretch = [1, 1, 1]) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const n = noise3(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + rough * n.fbm(x / radius * 1.3 + seed, y / radius * 1.3, z / radius * 1.3, 4);
    p.setXYZ(i, x * k * stretch[0], y * k * stretch[1], z * k * stretch[2]);
  }
  g.computeVertexNormals();
  return g;
}
