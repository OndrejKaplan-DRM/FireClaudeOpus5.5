// Výstřel jako zdroj ohně: jedna funkce od pistole po houfnici (iterace 7). Čisté funkce, SI.
// Z hmotnosti prachové náplně plyne energie, její rozdělení (střela / hlaveň / plyny u ústí), záblesk, rána, kouř,
// ohřev hlavně a zvířený prach. Záblesk u ústí = dohořívání plynů bohatých na CO a H₂ po smísení se vzduchem.
//
// Zdroje: náplně a úsťové rychlosti z tabulek nábojů (NATO/SAAMI, řádově ★3–4); rozdělení energie z vnitřní balistiky
// (střela ~30 %, teplo do hlavně ~20–30 %, plyny u ústí ~40–50 %, Corner; Carlucci & Jacobson ★3); hluk výstřelu
// 155–170 dB u střelce (MIL-STD-1474, měření ručních zbraní ★3). Délka a doba záblesku: VLASTNÍ PROLOŽENÍ mocninným
// zákonem mezi pistolí (0,4 g → 12 cm, 1,5 ms) a tankovým kanónem (5 kg → ~7 m, 35 ms) ★2 – záblesk silně závisí na
// prachu, délce hlavně a tlumiči plamene, takže ber čísla jako řád.
import { AMB } from './combustion.js';
import { overpressure } from './blast.js';
import { TNT_J_PER_KG } from './fuels.js';

export const E_PROPELLANT = 4.0e6; // J/kg, výbuchové teplo bezdýmného prachu (3,7–5,0 MJ/kg) ★3
const M0 = 0.4e-3;                 // kalibrační bod: pistolová náplň [kg]

/** Zbraně: charge = prach [kg], bullet = střela [kg], v0 [m/s], cal [m], barrel = délka hlavně [m], rpm = kadence,
 *  barrelMass = hmotnost hlavně [kg], hider = tlumič plamene, tracerEvery = každá n-tá střela svítící, shellHE = trhavina ve střele [kg]. */
export const GUNS = {
  pistol9: { name: 'Pistole 9×19 mm', charge: 0.40e-3, bullet: 8.0e-3, v0: 360, cal: 0.009, barrel: 0.10, rpm: 0, barrelMass: 0.12, conf: 4 },
  rifle556: { name: 'Útočná puška 5,56×45 mm', charge: 1.65e-3, bullet: 4.0e-3, v0: 920, cal: 0.00556, barrel: 0.37, rpm: 800, barrelMass: 0.75, hider: true, conf: 4 },
  mg762: { name: 'Kulomet 7,62×51 mm', charge: 2.9e-3, bullet: 9.5e-3, v0: 840, cal: 0.00762, barrel: 0.55, rpm: 650, barrelMass: 2.9, hider: true, tracerEvery: 5, conf: 4 },
  hmg127: { name: 'Velkorážný kulomet 12,7×99 mm', charge: 15e-3, bullet: 42e-3, v0: 890, cal: 0.0127, barrel: 1.14, rpm: 500, barrelMass: 11, tracerEvery: 5, conf: 4 },
  auto30: { name: 'Automatický kanón 30×165 mm', charge: 0.12, bullet: 0.39, v0: 960, cal: 0.03, barrel: 2.4, rpm: 300, barrelMass: 40, brake: true, conf: 3 },
  tank125: { name: 'Tankový kanón 125 mm (tříštivotrhavý)', charge: 5.0, bullet: 23, v0: 850, cal: 0.125, barrel: 6.0, rpm: 8, barrelMass: 1150, shellHE: 3.4, conf: 3 },
  how155: { name: 'Houfnice 155 mm (M107)', charge: 6.0, bullet: 43.2, v0: 565, cal: 0.155, barrel: 6.0, rpm: 4, barrelMass: 1600, brake: true, shellHE: 6.6, conf: 3 },
};

const pw = (m, v0, e) => v0 * Math.pow(m / M0, e);

/**
 * Popis výstřelu. g = klíč do GUNS nebo objekt; o = { suppressor: bool, night: bool }.
 * Vrací čísla pro efekt (flash*, smoke*, dust*), pro zvuk (W, spl(r)), pro hru (KE, impulse, dTbarrel) a řádky pro UI.
 */
