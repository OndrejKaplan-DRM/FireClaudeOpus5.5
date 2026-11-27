// Materiál ohořelosti: rozšíření MeshStandardMaterial (onBeforeCompile).
// uChar 0..1 = postup ohoření (černání od spodu/hran podle šumu), uGlow 0..1 = žhnutí trhlin (Planck 900–1150 K).
// Instancovaná verze čte atribut aChar (x = char, y = glow) – stromy, keře.
import * as THREE from 'three';
import { sharedUniforms, GLSL_COMMON } from './shared.js';

// alligator: [Nu, Nv] – „aligátoří“ síť trhlin ohořelého dřeva v souřadnicích uv válce (u kolem, v podél vláken):
//   příčné trhliny po ~2–4 cm a podélné po ~1,5 cm, bloky posunuté jako cihly (Babrauskas: char „checking“, ★3 vzhled).
// coal: celý povrch je žhavé uhlí s ostrůvky šedého popela (uhlíkové lože).
// Žhnutí „dýchá“: pomalý šum v prostoru a čase (proudění vzduchu přes lože) – uGTime.
// hole: díra propálená střechou – uniforma uHole (x, z, poloměr, –); okraj nepravidelný podle šumu a žhne.
// metal: lakovaný plech (karoserie, sud, láhev). Místo zuhelnatění prochází stavy podle nejvyšší dosažené teploty
//   (physics/heat.js sheetLook): lak hnědne a puchýřuje (470–620 K) → shoří na bělošedý popílek a holou ocel (> 620 K)
//   → okuje (> 800 K) → rez (uRust, po vychladnutí). Saze (uSoot) drží jen na chladnějším plechu: černý lem kolem
//   „čistého výpalu“ (NFPA 921). uTnow = současná teplota horkého konce → žhnutí nad ~800 K (Draperův bod 798 K).
//   Když scénář uTmax nenastaví (0), odvodí se stav z uChar/uGlow – starší scénáře tak dostanou plech zadarmo.
export function applyChar(mat, { instanced = false, scale = 2.0, bias = 'y', alligator = null, coal = false, hole = false, metal = false } = {}) {
  const sh = sharedUniforms();
  mat.userData.char = { uChar: { value: 0 }, uGlow: { value: 0 }, uCharScale: { value: scale }, uCharBase: { value: 0 }, uCharH: { value: 1 }, uHole: { value: new THREE.Vector4(0, 0, 0, 0) },
    uTmax: { value: 0 }, uTnow: { value: 293 }, uSoot: { value: -1 }, uRust: { value: 0 }, uHeatFall: { value: 0.55 },
    uHeatSrc: { value: new THREE.Vector3() }, uObjC: { value: new THREE.Vector3() }, uHeatSide: { value: 0 } }; // strana přivrácená k ohni (Burnable ji nastavuje sám)
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
      .replace('#include <common>', `#include <common>\nin vec3 vCharP; in vec2 vCharA; in vec2 vCharUv;\nuniform float uChar, uGlow, uCharScale, uCharBase, uCharH;\nuniform vec4 uHole;\nuniform float uTmax, uTnow, uSoot, uRust, uHeatFall, uHeatSide;\nuniform vec3 uHeatSrc, uObjC;\n${GLSL_COMMON}\n${metal ? '#define METAL 1' : ''}\n${alligator ? `#define ALLIG vec2(${alligator[0].toFixed(2)}, ${alligator[1].toFixed(2)})` : ''}\n${coal ? '#define COAL 1' : ''}\n${hole ? '#define HOLE 1' : ''}`)
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
  float metalGlowT = 0.0;
#ifdef METAL
  float charRough;
  {
    float tMax = uTmax > 1.0 ? uTmax : 293.0 + 720.0 * chv;
    float tNow = uTmax > 1.0 ? uTnow : 293.0 + 640.0 * glv * chv;
    float soot = uSoot >= 0.0 ? uSoot : chv * 0.85;
    float mn = fbm3(vCharP * uCharScale * 0.5 + 7.0);
    float mn2 = n3(vCharP * uCharScale * 0.9 + 1.7);                          // velké skvrny (fotky vraků: plochy v decimetrech)
    float fall = clamp(1.0 - uHeatFall * hgt + (mn - 0.5) * 0.4, 0.0, 1.0);   // teplota klesá od horkého konce, hranice zvlněná šumem
    // strana přivrácená k ohni je horká a čistá, odvrácená chladnější a jen lehce očouzená (sálání nevidí „za roh“)
    if (uHeatSide > 0.0) {
      float facing = clamp(0.5 + 0.5 * dot(normalize(vCharP - uObjC), normalize(uHeatSrc - uObjC)), 0.0, 1.0);
      fall *= mix(1.0, 0.25 + 0.75 * facing * facing, uHeatSide);
      soot *= mix(1.0, 0.2 + 0.8 * smoothstep(0.15, 0.75, facing), uHeatSide);
    }
    float Tl = 293.0 + (tMax - 293.0) * fall;
    float blister = smoothstep(470.0, 620.0, Tl);
    float off = smoothstep(600.0, 700.0, Tl);
    float scl = smoothstep(780.0, 950.0, Tl);
    float bub = smoothstep(0.55, 0.78, n3(vCharP * uCharScale * 6.0));
    vec3 paint = diffuseColor.rgb;
    paint = mix(paint, paint * 0.35 + vec3(0.07, 0.045, 0.03), blister);                       // lak hnědne
    paint = mix(paint, vec3(0.4, 0.34, 0.28), blister * bub * 0.55);                          // puchýře
    vec3 bare = mix(vec3(0.27, 0.23, 0.14), vec3(0.6, 0.56, 0.42), smoothstep(0.4, 0.75, mn));       // barvy změřené na fotkách vyhořelých aut (paleta p21–p23)  // holá ocel ↔ bělošedý popílek laku
    bare = mix(bare, vec3(0.12, 0.13, 0.16), scl * smoothstep(0.3, 0.6, mn2));                // okuje (modrošedé)
    vec3 rust = mix(vec3(0.5, 0.32, 0.17), vec3(0.24, 0.11, 0.04), smoothstep(0.2, 0.8, mn2));                      // rez: barvy z fotek vyhořelých aut
    bare = mix(bare, rust, max(uRust, 0.3 + 0.25 * scl) * smoothstep(0.38, 0.62, mn * 0.5 + mn2 * 0.6 + 0.2 * (1.0 - hgt) - 0.1));   // i čerstvě vyžíhaný plech je hnědě skvrnitý (oxidy); dole a u ohniska víc
    diffuseColor.rgb = mix(paint, bare, off);
    float streak = fbm3(vec3(vCharP.x * uCharScale * 1.2, vCharP.y * uCharScale * 0.15, vCharP.z * uCharScale * 1.2));
    float sootM = clamp(soot * (1.0 - off) * smoothstep(0.2, 0.7, streak + 0.5 * blister + 0.35 * (1.0 - hgt)) * 1.4, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.017, 0.016), sootM * 0.94);
    charRough = max(max(blister * 0.6, off * 0.75), sootM);
    metalGlowT = 293.0 + (tNow - 293.0) * fall * (0.85 + 0.3 * mn2);
    charM = 0.0; crack = 0.0;
  }
#else
  vec3 charCol = mix(vec3(0.025, 0.022, 0.02), vec3(0.11, 0.1, 0.095), smoothstep(0.75, 1.0, chv) * cn); // popel šedne
  diffuseColor.rgb = mix(diffuseColor.rgb, charCol, charM);
  float charRough = charM;
#endif
  float holeRim = 0.0;
#ifdef HOLE
  if (uHole.z > 0.0 && vCharP.y > uHole.w) { // jen nad výškou w (strop a střecha, ne okna a podlaha)
    float hd = length(vCharP.xz - uHole.xy) + (fbm3(vCharP * 0.9) - 0.5) * 1.6;
    if (hd < uHole.z) discard;
    holeRim = smoothstep(uHole.z + 0.9, uHole.z, hd);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), holeRim);
  }
#endif`)
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
#ifdef HOLE
    totalEmissiveRadiance += bbColor(950.0 + 250.0 * crackN * breath) * holeRim * holeRim * uFlameK * 0.3;
#endif
#ifdef METAL
    totalEmissiveRadiance += bbColor(clamp(metalGlowT, 700.0, 1400.0)) * smoothstep(790.0, 900.0, metalGlowT) * uFlameK * 0.22; // žhnoucí plech
#endif
  }`);
  };
  mat.customProgramCacheKey = () => 'char' + (instanced ? 'I' : '') + (alligator ? 'A' + alligator.join('x') : '') + (coal ? 'C' : '') + (hole ? 'H' : '') + (metal ? 'M' : '');
  return U;
}
