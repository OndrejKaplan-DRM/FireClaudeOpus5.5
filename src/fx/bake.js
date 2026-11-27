// Bake flipbook atlasu z vlastního objemového pole (D-004).
// Atlas 16 × 8 buněk: sloupce 0–7 = plamenný jazyk (64 snímků smyčky), 8–15 = kouřový chuchvalec (64 snímků).
// Plamen:  R = intenzita (1 − e^(−H)), G = vážená teplota (0..1), B = opacita sazí, A = pokrytí.
// Kouř:    R = optická tloušťka / τmax, G = propustnost ke světlu shora, B = okraj, A = 1.
import * as THREE from 'three';
import { GLSL_COMMON, sharedUniforms } from './shared.js';
import { VOLUME_FIELDS } from './volume.js';

const FS = /* glsl */`
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
${VOLUME_FIELDS}
out vec4 o;
uniform vec2 uCell; // rozměr buňky v px
uniform float uBakeSteps;
float smokeField(vec3 p, float ph){
  vec3 c = p - 0.5;
  float r = length(c) * 2.0;
  vec3 q = p * 1.3 + vec3(uSeed);
  // periodická smyčka: rotace šumového prostoru kolem osy y (bezešvé)
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
      // čas snímku: smyčka délky uLoopT
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
}`;

/**
 * fieldFlameAt: varianta fieldFlame s explicitním časem (pole čte uTime) – obalíme makrem.
 */
const FS_FULL = FS.replace(VOLUME_FIELDS, VOLUME_FIELDS + `
vec3 fieldFlameAt(vec3 p, float t){ return fieldFlame(p); }
`);

export function bakeAtlas(renderer, { res = 128, seed = 3, steps = 48 } = {}) {
  const W = res * 16, H = res * 8;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const src = FS_FULL.replace('uniform float uTime, uSeed, uSteps;', 'uniform float uSeed, uSteps; float uTime;')
    .replace('vec3 fieldFlameAt(vec3 p, float t){ return fieldFlame(p); }', 'vec3 fieldFlameAt(vec3 p, float t){ uTime = t; return fieldFlame(p); }');
  const u = {
    ...sharedUniforms(),
    uCell: { value: new THREE.Vector2(res, res) }, uBakeSteps: { value: steps },
    uScale: { value: new THREE.Vector3(0.5, 1.4, 0.5) }, uSeed: { value: seed }, uSteps: { value: steps },
    uTpeak: { value: 1400 }, uTamb: { value: 500 }, uIntensity: { value: 1 },
    uShape: { value: new THREE.Vector4(0.36, 1.3, 0.0, 0.95) }, uAxis0: { value: 0 }, uShear: { value: 0 }, uRz: { value: 0.33 },
    uTurb: { value: new THREE.Vector4(0.75, 0.4, 1.6, 2.0) }, uPuff: { value: new THREE.Vector2(1.0 / 2.0, 0.35) },
    uSoot: { value: 0.35 }, uBlue: { value: 0 }, uSigma: { value: 0.2 }, uLift: { value: 0 }, uAge: { value: 0 }, uLoopT: { value: 2.0 },
    uRes: { value: new THREE.Vector2(W, H) },
    uFlame2: { value: new THREE.Vector4(1.5, 0, 0.12, 0.75) }, uFlowL: { value: 1.3 }, uDetail: { value: 2 }, uShapeK: { value: 1 }, uPixAng: { value: 0.0005 },
  };
  const m = new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: src, uniforms: u, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh);
  const cam = new THREE.OrthographicCamera();
  const t0 = performance.now();
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prev);
  const ms = performance.now() - t0;
  m.dispose(); g.dispose();
  rt.texture.userData = { res, frames: 64, layout: '16x8: 0-7 flame, 8-15 smoke', bakeMs: ms };
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}

/** Čtení atlasu do canvasu (pro export PNG / galerii). */
export function atlasToCanvas(renderer, rt) {
  const { width: W, height: H } = rt;
  const buf = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  g.putImageData(img, 0, 0);
  return c;
}

/** Náhledová podoba atlasu (obarvená teplotou), aby byl čitelný pro člověka. */
export function atlasPreviewCanvas(raw) {
  const W = raw.width, H = raw.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const src = raw.getContext('2d').getImageData(0, 0, W, H), dst = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, R = src.data[i * 4] / 255, G = src.data[i * 4 + 1] / 255, B = src.data[i * 4 + 2] / 255;
    let r, gg, b;
    if (x < W / 2) { const t = G; r = R * 255; gg = R * (60 + 170 * t); b = R * (10 + 120 * t * t); }
    else { const k = 30 + 200 * G; r = k * R + 18 * (1 - R); gg = k * R + 18 * (1 - R); b = k * R + 22 * (1 - R); }
    dst.data.set([r, gg, b, 255], i * 4);
  }
  g.putImageData(dst, 0, 0);
  return c;
}
