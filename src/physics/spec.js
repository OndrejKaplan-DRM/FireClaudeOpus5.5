// JEDEN POPIS OHNĚ A VÝBUCHU → všechna čísla (AUDIT §5.1 a §5.3, iterace 6).
// Vstup je to, co o věci víme ve hře (co hoří, kolik toho je, v jakém tvaru); výstup je vše, co potřebuje efekt:
// výkon Q(t), průměr D, výška plamene L, doba hoření, půdorys. Stejný popis použije scénář FireLab, předvolba xEngine i data.
//
//   fireSpec({ kind: 'pool',  fuel: 'diesel', D: 0.57, volumeL: 200 })        sud bez víka
//   fireSpec({ kind: 'spill', fuel: 'diesel', volumeL: 20 })                  rozlitá kapalina
//   fireSpec({ kind: 'leak',  fuel: 'diesel', holeMM: 9, head: 0.5 })         prostřelený sud – hořící pramínek
//   fireSpec({ kind: 'pile',  material: 'softwood', mass: 20, stick: 0.08 })  hranice, ohniště
//   fireSpec({ kind: 'solid', material: 'rubber', mass: 9, area: 1.2 })       jeden hořlavý předmět
//   fireSpec({ kind: 'jet',   fuel: 'butane', mdot: 1.25e-6 })                zapalovač
//   fireSpec({ kind: 'wick',  fuel: 'paraffin', Q: 80 })                      svíčka
//   fireSpec({ kind: 'jet',   fuel: 'propane', mdot: 0.02 })                  hořák, únik plynu pod tlakem (turbulentní)
//   fireSpec({ kind: 'line',  fuel: 'gasoline', length: 6, width: 0.3 })      hořící stopa, pruh, čelo
//   fireSpec({ kind: 'room',  floor: [4, 3.5], H: 2.6, opening: [1.2, 1.4], load: 25 })  místnost s oknem (flashover)
//   fireSpec({ kind: 'metal', fuel: 'thermite', mass: 1 })                    hořící kov, termit
// Měřítko: scaleFire(spec, k) – k-násobný výkon při stejné plošné hustotě výkonu (D ∝ √k, L z Heskestada).
import * as C from './combustion.js';
import { FUELS, EXPLOSIVES, TNT_J_PER_KG } from './fuels.js';
import { material, MATERIALS } from './materials.js';
import { objectFire } from './heat.js';
import { bleveFireball, heFireball, gasTNT } from './blast.js';

const G = 9.81;

/** Výtok otvorem (Torricelli): V̇ = Cd·a·√(2 g h) [m³/s]; Cd ≈ 0,62 pro ostrý otvor (průstřel). ★5 */
export function torricelli(holeD, head, Cd = 0.62) { return Cd * (Math.PI * holeD * holeD) / 4 * Math.sqrt(2 * G * Math.max(head, 0)); }
/** Výška hladiny nad otvorem v čase: √h = √h0 − k t, k = Cd·a·√(2g) / (2·A_nádoby). ★5 */
export function drainHead(t, h0, holeD, tankArea, Cd = 0.62) {
  const k = (Cd * (Math.PI * holeD * holeD) / 4 * Math.sqrt(2 * G)) / (2 * tankArea);
  const s = Math.sqrt(h0) - k * t; return s > 0 ? s * s : 0;
}
export function drainTime(h0, holeD, tankArea, Cd = 0.62) { return Math.sqrt(h0) / ((Cd * (Math.PI * holeD * holeD) / 4 * Math.sqrt(2 * G)) / (2 * tankArea)); }

/** Výška plamene liniového ohně (hořící pramínek, čelo): L = 0,035·Q′^(2/3), Q′ [kW/m] — Yuan & Cox (1996). ★4 */
export const lineFlameHeight = (Qper_m) => 0.035 * Math.pow(Qper_m / 1000, 2 / 3);

/** Výška laminárního difuzního plamene z trysky nebo knotu: L ∝ průtok paliva ∝ Q (Roper 1977), nezávisle na průměru. ★4
 *  Konstanta kalibrovaná: zapalovač 57 W → 25 mm, svíčka 80 W → 45 mm (knot plamen nadnáší). */
export const laminarFlameHeight = (Q, fuel = 'butane') => (fuel === 'paraffin' ? 0.045 / 80 : 0.025 / 57) * Q;

/** Délka turbulentního tryskového plamene (únik plynu pod tlakem, hořák): L = 2,8893·Q^0,3728 [m], Q v MW
 *  (Lowesmith et al. 2007; zemní plyn a směsi od desítek kW po stovky MW). ★4 */
export const jetFlameLength = (Q) => 2.8893 * Math.pow(Math.max(Q, 1) / 1e6, 0.3728);

/** Rychlost šíření plamene po hladině [m/s]: nad bodem vzplanutí běží plynnou fází 1,3–2,2 m/s (benzín), pod ním se musí
 *  kapalina před čelem ohřát → centimetry za sekundu (nafta). SFPE (Gottuk & White) ★4 */
export const liquidSpread = (fuel) => MATERIALS[fuel]?.spread ?? (FUELS[fuel]?.mInf ? 0.05 : 1.5);

