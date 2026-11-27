// Plamen, oblak (plume), kouř a vliv kyslíku. Jednotky SI (Q ve W), interně kW tam, kde to korelace vyžadují.
import { FUELS } from './fuels.js';

export const AMB = { T: 293, rho: 1.2, cp: 1005, g: 9.81, P: 101325 };

/** Výška plamene — Heskestad (1983), L = 0,235 Q^(2/5) − 1,02 D [m, kW]. ★★★★★ (platí ~ pro D > 0,1 m) */
export function flameHeight(Q, D) {
  const L = 0.235 * Math.pow(Q / 1000, 0.4) - 1.02 * D;
  return Math.max(L, 0.05 * D + 0.01);
}

/** Virtuální počátek oblaku — Heskestad: z0 = 0,083 Q^(2/5) − 1,02 D. ★★★★ */
export function virtualOrigin(Q, D) { return 0.083 * Math.pow(Q / 1000, 0.4) - 1.02 * D; }

/**
 * Osa oblaku nad plamenem — Heskestad: ΔT0 = 25 (Qc^(2/5)/(z−z0))^(5/3), u0 = 1,0 Qc^(1/3) (z−z0)^(−1/3)
 * [K, m/s; Qc v kW]. V plameni omezeno na ~900 K (McCaffrey: souvislá zóna ~800–900 K). ★★★★
 */
export function plumeAxis(Q, D, z, chiR = 0.3) {
  const Qc = ((1 - chiR) * Q) / 1000;
  const z0 = virtualOrigin(Q, D);
  const dz = Math.max(z - z0, 0.02);
  const dT = Math.min(25 * Math.pow(Math.pow(Qc, 0.4) / dz, 5 / 3), 900);
  const L = flameHeight(Q, D);
  // v souvislé zóně plamene rychlost roste ~ √z (McCaffrey), nad ní klesá
  const uAbove = 1.0 * Math.pow(Qc, 1 / 3) * Math.pow(dz, -1 / 3);
  const u = z < L ? Math.min(uAbove, 1.9 * Math.pow(Qc, 0.2) * Math.sqrt(Math.max(z, 0.01) / Math.pow(Qc, 0.4)) + 0.3) : uAbove;
  const b = 0.12 * Math.sqrt((AMB.T + dT) / AMB.T) * dz; // poloměr oblaku (1/e ΔT) ★★★★
  return { dT, u, b, z0 };
}

/** Hmotnostní tok oblaku nad plamenem — Heskestad [kg/s]. ★★★★ */
export function plumeMassFlow(Q, D, z, chiR = 0.3) {
  const Qc = ((1 - chiR) * Q) / 1000;
  const dz = Math.max(z - virtualOrigin(Q, D), 0.05);
  return 0.071 * Math.pow(Qc, 1 / 3) * Math.pow(dz, 5 / 3) * (1 + 0.026 * Math.pow(Qc, 2 / 3) * Math.pow(dz, -5 / 3));
}

/** Frekvence pulzace (puffing) plamene f ≈ 1,5 / √D [Hz] — Cetegen & Ahmed (1993), Pagni. ★★★★ */
export function puffingFrequency(D) { return 1.5 / Math.sqrt(Math.max(D, 0.004)); }

/** Louže — Babrauskas: m'' = m''∞ (1 − e^(−kβ D)). ★★★★ */
export function poolFire(fuel, D) {
  const f = typeof fuel === 'string' ? FUELS[fuel] : fuel;
  const A = (Math.PI * D * D) / 4;
  const m2 = f.mInf * (1 - Math.exp(-f.kBeta * D));
  const mdot = m2 * A;
  const Q = mdot * f.dHc;
  return { A, m2, mdot, Q, L: flameHeight(Q, D) };
}

/**
 * Rozlitá kapalina bez ohrazení: tloušťka vrstvy δ na hladkém betonu ~ 1–2 mm (Gottuk & White, SFPE; ★★★).
 * Tenká vrstva hoří pomaleji než hluboká louže (chlazení podkladem) – faktor ~0,5 (★★).
 */
export function spillFire(fuel, volumeL, depthMM = 1.5) {
  const f = FUELS[fuel];
  const V = volumeL / 1000, A = V / (depthMM / 1000);
  const D = Math.sqrt((4 * A) / Math.PI);
  const p = poolFire(f, D);
  const thin = 0.5;
  const mdot = p.mdot * thin, Q = mdot * f.dHc;
  const mass = V * f.rho;
  return { A, D, mdot, Q, L: flameHeight(Q, D), duration: mass / mdot, mass };
}

