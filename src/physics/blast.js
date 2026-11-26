// Výbuchy: tlaková vlna, ohnivá koule, střepiny.
import { AMB } from './combustion.js';
import { EXPLOSIVES, TNT_J_PER_KG } from './fuels.js';

/** Škálovaná vzdálenost Z = R / W^(1/3) [m/kg^(1/3)] */
export const scaled = (R, W) => R / Math.cbrt(W);

/**
 * Přetlak čela rázové vlny (volný vzduch) — Kinney & Graham (1985):
 * Ps/Pa = 808 [1 + (Z/4,5)²] / √(1+(Z/0,048)²) √(1+(Z/0,32)²) √(1+(Z/1,35)²). ★★★★
 * Výbuch na zemi: W_eff ≈ 1,8 W (odraz od povrchu, hemisférická vlna). ★★★
 */
export function overpressure(R, W, surface = true) {
  const We = surface ? 1.8 * W : W;
  const Z = scaled(R, We);
  const r = (808 * (1 + (Z / 4.5) ** 2)) /
    (Math.sqrt(1 + (Z / 0.048) ** 2) * Math.sqrt(1 + (Z / 0.32) ** 2) * Math.sqrt(1 + (Z / 1.35) ** 2));
  return r * AMB.P; // Pa
}

/** Doba kladné fáze — Kinney & Graham [s]. ★★★ */
export function positivePhase(R, W, surface = true) {
  const We = surface ? 1.8 * W : W;
  const Z = scaled(R, We);
  const td = (980 * (1 + (Z / 0.54) ** 10)) /
    ((1 + (Z / 0.02) ** 3) * (1 + (Z / 0.74) ** 6) * Math.sqrt(1 + (Z / 6.9) ** 2));
  return (td * Math.cbrt(We)) / 1000;
}

/** Rychlost čela rázové vlny (Rankine–Hugoniot, γ=1,4): Us = c0 √(1 + 6Ps/(7P0)). ★★★★★ */
export function shockSpeed(Ps) { return 343 * Math.sqrt(1 + (6 * Ps) / (7 * AMB.P)); }

/** Tabulka R → t příchodu (integrace dR/dt = Us), Ps, td. Pro animaci rázové vlny. */
export function shockTable(W, Rmax, surface = true, n = 200) {
  const out = [];
  let t = 0, Rprev = 0.05 * Math.cbrt(W);
  for (let i = 0; i <= n; i++) {
    const R = Rprev + ((Rmax - Rprev) * i) / n;
    const Ps = overpressure(R, W, surface);
    if (i > 0) t += (R - out[i - 1].R) / shockSpeed(Ps);
    out.push({ R, t, Ps, td: positivePhase(R, W, surface) });
  }
  return out;
}

/** Interpolace poloměru čela v čase t. */
export function shockRadiusAt(table, t) {
  if (t <= 0) return 0;
  for (let i = 1; i < table.length; i++) {
    if (table[i].t >= t) {
      const a = table[i - 1], b = table[i], k = (t - a.t) / (b.t - a.t);
      return { R: a.R + (b.R - a.R) * k, Ps: a.Ps + (b.Ps - a.Ps) * k };
    }
  }
  const l = table[table.length - 1];
  return { R: l.R + (t - l.t) * 343, Ps: l.Ps };
}

/** Účinky přetlaku (orientační, Glasstone & Dolan; Baker): ★★★ */
export const DAMAGE = [
  { Ps: 1e3, txt: 'rozbitá okna (část)' },
  { Ps: 7e3, txt: 'okna rozbitá, lehké poškození střech' },
  { Ps: 16e3, txt: 'poškození lehkých konstrukcí, prasklé ušní bubínky ~1 %' },
  { Ps: 35e3, txt: 'zničení dřevostaveb, ušní bubínky ~50 %' },
  { Ps: 100e3, txt: 'poškození plic, převrácení aut' },
  { Ps: 200e3, txt: 'letální práh plic ~1 %' },
];
export function damageAt(Ps) { let t = '—'; for (const d of DAMAGE) if (Ps >= d.Ps) t = d.txt; return t; }

/**
 * Ohnivá koule BLEVE / kapalných uhlovodíků — CCPS (1994): Dmax = 5,8 M^(1/3), t = 0,45 M^(1/3) (M < 30 t),
 * výška středu H ≈ 0,75 Dmax. ★★★★
 */
export function bleveFireball(M) {
  const D = 5.8 * Math.cbrt(M);
  return { D, t: 0.45 * Math.cbrt(M), H: 0.75 * D, SEP: 350e3 };
}

/**
 * Ohnivá koule vysoké výbušniny: produkty detonace (~8 m³/kg za horka) → D ≈ 2,5 W^(1/3) [m],
 * svítivá doba ~0,05 W^(1/3) s. ★★ (odhad z objemu produktů, ověřit proti záznamům zkoušek)
 */
export function heFireball(W) { return { D: 2.5 * Math.cbrt(W), t: 0.05 * Math.cbrt(W) + 0.02, T: 2300 }; }

/** Gurneyho rychlost střepin — koule: V = √(2E) (M/C + 3/5)^(−1/2). ★★★★ */
export function gurneySphere(sqrt2E, M, C) { return sqrt2E / Math.sqrt(M / C + 0.6); }

/** TNT ekvivalent pro plynnou směs: W = η · m · ΔHc / E_TNT. ★★★ (η = podíl energie v rázové vlně) */
export function gasTNT(massKg, kind) {
  const e = EXPLOSIVES[kind];
  return (e.eff * massKg * e.dHc) / TNT_J_PER_KG;
}

/** Souhrn výbuchu pro UI: tabulka přetlaků a dob na vzdálenostech. */
export function blastSummary(W, distances = [1, 2, 5, 10, 20, 50, 100, 200]) {
  return distances.map((R) => {
    const Ps = overpressure(R, W);
    return { R, Ps, kPa: Ps / 1000, td: positivePhase(R, W), effect: damageAt(Ps) };
  });
}
