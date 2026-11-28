// Hašení: hasivo × třída požáru → účinek (iterace 7). Čisté funkce, SI.
// Stejný princip jako „chemický engine“ v Zeldě (živel mění stav materiálu), jen s čísly z požárního inženýrství:
//   voda chladí (2,6 MJ na kilogram odpařené vody), pěna odřízne páry od vzduchu, prášek zastaví řetězovou reakci,
//   CO₂ vytlačí kyslík; na hořící kovy a rozpálený olej voda požár ZHORŠÍ.
// Zdroje: výparné teplo vody (tabulky ★5); potřeba vody F = k_F·Q / (k_W·L_w), k_F = k_W = 0,5 → 0,38 l/s na MW
// (Barnett 2004, novozélandská metoda ★3); kritická intenzita na hořící dřevo 1,5–3 g/m²s (Rasbash; Tamanini ★3);
// pěna na rozlité uhlovodíky 4,1 l/min/m² (NFPA 11 ★4); CO₂ 34 % obj. (NFPA 12 ★4); prášek ~0,04 kg/s na MW odvozeno
// z hasicí schopnosti 183B u přístroje 6 kg (EN 3-7 ★2); 1 l vody → 1,7 m³ páry (★5).
export const L_WATER = 2.6e6;        // J/kg: ohřev 20 → 100 °C + odpaření
export const STEAM_M3_PER_KG = 1.7;  // objem páry při 100 °C

/** Hasiva: mode = hlavní mechanismus; eta = podíl hasiva, který se opravdu uplatní (proud × mlha); reach = dostřik [m]. */
export const AGENTS = {
  waterJet: { name: 'Voda – plný proud', mode: 'cool', eta: 0.3, reach: 20, rate: 3.3, conf: 3 },   // proudnice C52 ~200 l/min
  waterFog: { name: 'Voda – mlha (roztříštěný proud)', mode: 'cool', eta: 0.6, reach: 6, rate: 1.7, conf: 3 },
  hose: { name: 'Zahradní hadice', mode: 'cool', eta: 0.3, reach: 8, rate: 0.3, conf: 3 },
  bucket: { name: 'Kbelík vody (10 l naráz)', mode: 'cool', eta: 0.25, reach: 3, rate: 10, burst: 1, conf: 2 },
  foam: { name: 'Pěna (AFFF)', mode: 'smother', eta: 0.8, reach: 12, rate: 3.3, conf: 4 },
  powder: { name: 'Prášek ABC (přístroj 6 kg)', mode: 'inhibit', eta: 0.6, reach: 5, rate: 0.4, total: 6, conf: 2 },
  co2: { name: 'CO₂ (přístroj 5 kg)', mode: 'dilute', eta: 0.3, reach: 2, rate: 0.35, total: 5, conf: 3 },
  sand: { name: 'Suchý písek', mode: 'smother', eta: 0.9, reach: 2, rate: 2, conf: 2 },
};

/** Třída požáru podle materiálu / paliva: A pevné, B kapaliny, C plyny, D kovy, F oleje na vaření. */
export function fireClass(m) {
  const fuel = m?.fuel ?? m, mode = m?.mode;
  if (fuel === 'magnesium' || fuel === 'thermite') return 'D';
  if (fuel === 'cookingOil') return 'F';
  if (['butane', 'propane', 'acetylene', 'methane'].includes(fuel)) return 'C';
  if (mode === 'liquid' || ['gasoline', 'diesel', 'acetone', 'ethanol', 'paraffin'].includes(fuel)) return 'B';
  return 'A';
}

/**
 * Tabulka pravidel hasivo × třída: k = násobek účinnosti (0 = bez účinku, < 0 = zhoršení), note = proč.
 * Chybějící dvojice = 0.
 */
export const RULES = {
  A: { waterJet: [1, 'chladí povrch a vsákne se'], waterFog: [1, 'chladí plamen i povrch'], hose: [1, 'chladí'], bucket: [1, 'chladí'], foam: [0.8, 'smáčí a chladí'], powder: [0.7, 'srazí plamen, žhavé jádro zůstává → znovu vzplane'], co2: [0.25, 'venku se rozptýlí; žhavé jádro zůstává'], sand: [0.6, 'udusí malé ohnisko'] },
  B: { waterJet: [-0.3, 'rozstřikuje hořící kapalinu, benzín plave na vodě'], waterFog: [0.35, 'jen kapaliny s bodem vzplanutí nad ~60 °C (nafta)'], hose: [-0.3, 'rozstřikuje a roznáší'], bucket: [-0.5, 'vyšplíchne hořící kapalinu'], foam: [1, 'pokryje hladinu a odřízne páry'], powder: [1, 'zastaví reakci v plameni'], co2: [0.6, 'malé plochy bez větru'], sand: [0.7, 'malou louži zasype'] },
  C: { waterJet: [0, 'plamen plynu nehasit – uzavřít přívod, chladit okolí'], waterFog: [0, 'jen chladit okolí'], powder: [0.8, 'srazí plamen; plyn uniká dál → hrozí výbuch'], co2: [0.4, ''] },
  D: { waterJet: [-1, 'voda se na kovu rozkládá na vodík → výbuch'], waterFog: [-1, 'vodík, prudké rozhoření'], hose: [-1, 'vodík'], bucket: [-1, 'výbuch páry a vodíku'], foam: [-0.8, 'obsahuje vodu'], powder: [0, 'běžný prášek nestačí, jen speciální (třída D)'], co2: [-0.3, 'hořčík hoří i v CO₂'], sand: [1, 'jediná běžná možnost'] },
  F: { waterJet: [-1, 'voda pod olejem se vypaří → ohnivá koule'], waterFog: [-0.6, ''], bucket: [-1, 'ohnivá koule'], hose: [-1, ''], foam: [0.4, ''], powder: [0.4, 'znovu vzplane, olej je nad teplotou vznícení'], co2: [0.3, ''], sand: [0.2, ''] },
};
export function agentEffect(agent, cls) { const r = RULES[cls]?.[agent]; return { k: r ? r[0] : 0, note: r ? r[1] : 'bez účinku' }; }

