var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/fx/world.js
import * as THREE13 from "three";

// src/fx/particles.js
import * as THREE3 from "three";

// src/fx/shared.js
import * as THREE from "three";

// src/physics/blackbody.js
var h = 662607015e-42;
var c = 299792458;
var kB = 1380649e-29;
function g(x, mu, s1, s2) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}
function cmf(lnm) {
  return [
    1.056 * g(lnm, 599.8, 37.9, 31) + 0.362 * g(lnm, 442, 16, 26.7) - 0.065 * g(lnm, 501.1, 20.4, 26.2),
    0.821 * g(lnm, 568.8, 46.9, 40.5) + 0.286 * g(lnm, 530.9, 16.3, 31.1),
    1.217 * g(lnm, 437, 11.8, 36) + 0.681 * g(lnm, 459, 26, 13.8)
  ];
}
function planck(lambdaM, T) {
  return 2 * h * c * c / Math.pow(lambdaM, 5) / (Math.exp(h * c / (lambdaM * kB * T)) - 1);
}
function blackbodyXYZ(T) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const B = planck(l * 1e-9, T), m = cmf(l);
    X += B * m[0];
    Y += B * m[1];
    Z += B * m[2];
  }
  return [X, Y, Z];
}
function xyzToLinearSRGB([X, Y, Z]) {
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z
  ];
}
var Yref = blackbodyXYZ(1500)[1];
function blackbody(T) {
  const xyz = blackbodyXYZ(T);
  const rgb = xyzToLinearSRGB(xyz).map((v) => Math.max(0, v / xyz[1]));
  return { rgb, lum: xyz[1] / Yref };
}
function blackbodyLUT(N2 = 256, Tmin = 500, Tmax = 3500) {
  const data = new Float32Array(N2 * 4);
  for (let i = 0; i < N2; i++) {
    const T = Tmin + (Tmax - Tmin) * i / (N2 - 1);
    const { rgb, lum } = blackbody(T);
    data.set([rgb[0], rgb[1], rgb[2], Math.log2(Math.max(lum, 1e-12))], i * 4);
  }
  return { data, N: N2, Tmin, Tmax };
}

// src/engine/rng.js
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function noise1(seed) {
  const r = mulberry32(seed), P = 256, v = new Float32Array(P);
  for (let i = 0; i < P; i++) v[i] = r() * 2 - 1;
  return (x) => {
    const i = Math.floor(x), f = x - i, a = v[(i % P + P) % P], b = v[((i + 1) % P + P) % P];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}
function fbm1(seed) {
  const a = noise1(seed), b = noise1(seed + 1), c2 = noise1(seed + 2);
  return (x) => 0.55 * a(x) + 0.3 * b(x * 2.1) + 0.15 * c2(x * 4.3);
}

// src/fx/shared.js
var BB_GAMMA = 0.3;
var _noise = null;
var _bb = null;
var PRE = { value: 1 };
var FLAMEK = { value: 12e3 };
var GTIME = { value: 0 };
function noiseTexture(N2 = 64, seed = 7) {
  if (_noise) return _noise;
  const rnd = mulberry32(seed);
  const P = 8;
  const grads = (p) => {
    const g2 = new Float32Array(p * p * p * 3);
    for (let i = 0; i < p * p * p; i++) {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      g2.set([r * Math.cos(a), r * Math.sin(a), z], i * 3);
    }
    return g2;
  };
  const G1 = grads(P), G2 = grads(P * 2);
  const fade = (t2) => t2 * t2 * t2 * (t2 * (t2 * 6 - 15) + 10);
  function perlin(G3, p, x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    let v = 0;
    const u = fade(xf), w = fade(yf), q = fade(zf);
    for (let c2 = 0; c2 < 8; c2++) {
      const dx = c2 & 1, dy = c2 >> 1 & 1, dz = c2 >> 2 & 1;
      const gi = ((xi + dx) % p + p) % p + p * (((yi + dy) % p + p) % p + p * (((zi + dz) % p + p) % p));
      const d = G3[gi * 3] * (xf - dx) + G3[gi * 3 + 1] * (yf - dy) + G3[gi * 3 + 2] * (zf - dz);
      v += d * (dx ? u : 1 - u) * (dy ? w : 1 - w) * (dz ? q : 1 - q);
    }
    return v;
  }
  const C = 6, pts = new Float32Array(C * C * C * 3);
  for (let i = 0; i < C * C * C; i++) pts.set([rnd(), rnd(), rnd()], i * 3);
  function worley(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let m = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, cz = zi + k;
      const id = (cx % C + C) % C + C * ((cy % C + C) % C + C * ((cz % C + C) % C));
      const dx = cx + pts[id * 3] - x, dy = cy + pts[id * 3 + 1] - y, dz = cz + pts[id * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  }
  const data = new Uint8Array(N2 * N2 * N2 * 4);
  for (let z = 0; z < N2; z++) for (let y = 0; y < N2; y++) for (let x = 0; x < N2; x++) {
    const sx = x / N2, sy = y / N2, sz = z / N2;
    const a = (perlin(G1, P, sx * P, sy * P, sz * P) * 0.7 + perlin(G2, P * 2, sx * P * 2, sy * P * 2, sz * P * 2) * 0.35) * 2.2;
    const wv = 1 - worley(sx * C, sy * C, sz * C);
    const w2 = 1 - worley(sx * C * 2 + 0.31, sy * C * 2 + 0.17, sz * C * 2 + 0.53);
    const i = (x + N2 * (y + N2 * z)) * 4;
    data[i] = Math.max(0, Math.min(255, (a * 0.5 + 0.5) * 255));
    data[i + 1] = Math.max(0, Math.min(255, (wv * 0.65 + w2 * 0.35) * 255));
    data[i + 2] = Math.max(0, Math.min(255, rnd() * 255));
    data[i + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, N2, N2, N2);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  _noise = t;
  return t;
}
function bbTexture() {
  if (_bb) return _bb;
  const { data, N: N2, Tmin, Tmax } = blackbodyLUT(256, 500, 3500);
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const t = new THREE.DataTexture(half, N2, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  t.userData = { Tmin, Tmax };
  _bb = t;
  return t;
}
function sharedUniforms() {
  const bb = bbTexture();
  return {
    tNoise: { value: noiseTexture() },
    tBB: { value: bb },
    uBB: { value: new THREE.Vector3(bb.userData.Tmin, bb.userData.Tmax, BB_GAMMA) },
    uPreExp: PRE,
    uFlameK: FLAMEK,
    uGTime: GTIME
  };
}
var GLSL_COMMON = (
  /* glsl */
  `
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
// Sazov\xFD plamen: spektr\xE1ln\xED emisivita saz\xED \u03B5 \u221D \u03BB^\u22121,39 (Hottel\u2013Broughton) posouv\xE1 barevnou teplotu o ~+28 %
// (sv\xED\u010Dka: T saz\xED ~1 450 K, nam\u011B\u0159en\xE1 CCT ~1 850 K). Jas podle skute\u010Dn\xE9 T, barva podle posunut\xE9. \u2605\u2605\u2605\u2605
// Plamen (objem, jazyky) pou\u017E\xEDv\xE1 men\u0161\xED kompresi jasu (\u03B3 0,45): kontrast hork\xFDch a chladn\xFDch m\xEDst jako na fotk\xE1ch
// (1 250 \xD7 1 400 K: 2,6\xD7 m\xEDsto 1,9\xD7), iterace 4 podle m\u011B\u0159en\xED 20 fotek (docs/REFERENCE.md). V\xFDbuchy z\u016Fst\xE1vaj\xED na BB_GAMMA.
// Barva nav\xEDc kalibrovan\xE1 na fotky: hork\xE1 m\xEDsta \u017Elut\u0161\xED, chladn\xE1 \u010Derven\u011Bj\u0161\xED, ne\u017E d\xE1v\xE1 samotn\xFD posun saz\xED
// (fotky: odst\xEDn 12\u201320\xB0 v tmav\u0161\xEDch, 36\u201348\xB0 v nejjasn\u011Bj\u0161\xEDch \u010D\xE1stech plamene; \u010Dist\xFD Planck \xD7 1,28 jen 18\u201330\xB0) \u26052 um\u011Bleck\xE9
vec3 sootColorG(float T, float g){
  float u0 = clamp((T - uBB.x) / (uBB.y - uBB.x), 0.0, 1.0);
  float u1 = clamp((T * 1.28 + (T - 1250.0) * 1.6 - uBB.x) / (uBB.y - uBB.x), 0.0, 1.0);
  vec4 a = texture(tBB, vec2(u1 * (255.0/256.0) + 0.5/256.0, 0.5));
  vec4 b = texture(tBB, vec2(u0 * (255.0/256.0) + 0.5/256.0, 0.5));
  return a.rgb * exp2(b.a * g) * uPreExp;
}
vec3 sootColor(float T){
  float u0 = clamp((T - uBB.x) / (uBB.y - uBB.x), 0.0, 1.0);
  float u1 = clamp((T * 1.28 - uBB.x) / (uBB.y - uBB.x), 0.0, 1.0);
  vec4 a = texture(tBB, vec2(u1 * (255.0/256.0) + 0.5/256.0, 0.5));
  vec4 b = texture(tBB, vec2(u0 * (255.0/256.0) + 0.5/256.0, 0.5));
  return a.rgb * exp2(b.a * uBB.z) * uPreExp;
}
// V\xFDstup efektu: ve vlastn\xEDm potrub\xED FireLab (HDR c\xEDl) beze zm\u011Bny; p\u0159i kreslen\xED p\u0159\xEDmo na pl\xE1tno hostitele
// (TONE_MAPPING od three.js, nap\u0159. xEngine) t\xF3nov\xE1 k\u0159ivka a sRGB.
vec4 fxOut(vec4 c){
#ifdef TONE_MAPPING
  // p\u0159edvyn\xE1soben\xE1 barva i aditivn\xED emise: k\u0159ivka na cel\xFD p\u0159\xEDsp\u011Bvek (d\u011Blen\xED malou alfou by p\u0159ep\xE1lilo okraje)
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
`
);

// src/engine/pipeline.js
import * as THREE2 from "three";
var LAYER_FX = 1;
var LAYER_HAZE = 2;
var LAYER_VOL = 3;
var LAYER_SHADOW = 7;
var FS_TRI = new THREE2.BufferGeometry();
FS_TRI.setAttribute("position", new THREE2.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
FS_TRI.setAttribute("uv", new THREE2.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
var VS = (
  /* glsl */
  `out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
);
function fsPass(fs, uniforms) {
  const m = new THREE2.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, glslVersion: THREE2.GLSL3 });
  const mesh2 = new THREE2.Mesh(FS_TRI, m);
  mesh2.frustumCulled = false;
  const scene = new THREE2.Scene();
  scene.add(mesh2);
  return { m, scene, u: uniforms };
}
var DEPTH_COPY = (
  /* glsl */
  `
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D tDepth; uniform float cNear, cFar;
void main(){
  float d = texture(tDepth, vUv).x;
  float z = d * 2.0 - 1.0;
  float lin = (2.0 * cNear * cFar) / (cFar + cNear - z * (cFar - cNear));
  o = vec4(lin, 0.0, 0.0, 1.0);
}`
);
var BLOOM_DOWN = (
  /* glsl */
  `
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; uniform float first;
vec3 pre(vec3 c){ if(first < 0.5) return c; float l = max(c.r, max(c.g, c.b)); float k = max(l - threshold, 0.0) / max(l, 1e-4); return c * k; }
void main(){
  vec2 t = texel;
  vec3 c = pre(texture(tSrc, vUv).rgb) * 4.0;
  c += pre(texture(tSrc, vUv + vec2(-t.x, -t.y)).rgb);
  c += pre(texture(tSrc, vUv + vec2( t.x, -t.y)).rgb);
  c += pre(texture(tSrc, vUv + vec2(-t.x,  t.y)).rgb);
  c += pre(texture(tSrc, vUv + vec2( t.x,  t.y)).rgb);
  o = vec4(min(c / 8.0, vec3(6e4)), 1.0);
}`
);
var BLOOM_UP = (
  /* glsl */
  `
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D tSrc; uniform vec2 texel; uniform float weight;
void main(){
  vec2 t = texel;
  vec3 c = texture(tSrc, vUv + vec2(-2.0*t.x, 0.0)).rgb + texture(tSrc, vUv + vec2(2.0*t.x, 0.0)).rgb
         + texture(tSrc, vUv + vec2(0.0, -2.0*t.y)).rgb + texture(tSrc, vUv + vec2(0.0, 2.0*t.y)).rgb;
  c += (texture(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture(tSrc, vUv + vec2(t.x, -t.y)).rgb
      + texture(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture(tSrc, vUv + vec2(t.x, t.y)).rgb) * 2.0;
  o = vec4(c / 12.0 * weight, 1.0);
}`
);
var FINAL = (
  /* glsl */
  `
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D tMain, tBloom, tHaze;
uniform float exposure, bloomStrength, useBloom, useHaze, grain, time, vignette, tone;
uniform vec2 res;
vec3 aces(vec3 x){ // Hill / Narkowicz \u2013 ACES fit
  const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = m1 * x; vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), 0.0, 1.0);
}
// Filmick\xE1 k\u0159ivka po kan\xE1lech (Hable): jasn\xE1 oran\u017Eov\xE1 p\u0159ejde do syt\u011B \u017Elut\xE9 (\u010Derven\xFD kan\xE1l se nasyt\xED prvn\xED) jako na fotk\xE1ch
// plamene; ACES fit m\xEDsto toho rychle b\u011Bl\xE1. tone: 0 = ACES, 1 = Hable po kan\xE1lech, mezi = sm\u011Bs (iterace 4, REFERENCE.md)
vec3 hable(vec3 x){ const float A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30; return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F; }
vec3 filmic(vec3 x){ const float W = 11.2; return clamp(hable(x * 2.0) / hable(vec3(W)), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 0.0) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  if (useHaze > 0.5) { vec2 d = texture(tHaze, uv).rg; uv += d; }
  vec3 c = texture(tMain, uv).rgb;
  if (useBloom > 0.5) c += texture(tBloom, vUv).rgb * bloomStrength;
  c *= exposure;
  vec2 q = vUv - 0.5; c *= 1.0 - vignette * dot(q, q) * 1.6;
  c = mix(aces(c), filmic(c), tone);
  c = toSRGB(c);
  if (grain > 0.0) c += (h(vUv * res + fract(time) * 91.0) - 0.5) * grain;
  o = vec4(c, 1.0);
}`
);
var TAA = (
  /* glsl */
  `
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D tCur, tDist, tHist; uniform mat4 invVP, prevVP; uniform vec3 camPos; uniform vec2 texel; uniform float blend;
void main(){
  vec4 cur = texture(tCur, vUv);
  vec4 mn = cur, mx = cur;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    if (x == 0 && y == 0) continue;
    vec4 c = texture(tCur, vUv + vec2(float(x), float(y)) * texel);
    mn = min(mn, c); mx = max(mx, c);
  }
  // vzd\xE1lenost pod\xE9l paprsku: p\u0159edvyn\xE1soben\xE1 kryt\xEDm; bez objemu v pixelu \u2192 okol\xED (jinak by se historie t\xE1hla)
  float a = cur.a, d = a > 0.002 ? texture(tDist, vUv).r / a : 0.0;
  vec2 puv = vUv;
  if (d > 0.0) {
    vec4 w = invVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); w /= w.w;
    vec3 P = camPos + normalize(w.xyz - camPos) * d;
    vec4 pc = prevVP * vec4(P, 1.0);
    puv = pc.xy / pc.w * 0.5 + 0.5;
  }
  vec4 h = texture(tHist, puv);
  h = clamp(h, mn, mx);
  float k = (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) ? 1.0 : blend;
  o = mix(h, cur, k);
}`
);
var COPY_PM = (
  /* glsl */
  `precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D tSrc; void main(){ o = texture(tSrc, vUv); }`
);
var Pipeline = class {
  constructor(renderer, tier) {
    this.r = renderer;
    this.exposure = 1;
    this.targetExposure = 1;
    this.autoExposure = true;
    this.bloomStrength = 0.08;
    this.stats = { passes: 0 };
    this.depthCopy = fsPass(DEPTH_COPY, { tDepth: { value: null }, cNear: { value: 0.1 }, cFar: { value: 1e3 } });
    this.down = fsPass(BLOOM_DOWN, { tSrc: { value: null }, texel: { value: new THREE2.Vector2() }, threshold: { value: 1 }, first: { value: 1 } });
    this.up = fsPass(BLOOM_UP, { tSrc: { value: null }, texel: { value: new THREE2.Vector2() }, weight: { value: 0.55 } });
    this.up.m.blending = THREE2.AdditiveBlending;
    this.up.m.transparent = true;
    this.final = fsPass(FINAL, {
      tMain: { value: null },
      tBloom: { value: null },
      tHaze: { value: null },
      exposure: { value: 1 },
      bloomStrength: { value: 0.6 },
      useBloom: { value: 0 },
      useHaze: { value: 0 },
      grain: { value: 0 },
      time: { value: 0 },
      vignette: { value: 0.35 },
      tone: { value: 0 },
      res: { value: new THREE2.Vector2() }
    });
    this.taa = fsPass(TAA, { tCur: { value: null }, tDist: { value: null }, tHist: { value: null }, invVP: { value: new THREE2.Matrix4() }, prevVP: { value: new THREE2.Matrix4() }, camPos: { value: new THREE2.Vector3() }, texel: { value: new THREE2.Vector2() }, blend: { value: 0.12 } });
    this.comp = fsPass(COPY_PM, { tSrc: { value: null } });
    Object.assign(this.comp.m, { transparent: true, blending: THREE2.CustomBlending, blendSrc: THREE2.OneFactor, blendDst: THREE2.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE2.OneFactor, blendDstAlpha: THREE2.OneMinusSrcAlphaFactor });
    this.prevVP = new THREE2.Matrix4();
    this.prevPos = new THREE2.Vector3(1e9, 0, 0);
    this.prevDir = new THREE2.Vector3();
    this.taaReset = true;
    this.histI = 0;
    this.setTier(tier);
  }
  /** Zahodit historii objemů (nový scénář, střih kamery). */
  resetHistory() {
    this.taaReset = true;
  }
  setTier(tier) {
    this.tier = tier;
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.maxPixelRatio));
    this.dispose();
    this.resize(this.w || 1280, this.h || 720);
  }
  dispose() {
    for (const k of ["main", "depth", "haze", "vol"]) if (this[k]) {
      this[k].dispose();
      this[k] = null;
    }
    (this.hist || []).forEach((t) => t.dispose());
    this.hist = null;
    (this.bloomRTs || []).forEach((t) => t.dispose());
    this.bloomRTs = [];
  }
  resize(w, h2) {
    this.w = w;
    this.h = h2;
    const pr0 = Math.min(window.devicePixelRatio || 1, this.tier.maxPixelRatio), cap = Math.sqrt(83e5 / Math.max(1, w * h2 * pr0 * pr0));
    if (cap < 1) this.r.setPixelRatio(pr0 * cap);
    else if (this.r.getPixelRatio() !== pr0) this.r.setPixelRatio(pr0);
    this.r.setSize(w, h2, false);
    const pr = this.r.getPixelRatio(), s = this.tier.renderScale;
    const W = Math.max(2, Math.round(w * pr * s)), H = Math.max(2, Math.round(h2 * pr * s));
    this.dispose();
    const dt = new THREE2.DepthTexture(W, H);
    dt.type = THREE2.UnsignedIntType;
    this.main = new THREE2.WebGLRenderTarget(W, H, { type: THREE2.HalfFloatType, depthTexture: dt, samples: this.tier.msaa });
    this.main.texture.minFilter = THREE2.LinearFilter;
    if (this.tier.softParticles) this.depth = new THREE2.WebGLRenderTarget(W, H, { type: THREE2.FloatType, depthBuffer: false });
    if (this.tier.haze) this.haze = new THREE2.WebGLRenderTarget(W >> 1, H >> 1, { type: THREE2.HalfFloatType, depthBuffer: false });
    if (this.tier.volumeTAA && this.depth) {
      this.vol = new THREE2.WebGLRenderTarget(W, H, { type: THREE2.HalfFloatType, depthBuffer: false, count: 2 });
      this.hist = [0, 1].map(() => new THREE2.WebGLRenderTarget(W, H, { type: THREE2.HalfFloatType, depthBuffer: false }));
      for (const t of [...this.vol.textures, ...this.hist.map((h3) => h3.texture)]) {
        t.minFilter = t.magFilter = THREE2.LinearFilter;
      }
      this.taaReset = true;
    }
    let bw = W, bh = H;
    for (let i = 0; i < this.tier.bloom; i++) {
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
      const t = new THREE2.WebGLRenderTarget(bw, bh, { type: THREE2.HalfFloatType, depthBuffer: false });
      t.texture.minFilter = THREE2.LinearFilter;
      this.bloomRTs.push(t);
    }
    this.final.u.res.value.set(W, H);
    this.size = { W, H };
  }
  /** Objemy do vlastního cíle (barva + vzdálenost), akumulace s historií → hist[histI]. Vrací počet průchodů. */
  renderVolumes(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.vol);
    r.setClearColor(0, 0);
    r.clear(true, false, false);
    camera.layers.set(LAYER_VOL);
    r.render(scene, camera);
    camera.layers.set(0);
    r.setClearColor(0, 1);
    camera.updateMatrixWorld();
    const dir = new THREE2.Vector3();
    camera.getWorldDirection(dir);
    const cut = this.taaReset || camera.position.distanceTo(this.prevPos) > 1.5 || dir.dot(this.prevDir) < 0.9;
    const u = this.taa.u, next = 1 - this.histI;
    u.tCur.value = this.vol.textures[0];
    u.tDist.value = this.vol.textures[1];
    u.tHist.value = this.hist[this.histI].texture;
    u.invVP.value.copy(camera.matrixWorld).multiply(camera.projectionMatrixInverse);
    u.prevVP.value.copy(this.prevVP);
    u.camPos.value.copy(camera.position);
    u.texel.value.set(1 / this.size.W, 1 / this.size.H);
    u.blend.value = cut ? 1 : this.taaBlend ?? 0.12;
    r.setRenderTarget(this.hist[next]);
    r.render(this.taa.scene, camera);
    this.histI = next;
    this.taaReset = false;
    this.prevVP.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
    this.prevPos.copy(camera.position);
    this.prevDir.copy(dir);
    return 2;
  }
  /** Vstup pro efekty: textura lineární hloubky (T2+), nebo null. */
  get depthTexture() {
    return this.depth ? this.depth.texture : null;
  }
  render(scene, camera, dt, time) {
    const r = this.r, t = this.tier;
    let passes = 0;
    r.setRenderTarget(this.main);
    r.setClearColor(0, 1);
    r.clear(true, true, true);
    const mask = camera.layers.mask;
    if (this.depth) {
      camera.layers.set(0);
      r.render(scene, camera);
      passes++;
      this.depthCopy.u.tDepth.value = this.main.depthTexture;
      this.depthCopy.u.cNear.value = camera.near;
      this.depthCopy.u.cFar.value = camera.far;
      r.setRenderTarget(this.depth);
      r.render(this.depthCopy.scene, camera);
      passes++;
      if (this.vol) passes += this.renderVolumes(scene, camera);
      r.setRenderTarget(this.main);
      const ac = r.autoClear;
      r.autoClear = false;
      if (this.vol) {
        this.comp.u.tSrc.value = this.hist[this.histI].texture;
        r.render(this.comp.scene, camera);
        passes++;
      }
      camera.layers.set(LAYER_FX);
      r.render(scene, camera);
      passes++;
      r.autoClear = ac;
    } else {
      camera.layers.set(0);
      camera.layers.enable(LAYER_FX);
      r.render(scene, camera);
      passes++;
    }
    if (this.haze) {
      r.setRenderTarget(this.haze);
      r.setClearColor(0, 0);
      r.clear(true, false, false);
      camera.layers.set(LAYER_HAZE);
      const ac = r.autoClear;
      r.autoClear = false;
      r.render(scene, camera);
      r.autoClear = ac;
      passes++;
    }
    camera.layers.mask = mask;
    if (this.bloomRTs.length) {
      let src = this.main.texture, sw = this.size.W, sh = this.size.H;
      this.down.u.threshold.value = 2.5;
      for (let i = 0; i < this.bloomRTs.length; i++) {
        this.down.u.tSrc.value = src;
        this.down.u.texel.value.set(1 / sw, 1 / sh);
        this.down.u.first.value = i === 0 ? 1 : 0;
        r.setRenderTarget(this.bloomRTs[i]);
        r.render(this.down.scene, camera);
        passes++;
        src = this.bloomRTs[i].texture;
        sw = this.bloomRTs[i].width;
        sh = this.bloomRTs[i].height;
      }
      const ac = r.autoClear;
      r.autoClear = false;
      for (let i = this.bloomRTs.length - 1; i > 0; i--) {
        this.up.u.tSrc.value = this.bloomRTs[i].texture;
        this.up.u.texel.value.set(1 / this.bloomRTs[i].width, 1 / this.bloomRTs[i].height);
        r.setRenderTarget(this.bloomRTs[i - 1]);
        r.render(this.up.scene, camera);
        passes++;
      }
      r.autoClear = ac;
    }
    if (this.autoExposure) {
      const k = this.targetExposure < this.exposure ? 1 - Math.exp(-dt / 0.25) : 1 - Math.exp(-dt / 0.9);
      this.exposure += (this.targetExposure - this.exposure) * k;
    } else this.exposure = this.targetExposure;
    const f = this.final.u;
    f.tMain.value = this.main.texture;
    f.tBloom.value = this.bloomRTs.length ? this.bloomRTs[0].texture : null;
    f.useBloom.value = this.bloomRTs.length ? 1 : 0;
    f.tHaze.value = this.haze ? this.haze.texture : null;
    f.useHaze.value = this.haze ? 1 : 0;
    f.exposure.value = 1;
    f.bloomStrength.value = this.bloomStrength;
    f.tone.value = this.tone ?? 0;
    f.grain.value = t.grain ? 0.012 : 0;
    f.time.value = time;
    r.setRenderTarget(null);
    r.render(this.final.scene, camera);
    passes++;
    this.stats.passes = passes;
  }
};

// src/fx/particles.js
var F = {
  px: 0,
  py: 1,
  pz: 2,
  vx: 3,
  vy: 4,
  vz: 5,
  age: 6,
  life: 7,
  s0: 8,
  s1: 9,
  rot: 10,
  rotV: 11,
  seed: 12,
  type: 13,
  T0: 14,
  dT: 15,
  tau0: 16,
  drag: 17,
  buoy: 18,
  cr: 19,
  cg: 20,
  cb: 21,
  ox: 22,
  oz: 23,
  pq: 24,
  pz0: 25,
  grav: 26,
  glowR: 27,
  glowG: 28,
  glowB: 29,
  stretch: 30,
  extra: 31
};
var STRIDE = 32;
var PTYPE = { FLAME: 0, SMOKE: 1, EMBERGLOW: 2, FIREPUFF: 3 };
var QUAD = (() => {
  const g2 = new THREE3.InstancedBufferGeometry();
  g2.setAttribute("position", new THREE3.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g2.setIndex([0, 1, 2, 0, 2, 3]);
  return g2;
})();
var AirField = class {
  constructor() {
    this.U10 = 0;
    this.dir = 0;
    this.gust = 0;
    this.turb = 0;
    this.time = 0;
    this.z0 = 0.03;
    this.gustNow = 0;
    this.extraUp = null;
  }
  windAt(z) {
    if (this.U10 <= 0) return 0;
    const zz = Math.max(z, this.z0 * 1.5);
    return this.U10 * (1 + this.gustNow) * Math.log(zz / this.z0) / Math.log(10 / this.z0);
  }
};
var BaseSystem = class {
  constructor(capacity) {
    this.cap = capacity;
    this.n = 0;
    this.d = new Float32Array(capacity * STRIDE);
    this.spawned = 0;
    this.dropped = 0;
  }
  alloc() {
    if (this.n >= this.cap) {
      this.dropped++;
      return -1;
    }
    this.spawned++;
    const i = this.n++;
    this.d.fill(0, i * STRIDE, i * STRIDE + STRIDE);
    return i * STRIDE;
  }
  kill(i) {
    const last = --this.n;
    if (i !== last) this.d.copyWithin(i * STRIDE, last * STRIDE, last * STRIDE + STRIDE);
  }
  clear() {
    this.n = 0;
  }
  /** Integrace pohybu: odpor vůči proudění vzduchu + gravitace + zbytkový vztlak. */
  integrate(dt, air) {
    const d = this.d, cw = Math.cos(air.dir), sw = Math.sin(air.dir), t = air.time;
    for (let i = 0; i < this.n; i++) {
      const o = i * STRIDE;
      d[o + F.age] += dt;
      if (d[o + F.age] >= d[o + F.life]) {
        this.kill(i);
        i--;
        continue;
      }
      const x = d[o + F.px], y = d[o + F.py], z = d[o + F.pz];
      const U = air.windAt(y);
      let ax = U * cw, az = U * sw, ay = 0;
      const pq = d[o + F.pq];
      if (pq > 0) {
        const dzp = Math.max(y - d[o + F.pz0], 0.05);
        const Qt = pq / 0.7, q5 = Math.pow(Qt, 0.2), eta = dzp / (q5 * q5);
        const u0 = q5 * (eta < 0.08 ? 6.84 * Math.sqrt(eta) : eta < 0.2 ? 1.93 : 1.12 * Math.pow(eta, -1 / 3));
        const b = Math.max(0.156 * dzp, d[o + F.glowR] * 0.85) + 0.02;
        const drift = U * dzp / Math.max(u0, 0.4) * 0.6;
        const rx = x - (d[o + F.ox] + drift * cw), rz = z - (d[o + F.oz] + drift * sw);
        const r2 = (rx * rx + rz * rz) / (b * b);
        const g2 = Math.exp(-r2);
        ay += u0 * g2;
        const rr = Math.sqrt(r2) + 1e-3, inflow = 0.12 * u0 * Math.min(1, 1 / rr) * (1 - g2);
        ax -= rx / (rr * b) * inflow;
        az -= rz / (rr * b) * inflow;
      }
      if (air.extraUp) {
        const e = air.extraUp(x, y, z);
        ax += e[0];
        ay += e[1];
        az += e[2];
      }
      const s = d[o + F.seed], k = air.turb * (0.4 + U * 0.25) + (pq > 0 ? 0.25 : 0.05);
      ax += k * Math.sin(t * 1.7 + s * 13.1 + y * 1.3);
      ay += k * 0.6 * Math.sin(t * 2.3 + s * 7.7 + x * 1.1);
      az += k * Math.cos(t * 1.9 + s * 5.3 + y * 0.9);
      const tau = d[o + F.drag];
      const kk = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
      d[o + F.vx] += (ax - d[o + F.vx]) * kk;
      d[o + F.vy] += (ay - d[o + F.vy]) * kk + (d[o + F.buoy] * Math.exp(-d[o + F.age] * 0.8) - 9.81 * d[o + F.grav]) * dt;
      d[o + F.vz] += (az - d[o + F.vz]) * kk;
      d[o + F.px] = x + d[o + F.vx] * dt;
      d[o + F.py] = y + d[o + F.vy] * dt;
      d[o + F.pz] = z + d[o + F.vz] * dt;
      d[o + F.rot] += d[o + F.rotV] * dt;
      if (d[o + F.py] < 5e-3 && d[o + F.grav] > 0) {
        d[o + F.py] = 5e-3;
        d[o + F.vy] *= -0.3;
        d[o + F.vx] *= 0.6;
        d[o + F.vz] *= 0.6;
      }
    }
  }
};
var BB_VS = (
  /* glsl */
  `
in vec4 iPS;   // pos, size
in vec4 iP;    // age01, rot, frame, type
in vec4 iC;    // rgb (kou\u0159: albedo; plamen: tint), opacity / tau
in vec4 iG;    // glow rgb, T (plamen) | stretch
in vec3 iV;    // rychlost
out vec2 vUv; out vec4 vP; out vec4 vC; out vec4 vG; out float vViewZ;
uniform float uFrames;
void main(){
  vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float s = iPS.w;
  vec2 q = position.xy;
  vec3 right, up;
  if (iP.w < 0.5) {
    // plamen: osa pod\xE9l rychlosti v rovin\u011B obrazovky (jazyk v proudu)
    vec3 v = iV; vec2 sv = vec2(dot(v, cr), dot(v, cu));
    float l = length(sv);
    vec2 dir = l > 0.05 ? sv / l : vec2(0.0, 1.0);
    dir = normalize(mix(vec2(0.0, 1.0), dir, clamp(l * 0.6, 0.0, 1.0)));
    float st = 1.0 + iP.y * clamp(l * 0.15, 0.0, 1.0);
    right = (cr * dir.y - cu * dir.x) * s; up = (cr * dir.x + cu * dir.y) * s * st;
    q.y += 0.3; // pata jazyka u zdroje
  } else {
    float c = cos(iP.y), sn = sin(iP.y);
    right = (cr * c + cu * sn) * s; up = (-cr * sn + cu * c) * s;
  }
  vec3 wp = iPS.xyz + right * q.x + up * q.y;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
  // flipbook: plamen vlevo, kou\u0159 vpravo (16 \xD7 8 sn\xEDmk\u016F)
  float fr = mod(floor(iP.z), uFrames);
  float col = mod(fr, 8.0), row = floor(fr / 8.0);
  float sheet = iP.w < 0.5 ? 0.0 : 8.0;
  vec2 quv = clamp(position.xy + 0.5, 0.0, 1.0);
  vUv = vec2((col + sheet + quv.x) / 16.0, (row + quv.y) / 8.0);
  vP = iP; vC = iC; vG = iG;
}`
);
var BB_FS = (
  /* glsl */
  `
precision highp float;
precision highp sampler3D;
${GLSL_COMMON}
in vec2 vUv; in vec4 vP; in vec4 vC; in vec4 vG; in float vViewZ;
out vec4 fragColor;
uniform sampler2D tAtlas;
uniform vec3 uAmb, uSunCol, uSunDir;
uniform float uFlameLum, uSoft;
#ifdef SOFT
uniform sampler2D tDepth; uniform vec2 uDepthRes;
#endif
void main(){
  vec4 a = texture(tAtlas, vUv);
  float soft = 1.0;
#ifdef SOFT
  float sz = texture(tDepth, gl_FragCoord.xy / uDepthRes).r;
  soft = clamp((sz - vViewZ) / uSoft, 0.0, 1.0);
#endif
  float age = vP.x;
  if (vP.w < 0.5) {
    // plamen: R = intenzita, G = teplotn\xED v\xE1ha, B = saze, A = pokryt\xED
    float T = (vG.w > 0.0 ? vG.w : 1250.0) * (0.8 + 0.25 * clamp(a.g * 1.25, 0.0, 1.0));
    float life = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
    vec3 em = sootColorG(T, 0.45) * a.r * uFlameLum * vC.a * life * vC.rgb;
    float al = a.b * a.a * life * 0.5 * vC.a;
    fragColor = fxOut(vec4(em * soft, al * soft));
  } else if (vP.w > 2.5) {
    // ohniv\xFD chuchvalec (ohniv\xE1 koule, horn\xED \u010D\xE1st velk\xFDch po\u017E\xE1r\u016F): maska z kou\u0159ov\xE9ho listu, emise Planck
    float T = vG.w * (0.82 + 0.3 * a.g) ;
    float life = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.6, 1.0, age));
    float d = clamp(a.r * 1.6, 0.0, 1.0);
    vec3 em = sootColor(T) * d * uFlameLum * vC.a * life;
    float al = (1.0 - exp(-a.r * vC.r * 3.0)) * life * soft;
    fragColor = fxOut(vec4(em * soft, al));
  } else {
    // kou\u0159: R = hustota, G = propustnost ke sv\u011Btlu shora, B = okraj
    float tau = vC.a;
    // okraj chuchvalce v\u017Edy m\u011Bkk\xFD (i p\u0159i velk\xE9 \u03C4) \u2013 jinak mrak vypad\xE1 jako hrozen koul\xED (iterace 3)
    float al = (1.0 - exp(-a.r * tau * 2.2)) * a.a * smoothstep(0.0, 0.3, a.r);
    al *= (1.0 - smoothstep(0.8, 1.0, age)) * soft;
    vec3 alb = vC.rgb;
    // st\xEDnov\xE1n\xED jednoho chuchvalce tlumen\xE9: v hust\xE9m mraku st\xEDn\xED celek, ne ka\u017Ed\xE1 koule zvl\xE1\u0161\u0165
    float sg = mix(0.62, a.g, 0.55);
    vec3 lit = (uAmb * (0.62 + 0.38 * sg) + uSunCol * sg * (0.75 + 0.25 * a.b)) * uPreExp;
    // podsv\xEDcen\xED ohn\u011Bm zespodu (spo\u010D\xEDt\xE1no na CPU, rozptyl \u221D albedo)
    vec3 glow = vG.rgb * (0.35 + 0.65 * (1.0 - a.g)) * uPreExp;
    vec3 c = alb * (lit + glow);
    if (vP.w > 1.5) c += bbColor(900.0 + 250.0 * (1.0 - age)) * uFlameLum * 0.012 * (1.0 - age) * (1.0 - age); // \u017Ehnouc\xED kou\u0159 u paty
    fragColor = fxOut(vec4(c * al, al));
  }
}`
);
var BillboardSystem = class extends BaseSystem {
  constructor(capacity, atlas, { depth = null, sort = true } = {}) {
    super(capacity);
    this.sort = sort;
    const g2 = QUAD.clone();
    g2.instanceCount = 0;
    const mk = (n) => {
      const a = new THREE3.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE3.DynamicDrawUsage);
      return a;
    };
    this.aPS = mk(4);
    this.aP = mk(4);
    this.aC = mk(4);
    this.aG = mk(4);
    this.aV = mk(3);
    g2.setAttribute("iPS", this.aPS);
    g2.setAttribute("iP", this.aP);
    g2.setAttribute("iC", this.aC);
    g2.setAttribute("iG", this.aG);
    g2.setAttribute("iV", this.aV);
    this.geo = g2;
    const defines = depth ? { SOFT: 1 } : {};
    this.mat = new THREE3.ShaderMaterial({
      vertexShader: BB_VS,
      fragmentShader: BB_FS,
      glslVersion: THREE3.GLSL3,
      defines,
      uniforms: {
        ...sharedUniforms(),
        tAtlas: { value: atlas },
        uFrames: { value: 64 },
        uAmb: { value: new THREE3.Color(0.05, 0.05, 0.06) },
        uSunCol: { value: new THREE3.Color(0, 0, 0) },
        uSunDir: { value: new THREE3.Vector3(0, 1, 0) },
        uFlameLum: { value: 1 },
        uSoft: { value: 0.6 },
        tDepth: { value: depth },
        uDepthRes: { value: new THREE3.Vector2(1, 1) }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE3.CustomBlending,
      blendSrc: THREE3.OneFactor,
      blendDst: THREE3.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE3.OneFactor,
      blendDstAlpha: THREE3.OneMinusSrcAlphaFactor
    });
    this.mesh = new THREE3.Mesh(g2, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_FX);
    this.mesh.renderOrder = 5;
    this.order = new Uint32Array(capacity);
    this.keys = new Float32Array(capacity);
    this.mesh.onBeforeRender = () => {
      const t = this.mat.uniforms.tDepth.value;
      if (t) this.mat.uniforms.uDepthRes.value.set(t.image.width, t.image.height);
    };
    this.lights = [];
    this.pre = 1;
  }
  spawnFlame({ x, y, z, vx = 0, vy = 0, vz = 0, life, s0, s1, T, lum = 1, tint = [1, 1, 1], ox, oz, pq = 0, pz0 = 0, drag = 0.15, buoy = 0, stretch = 1, seed, R0 = 0 }) {
    const o = this.alloc();
    if (o < 0) return;
    const d = this.d;
    d[o + F.px] = x;
    d[o + F.py] = y;
    d[o + F.pz] = z;
    d[o + F.vx] = vx;
    d[o + F.vy] = vy;
    d[o + F.vz] = vz;
    d[o + F.life] = life;
    d[o + F.s0] = s0;
    d[o + F.s1] = s1;
    d[o + F.type] = PTYPE.FLAME;
    d[o + F.T0] = T;
    d[o + F.seed] = seed ?? Math.random();
    d[o + F.tau0] = lum;
    d[o + F.cr] = tint[0];
    d[o + F.cg] = tint[1];
    d[o + F.cb] = tint[2];
    d[o + F.ox] = ox ?? x;
    d[o + F.oz] = oz ?? z;
    d[o + F.pq] = pq;
    d[o + F.pz0] = pz0;
    d[o + F.drag] = drag;
    d[o + F.buoy] = buoy;
    d[o + F.stretch] = stretch;
    d[o + F.extra] = Math.floor(d[o + F.seed] * 64);
    d[o + F.glowR] = R0;
  }
  spawnFirePuff({ x, y, z, vx = 0, vy = 0, vz = 0, life, s0, s1, T, lum = 1, soot = 0.3, drag = 0.3, buoy = 0, ox, oz, pq = 0, pz0 = 0, seed, R0 = 0 }) {
    const o = this.alloc();
    if (o < 0) return;
    const d = this.d;
    d[o + F.px] = x;
    d[o + F.py] = y;
    d[o + F.pz] = z;
    d[o + F.vx] = vx;
    d[o + F.vy] = vy;
    d[o + F.vz] = vz;
    d[o + F.life] = life;
    d[o + F.s0] = s0;
    d[o + F.s1] = s1;
    d[o + F.type] = PTYPE.FIREPUFF;
    d[o + F.T0] = T;
    d[o + F.seed] = seed ?? Math.random();
    d[o + F.tau0] = lum;
    d[o + F.cr] = soot;
    d[o + F.rot] = d[o + F.seed] * 43.98;
    d[o + F.rotV] = (d[o + F.seed] * 7919 % 1 - 0.5) * 1.2;
    d[o + F.ox] = ox ?? x;
    d[o + F.oz] = oz ?? z;
    d[o + F.pq] = pq;
    d[o + F.pz0] = pz0;
    d[o + F.drag] = drag;
    d[o + F.buoy] = buoy;
    d[o + F.extra] = Math.floor(d[o + F.seed] * 104729 % 1 * 64);
    d[o + F.glowR] = R0;
  }
  spawnSmoke({ x, y, z, vx = 0, vy = 0, vz = 0, life, s0, s1, tau, albedo, ox, oz, pq = 0, pz0 = 0, drag = 0.4, buoy = 0, glowing = false, seed, R0 = 0, grav = 0 }) {
    const o = this.alloc();
    if (o < 0) return;
    const d = this.d;
    d[o + F.px] = x;
    d[o + F.py] = y;
    d[o + F.pz] = z;
    d[o + F.vx] = vx;
    d[o + F.vy] = vy;
    d[o + F.vz] = vz;
    d[o + F.life] = life;
    d[o + F.s0] = s0;
    d[o + F.s1] = s1;
    d[o + F.type] = glowing ? PTYPE.EMBERGLOW : PTYPE.SMOKE;
    d[o + F.tau0] = tau;
    d[o + F.cr] = albedo[0];
    d[o + F.cg] = albedo[1];
    d[o + F.cb] = albedo[2];
    d[o + F.seed] = seed ?? Math.random();
    d[o + F.rot] = d[o + F.seed] * 43.98;
    d[o + F.rotV] = (d[o + F.seed] * 7919 % 1 - 0.5) * 0.6;
    d[o + F.ox] = ox ?? x;
    d[o + F.oz] = oz ?? z;
    d[o + F.pq] = pq;
    d[o + F.pz0] = pz0;
    d[o + F.drag] = drag;
    d[o + F.buoy] = buoy;
    d[o + F.extra] = Math.floor(d[o + F.seed] * 104729 % 1 * 64);
    d[o + F.glowR] = R0;
    d[o + F.grav] = grav;
  }
  update(dt, air, camera, lights) {
    this.integrate(dt, air);
    const d = this.d, n = this.n;
    const cp = camera.position, fw = this._fw || (this._fw = new THREE3.Vector3());
    camera.getWorldDirection(fw);
    let dmin = Infinity, dmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const k = (d[o] - cp.x) * fw.x + (d[o + 1] - cp.y) * fw.y + (d[o + 2] - cp.z) * fw.z;
      this.keys[i] = k;
      if (k < dmin) dmin = k;
      if (k > dmax) dmax = k;
    }
    if (this.sort && n > 1) {
      const sk = this.sortKeys || (this.sortKeys = new Uint32Array(this.cap)), inv = 4095 / Math.max(dmax - dmin, 1e-6);
      for (let i = 0; i < n; i++) sk[i] = ((4095 - (this.keys[i] - dmin) * inv | 0) << 20 | i) >>> 0;
      const v = sk.subarray(0, n);
      v.sort();
      for (let i = 0; i < n; i++) this.order[i] = v[i] & 1048575;
    } else for (let i = 0; i < n; i++) this.order[i] = i;
    const PS = this.aPS.array, P = this.aP.array, C = this.aC.array, G2 = this.aG.array, V6 = this.aV.array;
    for (let j = 0; j < n; j++) {
      const i = this.order[j], o = i * STRIDE;
      const age = d[o + F.age], life = d[o + F.life], a01 = age / life;
      const type = d[o + F.type];
      const grow = 1 - Math.exp(-age / Math.max(life * 0.35, 1e-3));
      let s = d[o + F.s0] + (d[o + F.s1] - d[o + F.s0]) * grow;
      PS[j * 4] = d[o];
      PS[j * 4 + 1] = d[o + 1];
      PS[j * 4 + 2] = d[o + 2];
      PS[j * 4 + 3] = s;
      const frame = d[o + F.extra] + age * (type === PTYPE.FLAME ? 34 : type === PTYPE.FIREPUFF ? 20 : 9) * (0.8 + d[o + F.seed] * 0.4);
      P[j * 4] = a01;
      P[j * 4 + 1] = d[o + F.rot];
      P[j * 4 + 2] = frame;
      P[j * 4 + 3] = type;
      V6[j * 3] = d[o + F.vx];
      V6[j * 3 + 1] = d[o + F.vy];
      V6[j * 3 + 2] = d[o + F.vz];
      if (type === PTYPE.FLAME) {
        C[j * 4] = d[o + F.cr];
        C[j * 4 + 1] = d[o + F.cg];
        C[j * 4 + 2] = d[o + F.cb];
        C[j * 4 + 3] = d[o + F.tau0];
        G2[j * 4] = 0;
        G2[j * 4 + 1] = 0;
        G2[j * 4 + 2] = 0;
        G2[j * 4 + 3] = d[o + F.T0] * (1 - 0.12 * a01);
        P[j * 4 + 1] = d[o + F.stretch];
      } else if (type === PTYPE.FIREPUFF) {
        C[j * 4] = d[o + F.cr];
        C[j * 4 + 1] = 0;
        C[j * 4 + 2] = 0;
        C[j * 4 + 3] = d[o + F.tau0];
        G2[j * 4] = 0;
        G2[j * 4 + 1] = 0;
        G2[j * 4 + 2] = 0;
        G2[j * 4 + 3] = d[o + F.T0] * (1 - 0.3 * a01);
      } else {
        const s0 = Math.max(d[o + F.s0], 1e-3);
        const tau = d[o + F.tau0] * s0 / s * (1 - Math.exp(-age / 0.3));
        C[j * 4] = d[o + F.cr];
        C[j * 4 + 1] = d[o + F.cg];
        C[j * 4 + 2] = d[o + F.cb];
        C[j * 4 + 3] = tau;
        let gr = 0, gg = 0, gb = 0;
        for (const L of lights) {
          if (!L.on) continue;
          const dx = d[o] - L.x, dy = d[o + 1] - L.y, dz = d[o + 2] - L.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          const sh = L.k > 0 ? Math.exp(-L.k * Math.max(0, Math.sqrt(d2) - L.r * 0.5) * 0.6) : 1;
          const e = L.I / (d2 + 0.25 * L.r * L.r) * 0.05 * sh;
          gr += e * L.c[0];
          gg += e * L.c[1];
          gb += e * L.c[2];
        }
        G2[j * 4] = gr;
        G2[j * 4 + 1] = gg;
        G2[j * 4 + 2] = gb;
        G2[j * 4 + 3] = 0;
      }
    }
    this.geo.instanceCount = n;
    for (const a of [this.aPS, this.aP, this.aC, this.aG, this.aV]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
};
var SP_VS = (
  /* glsl */
  `
in vec4 iPS; in vec4 iV; in float iT;
out vec2 vUv; out float vT; out float vA; out float vB;
uniform float uPx;  // velikost pixelu ve sv\u011Bt\u011B na 1 m vzd\xE1lenosti
uniform float uShutter;
void main(){
  vec4 c = viewMatrix * vec4(iPS.xyz, 1.0);
  vec4 c2 = viewMatrix * vec4(iPS.xyz - iV.xyz * uShutter, 1.0);
  float dist = max(-c.z, 0.01);
  float minS = uPx * dist * 1.6;
  float s = max(iPS.w, minS);
  // zachov\xE1n\xED energie: men\u0161\xED ne\u017E pixel \u2192 sv\xEDt\xED v\xEDc na plochu, ale stejn\u011B celkov\u011B
  vA = (iPS.w * iPS.w) / (s * s);
  vec2 d = c.xy - c2.xy; float l = length(d);
  vec2 dir = l > 1e-5 ? d / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 q = position.xy;
  vec2 off = nrm * q.y * s + dir * (q.x * (l + s));
  vec4 mv = vec4(mix(c.xyz, c2.xyz, 0.5) + vec3(off, 0.0), 1.0);
  vA *= s / (l + s);
  gl_Position = projectionMatrix * mv;
  vUv = q + 0.5; vT = iT; vB = iV.w;
}`
);
var SP_FS = (
  /* glsl */
  `
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
in vec2 vUv; in float vT; in float vA; in float vB; out vec4 o;
uniform float uLum;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float f = exp(-dot(p, p) * 2.5);
  // ho\u0159\xEDc\xED oharek (vB > 0): \u017Ehnou jen praskliny mezi zuhelnat\u011Bl\xFDmi \u0161upinami (alig\xE1to\u0159\xED k\u016F\u017Ee), ne cel\xFD povrch \u26053 (fotky)
  if (vB > 0.5) f *= 0.25 + 0.75 * smoothstep(0.35, 0.75, n3(vec3(p * 1.6, fract(vB) * 37.0)));
  // \xD72,5: bodov\xFD zdroj pod pixel oko vn\xEDm\xE1 jasn\u011Bji (osln\u011Bn\xED, Purkyn\u011B/Stiles\u2013Crawford) \u2013 um\u011Bleck\xE9 \u26052, D-021
  vec3 c = bbColor(vT) * f * vA * uLum * 2.5;
  if (vB < -0.5) { // pyrotechnick\xE1 hv\u011Bzdice: barvu d\xE1v\xE1 \u010D\xE1rov\xE9 spektrum kovov\xE9 soli, ne teplota (Sr, Ba, Cu, Na, Sr+Cu, b\xEDl\xE1)
    int k = int(-vB + 0.5);
    vec3 tint = k == 1 ? vec3(1.0, 0.07, 0.04) : k == 2 ? vec3(0.1, 1.0, 0.18) : k == 3 ? vec3(0.14, 0.3, 1.0) : k == 4 ? vec3(1.0, 0.7, 0.08) : k == 5 ? vec3(0.62, 0.18, 1.0) : vec3(1.0, 0.95, 0.88);
    c = tint * dot(bbColor(vT), vec3(0.2126, 0.7152, 0.0722)) * 1.6 * f * vA * uLum * 2.5;
  }
  o = fxOut(vec4(c, 0.0));
}`
);
var SparkSystem = class extends BaseSystem {
  constructor(capacity) {
    super(capacity);
    this.trail = null;
    this.trailMul = 1;
    const g2 = QUAD.clone();
    g2.instanceCount = 0;
    const mk = (n) => {
      const a = new THREE3.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE3.DynamicDrawUsage);
      return a;
    };
    this.aPS = mk(4);
    this.aV = mk(4);
    this.aT = mk(1);
    g2.setAttribute("iPS", this.aPS);
    g2.setAttribute("iV", this.aV);
    g2.setAttribute("iT", this.aT);
    this.geo = g2;
    this.mat = new THREE3.ShaderMaterial({
      vertexShader: SP_VS,
      fragmentShader: SP_FS,
      glslVersion: THREE3.GLSL3,
      uniforms: { ...sharedUniforms(), uPx: { value: 1e-3 }, uShutter: { value: 1 / 50 }, uLum: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE3.CustomBlending,
      blendSrc: THREE3.OneFactor,
      blendDst: THREE3.OneFactor
    });
    this.mesh = new THREE3.Mesh(g2, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_FX);
    this.mesh.renderOrder = 6;
  }
  /** Jiskra/uhlík: T0 [K], chladnutí τc [s], průměr d [m]. */
  spawn({ x, y, z, vx, vy, vz, life, T, tauC = 0.6, size = 2e-3, drag = 1.5, grav = 1, buoy = 0, ox, oz, pq = 0, pz0 = 0, seed, R0 = 0, ember = false, vt = 1, brand = 0, smokeRGB = null, star = 0 }) {
    const o = this.alloc();
    if (o < 0) return;
    const d = this.d;
    d[o + F.type] = star > 0 ? 3 : brand > 0 ? 2 : ember ? 1 : 0;
    d[o + F.tau0] = vt;
    d[o + F.cr] = star > 0 ? star : brand;
    d[o + F.cg] = smokeRGB ? smokeRGB[0] : 0.22;
    d[o + F.px] = x;
    d[o + F.py] = y;
    d[o + F.pz] = z;
    d[o + F.vx] = vx;
    d[o + F.vy] = vy;
    d[o + F.vz] = vz;
    d[o + F.life] = life;
    d[o + F.T0] = T;
    d[o + F.dT] = tauC;
    d[o + F.s0] = size;
    d[o + F.drag] = drag;
    d[o + F.grav] = grav;
    d[o + F.buoy] = buoy;
    d[o + F.seed] = seed ?? Math.random();
    d[o + F.ox] = ox ?? x;
    d[o + F.oz] = oz ?? z;
    d[o + F.pq] = pq;
    d[o + F.pz0] = pz0;
    d[o + F.glowR] = R0;
  }
  update(dt, air, camera) {
    this.integrate(dt, air);
    const d = this.d, n = this.n, PS = this.aPS.array, V6 = this.aV.array, T = this.aT.array;
    const kT = 1 - Math.exp(-dt / 0.4);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE, age = d[o + F.age], a01 = age / d[o + F.life], sd = d[o + F.seed];
      let Tk, sz = d[o + F.s0];
      const ty = d[o + F.type];
      if (ty === 2 && this.trail) {
        const flaming = a01 < d[o + F.cr], vx = d[o + F.vx], vy = d[o + F.vy], vz = d[o + F.vz];
        d[o + F.extra] += dt * (flaming ? 45 : 7) * this.trailMul;
        while (d[o + F.extra] >= 1) {
          d[o + F.extra] -= 1;
          const k = Math.random(), x = d[o] - vx * dt * k, y = d[o + 1] - vy * dt * k, z = d[o + 2] - vz * dt * k;
          if (flaming && Math.random() < 0.82) {
            this.trail.spawnFlame({
              x,
              y,
              z,
              vx: vx * 0.15,
              vy: 0.4 + Math.max(0, vy) * 0.1,
              vz: vz * 0.15,
              life: 0.1 + 0.12 * Math.random(),
              s0: sz * 2.2,
              s1: sz * 3.5,
              T: 1250 + 120 * Math.random(),
              lum: 0.8,
              drag: 0.08,
              buoy: 1.5,
              stretch: 1.6,
              seed: Math.random()
            });
          } else {
            const g2 = d[o + F.cg];
            this.trail.spawnSmoke({
              x,
              y,
              z,
              vx: vx * 0.1,
              vy: 0.25,
              vz: vz * 0.1,
              life: 1.2 + Math.random(),
              s0: sz * 1.5,
              s1: sz * 10 + 0.04,
              tau: flaming ? 0.5 : 0.25,
              albedo: [g2, g2 * 0.96, g2 * 0.92],
              drag: 0.25,
              buoy: 0.6,
              seed: Math.random()
            });
          }
        }
      }
      if (ty === 1 || ty === 2) {
        const vx = d[o + F.vx], vy = d[o + F.vy], vz = d[o + F.vz];
        const vrel = d[o + F.tau0] + 0.3 * Math.sqrt(vx * vx + vy * vy + vz * vz);
        const Teq = Math.min(1340, 880 + 150 * Math.sqrt(vrel));
        d[o + F.T0] += (Teq - d[o + F.T0]) * kT;
        const slot = Math.floor(age * 2.5 + sd * 17), hsh = Math.sin(slot * 127.1 + sd * 311.7) * 43758.5453 % 1;
        const ash = Math.abs(hsh) < 0.18 ? 0.82 : 1;
        const burn = a01 > 0.75 ? 1 - (a01 - 0.75) * 4 : 1;
        Tk = (700 + (d[o + F.T0] - 700) * burn) * ash * (1 + 0.04 * Math.sin(age * 31 + sd * 40));
        sz *= 0.55 + 0.45 * burn;
      } else if (ty === 3) {
        Tk = d[o + F.T0] * (1 - Math.max(0, a01 - 0.8) * 2.5) * (1 + 0.12 * Math.sin(age * 41 + sd * 40));
      } else {
        Tk = 600 + (d[o + F.T0] - 600) * Math.exp(-age / d[o + F.dT]);
        Tk *= (1 + 0.25 * Math.sin(age * 23 + sd * 40)) * (1 - Math.max(0, a01 - 0.85) * 2);
      }
      PS[i * 4] = d[o];
      PS[i * 4 + 1] = d[o + 1];
      PS[i * 4 + 2] = d[o + 2];
      PS[i * 4 + 3] = sz;
      V6[i * 4] = d[o + F.vx];
      V6[i * 4 + 1] = d[o + F.vy];
      V6[i * 4 + 2] = d[o + F.vz];
      V6[i * 4 + 3] = ty === 2 ? 1 + sd * 0.99 : ty === 3 ? -d[o + F.cr] : 0;
      T[i] = Tk;
    }
    this.geo.instanceCount = n;
    const h2 = camera.isPerspectiveCamera ? Math.tan(camera.fov * Math.PI / 360) * 2 : 1;
    this.mat.uniforms.uPx.value = h2 / Math.max(1, this.viewportH || 720);
    for (const a of [this.aPS, this.aV, this.aT]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
};
var HZ_VS = (
  /* glsl */
  `
in vec4 iPS; in vec2 iA; out vec2 vUv; out vec2 vA; out vec3 vW;
void main(){
  vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = iPS.xyz + (cr * position.x + cu * position.y) * iPS.w;
  vW = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vUv = position.xy + 0.5; vA = iA;
}`
);
var HZ_FS = (
  /* glsl */
  `
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
in vec2 vUv; in vec2 vA; in vec3 vW; out vec4 o;
uniform float uTime, uStrength;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float f = exp(-dot(p, p) * 2.0) * (1.0 - smoothstep(0.85, 1.0, vA.x));
  vec3 q = vW * 0.9 - vec3(0.0, uTime * 2.2, 0.0);
  vec2 n = vec2(n3(q * 0.21) - 0.5, n3(q * 0.21 + 0.37) - 0.5);
  if (vA.y > 0.5) { // r\xE1zov\xE1 vlna: radi\xE1ln\xED posun (prstenec) \u2013 uv kladn\xE9 sm\u011Brem ven
    o = vec4(p * f * uStrength * 0.02, 0.0, 1.0);
    return;
  }
  o = vec4(n * f * uStrength * 0.012, 0.0, 1.0);
}`
);
var HazeSystem = class extends BaseSystem {
  constructor(capacity) {
    super(capacity);
    const g2 = QUAD.clone();
    g2.instanceCount = 0;
    const mk = (n) => {
      const a = new THREE3.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE3.DynamicDrawUsage);
      return a;
    };
    this.aPS = mk(4);
    this.aA = mk(2);
    g2.setAttribute("iPS", this.aPS);
    g2.setAttribute("iA", this.aA);
    this.geo = g2;
    this.mat = new THREE3.ShaderMaterial({
      vertexShader: HZ_VS,
      fragmentShader: HZ_FS,
      glslVersion: THREE3.GLSL3,
      uniforms: { ...sharedUniforms(), uTime: { value: 0 }, uStrength: { value: 1 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE3.CustomBlending,
      blendSrc: THREE3.OneFactor,
      blendDst: THREE3.OneFactor
    });
    this.mesh = new THREE3.Mesh(g2, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_HAZE);
  }
  spawn({ x, y, z, vy = 1, life = 1.5, size = 1, ox, oz, pq = 0, pz0 = 0, ring = 0, R0 = 0 }) {
    const o = this.alloc();
    if (o < 0) return;
    const d = this.d;
    d[o + F.px] = x;
    d[o + F.py] = y;
    d[o + F.pz] = z;
    d[o + F.vy] = vy;
    d[o + F.life] = life;
    d[o + F.s0] = size;
    d[o + F.drag] = 0.3;
    d[o + F.ox] = ox ?? x;
    d[o + F.oz] = oz ?? z;
    d[o + F.pq] = pq;
    d[o + F.pz0] = pz0;
    d[o + F.extra] = ring;
    d[o + F.glowR] = R0;
    d[o + F.seed] = Math.random();
  }
  update(dt, air, time) {
    this.integrate(dt, air);
    const d = this.d, n = this.n, PS = this.aPS.array, A = this.aA.array;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE, a01 = d[o + F.age] / d[o + F.life];
      PS[i * 4] = d[o];
      PS[i * 4 + 1] = d[o + 1];
      PS[i * 4 + 2] = d[o + 2];
      PS[i * 4 + 3] = d[o + F.s0] * (1 + a01 * 0.8);
      A[i * 2] = a01;
      A[i * 2 + 1] = d[o + F.extra];
    }
    this.geo.instanceCount = n;
    this.mat.uniforms.uTime.value = time;
    for (const a of [this.aPS, this.aA]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
};

// src/fx/smokeVolume.js
import * as THREE4 from "three";
var VS2 = (
  /* glsl */
  `
out vec3 vWorld;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`
);
var FS = (
  /* glsl */
  `
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
in vec3 vWorld;
layout(location = 0) out vec4 fragColor;
#ifdef VOL_MRT
layout(location = 1) out vec4 fragDist;
#endif
uniform mat4 uInvModel;
uniform vec3 uScale, uCamPos, uAlb, uAmb, uSun, uSunDir, uGlowCol, uGlowPos;
uniform float uTime, uSeed, uSteps, uStepLen, uFrame;
uniform float uB0, uDb, uSig0, uBref, uEddy, uRise, uBend, uGlowK, uFade, uGlowR2;
#ifdef USE_DEPTH
uniform sampler2D tDepth; uniform vec2 uDepthRes;
#endif
vec2 boxHit(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / rd;
  vec3 t0 = (vec3(-0.5, 0.0, -0.5) - ro) * inv, t1 = (vec3(0.5, 1.0, 0.5) - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}
// hustota (extinkce \u03C3 [1/m]) v bod\u011B objektov\xE9ho prostoru kv\xE1dru
float sigmaAt(vec3 p){
  float zm = p.y * uScale.y;                                 // v\xFD\u0161ka nad patou objemu [m]
  float b = uB0 + uDb * zm;                                  // polom\u011Br sloupce [m]
  vec3 w = p * uScale;
  float ax = -0.5 * uScale.x + uB0 * 2.1 + uBend * pow(p.y, 1.5) * uScale.x;  // osa (ohyb po v\u011Btru, osa x kv\xE1dru)
  vec2 d = vec2(w.x - ax, w.z);
  float r2 = dot(d, d) / (b * b);
  if (r2 > 4.0) return 0.0;  // kv\xE1dr m\xE1 polom\u011Br \u2265 2,1 b \u2192 okraj kv\xE1dru nen\xED vid\u011Bt
  vec3 q = vec3(w.x, w.y - uRise * uTime, w.z) / uEddy + vec3(uSeed * 3.7, 0.0, uSeed * 1.3);
  vec3 wq = q + (vec3(n3(q * 0.11), n3(q * 0.11 + 0.31), n3(q * 0.11 + 0.67)) - 0.5) * 1.6;
  float n = fbm3(wq * 0.17);
  float prof = exp(-r2 * (1.0 + 0.8 * (n - 0.5)));
  float dens = max(prof * (0.35 + 1.3 * smoothstep(0.25, 0.75, n)) - 0.02, 0.0);
  // n\xE1b\u011Bh nad plamenem a \xFAtlum u stropu kv\xE1dru (\u017E\xE1dn\xE1 viditeln\xE1 hranice)
  dens *= smoothstep(0.0, 0.1, p.y) * (1.0 - smoothstep(0.7, 1.0, p.y));
  return dens * uSig0 * (uBref * uBref) / (b * b);           // \u03C4 \u221D 1/b \u2192 \u03C3 \u221D 1/b\xB2
}
void main(){
  vec3 rdW = normalize(vWorld - uCamPos);
  vec3 ro = (uInvModel * vec4(uCamPos, 1.0)).xyz, rd = (uInvModel * vec4(rdW, 0.0)).xyz;
  float rl = length(rd); rd /= rl;                           // objektov\xFD prostor je jednotkov\xFD kv\xE1dr \u2192 p\u0159epo\u010Det d\xE9lek
  vec2 tt = boxHit(ro, rd);
  float t0 = max(tt.x, 0.0), t1 = tt.y;
#ifdef USE_DEPTH
  float sceneZ = texture(tDepth, gl_FragCoord.xy / uDepthRes).r;
  t1 = min(t1, sceneZ * 1.02 * rl / max(dot(rdW, normalize(-vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))), 0.05));
#endif
  if (t1 <= t0) discard;
  float lenW = (t1 - t0) / rl;                               // d\xE9lka \xFAseku ve sv\u011Bt\u011B [m]
  float steps = clamp(ceil(lenW / max(uStepLen, 1e-3)), 8.0, uSteps);
  float dt = (t1 - t0) / steps, dtW = dt / rl;
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uFrame * 0.61803398);
  float t = t0 + dt * j;
  vec3 sunO = (uInvModel * vec4(uSunDir, 0.0)).xyz;          // 1 m ke slunci v objektov\xE9m prostoru
  vec3 gpos = (uInvModel * vec4(uGlowPos, 1.0)).xyz;
  float cosT = dot(rdW, uSunDir), g = 0.4;
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5) * 0.5;   // HG normovan\xE9 na ~1 pro izotropn\xED
  vec3 col = vec3(0.0); float trans = 1.0, dW = 0.0;
  for (int i = 0; i < 96; i++) {
    if (float(i) >= steps || trans < 0.02) break;
    vec3 p = ro + rd * t;
    float s = sigmaAt(p);
    if (s > 1e-4) {
      // st\xEDn ke slunci (4 kroky, d\xE9lka ~ polom\u011Br sloupce)
      float sh = 0.0, ls = (uB0 + uDb * p.y * uScale.y) * 0.6;
      for (int k = 1; k <= 4; k++) { vec3 ps = p + sunO * (float(k) * ls); if (ps.y > 1.0) break; sh += sigmaAt(ps) * ls; }
      float sunVis = exp(-sh);
      // podsv\xEDcen\xED ohn\u011Bm: k pat\u011B (3 kroky), \xFAtlum vzd\xE1lenost\xED
      vec3 toF = gpos - p; float dF = length(toF * uScale);
      float gsh = 0.0;
      for (int k = 1; k <= 3; k++) { vec3 pf = p + toF * (float(k) / 4.0); gsh += sigmaAt(pf) * dF / 4.0; }
      vec3 glow = uGlowCol / (dF * dF + uGlowR2) * exp(-gsh * uGlowK);
      vec3 Ls = uAlb * (uAmb * (0.55 + 0.45 * sunVis) + uSun * sunVis * phase + glow) * uPreExp;
      float a = exp(-s * dtW);
      col += trans * (1.0 - a) * Ls;
      dW += trans * (1.0 - a) * t / rl;
      trans *= a;
    }
    t += dt;
  }
  float al = (1.0 - trans) * uFade;
  fragColor = fxOut(vec4(col * uFade, al));
#ifdef VOL_MRT
  fragDist = vec4(dW * uFade, 0.0, 0.0, al);
#endif
}`
);
var BOX = new THREE4.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
var _vp = new THREE4.Vector4();
var SmokeVolume = class {
  constructor({ depth = null, steps = 48, mrt = false } = {}) {
    const defines = {};
    if (mrt) defines.VOL_MRT = 1;
    if (depth) defines.USE_DEPTH = 1;
    const u = {
      ...sharedUniforms(),
      uInvModel: { value: new THREE4.Matrix4() },
      uScale: { value: new THREE4.Vector3(1, 1, 1) },
      uCamPos: { value: new THREE4.Vector3() },
      uAlb: { value: new THREE4.Color(0.2, 0.2, 0.2) },
      uAmb: { value: new THREE4.Color() },
      uSun: { value: new THREE4.Color() },
      uSunDir: { value: new THREE4.Vector3(0.3, 1, 0.2).normalize() },
      uGlowCol: { value: new THREE4.Color() },
      uGlowPos: { value: new THREE4.Vector3(0, 0, 0) },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uSteps: { value: steps },
      uStepLen: { value: 0.3 },
      uFrame: { value: 0 },
      uB0: { value: 0.3 },
      uDb: { value: 0.12 },
      uSig0: { value: 1 },
      uBref: { value: 0.5 },
      uEddy: { value: 1 },
      uRise: { value: 2 },
      uBend: { value: 0 },
      uGlowK: { value: 1 },
      uFade: { value: 1 },
      uGlowR2: { value: 1 },
      tDepth: { value: depth },
      uDepthRes: { value: new THREE4.Vector2(1, 1) }
    };
    this.mat = new THREE4.ShaderMaterial({
      vertexShader: VS2,
      fragmentShader: FS,
      uniforms: u,
      defines,
      glslVersion: THREE4.GLSL3,
      transparent: true,
      depthWrite: false,
      side: THREE4.BackSide,
      blending: THREE4.CustomBlending,
      blendSrc: THREE4.OneFactor,
      blendDst: THREE4.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE4.OneFactor,
      blendDstAlpha: THREE4.OneMinusSrcAlphaFactor
    });
    this.mesh = new THREE4.Mesh(BOX, this.mat);
    this.mesh.layers.set(mrt ? LAYER_VOL : LAYER_FX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (r, s, cam) => {
      this.mesh.updateMatrixWorld();
      u.uInvModel.value.copy(this.mesh.matrixWorld).invert();
      u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
      u.uFrame.value = (u.uFrame.value + 1) % 1024;
      if (u.tDepth.value) {
        const img = u.tDepth.value.image;
        u.uDepthRes.value.set(img.width, img.height);
      }
    };
  }
  get u() {
    return this.mat.uniforms;
  }
  /**
   * Umístí sloup: pata `base` (nad plamenem), výška H [m], poloměr u paty b0 [m], ohyb lean [m] na vršku po větru windDir.
   * glowPos = poloha ohně (svět), glowCol = barva × intenzita [cd] světla ohně.
   */
  place(base, H, b0, lean, windDir) {
    const db = 0.12, bTop = b0 + db * H;
    const Wx = 4.2 * bTop + Math.max(lean, 0) + b0, Wz = 4.2 * bTop;
    const shift = Wx / 2 - 2.1 * b0;
    this.mesh.position.set(base.x + Math.cos(windDir) * shift, base.y, base.z + Math.sin(windDir) * shift);
    this.mesh.rotation.set(0, -windDir, 0);
    this.mesh.scale.set(Wx, H, Wz);
    const u = this.u;
    u.uScale.value.set(Wx, H, Wz);
    u.uB0.value = b0;
    u.uDb.value = db;
    u.uBend.value = lean / Wx;
    u.uStepLen.value = Math.max(0.05, Math.min(Wz, H) / 40);
  }
};

// src/fx/volume.js
import * as THREE5 from "three";
var VS3 = (
  /* glsl */
  `
out vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
);
var VOLUME_FIELDS = (
  /* glsl */
  `
uniform vec3 uScale;         // rozm\u011Br kv\xE1dru ve sv\u011Bt\u011B [m]
uniform float uTime, uSeed, uSteps;
uniform float uTpeak, uTamb, uIntensity;
uniform vec4 uShape;         // x: polom\u011Br osy (norm. k \u0161\xED\u0159ce), y: z\xFA\u017Een\xED, z: roz\u0161\xED\u0159en\xED paty, w: hrdlo
uniform float uAxis0, uShear; // osa: x = uAxis0 + uShear * y
uniform float uRz;           // polom\u011Br v z (norm.)
uniform vec4 uTurb;          // x: amplituda, y: velikost v\xEDru [m], z: rychlost stoup\xE1n\xED [m/s], w: zvln\u011Bn\xED
uniform vec2 uPuff;          // x: frekvence [Hz], y: amplituda
uniform float uSoot, uBlue, uSigma, uLift;
uniform float uAge;          // ohniv\xE1 koule: 0..1 pr\u016Fb\u011Bh
uniform float uLoopT;        // >0: periodick\xE1 smy\u010Dka (bake)
uniform vec2 uRes;
uniform vec4 uFlame2;        // x: \u03BA sv\xEDtiv\xFDch saz\xED p\u0159i 1 500 K [1/m] (\u2248 2,7\xB7fv[ppm]), y: pl\xE1\u0161\u0165 kou\u0159e velk\xFDch po\u017E\xE1r\u016F 0..1, z: ostrost okraje, w: ohyb pole
uniform float uFlowL;        // d\xE9lka plamene [m] pro advekci s urychlen\xEDm u \u221D \u221Az
uniform float uDetail;       // 0..2 po\u010Det jemn\xFDch okt\xE1v (stupn\u011B kvality)
uniform float uShapeK;       // tvar ob\xE1lky: 1 ku\u017Eel, ~2 sloup velk\xE9 lou\u017Ee
uniform float uTongues;      // po\u010Det samostatn\xFDch jazyk\u016F (0 = jen ob\xE1lka \u2013 sv\xED\u010Dka, lou\u010D)
uniform float uPixAng;       // \xFAhel jednoho pixelu [rad] (stopa vzorku = t\xB7uPixAng)

// Advekce s urychlen\xEDm (McCaffrey: v souvisl\xE9 z\xF3n\u011B u \u221D \u221Az): sou\u0159adnice \u0161umu = \u010Das letu od paty.
// \xDAtvar ve v\xFD\u0161ce z se pohybuje rychlost\xED U\xB7\u221A(z/L) a natahuje se svisle \u2013 jazyky \u201Evyst\u0159eluj\xED\u201C vzh\u016Fru.
// z0 = 0,15 L: virtu\xE1ln\xED po\u010D\xE1tek \u2013 bez n\u011Bj se u paty \u0161um nekone\u010Dn\u011B stla\u010D\xED do vodorovn\xFDch \u201Epl\xE1st\u016F\u201C (\xFAl).
float tof(float zm){ float L = max(uFlowL, 0.01), z0 = 0.15 * L; return 2.0 * (sqrt((max(zm, 0.0) + z0) * L) - sqrt(z0 * L)); }
vec3 flowQ(vec3 w, float tt){
  float s = uTurb.y;
  return vec3(w.x / s, (uTurb.z * tt - tof(w.y)) / s, w.z / s) * 0.17 + vec3(uSeed * 3.1, 0.0, uSeed * 1.7);
}
// Antialiasovan\xFD \u0161um: okt\xE1va men\u0161\xED ne\u017E stopa vzorku (pixel ve vzd\xE1lenosti t, nebo krok paprsku) se plynule
// nahrad\xED st\u0159edn\xED hodnotou \u2192 \u017E\xE1dn\xE1 \u201Esrst\u201C z podvzorkovan\xFDch okt\xE1v, a z\xE1rove\u0148 levn\u011Bji (m\xE9n\u011B \u010Dten\xED textury).
float gFpq = 0.0; // stopa vzorku v jednotk\xE1ch q (nastavuje main p\u0159ed vol\xE1n\xEDm pole)
float gBlue = 1.0;   // maska modr\xE9 z\xF3ny (lamin\xE1rn\xED plamen: jen tenk\xFD pl\xE1t na pl\xE1\u0161ti)
float octv(vec3 q, float amp, float cell){
  float wk = 1.0 - smoothstep(0.35, 1.0, gFpq * cell);
  return amp * (wk > 0.001 ? mix(0.5, n3(q), wk) : 0.5);
}
float fbmD(vec3 q, float s){ // fbm s po\u010Dtem okt\xE1v podle stupn\u011B; s = m\u011B\u0159\xEDtko frekvence v\u016F\u010Di z\xE1kladu
  float c = 16.0 * s;
  // persistence ~0,45: jemn\xE9 okt\xE1vy slab\u0161\xED \u2013 plamen m\xE1 ostr\xE9 plochy, ne \u201Esrst\u201C (iterace 2)
  float v = octv(q, 0.5, c) + octv(q * 2.03 + 0.17, 0.26, c * 2.03) + octv(q * 4.07 + 0.41, 0.115, c * 4.07), w = 0.875;
  if (uDetail > 0.5) { v += octv(q * 8.13 + 0.73, 0.05, c * 8.13); w += 0.05; }
  if (uDetail > 1.5) { v += octv(q * 16.3 + 0.29, 0.022, c * 16.3); w += 0.022; }
  return v / w;
}
// ohnut\xE9 pole (domain warp) \u2013 skl\xE1d\xE1 plamen do tenk\xFDch zvln\u011Bn\xFDch pl\xE1t\u016F
vec4 flameNoise(vec3 w, float tt){
  vec3 q = flowQ(w, tt);
  vec3 wv = vec3(n3(q * 0.5 + 0.11), n3(q * 0.5 + 0.43), n3(q * 0.5 + 0.77)) - 0.5;
  vec3 wq = q + wv * uFlame2.w * 1.6;
  float n1 = fbmD(wq, 1.0);
  float n2 = fbmD(wq * 1.7 + vec3(5.2, 1.3, 2.8), 1.7);
  // n\xEDzk\xE1 frekvence: d\u011Bl\xED plamen na 3\u20137 samostatn\xFDch jazyk\u016F s mezerami (fotky: jazyky s ostrou hranou, ne \u201Esrst\u201C)
  float nL = 0.62 * n3(wq * 0.42 + vec3(9.1, 2.0, 4.4)) + 0.38 * n3(wq * 0.86 + vec3(3.3, 7.7, 1.9));
  return vec4(n1, n2, nL, wv.x);
}
vec4 flameNoiseLoop(vec3 w){
  if (uLoopT <= 0.0) return flameNoise(w, uTime);
  float ph = mod(uTime, uLoopT) / uLoopT;
  vec4 a = flameNoise(w, ph * uLoopT);
  vec4 b = flameNoise(w + vec3(0.37, 0.0, 0.11) * uTurb.y * 6.0, (ph - 1.0) * uLoopT);
  return mix(a, b, smoothstep(0.0, 1.0, ph));
}

// Samostatn\xE9 jazyky (iterace 4 podle fotek): plamen t\xE1bor\xE1ku nen\xED jedna ob\xE1lka, ale 3\u20137 jazyk\u016F z mezer v palivu,
// dole spl\xFDvaj\xED, naho\u0159e se rozch\xE1zej\xED a ka\u017Ed\xFD m\xE1 vlastn\xED v\xFD\u0161ku a mihot\xE1n\xED. Pracuje v normovan\xE9 rovin\u011B (1 = polom\u011Br).
float tongues(vec2 q2, float y, float nL, float n2){
  float best = -10.0;
  for (int i = 0; i < 7; i++) {
    if (float(i) >= uTongues) break;
    float fi = float(i);
    float h1 = fract(sin(fi * 12.9898 + uSeed * 78.233) * 43758.5453);
    float h2 = fract(sin(fi * 39.3468 + uSeed * 11.135) * 24634.6345);
    float h3 = fract(sin(fi * 73.156 + uSeed * 52.235) * 13758.937);
    float ang = 6.2832 * (fi / uTongues + 0.25 * h1);
    float H = (0.7 + 0.45 * h3) * (1.0 + 0.2 * sin(6.2832 * uPuff.x * (0.6 + 0.5 * h1) * uTime + fi * 2.1) + 0.25 * (nL - 0.5));
    float yy = y / max(H, 0.05);
    if (yy > 1.0) continue;
    vec2 c = (0.25 + 0.4 * h2) * vec2(cos(ang), sin(ang)) * (1.0 - 0.7 * yy) + vec2(n2 - 0.5, nL - 0.5) * 0.5 * yy;
    float ri = (0.26 + 0.16 * h2) * pow(1.0 - yy, 0.45) * (1.0 + 0.5 * exp(-yy * 6.0));
    best = max(best, ri - length(q2 - c));
  }
  return best;
}

// vrac\xED (sv\xEDtiv\xE1 hustota 0..1, teplota [K], saze bez emise 0..1)
vec3 fieldFlame(vec3 p){
  float y = p.y;
  // ob\xE1lka bez \u0161umu \u2192 p\u0159esko\u010Den\xED pr\xE1zdna (levn\xE9, v\u011Bt\u0161ina vzork\u016F mimo plamen)
  // velk\xE9 lou\u017Ee (L/D < 3): sloup \u0161irok\xFD skoro do p\u016Fli v\xFD\u0161ky, pak se rozpad\xE1; \u0161t\xEDhl\xE9 plameny: ku\u017Eel (uShapeK = 1)
  float prof = pow(clamp(1.0 - pow(max(y, 0.0), uShapeK), 0.0, 1.0), uShape.y) * (1.0 + uShape.z * exp(-y * 9.0));
  prof *= mix(1.0, clamp(sqrt(y * 6.0 + 0.15), 0.0, 1.0), uShape.w);
  float axBase = uAxis0 + uShear * y;
  float wobMax = uTurb.w * y * 0.6 + 0.02;
  float rx = max(abs(p.x - axBase) - wobMax, 0.0) / uShape.x, rz = max(abs(p.z) - wobMax, 0.0) / uRz;
  float amp = uTurb.x * (0.35 + 1.4 * y) * 0.6 + 0.12 + uFlame2.y * 0.3;
  if (prof + amp - length(vec2(rx, rz)) < 0.0) return vec3(0.0, uTamb, 0.0);
  vec3 w = p * uScale;
  vec4 N = flameNoiseLoop(w);
  float n1 = N.x, n2 = N.y, nL = N.z;
  // vln\u011Bn\xED osy (jazyk) \u2013 velk\xE9 m\u011B\u0159\xEDtko z ohybov\xE9ho pole
  float wob = (n2 - 0.5) * uTurb.w * y + N.w * uTurb.w * y * 0.6;
  float ax = axBase + wob;
  float az = (n1 - 0.5) * uTurb.w * y * 0.6;
  vec2 d2 = vec2((p.x - ax) / uShape.x, (p.z - az) / uRz);
  float r = length(d2);
  // pulzace: toroidn\xED v\xEDry stoupaj\xEDc\xED rychlost\xED ~ U (Cetegen & Ahmed)
  float puff = sin(6.2832 * (uPuff.x * uTime - tof(w.y) / max(uFlowL, 0.01) * 0.8)) * uPuff.y;
  // jazyky: velk\xE9 m\u011B\u0159\xEDtko (nL) d\u011Bl\xED ob\xE1lku, jemn\xE9 okt\xE1vy jen vln\xED okraj (iterace 4 podle fotek)
  float dd = prof * (1.0 + 0.25 * puff * y) - r + (nL - 0.5) * uTurb.x * (0.5 + 2.0 * y) * 1.3;
  if (uTongues > 0.5) {
    // ob\xE1lka dr\u017E\xED jen spojenou patu, v\xFD\u0161 jsou samostatn\xE9 jazyky
    float tg = tongues(d2, y, nL, n2) + (nL - 0.5) * uTurb.x * (0.2 + 0.6 * y);
    dd = max(dd - smoothstep(0.06, 0.32, y) * 0.8, tg);
  }
  dd += (n1 - 0.5) * uTurb.x * (0.12 + 0.3 * y) + (n2 - 0.5) * uTurb.x * 0.1;
  // p\u0159eru\u0161ovan\xE1 z\xF3na (McCaffrey \u03B7 0,08\u20130,2): odtrh\xE1v\xE1n\xED cel\xFDch jazyk\u016F, ne vl\xE1ken
  // lamin\xE1rn\xED plamen (sv\xED\u010Dka, mal\xFD knot): hladk\xE1 kapka bez odtrh\xE1v\xE1n\xED (Re < ~2000)
  float lam = 1.0 - smoothstep(0.03, 0.08, uTurb.x);
  dd -= smoothstep(0.45, 0.98, y) * smoothstep(0.45, 0.6, nL + 0.3 * (n2 - 0.5)) * 0.3 * (1.0 - lam);
  // velk\xE9 po\u017E\xE1ry: p\u0159eru\u0161ovan\xE1 z\xF3na za\u010D\xEDn\xE1 n\xED\u017E (\u03B7 \u2248 0,4 L) a trh\xE1 sloup na samostatn\xE9 jazyky s tmav\xFDmi mezerami
  dd -= (uShapeK - 1.0) * smoothstep(0.28, 0.85, y) * smoothstep(0.44, 0.6, nL + 0.3 * (n1 - 0.5)) * 0.45;
  // nedostatek kysl\xEDku: odtr\u017Een\xE9 l\xEDn\xE9 jazyky
  dd -= uLift * smoothstep(0.55, 0.8, n2) * 0.4 * y;
  float edge = uFlame2.z;
  // plamenn\xFD pl\xE1t: saze vznikaj\xED v tenk\xE9 vrstv\u011B u \u010Dela plamene \u2192 jasn\u011Bj\u0161\xED lem a ostr\xE1 hranice (limb brightening)
  float dens = smoothstep(0.0, edge, dd) * (1.0 + 0.8 * exp(-max(dd, 0.0) / 0.1));
  float core = smoothstep(0.1, 0.5, dd);
  // zat\xED\u017Een\xED sazemi kol\xEDs\xE1 (pruhy hust\xFDch a \u0159\xEDdk\xFDch saz\xED) \u2192 pr\u016Fhledn\xE9 mezery mezi jazyky
  float big = clamp(uShapeK - 1.0, 0.0, 1.0);
  dens *= mix(mix(0.8 + 0.2 * smoothstep(0.3, 0.7, n1), 1.0, lam), smoothstep(0.4, 0.62, nL + 0.2 * (n2 - 0.5)), big * 0.7);
  // sv\xED\u010Dka: tmav\xE9 j\xE1dro par paliva nad knotem (ku\u017Eel do ~30 % v\xFD\u0161ky) a sv\xEDtiv\xE1 z\xF3na a\u017E nad modr\xFDm kalichem \u26053 (Faraday; fotky)
  gBlue = mix(1.0, step(0.0, dd) * exp(-max(dd, 0.0) / 0.07), lam);
  float inner = prof * 0.7 * (1.0 - y / 0.4);
  dens *= mix(1.0, (0.08 + 0.92 * smoothstep(inner - 0.04, inner + 0.15, r)) * (0.04 + 0.96 * smoothstep(0.06, 0.34, y)), lam);
  // teplota: reak\u010Dn\xED z\xF3na na pl\xE1\u0161ti; hork\xE9 prou\u017Eky; u paty velk\xFDch po\u017E\xE1r\u016F chladn\xE9 tmav\xE9 j\xE1dro par paliva
  // okraje a tenk\xE9 \u0161pi\u010Dky chladn\u011Bj\u0161\xED (oran\u017Eov\xE9), tlust\xE9 \u010D\xE1sti hork\xE9 (\u017Elut\xE9) \u2013 jako na fotk\xE1ch
  float zone = smoothstep(0.0, 0.22, dd) * (1.0 - 0.5 * core * exp(-y * 4.0) * (0.4 + uFlame2.y));
  float hotStreak = mix(smoothstep(0.38, 0.78, 0.55 * nL + 0.45 * n2), 0.8, lam);
  float T = uTamb + (uTpeak - uTamb) * pow(zone, 0.8) * mix(0.66 - 0.06 * big, 1.04, hotStreak) * (1.0 - mix(0.3, 0.12, lam) * pow(y, 1.5));
  T *= mix(1.0, 0.8 + 0.2 * smoothstep(0.03, 0.28, y), lam);
  // velk\xE9 sazov\xE9 po\u017E\xE1ry (Steinhaus, Takahashi): vn\u011Bj\u0161\xED vrstva saz\xED, sv\u011Btlo pror\xE1\u017Eej\xED jen \u201Eluminous zones\u201C
  float shell = uFlame2.y * (1.0 - core) * smoothstep(0.15, 0.55, y + 0.25 * n1);
  float lumPatch = smoothstep(0.52, 0.64, 0.5 * n1 + 0.5 * nL + 0.03);
  dens *= mix(1.0, 0.15 + 0.85 * lumPatch, shell);
  // saze: nad \u0161pi\u010Dkou dohas\xEDnaj\xEDc\xED plamen a pl\xE1\u0161\u0165
  float soot = uSoot * smoothstep(0.35, 0.95, y) * smoothstep(-0.12, 0.08, dd) * (1.0 - core * 0.5);
  soot += shell * (1.0 - lumPatch) * smoothstep(-0.2, 0.05, dd) * 1.2;
  // chladn\xE9 sazov\xE9 kapsy uvnit\u0159 velk\xFDch plamen\u016F (tmav\xE9 skvrny ve 2. polovin\u011B v\xFD\u0161ky)
  soot += big * uSoot * smoothstep(0.25, 0.6, y) * smoothstep(0.6, 0.8, 1.0 - n2) * smoothstep(0.0, 0.1, dd) * 0.8;
  return vec3(dens, T, soot);
}

vec3 fieldBall(vec3 p){
  // koule ve st\u0159edu kv\xE1dru; pole \u201Ekv\u011Bt\xE1k" z Worleyho \u0161umu, chladne a \u010Dern\xE1 s v\u011Bkem
  vec3 c = p - vec3(0.0, 0.5, 0.0);
  float r = length(c) * 2.0;                          // 0..1 = polom\u011Br
  vec3 w = p * uScale;
  vec3 q = w / uTurb.y * 0.17 + vec3(uSeed);
  float rise = uTime * uTurb.z / uTurb.y * 0.17;
  float b1 = w3(q * 0.9 - vec3(0.0, rise, 0.0));
  float b2 = w3(q * 2.1 + vec3(1.7, -rise * 1.5, 0.4));
  float n = fbm3(q * 1.7 + vec3(0.0, -rise, 0.0));
  float shell = 0.78 + 0.22 * uAge;
  float dd = shell - r + (b1 - 0.55) * 0.55 + (b2 - 0.5) * 0.25 + (n - 0.5) * 0.2;
  float dens = smoothstep(0.0, 0.15, dd);
  float hot = 1.0 - smoothstep(0.05, 1.05, uAge * 0.85 + r * 0.3 - (b1 - 0.5) * 0.6);
  float T = uTamb + (uTpeak - uTamb) * hot * dens;
  float soot = uSoot * dens * (1.0 - hot) * (1.0 - hot) * smoothstep(0.25, 0.8, uAge + (0.6 - b1) * 0.4);
  return vec3(dens, T, soot);
}

`
);
var VOLUME_FS = (
  /* glsl */
  `
precision highp float;
precision highp sampler3D;
${GLSL_COMMON}
${VOLUME_FIELDS}
in vec3 vWorld;
#ifdef VOL_MRT
// \u010Dasov\xE1 akumulace (T3+): druh\xFD v\xFDstup = vzd\xE1lenost pod\xE9l paprsku v\xE1\u017Een\xE1 kryt\xEDm (p\u0159edvyn\xE1soben\xE1 jako barva)
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragDist;
#else
out vec4 fragColor;
#endif
uniform mat4 uInvModel;
#ifdef USE_DEPTH
uniform sampler2D tDepth; uniform vec2 uDepthRes;
#endif
uniform vec3 uCamPos;
uniform float uStepLen, uFrame, uSigmaSoot;
vec2 boxHit(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / rd;
  vec3 t0 = (vec3(-0.5, 0.0, -0.5) - ro) * inv, t1 = (vec3(0.5, 1.0, 0.5) - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

void main(){
  vec3 roW = uCamPos;
  vec3 rdW = normalize(vWorld - uCamPos);
  vec3 ro = (uInvModel * vec4(roW, 1.0)).xyz;
  vec3 rd = (uInvModel * vec4(rdW, 0.0)).xyz;
  vec2 tt = boxHit(ro, rd);
  float t0 = max(tt.x, 0.0), t1 = tt.y;
#ifdef USE_DEPTH
  float sceneZ = texture(tDepth, gl_FragCoord.xy / uDepthRes).r;
  // p\u0159evod line\xE1rn\xED hloubky (pod\xE9l osy kamery) na vzd\xE1lenost pod\xE9l paprsku \u2013 p\u0159ibli\u017En\u011B p\u0159es cos \xFAhlu
  t1 = min(t1, sceneZ * 1.02 / max(dot(rdW, normalize(-vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))), 0.05));
#endif
  if (t1 <= t0) discard;
  // d\xE9lka kroku: c\xEDl uStepLen [m], strop uSteps; prokl\xE1dan\xFD gradientn\xED \u0161um + zlat\xFD \u0159ez v \u010Dase (m\xE9n\u011B pruh\u016F)
  float steps = clamp(ceil((t1 - t0) / max(uStepLen, 1e-4)), 6.0, uSteps);
  float dt = (t1 - t0) / steps;
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uFrame * 0.61803398);
  float t = t0 + dt * j;
  vec3 col = vec3(0.0); float trans = 1.0; float dW = 0.0;
#ifdef MODE_BALL
  float sigmaW = uSigma;
#endif
  for (int i = 0; i < 192; i++) {
    if (float(i) >= steps || trans < 0.015) break;
    vec3 p = ro + rd * t;
#ifdef MODE_BALL
    vec3 f = fieldBall(p);
    if (f.x > 0.002 || f.z > 0.002) {
      vec3 em = sootColor(f.y) * f.x;
      float ext = (sigmaW * f.x + f.z * 2.5);
      float a = exp(-ext * dt);
      col += trans * em * uIntensity * dt * (ext > 1e-4 ? (1.0 - a) / (ext * dt) : 1.0);
      dW += trans * (1.0 - a) * t;
      trans *= a;
    }
#else
    gFpq = max(t * uPixAng, dt * 0.35) * 0.17 / max(uTurb.y, 1e-3);
    vec3 f = fieldFlame(p);
    if (f.x > 0.002 || f.z > 0.002) {
      // emise\u2013absorpce v lok\xE1ln\xED rovnov\xE1ze: \u03BAe sv\xEDtiv\xE9 saze (zdroj = Planck), \u03BAs chladn\xE9 saze (jen pohlcuj\xED)
      float ke = uFlame2.x * f.x * clamp(f.y / 1500.0, 0.3, 1.4);
      float ks = f.z * uSigmaSoot;
      float k = ke + ks + 1e-5;
      float a = exp(-k * dt);
      col += trans * (1.0 - a) * (ke / k) * sootColorG(f.y, 0.45) * uIntensity;
      // modr\xE1 z\xF3na (CH*, C2*): jen u paty a jen tam, kde nesv\xEDt\xED saze (jinak modr\xE1 + oran\u017Eov\xE1 = r\u016F\u017Eov\xE1)
      float edgeB = smoothstep(0.0, 0.25, f.x) * (1.0 - smoothstep(0.3, 0.9, f.x)) * (1.0 - smoothstep(0.08, 0.3, ke * dt));
      float lamB = 1.0 - smoothstep(0.03, 0.08, uTurb.x);
      col += trans * vec3(0.04, 0.12, 1.0) * uBlue * exp(-p.y * mix(30.0, 20.0, lamB)) * mix(1.0, 0.3, lamB) * gBlue * edgeB * uIntensity * uPreExp * 0.22 * (dt / max(uFlowL * 0.25, 1e-3));
      dW += trans * (1.0 - a) * t;
      trans *= a;
    }
#endif
    t += dt;
  }
  fragColor = fxOut(vec4(col, 1.0 - trans));
#ifdef VOL_MRT
  fragDist = vec4(dW, 0.0, 0.0, 1.0 - trans);
#endif
}`
);
var _vp2 = new THREE5.Vector4();
function createVolumeMaterial({ ball = false, depth = null, steps = 48, mrt = false } = {}) {
  const defines = {};
  if (mrt) defines.VOL_MRT = 1;
  if (ball) defines.MODE_BALL = 1;
  if (depth) defines.USE_DEPTH = 1;
  const u = {
    ...sharedUniforms(),
    uInvModel: { value: new THREE5.Matrix4() },
    uScale: { value: new THREE5.Vector3(1, 1, 1) },
    uTime: { value: 0 },
    uSeed: { value: 0 },
    uSteps: { value: steps },
    uTpeak: { value: 1300 },
    uTamb: { value: 600 },
    uIntensity: { value: 1 },
    uShape: { value: new THREE5.Vector4(0.45, 0.8, 0.3, 0.2) },
    uAxis0: { value: 0 },
    uShear: { value: 0 },
    uRz: { value: 0.45 },
    uTurb: { value: new THREE5.Vector4(0.45, 0.4, 2, 0.15) },
    uPuff: { value: new THREE5.Vector2(1.5, 0.5) },
    uSoot: { value: 0 },
    uBlue: { value: 0 },
    uSigma: { value: 0.3 },
    uLift: { value: 0 },
    uAge: { value: 0 },
    uLoopT: { value: 0 },
    uRes: { value: new THREE5.Vector2(1, 1) },
    uCamPos: { value: new THREE5.Vector3() },
    uPixAng: { value: 15e-4 },
    uShapeK: { value: 1 },
    uTongues: { value: 0 },
    tDepth: { value: depth },
    uDepthRes: { value: new THREE5.Vector2(1, 1) },
    uFlame2: { value: new THREE5.Vector4(1.35, 0, 0.12, 0.6) },
    uFlowL: { value: 1 },
    uDetail: { value: 1 },
    uStepLen: { value: 0.05 },
    uFrame: { value: 0 },
    uSigmaSoot: { value: 2.5 }
  };
  return new THREE5.ShaderMaterial({
    vertexShader: VS3,
    fragmentShader: VOLUME_FS,
    uniforms: u,
    defines,
    glslVersion: THREE5.GLSL3,
    transparent: true,
    depthWrite: false,
    side: THREE5.BackSide,
    blending: THREE5.CustomBlending,
    blendSrc: THREE5.OneFactor,
    blendDst: THREE5.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE5.OneFactor,
    blendDstAlpha: THREE5.OneMinusSrcAlphaFactor
  });
}
var BOX2 = new THREE5.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
var FlameVolume = class {
  constructor({ ball = false, depth = null, steps = 48, mrt = false } = {}) {
    this.mat = createVolumeMaterial({ ball, depth, steps, mrt });
    this.mesh = new THREE5.Mesh(BOX2, this.mat);
    this.mesh.layers.set(mrt ? LAYER_VOL : LAYER_FX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.ball = ball;
    this.mesh.onBeforeRender = (r, s, cam) => {
      const u = this.mat.uniforms;
      this.mesh.updateMatrixWorld();
      u.uInvModel.value.copy(this.mesh.matrixWorld).invert();
      u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
      u.uFrame.value = (u.uFrame.value + 1) % 1024;
      if (cam.isPerspectiveCamera) {
        const vp = r.getCurrentViewport(_vp2);
        u.uPixAng.value = 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(vp.w, 1);
      }
      if (u.tDepth.value) {
        const img = u.tDepth.value.image;
        u.uDepthRes.value.set(img.width, img.height);
      }
    };
  }
  get u() {
    return this.mat.uniforms;
  }
  /**
   * Umístění plamene: pata v `pos`, výška H, poloměr R, náklon theta ve směru windDir (rad, kam fouká).
   */
  place(pos, H, R, theta = 0, windDir = 0, drag = 1, Rz = null) {
    const tanT = Math.tan(Math.min(theta, 1.35));
    const Hv = H * Math.cos(Math.min(theta, 1.35)) * 1.15 + R * 0.3;
    const lean = tanT * Hv;
    const Wx = R * (1 + drag) + lean + R * 0.6 + R * 0.3 * (drag - 1), Wz = 2 * (Rz ?? R) * 1.3;
    const shift = Wx / 2 - 1.3 * R;
    this.mesh.position.set(pos.x + Math.cos(windDir) * shift, pos.y, pos.z + Math.sin(windDir) * shift);
    this.mesh.rotation.set(0, -windDir, 0);
    this.mesh.scale.set(Wx, Hv * 1.12, Wz);
    const u = this.u;
    u.uScale.value.set(Wx, Hv * 1.12, Wz);
    u.uShape.value.x = R * (1 + drag) * 0.5 / Wx;
    u.uRz.value = (Rz ?? R) / Wz;
    u.uAxis0.value = -0.5 + (0.3 * R + R * (1 + drag) * 0.5) / Wx;
    u.uShear.value = lean / Wx;
  }
};

// src/fx/lights.js
import * as THREE6 from "three";
var bbCache = /* @__PURE__ */ new Map();
function bbRGB(T) {
  const k = Math.round(T / 25) * 25;
  if (!bbCache.has(k)) {
    const c2 = blackbody(k).rgb;
    const m = Math.max(...c2);
    bbCache.set(k, c2.map((v) => v / m));
  }
  return bbCache.get(k);
}
var FireLights = class {
  constructor(scene, tier) {
    this.scene = scene;
    this.pool = [];
    this.req = [];
    this.setTier(tier);
  }
  setTier(tier) {
    for (const l of this.pool) if (l.isObject3D) this.scene.remove(l);
    this.pool = [];
    this.virtual = tier.lightObjects === false;
    for (let i = 0; i < tier.lights; i++) {
      if (this.virtual) {
        this.pool.push({ intensity: 0, position: new THREE6.Vector3(), color: new THREE6.Color(), userData: {} });
        continue;
      }
      const L = new THREE6.PointLight(16755302, 0, 0, 2);
      if (tier.shadows && i < 1) {
        L.castShadow = true;
        L.shadow.mapSize.set(1024, 1024);
        L.shadow.bias = -2e-3;
        L.shadow.normalBias = 0.02;
        L.shadow.radius = 6;
        L.shadow.camera.near = 0.05;
        L.shadow.camera.far = 80;
        L.shadow.camera.layers.set(0);
        L.shadow.camera.layers.enable(LAYER_SHADOW);
      }
      this.scene.add(L);
      this.pool.push(L);
    }
    this.tier = tier;
  }
  begin() {
    this.req.length = 0;
  }
  /** I [cd], T [K], r = poloměr zdroje (proti singularitě), pos */
  /** k [1/m] = extinkce kouře vlastního sloupce (stínění podsvícení kouře výš ve sloupci) */
  add(x, y, z, I, T, r = 0.3, k = 0) {
    if (I > 0) this.req.push({ x, y, z, I, T, r, k });
  }
  end(camera) {
    const reqs = this.req, n = this.pool.length;
    const cp = camera.position;
    reqs.forEach((q) => {
      const d2 = (q.x - cp.x) ** 2 + (q.y - cp.y) ** 2 + (q.z - cp.z) ** 2;
      q.w = q.I / (d2 + 1);
    });
    reqs.sort((a, b) => b.w - a.w);
    const keep = reqs.slice(0, n);
    for (let i = n; i < reqs.length; i++) {
      const q = reqs[i];
      let best = 0, bd = 1e30;
      keep.forEach((k2, j) => {
        const d = (k2.x - q.x) ** 2 + (k2.y - q.y) ** 2 + (k2.z - q.z) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      const k = keep[best];
      if (!k) continue;
      const s = k.I + q.I;
      k.x = (k.x * k.I + q.x * q.I) / s;
      k.y = (k.y * k.I + q.y * q.I) / s;
      k.z = (k.z * k.I + q.z * q.I) / s;
      k.T = (k.T * k.I + q.T * q.I) / s;
      k.r = Math.max(k.r, Math.sqrt(bd) * 0.5);
      k.I = s;
      k.k = Math.max(k.k || 0, q.k || 0);
    }
    this.active = [];
    for (let i = 0; i < n; i++) {
      const L = this.pool[i], q = keep[i];
      if (!q) {
        L.intensity = 0;
        L.userData.I = 0;
        continue;
      }
      L.position.set(q.x, q.y, q.z);
      L.userData.I = q.I;
      L.intensity = q.I * PRE.value;
      const c2 = bbRGB(q.T * 1.28);
      L.color.setRGB(c2[0], c2[1], c2[2]);
      this.active.push({ on: true, x: q.x, y: q.y, z: q.z, I: q.I, r: q.r, c: c2, k: q.k || 0, T: q.T });
    }
    return this.active;
  }
  /** Před-expozice těsně před kreslením (intenzita = I [cd] × expozice) */
  applyPre(on = true) {
    for (const L of this.pool) L.intensity = on ? (L.userData.I || 0) * PRE.value : 0;
  }
  /** Odhad osvětlení v bodě (pro auto-expozici) [lx] */
  illuminanceAt(p) {
    let E = 0;
    for (const a of this.active || []) {
      const d2 = (a.x - p.x) ** 2 + (a.y - p.y) ** 2 + (a.z - p.z) ** 2;
      E += a.I / (d2 + a.r * a.r);
    }
    return E;
  }
};

// src/fx/bake.js
import * as THREE7 from "three";
var FS2 = (
  /* glsl */
  `
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
${VOLUME_FIELDS}
out vec4 o;
uniform vec2 uCell; // rozm\u011Br bu\u0148ky v px
uniform float uBakeSteps;
float smokeField(vec3 p, float ph){
  vec3 c = p - 0.5;
  float r = length(c) * 2.0;
  vec3 q = p * 1.3 + vec3(uSeed);
  // periodick\xE1 smy\u010Dka: rotace \u0161umov\xE9ho prostoru kolem osy y (beze\u0161v\xE9)
  float a = ph * 6.2832;
  vec3 qa = vec3(q.x * cos(a) - q.z * sin(a), q.y, q.x * sin(a) + q.z * cos(a)) * 0.5;
  float b1 = w3(qa * 0.8 + 0.3), b2 = w3(qa * 1.9 + 0.7), n = fbm3(qa * 1.5 + 0.1);
  float dd = 0.8 - r + (b1 - 0.55) * 0.55 + (b2 - 0.5) * 0.28 + (n - 0.5) * 0.22;
  return smoothstep(0.0, 0.25, dd);
}
void main(){
  vec2 px = gl_FragCoord.xy;
  vec2 cell = floor(px / uCell);
  vec2 uv = fract(px / uCell);
  float frame = mod(cell.x, 8.0) + cell.y * 8.0;
  float ph = frame / 64.0;
  float N = uBakeSteps;
  if (cell.x < 8.0) {
    float H = 0.0, Tw = 0.0, W = 0.0, trans = 1.0, cov = 0.0;
    for (int i = 0; i < 96; i++) {
      if (float(i) >= N) break;
      float z = (float(i) + 0.5) / N - 0.5;
      vec3 p = vec3(uv.x - 0.5, uv.y * 1.08 - 0.04, z);
      // \u010Das sn\xEDmku: smy\u010Dka d\xE9lky uLoopT
      vec3 f = fieldFlameAt(p, ph * uLoopT);
      float w = clamp((f.y - uTamb) / (uTpeak - uTamb), 0.0, 1.0);
      float dt = 1.0 / N;
      H += trans * f.x * pow(w, 1.5) * dt * 4.0;
      Tw += trans * f.x * w * dt; W += trans * f.x * dt;
      trans *= exp(-f.z * 6.0 * dt);
      cov = max(cov, f.x);
    }
    float edge = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x) * smoothstep(0.0, 0.04, uv.y) * smoothstep(1.0, 0.93, uv.y);
    o = vec4(1.0 - exp(-H * 2.0), W > 1e-4 ? Tw / W : 0.0, 1.0 - trans, cov) * edge;
  } else {
    float tau = 0.0, trans = 1.0, G = 1.0; bool got = false;
    for (int i = 0; i < 96; i++) {
      if (float(i) >= N) break;
      float z = (float(i) + 0.5) / N;
      vec3 p = vec3(uv, z);
      float d = smokeField(p, ph);
      tau += d * 4.0 / N;
      if (!got && tau > 0.6) {
        got = true; float s = 0.0;
        for (int k = 1; k <= 6; k++) s += smokeField(p + vec3(0.06, 0.12, 0.0) * float(k), ph);
        G = exp(-s * 0.35);
      }
    }
    float edge = smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x) * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.y);
    o = vec4(clamp(tau / 3.0, 0.0, 1.0) * edge, G, 1.0 - smoothstep(0.0, 1.2, tau), 1.0);
  }
}`
);
var FS_FULL = FS2.replace(VOLUME_FIELDS, VOLUME_FIELDS + `
vec3 fieldFlameAt(vec3 p, float t){ return fieldFlame(p); }
`);
function bakeAtlas(renderer, { res = 128, seed = 3, steps = 48 } = {}) {
  const W = res * 16, H = res * 8;
  const rt = new THREE7.WebGLRenderTarget(W, H, { type: THREE7.UnsignedByteType, depthBuffer: false, generateMipmaps: true, minFilter: THREE7.LinearMipmapLinearFilter, magFilter: THREE7.LinearFilter });
  const src = FS_FULL.replace("uniform float uTime, uSeed, uSteps;", "uniform float uSeed, uSteps; float uTime;").replace("vec3 fieldFlameAt(vec3 p, float t){ return fieldFlame(p); }", "vec3 fieldFlameAt(vec3 p, float t){ uTime = t; return fieldFlame(p); }");
  const u = {
    ...sharedUniforms(),
    uCell: { value: new THREE7.Vector2(res, res) },
    uBakeSteps: { value: steps },
    uScale: { value: new THREE7.Vector3(0.5, 1.4, 0.5) },
    uSeed: { value: seed },
    uSteps: { value: steps },
    uTpeak: { value: 1400 },
    uTamb: { value: 500 },
    uIntensity: { value: 1 },
    uShape: { value: new THREE7.Vector4(0.36, 1.3, 0, 0.95) },
    uAxis0: { value: 0 },
    uShear: { value: 0 },
    uRz: { value: 0.33 },
    uTurb: { value: new THREE7.Vector4(0.75, 0.4, 1.6, 2) },
    uPuff: { value: new THREE7.Vector2(1 / 2, 0.35) },
    uSoot: { value: 0.35 },
    uBlue: { value: 0 },
    uSigma: { value: 0.2 },
    uLift: { value: 0 },
    uAge: { value: 0 },
    uLoopT: { value: 2 },
    uRes: { value: new THREE7.Vector2(W, H) },
    uFlame2: { value: new THREE7.Vector4(1.5, 0, 0.12, 0.75) },
    uFlowL: { value: 1.3 },
    uDetail: { value: 2 },
    uShapeK: { value: 1 },
    uPixAng: { value: 5e-4 },
    uTongues: { value: 3 }
  };
  const m = new THREE7.ShaderMaterial({ vertexShader: "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: src, uniforms: u, glslVersion: THREE7.GLSL3, depthTest: false, depthWrite: false });
  const g2 = new THREE7.BufferGeometry();
  g2.setAttribute("position", new THREE7.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh2 = new THREE7.Mesh(g2, m);
  mesh2.frustumCulled = false;
  const sc = new THREE7.Scene();
  sc.add(mesh2);
  const cam = new THREE7.OrthographicCamera();
  const t0 = performance.now();
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sc, cam);
  renderer.setRenderTarget(prev);
  const ms = performance.now() - t0;
  m.dispose();
  g2.dispose();
  rt.texture.userData = { res, frames: 64, layout: "16x8: 0-7 flame, 8-15 smoke", bakeMs: ms };
  rt.texture.colorSpace = THREE7.NoColorSpace;
  return rt;
}
function atlasToCanvas(renderer, rt) {
  const { width: W, height: H } = rt;
  const buf = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  const c2 = document.createElement("canvas");
  c2.width = W;
  c2.height = H;
  const g2 = c2.getContext("2d");
  const img = g2.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  g2.putImageData(img, 0, 0);
  return c2;
}

// src/fx/debris.js
import * as THREE8 from "three";
function chunkGeo(seed) {
  const g2 = new THREE8.IcosahedronGeometry(0.5, 0);
  const r = mulberry32(seed), p = g2.attributes.position;
  const sx = 0.6 + r(), sy = 0.3 + r() * 0.6, sz = 0.6 + r();
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * sx * (0.8 + r() * 0.4), p.getY(i) * sy * (0.8 + r() * 0.4), p.getZ(i) * sz * (0.8 + r() * 0.4));
  g2.computeVertexNormals();
  return g2;
}
var Debris = class {
  constructor(scene, cap) {
    this.scene = scene;
    this.cap = cap;
    this.n = 0;
    this.mat = new THREE8.MeshStandardMaterial({ color: 3814962, roughness: 0.8, metalness: 0.3 });
    this.mat.onBeforeCompile = (s) => {
      s.uniforms.uPreExp = PRE;
      s.uniforms.uFlameK = FLAMEK;
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uPreExp, uFlameK;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor * uFlameK * 0.4 * uPreExp;\n diffuseColor.rgb = vec3(0.12, 0.11, 0.1);\n#endif");
    };
    this.mesh = new THREE8.InstancedMesh(chunkGeo(3), this.mat, Math.max(cap, 1));
    this.mesh.instanceMatrix.setUsage(THREE8.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE8.Color(0, 0, 0));
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    if (cap <= 0) this.mesh.visible = false;
    this.s = new Float32Array(Math.max(cap, 1) * 16);
    this._m = new THREE8.Matrix4();
    this._q = new THREE8.Quaternion();
    this._e = new THREE8.Euler();
    this._v = new THREE8.Vector3();
    this._sv = new THREE8.Vector3();
    this._c = new THREE8.Color();
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }
  /** o = { n, speed, size, hot (0..1), up (0..1 sklon nahoru), T } */
  burst(pos, o, r = Math.random) {
    for (let k = 0; k < o.n && this.n < this.cap; k++) {
      const i = this.n++, s = this.s, b = i * 16;
      const u = Math.max(-0.2, r() * 2 - 1) * (1 - (o.up ?? 0.5)) + (o.up ?? 0.5), a = r() * 6.283, sn = Math.sqrt(Math.max(0, 1 - u * u));
      const v = o.speed * (0.25 + 0.75 * r() ** 0.7);
      s[b] = pos.x;
      s[b + 1] = pos.y + 0.2;
      s[b + 2] = pos.z;
      s[b + 3] = Math.cos(a) * sn * v;
      s[b + 4] = Math.abs(u) * v;
      s[b + 5] = Math.sin(a) * sn * v;
      s[b + 6] = r() * 6;
      s[b + 7] = r() * 6;
      s[b + 8] = r() * 6;
      s[b + 9] = (r() - 0.5) * 20;
      s[b + 10] = (r() - 0.5) * 20;
      s[b + 11] = (r() - 0.5) * 20;
      s[b + 12] = o.size * (0.3 + 1.2 * r() ** 2);
      s[b + 13] = (o.hot ?? 0) > r() ? o.T ?? 1300 : 0;
      s[b + 14] = 0;
      s[b + 15] = 0;
    }
  }
  update(dt, world) {
    const s = this.s, m = this._m;
    for (let i = 0; i < this.n; i++) {
      const b = i * 16, sz = s[b + 12];
      const vx = s[b + 3], vy = s[b + 4], vz = s[b + 5], sp = Math.hypot(vx, vy, vz);
      const k = 0.06 / Math.max(sz, 5e-3);
      const f = Math.max(0, 1 - k * sp * dt);
      if (s[b + 15] < 0.5) {
        s[b + 3] = vx * f;
        s[b + 4] = vy * f - 9.81 * dt;
        s[b + 5] = vz * f;
        s[b] += s[b + 3] * dt;
        s[b + 1] += s[b + 4] * dt;
        s[b + 2] += s[b + 5] * dt;
        s[b + 6] += s[b + 9] * dt;
        s[b + 7] += s[b + 10] * dt;
        s[b + 8] += s[b + 11] * dt;
        if (s[b + 1] < sz * 0.3) {
          s[b + 1] = sz * 0.3;
          s[b + 4] = -s[b + 4] * 0.3;
          s[b + 3] *= 0.5;
          s[b + 5] *= 0.5;
          s[b + 9] *= 0.5;
          s[b + 10] *= 0.5;
          s[b + 11] *= 0.5;
          if (Math.abs(s[b + 4]) < 0.6 && Math.hypot(s[b + 3], s[b + 5]) < 0.5) s[b + 15] = 1;
        }
      }
      s[b + 14] += dt;
      let T = s[b + 13];
      if (T > 0) {
        T = 650 + (T - 650) * Math.exp(-s[b + 14] / (2 + sz * 20));
        if (s[b + 15] < 0.5 && world.layers.sparks && Math.random() < dt * 30) {
          world.sp.spawn({ x: s[b], y: s[b + 1], z: s[b + 2], vx: s[b + 3] * 0.2, vy: s[b + 4] * 0.2, vz: s[b + 5] * 0.2, life: 0.6, T, tauC: 0.3, size: sz * 0.15, drag: 0.3, grav: 0.2 });
        }
      }
      const c2 = T > 700 ? blackbody(T).rgb.map((v) => v * Math.min(1, Math.exp((T - 1300) / 160))) : [0, 0, 0];
      this._c.setRGB(c2[0], c2[1], c2[2]);
      this.mesh.setColorAt(i, this._c);
      this._e.set(s[b + 6], s[b + 7], s[b + 8]);
      this._q.setFromEuler(this._e);
      m.compose(this._v.set(s[b], s[b + 1], s[b + 2]), this._q, this._sv.set(sz, sz, sz));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
};

// src/fx/decal.js
import * as THREE9 from "three";
var FS3 = (
  /* glsl */
  `
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
varying vec2 vUv; varying vec3 vW;
uniform float uGrow, uGlow, uCrater, uSeed, uTintK; uniform vec3 uTint;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float n = fbm3(vec3(vW.xz * 0.35, uSeed));
  float n2 = fbm3(vec3(vW.xz * 1.7, uSeed + 0.3));
  float edge = uGrow * (0.75 + 0.35 * (n - 0.5) * 2.0);
  float a = smoothstep(edge, edge - 0.25, r);
  vec3 col = mix(vec3(0.04, 0.035, 0.03), vec3(0.012, 0.011, 0.01), smoothstep(0.0, 0.6, edge - r));
  col = mix(col, vec3(0.13, 0.12, 0.11), smoothstep(0.55, 0.75, n2) * 0.6); // popel
  float rim = smoothstep(0.12, 0.0, abs(r - edge + 0.08)) * uGlow;
  vec3 em = bbColor(850.0 + 250.0 * n2) * rim * uFlameK * 0.3;
  if (uCrater > 0.0) col *= mix(1.0, 0.5, smoothstep(0.5, 0.0, r) * uCrater);
  if (uTintK > 0.0) { col = uTint * (0.75 + 0.5 * n2); em = vec3(0.0); a = smoothstep(edge, edge - 0.12, r) * (0.75 + 0.25 * smoothstep(0.3, 0.6, n2)); } // p\u011Bna, p\xEDsek, mokr\xE1 skvrna
  gl_FragColor = vec4(col + em, a * 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
);
var Scorch = class {
  constructor(scene, { pos, radius = 2, seed = 1, grow = 0, glow = 0, crater = 0, rate = 0, color = null }) {
    this.scene = scene;
    this.rate = rate;
    this.mat = new THREE9.ShaderMaterial({
      vertexShader: "varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: FS3,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: { ...sharedUniforms(), uGrow: { value: grow || (rate ? 0 : 1) }, uGlow: { value: glow }, uCrater: { value: crater }, uSeed: { value: seed * 0.13 }, uTint: { value: new THREE9.Vector3(...color || [0, 0, 0]) }, uTintK: { value: color ? 1 : 0 } }
    });
    this.mesh = new THREE9.Mesh(new THREE9.PlaneGeometry(radius * 2, radius * 2), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(pos.x, (pos.y || 0) + 0.01, pos.z);
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  get u() {
    return this.mat.uniforms;
  }
  update(dt) {
    if (this.rate) this.u.uGrow.value = Math.min(1, this.u.uGrow.value + dt * this.rate);
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
};
var WFS = (
  /* glsl */
  `
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
varying vec2 vUv; varying vec3 vW;
uniform float uSoot, uClean, uSeed, uB0, uLf; uniform vec2 uSize, uFire; uniform vec3 uLit;
void main(){
  vec2 p = vUv * uSize - uFire;                       // metry od paty ohn\u011B na st\u011Bn\u011B (x do strany, y vzh\u016Fru)
  float n = fbm3(vec3(vW.xy * 0.9 + vW.z, uSeed)), n2 = fbm3(vec3(vW.xy * 4.0 + vW.z * 3.0, uSeed + 0.7));
  float y = max(p.y, 0.0);
  float b = uB0 + 0.2 * y * (0.8 + 0.5 * n);          // polo\u0161\xED\u0159ka sazov\xE9 vle\u010Dky roste s v\xFD\u0161kou
  float d = exp(-(p.x * p.x) / (b * b)) * smoothstep(-0.25, 0.25, p.y) * (0.55 + 0.45 * exp(-y / (2.5 * uLf + 1.0)));
  d += 0.5 * exp(-(p.x * p.x) / (b * b * 6.0)) * smoothstep(uSize.y - uFire.y - 0.7, uSize.y - uFire.y, p.y);  // rozlit\xED pod stropem / \u0159\xEDmsou
  float soot = clamp(d * uSoot * 1.6 * (0.7 + 0.6 * n), 0.0, 1.0);
  // \u010Dist\xFD v\xFDpal: elipsa kolem plamene, kde st\u011Bna p\u0159es\xE1hla ~430 \xB0C
  float e = length(vec2(p.x / (uB0 * 1.1), (p.y - 0.45 * uLf) / (0.75 * uLf)));
  float clean = uClean * smoothstep(1.15, 0.7, e + 0.25 * (n - 0.5));
  vec3 cSoot = mix(vec3(0.16, 0.11, 0.07), vec3(0.015, 0.014, 0.013), smoothstep(0.15, 0.6, soot)); // hn\u011Bd\xFD okraj \u2192 \u010Dern\xFD st\u0159ed
  vec3 cClean = mix(vec3(0.62, 0.58, 0.54), vec3(0.66, 0.5, 0.46), 0.5 * n);                        // vyb\u011Blen\xE1 a\u017E nar\u016F\u017Eov\u011Bl\xE1 om\xEDtka
  float sp = smoothstep(0.54, 0.6, fbm3(vec3(vW.xy * 0.42 + vW.z, uSeed + 3.1))) * smoothstep(0.35, 0.9, clean);    // odpr\xFDskan\xE9 plochy (cihla, beton): velk\xE9 ostr\u016Fvky
  cClean = mix(cClean, vec3(0.34, 0.22, 0.16) * (0.85 + 0.3 * n), sp);
  vec3 col = mix(cSoot, cClean, clean);
  float a = max(soot * (1.0 - clean), clean * (0.45 + 0.5 * sp));
  // barva je odrazivost: n\xE1sob\xED se osv\u011Btlen\xEDm st\u011Bny (obloha + slunce po p\u0159ed-expozici, p\u0159\xEDsp\u011Bvek ohn\u011B) \u2013 jinak by ve tm\u011B sv\xEDtila
  gl_FragColor = vec4(col * uLit, a * 0.95);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
);
var WallSoot = class {
  /** { pos: Vector3 střed plochy, normal: 'x'|'z' (osa kolmá ke stěně), sign: ±1, w, h [m], fire: [x, y] pata ohně na stěně od levého dolního rohu, b0, Lf } */
  constructor(scene, { pos, axis = "z", sign = 1, w = 4, h: h2 = 3, fire = [2, 0], b0 = 0.5, Lf = 1.5, seed = 1 }) {
    this.scene = scene;
    this.mat = new THREE9.ShaderMaterial({
      vertexShader: "varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: WFS,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: { ...sharedUniforms(), uSoot: { value: 0 }, uClean: { value: 0 }, uSeed: { value: seed * 0.17 }, uB0: { value: b0 }, uLf: { value: Lf }, uSize: { value: new THREE9.Vector2(w, h2) }, uFire: { value: new THREE9.Vector2(fire[0], fire[1]) }, uLit: { value: new THREE9.Vector3(1, 1, 1) } }
    });
    this.mesh = new THREE9.Mesh(new THREE9.PlaneGeometry(w, h2), this.mat);
    if (axis === "x") this.mesh.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    else if (sign < 0) this.mesh.rotation.y = Math.PI;
    this.mesh.position.copy(pos);
    this.mesh.position[axis] += sign * 0.012;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  get u() {
    return this.mat.uniforms;
  }
  /** amb = jas bílé stěny z oblohy a slunce po před-expozici (0..1); fireLit = příspěvek ohně 0..1 (nastavuje scénář). */
  setLight(amb) {
    const f = this.fireLit || 0;
    this.u.uLit.value.set(Math.min(1.2, amb + 0.9 * f), Math.min(1.2, amb + 0.45 * f), Math.min(1.2, amb + 0.18 * f));
  }
  update() {
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
};

// src/fx/heatmap.js
import * as THREE10 from "three";
var N = 16;
var FS4 = (
  /* glsl */
  `
precision highp float;
varying vec3 vW;
uniform int uN; uniform vec4 uF[${N}]; uniform float uD[${N}];   // uF = x, z, Q\xB7\u03C7r [W], L [m];  uD = pr\u016Fm\u011Br
vec3 band(float q){                                   // kW/m\xB2
  if (q < 1.0) return vec3(0.0);
  if (q < 2.5) return vec3(0.1, 0.35, 0.9);           // bezpe\u010Dn\xE9
  if (q < 5.0) return vec3(0.1, 0.75, 0.75);          // bolest do 30 s
  if (q < 8.0) return vec3(0.25, 0.8, 0.2);           // puch\xFD\u0159e, prask\xE1 sklo
  if (q < 12.5) return vec3(0.95, 0.9, 0.1);          // vzplane sl\xE1ma
  if (q < 20.0) return vec3(1.0, 0.55, 0.05);         // vzplane d\u0159evo (s plam\xEDnkem)
  if (q < 35.0) return vec3(0.95, 0.15, 0.05);        // vypad\xE1v\xE1 sklo, flashover
  return vec3(0.85, 0.1, 0.75);                       // d\u0159evo vzplane samo
}
void main(){
  float q = 0.0; vec3 p = vec3(vW.x, 1.0, vW.z);
  for (int i = 0; i < ${N}; i++) { if (i >= uN) break;
    vec4 f = uF[i]; float r = uD[i] * 0.5;
    for (int k = 0; k < 3; k++) { float h = f.w * (float(k) * 2.0 + 1.0) / 6.0, fr = r * (1.0 - 0.6 * (float(k) * 2.0 + 1.0) / 6.0);
      float eh = max(length(p.xz - f.xy) - fr, 0.05 * uD[i] + 0.01), R2 = eh * eh + (p.y - h) * (p.y - h);
      q += f.z / 3.0 / (12.566 * max(R2, 1e-4)); } }
  q = min(q, 140000.0) / 1000.0;
  vec3 c = band(q); if (q < 1.0) discard;
  float lq = log2(q), iso = smoothstep(0.0, 0.06, abs(fract(lq * 2.0) - 0.5) * 2.0 - 0.0);   // jemn\xE9 vrstevnice po \xBD okt\xE1vy
  gl_FragColor = vec4(c * (0.75 + 0.25 * iso), 0.42);
  #include <colorspace_fragment>
}`
);
var HeatMap = class {
  constructor(scene, size = 240) {
    this.mat = new THREE10.ShaderMaterial({
      vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: FS4,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      uniforms: { uN: { value: 0 }, uF: { value: Array.from({ length: N }, () => new THREE10.Vector4()) }, uD: { value: new Float32Array(N) } }
    });
    this.mesh = new THREE10.Mesh(new THREE10.PlaneGeometry(size, size), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.02;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  /** fires = FXWorld.fireList() */
  update(fires) {
    const u = this.mat.uniforms, top = [...fires].sort((a, b) => b.Q - a.Q).slice(0, N);
    u.uN.value = top.length;
    top.forEach((f, i) => {
      u.uF.value[i].set(f.x, f.z, f.Q * (f.chiR ?? 0.3), Math.max(f.L, 0.05));
      u.uD.value[i] = f.D;
    });
  }
};

// src/physics/fuels.js
var FUELS = {
  paraffin: {
    fv: 5,
    name: "Paraf\xEDn (sv\xED\u010Dka)",
    dHc: 42e6,
    rho: 900,
    ys: 0.01,
    yCO: 3e-3,
    chiR: 0.25,
    Tflame: 1300,
    water: 0,
    tar: 0,
    embers: 0,
    sparks: 0,
    conf: 4
  },
  woodDry: {
    fv: 0.6,
    name: "D\u0159evo such\xE9 (smrk/buk)",
    dHc: 15e6,
    rho: 500,
    ys: 0.015,
    yCO: 4e-3,
    chiR: 0.3,
    Tflame: 1250,
    water: 0.15,
    tar: 0.1,
    embers: 0.6,
    sparks: 0.5,
    conf: 4
  },
  woodResin: {
    fv: 1.2,
    Tlum: 1300,
    name: "Lou\u010D (smoln\xE9 d\u0159evo)",
    dHc: 18e6,
    rho: 600,
    ys: 0.04,
    yCO: 0.01,
    chiR: 0.32,
    Tflame: 1200,
    water: 0.05,
    tar: 0.35,
    embers: 0.4,
    sparks: 0.3,
    conf: 3
  },
  straw: {
    fv: 0.4,
    Tlum: 1300,
    name: "Sl\xE1ma (bal\xEDk)",
    dHc: 14e6,
    rho: 120,
    ys: 0.01,
    yCO: 6e-3,
    chiR: 0.3,
    Tflame: 1200,
    water: 0.45,
    tar: 0.15,
    embers: 1,
    sparks: 0.2,
    conf: 3
  },
  diesel: {
    sootBlack: 0.96,
    fv: 2,
    Tlum: 1380,
    name: "Nafta",
    dHc: 444e5,
    mInf: 0.045,
    kBeta: 2.1,
    rho: 840,
    ys: 0.059,
    yCO: 0.012,
    chiR: 0.35,
    Tflame: 1150,
    water: 0,
    tar: 0.15,
    embers: 0,
    sparks: 0,
    conf: 4
  },
  gasoline: {
    sootBlack: 0.92,
    fv: 1.5,
    Tlum: 1400,
    name: "Benz\xEDn",
    dHc: 437e5,
    mInf: 0.055,
    kBeta: 2.1,
    rho: 740,
    ys: 0.038,
    yCO: 0.01,
    chiR: 0.35,
    Tflame: 1200,
    water: 0,
    tar: 0.05,
    embers: 0,
    sparks: 0,
    conf: 4
  },
  rubber: {
    fv: 4,
    Tlum: 1350,
    name: "Pry\u017E (pneumatika, SBR)",
    dHc: 27e6,
    rho: 1150,
    ys: 0.13,
    yCO: 0.05,
    chiR: 0.4,
    Tflame: 1100,
    water: 0,
    tar: 0.5,
    embers: 0.1,
    sparks: 0.05,
    conf: 3
  },
  vehicle: {
    sootBlack: 0.92,
    fv: 1.8,
    Tlum: 1360,
    name: "Osobn\xED auto (plasty, pry\u017E, palivo)",
    dHc: 25e6,
    rho: 0,
    ys: 0.08,
    yCO: 0.04,
    chiR: 0.35,
    Tflame: 1150,
    water: 0.05,
    tar: 0.35,
    embers: 0.2,
    sparks: 0.3,
    conf: 3
  },
  houseContents: {
    fv: 1.4,
    Tlum: 1350,
    name: "Obsah domu (d\u0159evo, PU p\u011Bna, plasty)",
    dHc: 2e7,
    rho: 0,
    ys: 0.06,
    yCO: 0.03,
    chiR: 0.33,
    Tflame: 1150,
    water: 0.1,
    tar: 0.3,
    embers: 0.6,
    sparks: 0.3,
    conf: 3
  },
  forestLitter: {
    fv: 0.5,
    name: "Lesn\xED hrabanka + podrost (borovice)",
    dHc: 186e5,
    rho: 0,
    ys: 0.02,
    yCO: 0.06,
    chiR: 0.25,
    Tflame: 1150,
    water: 0.35,
    tar: 0.25,
    embers: 0.8,
    sparks: 0.2,
    conf: 3,
    // lesní parametry: w [kg/m²] spotřebované palivo, R0 [m/s] rychlost bez větru, wind a·U^b, tr doba hoření v místě [s]
    w: 1.2,
    R0: 0.01,
    wa: 0.9,
    wb: 1.3,
    tr: 90
  },
  crown: {
    fv: 0.5,
    name: "Koruny jehli\u010Dnan\u016F",
    dHc: 186e5,
    rho: 0,
    ys: 0.03,
    yCO: 0.06,
    chiR: 0.25,
    Tflame: 1150,
    water: 0.25,
    tar: 0.25,
    embers: 1,
    sparks: 0.2,
    conf: 2,
    w: 1,
    R0: 0.02,
    wa: 1.6,
    wb: 1.2,
    tr: 35
  },
  brush: {
    fv: 0.4,
    name: "Such\xE9 k\u0159ov\xED (ke\u0159e, tr\xE1va)",
    dHc: 18e6,
    rho: 0,
    ys: 0.012,
    yCO: 0.04,
    chiR: 0.25,
    Tflame: 1180,
    water: 0.25,
    tar: 0.15,
    embers: 0.7,
    sparks: 0.1,
    conf: 3,
    w: 1.5,
    R0: 0.02,
    wa: 1.3,
    wb: 1.4,
    tr: 40
  },
  // --- doplněno v iteraci 6 (zobecnění palety): plyny a rozpouštědla. Výtěžky sazí Tewarson (SFPE), louže Babrauskas.
  butane: {
    fv: 3,
    name: "Butan (zapalova\u010D)",
    dHc: 457e5,
    rho: 580,
    ys: 0.029,
    yCO: 7e-3,
    chiR: 0.28,
    Tflame: 1400,
    water: 0,
    tar: 0,
    embers: 0,
    sparks: 0,
    conf: 4
  },
  acetylene: {
    // acetylen na vzduchu: nejsazovější běžný plyn (ys ≈ 0,096), oslnivě žlutý plamen a vlající černé vločky sazí
    sootBlack: 1,
    fv: 6,
    Tlum: 1500,
    name: "Acetylen (na vzduchu)",
    dHc: 482e5,
    rho: 1.1,
    ys: 0.096,
    yCO: 0.04,
    chiR: 0.4,
    Tflame: 1350,
    water: 0,
    tar: 0.1,
    embers: 0,
    sparks: 0,
    conf: 4
  },
  acetone: {
    fv: 0.8,
    Tlum: 1350,
    name: "Aceton",
    dHc: 258e5,
    mInf: 0.041,
    kBeta: 1.9,
    rho: 790,
    ys: 0.014,
    yCO: 3e-3,
    chiR: 0.27,
    Tflame: 1250,
    water: 0,
    tar: 0,
    embers: 0,
    sparks: 0,
    conf: 4
  },
  ethanol: {
    // líh: téměř nesvítivý modrý plamen (ys ≈ 0,008), ve dne skoro neviditelný
    fv: 0.15,
    name: "L\xEDh (etanol)",
    dHc: 268e5,
    mInf: 0.015,
    kBeta: 100,
    rho: 790,
    ys: 8e-3,
    yCO: 1e-3,
    chiR: 0.2,
    Tflame: 1500,
    water: 0,
    tar: 0,
    embers: 0,
    sparks: 0,
    conf: 4
  },
  // --- doplněno v iteraci 7 (zbraně, plyny pod tlakem, kovy, prach)
  propane: {
    fv: 2,
    Tlum: 1400,
    name: "Propan-butan (LPG)",
    dHc: 46e6,
    mInf: 0.099,
    kBeta: 1.4,
    rho: 510,
    ys: 0.024,
    yCO: 5e-3,
    chiR: 0.28,
    Tflame: 1350,
    water: 0,
    tar: 0,
    embers: 0,
    sparks: 0,
    conf: 4
  },
  methane: {
    // zemní plyn: málo sazí, namodralý až bledě žlutý plamen, u velkých úniků oranžový
    fv: 0.4,
    name: "Zemn\xED plyn (metan)",
    dHc: 5e7,
    rho: 0.68,
    ys: 4e-3,
    yCO: 2e-3,
    chiR: 0.2,
    Tflame: 1450,
    water: 0,
    tar: 0,
    embers: 0,
    sparks: 0,
    conf: 4
  },
  magnesium: {
    // hořčík: 24,7 MJ/kg, hoří při ~3 100 °C oslnivě bíle (žhavé částice MgO), hustý bílý dým; voda ho rozhoří (vodík) ★4
    fv: 8,
    Tlum: 3200,
    name: "Ho\u0159\u010D\xEDk",
    dHc: 247e5,
    rho: 1740,
    ys: 0.05,
    yCO: 0,
    chiR: 0.55,
    Tflame: 3200,
    water: 1,
    tar: 0,
    embers: 0.3,
    sparks: 1,
    conf: 3
  },
  thermite: {
    // termit Fe₂O₃ + 2 Al: 3,98 MJ/kg, ~2 500 °C, žádný plyn → žádný vysoký plamen, sprška jisker a tekuté železo ★4
    fv: 6,
    Tlum: 2700,
    name: "Termit (Fe\u2082O\u2083 + Al)",
    dHc: 398e4,
    rho: 3e3,
    ys: 0.03,
    yCO: 0,
    chiR: 0.6,
    Tflame: 2700,
    water: 0.8,
    tar: 0,
    embers: 0.6,
    sparks: 1,
    conf: 4
  },
  flourDust: {
    // rozvířený organický prach (mouka, škrob, piliny): hoří jako plyn, valivá oranžová koule; K_St 100–200 bar·m/s ★3
    fv: 1.2,
    name: "Organick\xFD prach (mouka)",
    dHc: 155e5,
    rho: 600,
    ys: 0.02,
    yCO: 0.05,
    chiR: 0.3,
    Tflame: 1250,
    water: 0.2,
    tar: 0.1,
    embers: 0.2,
    sparks: 0.2,
    conf: 3
  },
  propellant: {
    // bezdýmný prach: výbuchové teplo ~4,0 MJ/kg bez vzduchu; plyny (CO, H₂) u ústí dohoří se vzduchem ★3
    fv: 0.5,
    name: "Bezd\xFDmn\xFD prach (nitrocelul\xF3za)",
    dHc: 4e6,
    rho: 1600,
    ys: 5e-3,
    yCO: 0.3,
    chiR: 0.2,
    Tflame: 2100,
    water: 0.3,
    tar: 0,
    embers: 0,
    sparks: 0.4,
    conf: 3
  },
  napalm: {
    // zahuštěný benzín (plamenomet, zápalná láhev s příměsí): hoří jako benzín, ale drží na povrchu a hoří déle ★3
    sootBlack: 0.95,
    fv: 2.4,
    Tlum: 1400,
    name: "Zahu\u0161t\u011Bn\xFD benz\xEDn",
    dHc: 43e6,
    mInf: 0.045,
    kBeta: 2.1,
    rho: 780,
    ys: 0.06,
    yCO: 0.012,
    chiR: 0.38,
    Tflame: 1200,
    water: 0,
    tar: 0.2,
    embers: 0,
    sparks: 0,
    conf: 3
  },
  steelSpark: {
    fv: 0,
    name: "Ocelov\xE1 jiskra (brou\u0161en\xED)",
    dHc: 0,
    rho: 7850,
    ys: 0,
    yCO: 0,
    chiR: 1,
    Tflame: 1800,
    water: 0,
    tar: 0,
    embers: 0,
    sparks: 1,
    conf: 4
  }
};
var EXPLOSIVES = {
  tnt: { name: "TNT", eqP: 1, dens: 1600, gurney: 2440, conf: 5 },
  compB: { name: "Composition B (gran\xE1t M67)", eqP: 1.33, dens: 1720, gurney: 2700, conf: 4 },
  acetyleneO2: { name: "C\u2082H\u2082 + O\u2082 (stechiometrie, detonace)", eqP: null, dHc: 482e5, eff: 0.45, conf: 3 },
  petrolVapour: { name: "Benz\xEDnov\xE9 p\xE1ry (deflagrace)", eqP: null, dHc: 437e5, eff: 0.03, conf: 2 }
};
var TNT_J_PER_KG = 4184e3;

// src/physics/combustion.js
var AMB = { T: 293, rho: 1.2, cp: 1005, g: 9.81, P: 101325 };
function flameHeight(Q, D) {
  const L = 0.235 * Math.pow(Q / 1e3, 0.4) - 1.02 * D;
  return Math.max(L, 0.05 * D + 0.01);
}
function virtualOrigin(Q, D) {
  return 0.083 * Math.pow(Q / 1e3, 0.4) - 1.02 * D;
}
function plumeAxis(Q, D, z, chiR = 0.3) {
  const Qc = (1 - chiR) * Q / 1e3;
  const z0 = virtualOrigin(Q, D);
  const dz = Math.max(z - z0, 0.02);
  const dT = Math.min(25 * Math.pow(Math.pow(Qc, 0.4) / dz, 5 / 3), 900);
  const L = flameHeight(Q, D);
  const uAbove = 1 * Math.pow(Qc, 1 / 3) * Math.pow(dz, -1 / 3);
  const u = z < L ? Math.min(uAbove, 1.9 * Math.pow(Qc, 0.2) * Math.sqrt(Math.max(z, 0.01) / Math.pow(Qc, 0.4)) + 0.3) : uAbove;
  const b = 0.12 * Math.sqrt((AMB.T + dT) / AMB.T) * dz;
  return { dT, u, b, z0 };
}
function plumeMassFlow(Q, D, z, chiR = 0.3) {
  const Qc = (1 - chiR) * Q / 1e3;
  const dz = Math.max(z - virtualOrigin(Q, D), 0.05);
  return 0.071 * Math.pow(Qc, 1 / 3) * Math.pow(dz, 5 / 3) * (1 + 0.026 * Math.pow(Qc, 2 / 3) * Math.pow(dz, -5 / 3));
}
function puffingFrequency(D) {
  return 1.5 / Math.sqrt(Math.max(D, 4e-3));
}
function poolFire(fuel, D) {
  const f = typeof fuel === "string" ? FUELS[fuel] : fuel;
  const A = Math.PI * D * D / 4;
  const m2 = f.mInf * (1 - Math.exp(-f.kBeta * D));
  const mdot = m2 * A;
  const Q = mdot * f.dHc;
  return { A, m2, mdot, Q, L: flameHeight(Q, D) };
}
function spillFire(fuel, volumeL, depthMM = 1.5) {
  const f = FUELS[fuel];
  const V6 = volumeL / 1e3, A = V6 / (depthMM / 1e3);
  const D = Math.sqrt(4 * A / Math.PI);
  const p = poolFire(f, D);
  const thin = 0.5;
  const mdot = p.mdot * thin, Q = mdot * f.dHc;
  const mass = V6 * f.rho;
  return { A, D, mdot, Q, L: flameHeight(Q, D), duration: mass / mdot, mass };
}
function ventilation(o2) {
  const phi = 0.5 + (1 - o2) * 2.5;
  const sg = (p) => 1 / (1 + Math.exp(-4 * (p - 1.3)));
  const s = (sg(phi) - sg(0.5)) / (1 - sg(0.5));
  return {
    phi,
    sootMul: 1 + 2 * s,
    coYield: 4e-3 + 0.2 * s,
    chi: phi <= 1 ? 1 : Math.max(0.35, 1 / Math.pow(phi, 0.8)),
    tempDrop: 300 * s,
    // K – chladnější, temnější oranžová/červená
    lift: s
    // „hledání vzduchu" – plameny se odlepují a vlní, zvětšují objem
  };
}
var SOOT_SIGMA = 8700;
function smokeOpticalDepth(Q, D, z, fuel, vent) {
  const f = FUELS[fuel];
  const mdotF = Q / f.dHc;
  const ys = f.ys * vent.sootMul;
  const mp = plumeMassFlow(Q, D, z, f.chiR);
  const { dT, b } = plumeAxis(Q, D, z, f.chiR);
  const rho = AMB.rho * AMB.T / (AMB.T + dT);
  const cs = ys * mdotF / mp * rho;
  return { tau: SOOT_SIGMA * cs * 2 * b, cs, b };
}
function smokeColor(fuel, vent) {
  const f = FUELS[fuel];
  const soot = Math.max(Math.min(1, f.ys * vent.sootMul * 9), f.sootBlack ?? 0);
  const white = [0.82, 0.83, 0.85], tar = [0.36, 0.29, 0.2], black = [0.05, 0.047, 0.045];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  let c2 = mix([0.5, 0.5, 0.5], white, f.water);
  c2 = mix(c2, tar, f.tar * 0.6);
  c2 = mix(c2, black, soot);
  return { rgb: c2, soot };
}
function flameLuminousIntensity(Q, T = 1300) {
  const eff = 0.16 * Math.pow(T / 1300, 4);
  return Q * eff / (4 * Math.PI);
}
function flameColorTemp(fuel, vent) {
  return FUELS[fuel].Tflame - vent.tempDrop;
}
var T2_ALPHA = { slow: 2.93, medium: 11.72, fast: 46.9, ultrafast: 187.6 };
function hrrCurve(t, { alpha, Qpeak, tPlateau, tau }) {
  const tg = Math.sqrt(Qpeak / alpha);
  if (t < tg) return alpha * t * t;
  if (t < tg + tPlateau) return Qpeak;
  return Qpeak * Math.exp(-(t - tg - tPlateau) / tau);
}
function hrrCurveEnd(c2) {
  return Math.sqrt(c2.Qpeak / c2.alpha) + c2.tPlateau + 3 * c2.tau;
}
function compartment({ Ao, Ho, AT }) {
  const vf = Ao * Math.sqrt(Ho);
  return { Qmax: 15e5 * vf, Qfo: (7.8 * AT + 378 * vf) * 1e3 };
}

// src/physics/wind.js
var WIND_CLASSES = [
  { id: 0, name: "bezv\u011Bt\u0159\xED", bft: 0, U10: 0, gust: 0, turb: 0 },
  { id: 1, name: "v\xE1nek", bft: 2, U10: 2.5, gust: 0.3, turb: 0.25 },
  { id: 2, name: "v\xEDtr", bft: 5, U10: 9, gust: 0.35, turb: 0.2 },
  { id: 3, name: "vichr", bft: 8, U10: 19, gust: 0.45, turb: 0.18 }
];
function windAt(U10, z, z0 = 0.03) {
  if (U10 <= 0) return 0;
  return U10 * Math.log(Math.max(z, z0 * 1.5) / z0) / Math.log(10 / z0);
}
function flameTilt(U, Q, D) {
  const uc = Math.pow(AMB.g * Q / (AMB.rho * AMB.cp * AMB.T * Math.max(D, 0.01)), 1 / 3);
  const us = U / Math.max(uc, 1e-3);
  const cosT = us <= 1 ? 1 : 1 / Math.sqrt(us);
  const theta = Math.acos(Math.min(1, cosT));
  const drag = 1 + Math.min(1.2, Math.max(0, 0.25 * (us - 1)));
  return { theta, us, uc, drag };
}

// src/physics/blast.js
var scaled = (R, W) => R / Math.cbrt(W);
function overpressure(R, W, surface = true) {
  const We = surface ? 1.8 * W : W;
  const Z = scaled(R, We);
  const r = 808 * (1 + (Z / 4.5) ** 2) / (Math.sqrt(1 + (Z / 0.048) ** 2) * Math.sqrt(1 + (Z / 0.32) ** 2) * Math.sqrt(1 + (Z / 1.35) ** 2));
  return r * AMB.P;
}
function positivePhase(R, W, surface = true) {
  const We = surface ? 1.8 * W : W;
  const Z = scaled(R, We);
  const td = 980 * (1 + (Z / 0.54) ** 10) / ((1 + (Z / 0.02) ** 3) * (1 + (Z / 0.74) ** 6) * Math.sqrt(1 + (Z / 6.9) ** 2));
  return td * Math.cbrt(We) / 1e3;
}
function shockSpeed(Ps) {
  return 343 * Math.sqrt(1 + 6 * Ps / (7 * AMB.P));
}
function shockTable(W, Rmax, surface = true, n = 200) {
  const out = [];
  let t = 0, Rprev = 0.05 * Math.cbrt(W);
  for (let i = 0; i <= n; i++) {
    const R = Rprev + (Rmax - Rprev) * i / n;
    const Ps = overpressure(R, W, surface);
    if (i > 0) t += (R - out[i - 1].R) / shockSpeed(Ps);
    out.push({ R, t, Ps, td: positivePhase(R, W, surface) });
  }
  return out;
}
function shockRadiusAt(table3, t) {
  if (t <= 0) return 0;
  for (let i = 1; i < table3.length; i++) {
    if (table3[i].t >= t) {
      const a = table3[i - 1], b = table3[i], k = (t - a.t) / (b.t - a.t);
      return { R: a.R + (b.R - a.R) * k, Ps: a.Ps + (b.Ps - a.Ps) * k };
    }
  }
  const l = table3[table3.length - 1];
  return { R: l.R + (t - l.t) * 343, Ps: l.Ps };
}
var DAMAGE = [
  { Ps: 1e3, txt: "rozbit\xE1 okna (\u010D\xE1st)" },
  { Ps: 7e3, txt: "okna rozbit\xE1, lehk\xE9 po\u0161kozen\xED st\u0159ech" },
  { Ps: 16e3, txt: "po\u0161kozen\xED lehk\xFDch konstrukc\xED, praskl\xE9 u\u0161n\xED bub\xEDnky ~1 %" },
  { Ps: 35e3, txt: "zni\u010Den\xED d\u0159evostaveb, u\u0161n\xED bub\xEDnky ~50 %" },
  { Ps: 1e5, txt: "po\u0161kozen\xED plic, p\u0159evr\xE1cen\xED aut" },
  { Ps: 2e5, txt: "let\xE1ln\xED pr\xE1h plic ~1 %" }
];
function damageAt(Ps) {
  let t = "\u2014";
  for (const d of DAMAGE) if (Ps >= d.Ps) t = d.txt;
  return t;
}
function bleveFireball(M) {
  const D = 5.8 * Math.cbrt(M);
  return { D, t: 0.45 * Math.cbrt(M), H: 0.75 * D, SEP: 35e4 };
}
function heFireball(W) {
  return { D: 2.5 * Math.cbrt(W), t: 0.05 * Math.cbrt(W) + 0.02, T: 2300 };
}
function gurneySphere(sqrt2E, M, C) {
  return sqrt2E / Math.sqrt(M / C + 0.6);
}
function gasTNT(massKg, kind) {
  const e = EXPLOSIVES[kind];
  return e.eff * massKg * e.dHc / TNT_J_PER_KG;
}
function blastSummary(W, distances = [1, 2, 5, 10, 20, 50, 100, 200]) {
  return distances.map((R) => {
    const Ps = overpressure(R, W);
    return { R, Ps, kPa: Ps / 1e3, td: positivePhase(R, W), effect: damageAt(Ps) };
  });
}

// src/fx/burnable.js
import * as THREE11 from "three";

// src/physics/materials.js
var MATERIALS = {
  softwood: {
    name: "M\u011Bkk\xE9 d\u0159evo such\xE9 (smrk, borovice)",
    fuel: "woodDry",
    mode: "thick",
    Tig: 633,
    qCrit: 12e3,
    krc: 25e4,
    hrrpua: 13e4,
    spread: 2e-3,
    burnFrac: 0.8,
    charRate: 65e-5 / 60,
    cool: 90,
    look: "char",
    residue: "d\u0159ev\u011Bn\xE9 uhl\xED \u2192 \u0161ed\xFD popel",
    conf: 4
  },
  hardwood: {
    name: "Tvrd\xE9 d\u0159evo such\xE9 (buk, dub)",
    fuel: "woodDry",
    mode: "thick",
    Tig: 620,
    qCrit: 11e3,
    krc: 45e4,
    hrrpua: 15e4,
    spread: 15e-4,
    burnFrac: 0.8,
    charRate: 5e-4 / 60,
    cool: 120,
    look: "char",
    residue: "d\u0159ev\u011Bn\xE9 uhl\xED \u2192 \u0161ed\xFD popel",
    conf: 4
  },
  woodWet: {
    name: "D\u0159evo vlhk\xE9 (30 % vody)",
    fuel: "woodDry",
    mode: "thick",
    Tig: 653,
    qCrit: 15e3,
    krc: 6e5,
    hrrpua: 9e4,
    spread: 1e-3,
    burnFrac: 0.7,
    charRate: 5e-4 / 60,
    cool: 90,
    look: "char",
    residue: "uhl\xED, hodn\u011B p\xE1ry a b\xEDl\xE9ho d\xFDmu",
    conf: 3
  },
  paper: {
    name: "Pap\xEDr, karton",
    fuel: "woodDry",
    mode: "thin",
    Tig: 533,
    qCrit: 1e4,
    rcd: 700 * 1340 * 5e-4,
    hrrpua: 18e4,
    spread: 0.01,
    burnFrac: 0.92,
    cool: 12,
    look: "fluff",
    residue: "\u010Dern\xE9 vlo\u010Dky \u2192 b\xEDl\xFD popel",
    conf: 3
  },
  straw: {
    name: "Sl\xE1ma, seno, such\xE1 tr\xE1va",
    fuel: "straw",
    mode: "thin",
    Tig: 573,
    qCrit: 8e3,
    rcd: 400 * 1500 * 3e-4,
    hrrpua: 2e5,
    spread: 0.05,
    burnFrac: 0.9,
    cool: 7,
    look: "fluff",
    residue: "\u010Dern\xE9 strni\u0161t\u011B, b\xEDl\xFD popel, doutnaj\xEDc\xED j\xE1dro",
    conf: 3
  },
  textile: {
    name: "L\xE1tka (bavlna), \u010Daloun\u011Bn\xED bez p\u011Bny",
    fuel: "woodDry",
    mode: "thin",
    Tig: 573,
    qCrit: 1e4,
    rcd: 300 * 1300 * 6e-4,
    hrrpua: 15e4,
    spread: 8e-3,
    burnFrac: 0.9,
    cool: 10,
    look: "fluff",
    residue: "zuhelnat\u011Bl\xE9 c\xE1ry",
    conf: 2
  },
  puFoam: {
    name: "PU p\u011Bna (seda\u010Dky, matrace)",
    fuel: "houseContents",
    mode: "thick",
    Tig: 573,
    qCrit: 7e3,
    krc: 35e3,
    hrrpua: 4e5,
    spread: 8e-3,
    burnFrac: 0.95,
    cool: 20,
    look: "melt",
    residue: "ho\u0159\xEDc\xED kapky, \u010Dern\xFD \u0161kvarek",
    conf: 3
  },
  plastic: {
    name: "Plast (PP, ABS \u2013 n\xE1razn\xEDky, interi\xE9r)",
    fuel: "vehicle",
    mode: "thick",
    Tig: 673,
    qCrit: 15e3,
    krc: 7e5,
    hrrpua: 5e5,
    spread: 2e-3,
    burnFrac: 0.95,
    cool: 90,
    look: "melt",
    residue: "ho\u0159\xEDc\xED lou\u017Ee taveniny, \u010Dern\xFD \u0161kvarek",
    conf: 3
  },
  rubber: {
    name: "Pry\u017E (pneumatika)",
    fuel: "rubber",
    mode: "thick",
    Tig: 683,
    qCrit: 17e3,
    krc: 6e5,
    hrrpua: 25e4,
    spread: 8e-4,
    burnFrac: 0.7,
    cool: 150,
    look: "melt",
    residue: "ocelov\xFD kord, saze, pyrol\xFDzn\xED olej",
    conf: 2
  },
  gasoline: {
    name: "Benz\xEDn (kapalina)",
    fuel: "gasoline",
    mode: "liquid",
    flash: 230,
    Tig: 230,
    qCrit: 0,
    rcd: 0,
    hrrpua: 0.055 * 437e5,
    spread: 1.7,
    burnFrac: 1,
    cool: 5,
    look: "liquid",
    residue: "sp\xE1lenina na podkladu",
    conf: 5
  },
  diesel: {
    name: "Nafta (kapalina)",
    fuel: "diesel",
    mode: "liquid",
    flash: 328,
    Tig: 328,
    qCrit: 3e3,
    rcd: 840 * 1900 * 2e-3,
    hrrpua: 0.045 * 444e5,
    spread: 0.05,
    burnFrac: 1,
    cool: 60,
    look: "liquid",
    residue: "mastn\xE1 \u010Dern\xE1 skvrna, saze",
    conf: 4
  },
  steelPainted: {
    name: "Lakovan\xFD ocelov\xFD plech (karoserie, sud)",
    fuel: null,
    mode: "inert",
    Tig: Infinity,
    qCrit: Infinity,
    rcd: 7850 * 490 * 8e-4,
    paintOff: 620,
    glow: 800,
    cool: 60,
    look: "metal",
    residue: "hol\xFD \u0161ed\xFD plech s okujemi, za p\xE1r dn\xED rez",
    conf: 4
  },
  steelThick: {
    name: "Tlust\xE1 ocel (tlakov\xE1 l\xE1hev, nosn\xEDk)",
    fuel: null,
    mode: "inert",
    Tig: Infinity,
    qCrit: Infinity,
    rcd: 7850 * 490 * 5e-3,
    paintOff: 620,
    glow: 800,
    weak: 823,
    cool: 400,
    look: "metal",
    residue: "okuje, p\u0159i 550 \xB0C polovi\u010Dn\xED pevnost",
    conf: 4
  },
  aluminium: {
    name: "Hlin\xEDk (disky kol, blok motoru)",
    fuel: null,
    mode: "inert",
    Tig: Infinity,
    qCrit: Infinity,
    rcd: 2700 * 900 * 4e-3,
    cp: 900,
    melt: 933,
    latent: 397e3,
    cool: 200,
    look: "metal",
    residue: "ztuhl\xE9 st\u0159\xEDbrn\xE9 lou\u017Ee a kapky",
    conf: 5
  },
  glass: {
    name: "Okenn\xED sklo 4 mm",
    fuel: null,
    mode: "inert",
    Tig: Infinity,
    qCrit: Infinity,
    rcd: 2500 * 840 * 4e-3,
    crackDT: 70,
    crackQ: 5e3,
    falloutQ: 2e4,
    falloutT: 630,
    soften: 973,
    look: "glass",
    residue: "popraskan\xE9, vypadl\xE9, st\u0159epy; nad 700 \xB0C m\u011Bkne",
    conf: 2
  },
  masonry: {
    name: "Zdivo, beton, om\xEDtka",
    fuel: null,
    mode: "inert",
    Tig: Infinity,
    qCrit: Infinity,
    rcd: Infinity,
    spall: 573,
    cleanBurn: 700,
    look: "mineral",
    residue: "saze nad otvory, \u201E\u010Dist\xFD v\xFDpal\u201C u ohniska, odpr\xFDskan\xE1 om\xEDtka",
    conf: 3
  },
  // --- doplněno v iteraci 7
  magnesium: {
    // třísky a tenké odlitky; masivní kus teplo odvede a nechytne (k = 156 W/mK). Zapálí se až kolem bodu tání 650 °C. ★3
    name: "Ho\u0159\u010D\xEDk (t\u0159\xEDsky, tenk\xFD odlitek)",
    fuel: "magnesium",
    mode: "thin",
    Tig: 900,
    qCrit: 3e4,
    rcd: 1740 * 1020 * 5e-4,
    hrrpua: 7e5,
    spread: 0.01,
    burnFrac: 1,
    cool: 20,
    look: "metal",
    residue: "b\xEDl\xFD kypr\xFD oxid ho\u0159e\u010Dnat\xFD",
    conf: 3
  },
  cardboardBox: {
    name: "Kartonov\xE1 krabice s obsahem",
    fuel: "woodDry",
    mode: "thin",
    Tig: 533,
    qCrit: 1e4,
    rcd: 700 * 1340 * 3e-3,
    hrrpua: 22e4,
    spread: 6e-3,
    burnFrac: 0.9,
    cool: 25,
    look: "fluff",
    residue: "zborcen\xE1 \u010Dern\xE1 hrom\xE1dka, popel",
    conf: 3
  },
  curtain: {
    name: "Z\xE1clona, z\xE1v\u011Bs",
    fuel: "woodDry",
    mode: "thin",
    Tig: 560,
    qCrit: 9e3,
    rcd: 250 * 1300 * 4e-4,
    hrrpua: 18e4,
    spread: 0.03,
    burnFrac: 0.95,
    cool: 6,
    look: "fluff",
    residue: "c\xE1ry a ho\u0159\xEDc\xED kapky (syntetika)",
    conf: 2
  },
  leadSolder: {
    name: "Olovo, p\xE1jka, zinkov\xE9 odlitky",
    fuel: null,
    mode: "inert",
    Tig: Infinity,
    qCrit: Infinity,
    rcd: 11340 * 130 * 3e-3,
    cp: 130,
    melt: 600,
    latent: 23e3,
    cool: 120,
    look: "metal",
    residue: "ztuhl\xE9 kapky; ukazatel teplot nad 330\u2013420 \xB0C",
    conf: 4
  },
  copper: {
    name: "M\u011B\u010F (vodi\u010De, trubky)",
    fuel: null,
    mode: "inert",
    Tig: Infinity,
    qCrit: Infinity,
    rcd: 8960 * 385 * 2e-3,
    cp: 385,
    melt: 1358,
    latent: 205e3,
    cool: 150,
    look: "metal",
    residue: "z\u010Dernal\xE1, v b\u011B\u017En\xE9m po\u017E\xE1ru se netav\xED (1 085 \xB0C)",
    conf: 5
  }
};
var material = (m) => typeof m === "string" ? MATERIALS[m] : m;

// src/physics/heat.js
var SIGMA = 5670374e-14;
function emissivePower(D, sooty = true) {
  if (!sooty) return 1e5;
  const k = Math.exp(-0.12 * D);
  return (140 * k + 20 * (1 - k)) * 1e3;
}
var pointSourceFlux = (Q, chiR, R) => chiR * Q / (4 * Math.PI * Math.max(R * R, 1e-6));
var transmissivity = (R, pw3 = 1170) => Math.min(1, 2.02 * Math.pow(Math.max(pw3 * R, 1), -0.09));
var contactFlux = (D) => 6e4 + 9e4 * (1 - Math.exp(-0.3 * D));
function fluxFromFire(fire, p) {
  const { Q, D, L } = fire;
  if (!(Q > 0)) return { rad: 0, conv: 0, total: 0, Tg: AMB.T, inFlame: false };
  const chiR = fire.chiR ?? 0.3, th = fire.theta || 0, s = Math.sin(th), c2 = Math.cos(th);
  const ax = s * (fire.wx || 0), ay = c2, az = s * (fire.wz || 0);
  const dx = p[0] - fire.x, dy = p[1] - fire.y, dz = p[2] - fire.z;
  const along = dx * ax + dy * ay + dz * az;
  const px = dx - ax * along, py = dy - ay * along, pz = dz - az * along;
  const r = Math.hypot(px, py, pz);
  const k = Math.min(1, Math.max(0, along / Math.max(L, 1e-3)));
  const rf = D / 2 * (1 - 0.6 * k) + 0.02 * L;
  const inFlame = along >= -0.05 * D && along <= L && r <= rf;
  let rad = 0;
  for (const f of [1 / 6, 1 / 2, 5 / 6]) {
    const h2 = f * L, ex = dx - ax * h2, ey = dy - ay * h2, ez = dz - az * h2;
    const eh = Math.hypot(ex, ez), sh = Math.max(eh - D / 2 * (1 - 0.6 * f), Math.min(eh, 0.05 * D + 0.01));
    const Rp = Math.hypot(sh, ey);
    rad += pointSourceFlux(Q / 3, chiR, Rp) * transmissivity(Rp);
  }
  rad = Math.min(rad, emissivePower(D, fire.sooty ?? true));
  let conv = 0, Tg = AMB.T;
  if (along > 0) {
    const pa = plumeAxis(Q, D, along, chiR);
    const dT = pa.dT * Math.exp(-(r * r) / Math.max(pa.b * pa.b, 1e-4));
    Tg = AMB.T + dT;
    conv = 20 * dT;
  }
  if (inFlame) {
    const qc = contactFlux(D);
    return { rad: qc * 0.7, conv: qc * 0.3, total: qc, Tg: 1200, inFlame };
  }
  return { rad, conv, total: rad + conv, Tg, inFlame };
}
function fluxAt(fires, p) {
  let rad = 0, conv = 0, Tg = AMB.T, inFlame = false;
  for (const f of fires) {
    const q = fluxFromFire(f, p);
    rad += q.rad;
    conv += q.conv;
    if (q.Tg > Tg) Tg = q.Tg;
    inFlame = inFlame || q.inFlame;
  }
  return { rad, conv, total: rad + conv, Tg, inFlame };
}
function timeToIgnition(q, mat, T0 = AMB.T) {
  const m = material(mat);
  if (!m || m.mode === "inert") return Infinity;
  if (m.mode === "liquid" && T0 >= m.flash) return 0;
  const net = q - m.qCrit;
  if (net <= 0) return Infinity;
  const dT = m.Tig - T0;
  if (m.mode === "thick") return Math.PI / 4 * m.krc * dT * dT / (net * net);
  return m.rcd * dT / net;
}
function ignitionDose(mat, T0 = AMB.T) {
  const m = material(mat);
  if (!m || m.mode === "inert") return { n: 1, ftp: Infinity, qCrit: Infinity, tau: 60 };
  const dT = Math.max(m.Tig - T0, 0);
  if (m.mode === "thick") return { n: 2, ftp: Math.PI / 4 * m.krc * dT * dT, qCrit: m.qCrit, tau: m.cool };
  return { n: 1, ftp: m.rcd * dT, qCrit: m.qCrit, tau: m.cool };
}
function stepDose(F2, q, dt, dose) {
  const net = Math.max(0, q - dose.qCrit);
  const gain = dose.n === 2 ? net * net : net;
  return net > 0 ? F2 + gain * dt : F2 * Math.exp(-dt / dose.tau);
}
function objectFire(mat, { mass, area, size }) {
  const m = material(mat), f = FUELS[m.fuel];
  const Qpeak = m.hrrpua * area;
  const tg = Math.max(2, (size ?? Math.sqrt(area)) / (m.spread * 4));
  const E = mass * m.burnFrac * f.dHc;
  const tau = Math.max(5, 0.25 * (E / Qpeak));
  const tPlateau = Math.max(0, E / Qpeak - tg / 3 - tau);
  return { Qpeak, alpha: Qpeak / (tg * tg), tPlateau, tau, E, tg, duration: tg + tPlateau + 3 * tau, fuel: m.fuel };
}
var charDepth = (t, mat = "softwood") => (material(mat).charRate || 0) * t;
function stepSheetTemp(T, q, dt, mat = "steelPainted", eps = 0.85, h2 = 15) {
  const m = material(mat), T0 = AMB.T;
  const dTdt = (eps * q - 2 * eps * SIGMA * (T ** 4 - T0 ** 4) - 2 * h2 * (T - T0)) / m.rcd;
  const n = Math.max(1, Math.ceil(Math.abs(dTdt) * dt / 40));
  let t = T;
  const hstep = dt / n;
  for (let i = 0; i < n; i++) t += (eps * q - 2 * eps * SIGMA * (t ** 4 - T0 ** 4) - 2 * h2 * (t - T0)) / m.rcd * hstep;
  return Math.max(T0, t);
}
function sheetEquilibrium(q, eps = 0.85, h2 = 15) {
  let lo = AMB.T, hi = 2e3;
  for (let i = 0; i < 40; i++) {
    const T = (lo + hi) / 2;
    const bal = eps * q - 2 * eps * SIGMA * (T ** 4 - AMB.T ** 4) - 2 * h2 * (T - AMB.T);
    if (bal > 0) lo = T;
    else hi = T;
  }
  return (lo + hi) / 2;
}
function sheetLook(Tmax) {
  const s = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  return { blister: s(470, 620, Tmax) * (1 - s(620, 700, Tmax)), paintOff: s(600, 700, Tmax), scale: s(780, 950, Tmax), sootHolds: 1 - s(600, 700, Tmax) };
}
function sootRate(tauPerM, Tg, Ts) {
  if (Ts > 650) return -0.05 * Math.min(1, (Ts - 650) / 150);
  return 0.02 * tauPerM * Math.max(0, Tg - Ts) / Math.max(Tg, 1);
}
function glassState(q, mat = "glass") {
  const m = material(mat);
  return q >= m.falloutQ ? "vypadl\xE9" : q >= m.crackQ ? "popraskan\xE9" : "cel\xE9";
}
function stepGlass(st, q, Tg, dt, mat = "glass") {
  const m = material(mat), T0 = AMB.T;
  let T = st.T ?? T0, state = st.state ?? "cel\xE9";
  if (state === "vypadl\xE9") return { T, state };
  const n = Math.max(1, Math.ceil(dt / 2));
  for (let i = 0; i < n; i++) T += (0.9 * q - 2 * 0.9 * SIGMA * (T ** 4 - T0 ** 4) - 2 * 10 * (T - T0)) / m.rcd * (dt / n);
  T = Math.max(T0, T);
  if (state === "cel\xE9" && T - T0 >= m.crackDT) state = "popraskan\xE9";
  if (state === "popraskan\xE9" && (q >= m.falloutQ || Tg >= m.falloutT)) state = "vypadl\xE9";
  return { T, state };
}
function meltStep(frac, T, q, dt, mat) {
  const m = material(mat);
  if (!m.melt || T < m.melt || frac >= 1) return frac;
  const rhoD = m.rcd / (m.cp || 500);
  return Math.min(1, frac + Math.max(0, 0.85 * q - 2 * 0.85 * SIGMA * (m.melt ** 4 - AMB.T ** 4)) * dt / (m.latent * rhoD));
}
function masonryLook(Tmax, soot = 0) {
  const s = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const clean = s(650, 760, Tmax);
  return { soot: soot * (1 - clean), cleanBurn: clean, pink: s(560, 640, Tmax) * (1 - s(850, 950, Tmax)), grey: s(850, 950, Tmax), spall: s(570, 800, Tmax) };
}
var FLUX_EFFECTS = [
  [1e3, "letn\xED slunce"],
  [2500, "bolest k\u016F\u017Ee do ~30 s; mez pro hasi\u010De bez ochrany"],
  [5e3, "bolest do 10 s, puch\xFD\u0159e do 30 s; sklo prask\xE1"],
  [8e3, "vzplane sl\xE1ma a such\xE1 tr\xE1va"],
  [12500, "vzplane d\u0159evo s pilotn\xEDm plamenem; tav\xED se plasty"],
  [2e4, "podlaha p\u0159i flashoveru; vypad\xE1v\xE1 sklo"],
  [35e3, "d\u0159evo vzplane samo bez plam\xEDnku za des\xEDtky sekund"],
  [8e4, "kontakt s plamenem"],
  [15e4, "pohlcen\xED velk\xFDm po\u017E\xE1rem kapalin"]
];
function fluxEffect(q) {
  let t = "\u2014";
  for (const [v, s] of FLUX_EFFECTS) if (q >= v) t = s;
  return t;
}

// src/physics/spec.js
var G = 9.81;
function torricelli(holeD, head, Cd = 0.62) {
  return Cd * (Math.PI * holeD * holeD) / 4 * Math.sqrt(2 * G * Math.max(head, 0));
}
function drainHead(t, h0, holeD, tankArea, Cd = 0.62) {
  const k = Cd * (Math.PI * holeD * holeD) / 4 * Math.sqrt(2 * G) / (2 * tankArea);
  const s = Math.sqrt(h0) - k * t;
  return s > 0 ? s * s : 0;
}
function drainTime(h0, holeD, tankArea, Cd = 0.62) {
  return Math.sqrt(h0) / (Cd * (Math.PI * holeD * holeD) / 4 * Math.sqrt(2 * G) / (2 * tankArea));
}
var lineFlameHeight = (Qper_m) => 0.035 * Math.pow(Qper_m / 1e3, 2 / 3);
var laminarFlameHeight = (Q, fuel = "butane") => (fuel === "paraffin" ? 0.045 / 80 : 0.025 / 57) * Q;
var jetFlameLength = (Q) => 2.8893 * Math.pow(Math.max(Q, 1) / 1e6, 0.3728);
var liquidSpread = (fuel) => MATERIALS[fuel]?.spread ?? (FUELS[fuel]?.mInf ? 0.05 : 1.5);
var layerTemp = (Q, Ao, Ho, AT, hk = 0.03) => AMB.T + Math.min(1100, 6.85 * Math.cbrt((Q / 1e3) ** 2 / (Ao * Math.sqrt(Ho) * hk * AT)));
var windowFlameHeight = (R, w, h2) => Math.max(0, 12.8 * Math.pow(R / w, 2 / 3) - h2);
function leakFire(fuel, flowLps, { thin = 0.5, width = null } = {}) {
  const f = FUELS[fuel], mdot = flowLps / 1e3 * f.rho;
  let D = 1, A = 1;
  for (let i = 0; i < 30; i++) {
    const m2 = thin * f.mInf * (1 - Math.exp(-f.kBeta * D));
    A = mdot / m2;
    D = Math.sqrt(4 * A / Math.PI);
  }
  const Q = mdot * f.dHc;
  const w = width ?? Math.min(1.2, 0.25 + 0.9 * Math.sqrt(flowLps));
  const len = A / w;
  return { mdot, A, D, Q, L: flameHeight(Q, D), stream: { w, len, L: lineFlameHeight(Q / len) } };
}
function pileFire(mat, mass, stick = 0.08, exposed = 0.5) {
  const m = material(mat), f = FUELS[m.fuel];
  const As = 4 * mass / ((f.rho || 450) * stick);
  const Qpeak = m.hrrpua * As * exposed;
  const E = mass * m.burnFrac * f.dHc;
  return { As, Qpeak, E, duration: E / Qpeak, charTime: stick / 2 / m.charRate };
}
function fireSpec(s) {
  const out = { kind: s.kind, extra: {}, rows: [] };
  const row = (a, b, c2) => out.rows.push([a, b, c2]);
  switch (s.kind) {
    case "pool": {
      const f2 = FUELS[s.fuel], D = s.D ?? Math.sqrt(4 * s.area / Math.PI), p = poolFire(s.fuel, D);
      const mass = s.volumeL != null ? s.volumeL / 1e3 * f2.rho : (s.depth ?? 0.01) * p.A * f2.rho;
      Object.assign(out, { fuel: s.fuel, Q: p.Q, Qpeak: p.Q, D, L: p.L, mass, mdot: p.mdot, duration: mass / p.mdot });
      row("Odho\u0159\xEDv\xE1n\xED", (p.m2 * 1e3).toFixed(1) + " g/m\xB2s", "Babrauskas \u26054");
      row("Pokles hladiny", (p.m2 / f2.rho * 6e4).toFixed(1) + " mm/min", "m\u2033/\u03C1 \u26054");
      break;
    }
    case "spill": {
      const sp = spillFire(s.fuel, s.volumeL, s.depthMM ?? 1.5);
      Object.assign(out, { fuel: s.fuel, Q: sp.Q, Qpeak: sp.Q, D: sp.D, L: sp.L, mass: sp.mass, mdot: sp.mdot, duration: sp.duration });
      row("Plocha", sp.A.toFixed(1) + " m\xB2", "vrstva " + (s.depthMM ?? 1.5) + " mm \u26053");
      break;
    }
    case "leak": {
      const f2 = FUELS[s.fuel];
      const flow0 = s.flowLps ?? torricelli((s.holeMM ?? 9) / 1e3, s.head ?? 0.5) * 1e3;
      const lf = leakFire(s.fuel, flow0, s);
      const tankA = s.tankArea ?? 0.258, h0 = s.head ?? 0.5, hd = (s.holeMM ?? 9) / 1e3;
      const dur = s.flowLps != null ? (s.volumeL ?? 100) / s.flowLps : drainTime(h0, hd, tankA);
      const flow = (t) => s.flowLps != null ? t < dur ? flow0 : 0 : torricelli(hd, drainHead(t, h0, hd, tankA)) * 1e3;
      Object.assign(out, { fuel: s.fuel, Q: (t) => flow(t) / 1e3 * f2.rho * f2.dHc, Qpeak: lf.Q, D: lf.D, L: lf.L, mdot: lf.mdot, mass: (s.flowLps != null ? (s.volumeL ?? 100) / 1e3 : tankA * h0) * f2.rho, duration: dur, flow, stream: lf.stream, A: lf.A });
      row("V\xFDtok", flow0.toFixed(2) + " l/s", s.flowLps != null ? "zad\xE1no" : `Torricelli, otvor ${(hd * 1e3).toFixed(0)} mm \u26055`);
      row("Ho\u0159\xEDc\xED plocha (rovnov\xE1ha)", lf.A.toFixed(1) + " m\xB2", "\u1E41 = m\u2033\xB7A \u26053");
      row("Vyte\u010De za", (dur / 60).toFixed(0) + " min", "\u26054");
      break;
    }
    case "pile": {
      const m = material(s.material), p = pileFire(s.material, s.mass, s.stick ?? 0.08, s.exposed ?? 0.5);
      const D = s.D ?? Math.max(0.2, 0.95 * Math.cbrt(s.mass / 20));
      const tg = s.tGrow ?? 60 + 240 * Math.cbrt(s.mass / 20), tau = 0.25 * p.duration, cur = { alpha: p.Qpeak / (tg * tg), Qpeak: p.Qpeak, tPlateau: Math.max(0, p.duration - tg / 3 - tau), tau };
      Object.assign(out, { fuel: m.fuel, Q: (t) => hrrCurve(t, cur), Qpeak: p.Qpeak, D, L: flameHeight(p.Qpeak, D), mass: s.mass, duration: hrrCurveEnd(cur), curve: cur });
      row("Ho\u0159\xEDc\xED povrch polen", p.As.toFixed(1) + " m\xB2 \xD7 " + (s.exposed ?? 0.5), "A = 4m/\u03C1b \u26053");
      row("Proho\u0159en\xED polena", (p.charTime / 60).toFixed(0) + " min", "EN 1995-1-2 \u26055");
      break;
    }
    case "solid": {
      const of = objectFire(s.material, s), cur = { alpha: of.alpha, Qpeak: of.Qpeak, tPlateau: of.tPlateau, tau: of.tau };
      const D = s.D ?? Math.sqrt(4 * (s.footprintArea ?? s.area / 3) / Math.PI);
      Object.assign(out, { fuel: of.fuel, Q: (t) => hrrCurve(t, cur), Qpeak: of.Qpeak, D, L: flameHeight(of.Qpeak, D), mass: s.mass, duration: of.duration, curve: cur });
      row("V\xFDkon z povrchu", (material(s.material).hrrpua / 1e3).toFixed(0) + " kW/m\xB2", "SFPE \u26053");
      row("Rozho\u0159en\xED", of.tg.toFixed(0) + " s", "rozm\u011Br / rychlost \u0161\xED\u0159en\xED \u26052");
      break;
    }
    case "jet": {
      const f2 = FUELS[s.fuel], Q = s.Q ?? s.mdot * f2.dHc, L = laminarFlameHeight(Q, s.fuel);
      if (s.turbulent ?? jetFlameLength(Q) < L) {
        const Lt = jetFlameLength(Q), mass = s.mass ?? 11;
        Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D: s.D ?? 0.13 * Lt, L: Lt, mdot: Q / f2.dHc, mass, duration: mass / (Q / f2.dHc) });
        out.extra = { L: (q) => jetFlameLength(q), T: f2.Tflame + 150, blue: 1.2, taper: 0.5, shapeK: 1.25, neck: 0.05, puffAmp: 0.2, turbAmp: 1.3, volTongues: 0, mult: { smoke: f2.ys > 0.02 ? 0.5 : 0.12, embers: 0, sparks: 0, haze: 1.3 } };
        row("Druh plamene", "turbulentn\xED tryskov\xFD", "Lowesmith 2007 \u26054");
        row("Spot\u0159eba", (out.mdot * 1e3).toFixed(1) + " g/s", "Q/\u0394Hc \u26054");
        break;
      }
      Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D: s.D ?? 6e-3, L, mdot: Q / f2.dHc, mass: s.mass ?? 45e-4, duration: (s.mass ?? 45e-4) / (Q / f2.dHc) });
      out.extra = { L: (q) => laminarFlameHeight(q, s.fuel), T: 1500, blue: 4, taper: 0.55, baseWide: -0.15, neck: 0.5, puffAmp: 0.05, turbAmp: 0.02, wobble: 0.03, tongues: 3, lightH: 0.4, mult: { smoke: 0, embers: 0, sparks: 0, haze: 0.4 } };
      row("Spot\u0159eba", (out.mdot * 1e6).toFixed(2) + " mg/s", "Q/\u0394Hc \u26054");
      break;
    }
    case "wick": {
      const f2 = FUELS[s.fuel], Q = s.Q ?? 80, L = laminarFlameHeight(Q, "paraffin");
      Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D: s.D ?? 0.016, L, mdot: Q / f2.dHc, mass: s.mass ?? 0.05, duration: (s.mass ?? 0.05) / (Q / f2.dHc) });
      out.extra = { L: (q) => laminarFlameHeight(q, "paraffin"), T: 1450, blue: 1, taper: 0.9, baseWide: -0.1, neck: 0.55, puffAmp: 0.12, turbAmp: 0.03, wobble: 0.04, tongues: 3, lightH: 0.4, mult: { smoke: 0.4, embers: 0, sparks: 0, haze: 0.5 } };
      break;
    }
    case "line": {
      const f2 = FUELS[s.fuel], w = s.width ?? 0.3, len = s.length ?? 5;
      const m2 = (s.thin ?? 0.5) * f2.mInf * (1 - Math.exp(-f2.kBeta * w)), Qm = s.Qper_m ?? m2 * w * f2.dHc, Q = Qm * len;
      const mass = s.volumeL != null ? s.volumeL / 1e3 * f2.rho : (s.depthMM ?? 1) / 1e3 * w * len * f2.rho, v = liquidSpread(s.fuel);
      Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D: w, L: lineFlameHeight(Qm), mdot: Q / f2.dHc, mass, duration: mass / (Q / f2.dHc), length: len, width: w, spread: v, Qper_m: Qm });
      out.extra = { footprint: { type: "rect", w: len, d: w * 1.15 }, shapeK: 1.45, taper: 0.6, puffAmp: 0.7 };
      row("V\xFDkon na metr d\xE9lky", (Qm / 1e3).toFixed(0) + " kW/m", "tenk\xE1 vrstva = \xBD lou\u017Ee \u26053");
      row("\u0160\xED\u0159en\xED po stop\u011B", v >= 1 ? v.toFixed(1) + " m/s" : (v * 100).toFixed(0) + " cm/s", "SFPE \u26054");
      break;
    }
    case "room": {
      const [fw, fd] = s.floor ?? [4, 3.5], H = s.H ?? 2.6, [ow, oh] = s.opening ?? [1.2, 1.4], Af = fw * fd;
      const Ao = ow * oh, AT = 2 * (Af + fw * H + fd * H) - Ao, c2 = compartment({ Ao, Ho: oh, AT });
      const f2 = FUELS[s.fuel ?? "houseContents"] || FUELS.woodDry, load = s.load ?? 25;
      const E = load * Af * 175e5, Qfuel = (s.hrrpua ?? 25e4) * Af;
      const alpha = T2_ALPHA[s.growth ?? "fast"], tFo = Math.sqrt(c2.Qfo / alpha), Qpeak = Math.max(Qfuel, c2.Qfo);
      const Qin = Math.min(Qpeak, c2.Qmax), Qext = Math.max(0, Qpeak - c2.Qmax);
      const R = Qpeak / 175e5, zf = windowFlameHeight(R, ow, oh);
      const tFull = Math.max(60, (E - alpha * tFo ** 3 / 3) / Qpeak), tau = 0.2 * tFull;
      const Q = (t) => t < tFo ? alpha * t * t : t < tFo + tFull ? Qpeak : Qpeak * Math.exp(-(t - tFo - tFull) / tau);
      Object.assign(out, {
        fuel: s.fuel ?? "houseContents",
        Q,
        Qpeak,
        D: Math.sqrt(4 * Af / Math.PI),
        L: flameHeight(Qpeak, Math.sqrt(4 * Af / Math.PI)),
        mass: load * Af,
        duration: tFo + tFull + 3 * tau,
        room: { Qfo: c2.Qfo, Qvent: c2.Qmax, Qin, Qext, tFo, tFull, zf, Ao, AT, Ho: oh, R, ventLimited: Qfuel > c2.Qmax, layerT: (q) => layerTemp(q, Ao, oh, AT) }
      });
      if (!FUELS[out.fuel]) out.fuel = "woodDry";
      row("Celkov\xE9 vzplanut\xED p\u0159i", (c2.Qfo / 1e6).toFixed(2) + " MW, za " + (tFo / 60).toFixed(1) + " min", "Thomas \u26054");
      row("Strop v\u011Btr\xE1n\xEDm", (c2.Qmax / 1e6).toFixed(2) + " MW", "1 500\xB7A\u221AH \u26054");
      row("Ho\u0159\xED venku p\u0159ed oknem", (Qext / 1e6).toFixed(2) + " MW", "p\u0159ebytek paliva \u26053");
      row("Plamen nad oknem", zf.toFixed(1) + " m", "Law \u26053");
      break;
    }
    case "metal": {
      const f2 = FUELS[s.fuel], mass = s.mass ?? 1, dur = s.duration ?? (s.fuel === "thermite" ? 12 : 90) * Math.cbrt(mass), Q = mass * f2.dHc / dur;
      const D = s.D ?? (s.fuel === "thermite" ? 0.12 : 0.25) * Math.cbrt(mass);
      Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D, L: s.fuel === "thermite" ? 0.35 * Math.cbrt(mass) : Math.min(flameHeight(Q, D), 0.6 * Math.cbrt(mass) + 0.1), mdot: mass / dur, mass, duration: dur });
      out.extra = { L: () => out.L, T: f2.Tflame, taper: 0.7, puffAmp: 0.3, turbAmp: 0.9, volTongues: 0, mult: { smoke: 2.2, embers: 1, sparks: s.fuel === "thermite" ? 10 : 5, haze: 1.5 } };
      row("Teplota", (f2.Tflame - 273).toFixed(0) + " \xB0C", "\u26054");
      row("Voda", "po\u017E\xE1r zhor\u0161\xED (vod\xEDk, v\xFDbuch p\xE1ry)", "t\u0159\xEDda D");
      break;
    }
    default:
      throw new Error("fireSpec: nezn\xE1m\xFD druh " + s.kind);
  }
  const f = FUELS[out.fuel];
  out.rows.unshift(
    ["Druh ohn\u011B", { pool: "lou\u017Ee v n\xE1dob\u011B", spill: "rozlit\xE1 kapalina", leak: "vyt\xE9kaj\xEDc\xED kapalina", pile: "hromada d\u0159eva", solid: "ho\u0159\xEDc\xED p\u0159edm\u011Bt", jet: "plamen z trysky", wick: "plamen knotu", line: "ho\u0159\xEDc\xED pruh / stopa", room: "m\xEDstnost s otvorem", metal: "ho\u0159\xEDc\xED kov" }[s.kind], "fireSpec"],
    ["Hmotnost paliva", out.mass >= 1 ? out.mass.toFixed(1) + " kg" : (out.mass * 1e3).toFixed(1) + " g", ""],
    ["Doba ho\u0159en\xED", out.duration >= 120 ? (out.duration / 60).toFixed(0) + " min" : out.duration.toFixed(0) + " s", "m\xB7\u0394Hc / Q"]
  );
  out.chiR = f.chiR;
  return out;
}
function scaleFire(sp, k) {
  const Q0 = sp.Q, D = sp.D * Math.sqrt(k), Qpeak = sp.Qpeak * k;
  return { ...sp, Q: typeof Q0 === "function" ? (t) => Q0(t) * k : Q0 * k, Qpeak, D, L: sp.extra?.L ? sp.extra.L(Qpeak) : flameHeight(Qpeak, D), mass: sp.mass * k };
}
function sourceOptions(sp, more = {}) {
  return { fuel: sp.fuel, Q: sp.Q, D: sp.D, ...Number.isFinite(sp.duration) ? { end: sp.duration } : {}, ...sp.extra, ...more };
}
var A_HE = 0.18 * 1.33;
var B_HE = 1e3;
var pw = (W, v1, v2, W1 = A_HE, W2 = B_HE) => v1 * Math.pow(W / W1, Math.log(v2 / v1) / Math.log(W2 / W1));
var mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
var craterRadius = (W) => 0.4 * Math.cbrt(W);
function explosionSpec(s) {
  const rows = [];
  if (s.kind === "he") {
    const e = EXPLOSIVES[s.explosive ?? "tnt"], W = s.mass * e.eqP, fb = heFireball(W), k = Math.log(W / A_HE) / Math.log(B_HE / A_HE), kc = Math.min(1, Math.max(0, k));
    const big = W >= 100;
    const ex = {
      W,
      flash: pw(W, 2e6, 6e8),
      scorch: pw(W, 1.4, 26),
      dust: true,
      dustAlbedo: mixc([0.32, 0.27, 0.2], [0.36, 0.3, 0.22], kc),
      crater: W >= 5 ? 1 : 0,
      fireball: { D: fb.D, t: fb.t, T: 2600 - 200 * kc, soot: 1, ...W > 20 ? { rise: 30 * Math.cbrt(W / 1e3) } : {} },
      smoke: { n: Math.round(pw(W, 140, 1400)), life: pw(W, 7, 50), albedo: mixc([0.11, 0.1, 0.095], [0.09, 0.085, 0.08], kc), tau: pw(W, 1.6, 3), buoy: pw(W, 0.7, 14), buoyAcc: pw(W, 0.25, 5), ...big ? { dur: 4 * Math.cbrt(W / 1e3) } : {} },
      // střepiny pláště (malé, rychlé, žhavé) × vyvržená zemina (velké, pomalé)
      debris: s.cased ? { n: Math.round(pw(W, 160, 600)), speed: 300, size: 6e-3 * Math.cbrt(W / A_HE), hot: 0.9, up: 0.25, T: 1100 } : { n: Math.round(pw(W, 90, 700)), speed: pw(W, 35, 140), size: pw(W, 0.02, 0.35), hot: 0.25, up: 0.55, T: 1300 },
      sparks: { n: Math.round(pw(W, 220, 900)), speed: pw(W, 70, 120) },
      ...big ? { life: pw(W, 12, 70), mushroom: true } : {},
      ...W >= 300 ? { ring: true, wilson: 2.5 } : {}
    };
    rows.push(["N\xE1lo\u017E", `${s.mass} kg ${e.name}`, ""], ["TNT ekvivalent", W.toFixed(2) + " kg", "\u26054"], ["Ohniv\xE1 koule", fb.D.toFixed(1) + " m / " + (fb.t * 1e3).toFixed(0) + " ms", "objem zplodin \u26052"], ["Kr\xE1ter", craterRadius(W).toFixed(2) + " m", "TM 5-855 \u26053"]);
    return { W, ex, fires: [], dy: Math.min(0.6, 0.05 + 0.05 * Math.cbrt(W)), rows };
  }
  if (s.kind === "fireball") {
    const M = s.mass, fb = bleveFireball(M), q = M / 25, film = !!s.film;
    const ex = {
      W: film ? 4 * q : 0.05 * q,
      flash: 2e6 * Math.pow(q, 2 / 3),
      scorch: 6 * Math.cbrt(q),
      dust: film,
      fireball: { D: fb.D * (film ? 1.2 : 1), t: fb.t, T: 1650, rise: fb.H, soot: 0.6 },
      smoke: { n: Math.round(500 * Math.pow(q, 0.28)), life: 16 * Math.pow(q, 0.2), albedo: [0.07, 0.065, 0.06], tau: 2.5, buoy: 6 * Math.pow(q, 1 / 6), buoyAcc: 2 * Math.pow(q, 1 / 6) },
      debris: { n: film ? 120 : 14, speed: film ? 40 : 18, size: 0.12, hot: 0.5, up: 0.6, T: 1200 },
      sparks: { n: Math.round(300 * Math.cbrt(q)), speed: 12 }
    };
    const pool = { fuel: s.fuel ?? "gasoline", Q: (t) => 6e6 * Math.pow(q, 2 / 3) * Math.max(0, 1 - t / (26 * Math.cbrt(q))), D: 3.5 * Math.cbrt(q), start: 0.4, end: 26 * Math.cbrt(q) };
    rows.push(["Zapojen\xE9 palivo", M + " kg", "p\u0159edpoklad \u26052"], ["Ohniv\xE1 koule D", fb.D.toFixed(1) + " m", "CCPS \u26054"], ["Trv\xE1n\xED", fb.t.toFixed(2) + " s", "CCPS \u26054"]);
    return { W: ex.W, ex, fires: [pool], dy: 0.4, rows };
  }
  if (s.kind === "gasMix") {
    const W = gasTNT(s.mass, s.gas ?? "acetyleneO2"), fb = heFireball(W);
    const ex = { W, flash: 3e6 * Math.pow(s.mass / 0.015, 2 / 3), scorch: 0.9 * Math.cbrt(s.mass / 0.015), dust: true, dustAlbedo: [0.3, 0.3, 0.25], fireball: { D: fb.D, t: fb.t, T: 3e3, soot: 0 }, smoke: { n: 60, life: 4, albedo: [0.75, 0.75, 0.77], tau: 0.25, buoy: 1.5 }, debris: { n: 24, speed: 30, size: 0.03, hot: 0.2, up: 0.5 }, sparks: { n: 80, speed: 25 } };
    rows.push(["TNT ekvivalent", (W * 1e3).toFixed(0) + " g", "\xFA\u010Dinnost 45 % \u26052"]);
    return { W, ex, fires: [], dy: 0.4, rows };
  }
  if (s.kind === "gasCylinder") {
    const gasMass = s.gasMass ?? 7, solv = s.solventMass ?? 14, shell2 = s.shellMass ?? 65, V6 = s.V ?? 0.05, P = s.burstP ?? 8e6;
    const Eburst = P * V6 * 0.4 / (1.23 - 1);
    const Wburst = Eburst / TNT_J_PER_KG, Wdefl = 0.02 * gasMass * FUELS.acetylene.dHc / TNT_J_PER_KG;
    const W = Wburst + Wdefl, M = gasMass + 0.3 * solv, fb = bleveFireball(M);
    const vFrag = Math.sqrt(2 * 0.3 * Eburst / shell2);
    const ex = {
      W,
      flash: 5e6,
      scorch: 5,
      dust: true,
      dustAlbedo: [0.3, 0.27, 0.22],
      fireball: { D: fb.D, t: fb.t, T: 1800, rise: fb.H * 0.8, soot: 0.9 },
      smoke: { n: 420, life: 15, albedo: [0.045, 0.042, 0.04], tau: 3.4, buoy: 5, buoyAcc: 1.8 },
      debris: { n: 46, speed: vFrag * 0.6, size: 0.09, hot: 0.6, up: 0.5, T: 1200 },
      sparks: { n: 420, speed: 28 }
    };
    const fires = [{ fuel: "acetone", Q: (t) => 16e5 * Math.max(0, 1 - t / 40), D: 2.2, start: 0.5, end: 40 }];
    rows.push(
      ["N\xE1pl\u0148", `${gasMass} kg C\u2082H\u2082 v ${solv} kg acetonu`, "l\xE1hev 50 l \u26054"],
      ["Energie roztr\u017Een\xED", (Eburst / 1e6).toFixed(2) + " MJ", "Brode \u26052"],
      ["TNT ekvivalent", W.toFixed(1) + " kg (rozsah 0,2\u20134)", "roztr\u017Een\xED + deflagrace \u26052"],
      ["Ohniv\xE1 koule", fb.D.toFixed(1) + " m / " + fb.t.toFixed(2) + " s", "CCPS \u26054; pokusy ~10 m"],
      ["\xDAlomky pl\xE1\u0161t\u011B", vFrag.toFixed(0) + " m/s, dolet stovky m", "z\xF3na 200 m (HSE) \u26054"]
    );
    if (s.film) {
      Object.assign(ex, {
        flash: 16e6,
        scorch: 8,
        ring: true,
        fireball: { D: fb.D * 1.55, t: fb.t * 1.7, T: 1700, rise: fb.H * 1.2, soot: 0.55 },
        smoke: { ...ex.smoke, n: 760, life: 22, tau: 3, buoy: 7 },
        debris: { ...ex.debris, n: 130 },
        sparks: { n: 1500, speed: 34 }
      });
      fires.push({ fuel: "gasoline", Q: (t) => 5e6 * Math.max(0, 1 - t / 30), D: 3.6, start: 0.3, end: 30 });
      rows.push(["Filmov\xE1 varianta", `koule ${(fb.D * 1.55).toFixed(0)} m / ${(fb.t * 1.7).toFixed(1)} s, + benz\xEDn`, "um\u011Bleck\xE9 \u26051"]);
    }
    return { W, ex, fires, dy: 0.5, rows, vFrag, Eburst, fb };
  }
  if (s.kind === "dust") {
    const M = s.mass, f = FUELS[s.fuel ?? "flourDust"], Dc = Math.cbrt(6 * (M / 0.5) / Math.PI), D = 1.9 * Dc, t = 0.5 * Math.cbrt(M) + 0.2;
    const W = (s.confined ? 0.1 : 5e-3) * M * f.dHc / TNT_J_PER_KG, q = Math.cbrt(M);
    const ex = {
      W,
      flash: 8e5 * q * q,
      scorch: 1.1 * q,
      dust: !!s.confined,
      dustAlbedo: [0.5, 0.46, 0.38],
      fireball: { D, t, T: 1500, rise: 0.7 * D, soot: 0.35 },
      smoke: { n: Math.round(160 * Math.pow(M, 0.3)), life: 7 + 3 * q, albedo: [0.3, 0.27, 0.23], tau: 1.1, buoy: 2.5 + q, buoyAcc: 0.8 },
      debris: s.confined ? { n: 70, speed: 22, size: 0.12, hot: 0.15, up: 0.55, T: 900 } : { n: 0, speed: 1, size: 0.01, hot: 0, up: 0.5 },
      sparks: { n: Math.round(160 * q), speed: 7 }
    };
    rows.push(
      ["Rozv\xED\u0159en\xFD prach", M + " kg " + f.name, "oblak ~0,5 kg/m\xB3 \u26053"],
      ["Ohniv\xE1 koule", D.toFixed(1) + " m / " + t.toFixed(1) + " s", "rozp\xEDn\xE1n\xED spalin \xD77 \u26052"],
      ["TNT ekvivalent", W < 1 ? (W * 1e3).toFixed(0) + " g" : W.toFixed(1) + " kg", s.confined ? "uzav\u0159en\xFD prostor, 10 % \u26052" : "voln\xFD oblak, 0,5 % \u26052"],
      ["V uzav\u0159en\xE9m silu", "a\u017E 7\u20139 bar, K_St 100\u2013200 bar\xB7m/s", "t\u0159\xEDda St 1 \u26054"]
    );
    return { W, ex, fires: [], dy: 0.5 * D * 0.5, rows, fb: { D, t } };
  }
  if (s.kind === "vapor") {
    const f = FUELS[s.fuel ?? "gasoline"], M = s.mass, c2 = Math.min(1, Math.max(0, s.confined ?? 0)), eta = 0.03 + 0.07 * c2;
    const W = eta * M * f.dHc / TNT_J_PER_KG, fb = bleveFireball(M), q = Math.cbrt(M);
    const ex = {
      W,
      flash: 25e5 * q * q,
      scorch: 2.2 * q,
      dust: true,
      dustAlbedo: [0.33, 0.29, 0.22],
      fireball: { D: fb.D * 0.85, t: fb.t * 0.7, T: 1750, rise: fb.H * 0.6, soot: (f.ys ?? 0.03) > 0.03 ? 0.6 : 0.25 },
      smoke: { n: Math.round(260 * Math.pow(M, 0.28)), life: 10 + 3 * q, albedo: [0.1, 0.095, 0.09], tau: 1.8, buoy: 4 + q, buoyAcc: 1.4 },
      debris: { n: Math.round(20 + 80 * c2), speed: 15 + 40 * c2, size: 0.08, hot: 0.3, up: 0.5, T: 1e3 },
      sparks: { n: Math.round(200 * q), speed: 14 }
    };
    rows.push(["P\xE1ry ve sm\u011Bsi", M + " kg " + f.name, ""], ["TNT ekvivalent", W.toFixed(2) + " kg", `\xFA\u010Dinnost ${(eta * 100).toFixed(0)} % (CCPS) \u26053`], ["Ohniv\xE1 koule", (fb.D * 0.85).toFixed(1) + " m / " + (fb.t * 0.7).toFixed(1) + " s", "CCPS \u26053"]);
    return { W, ex, fires: [], dy: 0.6, rows, fb };
  }
  if (s.kind === "pyro") {
    const cal = s.caliber ?? 100, k = cal / 100, mass = 1.1 * k ** 3, H = 1.2 * cal, R = 0.27 * cal;
    const v0 = 1.25 * Math.sqrt(2 * 9.81 * H), tLift = 0.9 * Math.sqrt(2 * H / 9.81), burn = 2.2 * Math.sqrt(k) + 0.6;
    const COLORS = {
      red: [[1, 0.1, 0.06], "stroncium"],
      green: [[0.15, 1, 0.22], "baryum"],
      blue: [[0.2, 0.36, 1], "m\u011B\u010F"],
      yellow: [[1, 0.78, 0.12], "sod\xEDk"],
      purple: [[0.72, 0.22, 1], "stroncium + m\u011B\u010F"],
      gold: [[1, 0.62, 0.2], "d\u0159ev\u011Bn\xE9 uhl\xED a \u017Eelezo (\u017Ehnouc\xED jiskry)"],
      white: [[1, 0.96, 0.9], "ho\u0159\u010D\xEDk / hlin\xEDk / titan"]
    };
    const [tint, salt] = COLORS[s.color ?? "red"] ?? COLORS.red;
    const W = 0.06 * mass * 28e5 / TNT_J_PER_KG;
    rows.push(
      ["R\xE1\u017Ee / hmotnost", `${cal} mm / ${mass.toFixed(2)} kg`, "\u26053"],
      ["V\xFD\u0161ka rozprasku", H.toFixed(0) + " m za " + tLift.toFixed(1) + " s", "1,2 m na mm \u26053"],
      ["Pr\u016Fm\u011Br kv\u011Btu", (2 * R).toFixed(0) + " m", "0,54 m na mm \u26053"],
      ["Barva", `${salt}`, "\u010D\xE1rov\xE9 spektrum, ne teplota \u26055"],
      ["Hv\u011Bzdice", Math.round(70 * k * k) + " ks, ho\u0159\xED " + burn.toFixed(1) + " s", "\u26052"]
    );
    return { W, H, R, v0, tLift, burn, stars: Math.round(70 * k * k), starV: R / (0.45 * burn), tint, salt, mass, rows, ex: null, fires: [] };
  }
  throw new Error("explosionSpec: nezn\xE1m\xFD druh " + s.kind);
}

// src/physics/suppress.js
var L_WATER = 26e5;
var STEAM_M3_PER_KG = 1.7;
var AGENTS = {
  waterJet: { name: "Voda \u2013 pln\xFD proud", mode: "cool", eta: 0.3, reach: 20, rate: 3.3, conf: 3 },
  // proudnice C52 ~200 l/min
  waterFog: { name: "Voda \u2013 mlha (rozt\u0159\xED\u0161t\u011Bn\xFD proud)", mode: "cool", eta: 0.6, reach: 6, rate: 1.7, conf: 3 },
  hose: { name: "Zahradn\xED hadice", mode: "cool", eta: 0.3, reach: 8, rate: 0.3, conf: 3 },
  bucket: { name: "Kbel\xEDk vody (10 l nar\xE1z)", mode: "cool", eta: 0.25, reach: 3, rate: 10, burst: 1, conf: 2 },
  foam: { name: "P\u011Bna (AFFF)", mode: "smother", eta: 0.8, reach: 12, rate: 3.3, conf: 4 },
  powder: { name: "Pr\xE1\u0161ek ABC (p\u0159\xEDstroj 6 kg)", mode: "inhibit", eta: 0.6, reach: 5, rate: 0.4, total: 6, conf: 2 },
  co2: { name: "CO\u2082 (p\u0159\xEDstroj 5 kg)", mode: "dilute", eta: 0.3, reach: 2, rate: 0.35, total: 5, conf: 3 },
  sand: { name: "Such\xFD p\xEDsek", mode: "smother", eta: 0.9, reach: 2, rate: 2, conf: 2 }
};
function fireClass(m) {
  const fuel = m?.fuel ?? m, mode = m?.mode;
  if (fuel === "magnesium" || fuel === "thermite") return "D";
  if (fuel === "cookingOil") return "F";
  if (["butane", "propane", "acetylene", "methane"].includes(fuel)) return "C";
  if (mode === "liquid" || ["gasoline", "diesel", "acetone", "ethanol", "paraffin"].includes(fuel)) return "B";
  return "A";
}
var RULES = {
  A: { waterJet: [1, "chlad\xED povrch a vs\xE1kne se"], waterFog: [1, "chlad\xED plamen i povrch"], hose: [1, "chlad\xED"], bucket: [1, "chlad\xED"], foam: [0.8, "sm\xE1\u010D\xED a chlad\xED"], powder: [0.7, "sraz\xED plamen, \u017Ehav\xE9 j\xE1dro z\u016Fst\xE1v\xE1 \u2192 znovu vzplane"], co2: [0.25, "venku se rozpt\xFDl\xED; \u017Ehav\xE9 j\xE1dro z\u016Fst\xE1v\xE1"], sand: [0.6, "udus\xED mal\xE9 ohnisko"] },
  B: { waterJet: [-0.3, "rozst\u0159ikuje ho\u0159\xEDc\xED kapalinu, benz\xEDn plave na vod\u011B"], waterFog: [0.35, "jen kapaliny s bodem vzplanut\xED nad ~60 \xB0C (nafta)"], hose: [-0.3, "rozst\u0159ikuje a rozn\xE1\u0161\xED"], bucket: [-0.5, "vy\u0161pl\xEDchne ho\u0159\xEDc\xED kapalinu"], foam: [1, "pokryje hladinu a od\u0159\xEDzne p\xE1ry"], powder: [1, "zastav\xED reakci v plameni"], co2: [0.6, "mal\xE9 plochy bez v\u011Btru"], sand: [0.7, "malou lou\u017Ei zasype"] },
  C: { waterJet: [0, "plamen plynu nehasit \u2013 uzav\u0159\xEDt p\u0159\xEDvod, chladit okol\xED"], waterFog: [0, "jen chladit okol\xED"], powder: [0.8, "sraz\xED plamen; plyn unik\xE1 d\xE1l \u2192 hroz\xED v\xFDbuch"], co2: [0.4, ""] },
  D: { waterJet: [-1, "voda se na kovu rozkl\xE1d\xE1 na vod\xEDk \u2192 v\xFDbuch"], waterFog: [-1, "vod\xEDk, prudk\xE9 rozho\u0159en\xED"], hose: [-1, "vod\xEDk"], bucket: [-1, "v\xFDbuch p\xE1ry a vod\xEDku"], foam: [-0.8, "obsahuje vodu"], powder: [0, "b\u011B\u017En\xFD pr\xE1\u0161ek nesta\u010D\xED, jen speci\xE1ln\xED (t\u0159\xEDda D)"], co2: [-0.3, "ho\u0159\u010D\xEDk ho\u0159\xED i v CO\u2082"], sand: [1, "jedin\xE1 b\u011B\u017En\xE1 mo\u017Enost"] },
  F: { waterJet: [-1, "voda pod olejem se vypa\u0159\xED \u2192 ohniv\xE1 koule"], waterFog: [-0.6, ""], bucket: [-1, "ohniv\xE1 koule"], hose: [-1, ""], foam: [0.4, ""], powder: [0.4, "znovu vzplane, olej je nad teplotou vzn\xEDcen\xED"], co2: [0.3, ""], sand: [0.2, ""] }
};
function agentEffect(agent, cls) {
  const r = RULES[cls]?.[agent];
  return { k: r ? r[0] : 0, note: r ? r[1] : "bez \xFA\u010Dinku" };
}
var waterDemand = (Q, agent = "waterJet") => 0.5 * Q / (AGENTS[agent].eta * L_WATER);
function agentDemand(agent, Q, A = 1) {
  const a = AGENTS[agent];
  if (a.mode === "cool") return waterDemand(Q, agent);
  if (agent === "foam") return 4.1 / 60 * A;
  if (agent === "powder") return 0.04 * (Q / 1e6);
  if (agent === "co2") return 0.12 * (Q / 1e6) + 0.05;
  return 1.5 * A;
}
function suppressStep(st, { Q0, A = 1, agent = null, rate = 0, cls = "A", dt, qExt = 0 }) {
  let { s = 0, wet = 0, out = false } = st;
  let steam = 0, note = "";
  if (agent && rate > 0 && !out) {
    const a = AGENTS[agent], e = agentEffect(agent, cls);
    note = e.note;
    const need = Math.max(agentDemand(agent, Math.max(Q0, 1e3), A), 1e-6), r = e.k * rate / need;
    const tau = 4 + 6 * Math.sqrt(Math.max(Q0, 1e3) / 1e6);
    const target = r >= 1 ? 1 : r <= 0 ? Math.max(-1.5, r) : r;
    s += (target - s) * (1 - Math.exp(-dt / (r < 0 ? 1.5 : tau)));
    if (a.mode === "cool") {
      steam = Math.min(rate * a.eta, (Q0 * (1 - Math.max(0, s)) * 0.5 + qExt * A) / L_WATER + rate * a.eta * 0.3);
      if (e.k > 0) wet = Math.min(4, wet + rate * (1 - a.eta) * 0.5 / Math.max(A, 0.1) * dt);
    } else if (agent === "foam" && e.k > 0) wet = Math.min(8, wet + rate / Math.max(A, 0.1) * dt);
    if (s > 0.97 && r >= 1) {
      s = 1;
      out = wet > 0.3 || a.mode !== "inhibit";
    }
  } else if (!out) {
    if (wet <= 0) s += (0 - s) * (1 - Math.exp(-dt / 25));
  }
  if (wet > 0) {
    const ev = (qExt + 2e3) / L_WATER * dt;
    steam += Math.min(wet, ev) * A / Math.max(dt, 1e-6) * (agent ? 0 : 1);
    wet = Math.max(0, wet - ev);
  }
  if (out && wet <= 0 && qExt > 0) out = false;
  return { s, wet, out, steam, note };
}

// src/physics/sim.js
function wallEquilibrium(q, eps = 0.9, h2 = 12) {
  let lo = AMB.T, hi = 1800;
  for (let i = 0; i < 30; i++) {
    const T = (lo + hi) / 2;
    if (eps * q - eps * SIGMA * (T ** 4 - AMB.T ** 4) - h2 * (T - AMB.T) > 0) lo = T;
    else hi = T;
  }
  return (lo + hi) / 2;
}
function sympathetic(R, W, { cased = false, shockK = 0.5, fragK = 2.4 } = {}) {
  const c2 = Math.cbrt(Math.max(W, 1e-9)), Rs = shockK * c2, Rf = fragK * c2;
  if (R <= Rs) return { mode: "r\xE1z", p: 1, delay: R / 6e3 };
  if (cased && R <= Rf) return { mode: "st\u0159epiny", p: 0.85 * (1 - (R - Rs) / (Rf - Rs)), delay: R / 1500 + 0.01 };
  return { mode: "nic", p: 0, delay: 0 };
}
function blastOn(bodies, es, pos, { cased = false, rnd = Math.random, src = null, t = 0 } = {}) {
  const events = [], pending = [], fbR = es.ex?.fireball ? es.ex.fireball.D / 2 : 0, fbT = es.ex?.fireball?.t ?? 0;
  for (const b of bodies) {
    if (b === src || b.exploded) continue;
    const R = Math.max(0.05, Math.hypot(b.p[0] - pos[0], b.p[1] - pos[1], b.p[2] - pos[2])), P = es.W > 0 ? overpressure(R, es.W) : 0;
    if (b.glass && b.glass.state !== "vypadl\xE9" && P >= 3500) {
      b.glass.state = "vypadl\xE9";
      b.state = "vypadl\xE9";
      events.push({ type: "fallout", id: b.id, body: b, cause: "tlak", kPa: P / 1e3 });
    }
    if (b.burning && P >= 2e4 && b.Qnow() < 2e5) {
      b.state = "uha\u0161eno";
      b.F = 0;
      events.push({ type: "extinguished", id: b.id, body: b, cause: "tlakov\xE1 vlna" });
    }
    if (b.ex && !b.ex.done) {
      const sy = sympathetic(R, es.W, { cased: cased || !!b.ex.fragile, shockK: b.ex.shockK, fragK: b.ex.fragK });
      if (sy.p > 0 && rnd() < sy.p) {
        b.ex.done = true;
        pending.push({ delay: sy.delay, body: b, cause: sy.mode });
      }
    }
    if (R <= fbR && fbT > 0) for (const e of b.step({ q: 2e5, Tg: 1500, inFlame: true, tau: 1 }, fbT, t)) {
      if (e.type === "explode") pending.push({ delay: 0.05 + 0.2 * rnd(), body: b, cause: "ohniv\xE1 koule" });
      else events.push({ id: b.id, body: b, ...e, cause: "ohniv\xE1 koule" });
    }
  }
  return { events, pending };
}
var ThermalBody = class {
  /** o = { id, pos: [x,y,z], material, mass, area, size, height, probe: [dx,dy,dz], D, ignited, spec, explosive, rustTime, label } */
  constructor(o) {
    this.o = o;
    this.id = o.id;
    this.mat = material(o.material);
    this.label = o.label || this.mat.name;
    const p = o.pos;
    this.pos = [p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z];
    const pr = o.probe || [0, o.height ?? (o.size ?? 0.5) * 0.5, 0];
    this.p = [this.pos[0] + pr[0], this.pos[1] + pr[1], this.pos[2] + pr[2]];
    this.dose = ignitionDose(this.mat);
    this.F = 0;
    this.cls = fireClass(this.mat);
    this.state = "cold";
    this.q = 0;
    this.Tg = AMB.T;
    this.tIgn = null;
    this.tb = 0;
    this.burned = 0;
    this.spec = null;
    this.Ts = AMB.T;
    this.Tmax = AMB.T;
    this.soot = 0;
    this.rust = 0;
    this.melt = 0;
    this.glass = this.mat.look === "glass" ? { T: AMB.T, state: "cel\xE9" } : null;
    this.supp = { s: 0, wet: 0, out: false };
    this.steam = 0;
    this.note = "";
    this.ex = o.explosive ? { cookT: 520, done: false, Tc: AMB.T, rcd: 7850 * 490 * 3e-3, ...o.explosive } : null;
    if (o.ignited) this.ignite(0);
  }
  get inert() {
    return this.mat.mode === "inert";
  }
  get burning() {
    return this.state === "burning";
  }
  /** Podíl dávky do vznícení 0..1. */
  get heat() {
    return Number.isFinite(this.dose.ftp) ? Math.min(1, this.F / this.dose.ftp) : 0;
  }
  ignite(t) {
    if (this.burning || this.state === "burnt" || this.inert) return false;
    const o = this.o;
    this.spec = this.spec || o.spec || fireSpec({ kind: "solid", material: o.material, mass: o.mass, area: o.area, size: o.size, D: o.D });
    this.state = "burning";
    if (this.tIgn == null) this.tIgn = t;
    this.supp.out = false;
    this.supp.s = Math.min(this.supp.s, 0.5);
    return true;
  }
  /** Okamžitý výkon vlastního ohně [W] (včetně hašení). */
  Qnow() {
    if (!this.burning || !this.spec) return 0;
    const q = typeof this.spec.Q === "function" ? this.spec.Q(this.tb) : this.spec.Q;
    return q * Math.min(2.5, Math.max(0, 1 - this.supp.s));
  }
  /** Popis ohně pro fluxFromFire, nebo null. wind = { speed, dir }. */
  fire(wind) {
    const Q = this.Qnow();
    if (!(Q > 0)) return null;
    const sp = this.spec, D = sp.D, L = sp.extra?.L ? sp.extra.L(Q) : 0.235 * Math.pow(Q / 1e3, 0.4) - 1.02 * D;
    const tilt = wind?.speed ? flameTilt(wind.speed, Q, D) : null;
    return { x: this.pos[0], y: this.pos[1] + (this.o.fireY ?? 0.02), z: this.pos[2], Q, D, L: Math.max(L, 0.02), chiR: sp.chiR ?? 0.3, theta: tilt?.theta || 0, wx: Math.cos(wind?.dir || 0), wz: Math.sin(wind?.dir || 0), owner: this };
  }
  /**
   * Krok. env = { q [W/m²], Tg [K], inFlame, tau (optická hustota kouře na metr) }; agent = { agent, rate } nebo null.
   * Vrací pole událostí { type, ... } (bez času a id – doplní volající).
   */
  step(env, dt, t, agent = null) {
    const ev = [], m = this.mat;
    this.q = env.q;
    this.Tg = env.Tg;
    this.steam = 0;
    if (this.ex && !this.ex.done) {
      const X = this.ex;
      X.Tc = stepSheetTemp(X.Tc, env.q, dt, { rcd: X.rcd });
      if (X.Tc >= X.cookT) {
        X.done = true;
        ev.push({ type: "explode", cause: "teplo", spec: X.spec });
      }
    }
    if (this.inert) {
      if (this.glass) {
        const g0 = this.glass.state;
        this.glass = stepGlass(this.glass, env.q, env.Tg, dt, m);
        this.Ts = this.glass.T;
        if (this.glass.state !== g0) ev.push({ type: this.glass.state === "vypadl\xE9" ? "fallout" : "crack" });
        this.state = this.glass.state;
      } else if (Number.isFinite(m.rcd)) {
        const qEff = env.q * ((this.o.engulfed ?? !!m.melt) && env.inFlame ? 2 : 1);
        this.Ts = stepSheetTemp(this.Ts, qEff, dt, m);
        if (m.melt) {
          const f0 = this.melt;
          this.melt = meltStep(this.melt, this.Ts, qEff, dt, m);
          if (this.melt > 0) this.Ts = Math.min(this.Ts, m.melt + 30 * this.melt);
          if (f0 === 0 && this.melt > 0) ev.push({ type: "melt" });
          if (f0 < 1 && this.melt >= 1) ev.push({ type: "melted" });
        }
      } else {
        const Te = wallEquilibrium(env.q);
        this.Ts += (Te - this.Ts) * (1 - Math.exp(-dt / (Te > this.Ts ? 240 : 900)));
      }
      this.Tmax = Math.max(this.Tmax, this.Ts);
      this.soot = Math.min(1, Math.max(0, this.soot + sootRate(env.tau || 0, env.Tg, this.Ts) * dt));
      if (m.look === "metal" && this.Tmax > 700 && this.Ts < 400) this.rust = Math.min(1, this.rust + dt / (this.o.rustTime ?? 600));
      if (!this.glass) this.state = this.melt >= 1 ? "roztaveno" : this.melt > 0 ? "tav\xED se" : this.Ts > 800 ? "\u017Ehne" : this.Tmax > 620 ? m.look === "metal" ? "lak sho\u0159el" : "\u010Dist\xFD v\xFDpal" : this.Tmax > 470 ? m.look === "metal" ? "lak puch\xFD\u0159uje" : "o\u010Dazeno" : env.q > 1e3 ? "oh\u0159\xEDv\xE1 se" : "cold";
      return ev;
    }
    if (agent || this.supp.wet > 0 || this.supp.s !== 0) {
      const Q0 = this.burning && this.spec ? typeof this.spec.Q === "function" ? this.spec.Q(this.tb) : this.spec.Q : 0;
      const r = suppressStep(this.supp, { Q0, A: this.o.area ?? 1, agent: this.burning ? agent?.agent : agent && AGENTS[agent.agent].mode === "cool" ? agent.agent : null, rate: agent?.rate ?? 0, cls: this.cls, dt, qExt: env.q });
      const was = this.supp.out;
      this.supp = { s: r.s, wet: r.wet, out: r.out };
      this.steam = r.steam;
      if (r.note) this.note = r.note;
      if (!this.burning && agent && AGENTS[agent.agent].mode === "cool") this.supp.wet = Math.min(4, this.supp.wet + agent.rate * 0.4 / Math.max(this.o.area ?? 1, 0.1) * dt);
      if (r.out && !was && this.burning) {
        this.state = "uha\u0161eno";
        this.F = 0;
        ev.push({ type: "extinguished", burned: this.burned });
      }
    }
    if (this.state === "cold" || this.state === "heating" || this.state === "uha\u0161eno") {
      if (this.supp.wet > 0) return ev;
      this.F = stepDose(this.F, env.q, dt, this.dose);
      if (this.state !== "uha\u0161eno" || this.F > 0) this.state = this.F > 0.02 * this.dose.ftp ? "heating" : this.state === "uha\u0161eno" ? "uha\u0161eno" : "cold";
      if (this.F >= this.dose.ftp) {
        if (this.ignite(t)) ev.push({ type: this.tb > 0 ? "reignite" : "ignite", q: env.q });
      }
      return ev;
    }
    if (this.burning) {
      const k = Math.max(0, 1 - this.supp.s);
      this.tb += dt * Math.min(1.5, k);
      this.burned = Math.min(1, this.tb / Math.max(this.spec.duration, 1));
      if (this.tb >= this.spec.duration) {
        this.state = "burnt";
        ev.push({ type: "burnout" });
      }
    }
    return ev;
  }
};
var FireSim = class {
  constructor({ wind = { speed: 0, dir: 0 }, maxFires = 64, seed = 1 } = {}) {
    this.wind = wind;
    this.maxFires = maxFires;
    this.t = 0;
    this.bodies = [];
    this.free = [];
    this.agents = [];
    this.pending = [];
    this.log = [];
    let a = seed >>> 0;
    this.rnd = () => {
      a |= 0;
      a = a + 1831565813 | 0;
      let x = Math.imul(a ^ a >>> 15, 1 | a);
      x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }
  addObject(o) {
    const b = new ThermalBody({ id: "o" + this.bodies.length, ...o });
    this.bodies.push(b);
    return b;
  }
  /** Volný oheň (není vázaný na předmět): spec z fireSpec, pos = [x,y,z], t0 = čas zapálení. */
  addFire(spec, pos, t0 = 0) {
    const f = { spec, pos, t0 };
    this.free.push(f);
    return f;
  }
  /** Hasivo: { agent, rate [kg/s], target: id | { pos, radius }, from, until }. */
  addAgent(a) {
    this.agents.push({ from: 0, until: Infinity, ...a });
    return a;
  }
  get(id) {
    return this.bodies.find((b) => b.id === id);
  }
  /** Popisy všech hořících ohňů (pro fluxAt); skip = těleso, jehož vlastní oheň se nepočítá. */
  fires(skip = null) {
    const out = [];
    for (const f of this.free) {
      const tl = this.t - f.t0;
      if (tl < 0 || tl > f.spec.duration) continue;
      const Q = typeof f.spec.Q === "function" ? f.spec.Q(tl) : f.spec.Q;
      if (!(Q > 0)) continue;
      const D = f.spec.D, L = f.spec.extra?.L ? f.spec.extra.L(Q) : Math.max(0.02, 0.235 * Math.pow(Q / 1e3, 0.4) - 1.02 * D);
      const tilt = this.wind.speed ? flameTilt(this.wind.speed, Q, D) : null;
      out.push({ x: f.pos[0], y: f.pos[1], z: f.pos[2], Q, D, L, chiR: f.spec.chiR ?? 0.3, theta: tilt?.theta || 0, wx: Math.cos(this.wind.dir), wz: Math.sin(this.wind.dir) });
    }
    for (const b of this.bodies) {
      if (b === skip) continue;
      const f = b.fire(this.wind);
      if (f) out.push(f);
    }
    return out;
  }
  fluxAt(p, skip = null) {
    return fluxAt(this.fires(skip), p);
  }
  get totalQ() {
    return this.fires().reduce((s, f) => s + f.Q, 0);
  }
  get burningCount() {
    return this.bodies.filter((b) => b.burning).length;
  }
  /** Výbuch v bodě pos: tlak na okna, odpálení sousedních náloží, pohlcení ohnivou koulí, sfouknutí malých plamenů. */
  explode(spec, pos, cause = "ru\u010Dn\u011B", src = null) {
    const es = spec.ex !== void 0 ? spec : explosionSpec(spec), ev = [{ t: this.t, type: "explode", id: src?.id ?? null, cause, W: es.W, pos }];
    if (src) {
      src.state = "burnt";
      src.exploded = true;
    }
    const r = blastOn(this.bodies, es, pos, { cased: !!spec.cased, rnd: this.rnd, src, t: this.t });
    for (const e of r.events) {
      const { body, ...rest } = e;
      ev.push({ t: this.t, ...rest });
    }
    for (const p of r.pending) this.pending.push({ t: this.t + p.delay, b: p.body, cause: p.cause });
    for (const f of es.fires || []) this.addFire({ Q: f.Q, D: f.D, duration: f.end ?? 30, chiR: 0.3, extra: {} }, [pos[0], 0.01, pos[2]], this.t + (f.start || 0));
    this.log.push(...ev);
    return ev;
  }
  /** Krok simulace o dt [s]; vrací události tohoto kroku [{ t, type, id, … }]. */
  step(dt) {
    this.t += dt;
    const out = [], t = this.t;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].t <= t) {
      const p = this.pending.splice(i, 1)[0];
      out.push(...this.explode(p.b.ex.spec, p.b.pos, p.cause, p.b));
    }
    const fires = this.fires(), burning = this.burningCount;
    const ag = /* @__PURE__ */ new Map();
    for (const a of this.agents) {
      if (t < a.from || t > a.until) continue;
      const hit = typeof a.target === "string" ? this.bodies.filter((b) => b.id === a.target) : this.bodies.filter((b) => Math.hypot(b.pos[0] - a.target.pos[0], b.pos[2] - a.target.pos[2]) <= a.target.radius);
      const sum = hit.reduce((s, b) => s + (b.o.area ?? 1), 0) || 1;
      for (const b of hit) ag.set(b, { agent: a.agent, rate: a.rate * (b.o.area ?? 1) / sum });
    }
    let allowed = Math.max(0, this.maxFires - burning);
    for (const b of this.bodies) {
      if (b.exploded) continue;
      const own = fires.filter((f2) => f2.owner !== b), f = fluxAt(own, b.p);
      let tau = 0;
      for (const s of own) {
        const dx = b.p[0] - s.x, dz = b.p[2] - s.z, dy = b.p[1] - s.y;
        if (dy > 0) {
          const bb = 0.12 * dy + s.D / 2;
          tau += 0.4 * Math.sqrt(s.Q / 1e6) * Math.exp(-(dx * dx + dz * dz) / (bb * bb));
        }
      }
      const wasCold = !b.burning, F0 = b.F;
      const evs = b.step({ q: f.total, Tg: f.Tg, inFlame: f.inFlame, tau }, dt, t, ag.get(b));
      for (const e of evs) {
        if ((e.type === "ignite" || e.type === "reignite") && wasCold) {
          if (allowed <= 0) {
            b.state = "heating";
            b.F = Math.max(F0, b.dose.ftp * 0.999);
            b.tIgn = b.tb > 0 ? b.tIgn : null;
            out.push({ t, type: "deferred", id: b.id });
            continue;
          }
          allowed--;
        }
        if (e.type === "explode") {
          out.push(...this.explode(e.spec, b.pos, e.cause, b));
          continue;
        }
        out.push({ t, id: b.id, ...e });
      }
    }
    this.log.push(...out.filter((e) => e.type !== "explode" && e.type !== "deferred"));
    return out;
  }
  /** Běh do času tEnd (nebo do vyhasnutí); vrací protokol událostí. */
  run(tEnd, dt = 0.5) {
    while (this.t < tEnd) {
      this.step(dt);
      if (this.t > 5 && !this.fires().length && !this.pending.length && this.bodies.every((b) => b.heat < 0.02 || b.inert || b.state === "burnt")) break;
    }
    return this.log;
  }
  /** Stav všech předmětů (pro uložení, síť, UI). */
  snapshot() {
    return this.bodies.map((b) => ({ id: b.id, state: b.state, heat: +b.heat.toFixed(3), burned: +b.burned.toFixed(3), Q: Math.round(b.Qnow()), Ts: Math.round(b.Ts), Tmax: Math.round(b.Tmax), soot: +b.soot.toFixed(2), melt: +b.melt.toFixed(2), wet: +b.supp.wet.toFixed(2) }));
  }
};

// src/fx/burnable.js
var Burnable = class {
  /**
   * o = { pos: Vector3 (pata předmětu), material, mass [kg], area [m² hořícího povrchu], size [m], height [m] (kde se měří tok),
   *       char (uniformy applyChar), source (další volby FireSource), ignited (hoří od začátku), label,
   *       spec (hotový fireSpec místo odvození z materiálu), probe: [dx,dy,dz] (posun měřicího bodu),
   *       explosive: { spec, cookT } (nálož nebo nádoba uvnitř), onIgnite(b), onBurnout(b), onEvent(type, b, e) }
   */
  constructor(world, o) {
    this.w = world;
    this.o = o;
    this.pos = o.pos.clone ? o.pos.clone() : new THREE11.Vector3(...o.pos);
    this.body = new ThermalBody({ ...o, pos: [this.pos.x, this.pos.y, this.pos.z], ignited: false });
    this.mat = this.body.mat;
    this.p = this.body.p;
    this.label = this.body.label;
    this.src = null;
    this.agent = null;
    this.last = world.scnTime;
    this.rnd = mulberry32((o.seed ?? 77) * 31 + 7);
    if (o.ignited) this.ignite();
  }
  get inert() {
    return this.body.inert;
  }
  get heat() {
    return this.body.heat;
  }
  get state() {
    return this.body.state;
  }
  get q() {
    return this.body.q;
  }
  get Tg() {
    return this.body.Tg;
  }
  get Ts() {
    return this.body.Ts;
  }
  get Tmax() {
    return this.body.Tmax;
  }
  get soot() {
    return this.body.soot;
  }
  get rust() {
    return this.body.rust;
  }
  get melt() {
    return this.body.melt;
  }
  get glass() {
    return this.body.glass;
  }
  get F() {
    return this.body.F;
  }
  get dose() {
    return this.body.dose;
  }
  get tIgn() {
    return this.body.tIgn;
  }
  get burned() {
    return this.body.burned;
  }
  get spec() {
    return this.body.spec;
  }
  get supp() {
    return this.body.supp;
  }
  ignite() {
    if (!this.body.ignite(this.w.scnTime)) return;
    this.startFire();
    this.o.onIgnite?.(this);
  }
  startFire() {
    const o = this.o, w = this.w, b = this.body;
    if (this.src) {
      this.src.enabled = true;
      return;
    }
    this.src = w.addSource({ pos: this.pos.clone().add(new THREE11.Vector3(0, o.fireY ?? 0.02, 0)), seed: o.seed ?? 77, volume: true, ...sourceOptions(b.spec), ...o.source || {}, Q: () => b.Qnow(), end: Infinity });
    this.src.owner = this;
    if (w.audioEvents && w.audioEvents.length < 64) w.audioEvents.push({ type: "pop", pos: this.pos.clone() });
  }
  update() {
    const w = this.w, dt = Math.max(0, w.scnTime - this.last);
    this.last = w.scnTime;
    if (dt <= 0 || dt > 600) return;
    const b = this.body, f = w.heatFlux(this.p, this.src), u = this.o.char, r = this.rnd;
    const evs = b.step({ q: f.total, Tg: f.Tg, inFlame: f.inFlame, tau: w.smokeAt ? w.smokeAt(this.p) : 0 }, dt, w.scnTime, this.agent);
    this.agent = null;
    for (const e of evs) {
      if (e.type === "ignite" || e.type === "reignite") {
        this.startFire();
        this.o.onIgnite?.(this);
      } else if (e.type === "burnout") {
        if (this.src) this.src.enabled = false;
        if (u && u.uChar) {
          u.uChar.value = 1;
          u.uGlow.value = 0.25;
        }
        this.o.onBurnout?.(this);
      } else if (e.type === "extinguished") {
        if (this.src) this.src.enabled = false;
        if (u && u.uGlow) u.uGlow.value = 0;
      } else if (e.type === "explode") {
        w.pendingBlasts.push({ b: this, spec: e.spec, cause: e.cause });
      }
      if (e.type !== "explode" && w.events.length < 400) w.events.push({ t: w.scnTime, type: e.type, label: this.label, cause: e.cause });
      this.o.onEvent?.(e.type, this, e);
    }
    if (b.steam > 0 && w.layers.smoke && w.bb) {
      this._st = (this._st || 0) + w.dtReal * Math.min(60, 6 + 40 * b.steam) * (w.tier.smokeMul ?? 1) * w.budgetScale.smoke;
      const s = this.o.size ?? 0.6;
      while (this._st >= 1) {
        this._st -= 1;
        w.bb.spawnSmoke({ x: this.p[0] + (r() - 0.5) * s, y: this.pos.y + s * (0.2 + 0.6 * r()), z: this.p[2] + (r() - 0.5) * s, vx: (r() - 0.5) * 0.6, vy: 1.2 + 1.5 * r(), vz: (r() - 0.5) * 0.6, life: 1.4 + 1.6 * r(), s0: 0.12 * s + 0.08, s1: 0.9 * s + 0.5, tau: 0.5, albedo: [0.92, 0.93, 0.95], drag: 0.6 });
      }
    }
    if (this.inert) {
      if (u && u.uTmax) {
        u.uTmax.value = b.Tmax;
        u.uTnow.value = b.Ts;
        u.uSoot.value = b.soot;
        u.uRust.value = b.rust;
        let best = null, bq = 0;
        for (const s of w.fireList(this.src)) {
          const d2 = (s.x - this.pos.x) ** 2 + (s.z - this.pos.z) ** 2 + 0.05, k = s.Q / d2;
          if (k > bq) {
            bq = k;
            best = s;
          }
        }
        if (best && u.uHeatSrc) {
          u.uHeatSrc.value.set(best.x, best.y + best.L * 0.3, best.z);
          u.uObjC.value.set(this.pos.x, this.pos.y + (this.o.size ?? 0.9) * 0.5, this.pos.z);
          u.uHeatSide.value = Math.max(u.uHeatSide.value * 0.98, f.inFlame ? 0.3 : 1);
        }
      }
      return;
    }
    const st = b.state;
    if (st === "heating") {
      if (b.heat > 0.3 && w.layers.smoke && w.bb) {
        this._sm = (this._sm || 0) + w.dtReal * 14 * b.heat * (w.tier.smokeMul ?? 1);
        while (this._sm >= 1) {
          this._sm -= 1;
          const s = this.o.size ?? 0.5;
          w.bb.spawnSmoke({ x: this.p[0] + (r() - 0.5) * s, y: this.p[1] + (r() - 0.3) * s * 0.5, z: this.p[2] + (r() - 0.5) * s, vy: 0.4 + 0.5 * r(), life: 1.6 + 1.5 * r(), s0: 0.05 * s + 0.03, s1: 0.5 * s + 0.2, tau: 0.25 * b.heat, albedo: [0.8, 0.8, 0.82], drag: 0.5 });
        }
      }
      if (u && u.uChar) u.uChar.value = Math.max(u.uChar.value, 0.18 * b.heat);
    } else if (st === "burning") {
      const tl = b.tb;
      if (u && u.uChar) {
        u.uChar.value = Math.max(u.uChar.value, Math.min(1, 0.2 + 1.1 * Math.sqrt(b.burned)));
        u.uGlow.value = Math.min(1, tl / 20) * (b.burned < 0.85 ? 1 : 0.5) * Math.max(0, 1 - b.supp.s);
      }
    }
  }
};

// src/fx/spray.js
import * as THREE12 from "three";
var LOOK = { cool: [0.7, 0.8, 0.9], smother: [0.95, 0.95, 0.93], inhibit: [0.93, 0.9, 0.8], dilute: [0.9, 0.92, 0.95] };
var Spray = class {
  /** o = { agent, rate [kg/s] (výchozí z AGENTS), from: Vector3 (proudnice), to: Vector3 (kam míří), radius [m] zásahu, on } */
  constructor(world, o) {
    this.w = world;
    this.o = o;
    this.agent = o.agent;
    this.a = AGENTS[o.agent];
    this.rate = o.rate ?? this.a.rate;
    this.from = o.from.clone();
    this.to = o.to.clone();
    this.radius = o.radius ?? 0.8;
    this.on = o.on ?? true;
    this.rnd = mulberry32(o.seed ?? 5);
    this.acc = 0;
    this.used = 0;
    this.steam = 0;
    this.note = "";
    this.foam = null;
  }
  update(dt) {
    const w = this.w;
    this.steam = 0;
    if (!this.on || this.a.total && this.used >= this.a.total) {
      this.active = false;
      return;
    }
    this.active = true;
    this.used += this.rate * dt;
    const r = this.rnd, a = this.a, d = this.to.clone().sub(this.from), dist = d.length(), col = LOOK[a.mode];
    const v0 = Math.max(6, Math.sqrt(9.81 * Math.max(dist, 1)) * 1.25), tf = dist / v0, wide = this.agent === "waterFog" || a.mode !== "cool" ? 0.16 : 0.035;
    if (w.layers.smoke && w.bb) {
      this.acc += w.dtReal * Math.min(260, 60 + 90 * Math.sqrt(this.rate)) * (w.tier.smokeMul ?? 1) * Math.max(0.3, w.budgetScale.smoke);
      const dir = d.clone().multiplyScalar(1 / Math.max(dist, 1e-3));
      while (this.acc >= 1) {
        this.acc -= 1;
        const vx = dir.x * v0 + (r() - 0.5) * v0 * wide * 2, vz = dir.z * v0 + (r() - 0.5) * v0 * wide * 2, vy = dir.y * v0 + 0.5 * 9.81 * tf + (r() - 0.5) * v0 * wide * 2;
        w.bb.spawnSmoke({ x: this.from.x, y: this.from.y, z: this.from.z, vx, vy, vz, life: tf * (0.85 + 0.3 * r()), s0: 0.03 + 0.03 * Math.sqrt(this.rate), s1: (0.18 + 0.5 * wide * dist) * (0.8 + 0.5 * r()), tau: a.mode === "cool" ? 0.35 : 0.9, albedo: col, drag: 0.02, grav: 1 });
      }
    }
    const hitB = w.burnables.filter((b) => !b.inert && Math.hypot(b.pos.x - this.to.x, b.pos.z - this.to.z) <= this.radius + (b.o.size ?? 0.5) * 0.5);
    const hitS = w.sources.filter((s) => !s.owner && s.enabled && s.active && s.ph && s.ph.Q > 1 && Math.hypot(s.pos.x - this.to.x, s.pos.z - this.to.z) <= this.radius + s.D * 0.5);
    const sum = hitB.reduce((x, b) => x + (b.o.area ?? 1), 0) + hitS.reduce((x, s) => x + Math.PI * s.D * s.D / 4, 0) || 1;
    for (const b of hitB) b.agent = { agent: this.agent, rate: this.rate * (b.o.area ?? 1) / sum };
    for (const s of hitS) {
      const A = Math.PI * s.D * s.D / 4, cls = fireClass(s.o.fuel), Q0 = s.ph.Q / Math.max(s.suppK ?? 1, 0.05);
      s.supp = suppressStep(s.supp || {}, { Q0, A, agent: this.agent, rate: this.rate * A / sum, cls, dt: w.scnDt ?? dt, qExt: 0 });
      s.suppK = Math.min(2.5, Math.max(0, 1 - s.supp.s));
      this.steam += s.supp.steam;
      this.note = s.supp.note || this.note;
      if (s.supp.out) {
        s.enabled = false;
        w.events.push({ t: w.scnTime, type: "extinguished", label: s.o.label || "ohe\u0148", cause: a.name });
      }
      if (s.supp.s < -0.2 && w.layers.sparks && r() < dt * 30) for (let i = 0; i < 6; i++) w.sp.spawn({ x: s.pos.x, y: s.pos.y + 0.1, z: s.pos.z, vx: (r() - 0.5) * 9, vy: 2 + 6 * r(), vz: (r() - 0.5) * 9, life: 0.4 + 0.8 * r(), T: cls === "D" ? 3e3 : 1500, tauC: 1.2, size: 6e-3, drag: 0.8, grav: 1, seed: r() });
    }
    for (const b of hitB) {
      this.steam += b.body.steam;
      if (b.body.note) this.note = b.body.note;
    }
    if (!hitB.length && !hitS.length) this.note = "";
    if (a.mode === "cool" && this.steam > 0 && w.layers.smoke && w.bb) {
      this._st = (this._st || 0) + w.dtReal * Math.min(80, 8 + 50 * this.steam) * (w.tier.smokeMul ?? 1) * Math.max(0.3, w.budgetScale.smoke);
      while (this._st >= 1) {
        this._st -= 1;
        w.bb.spawnSmoke({ x: this.to.x + (r() - 0.5) * this.radius * 1.6, y: this.to.y + 0.2 + r() * 0.8, z: this.to.z + (r() - 0.5) * this.radius * 1.6, vx: r() - 0.5, vy: 1.5 + 2 * r(), vz: r() - 0.5, life: 1.5 + 2 * r(), s0: 0.25, s1: 1.2 + this.radius, tau: 0.55, albedo: [0.93, 0.94, 0.96], drag: 0.6 });
      }
    }
    if (this.agent === "foam" || this.agent === "sand") {
      if (!this.foam) this.foam = w.addScorch({ pos: new THREE12.Vector3(this.to.x, 4e-3, this.to.z), radius: this.radius * 1.5, rate: 0, grow: 0.01, seed: 3, color: this.agent === "foam" ? [0.9, 0.9, 0.86] : [0.55, 0.47, 0.33] });
      this.foam.u.uGrow.value = Math.min(1, this.foam.u.uGrow.value + dt / (this.agent === "foam" ? 45 : 12));
    }
  }
  /** Řádky pro UI: co hasivo dělá s tím, co hoří. */
  rows(cls, Q, A = 1) {
    const e = agentEffect(this.agent, cls);
    return [
      ["Hasivo", `${this.a.name}, ${(this.rate * 60).toFixed(0)} ${this.a.mode === "cool" || this.agent === "foam" ? "l" : "kg"}/min`, ""],
      ["\xDA\u010Dinek na t\u0159\xEDdu " + cls, e.k > 0 ? `has\xED (\xD7${e.k})` : e.k < 0 ? "ZHOR\u0160UJE" : "\u017E\xE1dn\xFD", e.note],
      ...this.a.mode === "cool" ? [["Chladic\xED v\xFDkon", (this.rate * this.a.eta * L_WATER / 1e6).toFixed(2) + " MW", `\u03B7 = ${this.a.eta}, 2,6 MJ/kg \u26053`], ["P\xE1ra", (this.steam * 1.7).toFixed(2) + " m\xB3/s", "1 kg \u2192 1,7 m\xB3 \u26055"]] : []
    ];
  }
};

// src/fx/world.js
var gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-9))) * Math.cos(6.2831853 * r());
var FLAME_LUM = 2e4;
var FXWorld = class {
  constructor(renderer, scene, tier, pipeline) {
    this.renderer = renderer;
    this.scene = scene;
    this.pipeline = pipeline;
    this.air = new AirField();
    this.time = 0;
    this.scnTime = 0;
    this.sources = [];
    this.explosions = [];
    this.decals = [];
    this.burnables = [];
    this.dtReal = 0;
    this.sprays = [];
    this.pendingBlasts = [];
    this.delayed = [];
    this.events = [];
    this.blastRnd = mulberry32(4711);
    this.scnDt = 0;
    this.audioEvents = [];
    this.gustNoise = fbm1(77);
    this.o2 = 1;
    this.vent = ventilation(1);
    this.shake = 0;
    this.flameLum = FLAME_LUM;
    this.lumRef = 12e3;
    this.layers = { flame: true, smoke: true, sparks: true, haze: true, light: true, volume: true };
    this.setTier(tier);
  }
  setTier(tier) {
    this.tier = tier;
    for (const k of ["bb", "sp", "hz"]) if (this[k]) {
      this.scene.remove(this[k].mesh);
      this[k].geo.dispose();
      this[k].mat.dispose();
    }
    if (this.vols) this.vols.forEach((v) => {
      this.scene.remove(v.mesh);
      v.mat.dispose();
    });
    if (this.balls) this.balls.forEach((v) => {
      this.scene.remove(v.mesh);
      v.mat.dispose();
    });
    if (this.atlasRT) this.atlasRT.dispose();
    this.atlasRT = bakeAtlas(this.renderer, { res: tier.flipbookRes, steps: tier.id >= 2 ? 64 : 40 });
    const depth = this.pipeline.depthTexture;
    this.bb = new BillboardSystem(tier.particles.flame + tier.particles.smoke, this.atlasRT.texture, { depth, sort: tier.sortSmoke });
    this.sp = new SparkSystem(tier.particles.spark);
    this._flowOut = [0, 0, 0];
    this.sp.trail = this.bb;
    this.sp.trailMul = Math.sqrt(tier.emberMul ?? 1);
    this.scene.add(this.bb.mesh, this.sp.mesh);
    this.hz = tier.particles.haze ? new HazeSystem(tier.particles.haze) : null;
    if (this.hz) this.scene.add(this.hz.mesh);
    this.vols = [];
    this.balls = [];
    const mrt = !!(tier.volumeTAA && depth);
    for (let i = 0; i < tier.volumes; i++) {
      const v = new FlameVolume({ depth, steps: tier.volumeSteps, mrt });
      v.mesh.visible = false;
      this.scene.add(v.mesh);
      this.vols.push(v);
    }
    for (let i = 0; i < Math.min(3, tier.volumes); i++) {
      const v = new FlameVolume({ ball: true, depth, steps: Math.round(tier.volumeSteps * 0.75), mrt });
      v.mesh.visible = false;
      this.scene.add(v.mesh);
      this.balls.push(v);
    }
    if (this.svols) this.svols.forEach((v) => {
      this.scene.remove(v.mesh);
      v.mat.dispose();
    });
    this.svols = [];
    for (let i = 0; i < (tier.smokeVolumes ?? 0); i++) {
      const v = new SmokeVolume({ depth, steps: tier.smokeSteps ?? 48, mrt });
      this.scene.add(v.mesh);
      this.svols.push(v);
    }
    if (this.lights) this.lights.setTier(tier);
    else this.lights = new FireLights(this.scene, tier);
    if (this.debris) this.debris.dispose();
    this.debris = new Debris(this.scene, tier.debris);
    this.budgetScale = { flame: 1, smoke: 1, spark: 1 };
  }
  setWind(cls, dirRad = 0) {
    const w = WIND_CLASSES[cls];
    this.windClass = cls;
    this.air.U10 = w.U10;
    this.air.dir = dirRad;
    this.air.gust = w.gust;
    this.air.turb = w.turb;
  }
  setOxygen(o2) {
    this.o2 = o2;
    this.vent = ventilation(o2);
  }
  clear() {
    for (const s of this.sources) s.dispose?.();
    for (const e of this.explosions) e.dispose?.();
    this.sources = [];
    this.explosions = [];
    this.burnables = [];
    this.sprays = [];
    this.pendingBlasts = [];
    this.delayed = [];
    this.events = [];
    this.blastRnd = mulberry32(4711);
    this.bb.clear();
    this.sp.clear();
    this.hz?.clear();
    this.debris.clear();
    for (const d of this.decals) d.dispose();
    this.decals = [];
    this.vols.forEach((v) => v.mesh.visible = false);
    this.balls.forEach((v) => v.mesh.visible = false);
    this.svols?.forEach((v) => v.mesh.visible = false);
  }
  addSource(opts) {
    const s = new FireSource(this, opts);
    this.sources.push(s);
    return s;
  }
  addExplosion(opts) {
    const e = new Explosion(this, opts);
    this.explosions.push(e);
    return e;
  }
  addScorch(opts) {
    const d = new Scorch(this.scene, opts);
    this.decals.push(d);
    return d;
  }
  /** Hořlavý nebo ohřívaný předmět (vznícení tepelným tokem, vlastní hoření, ohoření, saze na plechu). */
  addBurnable(opts) {
    const b = new Burnable(this, opts);
    this.burnables.push(b);
    return b;
  }
  /** Proud hasiva: { agent, rate [kg/s], from: Vector3, to: Vector3, radius [m] } – kapky, pára a účinek na ohně v dosahu. */
  addSpray(opts) {
    const sp = new Spray(this, opts);
    this.sprays.push(sp);
    return sp;
  }
  /** Stopy ohně na svislé stěně (saze do V, čistý výpal, odprýskaná omítka). */
  addWallSoot(opts) {
    const d = new WallSoot(this.scene, opts);
    this.decals.push(d);
    return d;
  }
  /**
   * Výbuch z popisu (explosionSpec nebo jeho vstup) v místě pos: efekt + účinek na hořlavé předměty (okna, řetěz náloží,
   * pohlcení ohnivou koulí). src = Burnable, který vybuchl (zmizí ze světa ohně). Vrací popis výbuchu.
   */
  blast(spec, pos, { src = null, cause = "ru\u010Dn\u011B", seed = 17, cased = !!spec.cased, visual = true } = {}) {
    const es = spec.ex !== void 0 ? spec : explosionSpec(spec), P = pos.isVector3 ? pos : new THREE13.Vector3(...pos);
    if (src) {
      src.body.state = "burnt";
      src.body.exploded = true;
      if (src.src) src.src.enabled = false;
    }
    if (visual && es.ex) {
      this.addExplosion({ pos: P.clone().setY(P.y + (es.dy ?? 0.3)), seed, ...es.ex });
      for (const f of es.fires || []) this.addSource({ pos: new THREE13.Vector3(P.x, 0.01, P.z), seed: seed + 1, volume: true, ...f });
    }
    const r = blastOn(this.burnables.map((b) => {
      b.body.host = b;
      return b.body;
    }), es, [P.x, P.y, P.z], { cased, rnd: this.blastRnd, src: src?.body, t: this.scnTime });
    for (const e of r.events) {
      const b = e.body.host;
      if (e.type === "extinguished" && b.src) b.src.enabled = false;
      if (e.type === "ignite" || e.type === "reignite") {
        b.startFire();
        b.o.onIgnite?.(b);
      }
      b.o.onEvent?.(e.type, b, e);
      this.events.push({ t: this.scnTime, type: e.type, label: b.label, cause: e.cause });
    }
    for (const p of r.pending) this.delayed.push({ t: this.scnTime + p.delay, b: p.body.host, cause: p.cause });
    this.events.push({ t: this.scnTime, type: "explode", label: src?.label ?? "v\xFDbuch", cause, W: es.W });
    src?.o.onEvent?.("exploded", src, { cause, es });
    return es;
  }
  /** Popis hořících zdrojů pro výpočet tepelného toku (physics/heat.js). */
  fireList(skip = null) {
    const out = [], cw = Math.cos(this.air.dir), sw = Math.sin(this.air.dir);
    for (const s of this.sources) {
      if (s === skip || !s.active || !s.ph || s.ph.Q <= 1) continue;
      out.push({ x: s.pos.x, y: s.pos.y, z: s.pos.z, Q: s.ph.Q, D: s.D, L: s.ph.L, chiR: s.fuel.chiR, theta: s.ph.tilt.theta, wx: cw, wz: sw, sooty: s.fuel.ys > 0.03, tau: s.ph.tau, b: s.ph.b });
    }
    return out;
  }
  /** Tepelný tok [W/m²] v bodě p = [x, y, z] od všech ohňů (sálání + kontakt s plamenem + horký oblak). */
  heatFlux(p, skip = null) {
    let rad = 0, conv = 0, Tg = 293, inFlame = false;
    for (const f of this.fireList(skip)) {
      const q = fluxFromFire(f, p);
      rad += q.rad;
      conv += q.conv;
      if (q.Tg > Tg) Tg = q.Tg;
      inFlame = inFlame || q.inFlame;
    }
    return { rad, conv, total: rad + conv, Tg, inFlame };
  }
  /** Optická hustota kouře [1/m] v bodě (oblak nad zdrojem, Gaussův profil, ředění s výškou) – pro usazování sazí. ★2 */
  smokeAt(p) {
    let k = 0;
    for (const f of this.fireList()) {
      const s = Math.sin(f.theta), c2 = Math.cos(f.theta), dx = p[0] - f.x, dy = p[1] - f.y, dz = p[2] - f.z;
      const al = dx * s * f.wx + dy * c2 + dz * s * f.wz;
      if (al <= 0) continue;
      const r2 = dx * dx + dy * dy + dz * dz - al * al, bl = 0.12 * al + f.D * 0.5;
      k += f.tau / Math.max(2 * f.b, 0.2) * Math.exp(-r2 / (bl * bl)) * Math.min(1, Math.pow(f.L / al, 1.2) + 0.25);
    }
    return k;
  }
  update(dt, camera) {
    this.time += dt;
    GTIME.value = this.time;
    const a = this.air;
    a.time = this.time;
    a.gustNow = a.gust * this.gustNoise(this.time * 0.35);
    this.lights.begin();
    const dem = { flame: 0, smoke: 0, spark: 0 };
    for (const s of this.sources) {
      dem.flame += s.demand.flame;
      dem.smoke += s.demand.smoke;
      dem.spark += s.demand.spark;
    }
    const capF = this.tier.particles.flame, capS = this.tier.particles.smoke, capP = this.tier.particles.spark;
    this.budgetScale.flame = Math.min(1, capF * 0.92 / Math.max(dem.flame, 1));
    this.budgetScale.smoke = Math.min(1, capS * 0.92 / Math.max(dem.smoke, 1));
    this.budgetScale.spark = Math.min(1, capP * 0.92 / Math.max(dem.spark, 1));
    const want = this.layers.volume ? this.sources.filter((s) => s.wantsVolume()) : [];
    const cp = camera.position;
    want.forEach((s) => {
      s._imp = (s.ph?.L || 1) / (s.pos.distanceTo(cp) + 0.5);
    });
    want.sort((x, y) => y._imp - x._imp);
    this.sources.forEach((s) => s.vol = null);
    want.slice(0, this.vols.length).forEach((s, i) => s.vol = this.vols[i]);
    this.vols.forEach((v) => v.mesh.visible = false);
    this.sources.forEach((s) => s.svol = null);
    this.svols.forEach((v) => v.mesh.visible = false);
    if (this.svols.length && this.layers.smoke) {
      const sw = this.sources.filter((s) => s.enabled && s.active && s.ph && s.ph.Q > 3e4 && s.ph.tau > 0.05);
      sw.forEach((s) => {
        s._simp = s.ph.tau * s.ph.L / (s.pos.distanceTo(cp) + 1);
      });
      sw.sort((x, y) => y._simp - x._simp).slice(0, this.svols.length).forEach((s, i) => s.svol = this.svols[i]);
    }
    for (const s of this.sources) s.update(dt, this.time);
    this.sources = this.sources.filter((s) => !s.dead);
    this.dtReal = dt;
    this.scnDt = Math.max(0, this.scnTime - (this._lastScn ?? this.scnTime));
    this._lastScn = this.scnTime;
    if (this.heatOn) {
      if (!this.heatmap) this.heatmap = new HeatMap(this.scene);
      this.heatmap.mesh.visible = true;
      this.heatmap.update(this.fireList());
    } else if (this.heatmap) this.heatmap.mesh.visible = false;
    for (const sp of this.sprays) sp.update(dt);
    for (const b of this.burnables) b.update();
    if (this.pendingBlasts.length) {
      const pb = this.pendingBlasts.splice(0);
      for (const x of pb) {
        if (x.b.o.onExplode) x.b.o.onExplode(x.b, x.spec, x.cause);
        else this.blast(x.spec, x.b.pos, { src: x.b, cause: x.cause, seed: 17 + this.events.length });
      }
    }
    for (let i = this.delayed.length - 1; i >= 0; i--) if (this.delayed[i].t <= this.scnTime) {
      const x = this.delayed.splice(i, 1)[0];
      if (x.b.o.onExplode) x.b.o.onExplode(x.b, x.b.body.ex.spec, x.cause);
      else this.blast(x.b.body.ex.spec, x.b.pos, { src: x.b, cause: x.cause, seed: 31 + this.events.length });
    }
    let bi = 0;
    this.balls.forEach((v) => v.mesh.visible = false);
    for (const e of this.explosions) e.update(dt, this.time, e.wantsBall() && bi < this.balls.length ? this.balls[bi++] : null, camera);
    for (const e of this.explosions) if (e.dead) e.dispose();
    this.explosions = this.explosions.filter((e) => !e.dead);
    {
      const T = this.env?.T, amb = T ? Math.min(1.2, PRE.value * (T.hemi * 0.9 + (T.sun + T.moon) * 0.6) / Math.PI) : 1;
      for (const d of this.decals) {
        d.update(dt);
        d.setLight?.(amb);
      }
    }
    const flows = this.explosions.filter((e) => e.mf);
    a.extraUp = flows.length ? (x, y, z) => {
      const o = this._flowOut;
      o[0] = o[1] = o[2] = 0;
      for (const e of flows) e.flow(x, y, z, o);
      return o;
    } : null;
    const lights = this.lights.end(camera);
    this.bb.mesh.visible = this.layers.flame || this.layers.smoke;
    const dtex = this.pipeline.depthTexture;
    if (this.bb.mat.uniforms.tDepth.value !== dtex && dtex) this.bb.mat.uniforms.tDepth.value = dtex;
    for (const v of [...this.vols, ...this.balls, ...this.svols]) if (dtex) v.u.tDepth.value = dtex;
    this.bb.pre = PRE.value;
    if (this.env) {
      const T = this.env.T, k = 1 / Math.PI;
      this.bb.mat.uniforms.uAmb.value.setRGB(0.75, 0.8, 0.95).multiplyScalar(T.hemi * k * 0.9);
      this.bb.mat.uniforms.uSunCol.value.setRGB(1, 0.95, 0.88).multiplyScalar((T.sun + T.moon) * k * 0.6);
    }
    this.bb.update(dt, a, camera, lights);
    this.bb.mat.uniforms.uFlameLum.value = this.lumRef;
    FLAMEK.value = this.lumRef;
    this.sp.mat.uniforms.uLum.value = this.lumRef;
    this.sp.viewportH = this.pipeline.size?.H || 720;
    this.sp.update(dt, a, camera);
    this.sp.mesh.visible = this.layers.sparks;
    if (this.hz) {
      this.hz.update(dt, a, this.time);
      this.hz.mesh.visible = this.layers.haze;
    }
    this.debris.update(dt, this);
    this.shake *= Math.exp(-dt * 6);
    for (const v of [...this.vols, ...this.balls]) v.u.uTime.value = this.time;
    if (!this.layers.light) this.lights.pool.forEach((l) => l.intensity = 0);
  }
  stats() {
    return {
      flameSmoke: this.bb.n,
      sparks: this.sp.n,
      haze: this.hz ? this.hz.n : 0,
      volumes: this.vols.filter((v) => v.mesh.visible).length + this.balls.filter((v) => v.mesh.visible).length,
      lights: (this.lights.active || []).length,
      debris: this.debris.n,
      dropped: this.bb.dropped + this.sp.dropped
    };
  }
};
var FireSource = class {
  constructor(world, o) {
    this.w = world;
    this.o = { volume: true, blue: 0, start: 0, end: Infinity, footprint: { type: "disk" }, mult: {}, ...o };
    this.o.mult = { flame: 1, smoke: 1, embers: 1, sparks: 1, haze: 1, light: 1, ...o.mult };
    this.pos = o.pos.clone ? o.pos.clone() : new THREE13.Vector3(...o.pos);
    this.rnd = mulberry32(o.seed ?? 1);
    this.fl = fbm1((o.seed ?? 1) * 13 + 5);
    this.acc = { flame: 0, smoke: 0, ember: 0, spark: 0, haze: 0 };
    this.demand = { flame: 0, smoke: 0, spark: 0 };
    this.ph = null;
    this.vol = null;
    this.t0 = world.scnTime;
    this.enabled = true;
    this.fpScale = 1;
    this.D = typeof o.D === "number" ? o.D : o.footprint ? Math.sqrt(4 * (o.footprint.w || 1) * (o.footprint.d || 1) / Math.PI) : 1;
  }
  get fuel() {
    return FUELS[this.o.fuel];
  }
  wantsVolume() {
    return this.enabled && this.o.volume && this.ph && this.ph.Q > 1 && this.w.tier.volumes > 0 && this.active;
  }
  Qat(t) {
    const q = this.o.Q;
    return typeof q === "function" ? q(t) : q;
  }
  /** Fyzikální stav v čase t (lokální čas zdroje) */
  physics(t) {
    const f = this.fuel, D = this.D, vent = this.o.ventLocal != null ? ventilation(this.o.ventLocal) : this.w.vent;
    const Q = Math.max(0, this.Qat(t)) * vent.chi * (this.suppK ?? 1);
    const Lb = this.o.L ? this.o.L(Q) : flameHeight(Q, D);
    const L = Lb * (1 + 0.35 * vent.lift);
    const U = this.w.air.windAt(Math.max(L * 0.5, 0.05) + this.pos.y);
    let tilt = flameTilt(U, Math.max(Q, 1), D);
    if (this.o.attach) tilt = { ...tilt, theta: tilt.theta * (1 - 0.7 * this.o.attach) };
    const T = this.o.T ?? flameColorTemp(this.o.fuel, vent);
    const fp = puffingFrequency(D);
    const Qc = (1 - f.chiR) * Q / 1e3;
    const z0 = virtualOrigin(Math.max(Q, 1), D);
    const zs = L * 1.1 + D * 0.3;
    const sm = Q > 10 ? smokeOpticalDepth(Q, D, zs, this.o.fuel, vent) : { tau: 0, b: D };
    const col = smokeColor(this.o.fuel, vent);
    const I = flameLuminousIntensity(Q, T) * this.o.mult.light;
    return { Q, L, U, tilt, T, fp, Qc, z0, tau: sm.tau, b: sm.b, smoke: col, I, vent };
  }
  /** Hořící oharek z ohniště (scénáře: rozvalení hranice, zřícení střechy). sc = měřítko rychlosti. */
  spawnBrand(sc = 1, at = null) {
    const w = this.w, r = this.rnd, ph = this.ph, L = ph?.L ?? 1, D = this.D ?? 0.5;
    const [x, y, z] = at ?? this.footprintPoint();
    const dm = Math.min(0.035, Math.max(5e-3, 0.012 * Math.exp(0.55 * gauss(r))));
    const vt = Math.sqrt(4 * 300 * 9.81 * dm / 3.6);
    const a = r() * 6.283, sp = (1 + 2.5 * r()) * sc, up = (2 + 4 * r()) * sc * Math.min(1.6, 0.6 + L * 0.3);
    w.sp.spawn({
      x: x + (r() - 0.5) * D * 0.3,
      y: y + L * (0.1 + 0.3 * r()),
      z: z + (r() - 0.5) * D * 0.3,
      vx: Math.cos(a) * sp,
      vy: up,
      vz: Math.sin(a) * sp,
      life: 3 + 5 * r() + dm * 120,
      T: 1050 + 200 * r(),
      size: dm,
      drag: vt / 9.81,
      grav: 1,
      seed: r(),
      ox: this.pos.x,
      oz: this.pos.z,
      pq: ph ? ph.Qc * 0.5 : 0,
      pz0: this.pos.y + (ph?.z0 ?? 0),
      R0: D / 2,
      ember: true,
      vt,
      brand: 0.25 + 0.4 * r(),
      smokeRGB: [0.2 + 0.1 * r()]
    });
  }
  /** Dávka oharků najednou (zřícení, rozvalení) – n kusů, rychlost × sc. */
  brandBurst(n, sc = 1.5, at = null) {
    const k = Math.round(n * Math.sqrt(this.w.tier.emberMul ?? 1) * this.w.budgetScale.spark);
    for (let i = 0; i < k; i++) this.spawnBrand(sc * (0.6 + 0.8 * this.rnd()), at);
  }
  footprintPoint() {
    const r = this.rnd, fp = this.o.footprint, D = this.D, k = this.fpScale;
    let x, z;
    if (fp.type === "rect") {
      x = (r() - 0.5) * fp.w * k;
      z = (r() - 0.5) * fp.d * k;
      const c2 = Math.cos(fp.rot || 0), s = Math.sin(fp.rot || 0);
      [x, z] = [x * c2 - z * s, x * s + z * c2];
    } else if (fp.type === "points") {
      const p = fp.pts[r() * fp.pts.length | 0];
      x = p[0] + (r() - 0.5) * (fp.jit || 0.2);
      z = p[1] + (r() - 0.5) * (fp.jit || 0.2);
      return [this.pos.x + x, (p[2] || 0) + this.pos.y, this.pos.z + z];
    } else {
      const a = r() * 6.2832, rr = D / 2 * Math.sqrt(r());
      x = Math.cos(a) * rr;
      z = Math.sin(a) * rr;
    }
    return [this.pos.x + x, this.pos.y, this.pos.z + z];
  }
  get t() {
    return this.w.scnTime - this.t0;
  }
  update(dt, gt) {
    const lt = this.t;
    this.active = this.enabled && lt >= this.o.start && lt <= this.o.end;
    if (!this.active) {
      this.demand = { flame: 0, smoke: 0, spark: 0 };
      return;
    }
    const tl = lt - this.o.start;
    this.fpScale = this.o.scale ? Math.max(0.02, this.o.scale(tl)) : 1;
    const fpo = this.o.footprint;
    this.D = typeof this.o.D === "function" ? this.o.D(tl) : fpo.type === "rect" ? Math.sqrt(4 * fpo.w * fpo.d * this.fpScale ** 2 / Math.PI) : this.o.D * this.fpScale;
    const ph = this.ph = this.physics(tl);
    if (ph.Q <= 1) {
      this.demand = { flame: 0, smoke: 0, spark: 0 };
      return;
    }
    const w = this.w, m = this.o.mult, f = this.fuel, r = this.rnd, D = this.D;
    const push = this.o.push || [0, 0, 0];
    const cw = Math.cos(w.air.dir), sw = Math.sin(w.air.dir);
    const lean = Math.tan(Math.min(ph.tilt.theta, 1.3));
    const flareRate = { straw: 0.25, woodDry: 0.14, woodResin: 0.18, forestLitter: 0.2, brush: 0.2, houseContents: 0.1, vehicle: 0.08, rubber: 0.06, paraffin: 0 }[this.o.fuel] ?? 0.03;
    this.flare = (this.flare || 0) * Math.exp(-dt / 0.45);
    let flared = false;
    if (r() < flareRate * dt) {
      this.flare = Math.min(1, this.flare + 0.35 + 0.45 * r());
      flared = true;
    }
    const flick = (0.8 + 0.2 * this.fl(gt * ph.fp * 0.6) + 0.12 * this.fl(gt * 0.4 + 9)) * (1 + 0.5 * this.flare);
    const kE = 2.7 * (f.fv ?? 0.6) * (0.7 + 0.6 * Math.min(1, ph.vent.sootMul - 0.5));
    const tauD = kE * D * 0.5;
    this.gainVol = tauD < 1 ? Math.min(2, Math.pow(1 / Math.max(tauD, 0.05), 0.5)) : Math.pow(1 + 0.6 * Math.max(0, tauD - 1), -(w.gainExp ?? 0.6));
    const Tvis = (f.Tlum ?? ph.T + 80) - ph.vent.tempDrop - 60;
    const kSpr = this.gainVol * w.flameLum / Math.max(w.lumRef, 1e-6);
    const useVol = this.vol && w.layers.volume;
    if (useVol) {
      const v = this.vol;
      v.mesh.visible = w.layers.flame;
      const Rz = this.o.footprint.type === "rect" ? Math.max(this.o.footprint.d * this.fpScale, 0.1) / 2 : null;
      const Rx = this.o.footprint.type === "rect" ? Math.max(this.o.footprint.w * this.fpScale, 0.1) / 2 : D / 2;
      v.place(this.pos, ph.L * (0.95 + 0.1 * flick + 0.2 * this.flare), Math.max(Rx, 4e-3), ph.tilt.theta, w.air.dir, ph.tilt.drag, Rz);
      const u = v.u, tier = w.tier;
      u.uTpeak.value = (f.Tlum ?? ph.T + 80) - ph.vent.tempDrop + (w.tBoost ?? 50);
      u.uTamb.value = 700;
      u.uIntensity.value = w.flameLum * flick * this.gainVol;
      u.uFlame2.value.set(
        kE,
        Math.min(1, Math.max(0, (D - 1.5) / 4)) * Math.min(1, f.ys * ph.vent.sootMul * 20),
        tier.flameEdge ?? 0.14,
        (0.65 + 0.2 * w.air.turb) * (1 - 0.45 * Math.min(1, Math.max(0, (3 - ph.L / Math.max(D, 0.01)) * 0.5)))
      );
      this._volR = Math.max(Rx, 4e-3);
      u.uSigma.value = 0.6 / Math.max(D, 0.02);
      u.uSigmaSoot.value = 3 / Math.max(Math.sqrt(D), 0.1);
      u.uSeed.value = (this.o.seed ?? 1) * 0.37;
      const eddy = Math.max(D, ph.L * 0.3) * 0.42;
      const U = 1.75 * Math.pow(ph.Q / 1e3, 0.2);
      const bigK = Math.min(1, Math.max(0, (3 - ph.L / Math.max(D, 0.01)) * 0.5));
      u.uTurb.value.set(this.o.turbAmp ?? 0.55 + 0.25 * ph.vent.lift + 0.3 * bigK, eddy, Math.max(U, 0.05), (this.o.wobble ?? 0.25) + 0.1 * w.air.turb + 0.25 * ph.vent.lift);
      u.uFlowL.value = Math.max(ph.L, 0.01);
      u.uShapeK.value = this.o.shapeK ?? Math.min(2.2, Math.max(1, 1 + (3 - ph.L / Math.max(D, 0.01)) * 0.5));
      u.uTongues.value = this.o.volTongues ?? (D < 0.12 ? 0 : Math.min(7, Math.max(3, Math.round(2.5 + D * 1.4))));
      u.uDetail.value = tier.volumeDetail ?? 1;
      const sc = v.mesh.scale, boxMax = Math.max(sc.x, sc.y, sc.z);
      u.uStepLen.value = Math.max(Math.min(eddy * 0.1, 0.6 / Math.max(kE, 0.1)), boxMax / tier.volumeSteps * 0.85);
      const edgeM = tier.flameEdgeM ?? 0.05;
      u.uFlame2.value.z = Math.max(Math.min(tier.flameEdge ?? 0.14, edgeM / this._volR), 1.3 * u.uStepLen.value / this._volR * 0.5);
      u.uPuff.value.set(ph.fp, this.o.puffAmp ?? 0.5);
      u.uShape.value.y = this.o.taper ?? 0.85;
      u.uShape.value.z = this.o.baseWide ?? 0.25;
      u.uShape.value.w = this.o.neck ?? 0.2;
      u.uSoot.value = Math.min(1, f.ys * ph.vent.sootMul * 18) * (this.o.volSoot ?? 1);
      u.uBlue.value = this.o.blue;
      u.uLift.value = ph.vent.lift;
    }
    const L = ph.L;
    const uf = 1.5 * Math.pow(ph.Q / 1e3, 0.2);
    const life = Math.min(2.5, Math.max(0.22, L / uf));
    const s0 = 1.45 * Math.max(Math.min(0.9 * L, Math.max(0.5 * L, 0.65 * D)), 4e-3);
    let nF = Math.min(160, 5 + 4 * (D / s0) ** 2 * (L / s0)) * m.flame * (useVol ? 0.5 : 1);
    if (this.o.tongues) nF = this.o.tongues * (useVol ? 0.5 : 1);
    this.demand.flame = nF;
    if (w.layers.flame && !(useVol && this.o.volumeOnly)) {
      this.acc.flame += nF * w.budgetScale.flame * dt / life;
      while (this.acc.flame >= 1) {
        this.acc.flame -= 1;
        const [x, y, z] = this.footprintPoint();
        const up = L / life * 0.75;
        if (useVol) {
          const h2 = L * (0.55 + 0.45 * r()), sz = s0 * (0.18 + 0.14 * r());
          w.bb.spawnFlame({
            x: x * 0.6 + this.pos.x * 0.4 + lean * h2 * cw,
            y: y + h2,
            z: z * 0.6 + this.pos.z * 0.4 + lean * h2 * sw,
            vx: up * lean * cw + push[0],
            vy: up * 1.2 + push[1],
            vz: up * lean * sw + push[2],
            life: life * (0.25 + 0.2 * r()),
            s0: sz,
            s1: sz * 0.3,
            T: Tvis + (r() - 0.5) * 80,
            lum: flick * 0.6 * kSpr,
            tint: [1, 1, 1],
            ox: this.pos.x,
            oz: this.pos.z,
            pq: 0,
            pz0: 0,
            drag: life * 4,
            stretch: 0.8,
            R0: D / 2,
            seed: r()
          });
          continue;
        }
        if (D > 1.2 && r() < 0.35) {
          const h2 = L * (0.25 + 0.5 * r());
          w.bb.spawnFirePuff({ x: x + lean * h2 * cw, y: y + h2, z: z + lean * h2 * sw, vx: up * lean * cw + push[0], vy: up * 0.8 + push[1], vz: up * lean * sw + push[2], life: life * (0.8 + 0.6 * r()), s0: s0 * 0.7, s1: s0 * 1.1, T: Tvis * (0.95 + 0.1 * r()), lum: flick * 0.8 * kSpr, soot: Math.min(1, f.ys * ph.vent.sootMul * 10), drag: life * 3, seed: r() });
          continue;
        }
        w.bb.spawnFlame({
          x,
          y: y + L * 0.08 * r(),
          z,
          vx: up * lean * cw + push[0],
          vy: up + push[1],
          vz: up * lean * sw + push[2],
          life: life * (0.75 + 0.5 * r()),
          s0: s0 * (0.8 + 0.4 * r()),
          s1: s0 * 0.55,
          T: Tvis + (r() - 0.5) * 100,
          lum: flick * 0.75 * kSpr,
          tint: [1, 1, 1],
          ox: this.pos.x,
          oz: this.pos.z,
          pq: 0,
          pz0: 0,
          drag: life * 4,
          stretch: 0.6 + ph.tilt.us * 0.1,
          R0: D / 2,
          seed: r()
        });
      }
    }
    const sv = this.svol;
    if (sv) {
      const H = Math.min(60, Math.max(6 * L, 8 * D)), b0 = Math.max(ph.b * 0.8, D * 0.35, 0.05);
      const wr = 1.9 * Math.pow(ph.Q / 1e3, 0.2) * 0.6;
      const lean2 = H * Math.min(2.5, (ph.U || 0) / Math.max(wr, 0.5)) * 0.5;
      sv.mesh.visible = true;
      sv.place(new THREE13.Vector3(this.pos.x, this.pos.y + L * 0.7, this.pos.z), H, b0, lean2, w.air.dir);
      const u = sv.u, bu = w.bb.mat.uniforms;
      u.uAlb.value.setRGB(ph.smoke.rgb[0], ph.smoke.rgb[1], ph.smoke.rgb[2]);
      u.uAmb.value.copy(bu.uAmb.value);
      u.uSun.value.copy(bu.uSunCol.value);
      u.uSig0.value = ph.tau / (1.7725 * Math.max(ph.b, 0.02)) * m.smoke;
      u.uBref.value = Math.max(ph.b, 0.02);
      u.uEddy.value = b0 + 0.06 * H;
      u.uRise.value = wr;
      u.uTime.value = gt;
      u.uSeed.value = (this.o.seed ?? 1) * 0.29;
      u.uGlowPos.value.set(this.pos.x, this.pos.y + L * 0.35, this.pos.z);
      const gc = bbRGB(ph.T);
      u.uGlowCol.value.setRGB(gc[0], gc[1], gc[2]).multiplyScalar(ph.I * 0.02 * (0.85 + 0.15 * flick));
      u.uGlowK.value = 1.2;
      u.uGlowR2.value = (0.6 * L) ** 2 + 0.25;
      u.uFade.value = Math.min(1, ph.tau * 8);
    }
    const smokeLife = (this.o.smokeLife ?? 1) * Math.min(28, Math.max(2.5, 4 + Math.sqrt(ph.Q / 1e5) * 3));
    const sMul = w.tier.smokeMul ?? 1;
    const nS = Math.min(700 * sMul, (8 + 22 * Math.sqrt(ph.Q / 1e5)) * sMul) * m.smoke * (sv ? 0.4 : 1);
    this.demand.smoke = ph.tau > 3e-3 ? nS : 0;
    if (w.layers.smoke && ph.tau > 3e-3) {
      this.acc.smoke += nS * w.budgetScale.smoke * dt / smokeLife;
      const zs = this.pos.y + L * (0.75 + 0.3 * r());
      const b = Math.max(ph.b, D * 0.35, 0.02);
      const fpr = this.o.footprint, lineK = fpr && fpr.type === "rect" && Math.max(fpr.w, fpr.d) > 1.6 * Math.min(fpr.w, fpr.d) ? 0.8 : 0;
      while (this.acc.smoke >= 1) {
        this.acc.smoke -= 1;
        const [x, , z] = this.footprintPoint();
        const k = 0.45 + 0.4 * r();
        const s0s = b * (1.2 + 0.6 * r()) / Math.pow(sMul, 0.25);
        const tau0 = Math.min(8, ph.tau * 0.5 * (1 / Math.max(this.w.budgetScale.smoke * sMul, 0.25)) ** 0.7);
        w.bb.spawnSmoke({
          x: x + lean * L * cw * k + push[0] * 0.3,
          y: zs,
          z: z + lean * L * sw * k + push[2] * 0.3,
          vx: push[0] * 0.5,
          vy: Math.max(1, L * ph.fp * 0.5),
          vz: push[2] * 0.5,
          life: smokeLife * (0.7 + 0.6 * r()),
          s0: s0s,
          s1: s0s * (4 + 4 * r()) + smokeLife * 0.15,
          tau: tau0,
          // pruh (liniový oheň): osa vztlaku leží pod částicí, ne ve středu zdroje → souvislá kouřová opona místo sloupů
          albedo: ph.smoke.rgb,
          ox: this.pos.x + (x - this.pos.x) * lineK,
          oz: this.pos.z + (z - this.pos.z) * lineK,
          pq: ph.Qc * (1 - 0.5 * lineK),
          pz0: this.pos.y + ph.z0,
          drag: 0.5,
          seed: r(),
          R0: D / 2,
          glowing: ph.vent.lift > 0.5 && r() < 0.3
        });
      }
    }
    const qk = Math.sqrt(ph.Q / 1e5), eMul = w.tier.emberMul ?? 1;
    const rE = f.embers * 10 * qk * m.embers * eMul, rS = f.sparks * 4 * qk * m.sparks * eMul;
    this.demand.spark = rE * 4 + rS * 1;
    if (w.layers.sparks) {
      this.acc.ember += rE * w.budgetScale.spark * dt;
      while (this.acc.ember >= 1) {
        this.acc.ember -= 1;
        const [x, y, z] = this.footprintPoint();
        const dm = Math.min(0.012, Math.max(6e-4, 16e-4 * Math.exp(0.65 * gauss(r))));
        const vt = Math.sqrt(4 * 250 * 9.81 * dm / (3 * 1.2 * 1));
        w.sp.spawn({
          x,
          y: y + L * r() * 0.5,
          z,
          vx: (r() - 0.5) * 0.8,
          vy: 0.5 + r() * Math.min(5, L * 1.2),
          vz: (r() - 0.5) * 0.8,
          life: Math.min(14, 1.5 + dm * 1600 * (0.6 + 0.8 * r())),
          T: 1e3 + 200 * r(),
          size: dm * 1.2,
          drag: vt / 9.81,
          grav: 1,
          ox: this.pos.x,
          oz: this.pos.z,
          pq: ph.Qc,
          pz0: this.pos.y + ph.z0,
          seed: r(),
          R0: D / 2,
          ember: true,
          vt
        });
      }
      if (f.sparks >= 0.2 && f.embers > 0.3) {
        this.acc.pop = (this.acc.pop || 0) + 0.25 * qk * m.sparks * Math.min(1.5, eMul) * dt;
        if (this.acc.pop >= 1 && r() < 0.5) {
          this.acc.pop = 0;
          const [px, py, pz] = this.footprintPoint();
          if (w.audioEvents && w.audioEvents.length < 64) w.audioEvents.push({ type: "pop", pos: new THREE13.Vector3(px, py, pz) });
          const cnt = Math.round((6 + 18 * r()) * Math.min(1.5, eMul) * w.budgetScale.spark);
          const ay = 0.6 + 0.4 * r(), az = r() * 6.283;
          for (let k = 0; k < cnt; k++) {
            const a = az + (r() - 0.5) * 2.2, el = ay + (r() - 0.5) * 0.7, sp = 3 + 6 * r();
            const dm = 3e-4 + 6e-4 * r(), vt = Math.sqrt(4 * 300 * 9.81 * dm / 3.6);
            w.sp.spawn({
              x: px,
              y: py + L * 0.08 * r() + 0.02,
              z: pz,
              vx: Math.cos(a) * Math.cos(el) * sp,
              vy: Math.sin(el) * sp,
              vz: Math.sin(a) * Math.cos(el) * sp,
              life: 0.5 + 1.1 * r(),
              T: 1400 + 150 * r(),
              tauC: 0.5 + 0.5 * r(),
              size: dm,
              drag: vt / 9.81,
              grav: 1,
              seed: r()
            });
          }
        }
      }
      if (f.embers > 0.3 && m.embers > 0) {
        const eB = Math.sqrt(eMul) * w.budgetScale.spark;
        this.acc.brand = (this.acc.brand || 0) + 0.45 * f.embers * qk * eB * dt;
        let nb = 0;
        while (this.acc.brand >= 1) {
          this.acc.brand -= 1;
          nb++;
        }
        if (flared && r() < 0.6) nb += 1 + Math.floor(r() * 2.5 * Math.min(2, qk));
        for (let k = 0; k < nb; k++) this.spawnBrand(r() < 0.5 ? 1 : 0.6);
      }
      if (flared && (f.ys ?? 0) > 0.03 && w.layers.smoke !== false) {
        const nS2 = Math.round((4 + 4 * r()) * Math.min(2, this.w.budgetScale.smoke * (w.tier.smokeMul ?? 1)));
        for (let k = 0; k < nS2; k++) {
          const [x, , z] = this.footprintPoint(), s02 = D * (0.25 + 0.2 * r());
          w.bb.spawnSmoke({
            x: x * 0.6 + this.pos.x * 0.4 + push[0] * 0.3,
            y: this.pos.y + L * (0.75 + 0.35 * r()),
            z: z * 0.6 + this.pos.z * 0.4 + push[2] * 0.3,
            vx: (r() - 0.5) * 0.5,
            vy: Math.max(1.2, L * ph.fp * 0.6),
            vz: (r() - 0.5) * 0.5,
            life: 4 + 3 * r(),
            s0: s02,
            s1: s02 * 5 + D,
            tau: 3 + 3 * r(),
            albedo: [0.05, 0.048, 0.046],
            ox: this.pos.x,
            oz: this.pos.z,
            pq: ph.Qc,
            pz0: this.pos.y + ph.z0,
            drag: 0.5,
            seed: r(),
            R0: D / 2
          });
        }
      }
      this.acc.spark += rS * w.budgetScale.spark * dt;
      while (this.acc.spark >= 1) {
        this.acc.spark -= 1;
        const [x, y, z] = this.footprintPoint();
        const a = r() * 6.283, sp = 2 + 5 * r();
        w.sp.spawn({
          x,
          y: y + L * 0.15,
          z,
          vx: Math.cos(a) * sp * 0.5,
          vy: sp * (0.6 + 0.4 * r()),
          vz: Math.sin(a) * sp * 0.5,
          life: 0.5 + r(),
          T: 1350 + 250 * r(),
          tauC: 0.4,
          size: 1e-3,
          drag: 0.9,
          grav: 1,
          seed: r()
        });
      }
    }
    if (w.hz && w.layers.haze) {
      this.acc.haze += Math.min(14, 3 + qk * 4) * m.haze * dt;
      while (this.acc.haze >= 1) {
        this.acc.haze -= 1;
        const [x, y, z] = this.footprintPoint();
        w.hz.spawn({ x, y: y + L * (0.7 + 0.5 * r()), z, vy: 1.5, life: 1.2 + r(), size: Math.max(L * 0.7, D * 1.2), ox: this.pos.x, oz: this.pos.z, pq: ph.Qc, pz0: this.pos.y + ph.z0, R0: D / 2 });
      }
    }
    const lh = this.o.lightH ?? 0.65;
    w.lights.add(this.pos.x + lean * L * lh * cw, this.pos.y + L * lh, this.pos.z + lean * L * lh * sw, ph.I * flick, (f.Tlum ?? ph.T + 80) - ph.vent.tempDrop - 40, Math.max(D * 0.6, L * 0.5), ph.tau / Math.max(2 * ph.b, 0.05));
  }
};
function makeWilsonDome() {
  const u = { ...sharedUniforms(), uA: { value: 0 }, uCov: { value: 0.35 }, uTime: { value: 0 }, uAmb: { value: new THREE13.Color() }, uSun: { value: new THREE13.Color() } };
  const mat = new THREE13.ShaderMaterial({
    glslVersion: THREE13.GLSL3,
    transparent: true,
    depthWrite: false,
    side: THREE13.DoubleSide,
    uniforms: u,
    blending: THREE13.CustomBlending,
    blendSrc: THREE13.OneFactor,
    blendDst: THREE13.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE13.OneFactor,
    blendDstAlpha: THREE13.OneMinusSrcAlphaFactor,
    vertexShader: `out vec3 vW; out vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `precision highp float; precision highp sampler3D;
${GLSL_COMMON}
in vec3 vW; in vec3 vN; out vec4 o; uniform float uA, uTime, uCov; uniform vec3 uAmb, uSun;
void main(){
  vec3 v = normalize(cameraPosition - vW);
  float rim = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
  // mraky z vide\xED zkou\u0161ek: hladk\xFD b\xEDl\xFD pl\xE1\u0161\u0165 s jemn\xFDmi pruhy, jasn\u011Bj\u0161\xED lem, u zem\u011B \u0159id\u0161\xED (tepl\xFD vzduch nad ter\xE9nem)
  vec3 nN = normalize(vN);
  float n = 0.65 * fbm3(nN * 3.0 + vec3(0.0, uTime * 0.05, 0.0)) + 0.35 * fbm3(vW * 0.05);
  // tenk\xFD pl\xE1\u0161\u0165: st\u0159ed pr\u016Fsvitn\xFD, jasn\xFD lem (del\u0161\xED dr\xE1ha paprsku v pl\xE1\u0161ti) \u2013 fotky Sailor Hat, Minor Scale
  float a = uA * (0.04 + 0.96 * pow(rim, 0.75)) * mix(0.45, 1.0, smoothstep(uCov, uCov + 0.45, n)) * smoothstep(0.02, 0.3, nN.y) * (gl_FrontFacing ? 1.0 : 0.6);
  // kondenz\xE1t (kapky ~\xB5m) m\xE1 albedo ~0,8 a na slunci z\xE1\u0159\xED b\xEDle jasn\u011Bji ne\u017E obloha
  vec3 c = (uAmb * 1.1 + uSun * (0.8 + 0.9 * max(dot(nN, normalize(vec3(0.3, 1.0, 0.2))), 0.0))) * 1.6 * uPreExp;
  o = fxOut(vec4(c * a, a));
}`
  });
  const mesh2 = new THREE13.Mesh(new THREE13.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  mesh2.layers.set(LAYER_FX);
  mesh2.renderOrder = 4;
  mesh2.frustumCulled = false;
  return { mesh: mesh2, u };
}
var Explosion = class {
  constructor(world, o) {
    this.w = world;
    this.o = o;
    this.t = 0;
    this.pos = o.pos.clone ? o.pos.clone() : new THREE13.Vector3(...o.pos);
    this.rnd = mulberry32(o.seed ?? 5);
    this.table = o.W > 0 ? shockTable(o.W, Math.max(60, Math.cbrt(o.W) * 60)) : null;
    this.started = false;
    this.dustAcc = 0;
    this.smokeAcc = 0;
    this.dead = false;
    this.fbAcc = 0;
    this.camHit = false;
  }
  dispose() {
    if (this.wc) {
      this.w.scene.remove(this.wc.mesh);
      this.wc.mesh.geometry.dispose();
      this.wc.mesh.material.dispose();
      this.wc = null;
    }
  }
  /** Rychlostní pole houbového mraku v bodě (přičte do out): rotace kolem jádra prstence, stoupání klobouku, sloupec, přítok. */
  flow(x, y, z, out) {
    const m = this.mf, dx = x - m.x, dz = z - m.z, r = Math.sqrt(dx * dx + dz * dz) + 1e-3, ex = dx / r, ez = dz / r;
    const pr = r - m.a, pz = y - m.zc, d = Math.sqrt(pr * pr + pz * pz) + 1e-3, c2 = 0.5 * m.a;
    const Vc = 1.3 * m.w * m.k, sp = d < c2 ? Vc * d / c2 : Vc * (c2 / d) * Math.exp(-(d - c2) / (1.2 * c2));
    let vr = sp * pz / d, vy = -0.6 * sp * pr / d;
    vy += m.w * Math.exp(-(r * r) / (3.2 * m.a * m.a) - pz * pz / (1.7 * m.a * m.a));
    if (y < m.zc) {
      const rs = 0.26 * m.a + 2;
      vy += 1.4 * m.w * m.k * Math.exp(-(r * r) / (rs * rs));
    }
    const hg = 0.08 * (m.zc - m.y0) + 2;
    if (r > 0.12 * m.a) vr -= 0.55 * m.w * m.k * Math.min(1, m.a / r) * Math.exp(-Math.max(y - m.y0, 0) / hg);
    out[0] += vr * ex;
    out[1] += vy;
    out[2] += vr * ez;
  }
  wantsBall() {
    const fb = this.o.fireball;
    return fb && this.t < fb.t * 2.2 && this.w.tier.volumes > 0 && this.w.layers.volume;
  }
  update(dt, gt, ball, camera) {
    const w = this.w, o = this.o, r = this.rnd, fb = o.fireball;
    this.t += dt;
    const t = this.t;
    if (!this.started) {
      this.started = true;
      if (o.debris) w.debris.burst(this.pos, o.debris, r);
      if (o.sparks) for (let i = 0; i < o.sparks.n * w.budgetScale.spark; i++) {
        const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u), v = o.sparks.speed * (0.4 + 0.6 * r());
        w.sp.spawn({ x: this.pos.x, y: this.pos.y + 0.1, z: this.pos.z, vx: Math.cos(a) * s * v, vy: Math.abs(u) * v * 0.8 + 1, vz: Math.sin(a) * s * v, life: 0.4 + r() * 1.4, T: 1600 + 600 * r(), tauC: 0.35 + r() * 0.4, size: 3e-3 + r() * 0.01, drag: 1.5 + r() * 3, grav: 1, seed: r() });
      }
      if (o.scorch) w.addScorch({ pos: this.pos, radius: o.scorch, seed: o.seed, crater: o.crater || 0 });
      if (o.dust && o.W > 0 && this.pos.y / Math.cbrt(o.W) < 0.5) {
        const k = Math.cbrt(o.W), nJ = Math.round(8 + 6 * Math.min(1, k / 4)), v0 = 12 * Math.pow(o.W, 1 / 6);
        const soil = (o.dustAlbedo || [0.32, 0.27, 0.2]).map((c2) => c2 * 0.7);
        const per = Math.max(5, Math.round(22 * Math.min(1.5, w.tier.smokeMul ?? 1) * w.budgetScale.smoke));
        w.debris.burst(this.pos, { n: Math.round((50 + 60 * Math.min(4, k)) * Math.min(2, w.tier.smokeMul ?? 1)), speed: v0 * 1.3, size: 0.012 + 0.025 * Math.min(4, k), hot: 0, up: 0.7 }, r);
        for (let j = 0; j < nJ; j++) {
          const az = j / nJ * 6.283 + (r() - 0.5) * 0.5, el = 0.6 + 0.6 * r(), vj = v0 * (0.75 + 0.5 * r());
          for (let i = 0; i < per; i++) {
            const f = 0.3 + 0.7 * Math.pow(r(), 0.7), v = vj * f, e = el + (r() - 0.5) * 0.12, a = az + (r() - 0.5) * 0.12;
            w.bb.spawnSmoke({
              x: this.pos.x,
              y: Math.max(0.05, this.pos.y),
              z: this.pos.z,
              vx: Math.cos(a) * Math.cos(e) * v,
              vy: Math.sin(e) * v,
              vz: Math.sin(a) * Math.cos(e) * v,
              life: 2.5 + 3 * r(),
              s0: 0.07 * k + 0.06,
              s1: (0.5 + 0.7 * r()) * k + 0.35,
              tau: 2.2 + r(),
              albedo: soil,
              drag: 0.9 + 0.9 * f,
              grav: 0.85,
              seed: r()
            });
          }
        }
      }
      if (o.dust && o.W > 0) {
        const k = Math.cbrt(o.W), n = Math.min(260, 40 + 50 * k) * w.budgetScale.smoke;
        for (let i = 0; i < n; i++) {
          const a = r() * 6.283, rr = 0.3 * k * r(), v = (2 + 6 * r()) * Math.min(3, 0.6 + k * 0.4);
          w.bb.spawnSmoke({ x: this.pos.x + Math.cos(a) * rr, y: 0.1 + r() * 0.3 * k, z: this.pos.z + Math.sin(a) * rr, vx: Math.cos(a) * v, vy: 0.5 + r() * 2 * k, vz: Math.sin(a) * v, life: 4 + 6 * r(), s0: 0.25 + 0.35 * k, s1: 1 + 1.6 * k, tau: 1.4, albedo: o.dustAlbedo || [0.32, 0.27, 0.2], drag: 0.7, seed: r() });
        }
      }
    }
    if (fb) {
      const Rmax = fb.D / 2, tf = fb.t;
      const grow = 1 - Math.exp(-t / (0.12 * tf + 5e-3));
      const R = Rmax * grow * (1 + 0.15 * Math.min(t / tf, 2));
      const age = Math.min(1, t / (tf * 2));
      const yc = this.pos.y + Math.max(R * 0.85, (fb.rise || 0) * Math.min(1, t / (tf * 2.5)) + R * 0.6);
      this.fbR = R;
      this.fbY = yc;
      if (ball && t < tf * 2.2) {
        ball.mesh.visible = true;
        const S = R * 2.3;
        ball.mesh.position.set(this.pos.x, yc - S / 2, this.pos.z);
        ball.mesh.rotation.set(0, 0, 0);
        ball.mesh.scale.set(S, S, S);
        const u = ball.u;
        u.uScale.value.set(S, S, S);
        u.uAge.value = age;
        u.uTpeak.value = fb.T;
        u.uTamb.value = 700;
        u.uIntensity.value = w.lumRef * 1.8 / Math.max(R, 0.05) * (1 - age * 0.6);
        u.uSigma.value = 0.8 / Math.max(R, 0.05);
        u.uSoot.value = (fb.soot ?? 0.5) * 2 / Math.max(R, 0.1) * 0.5;
        u.uTurb.value.set(0.5, Math.max(R * 0.6, 0.05), Math.max(R / tf * 0.4, 0.2), 0);
        u.uSeed.value = (o.seed ?? 5) * 0.21;
      } else if (t < tf * 1.6 && w.layers.flame) {
        this.fbAcc += dt * (90 / Math.max(tf, 0.05)) * w.budgetScale.flame;
        while (this.fbAcc >= 1) {
          this.fbAcc -= 1;
          const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u), rr = R * Math.cbrt(r()) * 0.75;
          const out = R / tf * 0.4;
          w.bb.spawnFirePuff({ x: this.pos.x + Math.cos(a) * s * rr, y: yc + u * rr, z: this.pos.z + Math.sin(a) * s * rr, vx: Math.cos(a) * s * out, vy: R / tf * 0.3 + u * out, vz: Math.sin(a) * s * out, life: tf * (0.7 + 0.8 * r()) + 0.05, s0: R * 0.55, s1: R * 0.9, T: fb.T * (1 - age * 0.3) * (0.9 + 0.2 * r()), lum: 1, soot: (fb.soot ?? 0.5) * 0.6, drag: 0.5, seed: r() });
        }
      }
      const Ifb = (o.flash || 1e5) * Math.exp(-t / (0.25 * tf + 4e-3)) + flameLuminousIntensity(fb.D * fb.D * 4e5 * Math.max(0, 1 - t / (tf * 1.8)), fb.T * (1 - age * 0.4));
      if (t < tf * 3) w.lights.add(this.pos.x, yc, this.pos.z, Ifb, fb.T * (1 - age * 0.3), R * 0.7 + 0.1);
      if (o.smoke && t > tf * 0.4 && t < tf * 0.4 + (o.smoke.dur || tf * 3)) {
        this.smokeAcc += dt * (o.smoke.n / (o.smoke.dur || tf * 3)) * w.budgetScale.smoke;
        while (this.smokeAcc >= 1) {
          this.smokeAcc -= 1;
          const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u), rr = R * (0.4 + 0.6 * r());
          w.bb.spawnSmoke({ x: this.pos.x + Math.cos(a) * s * rr, y: yc + u * rr * 0.7, z: this.pos.z + Math.sin(a) * s * rr, vx: Math.cos(a) * s * 0.5, vy: o.smoke.buoy ?? 4, vz: Math.sin(a) * s * 0.5, life: o.smoke.life * (0.6 + 0.6 * r()), s0: R * 0.5, s1: R * (1.4 + r()), tau: o.smoke.tau ?? 2, albedo: o.smoke.albedo, drag: o.mushroom ? 1.5 : 1.2, buoy: o.mushroom ? 0.2 : o.smoke.buoyAcc ?? 1.5, seed: r() });
        }
      }
    }
    if (fb && (fb.soot ?? 0.5) >= 0.8 && t > fb.t && t < fb.t * 3.2 && w.layers.flame && this.fbR) {
      const R = this.fbR, rate = 70 / fb.t * (1 - (t - fb.t) / (fb.t * 2.2)) * w.budgetScale.flame;
      this.abAcc = (this.abAcc || 0) + dt * Math.max(0, rate);
      while (this.abAcc >= 1) {
        this.abAcc -= 1;
        const u = r() * 2 - 1, a = r() * 6.283, sn = Math.sqrt(1 - u * u), rr = R * Math.cbrt(r()) * 0.7;
        w.bb.spawnFirePuff({
          x: this.pos.x + Math.cos(a) * sn * rr,
          y: this.fbY + u * rr * 0.8,
          z: this.pos.z + Math.sin(a) * sn * rr,
          vx: 0,
          vy: R / fb.t * 0.15,
          vz: 0,
          life: fb.t * (0.5 + 0.7 * r()),
          s0: R * 0.25,
          s1: R * 0.45,
          T: 1250 + 250 * r(),
          lum: 0.7,
          soot: 0.8,
          drag: 0.6,
          seed: r()
        });
      }
    }
    if (o.mushroom && fb && o.W > 0) {
      const E = 4184e3 * o.W, B = 9.81 * 0.35 * E / (1.2 * 1005 * 290), tt = Math.max(t - fb.t * 0.5, 0.05);
      const zr = 1.8 * Math.pow(B * tt * tt, 0.25), y0 = this.pos.y;
      const zc = Math.max(this.fbY ?? y0, y0 + zr), wv = 0.5 * zr / tt;
      this.mf = { x: this.pos.x, z: this.pos.z, y0, zc, a: Math.max(fb.D * 0.45, 0.34 * (zc - y0)), w: Math.min(wv, 25), k: Math.exp(-t / 50) };
      if (o.ring && t > 5 && t < 26) {
        const m = this.mf, fade = Math.min(1, (t - 5) / 3) * Math.min(1, (26 - t) / 6);
        this.ringAcc = (this.ringAcc || 0) + dt * 70 * fade * Math.min(1.5, w.tier.smokeMul ?? 1) * w.budgetScale.smoke;
        while (this.ringAcc >= 1) {
          this.ringAcc -= 1;
          const a = r() * 6.283, rr = m.a * (0.6 + 0.3 * r()), yy = m.zc - m.a * (0.95 + 0.12 * r());
          w.bb.spawnSmoke({
            x: m.x + Math.cos(a) * rr,
            y: yy,
            z: m.z + Math.sin(a) * rr,
            vx: Math.cos(a) * 0.4,
            vy: m.w * 0.55,
            vz: Math.sin(a) * 0.4,
            life: 2.2 + 1.5 * r(),
            s0: 0.12 * m.a,
            s1: 0.24 * m.a,
            tau: 0.3 + 0.25 * r(),
            albedo: [0.92, 0.92, 0.94],
            drag: 6,
            seed: r()
          });
        }
      }
      if (o.dust && t > fb.t * 1.5 && t < 30) {
        const m = this.mf;
        this.stemAcc = (this.stemAcc || 0) + dt * 32 * Math.min(1.5, w.tier.smokeMul ?? 1) * w.budgetScale.smoke * Math.exp(-t / 12);
        while (this.stemAcc >= 1) {
          this.stemAcc -= 1;
          const a = r() * 6.283, rr = m.a * (0.15 + 1.2 * Math.sqrt(r()));
          w.bb.spawnSmoke({
            x: m.x + Math.cos(a) * rr,
            y: 0.3 + r() * 1.5,
            z: m.z + Math.sin(a) * rr,
            vx: -Math.cos(a) * 2,
            vy: 1 + 2 * r(),
            vz: -Math.sin(a) * 2,
            life: 18 + 12 * r(),
            s0: 0.06 * m.a + 1,
            s1: 0.35 * m.a + 3,
            tau: 1.1 + 0.8 * r(),
            albedo: (o.dustAlbedo || [0.32, 0.27, 0.2]).map((c2) => c2 * (0.6 + 0.25 * r())),
            drag: 1,
            seed: r()
          });
        }
      }
    }
    if (this.table) {
      const s = shockRadiusAt(this.table, t);
      this.shockR = s.R;
      this.shockPs = s.Ps;
      if (o.W >= 50 && fb) {
        const hum = o.humidity ?? 0.6, wf = o.wilson ?? 1, on = s.Ps < (wf > 1 ? 8e4 : 7e4) && s.Ps > (wf > 1 ? 18e3 : 25e3) && s.R > fb.D * 0.6;
        if (on && !this.wc && !this.wcDone) {
          this.wc = makeWilsonDome();
          w.scene.add(this.wc.mesh);
          this.wcT = 0;
        }
        if (this.wc) {
          this.wcT += dt;
          const fade = on ? Math.min(1, this.wcT / 0.05) : Math.max(0, (this.wcA ?? 1) - dt / (wf > 1 ? 0.55 : 0.3));
          this.wcA = fade;
          const m = this.wc.mesh;
          m.position.copy(this.pos);
          m.position.y = 0;
          m.scale.setScalar(s.R * 0.95);
          const outside = Math.min(1, Math.max(0, (camera.position.distanceTo(this.pos) - s.R) / (0.15 * s.R)));
          const u = this.wc.u;
          u.uA.value = fade * hum * Math.min(0.8, 0.3 * wf) * outside;
          u.uTime.value = t;
          u.uCov.value = wf > 1 ? 0.22 : 0.35;
          u.uAmb.value.copy(w.bb.mat.uniforms.uAmb.value);
          u.uSun.value.copy(w.bb.mat.uniforms.uSunCol.value);
          if (fade <= 0 && !on) {
            w.scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
            this.wc = null;
            this.wcDone = true;
          }
        }
      }
      if (o.dust && s.Ps > 2500 && t < 4) {
        this.dustAcc += dt * 600 * w.budgetScale.smoke * Math.min(1, s.Ps / 3e4);
        while (this.dustAcc >= 1) {
          this.dustAcc -= 1;
          const a = r() * 6.283;
          w.bb.spawnSmoke({ x: this.pos.x + Math.cos(a) * s.R, y: 0.2 + r() * 0.5, z: this.pos.z + Math.sin(a) * s.R, vx: Math.cos(a) * 6, vy: 1 + r() * 2, vz: Math.sin(a) * 6, life: 4 + 6 * r(), s0: 0.5 + Math.cbrt(o.W) * 0.15, s1: 2 + Math.cbrt(o.W) * 0.6, tau: 0.8, albedo: o.dustAlbedo || [0.32, 0.27, 0.2], drag: 0.8, seed: r() });
        }
      }
      const dc = camera.position.distanceTo(this.pos);
      if (!this.camHit && s.R >= dc) {
        this.camHit = true;
        w.shake = Math.min(1.2, Math.max(w.shake, (s.Ps / 2e4) ** 0.5));
        this.camPs = s.Ps;
      }
    }
    if (o.after && !this.afterDone && t > (o.afterT ?? 0.2)) {
      this.afterDone = true;
      o.after(w, this);
    }
    if (t > (o.life || 30)) this.dead = true;
  }
};

// src/audio/fireAudio.js
var C_SOUND = 343;
function noiseBuffer(ctx, seconds, seed = 1, color = "brown") {
  const n = Math.round(seconds * ctx.sampleRate), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = mulberry32(seed);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (color === "brown") {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
  }
  const f = Math.min(n >> 2, Math.round(0.02 * ctx.sampleRate));
  for (let i = 0; i < f; i++) {
    const k = i / f;
    d[i] = d[i] * k + d[n - f + i] * (1 - k);
  }
  return b;
}
function crackleBuffer(ctx, seconds, seed = 2, rate = 6) {
  const sr = ctx.sampleRate, n = Math.round(seconds * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), r = mulberry32(seed);
  let t = 0;
  while (true) {
    t += -Math.log(Math.max(r(), 1e-6)) / rate;
    const i0 = Math.round(t * sr);
    if (i0 >= n) break;
    const len = Math.round(sr * (2e-3 + 0.013 * r() * r())), amp = Math.min(1, 0.15 * Math.exp(0.9 * (r() + r() - 1)));
    let prev = 0;
    for (let k = 0; k < len && i0 + k < n; k++) {
      const w = r() * 2 - 1, hp = w - prev;
      prev = w;
      d[i0 + k] += hp * amp * Math.exp(-k / (len * 0.25));
    }
    if (r() < 0.25) {
      const j = i0 + Math.round(sr * (4e-3 + 0.02 * r()));
      for (let k = 0; k < 60 && j + k < n; k++) d[j + k] += (r() * 2 - 1) * amp * 0.5 * Math.exp(-k / 12);
    }
  }
  return b;
}
function fireVoice(ctx, dest, { seed = 1, crackle = 1 } = {}) {
  const panner = ctx.createPanner();
  panner.panningModel = "equalpower";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.rolloffFactor = 1;
  panner.maxDistance = 1e4;
  panner.connect(dest);
  const roar = ctx.createBufferSource();
  roar.buffer = noiseBuffer(ctx, 4, seed, "brown");
  roar.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.7;
  lp.frequency.value = 800;
  const air = ctx.createBiquadFilter();
  air.type = "lowpass";
  air.frequency.value = 18e3;
  air.Q.value = 0.5;
  const g2 = ctx.createGain();
  g2.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1.5;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0;
  lfo.connect(lfoG);
  lfoG.connect(g2.gain);
  roar.connect(lp);
  lp.connect(g2);
  g2.connect(air);
  air.connect(panner);
  const cr = ctx.createBufferSource();
  cr.buffer = crackleBuffer(ctx, 6, seed + 7, 7);
  cr.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "highpass";
  bp.frequency.value = 1200;
  const cg = ctx.createGain();
  cg.gain.value = 0;
  cr.connect(bp);
  bp.connect(cg);
  cg.connect(air);
  roar.start();
  cr.start();
  lfo.start();
  return {
    panner,
    nodes: [roar, lp, g2, lfo, lfoG, cr, bp, cg, air, panner],
    /** Q [W], fp [Hz] pulzace, flare 0..1, crackle 0..1, dist [m] (pro útlum výšek), at = AudioContext čas. */
    set({ Q, fp, flare = 0, crackleK = crackle, dist = 10, x = 0, y = 0, z = 0 }, at) {
      const Lw = 60 + 10 * Math.log10(Math.max(Q, 1) / 1e4);
      const amp = Math.pow(10, (Lw - 11 - 80) / 20) * (1 + 0.6 * flare);
      const T = 0.15;
      g2.gain.setTargetAtTime(amp, at, T);
      lfoG.gain.setTargetAtTime(amp * 0.25, at, T);
      lfo.frequency.setTargetAtTime(Math.min(8, Math.max(0.3, fp)), at, 0.5);
      lp.frequency.setTargetAtTime(Math.min(2e3, Math.max(150, 1800 * Math.pow(Math.max(Q, 1) / 1e4, -0.15))), at, 0.5);
      cg.gain.setTargetAtTime(amp * 2.2 * crackleK * Math.pow(Math.max(Q, 1) / 2e5, -0.1), at, T);
      air.frequency.setTargetAtTime(Math.max(2500, 18e3 / (1 + dist / 120)), at, 0.3);
      if (panner.positionX) {
        panner.positionX.setValueAtTime(x, at);
        panner.positionY.setValueAtTime(y, at);
        panner.positionZ.setValueAtTime(z, at);
      } else panner.setPosition(x, y, z);
    },
    stop(at) {
      g2.gain.setTargetAtTime(0, at, 0.3);
      cg.gain.setTargetAtTime(0, at, 0.3);
      for (const n of [roar, cr, lfo]) {
        try {
          n.stop(at + 2);
        } catch (e) {
        }
      }
    }
  };
}
function boom(ctx, dest, { when, W, dist, seed = 3 }) {
  const Ps = W > 0 ? blastSummary(W, [Math.max(dist, 1)])[0].Ps : 200;
  const spl = 20 * Math.log10(Math.max(Ps, 1e-3) / 2e-5);
  const amp = Math.min(1, Math.max(0.02, Math.pow(10, (spl - 150) / 40)));
  const k = Math.cbrt(Math.max(W, 0.01)), dur = 0.15 + 0.35 * k;
  const len = Math.min(12, dur * 3 + 0.3), src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, len, seed, "pink");
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.max(250, Math.min(9e3, 9e3 / (1 + dist / 150) / (0.6 + 0.4 * k)));
  const g2 = ctx.createGain();
  g2.gain.value = 0;
  g2.gain.setValueAtTime(0, when);
  g2.gain.linearRampToValueAtTime(amp, when + 4e-3);
  g2.gain.setTargetAtTime(amp * 0.35, when + 4e-3, 0.05 * (0.5 + k * 0.2));
  g2.gain.setTargetAtTime(0, when + 0.08, dur / 3);
  src.connect(lp);
  lp.connect(g2);
  g2.connect(dest);
  src.start(when);
  src.stop(when + len);
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(60 / (0.7 + 0.3 * k), when);
  o.frequency.exponentialRampToValueAtTime(22, when + 0.25 + 0.2 * k);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0, when);
  og.gain.linearRampToValueAtTime(amp * 0.9, when + 0.01);
  og.gain.setTargetAtTime(0, when + 0.02, 0.12 + 0.1 * k);
  o.connect(og);
  og.connect(dest);
  o.start(when);
  o.stop(when + 1 + k);
  return spl;
}
function pop(ctx, dest, { when, dist, seed = 5 }) {
  const src = ctx.createBufferSource();
  src.buffer = crackleBuffer(ctx, 0.08, seed, 60);
  const g2 = ctx.createGain();
  g2.gain.value = Math.min(1, 1.2 / Math.max(dist, 1));
  src.connect(g2);
  g2.connect(dest);
  src.start(when);
}
var FireAudio = class {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.voices = /* @__PURE__ */ new Map();
    this.heard = /* @__PURE__ */ new WeakSet();
    this.maxVoices = 12;
    this.seed = 1;
  }
  enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 6;
      this.comp.attack.value = 3e-3;
      this.comp.release.value = 0.25;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.lim = this.ctx.createDynamicsCompressor();
      this.lim.threshold.value = -2;
      this.lim.knee.value = 0;
      this.lim.ratio.value = 20;
      this.lim.attack.value = 1e-3;
      this.lim.release.value = 0.1;
      this.master.connect(this.comp);
      this.comp.connect(this.lim);
      this.lim.connect(this.ctx.destination);
    }
    this.ctx.resume();
    this.on = true;
    return true;
  }
  disable() {
    this.on = false;
    if (this.ctx) this.ctx.suspend();
  }
  clear() {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    for (const v of this.voices.values()) v.stop(at);
    this.voices.clear();
  }
  /** Každý snímek: posluchač = kamera, hlasy nejbližších ohňů, nové výbuchy a lupnutí (fx.audioEvents). */
  update(fx, camera) {
    if (!this.on || !this.ctx) {
      if (fx.audioEvents) fx.audioEvents.length = 0;
      return;
    }
    const ctx = this.ctx, at = ctx.currentTime, L = ctx.listener, cp = camera.position;
    const f = camera.getWorldDirection(this._f || (this._f = cp.clone())), u = camera.up;
    if (L.positionX) {
      L.positionX.value = cp.x;
      L.positionY.value = cp.y;
      L.positionZ.value = cp.z;
      L.forwardX.value = f.x;
      L.forwardY.value = f.y;
      L.forwardZ.value = f.z;
      L.upX.value = u.x;
      L.upY.value = u.y;
      L.upZ.value = u.z;
    } else {
      L.setPosition(cp.x, cp.y, cp.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
    const act = fx.sources.filter((s) => s.enabled && s.active && s.ph && s.ph.Q > 500);
    act.forEach((s) => {
      s._aimp = s.ph.Q / (s.pos.distanceToSquared(cp) + 1);
    });
    const keep = new Set(act.sort((a, b) => b._aimp - a._aimp).slice(0, this.maxVoices));
    for (const [s, v] of this.voices) if (!keep.has(s)) {
      v.stop(at);
      this.voices.delete(s);
    }
    for (const s of keep) {
      let v = this.voices.get(s);
      const wood = (s.fuel.embers ?? 0) > 0.3 ? 1 : (s.fuel.sparks ?? 0) > 0.2 ? 0.5 : 0.15;
      if (!v) {
        v = fireVoice(ctx, this.master, { seed: (s.o.seed ?? 1) + 11, crackle: wood });
        this.voices.set(s, v);
      }
      v.set({ Q: s.ph.Q, fp: s.ph.fp, flare: s.flare || 0, crackleK: wood, dist: s.pos.distanceTo(cp), x: s.pos.x, y: s.pos.y + s.ph.L * 0.4, z: s.pos.z }, at);
    }
    for (const e of fx.explosions) {
      if (this.heard.has(e)) continue;
      this.heard.add(e);
      const dist = e.pos.distanceTo(cp), delay = dist / C_SOUND - e.t;
      if (delay < -0.5) continue;
      boom(ctx, this.master, { when: at + Math.max(0.01, delay), W: e.o.W || 0.05, dist, seed: (e.o.seed ?? 3) + this.seed++ });
    }
    for (const ev of fx.audioEvents || []) if (ev.type === "pop") pop(ctx, this.master, { when: at + ev.pos.distanceTo(cp) / C_SOUND, dist: ev.pos.distanceTo(cp), seed: this.seed++ });
    for (const ev of fx.audioEvents || []) if (ev.type === "shot") boom(ctx, this.master, { when: at + ev.pos.distanceTo(cp) / C_SOUND, W: Math.max(ev.W, 1e-5), dist: ev.pos.distanceTo(cp), seed: this.seed++ });
    if (fx.audioEvents) fx.audioEvents.length = 0;
  }
};

// src/fx/char.js
import * as THREE14 from "three";
function applyChar(mat, { instanced = false, scale = 2, bias = "y", alligator = null, coal = false, hole = false, metal = false } = {}) {
  const sh = sharedUniforms();
  mat.userData.char = {
    uChar: { value: 0 },
    uGlow: { value: 0 },
    uCharScale: { value: scale },
    uCharBase: { value: 0 },
    uCharH: { value: 1 },
    uHole: { value: new THREE14.Vector4(0, 0, 0, 0) },
    uTmax: { value: 0 },
    uTnow: { value: 293 },
    uSoot: { value: -1 },
    uRust: { value: 0 },
    uHeatFall: { value: 0.55 },
    uHeatSrc: { value: new THREE14.Vector3() },
    uObjC: { value: new THREE14.Vector3() },
    uHeatSide: { value: 0 }
  };
  const U = mat.userData.char;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, sh, U);
    s.vertexShader = s.vertexShader.replace("#include <common>", `#include <common>
out vec3 vCharP; out vec2 vCharA; out vec2 vCharUv;
${instanced ? "in vec2 aChar;" : ""}`).replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
  {
    vec4 cp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      cp = instanceMatrix * cp;
    #endif
    vCharP = (modelMatrix * cp).xyz;
    vCharA = ${instanced ? "aChar" : "vec2(-1.0)"};
    vCharUv = uv;
  }`);
    s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>
in vec3 vCharP; in vec2 vCharA; in vec2 vCharUv;
uniform float uChar, uGlow, uCharScale, uCharBase, uCharH;
uniform vec4 uHole;
uniform float uTmax, uTnow, uSoot, uRust, uHeatFall, uHeatSide;
uniform vec3 uHeatSrc, uObjC;
${GLSL_COMMON}
${metal ? "#define METAL 1" : ""}
${alligator ? `#define ALLIG vec2(${alligator[0].toFixed(2)}, ${alligator[1].toFixed(2)})` : ""}
${coal ? "#define COAL 1" : ""}
${hole ? "#define HOLE 1" : ""}`).replace("#include <map_fragment>", `#include <map_fragment>
  float chv = vCharA.x >= 0.0 ? vCharA.x : uChar;
  float glv = vCharA.x >= 0.0 ? vCharA.y : uGlow;
  float hgt = clamp((vCharP.y - uCharBase) / max(abs(uCharH), 0.01), 0.0, 1.0);
  if (uCharH < 0.0) hgt = 1.0 - hgt; // ho\u0159en\xED shora (lou\u010D)
  float cn = fbm3(vCharP * uCharScale * 0.11);
  float front = chv * 1.35 - 0.2;
  float charM = smoothstep(front + 0.12, front - 0.12, cn * 0.7 + hgt * 0.45);
  float crackN = n3(vCharP * uCharScale * 0.37 + 0.5);
  float crack = smoothstep(0.08, 0.0, abs(crackN - 0.5)) * charM;
#ifdef ALLIG
  {
    // bloky: \u0159ady pod\xE9l vl\xE1ken (v), v ka\u017Ed\xE9 \u0159ad\u011B n\xE1hodn\xFD posun; hrany zvln\u011Bn\xE9 \u0161umem
    vec2 g = vCharUv * ALLIG;
    float row = floor(g.x);
    g.y += fract(sin(row * 12.9898) * 43758.5453) * 0.9;
    vec2 wq = vec2(n3(vCharP * uCharScale * 0.9), n3(vCharP * uCharScale * 0.9 + 0.31)) - 0.5;
    g += wq * 0.6;
    g.x += 0.25 * sin(g.y * 1.7 + row);
    vec2 e = min(fract(g), 1.0 - fract(g));
    float aw = 0.07 + 0.05 * chv;                                   // trhliny se s ho\u0159en\xEDm rozev\xEDraj\xED
    float al = 1.0 - smoothstep(0.0, aw, min(e.x * 0.8, e.y));
    // \u017Ehnou jen trhliny v hork\xFDch ostr\u016Fvc\xEDch (proud\u011Bn\xED, p\u0159ivr\xE1cen\xE1 strana); jinde tmav\xE9 r\xFDhy
    float hotP = smoothstep(0.45, 0.72, n3(vCharP * uCharScale * 0.21 + 3.7));
    crack = max(crack * 0.5, al * smoothstep(0.2, 0.6, charM) * hotP);
    diffuseColor.rgb *= 1.0 - 0.6 * al * charM; // tmav\xE9 r\xFDhy i bez \u017Ehnut\xED
  }
#endif
  float metalGlowT = 0.0;
#ifdef METAL
  float charRough;
  {
    float tMax = uTmax > 1.0 ? uTmax : 293.0 + 720.0 * chv;
    float tNow = uTmax > 1.0 ? uTnow : 293.0 + 640.0 * glv * chv;
    float soot = uSoot >= 0.0 ? uSoot : chv * 0.85;
    float mn = fbm3(vCharP * uCharScale * 0.5 + 7.0);
    float mn2 = n3(vCharP * uCharScale * 0.9 + 1.7);                          // velk\xE9 skvrny (fotky vrak\u016F: plochy v decimetrech)
    float fall = clamp(1.0 - uHeatFall * hgt + (mn - 0.5) * 0.4, 0.0, 1.0);   // teplota kles\xE1 od hork\xE9ho konce, hranice zvln\u011Bn\xE1 \u0161umem
    // strana p\u0159ivr\xE1cen\xE1 k ohni je hork\xE1 a \u010Dist\xE1, odvr\xE1cen\xE1 chladn\u011Bj\u0161\xED a jen lehce o\u010Douzen\xE1 (s\xE1l\xE1n\xED nevid\xED \u201Eza roh\u201C)
    if (uHeatSide > 0.0) {
      float facing = clamp(0.5 + 0.5 * dot(normalize(vCharP - uObjC), normalize(uHeatSrc - uObjC)), 0.0, 1.0);
      fall *= mix(1.0, 0.25 + 0.75 * facing * facing, uHeatSide);
      soot *= mix(1.0, 0.2 + 0.8 * smoothstep(0.15, 0.75, facing), uHeatSide);
    }
    float Tl = 293.0 + (tMax - 293.0) * fall;
    float blister = smoothstep(470.0, 620.0, Tl);
    float off = smoothstep(600.0, 700.0, Tl);
    float scl = smoothstep(780.0, 950.0, Tl);
    float bub = smoothstep(0.55, 0.78, n3(vCharP * uCharScale * 6.0));
    vec3 paint = diffuseColor.rgb;
    paint = mix(paint, paint * 0.35 + vec3(0.07, 0.045, 0.03), blister);                       // lak hn\u011Bdne
    paint = mix(paint, vec3(0.4, 0.34, 0.28), blister * bub * 0.55);                          // puch\xFD\u0159e
    vec3 bare = mix(vec3(0.27, 0.23, 0.14), vec3(0.6, 0.56, 0.42), smoothstep(0.4, 0.75, mn));       // barvy zm\u011B\u0159en\xE9 na fotk\xE1ch vyho\u0159el\xFDch aut (paleta p21\u2013p23)  // hol\xE1 ocel \u2194 b\u011Blo\u0161ed\xFD pop\xEDlek laku
    bare = mix(bare, vec3(0.12, 0.13, 0.16), scl * smoothstep(0.3, 0.6, mn2));                // okuje (modro\u0161ed\xE9)
    vec3 rust = mix(vec3(0.5, 0.32, 0.17), vec3(0.24, 0.11, 0.04), smoothstep(0.2, 0.8, mn2));                      // rez: barvy z fotek vyho\u0159el\xFDch aut
    bare = mix(bare, rust, max(uRust, 0.3 + 0.25 * scl) * smoothstep(0.38, 0.62, mn * 0.5 + mn2 * 0.6 + 0.2 * (1.0 - hgt) - 0.1));   // i \u010Derstv\u011B vy\u017E\xEDhan\xFD plech je hn\u011Bd\u011B skvrnit\xFD (oxidy); dole a u ohniska v\xEDc
    diffuseColor.rgb = mix(paint, bare, off);
    float streak = fbm3(vec3(vCharP.x * uCharScale * 1.2, vCharP.y * uCharScale * 0.15, vCharP.z * uCharScale * 1.2));
    float sootM = clamp(soot * (1.0 - off) * smoothstep(0.2, 0.7, streak + 0.5 * blister + 0.35 * (1.0 - hgt)) * 1.4, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.017, 0.016), sootM * 0.94);
    charRough = max(max(blister * 0.6, off * 0.75), sootM);
    metalGlowT = 293.0 + (tNow - 293.0) * fall * (0.85 + 0.3 * mn2);
    charM = 0.0; crack = 0.0;
  }
#else
  vec3 charCol = mix(vec3(0.025, 0.022, 0.02), vec3(0.11, 0.1, 0.095), smoothstep(0.75, 1.0, chv) * cn); // popel \u0161edne
  diffuseColor.rgb = mix(diffuseColor.rgb, charCol, charM);
  float charRough = charM;
#endif
  float holeRim = 0.0;
#ifdef HOLE
  if (uHole.z > 0.0 && vCharP.y > uHole.w) { // jen nad v\xFD\u0161kou w (strop a st\u0159echa, ne okna a podlaha)
    float hd = length(vCharP.xz - uHole.xy) + (fbm3(vCharP * 0.9) - 0.5) * 1.6;
    if (hd < uHole.z) discard;
    holeRim = smoothstep(uHole.z + 0.9, uHole.z, hd);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), holeRim);
  }
#endif`).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.97, charRough);`).replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  {
    // d\xFDch\xE1n\xED: pomal\xE9 vlny proud\u011Bn\xED p\u0159es \u017Ehav\xE9 plochy (0,1\u20130,5 Hz), amplituda \xB135 % \u26052 vzhled
    float breath = 0.65 + 0.7 * n3(vCharP * 0.9 + vec3(0.0, uGTime * 0.12, uGTime * 0.05));
    float Tk = 880.0 + 300.0 * crackN * glv * breath;
    float hotZone = smoothstep(front - 0.05, front - 0.35, cn * 0.7 + hgt * 0.45);
#ifdef COAL
    // uhl\xED: \u017Ehne cel\xFD povrch, \u0161ed\xFD popel v ostr\u016Fvc\xEDch; dutiny (n2) tmav\u0161\xED
    float ashM = smoothstep(0.52, 0.7, cn + 0.15 * (crackN - 0.5));
    Tk = 820.0 + 330.0 * (1.0 - ashM) * glv * breath * (0.75 + 0.5 * crackN);
    diffuseColor.rgb = mix(vec3(0.03, 0.028, 0.026), vec3(0.42, 0.4, 0.37), ashM);
    totalEmissiveRadiance += bbColor(Tk) * (1.0 - ashM * 0.85) * glv * uFlameK * 0.3;
#else
    totalEmissiveRadiance += bbColor(Tk) * (crack * 1.4 + hotZone * 0.25 * charM) * glv * breath * uFlameK * 0.35;
#endif
#ifdef HOLE
    totalEmissiveRadiance += bbColor(950.0 + 250.0 * crackN * breath) * holeRim * holeRim * uFlameK * 0.3;
#endif
#ifdef METAL
    totalEmissiveRadiance += bbColor(clamp(metalGlowT, 700.0, 1400.0)) * smoothstep(790.0, 900.0, metalGlowT) * uFlameK * 0.22; // \u017Ehnouc\xED plech
#endif
  }`);
  };
  mat.customProgramCacheKey = () => "char" + (instanced ? "I" : "") + (alligator ? "A" + alligator.join("x") : "") + (coal ? "C" : "") + (hole ? "H" : "") + (metal ? "M" : "");
  return U;
}

// src/engine/tiers.js
var TIERS = [
  {
    id: 0,
    name: "T0 \xB7 ThinkPad T460",
    hw: "Intel HD 520 (2016), 1366\xD7768\u20131080p",
    renderScale: 0.67,
    maxPixelRatio: 1,
    msaa: 0,
    particles: { flame: 900, smoke: 700, spark: 400, haze: 0 },
    smokeMul: 1,
    emberMul: 0.5,
    sortSmoke: false,
    softParticles: false,
    volumes: 0,
    volumeSteps: 0,
    volumeScale: 0.5,
    bloom: 0,
    haze: false,
    shadows: false,
    lights: 2,
    debris: 60,
    lod: 1,
    treeMax: 400,
    flipbookRes: 128,
    flameLight: "cheap",
    grain: false,
    frameBudgetMs: 33
  },
  {
    id: 1,
    name: "T1 \xB7 star\u0161\xED hern\xED / nov\xE9 iGPU",
    hw: "GTX 1050 / Iris Xe / Radeon 680M",
    renderScale: 0.85,
    maxPixelRatio: 1,
    msaa: 0,
    particles: { flame: 2200, smoke: 1800, spark: 1200, haze: 0 },
    smokeMul: 1.5,
    emberMul: 1,
    sortSmoke: true,
    softParticles: false,
    volumes: 2,
    volumeSteps: 32,
    volumeScale: 0.5,
    volumeDetail: 0,
    flameEdge: 0.2,
    flameEdgeM: 0.08,
    bloom: 3,
    haze: false,
    shadows: false,
    lights: 4,
    debris: 150,
    lod: 2,
    treeMax: 1200,
    flipbookRes: 128,
    flameLight: "normal",
    grain: false,
    frameBudgetMs: 22
  },
  {
    id: 2,
    name: "T2 \xB7 st\u0159edn\xED hern\xED",
    hw: "GTX 1660 / RTX 3050 / RX 6600",
    renderScale: 1,
    maxPixelRatio: 1.25,
    msaa: 0,
    particles: { flame: 5e3, smoke: 5e3, spark: 3e3, haze: 600 },
    smokeMul: 2.5,
    emberMul: 1.5,
    sortSmoke: true,
    softParticles: true,
    volumes: 6,
    volumeSteps: 64,
    volumeScale: 0.75,
    volumeDetail: 1,
    flameEdge: 0.14,
    flameEdgeM: 0.05,
    volumeTAA: true,
    bloom: 5,
    haze: true,
    shadows: false,
    lights: 6,
    debris: 400,
    lod: 2,
    treeMax: 3e3,
    flipbookRes: 160,
    flameLight: "normal",
    grain: true,
    frameBudgetMs: 16.7
  },
  {
    id: 3,
    name: "T3 \xB7 hern\xED PC \u010CR 2026 (~35 tis. K\u010D)",
    hw: "RTX 4060 / RX 7600, 8 GB VRAM, 1080p\u20131440p",
    renderScale: 1,
    maxPixelRatio: 2,
    msaa: 0,
    particles: { flame: 14e3, smoke: 14e3, spark: 9e3, haze: 1500 },
    smokeMul: 4,
    emberMul: 2.5,
    sortSmoke: true,
    softParticles: true,
    volumes: 16,
    volumeSteps: 112,
    volumeScale: 1,
    volumeDetail: 2,
    flameEdge: 0.1,
    flameEdgeM: 0.035,
    volumeTAA: true,
    bloom: 6,
    haze: true,
    shadows: true,
    lights: 8,
    debris: 1200,
    lod: 3,
    treeMax: 8e3,
    flipbookRes: 192,
    flameLight: "shadow",
    grain: true,
    frameBudgetMs: 16.7
  },
  {
    id: 4,
    name: "T4 \xB7 Ultra (siln\xE9 hern\xED GPU)",
    hw: "RTX 4070 Super \u2013 4080 / RX 7900, 12\u201316 GB, 1440p",
    renderScale: 1,
    maxPixelRatio: 2,
    msaa: 0,
    particles: { flame: 22e3, smoke: 26e3, spark: 16e3, haze: 2500 },
    smokeMul: 6,
    emberMul: 3.5,
    sortSmoke: true,
    softParticles: true,
    volumes: 24,
    volumeSteps: 160,
    volumeScale: 1,
    volumeDetail: 2,
    flameEdge: 0.08,
    flameEdgeM: 0.03,
    volumeTAA: true,
    smokeVolumes: 4,
    smokeSteps: 48,
    bloom: 6,
    haze: true,
    shadows: true,
    lights: 10,
    debris: 2e3,
    lod: 3,
    treeMax: 12e3,
    flipbookRes: 256,
    flameLight: "shadow",
    grain: true,
    frameBudgetMs: 16.7
  },
  {
    id: 5,
    name: "T5 \xB7 Kino (RTX 4090/5090, sn\xEDmky a videa)",
    hw: "RTX 4090 / 5090, 24\u201332 GB, 4K",
    renderScale: 1,
    maxPixelRatio: 2,
    msaa: 0,
    particles: { flame: 32e3, smoke: 4e4, spark: 24e3, haze: 4e3 },
    smokeMul: 8,
    emberMul: 5,
    sortSmoke: true,
    softParticles: true,
    volumes: 32,
    volumeSteps: 192,
    volumeScale: 1,
    volumeDetail: 2,
    flameEdge: 0.07,
    flameEdgeM: 0.025,
    volumeTAA: true,
    smokeVolumes: 8,
    smokeSteps: 72,
    bloom: 6,
    haze: true,
    shadows: true,
    lights: 12,
    debris: 3e3,
    lod: 4,
    treeMax: 16e3,
    flipbookRes: 256,
    flameLight: "shadow",
    grain: true,
    frameBudgetMs: 33
  }
];
function guessTier(renderer) {
  const gl = renderer.getContext();
  let name = "";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch {
  }
  const s = String(name);
  let t = 2;
  if (/swiftshader|llvmpipe|software/i.test(s)) t = 0;
  else if (/Intel.*(HD|UHD) Graphics (4|5|6)\d\d/i.test(s) || /Intel.*HD Graphics$/i.test(s)) t = 0;
  else if (/Intel.*(Iris|UHD|Xe)|Radeon\(TM\) Graphics|Vega \d|Apple M1/i.test(s)) t = 1;
  else if (/GTX (7|9)\d\d|GTX 10[1-5]0|RX (4|5)[0-6]0|MX\d{3}/i.test(s)) t = 1;
  else if (/RTX (4090|5080|5090)/i.test(s)) t = 5;
  else if (/RTX (4070|4080|5070)|RX 79\d\d|RX 9070/i.test(s)) t = 4;
  else if (/RTX (40|50)\d\d|RTX 30[6-9]0|RX (7|9)\d{3}|RX 6[7-9]\d\d|Apple M[2-4]/i.test(s)) t = 3;
  return { tier: t, gpu: s };
}

// src/engine/env.js
import * as THREE16 from "three";

// src/assets/textures.js
import * as THREE15 from "three";
var cache = /* @__PURE__ */ new Map();
function makeNoise2(seed, P) {
  const r = mulberry32(seed), v = new Float32Array(P * P);
  for (let i = 0; i < v.length; i++) v[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const X0 = (xi % P + P) % P, Y0 = (yi % P + P) % P, X1 = (X0 + 1) % P, Y1 = (Y0 + 1) % P;
    const a = v[X0 + Y0 * P], b = v[X1 + Y0 * P], c2 = v[X0 + Y1 * P], d = v[X1 + Y1 * P];
    return a + (b - a) * u + (c2 - a) * w + (a - b - c2 + d) * u * w;
  };
}
function fbm2(seed, base = 4, oct = 5) {
  const ns = [];
  for (let o = 0; o < oct; o++) ns.push(makeNoise2(seed + o * 17, base << o));
  return (x, y) => {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < oct; o++) {
      s += ns[o](x * (base << o), y * (base << o)) * a;
      n += a;
      a *= 0.5;
    }
    return s / n;
  };
}
function canvasTex(size, fn, { srgb = true, repeat = true } = {}) {
  const c2 = document.createElement("canvas");
  c2.width = c2.height = size;
  const g2 = c2.getContext("2d"), img = g2.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, gg, b] = fn(x / size, y / size);
    const i = (x + y * size) * 4;
    d[i] = r * 255;
    d[i + 1] = gg * 255;
    d[i + 2] = b * 255;
    d[i + 3] = 255;
  }
  g2.putImageData(img, 0, 0);
  const t = new THREE15.CanvasTexture(c2);
  if (srgb) t.colorSpace = THREE15.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE15.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.canvas = c2;
  return t;
}
function heightToNormal(size, hfn, strength = 2) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[x + y * size] = hfn(x / size, y / size);
  return canvasTex(size, (u, v) => {
    const x = Math.round(u * size), y = Math.round(v * size);
    const at = (i, j) => H[(i + size) % size + (j + size) % size * size];
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [-dx / l * 0.5 + 0.5, -dy / l * 0.5 + 0.5, 1 / l * 0.5 + 0.5];
  }, { srgb: false });
}
var lerp = (a, b, t) => a + (b - a) * t;
var mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
var sat = (x) => Math.max(0, Math.min(1, x));
var TEX_SIZE = 256;
function texSet(name) {
  if (cache.has(name)) return cache.get(name);
  const S = TEX_SIZE;
  let out;
  switch (name) {
    case "bark": {
      const f = fbm2(11, 3, 5), g2 = fbm2(12, 2, 3);
      const h2 = (u, v) => {
        const s = Math.abs(Math.sin((u * 12 + g2(u, v) * 2.5) * Math.PI));
        return 0.6 * Math.pow(s, 0.35) + 0.4 * f(u * 2, v * 0.5);
      };
      out = { map: canvasTex(S, (u, v) => {
        const k = h2(u, v);
        return mix3([0.06, 0.045, 0.035], [0.32, 0.24, 0.17], k);
      }), normalMap: heightToNormal(S, h2, 5), roughness: 0.95 };
      break;
    }
    case "woodEnd": {
      const f = fbm2(13, 4, 4);
      out = { map: canvasTex(S, (u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5) * 2 + f(u, v) * 0.15;
        const ring = 0.5 + 0.5 * Math.sin(r * 60);
        return r > 0.93 ? [0.2, 0.14, 0.09] : mix3([0.55, 0.42, 0.28], [0.72, 0.58, 0.4], ring);
      }, { repeat: false }), roughness: 0.8 };
      break;
    }
    case "woodPlank": {
      const f = fbm2(14, 2, 5);
      out = { map: canvasTex(S, (u, v) => {
        const g2 = 0.5 + 0.5 * Math.sin((v * 40 + f(u * 0.3, v) * 6) * Math.PI);
        return mix3([0.36, 0.24, 0.14], [0.55, 0.4, 0.25], g2 * 0.6 + f(u, v) * 0.4);
      }), roughness: 0.75 };
      break;
    }
    case "wax":
      out = { map: canvasTex(64, () => [0.93, 0.9, 0.82]), roughness: 0.45 };
      break;
    case "rubber": {
      const f = fbm2(21, 8, 3);
      const h2 = (u, v) => {
        const lug = (Math.abs((u * 24 + Math.abs(v - 0.5) * 6) % 1 - 0.5) < 0.18 ? 1 : 0) * (Math.abs(v - 0.5) < 0.45 ? 1 : 0);
        return lug * 0.8 + f(u, v) * 0.2;
      };
      out = { map: canvasTex(S, (u, v) => {
        const k = 0.03 + f(u, v) * 0.025;
        return [k, k, k * 1.02];
      }), normalMap: heightToNormal(S, h2, 6), roughness: 0.92 };
      break;
    }
    case "metalRed":
    case "metalBlue":
    case "metalGreen":
    case "metalOlive":
    case "carPaint": {
      const base = { metalRed: [0.55, 0.06, 0.04], metalBlue: [0.06, 0.16, 0.42], metalGreen: [0.12, 0.3, 0.14], metalOlive: [0.24, 0.26, 0.14], carPaint: [0.5, 0.52, 0.55] }[name];
      const f = fbm2(31 + name.length, 3, 6), rust = fbm2(37, 2, 5);
      out = { map: canvasTex(S, (u, v) => {
        const r = sat((rust(u, v) - 0.58) * 6);
        const c2 = mix3(base, [0.28, 0.12, 0.05], r);
        return mix3(c2, [c2[0] * 0.7, c2[1] * 0.7, c2[2] * 0.7], f(u, v) * 0.5);
      }), roughness: 0.55, metalness: name === "carPaint" ? 0.3 : 0.6 };
      break;
    }
    case "steel": {
      const f = fbm2(41, 6, 4);
      out = { map: canvasTex(S, (u, v) => {
        const k = 0.45 + f(u, v) * 0.15;
        return [k, k, k * 1.03];
      }), roughness: 0.4, metalness: 0.9 };
      break;
    }
    case "straw": {
      const f = fbm2(51, 16, 3), g2 = fbm2(52, 3, 4);
      const h2 = (u, v) => {
        const fib = 0.5 + 0.5 * Math.sin((u * 140 + g2(u, v) * 9) * Math.PI);
        return fib * 0.6 + f(u, v) * 0.4;
      };
      out = { map: canvasTex(S, (u, v) => {
        const k = h2(u, v);
        return mix3([0.42, 0.33, 0.14], [0.86, 0.73, 0.38], k);
      }), normalMap: heightToNormal(S, h2, 3), roughness: 0.9 };
      break;
    }
    case "plaster": {
      const f = fbm2(61, 6, 5);
      out = { map: canvasTex(S, (u, v) => {
        const k = 0.68 + f(u, v) * 0.12;
        return [k, k * 0.97, k * 0.9];
      }), roughness: 0.95 };
      break;
    }
    case "brick": {
      const f = fbm2(62, 8, 4);
      const h2 = (u, v) => {
        const row = Math.floor(v * 16), off = row % 2 * 0.5;
        const bu = (u * 8 + off) % 1, bv = v * 16 % 1;
        return bu < 0.06 || bv < 0.1 ? 0 : 0.7 + f(u, v) * 0.3;
      };
      out = { map: canvasTex(S, (u, v) => {
        const k = h2(u, v);
        return k === 0 ? [0.55, 0.52, 0.48] : mix3([0.42, 0.14, 0.08], [0.6, 0.24, 0.14], f(u * 3, v * 3));
      }), normalMap: heightToNormal(S, h2, 4), roughness: 0.9 };
      break;
    }
    case "roof": {
      const f = fbm2(63, 4, 4);
      const h2 = (u, v) => {
        const bv = v * 20 % 1;
        return bv < 0.15 ? 0 : bv;
      };
      out = { map: canvasTex(S, (u, v) => {
        const k = h2(u, v);
        return mix3([0.18, 0.07, 0.05], [0.45, 0.16, 0.1], k * 0.6 + f(u, v) * 0.4);
      }), normalMap: heightToNormal(S, h2, 6), roughness: 0.85 };
      break;
    }
    case "needles": {
      const f = fbm2(71, 8, 4);
      out = { map: canvasTex(S, (u, v) => mix3([0.03, 0.08, 0.03], [0.1, 0.2, 0.07], f(u, v))), roughness: 0.9 };
      break;
    }
    case "leaves": {
      const f = fbm2(72, 8, 4);
      out = { map: canvasTex(S, (u, v) => mix3([0.2, 0.18, 0.06], [0.45, 0.38, 0.14], f(u, v))), roughness: 0.9 };
      break;
    }
    case "stone": {
      const f = fbm2(81, 4, 6);
      out = { map: canvasTex(S, (u, v) => {
        const k = f(u, v);
        return mix3([0.22, 0.21, 0.2], [0.5, 0.48, 0.45], k);
      }), normalMap: heightToNormal(S, f, 4), roughness: 0.85 };
      break;
    }
    case "tnt": {
      const f = fbm2(91, 4, 4);
      out = { map: canvasTex(S, (u, v) => {
        const band = Math.abs(v - 0.5) < 0.07 ? 1 : 0;
        const c2 = band ? [0.75, 0.6, 0.1] : [0.2, 0.22, 0.12];
        return mix3(c2, [c2[0] * 0.6, c2[1] * 0.6, c2[2] * 0.6], f(u, v) * 0.6);
      }), roughness: 0.6, metalness: 0.5 };
      break;
    }
    case "acetylene": {
      const f = fbm2(92, 4, 4);
      out = { map: canvasTex(S, (u, v) => {
        const c2 = v > 0.82 ? [0.6, 0.05, 0.04] : [0.62, 0.6, 0.55];
        return mix3(c2, [0.2, 0.18, 0.15], f(u, v) * 0.25);
      }), roughness: 0.5, metalness: 0.4 };
      break;
    }
    case "glass":
      out = { map: canvasTex(16, () => [0.05, 0.07, 0.08]), roughness: 0.05, metalness: 0.2 };
      break;
    case "asphaltCar": {
      const f = fbm2(93, 8, 4);
      out = { map: canvasTex(S, (u, v) => {
        const k = 0.06 + f(u, v) * 0.05;
        return [k, k, k];
      }), roughness: 0.9 };
      break;
    }
    default:
      out = { map: canvasTex(16, () => [0.5, 0.5, 0.5]), roughness: 0.8 };
  }
  cache.set(name, out);
  return out;
}
function groundTexture(kind) {
  const key = "ground:" + kind;
  if (cache.has(key)) return cache.get(key);
  const S = Math.max(256, TEX_SIZE), f = fbm2(101, 4, 6), g2 = fbm2(102, 16, 3);
  const pal = {
    dirt: [[0.2, 0.17, 0.13], [0.42, 0.36, 0.3]],
    grass: [[0.14, 0.19, 0.08], [0.34, 0.4, 0.2]],
    dryGrass: [[0.34, 0.29, 0.18], [0.64, 0.55, 0.36]],
    forest: [[0.16, 0.12, 0.09], [0.36, 0.28, 0.2]],
    asphalt: [[0.15, 0.15, 0.15], [0.3, 0.3, 0.3]],
    concrete: [[0.45, 0.44, 0.42], [0.66, 0.65, 0.62]]
  }[kind] || [[0.1, 0.1, 0.1], [0.3, 0.3, 0.3]];
  const t = canvasTex(S, (u, v) => mix3(pal[0], pal[1], sat(f(u, v) * 0.75 + g2(u, v) * 0.35)));
  cache.set(key, t);
  return t;
}
function makeMaterial(name, extra = {}) {
  const s = texSet(name);
  return new THREE15.MeshStandardMaterial({
    map: s.map,
    normalMap: s.normalMap || null,
    roughness: s.roughness ?? 0.8,
    metalness: s.metalness ?? 0,
    ...extra
  });
}

// src/engine/env.js
var TIMES = {
  noc: { sky0: [0.6, 0.7, 1], sky1: [0.2, 0.25, 0.5], skyL: 4e-3, hemi: 0.01, moon: 0.12, sun: 0, fog: [0.5, 0.6, 1], fogL: 2e-3, stars: 1 },
  soumrak: { sky0: [1, 0.72, 0.62], sky1: [0.25, 0.38, 0.85], skyL: 6, hemi: 18, moon: 0, sun: 0, fog: [0.9, 0.75, 0.75], fogL: 3, stars: 0.25 },
  den: { sky0: [0.85, 0.92, 1], sky1: [0.3, 0.5, 1], skyL: 3500, hemi: 11e3, moon: 0, sun: 65e3, fog: [0.75, 0.82, 0.95], fogL: 2500, stars: 0 }
};
var SKY_FS = (
  /* glsl */
  `
varying vec3 vDir; uniform vec3 c0, c1, sunDir; uniform float stars;
float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float t = clamp(d.y, -0.1, 1.0);
  vec3 col = mix(c0, c1, pow(max(t, 0.0), 0.45));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += c0 * 2.5 * pow(s, 8.0) * step(0.0, d.y);
  if (stars > 0.0 && d.y > 0.0) {
    vec3 g = floor(d * 380.0);
    float r = h(g);
    col += c0 * 40.0 * step(0.9975, r) * stars * (0.5 + 0.5 * h(g + 3.1));
  }
  if (d.y < 0.0) col = mix(col, c0 * 0.6, clamp(-d.y * 8.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`
);
var Environment = class {
  constructor(scene) {
    this.scene = scene;
    this.skyMat = new THREE16.ShaderMaterial({
      vertexShader: "varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }",
      fragmentShader: SKY_FS,
      side: THREE16.BackSide,
      depthWrite: false,
      uniforms: { c0: { value: new THREE16.Color() }, c1: { value: new THREE16.Color() }, sunDir: { value: new THREE16.Vector3(0.55, 0.6, 0.7) }, stars: { value: 0 } }
    });
    this.sky = new THREE16.Mesh(new THREE16.SphereGeometry(1, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.onBeforeRender = (r, s, cam) => {
      this.sky.position.copy(cam.position);
      this.sky.scale.setScalar(cam.far * 0.9);
      this.sky.updateMatrixWorld();
    };
    scene.add(this.sky);
    this.hemi = new THREE16.HemisphereLight(10135752, 5917242, 0.1);
    scene.add(this.hemi);
    this.sun = new THREE16.DirectionalLight(16773341, 0.1);
    this.sun.position.set(55, 60, 70);
    scene.add(this.sun);
    this.moon = new THREE16.DirectionalLight(9414360, 0);
    this.moon.position.set(40, 60, 30);
    scene.add(this.moon);
    this.fog = new THREE16.FogExp2(0, 4e-3);
    scene.fog = this.fog;
    this.groundMat = new THREE16.MeshStandardMaterial({ map: groundTexture("dirt"), roughness: 0.95, metalness: 0 });
    this.ground = new THREE16.Mesh(new THREE16.PlaneGeometry(1, 1, 1, 1), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.name = "ground";
    scene.add(this.ground);
    this.setGround("dirt", 400);
    this.setTime("soumrak");
  }
  setGround(kind, size = 400, repeat = null) {
    const tex = groundTexture(kind);
    const rep = repeat || size / 4;
    tex.repeat.set(rep, rep);
    this.groundMat.map = tex;
    this.groundMat.needsUpdate = true;
    this.ground.scale.set(size, size, 1);
    this.groundKind = kind;
  }
  setTime(name) {
    const t = TIMES[name] || TIMES.soumrak;
    this.time = name;
    this.T = t;
    this.skyMat.uniforms.stars.value = t.stars;
    this.ambientE = t.hemi + t.sun * Math.max(0, this.sun.position.clone().normalize().y) + t.moon * 0.7;
    this.skyL = t.skyL;
    this.update(1);
  }
  /** Před-expozice: intenzity × pre (viz shared.PRE) */
  update(pre) {
    const t = this.T;
    if (!t) return;
    const u = this.skyMat.uniforms;
    u.c0.value.setRGB(...t.sky0).multiplyScalar(t.skyL * pre);
    u.c1.value.setRGB(...t.sky1).multiplyScalar(t.skyL * 0.6 * pre);
    this.hemi.intensity = t.hemi * pre;
    this.sun.intensity = t.sun * pre;
    this.moon.intensity = t.moon * pre;
    this.fog.color.setRGB(...t.fog).multiplyScalar(t.fogL * pre);
  }
};

// src/assets/props.js
import * as THREE18 from "three";

// src/assets/geo.js
import * as THREE17 from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
var segs = (lod, l0, ...more) => [l0, ...more][Math.min(lod, more.length)];
function noise3(seed = 1) {
  const r = mulberry32(seed), P = 64, perm = new Uint8Array(512), val = new Float32Array(P * P * P / 64);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = r() * (i + 1) | 0;
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const g2 = new Float32Array(256);
  for (let i = 0; i < 256; i++) g2[i] = r() * 2 - 1;
  const h2 = (x, y, z) => g2[perm[perm[perm[x & 255] + y & 255] + z & 255]];
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = sm(x - X), v = sm(y - Y), w = sm(z - Z);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h2(X, Y, Z), h2(X + 1, Y, Z), u), l(h2(X, Y + 1, Z), h2(X + 1, Y + 1, Z), u), v),
      l(l(h2(X, Y, Z + 1), h2(X + 1, Y, Z + 1), u), l(h2(X, Y + 1, Z + 1), h2(X + 1, Y + 1, Z + 1), u), v),
      w
    );
  };
  n.fbm = (x, y, z, o = 4) => {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < o; i++) {
      s += n(x * f, y * f, z * f) * a;
      a *= 0.5;
      f *= 2.03;
    }
    return s;
  };
  return n;
}
function displace(geo, fn) {
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
function lathe(profile, seg, phi = Math.PI * 2) {
  return new THREE17.LatheGeometry(profile.map(([r, y]) => new THREE17.Vector2(r, y)), seg, 0, phi);
}
function tube(a, b, r0, r1, radial = 8, hseg = 1, open = false) {
  const len = a.distanceTo(b);
  const g2 = new THREE17.CylinderGeometry(r1, r0, len, radial, hseg, open);
  g2.translate(0, len / 2, 0);
  const q = new THREE17.Quaternion().setFromUnitVectors(new THREE17.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g2.applyQuaternion(q);
  g2.translate(a.x, a.y, a.z);
  return g2;
}
function mesh(geo, mat, { cast = true, recv = true, name = "" } = {}) {
  const m = new THREE17.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = recv;
  m.name = name;
  return m;
}
function mergeByMaterial(parts, name = "") {
  const byMat = /* @__PURE__ */ new Map();
  for (const [g2, m] of parts) {
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g2.index ? g2.toNonIndexed() : g2);
  }
  const grp = new THREE17.Group();
  grp.name = name;
  for (const [m, gs] of byMat) {
    gs.forEach((g2) => {
      for (const k of Object.keys(g2.attributes)) if (!["position", "normal", "uv"].includes(k)) g2.deleteAttribute(k);
      if (!g2.attributes.uv) g2.setAttribute("uv", new THREE17.Float32BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2));
    });
    const merged = mergeGeometries(gs, false);
    grp.add(mesh(merged, m, { name: name + ":" + (m.name || "mat") }));
  }
  return grp;
}
function blob(radius, detail, seed, rough = 0.25, stretch = [1, 1, 1]) {
  const g2 = new THREE17.IcosahedronGeometry(radius, detail);
  const n = noise3(seed);
  const p = g2.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + rough * n.fbm(x / radius * 1.3 + seed, y / radius * 1.3, z / radius * 1.3, 4);
    p.setXYZ(i, x * k * stretch[0], y * k * stretch[1], z * k * stretch[2]);
  }
  g2.computeVertexNormals();
  return g2;
}

// src/assets/props.js
function resample(pts, n) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = [], tot = L[L.length - 1];
  for (let k = 0; k < n; k++) {
    const s = tot * k / (n - 1);
    let i = 1;
    while (i < L.length - 1 && L[i] < s) i++;
    const t = (s - L[i - 1]) / Math.max(L[i] - L[i - 1], 1e-9);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
  }
  return out;
}
function charMat(name, opts = {}, extra = {}) {
  const m = makeMaterial(name, extra);
  m.name = name;
  const u = applyChar(m, opts);
  return { m, u };
}
function candle({ lod = 2 }) {
  const R = 0.011, H = 0.1;
  const rad = segs(lod, 8, 24, 64, 220, 640), rows = segs(lod, 6, 18, 70, 220, 760);
  const prof = resample([[5e-4, 0], [R, 0], [R, H - 6e-3], [R * 0.985, H - 1e-3], [R * 0.8, H - 15e-4], [R * 0.45, H - 4e-3], [15e-4, H - 5e-3]], rows);
  const g2 = lathe(prof, rad);
  const n = noise3(3);
  if (lod >= 2) displace(g2, (x, y, z) => (y > H * 0.55 ? 9e-4 * Math.max(0, n.fbm(Math.atan2(z, x) * 3, y * 120, 0, 3)) * ((y - H * 0.55) / (H * 0.45)) : 0) + 15e-5 * n(x * 900, y * 900, z * 900));
  const wax = makeMaterial("wax", { roughness: 0.4 });
  wax.name = "wax";
  wax.emissive = new THREE18.Color(1, 0.5, 0.18);
  wax.emissiveIntensity = 0;
  {
    const c2 = document.createElement("canvas");
    c2.width = 4;
    c2.height = 64;
    const g3 = c2.getContext("2d");
    const gr = g3.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, "#202020");
    gr.addColorStop(0.55, "#3a3a3a");
    gr.addColorStop(0.8, "#9a9a9a");
    gr.addColorStop(0.94, "#e0e0e0");
    gr.addColorStop(1, "#fff");
    g3.fillStyle = gr;
    g3.fillRect(0, 0, 4, 64);
    wax.emissiveMap = new THREE18.CanvasTexture(c2);
    wax.emissiveMap.colorSpace = THREE18.SRGBColorSpace;
  }
  const wick = tube(new THREE18.Vector3(0, H - 5e-3, 0), new THREE18.Vector3(12e-4, H + 9e-3, 4e-4), 6e-4, 4e-4, segs(lod, 4, 6, 8, 16, 32), segs(lod, 1, 2, 4, 8, 16));
  const wickM = new THREE18.MeshStandardMaterial({ color: 460293, roughness: 0.9, name: "wick" });
  const plate = lathe(resample([[0, 0], [0.04, 0], [0.042, 4e-3], [0.04, 6e-3], [R * 1.25, 6e-3], [R * 1.25, 0.018], [R * 1.1, 0.018], [R * 1.1, 8e-3], [0, 8e-3]], segs(lod, 6, 12, 30, 90, 280)), rad);
  const brass = new THREE18.MeshStandardMaterial({ color: 11570519, metalness: 0.9, roughness: 0.35, name: "brass" });
  const grp = new THREE18.Group();
  const cm = mesh(g2, wax, { name: "wax" });
  cm.position.y = 8e-3;
  grp.add(cm);
  const wm = mesh(wick, wickM, { name: "wick" });
  wm.position.y = 8e-3;
  grp.add(wm);
  grp.add(mesh(plate, brass, { name: "holder" }));
  grp.userData = { flameAt: new THREE18.Vector3(12e-4, H + 8e-3 + 9e-3, 4e-4), wax };
  return grp;
}
function torch({ lod = 2 }) {
  const rad = segs(lod, 5, 10, 24, 80, 260), rows = segs(lod, 4, 12, 40, 160, 600);
  const prof = resample([[0.012, 0], [0.014, 0.5], [0.016, 0.62], [0.026, 0.64], [0.03, 0.7], [0.028, 0.76], [0.022, 0.79], [4e-3, 0.8]], rows);
  const g2 = lathe(prof, rad);
  const n = noise3(5);
  displace(g2, (x, y, z) => {
    const a = Math.atan2(z, x);
    const wrap = y > 0.62 && y < 0.79 ? 25e-4 * Math.sin(a * 2 + y * 180) + 2e-3 * n.fbm(a * 4, y * 60, 0, 3) : 0;
    return wrap + 12e-4 * n(x * 300, y * 40, z * 300);
  });
  const { m, u } = charMat("bark", { scale: 30 });
  u.uCharBase.value = 0.5;
  u.uCharH.value = -0.3;
  const grp = new THREE18.Group();
  const t = mesh(g2, m, { name: "torch" });
  t.rotation.z = 0.12;
  grp.add(t);
  const iron = new THREE18.MeshStandardMaterial({ color: 2236704, metalness: 0.8, roughness: 0.6, name: "iron" });
  const spike = tube(new THREE18.Vector3(0, -0.25, 0), new THREE18.Vector3(-0.03, 0.42, 0), 6e-3, 6e-3, segs(lod, 4, 6, 10, 24, 64), 1);
  grp.add(mesh(spike, iron, { name: "spike" }));
  const ring = new THREE18.TorusGeometry(0.019, 4e-3, segs(lod, 3, 6, 10, 24, 60), segs(lod, 8, 16, 32, 96, 300));
  ring.rotateX(Math.PI / 2);
  ring.translate(-0.035, 0.42, 0);
  grp.add(mesh(ring, iron, { name: "ring" }));
  const tip = new THREE18.Vector3(0, 0.72, 0).applyEuler(new THREE18.Euler(0, 0, 0.12));
  grp.userData = { flameAt: tip, char: u };
  return grp;
}
function campfire({ lod = 2, size = "medium", seed = 11 }) {
  const r = mulberry32(seed);
  const S = { small: 0.45, medium: 1, large: 1.6 }[size] || 1;
  const nStones = { small: 7, medium: 12, large: 16 }[size];
  const nLogs = { small: 4, medium: 6, large: 9 }[size];
  const grp = new THREE18.Group();
  const stone = makeMaterial("stone");
  stone.name = "stone";
  const parts = [];
  const sd = segs(lod, 0, 1, 3, 5, 7);
  for (let i = 0; i < nStones; i++) {
    const a = i / nStones * Math.PI * 2 + r() * 0.2, R = 0.55 * S + r() * 0.05 * S;
    const g2 = blob(0.09 * S * (0.8 + r() * 0.5), sd, seed + i, 0.35, [1.2, 0.7, 1]);
    g2.rotateY(r() * 6);
    g2.translate(Math.cos(a) * R, 0.04 * S, Math.sin(a) * R);
    parts.push([g2, stone]);
  }
  grp.add(mergeByMaterial(parts, "stones"));
  const { m: bark, u } = charMat("bark", { scale: 8, alligator: [14, 20] });
  u.uCharBase.value = 0;
  u.uCharH.value = 0.6 * S;
  const n = noise3(seed + 9);
  const logs = [];
  for (let i = 0; i < nLogs; i++) {
    const a = i / nLogs * Math.PI * 2 + r() * 0.3;
    const base = new THREE18.Vector3(Math.cos(a) * 0.38 * S, 0.02, Math.sin(a) * 0.38 * S);
    const top = new THREE18.Vector3(Math.cos(a + 0.4) * 0.05 * S, 0.62 * S * (0.85 + r() * 0.3), Math.sin(a + 0.4) * 0.05 * S);
    const rr = 0.045 * S * (0.8 + r() * 0.5);
    const g2 = tube(base, top, rr, rr * 0.8, segs(lod, 5, 8, 16, 48, 160), segs(lod, 1, 4, 16, 64, 220));
    displace(g2, (x, y, z) => 4e-3 * S * n.fbm(x * 30, y * 30, z * 30, 3));
    logs.push(g2);
  }
  if (size !== "small") for (let i = 0; i < 3; i++) {
    const a = r() * 6.28, b = new THREE18.Vector3(Math.cos(a) * 0.5 * S, 0.05 * S, Math.sin(a) * 0.5 * S), c2 = new THREE18.Vector3(-Math.cos(a) * 0.1 * S, 0.12 * S, -Math.sin(a) * 0.1 * S);
    const g2 = tube(b, c2, 0.05 * S, 0.05 * S, segs(lod, 5, 8, 16, 48, 160), segs(lod, 1, 4, 12, 48, 180));
    displace(g2, (x, y, z) => 4e-3 * S * n.fbm(x * 30, y * 30, z * 30, 3));
    logs.push(g2);
  }
  grp.add(mergeByMaterial(logs.map((g2) => [g2, bark]), "logs"));
  const ash = new THREE18.CircleGeometry(0.5 * S, segs(lod, 8, 24, 64, 200, 500), 0, Math.PI * 2);
  ash.rotateX(-Math.PI / 2);
  if (lod >= 2) {
  }
  const ashM = new THREE18.MeshStandardMaterial({ color: 3815478, roughness: 1, name: "ash" });
  const au = applyChar(ashM, { scale: 25 });
  au.uChar.value = 0.9;
  au.uGlow.value = 0.6;
  const am = mesh(ash, ashM, { name: "ash" });
  am.position.y = 6e-3;
  grp.add(am);
  const coals = coalBed({ lod, R: 0.42 * S, S, seed: seed + 17 });
  if (coals) grp.add(coals);
  grp.userData = { char: u, ashChar: au, coals, flameAt: new THREE18.Vector3(0, 0.05, 0), D: 0.75 * S };
  return grp;
}
function coalBed({ lod = 2, R = 0.42, S = 1, seed = 5, n = null }) {
  const N2 = n ?? Math.round([0, 10, 28, 70, 380][Math.min(lod, 4)] * Math.max(0.6, S));
  if (!N2) return null;
  const r = mulberry32(seed);
  const g2 = blob(0.5, [0, 0, 1, 2, 3][Math.min(lod, 4)], seed, 0.45, [1.3, 0.55, 1]);
  const aChar = new THREE18.InstancedBufferAttribute(new Float32Array(N2 * 2), 2);
  g2.setAttribute("aChar", aChar);
  const m = new THREE18.MeshStandardMaterial({ color: 1315344, roughness: 0.95, name: "coal" });
  applyChar(m, { instanced: true, scale: 30, coal: true });
  const im = new THREE18.InstancedMesh(g2, m, N2);
  im.name = "coals";
  im.castShadow = false;
  im.receiveShadow = true;
  const M = new THREE18.Matrix4(), q = new THREE18.Quaternion(), e = new THREE18.Euler(), p = new THREE18.Vector3(), sc = new THREE18.Vector3();
  for (let i = 0; i < N2; i++) {
    const a = r() * Math.PI * 2, rr = R * Math.pow(r(), 0.75);
    const sz = 0.03 * S * Math.exp((r() - 0.5) * 1.1);
    p.set(Math.cos(a) * rr, 6e-3 + sz * 0.2, Math.sin(a) * rr);
    e.set((r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6);
    q.setFromEuler(e);
    sc.set(sz, sz * (0.7 + 0.5 * r()), sz * (0.8 + 0.4 * r()));
    im.setMatrixAt(i, M.compose(p, q, sc));
    aChar.setXY(i, 1, (0.45 + 0.55 * r()) * (1 - 0.45 * rr / R));
  }
  im.instanceMatrix.needsUpdate = true;
  im.userData.char = m.userData.char;
  return im;
}
function tireGeometry(lod) {
  const Ro = 0.316, Ri = 0.203, W = 0.205;
  const around = segs(lod, 12, 36, 120, 480, 2e3), rows = segs(lod, 6, 14, 40, 104, 240);
  const sec = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, ang = -Math.PI / 2 + t * Math.PI;
    const r = Ri + 0.02 + (Ro - Ri - 0.02) * (0.5 + 0.5 * Math.cos(ang - Math.PI / 2) ** 0.35 * Math.sign(Math.cos(ang - Math.PI / 2)));
    sec.push([Math.max(Ri, r), W / 2 * Math.sin(ang) * 1.02]);
  }
  const prof = resample([[Ri, -W * 0.42], [Ri + 0.03, -W * 0.5], [Ro - 0.03, -W * 0.52], [Ro - 6e-3, -W * 0.47], [Ro, -W * 0.4], [Ro, W * 0.4], [Ro - 6e-3, W * 0.47], [Ro - 0.03, W * 0.52], [Ri + 0.03, W * 0.5], [Ri, W * 0.42]], rows);
  const g2 = lathe(prof.map(([r, y]) => [r, y]), around);
  if (lod >= 2) {
    const p = g2.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, z);
      if (rr > Ro - 4e-3 && Math.abs(y) < W * 0.4) {
        const a = Math.atan2(z, x), lug = ((a * 60 / Math.PI + Math.abs(y) * 40) % 2 + 2) % 2;
        const groove = Math.abs(y) % 0.045 < 8e-3 || lug < 0.35 ? 8e-3 : 0;
        const k = (rr - groove) / rr;
        p.setXYZ(i, x * k, y, z * k);
      }
    }
    g2.computeVertexNormals();
  }
  return g2;
}
function tire({ lod = 2, rim = true }) {
  const grp = new THREE18.Group();
  const { m, u } = charMat("rubber", { scale: 20 });
  u.uCharBase.value = 0;
  u.uCharH.value = 0.6;
  const t = mesh(tireGeometry(lod), m, { name: "tire" });
  t.rotation.x = Math.PI / 2;
  t.position.y = 0.316;
  grp.add(t);
  if (rim) {
    const rg = lathe(resample([[0, -0.03], [0.06, -0.035], [0.17, -0.05], [0.203, -0.09], [0.205, -0.1], [0.205, 0.1], [0.198, 0.09], [0.17, 0.03], [0.06, 0.02], [0, 0.02]], segs(lod, 5, 10, 24, 64, 160)), segs(lod, 8, 24, 64, 240, 900));
    const steel = makeMaterial("steel");
    steel.name = "rim";
    const rm = mesh(rg, steel, { name: "rim" });
    rm.rotation.x = Math.PI / 2;
    rm.position.y = 0.316;
    grp.add(rm);
  }
  grp.userData = { char: u };
  return grp;
}
function tirePile({ lod = 2, n = 5, seed = 3 }) {
  const r = mulberry32(seed), grp = new THREE18.Group();
  const { m, u } = charMat("rubber", { scale: 20 });
  u.uCharH.value = 1.2;
  const g2 = tireGeometry(lod);
  for (let i = 0; i < n; i++) {
    const t = mesh(g2, m, { name: "tire" + i });
    t.position.set((r() - 0.5) * 0.08, 0.105 + i * 0.205, (r() - 0.5) * 0.08);
    t.rotation.set((r() - 0.5) * 0.08, r() * 3, (r() - 0.5) * 0.08);
    grp.add(t);
  }
  grp.userData = { char: u, H: n * 0.205 };
  return grp;
}
function barrel({ lod = 2, paint = "metalRed" }) {
  const R = 0.2865, H = 0.88;
  const rad = segs(lod, 10, 28, 96, 400, 1300), rows = segs(lod, 8, 24, 80, 200, 370);
  const p = [[0, 4e-3], [R - 0.01, 4e-3], [R - 4e-3, 0], [R + 6e-3, 8e-3], [R, 0.02]];
  for (const hy of [0.29, 0.59]) p.push([R, hy - 0.025], [R + 0.012, hy - 0.01], [R + 0.012, hy + 0.01], [R, hy + 0.025]);
  p.push([R, H - 0.02], [R + 6e-3, H - 8e-3], [R - 4e-3, H], [R - 0.012, H - 6e-3], [0, H - 6e-3]);
  const g2 = lathe(resample(p, rows), rad);
  const n = noise3(7);
  if (lod >= 2) displace(g2, (x, y, z) => 15e-4 * n.fbm(x * 10, y * 10, z * 10, 3));
  const { m, u } = charMat(paint, { scale: 4, metal: true });
  u.uCharBase.value = 0;
  u.uCharH.value = H;
  const grp = new THREE18.Group();
  grp.add(mesh(g2, m, { name: "drum" }));
  for (const [x, rr] of [[0.18, 0.03], [-0.17, 0.018]]) {
    const b = new THREE18.CylinderGeometry(rr, rr, 0.012, segs(lod, 6, 10, 20, 48, 120));
    b.translate(x, H - 0, 0);
    grp.add(mesh(b, m, { name: "bung" }));
  }
  grp.userData = { char: u, H, R };
  return grp;
}
function grenade({ lod = 2 }) {
  const grp = new THREE18.Group();
  const body = new THREE18.SphereGeometry(0.032, segs(lod, 8, 16, 48, 200, 640), segs(lod, 6, 12, 36, 150, 480));
  const olive = makeMaterial("metalOlive");
  olive.name = "body";
  grp.add(mesh(body, olive, { name: "body" }));
  const steel = makeMaterial("steel");
  steel.name = "fuze";
  const fz = lathe(resample([[0, 0.028], [0.012, 0.028], [0.012, 0.05], [8e-3, 0.055], [0, 0.055]], segs(lod, 4, 8, 16, 48, 160)), segs(lod, 6, 12, 32, 120, 400));
  grp.add(mesh(fz, steel, { name: "fuze" }));
  const lever = new THREE18.BoxGeometry(8e-3, 0.07, 2e-3, 1, segs(lod, 1, 4, 12, 40, 120), 1);
  const lp = lever.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const y = lp.getY(i);
    lp.setZ(i, lp.getZ(i) + 0.034 * Math.sin((y + 0.035) / 0.07 * 1.4));
  }
  lever.computeVertexNormals();
  lever.translate(0, 0.015, 0);
  grp.add(mesh(lever, steel, { name: "lever" }));
  const ring = new THREE18.TorusGeometry(0.012, 12e-4, segs(lod, 3, 6, 10, 24, 48), segs(lod, 8, 16, 32, 96, 300));
  ring.translate(0.022, 0.05, 0);
  grp.add(mesh(ring, steel, { name: "pin" }));
  grp.userData = { H: 0.087 };
  return grp;
}
function labelTexture(lines) {
  const c2 = document.createElement("canvas");
  c2.width = 1024;
  c2.height = 256;
  const g2 = c2.getContext("2d");
  g2.fillStyle = "#353a20";
  g2.fillRect(0, 0, 1024, 256);
  g2.fillStyle = "#c9a419";
  g2.fillRect(0, 100, 1024, 40);
  g2.fillStyle = "#d8d0b0";
  g2.font = "bold 54px monospace";
  g2.textAlign = "center";
  lines.forEach((l, i) => g2.fillText(l, 256 + 512 * (i % 2), 70 + 150 * Math.floor(i / 2) + (i > 1 ? 20 : 0)));
  const t = new THREE18.CanvasTexture(c2);
  t.colorSpace = THREE18.SRGBColorSpace;
  t.wrapS = THREE18.RepeatWrapping;
  return t;
}
function tntDrum({ lod = 2 }) {
  const R = 0.47, H = 1;
  const p = [[0, 0.01], [R - 0.02, 0.01], [R, 0], [R + 0.012, 0.015], [R, 0.03]];
  for (const hy of [0.33, 0.66]) p.push([R, hy - 0.03], [R + 0.015, hy - 0.012], [R + 0.015, hy + 0.012], [R, hy + 0.03]);
  p.push([R, H - 0.03], [R + 0.012, H - 0.015], [R, H], [R - 0.02, H - 0.01], [0, H - 0.01]);
  const g2 = lathe(resample(p, segs(lod, 8, 24, 80, 220, 400)), segs(lod, 10, 28, 96, 420, 1200));
  const mat = new THREE18.MeshStandardMaterial({ map: labelTexture(["TNT", "1000 kg", "V\xDDBU\u0160NINA 1.1D", "UN 0209"]), roughness: 0.55, metalness: 0.4, name: "tnt" });
  const grp = new THREE18.Group();
  grp.add(mesh(g2, mat, { name: "drum" }));
  const wood = makeMaterial("woodPlank");
  wood.name = "pallet";
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE18.BoxGeometry(1.2, 0.022, 0.14);
    b.translate(0, 0.133, -0.5 + i * 0.25);
    parts.push([b, wood]);
  }
  for (let i = 0; i < 3; i++) {
    const b = new THREE18.BoxGeometry(0.1, 0.1, 1.2);
    b.translate(-0.55 + i * 0.55, 0.05 + 0.022, 0);
    parts.push([b, wood]);
  }
  const pal = mergeByMaterial(parts, "pallet");
  grp.add(pal);
  grp.children[0].position.y = 0.144;
  grp.userData = { H: H + 0.144 };
  return grp;
}
function acetyleneBag({ lod = 2 }) {
  const grp = new THREE18.Group();
  const prof = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, y = t * 0.62;
    const r = Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7 * 0.22 * (1 - 0.25 * t) + 0.012;
    prof.push([r, y]);
  }
  prof.push([0.012, 0.66], [6e-3, 0.7], [0, 0.7]);
  const g2 = lathe(resample(prof, segs(lod, 6, 16, 48, 180, 600)), segs(lod, 8, 20, 64, 240, 800));
  const n = noise3(13);
  displace(g2, (x, y, z) => 8e-3 * n.fbm(x * 8, y * 8, z * 8, 3));
  const pe = new THREE18.MeshStandardMaterial({ color: 14674156, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false, name: "pe" });
  const bag = mesh(g2, pe, { name: "bag", cast: false });
  bag.position.y = 0.05;
  grp.add(bag);
  const wood = makeMaterial("woodPlank");
  wood.name = "stake";
  grp.add(mesh(tube(new THREE18.Vector3(0.35, -0.2, 0), new THREE18.Vector3(0.35, 0.5, 0), 0.015, 0.012, segs(lod, 4, 6, 12, 32, 96), 1), wood, { name: "stake" }));
  const cord = new THREE18.MeshStandardMaterial({ color: 7035450, roughness: 0.9, name: "cord" });
  grp.add(mesh(tube(new THREE18.Vector3(0, 0.75, 0), new THREE18.Vector3(0.35, 0.45, 0), 2e-3, 2e-3, 4, segs(lod, 1, 4, 8, 16, 32)), cord, { name: "cord" }));
  const cyl = lathe(resample([[0, 0], [0.1, 0], [0.11, 0.02], [0.11, 0.85], [0.08, 0.95], [0.035, 0.98], [0.035, 1.05], [0, 1.05]], segs(lod, 6, 16, 40, 120, 300)), segs(lod, 8, 20, 64, 200, 600));
  const am = makeMaterial("acetylene");
  am.name = "cylinder";
  const cm = mesh(cyl, am, { name: "cylinder" });
  cm.position.set(-0.9, 0, 0.4);
  grp.add(cm);
  grp.userData = { H: 0.75 };
  return grp;
}
function grinderRig({ lod = 2 }) {
  const grp = new THREE18.Group();
  const steel = makeMaterial("steel");
  steel.name = "beam";
  const sh = new THREE18.Shape();
  const b = 0.082, h2 = 0.16, tw = 5e-3, tf = 74e-4;
  sh.moveTo(-b / 2, 0);
  sh.lineTo(b / 2, 0);
  sh.lineTo(b / 2, tf);
  sh.lineTo(tw / 2, tf);
  sh.lineTo(tw / 2, h2 - tf);
  sh.lineTo(b / 2, h2 - tf);
  sh.lineTo(b / 2, h2);
  sh.lineTo(-b / 2, h2);
  sh.lineTo(-b / 2, h2 - tf);
  sh.lineTo(-tw / 2, h2 - tf);
  sh.lineTo(-tw / 2, tf);
  sh.lineTo(-b / 2, tf);
  sh.closePath();
  const beam = new THREE18.ExtrudeGeometry(sh, { depth: 1.2, steps: segs(lod, 1, 4, 24, 200, 900), bevelEnabled: false });
  beam.translate(0, 0.45, -0.6);
  grp.add(mesh(beam, steel, { name: "beam" }));
  const wood = makeMaterial("woodPlank");
  wood.name = "trestle";
  for (const z of [-0.45, 0.45]) {
    const t = new THREE18.BoxGeometry(0.5, 0.45, 0.08, 1, segs(lod, 1, 2, 4, 16, 40), 1);
    t.translate(0, 0.225, z);
    grp.add(mesh(t, wood, { name: "trestle" }));
  }
  const body = new THREE18.Group();
  const dark = new THREE18.MeshStandardMaterial({ color: 1849950, roughness: 0.6, name: "grinder" });
  const blk = new THREE18.MeshStandardMaterial({ color: 1381653, roughness: 0.7, name: "grip" });
  body.add(mesh(new THREE18.CylinderGeometry(0.03, 0.033, 0.28, segs(lod, 6, 12, 32, 96, 300), segs(lod, 1, 2, 8, 32, 96)).rotateZ(Math.PI / 2).translate(-0.14, 0, 0), dark, { name: "motor" }));
  body.add(mesh(new THREE18.BoxGeometry(0.07, 0.06, 0.07, 1, 1, 1).translate(0.02, 0, 0), dark, { name: "head" }));
  const disc = new THREE18.CylinderGeometry(0.0625, 0.0625, 25e-4, segs(lod, 10, 24, 64, 240, 800), 1);
  disc.translate(0.03, -0.045, 0);
  body.add(mesh(disc, new THREE18.MeshStandardMaterial({ color: 6052437, roughness: 0.9, name: "disc" }), { name: "disc" }));
  body.add(mesh(new THREE18.CylinderGeometry(0.012, 0.012, 0.1, 8).translate(0.02, 0.06, 0), blk, { name: "handle" }));
  body.rotation.set(0.25, 0.4, -0.35);
  body.position.set(-0.02, 0.45 + 0.16 + 0.07, 0.05);
  grp.add(body);
  grp.userData = { sparkAt: new THREE18.Vector3(0, 0.45 + 0.16, 0.05), sparkDir: new THREE18.Vector3(-0.8, 0.25, 0.55).normalize() };
  return grp;
}
function puddle({ lod = 2, R = 2, seed = 21 }) {
  const n = noise3(seed);
  const around = segs(lod, 12, 48, 160, 600, 2e3), rings = segs(lod, 1, 6, 30, 80, 240);
  const pos = [], idx = [], uv = [];
  pos.push(0, 0, 0);
  uv.push(0.5, 0.5);
  for (let j = 1; j <= rings; j++) for (let i = 0; i < around; i++) {
    const a = i / around * Math.PI * 2, t = j / rings;
    const rr = R * t * (0.82 + 0.3 * n.fbm(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4, 0, 4) + 0.08 * Math.sin(a * 3 + 1));
    pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    uv.push(0.5 + Math.cos(a) * rr / (2 * R), 0.5 + Math.sin(a) * rr / (2 * R));
  }
  for (let i = 0; i < around; i++) idx.push(0, 1 + (i + 1) % around, 1 + i);
  for (let j = 1; j < rings; j++) for (let i = 0; i < around; i++) {
    const a = 1 + (j - 1) * around + i, b = 1 + (j - 1) * around + (i + 1) % around, c2 = a + around, d = b + around;
    idx.push(a, b, d, a, d, c2);
  }
  const g2 = new THREE18.BufferGeometry();
  g2.setAttribute("position", new THREE18.Float32BufferAttribute(pos, 3));
  g2.setAttribute("uv", new THREE18.Float32BufferAttribute(uv, 2));
  g2.setIndex(idx);
  g2.computeVertexNormals();
  const m = new THREE18.MeshStandardMaterial({ color: 723464, roughness: 0.04, metalness: 0, name: "diesel" });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      { float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
        vec3 film = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + fr * 2.5 + vFilm.x * 1.7 + vFilm.y * 1.3));
        totalEmissiveRadiance += film * fr * 0.02; }`).replace("#include <common>", "#include <common>\nvarying vec2 vFilm;");
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vFilm;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFilm = position.xz;");
  };
  const pm = mesh(g2, m, { name: "puddle", cast: false });
  pm.position.y = 4e-3;
  const grp = new THREE18.Group();
  grp.add(pm);
  const can = new THREE18.BoxGeometry(0.34, 0.47, 0.16, 1, segs(lod, 1, 2, 6, 24, 80), 1);
  can.rotateZ(Math.PI / 2 - 0.1);
  can.translate(R * 0.95, 0.09, 0.3);
  const cm = makeMaterial("metalRed");
  cm.name = "jerrycan";
  grp.add(mesh(can, cm, { name: "jerrycan" }));
  grp.userData = { R };
  return grp;
}

// src/assets/big.js
import * as THREE19 from "three";
function strawStack({ lod = 2, nx = 4, ny = 3, nz = 3, seed = 31 }) {
  const r = mulberry32(seed), n = noise3(seed);
  const bx = 2.4, by = 0.9, bz = 1.2;
  const m = makeMaterial("straw");
  m.name = "straw";
  const u = applyChar(m, { scale: 3 });
  u.uCharBase.value = 0;
  u.uCharH.value = ny * by;
  const parts = [];
  if (lod === 0) {
    const g2 = new THREE19.BoxGeometry(nx * bx * 0.5 + 0.2, ny * by, nz * bz, 2, 2, 2);
    g2.translate(0, ny * by / 2, 0);
    parts.push([g2, m]);
  } else {
    const [sx, sy, sz] = [segs(lod, 1, 2, 8, 24, 80), segs(lod, 1, 1, 4, 10, 30), segs(lod, 1, 1, 4, 12, 40)];
    for (let k = 0; k < ny; k++) for (let j = 0; j < nz; j++) for (let i = 0; i < nx / 2; i++) {
      if (k === ny - 1 && (j === 0 || j === nz - 1) && r() < 0.5) continue;
      const g2 = new THREE19.BoxGeometry(bx, by, bz, sx, sy, sz);
      const p = g2.attributes.position;
      const ox = (i - (nx / 2 - 1) / 2) * bx + (r() - 0.5) * 0.06, oy = by / 2 + k * by, oz = (j - (nz - 1) / 2) * bz + (r() - 0.5) * 0.06;
      for (let q = 0; q < p.count; q++) {
        let x = p.getX(q), y = p.getY(q), z = p.getZ(q);
        const ex = Math.abs(x) / (bx / 2), ey = Math.abs(y) / (by / 2), ez = Math.abs(z) / (bz / 2);
        const corner = Math.max(0, (ey - 0.75) * 4) * Math.max(0, (Math.max(ex, ez) - 0.75) * 4);
        y *= 1 - 0.06 * corner;
        x *= 1 - 0.015 * corner;
        z *= 1 - 0.03 * corner;
        const bulge = 0.03 * (1 - ey * ey);
        const fuzz = lod >= 2 ? 0.02 * n.fbm((x + ox) * 3, (y + oy) * 3, (z + oz) * 3, 4) : 0;
        const s = 1 + (bulge + fuzz) / Math.max(bx, bz) * 2;
        p.setXYZ(q, x * s + ox, y + oy + (lod >= 3 ? fuzz * 0.3 : 0), z * s + oz);
      }
      g2.computeVertexNormals();
      parts.push([g2, m]);
    }
  }
  const grp = mergeByMaterial(parts, "stack");
  grp.userData = { char: u, W: nx / 2 * bx, D: nz * bz, H: ny * by };
  return grp;
}
function car({ lod = 2, color = "carPaint" }) {
  const L = 4.5, Wd = 1.8;
  const nu = segs(lod, 10, 36, 120, 300, 1e3), nv = segs(lod, 10, 22, 60, 160, 480);
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const top = (x) => {
    const t = (x + L / 2) / L;
    const hood = 0.95 + 0.08 * sm(0, 0.25, t), roof = 1.45;
    const cab = sm(0.28, 0.42, t) * (1 - sm(0.68, 0.84, t));
    const trunk = 1 - 0.06 * sm(0.85, 1, t);
    return t < 0.5 ? hood + (roof - hood) * cab : trunk + (roof - trunk) * cab;
  };
  const bot = (x) => 0.28 + 0.06 * sm(-L / 2, -L / 2 + 0.3, -x) + 0.05 * sm(L / 2 - 0.3, L / 2, x);
  const halfW = (x, y) => {
    const t = (x + L / 2) / L;
    const end = Math.min(sm(0, 0.08, t), sm(1, 0.93, t)) * 0.15 + 0.85;
    const tumble = y > 1 ? 1 - 0.22 * sm(1, 1.45, y) : 1;
    return Wd / 2 * end * tumble;
  };
  const wheelX = [-1.35, 1.35], wheelR = 0.36;
  const pos = [], col = [], idx = [], uv = [];
  const paint = new THREE19.Color(1, 1, 1), glass = new THREE19.Color(0.04, 0.05, 0.06), trim = new THREE19.Color(0.08, 0.08, 0.08);
  for (let i = 0; i <= nu; i++) {
    const x = -L / 2 + L * i / nu;
    const y0 = bot(x), y1 = top(x);
    for (let j = 0; j <= nv; j++) {
      const a = j / nv * Math.PI * 2;
      const c2 = Math.cos(a), s = Math.sin(a), e = 0.35;
      const sx = Math.sign(c2) * Math.abs(c2) ** e, sy = Math.sign(s) * Math.abs(s) ** e;
      const y = (y0 + y1) / 2 + (y1 - y0) / 2 * sy;
      let z = halfW(x, y) * sx;
      let yy = y;
      for (const wx of wheelX) {
        const dx = x - wx;
        if (Math.abs(dx) < wheelR + 0.08 && yy < 0.28 + wheelR + 0.06 && Math.abs(sx) > 0.6) {
          const arch = 0.28 + Math.sqrt(Math.max(0, (wheelR + 0.08) ** 2 - dx * dx)) * 0.95;
          if (yy < arch) yy = arch;
        }
      }
      pos.push(x, yy, z);
      uv.push(i / nu * 4, j / nv);
      const t = (x + L / 2) / L;
      const isGlass = yy > 1.05 && yy < 1.41 && t > 0.3 && t < 0.83 && Math.abs(sy) < 0.985 && !(Math.abs(t - 0.56) < 0.012);
      const isTrim = yy < 0.42;
      const k = isGlass ? glass : isTrim ? trim : paint;
      col.push(k.r, k.g, k.b);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + 1, c2 = a + nv + 1, d = c2 + 1;
    idx.push(a, c2, b, b, c2, d);
  }
  const g2 = new THREE19.BufferGeometry();
  g2.setAttribute("position", new THREE19.Float32BufferAttribute(pos, 3));
  g2.setAttribute("color", new THREE19.Float32BufferAttribute(col, 3));
  g2.setAttribute("uv", new THREE19.Float32BufferAttribute(uv, 2));
  g2.setIndex(idx);
  g2.computeVertexNormals();
  const bm = makeMaterial(color, { vertexColors: true, roughness: 0.35, metalness: 0.35 });
  bm.name = "body";
  const u = applyChar(bm, { scale: 2, metal: true });
  u.uCharBase.value = 0.3;
  u.uCharH.value = 1.2;
  const grp = new THREE19.Group();
  grp.add(mesh(g2, bm, { name: "body" }));
  const tg = tireGeometry(Math.max(0, lod - 1));
  const rm = makeMaterial("rubber");
  rm.name = "tire";
  const tu = applyChar(rm, { scale: 20 });
  tu.uCharH.value = 0.7;
  const steel = makeMaterial("steel");
  steel.name = "rim";
  const rimG = new THREE19.CylinderGeometry(0.2, 0.2, 0.19, segs(lod, 6, 12, 32, 96, 300));
  for (const wx of wheelX) for (const wz of [-0.78, 0.78]) {
    const t = mesh(tg, rm, { name: "tire" });
    t.rotation.x = Math.PI / 2;
    t.scale.setScalar(wheelR / 0.316);
    t.position.set(wx, wheelR, wz);
    grp.add(t);
    const rr = mesh(rimG, steel, { name: "rim" });
    rr.rotation.x = Math.PI / 2;
    rr.position.set(wx, wheelR, wz);
    grp.add(rr);
  }
  const lightM = new THREE19.MeshStandardMaterial({ color: 14540253, emissive: 3353120, roughness: 0.2, name: "lamp" });
  const tailM = new THREE19.MeshStandardMaterial({ color: 5572616, emissive: 2097152, roughness: 0.3, name: "tail" });
  for (const z of [-0.6, 0.6]) {
    const h2 = new THREE19.BoxGeometry(0.05, 0.1, 0.32);
    h2.translate(L / 2 - 0.02, 0.8, z);
    grp.add(mesh(h2, lightM, { name: "lamp" }));
    const t = new THREE19.BoxGeometry(0.05, 0.1, 0.3);
    t.translate(-L / 2 + 0.03, 0.86, z);
    grp.add(mesh(t, tailM, { name: "tail" }));
  }
  grp.userData = { char: u, tireChar: tu, L, W: Wd, body: bm };
  return grp;
}
function house({ lod = 2, seed = 41 }) {
  const r = mulberry32(seed);
  const W = 9, D = 7, Hw = 2.9, pitch = 0.62, ov = 0.45, th = 0.3;
  const grp = new THREE19.Group();
  const plaster = makeMaterial("plaster");
  plaster.name = "plaster";
  const pu = applyChar(plaster, { scale: 3 });
  pu.uCharBase.value = 0.8;
  pu.uCharH.value = 3;
  const roofM = makeMaterial("roof");
  roofM.name = "roof";
  const ru = applyChar(roofM, { scale: 3, hole: true });
  ru.uCharBase.value = Hw;
  ru.uCharH.value = 3;
  const wood = makeMaterial("woodPlank");
  wood.name = "frames";
  const wu = applyChar(wood, { scale: 6, hole: true });
  const brick = makeMaterial("brick");
  brick.name = "brick";
  const glassM = new THREE19.MeshStandardMaterial({ color: 725012, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55, name: "glass" });
  const wins = [
    { wall: "S", u: -2.8, w: 1.2, h: 1.3, y: 0.9 },
    { wall: "S", u: 2.8, w: 1.2, h: 1.3, y: 0.9 },
    { wall: "S", u: 0, w: 1, h: 2.1, y: 0, door: true },
    { wall: "N", u: -2.5, w: 1.2, h: 1.3, y: 0.9 },
    { wall: "N", u: 2, w: 0.8, h: 0.9, y: 1.3 },
    { wall: "E", u: 0, w: 1.2, h: 1.3, y: 0.9 },
    { wall: "W", u: -1.2, w: 1.2, h: 1.3, y: 0.9 }
  ];
  const parts = [];
  const subdiv = segs(lod, 1, 1, 4, 12, 40);
  function wall2(name, len, place) {
    const ow = wins.filter((w) => w.wall === name).sort((a, b) => a.u - b.u);
    const pieces = [];
    let cur = -len / 2;
    for (const o of ow) {
      const a = o.u - o.w / 2, b = o.u + o.w / 2;
      if (a > cur) pieces.push([cur, a, 0, Hw]);
      if (o.y > 0) pieces.push([a, b, 0, o.y]);
      pieces.push([a, b, o.y + o.h, Hw]);
      cur = b;
    }
    if (cur < len / 2) pieces.push([cur, len / 2, 0, Hw]);
    for (const [a, b, y0, y1] of pieces) {
      if (b - a < 1e-3 || y1 - y0 < 1e-3) continue;
      const g2 = new THREE19.BoxGeometry(b - a, y1 - y0, th, Math.max(1, Math.round((b - a) * subdiv)), Math.max(1, Math.round((y1 - y0) * subdiv)), 1);
      g2.translate((a + b) / 2, (y0 + y1) / 2, 0);
      place(g2);
      parts.push([g2, plaster]);
    }
    for (const o of ow) {
      if (lod >= 1) {
        const fw = 0.07;
        const fr = [[o.w + fw * 2, fw, 0, o.y + o.h + fw / 2], [fw, o.h, -o.w / 2 - fw / 2, o.y + o.h / 2], [fw, o.h, o.w / 2 + fw / 2, o.y + o.h / 2]];
        if (!o.door) fr.push([o.w + fw * 2, fw, 0, o.y - fw / 2]);
        for (const [w, h2, du, y] of fr) {
          const g2 = new THREE19.BoxGeometry(w, h2, th * 0.55);
          g2.translate(o.u + du, y, th * 0.25);
          place(g2);
          parts.push([g2, wood]);
        }
        if (!o.door && lod >= 2) {
          const g2 = new THREE19.BoxGeometry(0.05, o.h, 0.06);
          g2.translate(o.u, o.y + o.h / 2, 0.05);
          place(g2);
          parts.push([g2, wood]);
          const g22 = new THREE19.BoxGeometry(o.w, 0.05, 0.06);
          g22.translate(o.u, o.y + o.h * 0.6, 0.05);
          place(g22);
          parts.push([g22, wood]);
        }
      }
      const pane = new THREE19.BoxGeometry(o.w, o.h, 0.01);
      pane.translate(o.u, o.y + o.h / 2, 0.02);
      place(pane);
      parts.push([pane, o.door ? wood : glassM]);
    }
  }
  wall2("S", W, (g2) => g2.translate(0, 0, D / 2 - th / 2));
  wall2("N", W, (g2) => {
    g2.rotateY(Math.PI);
    g2.translate(0, 0, -D / 2 + th / 2);
  });
  wall2("E", D - 2 * th, (g2) => {
    g2.rotateY(Math.PI / 2);
    g2.translate(W / 2 - th / 2, 0, 0);
  });
  wall2("W", D - 2 * th, (g2) => {
    g2.rotateY(-Math.PI / 2);
    g2.translate(-W / 2 + th / 2, 0, 0);
  });
  for (const [w, d, x, z] of [[W + 0.06, 0.04, 0, D / 2 + 0.01], [W + 0.06, 0.04, 0, -D / 2 - 0.01], [0.04, D, W / 2 + 0.01, 0], [0.04, D, -W / 2 - 0.01, 0]]) {
    const g2 = new THREE19.BoxGeometry(w, 0.45, d);
    g2.translate(x, 0.225, z);
    parts.push([g2, brick]);
  }
  const rh = D / 2 * Math.tan(pitch);
  for (const sx of [1, -1]) {
    const sh = new THREE19.Shape();
    sh.moveTo(-D / 2, 0);
    sh.lineTo(D / 2, 0);
    sh.lineTo(0, rh);
    sh.closePath();
    const g2 = new THREE19.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false });
    g2.rotateY(Math.PI / 2);
    g2.translate(sx * (W / 2) - (sx > 0 ? th : 0), Hw, 0);
    parts.push([g2, plaster]);
  }
  {
    const g2 = new THREE19.BoxGeometry(W - 2 * th, 0.1, D - 2 * th);
    g2.translate(0, 0.05, 0);
    parts.push([g2, wood]);
  }
  {
    const g2 = new THREE19.BoxGeometry(0.15, Hw, D - 2 * th);
    g2.translate(0.8, Hw / 2, 0);
    parts.push([g2, plaster]);
  }
  {
    const g2 = new THREE19.BoxGeometry(W - 2 * th, 0.15, D - 2 * th);
    g2.translate(0, Hw - 0.07, 0);
    parts.push([g2, wood]);
  }
  const slopeL = (D / 2 + ov) / Math.cos(pitch);
  if (lod < 3) {
    for (const sz of [1, -1]) {
      const g2 = new THREE19.BoxGeometry(W + 2 * ov, 0.12, slopeL, Math.max(1, subdiv * 3), 1, Math.max(1, subdiv * 2));
      g2.translate(0, 0, sz * slopeL / 2);
      g2.rotateX(sz * pitch);
      g2.translate(0, Hw + rh + 0.06 - 0, 0);
      parts.push([g2, roofM]);
    }
  } else {
    const tw = 0.18, tl = 0.38, step = 0.15;
    const tseg = segs(lod, 1, 1, 1, 1, 4);
    const tile = new THREE19.CylinderGeometry(tw * 0.55, tw * 0.55, tl, 4 * tseg, 2 * tseg, true, 0, Math.PI);
    tile.rotateX(Math.PI / 2);
    tile.scale(1, 0.25, 1);
    const cols = Math.ceil((W + 2 * ov) / tw), rows = Math.ceil(slopeL / step);
    const tgs = [];
    for (const sz of [1, -1]) for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const g2 = tile.clone();
      g2.rotateX(-0.08);
      g2.translate(-W / 2 - ov + (j + i % 2 * 0.5) * tw, 0.06, sz * (i * step + tl / 2));
      g2.rotateX(sz * pitch);
      g2.translate(0, Hw + rh + 0.02, 0);
      tgs.push([g2, roofM]);
    }
    parts.push(...tgs);
    for (const sz of [1, -1]) {
      const g2 = new THREE19.BoxGeometry(W + 2 * ov, 0.06, slopeL);
      g2.translate(0, 0, sz * slopeL / 2);
      g2.rotateX(sz * pitch);
      g2.translate(0, Hw + rh, 0);
      parts.push([g2, wood]);
    }
  }
  {
    const g2 = new THREE19.BoxGeometry(0.6, 1.8, 0.6, 1, Math.max(1, subdiv * 2), 1);
    g2.translate(-2.2, Hw + rh, -0.8);
    parts.push([g2, brick]);
  }
  const merged = mergeByMaterial(parts, "house");
  grp.add(merged);
  grp.userData = {
    char: { plaster: pu, roof: ru, wood: wu },
    W,
    D,
    H: Hw + rh,
    rooms: [
      { name: "ob\xFDv\xE1k", x: -2.2, z: 0, w: 4.6, d: D - 0.6, wins: wins.filter((w) => w.wall === "S" && w.u < 0 || w.wall === "W" || w.wall === "N" && w.u < 0) },
      { name: "kuchyn\u011B", x: 2.9, z: 0, w: 3.6, d: D - 0.6, wins: wins.filter((w) => w.wall === "S" && w.u > 0 || w.wall === "E" || w.wall === "N" && w.u > 0) }
    ],
    wins,
    th
  };
  return grp;
}

// src/assets/vegetation.js
import * as THREE20 from "three";
function strip(g2) {
  const c2 = g2.index ? g2.toNonIndexed() : g2;
  for (const k of Object.keys(c2.attributes)) if (!["position", "normal", "uv"].includes(k)) c2.deleteAttribute(k);
  return c2;
}
var _needleTex = null;
function needleCardTexture() {
  if (_needleTex) return _needleTex;
  if (typeof document === "undefined") return null;
  const S = 256, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g2 = cv.getContext("2d"), r = mulberry32(11);
  g2.clearRect(0, 0, S, S);
  g2.fillStyle = "#3b2b1d";
  g2.fillRect(0, 0, S * 0.1, S);
  const x0 = S * 0.12, w = S * 0.88;
  for (let k = 0; k < 3; k++) {
    const cx = x0 + w * (0.2 + 0.3 * k + (r() - 0.5) * 0.08);
    g2.strokeStyle = "#4a3a22";
    g2.lineWidth = 2.2;
    g2.beginPath();
    g2.moveTo(cx, S * 0.98);
    g2.lineTo(cx + (r() - 0.5) * 8, S * 0.05);
    g2.stroke();
    for (let i = 0; i < 70; i++) {
      const t = 0.04 + 0.92 * (i / 70), y = S * (0.98 - 0.93 * t), side = i % 2 ? 1 : -1;
      const L = S * (0.13 + 0.07 * r()) * (1 - 0.35 * t), a = side * (0.55 + 0.35 * r()) - Math.PI / 2;
      const c2 = [20 + 30 * r(), 55 + 40 * r(), 25 + 25 * r()].map((v) => v | 0);
      g2.strokeStyle = `rgb(${c2[0]},${c2[1]},${c2[2]})`;
      g2.lineWidth = 1.6 + r();
      g2.beginPath();
      g2.moveTo(cx, y);
      g2.lineTo(cx + Math.cos(a) * L, y + Math.sin(a) * L * 0.9);
      g2.stroke();
    }
  }
  _needleTex = new THREE20.CanvasTexture(cv);
  _needleTex.colorSpace = THREE20.SRGBColorSpace;
  _needleTex.anisotropy = 4;
  return _needleTex;
}
function needleCardMaterial() {
  const m = new THREE20.MeshStandardMaterial({ map: needleCardTexture(), alphaTest: 0.45, side: THREE20.DoubleSide, roughness: 0.85 });
  m.name = "needle-cards";
  return m;
}
function barkStripUV(g2) {
  const uv = g2.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 0.02 + uv.getX(i) * 0.06);
  return g2;
}
function pineGeometry(lod, seed = 1) {
  const n = noise3(seed), r = mulberry32(seed);
  const radial = segs(lod, 4, 7, 14, 40, 120), hs = segs(lod, 1, 3, 10, 30, 90);
  const cards = lod >= 2;
  const trunk = tube(
    new THREE20.Vector3(0, -0.02, 0),
    new THREE20.Vector3(0, 0.98, 0),
    0.016,
    3e-3,
    cards ? segs(lod, 4, 6, 8, 10, 16) : Math.max(4, radial >> 1),
    cards ? segs(lod, 1, 2, 6, 10, 20) : hs
  );
  const crowns = [];
  if (!cards) {
    const layers = segs(lod, 2, 4);
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1 || 1);
      const y0 = 0.25 + t * 0.62, h2 = 0.32 - t * 0.12, rad = 0.2 * (1 - t * 0.75) + 0.03;
      const g2 = new THREE20.ConeGeometry(rad, h2, radial, Math.max(1, hs >> 1), true);
      g2.translate(0, y0 + h2 / 2, 0);
      const p = g2.attributes.position;
      for (let q = 0; q < p.count; q++) {
        const x = p.getX(q), y = p.getY(q), z = p.getZ(q), a = Math.atan2(z, x);
        const k = 1 + 0.25 * n.fbm(Math.cos(a) * 2 + i, y * 8, Math.sin(a) * 2, 3);
        p.setXYZ(q, x * k, y - (1 - (y - y0) / h2) * 0.03 * r(), z * k);
      }
      g2.computeVertexNormals();
      crowns.push(strip(g2));
    }
    return { trunk: strip(trunk), crown: mergeGeometries(crowns, false) };
  }
  const whorls = segs(lod, 0, 0, 8, 11, 15), perW = segs(lod, 0, 0, 5, 6, 8), clumps = segs(lod, 0, 0, 3, 5, 7);
  const pos = [], nor = [], uvs = [], idx = [];
  const quad = (a, b, c2, d, nrm) => {
    const o = pos.length / 3;
    for (const [v, u, vv] of [[a, 0.12, 0], [b, 1, 0], [d, 1, 1], [c2, 0.12, 1]]) {
      pos.push(v.x, v.y, v.z);
      nor.push(nrm.x, nrm.y, nrm.z);
      uvs.push(u, vv);
    }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  const up = new THREE20.Vector3(0, 1, 0), tmp = new THREE20.Vector3();
  const branches = [];
  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1), y = 0.4 + t * 0.55;
    const Lb = (0.21 * Math.pow(1 - t, 0.8) + 0.035) * (0.85 + 0.3 * r());
    const a0 = r() * 6.28;
    for (let j = 0; j < perW; j++) {
      const a = a0 + j / perW * 6.283 + (r() - 0.5) * 0.5;
      const d = new THREE20.Vector3(Math.cos(a), -0.12 + 0.45 * t + (r() - 0.5) * 0.2, Math.sin(a)).normalize();
      const p0 = new THREE20.Vector3(0, y, 0), p1 = p0.clone().addScaledVector(d, Lb);
      p1.y -= 0.03 * Lb / 0.2 * (1 - t);
      branches.push(barkStripUV(strip(tube(p0, p1, 45e-4 * (1 - 0.6 * t) + 15e-4, 1e-3, 4, 1))));
      const dir = p1.clone().sub(p0).normalize(), side = tmp.crossVectors(dir, up).normalize().clone(), side2 = new THREE20.Vector3().crossVectors(side, dir).normalize();
      const nrm = new THREE20.Vector3(dir.x, 0.8, dir.z).normalize();
      for (let k = 0; k < clumps; k++) {
        const f = 0.25 + 0.75 * (k / Math.max(1, clumps - 1)), b = p0.clone().lerp(p1, f * 0.85);
        const lc = Lb * (0.38 + 0.15 * r()), wc = lc * (0.6 + 0.2 * r());
        const tip = b.clone().addScaledVector(dir, lc).add(new THREE20.Vector3((r() - 0.5) * 0.02, 0.02 * r(), (r() - 0.5) * 0.02));
        for (const sv of [side, side2]) {
          const h2 = sv.clone().multiplyScalar(wc * 0.5);
          quad(b.clone().sub(h2), b.clone().add(h2), tip.clone().sub(h2), tip.clone().add(h2), nrm);
        }
      }
    }
  }
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * 3.14, sv = new THREE20.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.035);
    const b = new THREE20.Vector3(0, 0.9, 0), tp = new THREE20.Vector3(0, 1.01, 0);
    quad(b.clone().sub(sv), b.clone().add(sv), tp.clone().sub(sv), tp.clone().add(sv), up);
  }
  const cg = new THREE20.BufferGeometry();
  cg.setAttribute("position", new THREE20.Float32BufferAttribute(pos, 3));
  cg.setAttribute("normal", new THREE20.Float32BufferAttribute(nor, 3));
  cg.setAttribute("uv", new THREE20.Float32BufferAttribute(uvs, 2));
  cg.setIndex(idx);
  const crown = mergeGeometries([...branches, strip(cg)], false);
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28, y = 0.15 + r() * 0.22, L = 0.05 + 0.05 * r();
    crowns.push(strip(tube(new THREE20.Vector3(0, y, 0), new THREE20.Vector3(Math.cos(a) * L, y + 0.01 - 0.02 * r(), Math.sin(a) * L), 22e-4, 6e-4, 5, 1)));
  }
  return { trunk: mergeGeometries([strip(trunk), ...crowns], false), crown, cards: true };
}
function bushGeometry(lod, seed = 2) {
  const n = noise3(seed), r = mulberry32(seed);
  const det = segs(lod, 0, 1, 3, 5, 7);
  const blobs = [];
  for (let i = 0; i < 4; i++) {
    const g2 = new THREE20.IcosahedronGeometry(0.32 + r() * 0.12, det);
    const p = g2.attributes.position;
    for (let q = 0; q < p.count; q++) {
      const x = p.getX(q), y = p.getY(q), z = p.getZ(q);
      const k = 1 + 0.45 * n.fbm(x * 4 + i, y * 4, z * 4, 4);
      p.setXYZ(q, x * k, Math.max(-0.05, y * k * 0.75), z * k);
    }
    g2.computeVertexNormals();
    g2.translate((r() - 0.5) * 0.45, 0.32 + r() * 0.12, (r() - 0.5) * 0.45);
    blobs.push(strip(g2));
  }
  const stems = [];
  for (let i = 0; i < (lod >= 2 ? 7 : 2); i++) {
    const a = r() * 6.28;
    stems.push(strip(tube(new THREE20.Vector3(0, 0, 0), new THREE20.Vector3(Math.cos(a) * 0.3, 0.45 + r() * 0.2, Math.sin(a) * 0.3), 0.012, 4e-3, 4, 1)));
  }
  return { trunk: mergeGeometries(stems, false), crown: mergeGeometries(blobs, false) };
}
function pine({ lod = 2, seed = 1, height = 14 }) {
  const { trunk, crown, cards } = pineGeometry(lod, seed);
  const bark = makeMaterial("bark");
  bark.name = "bark";
  const nee = cards ? needleCardMaterial() : makeMaterial("needles", { side: THREE20.DoubleSide });
  nee.name = "needles";
  const u1 = applyChar(bark, { scale: 10 }), u2 = applyChar(nee, { scale: 10 });
  const grp = new THREE20.Group();
  const a = new THREE20.Mesh(trunk, bark), b = new THREE20.Mesh(crown, nee);
  a.castShadow = b.castShadow = true;
  grp.add(a, b);
  grp.scale.setScalar(height);
  grp.userData = { char: [u1, u2] };
  return grp;
}
function bush({ lod = 2, seed = 2, size = 1.4 }) {
  const { trunk, crown } = bushGeometry(lod, seed);
  const tw = makeMaterial("bark");
  tw.name = "twigs";
  const lv = makeMaterial("leaves", { side: THREE20.DoubleSide });
  lv.name = "leaves";
  const u1 = applyChar(tw, { scale: 10 }), u2 = applyChar(lv, { scale: 10 });
  const grp = new THREE20.Group();
  grp.add(new THREE20.Mesh(trunk, tw), new THREE20.Mesh(crown, lv));
  grp.scale.setScalar(size);
  grp.userData = { char: [u1, u2] };
  return grp;
}
var InstancedFlora = class {
  constructor(scene, kind, items, { lodNear = 2, lodMid = null, lodFar = 0, nearDist = 40, nearFrac = 1, seed = 1 } = {}) {
    this.scene = scene;
    this.items = items;
    this.nearDist = nearDist;
    this.rNear = nearDist * Math.min(1, nearFrac);
    const gen = kind === "pine" ? pineGeometry : bushGeometry;
    const mk = (lod) => gen(lod, seed);
    const barkM = makeMaterial("bark");
    barkM.name = kind + "-bark";
    const leafM = makeMaterial(kind === "pine" ? "needles" : "leaves", { side: THREE20.DoubleSide });
    leafM.name = kind + "-leaf";
    applyChar(barkM, { instanced: true, scale: 10 });
    applyChar(leafM, { instanced: true, scale: 10 });
    let cardM = null;
    const leafFor = (geo) => {
      if (!geo.cards) return leafM;
      if (!cardM) {
        cardM = needleCardMaterial();
        applyChar(cardM, { instanced: true, scale: 10 });
      }
      return cardM;
    };
    const N2 = items.length;
    this.aChar = new THREE20.InstancedBufferAttribute(new Float32Array(N2 * 2), 2);
    this.aChar.setUsage(THREE20.DynamicDrawUsage);
    this.meshes = [];
    this.levels = nearFrac < 1 ? ["near", "mid", "far"] : ["near", "far"];
    const lodOf = { near: lodNear, mid: lodMid ?? Math.max(lodFar, lodNear - 2), far: lodFar };
    for (const lvl of this.levels) {
      const geo = mk(lodOf[lvl]);
      for (const [part, mat] of [["trunk", barkM], ["crown", leafFor(geo)]]) {
        const g2 = geo[part].clone();
        g2.setAttribute("aChar", this.aChar);
        const m = new THREE20.InstancedMesh(g2, mat, N2);
        m.castShadow = false;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.userData = { lvl, part };
        m.instanceMatrix.setUsage(THREE20.DynamicDrawUsage);
        scene.add(m);
        this.meshes.push(m);
      }
    }
    const sh = mk(Math.min(1, Math.max(0, lodNear - 2))), shM = new THREE20.MeshBasicMaterial();
    for (const part of ["trunk", "crown"]) {
      const m = new THREE20.InstancedMesh(sh[part].clone(), shM, N2);
      m.castShadow = true;
      m.frustumCulled = false;
      m.layers.set(LAYER_SHADOW);
      m.userData = { lvl: "near", part, shadow: true };
      m.instanceMatrix.setUsage(THREE20.DynamicDrawUsage);
      scene.add(m);
      this.meshes.push(m);
    }
    this.mats = [];
    const mm = new THREE20.Matrix4(), q = new THREE20.Quaternion(), up = new THREE20.Vector3(0, 1, 0);
    for (const it of items) this.mats.push(mm.compose(new THREE20.Vector3(it.x, 0, it.z), q.setFromAxisAngle(up, it.rot || 0), new THREE20.Vector3(it.s, it.s * (it.sy || 1), it.s)).clone());
    this.order = { near: new Uint32Array(N2), mid: new Uint32Array(N2), far: new Uint32Array(N2) };
    this.cnt = { near: 0, mid: 0, far: 0 };
    this.charState = new Float32Array(N2 * 2);
    this.lastUpd = -1;
  }
  setChar(i, c2, glow) {
    this.charState[i * 2] = c2;
    this.charState[i * 2 + 1] = glow;
  }
  update(camera, time) {
    if (time - this.lastUpd > 0.25 || this.lastUpd < 0) {
      this.lastUpd = time;
      const cp = camera.position, rN2 = this.rNear ** 2, rM2 = this.nearDist ** 2, mid = this.levels.length === 3, c2 = { near: 0, mid: 0, far: 0 };
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i], d2 = (it.x - cp.x) ** 2 + (it.z - cp.z) ** 2;
        const l = d2 < rN2 ? "near" : mid && d2 < rM2 ? "mid" : "far";
        this.order[l][c2[l]++] = i;
      }
      this.cnt = c2;
      this.nn = c2.near;
      this.nf = c2.far;
      for (const m of this.meshes) {
        const ord = this.order[m.userData.lvl], cnt = c2[m.userData.lvl];
        for (let k = 0; k < cnt; k++) m.setMatrixAt(k, this.mats[ord[k]]);
        m.count = cnt;
        m.instanceMatrix.needsUpdate = true;
      }
    }
    for (const m of this.meshes) {
      if (m.userData.shadow) continue;
      const ord = this.order[m.userData.lvl], cnt = m.count;
      let a = m.geometry.attributes.aChar;
      if (a === this.aChar) {
        a = new THREE20.InstancedBufferAttribute(new Float32Array(this.items.length * 2), 2);
        a.setUsage(THREE20.DynamicDrawUsage);
        m.geometry.setAttribute("aChar", a);
      }
      for (let k = 0; k < cnt; k++) {
        const i = ord[k];
        a.array[k * 2] = this.charState[i * 2];
        a.array[k * 2 + 1] = this.charState[i * 2 + 1];
      }
      a.needsUpdate = true;
    }
  }
  tris() {
    let t = 0;
    for (const m of this.meshes) if (!m.userData.shadow) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * m.count;
    return Math.round(t);
  }
  dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
  }
};

// src/assets/props2.js
import * as THREE21 from "three";
var V3 = (x, y, z) => new THREE21.Vector3(x, y, z);
function resample2(pts, n) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = [], tot = L[L.length - 1];
  for (let k = 0; k < n; k++) {
    const s = tot * k / (n - 1);
    let i = 1;
    while (i < L.length - 1 && L[i] < s) i++;
    const t = (s - L[i - 1]) / Math.max(L[i] - L[i - 1], 1e-9);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
  }
  return out;
}
var fuelMat = (name = "diesel") => new THREE21.MeshStandardMaterial({ color: 723464, roughness: 0.05, metalness: 0, name });
function lighter({ lod = 2, color = 14173482 }) {
  const grp = new THREE21.Group();
  const W = 0.025, D = 0.012, Hb = 0.062;
  const body = new THREE21.BoxGeometry(W, Hb, D, segs(lod, 1, 2, 6, 16, 48), segs(lod, 1, 2, 8, 24, 80), segs(lod, 1, 2, 4, 12, 32));
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (W / 2), z = p.getZ(i) / (D / 2), k = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25) || 1;
    const m = Math.max(Math.abs(x), Math.abs(z)) / k;
    p.setX(i, p.getX(i) * m);
    p.setZ(i, p.getZ(i) * m);
  }
  body.computeVertexNormals();
  body.translate(0, Hb / 2, 0);
  const plastic = new THREE21.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.82, name: "lighterBody" });
  grp.add(mesh(body, plastic, { name: "body" }));
  const liq = new THREE21.BoxGeometry(W * 0.86, Hb * 0.55, D * 0.7);
  liq.translate(0, Hb * 0.3, 0);
  grp.add(mesh(liq, new THREE21.MeshStandardMaterial({ color: 5903368, roughness: 0.1, name: "butane" }), { name: "butane", cast: false }));
  const steel = makeMaterial("steel");
  steel.name = "lighterSteel";
  const hood = new THREE21.CylinderGeometry(62e-4, 62e-4, 0.017, segs(lod, 6, 10, 24, 64, 160), 1, true);
  hood.scale(1, 1, 0.82);
  hood.translate(-48e-4, Hb + 85e-4, 0);
  steel.side = THREE21.DoubleSide;
  grp.add(mesh(hood, steel, { name: "hood" }));
  const noz = new THREE21.CylinderGeometry(11e-4, 14e-4, 0.011, segs(lod, 4, 6, 10, 20, 48));
  noz.translate(-48e-4, Hb + 55e-4, 0);
  grp.add(mesh(noz, steel, { name: "nozzle" }));
  const ws = segs(lod, 8, 12, 28, 72, 200);
  const wheelG = new THREE21.CylinderGeometry(42e-4, 42e-4, 58e-4, ws, 1);
  wheelG.rotateX(Math.PI / 2);
  if (lod >= 2) {
    const q = wheelG.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const a = Math.atan2(q.getY(i), q.getX(i)), r = Math.hypot(q.getX(i), q.getY(i));
      if (r > 3e-3) {
        const k = 1 + 0.06 * Math.sign(Math.sin(a * ws * 0.5));
        q.setX(i, q.getX(i) * k);
        q.setY(i, q.getY(i) * k);
      }
    }
    wheelG.computeVertexNormals();
  }
  const wheel = mesh(wheelG, steel, { name: "wheel" });
  wheel.position.set(52e-4, Hb + 85e-4, 0);
  grp.add(wheel);
  for (const sz of [-1, 1]) {
    const f = new THREE21.BoxGeometry(8e-3, 0.012, 8e-4);
    f.translate(5e-3, Hb + 5e-3, sz * 36e-4);
    grp.add(mesh(f, steel, { name: "fork" }));
  }
  const lev = new THREE21.BoxGeometry(85e-4, 45e-4, 75e-4);
  lev.translate(78e-4, Hb + 25e-4, 0);
  grp.add(mesh(lev, new THREE21.MeshStandardMaterial({ color: 11541012, roughness: 0.4, name: "lever" }), { name: "lever" }));
  grp.userData = { flameAt: V3(-48e-4, Hb + 0.0115, 0), sparkAt: V3(12e-4, Hb + 95e-4, 0), wheel, H: Hb + 0.017 };
  return grp;
}
function barrelOpen({ lod = 2, paint = "metalBlue", level = 0.8 }) {
  const R = 0.2865, H = 0.88, yl = H * level;
  const rad = segs(lod, 10, 28, 96, 400, 1300), rows = segs(lod, 10, 28, 90, 220, 400);
  const p = [[0, 4e-3], [R - 0.01, 4e-3], [R - 4e-3, 0], [R + 6e-3, 8e-3], [R, 0.02]];
  for (const hy of [0.29, 0.59]) p.push([R, hy - 0.025], [R + 0.012, hy - 0.01], [R + 0.012, hy + 0.01], [R, hy + 0.025]);
  p.push([R, H - 0.02], [R + 7e-3, H - 8e-3], [R + 4e-3, H], [R - 4e-3, H - 2e-3], [R - 6e-3, H - 0.02], [R - 6e-3, yl - 0.01]);
  const g2 = lathe(resample2(p, rows), rad);
  const n = noise3(9);
  if (lod >= 2) displace(g2, (x, y, z) => 2e-3 * n.fbm(x * 9, y * 9, z * 9, 3));
  const m = makeMaterial(paint);
  m.name = paint;
  m.side = THREE21.DoubleSide;
  const u = applyChar(m, { scale: 4, metal: true });
  u.uCharBase.value = yl;
  u.uCharH.value = -(H - yl) * 1.2;
  u.uHeatFall.value = 1.6;
  const grp = new THREE21.Group();
  grp.add(mesh(g2, m, { name: "drum" }));
  const lq = new THREE21.CircleGeometry(R - 7e-3, segs(lod, 10, 24, 64, 200, 600));
  lq.rotateX(-Math.PI / 2);
  lq.translate(0, yl, 0);
  const liquid = mesh(lq, fuelMat(), { name: "liquid", cast: false });
  grp.add(liquid);
  grp.userData = { char: u, H, R, liquidY: yl, liquid };
  return grp;
}
function fuelJet({ lod = 2, v = 3.1, h: h2 = 0.3, r = 45e-4 }) {
  const pts = [], T = Math.sqrt(2 * h2 / 9.81), n = segs(lod, 3, 5, 10, 24, 60);
  for (let i = 0; i <= n; i++) {
    const t = T * i / n;
    pts.push(V3(v * t, h2 - 0.5 * 9.81 * t * t, 0));
  }
  const g2 = new THREE21.TubeGeometry(new THREE21.CatmullRomCurve3(pts), n * 2, r, segs(lod, 3, 5, 8, 12, 24), false);
  const m = new THREE21.MeshStandardMaterial({ color: 3811852, roughness: 0.08, transparent: true, opacity: 0.85, name: "fuelJet" });
  const o = mesh(g2, m, { name: "jet", cast: false });
  o.userData = { reach: v * T };
  return o;
}
function spillStrip({ lod = 2, len = 8, w = 0.6, seed = 5 }) {
  const n = noise3(seed), nu = segs(lod, 6, 16, 60, 200, 600), pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const t = i / nu, x = t * len;
    const half = w / 2 * (0.35 + 0.65 * Math.min(1, t * 3)) * (1 + 0.35 * n.fbm(x * 0.9, 0, seed, 3)) * (t > 0.9 ? Math.sqrt(Math.max(0, (1 - t) / 0.1)) * 0.9 + 0.25 : 1) * (1 + 0.5 * Math.max(0, t - 0.75) * 4 * 0.5);
    const cz = 0.25 * w * n.fbm(x * 0.35, 3.3, seed, 2);
    pos.push(x, 4e-3, cz - half, x, 4e-3, cz + half);
    uv.push(t, 0, t, 1);
    if (i < nu) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const g2 = new THREE21.BufferGeometry();
  g2.setAttribute("position", new THREE21.Float32BufferAttribute(pos, 3));
  g2.setAttribute("uv", new THREE21.Float32BufferAttribute(uv, 2));
  g2.setIndex(idx);
  g2.computeVertexNormals();
  const o = mesh(g2, fuelMat("spill"), { name: "spill", cast: false });
  return o;
}
var CYL_PROFILE = [[0, 0.012], [0.07, 6e-3], [0.098, 0], [0.102, 0.012], [0.102, 0.96], [0.094, 1.02], [0.07, 1.07], [0.04, 1.1], [0.03, 1.115], [0.03, 1.15], [0, 1.15]];
function gasCylinder({ lod = 2 }) {
  const grp = new THREE21.Group();
  const g2 = lathe(resample2(CYL_PROFILE, segs(lod, 8, 18, 48, 140, 320)), segs(lod, 8, 20, 64, 220, 640));
  const m = makeMaterial("acetylene");
  m.name = "cylinder";
  const u = applyChar(m, { scale: 5, metal: true });
  u.uCharBase.value = 0;
  u.uCharH.value = 1.15;
  u.uHeatFall.value = 0.15;
  grp.add(mesh(g2, m, { name: "shell" }));
  const brass = new THREE21.MeshStandardMaterial({ color: 11043886, roughness: 0.35, metalness: 0.9, name: "brass" });
  const valve = new THREE21.CylinderGeometry(0.014, 0.018, 0.06, segs(lod, 5, 8, 14, 32, 80));
  valve.translate(0, 1.18, 0);
  grp.add(mesh(valve, brass, { name: "valve" }));
  const hand = new THREE21.CylinderGeometry(0.03, 0.03, 0.012, segs(lod, 6, 10, 20, 48, 120));
  hand.translate(0, 1.215, 0);
  grp.add(mesh(hand, brass, { name: "handwheel" }));
  const out = new THREE21.CylinderGeometry(8e-3, 8e-3, 0.035, segs(lod, 4, 6, 10, 20, 48));
  out.rotateZ(Math.PI / 2);
  out.translate(0.03, 1.18, 0);
  grp.add(mesh(out, brass, { name: "outlet" }));
  grp.userData = { char: u, H: 1.15, R: 0.102 };
  return grp;
}
function cylinderFragments({ lod = 2, seed = 3 }) {
  const r = mulberry32(seed), n = noise3(seed);
  const m = makeMaterial("steel");
  m.name = "cylBurnt";
  m.side = THREE21.DoubleSide;
  m.metalness = 0.6;
  m.roughness = 0.6;
  const u = applyChar(m, { scale: 6, metal: true });
  u.uTmax.value = 1e3;
  u.uTnow.value = 900;
  u.uSoot.value = 0.5;
  u.uHeatFall.value = 0.1;
  const rad = segs(lod, 8, 16, 48, 160, 480), parts = [];
  const jag = (g2, yEdge, amp) => {
    const p = g2.attributes.position;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - yEdge) < 1e-4) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      p.setY(i, yEdge + amp * (n.fbm(Math.cos(a) * 3, Math.sin(a) * 3, seed, 3) + 0.4 * Math.sin(a * 5)));
    }
    g2.computeVertexNormals();
    return g2;
  };
  const bottom = new THREE21.Group();
  bottom.add(mesh(jag(new THREE21.CylinderGeometry(0.102, 0.102, 0.5, rad, segs(lod, 1, 2, 6, 16, 40), true).translate(0, 0.25, 0), 0.5, 0.09), m, { name: "bottom" }));
  const disc = new THREE21.CircleGeometry(0.1, rad);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, 5e-3, 0);
  bottom.add(mesh(disc, m, { name: "base" }));
  const top = new THREE21.Group();
  top.add(mesh(jag(lathe(resample2([[0.102, 0], [0.102, 0.2], [0.094, 0.26], [0.07, 0.31], [0.04, 0.34], [0.03, 0.355], [0.03, 0.39], [0, 0.39]], segs(lod, 6, 10, 24, 60, 140)), rad), 0, 0.07), m, { name: "top" }));
  parts.push(bottom, top);
  for (let i = 0; i < 3; i++) {
    const g2 = new THREE21.CylinderGeometry(0.102, 0.102, 0.22 + 0.15 * r(), segs(lod, 3, 5, 12, 32, 90), segs(lod, 1, 2, 5, 12, 30), true, r() * 6.28, 0.9 + 0.8 * r());
    const p = g2.attributes.position;
    const tw = (r() - 0.5) * 3;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k), a = y * tw, x = p.getX(k), z = p.getZ(k);
      p.setX(k, x * Math.cos(a) - z * Math.sin(a));
      p.setZ(k, x * Math.sin(a) + z * Math.cos(a));
    }
    g2.computeVertexNormals();
    const pl = new THREE21.Group();
    pl.add(mesh(g2, m, { name: "plate" }));
    parts.push(pl);
  }
  return { parts, char: u };
}
function plankMat(scale = 8) {
  const m = makeMaterial("woodPlank");
  m.name = "plank";
  const u = applyChar(m, { scale, alligator: [10, 14] });
  return { m, u };
}
function pallet({ lod = 2 }) {
  const { m, u } = plankMat(8), parts = [], s = segs(lod, 1, 1, 2, 6, 16);
  const box2 = (w, h2, d, x, y, z) => {
    const g2 = new THREE21.BoxGeometry(w, h2, d, s * 2, 1, s);
    g2.translate(x, y, z);
    parts.push([g2, m]);
  };
  for (const z of [-0.3275, -0.165, 0, 0.165, 0.3275]) box2(1.2, 0.022, z === 0 || Math.abs(z) > 0.3 ? 0.145 : 0.1, 0, 0.133, z);
  for (const x of [-0.5275, 0, 0.5275]) {
    box2(0.145, 0.022, 0.8, x, 0.111, 0);
    for (const z of [-0.3275, 0, 0.3275]) box2(0.145, 0.078, 0.1, x, 0.061, z);
  }
  for (const z of [-0.35, 0, 0.35]) box2(1.2, 0.022, 0.1, 0, 0.011, z);
  const grp = mergeByMaterial(parts, "pallet");
  u.uCharBase.value = 0;
  u.uCharH.value = 0.3;
  grp.userData = { char: u, mass: 22, area: 3.5, size: 1.2 };
  return grp;
}
function crate({ lod = 2, s = 0.6 }) {
  const { m, u } = plankMat(10), parts = [], q = segs(lod, 1, 1, 2, 6, 16), t = 0.018, nb = 4;
  const box2 = (w, h2, d, x, y, z) => {
    const g2 = new THREE21.BoxGeometry(w, h2, d, q, q, q);
    g2.translate(x, y, z);
    parts.push([g2, m]);
  };
  for (let i = 0; i < nb; i++) {
    const y = s / nb * (i + 0.5);
    for (const sg of [-1, 1]) {
      box2(s, s / nb - 8e-3, t, 0, y, sg * (s / 2 - t / 2));
      box2(t, s / nb - 8e-3, s - 2 * t, sg * (s / 2 - t / 2), y, 0);
    }
  }
  box2(s - 2 * t, t, s - 2 * t, 0, t / 2, 0);
  box2(s, t, s, 0, s + t / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box2(0.04, s, 0.04, sx * (s / 2 + 2e-3), s / 2, sz * (s / 2 + 2e-3));
  const grp = mergeByMaterial(parts, "crate");
  u.uCharBase.value = 0;
  u.uCharH.value = s;
  grp.userData = { char: u, mass: 9 * (s / 0.6) ** 2, area: 2.2 * (s / 0.6) ** 2 * 1, size: s };
  return grp;
}

// src/assets/props3.js
import * as THREE22 from "three";
var V32 = (x, y, z) => new THREE22.Vector3(x, y, z);
var std = (color, rough = 0.6, metal = 0, name = "") => new THREE22.MeshStandardMaterial({ color, roughness: rough, metalness: metal, name });
var gunMetal = () => {
  const m = makeMaterial("steel");
  m.name = "gunmetal";
  m.color = new THREE22.Color(2763824);
  m.metalness = 0.75;
  m.roughness = 0.45;
  return m;
};
var box = (parts, m, w, h2, d, x, y, z, rx = 0, rz = 0) => {
  const g2 = new THREE22.BoxGeometry(w, h2, d);
  if (rx) g2.rotateX(rx);
  if (rz) g2.rotateZ(rz);
  g2.translate(x, y, z);
  parts.push([g2, m]);
};
function pistol({ lod = 2 }) {
  const gm = gunMetal(), pol = std(1645084, 0.75, 0.1, "polymer"), wood = makeMaterial("woodPlank"), parts = [], H = 0.2;
  box(parts, gm, 0.185, 0.026, 0.026, 0, H + 0.02, 0);
  box(parts, pol, 0.16, 0.022, 0.028, -8e-3, H - 4e-3, 0);
  box(parts, pol, 0.036, 0.1, 0.03, -0.062, H - 0.06, 0, 0, 0.28);
  box(parts, pol, 0.05, 4e-3, 0.012, -0.012, H - 0.04, 0);
  parts.push([tube(V32(0.05, H + 0.017, 0), V32(0.096, H + 0.017, 0), 75e-4, 75e-4, segs(lod, 6, 8, 14, 28, 64)), gm]);
  box(parts, wood, 0.16, 0.04, 0.09, -0.03, 0.02, 0);
  box(parts, wood, 0.05, H - 0.1, 0.05, -0.062, (H - 0.1) / 2 + 0.03, 0);
  const g2 = mergeByMaterial(parts, "pistol");
  g2.userData = { muzzle: V32(0.097, H + 0.017, 0), dir: V32(1, 0, 0), eject: V32(0, H + 0.035, 0.014) };
  return g2;
}
function machineGun({ lod = 2 }) {
  const gm = gunMetal(), barrelM = gunMetal();
  barrelM.name = "barrel";
  const u = applyChar(barrelM, { scale: 9, metal: true });
  u.uCharBase.value = 0;
  u.uCharH.value = 3;
  u.uSoot.value = 0;
  u.uHeatFall.value = 0.02;
  const olive = makeMaterial("metalOlive"), wood = std(4863268, 0.7, 0, "stock"), brass = std(11569717, 0.35, 0.9, "brass"), parts = [], H = 0.42, rs = segs(lod, 6, 8, 16, 36, 90);
  box(parts, gm, 0.5, 0.075, 0.055, -0.1, H, 0);
  box(parts, gm, 0.3, 0.012, 0.06, -0.1, H + 0.044, 0);
  parts.push([tube(V32(0.15, H + 5e-3, 0), V32(0.7, H + 5e-3, 0), 0.014, 0.012, rs, segs(lod, 1, 2, 4, 10, 24)), barrelM]);
  parts.push([tube(V32(0.7, H + 5e-3, 0), V32(0.78, H + 5e-3, 0), 0.016, 0.019, rs), barrelM]);
  parts.push([tube(V32(0.15, H - 0.025, 0), V32(0.45, H - 0.025, 0), 9e-3, 9e-3, Math.max(5, rs >> 1)), gm]);
  box(parts, wood, 0.28, 0.07, 0.04, -0.48, H - 0.01, 0, 0, -0.08);
  box(parts, gm, 0.03, 0.09, 0.03, -0.2, H - 0.075, 0, 0, 0.2);
  box(parts, olive, 0.2, 0.13, 0.09, -0.08, H - 0.11, 0.09);
  for (let i = 0; i < segs(lod, 0, 4, 8, 12, 12); i++) parts.push([tube(V32(-0.1 + i * 0.012, H + 0.02 - i * 4e-3, 0.035), V32(-0.1 + i * 0.012, H + 0.02 - i * 4e-3, 0.09), 55e-4, 55e-4, 6), brass]);
  for (const [dx, dz] of [[0.5, 0], [-0.3, 0.32], [-0.3, -0.32]]) parts.push([tube(V32(0.05, H - 0.04, 0), V32(0.05 + dx, 0, dz), 0.013, 0.011, Math.max(5, rs >> 1)), olive]);
  const g2 = mergeByMaterial(parts, "machineGun");
  g2.userData = { muzzle: V32(0.785, H + 5e-3, 0), dir: V32(1, 0, 0), eject: V32(-0.05, H - 0.03, -0.035), char: u, barrelLen: 0.63 };
  return g2;
}
function fieldGun({ lod = 2, elev = 0.05 }) {
  const olive = makeMaterial("metalOlive"), gm = gunMetal(), rub = makeMaterial("rubber"), parts = [], H = 1.15, rs = segs(lod, 8, 12, 24, 56, 140);
  const c2 = Math.cos(elev), s = Math.sin(elev), P = (d) => V32(d * c2, H + d * s, 0);
  parts.push([tube(P(-0.6), P(5.4), 0.115, 0.085, rs, segs(lod, 1, 2, 6, 14, 30)), olive]);
  parts.push([tube(P(2.6), P(3.2), 0.13, 0.13, rs), olive]);
  parts.push([tube(P(5.35), P(5.4), 0.095, 0.095, rs), gm]);
  box(parts, olive, 0.9, 0.42, 0.42, -0.75 * c2, H - 0.75 * s, 0, 0, elev);
  box(parts, olive, 1.5, 0.3, 0.5, 0.3, H - 0.32, 0);
  box(parts, olive, 0.05, 1.25, 2.1, 0.75, H + 0.05, 0, 0, -0.18);
  for (const sz of [-1, 1]) {
    const w = new THREE22.CylinderGeometry(0.46, 0.46, 0.24, segs(lod, 8, 12, 24, 48, 96));
    w.rotateX(Math.PI / 2);
    w.translate(0.2, 0.46, sz * 0.95);
    parts.push([w, rub]);
    parts.push([tube(V32(-0.2, H - 0.45, sz * 0.3), V32(-3.6, 0.12, sz * 1.1), 0.075, 0.06, Math.max(6, rs >> 1)), olive]);
    box(parts, olive, 0.4, 0.3, 0.06, -3.7, 0.15, sz * 1.12);
  }
  parts.push([tube(V32(0.2, 0.46, -0.95), V32(0.2, 0.46, 0.95), 0.06, 0.06, 8), gm]);
  const g2 = mergeByMaterial(parts, "fieldGun");
  g2.userData = { muzzle: P(5.42), dir: V32(c2, s, 0), breech: P(-1.2) };
  return g2;
}
var SHELL = [[0, 0], [0.074, 0], [0.0775, 0.02], [0.0775, 0.42], [0.072, 0.5], [0.05, 0.6], [0.022, 0.68], [8e-3, 0.7], [0, 0.7]];
function shell({ lod = 2 }) {
  const m = makeMaterial("metalOlive");
  m.name = "shell";
  const u = applyChar(m, { scale: 8, metal: true });
  u.uCharBase.value = 0;
  u.uCharH.value = 0.7;
  const g2 = new THREE22.Group();
  g2.add(mesh(lathe(SHELL, segs(lod, 6, 10, 20, 48, 120)), m, { name: "shell" }));
  const band = lathe([[0.0785, 0.05], [0.0795, 0.055], [0.0795, 0.075], [0.0785, 0.08]], segs(lod, 6, 10, 20, 48, 120));
  g2.add(mesh(band, std(12088115, 0.4, 0.9, "band"), { name: "band" }));
  g2.userData = { char: u, H: 0.7, R: 0.0775 };
  return g2;
}
function shellStack({ lod = 2, n = 3, seed = 1 }) {
  const grp = new THREE22.Group(), wood = makeMaterial("woodPlank"), parts = [], r = mulberry32(seed), shells = [];
  box(parts, wood, 0.2 * n + 0.1, 0.1, 0.2 * n + 0.1, 0, 0.05, 0);
  grp.add(mergeByMaterial(parts, "stackBase"));
  let char = null;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const s = shell({ lod: Math.min(lod, 2) });
    s.position.set((i - (n - 1) / 2) * 0.19, 0.1, (j - (n - 1) / 2) * 0.19);
    s.rotation.y = r() * 6;
    grp.add(s);
    shells.push(s);
    char = char || s.userData.char;
  }
  grp.userData = { shells, char, n: n * n };
  return grp;
}
function molotov({ lod = 2 }) {
  const glass = new THREE22.MeshStandardMaterial({ color: 3099174, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.75, name: "bottle" });
  const g2 = new THREE22.Group();
  g2.add(mesh(lathe([[0, 0], [0.036, 0], [0.038, 0.01], [0.038, 0.16], [0.03, 0.2], [0.015, 0.24], [0.014, 0.29], [0.016, 0.3]], segs(lod, 6, 10, 20, 40, 96)), glass, { name: "bottle" }));
  const rag = blob(0.02, segs(lod, 0, 1, 2, 3, 4), 4, 0.5, [0.8, 2.2, 0.8]);
  rag.translate(0, 0.325, 0);
  g2.add(mesh(rag, std(14209728, 0.95, 0, "rag"), { name: "rag" }));
  g2.userData = { wick: V32(0, 0.36, 0), volumeL: 0.7 };
  return g2;
}
function flamethrower({ lod = 2 }) {
  const olive = makeMaterial("metalOlive"), gm = gunMetal(), parts = [], rs = segs(lod, 6, 10, 18, 40, 96);
  for (const z of [-0.09, 0.09]) parts.push([lathe([[0, 0.25], [0.07, 0.26], [0.08, 0.3], [0.08, 0.72], [0.06, 0.78], [0, 0.8]], rs).translate(-0.5, 0, z), olive]);
  parts.push([new THREE22.SphereGeometry(0.06, rs, Math.max(4, rs >> 1)).translate(-0.5, 0.86, 0), olive]);
  for (const [x, z] of [[-0.65, -0.2], [-0.65, 0.2], [-0.3, 0]]) parts.push([tube(V32(-0.5, 0.3, 0), V32(x, 0, z), 0.012, 0.012, 6), gm]);
  parts.push([tube(V32(-0.42, 0.7, 0), V32(0.1, 1, 0), 0.012, 0.012, 6), gm]);
  parts.push([tube(V32(0.1, 1, 0), V32(0.75, 1.02, 0), 0.016, 0.014, rs), gm]);
  parts.push([tube(V32(0.75, 1.02, 0), V32(0.8, 1.02, 0), 0.022, 0.022, rs), gm]);
  parts.push([tube(V32(0.45, 0.6, 0), V32(0.45, 1, 0), 0.012, 0.012, 6), gm]);
  box(parts, gm, 0.3, 0.02, 0.3, 0.45, 0.01, 0);
  parts.push([tube(V32(0.45, 0, 0), V32(0.45, 0.6, 0), 0.015, 0.015, 6), gm]);
  const g2 = mergeByMaterial(parts, "flamethrower");
  g2.userData = { muzzle: V32(0.81, 1.02, 0), dir: V32(1, 0.03, 0).normalize() };
  return g2;
}
function nozzle({ lod = 2, elev = 0.25 }) {
  const red = makeMaterial("metalRed"), gm = gunMetal(), hose = std(13617332, 0.9, 0, "hose"), parts = [], rs = segs(lod, 6, 8, 14, 28, 64), c2 = Math.cos(elev), s = Math.sin(elev);
  parts.push([tube(V32(0, 0.9, 0), V32(0.35 * c2, 0.9 + 0.35 * s, 0), 0.03, 0.018, rs), red]);
  for (const [x, z] of [[-0.4, -0.3], [-0.4, 0.3], [0.35, 0]]) parts.push([tube(V32(0, 0.88, 0), V32(x, 0, z), 0.012, 0.012, 6), gm]);
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(V32(-t * 2.6, 0.9 * (1 - t) ** 2 + 0.035, 0.5 * Math.sin(t * 5) * t));
  }
  parts.push([new THREE22.TubeGeometry(new THREE22.CatmullRomCurve3(pts), segs(lod, 6, 10, 20, 40, 80), 0.032, Math.max(5, rs >> 1), false), hose]);
  const g2 = mergeByMaterial(parts, "nozzle");
  g2.userData = { muzzle: V32(0.36 * c2, 0.9 + 0.36 * s, 0), dir: V32(c2, s, 0) };
  return g2;
}
function crackTexture(seed, n = 26) {
  const S = 512, cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(S, S) : Object.assign(document.createElement("canvas"), { width: S, height: S });
  const g2 = cv.getContext("2d"), r = mulberry32(seed);
  g2.clearRect(0, 0, S, S);
  g2.strokeStyle = "rgba(235,245,250,0.9)";
  g2.lineCap = "round";
  const cx = S * (0.3 + 0.4 * r()), cy = S * (0.05 + 0.2 * r());
  for (let i = 0; i < n; i++) {
    let x = cx + (r() - 0.5) * 30, y = cy, a = Math.PI * (0.1 + 0.8 * r());
    g2.lineWidth = 0.8 + 1.6 * r();
    g2.beginPath();
    g2.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a) * S * 0.07;
      y += Math.sin(a) * S * 0.07;
      g2.lineTo(x, y);
      if (r() < 0.12) {
        g2.stroke();
        g2.beginPath();
        g2.moveTo(x, y);
        a += (r() - 0.5) * 2;
      }
    }
    g2.stroke();
  }
  const t = new THREE22.CanvasTexture(cv);
  t.colorSpace = THREE22.SRGBColorSpace;
  return t;
}
function glassPane({ w = 1.2, h: h2 = 1.4, seed = 3 }) {
  const grp = new THREE22.Group();
  const gm = new THREE22.MeshStandardMaterial({ color: 9417668, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.22, side: THREE22.DoubleSide, name: "glass", depthWrite: false });
  const cm = new THREE22.MeshBasicMaterial({ map: crackTexture(seed), transparent: true, opacity: 0, side: THREE22.DoubleSide, depthWrite: false, name: "cracks" });
  const pane = new THREE22.Mesh(new THREE22.PlaneGeometry(w, h2), gm), cr = new THREE22.Mesh(new THREE22.PlaneGeometry(w, h2), cm);
  cr.position.z = 2e-3;
  cr.renderOrder = 2;
  grp.add(pane, cr);
  grp.userData = { w, h: h2, setCrack: (k) => {
    cm.opacity = Math.min(1, k);
  }, setSoot: (k) => {
    gm.color.setRGB(0.56 * (1 - 0.9 * k), 0.7 * (1 - 0.9 * k), 0.77 * (1 - 0.9 * k));
    gm.opacity = 0.22 + 0.7 * k;
  } };
  return grp;
}
function room({ lod = 2, w = 4, d = 3.5, H = 2.6, win = [1.2, 1.4], sill = 0.9, open = false, wallT = 0.25 }) {
  const pl = makeMaterial("plaster"), fl = makeMaterial("woodPlank"), parts = [], [ww, wh] = win, zf = d / 2;
  const B = (m, sx, sy, sz, x, y, z2) => {
    const g3 = new THREE22.BoxGeometry(sx, sy, sz, segs(lod, 1, 1, 2, 4, 8), segs(lod, 1, 1, 2, 4, 8), 1);
    g3.translate(x, y, z2);
    parts.push([g3, m]);
  };
  B(fl, w, 0.06, d, 0, 0.03, 0);
  B(pl, w + 2 * wallT, 0.18, d + 2 * wallT, 0, H + 0.09, 0);
  B(pl, wallT, H, d, -w / 2 - wallT / 2, H / 2, 0);
  B(pl, wallT, H, d, w / 2 + wallT / 2, H / 2, 0);
  if (!open) B(pl, w + 2 * wallT, H, wallT, 0, H / 2, -zf - wallT / 2);
  const z = zf + wallT / 2, top = sill + wh, side = (w + 2 * wallT - ww) / 2;
  B(pl, w + 2 * wallT, sill, wallT, 0, sill / 2, z);
  B(pl, w + 2 * wallT, H - top, wallT, 0, top + (H - top) / 2, z);
  B(pl, side, wh, wallT, -(ww + side) / 2, sill + wh / 2, z);
  B(pl, side, wh, wallT, (ww + side) / 2, sill + wh / 2, z);
  const fr = std(15263455, 0.6, 0, "frame");
  B(fr, ww, 0.05, 0.08, 0, sill + 0.025, z);
  B(fr, ww, 0.05, 0.08, 0, top - 0.025, z);
  B(fr, 0.05, wh, 0.08, -ww / 2 + 0.025, sill + wh / 2, z);
  B(fr, 0.05, wh, 0.08, ww / 2 - 0.025, sill + wh / 2, z);
  const g2 = mergeByMaterial(parts, "room");
  g2.userData = { window: { cx: 0, cy: sill + wh / 2, w: ww, h: wh, z: zf + wallT }, front: zf + wallT, H, w, d, wallT };
  return g2;
}
function wall({ lod = 2, w = 4, h: h2 = 3, t = 0.3, mat = "plaster" }) {
  const g2 = new THREE22.BoxGeometry(w, h2, t, segs(lod, 1, 2, 4, 8, 16), segs(lod, 1, 2, 4, 8, 16), 1);
  g2.translate(0, h2 / 2, 0);
  const grp = new THREE22.Group();
  grp.add(mesh(g2, makeMaterial(mat), { name: "wall" }));
  grp.userData = { w, h: h2, t };
  return grp;
}
function aluWheel({ lod = 2 }) {
  const m = new THREE22.MeshStandardMaterial({ color: 13225168, roughness: 0.32, metalness: 0.95, name: "alu" });
  const rs = segs(lod, 8, 14, 28, 64, 160), parts = [];
  parts.push([lathe([[0.17, 0], [0.205, 0], [0.212, 0.015], [0.2, 0.03], [0.2, 0.17], [0.212, 0.185], [0.205, 0.2], [0.185, 0.2], [0.185, 0.17], [0.18, 0.05], [0.17, 0.03]], rs), m]);
  parts.push([new THREE22.CylinderGeometry(0.055, 0.06, 0.05, rs).translate(0, 0.16, 0), m]);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * 6.2832, g3 = new THREE22.BoxGeometry(0.14, 0.022, 0.045);
    g3.translate(0.115, 0.165, 0);
    g3.rotateY(a);
    parts.push([g3, m]);
  }
  const g2 = mergeByMaterial(parts, "aluWheel");
  g2.userData = { R: 0.21, H: 0.2, mat: m };
  return g2;
}
function meltPuddle({ lod = 2, R = 0.4, seed = 7 }) {
  const g2 = blob(1, segs(lod, 1, 2, 3, 4, 5), seed, 0.35, [1, 0.03, 1]);
  const m = new THREE22.MeshStandardMaterial({ color: 12567496, roughness: 0.22, metalness: 1, name: "aluMelt", emissive: 0 });
  const o = mesh(g2, m, { name: "puddle" });
  o.scale.setScalar(1e-3);
  o.userData = { R, mat: m };
  return o;
}
function propaneCylinder({ lod = 2, burner = true }) {
  const m = makeMaterial("steel");
  m.color = new THREE22.Color(9279910);
  m.name = "lpg";
  const u = applyChar(m, { scale: 5, metal: true });
  u.uCharBase.value = 0;
  u.uCharH.value = 0.6;
  u.uHeatFall.value = 0.2;
  const g2 = new THREE22.Group(), rs = segs(lod, 8, 12, 24, 56, 140), gm = gunMetal();
  g2.add(mesh(lathe([[0, 0.03], [0.13, 0.03], [0.15, 0.06], [0.152, 0.1], [0.152, 0.42], [0.14, 0.5], [0.09, 0.55], [0.03, 0.57], [0, 0.57]], rs), m, { name: "shell" }));
  g2.add(mesh(lathe([[0.12, 0], [0.135, 0], [0.135, 0.04], [0.12, 0.04]], rs), m, { name: "foot" }));
  g2.add(mesh(lathe([[0.1, 0.52], [0.11, 0.52], [0.11, 0.64], [0.1, 0.64]], rs, Math.PI * 1.5), m, { name: "collar" }));
  g2.add(mesh(new THREE22.CylinderGeometry(0.018, 0.022, 0.06, Math.max(6, rs >> 1)).translate(0, 0.6, 0), std(11043886, 0.35, 0.9, "brass"), { name: "valve" }));
  const ud = { char: u, H: 0.57, R: 0.152, valve: V32(0, 0.63, 0) };
  if (burner) {
    const pts = [V32(0.02, 0.6, 0), V32(0.25, 0.45, 0.1), V32(0.5, 0.06, 0.2), V32(0.9, 0.04, 0.1), V32(1.15, 0.3, 0)];
    g2.add(mesh(new THREE22.TubeGeometry(new THREE22.CatmullRomCurve3(pts), segs(lod, 6, 10, 20, 40, 80), 8e-3, 6, false), std(13657370, 0.8, 0, "hose"), { name: "hose" }));
    g2.add(mesh(tube(V32(1.15, 0.3, 0), V32(1.3, 0.62, 0), 0.01, 0.01, 6), gm, { name: "lance" }));
    g2.add(mesh(tube(V32(1.3, 0.62, 0), V32(1.34, 0.72, 0), 0.02, 0.03, Math.max(6, rs >> 1), 1, true), gm, { name: "burner" }));
    for (const [x, z] of [[1, -0.2], [1, 0.2], [1.4, 0]]) g2.add(mesh(tube(V32(1.22, 0.45, 0), V32(x, 0, z), 8e-3, 8e-3, 5), gm, { name: "leg" }));
    ud.nozzle = V32(1.345, 0.73, 0);
    ud.dir = V32(0.37, 0.93, 0).normalize();
  }
  g2.userData = ud;
  return g2;
}
function mortarRack({ lod = 2, n = 3, cal = 100 }) {
  const wood = makeMaterial("woodPlank"), hd = std(1842206, 0.7, 0.1, "hdpe"), parts = [], r = cal / 2e3 + 6e-3, L = cal * 6e-3 + 0.2, tubes = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (2 * r + 0.08);
    parts.push([tube(V32(x, 0.05, 0), V32(x, 0.05 + L, 0), r, r, segs(lod, 8, 10, 18, 40, 96), 1, true), hd]);
    tubes.push(V32(x, 0.06 + L, 0));
  }
  const W = n * (2 * r + 0.08) + 0.1;
  box(parts, wood, W, 0.05, 0.4, 0, 0.025, 0);
  box(parts, wood, W, 0.06, 0.03, 0, L * 0.5, r + 0.03);
  box(parts, wood, W, 0.06, 0.03, 0, L * 0.5, -r - 0.03);
  const g2 = mergeByMaterial(parts, "mortarRack");
  g2.userData = { tubes, L };
  return g2;
}
function thermitePot({ lod = 2 }) {
  const terra = std(11097133, 0.9, 0, "terracotta"), mix = std(5912102, 1, 0, "thermite"), brick = makeMaterial("brick"), g2 = new THREE22.Group(), rs = segs(lod, 8, 12, 24, 56, 140);
  const st = makeMaterial("steel");
  st.name = "plate";
  const u = applyChar(st, { scale: 7, metal: true });
  u.uCharBase.value = 0;
  u.uCharH.value = 0.5;
  u.uSoot.value = 0;
  g2.add(mesh(new THREE22.BoxGeometry(0.5, 8e-3, 0.5).translate(0, 0.134, 0), st, { name: "plate" }));
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g2.add(mesh(new THREE22.BoxGeometry(0.1, 0.065, 0.2).translate(x, 0.0325, z), brick, { name: "brick" }), mesh(new THREE22.BoxGeometry(0.1, 0.065, 0.2).translate(x, 0.0975, z), brick, { name: "brick" }));
  const pot = lathe([[0.012, 0.55], [0.05, 0.55], [0.085, 0.69], [0.092, 0.69], [0.092, 0.7], [0.078, 0.7], [0.045, 0.565], [0.012, 0.565]], rs);
  g2.add(mesh(pot, terra, { name: "pot" }));
  g2.add(mesh(new THREE22.CylinderGeometry(0.072, 0.05, 0.1, rs).translate(0, 0.62, 0), mix, { name: "mix" }));
  for (const [x, z] of [[-0.11, -0.11], [0.11, -0.11], [0, 0.14]]) g2.add(mesh(tube(V32(x * 0.6, 0.6, z * 0.6), V32(x * 1.6, 0.138, z * 1.6), 6e-3, 6e-3, 5), gunMetal(), { name: "stand" }));
  g2.userData = { top: V32(0, 0.68, 0), drip: V32(0, 0.54, 0), plateY: 0.14, char: u };
  return g2;
}
function sack({ lod = 2, seed = 5 }) {
  const g2 = blob(0.3, segs(lod, 1, 2, 3, 4, 5), seed, 0.12, [1.25, 0.55, 0.8]);
  g2.translate(0, 0.16, 0);
  const o = new THREE22.Group();
  o.add(mesh(g2, std(14274484, 0.95, 0, "sack"), { name: "sack" }));
  o.userData = { mass: 25 };
  return o;
}
function figure({ lod = 2 }) {
  const m = std(7304314, 0.85, 0, "figure"), parts = [], rs = segs(lod, 5, 8, 12, 20, 32);
  parts.push([new THREE22.SphereGeometry(0.11, rs, rs).translate(0, 1.69, 0), m]);
  parts.push([new THREE22.CapsuleGeometry(0.17, 0.42, 2, rs).translate(0, 1.25, 0), m]);
  for (const s of [-1, 1]) {
    parts.push([new THREE22.CapsuleGeometry(0.075, 0.72, 2, rs).translate(s * 0.1, 0.44, 0), m]);
    parts.push([new THREE22.CapsuleGeometry(0.055, 0.55, 2, rs).translate(s * 0.26, 1.2, 0), m]);
  }
  const g2 = mergeByMaterial(parts, "figure");
  g2.userData = { H: 1.8 };
  return g2;
}

// src/assets/index.js
var ASSETS = [
  { id: "candle", name: "Sv\xED\u010Dka v mosazn\xE9m sv\xEDcnu", build: candle, size: 0.14, cat: "rekvizity" },
  { id: "torch", name: "Lou\u010D v \u017Eelezn\xE9m dr\u017E\xE1ku", build: torch, size: 0.9, cat: "rekvizity" },
  { id: "campfireS", name: "Oh\xFDnek (mal\xE9 ohni\u0161t\u011B)", build: (o) => campfire({ ...o, size: "small" }), size: 0.7, cat: "ohni\u0161t\u011B" },
  { id: "campfire", name: "T\xE1bor\xE1k (ohni\u0161t\u011B, t\xFDp\xED)", build: (o) => campfire({ ...o, size: "medium" }), size: 1.5, cat: "ohni\u0161t\u011B" },
  { id: "bonfire", name: "Velk\xE1 hranice", build: (o) => campfire({ ...o, size: "large" }), size: 2.4, cat: "ohni\u0161t\u011B" },
  { id: "tire", name: "Pneumatika 205/55 R16 s diskem", build: tire, size: 0.7, cat: "rekvizity" },
  { id: "tirePile", name: "Hromada 5 pneumatik", build: tirePile, size: 1.2, cat: "rekvizity" },
  { id: "barrel", name: "Sud 200 l (ocel, lakovan\xFD)", build: barrel, size: 1, cat: "rekvizity" },
  { id: "grenade", name: "Ru\u010Dn\xED gran\xE1t (typ M67)", build: grenade, size: 0.1, cat: "v\xFDbu\u0161niny" },
  { id: "tntDrum", name: "Sud 1 t TNT na palet\u011B", build: tntDrum, size: 1.4, cat: "v\xFDbu\u0161niny" },
  { id: "acetylene", name: "PE s\xE1\u010Dek C\u2082H\u2082+O\u2082 a l\xE1hev", build: acetyleneBag, size: 1.4, cat: "v\xFDbu\u0161niny" },
  { id: "grinder", name: "\xDAhlov\xE1 bruska na nosn\xEDku IPE", build: grinderRig, size: 1.3, cat: "rekvizity" },
  { id: "puddle", name: "Lou\u017Ee nafty s kanystrem", build: puddle, size: 4.4, cat: "kapaliny" },
  { id: "strawStack", name: "Stoh sl\xE1my (velk\xE9 bal\xEDky)", build: strawStack, size: 6, cat: "velk\xE9" },
  { id: "car", name: "Osobn\xED auto (sedan)", build: car, size: 5, cat: "velk\xE9" },
  { id: "house", name: "Venkovsk\xFD d\u016Fm", build: house, size: 12, cat: "velk\xE9" },
  { id: "lighter", name: "Plynov\xFD zapalova\u010D (k\u0159esac\xED)", build: lighter, size: 0.09, cat: "rekvizity" },
  { id: "barrelOpen", name: "Sud 200 l bez v\xEDka s naftou", build: barrelOpen, size: 1, cat: "kapaliny" },
  { id: "gasCylinder", name: "Acetylenov\xE1 l\xE1hev 50 l", build: gasCylinder, size: 1.3, cat: "v\xFDbu\u0161niny" },
  { id: "pallet", name: "Europaleta", build: pallet, size: 1.3, cat: "rekvizity" },
  { id: "crate", name: "D\u0159ev\u011Bn\xE1 bedna 0,6 m", build: crate, size: 0.8, cat: "rekvizity" },
  { id: "pine", name: "Borovice 14 m", build: pine, size: 15, cat: "vegetace" },
  { id: "bush", name: "Such\xFD ke\u0159", build: bush, size: 1.6, cat: "vegetace" },
  // iterace 7
  { id: "pistol", name: "Pistole 9 mm ve stolici", build: pistol, size: 0.35, cat: "zbran\u011B" },
  { id: "machineGun", name: "Kulomet 7,62 mm na trojno\u017Ece", build: machineGun, size: 1.5, cat: "zbran\u011B" },
  { id: "fieldGun", name: "Kan\xF3n 125 mm na lafet\u011B", build: fieldGun, size: 8, cat: "zbran\u011B" },
  { id: "shellStack", name: "Paleta d\u011Blost\u0159eleck\xFDch gran\xE1t\u016F", build: shellStack, size: 1.2, cat: "v\xFDbu\u0161niny" },
  { id: "molotov", name: "Z\xE1paln\xE1 l\xE1hev", build: molotov, size: 0.4, cat: "zbran\u011B" },
  { id: "flamethrower", name: "Plamenomet na stojanu", build: flamethrower, size: 1.6, cat: "zbran\u011B" },
  { id: "nozzle", name: "Hasi\u010Dsk\xE1 proudnice s hadic\xED", build: nozzle, size: 2.4, cat: "ha\u0161en\xED" },
  { id: "room", name: "M\xEDstnost s oknem", build: room, size: 5.5, cat: "velk\xE9" },
  { id: "aluWheel", name: "Lit\xFD hlin\xEDkov\xFD disk", build: aluWheel, size: 0.5, cat: "rekvizity" },
  { id: "propaneCylinder", name: "L\xE1hev propan-butanu s ho\u0159\xE1kem", build: propaneCylinder, size: 1.5, cat: "v\xFDbu\u0161niny" },
  { id: "mortarRack", name: "Odpalovac\xED trubky (oh\u0148ostroj)", build: mortarRack, size: 0.9, cat: "v\xFDbu\u0161niny" },
  { id: "thermitePot", name: "Kv\u011Btin\xE1\u010D s termitem", build: thermitePot, size: 0.8, cat: "rekvizity" },
  { id: "figure", name: "Postava 1,8 m (m\u011B\u0159\xEDtko)", build: figure, size: 1.9, cat: "rekvizity" }
];
var assetById = (id) => ASSETS.find((a) => a.id === id);

// src/scenarios/index.js
import * as THREE27 from "three";

// src/physics/spread.js
function headROS(fuel, U) {
  const f = FUELS[fuel];
  return f.R0 * (1 + f.wa * Math.pow(Math.max(U, 0), f.wb));
}
function byram(fuel, R) {
  const f = FUELS[fuel];
  const I = f.dHc * f.w * R;
  return { I, L: 0.0775 * Math.pow(I / 1e3, 0.46) };
}
function lengthToBreadth(U) {
  return Math.min(8, Math.max(1, 0.936 * Math.exp(0.2566 * U) + 0.461 * Math.exp(-0.1548 * U) - 0.397));
}
function rosAt(Rh, LB, theta) {
  const e = Math.sqrt(Math.max(0, 1 - 1 / (LB * LB)));
  return Rh * (1 - e) / (1 - e * Math.cos(theta));
}
function crownInitiation(CBH = 4, FMC = 100) {
  return Math.pow(0.01 * CBH * (460 + 25.9 * FMC), 1.5) * 1e3;
}
function arrivalTimes({ nx, ny, cell, fuel, fuelMap, ignitions, windDir, U, slopeFn = null }) {
  const Rh = headROS(fuel, U), LB = lengthToBreadth(U);
  const T = new Float32Array(nx * ny).fill(Infinity);
  const N2 = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!dx && !dy) continue;
    if ((Math.abs(dx) === 2 || Math.abs(dy) === 2) && (Math.abs(dx) !== 1 && Math.abs(dy) !== 1)) continue;
    const d = Math.hypot(dx, dy) * cell, ang = Math.atan2(dy, dx);
    const R = rosAt(Rh, LB, ang - windDir);
    N2.push({ dx, dy, d, R });
  }
  const heap = [], hp = (i, t) => {
    heap.push([t, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = k - 1 >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop2 = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (; ; ) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (const [ix, iy, t0] of ignitions) {
    const i = iy * nx + ix;
    T[i] = t0 || 0;
    hp(i, T[i]);
  }
  while (heap.length) {
    const [t, i] = pop2();
    if (t > T[i]) continue;
    const x = i % nx, y = i / nx | 0;
    for (const n of N2) {
      const X = x + n.dx, Y = y + n.dy;
      if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue;
      const j = Y * nx + X, fm = fuelMap[j];
      if (fm <= 0.02) continue;
      let R = n.R * (0.35 + 0.65 * fm);
      if (slopeFn) R *= slopeFn(x, y, X, Y);
      const tj = t + n.d / R;
      if (tj < T[j]) {
        T[j] = tj;
        hp(j, tj);
      }
    }
  }
  return { T, Rh, LB };
}

// src/scenarios/forestDetail.js
import * as THREE23 from "three";
var V = (x, y, z) => new THREE23.Vector3(x, y, z);
function forestDetail(ctx, { flora, arr, fuel, seed = 1 }) {
  const tid = Math.min(ctx.tier.id, 5);
  const nTrunk = [2, 3, 5, 6, 8, 10][tid], nBranch = [0, 2, 3, 5, 6, 8][tid];
  const r = mulberry32(seed);
  const trunks = [];
  for (let i = 0; i < nTrunk; i++) {
    const s = ctx.fx.addSource({ pos: V(0, 0, 0), fuel: "woodResin", Q: 0, D: 0.38, footprint: { type: "disk" }, volume: true, seed: 400 + i, taper: 1.15, attach: 1, mult: { smoke: 0.5, embers: 0.8, haze: 0.1, light: 0.7 } });
    s.enabled = false;
    trunks.push({ s, item: -1 });
  }
  const bark = makeMaterial("bark");
  applyChar(bark, { scale: 6, alligator: [6, 10] });
  const charU = bark.userData.char;
  const geo = new THREE23.CylinderGeometry(0.02, 0.035, 1, 6, 1);
  geo.rotateZ(Math.PI / 2);
  const branches = [];
  for (let i = 0; i < nBranch; i++) {
    const mesh2 = new THREE23.Mesh(geo, bark);
    mesh2.visible = false;
    mesh2.castShadow = true;
    ctx.add(mesh2);
    const s = ctx.fx.addSource({ pos: V(0, 0, 0), fuel: "woodResin", Q: 0, D: 0.3, footprint: { type: "disk" }, volume: false, seed: 500 + i, mult: { smoke: 0.5, embers: 1.5, haze: 0, light: 0.5 } });
    s.enabled = false;
    branches.push({ mesh: mesh2, s, on: false, p: V(0, 0, 0), v: V(0, 0, 0), w: V(0, 0, 0), len: 1, ground: false, tg: 0, life: 0 });
  }
  if (charU) {
    charU.uChar.value = 0.85;
    charU.uGlow.value = 0.7;
  }
  let lastScan = -1, cand = [], lastFx = ctx.fx.time, spawnAcc = 0;
  return {
    /** t = čas scénáře, crown = korunový režim, trBurn = doba hoření kmene [s scénáře] */
    update(t, crown) {
      const now = ctx.fx.time, dt = Math.min(0.1, now - lastFx);
      lastFx = now;
      const cp = ctx.camera.position, trB = fuel.tr * 1.3;
      if (now - lastScan > 0.25 || lastScan < 0) {
        lastScan = now;
        cand = [];
        for (let i = 0; i < flora.items.length; i++) {
          const it = flora.items[i], ta = arr().T[it.cell];
          if (ta === Infinity || t < ta || t > ta + trB) continue;
          const d2 = (it.x - cp.x) ** 2 + (it.z - cp.z) ** 2;
          if (d2 < 45 * 45) cand.push({ i, d2, ta });
        }
        cand.sort((a, b) => a.d2 - b.d2);
      }
      for (let k = 0; k < trunks.length; k++) {
        const T = trunks[k], c2 = cand[k];
        if (!c2) {
          T.s.enabled = false;
          continue;
        }
        const it = flora.items[c2.i], age = (t - c2.ta) / trB, env = Math.sin(Math.PI * Math.min(1, age)) ** 0.5;
        const sc = Math.min(1.4, it.s / 14);
        const rt = 0.016 * it.s, wd = ctx.fx.air.dir;
        T.s.enabled = true;
        T.s.pos.set(it.x + Math.cos(wd) * rt * 0.9, 0.05, it.z + Math.sin(wd) * rt * 0.9);
        T.s.o.Q = 16e4 * env * sc;
        T.s.o.L = () => (1.6 + 3.6 * env) * sc;
      }
      if (branches.length) {
        spawnAcc += dt * (crown ? 0.35 : 0.12) * Math.min(1, cand.length / 4);
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          const b = branches.find((x) => !x.on), c2 = cand[Math.floor(r() * Math.min(cand.length, 8))];
          if (!b || !c2 || c2.d2 > 35 * 35) break;
          const it = flora.items[c2.i], a = r() * 6.283, rr = 0.8 + 1.6 * r();
          b.on = true;
          b.ground = false;
          b.tg = 0;
          b.len = 0.6 + 0.9 * r();
          b.p.set(it.x + Math.cos(a) * rr, it.s * (crown ? 0.5 + 0.3 * r() : 0.15 + 0.15 * r()), it.z + Math.sin(a) * rr);
          b.v.set(Math.cos(a) * 0.8, 0.5 * r(), Math.sin(a) * 0.8);
          b.w.set((r() - 0.5) * 6, (r() - 0.5) * 3, (r() - 0.5) * 6);
          b.mesh.scale.set(b.len, 1, 1);
          b.mesh.rotation.set(r() * 6, r() * 6, r() * 6);
          b.mesh.visible = true;
          b.life = 14 + 10 * r();
          b.s.enabled = true;
        }
      }
      for (const b of branches) {
        if (!b.on) continue;
        if (!b.ground) {
          b.v.y -= 9.81 * dt;
          b.p.addScaledVector(b.v, dt);
          b.mesh.rotation.x += b.w.x * dt;
          b.mesh.rotation.y += b.w.y * dt;
          b.mesh.rotation.z += b.w.z * dt;
          if (b.p.y <= 0.06) {
            b.p.y = 0.06;
            b.ground = true;
            b.mesh.rotation.set(0, b.mesh.rotation.y, 0);
            b.s.brandBurst(6, 0.7, [b.p.x, 0.05, b.p.z]);
          }
        } else b.tg += dt;
        b.mesh.position.copy(b.p);
        const left = 1 - b.tg / b.life;
        if (left <= 0) {
          b.on = false;
          b.mesh.visible = false;
          b.s.enabled = false;
          continue;
        }
        b.s.pos.set(b.p.x, b.p.y - 0.05, b.p.z);
        b.s.o.Q = 45e3 * b.len * (b.ground ? Math.max(0.15, left) : 1);
        b.s.o.L = () => (b.ground ? 0.6 : 1) * b.len * (0.4 + 0.6 * left);
      }
    },
    dispose() {
      geo.dispose();
    }
  };
}

// src/scenarios/iter6.js
import * as THREE24 from "three";
var V2 = (x, y, z) => new THREE24.Vector3(x, y, z);
var kW = (q) => (q / 1e3).toFixed(q < 1e4 ? 1 : 0) + " kW/m\xB2";
var degC = (T) => (T - 273.15).toFixed(0) + " \xB0C";
var blastRows = (W) => [
  ["TNT ekvivalent", W >= 1 ? W.toFixed(1) + " kg" : (W * 1e3).toFixed(0) + " g", "Kinney\u2013Graham \u26054"],
  ...blastSummary(W, [3, 10, 30, 100]).map((b) => [`  p\u0159etlak v ${b.R} m`, b.kPa < 1 ? (b.kPa * 1e3).toFixed(0) + " Pa" : b.kPa.toFixed(1) + " kPa", b.effect])
];
function tableTop(ctx, w = 0.9, d = 0.6) {
  const m = makeMaterial("woodPlank");
  const g2 = new THREE24.BoxGeometry(w, 0.04, d);
  g2.translate(0, -0.02, 0);
  const t = new THREE24.Mesh(g2, m);
  t.receiveShadow = true;
  ctx.add(t);
}
var sheetState = (b) => `${degC(b.Ts)} (max ${degC(b.Tmax)}) \u2013 ${b.state === "cold" ? "chladn\xFD" : b.state}`;
var ITER6_FIRST = [
  // ---------------------------------------------------------------------------------------------- zapalovač
  {
    id: "lighter",
    group: "Z\xE1\u017Eeh",
    name: "Zapalova\u010D: jiskra \u2192 plamen",
    ground: "dirt",
    time: "noc",
    duration: 9,
    loop: true,
    desc: "K\u0159esac\xED kole\u010Dko strhne z \u201Ekam\xEDnku\u201C (ferrocer) t\u0159\xEDsky, kter\xE9 na vzduchu samy vzplanou (~3 000 \xB0C). Prvn\xED \u0161krtnut\xED nechytne, druh\xE9 zap\xE1l\xED butan: lamin\xE1rn\xED plam\xEDnek 25 mm, ~57 W, modr\xE1 pata a \u017Elut\xE1 \u0161pi\u010Dka.",
    cams: [{ name: "detail", pos: [0.075, 0.105, 0.13], target: [0, 0.075, 0] }, { name: "st\u016Fl", pos: [0.35, 0.28, 0.5], target: [0, 0.05, 0] }],
    build(ctx) {
      tableTop(ctx);
      const L = lighter({ lod: ctx.lod });
      ctx.add(L);
      const at = L.userData.flameAt, sk = L.userData.sparkAt, r = mulberry32(21);
      const sp = fireSpec({ kind: "jet", fuel: "butane", mdot: 125e-8 });
      const strikes = [0.7, 1.7], tOn = 1.74, tOff = 7.2;
      const lit = (t) => t < tOn ? 0 : t < tOff ? Math.min(1, (t - tOn) / 0.12) : Math.max(0, 1 - (t - tOff) / 0.08);
      const src = ctx.fx.addSource({ pos: V2(at.x, at.y, at.z), seed: 6, volume: true, ...sourceOptions(sp), end: Infinity, Q: (t) => sp.Qpeak * lit(t) });
      let prev = 0;
      return {
        update(dt, t) {
          const fx = ctx.fx;
          for (const ts of strikes) {
            const k = (t - ts) / 0.07;
            if (k >= 0 && k < 1) {
              L.userData.wheel.rotation.z -= dt * 55;
              let n = Math.round(dt * 900 * fx.budgetScale.spark);
              if (prev < ts) n += 6;
              for (let i = 0; i < n; i++) {
                const v = 0.9 + 1.9 * r(), a = (r() - 0.5) * 1.5, e = 0.5 + 0.9 * r();
                fx.sp.spawn({ x: sk.x, y: sk.y, z: sk.z, vx: -Math.cos(e) * Math.cos(a) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * v * 0.8, life: 0.04 + 0.14 * r() * r(), T: 2500 + 400 * r(), tauC: 0.9, size: 1e-4 + 16e-5 * r(), drag: 22 + 22 * r(), grav: 1, seed: r() });
              }
              if (r() < dt * 60) {
                const d = 0.02 + 0.03 * r(), px = sk.x - d * 0.7, py = sk.y + d * 0.8, pz = sk.z + (r() - 0.5) * 0.03;
                for (let i = 0; i < 5; i++) fx.sp.spawn({ x: px, y: py, z: pz, vx: (r() - 0.5) * 1.6, vy: (r() - 0.3) * 1.6, vz: (r() - 0.5) * 1.6, life: 0.04 + 0.06 * r(), T: 2700, tauC: 0.5, size: 8e-5, drag: 25, grav: 1, seed: r() });
              }
              fx.lights.add(sk.x, sk.y + 5e-3, sk.z, 0.9 * (0.6 + 0.8 * r()), 2800, 0.01);
            }
          }
          prev = t;
        },
        info: () => [
          ...sp.rows,
          ...fireRows(src).slice(1, 6),
          ["Jiskra", "ferrocer (Ce + Fe), vzn\xEDt\xED se p\u0159i 150\u2013180 \xB0C, ho\u0159\xED ~3 000 \xB0C", "\u26054"],
          ["Pro\u010D prvn\xED \u0161krtnut\xED nechytne", "plyn je\u0161t\u011B nedos\xE1hl doln\xED meze v\xFDbu\u0161nosti 1,8 % u jisker", "\u26053"],
          ["S\xE1l\xE1n\xED ve 3 cm od plamene", kW(ctx.fx.heatFlux([at.x + 0.03, at.y + 0.012, at.z]).total), "bodov\xFD zdroj \u26053"]
        ]
      };
    }
  }
];
var ITER6_LIQUIDS = [
  // ---------------------------------------------------------------------------------------------- hořící sud s naftou
  {
    id: "dieselBarrel",
    group: "Kapaliny",
    name: "Ho\u0159\xEDc\xED sud s naftou",
    ground: "concrete",
    time: "den",
    timeScale: 6,
    duration: 900,
    desc: "Sud 200 l bez v\xEDka, ~170 l nafty. Lou\u017Ee o pr\u016Fm\u011Bru 0,56 m: ~350 kW, plamen ~1,9 m, pulzace 2 Hz, hust\xFD \u010Dern\xFD kou\u0159. Ho\u0159\xED skoro 6 hodin (hladina kles\xE1 2,2 mm/min). Lak nad hladinou sho\u0159\xED, pod hladinou ho kapalina chlad\xED.",
    cams: [{ name: "celek", pos: [3.6, 1.9, 4.4], target: [0, 1.5, 0] }, { name: "hr\xE1\u010D", pos: [2.4, 1.7, 2.2], target: [0, 1.1, 0] }, { name: "sloup kou\u0159e", pos: [10, 2.5, 13], target: [0, 5, 0] }],
    build(ctx) {
      const b = barrelOpen({ lod: ctx.lod, paint: "metalBlue", level: 0.8 });
      ctx.add(b);
      const ud = b.userData, sp = fireSpec({ kind: "pool", fuel: "diesel", D: 2 * (ud.R - 6e-3), volumeL: 170 });
      const grow = (t) => Math.min(1, (t / 12) ** 2) * (1 - 0.6 * Math.exp(-t / 45));
      const src = ctx.fx.addSource({ pos: V2(0, ud.liquidY + 0.01, 0), seed: 31, volume: true, ...sourceOptions(sp), end: Infinity, Q: (t) => sp.Qpeak * grow(t), start: 1, shapeK: 1.6, taper: 0.7, neck: 0.25, puffAmp: 0.9, volTongues: 0, turbAmp: 0.8, volSoot: 0.6, mult: { smoke: 2.6 } });
      const shell2 = ctx.fx.addBurnable({ pos: V2(0, 0, 0), material: "steelPainted", char: ud.char, probe: [ud.R - 0.02, ud.H - 0.03, 0], label: "pl\xE1\u0161\u0165 u okraje" });
      ctx.fx.addScorch({ pos: V2(0, 0, 0), radius: 0.9, rate: 1 / 500, seed: 9 });
      const rate = sp.mdot / sp.Qpeak;
      let burnt = 0;
      return {
        update(dt) {
          if (src.ph) {
            burnt += src.ph.Q * rate * dt;
            ud.liquid.position.y = -burnt / (FUELS.diesel.rho * Math.PI * (ud.R - 6e-3) ** 2);
          }
        },
        info: () => [
          ...sp.rows,
          ...fireRows(src).slice(1),
          ["Sho\u0159elo", burnt.toFixed(2) + " kg", "\u1E41 = Q/\u0394Hc"],
          ["Pl\xE1\u0161\u0165 u okraje", sheetState(shell2), "tenk\xFD plech \u26054"],
          ["Tok na pl\xE1\u0161\u0165", kW(shell2.q), "kontakt s plamenem \u26053"],
          ["S\xE1l\xE1n\xED ve 2 m (v\xFD\u0161ka pasu)", kW(ctx.fx.heatFlux([2, 1, 0]).total) + " \u2013 " + fluxEffect(ctx.fx.heatFlux([2, 1, 0]).total), "Modak \u26054"]
        ]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- prostřelený sud
  {
    id: "leak",
    group: "Kapaliny",
    name: "Prost\u0159elen\xFD sud: ho\u0159\xEDc\xED pram\xEDnek",
    ground: "concrete",
    time: "den",
    timeScale: 4,
    duration: 420,
    desc: "Otvor 9 mm p\u016Fl metru pod hladinou: vyt\xE9k\xE1 0,12 l/s (Torricelli). V\u0161e, co vyte\u010De, sho\u0159\xED \u2192 ~4,6 MW na pruhu ~8 \xD7 0,6 m, plameny ~2,4 m, \u010Dern\xFD kou\u0159. Benz\xEDn vzplane po cel\xE9 d\xE9lce za p\xE1r sekund, nafta se rozho\u0159\xEDv\xE1 pomalu od zdroje zap\xE1len\xED.",
    cams: [{ name: "celek", pos: [4.5, 3.2, 11], target: [4.2, 1.6, 0] }, { name: "hr\xE1\u010D", pos: [-2.2, 1.7, 4.5], target: [3, 1.2, 0] }, { name: "od sudu", pos: [-1.6, 1.3, 1.2], target: [4, 0.9, 0] }],
    controls: [{ id: "leakFuel", label: "Palivo", type: "select", value: "diesel", options: ["diesel", "gasoline"], restart: true }],
    build(ctx) {
      const fuel = ctx.controls.leakFuel || "diesel", mat = MATERIALS[fuel];
      const b = barrel({ lod: ctx.lod, paint: "metalRed" });
      ctx.add(b);
      const R = b.userData.R, hole = 0.3, head = 0.5;
      const sp = fireSpec({ kind: "leak", fuel, holeMM: 9, head });
      const v0 = Math.sqrt(2 * 9.81 * head) * 0.97;
      const jet = fuelJet({ lod: ctx.lod, v: v0, h: hole });
      jet.position.set(R, 0, 0);
      ctx.add(jet);
      const x0 = R + jet.userData.reach - 0.15, len = sp.stream.len, w = sp.stream.w;
      const strip2 = spillStrip({ lod: ctx.lod, len, w, seed: 5 });
      strip2.position.x = x0;
      ctx.add(strip2);
      const holeM = new THREE24.Mesh(new THREE24.CircleGeometry(55e-4, 12), new THREE24.MeshBasicMaterial({ color: 0 }));
      holeM.position.set(R + 1e-3, hole, 0);
      holeM.rotation.y = Math.PI / 2;
      ctx.add(holeM);
      const N2 = ctx.tier.id === 0 ? 4 : 5, seg = len / N2, tIgn = 3, spread = mat.spread * (fuel === "diesel" ? 2.5 : 1);
      const srcs = [];
      for (let i = 0; i < N2; i++) {
        const xc = x0 + (N2 - 0.5 - i) * seg, start = tIgn + i * seg / spread;
        const kq = 0.75 + 0.5 * (i * 0.618 % 1);
        srcs.push(ctx.fx.addSource({
          pos: V2(xc, 0.01, i % 2 ? 0.06 : -0.06),
          fuel,
          seed: 40 + i * 7,
          volume: true,
          footprint: { type: "rect", w: seg * 1.7, d: w * 1.15 },
          start,
          shapeK: 1.45,
          taper: 0.6,
          puffAmp: 0.7,
          volSoot: 0.12,
          mult: { smoke: 1.5, haze: 0.35 },
          Q: (t) => sp.Q(ctx.t) / N2 * kq * Math.min(1, t / (fuel === "diesel" ? 14 : 2))
        }));
        ctx.fx.addScorch({ pos: V2(xc, 0, 0), radius: seg * 0.75, rate: 1 / 200, seed: 12 + i });
      }
      const tBack = tIgn + len / spread;
      const foot = ctx.fx.addSource({ pos: V2(R + 0.35, 0.01, 0), fuel, seed: 55, volume: true, D: 0.7, start: tBack, Q: (t) => 35e4 * Math.min(1, t / 6) });
      const shell2 = ctx.fx.addBurnable({ pos: V2(0, 0, 0), material: "steelPainted", char: b.userData.char, probe: [R + 0.02, 0.35, 0], label: "pl\xE1\u0161\u0165 sudu" });
      b.userData.char.uCharBase.value = 0;
      b.userData.char.uCharH.value = 0.88;
      b.userData.char.uHeatFall.value = 0.5;
      return {
        update(dt, t) {
          const h2 = drainHead(t, head, 9e-3, 0.258);
          jet.scale.x = Math.sqrt(h2 / head) || 0.01;
          jet.visible = h2 > 2e-3;
          this.tot = [...srcs, foot].reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0);
        },
        info() {
          return [
            ...sp.rows,
            ["Palivo", FUELS[fuel].name, mat.flash ? `bod vzplanut\xED ${degC(mat.flash)}` : ""],
            ["Celkov\xFD v\xFDkon", fmtW(this.tot || 0), "sou\u010Det \xFAsek\u016F"],
            ["\u0160\xED\u0159en\xED plamene po pruhu", (spread * 100).toFixed(0) + " cm/s \u2192 k sudu za " + (len / spread).toFixed(0) + " s", "\u26052\u20133"],
            ["V\xFD\u0161ka plamen\u016F pruhu", sp.stream.L.toFixed(1) + " m", "Yuan & Cox \u26054"],
            ...fireRows(srcs[N2 - 1], "\xFAsek u sudu").slice(4, 8),
            ["Pl\xE1\u0161\u0165 sudu", sheetState(shell2), "tenk\xFD plech \u26054"],
            ["Tok na pl\xE1\u0161\u0165", kW(shell2.q), "\u26053"],
            ["Co hroz\xED", shell2.Tmax > 700 ? "zav\u0159en\xFD sud v plameni: roztr\u017Een\xED a ohniv\xE1 koule (viz V\xFDbuch sudu)" : "dokud plamen nedob\u011Bhne k sudu, jen s\xE1l\xE1n\xED", "D-008"]
          ];
        }
      };
    }
  }
];
var ITER6_BLAST = [
  // ---------------------------------------------------------------------------------------------- acetylenová láhev
  {
    id: "acetyleneCyl",
    group: "Exploze",
    name: "V\xFDbuch acetylenov\xE9 lahve (v po\u017E\xE1ru)",
    ground: "dirt",
    time: "soumrak",
    timeScale: 20,
    duration: 560,
    desc: "Tlakov\xE1 l\xE1hev 50 l (7 kg C\u2082H\u2082 v acetonu) v ho\u0159\xEDc\xED hranici palet. Ocel p\u0159i ~550 \xB0C ztr\xE1c\xED polovinu pevnosti, acetylen se uvnit\u0159 rozkl\xE1d\xE1 \u2192 pl\xE1\u0161\u0165 se roztrhne na kusy, plyn vzplane v ohnivou kouli ~13 m (1 s), oslniv\u011B \u017Elutou a plnou saz\xED. Tlakov\xE1 vlna \u2248 1\u20132 kg TNT, \xFAlomky let\xED ~80 m/s na stovky metr\u016F (z\xF3na hasi\u010D\u016F 200 m).",
    cams: [{ name: "celek", pos: [15, 4, 19], target: [0, 4.5, 0] }, { name: "hr\xE1\u010D (12 m)", pos: [9, 1.7, 8], target: [0, 2.5, 0] }, { name: "z d\xE1lky (70 m)", pos: [55, 6, 45], target: [0, 7, 0] }],
    controls: [{ id: "cylLook", label: "Varianta v\xFDbuchu", type: "select", value: "fyzik\xE1ln\xED", options: ["fyzik\xE1ln\xED", "filmov\xE1"], restart: true }],
    build(ctx) {
      const pal = [];
      const rr = mulberry32(5);
      for (let i = 0; i < 4; i++) {
        const p = pallet({ lod: Math.min(ctx.lod, 3) });
        p.position.set((rr() - 0.5) * 0.08, i * 0.146, (rr() - 0.5) * 0.08);
        p.rotation.y = (rr() - 0.5) * 0.25 + i % 2 * Math.PI / 2;
        ctx.add(p);
        pal.push(p);
      }
      {
        const p = pallet({ lod: Math.min(ctx.lod, 3) });
        p.position.set(-0.95, 0.5, 0.1);
        p.rotation.z = -1.12;
        ctx.add(p);
        pal.push(p);
      }
      {
        const p = pallet({ lod: Math.min(ctx.lod, 3) });
        p.position.set(-0.1, 0.38, -0.78);
        p.rotation.x = -1.05;
        ctx.add(p);
        pal.push(p);
      }
      const cyl = gasCylinder({ lod: ctx.lod });
      cyl.rotation.z = Math.PI / 2;
      cyl.position.set(0.58, 0.69, 0);
      ctx.add(cyl);
      const pile = fireSpec({ kind: "pile", material: "softwood", mass: 132, stick: 0.03, D: 1.5, tGrow: 90 });
      const src = ctx.fx.addSource({ pos: V2(0, 0.1, 0), seed: 61, volume: true, ...sourceOptions(pile), end: Infinity });
      const shell2 = ctx.fx.addBurnable({ pos: V2(0, 0, 0), material: { ...MATERIALS.steelThick, rcd: MATERIALS.steelThick.rcd * 2 }, char: cyl.userData.char, probe: [0, 0.75, 0], label: "pl\xE1\u0161\u0165 lahve" });
      cyl.userData.char.uHeatFall.value = 0.1;
      ctx.fx.addScorch({ pos: V2(0, 0, 0), radius: 2.2, rate: 1 / 300, glow: 0.3, seed: 7 });
      const es = explosionSpec({ kind: "gasCylinder", film: ctx.controls.cylLook === "filmov\xE1" });
      const Tburst = MATERIALS.steelThick.weak;
      let boom2 = false, tBoom = 0;
      const frags = [];
      return {
        update(dt, t) {
          for (const p of pal) {
            const u = p.userData.char;
            u.uChar.value = Math.min(1, t / 240);
            u.uGlow.value = Math.min(1, t / 40);
          }
          if (!boom2 && shell2.Ts >= Tburst) {
            boom2 = true;
            tBoom = t;
            cyl.visible = false;
            ctx.setTimeScale(1);
            const c2 = V2(0, 0.7, 0);
            ctx.fx.addExplosion({ pos: c2, seed: 17, ...es.ex });
            for (const f of es.fires) ctx.fx.addSource({ pos: V2(0.4, 0.01, 0.3), seed: 71, volume: true, ...f });
            src.brandBurst(70, 3.2);
            src.o.Q = /* @__PURE__ */ ((q) => (tt) => 0.35 * q(tt))(src.o.Q);
            for (let i = 0; i < 6; i++) {
              const a = i * 1.05 + 0.3, R = 2.5 + 2.2 * rr();
              ctx.fx.addSource({ pos: V2(Math.cos(a) * R, 0.02, Math.sin(a) * R), fuel: "woodDry", Q: 6e4 + 8e4 * rr(), D: 0.5, start: 0.8, end: 200 + 200 * rr(), volume: i < 3, seed: 80 + i });
            }
            pal.forEach((p, i) => {
              p.position.x += (rr() - 0.5) * 1.6;
              p.position.z += (rr() - 0.5) * 1.6;
              p.position.y = 0.02 + i % 2 * 0.1;
              p.rotation.x += (rr() - 0.5) * 0.7;
              p.rotation.z += (rr() - 0.5) * 0.7;
            });
            const fr = cylinderFragments({ lod: Math.min(ctx.lod, 3), seed: 3 });
            const dirs = [V2(-1, 0.55, 0.1), V2(1, 0.75, -0.15), V2(0.1, 0.9, 1), V2(-0.2, 0.5, -1), V2(0.3, 1.2, 0.4)];
            fr.parts.forEach((g2, i) => {
              g2.position.copy(c2);
              ctx.add(g2);
              frags.push({ g: g2, v: dirs[i].normalize().multiplyScalar(es.vFrag * (i < 2 ? 0.75 : 0.45) * (0.8 + 0.4 * rr())), w: V2(rr() * 9, rr() * 9, rr() * 9), rest: false });
            });
            this.fragU = fr.char;
            ctx.message("L\xE1hev se roztrhla: ohniv\xE1 koule " + es.fb.D.toFixed(0) + " m, \xFAlomky " + es.vFrag.toFixed(0) + " m/s.");
          }
          if (boom2) {
            for (const f of frags) {
              if (f.rest) continue;
              f.v.y -= 9.81 * dt;
              f.v.multiplyScalar(Math.exp(-0.05 * dt));
              f.g.position.addScaledVector(f.v, dt);
              f.g.rotation.x += f.w.x * dt;
              f.g.rotation.y += f.w.y * dt;
              f.g.rotation.z += f.w.z * dt;
              if (f.g.position.y < 0.08) {
                f.g.position.y = 0.08;
                if (Math.abs(f.v.y) < 2.5) {
                  f.rest = true;
                } else {
                  f.v.y *= -0.3;
                  f.v.x *= 0.5;
                  f.v.z *= 0.5;
                  f.w.multiplyScalar(0.4);
                }
              }
            }
            if (this.fragU) this.fragU.uTnow.value = 293 + 600 * Math.exp(-(t - tBoom) / 90);
          }
        },
        info: () => [
          ["Stav", boom2 ? `roztr\u017Eena v \u010Dase ${(tBoom / 60).toFixed(1)} min` : "oh\u0159\xEDv\xE1 se v plameni (\u010Das zrychlen 20\xD7)", ""],
          ["Pl\xE1\u0161\u0165 lahve", sheetState(shell2), `mez ${degC(Tburst)} \u26054`],
          ["Tok na pl\xE1\u0161\u0165", kW(shell2.q), "kontakt \u26053"],
          ...es.rows,
          ...blastRows(es.W).slice(1),
          ...fireRows(src, "hranice").slice(1, 3),
          ["Dolet \xFAlomku bez odporu", ((es.vFrag * 0.75) ** 2 / 9.81).toFixed(0) + " m", "v\xB2/g \u26053"],
          ["Pro\u010D ne \u201Edetonace\u201C", "rozklad C\u2082H\u2082 v por\xE9zn\xED hmot\u011B je pomal\xFD; ni\u010D\xED roztr\u017Een\xED a ohe\u0148, ne brizance", "Jank\u016Fj & Mynarz 2022 \u26054"]
        ]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- obecný výbuch
  {
    id: "blastLab",
    group: "Laborato\u0159",
    name: "Obecn\xFD v\xFDbuch (n\xE1lo\u017E \u2192 v\u0161e)",
    ground: "dryGrass",
    time: "den",
    duration: 26,
    loop: true,
    desc: "Jeden popis v\xFDbuchu: druh a hmotnost \u2192 p\u0159etlak, ohniv\xE1 koule, kou\u0159, trosky, kr\xE1ter, od 50 g po 5 t. Mocninn\xE9 z\xE1kony proch\xE1zej\xED ru\u010Dn\u011B vylad\u011Bn\xFDmi body (gran\xE1t 0,24 kg, 1 t TNT), mezi nimi dr\u017E\xED fyzik\xE1ln\xED exponenty (d\xE9lky \u221D W^\u2153, plochy \u221D W^\u2154).",
    cams: [{ name: "25 m", pos: [18, 3, 17], target: [0, 3, 0] }, { name: "80 m", pos: [62, 6, 50], target: [0, 14, 0] }, { name: "300 m", pos: [240, 20, 180], target: [0, 50, 0] }],
    controls: [
      { id: "bKind", label: "Druh", type: "select", value: "he", options: ["he", "fireball", "gasCylinder"], restart: true },
      { id: "bMass", label: "Hmotnost [kg]", type: "range", min: 0.05, max: 5e3, value: 10, log: true },
      { id: "bCased", label: "Kovov\xFD pl\xE1\u0161\u0165 (st\u0159epiny)", type: "check", value: false }
    ],
    build(ctx) {
      const mk = () => explosionSpec(ctx.controls.bKind === "he" ? { kind: "he", explosive: "tnt", mass: ctx.controls.bMass, cased: ctx.controls.bCased } : ctx.controls.bKind === "fireball" ? { kind: "fireball", mass: ctx.controls.bMass } : { kind: "gasCylinder", gasMass: Math.min(20, Math.max(1, ctx.controls.bMass)) });
      const ref = barrel({ lod: Math.min(ctx.lod, 2), paint: "metalOlive" });
      ref.position.set(6, 0, -3);
      ctx.add(ref);
      let boom2 = false, es = mk();
      return {
        update(dt, t) {
          if (!boom2 && t > 1.5) {
            boom2 = true;
            es = mk();
            ctx.fx.addExplosion({ pos: V2(0, es.dy, 0), seed: 23, ...es.ex });
            for (const f of es.fires) ctx.fx.addSource({ pos: V2(0, 0.01, 0), seed: 24, volume: true, ...f });
          }
        },
        info: () => {
          const e = boom2 ? es : mk();
          return [...e.rows, ...blastRows(e.W).slice(1), ["Kou\u0159 (\u010D\xE1stic / \u017Eivot)", e.ex.smoke.n + " / " + e.ex.smoke.life.toFixed(0) + " s", "mocninn\xFD z\xE1kon"], ["Trosky (po\u010Det / rychlost)", e.ex.debris.n + " / " + e.ex.debris.speed.toFixed(0) + " m/s", ""], ["H\u0159ib / kondenza\u010Dn\xED d\xF3m", (e.ex.mushroom ? "ano" : "ne") + " / " + (e.ex.wilson ? "ano" : "ne"), "od 100 / 300 kg"]];
        }
      };
    }
  }
];
var ITER6_SPREAD = [
  // ---------------------------------------------------------------------------------------------- řetěz vznícení
  {
    id: "chain",
    group: "\u0160\xED\u0159en\xED",
    name: "P\u0159estup tepla: \u0159et\u011Bz vzn\xEDcen\xED",
    ground: "dirt",
    time: "den",
    timeScale: 10,
    duration: 1500,
    desc: "Ho\u0159\xED dv\u011B palety (~0,9 MW). Okoln\xED v\u011Bci dost\xE1vaj\xED tepeln\xFD tok podle vzd\xE1lenosti a ka\u017Ed\xE1 s\u010D\xEDt\xE1 svou d\xE1vku do vzn\xEDcen\xED podle materi\xE1lu: sl\xE1ma chytne od ~8 kW/m\xB2 za sekundy, d\u0159evo a\u017E nad 12 kW/m\xB2 za minuty, pneumatika a\u017E nad 17 kW/m\xB2. Co chytne, p\u0159id\xE1 vlastn\xED teplo a zap\xE1l\xED dal\u0161\xED. Paleta ve 4,5 m z\u016Fstane pod prahem; plech sudu neho\u0159\xED, ale ztrat\xED lak a z\u010Dern\xE1.",
    cams: [{ name: "celek", pos: [5.5, 3.6, 6.5], target: [0, 0.9, 0] }, { name: "hr\xE1\u010D", pos: [3.6, 1.7, 5.2], target: [0, 0.8, 0] }, { name: "shora", pos: [0.5, 9, 2.5], target: [0, 0.3, 0] }],
    build(ctx) {
      const fx = ctx.fx, items = [];
      const put = (obj, x, z, ry = 0) => {
        obj.position.set(x, 0, z);
        obj.rotation.y = ry;
        ctx.add(obj);
        return obj;
      };
      const add = (label, obj, o) => {
        const b = fx.addBurnable({ label, char: obj.userData.char, ...o, onBurnout: () => {
          obj.userData.done = true;
        } });
        b.obj = obj;
        items.push(b);
        return b;
      };
      const p1 = put(pallet({ lod: ctx.lod }), 0, 0), p2 = pallet({ lod: ctx.lod });
      p2.position.set(0.03, 0.146, 0.02);
      p2.rotation.y = 0.12;
      ctx.add(p2);
      const core = add("2 palety (ohnisko)", p1, { pos: V2(0, 0, 0), material: "softwood", mass: 44, area: 7, size: 1.2, ignited: true, seed: 3, source: { footprint: { type: "rect", w: 1.2, d: 0.8 } } });
      const u2 = p2.userData.char;
      const bale = put(strawStack({ lod: ctx.lod, nx: 2, ny: 1, nz: 1, seed: 8 }), 2.7, 0.2, 0.25);
      add("bal\xEDk sl\xE1my (1,7 m)", bale, { pos: V2(2.7, 0, 0.2), material: "straw", mass: 250, area: 9, size: 1.6, height: 0.5, probe: [-1, 0.5, 0], seed: 4, fireY: 0.55, source: { footprint: { type: "rect", w: 2.4, d: 1.2, rot: 0.25 } } });
      const cr = put(crate({ lod: ctx.lod, s: 0.6 }), -0.25, -1.5, 0.3);
      add("bedna (1,2 m)", cr, { pos: V2(-0.25, 0, -1.5), material: "softwood", mass: 9, area: 2.2, size: 0.6, probe: [0.05, 0.4, 0.32], seed: 5, fireY: 0.25 });
      const ti = put(tire({ lod: ctx.lod, rim: false }), -0.3, 1.4);
      ti.rotation.x = 0;
      add("pneumatika (1,1 m)", ti, { pos: V2(-0.3, 0, 1.4), material: "rubber", mass: 9, area: 1.2, size: 0.65, probe: [0.05, 0.3, -0.33], seed: 6, D: 0.65, fireY: 0.15 });
      const far = put(pallet({ lod: ctx.lod }), -4.5, 0.6, 1.3);
      add("paleta daleko (4,5 m)", far, { pos: V2(-4.5, 0, 0.6), material: "softwood", mass: 22, area: 3.5, size: 1.2, probe: [0.5, 0.2, 0], seed: 7 });
      const drum = put(barrel({ lod: ctx.lod, paint: "metalBlue" }), -1.25, -0.2);
      drum.userData.char.uHeatFall.value = 0.25;
      const sh = fx.addBurnable({ label: "sud \u2013 plech (0,9 m)", pos: V2(-1.25, 0, -0.2), material: "steelPainted", char: drum.userData.char, probe: [0.3, 0.5, 0.03] });
      sh.obj = drum;
      items.push(sh);
      fx.addScorch({ pos: V2(0, 0, 0), radius: 1.6, rate: 1 / 400, glow: 0.3, seed: 3 });
      return {
        update() {
          u2.uChar.value = p1.userData.char.uChar.value;
          u2.uGlow.value = p1.userData.char.uGlow.value;
          for (const b of items) if (b.state === "burning" || b.state === "burnt") {
            const k = b.mat.look === "fluff" ? 0.55 : b.mat.look === "melt" ? 0.5 : 0.65;
            b.obj.scale.y = 1 - k * b.burned ** 1.5;
            if (b === core) p2.scale.y = b.obj.scale.y, p2.position.y = 0.146 * b.obj.scale.y;
          }
          this.tot = fx.sources.reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0);
        },
        info() {
          const rows = [["Celkov\xFD v\xFDkon", fmtW(this.tot || 0), "sou\u010Det zdroj\u016F"]];
          for (const b of items) {
            const st = b.inert ? sheetState(b) : b.state === "burning" ? `HO\u0158\xCD od ${(b.tIgn / 60).toFixed(1)} min, ${fmtW(b.src?.ph?.Q || 0)}` : b.state === "burnt" ? "vyho\u0159elo" : `d\xE1vka ${(b.heat * 100).toFixed(0)} %`;
            const tig = b.inert || b.state === "burning" || b.state === "burnt" ? "" : (() => {
              const t = timeToIgnition(b.q, b.mat);
              return Number.isFinite(t) ? `p\u0159i tomto toku za ${t < 90 ? t.toFixed(0) + " s" : (t / 60).toFixed(1) + " min"}` : `pod prahem ${(b.mat.qCrit / 1e3).toFixed(0)} kW/m\xB2`;
            })();
            rows.push([b.label, `${kW(b.q)} \xB7 ${st}`, tig]);
          }
          rows.push(["S\xE1l\xE1n\xED ve 3 m (hr\xE1\u010D)", kW(fx.heatFlux([3, 1.2, 3]).total) + " \u2013 " + fluxEffect(fx.heatFlux([3, 1.2, 3]).total), "Modak \u26054"], ["Model", "d\xE1vka = \u222B(q\u2033 \u2212 q\u2033crit)\u207F dt, n = 2 tlust\xE9, 1 tenk\xE9", "Quintiere; Shields \u26053\u20134"]);
          return rows;
        }
      };
    }
  }
];

// src/scenarios/iter7.js
import * as THREE26 from "three";

// src/physics/gun.js
var E_PROPELLANT = 4e6;
var M0 = 4e-4;
var GUNS = {
  pistol9: { name: "Pistole 9\xD719 mm", charge: 4e-4, bullet: 8e-3, v0: 360, cal: 9e-3, barrel: 0.1, rpm: 0, barrelMass: 0.12, conf: 4 },
  rifle556: { name: "\xDAto\u010Dn\xE1 pu\u0161ka 5,56\xD745 mm", charge: 165e-5, bullet: 4e-3, v0: 920, cal: 556e-5, barrel: 0.37, rpm: 800, barrelMass: 0.75, hider: true, conf: 4 },
  mg762: { name: "Kulomet 7,62\xD751 mm", charge: 29e-4, bullet: 95e-4, v0: 840, cal: 762e-5, barrel: 0.55, rpm: 650, barrelMass: 2.9, hider: true, tracerEvery: 5, conf: 4 },
  hmg127: { name: "Velkor\xE1\u017En\xFD kulomet 12,7\xD799 mm", charge: 0.015, bullet: 0.042, v0: 890, cal: 0.0127, barrel: 1.14, rpm: 500, barrelMass: 11, tracerEvery: 5, conf: 4 },
  auto30: { name: "Automatick\xFD kan\xF3n 30\xD7165 mm", charge: 0.12, bullet: 0.39, v0: 960, cal: 0.03, barrel: 2.4, rpm: 300, barrelMass: 40, brake: true, conf: 3 },
  tank125: { name: "Tankov\xFD kan\xF3n 125 mm (t\u0159\xED\u0161tivotrhav\xFD)", charge: 5, bullet: 23, v0: 850, cal: 0.125, barrel: 6, rpm: 8, barrelMass: 1150, shellHE: 3.4, conf: 3 },
  how155: { name: "Houfnice 155 mm (M107)", charge: 6, bullet: 43.2, v0: 565, cal: 0.155, barrel: 6, rpm: 4, barrelMass: 1600, brake: true, shellHE: 6.6, conf: 3 }
};
var pw2 = (m, v0, e) => v0 * Math.pow(m / M0, e);
function muzzleSpec(g2, o = {}) {
  const G2 = typeof g2 === "string" ? GUNS[g2] : g2;
  const E = G2.charge * E_PROPELLANT, KE = 0.5 * G2.bullet * G2.v0 * G2.v0, eff = KE / E;
  const toBarrel = 0.2, toGas = Math.max(0.2, 1 - eff - toBarrel);
  const k = o.suppressor ? 0.1 : G2.hider ? 0.4 : 1;
  const L = pw2(G2.charge, 0.12, 0.43) * k, T = pw2(G2.charge, 15e-4, 1 / 3);
  const W = 0.03 * E / TNT_J_PER_KG * (o.suppressor ? 2e-3 : 1);
  const spl = (r) => 20 * Math.log10(Math.max(overpressure(r, W, false), 2e-5) / 2e-5);
  const out = {
    gun: G2,
    E,
    KE,
    eff,
    toBarrel,
    toGas,
    flashL: L,
    flashD: 0.45 * L,
    flashT: T,
    flashTemp: 2100,
    sideJets: !!G2.brake,
    flashI: 2e6 * Math.pow(0.2 * G2.charge * k / 0.24, 2 / 3),
    // svítivost v jednotkách světel enginu (kalibrace na granát) – umělecké ★2
    W,
    spl,
    smokeV: 0.95 * G2.charge,
    // m³ plynů po vychladnutí (~950 l/kg) ★3
    dustR: 25 * Math.cbrt(W),
    // poloměr zvířeného prachu u země [m] ★2
    dTbarrel: toBarrel * E / (G2.barrelMass * 490),
    // ohřev hlavně jednou ranou [K] ★3
    impulse: G2.bullet * G2.v0 + 1.75 * G2.charge * 1200,
    // zpětný ráz [N·s], plyny ~1,75 × náplň × 1 200 m/s ★3
    period: G2.rpm ? 60 / G2.rpm : Infinity
  };
  out.rows = [
    ["Zbra\u0148", G2.name, "tabulky n\xE1boj\u016F \u2605" + G2.conf],
    ["Prachov\xE1 n\xE1pl\u0148", G2.charge < 0.1 ? (G2.charge * 1e3).toFixed(2) + " g" : G2.charge.toFixed(1) + " kg", ""],
    ["Energie n\xE1pln\u011B", E < 1e6 ? (E / 1e3).toFixed(1) + " kJ" : (E / 1e6).toFixed(1) + " MJ", "4,0 MJ/kg \u26053"],
    ["St\u0159ela", `${G2.bullet < 1 ? (G2.bullet * 1e3).toFixed(1) + " g" : G2.bullet.toFixed(1) + " kg"}, ${G2.v0} m/s \u2192 ${KE < 1e6 ? (KE / 1e3).toFixed(1) + " kJ" : (KE / 1e6).toFixed(1) + " MJ"}`, `\xFA\u010Dinnost ${(eff * 100).toFixed(0)} %`],
    ["Z\xE1blesk u \xFAst\xED", `${L < 1 ? (L * 100).toFixed(0) + " cm" : L.toFixed(1) + " m"} / ${(T * 1e3).toFixed(1)} ms`, "vlastn\xED prolo\u017Een\xED \u26052"],
    ["R\xE1na v 1 m / 10 m", `${spl(1).toFixed(0)} dB / ${spl(10).toFixed(0)} dB`, "Kinney\u2013Graham, 3 % energie \u26052"],
    ["Oh\u0159ev hlavn\u011B jednou ranou", out.dTbarrel.toFixed(out.dTbarrel < 1 ? 2 : 1) + " K", "20 % energie \u26053"],
    ["Zp\u011Btn\xFD r\xE1z", out.impulse.toFixed(out.impulse < 10 ? 2 : 0) + " N\xB7s", "st\u0159ela + plyny \u26053"]
  ];
  return out;
}
function stepBarrelTemp(T, shots, dt, ms) {
  const G2 = ms.gun, A = Math.PI * (2.2 * G2.cal + 0.012) * G2.barrel, C = G2.barrelMass * 490;
  const loss = (30 * (T - AMB.T) + 0.8 * 5670374e-14 * (T ** 4 - AMB.T ** 4)) * A;
  return Math.max(AMB.T, T + shots * ms.dTbarrel - loss * dt / C);
}
var tracer = (g2) => {
  const G2 = typeof g2 === "string" ? GUNS[g2] : g2;
  return { burn: G2.cal > 0.01 ? 2.8 : 1.3, T: 1900, v0: G2.v0, drag: G2.cal > 0.01 ? 0.25 : 0.55 };
};

// src/fx/gun.js
import * as THREE25 from "three";
var MIN_VISIBLE = 1 / 20;
var GunFX = class {
  constructor(world, seedRnd) {
    this.w = world;
    this.r = seedRnd;
    this.flashes = [];
  }
  /** Jedna rána: pos = ústí hlavně (Vector3), dir = jednotkový směr, ms = muzzleSpec, o = { tracer: bool, ground: výška země } */
  fire(pos, dir, ms, o = {}) {
    const w = this.w, r = this.r, L = ms.flashL, D = ms.flashD, vis = Math.max(ms.flashT, MIN_VISIBLE), q = w.tier.id, bs = w.budgetScale;
    const side = new THREE25.Vector3(-dir.z, 0, dir.x).normalize(), up = new THREE25.Vector3().crossVectors(side, dir);
    if (w.layers.flame) {
      const n = Math.max(2, Math.round((3 + 5 * Math.cbrt(L / 0.1)) * (q === 0 ? 0.5 : q >= 4 ? 1.6 : 1) * Math.max(0.4, bs.flame)));
      for (let i = 0; i < n; i++) {
        const t = (i + r()) / n, k = 1 - Math.abs(t - 0.35) * 1.3, off = D * 0.25 * (1 - t);
        w.bb.spawnFirePuff({
          x: pos.x + dir.x * L * t + (r() - 0.5) * off,
          y: pos.y + dir.y * L * t + (r() - 0.5) * off,
          z: pos.z + dir.z * L * t + (r() - 0.5) * off,
          vx: dir.x * (L / vis) * 0.35 * (1 - t),
          vy: dir.y * (L / vis) * 0.35 * (1 - t) + 0.3,
          vz: dir.z * (L / vis) * 0.35 * (1 - t),
          life: vis * (0.7 + 0.9 * r() + 2.2 * r() ** 3),
          s0: Math.max(0.01, D * (0.3 + 0.5 * Math.max(0, k))),
          s1: D * (0.7 + 0.5 * r()),
          T: ms.flashTemp * (1 - 0.22 * t),
          lum: 1.6,
          soot: 0.05,
          drag: 5,
          seed: r()
        });
      }
      if (ms.sideJets && q > 0) for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) {
        const t = (i + r()) / 3;
        w.bb.spawnFirePuff({
          x: pos.x + side.x * sg * L * 0.45 * t,
          y: pos.y + 0.02,
          z: pos.z + side.z * sg * L * 0.45 * t,
          vx: side.x * sg * (L / vis) * 0.2,
          vy: 0.4,
          vz: side.z * sg * (L / vis) * 0.2,
          life: vis * (0.6 + 0.6 * r()),
          s0: D * 0.3,
          s1: D * 0.6,
          T: ms.flashTemp * 0.9,
          lum: 1.3,
          soot: 0.05,
          drag: 5,
          seed: r()
        });
      }
    }
    this.flashes.push({ x: pos.x + dir.x * L * 0.35, y: pos.y + dir.y * L * 0.35, z: pos.z + dir.z * L * 0.35, I: ms.flashI, r: Math.max(D * 0.6, 0.03), t: vis });
    if (w.layers.sparks && q > 0) {
      const n = Math.round(Math.min(120, 4 + 10 * Math.cbrt(ms.gun.charge / 4e-4)) * Math.max(0.3, bs.spark));
      for (let i = 0; i < n; i++) {
        const v = (25 + 55 * r()) * Math.min(3, Math.cbrt(L / 0.1)), sx = (r() - 0.5) * 0.5, sy = (r() - 0.5) * 0.5;
        w.sp.spawn({
          x: pos.x,
          y: pos.y,
          z: pos.z,
          vx: (dir.x + side.x * sx + up.x * sy) * v,
          vy: (dir.y + up.y * sy) * v,
          vz: (dir.z + side.z * sx + up.z * sy) * v,
          life: 0.04 + 0.12 * r() * Math.cbrt(L / 0.1),
          T: 1700 + 400 * r(),
          tauC: 0.5,
          size: 6e-4 + 15e-4 * r() * Math.cbrt(L / 0.1),
          drag: 9,
          grav: 1,
          seed: r()
        });
      }
    }
    if (w.layers.smoke) {
      const R = Math.cbrt(ms.smokeV * 40), n = Math.max(1, Math.round((2 + 3 * Math.cbrt(R / 0.2)) * (q === 0 ? 0.5 : 1) * Math.max(0.3, bs.smoke)));
      for (let i = 0; i < n; i++) {
        const t = r(), v = 2 + 9 * Math.cbrt(L / 0.1) * (1 - t);
        w.bb.spawnSmoke({
          x: pos.x + dir.x * L * t,
          y: pos.y + dir.y * L * t,
          z: pos.z + dir.z * L * t,
          vx: dir.x * v + (r() - 0.5),
          vy: dir.y * v + 0.3 + 0.4 * r(),
          vz: dir.z * v + (r() - 0.5),
          life: (1.2 + 2.5 * r()) * Math.min(4, 1 + R),
          s0: R * 0.35,
          s1: R * (1.6 + 1.4 * r()) + 0.15,
          tau: Math.min(0.9, 0.12 + 0.12 * R),
          albedo: [0.62, 0.63, 0.66],
          drag: 1.6,
          seed: r()
        });
      }
      const h2 = pos.y - (o.ground ?? 0);
      if (ms.dustR > 1.2 && h2 < ms.dustR * 0.5 && q > 0) {
        const nd = Math.round(Math.min(90, 8 * ms.dustR) * Math.max(0.3, bs.smoke));
        for (let i = 0; i < nd; i++) {
          const a = r() * 6.2832, fw = 0.5 + 0.5 * Math.max(0, Math.cos(a - Math.atan2(dir.z, dir.x))), rr = ms.dustR * (0.15 + 0.5 * r()), v = (3 + 7 * r()) * fw * Math.cbrt(ms.dustR / 4);
          w.bb.spawnSmoke({
            x: pos.x + Math.cos(a) * rr,
            y: (o.ground ?? 0) + 0.1 + 0.3 * r(),
            z: pos.z + Math.sin(a) * rr,
            vx: Math.cos(a) * v,
            vy: 0.6 + 1.5 * r(),
            vz: Math.sin(a) * v,
            life: 3 + 5 * r(),
            s0: 0.5,
            s1: 2 + 0.25 * ms.dustR * (1 + r()),
            tau: 0.8,
            albedo: [0.36, 0.31, 0.23],
            drag: 1.2,
            seed: r()
          });
        }
      }
    }
    if (w.hz && w.layers.haze && q >= 2) w.hz.spawn({ x: pos.x + dir.x * L * 0.5, y: pos.y, z: pos.z + dir.z * L * 0.5, vy: 0.8, life: 0.6, size: Math.max(0.15, D * 1.5) });
    if (o.tracer && w.layers.sparks) {
      const tr = tracer(ms.gun);
      w.sp.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * tr.v0 * 0.25, vy: dir.y * tr.v0 * 0.25, vz: dir.z * tr.v0 * 0.25, life: tr.burn, T: tr.T, tauC: 30, size: 0.012 + ms.gun.cal, drag: tr.drag * 0.15, grav: 0.25, seed: r() });
    }
    if (w.audioEvents && w.audioEvents.length < 64) w.audioEvents.push({ type: "shot", pos: pos.clone(), W: ms.W });
    w.shake = Math.max(w.shake, Math.min(1, ms.W * 4));
  }
  /** Každý snímek: světlo záblesku po dobu jeho viditelnosti. */
  update(dt) {
    for (const f of this.flashes) {
      this.w.lights.add(f.x, f.y, f.z, f.I * Math.min(1, f.t / MIN_VISIBLE), 2400, f.r);
      f.t -= dt;
    }
    this.flashes = this.flashes.filter((f) => f.t > 0);
  }
};

// src/scenarios/iter7.js
var V4 = (x, y, z) => new THREE26.Vector3(x, y, z);
var kW2 = (q) => (q / 1e3).toFixed(q < 1e4 ? 1 : 0) + " kW/m\xB2";
var degC2 = (T) => (T - 273.15).toFixed(0) + " \xB0C";
var mmss = (t) => t < 90 ? t.toFixed(0) + " s" : (t / 60).toFixed(1) + " min";
var table = (ctx, w = 0.9, d = 0.6) => {
  const g2 = new THREE26.BoxGeometry(w, 0.04, d);
  g2.translate(0, -0.02, 0);
  const t = new THREE26.Mesh(g2, makeMaterial("woodPlank"));
  t.receiveShadow = true;
  ctx.add(t);
};
var wpos = (obj, v) => obj.localToWorld(v.clone());
var wdir = (obj, v) => v.clone().applyQuaternion(obj.quaternion).normalize();
var ITER7_GUNS = [
  {
    id: "pistol",
    group: "Zbran\u011B",
    name: "V\xFDst\u0159el z pistole 9 mm",
    ground: "concrete",
    time: "soumrak",
    duration: 9,
    loop: true,
    desc: "N\xE1pl\u0148 0,4 g bezd\xFDmn\xE9ho prachu: t\u0159etina energie jde do st\u0159ely, p\u011Btina oh\u0159eje hlave\u0148, zbytek odch\xE1z\xED \xFAst\xEDm jako hork\xE9 plyny bohat\xE9 na CO a vod\xEDk. Ty se sm\xEDs\xED se vzduchem a doho\u0159\xED \u2013 to je z\xE1blesk: ~12 cm, 1,5 ms (krat\u0161\xED ne\u017E jeden sn\xEDmek, proto ho kresl\xEDme 1/30 s). R\xE1na 160 dB u st\u0159elce.",
    tiers: ["T0\u2013T1: 2 ohniv\xE9 obl\xE1\u010Dky + sv\u011Btlo na jeden sn\xEDmek", "T2\u2013T3: + zrna prachu, obl\xE1\u010Dek kou\u0159e, vyhozen\xE1 n\xE1bojnice", "T4\u2013T5: + tetelen\xED, v\xEDc \u010D\xE1stic, st\xEDny od z\xE1blesku"],
    cams: [{ name: "detail", pos: [0.34, 0.31, 0.5], target: [0.14, 0.215, 0] }, { name: "st\u0159elec", pos: [-0.55, 0.42, 0.22], target: [0.6, 0.2, 0] }, { name: "z boku 3 m", pos: [0.3, 1.1, 3], target: [0.3, 0.3, 0] }],
    controls: [{ id: "gunSupp", label: "Tlumi\u010D hluku", type: "check", value: false }],
    build(ctx) {
      table(ctx, 1.2, 0.6);
      const g2 = pistol({ lod: ctx.lod });
      ctx.add(g2);
      g2.updateMatrixWorld(true);
      const gun = new GunFX(ctx.fx, mulberry32(3)), ud = g2.userData;
      let next = 1.2, shots = 0, ms = muzzleSpec("pistol9");
      return {
        update(dt, t) {
          ms = muzzleSpec("pistol9", { suppressor: ctx.controls.gunSupp });
          gun.update(dt);
          if (t >= next) {
            next += 1.7;
            shots++;
            gun.fire(wpos(g2, ud.muzzle), wdir(g2, ud.dir), ms, { ground: 0 });
            if (ctx.tier.id > 0) ctx.fx.debris.burst(wpos(g2, ud.eject).setY(ud.eject.y - 0.2), { n: 1, speed: 2.2, size: 9e-3, hot: 0.1, up: 0.75 });
          }
        },
        info: () => [
          ...ms.rows,
          ["V\xFDst\u0159el\u016F", String(shots), ""],
          ["Kam jde energie", `st\u0159ela ${(ms.eff * 100).toFixed(0)} %, hlave\u0148 ${(ms.toBarrel * 100).toFixed(0)} %, plyny u \xFAst\xED ${(ms.toGas * 100).toFixed(0)} %`, "vnit\u0159n\xED balistika \u26053"],
          ["Pro\u010D tlumi\u010D zhasne z\xE1blesk", "plyny se v komor\xE1ch ochlad\xED a zpomal\xED d\u0159\xEDv, ne\u017E potkaj\xED vzduch", "\u26054"]
        ]
      };
    }
  },
  {
    id: "machineGun",
    group: "Zbran\u011B",
    name: "Kulomet: d\xE1vky a \u017Ehnouc\xED hlave\u0148",
    ground: "dirt",
    time: "soumrak",
    duration: 70,
    desc: "Kulomet 7,62 mm, 650 ran/min. Ka\u017Ed\xE1 r\xE1na oh\u0159eje hlave\u0148 o ~1,6 K; chlazen\xED vzduchem sta\u010D\xED jen na zlomek. Po ~250 ran\xE1ch v kuse je hlave\u0148 p\u0159es 500 \xB0C a za\u010D\xEDn\xE1 \u017Ehnout tmav\u011B rud\u011B, po 500 oran\u017Eov\u011B a je zni\u010Den\xE1. Ka\u017Ed\xE1 p\xE1t\xE1 st\u0159ela je sv\xEDt\xEDc\xED (stroncium, ho\u0159\xED 1,3 s). Kou\u0159 z prachu se p\u0159i st\u0159elb\u011B hromad\xED p\u0159ed zbran\xED.",
    tiers: ["T0\u2013T1: z\xE1blesk 2 obl\xE1\u010Dky, bez jisker, sv\xEDt\xEDc\xED st\u0159ely", "T2\u2013T3: + zrna prachu, kou\u0159, n\xE1bojnice, zv\xED\u0159en\xFD prach", "T4\u2013T5: + tetelen\xED nad hlavn\xED, pln\xFD po\u010Det \u010D\xE1stic"],
    cams: [{ name: "st\u0159elec", pos: [-1.5, 0.9, 0.9], target: [1.2, 0.45, 0] }, { name: "z boku", pos: [0.5, 0.7, 2.6], target: [0.6, 0.45, 0] }, { name: "p\u0159ed hlavn\xED (pozor)", pos: [5, 1.1, 2.2], target: [0.6, 0.45, 0] }],
    controls: [
      { id: "mgMode", label: "Re\u017Eim st\u0159elby", type: "select", value: "d\xE1vky", options: ["d\xE1vky", "dlouh\xE1 d\xE1vka", "nep\u0159etr\u017Eit\u011B"], restart: true },
      { id: "mgGun", label: "Zbra\u0148", type: "select", value: "mg762", options: ["mg762", "rifle556", "hmg127"], restart: true }
    ],
    build(ctx) {
      const g2 = machineGun({ lod: ctx.lod });
      ctx.add(g2);
      g2.updateMatrixWorld(true);
      const key = ctx.controls.mgGun || "mg762", mode = ctx.controls.mgMode || "d\xE1vky", ms = muzzleSpec(key), G2 = ms.gun, ud = g2.userData, u = ud.char;
      const gun = new GunFX(ctx.fx, mulberry32(8)), r = mulberry32(9);
      let acc = 0, shots = 0, Tb = 293, Tmax = 293;
      const muz = wpos(g2, ud.muzzle), dir0 = wdir(g2, ud.dir), ej = wpos(g2, ud.eject);
      ej.y -= 0.2;
      return {
        update(dt, t) {
          gun.update(dt);
          const on = t > 1 && (mode === "nep\u0159etr\u017Eit\u011B" ? true : mode === "dlouh\xE1 d\xE1vka" ? (t - 1) % 14 < 9 : (t - 1) % 3.2 < 1.1);
          let n = 0;
          if (on) {
            acc += dt / ms.period;
            while (acc >= 1) {
              acc -= 1;
              n++;
            }
          }
          for (let i = 0; i < n; i++) {
            shots++;
            const d = dir0.clone();
            d.y += (r() - 0.5) * 0.012;
            d.z += (r() - 0.5) * 0.012;
            d.normalize();
            gun.fire(muz, d, ms, { ground: 0, tracer: G2.tracerEvery ? shots % G2.tracerEvery === 0 : false });
            if (ctx.tier.id > 0 && shots % 2 === 0) ctx.fx.debris.burst(ej, { n: 1, speed: 2.5, size: 0.011, hot: 0.15, up: 0.3 }, r);
          }
          Tb = stepBarrelTemp(Tb, n, dt, ms);
          Tmax = Math.max(Tmax, Tb);
          u.uTnow.value = Tb;
          u.uTmax.value = Tmax;
          if (ctx.fx.hz && ctx.tier.id >= 2 && Tb > 420 && r() < dt * 8) ctx.fx.hz.spawn({ x: muz.x - 0.3 * r() * dir0.x * 2, y: muz.y + 0.05, z: muz.z, vy: 0.6, life: 0.8, size: 0.25 });
        },
        info: () => [
          ...ms.rows.slice(0, 6),
          ["Kadence", G2.rpm + " ran/min", ""],
          ["Vyst\u0159eleno", String(shots), ""],
          ["Teplota hlavn\u011B", degC2(Tb) + " (max " + degC2(Tmax) + ")", Tb > 1100 ? "\u017Ehne oran\u017Eov\u011B \u2013 hlave\u0148 je zni\u010Den\xE1" : Tb > 800 ? "\u017Ehne tmav\u011B rud\u011B (Draper\u016Fv bod 525 \xB0C)" : Tb > 470 ? "n\xE1b\u011Bhov\xE9 barvy; n\xE1boj v komo\u0159e se m\u016F\u017Ee s\xE1m odp\xE1lit" : "v po\u0159\xE1dku"],
          ["Oh\u0159ev jednou ranou", ms.dTbarrel.toFixed(2) + " K", "20 % energie n\xE1pln\u011B \u26053"],
          ["V\xFDm\u011Bna hlavn\u011B podle p\u0159edpisu", "po ~200 ran\xE1ch rychl\xE9 st\u0159elby", "M240: 2 min p\u0159i 200 ran/min \u26054"],
          ["Sv\xEDt\xEDc\xED st\u0159ela", G2.tracerEvery ? `ka\u017Ed\xE1 ${G2.tracerEvery}., ho\u0159\xED ${G2.cal > 0.01 ? "2,8" : "1,3"} s` : "ne", "stroncium + ho\u0159\u010D\xEDk \u26053"]
        ]
      };
    }
  },
  {
    id: "cannon",
    group: "Zbran\u011B",
    name: "V\xFDst\u0159el z d\u011Bla a dopad gran\xE1tu",
    ground: "dryGrass",
    time: "den",
    duration: 16,
    loop: true,
    desc: "Tankov\xFD kan\xF3n 125 mm: 5 kg prachu, st\u0159ela 23 kg, 850 m/s. Z\xE1blesk ~7 m a 35 ms, tlakov\xE1 vlna zvedne prach do 13 m od \xFAst\xED (p\u011Bchota nesm\xED st\xE1t p\u0159ed tankem). Gran\xE1t dolet\xED na 150 m za 0,18 s a 3,4 kg trhaviny v ocelov\xE9m pl\xE1\u0161ti vybuchne; r\xE1nu od d\u011Bla sly\u0161\xED\u0161 hned, v\xFDbuch u c\xEDle se zpo\u017Ed\u011Bn\xEDm podle vzd\xE1lenosti. Stejn\xE1 funkce spo\u010D\xEDt\xE1 i velkor\xE1\u017En\xFD kulomet nebo houfnici.",
    tiers: ["T0\u2013T1: z\xE1blesk 5 obl\xE1\u010Dk\u016F, prach 30 \u010D\xE1stic, v\xFDbuch z plo\u0161n\xFDch obl\xE1\u010Dk\u016F", "T2\u2013T3: + bo\u010Dn\xED plameny brzdy, jiskry, objemov\xE1 koule v\xFDbuchu", "T4\u2013T5: + objemov\xFD kou\u0159, pln\xFD prachov\xFD prstenec, trosky"],
    cams: [{ name: "u d\u011Bla (10 m)", pos: [-3, 2.2, 10], target: [4, 1.3, 0] }, { name: "z boku (45 m)", pos: [20, 4, 45], target: [20, 2, 0] }, { name: "u c\xEDle (50 m)", pos: [120, 3, 42], target: [150, 2, 0] }],
    controls: [{ id: "cGun", label: "Zbra\u0148", type: "select", value: "tank125", options: ["tank125", "how155", "auto30", "hmg127"], restart: true }],
    build(ctx) {
      const key = ctx.controls.cGun || "tank125", ms = muzzleSpec(key), G2 = ms.gun, big = !!G2.shellHE;
      const g2 = fieldGun({ lod: ctx.lod, elev: 0.02 });
      if (!big) g2.scale.setScalar(G2.cal > 0.02 ? 0.45 : 0.22);
      ctx.add(g2);
      g2.updateMatrixWorld(true);
      const tgt = barrel({ lod: Math.min(ctx.lod, 2), paint: "metalRed" });
      tgt.position.set(150, 0, 0);
      ctx.add(tgt);
      const fig = figure({ lod: Math.min(ctx.lod, 2) });
      fig.position.set(-2.5, 0, 2.2);
      ctx.add(fig);
      const gun = new GunFX(ctx.fx, mulberry32(12)), ud = g2.userData, muz = wpos(g2, ud.muzzle), dir = wdir(g2, ud.dir), r = mulberry32(4);
      const es = big ? explosionSpec({ kind: "he", explosive: "compB", mass: G2.shellHE, cased: true }) : null, tof = 150 / G2.v0;
      const nShots = big ? 1 : 8;
      let fired = 0, hits = 0, acc = 0;
      return {
        update(dt, t) {
          gun.update(dt);
          if (t > 2 && fired < nShots) {
            acc += dt / (big ? 1 : ms.period);
            while ((fired === 0 || acc >= 1) && fired < nShots) {
              acc = Math.max(0, acc - 1);
              fired++;
              gun.fire(muz, dir, ms, { ground: 0, tracer: true });
              this["h" + fired] = t + tof;
              if (fired === 1) acc = 0;
            }
          }
          for (let i = hits + 1; i <= fired; i++) if (this["h" + i] != null && t >= this["h" + i]) {
            hits = i;
            const p = V4(150 + (r() - 0.5) * (big ? 0 : 3), 0.3, (r() - 0.5) * (big ? 0 : 2));
            if (big) {
              ctx.fx.blast(es, p, { cased: true, seed: 20 + i });
              tgt.visible = false;
            } else {
              ctx.fx.debris.burst(p, { n: 26, speed: 9, size: 0.03, hot: 0.2, up: 0.7 }, r);
              for (let k = 0; k < 6; k++) ctx.fx.bb.spawnSmoke({ x: p.x, y: 0.2, z: p.z, vx: (r() - 0.5) * 3, vy: 1 + 2 * r(), vz: (r() - 0.5) * 3, life: 2 + 2 * r(), s0: 0.3, s1: 1.6, tau: 0.6, albedo: [0.36, 0.31, 0.23], drag: 1 });
            }
          }
        },
        info: () => [
          ...ms.rows,
          ["Zv\xED\u0159en\xFD prach do", ms.dustR.toFixed(1) + " m od \xFAst\xED", "\u26052"],
          ["P\u0159etlak 2 m vedle \xFAst\xED", (Math.pow(10, ms.spl(2) / 20) * 2e-5 / 1e3).toFixed(1) + " kPa", "u\u0161n\xED bub\xEDnek prask\xE1 od ~35 kPa \u26053"],
          ["Let na 150 m", (tof * 1e3).toFixed(0) + " ms", ""],
          ...es ? [...es.rows, ...blastSummary(es.W, [10, 50]).map((b) => [`  p\u0159etlak v ${b.R} m`, b.kPa.toFixed(1) + " kPa", b.effect])] : [["St\u0159ela", "bez trhaviny \u2013 jen prach a odra\u017Een\xE9 \xFAlomky", ""]],
          ["Zvuk dopadu u d\u011Bla za", (150 / 343).toFixed(2) + " s", "rychlost zvuku"]
        ]
      };
    }
  }
];
var ITER7_CHAIN = [
  {
    id: "chainBlast",
    group: "Exploze",
    name: "\u0158et\u011Bzov\xE1 exploze: sklad munice",
    ground: "dirt",
    time: "den",
    duration: 40,
    desc: "\u0160est palet po \u010Dty\u0159ech gran\xE1tech 155 mm (26 kg TNT na paletu). Fyzik\xE1ln\u011B: prvn\xED v\xFDbuch odp\xE1l\xED sousedy r\xE1zem do 0,5\xB7W^\u2153 (1,5 m) a st\u0159epinami s klesaj\xEDc\xED pravd\u011Bpodobnost\xED do 2,4\xB7W^\u2153 (7 m) \u2013 cel\xFD \u0159et\u011Bz prob\u011Bhne za setiny sekundy a oko vid\xED jeden v\xFDbuch. Filmov\u011B: rozestup 0,35 s a benz\xEDn pro oran\u017Eov\xE9 koule. Po\u017E\xE1r: hranice pod prvn\xED paletou, gran\xE1t se uva\u0159\xED za minuty a pak u\u017E to jde r\xE1zem.",
    tiers: ["T0\u2013T1: v\xFDbuchy z plo\u0161n\xFDch obl\xE1\u010Dk\u016F, spole\u010Dn\xFD rozpo\u010Det \u010D\xE1stic se d\u011Bl\xED mezi v\u0161echny", "T2\u2013T3: objemov\xE1 koule u nejbli\u017E\u0161\xEDch dvou, trosky, prach", "T4\u2013T5: objemov\xFD kou\u0159, h\u0159ib nad sou\u010Dtem n\xE1lo\u017E\xED"],
    cams: [{ name: "celek (60 m)", pos: [10, 6, 60], target: [5, 5, 0] }, { name: "pod\xE9l \u0159ady", pos: [-22, 3, 14], target: [5, 2, 0] }, { name: "z d\xE1lky (200 m)", pos: [60, 14, 190], target: [5, 14, 0] }],
    controls: [
      { id: "chMode", label: "Pr\u016Fb\u011Bh", type: "select", value: "fyzik\xE1ln\xED", options: ["fyzik\xE1ln\xED", "filmov\xFD", "po\u017E\xE1r"], restart: true },
      { id: "chGap", label: "Rozestup palet [m]", type: "range", min: 0.8, max: 10, value: 1.6, step: 0.1 }
    ],
    build(ctx) {
      const fx = ctx.fx, mode = ctx.controls.chMode || "fyzik\xE1ln\xED", gap = ctx.controls.chGap ?? 1.6, N2 = 6, Wst = 4 * 6.6;
      const spec = { kind: "he", explosive: "tnt", mass: Wst, cased: true }, es = explosionSpec(spec), items = [];
      if (mode === "po\u017E\xE1r") ctx.setTimeScale(20);
      for (let i = 0; i < N2; i++) {
        const st = shellStack({ lod: Math.min(ctx.lod, 3), n: 2, seed: i + 1 });
        st.position.set(i * gap, 0, 0);
        ctx.add(st);
        const b = fx.addBurnable({
          label: "paleta " + (i + 1),
          pos: V4(i * gap, 0, 0),
          material: "steelThick",
          char: st.userData.char,
          probe: [0, 0.4, 0],
          explosive: { spec, cookT: 520, rcd: 7850 * 490 * 0.015 },
          // TNT se vaří od ~240 °C; stěna granátu 15 mm ★3
          onEvent: (type, bb, e) => {
            if (type === "exploded") {
              st.visible = false;
              bb.tBoom = ctx.t;
              bb.cause = e.cause;
              ctx.setTimeScale(1);
            }
          }
        });
        b.obj = st;
        items.push(b);
      }
      let pile = null;
      if (mode === "po\u017E\xE1r") {
        const p = pallet({ lod: Math.min(ctx.lod, 3) });
        p.position.set(-0.75, 0, 0);
        ctx.add(p);
        pile = fx.addBurnable({ label: "ho\u0159\xEDc\xED palety", pos: V4(-0.55, 0, 0), material: "softwood", mass: 66, area: 10, size: 1.2, D: 1.3, ignited: true, char: p.userData.char, seed: 5 });
        fx.addScorch({ pos: V4(-0.55, 0, 0), radius: 1.6, rate: 1 / 300, glow: 0.3, seed: 3 });
      }
      const film = explosionSpec({ kind: "fireball", mass: 20, film: true });
      let started = false, k = 0;
      return {
        update(dt, t) {
          if (mode === "fyzik\xE1ln\xED" && !started && t > 2) {
            started = true;
            fx.blast(spec, items[0].pos, { src: items[0], cause: "rozbu\u0161ka", seed: 41 });
          }
          if (mode === "filmov\xFD") while (k < N2 && t > 2 + 0.35 * k) {
            for (const f of items) f.body.ex.done = true;
            const b = items[k];
            fx.blast(spec, b.pos, { src: b, cause: "\u010Dasova\u010D", seed: 50 + k });
            fx.addExplosion({ pos: b.pos.clone().setY(1), seed: 60 + k, ...film.ex });
            k++;
          }
        },
        info() {
          const sy = sympathetic(gap, es.W, { cased: true }), rows = [
            ["Pr\u016Fb\u011Bh", mode, mode === "filmov\xFD" ? "um\u011Bleck\xE9 \u26051" : "pravidlo vzd\xE1lenosti \u26052"],
            ["N\xE1lo\u017E jedn\xE9 palety", Wst.toFixed(1) + " kg TNT", "4 \xD7 6,6 kg"],
            ["R\xE1z odp\xE1l\xED souseda do", (0.5 * Math.cbrt(es.W)).toFixed(1) + " m", "0,5\xB7W^\u2153 \u26052"],
            ["St\u0159epiny odp\xE1l\xED do", (2.4 * Math.cbrt(es.W)).toFixed(1) + " m", "2,4\xB7W^\u2153 (NATO, sklady bez valu) \u26053"],
            ["P\u0159i rozestupu " + gap.toFixed(1) + " m", sy.p >= 1 ? "jist\u011B (r\xE1z)" : sy.p > 0 ? `pravd\u011Bpodobnost ${(sy.p * 100).toFixed(0)} % (st\u0159epiny), zpo\u017Ed\u011Bn\xED ${(sy.delay * 1e3).toFixed(0)} ms` : "\u0159et\u011Bz se zastav\xED", ""]
          ];
          for (const b of items) rows.push([b.label, b.tBoom != null ? `v\xFDbuch v ${b.tBoom.toFixed(mode === "po\u017E\xE1r" ? 0 : 3)} s (${b.cause})` : mode === "po\u017E\xE1r" ? `pl\xE1\u0161\u0165 ${degC2(b.body.ex.Tc)}, tok ${kW2(b.q)}` : "\u010Dek\xE1", ""]);
          if (pile) rows.push(["Hranice", fmtW(pile.src?.ph?.Q || 0), "uva\u0159en\xED TNT od 240 \xB0C \u26053"]);
          rows.push(["Sou\u010Det", (N2 * Wst).toFixed(0) + " kg TNT", ""], ...blastSummary(N2 * Wst, [50, 200]).map((b) => [`  p\u0159etlak v ${b.R} m (v\u0161e nar\xE1z)`, b.kPa.toFixed(1) + " kPa", b.effect]));
          return rows;
        }
      };
    }
  }
];
var ITER7_INCEND = [
  {
    id: "molotov",
    group: "Kapaliny",
    name: "Z\xE1paln\xE1 l\xE1hev",
    ground: "concrete",
    time: "soumrak",
    duration: 50,
    loop: true,
    desc: "L\xE1hev 0,7 l benz\xEDnu s ho\u0159\xEDc\xEDm hadrem let\xED 10 m. Po rozbit\xED se \u010D\xE1st benz\xEDnu rozpr\xE1\u0161\xED a vzplane v kouli ~2 m (0,15 s), zbytek se rozlije na ~1 m\xB2 a ho\u0159\xED \u010Dtvrt minuty: ~2 MW na metr \u010Dtvere\u010Dn\xED hladiny. Bedna vedle chytne od s\xE1l\xE1n\xED a plamen\u016F, paleta d\xE1l jen z\u010Dern\xE1.",
    tiers: ["T0\u2013T1: koule z 20 obl\xE1\u010Dk\u016F, lou\u017Ee jako jeden plo\u0161n\xFD plamen", "T2\u2013T3: objemov\xFD plamen lou\u017Ee, st\u0159epy, \u010Dern\xFD kou\u0159", "T4\u2013T5: objemov\xFD kou\u0159, jiskry z hadru, tetelen\xED"],
    cams: [{ name: "celek", pos: [1.5, 2.4, 9], target: [3.2, 0.9, 0] }, { name: "hr\xE1\u010D (vrha\u010D)", pos: [-7, 1.7, 1.2], target: [4, 0.6, 0] }, { name: "u dopadu", pos: [7.5, 1.4, 3.2], target: [4.6, 0.5, 0] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(7), bottle = molotov({ lod: ctx.lod });
      ctx.add(bottle);
      const p0 = V4(-6, 1.6, 0), v0 = V4(9, 4.5, 0), tThrow = 1.5, tof = (v0.y + Math.sqrt(v0.y * v0.y + 2 * 9.81 * p0.y)) / 9.81, hit = V4(p0.x + v0.x * tof, 0, 0);
      const wick = fx.addSource({ pos: p0.clone(), fuel: "gasoline", Q: 700, D: 0.03, seed: 3, end: Infinity, mult: { smoke: 0.3, embers: 0, sparks: 0 } });
      const cr = crate({ lod: ctx.lod, s: 0.6 });
      cr.position.set(hit.x + 0.95, 0, -0.35);
      cr.rotation.y = 0.3;
      ctx.add(cr);
      const bc = fx.addBurnable({ label: "bedna (0,9 m)", pos: cr.position.clone(), material: "softwood", mass: 9, area: 2.2, size: 0.6, probe: [-0.3, 0.3, 0.1], char: cr.userData.char, fireY: 0.25, seed: 5 });
      const pl = pallet({ lod: ctx.lod });
      pl.position.set(hit.x - 0.4, 0, 2.6);
      pl.rotation.y = 0.5;
      ctx.add(pl);
      const bp = fx.addBurnable({ label: "paleta (2,6 m)", pos: pl.position.clone(), material: "softwood", mass: 22, area: 3.5, size: 1.2, probe: [0, 0.15, -0.5], char: pl.userData.char, seed: 6 });
      const sp = fireSpec({ kind: "spill", fuel: "gasoline", volumeL: 0.55, depthMM: 0.55 }), fbS = explosionSpec({ kind: "vapor", fuel: "gasoline", mass: 0.07 });
      let broke = false, pool = null;
      return {
        update(dt, t) {
          const tl = t - tThrow;
          if (!broke) {
            const tt = Math.max(0, tl);
            bottle.position.set(p0.x + v0.x * tt, p0.y + v0.y * tt - 4.905 * tt * tt, 0);
            bottle.rotation.z = -tt * 7;
            bottle.updateMatrixWorld(true);
            wick.pos.copy(wpos(bottle, bottle.userData.wick));
            if (tl >= tof) {
              broke = true;
              bottle.visible = false;
              wick.enabled = false;
              fx.addExplosion({ pos: V4(hit.x, 0.5, 0), seed: 9, ...fbS.ex, debris: { n: 0, speed: 1, size: 0.01, hot: 0, up: 0.5 }, dust: false, scorch: 0 });
              fx.debris.burst(V4(hit.x, 0.05, 0), { n: ctx.tier.id > 0 ? 46 : 12, speed: 5, size: 0.012, hot: 0, up: 0.45 }, r);
              pool = fx.addSource({ pos: V4(hit.x + 0.25, 0.01, 0), seed: 11, volume: true, ...sourceOptions(sp), footprint: { type: "rect", w: 1.5, d: 0.9 }, shapeK: 1.4, volSoot: 0.3, mult: { smoke: 1.4 } });
              fx.addScorch({ pos: V4(hit.x + 0.25, 0, 0), radius: 1, rate: 1 / 12, seed: 4 });
            }
          }
        },
        info: () => [
          ["N\xE1pl\u0148", "0,7 l benz\xEDnu (0,5 kg)", ""],
          ["Let", `${v0.length().toFixed(0)} m/s, ${tof.toFixed(2)} s, ${(v0.x * tof).toFixed(1)} m`, "balistika"],
          ["Koule p\u0159i rozbit\xED", fbS.ex.fireball.D.toFixed(1) + " m / " + fbS.ex.fireball.t.toFixed(2) + " s", "~15 % n\xE1pln\u011B se rozpr\xE1\u0161\xED \u26052"],
          ...sp.rows.slice(1),
          ...pool ? fireRows(pool, "lou\u017Ee").slice(1, 3) : [],
          [bc.label, `${kW2(bc.q)} \xB7 ${bc.state === "burning" ? "HO\u0158\xCD od " + mmss(bc.tIgn - tThrow - tof) + " po dopadu" : bc.state === "burnt" ? "vyho\u0159elo" : "d\xE1vka " + (bc.heat * 100).toFixed(0) + " %"}`, ""],
          [bp.label, `${kW2(bp.q)} \xB7 ${bp.state === "burning" ? "HO\u0158\xCD" : "d\xE1vka " + (bp.heat * 100).toFixed(0) + " %"}`, "pr\xE1h d\u0159eva 12 kW/m\xB2"],
          ["Ha\u0161en\xED", "voda benz\xEDn roznese; pr\xE1\u0161ek, p\u011Bna, p\xEDsek nebo deka", "t\u0159\xEDda B"]
        ]
      };
    }
  },
  {
    id: "flamethrower",
    group: "Kapaliny",
    name: "Plamenomet",
    ground: "dirt",
    time: "soumrak",
    duration: 34,
    loop: true,
    desc: "Tryska vrh\xE1 1,5 l/s zahu\u0161t\u011Bn\xE9ho benz\xEDnu rychlost\xED 30 m/s na 16 m. Ve vzduchu sho\u0159\xED asi t\u0159etina (ho\u0159\xEDc\xED povrch proudu), zbytek dopadne a ho\u0159\xED na zemi a na c\xEDli \u2013 proto je plamenomet zbra\u0148 proti \xFAkryt\u016Fm, ne proti prostoru. Potenci\xE1ln\xED v\xFDkon 50 MW; po t\u0159ech sekund\xE1ch zbude ho\u0159\xEDc\xED p\xE1s a hust\xFD \u010Dern\xFD kou\u0159.",
    tiers: ["T0\u2013T1: 90 v\u011Bt\u0161\xEDch obl\xE1\u010Dk\u016F/s v oblouku, jeden zdroj na zemi", "T2\u2013T3: 200 obl\xE1\u010Dk\u016F, t\u0159i zdroje na zemi, \u010Dern\xFD kou\u0159, tetelen\xED", "T4\u2013T5: + objemov\xE9 plameny dopadu, objemov\xFD kou\u0159, jiskry"],
    cams: [{ name: "z boku", pos: [8, 3, 17], target: [8, 1.6, 0] }, { name: "obsluha", pos: [-2.2, 1.7, 1.3], target: [10, 1.2, 0] }, { name: "u c\xEDle", pos: [20, 1.8, 6], target: [15, 1, 0] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(17), ft = flamethrower({ lod: ctx.lod });
      ctx.add(ft);
      ft.updateMatrixWorld(true);
      const muz = wpos(ft, ft.userData.muzzle), v0 = 30, el = 0.16, vx = v0 * Math.cos(el), vy = v0 * Math.sin(el), cd = 1.15;
      const path = (tau, o2) => {
        const e = Math.exp(-cd * tau);
        o2.x = muz.x + vx / cd * (1 - e);
        o2.y = muz.y + (vy + 9.81 / cd) / cd * (1 - e) - 9.81 / cd * tau;
        o2.vx = vx * e;
        o2.vy = (vy + 9.81 / cd) * e - 9.81 / cd;
        return o2;
      };
      let tLand = 0;
      {
        const o2 = {};
        for (let tau = 0; tau < 4; tau += 0.01) {
          path(tau, o2);
          if (o2.y <= 0.05) {
            tLand = tau;
            break;
          }
        }
      }
      const land = path(tLand, {}), flow = 1.5, f = FUELS.napalm, Qpot = flow / 1e3 * f.rho * f.dHc, o = {};
      const bale = strawStack({ lod: Math.min(ctx.lod, 3), nx: 1, ny: 1, nz: 1, seed: 8 });
      bale.position.set(land.x + 1.6, 0, -0.6);
      ctx.add(bale);
      const bb = fx.addBurnable({ label: "bal\xEDk sl\xE1my", pos: bale.position.clone(), material: "straw", mass: 120, area: 6, size: 1.2, height: 0.5, probe: [-0.7, 0.4, 0.3], char: bale.userData.char, fireY: 0.5, seed: 4 });
      const nG = ctx.tier.id === 0 ? 1 : 3, ground = [];
      let landed = 0, acc = 0;
      for (let i = 0; i < nG; i++) ground.push(fx.addSource({
        pos: V4(land.x + (i - (nG - 1) / 2) * 1.3, 0.01, i % 2 * 0.3 - 0.15),
        fuel: "napalm",
        seed: 30 + i,
        volume: true,
        D: 1.3,
        shapeK: 1.4,
        volSoot: 0.4,
        mult: { smoke: 1.6 },
        end: Infinity,
        Q: () => {
          const m = landed / nG;
          return Math.min(22e5, m * f.dHc / 14);
        }
      }));
      fx.addScorch({ pos: V4(land.x, 0, 0), radius: 2.6, rate: 1 / 20, glow: 0.2, seed: 6 });
      return {
        update(dt, t) {
          const on = t % 11 > 1 && t % 11 < 4;
          if (on) {
            landed += 0.65 * (flow / 1e3) * f.rho * dt;
            acc += fx.dtReal * (ctx.tier.id === 0 ? 90 : ctx.tier.id >= 4 ? 320 : 200) * Math.max(0.35, fx.budgetScale.flame);
            const big = ctx.tier.id === 0 ? 1.7 : 1;
            while (acc >= 1) {
              acc -= 1;
              const tau = r() * tLand, k = tau / tLand;
              path(tau, o);
              fx.bb.spawnFirePuff({
                x: o.x,
                y: Math.max(0.1, o.y + (r() - 0.5) * 0.25 * (0.3 + k)),
                z: muz.z + (r() - 0.5) * 0.3 * (0.2 + k),
                vx: o.vx * 0.55,
                vy: o.vy * 0.55 + 1.2 * k,
                vz: (r() - 0.5) * 1.5,
                life: 0.28 + 0.5 * r(),
                s0: (0.14 + 0.5 * k) * big,
                s1: (0.5 + 1.4 * k) * big,
                T: 1500 - 150 * k,
                lum: 1.2,
                soot: 0.25 + 0.45 * k,
                drag: 1.6,
                buoy: 2.5 * k,
                seed: r()
              });
              if (ctx.tier.id > 0 && r() < 0.22) fx.bb.spawnSmoke({ x: o.x, y: o.y + 0.4, z: muz.z, vx: o.vx * 0.3, vy: 1.5 + 2 * r(), vz: r() - 0.5, life: 3 + 3 * r(), s0: 0.4, s1: 2.5, tau: 1.6, albedo: [0.05, 0.045, 0.04], drag: 0.8 });
            }
            fx.lights.add(muz.x + 4, muz.y + 1, muz.z, 6e5, 1500, 1.5);
          }
          landed = Math.max(0, landed - ground.reduce((s, g2) => s + (g2.ph ? g2.ph.Q : 0), 0) / f.dHc * dt);
        },
        info: () => [
          ["Palivo", f.name, "\u0394Hc 43 MJ/kg"],
          ["Pr\u016Ftok", flow + " l/s, 30 m/s", "p\u0159enosn\xFD plamenomet ~1,9 l/s \u26053"],
          ["Dolet", land.x.toFixed(1) + " m za " + tLand.toFixed(2) + " s", "balistika s odporem \u26052"],
          ["Potenci\xE1ln\xED v\xFDkon", fmtW(Qpot), "kdyby sho\u0159elo v\u0161e nar\xE1z"],
          ["Ho\u0159\xED ve vzduchu / dopadne", "~35 % / ~65 %", "\u26052"],
          ["Na zemi te\u010F", landed.toFixed(2) + " kg, " + fmtW(ground.reduce((s, g2) => s + (g2.ph ? g2.ph.Q : 0), 0)), ""],
          [bb.label, `${kW2(bb.q)} \xB7 ${bb.state === "burning" ? "HO\u0158\xCD" : bb.state === "burnt" ? "vyho\u0159elo" : "d\xE1vka " + (bb.heat * 100).toFixed(0) + " %"}`, "pr\xE1h sl\xE1my 8 kW/m\xB2"],
          ["S\xE1l\xE1n\xED u obsluhy", kW2(fx.heatFlux([muz.x - 0.5, 1.5, 0]).total) + " \u2013 " + fluxEffect(fx.heatFlux([muz.x - 0.5, 1.5, 0]).total), ""]
        ]
      };
    }
  },
  {
    id: "jetFire",
    group: "Z\xE1\u017Eeh",
    name: "Tryskov\xFD plamen: ho\u0159\xE1k \u2192 utr\u017Een\xFD ventil",
    ground: "concrete",
    time: "noc",
    duration: 3600,
    desc: "Plyn pod tlakem ho\u0159\xED jinak ne\u017E lou\u017Ee: hybnost proudu p\u0159evl\xE1d\xE1 nad vztlakem, plamen je dlouh\xFD, \xFAzk\xFD, hlu\u010Dn\xFD a u trysky modr\xFD. Jedna korelace (Lowesmith: L = 2,89\xB7Q^0,37) plat\xED od opalovac\xEDho ho\u0159\xE1ku (2 g/s, 100 kW, 1,2 m) po utr\u017Een\xFD ventil lahve (200 g/s, 9 MW, 6,6 m). Posu\u0148 pr\u016Ftok a sleduj d\xE9lku, v\xFDkon a s\xE1l\xE1n\xED.",
    tiers: ["T0\u2013T1: plo\u0161n\xE9 jazyky bez modr\xE9 paty", "T2\u2013T3: objemov\xFD plamen s modrou patou, tetelen\xED", "T4\u2013T5: + jemn\xE1 turbulence, objemov\xFD kou\u0159 u velk\xFDch pr\u016Ftok\u016F"],
    cams: [{ name: "celek", pos: [3.4, 1.6, 4.2], target: [1.3, 1.5, 0] }, { name: "detail ho\u0159\xE1ku", pos: [2.1, 0.9, 1.1], target: [1.35, 1, 0] }, { name: "z d\xE1lky", pos: [8, 3, 14], target: [1.3, 3.5, 0] }],
    controls: [{ id: "jetFlow", label: "Pr\u016Ftok plynu [g/s]", type: "range", min: 0.02, max: 300, value: 2.2, log: true }],
    build(ctx) {
      const cyl = propaneCylinder({ lod: ctx.lod });
      ctx.add(cyl);
      cyl.updateMatrixWorld(true);
      const nz = wpos(cyl, cyl.userData.nozzle);
      let sp = fireSpec({ kind: "jet", fuel: "propane", mdot: (ctx.controls.jetFlow ?? 2.2) / 1e3 }), last = -1;
      const src = ctx.fx.addSource({ pos: nz.clone(), seed: 5, volume: true, ...sourceOptions(sp), end: Infinity, Q: () => sp.Qpeak, L: (q) => sp.extra.L ? sp.extra.L(q) : sp.L });
      const shell2 = ctx.fx.addBurnable({ pos: V4(0, 0, 0), material: "steelPainted", char: cyl.userData.char, probe: [0.1, 0.5, 0], label: "pl\xE1\u0161\u0165 lahve" });
      return {
        update() {
          const fl = ctx.controls.jetFlow ?? 2.2;
          if (fl !== last) {
            last = fl;
            sp = fireSpec({ kind: "jet", fuel: "propane", mdot: fl / 1e3 });
            src.D = sp.D;
            const { mult, ...ex } = sp.extra;
            Object.assign(src.o, ex, { L: (q) => sp.extra.L ? sp.extra.L(q) : sp.L });
            Object.assign(src.o.mult, mult);
          }
        },
        info: () => [
          ...sp.rows,
          ...fireRows(src).slice(1, 5),
          ["D\xE9lka podle korelace", jetFlameLength(sp.Qpeak).toFixed(2) + " m", "Lowesmith 2007 \u26054"],
          ["L\xE1hev 10 kg vydr\u017E\xED", mmss(10 / sp.mdot), ""],
          ["S\xE1l\xE1n\xED ve 2 m od plamene", kW2(ctx.fx.heatFlux([nz.x + 2, nz.y + sp.L * 0.5, 0]).total) + " \u2013 " + fluxEffect(ctx.fx.heatFlux([nz.x + 2, nz.y + sp.L * 0.5, 0]).total), "bodov\xFD zdroj \u26053"],
          ["Pl\xE1\u0161\u0165 lahve", degC2(shell2.Ts), "plamen nesm\xED olizovat l\xE1hev: roztr\u017Een\xED (viz Acetylenov\xE1 l\xE1hev)"],
          ["Ha\u0161en\xED", "plamen plynu nehasit \u2013 uzav\u0159\xEDt ventil; uha\u0161en\xFD \xFAnik = v\xFDbu\u0161n\xFD oblak", "t\u0159\xEDda C"]
        ]
      };
    }
  },
  {
    id: "trail",
    group: "Kapaliny",
    name: "Ho\u0159\xEDc\xED stopa k sudu",
    ground: "concrete",
    time: "soumrak",
    duration: 60,
    loop: true,
    desc: "Stopa rozlit\xE9ho paliva 12 m dlouh\xE1 vede k sudu. Benz\xEDn je nad bodem vzplanut\xED: plamen b\u011B\u017E\xED parami nad hladinou 1,7 m/s a je u sudu za 7 sekund. Nafta je pod bodem vzplanut\xED (55 \xB0C): \u010Delo plamene si mus\xED kapalinu p\u0159ed sebou oh\u0159\xE1t a leze 5 cm/s \u2013 \u010Dty\u0159i minuty. Sud se zbytkem benz\xEDnu po oh\u0159\xE1t\xED pl\xE1\u0161t\u011B vybuchne ohnivou koul\xED.",
    tiers: ["T0\u2013T1: 4 \xFAseky stopy, plo\u0161n\xE9 plameny", "T2\u2013T3: 6 \xFAsek\u016F s objemov\xFDm plamenem, \u010Dern\xFD kou\u0159", "T4\u2013T5: + objemov\xFD kou\u0159, pln\xE1 ohniv\xE1 koule sudu"],
    cams: [{ name: "celek", pos: [6, 3.5, 13], target: [6, 1, 0] }, { name: "od zap\xE1len\xED", pos: [-2.5, 1.7, 2], target: [8, 0.5, 0] }, { name: "u sudu", pos: [15, 1.8, 5], target: [12, 0.8, 0] }],
    controls: [{ id: "trFuel", label: "Palivo", type: "select", value: "gasoline", options: ["gasoline", "diesel"], restart: true }],
    build(ctx) {
      const fx = ctx.fx, fuel = ctx.controls.trFuel || "gasoline", len = 12, w = 0.28, N2 = ctx.tier.id === 0 ? 4 : 6, seg = len / N2;
      const sp = fireSpec({ kind: "line", fuel, length: len, width: w, depthMM: 1.2 }), v = liquidSpread(fuel), tIgn = 2;
      if (fuel === "diesel") ctx.setTimeScale(8);
      const strip2 = spillStrip({ lod: ctx.lod, len, w: w * 1.3, seed: 9 });
      ctx.add(strip2);
      const drum = barrel({ lod: ctx.lod, paint: "metalRed" });
      drum.position.set(len + 0.5, 0, 0);
      ctx.add(drum);
      const srcs = [];
      for (let i = 0; i < N2; i++) {
        const xc = (i + 0.5) * seg, start = tIgn + xc / v;
        srcs.push(fx.addSource({
          pos: V4(xc, 0.01, 0),
          fuel,
          seed: 20 + i * 3,
          volume: true,
          footprint: { type: "rect", w: seg * 1.5, d: w * 1.2 },
          start,
          end: start + sp.duration,
          shapeK: 1.45,
          taper: 0.6,
          puffAmp: 0.7,
          volSoot: 0.3,
          mult: { smoke: 1.3, haze: 0.4 },
          Q: (t) => sp.Qpeak / N2 * Math.min(1, t / (fuel === "diesel" ? 10 : 1.2)) * (t > sp.duration - 4 ? Math.max(0, (sp.duration - t) / 4) : 1)
        }));
      }
      const es = explosionSpec({ kind: "fireball", fuel: "gasoline", mass: 12 });
      const b = fx.addBurnable({
        label: "sud (zbytek 15 l benz\xEDnu)",
        pos: drum.position.clone(),
        material: "steelPainted",
        char: drum.userData.char,
        probe: [-0.3, 0.3, 0],
        explosive: { spec: es, cookT: 560, rcd: 7850 * 490 * 12e-4 },
        onEvent: (type, bb) => {
          if (type === "exploded") {
            drum.visible = false;
            bb.tBoom = ctx.t;
            ctx.setTimeScale(1);
          }
        }
      });
      drum.userData.char.uHeatFall.value = 0.3;
      return {
        info: () => [
          ...sp.rows,
          ["Palivo", FUELS[fuel].name, `bod vzplanut\xED ${degC2(MATERIALS[fuel].flash)}`],
          ["\u010Celo plamene u sudu za", mmss(len / v), `${len} m / ${v >= 1 ? v.toFixed(1) + " m/s" : (v * 100).toFixed(0) + " cm/s"}`],
          ["V\xFD\u0161ka plamen\u016F stopy", sp.L.toFixed(2) + " m", "Yuan & Cox \u26054"],
          ["V\xFDkon cel\xE9 stopy", fmtW(srcs.reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0)), ""],
          ["Pl\xE1\u0161\u0165 sudu", b.tBoom != null ? `vybuchl v ${mmss(b.tBoom)}` : `${degC2(b.body.ex.Tc)} (tok ${kW2(b.q)})`, "roztr\u017Een\xED p\u0159i ~290 \xB0C pl\xE1\u0161t\u011B \u26052"],
          ...es.rows.slice(1)
        ]
      };
    }
  }
];
var EX_FUELS = { "palety (A)": "A", "nafta (B)": "B", "benz\xEDn (B)": "B", "ho\u0159\u010D\xEDk (D)": "D" };
var ITER7_AFTER = [
  {
    id: "extinguish",
    group: "Ha\u0161en\xED",
    name: "Ha\u0161en\xED: hasivo \xD7 co ho\u0159\xED",
    ground: "concrete",
    time: "soumrak",
    duration: 80,
    desc: "Jedna tabulka pravidel: hasivo \xD7 t\u0159\xEDda po\u017E\xE1ru. Voda chlad\xED (2,6 MJ na kilogram odpa\u0159en\xE9 vody) a na ho\u0159\xEDc\xED d\u0159evo sta\u010D\xED ~0,4 l/s na megawatt; na benz\xEDn je k ni\u010Demu, proto\u017Ee ho rozst\u0159\xEDkne, a ho\u0159\u010D\xEDk nebo rozp\xE1len\xFD olej s n\xED vybuchnou. P\u011Bna od\u0159\xEDzne p\xE1ry od vzduchu, pr\xE1\u0161ek zastav\xED reakci v plameni, ale nechlad\xED \u2013 d\u0159evo po n\u011Bm znovu vzplane. Zvol, co ho\u0159\xED a \u010D\xEDm has\xED\u0161; hasit se za\u010D\xEDn\xE1 v 10. sekund\u011B.",
    tiers: ["T0\u2013T1: proud 60 kapek/s, p\xE1ra 8 obl\xE1\u010Dk\u016F/s", "T2\u2013T3: 150\u2013250 kapek/s, p\xE1ra podle odpa\u0159en\xE9 vody, p\u011Bnov\xFD koberec", "T4\u2013T5: + objemov\xFD kou\u0159 sl\xE1bnouc\xEDho ohn\u011B"],
    cams: [{ name: "celek", pos: [-1.2, 2.4, 6.5], target: [-1.2, 0.9, 0] }, { name: "hasi\u010D", pos: [-5.2, 1.7, 1.2], target: [0, 0.6, 0] }, { name: "detail ohn\u011B", pos: [1.8, 1.3, 2.6], target: [0, 0.6, 0] }],
    controls: [
      { id: "exFuel", label: "Co ho\u0159\xED", type: "select", value: "palety (A)", options: Object.keys(EX_FUELS), restart: true },
      { id: "exAgent", label: "Hasivo", type: "select", value: "waterJet", options: Object.keys(AGENTS), restart: true }
    ],
    build(ctx) {
      const fx = ctx.fx, what = ctx.controls.exFuel || "palety (A)", agent = ctx.controls.exAgent || "waterJet", cls = EX_FUELS[what], a = AGENTS[agent];
      const dist = Math.min(4.2, a.reach * 0.8), nz = nozzle({ lod: ctx.lod, elev: 0.12 });
      nz.position.set(-dist, 0, 0);
      ctx.add(nz);
      nz.updateMatrixWorld(true);
      let burn = null, src = null, A = 1, sp;
      if (cls === "A") {
        for (let i = 0; i < 2; i++) {
          const p = pallet({ lod: ctx.lod });
          p.position.set(0.02 * i, i * 0.146, 0.02 * i);
          p.rotation.y = i * 0.15;
          ctx.add(p);
          if (!i) burn = p;
        }
        sp = fireSpec({ kind: "pile", material: "softwood", mass: 44, stick: 0.03, D: 1.1, tGrow: 7 });
        A = 7;
        burn = fx.addBurnable({ label: "2 palety", pos: V4(0, 0, 0), material: "softwood", mass: 44, area: A, size: 1.2, ignited: true, spec: sp, char: burn.userData.char, seed: 3, source: { footprint: { type: "rect", w: 1.2, d: 0.8 } } });
      } else if (cls === "B") {
        const fuel = what.startsWith("nafta") ? "diesel" : "gasoline", D = 1.2;
        A = Math.PI * D * D / 4;
        const disc = new THREE26.Mesh(new THREE26.CircleGeometry(D / 2, 40), new THREE26.MeshStandardMaterial({ color: 723464, roughness: 0.05 }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 6e-3;
        ctx.add(disc);
        sp = fireSpec({ kind: "pool", fuel, D, depth: 0.02 });
        src = fx.addSource({ pos: V4(0, 0.01, 0), seed: 5, volume: true, ...sourceOptions(sp), end: Infinity, Q: (t) => sp.Qpeak * Math.min(1, t / 4), mult: { smoke: 1.5 }, label: FUELS[fuel].name });
      } else {
        const pile = new THREE26.Mesh(new THREE26.ConeGeometry(0.16, 0.1, 12), new THREE26.MeshStandardMaterial({ color: 12172480, roughness: 0.4, metalness: 0.9 }));
        pile.position.y = 0.05;
        ctx.add(pile);
        sp = fireSpec({ kind: "metal", fuel: "magnesium", mass: 2, duration: 150 });
        A = 0.1;
        src = fx.addSource({ pos: V4(0, 0.06, 0), seed: 5, volume: true, ...sourceOptions(sp), end: Infinity, Q: (t) => sp.Qpeak * Math.min(1, t / 3), label: "ho\u0159\u010D\xEDk" });
      }
      const spray = fx.addSpray({ agent, from: wpos(nz, nz.userData.muzzle), to: V4(0, cls === "A" ? 0.3 : 0.05, 0), radius: 0.9, on: false, seed: 4 });
      const e = agentEffect(agent, cls);
      let tOut = null, said = false;
      return {
        update(dt, t) {
          spray.on = t > 10 && t < 55;
          const out = burn ? burn.state === "uha\u0161eno" : src && !src.enabled;
          if (out && tOut == null) {
            tOut = t;
            ctx.message("Uha\u0161eno za " + (t - 10).toFixed(0) + " s.");
          }
          if (!said && t > 13 && e.k < 0) {
            said = true;
            ctx.message("Pozor: " + a.name + " tento po\u017E\xE1r zhor\u0161uje \u2013 " + e.note + ".");
          }
          this.Q = burn ? burn.src?.ph?.Q || 0 : src.ph?.Q || 0;
        },
        info() {
          const Q0 = sp.Qpeak;
          return [
            ["Co ho\u0159\xED", what, "t\u0159\xEDda " + cls],
            ["V\xFDkon bez ha\u0161en\xED", fmtW(Q0), ""],
            ["V\xFDkon te\u010F", fmtW(this.Q || 0), ""],
            ...spray.rows(cls, Q0, A),
            ["Pot\u0159eba hasiva", a.mode === "cool" ? (waterDemand(Q0, agent) * 60).toFixed(0) + " l/min" : "\u2014", "F = 0,5\xB7Q / (\u03B7\xB72,6 MJ/kg) \u26053"],
            ["Dod\xE1no", spray.used.toFixed(1) + (a.total ? " / " + a.total : "") + " kg", ""],
            ["Stav", tOut != null ? "UHA\u0160ENO za " + (tOut - 10).toFixed(0) + " s" : spray.active ? e.k < 0 ? "ZHOR\u0160UJE SE" : e.k === 0 ? "bez \xFA\u010Dinku" : "has\xED se" : "ho\u0159\xED", burn ? `potla\u010Den\xED ${(burn.supp.s * 100).toFixed(0)} %, voda na povrchu ${burn.supp.wet.toFixed(1)} kg/m\xB2` : src?.supp ? `potla\u010Den\xED ${(src.supp.s * 100).toFixed(0)} %` : ""],
            ["Pravidlo", e.note || "\u2014", "physics/suppress.js"]
          ];
        }
      };
    }
  },
  {
    id: "aftermath",
    group: "N\xE1sledky",
    name: "N\xE1sledky: saze na zdi, sklo, hlin\xEDk",
    ground: "concrete",
    time: "den",
    timeScale: 12,
    duration: 1500,
    desc: "T\u0159i palety ho\u0159\xED u om\xEDtnut\xE9 zdi (~1,3 MW). Saze stoupaj\xED s kou\u0159em a usazuj\xED se na chladn\xE9 st\u011Bn\u011B do tvaru V; u ohniska je ze\u010F tak hork\xE1 (nad ~430 \xB0C), \u017Ee saze sho\u0159\xED \u2013 sv\u011Btl\xFD \u201E\u010Dist\xFD v\xFDpal\u201C s \u010Dern\xFDm lemem, podle kter\xE9ho vy\u0161et\u0159ovatel\xE9 hledaj\xED ohnisko. Okenn\xED tabule opod\xE1l praskne, kdy\u017E se st\u0159ed oh\u0159eje o ~70 \xB0C v\xEDc ne\u017E okraj v r\xE1mu, a vypadne p\u0159i toku nad 20 kW/m\xB2. Lit\xFD disk v plamenech se p\u0159i 660 \xB0C roztav\xED a ste\u010De do lou\u017Ee; ocel jen ztrat\xED lak.",
    tiers: ["T0\u2013T1: stopy na zdi jedn\xEDm pr\u016Fchodem, st\u0159epy 12 kus\u016F", "T2\u2013T3: + objemov\xFD plamen, st\u0159epy 60 kus\u016F, \u017Ehnouc\xED lou\u017Ee", "T4\u2013T5: + objemov\xFD kou\u0159, pln\xE9 rozli\u0161en\xED \u0161umu stop"],
    cams: [{ name: "celek", pos: [1.2, 2, 6.4], target: [0.6, 1.3, -0.3] }, { name: "ze\u010F po po\u017E\xE1ru", pos: [0, 1.7, 4.2], target: [0, 1.5, -0.6] }, { name: "okno a disk", pos: [3.6, 1.2, 2.6], target: [1.2, 0.6, 0.2] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(5), W = wall({ lod: ctx.lod, w: 5, h: 3.2, t: 0.3 });
      W.position.set(0, 0, -0.75);
      ctx.add(W);
      const pal = [];
      for (let i = 0; i < 3; i++) {
        const p = pallet({ lod: ctx.lod });
        p.position.set(0.02 * i, i * 0.146, 0.02 * i - 0.05);
        p.rotation.y = i * 0.12;
        ctx.add(p);
        pal.push(p);
      }
      const core = fx.addBurnable({ label: "3 palety", pos: V4(0, 0, 0), material: "softwood", mass: 66, area: 10.5, size: 1.2, D: 1.15, ignited: true, char: pal[0].userData.char, seed: 3, source: { footprint: { type: "rect", w: 1.2, d: 0.8 } } });
      const lo = fx.addBurnable({ label: "ze\u010F u ohniska (0,8 m)", pos: V4(0, 0, -0.6), material: "masonry", probe: [0, 0.8, 0] }), hi = fx.addBurnable({ label: "ze\u010F naho\u0159e (2,6 m)", pos: V4(0, 0, -0.6), material: "masonry", probe: [0, 2.6, 0] });
      const soot = fx.addWallSoot({ pos: V4(0, 1.6, -0.6), axis: "z", sign: 1, w: 5, h: 3.2, fire: [2.5, 0], b0: 0.65, Lf: 2.2, seed: 4 });
      const gp = glassPane({ w: 1, h: 1.2, seed: 6 });
      gp.position.set(2.1, 0.95, 0.5);
      gp.rotation.y = -1.15;
      ctx.add(gp);
      const fr = new THREE26.Mesh(new THREE26.BoxGeometry(1.1, 0.3, 0.12), makeMaterial("plaster"));
      fr.position.set(2.1, 0.17, 0.5);
      fr.rotation.y = -1.15;
      ctx.add(fr);
      const gb = fx.addBurnable({
        label: "okno (" + Math.hypot(2.1, 0.5).toFixed(1) + " m)",
        pos: V4(2.1, 0, 0.5),
        material: "glass",
        probe: [0, 0.95, 0],
        onEvent: (type) => {
          if (type === "crack") {
            gp.userData.setCrack(1);
            ctx.message("Okno prasklo (st\u0159ed o 70 \xB0C teplej\u0161\xED ne\u017E okraj).");
            if (fx.audioEvents.length < 64) fx.audioEvents.push({ type: "pop", pos: gp.position.clone() });
          }
          if (type === "fallout") {
            gp.visible = false;
            fx.debris.burst(gp.position.clone(), { n: ctx.tier.id > 0 ? 60 : 12, speed: 2.5, size: 0.03, hot: 0, up: 0.2 }, r);
            ctx.message("Sklo vypadlo.");
          }
        }
      });
      const wh = aluWheel({ lod: ctx.lod });
      wh.position.set(-0.6, 0, 0.5);
      ctx.add(wh);
      const pud = meltPuddle({ lod: ctx.lod, R: 0.5 });
      pud.position.set(-0.68, 4e-3, 0.6);
      ctx.add(pud);
      const ab = fx.addBurnable({ label: "lit\xFD disk (hlin\xEDk)", pos: wh.position.clone(), material: "aluminium", probe: [0.3, 0.12, -0.25] });
      const dr = barrel({ lod: ctx.lod, paint: "metalBlue" });
      dr.position.set(-1.9, 0, 0.3);
      ctx.add(dr);
      dr.userData.char.uHeatFall.value = 0.25;
      const sb = fx.addBurnable({ label: "ocelov\xFD sud (1,9 m)", pos: dr.position.clone(), material: "steelPainted", char: dr.userData.char, probe: [0.3, 0.5, -0.05] });
      fx.addScorch({ pos: V4(0, 0, 0), radius: 1.7, rate: 1 / 500, glow: 0.3, seed: 3 });
      return {
        update() {
          const ml = masonryLook(lo.Tmax, 1);
          this.sootK = Math.min(1, (this.sootK || 0) + (fx.scnDt || 0) * (core.src?.ph?.Q || 0) / 1e6 / 240);
          soot.u.uSoot.value = Math.max(soot.u.uSoot.value, this.sootK, hi.soot);
          soot.u.uClean.value = Math.max(soot.u.uClean.value, ml.cleanBurn);
          if (core.src?.ph) soot.u.uLf.value = Math.max(soot.u.uLf.value * 0.999, core.src.ph.L);
          gp.userData.setSoot(Math.min(0.6, gb.soot));
          soot.fireLit = Math.min(0.35, (core.src?.ph?.Q || 0) / 4e6);
          wh.scale.y = Math.max(0.06, 1 - 0.94 * ab.melt);
          wh.scale.x = wh.scale.z = 1 + 0.15 * ab.melt;
          pud.scale.setScalar(Math.max(1e-3, 0.5 * Math.sqrt(ab.melt)));
          const gl = Math.max(0, Math.min(1, (ab.Ts - 800) / 200));
          pud.userData.mat.emissive.setRGB(0.9 * gl, 0.25 * gl, 0.05 * gl);
          wh.userData.mat.color.setRGB(0.79 - 0.5 * ab.soot, 0.8 - 0.5 * ab.soot, 0.82 - 0.5 * ab.soot);
          for (let i = 1; i < 3; i++) {
            const u = pal[i].userData.char, u0 = pal[0].userData.char;
            u.uChar.value = u0.uChar.value;
            u.uGlow.value = u0.uGlow.value;
          }
          if (core.state === "burning" || core.state === "burnt") pal.forEach((p, i) => {
            p.scale.y = 1 - 0.6 * core.burned ** 1.5;
            p.position.y = i * 0.146 * p.scale.y;
          });
        },
        info() {
          const ml = masonryLook(lo.Tmax, lo.soot);
          return [
            ["Ohnisko", core.state === "burnt" ? "vyho\u0159elo" : fmtW(core.src?.ph?.Q || 0), "3 palety, 66 kg"],
            [lo.label, `${kW2(lo.q)} \xB7 ${degC2(lo.Ts)} (max ${degC2(lo.Tmax)})`, ml.cleanBurn > 0.5 ? "\u010Dist\xFD v\xFDpal (saze sho\u0159ely)" : lo.Tmax > 570 ? "om\xEDtka prask\xE1, r\u016F\u017Eov\xED" : "saze"],
            [hi.label, `${kW2(hi.q)} \xB7 ${degC2(hi.Ts)}`, hi.Tmax > 700 ? "v plameni: saze tu sho\u0159\xED" : "saze"],
            ["Saze na zdi kolem plamene", ((this.sootK || 0) * 100).toFixed(0) + " %", "\u010Das \xD7 v\xFDkon, kalibrace na fotky \u26052"],
            [gb.label, `${kW2(gb.q)} \xB7 sklo ${degC2(gb.Ts)} \xB7 ${gb.state === "cold" ? "cel\xE9" : gb.state}`, "prasknut\xED \u0394T 70 K \u26054, vypadnut\xED 20 kW/m\xB2 \u26052"],
            [ab.label, `${degC2(ab.Ts)} \xB7 roztaveno ${(ab.melt * 100).toFixed(0)} %`, "t\xE1n\xED 660 \xB0C \u26055"],
            [sb.label, `${degC2(sb.Ts)} (max ${degC2(sb.Tmax)}) \u2013 ${sb.state === "cold" ? "beze zm\u011Bny" : sb.state}`, "ocel taje a\u017E p\u0159i 1 500 \xB0C"],
            ["Co \u010Dte vy\u0161et\u0159ovatel", "V ukazuje k ohnisku; \u010Dist\xFD v\xFDpal = nejdel\u0161\xED a nejhork\u011Bj\u0161\xED ho\u0159en\xED; roztaven\xFD hlin\xEDk = p\u0159es 660 \xB0C", "NFPA 921 \u26054"]
          ];
        }
      };
    }
  },
  {
    id: "flashover",
    group: "N\xE1sledky",
    name: "M\xEDstnost: celkov\xE9 vzplanut\xED a plameny z okna",
    ground: "dirt",
    time: "soumrak",
    timeScale: 6,
    duration: 700,
    desc: "Pokoj 4 \xD7 3,5 m s jedn\xEDm oknem. Ohe\u0148 roste s druhou mocninou \u010Dasu, hork\xE1 vrstva pod stropem s\xEDl\xED. Kolem 100\u2013150 \xB0C prask\xE1 okno, p\u0159i ~360 \xB0C vypadne. Jakmile vrstva dos\xE1hne ~500\u2013600 \xB0C (tady p\u0159i 1,3 MW, po necel\xFDch 3 minut\xE1ch), vzplane nar\xE1z v\u0161echno v m\xEDstnosti. D\xE1l u\u017E rozhoduje vzduch: oknem ho projde jen na 3 MW, zbytek ho\u0159lav\xFDch plyn\u016F ho\u0159\xED venku \u2013 plameny \u0161lehaj\xED 2,5 m nad okno a zapaluj\xED patro nad n\xEDm.",
    tiers: ["T0\u2013T1: jeden plo\u0161n\xFD plamen uvnit\u0159 a jeden v okn\u011B, stopy na fas\xE1d\u011B", "T2\u2013T3: objemov\xE9 plameny, kou\u0159 val\xEDc\xED se pod nadpra\u017E\xEDm, st\u0159epy", "T4\u2013T5: + objemov\xFD kou\u0159, \u017Ehnouc\xED interi\xE9r"],
    cams: [{ name: "p\u0159ed domem", pos: [4.5, 2.2, 8.5], target: [0, 2.2, 1.5] }, { name: "z boku", pos: [7.5, 3, 3.5], target: [0, 2.4, 2] }, { name: "detail okna", pos: [1.6, 1.7, 5], target: [0, 1.8, 2] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(6), dim = { w: 4, d: 3.5, H: 2.6, win: [1.2, 1.4], sill: 0.9 };
      const R = room({ lod: ctx.lod, ...dim });
      ctx.add(R);
      const ud = R.userData, zf = ud.front, wy = ud.window.cy, top = dim.sill + dim.win[1];
      const up = wall({ lod: ctx.lod, w: 4.5, h: 2.6, t: 0.25 });
      up.position.set(0, dim.H + 0.18, zf - 0.125);
      ctx.add(up);
      const sofa = new THREE26.Mesh(new THREE26.BoxGeometry(1.8, 0.7, 0.8), new THREE26.MeshStandardMaterial({ color: 5982778, roughness: 0.95 }));
      sofa.position.set(-0.9, 0.41, -1.1);
      ctx.add(sofa);
      const gp = glassPane({ w: dim.win[0] - 0.1, h: dim.win[1] - 0.1, seed: 2 });
      gp.position.set(0, wy, zf - 0.12);
      ctx.add(gp);
      const sp = fireSpec({ kind: "room", floor: [dim.w, dim.d], H: dim.H, opening: dim.win, load: 25 }), rm = sp.room;
      const seat = fx.addSource({ pos: V4(-0.9, 0.78, -1.1), fuel: "houseContents", seed: 3, volume: true, D: 0.9, end: Infinity, Q: (t) => t < rm.tFo ? sp.Q(t) : 0, L: (q) => Math.max(0.08, Math.min(dim.H - 0.9, 0.235 * Math.pow(q / 1e3, 0.4) - 0.9)) });
      const full = fx.addSource({ pos: V4(0, 0.08, 0), fuel: "houseContents", seed: 4, volume: true, D: 3, footprint: { type: "rect", w: dim.w - 0.5, d: dim.d - 0.5 }, start: rm.tFo, end: Infinity, Q: (t) => Math.min(rm.Qin, sp.Q(t + rm.tFo)) * Math.min(1, t / 6), L: () => dim.H - 0.25, mult: { smoke: 0.3 } });
      const win = fx.addSource({
        pos: V4(0, dim.sill + 0.55, zf + 0.22),
        fuel: "houseContents",
        seed: 5,
        volume: true,
        D: 1.1,
        footprint: { type: "rect", w: dim.win[0] - 0.15, d: 0.35 },
        start: rm.tFo + 2,
        end: Infinity,
        shapeK: 1.3,
        Q: (t) => (rm.Qext + 0.25 * rm.Qin) * Math.min(1, t / 5) * (sp.Q(t + rm.tFo + 2) / sp.Qpeak),
        L: () => rm.zf + dim.win[1] * 0.6,
        mult: { smoke: 1.8 }
      });
      const soot = fx.addWallSoot({ pos: V4(0, top + 1.55, zf), axis: "z", sign: 1, w: 4.4, h: 3.1, fire: [2.2, 0], b0: 0.6, Lf: rm.zf, seed: 8 });
      let glass = { T: 293, state: "cel\xE9" }, acc = 0, tCrack = null, tFall = null, said = false;
      return {
        update(dt, t) {
          const Q = sp.Q(t), Tl = rm.layerT(Math.min(Q, rm.Qin)), qg = 0.5 * 567e-10 * (Tl ** 4 - 293 ** 4) + 15 * (Tl - 293) * 0.5;
          this.Tl = Tl;
          this.Q = Q;
          const g0 = glass.state;
          glass = stepGlass(glass, qg, Tl, dt);
          if (glass.state !== g0) {
            if (glass.state === "popraskan\xE9") {
              tCrack = t;
              gp.userData.setCrack(1);
            } else {
              tFall = t;
              gp.visible = false;
              fx.debris.burst(V4(0, wy, zf + 0.1), { n: ctx.tier.id > 0 ? 70 : 14, speed: 3, size: 0.03, hot: 0, up: 0.15 }, r);
              ctx.message("Okno vypadlo \u2013 ohe\u0148 dostal vzduch.");
            }
          }
          gp.userData.setSoot(Math.min(0.95, (Tl - 293) / 250));
          if (!said && t >= rm.tFo) {
            said = true;
            ctx.message("Celkov\xE9 vzplanut\xED: ho\u0159\xED cel\xE1 m\xEDstnost, plameny jdou oknem ven.");
          }
          if (tFall != null && fx.layers.smoke) {
            acc += fx.dtReal * Math.min(40, 4 + 20 * Math.sqrt(Q / 1e6)) * (fx.tier.smokeMul ?? 1) * Math.max(0.3, fx.budgetScale.smoke);
            while (acc >= 1) {
              acc -= 1;
              fx.bb.spawnSmoke({ x: (r() - 0.5) * dim.win[0] * 0.8, y: top - 0.25 * r(), z: zf + 0.1, vx: (r() - 0.5) * 0.5, vy: 1.5 + 1.5 * r(), vz: 1.2 + 1.2 * r(), life: 4 + 4 * r(), s0: 0.35, s1: 2.6 + 1.5 * r(), tau: 1.4, albedo: [0.07, 0.065, 0.06], drag: 0.5, glowing: t > rm.tFo && r() < 0.3 });
            }
          }
          const k = t < rm.tFo ? 0 : Math.min(1, (t - rm.tFo) / 240);
          soot.u.uSoot.value = Math.max(soot.u.uSoot.value, tFall != null ? Math.min(1, 0.25 * (t - tFall) / 120 + k) : 0);
          soot.u.uClean.value = Math.max(soot.u.uClean.value, k * 0.9);
          if (t >= rm.tFo) sofa.material.color.setRGB(0.05, 0.04, 0.035);
          soot.fireLit = Math.min(0.5, (win.ph?.Q || 0) / 2e6);
        },
        info() {
          return [
            ...sp.rows,
            ["V\xFDkon te\u010F", fmtW(this.Q || 0), "r\u016Fst t\xB2 \u201Efast\u201C \u26053"],
            ["Hork\xE1 vrstva pod stropem", degC2(this.Tl || 293), "MQH 1981 \u26054"],
            ["Okno", glass.state + (tCrack != null ? ` (prasklo v ${mmss(tCrack)}${tFall != null ? ", vypadlo v " + mmss(tFall) : ""})` : ""), `sklo ${degC2(glass.T)}`],
            ["Uvnit\u0159 ho\u0159\xED nejv\xFD\u0161", fmtW(rm.Qin), "kolik vzduchu projde oknem"],
            ["Plamen z okna", fmtW(win.ph?.Q || 0) + ", " + rm.zf.toFixed(1) + " m nad nadpra\u017E\xED", "Law 1978 \u26053"],
            ["S\xE1l\xE1n\xED na fas\xE1du naproti (6 m)", kW2(fx.heatFlux([0, 2, zf + 6]).total), fluxEffect(fx.heatFlux([0, 2, zf + 6]).total)],
            ["P\u0159e\u017Eit\xED v m\xEDstnosti", (this.Tl || 293) > 420 ? "nemo\u017En\xE9 (vrstva nad 150 \xB0C)" : "p\u0159i zemi je\u0161t\u011B ano", ""]
          ];
        }
      };
    }
  }
];
var STAR = { red: 1, green: 2, blue: 3, yellow: 4, purple: 5, white: 6 };
var ITER7_SPECIAL = [
  {
    id: "dust",
    group: "Exploze",
    name: "V\xFDbuch prachu (mouka)",
    ground: "concrete",
    time: "soumrak",
    duration: 14,
    loop: true,
    desc: "Mouka v pytli neho\u0159\xED. Rozv\xED\u0159en\xE1 do oblaku (~0,5 kg/m\xB3) m\xE1 obrovsk\xFD povrch a ho\u0159\xED jako plyn: plamen prob\u011Bhne oblakem za zlomek sekundy a spaliny se rozt\xE1hnou sedmkr\xE1t. Venku je to valiv\xE1 oran\u017Eov\xE1 koule skoro bez tlaku; v uzav\u0159en\xE9m silu stejn\xE9 mno\u017Estv\xED vytvo\u0159\xED 7\u20139 bar\u016F a budovu roztrhne. Posu\u0148 hmotnost a p\u0159epni \u201Euzav\u0159en\xFD prostor\u201C.",
    tiers: ["T0\u2013T1: oblak 30 \u010D\xE1stic, koule z plo\u0161n\xFDch obl\xE1\u010Dk\u016F", "T2\u2013T3: oblak 120 \u010D\xE1stic, objemov\xE1 koule, kou\u0159", "T4\u2013T5: + objemov\xFD kou\u0159, trosky u uzav\u0159en\xE9 varianty"],
    cams: [{ name: "celek", pos: [3, 2.2, 7.5], target: [0, 1.6, 0] }, { name: "hr\xE1\u010D", pos: [5.5, 1.7, 5], target: [0, 1.5, 0] }, { name: "z d\xE1lky", pos: [14, 4, 22], target: [0, 3, 0] }],
    controls: [{ id: "duMass", label: "Rozv\xED\u0159en\xFD prach [kg]", type: "range", min: 0.05, max: 25, value: 1, log: true }, { id: "duConf", label: "Uzav\u0159en\xFD prostor (silo)", type: "check", value: false }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(3), sk = sack({ lod: ctx.lod });
      ctx.add(sk);
      const cd = candle({ lod: Math.min(ctx.lod, 2) });
      cd.position.set(0.9, 0, 0.3);
      ctx.add(cd);
      fx.addSource({ pos: V4(0.9, cd.userData?.flameAt?.y ?? 0.22, 0.3), seed: 3, volume: true, ...sourceOptions(fireSpec({ kind: "wick", fuel: "paraffin" })), end: 3.1 });
      const mk = () => explosionSpec({ kind: "dust", mass: ctx.controls.duMass ?? 1, confined: !!ctx.controls.duConf });
      let es = mk(), boom2 = false, acc = 0;
      return {
        update(dt, t) {
          if (!boom2) es = mk();
          const Rc = es.fb.D / 3.8;
          if (t > 1.4 && t < 3 && fx.layers.smoke) {
            acc += fx.dtReal * (ctx.tier.id === 0 ? 20 : 80) * Math.max(0.3, fx.budgetScale.smoke);
            while (acc >= 1) {
              acc -= 1;
              const a = r() * 6.28, u = r();
              fx.bb.spawnSmoke({ x: 0, y: 0.3, z: 0, vx: Math.cos(a) * Rc * (0.5 + u), vy: Rc * (1.2 + 1.5 * r()), vz: Math.sin(a) * Rc * (0.5 + u), life: 2.5, s0: 0.2, s1: Rc * 1.3, tau: 0.5, albedo: [0.88, 0.85, 0.76], drag: 1.8 });
            }
          }
          if (!boom2 && t > 3) {
            boom2 = true;
            fx.blast(es, V4(0, Math.max(0.6, Rc * 1.1), 0), { seed: 12 });
          }
        },
        info: () => [
          ...es.rows,
          ["Pro\u010D pytel neho\u0159\xED", "mal\xFD povrch; oblak m\xE1 ~100 m\xB2 povrchu zrnek na kilogram a v\u0161ude kolem vzduch", ""],
          ["Doln\xED mez v\xFDbu\u0161nosti", "~60 g/m\xB3 (mouka), cukr 30, uheln\xFD prach 60", "\u26054"],
          ...blastSummary(Math.max(es.W, 1e-4), [3, 10]).map((b) => [`  p\u0159etlak v ${b.R} m`, b.kPa < 1 ? (b.kPa * 1e3).toFixed(0) + " Pa" : b.kPa.toFixed(1) + " kPa", b.effect]),
          ["Druhotn\xFD v\xFDbuch", "prvn\xED r\xE1na zv\xED\u0159\xED usazen\xFD prach v cel\xE9 hale \u2192 druh\xE1 b\xFDv\xE1 ni\u010Div\u011Bj\u0161\xED", "\u26054"]
        ]
      };
    }
  },
  {
    id: "fireworks",
    group: "Exploze",
    name: "Oh\u0148ostroj: kulov\xE1 puma",
    ground: "grass",
    time: "noc",
    duration: 22,
    loop: true,
    desc: "Barva hv\u011Bzdic nen\xED teplota, ale \u010D\xE1rov\xE9 spektrum kovov\xFDch sol\xED: stroncium \u010Derven\xE1, baryum zelen\xE1, m\u011B\u010F modr\xE1, sod\xEDk \u017Elut\xE1. V\xFDmetn\xE1 n\xE1pl\u0148 vyst\u0159el\xED pumu z trubky, zpo\u017E\u010Fova\u010D ho\u0159\xED 3\u20136 s, trhac\xED n\xE1pl\u0148 ji ve v\xFD\u0161ce roztrhne a zap\xE1l\xED hv\u011Bzdice. Pravidla pyrotechnik\u016F: v\xFD\u0161ka 1,2 m a pr\u016Fm\u011Br kv\u011Btu 0,54 m na ka\u017Ed\xFD milimetr r\xE1\u017Ee.",
    tiers: ["T0\u2013T1: 40 hv\u011Bzdic na pumu, bez stopy", "T2\u2013T3: 70\u2013160 hv\u011Bzdic, zlat\xE1 stopa p\u0159i v\xFDstupu, kou\u0159 rozprasku", "T4\u2013T5: pln\xFD po\u010Det, doho\u0159\xEDvaj\xEDc\xED jiskry, osv\u011Btlen\xFD kou\u0159"],
    cams: [{ name: "div\xE1ci (150 m)", pos: [0, 1.7, 150], target: [0, 70, 0] }, { name: "u trubek", pos: [3, 1.2, 5], target: [0, 6, 0] }, { name: "ze strany (300 m)", pos: [280, 20, 120], target: [0, 90, 0] }],
    controls: [{ id: "fwCal", label: "R\xE1\u017Ee [mm]", type: "range", min: 50, max: 200, value: 100, step: 5 }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(21), rack = mortarRack({ lod: ctx.lod, n: 4, cal: 100 });
      ctx.add(rack);
      rack.updateMatrixWorld(true);
      const cols = ["red", "green", "blue", "yellow"], shells = cols.map((c2, i) => ({ c: c2, t0: 1.5 + i * 3.2, tube: wpos(rack, rack.userData.tubes[i]), st: 0 }));
      let sp = explosionSpec({ kind: "pyro", caliber: ctx.controls.fwCal ?? 100, color: "red" });
      return {
        update(dt, t) {
          const cal = ctx.controls.fwCal ?? 100, q = ctx.tier.id;
          for (const s of shells) {
            if (s.st === 0 && t >= s.t0) {
              s.st = 1;
              s.sp = explosionSpec({ kind: "pyro", caliber: cal, color: s.c });
              sp = s.sp;
              s.wob = (r() - 0.5) * 0.08;
              fx.lights.add(s.tube.x, s.tube.y + 0.3, s.tube.z, 3e5, 1900, 0.4);
              for (let i = 0; i < (q === 0 ? 3 : 10); i++) fx.bb.spawnSmoke({ x: s.tube.x, y: s.tube.y, z: s.tube.z, vx: (r() - 0.5) * 2, vy: 2 + 5 * r(), vz: (r() - 0.5) * 2, life: 2 + 2 * r(), s0: 0.15, s1: 1.2, tau: 0.5, albedo: [0.7, 0.7, 0.72], drag: 1.2 });
              if (fx.audioEvents.length < 64) fx.audioEvents.push({ type: "shot", pos: s.tube.clone(), W: 0.01 });
            }
            if (s.st === 1) {
              const tl = t - s.t0, k = tl / s.sp.tLift, y = s.tube.y + s.sp.H * (1 - (1 - Math.min(1, k)) ** 2), x = s.tube.x + s.wob * s.sp.H * k;
              if (q > 0 && r() < dt * 60) fx.sp.spawn({ x, y, z: s.tube.z, vx: (r() - 0.5) * 2, vy: -3, vz: (r() - 0.5) * 2, life: 0.5 + 0.6 * r(), T: 1500, tauC: 0.8, size: 0.02, drag: 1.5, grav: 0.6, seed: r() });
              if (k >= 1) {
                s.st = 2;
                const n = Math.round(s.sp.stars * (q === 0 ? 0.35 : q >= 4 ? 1.6 : 1) * Math.max(0.4, fx.budgetScale.spark)), c2 = V4(x, y, s.tube.z);
                for (let i = 0; i < n; i++) {
                  const u = 1 - 2 * (i + 0.5) / n, a = i * 2.39996, sr = Math.sqrt(1 - u * u), v = s.sp.starV * (0.92 + 0.16 * r());
                  fx.sp.spawn({ x: c2.x, y: c2.y, z: c2.z, vx: Math.cos(a) * sr * v, vy: u * v, vz: Math.sin(a) * sr * v, life: s.sp.burn * (0.85 + 0.3 * r()), T: 2500, tauC: 50, size: 0.05 + 6e-4 * cal, drag: 1.9, grav: 0.35, seed: r(), star: STAR[s.c] });
                }
                s.burst = c2;
                s.tb = t;
                for (let i = 0; i < (q === 0 ? 4 : 14); i++) fx.bb.spawnSmoke({ x: c2.x + (r() - 0.5) * 4, y: c2.y + (r() - 0.5) * 4, z: c2.z + (r() - 0.5) * 4, vx: (r() - 0.5) * 6, vy: (r() - 0.5) * 6, vz: (r() - 0.5) * 6, life: 5 + 4 * r(), s0: 2, s1: 8 + 0.1 * cal, tau: 0.25, albedo: [0.6, 0.6, 0.62], drag: 1 });
                if (fx.audioEvents.length < 64) fx.audioEvents.push({ type: "shot", pos: c2.clone(), W: s.sp.W });
              }
            }
            if (s.st === 2 && t - s.tb < s.sp.burn) {
              const k = 1 - (t - s.tb) / s.sp.burn, tn = s.sp.tint;
              fx.lights.add(s.burst.x, s.burst.y, s.burst.z, 4e6 * k * (cal / 100) ** 2, 2500, s.sp.R * 0.4);
            }
          }
        },
        info: () => [
          ...sp.rows,
          ["Rychlost z trubky", sp.v0.toFixed(0) + " m/s", "\u26052"],
          ["R\xE1na u div\xE1k\u016F (150 m) za", (Math.hypot(150, sp.H) / 343).toFixed(2) + " s po z\xE1blesku", "rychlost zvuku"],
          ["Bezpe\u010Dn\xE1 vzd\xE1lenost", (0.8 * (ctx.controls.fwCal ?? 100)).toFixed(0) + " m", "~0,8 m na mm r\xE1\u017Ee (NFPA 1123: 70 stop na palec) \u26053"],
          ["Modr\xE1 je nejt\u011B\u017E\u0161\xED", "chlorid m\u011B\u010Fn\xFD se nad ~1 200 \xB0C rozpad\xE1 \u2192 slab\xE1 a snadno vybledne", "\u26054"]
        ]
      };
    }
  },
  {
    id: "thermite",
    group: "Materi\xE1ly",
    name: "Kovy: termit a ho\u0159\u010D\xEDk",
    ground: "concrete",
    time: "soumrak",
    duration: 60,
    loop: true,
    desc: "Termit (oxid \u017Eelezit\xFD + hlin\xEDk) nepot\u0159ebuje vzduch: 4 MJ/kg, ~2 500 \xB0C, \u017E\xE1dn\xFD plamen \u2013 jen oslniv\xE1 spr\u0161ka jisker a tekut\xE9 \u017Eelezo, kter\xE9 prote\u010De kv\u011Btin\xE1\u010Dem a prop\xE1l\xED ocelovou desku. Zapaluje se ho\u0159\u010D\xEDkovou p\xE1skou. Ho\u0159\u010D\xEDk ho\u0159\xED b\xEDle p\u0159i ~3 100 \xB0C a voda ho neuhas\xED: rozlo\u017E\xED se na vod\xEDk a po\u017E\xE1r vybuchne (ve 30. sekund\u011B kbel\xEDk vody).",
    tiers: ["T0\u2013T1: 150 jisker/s, plo\u0161n\xE9 plameny", "T2\u2013T3: 600 jisker/s, b\xEDl\xFD d\xFDm, \u017Ehnouc\xED deska, lou\u017Ee \u017Eeleza", "T4\u2013T5: 1 500 jisker/s, objemov\xFD d\xFDm, tetelen\xED"],
    cams: [{ name: "celek", pos: [1.3, 0.9, 2.3], target: [0.25, 0.4, 0] }, { name: "detail", pos: [0.5, 0.75, 1], target: [0, 0.5, 0] }, { name: "ho\u0159\u010D\xEDk", pos: [1.6, 0.6, 1.4], target: [0.9, 0.15, 0] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(4), pot = thermitePot({ lod: ctx.lod });
      ctx.add(pot);
      const ud = pot.userData, u = ud.char;
      const sp = fireSpec({ kind: "metal", fuel: "thermite", mass: 1 }), mg = fireSpec({ kind: "metal", fuel: "magnesium", mass: 0.4, duration: 45 });
      const t0 = 4, rib = fx.addSource({ pos: V4(0, ud.top.y + 0.03, 0), fuel: "magnesium", seed: 2, Q: 900, D: 0.02, start: 1.5, end: t0 + 0.5, T: 3200, mult: { smoke: 1, sparks: 3 } });
      const th = fx.addSource({ pos: V4(0, ud.top.y, 0), seed: 3, volume: true, ...sourceOptions(sp), start: t0, end: t0 + sp.duration, label: "termit" });
      const pud = meltPuddle({ lod: ctx.lod, R: 0.25, seed: 9 });
      pud.position.set(0.02, 4e-3, 0.02);
      ctx.add(pud);
      pud.userData.mat.color.setRGB(0.25, 0.22, 0.2);
      pud.userData.mat.metalness = 0.8;
      pud.userData.mat.roughness = 0.5;
      const pile = new THREE26.Mesh(new THREE26.ConeGeometry(0.1, 0.06, 12), new THREE26.MeshStandardMaterial({ color: 12172480, roughness: 0.4, metalness: 0.9 }));
      pile.position.set(0.9, 0.03, 0.1);
      ctx.add(pile);
      const ms = fx.addSource({ pos: V4(0.9, 0.04, 0.1), seed: 6, volume: true, ...sourceOptions(mg), start: 14, end: 14 + mg.duration, label: "ho\u0159\u010D\xEDk" });
      const bucket = fx.addSpray({ agent: "bucket", from: V4(1.9, 1, 0.9), to: V4(0.9, 0.05, 0.1), radius: 0.4, on: false, rate: 6, seed: 8 });
      let Tp = 293, hole = 0, iron = 0, said = false;
      return {
        update(dt, t) {
          const on = t > t0 && t < t0 + sp.duration, k = on ? 1 : 0, q = ctx.tier.id;
          if (on && fx.layers.sparks) {
            let n = Math.round(dt * (q === 0 ? 150 : q >= 4 ? 1500 : 600) * Math.max(0.3, fx.budgetScale.spark));
            for (let i = 0; i < n; i++) {
              const a = r() * 6.28, e = 0.5 + 1 * r(), v = 1.5 + 4.5 * r();
              fx.sp.spawn({ x: 0, y: ud.top.y, z: 0, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * Math.cos(e) * v, life: 0.5 + 1.2 * r(), T: 2500 + 300 * r(), tauC: 1.4, size: 2e-3 + 4e-3 * r(), drag: 0.9, grav: 1, seed: r() });
            }
            n = Math.round(dt * 120);
            for (let i = 0; i < n; i++) fx.sp.spawn({ x: (r() - 0.5) * 0.02, y: ud.drip.y, z: (r() - 0.5) * 0.02, vx: (r() - 0.5) * 0.3, vy: -1, vz: (r() - 0.5) * 0.3, life: 0.5, T: 2300, tauC: 3, size: 6e-3, drag: 0.1, grav: 1, seed: r() });
            fx.lights.add(0, ud.top.y + 0.1, 0, 25e5, 2700, 0.15);
          }
          Tp += (k * (2100 - Tp) * 0.5 - (Tp - 293) * 0.035) * dt;
          if (Tp > 1700 && hole < 1) hole = Math.min(1, hole + dt / 3);
          if (hole >= 1 && on) iron = Math.min(1, iron + dt / (sp.duration * 0.6));
          u.uTnow.value = Tp;
          u.uTmax.value = Math.max(u.uTmax.value, Tp);
          pud.scale.setScalar(Math.max(1e-3, 0.25 * Math.sqrt(iron)));
          const gl = Math.max(0, Math.min(1, (Tp - 700) / 900)) * (iron > 0 ? 1 : 0);
          pud.userData.mat.emissive.setRGB(1.2 * gl, 0.4 * gl, 0.08 * gl);
          bucket.on = t > 30 && t < 31.2;
          if (!said && t > 30.3) {
            said = true;
            ctx.message("Voda na ho\u0159\xEDc\xED ho\u0159\u010D\xEDk: rozklad na vod\xEDk, po\u017E\xE1r se rozho\u0159el.");
          }
          if (t > 14 && t < 14 + mg.duration) fx.lights.add(0.9, 0.2, 0.1, 15e5 * (ms.suppK ?? 1), 3200, 0.1);
        },
        info: () => [
          ...sp.rows,
          ...fireRows(th, "termit").slice(1, 3),
          ["Reakce", "Fe\u2082O\u2083 + 2 Al \u2192 2 Fe + Al\u2082O\u2083, 3,98 MJ/kg", "\u26054"],
          ["Zap\xE1len\xED", "ho\u0159\u010D\xEDkov\xE1 p\xE1ska (~3 100 \xB0C); z\xE1palka nesta\u010D\xED, termit chyt\xE1 a\u017E nad ~1 200 \xB0C", "\u26054"],
          ["Ocelov\xE1 deska 8 mm", degC2(Tp) + (hole >= 1 ? " \u2013 PROP\xC1LENA" : hole > 0 ? " \u2013 tav\xED se" : ""), "ocel taje p\u0159i ~1 500 \xB0C"],
          ["Ho\u0159\u010D\xEDk", ms.ph ? fmtW(ms.ph.Q) : "\u2014", "\u0394Hc 24,7 MJ/kg, b\xEDl\xFD MgO"],
          ["Voda na ho\u0159\u010D\xEDk", bucket.note || "ve 30. s", "Mg + H\u2082O \u2192 MgO + H\u2082 \u26055"],
          ["Ha\u0161en\xED kov\u016F", "jen such\xFD p\xEDsek nebo speci\xE1ln\xED pr\xE1\u0161ek (t\u0159\xEDda D)", ""]
        ]
      };
    }
  },
  {
    id: "whirl",
    group: "Ohn\u011B",
    name: "Ohniv\xFD v\xEDr",
    ground: "dryGrass",
    time: "soumrak",
    duration: 120,
    wind: 1,
    desc: "Kdy\u017E se k ohni p\u0159id\xE1 rotace vzduchu (v\xEDtr za p\u0159ek\xE1\u017Ekou, st\u0159ih v\u011Btru u lesn\xEDho po\u017E\xE1ru), plamen se st\xE1hne do \xFAzk\xE9ho sloupu: rotace brzd\xED m\xEDsen\xED se vzduchem po stran\xE1ch, plamen se prodlou\u017E\xED 3\u201310\xD7 a palivo odho\u0159\xEDv\xE1 2\u20137\xD7 rychleji (Emmons & Ying 1967). Lou\u017Ee 1,5 m: bez v\xEDru plamen 4 m, s v\xEDrem p\u0159es 10 m. P\u0159epni v\xEDr a porovnej.",
    tiers: ["T0\u2013T1: jeden \xFAzk\xFD plo\u0161n\xFD plamen, 20 jisker/s ve \u0161roubovici", "T2\u2013T3: t\u0159i ob\xEDhaj\xEDc\xED objemov\xE1 j\xE1dra, 120 jisker/s, kou\u0159", "T4\u2013T5: + objemov\xFD kou\u0159 sto\u010Den\xFD do \u0161roubovice"],
    cams: [{ name: "celek", pos: [7, 3, 15], target: [0, 5.5, 0] }, { name: "hr\xE1\u010D", pos: [5, 1.7, 6], target: [0, 4, 0] }, { name: "z d\xE1lky", pos: [25, 6, 40], target: [0, 8, 0] }],
    controls: [{ id: "whOn", label: "Rotace vzduchu (v\xEDr)", type: "check", value: true }, { id: "whK", label: "S\xEDla v\xEDru (n\xE1sobek odho\u0159\xEDv\xE1n\xED)", type: "range", min: 1.5, max: 7, value: 3, step: 0.1 }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(5), D = 1.5, sp = fireSpec({ kind: "pool", fuel: "diesel", D, depth: 0.05 });
      const disc = new THREE26.Mesh(new THREE26.CircleGeometry(D / 2, 48), new THREE26.MeshStandardMaterial({ color: 723464, roughness: 0.05 }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 6e-3;
      ctx.add(disc);
      const fig = figure({ lod: Math.min(ctx.lod, 2) });
      fig.position.set(3.2, 0, 1.5);
      ctx.add(fig);
      const nC = ctx.tier.id === 0 ? 1 : 3, K = () => ctx.controls.whOn ? ctx.controls.whK ?? 3 : 1, L0 = 0.235 * Math.pow(sp.Qpeak / 1e3, 0.4) - 1.02 * D, Lw = () => L0 * (ctx.controls.whOn ? 1 + 0.6 * (K() - 1) : 1);
      const cores = [];
      let sm = 0;
      for (let i = 0; i < nC; i++) cores.push(fx.addSource({ pos: V4(0, 0.01, 0), seed: 9 + i * 4, volume: true, ...sourceOptions(sp), D: D / Math.sqrt(nC) * 0.9, end: Infinity, Q: (t) => sp.Qpeak * K() / nC * Math.min(1, t / 5), L: (q) => Math.max(0.3, Lw() * Math.min(1, q * nC / (sp.Qpeak * K()) + 0.05)), shapeK: 1.9, taper: 0.45, mult: { smoke: 1.2 / nC } }));
      return {
        update(dt, t) {
          const on = !!ctx.controls.whOn, w = on ? 2.2 + 0.5 * K() : 0, rr = on ? 0.12 * D : 0.22 * D;
          cores.forEach((c2, i) => {
            const a = t * w + i / nC * 6.2832;
            c2.pos.set(Math.cos(a) * rr * (nC > 1 ? 1 : 0), 0.01, Math.sin(a) * rr * (nC > 1 ? 1 : 0));
          });
          const L = cores[0].ph?.L || 4;
          if (on && fx.layers.sparks) {
            sm += dt * (ctx.tier.id === 0 ? 20 : 120) * Math.max(0.3, fx.budgetScale.spark);
            while (sm >= 1) {
              sm -= 1;
              const a = r() * 6.28, h2 = r() * L, rad = 0.25 * D * (1 + h2 / L), vt = w * rad * 2.2;
              fx.sp.spawn({ x: Math.cos(a) * rad, y: 0.2 + h2, z: Math.sin(a) * rad, vx: -Math.sin(a) * vt, vy: 5 + 6 * r(), vz: Math.cos(a) * vt, life: 0.7 + 1.2 * r(), T: 1500, tauC: 1, size: 4e-3, drag: 0.6, grav: 0.2, ember: true, seed: r() });
            }
          }
          this.Q = cores.reduce((s, c2) => s + (c2.ph ? c2.ph.Q : 0), 0);
          this.L = L;
        },
        info() {
          return [
            ...sp.rows,
            ["V\xEDr", ctx.controls.whOn ? "ANO, odho\u0159\xEDv\xE1n\xED \xD7" + K().toFixed(1) : "ne (voln\xE1 lou\u017Ee)", "Emmons & Ying \u26053"],
            ["V\xFDkon", fmtW(this.Q || 0), ""],
            ["V\xFD\u0161ka plamene", (this.L || 0).toFixed(1) + " m", ctx.controls.whOn ? "prodlou\u017Een\xED rotac\xED \u26052" : "Heskestad \u26055"],
            ["Bez v\xEDru by bylo", L0.toFixed(1) + " m p\u0159i " + fmtW(sp.Qpeak), "Heskestad \u26055"],
            ["Doba ho\u0159en\xED", mmss(sp.duration / K()), "palivo ub\xFDv\xE1 rychleji"],
            ["S\xE1l\xE1n\xED u postavy (3,5 m)", kW2(fx.heatFlux([3.2, 1.2, 1.5]).total) + " \u2013 " + fluxEffect(fx.heatFlux([3.2, 1.2, 1.5]).total), ""],
            ["Kde vznik\xE1", "lesn\xED po\u017E\xE1ry (st\u0159ih v\u011Btru), za rohem budovy, ho\u0159\xEDc\xED sklad v \xFAdol\xED", ""]
          ];
        }
      };
    }
  }
];

// src/scenarios/index.js
var V5 = (x, y, z) => new THREE27.Vector3(x, y, z);
var fmtW = (q) => q >= 1e6 ? (q / 1e6).toFixed(2) + " MW" : q >= 1e3 ? (q / 1e3).toFixed(1) + " kW" : q.toFixed(0) + " W";
var deg = (r) => (r * 180 / Math.PI).toFixed(0) + "\xB0";
function fireRows(src, label = "") {
  const ph = src.ph || src.physics(0), f = src.fuel, p = label ? label + ": " : "";
  return [
    [p + "Palivo", f.name, `\u0394Hc ${(f.dHc / 1e6).toFixed(1)} MJ/kg`],
    [p + "Tepeln\xFD v\xFDkon Q", fmtW(ph.Q), "model sc\xE9n\xE1\u0159e"],
    [p + "V\xFD\u0161ka plamene L", ph.L.toFixed(ph.L < 1 ? 3 : 2) + " m", src.o.L ? "m\u011B\u0159en\xE1 hodnota" : "Heskestad \u26055"],
    [p + "N\xE1klon plamene", deg(ph.tilt.theta) + `  (u* = ${ph.tilt.us.toFixed(2)})`, "AGA \u26054"],
    [p + "Teplota sv\xEDtiv\xE9 z\xF3ny", ph.T.toFixed(0) + " K", "pyrometrie saz\xED \u26053"],
    [p + "Pulzace plamene", ph.fp.toFixed(1) + " Hz", "Cetegen & Ahmed \u26054"],
    [p + "Optick\xE1 tl. kou\u0159e \u03C4", ph.tau.toFixed(2), "Mulholland \u03C3s \u26053"],
    [p + "Ekvivalen\u010Dn\xED pom\u011Br \u03A6", ph.vent.phi.toFixed(2) + `  saze \xD7${ph.vent.sootMul.toFixed(2)}`, "Tewarson \u26052"],
    [p + "V\xFDt\u011B\u017Eek saz\xED / CO", (f.ys * ph.vent.sootMul).toFixed(3) + " / " + Math.max(f.yCO, ph.vent.coYield).toFixed(3) + " kg/kg", "SFPE \u26053"],
    [p + "Sv\xEDtivost", ph.I < 1e4 ? ph.I.toFixed(1) + " cd" : (ph.I / 1e3).toFixed(0) + " kcd", "odhad \u26052"]
  ];
}
function blastRows2(W, label = "TNT ekv.") {
  return [
    [label, W >= 1 ? W.toFixed(1) + " kg" : (W * 1e3).toFixed(0) + " g", "Kinney\u2013Graham \u26054"],
    ...blastSummary(W, [1, 3, 10, 30, 100, 300]).map((b) => [`  p\u0159etlak v ${b.R} m`, b.kPa < 1 ? (b.kPa * 1e3).toFixed(0) + " Pa" : b.kPa.toFixed(1) + " kPa", b.effect])
  ];
}
function table2(ctx, w = 1.2, d = 0.7) {
  const m = makeMaterial("woodPlank");
  const g2 = new THREE27.BoxGeometry(w, 0.04, d);
  g2.translate(0, -0.02, 0);
  const t = new THREE27.Mesh(g2, m);
  t.receiveShadow = true;
  ctx.add(t);
  const leg = new THREE27.BoxGeometry(0.05, 0.72, 0.05);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const l = new THREE27.Mesh(leg, m);
    l.position.set(x * (w / 2 - 0.05), -0.4, z * (d / 2 - 0.05));
    ctx.add(l);
  }
}
var BASE = [
  // ---------------------------------------------------------------------------------------------- jiskra
  {
    id: "spark",
    group: "Z\xE1\u017Eeh",
    name: "Jiskra (brou\u0161en\xED oceli)",
    ground: "concrete",
    time: "noc",
    desc: "\xDAhlov\xE1 bruska na nosn\xEDku IPE 160. Ocelov\xE9 jiskry ~1 800 K chladnou z\xE1\u0159en\xEDm za desetiny sekundy, odr\xE1\u017E\xED se od zem\u011B a ob\u010Das se rozprsknou (oxidace uhl\xEDku).",
    cams: [{ name: "detail", pos: [1.1, 1.05, 1.5], target: [-0.35, 0.5, 0.25] }, { name: "z boku", pos: [-0.6, 0.8, 2.6], target: [-0.9, 0.35, 0.6] }],
    build(ctx) {
      const rig = grinderRig({ lod: ctx.lod });
      ctx.add(rig);
      const r = mulberry32(9);
      let acc = 0, burst = 0;
      const at = rig.userData.sparkAt, dir = rig.userData.sparkDir;
      return {
        update(dt, t) {
          const fx = ctx.fx, on = t % 6 < 4.5;
          if (!on) return;
          acc += dt * 420 * fx.budgetScale.spark;
          while (acc >= 1) {
            acc -= 1;
            const sp = 14 + 24 * r(), ax = (r() - 0.5) * 0.5, ay = (r() - 0.5) * 0.35;
            const d = V5(dir.x + ax, dir.y + ay, dir.z + (r() - 0.5) * 0.3).normalize();
            fx.sp.spawn({ x: at.x, y: at.y, z: at.z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: 0.4 + r() * 1.2, T: 1700 + 250 * r(), tauC: 0.22 + 0.4 * r(), size: 3e-4 + 6e-4 * r(), drag: 0.25 + 0.35 * r(), grav: 1, seed: r() });
          }
          burst += dt * 14;
          while (burst >= 1) {
            burst -= 1;
            const k = 0.3 + r() * 1.3, p = at.clone().addScaledVector(dir, k);
            p.y += -0.5 * 9.81 * (k / 25) ** 2;
            for (let i = 0; i < 6; i++) {
              const a = r() * 6.28, b = r() * 3.14;
              fx.sp.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * Math.sin(b) * 4 + dir.x * 8, vy: Math.cos(b) * 4, vz: Math.sin(a) * Math.sin(b) * 4 + dir.z * 8, life: 0.15 + r() * 0.2, T: 1900, tauC: 0.12, size: 3e-4, drag: 0.15, grav: 1, seed: r() });
            }
          }
          fx.lights.add(at.x, at.y + 0.02, at.z, 6 * (0.8 + 0.4 * r()), 1800, 0.05);
        },
        info: () => [
          ["Materi\xE1l", "ocel S235 (0,2 % C)", ""],
          ["Teplota jiskry", "1 700\u20131 950 K", "pyrometrie jisker \u26053"],
          ["Pr\u016Fm\u011Br \u010D\xE1stic", "0,3\u20130,9 mm", "\u26053"],
          ["Rychlost odletu", "14\u201338 m/s", "obvod kotou\u010De 80 m/s \u26053"],
          ["Chladnut\xED", "\u03C4 \u2248 0,2\u20130,6 s (z\xE1\u0159en\xED + konvekce)", "\u26053"],
          ["Rozprsk", "mikrov\xFDbuchy CO v kapce", "kvalitativn\xED \u26053"]
        ]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- svíčka
  {
    id: "candle",
    group: "Z\xE1\u017Eeh",
    name: "Plamen sv\xED\u010Dky",
    ground: "dirt",
    time: "noc",
    desc: "Paraf\xEDnov\xE1 sv\xED\u010Dka ~80 W. Modr\xE1 z\xF3na u knotu, \u017Elut\xFD sazov\xFD plamen, pulzace ~14 Hz. Ve vichru zhasne a vypust\xED b\xEDl\xFD d\xFDm paraf\xEDnu.",
    cams: [{ name: "detail", pos: [0.18, 0.16, 0.26], target: [0, 0.1, 0] }, { name: "st\u016Fl", pos: [0.6, 0.45, 0.8], target: [0, 0.05, 0] }],
    build(ctx) {
      table2(ctx);
      const c2 = candle({ lod: ctx.lod });
      ctx.add(c2);
      const at = c2.userData.flameAt;
      const src = ctx.fx.addSource({
        pos: V5(at.x, at.y - 4e-3, at.z),
        fuel: "paraffin",
        Q: 80,
        D: 0.016,
        L: () => 0.045,
        T: 1450,
        blue: 1,
        volume: true,
        taper: 0.9,
        baseWide: -0.1,
        neck: 0.55,
        puffAmp: 0.12,
        turbAmp: 0.03,
        wobble: 0.04,
        tongues: 3,
        lightH: 0.4,
        mult: { smoke: 0.4, embers: 0, sparks: 0, haze: 0.5 },
        seed: 2
      });
      let out = false, wisp = 0;
      return {
        update(dt) {
          const U = ctx.fx.air.windAt(0.1);
          if (U > 3 && !out) {
            out = true;
            src.enabled = false;
            wisp = 6;
            ctx.message("Vichr sv\xED\u010Dku sfoukl (v\xEDtr u plamene > 3 m/s).");
          }
          if (U <= 3 && out) {
            out = false;
            src.enabled = true;
            ctx.message("Sv\xED\u010Dka znovu zap\xE1lena.");
          }
          c2.userData.wax.emissiveIntensity = out ? 0 : 14 * PRE.value;
          if (wisp > 0) {
            wisp -= dt;
            if (Math.random() < dt * 25) ctx.fx.bb.spawnSmoke({ x: at.x, y: at.y - 8e-3, z: at.z, vy: 0.15, life: 3, s0: 4e-3, s1: 0.06, tau: 0.6 * Math.max(wisp / 6, 0), albedo: [0.85, 0.85, 0.86], drag: 0.3 });
          }
        },
        info: () => [...fireRows(src), ["Stav", out ? "zhasnut\xE1 (v\xEDtr)" : "ho\u0159\xED", "pr\xE1h ~3 m/s \u26052"]]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- louč
  {
    id: "torch",
    group: "Z\xE1\u017Eeh",
    name: "Lou\u010D",
    ground: "dirt",
    time: "noc",
    desc: "Smoln\xE1 lou\u010D ~4 kW: oran\u017Eov\xFD plamen 30\u201340 cm, tmav\u0161\xED kou\u0159 z prysky\u0159ice, odl\xE9taj\xEDc\xED uhl\xEDky.",
    cams: [{ name: "detail", pos: [0.9, 0.9, 1.2], target: [0, 0.65, 0] }, { name: "hr\xE1\u010D", pos: [1.6, 1.7, 2.2], target: [0, 0.7, 0] }],
    build(ctx) {
      const t = torch({ lod: ctx.lod });
      ctx.add(t);
      t.userData.char.uChar.value = 0.55;
      t.userData.char.uGlow.value = 0.8;
      const at = t.userData.flameAt;
      const src = ctx.fx.addSource({ pos: V5(at.x, at.y - 0.06, at.z), fuel: "woodResin", Q: 4e3, D: 0.065, volume: true, mult: { embers: 0.12, sparks: 0.08 }, taper: 0.9, seed: 3 });
      return { update() {
      }, info: () => fireRows(src) };
    }
  },
  // ---------------------------------------------------------------------------------------------- ohýnek
  {
    id: "smallFire",
    group: "Ohn\u011B",
    name: "Oh\xFDnek",
    ground: "grass",
    time: "soumrak",
    desc: "Mal\xE9 ohni\u0161t\u011B z klest\xED ~15 kW. Plamen ~40 cm, slab\xFD \u0161edav\xFD kou\u0159.",
    cams: [{ name: "u ohn\u011B", pos: [1.1, 0.8, 1.3], target: [0, 0.2, 0] }, { name: "hr\xE1\u010D", pos: [2.4, 1.7, 2.6], target: [0, 0.2, 0] }],
    build(ctx) {
      const f = campfire({ lod: ctx.lod, size: "small" });
      ctx.add(f);
      f.userData.char.uChar.value = 0.45;
      f.userData.char.uGlow.value = 0.7;
      const src = ctx.fx.addSource({ pos: V5(0, 0.04, 0), fuel: "woodDry", Q: (t) => 15e3 * (0.9 + 0.1 * Math.sin(t * 0.7)), D: 0.32, volume: true, seed: 4 });
      return { update() {
      }, info: () => fireRows(src) };
    }
  },
  // ---------------------------------------------------------------------------------------------- táborák
  {
    id: "campfire",
    group: "Ohn\u011B",
    name: "Ohe\u0148 (t\xE1bor\xE1k)",
    ground: "grass",
    time: "soumrak",
    desc: "T\xFDp\xED z polen ~200 kW. Plamen ~1,2 m, pulzace 1,7 Hz, jiskry a uhl\xEDky stoupaj\xED v oblaku.",
    cams: [{ name: "u ohn\u011B", pos: [2.6, 1.6, 3], target: [0, 0.7, 0] }, { name: "hr\xE1\u010D", pos: [4, 1.7, 4.5], target: [0, 0.8, 0] }, { name: "shora", pos: [0.5, 7, 1.5], target: [0, 0.5, 0] }],
    build(ctx) {
      const f = campfire({ lod: ctx.lod, size: "medium" });
      ctx.add(f);
      f.userData.char.uChar.value = 0.5;
      f.userData.char.uGlow.value = 0.8;
      const src = ctx.fx.addSource({ pos: V5(0, 0.05, 0), fuel: "woodDry", Q: (t) => 2e5 * (0.92 + 0.08 * Math.sin(t * 0.5)), D: 0.8, volume: true, seed: 5 });
      return { update() {
      }, info: () => fireRows(src) };
    }
  },
  // ---------------------------------------------------------------------------------------------- velká hranice
  {
    id: "bonfire",
    group: "Ohn\u011B",
    name: "Po\u017E\xE1r (velk\xE1 hranice)",
    ground: "dirt",
    time: "noc",
    desc: "Hranice ~3 MW, plamen ~3,3 m, siln\xE9 stoup\xE1n\xED uhl\xEDk\u016F, v\xFDrazn\xFD hork\xFD vzduch.",
    cams: [{ name: "celek", pos: [7, 3, 8], target: [0, 2, 0] }, { name: "hr\xE1\u010D", pos: [6, 1.7, 6], target: [0, 1.6, 0] }],
    build(ctx) {
      const f = campfire({ lod: ctx.lod, size: "large" });
      ctx.add(f);
      f.userData.char.uChar.value = 0.65;
      f.userData.char.uGlow.value = 1;
      const src = ctx.fx.addSource({ pos: V5(0, 0.08, 0), fuel: "woodDry", Q: (t) => 3e6 * (0.9 + 0.1 * Math.sin(t * 0.3)), D: 2.4, volume: true, seed: 6 });
      return { update() {
      }, info: () => fireRows(src) };
    }
  },
  // ---------------------------------------------------------------------------------------------- stoh slámy
  {
    id: "haystack",
    group: "Materi\xE1ly",
    name: "Ho\u0159\xEDc\xED stoh sl\xE1my",
    ground: "dryGrass",
    time: "soumrak",
    timeScale: 4,
    duration: 1500,
    desc: "Stoh 36 velk\xFDch bal\xEDk\u016F (~4,8 \xD7 3,6 \xD7 2,7 m). Ultrarychl\xFD r\u016Fst t\xB2, vrchol ~12 MW. Hust\xFD b\xEDlo-\u017Elut\xFD kou\u0159 (vlhkost), obrovsk\xE9 mno\u017Estv\xED uhl\xEDk\u016F.",
    cams: [{ name: "celek", pos: [16, 6, 18], target: [0, 3, 0] }, { name: "hr\xE1\u010D", pos: [12, 1.7, 9], target: [0, 2.5, 0] }],
    build(ctx) {
      const s = strawStack({ lod: ctx.lod });
      ctx.add(s);
      const { W, D, H } = s.userData;
      const curve = { alpha: T2_ALPHA.ultrafast, Qpeak: 12e6, tPlateau: 600, tau: 400 };
      const tg = Math.sqrt(curve.Qpeak / curve.alpha);
      const src = ctx.fx.addSource({ pos: V5(0, H * 0.55, 0), fuel: "straw", Q: (t) => hrrCurve(t, curve), footprint: { type: "rect", w: W * 1.05, d: D * 1.05 }, scale: (t) => Math.min(1, 0.15 + Math.sqrt(t / tg)), volume: true, mult: { embers: 2 }, seed: 7 });
      ctx.fx.addScorch({ pos: V5(0, 0, 0), radius: Math.max(W, D) * 1, rate: 1 / 900, glow: 0.6, seed: 2 });
      return {
        update(dt, t) {
          s.userData.char.uChar.value = Math.min(1, t / (tg + curve.tPlateau));
          s.userData.char.uGlow.value = Math.min(1, t / 60);
        },
        info: () => [...fireRows(src), ["K\u0159ivka HRR", `t\xB2 ultrarychl\xE1, \u03B1 = ${curve.alpha.toFixed(0)} W/s\xB2, vrchol v ${(tg / 60).toFixed(1)} min`, "NFPA 72 \u26054"]]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- pneumatiky
  {
    id: "tires",
    group: "Materi\xE1ly",
    name: "Ho\u0159\xEDc\xED pneumatiky",
    ground: "dirt",
    time: "den",
    timeScale: 3,
    duration: 1200,
    desc: "Hromada 5 pneumatik. Pry\u017E (SBR) m\xE1 v\xFDt\u011B\u017Eek saz\xED ~0,13 kg/kg \u2192 nepr\u016Fhledn\xFD \u010Dern\xFD sloup s hn\u011Bdav\xFDm dehtov\xFDm okrajem; tavenina vytv\xE1\u0159\xED ho\u0159\xEDc\xED lou\u017Ei.",
    cams: [{ name: "celek", pos: [7, 3, 9], target: [0, 3, 0] }, { name: "sloup", pos: [18, 6, 22], target: [0, 8, 0] }],
    build(ctx) {
      const p = tirePile({ lod: Math.max(0, ctx.lod - 1), n: 5 });
      ctx.add(p);
      const curve = { alpha: T2_ALPHA.medium, Qpeak: 15e5, tPlateau: 500, tau: 300 };
      const src = ctx.fx.addSource({ pos: V5(0, 0.25, 0), fuel: "rubber", Q: (t) => hrrCurve(t + 60, curve), D: 0.95, volume: true, seed: 8, mult: { smoke: 1.3 } });
      const pool = ctx.fx.addSource({ pos: V5(0, 0.01, 0), fuel: "rubber", Q: (t) => 3e5 * Math.min(1, t / 60), D: 1.5, start: 120, volume: false, seed: 9, mult: { smoke: 0.6, embers: 0 } });
      ctx.fx.addScorch({ pos: V5(0, 0, 0), radius: 1.6, rate: 1 / 200, glow: 0.3, seed: 3 });
      return { update(dt, t) {
        p.userData.char.uChar.value = Math.min(1, 0.2 + t / 900);
        p.userData.char.uGlow.value = 0.5;
      }, info: () => [...fireRows(src), ...fireRows(pool, "lou\u017Ee taveniny").slice(1, 3)] };
    }
  },
  // ---------------------------------------------------------------------------------------------- nafta
  {
    id: "diesel",
    group: "Kapaliny",
    name: "Rozlit\xE1 nafta 20 l",
    ground: "concrete",
    time: "soumrak",
    duration: 90,
    desc: "Tenk\xE1 vrstva 1,5 mm na betonu: D \u2248 4,1 m, Q \u2248 13 MW, plamen ~6 m, ho\u0159\xED ~1 min. Plamen se po zap\xE1len\xED \u0161\xED\u0159\xED po hladin\u011B.",
    cams: [{ name: "celek", pos: [10, 3.5, 12], target: [0, 3, 0] }, { name: "hr\xE1\u010D", pos: [7, 1.7, 7], target: [0, 2.2, 0] }],
    build(ctx) {
      const sp = spillFire("diesel", 20, 1.5);
      const pd = puddle({ lod: ctx.lod, R: sp.D / 2 });
      ctx.add(pd);
      const spread = 1.2;
      const Dt = (t) => Math.min(sp.D, 0.3 + spread * t);
      const Q = (t) => {
        const k = (Dt(t) / sp.D) ** 2;
        const fade = t < sp.duration ? 1 : Math.max(0, 1 - (t - sp.duration) / 12);
        return sp.Q * k * fade;
      };
      const src = ctx.fx.addSource({ pos: V5(0, 0.01, 0), fuel: "diesel", Q, D: Dt, volume: true, seed: 10, start: 0.5 });
      ctx.fx.addScorch({ pos: V5(0, 0, 0), radius: sp.D * 0.6, rate: 1 / 60, seed: 4 });
      return {
        update() {
        },
        info: () => [...fireRows(src), ["Plocha lou\u017Ee", sp.A.toFixed(1) + " m\xB2 (D " + sp.D.toFixed(2) + " m)", "vrstva 1,5 mm \u26053"], ["Doba ho\u0159en\xED", sp.duration.toFixed(0) + " s", "m/\u1E41 \u26053"], ["Odho\u0159\xEDv\xE1n\xED", (sp.mdot * 1e3).toFixed(0) + " g/s", "Babrauskas \xD70,5 tenk\xE1 vrstva \u26053"]]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- auto
  {
    id: "car",
    group: "Velk\xE9 po\u017E\xE1ry",
    name: "Po\u017E\xE1r auta",
    ground: "asphalt",
    time: "soumrak",
    timeScale: 20,
    duration: 2400,
    desc: "Osobn\xED auto: za\u010D\xEDn\xE1 v motorov\xE9m prostoru, po ~4 min praskaj\xED skla a ho\u0159\xED kabina, pozd\u011Bji pneumatiky a unikaj\xEDc\xED palivo. Vrchol ~5 MW kolem 10. minuty.",
    cams: [{ name: "celek", pos: [8, 3.5, 9], target: [0, 1.6, 0] }, { name: "hr\xE1\u010D", pos: [6, 1.7, 4], target: [0, 1.3, 0] }],
    build(ctx) {
      const c2 = car({ lod: ctx.lod });
      ctx.add(c2);
      const L2 = c2.userData.L / 2;
      const eng = ctx.fx.addSource({ pos: V5(L2 - 0.75, 0.75, 0), fuel: "vehicle", Q: (t) => hrrCurve(t, { alpha: T2_ALPHA.medium, Qpeak: 15e5, tPlateau: 600, tau: 400 }), footprint: { type: "rect", w: 1.1, d: 1.4 }, volume: true, seed: 11 });
      const cab = ctx.fx.addSource({ pos: V5(-0.2, 0.95, 0), fuel: "vehicle", start: 240, Q: (t) => hrrCurve(t, { alpha: T2_ALPHA.fast, Qpeak: 35e5, tPlateau: 400, tau: 500 }), footprint: { type: "rect", w: 2.2, d: 1.4 }, volume: true, seed: 12 });
      const tires = [];
      for (const wx of [-1.35, 1.35]) for (const wz of [-0.85, 0.85]) tires.push(ctx.fx.addSource({ pos: V5(wx, 0.05, wz), fuel: "rubber", start: 480 + (wx > 0 ? 0 : 120), end: 1500, Q: (t) => 25e4 * Math.min(1, t / 90), D: 0.5, volume: false, seed: 20 + tires.length, mult: { smoke: 0.5 } }));
      const fuel = ctx.fx.addSource({ pos: V5(-1.5, 0.01, 0), fuel: "gasoline", start: 420, end: 600, Q: (t) => 8e5 * Math.min(1, t / 20) * Math.max(0, 1 - t / 180), D: 1.6, volume: false, seed: 30 });
      ctx.fx.addScorch({ pos: V5(0, 0, 0), radius: 3.2, rate: 1 / 1200, glow: 0.2, seed: 5 });
      return {
        update(dt, t) {
          const u = c2.userData.char;
          u.uChar.value = Math.min(1, t / 1100);
          u.uGlow.value = Math.min(1, t / 300) * (t < 1800 ? 1 : 0.4);
          c2.userData.tireChar.uChar.value = Math.min(1, Math.max(0, (t - 450) / 600));
          c2.userData.tireChar.uGlow.value = 0.6;
          const tot = [eng, cab, ...tires, fuel].reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0);
          this.total = tot;
        },
        info() {
          return [["Celkov\xFD v\xFDkon", fmtW(this.total || 0), "sou\u010Det zdroj\u016F"], ["F\xE1ze", ctx.t < 240 ? "motorov\xFD prostor" : ctx.t < 480 ? "kabina (rozbit\xE1 skla)" : "pln\u011B rozvinut\xFD", "Ingason & L\xF6nnermark \u26053"], ...fireRows(cab, "kabina").slice(1, 4), ...fireRows(eng, "motor").slice(1, 3)];
        }
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- sud s benzínem
  {
    id: "barrel",
    group: "Exploze",
    name: "V\xFDbuch sudu s benz\xEDnem",
    ground: "dirt",
    time: "soumrak",
    duration: 40,
    loop: true,
    desc: "Zah\u0159\xEDvan\xFD sud praskne (~6 s) \u2192 ohniv\xE1 koule CCPS (25 kg zapojen\xE9ho paliva: D \u2248 17 m, 1,3 s), sud odlet\xED nahoru, ho\u0159\xEDc\xED lou\u017Ee a c\xE1kance. Tlakov\xE1 vlna je slab\xE1 \u2013 benz\xEDn ve voln\xE9m sudu nedetonuje (D-008).",
    cams: [{ name: "celek", pos: [24, 6, 28], target: [0, 6, 0] }, { name: "hr\xE1\u010D", pos: [16, 1.7, 14], target: [0, 4, 0] }],
    controls: [{ id: "film", label: "Filmov\xFD v\xFDbuch (um\u011Bleck\xFD)", type: "check", value: false }],
    build(ctx) {
      const b = barrel({ lod: ctx.lod });
      ctx.add(b);
      const pre = ctx.fx.addSource({ pos: V5(0.3, 0.01, 0.2), fuel: "gasoline", Q: 4e5, D: 0.7, end: 6, volume: true, seed: 40 });
      const M = 25, fb = bleveFireball(M), film = () => ctx.controls.film;
      const Wburst = 0.05;
      let boom2 = false;
      const vel = V5(0, 0, 0);
      let spin = 0;
      return {
        update(dt, t) {
          if (!boom2 && t > 6) {
            boom2 = true;
            const W = film() ? 4 : Wburst;
            ctx.fx.addExplosion({
              pos: V5(0, 0.4, 0),
              W,
              seed: 3,
              flash: 2e6,
              scorch: 6,
              dust: film(),
              fireball: { D: fb.D * (film() ? 1.2 : 1), t: fb.t, T: 1650, rise: fb.H, soot: 0.6 },
              smoke: { n: 500, life: 16, albedo: [0.07, 0.065, 0.06], tau: 2.5, buoy: 6, buoyAcc: 2 },
              debris: { n: film() ? 120 : 14, speed: film() ? 40 : 18, size: 0.12, hot: 0.5, up: 0.6, T: 1200 },
              sparks: { n: 300, speed: 12 }
            });
            for (let i = 0; i < 7; i++) {
              const a = i * 0.9, R = 2 + i % 3 * 2.2;
              ctx.fx.addSource({ pos: V5(Math.cos(a) * R, 0.01, Math.sin(a) * R), fuel: "gasoline", Q: 12e4, D: 0.4, start: 0.6, end: 12 + i * 3, volume: false, seed: 50 + i });
            }
            ctx.fx.addSource({ pos: V5(0, 0.01, 0), fuel: "gasoline", Q: (q) => 6e6 * Math.max(0, 1 - q / 26), D: 3.5, start: 0.4, end: 26, volume: true, seed: 60 });
            vel.set(1.5, film() ? 28 : 17, -1);
            spin = 6;
          }
          if (boom2) {
            vel.y -= 9.81 * dt;
            b.position.addScaledVector(vel, dt);
            b.rotation.x += spin * dt;
            b.rotation.z += spin * 0.6 * dt;
            if (b.position.y < 0) {
              b.position.y = 0;
              vel.multiplyScalar(0.3);
              vel.y = Math.abs(vel.y) < 1 ? 0 : -vel.y;
              spin *= 0.4;
              b.rotation.x = Math.PI / 2;
            }
            b.userData.char.uChar.value = Math.min(1, b.userData.char.uChar.value + dt * 0.4);
            b.userData.char.uGlow.value = 0.5;
          }
        },
        info: () => [["Zapojen\xE9 palivo", M + " kg (z ~150 kg)", "p\u0159edpoklad \u26052"], ["Ohniv\xE1 koule D", fb.D.toFixed(1) + " m", "CCPS \u26054"], ["Trv\xE1n\xED koule", fb.t.toFixed(2) + " s", "CCPS \u26054"], ["V\xFD\u0161ka st\u0159edu", fb.H.toFixed(1) + " m", "CCPS \u26053"], ["Energie roztr\u017Een\xED", "\u2248 0,05 kg TNT (3 bar, 0,2 m\xB3)", "Brode \u26053"], ...blastRows2(ctx.controls.film ? 4 : 0.05).slice(1, 5)]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- acetylen
  {
    id: "acetylene",
    group: "Exploze",
    name: "V\xFDbuch sm\u011Bsi acetylen + kysl\xEDk (s\xE1\u010Dek)",
    ground: "grass",
    time: "soumrak",
    duration: 12,
    loop: true,
    desc: "50 l PE s\xE1\u010Dek se stechiometrickou sm\u011Bs\xED C\u2082H\u2082 + O\u2082 (\u2248 15 g C\u2082H\u2082). Detonace \u2192 modrob\xEDl\xFD z\xE1blesk ~3 000 K, t\xE9m\u011B\u0159 bez saz\xED, ostr\xE1 tlakov\xE1 vlna.",
    cams: [{ name: "celek", pos: [5, 2, 6], target: [0, 0.6, 0] }, { name: "hr\xE1\u010D", pos: [9, 1.7, 9], target: [0, 0.6, 0] }],
    build(ctx) {
      const b = acetyleneBag({ lod: ctx.lod });
      ctx.add(b);
      const mC2H2 = 0.015, W = gasTNT(mC2H2, "acetyleneO2"), fb = heFireball(W);
      let boom2 = false;
      return {
        update(dt, t) {
          if (!boom2 && t > 1.5) {
            boom2 = true;
            b.children[0].visible = false;
            b.children[2].visible = false;
            ctx.fx.addExplosion({ pos: V5(0, 0.4, 0), W, seed: 7, flash: 3e6, scorch: 0.9, dust: true, dustAlbedo: [0.3, 0.3, 0.25], fireball: { D: fb.D, t: fb.t, T: 3e3, soot: 0 }, smoke: { n: 60, life: 4, albedo: [0.75, 0.75, 0.77], tau: 0.25, buoy: 1.5 }, debris: { n: 24, speed: 30, size: 0.03, hot: 0.2, up: 0.5 }, sparks: { n: 80, speed: 25 } });
          }
        },
        info: () => [["Sm\u011Bs", "C\u2082H\u2082 : O\u2082 = 1 : 2,5, 50 l", ""], ["Hmotnost C\u2082H\u2082", (mC2H2 * 1e3).toFixed(0) + " g", ""], ["\xDA\u010Dinnost \u2192 TNT", "45 %", "odhad \u26052"], ...blastRows2(W), ["Ohniv\xE1 koule", fb.D.toFixed(2) + " m / " + (fb.t * 1e3).toFixed(0) + " ms", "objem produkt\u016F \u26052"]]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- granát
  {
    id: "grenade",
    group: "Exploze",
    name: "V\xFDbuch gran\xE1tu",
    ground: "dirt",
    time: "den",
    duration: 12,
    loop: true,
    desc: "Ru\u010Dn\xED gran\xE1t typu M67: 180 g Composition B (\u2248 0,24 kg TNT). Kr\xE1tk\xFD z\xE1blesk, \u010Dern\xFD kou\u0159 (v\xFDbu\u0161nina s nedostatkem kysl\xEDku), prach a st\u0159epiny ~2 km/s.",
    cams: [{ name: "celek", pos: [6, 2.2, 7], target: [0, 0.6, 0] }, { name: "hr\xE1\u010D", pos: [12, 1.7, 10], target: [0, 0.6, 0] }],
    build(ctx) {
      const g2 = grenade({ lod: ctx.lod });
      g2.position.y = 0.032;
      g2.rotation.z = 1.3;
      ctx.add(g2);
      const W = 0.18 * 1.33, fb = heFireball(W), v = gurneySphere(2700, 0.22, 0.18);
      let boom2 = false;
      return {
        update(dt, t) {
          if (!boom2 && t > 1.5) {
            boom2 = true;
            g2.visible = false;
            ctx.fx.addExplosion({ pos: V5(0, 0.05, 0), W, seed: 9, flash: 2e6, scorch: 1.4, dust: true, fireball: { D: fb.D, t: fb.t, T: 2600, soot: 1 }, smoke: { n: 140, life: 7, albedo: [0.11, 0.1, 0.095], tau: 1.6, buoy: 0.7, buoyAcc: 0.25 }, debris: { n: 160, speed: 300, size: 6e-3, hot: 0.9, up: 0.25, T: 1100 }, sparks: { n: 220, speed: 70 } });
            ctx.fx.debris.burst(V5(0, 0.05, 0), { n: 40, speed: 12, size: 0.05, hot: 0, up: 0.7 });
          }
        },
        info: () => [["N\xE1pl\u0148", "180 g Composition B (RE 1,33)", "\u26054"], ...blastRows2(W), ["Rychlost st\u0159epin", v.toFixed(0) + " m/s", "Gurney \u26054"], ["Ohniv\xE1 koule", fb.D.toFixed(2) + " m / " + (fb.t * 1e3).toFixed(0) + " ms", "\u26052"]]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- 1 t TNT
  {
    id: "tnt",
    group: "Exploze",
    name: "Exploze 1 t TNT",
    ground: "dryGrass",
    time: "den",
    duration: 60,
    loop: true,
    desc: "1 000 kg TNT v sudu na zemi. Ohniv\xE1 koule ~25 m (0,5 s), r\xE1zov\xE1 vlna (kondenzace a prach), stoupaj\xEDc\xED \u010Dern\xFD mrak (TNT m\xE1 nedostatek kysl\xEDku \u2192 saze), kr\xE1ter.",
    cams: [{ name: "160 m", pos: [130, 8, 95], target: [0, 50, 0] }, { name: "400 m", pos: [330, 25, 230], target: [0, 60, 0] }, { name: "bl\xEDzko (60 m)", pos: [50, 4, 35], target: [0, 12, 0] }],
    build(ctx) {
      const d = tntDrum({ lod: ctx.lod });
      ctx.add(d);
      const W = 1e3, fb = heFireball(W);
      let boom2 = false;
      return {
        update(dt, t) {
          if (!boom2 && t > 2) {
            boom2 = true;
            d.visible = false;
            ctx.fx.addExplosion({ pos: V5(0, 0.6, 0), W, seed: 11, flash: 6e8, scorch: 26, crater: 1, dust: true, dustAlbedo: [0.36, 0.3, 0.22], fireball: { D: fb.D, t: fb.t, T: 2400, soot: 1, rise: 30 }, smoke: { n: 1400, life: 50, albedo: [0.09, 0.085, 0.08], tau: 3, buoy: 14, buoyAcc: 5, dur: 4 }, debris: { n: 700, speed: 140, size: 0.35, hot: 0.25, up: 0.55, T: 1300 }, sparks: { n: 900, speed: 120 }, life: 70, mushroom: true, ring: true, wilson: 2.5 });
          }
        },
        info: () => [...blastRows2(W), ["Ohniv\xE1 koule", fb.D.toFixed(0) + " m / " + fb.t.toFixed(2) + " s", "\u26052"], ["Rychlost \u010Dela v 10 m", "\u2248 " + (343 * Math.sqrt(1 + 6 * blastSummary(W, [10])[0].Ps / (7 * 101325))).toFixed(0) + " m/s", "Rankine\u2013Hugoniot \u26055"]]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- les
  {
    id: "forest",
    group: "Velk\xE9 po\u017E\xE1ry",
    name: "Lesn\xED po\u017E\xE1r",
    ground: "forest",
    time: "soumrak",
    timeScale: 30,
    wind: 2,
    startT: 900,
    duration: 3600,
    desc: "Borov\xFD les 260 \xD7 260 m. \u0160\xED\u0159en\xED po zemi (hrabanka) podle Andersonovy elipsy; kde Byramova intenzita p\u0159ekro\u010D\xED pr\xE1h Van Wagnera, po\u017E\xE1r p\u0159ech\xE1z\xED do korun.",
    cams: [{ name: "nad lesem", pos: [-95, 45, 95], target: [-45, 0, 0] }, { name: "v lese", pos: [-12, 1.7, 22], target: [-45, 5, 0] }, { name: "daleko", pos: [-200, 90, 260], target: [0, 10, 0] }],
    build(ctx) {
      return landscapeFire(ctx, { kind: "pine", size: 260, cell: 5, fuel: "forestLitter", crown: true, density: 1, seed: 71 });
    }
  },
  // ---------------------------------------------------------------------------------------------- křoví
  {
    id: "brush",
    group: "Velk\xE9 po\u017E\xE1ry",
    name: "Ho\u0159en\xED such\xE9ho k\u0159ov\xED",
    ground: "dryGrass",
    time: "den",
    timeScale: 6,
    wind: 2,
    startT: 150,
    duration: 1500,
    desc: "Such\xE9 k\u0159ov\xED a tr\xE1va 160 \xD7 160 m. Rychl\xE9 \u0161\xED\u0159en\xED (~10 m/min ve v\u011Btru), plameny 2\u20134 m, \u0161edob\xEDl\xFD kou\u0159.",
    cams: [{ name: "nad plochou", pos: [-60, 22, 55], target: [-30, 0, 0] }, { name: "hr\xE1\u010D", pos: [-15, 1.7, 14], target: [-35, 2, 0] }],
    build(ctx) {
      return landscapeFire(ctx, { kind: "bush", size: 160, cell: 3, fuel: "brush", crown: false, density: 2.2, seed: 81 });
    }
  },
  // ---------------------------------------------------------------------------------------------- dům
  {
    id: "house",
    group: "Velk\xE9 po\u017E\xE1ry",
    name: "Po\u017E\xE1r domu",
    ground: "grass",
    time: "noc",
    timeScale: 15,
    duration: 2400,
    desc: "Po\u017E\xE1r za\u010Dne v ob\xFDv\xE1ku, flashover podle Thomase, pak ventilac\xED \u0159\xEDzen\xE9 ho\u0159en\xED (Kawagoe) s plameny z oken a \u010Dern\xFDm kou\u0159em; p\u0159eskok do kuchyn\u011B a proho\u0159en\xED st\u0159echy.",
    cams: [{ name: "pr\u016F\u010Del\xED", pos: [12, 4, 16], target: [0, 3, 0] }, { name: "hr\xE1\u010D", pos: [8, 1.7, 11], target: [0, 2.5, 0] }, { name: "celek", pos: [26, 12, 26], target: [0, 4, 0] }],
    build(ctx) {
      return houseFire(ctx);
    }
  },
  // ---------------------------------------------------------------------------------------------- laboratoř
  {
    id: "lab",
    group: "Laborato\u0159",
    name: "Parametrick\xFD plamen",
    ground: "concrete",
    time: "noc",
    desc: "Voln\xFD plamen pro lad\u011Bn\xED enginu: zvol palivo, v\xFDkon a pr\u016Fm\u011Br \u2013 v\xFD\u0161ka, n\xE1klon, barva a kou\u0159 se spo\u010D\xEDtaj\xED.",
    cams: [{ name: "celek", pos: [6, 3, 7], target: [0, 1.5, 0] }],
    controls: [
      { id: "fuel", label: "Palivo", type: "select", value: "woodDry", options: ["woodDry", "diesel", "gasoline", "rubber", "straw", "paraffin", "vehicle", "houseContents", "butane", "acetylene", "acetone", "ethanol"] },
      { id: "Q", label: "V\xFDkon Q [kW]", type: "range", min: 1, max: 2e4, value: 500, log: true },
      { id: "D", label: "Pr\u016Fm\u011Br D [m]", type: "range", min: 0.05, max: 6, value: 1, log: true }
    ],
    build(ctx) {
      const src = ctx.fx.addSource({ pos: V5(0, 0.01, 0), fuel: "woodDry", Q: () => ctx.controls.Q * 1e3, D: () => ctx.controls.D, volume: true, seed: 90 });
      return { update() {
        src.o.fuel = ctx.controls.fuel;
      }, info: () => fireRows(src) };
    }
  }
];
var insertAfter = (arr, id, items) => {
  arr.splice(arr.findIndex((s) => s.id === id) + 1, 0, ...items);
};
var SCENARIOS = [...ITER6_FIRST, ...BASE];
insertAfter(SCENARIOS, "tires", ITER6_SPREAD);
insertAfter(SCENARIOS, "diesel", ITER6_LIQUIDS);
insertAfter(SCENARIOS, "acetylene", [ITER6_BLAST[0]]);
insertAfter(SCENARIOS, "lab", [ITER6_BLAST[1]]);
var i7 = (id) => [...ITER7_INCEND, ...ITER7_SPECIAL].find((x) => x.id === id);
insertAfter(SCENARIOS, "lighter", [i7("jetFire")]);
insertAfter(SCENARIOS, "bonfire", [i7("whirl")]);
insertAfter(SCENARIOS, "tires", [i7("thermite")]);
insertAfter(SCENARIOS, "leak", [i7("trail"), i7("molotov"), i7("flamethrower")]);
insertAfter(SCENARIOS, "acetyleneCyl", [i7("dust"), i7("fireworks"), ...ITER7_CHAIN]);
insertAfter(SCENARIOS, "tnt", [...ITER7_GUNS, ...ITER7_AFTER]);
function landscapeFire(ctx, o) {
  const { size, cell } = o, nx = Math.round(size / cell), ny = nx;
  const r = mulberry32(o.seed), f2 = fbm2(o.seed, 3, 5);
  const fuelMap = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = f2(i / nx, j / ny);
    fuelMap[j * nx + i] = Math.max(0, Math.min(1, (v - 0.28) * 2.6));
  }
  const maxN = Math.round(ctx.tier.treeMax * (o.kind === "bush" ? 1.5 : 1));
  const items = [];
  let tries = 0;
  while (items.length < maxN && tries < maxN * 20) {
    tries++;
    const x = (r() - 0.5) * size, z = (r() - 0.5) * size;
    const ci = Math.min(nx - 1, Math.floor((x / size + 0.5) * nx)), cj = Math.min(ny - 1, Math.floor((z / size + 0.5) * ny));
    if (r() > fuelMap[cj * nx + ci] * o.density * 0.6) continue;
    items.push({ x, z, s: o.kind === "pine" ? 10 + r() * 8 : 0.9 + r() * 0.9, sy: 1, rot: r() * 6.28, cell: cj * nx + ci });
  }
  const flora = new InstancedFlora(ctx.scene, o.kind, items, o.kind === "pine" ? { lodNear: Math.min(ctx.lod, 3), lodFar: ctx.lod >= 3 ? 1 : 0, nearDist: 45, seed: o.seed } : { lodNear: Math.min(ctx.lod, 3), lodMid: Math.min(ctx.lod, 1), lodFar: 0, nearDist: 40, nearFrac: 0.35, seed: o.seed });
  ctx.addDisposable(flora);
  ctx.flora.push(flora);
  const fuel = FUELS[o.fuel];
  const ign = [];
  for (let k = -3; k <= 3; k++) {
    const i = Math.round(nx * 0.2), j = Math.round(ny * 0.5) + k;
    fuelMap[j * nx + i] = Math.max(fuelMap[j * nx + i], 0.8);
    ign.push([i, j, Math.abs(k) * 20]);
  }
  let arr = null, lastWind = null;
  const midflame = o.kind === "pine" ? 0.22 : 0.4;
  const recompute = (t) => {
    const U = ctx.fx.air.U10 * midflame;
    const ignitions = arr ? [] : ign;
    if (arr) {
      for (let k = 0; k < nx * ny; k++) if (arr.T[k] <= t) ignitions.push([k % nx, k / nx | 0, arr.T[k]]);
    }
    arr = arrivalTimes({ nx, ny, cell, fuel: o.fuel, fuelMap, ignitions, windDir: ctx.fx.air.dir, U });
    lastWind = ctx.fx.air.U10;
  };
  recompute(0);
  const I0 = crownInitiation(4, 100);
  const poolN = [40, 70, 110, 180, 240, 300][ctx.tier.id] ?? 180;
  const pool = [];
  for (let i = 0; i < poolN; i++) pool.push(ctx.fx.addSource({ pos: V5(0, 0, 0), fuel: o.fuel, Q: 0, D: cell, footprint: { type: "rect", w: cell, d: cell }, volume: i < 4, seed: 100 + i, mult: { smoke: 1, embers: 0.6, haze: 0.15, light: 1 } }));
  pool.forEach((s) => s.enabled = false);
  const detail = o.kind === "pine" ? forestDetail(ctx, { flora, arr: () => arr, fuel, seed: o.seed + 5 }) : null;
  if (detail) ctx.addDisposable(detail);
  const scorch = ctx.fx.addScorch({ pos: V5(0, 0, 0), radius: 0.1, seed: 9 });
  scorch.mesh.visible = false;
  let stats = { burning: 0, burnt: 0, crown: 0 };
  const cellCenter = (k) => [(k % nx + 0.5) * cell - size / 2, ((k / nx | 0) + 0.5) * cell - size / 2];
  const cv = document.createElement("canvas");
  cv.width = nx;
  cv.height = ny;
  const cg = cv.getContext("2d");
  const img = cg.createImageData(nx, ny);
  const tex = new THREE27.CanvasTexture(cv);
  tex.magFilter = THREE27.LinearFilter;
  const bpMat = new THREE27.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  bpMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, sharedUniforms());
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nout vec3 vBpW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvBpW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nin vec3 vBpW;\n" + GLSL_COMMON).replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  {
    vec4 tx = texture(map, vMapUv);
    float gl = clamp((tx.r * 255.0 - 12.0) / 120.0, 0.0, 1.0);          // zbytkov\xE1 \u017Ehavost bu\u0148ky (zapsan\xE1 v R)
    float n = n3(vBpW * 0.35 + vec3(0.0, uGTime * 0.05, 0.0)), n2 = n3(vBpW * 1.3 + 0.37);
    float patchy = smoothstep(0.42, 0.68, n * 0.7 + n2 * 0.3);
    float Tk = 800.0 + 330.0 * gl * (0.6 + 0.6 * n2);
    totalEmissiveRadiance += bbColor(Tk) * gl * patchy * uFlameK * 0.22;
  }`);
  };
  bpMat.customProgramCacheKey = () => "burnPlane";
  const burnPlane = new THREE27.Mesh(new THREE27.PlaneGeometry(size, size), bpMat);
  burnPlane.rotation.x = -Math.PI / 2;
  burnPlane.position.y = 0.02;
  ctx.add(burnPlane);
  let lastTex = -10, smAcc = 0;
  return {
    flora,
    update(dt, t) {
      if (lastWind !== ctx.fx.air.U10) recompute(t);
      const U = ctx.fx.air.U10 * midflame, R = headROS(o.fuel, U), by = byram(o.fuel, R);
      const crownCell = o.crown && by.I > I0 * 0.6;
      const burning = [];
      let burnt = 0;
      for (let k = 0; k < nx * ny; k++) {
        const ta = arr.T[k];
        if (ta === Infinity) continue;
        if (t >= ta) {
          if (t < ta + fuel.tr) burning.push(k);
          else burnt++;
        }
      }
      const cp = ctx.camera.position;
      burning.sort((a, b) => {
        const [ax, az] = cellCenter(a), [bx, bz] = cellCenter(b);
        return (ax - cp.x) ** 2 + (az - cp.z) ** 2 - ((bx - cp.x) ** 2 + (bz - cp.z) ** 2);
      });
      stats = { burning: burning.length, burnt, crown: crownCell ? burning.length : 0, R, I: by.I, L: by.L, LB: lengthToBreadth(U), I0 };
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i], k = burning[i];
        if (k === void 0) {
          s.enabled = false;
          continue;
        }
        const [x, z] = cellCenter(k), age = (t - arr.T[k]) / fuel.tr, fm = fuelMap[k];
        const env = Math.sin(Math.PI * Math.min(1, age)) ** 0.6;
        const qa = fuel.dHc * fuel.w * cell * cell / fuel.tr * fm * env;
        const crown = crownCell && fm > 0.4 && o.crown;
        s.enabled = true;
        s.pos.set(x, crown ? 3.5 : 0.02, z);
        s.o.Q = crown ? qa * 2.2 : qa;
        s.o.L = crown ? () => 14 + 8 * env : () => Math.max(0.3, by.L * env);
        s.o.fuel = crown ? "crown" : o.fuel;
      }
      for (let i = 0; i < flora.items.length; i++) {
        const ta = arr.T[flora.items[i].cell];
        if (ta === Infinity || t < ta) {
          flora.setChar(i, 0, 0);
          continue;
        }
        const a = (t - ta) / fuel.tr;
        flora.setChar(i, Math.min(1, a * 1.5), a < 1.5 ? Math.min(1, a * 3) * (1 - a / 1.5) : 0);
      }
      flora.update(ctx.camera, t);
      detail?.update(t, crownCell);
      {
        const smN = Math.min(burnt, 400), rate = smN * 0.04 * (ctx.tier.smokeMul ?? 1) * ctx.fx.budgetScale.smoke;
        smAcc += rate * dt;
        let guard = 0;
        while (smAcc >= 1 && guard++ < 40) {
          const k = r() * nx * ny | 0, ta = arr.T[k];
          if (ta === Infinity || t < ta + fuel.tr || t > ta + fuel.tr * 4) {
            smAcc -= 0.05;
            continue;
          }
          smAcc -= 1;
          const [x, z] = cellCenter(k), w = 1 - (t - ta - fuel.tr) / (fuel.tr * 3);
          ctx.fx.bb.spawnSmoke({
            x: x + (r() - 0.5) * cell,
            y: 0.15,
            z: z + (r() - 0.5) * cell,
            vx: 0,
            vy: 0.4 + 0.5 * r(),
            vz: 0,
            life: 7 + 6 * r(),
            s0: 0.5 + 0.6 * r(),
            s1: 3 + 3 * r(),
            tau: 0.25 * w * fuelMap[k] / Math.sqrt(ctx.tier.smokeMul ?? 1),
            albedo: [0.62, 0.62, 0.64],
            drag: 1.2,
            buoy: 0.3,
            seed: r()
          });
        }
      }
      if (t - lastTex > 2) {
        lastTex = t;
        for (let k = 0; k < nx * ny; k++) {
          const ta = arr.T[k], a = ta === Infinity || t < ta ? 0 : Math.min(1, (t - ta) / fuel.tr);
          const glow = ta !== Infinity && t >= ta && t < ta + fuel.tr * 1.6 ? 1 - (t - ta) / (fuel.tr * 1.6) : 0;
          img.data.set([12 + glow * 120, 10 + glow * 30, 8, a * 235], k * 4);
        }
        cg.putImageData(img, 0, 0);
        tex.needsUpdate = true;
      }
    },
    info: () => [
      ["Palivo", fuel.name, `w = ${fuel.w} kg/m\xB2`],
      ["Rychlost \u010Dela R", (stats.R * 60).toFixed(1) + " m/min", "Rothermel-lite \u26052"],
      ["Byramova intenzita", (stats.I / 1e3).toFixed(0) + " kW/m", "Byram \u26054"],
      ["D\xE9lka plamene", stats.L?.toFixed(1) + " m", "Byram \u26054"],
      ["Tvar L/B", stats.LB?.toFixed(2), "Anderson \u26054"],
      ["Pr\xE1h korun I0", (stats.I0 / 1e3).toFixed(0) + " kW/m", "Van Wagner \u26053"],
      ["Ho\u0159\xEDc\xED bu\u0148ky", `${stats.burning} (${cell}\xD7${cell} m)`, ""],
      ["Vyho\u0159elo", (stats.burnt * cell * cell / 1e4).toFixed(2) + " ha", ""],
      ["Re\u017Eim", stats.crown ? "korunov\xFD po\u017E\xE1r" : "p\u0159\xEDzemn\xED po\u017E\xE1r", ""],
      ["Porost", `${flora.items.length} ks, \u25B3 ${(flora.tris() / 1e6).toFixed(2)} M`, `LOD bl\xEDzko/daleko`]
    ]
  };
}
function houseFire(ctx) {
  const h2 = house({ lod: ctx.lod });
  ctx.add(h2);
  const ud = h2.userData, Hw = 2.9;
  const room2 = (i) => {
    const rm = ud.rooms[i];
    const Ao = rm.wins.reduce((s, w) => s + w.w * w.h * (w.door ? 0.3 : 1), 0);
    const Ho = rm.wins.reduce((s, w) => s + w.h * w.w, 0) / Math.max(rm.wins.reduce((s, w) => s + w.w, 0), 1e-3);
    const AT = 2 * (rm.w * rm.d + rm.w * Hw + rm.d * Hw);
    return { ...rm, ...compartment({ Ao, Ho, AT }), Ao, Ho, AT };
  };
  const rooms = [room2(0), room2(1)];
  const tStart = [0, 0];
  const srcs = [];
  const mkRoom = (k, start) => {
    const rm = rooms[k], alpha = T2_ALPHA.fast;
    const tfo = Math.sqrt(rm.Qfo / alpha);
    rm.tfo = start + tfo;
    const Qin = (t) => t < tfo ? alpha * t * t : rm.Qmax * Math.min(1, 0.6 + (t - tfo) / 120) * (t > tfo + 1500 ? Math.exp(-(t - tfo - 1500) / 400) : 1);
    rm.Qin = Qin;
    const inside = ctx.fx.addSource({ pos: V5(rm.x, 0.12, rm.z), fuel: "houseContents", start, Q: (t) => Math.min(Qin(t), rm.Qmax * 0.7), footprint: { type: "rect", w: rm.w * 0.6, d: rm.d * 0.6 }, scale: (t) => Math.min(1, 0.2 + t / tfo), L: () => Hw * 0.95, ventLocal: 0.35, volume: false, seed: 200 + k, mult: { smoke: 0.4, embers: 0.2, haze: 0 } });
    srcs.push(inside);
    for (const w of rm.wins) {
      if (w.door) continue;
      const wall2 = w.wall, n = { S: [0, 0, 1], N: [0, 0, -1], E: [1, 0, 0], W: [-1, 0, 0] }[wall2];
      const off = { S: [w.u, ud.D / 2], N: [-w.u, -ud.D / 2], E: [ud.W / 2, -w.u], W: [-ud.W / 2, w.u] }[wall2];
      const share = w.w * w.h / rm.Ao;
      const s = ctx.fx.addSource({
        pos: V5(off[0] + n[0] * 0.25, w.y + w.h * 0.55, off[1] + n[2] * 0.25),
        fuel: "houseContents",
        start: start + tfo,
        Q: (t) => Math.max(0, Qin(t + tfo) - rm.Qmax * 0.6) * share * 0.9 + 2e5 * share,
        footprint: { type: "rect", w: wall2 === "E" || wall2 === "W" ? 0.25 : w.w * 0.9, d: wall2 === "E" || wall2 === "W" ? w.w * 0.9 : 0.25 },
        push: [n[0] * 2.2, 0.6, n[2] * 2.2],
        ventLocal: 0.55,
        volume: true,
        seed: 210 + srcs.length,
        mult: { smoke: 1.4, embers: 0.6 }
      });
      srcs.push(s);
    }
  };
  mkRoom(0, 0);
  tStart[1] = rooms[0].tfo + 180;
  mkRoom(1, tStart[1]);
  const roofT = rooms[0].tfo + 600;
  const tc = 300;
  const roof = ctx.fx.addSource({ pos: V5(-1.5, Hw + 1.8, 0), fuel: "houseContents", start: roofT, Q: (t) => 6e6 * Math.min(1, t / 240) * (1 + (t > tc ? 1.3 * Math.exp(-(t - tc) / 45) : 0)), footprint: { type: "rect", w: 5, d: 4 }, scale: (t) => Math.min(1, 0.2 + t / 300), volume: true, seed: 230, mult: { embers: 2 } });
  let collapsed = false;
  const hole = (t) => t < roofT ? 0 : t < roofT + tc ? Math.min(1.8, (t - roofT) / 200 * 1.8) : 3.1 + Math.min(0.9, (t - roofT - tc) / 400);
  return {
    update(dt, t) {
      const c2 = ud.char, hr = hole(t);
      for (const u of [c2.roof, c2.wood]) u.uHole.value.set(-1.6, 0, hr, Hw - 0.3);
      if (!collapsed && t > roofT + tc && t < roofT + tc + 30) {
        collapsed = true;
        const P = V5(-1.6, Hw, 0), r = mulberry32(77), sp = ctx.fx.sp, em = ctx.tier.emberMul ?? 1;
        for (let i = 0; i < 500 * em * ctx.fx.budgetScale.spark; i++) {
          const a = r() * 6.283, rr = 2.5 * Math.sqrt(r()), dm = 1e-3 + 6e-3 * r() ** 2, vt = Math.sqrt(4 * 250 * 9.81 * dm / 3.6);
          sp.spawn({
            x: P.x + Math.cos(a) * rr,
            y: P.y + r() * 1.5,
            z: P.z + Math.sin(a) * rr,
            vx: (r() - 0.5) * 4,
            vy: 4 + 14 * r(),
            vz: (r() - 0.5) * 4,
            life: 3 + 8 * r(),
            T: 1150 + 250 * r(),
            size: dm * 1.2,
            drag: vt / 9.81,
            grav: 1,
            seed: r(),
            ember: true,
            vt,
            ox: P.x,
            oz: P.z,
            pq: 4e3,
            pz0: Hw
          });
        }
        for (let i = 0; i < 60; i++) {
          const a = r() * 6.283;
          ctx.fx.bb.spawnSmoke({
            x: P.x + Math.cos(a) * 2.5 * r(),
            y: Hw + 0.5 + r() * 2,
            z: P.z + Math.sin(a) * 2 * r(),
            vx: Math.cos(a) * 2,
            vy: 2 + 3 * r(),
            vz: Math.sin(a) * 2,
            life: 6 + 6 * r(),
            s0: 1.2,
            s1: 4 + 3 * r(),
            tau: 1.2,
            albedo: [0.12, 0.11, 0.1],
            drag: 0.8,
            seed: r()
          });
        }
        ctx.fx.debris.burst(V5(-1.6, Hw + 1.2, 0), { n: 50, speed: 5, size: 0.25, hot: 0.7, up: 0.2, T: 1050 }, r);
        roof.brandBurst(45, 2.2, [P.x, Hw + 0.3, P.z]);
        ctx.fx.shake = Math.max(ctx.fx.shake, 0.15);
        ctx.message?.("Z\u0159\xEDcen\xED st\u0159echy nad ob\xFDv\xE1kem: krov pad\xE1 do \u017E\xE1ru, v\xFDtrysk jisker.");
      }
      if (t < roofT + tc) collapsed = false;
      c2.plaster.uChar.value = Math.min(0.55, Math.max(0, (t - rooms[0].tfo) / 1500));
      c2.plaster.uGlow.value = 0;
      c2.roof.uChar.value = Math.min(1, Math.max(0, (t - roofT + 200) / 600));
      c2.roof.uGlow.value = t > roofT ? 0.8 : 0;
      c2.wood.uChar.value = Math.min(1, Math.max(0, (t - rooms[0].tfo + 60) / 400));
      c2.wood.uGlow.value = t > rooms[0].tfo ? 0.7 : 0;
      this.total = [...srcs, roof].reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0);
    },
    info() {
      const r0 = rooms[0], r1 = rooms[1], t = ctx.t;
      return [
        ["Celkov\xFD v\xFDkon", fmtW(this.total || 0), "sou\u010Det zdroj\u016F"],
        ["F\xE1ze", t < r0.tfo ? "rozvoj v ob\xFDv\xE1ku" : t < tStart[1] ? "flashover ob\xFDv\xE1ku, plameny z oken" : t < roofT ? "ho\u0159\xED ob\u011B m\xEDstnosti" : "proho\u0159el\xE1 st\u0159echa", ""],
        ["Flashover ob\xFDv\xE1k", fmtW(r0.Qfo) + ` v ${(r0.tfo / 60).toFixed(1)} min`, "Thomas \u26054"],
        ["Qmax ob\xFDv\xE1k (ventilace)", fmtW(r0.Qmax) + `  Ao\u221AHo = ${(r0.Ao * Math.sqrt(r0.Ho)).toFixed(2)} m^2,5`, "Kawagoe \u26054"],
        ["Flashover kuchy\u0148", fmtW(r1.Qfo) + ` v ${(r1.tfo / 60).toFixed(1)} min`, "Thomas \u26054"],
        ["Proho\u0159en\xED st\u0159echy", (roofT / 60).toFixed(1) + " min", "p\u0159edpoklad \u26052"],
        ["Z\u0159\xEDcen\xED st\u0159echy", ((roofT + tc) / 60).toFixed(1) + " min", "p\u0159edpoklad \u26052"],
        ...fireRows(srcs[1], "okno").slice(1, 4)
      ];
    }
  };
}
var scenarioById = (id) => SCENARIOS.find((s) => s.id === id);

// src/physics/index.js
var physics_exports = {};
__export(physics_exports, {
  AGENTS: () => AGENTS,
  AMB: () => AMB,
  DAMAGE: () => DAMAGE,
  EXPLOSIVES: () => EXPLOSIVES,
  E_PROPELLANT: () => E_PROPELLANT,
  FLUX_EFFECTS: () => FLUX_EFFECTS,
  FUELS: () => FUELS,
  FireSim: () => FireSim,
  GUNS: () => GUNS,
  L_WATER: () => L_WATER,
  MATERIALS: () => MATERIALS,
  RULES: () => RULES,
  SIGMA: () => SIGMA,
  SOOT_SIGMA: () => SOOT_SIGMA,
  STEAM_M3_PER_KG: () => STEAM_M3_PER_KG,
  T2_ALPHA: () => T2_ALPHA,
  TNT_J_PER_KG: () => TNT_J_PER_KG,
  ThermalBody: () => ThermalBody,
  WIND_CLASSES: () => WIND_CLASSES,
  agentDemand: () => agentDemand,
  agentEffect: () => agentEffect,
  arrivalTimes: () => arrivalTimes,
  blackbody: () => blackbody,
  blackbodyLUT: () => blackbodyLUT,
  blackbodyXYZ: () => blackbodyXYZ,
  blastOn: () => blastOn,
  blastSummary: () => blastSummary,
  bleveFireball: () => bleveFireball,
  byram: () => byram,
  charDepth: () => charDepth,
  cmf: () => cmf,
  compartment: () => compartment,
  contactFlux: () => contactFlux,
  craterRadius: () => craterRadius,
  crownInitiation: () => crownInitiation,
  damageAt: () => damageAt,
  drainHead: () => drainHead,
  drainTime: () => drainTime,
  emissivePower: () => emissivePower,
  explosionSpec: () => explosionSpec,
  fireClass: () => fireClass,
  fireSpec: () => fireSpec,
  flameColorTemp: () => flameColorTemp,
  flameHeight: () => flameHeight,
  flameLuminousIntensity: () => flameLuminousIntensity,
  flameTilt: () => flameTilt,
  fluxAt: () => fluxAt,
  fluxEffect: () => fluxEffect,
  fluxFromFire: () => fluxFromFire,
  gasTNT: () => gasTNT,
  glassState: () => glassState,
  gurneySphere: () => gurneySphere,
  heFireball: () => heFireball,
  headROS: () => headROS,
  hrrCurve: () => hrrCurve,
  hrrCurveEnd: () => hrrCurveEnd,
  ignitionDose: () => ignitionDose,
  jetFlameLength: () => jetFlameLength,
  laminarFlameHeight: () => laminarFlameHeight,
  layerTemp: () => layerTemp,
  leakFire: () => leakFire,
  lengthToBreadth: () => lengthToBreadth,
  lineFlameHeight: () => lineFlameHeight,
  liquidSpread: () => liquidSpread,
  masonryLook: () => masonryLook,
  material: () => material,
  meltStep: () => meltStep,
  muzzleSpec: () => muzzleSpec,
  objectFire: () => objectFire,
  overpressure: () => overpressure,
  pileFire: () => pileFire,
  planck: () => planck,
  plumeAxis: () => plumeAxis,
  plumeMassFlow: () => plumeMassFlow,
  pointSourceFlux: () => pointSourceFlux,
  poolFire: () => poolFire,
  positivePhase: () => positivePhase,
  puffingFrequency: () => puffingFrequency,
  rosAt: () => rosAt,
  scaleFire: () => scaleFire,
  scaled: () => scaled,
  sheetEquilibrium: () => sheetEquilibrium,
  sheetLook: () => sheetLook,
  shockRadiusAt: () => shockRadiusAt,
  shockSpeed: () => shockSpeed,
  shockTable: () => shockTable,
  smokeColor: () => smokeColor,
  smokeOpticalDepth: () => smokeOpticalDepth,
  sootRate: () => sootRate,
  sourceOptions: () => sourceOptions,
  spillFire: () => spillFire,
  stepBarrelTemp: () => stepBarrelTemp,
  stepDose: () => stepDose,
  stepGlass: () => stepGlass,
  stepSheetTemp: () => stepSheetTemp,
  suppressStep: () => suppressStep,
  sympathetic: () => sympathetic,
  timeToIgnition: () => timeToIgnition,
  torricelli: () => torricelli,
  tracer: () => tracer,
  transmissivity: () => transmissivity,
  ventilation: () => ventilation,
  virtualOrigin: () => virtualOrigin,
  waterDemand: () => waterDemand,
  windAt: () => windAt,
  windowFlameHeight: () => windowFlameHeight,
  xyzToLinearSRGB: () => xyzToLinearSRGB
});
export {
  ASSETS,
  AirField,
  BillboardSystem,
  Burnable,
  Debris,
  Environment,
  Explosion,
  FLAMEK,
  FLAME_LUM,
  FXWorld,
  FireAudio,
  FireLights,
  FireSim,
  FireSource,
  FlameVolume,
  GLSL_COMMON,
  GunFX,
  HazeSystem,
  LAYER_FX,
  LAYER_HAZE,
  LAYER_SHADOW,
  PRE,
  PTYPE,
  Pipeline,
  SCENARIOS,
  Scorch,
  SmokeVolume,
  SparkSystem,
  Spray,
  TIERS,
  TIMES,
  ThermalBody,
  VOLUME_FIELDS,
  VOLUME_FS,
  WallSoot,
  applyChar,
  assetById,
  atlasToCanvas,
  bakeAtlas,
  bbTexture,
  boom,
  crackleBuffer,
  fireVoice,
  guessTier,
  noiseBuffer,
  noiseTexture,
  physics_exports as physics,
  pop,
  scenarioById,
  sharedUniforms
};