/** Teplota horké vrstvy pod stropem místnosti [K] (McCaffrey, Quintiere & Harkleroad 1981):
 *  ΔT = 6,85·(Q² / (A_o·√H_o·h_k·A_T))^(1/3), Q [kW], h_k ≈ 0,03 kW/m²K (omítnuté zdivo po pár minutách).
 *  Celkové vzplanutí nastává kolem ΔT ≈ 500 K; okno praská řádově při 100–150 °C a vypadává kolem 360 °C. ★4 */
export const layerTemp = (Q, Ao, Ho, AT, hk = 0.03) => C.AMB.T + Math.min(1100, 6.85 * Math.cbrt(((Q / 1000) ** 2) / (Ao * Math.sqrt(Ho) * hk * AT)));

/** Výška plamene šlehajícího z okna nad horní hranu otvoru: z = 12,8·(R/w)^(2/3) − h; R = rychlost hoření [kg/s],
 *  w, h = šířka a výška otvoru [m] (Law 1978; Eurokód 1991-1-2 příl. B). ★3 */
export const windowFlameHeight = (R, w, h) => Math.max(0, 12.8 * Math.pow(R / w, 2 / 3) - h);

/** Rovnovážná plocha hořícího pramínku: vše, co vyteče, shoří → A = ṁ / m″(D), m″ tenké vrstvy = 0,5·m″ louže. ★3 */
export function leakFire(fuel, flowLps, { thin = 0.5, width = null } = {}) {
  const f = FUELS[fuel], mdot = (flowLps / 1000) * f.rho;
  let D = 1, A = 1;
  for (let i = 0; i < 30; i++) { const m2 = thin * f.mInf * (1 - Math.exp(-f.kBeta * D)); A = mdot / m2; D = Math.sqrt((4 * A) / Math.PI); }
  const Q = mdot * f.dHc;
  // na svahu teče pramínkem: šířka roste s průtokem (★2), délka z plochy
  const w = width ?? Math.min(1.2, 0.25 + 0.9 * Math.sqrt(flowLps));
  const len = A / w;
  return { mdot, A, D, Q, L: C.flameHeight(Q, D), stream: { w, len, L: lineFlameHeight(Q / len) } };
}

/** Volně hořící hromada dřeva: povrch polen A = 4m/(ρ b) (hranol o hraně b), hoří ~polovina povrchu (zbytek stíní). ★3 */
export function pileFire(mat, mass, stick = 0.08, exposed = 0.5) {
  const m = material(mat), f = FUELS[m.fuel];
  const As = (4 * mass) / ((f.rho || 450) * stick);
  const Qpeak = m.hrrpua * As * exposed;
  const E = mass * m.burnFrac * f.dHc;
  // doba hoření plamenem; pak lože uhlí (dalších ~2× tolik času žhne)
  return { As, Qpeak, E, duration: E / Qpeak, charTime: (stick / 2) / m.charRate };
}

/**
 * Jeden popis ohně. Vrací { kind, fuel, Q (číslo nebo funkce času [W]), Qpeak, D, L, duration [s], mass [kg],
 * footprint, extra (další volby zdroje), rows (řádky pro UI se zdrojem a ★) }.
 */
