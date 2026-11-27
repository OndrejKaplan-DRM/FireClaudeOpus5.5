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
uniform vec4 uFlame2;        // x: κ svítivých sazí při 1 500 K [1/m] (≈ 2,7·fv[ppm]), y: plášť kouře velkých požárů 0..1, z: ostrost okraje, w: ohyb pole
uniform float uFlowL;        // délka plamene [m] pro advekci s urychlením u ∝ √z
uniform float uDetail;       // 0..2 počet jemných oktáv (stupně kvality)
uniform float uShapeK;       // tvar obálky: 1 kužel, ~2 sloup velké louže
uniform float uPixAng;       // úhel jednoho pixelu [rad] (stopa vzorku = t·uPixAng)

// Advekce s urychlením (McCaffrey: v souvislé zóně u ∝ √z): souřadnice šumu = čas letu od paty.
// Útvar ve výšce z se pohybuje rychlostí U·√(z/L) a natahuje se svisle – jazyky „vystřelují“ vzhůru.
// z0 = 0,15 L: virtuální počátek – bez něj se u paty šum nekonečně stlačí do vodorovných „plástů“ (úl).
float tof(float zm){ float L = max(uFlowL, 0.01), z0 = 0.15 * L; return 2.0 * (sqrt((max(zm, 0.0) + z0) * L) - sqrt(z0 * L)); }
vec3 flowQ(vec3 w, float tt){
  float s = uTurb.y;
  return vec3(w.x / s, (uTurb.z * tt - tof(w.y)) / s, w.z / s) * 0.17 + vec3(uSeed * 3.1, 0.0, uSeed * 1.7);
}
// Antialiasovaný šum: oktáva menší než stopa vzorku (pixel ve vzdálenosti t, nebo krok paprsku) se plynule
// nahradí střední hodnotou → žádná „srst“ z podvzorkovaných oktáv, a zároveň levněji (méně čtení textury).
float gFpq = 0.0; // stopa vzorku v jednotkách q (nastavuje main před voláním pole)
float octv(vec3 q, float amp, float cell){
  float wk = 1.0 - smoothstep(0.35, 1.0, gFpq * cell);
  return amp * (wk > 0.001 ? mix(0.5, n3(q), wk) : 0.5);
}
float fbmD(vec3 q, float s){ // fbm s počtem oktáv podle stupně; s = měřítko frekvence vůči základu
  float c = 16.0 * s;
  float v = octv(q, 0.5, c) + octv(q * 2.03 + 0.17, 0.25, c * 2.03) + octv(q * 4.07 + 0.41, 0.125, c * 4.07), w = 0.875;
  if (uDetail > 0.5) { v += octv(q * 8.13 + 0.73, 0.0625, c * 8.13); w += 0.0625; }
  if (uDetail > 1.5) { v += octv(q * 16.3 + 0.29, 0.03125, c * 16.3); w += 0.03125; }
  return v / w;
}
// ohnuté pole (domain warp) – skládá plamen do tenkých zvlněných plátů
vec4 flameNoise(vec3 w, float tt){
  vec3 q = flowQ(w, tt);
  vec3 wv = vec3(n3(q * 0.5 + 0.11), n3(q * 0.5 + 0.43), n3(q * 0.5 + 0.77)) - 0.5;
  vec3 wq = q + wv * uFlame2.w * 1.6;
  float n1 = fbmD(wq, 1.0);
  float n2 = fbmD(wq * 2.2 + vec3(5.2, 1.3, 2.8), 2.2);
  float n4 = n3(wq * 0.7 + vec3(9.1, 2.0, 4.4) - vec3(0.0, uTime * 0.2, 0.0)); // světelné skvrny pláště
  return vec4(n1, n2, n4, wv.x);
}
vec4 flameNoiseLoop(vec3 w){
  if (uLoopT <= 0.0) return flameNoise(w, uTime);
  float ph = mod(uTime, uLoopT) / uLoopT;
  vec4 a = flameNoise(w, ph * uLoopT);
  vec4 b = flameNoise(w + vec3(0.37, 0.0, 0.11) * uTurb.y * 6.0, (ph - 1.0) * uLoopT);
  return mix(a, b, smoothstep(0.0, 1.0, ph));
}

