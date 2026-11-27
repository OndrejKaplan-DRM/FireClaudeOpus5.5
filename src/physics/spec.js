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
// Měřítko: scaleFire(spec, k) – k-násobný výkon při stejné plošné hustotě výkonu (D ∝ √k, L z Heskestada).
import * as C from './combustion.js';
import { FUELS, EXPLOSIVES, TNT_J_PER_KG } from './fuels.js';
import { material } from './materials.js';
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
    default: throw new Error('fireSpec: neznámý druh ' + s.kind);
  }
  const f = FUELS[out.fuel];
  out.rows.unshift(['Druh ohně', { pool: 'louže v nádobě', spill: 'rozlitá kapalina', leak: 'vytékající kapalina', pile: 'hromada dřeva', solid: 'hořící předmět', jet: 'plamen z trysky', wick: 'plamen knotu' }[s.kind], 'fireSpec'],
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
    return { W, ex, fires, dy: 0.5, rows, vFrag, Eburst, fb };
  }
  throw new Error('explosionSpec: neznámý druh ' + s.kind);
}
