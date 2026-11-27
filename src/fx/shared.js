// Sdílené GPU zdroje: 3D šumová textura (vlastní periodický gradientní + Worleyho šum), LUT černého tělesa, GLSL knihovna.
import * as THREE from 'three';
import { blackbodyLUT } from '../physics/blackbody.js';
import { mulberry32 } from '../engine/rng.js';

export const BB_GAMMA = 0.3; // vizuální komprese jasu (umělecké; viz DECISIONS D-005)

let _noise = null, _bb = null;
/** Před-expozice (Frostbite): všechna emise a světla se násobí aktuální expozicí → HDR buffer nepřeteče (HalfFloat ≤ 65 504). */
export const PRE = { value: 1 };
/** Jas plamene po lokální adaptaci [cd/m² při 1500 K] – sdílený všemi emisními materiály. */
export const FLAMEK = { value: 12000 };
/** Globální čas efektů [s] (dýchání žhavých uhlíků, mihotání) – jediná uniforma pro všechny materiály. */
export const GTIME = { value: 0 };

/** Periodický 3D gradientní šum (vlastní implementace Perlinova principu) + Worley, perioda = textura. */
export function noiseTexture(N = 64, seed = 7) {
  if (_noise) return _noise;
  const rnd = mulberry32(seed);
  const P = 8; // mřížka gradientů na periodu (2 oktávy uvnitř)
  const grads = (p) => { const g = new Float32Array(p * p * p * 3); for (let i = 0; i < p * p * p; i++) { const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z); g.set([r * Math.cos(a), r * Math.sin(a), z], i * 3); } return g; };
  const G1 = grads(P), G2 = grads(P * 2);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function perlin(G, p, x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    let v = 0;
    const u = fade(xf), w = fade(yf), q = fade(zf);
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      const gi = ((((xi + dx) % p) + p) % p) + p * (((((yi + dy) % p) + p) % p) + p * ((((zi + dz) % p) + p) % p));
      const d = G[gi * 3] * (xf - dx) + G[gi * 3 + 1] * (yf - dy) + G[gi * 3 + 2] * (zf - dz);
      v += d * (dx ? u : 1 - u) * (dy ? w : 1 - w) * (dz ? q : 1 - q);
    }
    return v;
  }
  // Worley body
  const C = 6, pts = new Float32Array(C * C * C * 3);
  for (let i = 0; i < C * C * C; i++) pts.set([rnd(), rnd(), rnd()], i * 3);
  function worley(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let m = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, cz = zi + k;
      const id = (((cx % C) + C) % C) + C * ((((cy % C) + C) % C) + C * (((cz % C) + C) % C));
      const dx = cx + pts[id * 3] - x, dy = cy + pts[id * 3 + 1] - y, dz = cz + pts[id * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz; if (d < m) m = d;
    }
    return Math.sqrt(m);
  }
  const data = new Uint8Array(N * N * N * 4);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const sx = x / N, sy = y / N, sz = z / N;
    const a = (perlin(G1, P, sx * P, sy * P, sz * P) * 0.7 + perlin(G2, P * 2, sx * P * 2, sy * P * 2, sz * P * 2) * 0.35) * 2.2; // kontrast: σ ≈ 0,17 v [0,1]
    const wv = 1 - worley(sx * C, sy * C, sz * C);
    const w2 = 1 - worley(sx * C * 2 + 0.31, sy * C * 2 + 0.17, sz * C * 2 + 0.53);
    const i = (x + N * (y + N * z)) * 4;
    data[i] = Math.max(0, Math.min(255, (a * 0.5 + 0.5) * 255));
    data[i + 1] = Math.max(0, Math.min(255, (wv * 0.65 + w2 * 0.35) * 255));
    data[i + 2] = Math.max(0, Math.min(255, rnd() * 255));
    data[i + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1; t.needsUpdate = true;
  _noise = t;
  return t;
}

export function bbTexture() {
  if (_bb) return _bb;
  const { data, N, Tmin, Tmax } = blackbodyLUT(256, 500, 3500);
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const t = new THREE.DataTexture(half, N, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  t.userData = { Tmin, Tmax };
  _bb = t;
  return t;
}

export function sharedUniforms() {
  const bb = bbTexture();
  return {
    tNoise: { value: noiseTexture() },
    tBB: { value: bb },
    uBB: { value: new THREE.Vector3(bb.userData.Tmin, bb.userData.Tmax, BB_GAMMA) },
    uPreExp: PRE,
    uFlameK: FLAMEK,
    uGTime: GTIME,
  };
}

export const GLSL_COMMON = /* glsl */`
uniform highp sampler3D tNoise;
uniform float uGTime;
uniform sampler2D tBB;
uniform vec3 uBB;
uniform float uPreExp;
uniform float uFlameK;
vec3 bbColor(float T){
  float u = clamp((T - uBB.x) / (uBB.y - uBB.x), 0.0, 1.0);
  vec4 s = texture(tBB, vec2(u * (255.0/256.0) + 0.5/256.0, 0.5));
  return s.rgb * exp2(s.a * uBB.z) * uPreExp;
}
// Sazový plamen: spektrální emisivita sazí ε ∝ λ^−1,39 (Hottel–Broughton) posouvá barevnou teplotu o ~+28 %
// (svíčka: T sazí ~1 450 K, naměřená CCT ~1 850 K). Jas podle skutečné T, barva podle posunuté. ★★★★
vec3 sootColor(float T){
  float u0 = clamp((T - uBB.x) / (uBB.y - uBB.x), 0.0, 1.0);
  float u1 = clamp((T * 1.28 - uBB.x) / (uBB.y - uBB.x), 0.0, 1.0);
  vec4 a = texture(tBB, vec2(u1 * (255.0/256.0) + 0.5/256.0, 0.5));
  vec4 b = texture(tBB, vec2(u0 * (255.0/256.0) + 0.5/256.0, 0.5));
  return a.rgb * exp2(b.a * uBB.z) * uPreExp;
}
// Výstup efektu: ve vlastním potrubí FireLab (HDR cíl) beze změny; při kreslení přímo na plátno hostitele
// (TONE_MAPPING od three.js, např. xEngine) tónová křivka a sRGB.
vec4 fxOut(vec4 c){
#ifdef TONE_MAPPING
  // předvynásobená barva i aditivní emise: křivka na celý příspěvek (dělení malou alfou by přepálilo okraje)
  c.rgb = linearToOutputTexel(vec4(toneMapping(c.rgb), 1.0)).rgb;
  return c;
#else
  return c;
#endif
}
float n3(vec3 p){ return texture(tNoise, p).r; }
float w3(vec3 p){ return texture(tNoise, p).g; }
float fbm3(vec3 p){ return (0.5*n3(p) + 0.25*n3(p*2.03+0.17) + 0.125*n3(p*4.07+0.41)) / 0.875; }
float fbm4(vec3 p){ return (0.5*n3(p) + 0.25*n3(p*2.03+0.17) + 0.125*n3(p*4.07+0.41) + 0.0625*n3(p*8.13+0.73)) / 0.9375; }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;
