// Objemový plamen a ohnivá koule: raymarching v objektovém prostoru kvádru.
// Pole hustoty = tvarový profil (kapka / koule) + fbm turbulence unášená vzhůru + pulzace (puffing).
// Emise = Planck(T), absorpce = saze. Stejný shader se používá pro bake flipbooků (D-004).
import * as THREE from 'three';
import { GLSL_COMMON, sharedUniforms } from './shared.js';
import { LAYER_FX } from '../engine/pipeline.js';

const VS = /* glsl */`
out vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const VOLUME_FIELDS = /* glsl */`
uniform vec3 uScale;         // rozměr kvádru ve světě [m]
uniform float uTime, uSeed, uSteps;
uniform float uTpeak, uTamb, uIntensity;
uniform vec4 uShape;         // x: poloměr osy (norm. k šířce), y: zúžení, z: rozšíření paty, w: hrdlo
uniform float uAxis0, uShear; // osa: x = uAxis0 + uShear * y
uniform float uRz;           // poloměr v z (norm.)
uniform vec4 uTurb;          // x: amplituda, y: velikost víru [m], z: rychlost stoupání [m/s], w: zvlnění
uniform vec2 uPuff;          // x: frekvence [Hz], y: amplituda
uniform float uSoot, uBlue, uSigma, uLift;
uniform float uAge;          // ohnivá koule: 0..1 průběh
uniform float uLoopT;        // >0: periodická smyčka (bake)
uniform vec2 uRes;

float noiseLoop(vec3 q, float speed){
  // periodická smyčka: dvě fáze šumu prolnuté – pro bake bezešvé, jinak jen posun
  if (uLoopT <= 0.0) return fbm4(q - vec3(0.0, uTime * speed, 0.0));
  float ph = mod(uTime, uLoopT) / uLoopT;
  float a = fbm4(q - vec3(0.0, ph * uLoopT * speed, 0.0));
  float b = fbm4(q - vec3(0.0, (ph - 1.0) * uLoopT * speed, 0.0) + vec3(0.37, 0.0, 0.11));
  return mix(a, b, smoothstep(0.0, 1.0, ph));
}

// vrací (hustota plamene, teplota, saze)
vec3 fieldFlame(vec3 p){
  float y = p.y;
  vec3 w = p * uScale;                                // metry
  float s = uTurb.y;
  vec3 q = (w + vec3(uSeed * 3.1, 0.0, uSeed * 1.7)) / s * 0.17;
  float n1 = noiseLoop(q, uTurb.z / s * 0.17);
  float n2 = noiseLoop(q * 2.3 + vec3(5.2, 1.3, 2.8), uTurb.z / s * 0.39);
  // vlnění osy (vír) – flame lick
  float wob = (n2 - 0.5) * uTurb.w * y;
  float ax = uAxis0 + uShear * y + wob;
  float az = (n1 - 0.5) * uTurb.w * y * 0.6;
  vec2 d2 = vec2((p.x - ax) / uShape.x, (p.z - az) / uRz);
  float r = length(d2);
  // profil: pata (rozšíření), tělo zužující se ke špičce, hrdlo
  float prof = pow(clamp(1.0 - y, 0.0, 1.0), uShape.y) * (1.0 + uShape.z * exp(-y * 9.0));
  prof *= mix(1.0, clamp(sqrt(y * 6.0 + 0.15), 0.0, 1.0), uShape.w);
  // pulzace: prstence stoupající rychlostí ~ rise
  float puff = sin(6.2832 * (uPuff.x * uTime - y * 1.6)) * uPuff.y;
  float dd = prof * (1.0 + 0.25 * puff * y) - r + (n1 - 0.5) * uTurb.x * (0.35 + 1.4 * y) + (n2 - 0.5) * uTurb.x * 0.45;
  // nedostatek kyslíku: odtržené jazyky (lift)
  dd -= uLift * smoothstep(0.55, 0.8, n2) * 0.4 * y;
  float dens = smoothstep(0.0, 0.22, dd);
  float core = smoothstep(0.1, 0.5, dd);
  // teplota: nejteplejší reakční zóna na plášti a ve střední výšce, chladnější tmavé jádro u paty (pyrolýza)
  float zone = smoothstep(0.0, 0.18, dd) * (1.0 - 0.45 * core * exp(-y * 4.0));
  float T = uTamb + (uTpeak - uTamb) * zone * (1.0 - 0.55 * y * y) * (0.85 + 0.3 * n2);
  // saze: nad špičkou, kde plamen dohasíná
  float soot = uSoot * smoothstep(0.35, 0.95, y) * smoothstep(-0.12, 0.08, dd) * (1.0 - core * 0.5);
  return vec3(dens, T, soot);
}

vec3 fieldBall(vec3 p){
  // koule ve středu kvádru; pole „květák" z Worleyho šumu, chladne a černá s věkem
  vec3 c = p - vec3(0.0, 0.5, 0.0);
  float r = length(c) * 2.0;                          // 0..1 = poloměr
  vec3 w = p * uScale;
  vec3 q = w / uTurb.y * 0.17 + vec3(uSeed);
  float rise = uTime * uTurb.z / uTurb.y * 0.17;
  float b1 = w3(q * 0.9 - vec3(0.0, rise, 0.0));
  float b2 = w3(q * 2.1 + vec3(1.7, -rise * 1.5, 0.4));
  float n = fbm3(q * 1.7 + vec3(0.0, -rise, 0.0));
  float shell = 0.78 + 0.22 * uAge;
  float dd = shell - r + (b1 - 0.55) * 0.55 + (b2 - 0.5) * 0.25 + (n - 0.5) * 0.2;
  float dens = smoothstep(0.0, 0.15, dd);
  float hot = 1.0 - smoothstep(0.0, 0.9, uAge + r * 0.35 - (b1 - 0.5) * 0.6);
  float T = uTamb + (uTpeak - uTamb) * hot * dens;
  float soot = uSoot * dens * smoothstep(0.15, 0.7, uAge + (0.6 - b1) * 0.5 + r * 0.2);
  return vec3(dens, T, soot);
}