// vrací (svítivá hustota 0..1, teplota [K], saze bez emise 0..1)
vec3 fieldFlame(vec3 p){
  float y = p.y;
  // obálka bez šumu → přeskočení prázdna (levné, většina vzorků mimo plamen)
  // velké louže (L/D < 3): sloup široký skoro do půli výšky, pak se rozpadá; štíhlé plameny: kužel (uShapeK = 1)
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
  // vlnění osy (jazyk) – velké měřítko z ohybového pole
  float wob = (n2 - 0.5) * uTurb.w * y + N.w * uTurb.w * y * 0.6;
  float ax = axBase + wob;
  float az = (n1 - 0.5) * uTurb.w * y * 0.6;
  vec2 d2 = vec2((p.x - ax) / uShape.x, (p.z - az) / uRz);
  float r = length(d2);
  // pulzace: toroidní víry stoupající rychlostí ~ U (Cetegen & Ahmed)
  float puff = sin(6.2832 * (uPuff.x * uTime - tof(w.y) / max(uFlowL, 0.01) * 0.8)) * uPuff.y;
  float dd = prof * (1.0 + 0.25 * puff * y) - r + (n1 - 0.5) * uTurb.x * (0.35 + 1.4 * y) + (n2 - 0.5) * uTurb.x * 0.45;
  // přerušovaná zóna (McCaffrey η 0,08–0,2): odtrhávání plaménků
  dd -= smoothstep(0.38, 0.95, y) * smoothstep(0.46, 0.66, n2) * 0.34;
  // velké požáry: přerušovaná zóna začíná níž (η ≈ 0,4 L) a trhá sloup na samostatné jazyky s tmavými mezerami
  dd -= (uShapeK - 1.0) * smoothstep(0.28, 0.85, y) * smoothstep(0.44, 0.6, n1 + 0.3 * (n2 - 0.5)) * 0.45;
  // nedostatek kyslíku: odtržené líné jazyky
  dd -= uLift * smoothstep(0.55, 0.8, n2) * 0.4 * y;
  float edge = uFlame2.z;
  float dens = smoothstep(0.0, edge, dd);
  float core = smoothstep(0.1, 0.5, dd);
  // zatížení sazemi kolísá (pruhy hustých a řídkých sazí) → průhledné mezery mezi jazyky
  float big = clamp(uShapeK - 1.0, 0.0, 1.0);
  dens *= mix(0.35 + 0.9 * smoothstep(0.3, 0.7, n1 + 0.15 * (n2 - 0.5)), smoothstep(0.4, 0.62, n1 + 0.2 * (n2 - 0.5)), big * 0.7);
  // teplota: reakční zóna na plášti; horké proužky; u paty velkých požárů chladné tmavé jádro par paliva
  float zone = smoothstep(0.0, 0.16, dd) * (1.0 - 0.5 * core * exp(-y * 4.0) * (0.4 + uFlame2.y));
  float hotStreak = smoothstep(0.38, 0.78, n2);
  float T = uTamb + (uTpeak - uTamb) * pow(zone, 0.8) * mix(0.62 - 0.17 * big, 1.04, hotStreak) * (1.0 - 0.42 * pow(y, 1.5));
  // velké sazové požáry (Steinhaus, Takahashi): vnější vrstva sazí, světlo prorážejí jen „luminous zones“
  float shell = uFlame2.y * (1.0 - core) * smoothstep(0.15, 0.55, y + 0.25 * n1);
  float lumPatch = smoothstep(0.52, 0.64, n4);
  dens *= mix(1.0, 0.15 + 0.85 * lumPatch, shell);
  // saze: nad špičkou dohasínající plamen a plášť
  float soot = uSoot * smoothstep(0.35, 0.95, y) * smoothstep(-0.12, 0.08, dd) * (1.0 - core * 0.5);
  soot += shell * (1.0 - lumPatch) * smoothstep(-0.2, 0.05, dd) * 1.2;
  // chladné sazové kapsy uvnitř velkých plamenů (tmavé skvrny ve 2. polovině výšky)
  soot += big * uSoot * smoothstep(0.25, 0.6, y) * smoothstep(0.6, 0.8, 1.0 - n2) * smoothstep(0.0, 0.1, dd) * 0.8;
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
  float hot = 1.0 - smoothstep(0.05, 1.05, uAge * 0.85 + r * 0.3 - (b1 - 0.5) * 0.6);
  float T = uTamb + (uTpeak - uTamb) * hot * dens;
  float soot = uSoot * dens * (1.0 - hot) * (1.0 - hot) * smoothstep(0.25, 0.8, uAge + (0.6 - b1) * 0.4);
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
  // převod lineární hloubky (podél osy kamery) na vzdálenost podél paprsku – přibližně přes cos úhlu
  t1 = min(t1, sceneZ * 1.02 / max(dot(rdW, normalize(-vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))), 0.05));