export function fireSpec(s) {
  const out = { kind: s.kind, extra: {}, rows: [] };
  const row = (a, b, c) => out.rows.push([a, b, c]);
  switch (s.kind) {
    case 'pool': {
      const f = FUELS[s.fuel], D = s.D ?? Math.sqrt((4 * s.area) / Math.PI), p = C.poolFire(s.fuel, D);
      const mass = s.volumeL != null ? (s.volumeL / 1000) * f.rho : (s.depth ?? 0.01) * p.A * f.rho;
      Object.assign(out, { fuel: s.fuel, Q: p.Q, Qpeak: p.Q, D, L: p.L, mass, mdot: p.mdot, duration: mass / p.mdot });
      row('Odhořívání', (p.m2 * 1000).toFixed(1) + ' g/m²s', 'Babrauskas ★4'); row('Pokles hladiny', ((p.m2 / f.rho) * 60000).toFixed(1) + ' mm/min', 'm″/ρ ★4');
      break;
    }
    case 'spill': {
      const sp = C.spillFire(s.fuel, s.volumeL, s.depthMM ?? 1.5);
      Object.assign(out, { fuel: s.fuel, Q: sp.Q, Qpeak: sp.Q, D: sp.D, L: sp.L, mass: sp.mass, mdot: sp.mdot, duration: sp.duration });
      row('Plocha', sp.A.toFixed(1) + ' m²', 'vrstva ' + (s.depthMM ?? 1.5) + ' mm ★3');
      break;
    }
    case 'leak': {
      const f = FUELS[s.fuel];
      const flow0 = s.flowLps ?? torricelli((s.holeMM ?? 9) / 1000, s.head ?? 0.5) * 1000;
      const lf = leakFire(s.fuel, flow0, s);
      const tankA = s.tankArea ?? 0.258, h0 = s.head ?? 0.5, hd = (s.holeMM ?? 9) / 1000;
      const dur = s.flowLps != null ? (s.volumeL ?? 100) / s.flowLps : drainTime(h0, hd, tankA);
      // průtok klesá s hladinou (√h); výkon ho sleduje se zpožděním naplnění vrstvy
      const flow = (t) => (s.flowLps != null ? (t < dur ? flow0 : 0) : torricelli(hd, drainHead(t, h0, hd, tankA)) * 1000);
      Object.assign(out, { fuel: s.fuel, Q: (t) => (flow(t) / 1000) * f.rho * f.dHc, Qpeak: lf.Q, D: lf.D, L: lf.L, mdot: lf.mdot, mass: (s.flowLps != null ? (s.volumeL ?? 100) / 1000 : tankA * h0) * f.rho, duration: dur, flow, stream: lf.stream, A: lf.A });
      row('Výtok', flow0.toFixed(2) + ' l/s', s.flowLps != null ? 'zadáno' : `Torricelli, otvor ${(hd * 1000).toFixed(0)} mm ★5`);
      row('Hořící plocha (rovnováha)', lf.A.toFixed(1) + ' m²', 'ṁ = m″·A ★3'); row('Vyteče za', (dur / 60).toFixed(0) + ' min', '★4');
      break;
    }
    case 'pile': {
      const m = material(s.material), p = pileFire(s.material, s.mass, s.stick ?? 0.08, s.exposed ?? 0.5);
      const D = s.D ?? Math.max(0.2, 0.95 * Math.cbrt(s.mass / 20)); // 20 kg týpí ≈ 0,95 m, objem ∝ hmotnost ★3
      const tg = s.tGrow ?? 60 + 240 * Math.cbrt(s.mass / 20), tau = 0.25 * p.duration, cur = { alpha: p.Qpeak / (tg * tg), Qpeak: p.Qpeak, tPlateau: Math.max(0, p.duration - tg / 3 - tau), tau };
      Object.assign(out, { fuel: m.fuel, Q: (t) => C.hrrCurve(t, cur), Qpeak: p.Qpeak, D, L: C.flameHeight(p.Qpeak, D), mass: s.mass, duration: C.hrrCurveEnd(cur), curve: cur });
      row('Hořící povrch polen', p.As.toFixed(1) + ' m² × ' + (s.exposed ?? 0.5), 'A = 4m/ρb ★3'); row('Prohoření polena', (p.charTime / 60).toFixed(0) + ' min', 'EN 1995-1-2 ★5');
      break;
    }
    case 'solid': {
      const of = objectFire(s.material, s), cur = { alpha: of.alpha, Qpeak: of.Qpeak, tPlateau: of.tPlateau, tau: of.tau };
      const D = s.D ?? Math.sqrt((4 * (s.footprintArea ?? s.area / 3)) / Math.PI);
      Object.assign(out, { fuel: of.fuel, Q: (t) => C.hrrCurve(t, cur), Qpeak: of.Qpeak, D, L: C.flameHeight(of.Qpeak, D), mass: s.mass, duration: of.duration, curve: cur });
      row('Výkon z povrchu', (material(s.material).hrrpua / 1000).toFixed(0) + ' kW/m²', 'SFPE ★3'); row('Rozhoření', of.tg.toFixed(0) + ' s', 'rozměr / rychlost šíření ★2');
      break;
    }
    case 'jet': {
      const f = FUELS[s.fuel], Q = s.Q ?? s.mdot * f.dHc, L = laminarFlameHeight(Q, s.fuel);
      if (s.turbulent ?? jetFlameLength(Q) < L) {
        // hybnost převládá nad vztlakem: delší, užší, hlučný plamen s modrou patou; saze až ve špičce
        const Lt = jetFlameLength(Q), mass = s.mass ?? 11;
        Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D: s.D ?? 0.13 * Lt, L: Lt, mdot: Q / f.dHc, mass, duration: mass / (Q / f.dHc) });
        out.extra = { L: (q) => jetFlameLength(q), T: f.Tflame + 150, blue: 1.2, taper: 0.5, shapeK: 1.25, neck: 0.05, puffAmp: 0.2, turbAmp: 1.3, volTongues: 0, mult: { smoke: f.ys > 0.02 ? 0.5 : 0.12, embers: 0, sparks: 0, haze: 1.3 } };
        row('Druh plamene', 'turbulentní tryskový', 'Lowesmith 2007 ★4'); row('Spotřeba', (out.mdot * 1000).toFixed(1) + ' g/s', 'Q/ΔHc ★4');
        break;
      }
      Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D: s.D ?? 0.006, L, mdot: Q / f.dHc, mass: s.mass ?? 0.0045, duration: (s.mass ?? 0.0045) / (Q / f.dHc) });
      out.extra = { L: (q) => laminarFlameHeight(q, s.fuel), T: 1500, blue: 4, taper: 0.55, baseWide: -0.15, neck: 0.5, puffAmp: 0.05, turbAmp: 0.02, wobble: 0.03, tongues: 3, lightH: 0.4, mult: { smoke: 0, embers: 0, sparks: 0, haze: 0.4 } };
      row('Spotřeba', (out.mdot * 1e6).toFixed(2) + ' mg/s', 'Q/ΔHc ★4');
      break;
    }
    case 'wick': {
      const f = FUELS[s.fuel], Q = s.Q ?? 80, L = laminarFlameHeight(Q, 'paraffin');
      Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D: s.D ?? 0.016, L, mdot: Q / f.dHc, mass: s.mass ?? 0.05, duration: (s.mass ?? 0.05) / (Q / f.dHc) });
      out.extra = { L: (q) => laminarFlameHeight(q, 'paraffin'), T: 1450, blue: 1, taper: 0.9, baseWide: -0.1, neck: 0.55, puffAmp: 0.12, turbAmp: 0.03, wobble: 0.04, tongues: 3, lightH: 0.4, mult: { smoke: 0.4, embers: 0, sparks: 0, haze: 0.5 } };
      break;
    }
    case 'line': {
      // hořící pruh, stopa nebo čelo: tenká vrstva kapaliny šířky w a délky len; výkon na metr Q′ a výška z Yuan & Cox
      const f = FUELS[s.fuel], w = s.width ?? 0.3, len = s.length ?? 5;
      const m2 = (s.thin ?? 0.5) * f.mInf * (1 - Math.exp(-f.kBeta * w)), Qm = s.Qper_m ?? m2 * w * f.dHc, Q = Qm * len;
      const mass = s.volumeL != null ? (s.volumeL / 1000) * f.rho : ((s.depthMM ?? 1) / 1000) * w * len * f.rho, v = liquidSpread(s.fuel);
      Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D: w, L: lineFlameHeight(Qm), mdot: Q / f.dHc, mass, duration: mass / (Q / f.dHc), length: len, width: w, spread: v, Qper_m: Qm });
      out.extra = { footprint: { type: 'rect', w: len, d: w * 1.15 }, shapeK: 1.45, taper: 0.6, puffAmp: 0.7 };
      row('Výkon na metr délky', (Qm / 1000).toFixed(0) + ' kW/m', 'tenká vrstva = ½ louže ★3'); row('Šíření po stopě', v >= 1 ? v.toFixed(1) + ' m/s' : (v * 100).toFixed(0) + ' cm/s', 'SFPE ★4');
      break;
    }
    case 'room': {
      // místnost s jedním otvorem: růst t², celkové vzplanutí (flashover), pak hoření řízené větráním; co se dovnitř nevejde, hoří venku
      const [fw, fd] = s.floor ?? [4, 3.5], H = s.H ?? 2.6, [ow, oh] = s.opening ?? [1.2, 1.4], Af = fw * fd;
      const Ao = ow * oh, AT = 2 * (Af + fw * H + fd * H) - Ao, c = C.compartment({ Ao, Ho: oh, AT });
      const f = FUELS[s.fuel ?? 'houseContents'] || FUELS.woodDry, load = s.load ?? 25;           // požární zatížení [kg dřeva na m²] ★3
      const E = load * Af * 17.5e6, Qfuel = (s.hrrpua ?? 250e3) * Af;                              // 250 kW/m² podlahy (byt) ★3
      const alpha = C.T2_ALPHA[s.growth ?? 'fast'], tFo = Math.sqrt(c.Qfo / alpha), Qpeak = Math.max(Qfuel, c.Qfo);
      const Qin = Math.min(Qpeak, c.Qmax), Qext = Math.max(0, Qpeak - c.Qmax);
      const R = Qpeak / 17.5e6, zf = windowFlameHeight(R, ow, oh);
      const tFull = Math.max(60, (E - (alpha * tFo ** 3) / 3) / Qpeak), tau = 0.2 * tFull;
      const Q = (t) => (t < tFo ? alpha * t * t : t < tFo + tFull ? Qpeak : Qpeak * Math.exp(-(t - tFo - tFull) / tau));
      Object.assign(out, { fuel: s.fuel ?? 'houseContents', Q, Qpeak, D: Math.sqrt((4 * Af) / Math.PI), L: C.flameHeight(Qpeak, Math.sqrt((4 * Af) / Math.PI)), mass: load * Af, duration: tFo + tFull + 3 * tau,
        room: { Qfo: c.Qfo, Qvent: c.Qmax, Qin, Qext, tFo, tFull, zf, Ao, AT, Ho: oh, R, ventLimited: Qfuel > c.Qmax, layerT: (q) => layerTemp(q, Ao, oh, AT) } });
      if (!FUELS[out.fuel]) out.fuel = 'woodDry';
      row('Celkové vzplanutí při', (c.Qfo / 1e6).toFixed(2) + ' MW, za ' + (tFo / 60).toFixed(1) + ' min', 'Thomas ★4'); row('Strop větráním', (c.Qmax / 1e6).toFixed(2) + ' MW', '1 500·A√H ★4');
      row('Hoří venku před oknem', (Qext / 1e6).toFixed(2) + ' MW', 'přebytek paliva ★3'); row('Plamen nad oknem', zf.toFixed(1) + ' m', 'Law ★3');
      break;
    }
    case 'metal': {
      // hořící kov nebo termit: energie z hmotnosti, doba z rychlosti reakce (termit sekundy, hořčík minuty) ★2
      const f = FUELS[s.fuel], mass = s.mass ?? 1, dur = s.duration ?? (s.fuel === 'thermite' ? 12 : 90) * Math.cbrt(mass), Q = (mass * f.dHc) / dur;
      const D = s.D ?? (s.fuel === 'thermite' ? 0.12 : 0.25) * Math.cbrt(mass);
      Object.assign(out, { fuel: s.fuel, Q, Qpeak: Q, D, L: s.fuel === 'thermite' ? 0.35 * Math.cbrt(mass) : Math.min(C.flameHeight(Q, D), 0.6 * Math.cbrt(mass) + 0.1), mdot: mass / dur, mass, duration: dur });
      out.extra = { L: () => out.L, T: f.Tflame, taper: 0.7, puffAmp: 0.3, turbAmp: 0.9, volTongues: 0, mult: { smoke: 2.2, embers: 1, sparks: s.fuel === 'thermite' ? 10 : 5, haze: 1.5 } };
      row('Teplota', (f.Tflame - 273).toFixed(0) + ' °C', '★4'); row('Voda', 'požár zhorší (vodík, výbuch páry)', 'třída D');
      break;
    }
    default: throw new Error('fireSpec: neznámý druh ' + s.kind);
  }
  const f = FUELS[out.fuel];
  out.rows.unshift(['Druh ohně', { pool: 'louže v nádobě', spill: 'rozlitá kapalina', leak: 'vytékající kapalina', pile: 'hromada dřeva', solid: 'hořící předmět', jet: 'plamen z trysky', wick: 'plamen knotu', line: 'hořící pruh / stopa', room: 'místnost s otvorem', metal: 'hořící kov' }[s.kind], 'fireSpec'],
    ['Hmotnost paliva', out.mass >= 1 ? out.mass.toFixed(1) + ' kg' : (out.mass * 1000).toFixed(1) + ' g', ''], ['Doba hoření', out.duration >= 120 ? (out.duration / 60).toFixed(0) + ' min' : out.duration.toFixed(0) + ' s', 'm·ΔHc / Q']);
  out.chiR = f.chiR;
  return out;
}

