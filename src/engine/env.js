// Prostředí: obloha, okolní světlo, terén, mlha. Tři denní doby (noc/soumrak/den).
import * as THREE from 'three';
import { groundTexture } from '../assets/textures.js';

// Fyzikální řády (lx, cd/m²): noc bez Měsíce ~0,001 lx, úplněk ~0,2 lx, občanský soumrak ~3–400 lx, den 10⁴–10⁵ lx. ★★★★
// skyL = jas oblohy [cd/m²], hemi = osvětlení z oblohy [lx], sun/moon = přímé [lx].
export const TIMES = {
  noc: { sky0: [0.6, 0.7, 1.0], sky1: [0.2, 0.25, 0.5], skyL: 0.004, hemi: 0.01, moon: 0.12, sun: 0, fog: [0.5, 0.6, 1.0], fogL: 0.002, stars: 1 },
  soumrak: { sky0: [1.0, 0.72, 0.62], sky1: [0.25, 0.38, 0.85], skyL: 6, hemi: 18, moon: 0, sun: 0, fog: [0.9, 0.75, 0.75], fogL: 3, stars: 0.25 },
  den: { sky0: [0.85, 0.92, 1.0], sky1: [0.3, 0.5, 1.0], skyL: 3500, hemi: 11000, moon: 0, sun: 65000, fog: [0.75, 0.82, 0.95], fogL: 2500, stars: 0 },
};

const SKY_FS = /* glsl */`
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
}`;

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0.55, 0.6, 0.7) }, stars: { value: 0 } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.sky.onBeforeRender = (r, s, cam) => { this.sky.position.copy(cam.position); this.sky.scale.setScalar(cam.far * 0.9); this.sky.updateMatrixWorld(); };
    scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0x9aa8c8, 0x5a4a3a, 0.1); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dd, 0.1); this.sun.position.set(55, 60, 70); scene.add(this.sun);
    this.moon = new THREE.DirectionalLight(0x8fa6d8, 0.0); this.moon.position.set(40, 60, 30); scene.add(this.moon);
    this.fog = new THREE.FogExp2(0x000000, 0.004); scene.fog = this.fog;
    this.groundMat = new THREE.MeshStandardMaterial({ map: groundTexture('dirt'), roughness: 0.95, metalness: 0 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.ground.name = 'ground';
    scene.add(this.ground);
    this.setGround('dirt', 400);
    this.setTime('soumrak');
  }

  setGround(kind, size = 400, repeat = null) {
    const tex = groundTexture(kind);
    const rep = repeat || size / 4;
    tex.repeat.set(rep, rep);
    this.groundMat.map = tex; this.groundMat.needsUpdate = true;
    this.ground.scale.set(size, size, 1);
    this.groundKind = kind;
  }

  setTime(name) {
    const t = TIMES[name] || TIMES.soumrak; this.time = name; this.T = t;
    this.skyMat.uniforms.stars.value = t.stars;
    // osvětlení vodorovné plochy [lx] (pro auto-expozici)
    this.ambientE = t.hemi + t.sun * Math.max(0, this.sun.position.clone().normalize().y) + t.moon * 0.7;
    this.skyL = t.skyL;
    this.update(1);
  }
  /** Před-expozice: intenzity × pre (viz shared.PRE) */
  update(pre) {
    const t = this.T; if (!t) return;
    const u = this.skyMat.uniforms;
    u.c0.value.setRGB(...t.sky0).multiplyScalar(t.skyL * pre); u.c1.value.setRGB(...t.sky1).multiplyScalar(t.skyL * 0.6 * pre);
    this.hemi.intensity = t.hemi * pre; this.sun.intensity = t.sun * pre; this.moon.intensity = t.moon * pre;
    this.fog.color.setRGB(...t.fog).multiplyScalar(t.fogL * pre);
  }
}