`;

export const VOLUME_FS = /* glsl */`
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
  // převod lineární hloubky (podél osy kamery) na vzdálenost podél paprsku – přibližně přes cos úhlu
  t1 = min(t1, sceneZ * 1.02 / max(dot(rdW, normalize(-vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))), 0.05));
#endif
  if (t1 <= t0) discard;
  float steps = uSteps;
  float dt = (t1 - t0) / steps;
  float j = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0);
  float t = t0 + dt * j;
  vec3 col = vec3(0.0); float trans = 1.0;
  float sigmaW = uSigma; // extinkce plamenného plynu [1/m] (malá)
  for (int i = 0; i < 128; i++) {
    if (float(i) >= steps || trans < 0.02) break;
    vec3 p = ro + rd * t;
#ifdef MODE_BALL
    vec3 f = fieldBall(p);
#else
    vec3 f = fieldFlame(p);
#endif
    if (f.x > 0.002 || f.z > 0.002) {
      vec3 em = sootColor(f.y) * f.x;
#ifndef MODE_BALL
      float edge = smoothstep(0.0, 0.25, f.x) * (1.0 - smoothstep(0.3, 0.9, f.x));
      em += vec3(0.08, 0.16, 1.0) * uBlue * exp(-p.y * 14.0) * edge * 0.6;
#endif
      float ext = (sigmaW * f.x + f.z * 6.0);
      float a = exp(-ext * dt);
      col += trans * em * uIntensity * dt * (ext > 1e-4 ? (1.0 - a) / (ext * dt) : 1.0);
      trans *= a;
    }
    t += dt;
  }
  fragColor = vec4(col, 1.0 - trans);
}`;

export function createVolumeMaterial({ ball = false, depth = null, steps = 48 } = {}) {
  const defines = {};
  if (ball) defines.MODE_BALL = 1;
  if (depth) defines.USE_DEPTH = 1;
  const u = {
    ...sharedUniforms(),
    uInvModel: { value: new THREE.Matrix4() }, uScale: { value: new THREE.Vector3(1, 1, 1) },
    uTime: { value: 0 }, uSeed: { value: 0 }, uSteps: { value: steps },
    uTpeak: { value: 1300 }, uTamb: { value: 600 }, uIntensity: { value: 1 },
    uShape: { value: new THREE.Vector4(0.45, 0.8, 0.3, 0.2) }, uAxis0: { value: 0 }, uShear: { value: 0 }, uRz: { value: 0.45 },
    uTurb: { value: new THREE.Vector4(0.45, 0.4, 2.0, 0.15) }, uPuff: { value: new THREE.Vector2(1.5, 0.5) },
    uSoot: { value: 0 }, uBlue: { value: 0 }, uSigma: { value: 0.3 }, uLift: { value: 0 }, uAge: { value: 0 }, uLoopT: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) }, uCamPos: { value: new THREE.Vector3() },
    tDepth: { value: depth }, uDepthRes: { value: new THREE.Vector2(1, 1) },
  };
  return new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: VOLUME_FS, uniforms: u, defines, glslVersion: THREE.GLSL3,
    transparent: true, depthWrite: false, side: THREE.BackSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

/** Jeden objemový plamen ve scéně. Parametry nastavuje FireSource. */
export class FlameVolume {
  constructor({ ball = false, depth = null, steps = 48 } = {}) {
    this.mat = createVolumeMaterial({ ball, depth, steps });
    this.mesh = new THREE.Mesh(BOX, this.mat);
    this.mesh.layers.set(LAYER_FX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.ball = ball;
    this.mesh.onBeforeRender = (r, s, cam) => {
      const u = this.mat.uniforms;
      this.mesh.updateMatrixWorld();
      u.uInvModel.value.copy(this.mesh.matrixWorld).invert();
      u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
      if (u.tDepth.value) { const img = u.tDepth.value.image; u.uDepthRes.value.set(img.width, img.height); }
    };
  }
  get u() { return this.mat.uniforms; }
  /**
   * Umístění plamene: pata v `pos`, výška H, poloměr R, náklon theta ve směru windDir (rad, kam fouká).
   */
  place(pos, H, R, theta = 0, windDir = 0, drag = 1, Rz = null) {
    const tanT = Math.tan(Math.min(theta, 1.35));
    const Hv = H * Math.cos(Math.min(theta, 1.35)) * 1.15 + R * 0.3;
    const lean = tanT * Hv;
    const Wx = 2 * R * drag + lean + R * 0.6, Wz = 2 * (Rz ?? R) * 1.3;
    this.mesh.position.copy(pos);
    this.mesh.rotation.set(0, -windDir, 0);
    this.mesh.scale.set(Wx, Hv * 1.12, Wz);
    const u = this.u;
    u.uScale.value.set(Wx, Hv * 1.12, Wz);
    u.uShape.value.x = (R * drag) / Wx;
    u.uRz.value = (Rz ?? R) / Wz;
    u.uAxis0.value = -0.5 + (R * drag + R * 0.3) / Wx;
    u.uShear.value = lean / Wx;
  }
}
