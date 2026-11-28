// Spálenina na zemi (decal): procedurální, roste v čase; žhnoucí okraj u požárů, kráter u výbuchu.
import * as THREE from 'three';
import { GLSL_COMMON, sharedUniforms } from './shared.js';

const FS = /* glsl */`
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
  if (uTintK > 0.0) { col = uTint * (0.75 + 0.5 * n2); em = vec3(0.0); a = smoothstep(edge, edge - 0.12, r) * (0.75 + 0.25 * smoothstep(0.3, 0.6, n2)); } // pěna, písek, mokrá skvrna
  gl_FragColor = vec4(col + em, a * 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Scorch {
  constructor(scene, { pos, radius = 2, seed = 1, grow = 0, glow = 0, crater = 0, rate = 0, color = null }) {
    this.scene = scene; this.rate = rate;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { ...sharedUniforms(), uGrow: { value: grow || (rate ? 0 : 1) }, uGlow: { value: glow }, uCrater: { value: crater }, uSeed: { value: seed * 0.13 }, uTint: { value: new THREE.Vector3(...(color || [0, 0, 0])) }, uTintK: { value: color ? 1 : 0 } },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), this.mat);
    this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.set(pos.x, (pos.y || 0) + 0.01, pos.z); this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  get u() { return this.mat.uniforms; }
  update(dt) { if (this.rate) this.u.uGrow.value = Math.min(1, this.u.uGrow.value + dt * this.rate); }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// Stopy ohně na svislé stěně (iterace 7): saze stoupají s vlečkou a rozšiřují se do tvaru V, u ohniska je stěna tak horká,
// že saze shoří („čistý výpal“) a omítka odprýská; okraj skvrny je hnědý od dehtu. Podle NFPA 921 a fotek vyhořelých domů.
const WFS = /* glsl */`
precision highp float; precision highp sampler3D;
${GLSL_COMMON}
varying vec2 vUv; varying vec3 vW;
uniform float uSoot, uClean, uSeed, uB0, uLf; uniform vec2 uSize, uFire; uniform vec3 uLit;
void main(){
  vec2 p = vUv * uSize - uFire;                       // metry od paty ohně na stěně (x do strany, y vzhůru)
  float n = fbm3(vec3(vW.xy * 0.9 + vW.z, uSeed)), n2 = fbm3(vec3(vW.xy * 4.0 + vW.z * 3.0, uSeed + 0.7));
  float y = max(p.y, 0.0);
  float b = uB0 + 0.2 * y * (0.8 + 0.5 * n);          // pološířka sazové vlečky roste s výškou
  float d = exp(-(p.x * p.x) / (b * b)) * smoothstep(-0.25, 0.25, p.y) * (0.55 + 0.45 * exp(-y / (2.5 * uLf + 1.0)));
  d += 0.5 * exp(-(p.x * p.x) / (b * b * 6.0)) * smoothstep(uSize.y - uFire.y - 0.7, uSize.y - uFire.y, p.y);  // rozlití pod stropem / římsou
  float soot = clamp(d * uSoot * 1.6 * (0.7 + 0.6 * n), 0.0, 1.0);
  // čistý výpal: elipsa kolem plamene, kde stěna přesáhla ~430 °C
  float e = length(vec2(p.x / (uB0 * 1.1), (p.y - 0.45 * uLf) / (0.75 * uLf)));
  float clean = uClean * smoothstep(1.15, 0.7, e + 0.25 * (n - 0.5));
  vec3 cSoot = mix(vec3(0.16, 0.11, 0.07), vec3(0.015, 0.014, 0.013), smoothstep(0.15, 0.6, soot)); // hnědý okraj → černý střed
  vec3 cClean = mix(vec3(0.62, 0.58, 0.54), vec3(0.66, 0.5, 0.46), 0.5 * n);                        // vybělená až narůžovělá omítka
  float sp = smoothstep(0.54, 0.6, fbm3(vec3(vW.xy * 0.42 + vW.z, uSeed + 3.1))) * smoothstep(0.35, 0.9, clean);    // odprýskané plochy (cihla, beton): velké ostrůvky
  cClean = mix(cClean, vec3(0.34, 0.22, 0.16) * (0.85 + 0.3 * n), sp);
  vec3 col = mix(cSoot, cClean, clean);
  float a = max(soot * (1.0 - clean), clean * (0.45 + 0.5 * sp));
  // barva je odrazivost: násobí se osvětlením stěny (obloha + slunce po před-expozici, příspěvek ohně) – jinak by ve tmě svítila
  gl_FragColor = vec4(col * uLit, a * 0.95);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export class WallSoot {
  /** { pos: Vector3 střed plochy, normal: 'x'|'z' (osa kolmá ke stěně), sign: ±1, w, h [m], fire: [x, y] pata ohně na stěně od levého dolního rohu, b0, Lf } */
  constructor(scene, { pos, axis = 'z', sign = 1, w = 4, h = 3, fire = [2, 0], b0 = 0.5, Lf = 1.5, seed = 1 }) {
    this.scene = scene;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: WFS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { ...sharedUniforms(), uSoot: { value: 0 }, uClean: { value: 0 }, uSeed: { value: seed * 0.17 }, uB0: { value: b0 }, uLf: { value: Lf }, uSize: { value: new THREE.Vector2(w, h) }, uFire: { value: new THREE.Vector2(fire[0], fire[1]) }, uLit: { value: new THREE.Vector3(1, 1, 1) } },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    if (axis === 'x') this.mesh.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2; else if (sign < 0) this.mesh.rotation.y = Math.PI;
    this.mesh.position.copy(pos); this.mesh.position[axis] += sign * 0.012; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  get u() { return this.mat.uniforms; }
  /** amb = jas bílé stěny z oblohy a slunce po před-expozici (0..1); fireLit = příspěvek ohně 0..1 (nastavuje scénář). */
  setLight(amb) { const f = this.fireLit || 0; this.u.uLit.value.set(Math.min(1.2, amb + 0.9 * f), Math.min(1.2, amb + 0.45 * f), Math.min(1.2, amb + 0.18 * f)); }
  update() {}
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