/** Měřítko ohně: k-násobný výkon při stejné plošné hustotě (D ∝ √k). Doba hoření se nemění (palivo ∝ plocha). */
export function scaleFire(sp, k) {
  const Q0 = sp.Q, D = sp.D * Math.sqrt(k), Qpeak = sp.Qpeak * k;
  return { ...sp, Q: typeof Q0 === 'function' ? (t) => Q0(t) * k : Q0 * k, Qpeak, D, L: sp.extra?.L ? sp.extra.L(Qpeak) : C.flameHeight(Qpeak, D), mass: sp.mass * k };
}

/** Volby zdroje pro FXWorld.addSource z popisu. */
export function sourceOptions(sp, more = {}) {
  return { fuel: sp.fuel, Q: sp.Q, D: sp.D, ...(Number.isFinite(sp.duration) ? { end: sp.duration } : {}), ...sp.extra, ...more };
}

// =============================================================================================== výbuchy
// Mocninné zákony mezi dvěma kalibračními body: v = v1·(W/W1)^p, p z druhého bodu. Hopkinson–Cranzovo měřítko říká,
// že délky jdou s W^⅓ a plochy s W^⅔; kalibrační body jsou ručně vyladěné předvolby (granát 0,24 kg a 1 t TNT),
// takže obecná funkce jimi prochází přesně a mezi nimi i za nimi drží fyzikální exponenty.
const A_HE = 0.18 * 1.33, B_HE = 1000;
const pw = (W, v1, v2, W1 = A_HE, W2 = B_HE) => v1 * Math.pow(W / W1, Math.log(v2 / v1) / Math.log(W2 / W1));
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Poloměr kráteru výbuchu na povrchu suché zeminy: R ≈ 0,4·W^⅓ [m] (TM 5-855-1, řád). ★3 */
export const craterRadius = (W) => 0.4 * Math.cbrt(W);