export function muzzleSpec(g, o = {}) {
  const G = typeof g === 'string' ? GUNS[g] : g;
  const E = G.charge * E_PROPELLANT, KE = 0.5 * G.bullet * G.v0 * G.v0, eff = KE / E;
  const toBarrel = 0.2, toGas = Math.max(0.2, 1 - eff - toBarrel);
  // záblesk: bez tlumiče plamene dohoří plyny v kouli před ústím; tlumič plamene ho rozbije na paprsky (×0,4),
  // tlumič hluku plyny ochladí a zpomalí (×0,1). Úsťová brzda pošle část plamene do stran.
  const k = o.suppressor ? 0.1 : G.hider ? 0.4 : 1;
  const L = pw(G.charge, 0.12, 0.43) * k, T = pw(G.charge, 0.0015, 1 / 3);
  // rána: ~3 % energie náplně jde do tlakové vlny do strany (dopředu víc) ★2; tlumič −25 až −30 dB
  const W = (0.03 * E) / TNT_J_PER_KG * (o.suppressor ? 0.002 : 1);
  const spl = (r) => 20 * Math.log10(Math.max(overpressure(r, W, false), 2e-5) / 2e-5);
  const out = {
    gun: G, E, KE, eff, toBarrel, toGas,
    flashL: L, flashD: 0.45 * L, flashT: T, flashTemp: 2100, sideJets: !!G.brake,
    flashI: 2e6 * Math.pow((0.2 * G.charge * k) / 0.24, 2 / 3),   // svítivost v jednotkách světel enginu (kalibrace na granát) – umělecké ★2
    W, spl,
    smokeV: 0.95 * G.charge,                                       // m³ plynů po vychladnutí (~950 l/kg) ★3
    dustR: 25 * Math.cbrt(W),                                      // poloměr zvířeného prachu u země [m] ★2
    dTbarrel: (toBarrel * E) / (G.barrelMass * 490),               // ohřev hlavně jednou ranou [K] ★3
    impulse: G.bullet * G.v0 + 1.75 * G.charge * 1200,             // zpětný ráz [N·s], plyny ~1,75 × náplň × 1 200 m/s ★3
    period: G.rpm ? 60 / G.rpm : Infinity,
  };
  out.rows = [
    ['Zbraň', G.name, 'tabulky nábojů ★' + G.conf],
    ['Prachová náplň', G.charge < 0.1 ? (G.charge * 1000).toFixed(2) + ' g' : G.charge.toFixed(1) + ' kg', ''],
    ['Energie náplně', E < 1e6 ? (E / 1000).toFixed(1) + ' kJ' : (E / 1e6).toFixed(1) + ' MJ', '4,0 MJ/kg ★3'],
    ['Střela', `${G.bullet < 1 ? (G.bullet * 1000).toFixed(1) + ' g' : G.bullet.toFixed(1) + ' kg'}, ${G.v0} m/s → ${KE < 1e6 ? (KE / 1000).toFixed(1) + ' kJ' : (KE / 1e6).toFixed(1) + ' MJ'}`, `účinnost ${(eff * 100).toFixed(0)} %`],
    ['Záblesk u ústí', `${L < 1 ? (L * 100).toFixed(0) + ' cm' : L.toFixed(1) + ' m'} / ${(T * 1000).toFixed(1)} ms`, 'vlastní proložení ★2'],
    ['Rána v 1 m / 10 m', `${spl(1).toFixed(0)} dB / ${spl(10).toFixed(0)} dB`, 'Kinney–Graham, 3 % energie ★2'],
    ['Ohřev hlavně jednou ranou', out.dTbarrel.toFixed(out.dTbarrel < 1 ? 2 : 1) + ' K', '20 % energie ★3'],
    ['Zpětný ráz', out.impulse.toFixed(out.impulse < 10 ? 2 : 0) + ' N·s', 'střela + plyny ★3'],
  ];
  return out;
}

/**
 * Teplota hlavně při střelbě: ohřev ranami, chladnutí prouděním a sáláním (soustředěná kapacita). ★3
 * T [K], shots = počet ran za krok dt, ms = muzzleSpec. Kulometná hlaveň žhne tmavě rudě od ~800 K (stovky ran v kuse).
 */
export function stepBarrelTemp(T, shots, dt, ms) {
  const G = ms.gun, A = Math.PI * (2.2 * G.cal + 0.012) * G.barrel, C = G.barrelMass * 490;
  const loss = (30 * (T - AMB.T) + 0.8 * 5.670374e-8 * (T ** 4 - AMB.T ** 4)) * A;
  return Math.max(AMB.T, T + shots * ms.dTbarrel - (loss * dt) / C);
}

/** Svítící střela: hoří ~1,2–3 s (do 800–900 m u 7,62; do ~1,6 km u 12,7), červená (dusičnan strontnatý + hořčík). ★3 */
export const tracer = (g) => { const G = typeof g === 'string' ? GUNS[g] : g; return { burn: G.cal > 0.01 ? 2.8 : 1.3, T: 1900, v0: G.v0, drag: G.cal > 0.01 ? 0.25 : 0.55 }; };
