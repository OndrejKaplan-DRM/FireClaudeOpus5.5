// Spálenina na zemi (decal): procedurální, roste v čase; žhnoucí okraj u požárů, kráter u výbuchu.
import * as THREE from 'three';
import { GLSL_COMMON, sharedUniforms } from './shared.js';

const FS = /* glsl */`
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
}`;

export class Scorch {
  constructor(scene, { pos, radius = 2, seed = 1, grow = 0, glow = 0, crater = 0, rate = 0 }) {
    this.scene = scene; this.rate = rate;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { ...sharedUniforms(), uGrow: { value: grow || (rate ? 0 : 1) }, uGlow: { value: glow }, uCrater: { value: crater }, uSeed: { value: seed * 0.13 } },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), this.mat);
    this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.set(pos.x, (pos.y || 0) + 0.01, pos.z); this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  get u() { return this.mat.uniforms; }
  update(dt) { if (this.rate) this.u.uGrow.value = Math.min(1, this.u.uGrow.value + dt * this.rate); }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
