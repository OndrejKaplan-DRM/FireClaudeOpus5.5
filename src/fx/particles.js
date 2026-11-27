// Částicové systémy simulované na CPU, kreslené instancovanými billboardy (1 draw call na systém).
//  BillboardSystem: plamenné jazyky + kouř v JEDNOM seřazeném systému (správné pořadí kouř/plamen, premultiplied alfa).
//  SparkSystem: jiskry a žhavé uhlíky (aditivní, protažené ve směru pohybu, chladnutí Planck).
//  HazeSystem: horký vzduch → posun obrazu (heat haze), kreslí se do zvláštního bufferu.
import * as THREE from 'three';
import { GLSL_COMMON, sharedUniforms } from './shared.js';
import { LAYER_FX, LAYER_HAZE } from '../engine/pipeline.js';

// rozložení jedné částice v CPU poli
const F = {
  px: 0, py: 1, pz: 2, vx: 3, vy: 4, vz: 5, age: 6, life: 7, s0: 8, s1: 9, rot: 10, rotV: 11, seed: 12,
  type: 13, T0: 14, dT: 15, tau0: 16, drag: 17, buoy: 18, cr: 19, cg: 20, cb: 21, ox: 22, oz: 23, pq: 24, pz0: 25, grav: 26, glowR: 27, glowG: 28, glowB: 29, stretch: 30, extra: 31,
};
export const STRIDE = 32;
export const PTYPE = { FLAME: 0, SMOKE: 1, EMBERGLOW: 2, FIREPUFF: 3 };

