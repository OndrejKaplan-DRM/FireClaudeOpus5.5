// Materiál ohořelosti: rozšíření MeshStandardMaterial (onBeforeCompile).
// uChar 0..1 = postup ohoření (černání od spodu/hran podle šumu), uGlow 0..1 = žhnutí trhlin (Planck 900–1150 K).
// Instancovaná verze čte atribut aChar (x = char, y = glow) – stromy, keře.
import * as THREE from 'three';
import { sharedUniforms, GLSL_COMMON } from './shared.js';

export function applyChar(mat, { instanced = false, scale = 2.0, bias = 'y' } = {}) {
  const sh = sharedUniforms();
  mat.userData.char = { uChar: { value: 0 }, uGlow: { value: 0 }, uCharScale: { value: scale }, uCharBase: { value: 0 }, uCharH: { value: 1 } };
  const U = mat.userData.char;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, sh, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nout vec3 vCharP; out vec2 vCharA;\n${instanced ? 'in vec2 aChar;' : ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  {
    vec4 cp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      cp = instanceMatrix * cp;
    #endif
    vCharP = (modelMatrix * cp).xyz;
    vCharA = ${instanced ? 'aChar' : 'vec2(-1.0)'};
  }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nin vec3 vCharP; in vec2 vCharA;\nuniform float uChar, uGlow, uCharScale, uCharBase, uCharH;\n${GLSL_COMMON.replace('uniform highp sampler3D tNoise;', 'uniform highp sampler3D tNoise;')}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float chv = vCharA.x >= 0.0 ? vCharA.x : uChar;
  float glv = vCharA.x >= 0.0 ? vCharA.y : uGlow;
  float hgt = clamp((vCharP.y - uCharBase) / max(uCharH, 0.01), 0.0, 1.0);
  float cn = fbm3(vCharP * uCharScale * 0.11);
  float front = chv * 1.35 - 0.2;
  float charM = smoothstep(front + 0.12, front - 0.12, cn * 0.7 + hgt * 0.45);
  float crackN = n3(vCharP * uCharScale * 0.37 + 0.5);
  float crack = smoothstep(0.08, 0.0, abs(crackN - 0.5)) * charM;
  vec3 charCol = mix(vec3(0.025, 0.022, 0.02), vec3(0.11, 0.1, 0.095), smoothstep(0.75, 1.0, chv) * cn); // popel šedne
  diffuseColor.rgb = mix(diffuseColor.rgb, charCol, charM);
  float charRough = charM;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.97, charRough);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float Tk = 880.0 + 300.0 * crackN * glv;
    float hotZone = smoothstep(front - 0.05, front - 0.35, cn * 0.7 + hgt * 0.45);
    totalEmissiveRadiance += bbColor(Tk) * (crack * 1.4 + hotZone * 0.25 * charM) * glv * uFlameK * 0.35;
  }`);
  };
  mat.customProgramCacheKey = () => 'char' + (instanced ? 'I' : '');
  return U;
}