#endif
  if (t1 <= t0) discard;
  // délka kroku: cíl uStepLen [m], strop uSteps; prokládaný gradientní šum + zlatý řez v čase (méně pruhů)
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
      // emise–absorpce v lokální rovnováze: κe svítivé saze (zdroj = Planck), κs chladné saze (jen pohlcují)
      float ke = uFlame2.x * f.x * clamp(f.y / 1500.0, 0.3, 1.4);
      float ks = f.z * uSigmaSoot;
      float k = ke + ks + 1e-5;
      float a = exp(-k * dt);
      col += trans * (1.0 - a) * (ke / k) * sootColor(f.y) * uIntensity;
      // modrá zóna (CH*, C2*): jen u paty a jen tam, kde nesvítí saze (jinak modrá + oranžová = růžová)
      float edgeB = smoothstep(0.0, 0.25, f.x) * (1.0 - smoothstep(0.3, 0.9, f.x)) * (1.0 - smoothstep(0.08, 0.3, ke * dt));
      col += trans * vec3(0.04, 0.12, 1.0) * uBlue * exp(-p.y * 30.0) * edgeB * uIntensity * uPreExp * 0.22 * (dt / max(uFlowL * 0.25, 1e-3));
      trans *= a;
    }
#endif
    t += dt;
  }
  fragColor = fxOut(vec4(col, 1.0 - trans));
}`;

const _vp = new THREE.Vector4();
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
    uRes: { value: new THREE.Vector2(1, 1) }, uCamPos: { value: new THREE.Vector3() }, uPixAng: { value: 0.0015 }, uShapeK: { value: 1 },
    tDepth: { value: depth }, uDepthRes: { value: new THREE.Vector2(1, 1) },
    uFlame2: { value: new THREE.Vector4(1.35, 0, 0.12, 0.6) }, uFlowL: { value: 1 }, uDetail: { value: 1 },
    uStepLen: { value: 0.05 }, uFrame: { value: 0 }, uSigmaSoot: { value: 2.5 },
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
      if (cam.isPerspectiveCamera) { const vp = r.getCurrentViewport(_vp); u.uPixAng.value = (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(vp.w, 1); }
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
    const Wx = R * (1 + drag) + lean + R * 0.6 + R * 0.3 * (drag - 1), Wz = 2 * (Rz ?? R) * 1.3;
    // kvádr začíná 1,3 R proti větru od středu zdroje → posun středu po větru (prodloužení paty jen po větru)
    const shift = Wx / 2 - 1.3 * R;
    this.mesh.position.set(pos.x + Math.cos(windDir) * shift, pos.y, pos.z + Math.sin(windDir) * shift);
    this.mesh.rotation.set(0, -windDir, 0);
    this.mesh.scale.set(Wx, Hv * 1.12, Wz);
    const u = this.u;
    u.uScale.value.set(Wx, Hv * 1.12, Wz);
    u.uShape.value.x = (R * (1 + drag) * 0.5) / Wx;
    u.uRz.value = (Rz ?? R) / Wz;
    u.uAxis0.value = -0.5 + (0.3 * R + R * (1 + drag) * 0.5) / Wx;
    u.uShear.value = lean / Wx;
  }
}