const QUAD = (() => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

/** Sdílený model vzduchu: vítr (log profil + poryvy) + vztlakový sloupec zdroje + strhávání + turbulence. */
export class AirField {
  constructor() {
    this.U10 = 0; this.dir = 0; this.gust = 0; this.turb = 0; this.time = 0; this.z0 = 0.03;
    this.gustNow = 0; this.extraUp = null;
  }
  windAt(z) {
    if (this.U10 <= 0) return 0;
    const zz = Math.max(z, this.z0 * 1.5);
    return this.U10 * (1 + this.gustNow) * Math.log(zz / this.z0) / Math.log(10 / this.z0);
  }
}

class BaseSystem {
  constructor(capacity) {
    this.cap = capacity; this.n = 0;
    this.d = new Float32Array(capacity * STRIDE);
    this.spawned = 0; this.dropped = 0;
  }
  alloc() {
    if (this.n >= this.cap) { this.dropped++; return -1; }
    this.spawned++;
    const i = this.n++;
    this.d.fill(0, i * STRIDE, i * STRIDE + STRIDE);
    return i * STRIDE;
  }
  kill(i) { // swap-remove
    const last = --this.n;
    if (i !== last) this.d.copyWithin(i * STRIDE, last * STRIDE, last * STRIDE + STRIDE);
  }
  clear() { this.n = 0; }
  /** Integrace pohybu: odpor vůči proudění vzduchu + gravitace + zbytkový vztlak. */
  integrate(dt, air) {
    const d = this.d, cw = Math.cos(air.dir), sw = Math.sin(air.dir), t = air.time;
    for (let i = 0; i < this.n; i++) {
      const o = i * STRIDE;
      d[o + F.age] += dt;
      if (d[o + F.age] >= d[o + F.life]) { this.kill(i); i--; continue; }
      const x = d[o + F.px], y = d[o + F.py], z = d[o + F.pz];
      // vzduch
      const U = air.windAt(y);
      let ax = U * cw, az = U * sw, ay = 0;
      const pq = d[o + F.pq];
      if (pq > 0) {
        // osa oblaku unášená větrem
        const dzp = Math.max(y - d[o + F.pz0], 0.05);
        // McCaffrey (1979): u = Q^(1/5)·{6,84 η^½ | 1,93 | 1,12 η^(−1/3)} pro η = z/Q^(2/5) <0,08 | <0,2 | výš  ★★★★
        const Qt = pq / 0.7, q5 = Math.pow(Qt, 0.2), eta = dzp / (q5 * q5);
        const u0 = q5 * (eta < 0.08 ? 6.84 * Math.sqrt(eta) : eta < 0.2 ? 1.93 : 1.12 * Math.pow(eta, -1 / 3));
        const b = Math.max(0.156 * dzp, d[o + F.glowR] * 0.85) + 0.02; // u paty široký jako zdroj
        const drift = (U * dzp) / Math.max(u0, 0.4) * 0.6;
        const rx = x - (d[o + F.ox] + drift * cw), rz = z - (d[o + F.oz] + drift * sw);
        const r2 = (rx * rx + rz * rz) / (b * b);
        const g = Math.exp(-r2);
        ay += u0 * g;
        // strhávání (entrainment) – přítok k ose, α ≈ 0,1
        const rr = Math.sqrt(r2) + 1e-3, inflow = 0.12 * u0 * Math.min(1, 1 / rr) * (1 - g);
        ax -= (rx / (rr * b)) * inflow; az -= (rz / (rr * b)) * inflow;
      }
      if (air.extraUp) { const e = air.extraUp(x, y, z); ax += e[0]; ay += e[1]; az += e[2]; }
      // turbulence (levný pseudo-curl, fáze podle částice)
      const s = d[o + F.seed], k = air.turb * (0.4 + U * 0.25) + (pq > 0 ? 0.25 : 0.05);
      ax += k * Math.sin(t * 1.7 + s * 13.1 + y * 1.3);
      ay += k * 0.6 * Math.sin(t * 2.3 + s * 7.7 + x * 1.1);
      az += k * Math.cos(t * 1.9 + s * 5.3 + y * 0.9);
      const tau = d[o + F.drag];
      const kk = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
      d[o + F.vx] += (ax - d[o + F.vx]) * kk;
      d[o + F.vy] += (ay - d[o + F.vy]) * kk + (d[o + F.buoy] * Math.exp(-d[o + F.age] * 0.8) - 9.81 * d[o + F.grav]) * dt;
      d[o + F.vz] += (az - d[o + F.vz]) * kk;
      d[o + F.px] = x + d[o + F.vx] * dt; d[o + F.py] = y + d[o + F.vy] * dt; d[o + F.pz] = z + d[o + F.vz] * dt;
      d[o + F.rot] += d[o + F.rotV] * dt;
      if (d[o + F.py] < 0.005 && d[o + F.grav] > 0) { // odraz / klouzání po zemi
        d[o + F.py] = 0.005; d[o + F.vy] *= -0.3; d[o + F.vx] *= 0.6; d[o + F.vz] *= 0.6;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------
const BB_VS = /* glsl */`
in vec4 iPS;   // pos, size
in vec4 iP;    // age01, rot, frame, type
in vec4 iC;    // rgb (kouř: albedo; plamen: tint), opacity / tau
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
    // plamen: osa podél rychlosti v rovině obrazovky (jazyk v proudu)
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
  // flipbook: plamen vlevo, kouř vpravo (16 × 8 snímků)
  float fr = mod(floor(iP.z), uFrames);
  float col = mod(fr, 8.0), row = floor(fr / 8.0);
  float sheet = iP.w < 0.5 ? 0.0 : 8.0;
  vec2 quv = clamp(position.xy + 0.5, 0.0, 1.0);
  vUv = vec2((col + sheet + quv.x) / 16.0, (row + quv.y) / 8.0);
  vP = iP; vC = iC; vG = iG;
}`;

const BB_FS = /* glsl */`
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
    // plamen: R = intenzita, G = teplotní váha, B = saze, A = pokrytí
    float T = (vG.w > 0.0 ? vG.w : 1250.0) * (0.8 + 0.25 * clamp(a.g * 1.25, 0.0, 1.0));
    float life = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
    vec3 em = sootColor(T) * a.r * uFlameLum * vC.a * life * vC.rgb;
    float al = a.b * a.a * life * 0.5 * vC.a;
    fragColor = vec4(em * soft, al * soft);
  } else if (vP.w > 2.5) {
    // ohnivý chuchvalec (ohnivá koule, horní část velkých požárů): maska z kouřového listu, emise Planck
    float T = vG.w * (0.82 + 0.3 * a.g) ;
    float life = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.6, 1.0, age));
    float d = clamp(a.r * 1.6, 0.0, 1.0);
    vec3 em = sootColor(T) * d * uFlameLum * vC.a * life;
    float al = (1.0 - exp(-a.r * vC.r * 3.0)) * life * soft;
    fragColor = vec4(em * soft, al);
  } else {
    // kouř: R = hustota, G = propustnost ke světlu shora, B = okraj
    float tau = vC.a;
    float al = (1.0 - exp(-a.r * tau * 2.2)) * a.a;
    al *= (1.0 - smoothstep(0.8, 1.0, age)) * soft;
    vec3 alb = vC.rgb;
    vec3 lit = (uAmb * (0.55 + 0.45 * a.g) + uSunCol * a.g * (0.6 + 0.4 * a.b)) * uPreExp;
    // podsvícení ohněm zespodu (spočítáno na CPU, rozptyl ∝ albedo)
    vec3 glow = vG.rgb * (0.35 + 0.65 * (1.0 - a.g)) * uPreExp;
    vec3 c = alb * (lit + glow);
    if (vP.w > 1.5) c += bbColor(900.0 + 250.0 * (1.0 - age)) * uFlameLum * 0.012 * (1.0 - age) * (1.0 - age); // žhnoucí kouř u paty
    fragColor = vec4(c * al, al);
  }
}`;

export class BillboardSystem extends BaseSystem {
  constructor(capacity, atlas, { depth = null, sort = true } = {}) {
    super(capacity);
    this.sort = sort;
    const g = QUAD.clone();
    g.instanceCount = 0;
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPS = mk(4); this.aP = mk(4); this.aC = mk(4); this.aG = mk(4); this.aV = mk(3);
    g.setAttribute('iPS', this.aPS); g.setAttribute('iP', this.aP); g.setAttribute('iC', this.aC); g.setAttribute('iG', this.aG); g.setAttribute('iV', this.aV);
    this.geo = g;
    const defines = depth ? { SOFT: 1 } : {};
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BB_VS, fragmentShader: BB_FS, glslVersion: THREE.GLSL3, defines,
      uniforms: {
        ...sharedUniforms(), tAtlas: { value: atlas }, uFrames: { value: 64 },
        uAmb: { value: new THREE.Color(0.05, 0.05, 0.06) }, uSunCol: { value: new THREE.Color(0, 0, 0) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uFlameLum: { value: 1 }, uSoft: { value: 0.6 }, tDepth: { value: depth }, uDepthRes: { value: new THREE.Vector2(1, 1) },
      },
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.layers.set(LAYER_FX); this.mesh.renderOrder = 5;
    this.order = new Uint32Array(capacity); this.keys = new Float32Array(capacity);
    this.mesh.onBeforeRender = () => { const t = this.mat.uniforms.tDepth.value; if (t) this.mat.uniforms.uDepthRes.value.set(t.image.width, t.image.height); };
    this.lights = []; this.pre = 1;
  }

  spawnFlame({ x, y, z, vx = 0, vy = 0, vz = 0, life, s0, s1, T, lum = 1, tint = [1, 1, 1], ox, oz, pq = 0, pz0 = 0, drag = 0.15, buoy = 0, stretch = 1, seed, R0 = 0 }) {
    const o = this.alloc(); if (o < 0) return;
    const d = this.d;
    d[o + F.px] = x; d[o + F.py] = y; d[o + F.pz] = z; d[o + F.vx] = vx; d[o + F.vy] = vy; d[o + F.vz] = vz;
    d[o + F.life] = life; d[o + F.s0] = s0; d[o + F.s1] = s1; d[o + F.type] = PTYPE.FLAME; d[o + F.T0] = T;
    d[o + F.seed] = seed ?? Math.random(); d[o + F.tau0] = lum; d[o + F.cr] = tint[0]; d[o + F.cg] = tint[1]; d[o + F.cb] = tint[2];
    d[o + F.ox] = ox ?? x; d[o + F.oz] = oz ?? z; d[o + F.pq] = pq; d[o + F.pz0] = pz0; d[o + F.drag] = drag; d[o + F.buoy] = buoy;
    d[o + F.stretch] = stretch; d[o + F.extra] = Math.floor(d[o + F.seed] * 64); d[o + F.glowR] = R0;
  }

  spawnFirePuff({ x, y, z, vx = 0, vy = 0, vz = 0, life, s0, s1, T, lum = 1, soot = 0.3, drag = 0.3, buoy = 0, ox, oz, pq = 0, pz0 = 0, seed, R0 = 0 }) {
    const o = this.alloc(); if (o < 0) return;
    const d = this.d;
    d[o + F.px] = x; d[o + F.py] = y; d[o + F.pz] = z; d[o + F.vx] = vx; d[o + F.vy] = vy; d[o + F.vz] = vz;
    d[o + F.life] = life; d[o + F.s0] = s0; d[o + F.s1] = s1; d[o + F.type] = PTYPE.FIREPUFF; d[o + F.T0] = T;
    d[o + F.seed] = seed ?? Math.random(); d[o + F.tau0] = lum; d[o + F.cr] = soot;
    d[o + F.rot] = d[o + F.seed] * 43.98; d[o + F.rotV] = (((d[o + F.seed] * 7919) % 1) - 0.5) * 1.2;
    d[o + F.ox] = ox ?? x; d[o + F.oz] = oz ?? z; d[o + F.pq] = pq; d[o + F.pz0] = pz0; d[o + F.drag] = drag; d[o + F.buoy] = buoy;
    d[o + F.extra] = Math.floor(((d[o + F.seed] * 104729) % 1) * 64); d[o + F.glowR] = R0;
  }

  spawnSmoke({ x, y, z, vx = 0, vy = 0, vz = 0, life, s0, s1, tau, albedo, ox, oz, pq = 0, pz0 = 0, drag = 0.4, buoy = 0, glowing = false, seed, R0 = 0 }) {
    const o = this.alloc(); if (o < 0) return;
    const d = this.d;
    d[o + F.px] = x; d[o + F.py] = y; d[o + F.pz] = z; d[o + F.vx] = vx; d[o + F.vy] = vy; d[o + F.vz] = vz;
    d[o + F.life] = life; d[o + F.s0] = s0; d[o + F.s1] = s1; d[o + F.type] = glowing ? PTYPE.EMBERGLOW : PTYPE.SMOKE;
    d[o + F.tau0] = tau; d[o + F.cr] = albedo[0]; d[o + F.cg] = albedo[1]; d[o + F.cb] = albedo[2];
    d[o + F.seed] = seed ?? Math.random(); d[o + F.rot] = d[o + F.seed] * 43.98; d[o + F.rotV] = (((d[o + F.seed] * 7919) % 1) - 0.5) * 0.6;
    d[o + F.ox] = ox ?? x; d[o + F.oz] = oz ?? z; d[o + F.pq] = pq; d[o + F.pz0] = pz0; d[o + F.drag] = drag; d[o + F.buoy] = buoy;
    d[o + F.extra] = Math.floor(((d[o + F.seed] * 104729) % 1) * 64); d[o + F.glowR] = R0;
  }

  update(dt, air, camera, lights) {
    this.integrate(dt, air);
    const d = this.d, n = this.n;
    // řazení odzadu dopředu: klíč = 12 bitů hloubky | 20 bitů indexu → nativní řazení Uint32Array (rychlé i pro 30 k částic)
    const cp = camera.position, fw = this._fw || (this._fw = new THREE.Vector3()); camera.getWorldDirection(fw);
    let dmin = Infinity, dmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const k = (d[o] - cp.x) * fw.x + (d[o + 1] - cp.y) * fw.y + (d[o + 2] - cp.z) * fw.z;
      this.keys[i] = k; if (k < dmin) dmin = k; if (k > dmax) dmax = k;
    }
    if (this.sort && n > 1) {
      const sk = this.sortKeys || (this.sortKeys = new Uint32Array(this.cap)), inv = 4095 / Math.max(dmax - dmin, 1e-6);
      for (let i = 0; i < n; i++) sk[i] = (((4095 - ((this.keys[i] - dmin) * inv)) | 0) << 20 | i) >>> 0;
      const v = sk.subarray(0, n); v.sort();
      for (let i = 0; i < n; i++) this.order[i] = v[i] & 0xfffff;
    } else for (let i = 0; i < n; i++) this.order[i] = i;
    const PS = this.aPS.array, P = this.aP.array, C = this.aC.array, G = this.aG.array, V = this.aV.array;
    for (let j = 0; j < n; j++) {
      const i = this.order[j], o = i * STRIDE;
      const age = d[o + F.age], life = d[o + F.life], a01 = age / life;
      const type = d[o + F.type];
      const grow = 1 - Math.exp(-age / Math.max(life * 0.35, 1e-3));
      let s = d[o + F.s0] + (d[o + F.s1] - d[o + F.s0]) * grow;
      PS[j * 4] = d[o]; PS[j * 4 + 1] = d[o + 1]; PS[j * 4 + 2] = d[o + 2]; PS[j * 4 + 3] = s;
      const frame = d[o + F.extra] + age * (type === PTYPE.FLAME ? 34 : type === PTYPE.FIREPUFF ? 20 : 9) * (0.8 + d[o + F.seed] * 0.4);
      P[j * 4] = a01; P[j * 4 + 1] = d[o + F.rot]; P[j * 4 + 2] = frame; P[j * 4 + 3] = type;
      V[j * 3] = d[o + F.vx]; V[j * 3 + 1] = d[o + F.vy]; V[j * 3 + 2] = d[o + F.vz];
      if (type === PTYPE.FLAME) {
        C[j * 4] = d[o + F.cr]; C[j * 4 + 1] = d[o + F.cg]; C[j * 4 + 2] = d[o + F.cb]; C[j * 4 + 3] = d[o + F.tau0];
        G[j * 4] = 0; G[j * 4 + 1] = 0; G[j * 4 + 2] = 0;
        G[j * 4 + 3] = d[o + F.T0] * (1 - 0.12 * a01); // teplota jazyka (chladne se stoupáním)
        P[j * 4 + 1] = d[o + F.stretch]; // pro plamen nese iP.y protažení, ne rotaci
      } else if (type === PTYPE.FIREPUFF) {
        C[j * 4] = d[o + F.cr]; C[j * 4 + 1] = 0; C[j * 4 + 2] = 0; C[j * 4 + 3] = d[o + F.tau0];
        G[j * 4] = 0; G[j * 4 + 1] = 0; G[j * 4 + 2] = 0; G[j * 4 + 3] = d[o + F.T0] * (1 - 0.3 * a01);
      } else {
        // zřeďování: v oblaku c ∝ 1/b², tloušťka ∝ b → τ ∝ s0/s
        const s0 = Math.max(d[o + F.s0], 1e-3);
        // náběh krytí za ~0,3 s (ne podílem života: dlouhý život 28 s = mezera mezi plamenem a kouřem)
        const tau = ((d[o + F.tau0] * s0) / s) * (1 - Math.exp(-age / 0.3));
        C[j * 4] = d[o + F.cr]; C[j * 4 + 1] = d[o + F.cg]; C[j * 4 + 2] = d[o + F.cb]; C[j * 4 + 3] = tau;
        // podsvícení od světel ohně
        let gr = 0, gg = 0, gb = 0;
        for (const L of lights) {
          if (!L.on) continue;
          const dx = d[o] - L.x, dy = d[o + 1] - L.y, dz = d[o + 2] - L.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          // izotropní rozptyl E/4π × zastínění uvnitř kouře (×uPreExp v shaderu); světlo k částici prochází
          // vlastním sloupcem kouře: τ ≈ k·(d − r/2)·0,6 → nasvícená jen spodní část sloupce (fotky nočních požárů)
          const sh = L.k > 0 ? Math.exp(-L.k * Math.max(0, Math.sqrt(d2) - L.r * 0.5) * 0.6) : 1;
          const e = L.I / (d2 + 0.25 * L.r * L.r) * 0.05 * sh;
          gr += e * L.c[0]; gg += e * L.c[1]; gb += e * L.c[2];
        }
        G[j * 4] = gr; G[j * 4 + 1] = gg; G[j * 4 + 2] = gb; G[j * 4 + 3] = 0;
      }
    }
    this.geo.instanceCount = n;
    for (const a of [this.aPS, this.aP, this.aC, this.aG, this.aV]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }
}

// ---------------------------------------------------------------------------------------------------
const SP_VS = /* glsl */`
in vec4 iPS; in vec4 iV; in float iT;
out vec2 vUv; out float vT; out float vA;
uniform float uPx;  // velikost pixelu ve světě na 1 m vzdálenosti
uniform float uShutter;
void main(){
  vec4 c = viewMatrix * vec4(iPS.xyz, 1.0);
  vec4 c2 = viewMatrix * vec4(iPS.xyz - iV.xyz * uShutter, 1.0);
  float dist = max(-c.z, 0.01);
  float minS = uPx * dist * 1.6;
  float s = max(iPS.w, minS);
  // zachování energie: menší než pixel → svítí víc na plochu, ale stejně celkově
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
}`;
const SP_FS = /* glsl */`
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
in vec2 vUv; in float vT; in float vA; out vec4 o;
uniform float uLum;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float f = exp(-dot(p, p) * 2.5);
  // ×2,5: bodový zdroj pod pixel oko vnímá jasněji (oslnění, Purkyně/Stiles–Crawford) – umělecké ★2, D-021
  vec3 c = bbColor(vT) * f * vA * uLum * 2.5;
  o = vec4(c, 0.0);
}`;

export class SparkSystem extends BaseSystem {
  constructor(capacity) {
    super(capacity);
    const g = QUAD.clone(); g.instanceCount = 0;
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPS = mk(4); this.aV = mk(4); this.aT = mk(1);
    g.setAttribute('iPS', this.aPS); g.setAttribute('iV', this.aV); g.setAttribute('iT', this.aT);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SP_VS, fragmentShader: SP_FS, glslVersion: THREE.GLSL3,
      uniforms: { ...sharedUniforms(), uPx: { value: 0.001 }, uShutter: { value: 1 / 50 }, uLum: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.layers.set(LAYER_FX); this.mesh.renderOrder = 6;
  }
  /** Jiskra/uhlík: T0 [K], chladnutí τc [s], průměr d [m]. */
  spawn({ x, y, z, vx, vy, vz, life, T, tauC = 0.6, size = 0.002, drag = 1.5, grav = 1, buoy = 0, ox, oz, pq = 0, pz0 = 0, seed, R0 = 0, ember = false, vt = 1 }) {
    const o = this.alloc(); if (o < 0) return;
    const d = this.d;
    d[o + F.type] = ember ? 1 : 0; d[o + F.tau0] = vt;
    d[o + F.px] = x; d[o + F.py] = y; d[o + F.pz] = z; d[o + F.vx] = vx; d[o + F.vy] = vy; d[o + F.vz] = vz;
    d[o + F.life] = life; d[o + F.T0] = T; d[o + F.dT] = tauC; d[o + F.s0] = size; d[o + F.drag] = drag; d[o + F.grav] = grav; d[o + F.buoy] = buoy;
    d[o + F.seed] = seed ?? Math.random(); d[o + F.ox] = ox ?? x; d[o + F.oz] = oz ?? z; d[o + F.pq] = pq; d[o + F.pz0] = pz0; d[o + F.glowR] = R0;
  }
  update(dt, air, camera) {
    this.integrate(dt, air);
    const d = this.d, n = this.n, PS = this.aPS.array, V = this.aV.array, T = this.aT.array;
    const kT = 1 - Math.exp(-dt / 0.4);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE, age = d[o + F.age], a01 = age / d[o + F.life], sd = d[o + F.seed];
      let Tk, sz = d[o + F.s0];
      if (d[o + F.type] === 1) {
        // žhavý uhlík (firebrand): povrch hoří s přístupem vzduchu – T roste s rychlostí obtékání
        // T_eq ≈ 880 + 150·√v_rel [K], strop ~1 340 K (Urban 2019, Kim 2021: 900–1 300 K) ★2
        const vx = d[o + F.vx], vy = d[o + F.vy], vz = d[o + F.vz];
        const vrel = d[o + F.tau0] + 0.3 * Math.sqrt(vx * vx + vy * vy + vz * vz);
        const Teq = Math.min(1340, 880 + 150 * Math.sqrt(vrel));
        d[o + F.T0] += (Teq - d[o + F.T0]) * kT;
        // popel: vrstva popela občas zakryje povrch a pak se odloupne (hluboké poklesy na ~0,5 s)
        const slot = Math.floor(age * 2.5 + sd * 17), hsh = (Math.sin(slot * 127.1 + sd * 311.7) * 43758.5453) % 1;
        const ash = Math.abs(hsh) < 0.18 ? 0.82 : 1;
        // dohoření: posledních 25 % života chladne a zmenšuje se
        const burn = a01 > 0.75 ? 1 - (a01 - 0.75) * 4 : 1;
        Tk = (700 + (d[o + F.T0] - 700) * burn) * ash * (1 + 0.04 * Math.sin(age * 31 + sd * 40));
        sz *= 0.55 + 0.45 * burn;
      } else {
        // jiskra: radiační + konvektivní chladnutí → exponenciála k ~600 K
        Tk = 600 + (d[o + F.T0] - 600) * Math.exp(-age / d[o + F.dT]);
        Tk *= (1 + 0.25 * Math.sin(age * 23 + sd * 40)) * (1 - Math.max(0, a01 - 0.85) * 2);
      }
      PS[i * 4] = d[o]; PS[i * 4 + 1] = d[o + 1]; PS[i * 4 + 2] = d[o + 2]; PS[i * 4 + 3] = sz;
      V[i * 4] = d[o + F.vx]; V[i * 4 + 1] = d[o + F.vy]; V[i * 4 + 2] = d[o + F.vz];
      T[i] = Tk;
    }
    this.geo.instanceCount = n;
    const h = camera.isPerspectiveCamera ? Math.tan((camera.fov * Math.PI) / 360) * 2 : 1;
    this.mat.uniforms.uPx.value = h / Math.max(1, this.viewportH || 720);
    for (const a of [this.aPS, this.aV, this.aT]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }
}

// ---------------------------------------------------------------------------------------------------
const HZ_VS = /* glsl */`
in vec4 iPS; in vec2 iA; out vec2 vUv; out vec2 vA; out vec3 vW;
void main(){
  vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = iPS.xyz + (cr * position.x + cu * position.y) * iPS.w;
  vW = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vUv = position.xy + 0.5; vA = iA;
}`;
const HZ_FS = /* glsl */`
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
in vec2 vUv; in vec2 vA; in vec3 vW; out vec4 o;
uniform float uTime, uStrength;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float f = exp(-dot(p, p) * 2.0) * (1.0 - smoothstep(0.85, 1.0, vA.x));
  vec3 q = vW * 0.9 - vec3(0.0, uTime * 2.2, 0.0);
  vec2 n = vec2(n3(q * 0.21) - 0.5, n3(q * 0.21 + 0.37) - 0.5);
  if (vA.y > 0.5) { // rázová vlna: radiální posun (prstenec) – uv kladné směrem ven
    o = vec4(p * f * uStrength * 0.02, 0.0, 1.0);
    return;
  }
  o = vec4(n * f * uStrength * 0.012, 0.0, 1.0);
}`;

export class HazeSystem extends BaseSystem {
  constructor(capacity) {
    super(capacity);
    const g = QUAD.clone(); g.instanceCount = 0;
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPS = mk(4); this.aA = mk(2);
    g.setAttribute('iPS', this.aPS); g.setAttribute('iA', this.aA);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: HZ_VS, fragmentShader: HZ_FS, glslVersion: THREE.GLSL3,
      uniforms: { ...sharedUniforms(), uTime: { value: 0 }, uStrength: { value: 1 } },
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.layers.set(LAYER_HAZE);
  }
  spawn({ x, y, z, vy = 1, life = 1.5, size = 1, ox, oz, pq = 0, pz0 = 0, ring = 0, R0 = 0 }) {
    const o = this.alloc(); if (o < 0) return;
    const d = this.d;
    d[o + F.px] = x; d[o + F.py] = y; d[o + F.pz] = z; d[o + F.vy] = vy; d[o + F.life] = life; d[o + F.s0] = size;
    d[o + F.drag] = 0.3; d[o + F.ox] = ox ?? x; d[o + F.oz] = oz ?? z; d[o + F.pq] = pq; d[o + F.pz0] = pz0; d[o + F.extra] = ring; d[o + F.glowR] = R0;
    d[o + F.seed] = Math.random();
  }
  update(dt, air, time) {
    this.integrate(dt, air);
    const d = this.d, n = this.n, PS = this.aPS.array, A = this.aA.array;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE, a01 = d[o + F.age] / d[o + F.life];
      PS[i * 4] = d[o]; PS[i * 4 + 1] = d[o + 1]; PS[i * 4 + 2] = d[o + 2]; PS[i * 4 + 3] = d[o + F.s0] * (1 + a01 * 0.8);
      A[i * 2] = a01; A[i * 2 + 1] = d[o + F.extra];
    }
    this.geo.instanceCount = n;
    this.mat.uniforms.uTime.value = time;
    for (const a of [this.aPS, this.aA]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }
}