/** Potřebný průtok vody [kg/s] na uhašení ohně o výkonu Q [W]: F = k_F·Q / (η·L_w), k_F = 0,5. ★3 */
export const waterDemand = (Q, agent = 'waterJet') => (0.5 * Q) / (AGENTS[agent].eta * L_WATER);

/** Potřebná dodávka hasiva [kg/s] pro daný oheň (Q [W], hořící plocha A [m²]) – podle mechanismu. */
export function agentDemand(agent, Q, A = 1) {
  const a = AGENTS[agent];
  if (a.mode === 'cool') return waterDemand(Q, agent);
  if (agent === 'foam') return (4.1 / 60) * A;        // kg/s, NFPA 11
  if (agent === 'powder') return 0.04 * (Q / 1e6);
  if (agent === 'co2') return 0.12 * (Q / 1e6) + 0.05;
  return 1.5 * A;                                       // písek: ~1,5 kg/m² za sekundu sypání ★2
}

/**
 * Jeden krok hašení jednoho ohně. st = { s: potlačení 0..1, wet: voda na povrchu [kg/m²], out: bool }.
 *   Q0 = výkon, který by oheň měl bez hašení [W]; A = hořící plocha [m²]; rate = dodávka hasiva na tento oheň [kg/s].
 * Model: poměr r = k·rate / potřeba. r ≥ 1 → potlačení roste k 1 s konstantou τ = 4 + 6·√(Q0/1 MW) s; r < 1 → ustálí se
 * na r (oheň jen oslabí). Bez hašení se oheň vrací s τ = 25 s, dokud je povrch suchý a pořád hoří okolí; voda na povrchu
 * (wet) návratu brání a odpařuje se teplem z okolí. Záporné k (zhoršení) dává s < 0 → výkon × (1 − s) vzroste. ★2
 * Vrací nový stav + { steam [kg/s páry], note }.
 */
export function suppressStep(st, { Q0, A = 1, agent = null, rate = 0, cls = 'A', dt, qExt = 0 }) {
  let { s = 0, wet = 0, out = false } = st;
  let steam = 0, note = '';
  if (agent && rate > 0 && !out) {
    const a = AGENTS[agent], e = agentEffect(agent, cls); note = e.note;
    const need = Math.max(agentDemand(agent, Math.max(Q0, 1e3), A), 1e-6), r = (e.k * rate) / need;
    const tau = 4 + 6 * Math.sqrt(Math.max(Q0, 1e3) / 1e6);
    const target = r >= 1 ? 1 : r <= 0 ? Math.max(-1.5, r) : r;
    s += (target - s) * (1 - Math.exp(-dt / (r < 0 ? 1.5 : tau)));
    if (a.mode === 'cool') {
      steam = Math.min(rate * a.eta, (Q0 * (1 - Math.max(0, s)) * 0.5 + qExt * A) / L_WATER + rate * a.eta * 0.3);
      if (e.k > 0) wet = Math.min(4, wet + ((rate * (1 - a.eta) * 0.5) / Math.max(A, 0.1)) * dt); // část steče, část zůstane
    } else if (agent === 'foam' && e.k > 0) wet = Math.min(8, wet + (rate / Math.max(A, 0.1)) * dt);
    if (s > 0.97 && r >= 1) { s = 1; out = wet > 0.3 || a.mode !== 'inhibit'; } // prášek a CO₂ nechladí → pevná látka znovu vzplane
  } else if (!out) {
    // návrat ohně: jen když povrch uschl
    if (wet <= 0) s += (0 - s) * (1 - Math.exp(-dt / 25));
  }
  // voda na povrchu se odpařuje teplem z okolí a zbytkovým teplem paliva
  if (wet > 0) { const ev = ((qExt + 2e3) / L_WATER) * dt; steam += Math.min(wet, ev) * A / Math.max(dt, 1e-6) * (agent ? 0 : 1); wet = Math.max(0, wet - ev); }
  if (out && wet <= 0 && qExt > 0) out = false; // vyschlo a okolí pořád sálá → může znovu chytnout (rozhodne dávka)
  return { s, wet, out, steam, note };
}
