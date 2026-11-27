// Materiál ohořelosti: rozšíření MeshStandardMaterial (onBeforeCompile).
// uChar 0..1 = postup ohoření (černání od spodu/hran podle šumu), uGlow 0..1 = žhnutí trhlin (Planck 900–1150 K).
// Instancovaná verze čte atribut aChar (x = char, y = glow) – stromy, keře.
import * as THREE from 'three';
import { sharedUniforms, GLSL_COMMON } from './shared.js';

// alligator: [Nu, Nv] – „aligátoří“ síť trhlin ohořelého dřeva v souřadnicích uv válce (u kolem, v podél vláken):
//   příčné trhliny po ~2–4 cm a podélné po ~1,5 cm, bloky posunuté jako cihly (Babrauskas: char „checking“, ★3 vzhled).
// coal: celý povrch je žhavé uhlí s ostrůvky šedého popela (uhlíkové lože).
// Žhnutí „dýchá“: pomalý šum v prostoru a čase (proudění vzduchu přes lože) – uGTime.
export function applyChar(mat, { instanced = false, scale = 2.0, bias = 'y', alligator = null, coal = false } = {}) {
  const sh = sharedUniforms();
  mat.userData.char = { uChar: { value: 0 }, uGlow: { value: 0 }, uCharScale: { value: scale }, uCharBase: { value: 0 }, uCharH: { value: 1 } };
  const U = mat.userData.char;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, sh, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nout vec3 vCharP; out vec2 vCharA; out vec2 vCharUv;\n${instanced ? 'in vec2 aChar;' : ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  {
    vec4 cp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      cp = instanceMatrix * cp;
    #endif
    vCharP = (modelMatrix * cp).xyz;
    vCharA = ${instanced ? 'aChar' : 'vec2(-1.0)'};
    vCharUv = uv;
  }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nin vec3 vCharP; in vec2 vCharA; in vec2 vCharUv;\nuniform float uChar, uGlow, uCharScale, uCharBase, uCharH;\n${GLSL_COMMON}\n${alligator ? `#define ALLIG vec2(${alligator[0].toFixed(2)}, ${alligator[1].toFixed(2)})` : ''}\n${coal ? '#define COAL 1' : ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float chv = vCharA.x >= 0.0 ? vCharA.x : uChar;
  float glv = vCharA.x >= 0.0 ? vCharA.y : uGlow;
  float hgt = clamp((vCharP.y - uCharBase) / max(abs(uCharH), 0.01), 0.0, 1.0);
  if (uCharH < 0.0) hgt = 1.0 - hgt; // hoření shora (louč)
  float cn = fbm3(vCharP * uCharScale * 0.11);
  float front = chv * 1.35 - 0.2;
  float charM = smoothstep(front + 0.12, front - 0.12, cn * 0.7 + hgt * 0.45);
  float crackN = n3(vCharP * uCharScale * 0.37 + 0.5);
  float crack = smoothstep(0.08, 0.0, abs(crackN - 0.5)) * charM;
#ifdef ALLIG
  {
    // bloky: řady podél vláken (v), v každé řadě náhodný posun; hrany zvlněné šumem
    vec2 g = vCharUv * ALLIG;
    float row = floor(g.x);
    g.y += fract(sin(row * 12.9898) * 43758.5453) * 0.9;
    vec2 wq = vec2(n3(vCharP * uCharScale * 0.9), n3(vCharP * uCharScale * 0.9 + 0.31)) - 0.5;
    g += wq * 0.6;
    g.x += 0.25 * sin(g.y * 1.7 + row);
    vec2 e = min(fract(g), 1.0 - fract(g));
    float aw = 0.07 + 0.05 * chv;                                   // trhliny se s hořením rozevírají
    float al = 1.0 - smoothstep(0.0, aw, min(e.x * 0.8, e.y));
    // žhnou jen trhliny v horkých ostrůvcích (proudění, přivrácená strana); jinde tmavé rýhy
    float hotP = smoothstep(0.45, 0.72, n3(vCharP * uCharScale * 0.21 + 3.7));
    crack = max(crack * 0.5, al * smoothstep(0.2, 0.6, charM) * hotP);
    diffuseColor.rgb *= 1.0 - 0.6 * al * charM; // tmavé rýhy i bez žhnutí
  }
#endif
  vec3 charCol = mix(vec3(0.025, 0.022, 0.02), vec3(0.11, 0.1, 0.095), smoothstep(0.75, 1.0, chv) * cn); // popel šedne
  diffuseColor.rgb = mix(diffuseColor.rgb, charCol, charM);
  float charRough = charM;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.97, charRough);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    // dýchání: pomalé vlny proudění přes žhavé plochy (0,1–0,5 Hz), amplituda ±35 % ★2 vzhled
    float breath = 0.65 + 0.7 * n3(vCharP * 0.9 + vec3(0.0, uGTime * 0.12, uGTime * 0.05));
    float Tk = 880.0 + 300.0 * crackN * glv * breath;
    float hotZone = smoothstep(front - 0.05, front - 0.35, cn * 0.7 + hgt * 0.45);
#ifdef COAL
    // uhlí: žhne celý povrch, šedý popel v ostrůvcích; dutiny (n2) tmavší
    float ashM = smoothstep(0.52, 0.7, cn + 0.15 * (crackN - 0.5));
    Tk = 820.0 + 330.0 * (1.0 - ashM) * glv * breath * (0.75 + 0.5 * crackN);
    diffuseColor.rgb = mix(vec3(0.03, 0.028, 0.026), vec3(0.42, 0.4, 0.37), ashM);
    totalEmissiveRadiance += bbColor(Tk) * (1.0 - ashM * 0.85) * glv * uFlameK * 0.3;
#else
    totalEmissiveRadiance += bbColor(Tk) * (crack * 1.4 + hotZone * 0.25 * charM) * glv * breath * uFlameK * 0.35;
#endif
  }`);
  };
  mat.customProgramCacheKey = () => 'char' + (instanced ? 'I' : '') + (alligator ? 'A' + alligator.join('x') : '') + (coal ? 'C' : '');
  return U;
}
