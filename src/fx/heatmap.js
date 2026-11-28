// Tepelná mapa na zemi (iterace 7): sálání všech ohňů ve výšce 1 m jako barevné pásy s vrstevnicemi.
// Ukazuje obecný model přestupu tepla: kde to bolí (2,5 kW/m²), kde chytne sláma (8), dřevo (12,5), kde vypadne sklo (20)
// a kde dřevo vzplane samo (35). Stejný výpočet jako physics/heat.js (tři body na ose plamene), bez kontaktu a vlečky.
import * as THREE from 'three';

const N = 16;
const FS = /* glsl */`
precision highp float;
varying vec3 vW;
uniform int uN; uniform vec4 uF[${N}]; uniform float uD[${N}];   // uF = x, z, Q·χr [W], L [m];  uD = průměr
vec3 band(float q){                                   // kW/m²
  if (q < 1.0) return vec3(0.0);
  if (q < 2.5) return vec3(0.1, 0.35, 0.9);           // bezpečné
  if (q < 5.0) return vec3(0.1, 0.75, 0.75);          // bolest do 30 s
  if (q < 8.0) return vec3(0.25, 0.8, 0.2);           // puchýře, praská sklo
  if (q < 12.5) return vec3(0.95, 0.9, 0.1);          // vzplane sláma
  if (q < 20.0) return vec3(1.0, 0.55, 0.05);         // vzplane dřevo (s plamínkem)
  if (q < 35.0) return vec3(0.95, 0.15, 0.05);        // vypadává sklo, flashover
  return vec3(0.85, 0.1, 0.75);                       // dřevo vzplane samo
}
void main(){
  float q = 0.0; vec3 p = vec3(vW.x, 1.0, vW.z);
  for (int i = 0; i < ${N}; i++) { if (i >= uN) break;
    vec4 f = uF[i]; float r = uD[i] * 0.5;
    for (int k = 0; k < 3; k++) { float h = f.w * (float(k) * 2.0 + 1.0) / 6.0, fr = r * (1.0 - 0.6 * (float(k) * 2.0 + 1.0) / 6.0);
      float eh = max(length(p.xz - f.xy) - fr, 0.05 * uD[i] + 0.01), R2 = eh * eh + (p.y - h) * (p.y - h);
      q += f.z / 3.0 / (12.566 * max(R2, 1e-4)); } }
  q = min(q, 140000.0) / 1000.0;
  vec3 c = band(q); if (q < 1.0) discard;
  float lq = log2(q), iso = smoothstep(0.0, 0.06, abs(fract(lq * 2.0) - 0.5) * 2.0 - 0.0);   // jemné vrstevnice po ½ oktávy
  gl_FragColor = vec4(c * (0.75 + 0.25 * iso), 0.42);
  #include <colorspace_fragment>
}`;
export const HEAT_LEGEND = [['1–2,5', 'bezpečné', '#1a59e6'], ['2,5–5', 'bolest do 30 s', '#1abfbf'], ['5–8', 'puchýře, praská sklo', '#40cc33'], ['8–12,5', 'chytne sláma', '#f2e61a'], ['12,5–20', 'chytne dřevo', '#ff8c0d'], ['20–35', 'vypadává sklo', '#f2260d'], ['> 35', 'dřevo vzplane samo', '#d91abf']];

export class HeatMap {
  constructor(scene, size = 240) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      uniforms: { uN: { value: 0 }, uF: { value: Array.from({ length: N }, () => new THREE.Vector4()) }, uD: { value: new Float32Array(N) } },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.mat); this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.y = 0.02; this.mesh.renderOrder = 2; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  /** fires = FXWorld.fireList() */
  update(fires) {
    const u = this.mat.uniforms, top = [...fires].sort((a, b) => b.Q - a.Q).slice(0, N);
    u.uN.value = top.length;
    top.forEach((f, i) => { u.uF.value[i].set(f.x, f.z, f.Q * (f.chiR ?? 0.3), Math.max(f.L, 0.05)); u.uD.value[i] = f.D; });
  }
}
