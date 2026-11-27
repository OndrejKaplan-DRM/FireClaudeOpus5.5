// Objemový kouř (T4/T5, iterace 5): raymarching sloupce kouře nad nejdůležitějšími zdroji.
// Sloup = Gaussův profil s poloměrem b(z) = b0 + 0,12·Δz (vlečený kouřový sloup, Heskestad/McCaffrey ★4),
// optická tloušťka podle zředění τ(z) ∝ 1/b (stejný hmotnostní tok sazí, větší průřez) z τ zdroje (combustion.js ★3).
// Turbulence: fbm unášená stoupáním; ohyb větrem jako u plamene (náklon osy ∝ výška^1,5).
// Světlo: jednoduchý rozptyl slunce (Henyey–Greenstein g = 0,4) s vlastním stínem (4 kroky ke slunci), okolní obloha,
// podsvícení ohněm zdola (zastíněné vlastním sloupcem, 3 kroky k ohni). Kouř nesvítí – jen rozptyluje (albedo z paliva).
import * as THREE from 'three';
import { GLSL_COMMON, sharedUniforms } from './shared.js';
import { LAYER_FX, LAYER_VOL } from '../engine/pipeline.js';

const VS = /* glsl */`
out vec3 vWorld;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FS = /* glsl */`
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
// hustota (extinkce σ [1/m]) v bodě objektového prostoru kvádru
float sigmaAt(vec3 p){
  float zm = p.y * uScale.y;                                 // výška nad patou objemu [m]
  float b = uB0 + uDb * zm;                                  // poloměr sloupce [m]
  vec3 w = p * uScale;
  float ax = -0.5 * uScale.x + uB0 * 2.1 + uBend * pow(p.y, 1.5) * uScale.x;  // osa (ohyb po větru, osa x kvádru)
  vec2 d = vec2(w.x - ax, w.z);
  float r2 = dot(d, d) / (b * b);
  if (r2 > 4.0) return 0.0;  // kvádr má poloměr ≥ 2,1 b → okraj kvádru není vidět
  vec3 q = vec3(w.x, w.y - uRise * uTime, w.z) / uEddy + vec3(uSeed * 3.7, 0.0, uSeed * 1.3);
  vec3 wq = q + (vec3(n3(q * 0.11), n3(q * 0.11 + 0.31), n3(q * 0.11 + 0.67)) - 0.5) * 1.6;
  float n = fbm3(wq * 0.17);
  float prof = exp(-r2 * (1.0 + 0.8 * (n - 0.5)));
  float dens = max(prof * (0.35 + 1.3 * smoothstep(0.25, 0.75, n)) - 0.02, 0.0);
  // náběh nad plamenem a útlum u stropu kvádru (žádná viditelná hranice)
  dens *= smoothstep(0.0, 0.1, p.y) * (1.0 - smoothstep(0.7, 1.0, p.y));
  return dens * uSig0 * (uBref * uBref) / (b * b);           // τ ∝ 1/b → σ ∝ 1/b²
}
void main(){
  vec3 rdW = normalize(vWorld - uCamPos);
  vec3 ro = (uInvModel * vec4(uCamPos, 1.0)).xyz, rd = (uInvModel * vec4(rdW, 0.0)).xyz;
  float rl = length(rd); rd /= rl;                           // objektový prostor je jednotkový kvádr → přepočet délek
  vec2 tt = boxHit(ro, rd);
  float t0 = max(tt.x, 0.0), t1 = tt.y;
#ifdef USE_DEPTH
  float sceneZ = texture(tDepth, gl_FragCoord.xy / uDepthRes).r;
  t1 = min(t1, sceneZ * 1.02 * rl / max(dot(rdW, normalize(-vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))), 0.05));
#endif
  if (t1 <= t0) discard;
  float lenW = (t1 - t0) / rl;                               // délka úseku ve světě [m]
  float steps = clamp(ceil(lenW / max(uStepLen, 1e-3)), 8.0, uSteps);
  float dt = (t1 - t0) / steps, dtW = dt / rl;
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uFrame * 0.61803398);
  float t = t0 + dt * j;
  vec3 sunO = (uInvModel * vec4(uSunDir, 0.0)).xyz;          // 1 m ke slunci v objektovém prostoru
  vec3 gpos = (uInvModel * vec4(uGlowPos, 1.0)).xyz;
  float cosT = dot(rdW, uSunDir), g = 0.4;
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5) * 0.5;   // HG normované na ~1 pro izotropní
  vec3 col = vec3(0.0); float trans = 1.0, dW = 0.0;
  for (int i = 0; i < 96; i++) {
    if (float(i) >= steps || trans < 0.02) break;
    vec3 p = ro + rd * t;
    float s = sigmaAt(p);
    if (s > 1e-4) {
      // stín ke slunci (4 kroky, délka ~ poloměr sloupce)
      float sh = 0.0, ls = (uB0 + uDb * p.y * uScale.y) * 0.6;
      for (int k = 1; k <= 4; k++) { vec3 ps = p + sunO * (float(k) * ls); if (ps.y > 1.0) break; sh += sigmaAt(ps) * ls; }
      float sunVis = exp(-sh);
      // podsvícení ohněm: k patě (3 kroky), útlum vzdáleností
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
}`;

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const _vp = new THREE.Vector4();

export class SmokeVolume {
  constructor({ depth = null, steps = 48, mrt = false } = {}) {
    const defines = {};
    if (mrt) defines.VOL_MRT = 1;
    if (depth) defines.USE_DEPTH = 1;
    const u = {
      ...sharedUniforms(),
      uInvModel: { value: new THREE.Matrix4() }, uScale: { value: new THREE.Vector3(1, 1, 1) }, uCamPos: { value: new THREE.Vector3() },
      uAlb: { value: new THREE.Color(0.2, 0.2, 0.2) }, uAmb: { value: new THREE.Color() }, uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() }, uGlowCol: { value: new THREE.Color() }, uGlowPos: { value: new THREE.Vector3(0, 0, 0) },
      uTime: { value: 0 }, uSeed: { value: 0 }, uSteps: { value: steps }, uStepLen: { value: 0.3 }, uFrame: { value: 0 },
      uB0: { value: 0.3 }, uDb: { value: 0.12 }, uSig0: { value: 1 }, uBref: { value: 0.5 }, uEddy: { value: 1 }, uRise: { value: 2 },
      uBend: { value: 0 }, uGlowK: { value: 1 }, uFade: { value: 1 }, uGlowR2: { value: 1 },
      tDepth: { value: depth }, uDepthRes: { value: new THREE.Vector2(1, 1) },
    };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, uniforms: u, defines, glslVersion: THREE.GLSL3,
      transparent: true, depthWrite: false, side: THREE.BackSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(BOX, this.mat);
    this.mesh.layers.set(mrt ? LAYER_VOL : LAYER_FX);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.visible = false;
    this.mesh.onBeforeRender = (r, s, cam) => {
      this.mesh.updateMatrixWorld();
      u.uInvModel.value.copy(this.mesh.matrixWorld).invert();
      u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
      u.uFrame.value = (u.uFrame.value + 1) % 1024;
      if (u.tDepth.value) { const img = u.tDepth.value.image; u.uDepthRes.value.set(img.width, img.height); }
      void _vp;
    };
  }
  get u() { return this.mat.uniforms; }
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
    u.uScale.value.set(Wx, H, Wz); u.uB0.value = b0; u.uDb.value = db; u.uBend.value = lean / Wx;
    u.uStepLen.value = Math.max(0.05, Math.min(Wz, H) / 40);
  }
}