/**
 * Ekvivalenční poměr Φ z „kyslíku" (UI 0..1): 1 = volný prostor (Φ ≈ 0,5), 0 = silně nedostatečná ventilace (Φ ≈ 3).
 * Vliv na výtěžky — zjednodušená Tewarsonova/Gottuk–Lattimerova závislost: saze ×(1..3), CO až ~0,2 kg/kg,
 * účinnost spalování χ klesá ~1/Φ nad stechiometrií. ★★ (tvar křivky je kvalitativně správný, čísla řádová)
 */
export function ventilation(o2) {
  const phi = 0.5 + (1 - o2) * 2.5;
  const sg = (p) => 1 / (1 + Math.exp(-4 * (p - 1.3)));
  const s = (sg(phi) - sg(0.5)) / (1 - sg(0.5)); // 0 při volném prostoru
  return {
    phi,
    sootMul: 1 + 2.0 * s,
    coYield: 0.004 + 0.2 * s,
    chi: phi <= 1 ? 1 : Math.max(0.35, 1 / Math.pow(phi, 0.8)),
    tempDrop: 300 * s, // K – chladnější, temnější oranžová/červená
    lift: s, // „hledání vzduchu" – plameny se odlepují a vlní, zvětšují objem
  };
}

/** Hmotnostní extinkční koeficient sazí σs ≈ 8,7 m²/g (Mulholland & Croarkin 2000). ★★★★ */
export const SOOT_SIGMA = 8700; // m²/kg

/**
 * Optická tloušťka kouřového sloupce napříč osou ve výšce z: τ = σs · c_soot · 2b. ★★★ (řádově)
 */
export function smokeOpticalDepth(Q, D, z, fuel, vent) {
  const f = FUELS[fuel];
  const mdotF = Q / f.dHc;
  const ys = f.ys * vent.sootMul;
  const mp = plumeMassFlow(Q, D, z, f.chiR);
  const { dT, b } = plumeAxis(Q, D, z, f.chiR);
  const rho = (AMB.rho * AMB.T) / (AMB.T + dT);
  const cs = ((ys * mdotF) / mp) * rho; // kg/m³
  return { tau: SOOT_SIGMA * cs * 2 * b, cs, b };
}

/**
 * Albedo kouře (jednorozptylové): saze ~0,2–0,3, vodní mlha ~0,95, dehet ~ hnědá.
 * Vrací lineární RGB a „sootiness" 0..1. Kalibrováno vizuálně (★★ umělecké, kvalitativně podložené).
 */
export function smokeColor(fuel, vent) {
  const f = FUELS[fuel];
  const soot = Math.min(1, f.ys * vent.sootMul * 9);
  const white = [0.82, 0.83, 0.85], tar = [0.36, 0.29, 0.2], black = [0.05, 0.047, 0.045];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  let c = mix([0.5, 0.5, 0.5], white, f.water);
  c = mix(c, tar, f.tar * 0.6);
  c = mix(c, black, soot);
  return { rgb: c, soot };
}

/**
 * Světelný výkon plamene. Svíčka ≈ 1 cd při ~80 W → účinnost ~0,16 lm/W (definice kandely). ★★★★
 * Pro sazové plameny škálujeme podle teploty (víc sazí ve vyšší T → víc světla). ★★
 */
export function flameLuminousIntensity(Q, T = 1300) {
  const eff = 0.16 * Math.pow(T / 1300, 4);
  return (Q * eff) / (4 * Math.PI); // cd
}

/** Teplota svítivé zóny pro barvu: palivo − pokles při nedostatku O₂ ± pulzace. */
export function flameColorTemp(fuel, vent) { return FUELS[fuel].Tflame - vent.tempDrop; }

/** Křivka HRR t²: Q = α t² do Qpeak, pak plato a exponenciální útlum. ★★★★ (NFPA 72 třídy růstu) */
export const T2_ALPHA = { slow: 0.00293e3, medium: 0.01172e3, fast: 0.0469e3, ultrafast: 0.1876e3 }; // W/s²
export function hrrCurve(t, { alpha, Qpeak, tPlateau, tau }) {
  const tg = Math.sqrt(Qpeak / alpha);
  if (t < tg) return alpha * t * t;
  if (t < tg + tPlateau) return Qpeak;
  return Qpeak * Math.exp(-(t - tg - tPlateau) / tau);
}
export function hrrCurveEnd(c) { return Math.sqrt(c.Qpeak / c.alpha) + c.tPlateau + 3 * c.tau; }

/** Kompartment: ventilací řízený požár Kawagoe Qmax ≈ 1500 Ao √Ho [kW]; flashover Thomas Qfo = 7,8 AT + 378 Ao √Ho [kW]. ★★★★ */
export function compartment({ Ao, Ho, AT }) {
  const vf = Ao * Math.sqrt(Ho);
  return { Qmax: 1.5e6 * vf, Qfo: (7.8 * AT + 378 * vf) * 1000 };
}