/**
 * Jeden popis výbuchu → volby Explosion + doprovodné ohně.
 *  { kind: 'he', explosive: 'tnt' | 'compB', mass [kg], cased: bool }            trhavina (granát … tuny)
 *  { kind: 'fireball', fuel: 'gasoline', mass [kg zapojeného paliva], film }      roztržení nádoby s hořlavou kapalinou
 *  { kind: 'gasMix', gas: 'acetyleneO2', mass [kg plynu] }                        detonace směsi plynu s kyslíkem
 *  { kind: 'gasCylinder', gasMass, solventMass, shellMass, V, burstP }            tlaková láhev (acetylen) v požáru
 *  { kind: 'gasCylinder', …, film: true }                                          totéž „jako ve filmu“ (umělecké zvětšení)
 *  { kind: 'dust', mass [kg rozvířeného prachu], confined: bool }                   výbuch prachu (mouka, piliny, uhlí)
 *  { kind: 'vapor', fuel, mass [kg par ve směsi], confined: 0..1 }                  výbuch oblaku par nebo plynu
 *  { kind: 'pyro', caliber [mm], color }                                            pyrotechnická kulová puma (ohňostroj)
 */
export function explosionSpec(s) {
  const rows = [];
  if (s.kind === 'he') {
    const e = EXPLOSIVES[s.explosive ?? 'tnt'], W = s.mass * e.eqP, fb = heFireball(W), k = Math.log(W / A_HE) / Math.log(B_HE / A_HE), kc = Math.min(1, Math.max(0, k));
    const big = W >= 100;
    const ex = {
      W, flash: pw(W, 2e6, 6e8), scorch: pw(W, 1.4, 26), dust: true, dustAlbedo: mixc([0.32, 0.27, 0.2], [0.36, 0.3, 0.22], kc),
      crater: W >= 5 ? 1 : 0,
      fireball: { D: fb.D, t: fb.t, T: 2600 - 200 * kc, soot: 1, ...(W > 20 ? { rise: 30 * Math.cbrt(W / 1000) } : {}) },
      smoke: { n: Math.round(pw(W, 140, 1400)), life: pw(W, 7, 50), albedo: mixc([0.11, 0.1, 0.095], [0.09, 0.085, 0.08], kc), tau: pw(W, 1.6, 3), buoy: pw(W, 0.7, 14), buoyAcc: pw(W, 0.25, 5), ...(big ? { dur: 4 * Math.cbrt(W / 1000) } : {}) },
      // střepiny pláště (malé, rychlé, žhavé) × vyvržená zemina (velké, pomalé)
      debris: s.cased ? { n: Math.round(pw(W, 160, 600)), speed: 300, size: 0.006 * Math.cbrt(W / A_HE), hot: 0.9, up: 0.25, T: 1100 }
        : { n: Math.round(pw(W, 90, 700)), speed: pw(W, 35, 140), size: pw(W, 0.02, 0.35), hot: 0.25, up: 0.55, T: 1300 },
      sparks: { n: Math.round(pw(W, 220, 900)), speed: pw(W, 70, 120) },
      ...(big ? { life: pw(W, 12, 70), mushroom: true } : {}), ...(W >= 300 ? { ring: true, wilson: 2.5 } : {}),
    };
    rows.push(['Nálož', `${s.mass} kg ${e.name}`, ''], ['TNT ekvivalent', W.toFixed(2) + ' kg', '★4'], ['Ohnivá koule', fb.D.toFixed(1) + ' m / ' + (fb.t * 1000).toFixed(0) + ' ms', 'objem zplodin ★2'], ['Kráter', craterRadius(W).toFixed(2) + ' m', 'TM 5-855 ★3']);
    return { W, ex, fires: [], dy: Math.min(0.6, 0.05 + 0.05 * Math.cbrt(W)), rows };
  }
  if (s.kind === 'fireball') {
    const M = s.mass, fb = bleveFireball(M), q = M / 25, film = !!s.film;
    const ex = {
      W: film ? 4 * q : 0.05 * q, flash: 2e6 * Math.pow(q, 2 / 3), scorch: 6 * Math.cbrt(q), dust: film,
      fireball: { D: fb.D * (film ? 1.2 : 1), t: fb.t, T: 1650, rise: fb.H, soot: 0.6 },
      smoke: { n: Math.round(500 * Math.pow(q, 0.28)), life: 16 * Math.pow(q, 0.2), albedo: [0.07, 0.065, 0.06], tau: 2.5, buoy: 6 * Math.pow(q, 1 / 6), buoyAcc: 2 * Math.pow(q, 1 / 6) },
      debris: { n: film ? 120 : 14, speed: film ? 40 : 18, size: 0.12, hot: 0.5, up: 0.6, T: 1200 }, sparks: { n: Math.round(300 * Math.cbrt(q)), speed: 12 },
    };
    const pool = { fuel: s.fuel ?? 'gasoline', Q: (t) => 6e6 * Math.pow(q, 2 / 3) * Math.max(0, 1 - t / (26 * Math.cbrt(q))), D: 3.5 * Math.cbrt(q), start: 0.4, end: 26 * Math.cbrt(q) };
    rows.push(['Zapojené palivo', M + ' kg', 'předpoklad ★2'], ['Ohnivá koule D', fb.D.toFixed(1) + ' m', 'CCPS ★4'], ['Trvání', fb.t.toFixed(2) + ' s', 'CCPS ★4']);
    return { W: ex.W, ex, fires: [pool], dy: 0.4, rows };
  }
  if (s.kind === 'gasMix') {
    const W = gasTNT(s.mass, s.gas ?? 'acetyleneO2'), fb = heFireball(W);
    const ex = { W, flash: 3e6 * Math.pow(s.mass / 0.015, 2 / 3), scorch: 0.9 * Math.cbrt(s.mass / 0.015), dust: true, dustAlbedo: [0.3, 0.3, 0.25], fireball: { D: fb.D, t: fb.t, T: 3000, soot: 0 }, smoke: { n: 60, life: 4, albedo: [0.75, 0.75, 0.77], tau: 0.25, buoy: 1.5 }, debris: { n: 24, speed: 30, size: 0.03, hot: 0.2, up: 0.5 }, sparks: { n: 80, speed: 25 } };
    rows.push(['TNT ekvivalent', (W * 1000).toFixed(0) + ' g', 'účinnost 45 % ★2']);
    return { W, ex, fires: [], dy: 0.4, rows };
  }
  if (s.kind === 'gasCylinder') {
    // Acetylenová láhev v požáru (Jankůj & Mynarz 2022, VŠB; HSE; BCGA): plášť se roztrhne na 2 a více kusů, uvolněný plyn
    // vzplane v ohnivou kouli ~10 m, úlomky létají stovky metrů (bezpečnostní zóna 200 m). Nedetonuje jako trhavina.
    const gasMass = s.gasMass ?? 7, solv = s.solventMass ?? 14, shell = s.shellMass ?? 65, V = s.V ?? 0.05, P = s.burstP ?? 8e6;
    const Eburst = (P * V * 0.4) / (1.23 - 1);                 // Brode, volný plyn ~40 % objemu (porézní hmota + aceton) ★2
    const Wburst = Eburst / TNT_J_PER_KG, Wdefl = (0.02 * gasMass * FUELS.acetylene.dHc) / TNT_J_PER_KG; // 2 % energie oblaku do tlaku ★2
    const W = Wburst + Wdefl, M = gasMass + 0.3 * solv, fb = bleveFireball(M);
    const vFrag = Math.sqrt((2 * 0.3 * Eburst) / shell);        // 30 % energie roztržení do úlomků ★2
    const ex = {
      W, flash: 5e6, scorch: 5, dust: true, dustAlbedo: [0.3, 0.27, 0.22],
      fireball: { D: fb.D, t: fb.t, T: 1800, rise: fb.H * 0.8, soot: 0.9 },
      smoke: { n: 420, life: 15, albedo: [0.045, 0.042, 0.04], tau: 3.4, buoy: 5, buoyAcc: 1.8 },
      debris: { n: 46, speed: vFrag * 0.6, size: 0.09, hot: 0.6, up: 0.5, T: 1200 }, sparks: { n: 420, speed: 28 },
    };
    const fires = [{ fuel: 'acetone', Q: (t) => 1.6e6 * Math.max(0, 1 - t / 40), D: 2.2, start: 0.5, end: 40 }];
    rows.push(['Náplň', `${gasMass} kg C₂H₂ v ${solv} kg acetonu`, 'láhev 50 l ★4'], ['Energie roztržení', (Eburst / 1e6).toFixed(2) + ' MJ', 'Brode ★2'],
      ['TNT ekvivalent', W.toFixed(1) + ' kg (rozsah 0,2–4)', 'roztržení + deflagrace ★2'], ['Ohnivá koule', fb.D.toFixed(1) + ' m / ' + fb.t.toFixed(2) + ' s', 'CCPS ★4; pokusy ~10 m'],
      ['Úlomky pláště', vFrag.toFixed(0) + ' m/s, dolet stovky m', 'zóna 200 m (HSE) ★4']);
    if (s.film) {
      // „Jako ve filmu“: pyrotechnici přidávají benzín a zpomalení. Větší, déle hořící, oranžová koule, víc jisker a trosek,
      // viditelný prstenec prachu. Tlaková vlna a úlomky se NEMĚNÍ (zůstávají fyzikální). Umělecké ★1.
      Object.assign(ex, { flash: 1.6e7, scorch: 8, ring: true, fireball: { D: fb.D * 1.55, t: fb.t * 1.7, T: 1700, rise: fb.H * 1.2, soot: 0.55 },
        smoke: { ...ex.smoke, n: 760, life: 22, tau: 3.0, buoy: 7 }, debris: { ...ex.debris, n: 130 }, sparks: { n: 1500, speed: 34 } });
      fires.push({ fuel: 'gasoline', Q: (t) => 5e6 * Math.max(0, 1 - t / 30), D: 3.6, start: 0.3, end: 30 });
      rows.push(['Filmová varianta', `koule ${(fb.D * 1.55).toFixed(0)} m / ${(fb.t * 1.7).toFixed(1)} s, + benzín`, 'umělecké ★1']);
    }
    return { W, ex, fires, dy: 0.5, rows, vFrag, Eburst, fb };
  }
  if (s.kind === 'dust') {
    // Oblak v hořlavé koncentraci ~0,5 kg/m³ (dolní mez mouky 60 g/m³, optimum 250–750 g/m³) → průměr oblaku; spaliny se
    // roztáhnou ~7× → ohnivá koule ≈ 1,9 × oblak. Volný oblak dá do tlaku jen ~0,5 % energie, v silu s odlehčením ~10 %. ★2–3
    const M = s.mass, f = FUELS[s.fuel ?? 'flourDust'], Dc = Math.cbrt((6 * (M / 0.5)) / Math.PI), D = 1.9 * Dc, t = 0.5 * Math.cbrt(M) + 0.2;
    const W = ((s.confined ? 0.1 : 0.005) * M * f.dHc) / TNT_J_PER_KG, q = Math.cbrt(M);
    const ex = { W, flash: 8e5 * q * q, scorch: 1.1 * q, dust: !!s.confined, dustAlbedo: [0.5, 0.46, 0.38],
      fireball: { D, t, T: 1500, rise: 0.7 * D, soot: 0.35 },
      smoke: { n: Math.round(160 * Math.pow(M, 0.3)), life: 7 + 3 * q, albedo: [0.3, 0.27, 0.23], tau: 1.1, buoy: 2.5 + q, buoyAcc: 0.8 },
      debris: s.confined ? { n: 70, speed: 22, size: 0.12, hot: 0.15, up: 0.55, T: 900 } : { n: 0, speed: 1, size: 0.01, hot: 0, up: 0.5 }, sparks: { n: Math.round(160 * q), speed: 7 } };
    rows.push(['Rozvířený prach', M + ' kg ' + f.name, 'oblak ~0,5 kg/m³ ★3'], ['Ohnivá koule', D.toFixed(1) + ' m / ' + t.toFixed(1) + ' s', 'rozpínání spalin ×7 ★2'],
      ['TNT ekvivalent', W < 1 ? (W * 1000).toFixed(0) + ' g' : W.toFixed(1) + ' kg', s.confined ? 'uzavřený prostor, 10 % ★2' : 'volný oblak, 0,5 % ★2'], ['V uzavřeném silu', 'až 7–9 bar, K_St 100–200 bar·m/s', 'třída St 1 ★4']);
    return { W, ex, fires: [], dy: 0.5 * D * 0.5, rows, fb: { D, t } };
  }
  if (s.kind === 'vapor') {
    // Výbuch oblaku par: metoda TNT ekvivalentu, účinnost 3 % volně, ~10 % mezi překážkami (CCPS ★3); oheň proběhne oblakem jako „flash fire“
    const f = FUELS[s.fuel ?? 'gasoline'], M = s.mass, c = Math.min(1, Math.max(0, s.confined ?? 0)), eta = 0.03 + 0.07 * c;
    const W = (eta * M * f.dHc) / TNT_J_PER_KG, fb = bleveFireball(M), q = Math.cbrt(M);
    const ex = { W, flash: 2.5e6 * q * q, scorch: 2.2 * q, dust: true, dustAlbedo: [0.33, 0.29, 0.22],
      fireball: { D: fb.D * 0.85, t: fb.t * 0.7, T: 1750, rise: fb.H * 0.6, soot: (f.ys ?? 0.03) > 0.03 ? 0.6 : 0.25 },
      smoke: { n: Math.round(260 * Math.pow(M, 0.28)), life: 10 + 3 * q, albedo: [0.1, 0.095, 0.09], tau: 1.8, buoy: 4 + q, buoyAcc: 1.4 },
      debris: { n: Math.round(20 + 80 * c), speed: 15 + 40 * c, size: 0.08, hot: 0.3, up: 0.5, T: 1000 }, sparks: { n: Math.round(200 * q), speed: 14 } };
    rows.push(['Páry ve směsi', M + ' kg ' + f.name, ''], ['TNT ekvivalent', W.toFixed(2) + ' kg', `účinnost ${(eta * 100).toFixed(0)} % (CCPS) ★3`], ['Ohnivá koule', (fb.D * 0.85).toFixed(1) + ' m / ' + (fb.t * 0.7).toFixed(1) + ' s', 'CCPS ★3']);
    return { W, ex, fires: [], dy: 0.6, rows, fb };
  }
  if (s.kind === 'pyro') {
    // Kulová puma: výška rozprasku ~1,2 m na mm ráže (100 stop na palec), průměr květu ~0,54 m na mm (45 stop na palec),
    // hmotnost ~1,1 kg·(ráže/100)³, výmetná náplň ~1/12 hmotnosti, zpožďovač 3–6 s. Pravidla pyrotechniků ★3.
    const cal = s.caliber ?? 100, k = cal / 100, mass = 1.1 * k ** 3, H = 1.2 * cal, R = 0.27 * cal;
    const v0 = 1.25 * Math.sqrt(2 * 9.81 * H), tLift = 0.9 * Math.sqrt((2 * H) / 9.81), burn = 2.2 * Math.sqrt(k) + 0.6;
    const COLORS = { red: [[1, 0.1, 0.06], 'stroncium'], green: [[0.15, 1, 0.22], 'baryum'], blue: [[0.2, 0.36, 1], 'měď'], yellow: [[1, 0.78, 0.12], 'sodík'],
      purple: [[0.72, 0.22, 1], 'stroncium + měď'], gold: [[1, 0.62, 0.2], 'dřevěné uhlí a železo (žhnoucí jiskry)'], white: [[1, 0.96, 0.9], 'hořčík / hliník / titan'] };
    const [tint, salt] = COLORS[s.color ?? 'red'] ?? COLORS.red;
    const W = (0.06 * mass * 2.8e6) / TNT_J_PER_KG; // trhací náplň ~6 % hmotnosti, černý prach 2,8 MJ/kg ★3
    rows.push(['Ráže / hmotnost', `${cal} mm / ${mass.toFixed(2)} kg`, '★3'], ['Výška rozprasku', H.toFixed(0) + ' m za ' + tLift.toFixed(1) + ' s', '1,2 m na mm ★3'],
      ['Průměr květu', (2 * R).toFixed(0) + ' m', '0,54 m na mm ★3'], ['Barva', `${salt}`, 'čárové spektrum, ne teplota ★5'], ['Hvězdice', Math.round(70 * k * k) + ' ks, hoří ' + burn.toFixed(1) + ' s', '★2']);
    return { W, H, R, v0, tLift, burn, stars: Math.round(70 * k * k), starV: R / (0.45 * burn), tint, salt, mass, rows, ex: null, fires: [] };
  }
  throw new Error('explosionSpec: neznámý druh ' + s.kind);
}
