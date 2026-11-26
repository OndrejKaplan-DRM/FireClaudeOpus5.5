// Vykreslovací řetězec: HDR scéna → (kopie hloubky) → průhledné efekty → heat haze → bloom → expozice + ACES → obrazovka.
import * as THREE from 'three';

export const LAYER_FX = 1, LAYER_HAZE = 2;

const FS_TRI = new THREE.BufferGeometry();
FS_TRI.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
FS_TRI.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

const VS = /* glsl */`out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsPass(fs, uniforms) {
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, glslVersion: THREE.GLSL3 });
  const mesh = new THREE.Mesh(FS_TRI, m); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  return { m, scene, u: uniforms };
}

const DEPTH_COPY = /* glsl */`
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D tDepth; uniform float cNear, cFar;
void main(){
  float d = texture(tDepth, vUv).x;
  float z = d * 2.0 - 1.0;
  float lin = (2.0 * cNear * cFar) / (cFar + cNear - z * (cFar - cNear));
  o = vec4(lin, 0.0, 0.0, 1.0);
}`;

const BLOOM_DOWN = /* glsl */`
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
}`;

const BLOOM_UP = /* glsl */`
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D tSrc; uniform vec2 texel;
void main(){
  vec2 t = texel;
  vec3 c = texture(tSrc, vUv + vec2(-2.0*t.x, 0.0)).rgb + texture(tSrc, vUv + vec2(2.0*t.x, 0.0)).rgb
         + texture(tSrc, vUv + vec2(0.0, -2.0*t.y)).rgb + texture(tSrc, vUv + vec2(0.0, 2.0*t.y)).rgb;
  c += (texture(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture(tSrc, vUv + vec2(t.x, -t.y)).rgb
      + texture(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture(tSrc, vUv + vec2(t.x, t.y)).rgb) * 2.0;
  o = vec4(c / 12.0, 1.0);
}`;

const FINAL = /* glsl */`
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D tMain, tBloom, tHaze;
uniform float exposure, bloomStrength, useBloom, useHaze, grain, time, vignette;
uniform vec2 res;
vec3 aces(vec3 x){ // Hill / Narkowicz – ACES fit
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
}`;

export class Pipeline {
  constructor(renderer, tier) {
    this.r = renderer;
    this.exposure = 1; this.targetExposure = 1; this.autoExposure = true; this.bloomStrength = 0.6;
    this.stats = { passes: 0 };
    this.depthCopy = fsPass(DEPTH_COPY, { tDepth: { value: null }, cNear: { value: 0.1 }, cFar: { value: 1000 } });
    this.down = fsPass(BLOOM_DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.0 }, first: { value: 1 } });
    this.up = fsPass(BLOOM_UP, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up.m.blending = THREE.AdditiveBlending; this.up.m.transparent = true;
    this.final = fsPass(FINAL, {
      tMain: { value: null }, tBloom: { value: null }, tHaze: { value: null },
      exposure: { value: 1 }, bloomStrength: { value: 0.6 }, useBloom: { value: 0 }, useHaze: { value: 0 },
      grain: { value: 0 }, time: { value: 0 }, vignette: { value: 0.35 }, res: { value: new THREE.Vector2() },
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
    for (const k of ['main', 'depth', 'haze']) if (this[k]) this[k].dispose();
    (this.bloomRTs || []).forEach((t) => t.dispose());
    this.bloomRTs = [];
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.r.setSize(w, h, false);
    const pr = this.r.getPixelRatio(), s = this.tier.renderScale;
    const W = Math.max(2, Math.round(w * pr * s)), H = Math.max(2, Math.round(h * pr * s));
    this.dispose();
    const dt = new THREE.DepthTexture(W, H); dt.type = THREE.UnsignedIntType;
    this.main = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture: dt, samples: this.tier.msaa });
    this.main.texture.minFilter = THREE.LinearFilter;
    if (this.tier.softParticles) this.depth = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false });
    if (this.tier.haze) this.haze = new THREE.WebGLRenderTarget(W >> 1, H >> 1, { type: THREE.HalfFloatType, depthBuffer: false });
    let bw = W, bh = H;
    for (let i = 0; i < this.tier.bloom; i++) {
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      const t = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });
      t.texture.minFilter = THREE.LinearFilter; this.bloomRTs.push(t);
    }
    this.final.u.res.value.set(W, H);
    this.size = { W, H };
  }

  /** Vstup pro efekty: textura lineární hloubky (T2+), nebo null. */
  get depthTexture() { return this.depth ? this.depth.texture : null; }

  render(scene, camera, dt, time) {
    const r = this.r, t = this.tier;
    let passes = 0;
    r.setRenderTarget(this.main);
    r.setClearColor(0x000000, 1); r.clear(true, true, true);
    const mask = camera.layers.mask;
    if (this.depth) {
      camera.layers.set(0); r.render(scene, camera); passes++;
      this.depthCopy.u.tDepth.value = this.main.depthTexture;
      this.depthCopy.u.cNear.value = camera.near; this.depthCopy.u.cFar.value = camera.far;
      r.setRenderTarget(this.depth); r.render(this.depthCopy.scene, camera); passes++;
      r.setRenderTarget(this.main);
      const ac = r.autoClear; r.autoClear = false;
      camera.layers.set(LAYER_FX); r.render(scene, camera); passes++;
      r.autoClear = ac;
    } else {
      camera.layers.set(0); camera.layers.enable(LAYER_FX);
      r.render(scene, camera); passes++;
    }
    if (this.haze) {
      r.setRenderTarget(this.haze); r.setClearColor(0x000000, 0); r.clear(true, false, false);
      camera.layers.set(LAYER_HAZE); const ac = r.autoClear; r.autoClear = false; r.render(scene, camera); r.autoClear = ac; passes++;
    }
    camera.layers.mask = mask;
    // bloom
    if (this.bloomRTs.length) {
      let src = this.main.texture, sw = this.size.W, sh = this.size.H;
      this.down.u.threshold.value = 1.2;
      for (let i = 0; i < this.bloomRTs.length; i++) {
        this.down.u.tSrc.value = src; this.down.u.texel.value.set(1 / sw, 1 / sh); this.down.u.first.value = i === 0 ? 1 : 0;
        r.setRenderTarget(this.bloomRTs[i]); r.render(this.down.scene, camera); passes++;
        src = this.bloomRTs[i].texture; sw = this.bloomRTs[i].width; sh = this.bloomRTs[i].height;
      }
      const ac = r.autoClear; r.autoClear = false;
      for (let i = this.bloomRTs.length - 1; i > 0; i--) {
        this.up.u.tSrc.value = this.bloomRTs[i].texture;
        this.up.u.texel.value.set(1 / this.bloomRTs[i].width, 1 / this.bloomRTs[i].height);
        r.setRenderTarget(this.bloomRTs[i - 1]); r.render(this.up.scene, camera); passes++;
      }
      r.autoClear = ac;
    }
    // expozice (oko/kamera se přizpůsobuje s časovou konstantou ~0,6 s nahoru, ~0,25 s dolů – záblesk přepálí)
    if (this.autoExposure) {
      const k = this.targetExposure < this.exposure ? 1 - Math.exp(-dt / 0.25) : 1 - Math.exp(-dt / 0.9);
      this.exposure += (this.targetExposure - this.exposure) * k;
    } else this.exposure = this.targetExposure;
    const f = this.final.u;
    f.tMain.value = this.main.texture;
    f.tBloom.value = this.bloomRTs.length ? this.bloomRTs[0].texture : null;
    f.useBloom.value = this.bloomRTs.length ? 1 : 0;
    f.tHaze.value = this.haze ? this.haze.texture : null; f.useHaze.value = this.haze ? 1 : 0;
    f.exposure.value = this.exposure; f.bloomStrength.value = this.bloomStrength;
    f.grain.value = t.grain ? 0.012 : 0; f.time.value = time;
    r.setRenderTarget(null); r.render(this.final.scene, camera); passes++;
    this.stats.passes = passes;
  }
}
