var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/fx/world.js
import * as THREE9 from "three";

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
function blackbodyLUT(N = 256, Tmin = 500, Tmax = 3500) {
  const data = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const T = Tmin + (Tmax - Tmin) * i / (N - 1);
    const { rgb, lum } = blackbody(T);
    data.set([rgb[0], rgb[1], rgb[2], Math.log2(Math.max(lum, 1e-12))], i * 4);
  }
  return { data, N, Tmin, Tmax };
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
function noiseTexture(N = 64, seed = 7) {
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
  function perlin(G, p, x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    let v = 0;
    const u = fade(xf), w = fade(yf), q = fade(zf);
    for (let c2 = 0; c2 < 8; c2++) {
      const dx = c2 & 1, dy = c2 >> 1 & 1, dz = c2 >> 2 & 1;
      const gi = ((xi + dx) % p + p) % p + p * (((yi + dy) % p + p) % p + p * (((zi + dz) % p + p) % p));
      const d = G[gi * 3] * (xf - dx) + G[gi * 3 + 1] * (yf - dy) + G[gi * 3 + 2] * (zf - dz);
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
  const data = new Uint8Array(N * N * N * 4);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const sx = x / N, sy = y / N, sz = z / N;
    const a = (perlin(G1, P, sx * P, sy * P, sz * P) * 0.7 + perlin(G2, P * 2, sx * P * 2, sy * P * 2, sz * P * 2) * 0.35) * 2.2;
    const wv = 1 - worley(sx * C, sy * C, sz * C);
    const w2 = 1 - worley(sx * C * 2 + 0.31, sy * C * 2 + 0.17, sz * C * 2 + 0.53);
    const i = (x + N * (y + N * z)) * 4;
    data[i] = Math.max(0, Math.min(255, (a * 0.5 + 0.5) * 255));
    data[i + 1] = Math.max(0, Math.min(255, (wv * 0.65 + w2 * 0.35) * 255));
    data[i + 2] = Math.max(0, Math.min(255, rnd() * 255));
    data[i + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
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
  const { data, N, Tmin, Tmax } = blackbodyLUT(256, 500, 3500);
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const t = new THREE.DataTexture(half, N, 1, THREE.RGBAFormat, THREE.HalfFloatType);
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
vec3 sootColor(float T){
  float u0 = clamp((T - uBB.x) / (uBB.y - uBB.x), 0.0, 1.0);
  float u1 = clamp((T * 1.28 - uBB.x) / (uBB.y - uBB.x), 0.0, 1.0);
  vec4 a = texture(tBB, vec2(u1 * (255.0/256.0) + 0.5/256.0, 0.5));
  vec4 b = texture(tBB, vec2(u0 * (255.0/256.0) + 0.5/256.0, 0.5));
  return a.rgb * exp2(b.a * uBB.z) * uPreExp;
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
uniform float exposure, bloomStrength, useBloom, useHaze, grain, time, vignette;
uniform vec2 res;
vec3 aces(vec3 x){ // Hill / Narkowicz \u2013 ACES fit
  const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = m1 * x; vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 0.0) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  if (useHaze > 0.5) { vec2 d = texture(tHaze, uv).rg; uv += d; }
  vec3 c = texture(tMain, uv).rgb;
  if (useBloom > 0.5) c += texture(tBloom, vUv).rgb * bloomStrength;
  c *= exposure;
  vec2 q = vUv - 0.5; c *= 1.0 - vignette * dot(q, q) * 1.6;
  c = aces(c);
  c = toSRGB(c);
  if (grain > 0.0) c += (h(vUv * res + fract(time) * 91.0) - 0.5) * grain;
  o = vec4(c, 1.0);
}`
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
      res: { value: new THREE2.Vector2() }
    });
    this.setTier(tier);
  }
  setTier(tier) {
    this.tier = tier;
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.maxPixelRatio));
    this.dispose();
    this.resize(this.w || 1280, this.h || 720);
  }
  dispose() {
    for (const k of ["main", "depth", "haze"]) if (this[k]) this[k].dispose();
    (this.bloomRTs || []).forEach((t) => t.dispose());
    this.bloomRTs = [];
  }
  resize(w, h2) {
    this.w = w;
    this.h = h2;
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
      r.setRenderTarget(this.main);
      const ac = r.autoClear;
      r.autoClear = false;
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
    vec3 em = sootColor(T) * a.r * uFlameLum * vC.a * life * vC.rgb;
    float al = a.b * a.a * life * 0.5 * vC.a;
    fragColor = vec4(em * soft, al * soft);
  } else if (vP.w > 2.5) {
    // ohniv\xFD chuchvalec (ohniv\xE1 koule, horn\xED \u010D\xE1st velk\xFDch po\u017E\xE1r\u016F): maska z kou\u0159ov\xE9ho listu, emise Planck
    float T = vG.w * (0.82 + 0.3 * a.g) ;
    float life = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.6, 1.0, age));
    float d = clamp(a.r * 1.6, 0.0, 1.0);
    vec3 em = sootColor(T) * d * uFlameLum * vC.a * life;
    float al = (1.0 - exp(-a.r * vC.r * 3.0)) * life * soft;
    fragColor = vec4(em * soft, al);
  } else {
    // kou\u0159: R = hustota, G = propustnost ke sv\u011Btlu shora, B = okraj
    float tau = vC.a;
    float al = (1.0 - exp(-a.r * tau * 2.2)) * a.a;
    al *= (1.0 - smoothstep(0.8, 1.0, age)) * soft;
    vec3 alb = vC.rgb;
    vec3 lit = (uAmb * (0.55 + 0.45 * a.g) + uSunCol * a.g * (0.6 + 0.4 * a.b)) * uPreExp;
    // podsv\xEDcen\xED ohn\u011Bm zespodu (spo\u010D\xEDt\xE1no na CPU, rozptyl \u221D albedo)
    vec3 glow = vG.rgb * (0.35 + 0.65 * (1.0 - a.g)) * uPreExp;
    vec3 c = alb * (lit + glow);
    if (vP.w > 1.5) c += bbColor(900.0 + 250.0 * (1.0 - age)) * uFlameLum * 0.012 * (1.0 - age) * (1.0 - age); // \u017Ehnouc\xED kou\u0159 u paty
    fragColor = vec4(c * al, al);
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
  spawnSmoke({ x, y, z, vx = 0, vy = 0, vz = 0, life, s0, s1, tau, albedo, ox, oz, pq = 0, pz0 = 0, drag = 0.4, buoy = 0, glowing = false, seed, R0 = 0 }) {
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
    const PS = this.aPS.array, P = this.aP.array, C = this.aC.array, G = this.aG.array, V2 = this.aV.array;
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
      V2[j * 3] = d[o + F.vx];
      V2[j * 3 + 1] = d[o + F.vy];
      V2[j * 3 + 2] = d[o + F.vz];
      if (type === PTYPE.FLAME) {
        C[j * 4] = d[o + F.cr];
        C[j * 4 + 1] = d[o + F.cg];
        C[j * 4 + 2] = d[o + F.cb];
        C[j * 4 + 3] = d[o + F.tau0];
        G[j * 4] = 0;
        G[j * 4 + 1] = 0;
        G[j * 4 + 2] = 0;
        G[j * 4 + 3] = d[o + F.T0] * (1 - 0.12 * a01);
        P[j * 4 + 1] = d[o + F.stretch];
      } else if (type === PTYPE.FIREPUFF) {
        C[j * 4] = d[o + F.cr];
        C[j * 4 + 1] = 0;
        C[j * 4 + 2] = 0;
        C[j * 4 + 3] = d[o + F.tau0];
        G[j * 4] = 0;
        G[j * 4 + 1] = 0;
        G[j * 4 + 2] = 0;
        G[j * 4 + 3] = d[o + F.T0] * (1 - 0.3 * a01);
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
        G[j * 4] = gr;
        G[j * 4 + 1] = gg;
        G[j * 4 + 2] = gb;
        G[j * 4 + 3] = 0;
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
out vec2 vUv; out float vT; out float vA;
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
  vUv = q + 0.5; vT = iT;
}`
);
var SP_FS = (
  /* glsl */
  `
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
in vec2 vUv; in float vT; in float vA; out vec4 o;
uniform float uLum;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float f = exp(-dot(p, p) * 2.5);
  // \xD72,5: bodov\xFD zdroj pod pixel oko vn\xEDm\xE1 jasn\u011Bji (osln\u011Bn\xED, Purkyn\u011B/Stiles\u2013Crawford) \u2013 um\u011Bleck\xE9 \u26052, D-021
  vec3 c = bbColor(vT) * f * vA * uLum * 2.5;
  o = vec4(c, 0.0);
}`
);
var SparkSystem = class extends BaseSystem {
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
  spawn({ x, y, z, vx, vy, vz, life, T, tauC = 0.6, size = 2e-3, drag = 1.5, grav = 1, buoy = 0, ox, oz, pq = 0, pz0 = 0, seed, R0 = 0, ember = false, vt = 1 }) {
    const o = this.alloc();
    if (o < 0) return;
    const d = this.d;
    d[o + F.type] = ember ? 1 : 0;
    d[o + F.tau0] = vt;
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
    const d = this.d, n = this.n, PS = this.aPS.array, V2 = this.aV.array, T = this.aT.array;
    const kT = 1 - Math.exp(-dt / 0.4);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE, age = d[o + F.age], a01 = age / d[o + F.life], sd = d[o + F.seed];
      let Tk, sz = d[o + F.s0];
      if (d[o + F.type] === 1) {
        const vx = d[o + F.vx], vy = d[o + F.vy], vz = d[o + F.vz];
        const vrel = d[o + F.tau0] + 0.3 * Math.sqrt(vx * vx + vy * vy + vz * vz);
        const Teq = Math.min(1340, 880 + 150 * Math.sqrt(vrel));
        d[o + F.T0] += (Teq - d[o + F.T0]) * kT;
        const slot = Math.floor(age * 2.5 + sd * 17), hsh = Math.sin(slot * 127.1 + sd * 311.7) * 43758.5453 % 1;
        const ash = Math.abs(hsh) < 0.18 ? 0.82 : 1;
        const burn = a01 > 0.75 ? 1 - (a01 - 0.75) * 4 : 1;
        Tk = (700 + (d[o + F.T0] - 700) * burn) * ash * (1 + 0.04 * Math.sin(age * 31 + sd * 40));
        sz *= 0.55 + 0.45 * burn;
      } else {
        Tk = 600 + (d[o + F.T0] - 600) * Math.exp(-age / d[o + F.dT]);
        Tk *= (1 + 0.25 * Math.sin(age * 23 + sd * 40)) * (1 - Math.max(0, a01 - 0.85) * 2);
      }
      PS[i * 4] = d[o];
      PS[i * 4 + 1] = d[o + 1];
      PS[i * 4 + 2] = d[o + 2];
      PS[i * 4 + 3] = sz;
      V2[i * 4] = d[o + F.vx];
      V2[i * 4 + 1] = d[o + F.vy];
      V2[i * 4 + 2] = d[o + F.vz];
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

// src/fx/volume.js
import * as THREE4 from "three";
var VS2 = (
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
float octv(vec3 q, float amp, float cell){
  float wk = 1.0 - smoothstep(0.35, 1.0, gFpq * cell);
  return amp * (wk > 0.001 ? mix(0.5, n3(q), wk) : 0.5);
}
float fbmD(vec3 q, float s){ // fbm s po\u010Dtem okt\xE1v podle stupn\u011B; s = m\u011B\u0159\xEDtko frekvence v\u016F\u010Di z\xE1kladu
  float c = 16.0 * s;
  float v = octv(q, 0.5, c) + octv(q * 2.03 + 0.17, 0.25, c * 2.03) + octv(q * 4.07 + 0.41, 0.125, c * 4.07), w = 0.875;
  if (uDetail > 0.5) { v += octv(q * 8.13 + 0.73, 0.0625, c * 8.13); w += 0.0625; }
  if (uDetail > 1.5) { v += octv(q * 16.3 + 0.29, 0.03125, c * 16.3); w += 0.03125; }
  return v / w;
}
// ohnut\xE9 pole (domain warp) \u2013 skl\xE1d\xE1 plamen do tenk\xFDch zvln\u011Bn\xFDch pl\xE1t\u016F
vec4 flameNoise(vec3 w, float tt){
  vec3 q = flowQ(w, tt);
  vec3 wv = vec3(n3(q * 0.5 + 0.11), n3(q * 0.5 + 0.43), n3(q * 0.5 + 0.77)) - 0.5;
  vec3 wq = q + wv * uFlame2.w * 1.6;
  float n1 = fbmD(wq, 1.0);
  float n2 = fbmD(wq * 2.2 + vec3(5.2, 1.3, 2.8), 2.2);
  float n4 = n3(wq * 0.7 + vec3(9.1, 2.0, 4.4) - vec3(0.0, uTime * 0.2, 0.0)); // sv\u011Bteln\xE9 skvrny pl\xE1\u0161t\u011B
  return vec4(n1, n2, n4, wv.x);
}
vec4 flameNoiseLoop(vec3 w){
  if (uLoopT <= 0.0) return flameNoise(w, uTime);
  float ph = mod(uTime, uLoopT) / uLoopT;
  vec4 a = flameNoise(w, ph * uLoopT);
  vec4 b = flameNoise(w + vec3(0.37, 0.0, 0.11) * uTurb.y * 6.0, (ph - 1.0) * uLoopT);
  return mix(a, b, smoothstep(0.0, 1.0, ph));
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
  float n1 = N.x, n2 = N.y, n4 = N.z;
  // vln\u011Bn\xED osy (jazyk) \u2013 velk\xE9 m\u011B\u0159\xEDtko z ohybov\xE9ho pole
  float wob = (n2 - 0.5) * uTurb.w * y + N.w * uTurb.w * y * 0.6;
  float ax = axBase + wob;
  float az = (n1 - 0.5) * uTurb.w * y * 0.6;
  vec2 d2 = vec2((p.x - ax) / uShape.x, (p.z - az) / uRz);
  float r = length(d2);
  // pulzace: toroidn\xED v\xEDry stoupaj\xEDc\xED rychlost\xED ~ U (Cetegen & Ahmed)
  float puff = sin(6.2832 * (uPuff.x * uTime - tof(w.y) / max(uFlowL, 0.01) * 0.8)) * uPuff.y;
  float dd = prof * (1.0 + 0.25 * puff * y) - r + (n1 - 0.5) * uTurb.x * (0.35 + 1.4 * y) + (n2 - 0.5) * uTurb.x * 0.45;
  // p\u0159eru\u0161ovan\xE1 z\xF3na (McCaffrey \u03B7 0,08\u20130,2): odtrh\xE1v\xE1n\xED plam\xE9nk\u016F
  dd -= smoothstep(0.38, 0.95, y) * smoothstep(0.46, 0.66, n2) * 0.34;
  // velk\xE9 po\u017E\xE1ry: p\u0159eru\u0161ovan\xE1 z\xF3na za\u010D\xEDn\xE1 n\xED\u017E (\u03B7 \u2248 0,4 L) a trh\xE1 sloup na samostatn\xE9 jazyky s tmav\xFDmi mezerami
  dd -= (uShapeK - 1.0) * smoothstep(0.28, 0.85, y) * smoothstep(0.44, 0.6, n1 + 0.3 * (n2 - 0.5)) * 0.45;
  // nedostatek kysl\xEDku: odtr\u017Een\xE9 l\xEDn\xE9 jazyky
  dd -= uLift * smoothstep(0.55, 0.8, n2) * 0.4 * y;
  float edge = uFlame2.z;
  float dens = smoothstep(0.0, edge, dd);
  float core = smoothstep(0.1, 0.5, dd);
  // zat\xED\u017Een\xED sazemi kol\xEDs\xE1 (pruhy hust\xFDch a \u0159\xEDdk\xFDch saz\xED) \u2192 pr\u016Fhledn\xE9 mezery mezi jazyky
  float big = clamp(uShapeK - 1.0, 0.0, 1.0);
  dens *= mix(0.35 + 0.9 * smoothstep(0.3, 0.7, n1 + 0.15 * (n2 - 0.5)), smoothstep(0.4, 0.62, n1 + 0.2 * (n2 - 0.5)), big * 0.7);
  // teplota: reak\u010Dn\xED z\xF3na na pl\xE1\u0161ti; hork\xE9 prou\u017Eky; u paty velk\xFDch po\u017E\xE1r\u016F chladn\xE9 tmav\xE9 j\xE1dro par paliva
  float zone = smoothstep(0.0, 0.16, dd) * (1.0 - 0.5 * core * exp(-y * 4.0) * (0.4 + uFlame2.y));
  float hotStreak = smoothstep(0.38, 0.78, n2);
  float T = uTamb + (uTpeak - uTamb) * pow(zone, 0.8) * mix(0.62 - 0.17 * big, 1.04, hotStreak) * (1.0 - 0.42 * pow(y, 1.5));
  // velk\xE9 sazov\xE9 po\u017E\xE1ry (Steinhaus, Takahashi): vn\u011Bj\u0161\xED vrstva saz\xED, sv\u011Btlo pror\xE1\u017Eej\xED jen \u201Eluminous zones\u201C
  float shell = uFlame2.y * (1.0 - core) * smoothstep(0.15, 0.55, y + 0.25 * n1);
  float lumPatch = smoothstep(0.52, 0.64, n4);
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
out vec4 fragColor;
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
  vec3 col = vec3(0.0); float trans = 1.0;
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
      col += trans * (1.0 - a) * (ke / k) * sootColor(f.y) * uIntensity;
      // modr\xE1 z\xF3na (CH*, C2*): jen u paty a jen tam, kde nesv\xEDt\xED saze (jinak modr\xE1 + oran\u017Eov\xE1 = r\u016F\u017Eov\xE1)
      float edgeB = smoothstep(0.0, 0.25, f.x) * (1.0 - smoothstep(0.3, 0.9, f.x)) * (1.0 - smoothstep(0.08, 0.3, ke * dt));
      col += trans * vec3(0.04, 0.12, 1.0) * uBlue * exp(-p.y * 30.0) * edgeB * uIntensity * uPreExp * 0.22 * (dt / max(uFlowL * 0.25, 1e-3));
      trans *= a;
    }
#endif
    t += dt;
  }
  fragColor = vec4(col, 1.0 - trans);
}`
);
var _vp = new THREE4.Vector4();
function createVolumeMaterial({ ball = false, depth = null, steps = 48 } = {}) {
  const defines = {};
  if (ball) defines.MODE_BALL = 1;
  if (depth) defines.USE_DEPTH = 1;
  const u = {
    ...sharedUniforms(),
    uInvModel: { value: new THREE4.Matrix4() },
    uScale: { value: new THREE4.Vector3(1, 1, 1) },
    uTime: { value: 0 },
    uSeed: { value: 0 },
    uSteps: { value: steps },
    uTpeak: { value: 1300 },
    uTamb: { value: 600 },
    uIntensity: { value: 1 },
    uShape: { value: new THREE4.Vector4(0.45, 0.8, 0.3, 0.2) },
    uAxis0: { value: 0 },
    uShear: { value: 0 },
    uRz: { value: 0.45 },
    uTurb: { value: new THREE4.Vector4(0.45, 0.4, 2, 0.15) },
    uPuff: { value: new THREE4.Vector2(1.5, 0.5) },
    uSoot: { value: 0 },
    uBlue: { value: 0 },
    uSigma: { value: 0.3 },
    uLift: { value: 0 },
    uAge: { value: 0 },
    uLoopT: { value: 0 },
    uRes: { value: new THREE4.Vector2(1, 1) },
    uCamPos: { value: new THREE4.Vector3() },
    uPixAng: { value: 15e-4 },
    uShapeK: { value: 1 },
    tDepth: { value: depth },
    uDepthRes: { value: new THREE4.Vector2(1, 1) },
    uFlame2: { value: new THREE4.Vector4(1.35, 0, 0.12, 0.6) },
    uFlowL: { value: 1 },
    uDetail: { value: 1 },
    uStepLen: { value: 0.05 },
    uFrame: { value: 0 },
    uSigmaSoot: { value: 2.5 }
  };
  return new THREE4.ShaderMaterial({
    vertexShader: VS2,
    fragmentShader: VOLUME_FS,
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
}
var BOX = new THREE4.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
var FlameVolume = class {
  constructor({ ball = false, depth = null, steps = 48 } = {}) {
    this.mat = createVolumeMaterial({ ball, depth, steps });
    this.mesh = new THREE4.Mesh(BOX, this.mat);
    this.mesh.layers.set(LAYER_FX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.ball = ball;
    this.mesh.onBeforeRender = (r, s, cam) => {
      const u = this.mat.uniforms;
      this.mesh.updateMatrixWorld();
      u.uInvModel.value.copy(this.mesh.matrixWorld).invert();
      u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
      if (cam.isPerspectiveCamera) {
        const vp = r.getCurrentViewport(_vp);
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
import * as THREE5 from "three";
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
    for (const l of this.pool) this.scene.remove(l);
    this.pool = [];
    for (let i = 0; i < tier.lights; i++) {
      const L = new THREE5.PointLight(16755302, 0, 0, 2);
      if (tier.shadows && i < 1) {
        L.castShadow = true;
        L.shadow.mapSize.set(1024, 1024);
        L.shadow.bias = -2e-3;
        L.shadow.normalBias = 0.02;
        L.shadow.radius = 6;
        L.shadow.camera.near = 0.05;
        L.shadow.camera.far = 200;
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
      this.active.push({ on: true, x: q.x, y: q.y, z: q.z, I: q.I, r: q.r, c: c2, k: q.k || 0 });
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
import * as THREE6 from "three";
var FS = (
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
var FS_FULL = FS.replace(VOLUME_FIELDS, VOLUME_FIELDS + `
vec3 fieldFlameAt(vec3 p, float t){ return fieldFlame(p); }
`);
function bakeAtlas(renderer, { res = 128, seed = 3, steps = 48 } = {}) {
  const W = res * 16, H = res * 8;
  const rt = new THREE6.WebGLRenderTarget(W, H, { type: THREE6.UnsignedByteType, depthBuffer: false, generateMipmaps: true, minFilter: THREE6.LinearMipmapLinearFilter, magFilter: THREE6.LinearFilter });
  const src = FS_FULL.replace("uniform float uTime, uSeed, uSteps;", "uniform float uSeed, uSteps; float uTime;").replace("vec3 fieldFlameAt(vec3 p, float t){ return fieldFlame(p); }", "vec3 fieldFlameAt(vec3 p, float t){ uTime = t; return fieldFlame(p); }");
  const u = {
    ...sharedUniforms(),
    uCell: { value: new THREE6.Vector2(res, res) },
    uBakeSteps: { value: steps },
    uScale: { value: new THREE6.Vector3(0.5, 1.4, 0.5) },
    uSeed: { value: seed },
    uSteps: { value: steps },
    uTpeak: { value: 1400 },
    uTamb: { value: 500 },
    uIntensity: { value: 1 },
    uShape: { value: new THREE6.Vector4(0.36, 1.3, 0, 0.95) },
    uAxis0: { value: 0 },
    uShear: { value: 0 },
    uRz: { value: 0.33 },
    uTurb: { value: new THREE6.Vector4(0.75, 0.4, 1.6, 2) },
    uPuff: { value: new THREE6.Vector2(1 / 2, 0.35) },
    uSoot: { value: 0.35 },
    uBlue: { value: 0 },
    uSigma: { value: 0.2 },
    uLift: { value: 0 },
    uAge: { value: 0 },
    uLoopT: { value: 2 },
    uRes: { value: new THREE6.Vector2(W, H) },
    uFlame2: { value: new THREE6.Vector4(1.5, 0, 0.12, 0.75) },
    uFlowL: { value: 1.3 },
    uDetail: { value: 2 },
    uShapeK: { value: 1 },
    uPixAng: { value: 5e-4 }
  };
  const m = new THREE6.ShaderMaterial({ vertexShader: "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: src, uniforms: u, glslVersion: THREE6.GLSL3, depthTest: false, depthWrite: false });
  const g2 = new THREE6.BufferGeometry();
  g2.setAttribute("position", new THREE6.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh2 = new THREE6.Mesh(g2, m);
  mesh2.frustumCulled = false;
  const sc = new THREE6.Scene();
  sc.add(mesh2);
  const cam = new THREE6.OrthographicCamera();
  const t0 = performance.now();
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sc, cam);
  renderer.setRenderTarget(prev);
  const ms = performance.now() - t0;
  m.dispose();
  g2.dispose();
  rt.texture.userData = { res, frames: 64, layout: "16x8: 0-7 flame, 8-15 smoke", bakeMs: ms };
  rt.texture.colorSpace = THREE6.NoColorSpace;
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
import * as THREE7 from "three";
function chunkGeo(seed) {
  const g2 = new THREE7.IcosahedronGeometry(0.5, 0);
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
    this.mat = new THREE7.MeshStandardMaterial({ color: 3814962, roughness: 0.8, metalness: 0.3 });
    this.mat.onBeforeCompile = (s) => {
      s.uniforms.uPreExp = PRE;
      s.uniforms.uFlameK = FLAMEK;
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uPreExp, uFlameK;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor * uFlameK * 0.4 * uPreExp;\n diffuseColor.rgb = vec3(0.12, 0.11, 0.1);\n#endif");
    };
    this.mesh = new THREE7.InstancedMesh(chunkGeo(3), this.mat, Math.max(cap, 1));
    this.mesh.instanceMatrix.setUsage(THREE7.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE7.Color(0, 0, 0));
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.s = new Float32Array(Math.max(cap, 1) * 16);
    this._m = new THREE7.Matrix4();
    this._q = new THREE7.Quaternion();
    this._e = new THREE7.Euler();
    this._v = new THREE7.Vector3();
    this._c = new THREE7.Color();
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
      m.compose(this._v.set(s[b], s[b + 1], s[b + 2]), this._q, new THREE7.Vector3(sz, sz, sz));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
};

// src/fx/decal.js
import * as THREE8 from "three";
var FS2 = (
  /* glsl */
  `
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
varying vec2 vUv; varying vec3 vW;
uniform float uGrow, uGlow, uCrater, uSeed;
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
  gl_FragColor = vec4(col + em, a * 0.92);
}`
);
var Scorch = class {
  constructor(scene, { pos, radius = 2, seed = 1, grow = 0, glow = 0, crater = 0, rate = 0 }) {
    this.scene = scene;
    this.rate = rate;
    this.mat = new THREE8.ShaderMaterial({
      vertexShader: "varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: FS2,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: { ...sharedUniforms(), uGrow: { value: grow || (rate ? 0 : 1) }, uGlow: { value: glow }, uCrater: { value: crater }, uSeed: { value: seed * 0.13 } }
    });
    this.mesh = new THREE8.Mesh(new THREE8.PlaneGeometry(radius * 2, radius * 2), this.mat);
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
  const V2 = volumeL / 1e3, A = V2 / (depthMM / 1e3);
  const D = Math.sqrt(4 * A / Math.PI);
  const p = poolFire(f, D);
  const thin = 0.5;
  const mdot = p.mdot * thin, Q = mdot * f.dHc;
  const mass = V2 * f.rho;
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
  const soot = Math.min(1, f.ys * vent.sootMul * 9);
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
function shockRadiusAt(table2, t) {
  if (t <= 0) return 0;
  for (let i = 1; i < table2.length; i++) {
    if (table2[i].t >= t) {
      const a = table2[i - 1], b = table2[i], k = (t - a.t) / (b.t - a.t);
      return { R: a.R + (b.R - a.R) * k, Ps: a.Ps + (b.Ps - a.Ps) * k };
    }
  }
  const l = table2[table2.length - 1];
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
    this.scene.add(this.bb.mesh, this.sp.mesh);
    this.hz = tier.particles.haze ? new HazeSystem(tier.particles.haze) : null;
    if (this.hz) this.scene.add(this.hz.mesh);
    this.vols = [];
    this.balls = [];
    for (let i = 0; i < tier.volumes; i++) {
      const v = new FlameVolume({ depth, steps: tier.volumeSteps });
      v.mesh.visible = false;
      this.scene.add(v.mesh);
      this.vols.push(v);
    }
    for (let i = 0; i < Math.min(3, tier.volumes); i++) {
      const v = new FlameVolume({ ball: true, depth, steps: Math.round(tier.volumeSteps * 0.75) });
      v.mesh.visible = false;
      this.scene.add(v.mesh);
      this.balls.push(v);
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
    this.sources = [];
    this.explosions = [];
    this.bb.clear();
    this.sp.clear();
    this.hz?.clear();
    this.debris.clear();
    for (const d of this.decals) d.dispose();
    this.decals = [];
    this.vols.forEach((v) => v.mesh.visible = false);
    this.balls.forEach((v) => v.mesh.visible = false);
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
    for (const s of this.sources) s.update(dt, this.time);
    this.sources = this.sources.filter((s) => !s.dead);
    let bi = 0;
    this.balls.forEach((v) => v.mesh.visible = false);
    for (const e of this.explosions) e.update(dt, this.time, e.wantsBall() && bi < this.balls.length ? this.balls[bi++] : null, camera);
    this.explosions = this.explosions.filter((e) => !e.dead);
    for (const d of this.decals) d.update(dt);
    const lights = this.lights.end(camera);
    this.bb.mesh.visible = this.layers.flame || this.layers.smoke;
    const dtex = this.pipeline.depthTexture;
    if (this.bb.mat.uniforms.tDepth.value !== dtex && dtex) this.bb.mat.uniforms.tDepth.value = dtex;
    for (const v of [...this.vols, ...this.balls]) if (dtex) v.u.tDepth.value = dtex;
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
    this.pos = o.pos.clone ? o.pos.clone() : new THREE9.Vector3(...o.pos);
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
    const Q = Math.max(0, this.Qat(t)) * vent.chi;
    const Lb = this.o.L ? this.o.L(Q) : flameHeight(Q, D);
    const L = Lb * (1 + 0.35 * vent.lift);
    const U = this.w.air.windAt(Math.max(L * 0.5, 0.05) + this.pos.y);
    const tilt = flameTilt(U, Math.max(Q, 1), D);
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
    const flick = 0.8 + 0.2 * this.fl(gt * ph.fp * 0.6) + 0.12 * this.fl(gt * 0.4 + 9);
    const kE = 2.7 * (f.fv ?? 0.6) * (0.7 + 0.6 * Math.min(1, ph.vent.sootMul - 0.5));
    const tauD = kE * D * 0.5;
    this.gainVol = Math.pow(1 + 0.6 * Math.max(0, tauD - 1), -0.6);
    const Tvis = (f.Tlum ?? ph.T + 80) - ph.vent.tempDrop - 60;
    const kSpr = this.gainVol * w.flameLum / Math.max(w.lumRef, 1e-6);
    const useVol = this.vol && w.layers.volume;
    if (useVol) {
      const v = this.vol;
      v.mesh.visible = w.layers.flame;
      const Rz = this.o.footprint.type === "rect" ? Math.max(this.o.footprint.d * this.fpScale, 0.1) / 2 : null;
      const Rx = this.o.footprint.type === "rect" ? Math.max(this.o.footprint.w * this.fpScale, 0.1) / 2 : D / 2;
      v.place(this.pos, ph.L * (0.95 + 0.1 * flick), Math.max(Rx, 4e-3), ph.tilt.theta, w.air.dir, ph.tilt.drag, Rz);
      const u = v.u, tier = w.tier;
      u.uTpeak.value = (f.Tlum ?? ph.T + 80) - ph.vent.tempDrop;
      u.uTamb.value = 700;
      u.uIntensity.value = w.flameLum * flick * this.gainVol;
      u.uFlame2.value.set(
        kE,
        Math.min(1, Math.max(0, (D - 1.5) / 4)) * Math.min(1, f.ys * ph.vent.sootMul * 20),
        tier.flameEdge ?? 0.14,
        0.65 + 0.2 * w.air.turb
      );
      this._volR = Math.max(Rx, 4e-3);
      u.uSigma.value = 0.6 / Math.max(D, 0.02);
      u.uSigmaSoot.value = 3 / Math.max(Math.sqrt(D), 0.1);
      u.uSeed.value = (this.o.seed ?? 1) * 0.37;
      const eddy = Math.max(D, ph.L * 0.3) * 0.42;
      const U = 1.75 * Math.pow(ph.Q / 1e3, 0.2);
      const bigK = Math.min(1, Math.max(0, (3 - ph.L / Math.max(D, 0.01)) * 0.5));
      u.uTurb.value.set(this.o.turbAmp ?? 0.55 + 0.25 * ph.vent.lift + 0.3 * bigK, eddy, Math.max(U, 0.05), 0.25 + 0.1 * w.air.turb + 0.25 * ph.vent.lift);
      u.uFlowL.value = Math.max(ph.L, 0.01);
      u.uShapeK.value = this.o.shapeK ?? Math.min(2.2, Math.max(1, 1 + (3 - ph.L / Math.max(D, 0.01)) * 0.5));
      u.uDetail.value = tier.volumeDetail ?? 1;
      const sc = v.mesh.scale, boxMax = Math.max(sc.x, sc.y, sc.z);
      u.uStepLen.value = Math.max(Math.min(eddy * 0.1, 0.6 / Math.max(kE, 0.1)), boxMax / tier.volumeSteps * 0.85);
      u.uFlame2.value.z = Math.max(tier.flameEdge ?? 0.14, 1.3 * u.uStepLen.value / this._volR * 0.5);
      u.uFrame.value = (u.uFrame.value + 1) % 1024;
      u.uPuff.value.set(ph.fp, this.o.puffAmp ?? 0.5);
      u.uShape.value.y = this.o.taper ?? 0.85;
      u.uShape.value.z = this.o.baseWide ?? 0.25;
      u.uShape.value.w = this.o.neck ?? 0.2;
      u.uSoot.value = Math.min(1, f.ys * ph.vent.sootMul * 18);
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
    const smokeLife = (this.o.smokeLife ?? 1) * Math.min(28, Math.max(2.5, 4 + Math.sqrt(ph.Q / 1e5) * 3));
    const sMul = w.tier.smokeMul ?? 1;
    const nS = Math.min(700 * sMul, (8 + 22 * Math.sqrt(ph.Q / 1e5)) * sMul) * m.smoke;
    this.demand.smoke = ph.tau > 3e-3 ? nS : 0;
    if (w.layers.smoke && ph.tau > 3e-3) {
      this.acc.smoke += nS * w.budgetScale.smoke * dt / smokeLife;
      const zs = this.pos.y + L * (0.75 + 0.3 * r());
      const b = Math.max(ph.b, D * 0.35, 0.02);
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
          albedo: ph.smoke.rgb,
          ox: this.pos.x,
          oz: this.pos.z,
          pq: ph.Qc,
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
          const [px, py, pz] = this.footprintPoint(), cnt = Math.round((6 + 18 * r()) * Math.min(1.5, eMul) * w.budgetScale.spark);
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
var Explosion = class {
  constructor(world, o) {
    this.w = world;
    this.o = o;
    this.t = 0;
    this.pos = o.pos.clone ? o.pos.clone() : new THREE9.Vector3(...o.pos);
    this.rnd = mulberry32(o.seed ?? 5);
    this.table = o.W > 0 ? shockTable(o.W, Math.max(60, Math.cbrt(o.W) * 60)) : null;
    this.started = false;
    this.dustAcc = 0;
    this.smokeAcc = 0;
    this.dead = false;
    this.fbAcc = 0;
    this.camHit = false;
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
          w.bb.spawnSmoke({ x: this.pos.x + Math.cos(a) * s * rr, y: yc + u * rr * 0.7, z: this.pos.z + Math.sin(a) * s * rr, vx: Math.cos(a) * s * 0.5, vy: o.smoke.buoy ?? 4, vz: Math.sin(a) * s * 0.5, life: o.smoke.life * (0.6 + 0.6 * r()), s0: R * 0.5, s1: R * (1.4 + r()), tau: o.smoke.tau ?? 2, albedo: o.smoke.albedo, drag: 1.2, buoy: o.smoke.buoyAcc ?? 1.5, seed: r() });
        }
      }
    }
    if (this.table) {
      const s = shockRadiusAt(this.table, t);
      this.shockR = s.R;
      this.shockPs = s.Ps;
      if (s.Ps > 2500 && w.hz && w.layers.haze && t < 3) w.hz.spawn({ x: this.pos.x, y: this.pos.y + s.R * 0.3, z: this.pos.z, vy: 0, life: 0.06, size: s.R * 2.2, ring: 1 });
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

// src/fx/char.js
import * as THREE10 from "three";
function applyChar(mat, { instanced = false, scale = 2, bias = "y", alligator = null, coal = false } = {}) {
  const sh = sharedUniforms();
  mat.userData.char = { uChar: { value: 0 }, uGlow: { value: 0 }, uCharScale: { value: scale }, uCharBase: { value: 0 }, uCharH: { value: 1 } };
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
${GLSL_COMMON}
${alligator ? `#define ALLIG vec2(${alligator[0].toFixed(2)}, ${alligator[1].toFixed(2)})` : ""}
${coal ? "#define COAL 1" : ""}`).replace("#include <map_fragment>", `#include <map_fragment>
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
  vec3 charCol = mix(vec3(0.025, 0.022, 0.02), vec3(0.11, 0.1, 0.095), smoothstep(0.75, 1.0, chv) * cn); // popel \u0161edne
  diffuseColor.rgb = mix(diffuseColor.rgb, charCol, charM);
  float charRough = charM;`).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
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
  }`);
  };
  mat.customProgramCacheKey = () => "char" + (instanced ? "I" : "") + (alligator ? "A" + alligator.join("x") : "") + (coal ? "C" : "");
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
    smokeVolumes: 2,
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
    smokeVolumes: 4,
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
import * as THREE12 from "three";

// src/assets/textures.js
import * as THREE11 from "three";
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
  const t = new THREE11.CanvasTexture(c2);
  if (srgb) t.colorSpace = THREE11.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE11.RepeatWrapping;
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
  return new THREE11.MeshStandardMaterial({
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
    this.skyMat = new THREE12.ShaderMaterial({
      vertexShader: "varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }",
      fragmentShader: SKY_FS,
      side: THREE12.BackSide,
      depthWrite: false,
      uniforms: { c0: { value: new THREE12.Color() }, c1: { value: new THREE12.Color() }, sunDir: { value: new THREE12.Vector3(0.55, 0.6, 0.7) }, stars: { value: 0 } }
    });
    this.sky = new THREE12.Mesh(new THREE12.SphereGeometry(1, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.onBeforeRender = (r, s, cam) => {
      this.sky.position.copy(cam.position);
      this.sky.scale.setScalar(cam.far * 0.9);
      this.sky.updateMatrixWorld();
    };
    scene.add(this.sky);
    this.hemi = new THREE12.HemisphereLight(10135752, 5917242, 0.1);
    scene.add(this.hemi);
    this.sun = new THREE12.DirectionalLight(16773341, 0.1);
    this.sun.position.set(55, 60, 70);
    scene.add(this.sun);
    this.moon = new THREE12.DirectionalLight(9414360, 0);
    this.moon.position.set(40, 60, 30);
    scene.add(this.moon);
    this.fog = new THREE12.FogExp2(0, 4e-3);
    scene.fog = this.fog;
    this.groundMat = new THREE12.MeshStandardMaterial({ map: groundTexture("dirt"), roughness: 0.95, metalness: 0 });
    this.ground = new THREE12.Mesh(new THREE12.PlaneGeometry(1, 1, 1, 1), this.groundMat);
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
import * as THREE14 from "three";

// src/assets/geo.js
import * as THREE13 from "three";
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
  return new THREE13.LatheGeometry(profile.map(([r, y]) => new THREE13.Vector2(r, y)), seg, 0, phi);
}
function tube(a, b, r0, r1, radial = 8, hseg = 1, open = false) {
  const len = a.distanceTo(b);
  const g2 = new THREE13.CylinderGeometry(r1, r0, len, radial, hseg, open);
  g2.translate(0, len / 2, 0);
  const q = new THREE13.Quaternion().setFromUnitVectors(new THREE13.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g2.applyQuaternion(q);
  g2.translate(a.x, a.y, a.z);
  return g2;
}
function mesh(geo, mat, { cast = true, recv = true, name = "" } = {}) {
  const m = new THREE13.Mesh(geo, mat);
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
  const grp = new THREE13.Group();
  grp.name = name;
  for (const [m, gs] of byMat) {
    gs.forEach((g2) => {
      for (const k of Object.keys(g2.attributes)) if (!["position", "normal", "uv"].includes(k)) g2.deleteAttribute(k);
      if (!g2.attributes.uv) g2.setAttribute("uv", new THREE13.Float32BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2));
    });
    const merged = mergeGeometries(gs, false);
    grp.add(mesh(merged, m, { name: name + ":" + (m.name || "mat") }));
  }
  return grp;
}
function blob(radius, detail, seed, rough = 0.25, stretch = [1, 1, 1]) {
  const g2 = new THREE13.IcosahedronGeometry(radius, detail);
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
  wax.emissive = new THREE14.Color(1, 0.5, 0.18);
  wax.emissiveIntensity = 0;
  {
    const c2 = document.createElement("canvas");
    c2.width = 4;
    c2.height = 64;
    const g3 = c2.getContext("2d");
    const gr = g3.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, "#1a1a1a");
    gr.addColorStop(0.7, "#333");
    gr.addColorStop(0.92, "#888");
    gr.addColorStop(1, "#fff");
    g3.fillStyle = gr;
    g3.fillRect(0, 0, 4, 64);
    wax.emissiveMap = new THREE14.CanvasTexture(c2);
    wax.emissiveMap.colorSpace = THREE14.SRGBColorSpace;
  }
  const wick = tube(new THREE14.Vector3(0, H - 5e-3, 0), new THREE14.Vector3(12e-4, H + 9e-3, 4e-4), 6e-4, 4e-4, segs(lod, 4, 6, 8, 16, 32), segs(lod, 1, 2, 4, 8, 16));
  const wickM = new THREE14.MeshStandardMaterial({ color: 460293, roughness: 0.9, name: "wick" });
  const plate = lathe(resample([[0, 0], [0.04, 0], [0.042, 4e-3], [0.04, 6e-3], [R * 1.25, 6e-3], [R * 1.25, 0.018], [R * 1.1, 0.018], [R * 1.1, 8e-3], [0, 8e-3]], segs(lod, 6, 12, 30, 90, 280)), rad);
  const brass = new THREE14.MeshStandardMaterial({ color: 11570519, metalness: 0.9, roughness: 0.35, name: "brass" });
  const grp = new THREE14.Group();
  const cm = mesh(g2, wax, { name: "wax" });
  cm.position.y = 8e-3;
  grp.add(cm);
  const wm = mesh(wick, wickM, { name: "wick" });
  wm.position.y = 8e-3;
  grp.add(wm);
  grp.add(mesh(plate, brass, { name: "holder" }));
  grp.userData = { flameAt: new THREE14.Vector3(12e-4, H + 8e-3 + 9e-3, 4e-4), wax };
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
  const grp = new THREE14.Group();
  const t = mesh(g2, m, { name: "torch" });
  t.rotation.z = 0.12;
  grp.add(t);
  const iron = new THREE14.MeshStandardMaterial({ color: 2236704, metalness: 0.8, roughness: 0.6, name: "iron" });
  const spike = tube(new THREE14.Vector3(0, -0.25, 0), new THREE14.Vector3(-0.03, 0.42, 0), 6e-3, 6e-3, segs(lod, 4, 6, 10, 24, 64), 1);
  grp.add(mesh(spike, iron, { name: "spike" }));
  const ring = new THREE14.TorusGeometry(0.019, 4e-3, segs(lod, 3, 6, 10, 24, 60), segs(lod, 8, 16, 32, 96, 300));
  ring.rotateX(Math.PI / 2);
  ring.translate(-0.035, 0.42, 0);
  grp.add(mesh(ring, iron, { name: "ring" }));
  const tip = new THREE14.Vector3(0, 0.72, 0).applyEuler(new THREE14.Euler(0, 0, 0.12));
  grp.userData = { flameAt: tip, char: u };
  return grp;
}
function campfire({ lod = 2, size = "medium", seed = 11 }) {
  const r = mulberry32(seed);
  const S = { small: 0.45, medium: 1, large: 1.6 }[size] || 1;
  const nStones = { small: 7, medium: 12, large: 16 }[size];
  const nLogs = { small: 4, medium: 6, large: 9 }[size];
  const grp = new THREE14.Group();
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
    const base = new THREE14.Vector3(Math.cos(a) * 0.38 * S, 0.02, Math.sin(a) * 0.38 * S);
    const top = new THREE14.Vector3(Math.cos(a + 0.4) * 0.05 * S, 0.62 * S * (0.85 + r() * 0.3), Math.sin(a + 0.4) * 0.05 * S);
    const rr = 0.045 * S * (0.8 + r() * 0.5);
    const g2 = tube(base, top, rr, rr * 0.8, segs(lod, 5, 8, 16, 48, 160), segs(lod, 1, 4, 16, 64, 220));
    displace(g2, (x, y, z) => 4e-3 * S * n.fbm(x * 30, y * 30, z * 30, 3));
    logs.push(g2);
  }
  if (size !== "small") for (let i = 0; i < 3; i++) {
    const a = r() * 6.28, b = new THREE14.Vector3(Math.cos(a) * 0.5 * S, 0.05 * S, Math.sin(a) * 0.5 * S), c2 = new THREE14.Vector3(-Math.cos(a) * 0.1 * S, 0.12 * S, -Math.sin(a) * 0.1 * S);
    const g2 = tube(b, c2, 0.05 * S, 0.05 * S, segs(lod, 5, 8, 16, 48, 160), segs(lod, 1, 4, 12, 48, 180));
    displace(g2, (x, y, z) => 4e-3 * S * n.fbm(x * 30, y * 30, z * 30, 3));
    logs.push(g2);
  }
  grp.add(mergeByMaterial(logs.map((g2) => [g2, bark]), "logs"));
  const ash = new THREE14.CircleGeometry(0.5 * S, segs(lod, 8, 24, 64, 200, 500), 0, Math.PI * 2);
  ash.rotateX(-Math.PI / 2);
  if (lod >= 2) {
  }
  const ashM = new THREE14.MeshStandardMaterial({ color: 3815478, roughness: 1, name: "ash" });
  const au = applyChar(ashM, { scale: 25 });
  au.uChar.value = 0.9;
  au.uGlow.value = 0.6;
  const am = mesh(ash, ashM, { name: "ash" });
  am.position.y = 6e-3;
  grp.add(am);
  const coals = coalBed({ lod, R: 0.42 * S, S, seed: seed + 17 });
  if (coals) grp.add(coals);
  grp.userData = { char: u, ashChar: au, coals, flameAt: new THREE14.Vector3(0, 0.05, 0), D: 0.75 * S };
  return grp;
}
function coalBed({ lod = 2, R = 0.42, S = 1, seed = 5, n = null }) {
  const N = n ?? [0, 10, 28, 44, 110][Math.min(lod, 4)];
  if (!N) return null;
  const r = mulberry32(seed);
  const g2 = blob(0.5, [0, 0, 1, 2, 3][Math.min(lod, 4)], seed, 0.45, [1.3, 0.55, 1]);
  const aChar = new THREE14.InstancedBufferAttribute(new Float32Array(N * 2), 2);
  g2.setAttribute("aChar", aChar);
  const m = new THREE14.MeshStandardMaterial({ color: 1315344, roughness: 0.95, name: "coal" });
  applyChar(m, { instanced: true, scale: 30, coal: true });
  const im = new THREE14.InstancedMesh(g2, m, N);
  im.name = "coals";
  im.castShadow = false;
  im.receiveShadow = true;
  const M = new THREE14.Matrix4(), q = new THREE14.Quaternion(), e = new THREE14.Euler(), p = new THREE14.Vector3(), sc = new THREE14.Vector3();
  for (let i = 0; i < N; i++) {
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
  const grp = new THREE14.Group();
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
  const r = mulberry32(seed), grp = new THREE14.Group();
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
  const { m, u } = charMat(paint, { scale: 4 });
  u.uCharBase.value = 0;
  u.uCharH.value = H;
  const grp = new THREE14.Group();
  grp.add(mesh(g2, m, { name: "drum" }));
  for (const [x, rr] of [[0.18, 0.03], [-0.17, 0.018]]) {
    const b = new THREE14.CylinderGeometry(rr, rr, 0.012, segs(lod, 6, 10, 20, 48, 120));
    b.translate(x, H - 0, 0);
    grp.add(mesh(b, m, { name: "bung" }));
  }
  grp.userData = { char: u, H, R };
  return grp;
}
function grenade({ lod = 2 }) {
  const grp = new THREE14.Group();
  const body = new THREE14.SphereGeometry(0.032, segs(lod, 8, 16, 48, 200, 640), segs(lod, 6, 12, 36, 150, 480));
  const olive = makeMaterial("metalOlive");
  olive.name = "body";
  grp.add(mesh(body, olive, { name: "body" }));
  const steel = makeMaterial("steel");
  steel.name = "fuze";
  const fz = lathe(resample([[0, 0.028], [0.012, 0.028], [0.012, 0.05], [8e-3, 0.055], [0, 0.055]], segs(lod, 4, 8, 16, 48, 160)), segs(lod, 6, 12, 32, 120, 400));
  grp.add(mesh(fz, steel, { name: "fuze" }));
  const lever = new THREE14.BoxGeometry(8e-3, 0.07, 2e-3, 1, segs(lod, 1, 4, 12, 40, 120), 1);
  const lp = lever.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const y = lp.getY(i);
    lp.setZ(i, lp.getZ(i) + 0.034 * Math.sin((y + 0.035) / 0.07 * 1.4));
  }
  lever.computeVertexNormals();
  lever.translate(0, 0.015, 0);
  grp.add(mesh(lever, steel, { name: "lever" }));
  const ring = new THREE14.TorusGeometry(0.012, 12e-4, segs(lod, 3, 6, 10, 24, 48), segs(lod, 8, 16, 32, 96, 300));
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
  const t = new THREE14.CanvasTexture(c2);
  t.colorSpace = THREE14.SRGBColorSpace;
  t.wrapS = THREE14.RepeatWrapping;
  return t;
}
function tntDrum({ lod = 2 }) {
  const R = 0.47, H = 1;
  const p = [[0, 0.01], [R - 0.02, 0.01], [R, 0], [R + 0.012, 0.015], [R, 0.03]];
  for (const hy of [0.33, 0.66]) p.push([R, hy - 0.03], [R + 0.015, hy - 0.012], [R + 0.015, hy + 0.012], [R, hy + 0.03]);
  p.push([R, H - 0.03], [R + 0.012, H - 0.015], [R, H], [R - 0.02, H - 0.01], [0, H - 0.01]);
  const g2 = lathe(resample(p, segs(lod, 8, 24, 80, 220, 400)), segs(lod, 10, 28, 96, 420, 1200));
  const mat = new THREE14.MeshStandardMaterial({ map: labelTexture(["TNT", "1000 kg", "V\xDDBU\u0160NINA 1.1D", "UN 0209"]), roughness: 0.55, metalness: 0.4, name: "tnt" });
  const grp = new THREE14.Group();
  grp.add(mesh(g2, mat, { name: "drum" }));
  const wood = makeMaterial("woodPlank");
  wood.name = "pallet";
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE14.BoxGeometry(1.2, 0.022, 0.14);
    b.translate(0, 0.133, -0.5 + i * 0.25);
    parts.push([b, wood]);
  }
  for (let i = 0; i < 3; i++) {
    const b = new THREE14.BoxGeometry(0.1, 0.1, 1.2);
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
  const grp = new THREE14.Group();
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
  const pe = new THREE14.MeshStandardMaterial({ color: 14674156, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false, name: "pe" });
  const bag = mesh(g2, pe, { name: "bag", cast: false });
  bag.position.y = 0.05;
  grp.add(bag);
  const wood = makeMaterial("woodPlank");
  wood.name = "stake";
  grp.add(mesh(tube(new THREE14.Vector3(0.35, -0.2, 0), new THREE14.Vector3(0.35, 0.5, 0), 0.015, 0.012, segs(lod, 4, 6, 12, 32, 96), 1), wood, { name: "stake" }));
  const cord = new THREE14.MeshStandardMaterial({ color: 7035450, roughness: 0.9, name: "cord" });
  grp.add(mesh(tube(new THREE14.Vector3(0, 0.75, 0), new THREE14.Vector3(0.35, 0.45, 0), 2e-3, 2e-3, 4, segs(lod, 1, 4, 8, 16, 32)), cord, { name: "cord" }));
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
  const grp = new THREE14.Group();
  const steel = makeMaterial("steel");
  steel.name = "beam";
  const sh = new THREE14.Shape();
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
  const beam = new THREE14.ExtrudeGeometry(sh, { depth: 1.2, steps: segs(lod, 1, 4, 24, 200, 900), bevelEnabled: false });
  beam.translate(0, 0.45, -0.6);
  grp.add(mesh(beam, steel, { name: "beam" }));
  const wood = makeMaterial("woodPlank");
  wood.name = "trestle";
  for (const z of [-0.45, 0.45]) {
    const t = new THREE14.BoxGeometry(0.5, 0.45, 0.08, 1, segs(lod, 1, 2, 4, 16, 40), 1);
    t.translate(0, 0.225, z);
    grp.add(mesh(t, wood, { name: "trestle" }));
  }
  const body = new THREE14.Group();
  const dark = new THREE14.MeshStandardMaterial({ color: 1849950, roughness: 0.6, name: "grinder" });
  const blk = new THREE14.MeshStandardMaterial({ color: 1381653, roughness: 0.7, name: "grip" });
  body.add(mesh(new THREE14.CylinderGeometry(0.03, 0.033, 0.28, segs(lod, 6, 12, 32, 96, 300), segs(lod, 1, 2, 8, 32, 96)).rotateZ(Math.PI / 2).translate(-0.14, 0, 0), dark, { name: "motor" }));
  body.add(mesh(new THREE14.BoxGeometry(0.07, 0.06, 0.07, 1, 1, 1).translate(0.02, 0, 0), dark, { name: "head" }));
  const disc = new THREE14.CylinderGeometry(0.0625, 0.0625, 25e-4, segs(lod, 10, 24, 64, 240, 800), 1);
  disc.translate(0.03, -0.045, 0);
  body.add(mesh(disc, new THREE14.MeshStandardMaterial({ color: 6052437, roughness: 0.9, name: "disc" }), { name: "disc" }));
  body.add(mesh(new THREE14.CylinderGeometry(0.012, 0.012, 0.1, 8).translate(0.02, 0.06, 0), blk, { name: "handle" }));
  body.rotation.set(0.25, 0.4, -0.35);
  body.position.set(-0.02, 0.45 + 0.16 + 0.07, 0.05);
  grp.add(body);
  grp.userData = { sparkAt: new THREE14.Vector3(0, 0.45 + 0.16, 0.05), sparkDir: new THREE14.Vector3(-0.8, 0.25, 0.55).normalize() };
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
  const g2 = new THREE14.BufferGeometry();
  g2.setAttribute("position", new THREE14.Float32BufferAttribute(pos, 3));
  g2.setAttribute("uv", new THREE14.Float32BufferAttribute(uv, 2));
  g2.setIndex(idx);
  g2.computeVertexNormals();
  const m = new THREE14.MeshStandardMaterial({ color: 723464, roughness: 0.04, metalness: 0, name: "diesel" });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      { float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
        vec3 film = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + fr * 2.5 + vFilm.x * 1.7 + vFilm.y * 1.3));
        totalEmissiveRadiance += film * fr * 0.02; }`).replace("#include <common>", "#include <common>\nvarying vec2 vFilm;");
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vFilm;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFilm = position.xz;");
  };
  const pm = mesh(g2, m, { name: "puddle", cast: false });
  pm.position.y = 4e-3;
  const grp = new THREE14.Group();
  grp.add(pm);
  const can = new THREE14.BoxGeometry(0.34, 0.47, 0.16, 1, segs(lod, 1, 2, 6, 24, 80), 1);
  can.rotateZ(Math.PI / 2 - 0.1);
  can.translate(R * 0.95, 0.09, 0.3);
  const cm = makeMaterial("metalRed");
  cm.name = "jerrycan";
  grp.add(mesh(can, cm, { name: "jerrycan" }));
  grp.userData = { R };
  return grp;
}

// src/assets/big.js
import * as THREE15 from "three";
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
    const g2 = new THREE15.BoxGeometry(nx * bx * 0.5 + 0.2, ny * by, nz * bz, 2, 2, 2);
    g2.translate(0, ny * by / 2, 0);
    parts.push([g2, m]);
  } else {
    const [sx, sy, sz] = [segs(lod, 1, 2, 8, 24, 80), segs(lod, 1, 1, 4, 10, 30), segs(lod, 1, 1, 4, 12, 40)];
    for (let k = 0; k < ny; k++) for (let j = 0; j < nz; j++) for (let i = 0; i < nx / 2; i++) {
      if (k === ny - 1 && (j === 0 || j === nz - 1) && r() < 0.5) continue;
      const g2 = new THREE15.BoxGeometry(bx, by, bz, sx, sy, sz);
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
  const paint = new THREE15.Color(1, 1, 1), glass = new THREE15.Color(0.04, 0.05, 0.06), trim = new THREE15.Color(0.08, 0.08, 0.08);
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
  const g2 = new THREE15.BufferGeometry();
  g2.setAttribute("position", new THREE15.Float32BufferAttribute(pos, 3));
  g2.setAttribute("color", new THREE15.Float32BufferAttribute(col, 3));
  g2.setAttribute("uv", new THREE15.Float32BufferAttribute(uv, 2));
  g2.setIndex(idx);
  g2.computeVertexNormals();
  const bm = makeMaterial(color, { vertexColors: true, roughness: 0.35, metalness: 0.35 });
  bm.name = "body";
  const u = applyChar(bm, { scale: 2 });
  u.uCharBase.value = 0.3;
  u.uCharH.value = 1.2;
  const grp = new THREE15.Group();
  grp.add(mesh(g2, bm, { name: "body" }));
  const tg = tireGeometry(Math.max(0, lod - 1));
  const rm = makeMaterial("rubber");
  rm.name = "tire";
  const tu = applyChar(rm, { scale: 20 });
  tu.uCharH.value = 0.7;
  const steel = makeMaterial("steel");
  steel.name = "rim";
  const rimG = new THREE15.CylinderGeometry(0.2, 0.2, 0.19, segs(lod, 6, 12, 32, 96, 300));
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
  const lightM = new THREE15.MeshStandardMaterial({ color: 14540253, emissive: 3353120, roughness: 0.2, name: "lamp" });
  const tailM = new THREE15.MeshStandardMaterial({ color: 5572616, emissive: 2097152, roughness: 0.3, name: "tail" });
  for (const z of [-0.6, 0.6]) {
    const h2 = new THREE15.BoxGeometry(0.05, 0.1, 0.32);
    h2.translate(L / 2 - 0.02, 0.8, z);
    grp.add(mesh(h2, lightM, { name: "lamp" }));
    const t = new THREE15.BoxGeometry(0.05, 0.1, 0.3);
    t.translate(-L / 2 + 0.03, 0.86, z);
    grp.add(mesh(t, tailM, { name: "tail" }));
  }
  grp.userData = { char: u, tireChar: tu, L, W: Wd, body: bm };
  return grp;
}
function house({ lod = 2, seed = 41 }) {
  const r = mulberry32(seed);
  const W = 9, D = 7, Hw = 2.9, pitch = 0.62, ov = 0.45, th = 0.3;
  const grp = new THREE15.Group();
  const plaster = makeMaterial("plaster");
  plaster.name = "plaster";
  const pu = applyChar(plaster, { scale: 3 });
  pu.uCharBase.value = 0.8;
  pu.uCharH.value = 3;
  const roofM = makeMaterial("roof");
  roofM.name = "roof";
  const ru = applyChar(roofM, { scale: 3 });
  ru.uCharBase.value = Hw;
  ru.uCharH.value = 3;
  const wood = makeMaterial("woodPlank");
  wood.name = "frames";
  const wu = applyChar(wood, { scale: 6 });
  const brick = makeMaterial("brick");
  brick.name = "brick";
  const glassM = new THREE15.MeshStandardMaterial({ color: 725012, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55, name: "glass" });
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
  function wall(name, len, place) {
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
      const g2 = new THREE15.BoxGeometry(b - a, y1 - y0, th, Math.max(1, Math.round((b - a) * subdiv)), Math.max(1, Math.round((y1 - y0) * subdiv)), 1);
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
          const g2 = new THREE15.BoxGeometry(w, h2, th * 0.55);
          g2.translate(o.u + du, y, th * 0.25);
          place(g2);
          parts.push([g2, wood]);
        }
        if (!o.door && lod >= 2) {
          const g2 = new THREE15.BoxGeometry(0.05, o.h, 0.06);
          g2.translate(o.u, o.y + o.h / 2, 0.05);
          place(g2);
          parts.push([g2, wood]);
          const g22 = new THREE15.BoxGeometry(o.w, 0.05, 0.06);
          g22.translate(o.u, o.y + o.h * 0.6, 0.05);
          place(g22);
          parts.push([g22, wood]);
        }
      }
      const pane = new THREE15.BoxGeometry(o.w, o.h, 0.01);
      pane.translate(o.u, o.y + o.h / 2, 0.02);
      place(pane);
      parts.push([pane, o.door ? wood : glassM]);
    }
  }
  wall("S", W, (g2) => g2.translate(0, 0, D / 2 - th / 2));
  wall("N", W, (g2) => {
    g2.rotateY(Math.PI);
    g2.translate(0, 0, -D / 2 + th / 2);
  });
  wall("E", D - 2 * th, (g2) => {
    g2.rotateY(Math.PI / 2);
    g2.translate(W / 2 - th / 2, 0, 0);
  });
  wall("W", D - 2 * th, (g2) => {
    g2.rotateY(-Math.PI / 2);
    g2.translate(-W / 2 + th / 2, 0, 0);
  });
  for (const [w, d, x, z] of [[W + 0.06, 0.04, 0, D / 2 + 0.01], [W + 0.06, 0.04, 0, -D / 2 - 0.01], [0.04, D, W / 2 + 0.01, 0], [0.04, D, -W / 2 - 0.01, 0]]) {
    const g2 = new THREE15.BoxGeometry(w, 0.45, d);
    g2.translate(x, 0.225, z);
    parts.push([g2, brick]);
  }
  const rh = D / 2 * Math.tan(pitch);
  for (const sx of [1, -1]) {
    const sh = new THREE15.Shape();
    sh.moveTo(-D / 2, 0);
    sh.lineTo(D / 2, 0);
    sh.lineTo(0, rh);
    sh.closePath();
    const g2 = new THREE15.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false });
    g2.rotateY(Math.PI / 2);
    g2.translate(sx * (W / 2) - (sx > 0 ? th : 0), Hw, 0);
    parts.push([g2, plaster]);
  }
  {
    const g2 = new THREE15.BoxGeometry(W - 2 * th, 0.1, D - 2 * th);
    g2.translate(0, 0.05, 0);
    parts.push([g2, wood]);
  }
  {
    const g2 = new THREE15.BoxGeometry(0.15, Hw, D - 2 * th);
    g2.translate(0.8, Hw / 2, 0);
    parts.push([g2, plaster]);
  }
  {
    const g2 = new THREE15.BoxGeometry(W - 2 * th, 0.15, D - 2 * th);
    g2.translate(0, Hw - 0.07, 0);
    parts.push([g2, wood]);
  }
  const slopeL = (D / 2 + ov) / Math.cos(pitch);
  if (lod < 3) {
    for (const sz of [1, -1]) {
      const g2 = new THREE15.BoxGeometry(W + 2 * ov, 0.12, slopeL, Math.max(1, subdiv * 3), 1, Math.max(1, subdiv * 2));
      g2.translate(0, 0, sz * slopeL / 2);
      g2.rotateX(sz * pitch);
      g2.translate(0, Hw + rh + 0.06 - 0, 0);
      parts.push([g2, roofM]);
    }
  } else {
    const tw = 0.18, tl = 0.38, step = 0.15;
    const tseg = segs(lod, 1, 1, 1, 1, 4);
    const tile = new THREE15.CylinderGeometry(tw * 0.55, tw * 0.55, tl, 4 * tseg, 2 * tseg, true, 0, Math.PI);
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
      const g2 = new THREE15.BoxGeometry(W + 2 * ov, 0.06, slopeL);
      g2.translate(0, 0, sz * slopeL / 2);
      g2.rotateX(sz * pitch);
      g2.translate(0, Hw + rh, 0);
      parts.push([g2, wood]);
    }
  }
  {
    const g2 = new THREE15.BoxGeometry(0.6, 1.8, 0.6, 1, Math.max(1, subdiv * 2), 1);
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
import * as THREE16 from "three";
function strip(g2) {
  const c2 = g2.index ? g2.toNonIndexed() : g2;
  for (const k of Object.keys(c2.attributes)) if (!["position", "normal", "uv"].includes(k)) c2.deleteAttribute(k);
  return c2;
}
function pineGeometry(lod, seed = 1) {
  const n = noise3(seed), r = mulberry32(seed);
  const radial = segs(lod, 4, 7, 14, 40, 120), hs = segs(lod, 1, 3, 10, 30, 90);
  const trunk = tube(new THREE16.Vector3(0, -0.02, 0), new THREE16.Vector3(0, 0.98, 0), 0.025, 4e-3, Math.max(4, radial >> 1), hs);
  const layers = segs(lod, 2, 4, 7, 10, 14);
  const crowns = [];
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1 || 1);
    const y0 = 0.25 + t * 0.62, h2 = 0.32 - t * 0.12, rad = 0.2 * (1 - t * 0.75) + 0.03;
    const g2 = new THREE16.ConeGeometry(rad, h2, radial, Math.max(1, hs >> 1), true);
    g2.translate(0, y0 + h2 / 2, 0);
    const p = g2.attributes.position;
    for (let q = 0; q < p.count; q++) {
      const x = p.getX(q), y = p.getY(q), z = p.getZ(q), a = Math.atan2(z, x);
      const k = 1 + 0.25 * n.fbm(Math.cos(a) * 2 + i, y * 8, Math.sin(a) * 2, 3) + (lod >= 2 ? 0.12 * Math.sin(a * 7 + i) : 0);
      p.setXYZ(q, x * k, y - (1 - (y - y0) / h2) * 0.03 * r(), z * k);
    }
    g2.computeVertexNormals();
    crowns.push(strip(g2));
  }
  if (lod >= 2) for (let i = 0; i < 6; i++) {
    const a = r() * 6.28, y = 0.12 + r() * 0.15;
    crowns.push(strip(tube(new THREE16.Vector3(0, y, 0), new THREE16.Vector3(Math.cos(a) * 0.12, y + 0.03, Math.sin(a) * 0.12), 4e-3, 1e-3, 4, 1)));
  }
  return { trunk: strip(trunk), crown: mergeGeometries(crowns, false) };
}
function bushGeometry(lod, seed = 2) {
  const n = noise3(seed), r = mulberry32(seed);
  const det = segs(lod, 0, 1, 3, 5, 7);
  const blobs = [];
  for (let i = 0; i < 4; i++) {
    const g2 = new THREE16.IcosahedronGeometry(0.32 + r() * 0.12, det);
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
    stems.push(strip(tube(new THREE16.Vector3(0, 0, 0), new THREE16.Vector3(Math.cos(a) * 0.3, 0.45 + r() * 0.2, Math.sin(a) * 0.3), 0.012, 4e-3, 4, 1)));
  }
  return { trunk: mergeGeometries(stems, false), crown: mergeGeometries(blobs, false) };
}
function pine({ lod = 2, seed = 1, height = 14 }) {
  const { trunk, crown } = pineGeometry(lod, seed);
  const bark = makeMaterial("bark");
  bark.name = "bark";
  const nee = makeMaterial("needles", { side: THREE16.DoubleSide });
  nee.name = "needles";
  const u1 = applyChar(bark, { scale: 10 }), u2 = applyChar(nee, { scale: 10 });
  const grp = new THREE16.Group();
  const a = new THREE16.Mesh(trunk, bark), b = new THREE16.Mesh(crown, nee);
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
  const lv = makeMaterial("leaves", { side: THREE16.DoubleSide });
  lv.name = "leaves";
  const u1 = applyChar(tw, { scale: 10 }), u2 = applyChar(lv, { scale: 10 });
  const grp = new THREE16.Group();
  grp.add(new THREE16.Mesh(trunk, tw), new THREE16.Mesh(crown, lv));
  grp.scale.setScalar(size);
  grp.userData = { char: [u1, u2] };
  return grp;
}
var InstancedFlora = class {
  constructor(scene, kind, items, { lodNear = 2, lodFar = 0, nearDist = 40, seed = 1 } = {}) {
    this.scene = scene;
    this.items = items;
    this.nearDist = nearDist;
    const gen = kind === "pine" ? pineGeometry : bushGeometry;
    const mk = (lod) => gen(lod, seed);
    const near = mk(lodNear), far = mk(lodFar);
    const barkM = makeMaterial("bark");
    barkM.name = kind + "-bark";
    const leafM = makeMaterial(kind === "pine" ? "needles" : "leaves", { side: THREE16.DoubleSide });
    leafM.name = kind + "-leaf";
    applyChar(barkM, { instanced: true, scale: 10 });
    applyChar(leafM, { instanced: true, scale: 10 });
    const N = items.length;
    this.aChar = new THREE16.InstancedBufferAttribute(new Float32Array(N * 2), 2);
    this.aChar.setUsage(THREE16.DynamicDrawUsage);
    this.meshes = [];
    for (const [lvl, geo] of [["near", near], ["far", far]]) for (const [part, mat] of [["trunk", barkM], ["crown", leafM]]) {
      const g2 = geo[part].clone();
      g2.setAttribute("aChar", this.aChar);
      const m = new THREE16.InstancedMesh(g2, mat, N);
      m.castShadow = lvl === "near";
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.userData = { lvl, part };
      m.instanceMatrix.setUsage(THREE16.DynamicDrawUsage);
      scene.add(m);
      this.meshes.push(m);
    }
    this.mats = [];
    const mm = new THREE16.Matrix4(), q = new THREE16.Quaternion(), up = new THREE16.Vector3(0, 1, 0);
    for (const it of items) this.mats.push(mm.compose(new THREE16.Vector3(it.x, 0, it.z), q.setFromAxisAngle(up, it.rot || 0), new THREE16.Vector3(it.s, it.s * (it.sy || 1), it.s)).clone());
    this.order = { near: new Uint32Array(N), far: new Uint32Array(N) };
    this.charState = new Float32Array(N * 2);
    this.lastUpd = -1;
  }
  setChar(i, c2, glow) {
    this.charState[i * 2] = c2;
    this.charState[i * 2 + 1] = glow;
  }
  update(camera, time) {
    if (time - this.lastUpd > 0.25 || this.lastUpd < 0) {
      this.lastUpd = time;
      let nn = 0, nf = 0;
      const cp = camera.position;
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i], d2 = (it.x - cp.x) ** 2 + (it.z - cp.z) ** 2;
        if (d2 < this.nearDist * this.nearDist) this.order.near[nn++] = i;
        else this.order.far[nf++] = i;
      }
      this.nn = nn;
      this.nf = nf;
      for (const m of this.meshes) {
        const ord = m.userData.lvl === "near" ? this.order.near : this.order.far, cnt = m.userData.lvl === "near" ? nn : nf;
        for (let k = 0; k < cnt; k++) m.setMatrixAt(k, this.mats[ord[k]]);
        m.count = cnt;
        m.instanceMatrix.needsUpdate = true;
      }
    }
    for (const m of this.meshes) {
      const ord = m.userData.lvl === "near" ? this.order.near : this.order.far, cnt = m.count;
      let a = m.geometry.attributes.aChar;
      if (a === this.aChar) {
        a = new THREE16.InstancedBufferAttribute(new Float32Array(this.items.length * 2), 2);
        a.setUsage(THREE16.DynamicDrawUsage);
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
    for (const m of this.meshes) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * m.count;
    return Math.round(t);
  }
  dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
  }
};

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
  { id: "pine", name: "Borovice 14 m", build: pine, size: 15, cat: "vegetace" },
  { id: "bush", name: "Such\xFD ke\u0159", build: bush, size: 1.6, cat: "vegetace" }
];
var assetById = (id) => ASSETS.find((a) => a.id === id);

// src/scenarios/index.js
import * as THREE17 from "three";

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
  const N = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!dx && !dy) continue;
    if ((Math.abs(dx) === 2 || Math.abs(dy) === 2) && (Math.abs(dx) !== 1 && Math.abs(dy) !== 1)) continue;
    const d = Math.hypot(dx, dy) * cell, ang = Math.atan2(dy, dx);
    const R = rosAt(Rh, LB, ang - windDir);
    N.push({ dx, dy, d, R });
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
  const pop = () => {
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
    const [t, i] = pop();
    if (t > T[i]) continue;
    const x = i % nx, y = i / nx | 0;
    for (const n of N) {
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

// src/scenarios/index.js
var V = (x, y, z) => new THREE17.Vector3(x, y, z);
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
function blastRows(W, label = "TNT ekv.") {
  return [
    [label, W >= 1 ? W.toFixed(1) + " kg" : (W * 1e3).toFixed(0) + " g", "Kinney\u2013Graham \u26054"],
    ...blastSummary(W, [1, 3, 10, 30, 100, 300]).map((b) => [`  p\u0159etlak v ${b.R} m`, b.kPa < 1 ? (b.kPa * 1e3).toFixed(0) + " Pa" : b.kPa.toFixed(1) + " kPa", b.effect])
  ];
}
function table(ctx, w = 1.2, d = 0.7) {
  const m = makeMaterial("woodPlank");
  const g2 = new THREE17.BoxGeometry(w, 0.04, d);
  g2.translate(0, -0.02, 0);
  const t = new THREE17.Mesh(g2, m);
  t.receiveShadow = true;
  ctx.add(t);
  const leg = new THREE17.BoxGeometry(0.05, 0.72, 0.05);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const l = new THREE17.Mesh(leg, m);
    l.position.set(x * (w / 2 - 0.05), -0.4, z * (d / 2 - 0.05));
    ctx.add(l);
  }
}
var SCENARIOS = [
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
            const d = V(dir.x + ax, dir.y + ay, dir.z + (r() - 0.5) * 0.3).normalize();
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
      table(ctx);
      const c2 = candle({ lod: ctx.lod });
      ctx.add(c2);
      const at = c2.userData.flameAt;
      const src = ctx.fx.addSource({
        pos: V(at.x, at.y - 4e-3, at.z),
        fuel: "paraffin",
        Q: 80,
        D: 0.016,
        L: () => 0.045,
        T: 1450,
        blue: 1,
        volume: true,
        taper: 1.25,
        baseWide: -0.1,
        neck: 0.55,
        puffAmp: 0.12,
        turbAmp: 0.12,
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
          c2.userData.wax.emissiveIntensity = out ? 0 : 4 * PRE.value;
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
      const src = ctx.fx.addSource({ pos: V(at.x, at.y - 0.06, at.z), fuel: "woodResin", Q: 4e3, D: 0.065, volume: true, mult: { embers: 0.12, sparks: 0.08 }, taper: 0.9, seed: 3 });
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
      const src = ctx.fx.addSource({ pos: V(0, 0.04, 0), fuel: "woodDry", Q: (t) => 15e3 * (0.9 + 0.1 * Math.sin(t * 0.7)), D: 0.32, volume: true, seed: 4 });
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
      const src = ctx.fx.addSource({ pos: V(0, 0.05, 0), fuel: "woodDry", Q: (t) => 2e5 * (0.92 + 0.08 * Math.sin(t * 0.5)), D: 0.8, volume: true, seed: 5 });
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
      const src = ctx.fx.addSource({ pos: V(0, 0.08, 0), fuel: "woodDry", Q: (t) => 3e6 * (0.9 + 0.1 * Math.sin(t * 0.3)), D: 2.4, volume: true, seed: 6 });
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
      const src = ctx.fx.addSource({ pos: V(0, H * 0.55, 0), fuel: "straw", Q: (t) => hrrCurve(t, curve), footprint: { type: "rect", w: W * 1.05, d: D * 1.05 }, scale: (t) => Math.min(1, 0.15 + Math.sqrt(t / tg)), volume: true, mult: { embers: 2 }, seed: 7 });
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: Math.max(W, D) * 1, rate: 1 / 900, glow: 0.6, seed: 2 });
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
      const src = ctx.fx.addSource({ pos: V(0, 0.25, 0), fuel: "rubber", Q: (t) => hrrCurve(t + 60, curve), D: 0.95, volume: true, seed: 8, mult: { smoke: 1.3 } });
      const pool = ctx.fx.addSource({ pos: V(0, 0.01, 0), fuel: "rubber", Q: (t) => 3e5 * Math.min(1, t / 60), D: 1.5, start: 120, volume: false, seed: 9, mult: { smoke: 0.6, embers: 0 } });
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: 1.6, rate: 1 / 200, glow: 0.3, seed: 3 });
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
      const src = ctx.fx.addSource({ pos: V(0, 0.01, 0), fuel: "diesel", Q, D: Dt, volume: true, seed: 10, start: 0.5 });
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: sp.D * 0.6, rate: 1 / 60, seed: 4 });
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
      const eng = ctx.fx.addSource({ pos: V(L2 - 0.75, 0.75, 0), fuel: "vehicle", Q: (t) => hrrCurve(t, { alpha: T2_ALPHA.medium, Qpeak: 15e5, tPlateau: 600, tau: 400 }), footprint: { type: "rect", w: 1.1, d: 1.4 }, volume: true, seed: 11 });
      const cab = ctx.fx.addSource({ pos: V(-0.2, 0.95, 0), fuel: "vehicle", start: 240, Q: (t) => hrrCurve(t, { alpha: T2_ALPHA.fast, Qpeak: 35e5, tPlateau: 400, tau: 500 }), footprint: { type: "rect", w: 2.2, d: 1.4 }, volume: true, seed: 12 });
      const tires = [];
      for (const wx of [-1.35, 1.35]) for (const wz of [-0.85, 0.85]) tires.push(ctx.fx.addSource({ pos: V(wx, 0.05, wz), fuel: "rubber", start: 480 + (wx > 0 ? 0 : 120), end: 1500, Q: (t) => 25e4 * Math.min(1, t / 90), D: 0.5, volume: false, seed: 20 + tires.length, mult: { smoke: 0.5 } }));
      const fuel = ctx.fx.addSource({ pos: V(-1.5, 0.01, 0), fuel: "gasoline", start: 420, end: 600, Q: (t) => 8e5 * Math.min(1, t / 20) * Math.max(0, 1 - t / 180), D: 1.6, volume: false, seed: 30 });
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: 3.2, rate: 1 / 1200, glow: 0.2, seed: 5 });
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
      const pre = ctx.fx.addSource({ pos: V(0.3, 0.01, 0.2), fuel: "gasoline", Q: 4e5, D: 0.7, end: 6, volume: true, seed: 40 });
      const M = 25, fb = bleveFireball(M), film = () => ctx.controls.film;
      const Wburst = 0.05;
      let boom = false;
      const vel = V(0, 0, 0);
      let spin = 0;
      return {
        update(dt, t) {
          if (!boom && t > 6) {
            boom = true;
            const W = film() ? 4 : Wburst;
            ctx.fx.addExplosion({
              pos: V(0, 0.4, 0),
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
              ctx.fx.addSource({ pos: V(Math.cos(a) * R, 0.01, Math.sin(a) * R), fuel: "gasoline", Q: 12e4, D: 0.4, start: 0.6, end: 12 + i * 3, volume: false, seed: 50 + i });
            }
            ctx.fx.addSource({ pos: V(0, 0.01, 0), fuel: "gasoline", Q: (q) => 6e6 * Math.max(0, 1 - q / 26), D: 3.5, start: 0.4, end: 26, volume: true, seed: 60 });
            vel.set(1.5, film() ? 28 : 17, -1);
            spin = 6;
          }
          if (boom) {
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
        info: () => [["Zapojen\xE9 palivo", M + " kg (z ~150 kg)", "p\u0159edpoklad \u26052"], ["Ohniv\xE1 koule D", fb.D.toFixed(1) + " m", "CCPS \u26054"], ["Trv\xE1n\xED koule", fb.t.toFixed(2) + " s", "CCPS \u26054"], ["V\xFD\u0161ka st\u0159edu", fb.H.toFixed(1) + " m", "CCPS \u26053"], ["Energie roztr\u017Een\xED", "\u2248 0,05 kg TNT (3 bar, 0,2 m\xB3)", "Brode \u26053"], ...blastRows(ctx.controls.film ? 4 : 0.05).slice(1, 5)]
      };
    }
  },
  // ---------------------------------------------------------------------------------------------- acetylen
  {
    id: "acetylene",
    group: "Exploze",
    name: "V\xFDbuch acetylenov\xE9 bomby",
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
      let boom = false;
      return {
        update(dt, t) {
          if (!boom && t > 1.5) {
            boom = true;
            b.children[0].visible = false;
            b.children[2].visible = false;
            ctx.fx.addExplosion({ pos: V(0, 0.4, 0), W, seed: 7, flash: 3e6, scorch: 0.9, dust: true, dustAlbedo: [0.3, 0.3, 0.25], fireball: { D: fb.D, t: fb.t, T: 3e3, soot: 0 }, smoke: { n: 60, life: 4, albedo: [0.75, 0.75, 0.77], tau: 0.25, buoy: 1.5 }, debris: { n: 24, speed: 30, size: 0.03, hot: 0.2, up: 0.5 }, sparks: { n: 80, speed: 25 } });
          }
        },
        info: () => [["Sm\u011Bs", "C\u2082H\u2082 : O\u2082 = 1 : 2,5, 50 l", ""], ["Hmotnost C\u2082H\u2082", (mC2H2 * 1e3).toFixed(0) + " g", ""], ["\xDA\u010Dinnost \u2192 TNT", "45 %", "odhad \u26052"], ...blastRows(W), ["Ohniv\xE1 koule", fb.D.toFixed(2) + " m / " + (fb.t * 1e3).toFixed(0) + " ms", "objem produkt\u016F \u26052"]]
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
      let boom = false;
      return {
        update(dt, t) {
          if (!boom && t > 1.5) {
            boom = true;
            g2.visible = false;
            ctx.fx.addExplosion({ pos: V(0, 0.05, 0), W, seed: 9, flash: 2e6, scorch: 1.4, dust: true, fireball: { D: fb.D, t: fb.t, T: 2600, soot: 1 }, smoke: { n: 140, life: 7, albedo: [0.11, 0.1, 0.095], tau: 1.6, buoy: 0.7, buoyAcc: 0.25 }, debris: { n: 160, speed: 300, size: 6e-3, hot: 0.9, up: 0.25, T: 1100 }, sparks: { n: 220, speed: 70 } });
            ctx.fx.debris.burst(V(0, 0.05, 0), { n: 40, speed: 12, size: 0.05, hot: 0, up: 0.7 });
          }
        },
        info: () => [["N\xE1pl\u0148", "180 g Composition B (RE 1,33)", "\u26054"], ...blastRows(W), ["Rychlost st\u0159epin", v.toFixed(0) + " m/s", "Gurney \u26054"], ["Ohniv\xE1 koule", fb.D.toFixed(2) + " m / " + (fb.t * 1e3).toFixed(0) + " ms", "\u26052"]]
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
    cams: [{ name: "160 m", pos: [130, 8, 95], target: [0, 18, 0] }, { name: "400 m", pos: [330, 25, 230], target: [0, 40, 0] }, { name: "bl\xEDzko (60 m)", pos: [50, 4, 35], target: [0, 10, 0] }],
    build(ctx) {
      const d = tntDrum({ lod: ctx.lod });
      ctx.add(d);
      const W = 1e3, fb = heFireball(W);
      let boom = false;
      return {
        update(dt, t) {
          if (!boom && t > 2) {
            boom = true;
            d.visible = false;
            ctx.fx.addExplosion({ pos: V(0, 0.6, 0), W, seed: 11, flash: 6e8, scorch: 26, crater: 1, dust: true, dustAlbedo: [0.36, 0.3, 0.22], fireball: { D: fb.D, t: fb.t, T: 2400, soot: 1, rise: 30 }, smoke: { n: 1400, life: 50, albedo: [0.09, 0.085, 0.08], tau: 3, buoy: 14, buoyAcc: 5, dur: 4 }, debris: { n: 700, speed: 140, size: 0.35, hot: 0.25, up: 0.55, T: 1300 }, sparks: { n: 900, speed: 120 }, life: 70 });
          }
        },
        info: () => [...blastRows(W), ["Ohniv\xE1 koule", fb.D.toFixed(0) + " m / " + fb.t.toFixed(2) + " s", "\u26052"], ["Rychlost \u010Dela v 10 m", "\u2248 " + (343 * Math.sqrt(1 + 6 * blastSummary(W, [10])[0].Ps / (7 * 101325))).toFixed(0) + " m/s", "Rankine\u2013Hugoniot \u26055"]]
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
      { id: "fuel", label: "Palivo", type: "select", value: "woodDry", options: ["woodDry", "diesel", "gasoline", "rubber", "straw", "paraffin", "vehicle", "houseContents"] },
      { id: "Q", label: "V\xFDkon Q [kW]", type: "range", min: 1, max: 2e4, value: 500, log: true },
      { id: "D", label: "Pr\u016Fm\u011Br D [m]", type: "range", min: 0.05, max: 6, value: 1, log: true }
    ],
    build(ctx) {
      const src = ctx.fx.addSource({ pos: V(0, 0.01, 0), fuel: "woodDry", Q: () => ctx.controls.Q * 1e3, D: () => ctx.controls.D, volume: true, seed: 90 });
      return { update() {
        src.o.fuel = ctx.controls.fuel;
      }, info: () => fireRows(src) };
    }
  }
];
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
  const flora = new InstancedFlora(ctx.scene, o.kind, items, { lodNear: Math.min(ctx.lod, o.kind === "pine" ? 2 : 3), lodFar: 0, nearDist: o.kind === "pine" ? 45 : 25, seed: o.seed });
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
  const poolN = [40, 70, 110, 180][ctx.tier.id];
  const pool = [];
  for (let i = 0; i < poolN; i++) pool.push(ctx.fx.addSource({ pos: V(0, 0, 0), fuel: o.fuel, Q: 0, D: cell, footprint: { type: "rect", w: cell, d: cell }, volume: i < 4, seed: 100 + i, mult: { smoke: 1, embers: 0.6, haze: 0.4, light: 1 } }));
  pool.forEach((s) => s.enabled = false);
  const scorch = ctx.fx.addScorch({ pos: V(0, 0, 0), radius: 0.1, seed: 9 });
  scorch.mesh.visible = false;
  let stats = { burning: 0, burnt: 0, crown: 0 };
  const cellCenter = (k) => [(k % nx + 0.5) * cell - size / 2, ((k / nx | 0) + 0.5) * cell - size / 2];
  const cv = document.createElement("canvas");
  cv.width = nx;
  cv.height = ny;
  const cg = cv.getContext("2d");
  const img = cg.createImageData(nx, ny);
  const tex = new THREE17.CanvasTexture(cv);
  tex.magFilter = THREE17.LinearFilter;
  const bpMat = new THREE17.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
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
  const burnPlane = new THREE17.Mesh(new THREE17.PlaneGeometry(size, size), bpMat);
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
  const room = (i) => {
    const rm = ud.rooms[i];
    const Ao = rm.wins.reduce((s, w) => s + w.w * w.h * (w.door ? 0.3 : 1), 0);
    const Ho = rm.wins.reduce((s, w) => s + w.h * w.w, 0) / Math.max(rm.wins.reduce((s, w) => s + w.w, 0), 1e-3);
    const AT = 2 * (rm.w * rm.d + rm.w * Hw + rm.d * Hw);
    return { ...rm, ...compartment({ Ao, Ho, AT }), Ao, Ho, AT };
  };
  const rooms = [room(0), room(1)];
  const tStart = [0, 0];
  const srcs = [];
  const mkRoom = (k, start) => {
    const rm = rooms[k], alpha = T2_ALPHA.fast;
    const tfo = Math.sqrt(rm.Qfo / alpha);
    rm.tfo = start + tfo;
    const Qin = (t) => t < tfo ? alpha * t * t : rm.Qmax * Math.min(1, 0.6 + (t - tfo) / 120) * (t > tfo + 1500 ? Math.exp(-(t - tfo - 1500) / 400) : 1);
    rm.Qin = Qin;
    const inside = ctx.fx.addSource({ pos: V(rm.x, 0.12, rm.z), fuel: "houseContents", start, Q: (t) => Math.min(Qin(t), rm.Qmax * 0.7), footprint: { type: "rect", w: rm.w * 0.6, d: rm.d * 0.6 }, scale: (t) => Math.min(1, 0.2 + t / tfo), L: () => Hw * 0.95, ventLocal: 0.35, volume: false, seed: 200 + k, mult: { smoke: 0.4, embers: 0.2, haze: 0 } });
    srcs.push(inside);
    for (const w of rm.wins) {
      if (w.door) continue;
      const wall = w.wall, n = { S: [0, 0, 1], N: [0, 0, -1], E: [1, 0, 0], W: [-1, 0, 0] }[wall];
      const off = { S: [w.u, ud.D / 2], N: [-w.u, -ud.D / 2], E: [ud.W / 2, -w.u], W: [-ud.W / 2, w.u] }[wall];
      const share = w.w * w.h / rm.Ao;
      const s = ctx.fx.addSource({
        pos: V(off[0] + n[0] * 0.25, w.y + w.h * 0.55, off[1] + n[2] * 0.25),
        fuel: "houseContents",
        start: start + tfo,
        Q: (t) => Math.max(0, Qin(t + tfo) - rm.Qmax * 0.6) * share * 0.9 + 2e5 * share,
        footprint: { type: "rect", w: wall === "E" || wall === "W" ? 0.25 : w.w * 0.9, d: wall === "E" || wall === "W" ? w.w * 0.9 : 0.25 },
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
  const roof = ctx.fx.addSource({ pos: V(-1.5, Hw + 1.8, 0), fuel: "houseContents", start: roofT, Q: (t) => 6e6 * Math.min(1, t / 240), footprint: { type: "rect", w: 5, d: 4 }, scale: (t) => Math.min(1, 0.2 + t / 300), volume: true, seed: 230, mult: { embers: 2 } });
  return {
    update(dt, t) {
      const c2 = ud.char;
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
        ...fireRows(srcs[1], "okno").slice(1, 4)
      ];
    }
  };
}
var scenarioById = (id) => SCENARIOS.find((s) => s.id === id);

// src/physics/index.js
var physics_exports = {};
__export(physics_exports, {
  AMB: () => AMB,
  DAMAGE: () => DAMAGE,
  EXPLOSIVES: () => EXPLOSIVES,
  FUELS: () => FUELS,
  SOOT_SIGMA: () => SOOT_SIGMA,
  T2_ALPHA: () => T2_ALPHA,
  TNT_J_PER_KG: () => TNT_J_PER_KG,
  WIND_CLASSES: () => WIND_CLASSES,
  arrivalTimes: () => arrivalTimes,
  blackbody: () => blackbody,
  blackbodyLUT: () => blackbodyLUT,
  blackbodyXYZ: () => blackbodyXYZ,
  blastSummary: () => blastSummary,
  bleveFireball: () => bleveFireball,
  byram: () => byram,
  cmf: () => cmf,
  compartment: () => compartment,
  crownInitiation: () => crownInitiation,
  damageAt: () => damageAt,
  flameColorTemp: () => flameColorTemp,
  flameHeight: () => flameHeight,
  flameLuminousIntensity: () => flameLuminousIntensity,
  flameTilt: () => flameTilt,
  gasTNT: () => gasTNT,
  gurneySphere: () => gurneySphere,
  heFireball: () => heFireball,
  headROS: () => headROS,
  hrrCurve: () => hrrCurve,
  hrrCurveEnd: () => hrrCurveEnd,
  lengthToBreadth: () => lengthToBreadth,
  overpressure: () => overpressure,
  planck: () => planck,
  plumeAxis: () => plumeAxis,
  plumeMassFlow: () => plumeMassFlow,
  poolFire: () => poolFire,
  positivePhase: () => positivePhase,
  puffingFrequency: () => puffingFrequency,
  rosAt: () => rosAt,
  scaled: () => scaled,
  shockRadiusAt: () => shockRadiusAt,
  shockSpeed: () => shockSpeed,
  shockTable: () => shockTable,
  smokeColor: () => smokeColor,
  smokeOpticalDepth: () => smokeOpticalDepth,
  spillFire: () => spillFire,
  ventilation: () => ventilation,
  virtualOrigin: () => virtualOrigin,
  windAt: () => windAt,
  xyzToLinearSRGB: () => xyzToLinearSRGB
});
export {
  ASSETS,
  AirField,
  BillboardSystem,
  Debris,
  Environment,
  Explosion,
  FLAMEK,
  FLAME_LUM,
  FXWorld,
  FireLights,
  FireSource,
  FlameVolume,
  GLSL_COMMON,
  HazeSystem,
  LAYER_FX,
  LAYER_HAZE,
  PRE,
  PTYPE,
  Pipeline,
  SCENARIOS,
  Scorch,
  SparkSystem,
  TIERS,
  TIMES,
  VOLUME_FIELDS,
  VOLUME_FS,
  applyChar,
  assetById,
  atlasToCanvas,
  bakeAtlas,
  bbTexture,
  guessTier,
  noiseTexture,
  physics_exports as physics,
  scenarioById,
  sharedUniforms
};
