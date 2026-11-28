// Přestup tepla z ohně na okolí, zapálení, zuhelnatění, ohřev plechu, saze na površích. Čisté funkce, SI.
// Tohle je „lepidlo“ mezi ohněm a světem: oheň → tepelný tok q″(x) → dávka → vznícení dalšího předmětu → nový oheň.
import { AMB, plumeAxis } from './combustion.js';
import { FUELS } from './fuels.js';
import { material } from './materials.js';

export const SIGMA = 5.670374e-8; // W·m⁻²·K⁻⁴

/**
 * Střední zářivost povrchu plamene [W/m²] — Mudan & Croce (SFPE): E = 140·e^(−0,12 D) + 20·(1 − e^(−0,12 D)) kW/m².
 * Malý plamen svítí celý (140), velký sazový je z ~80 % zakrytý černým pláštěm kouře (20) a svítí jen „okny“. ★4
 * Pro málo sazová paliva (dřevo, líh) strop ~100 kW/m². ★3
 */
export function emissivePower(D, sooty = true) {
  if (!sooty) return 100e3;
  const k = Math.exp(-0.12 * D);
  return (140 * k + 20 * (1 - k)) * 1e3;
}

/** Sálání bodového zdroje (Modak 1977): q″ = χr·Q / (4π R²). Platí pro R ≳ 2,5 D. ★4 */
export const pointSourceFlux = (Q, chiR, R) => (chiR * Q) / (4 * Math.PI * Math.max(R * R, 1e-6));

/**
 * Propustnost vzduchu pro sálání plamene: τ = 2,02·(p_w·R)^(−0,09), p_w = parciální tlak vodní páry [Pa], R [m]
 * (Bagster & Pitblado; TNO „Yellow Book“). Při 20 °C a 50 % vlhkosti: 10 m → 0,87, 100 m → 0,71. ★4
 */
export const transmissivity = (R, pw = 1170) => Math.min(1, 2.02 * Math.pow(Math.max(pw * R, 1), -0.09));

/** Tok při přímém kontaktu s plamenem [W/m²]: malé plameny 50–80, pohlcení velkým uhlovodíkovým požárem 100–150 kW/m². ★3 (SFPE, Babrauskas) */
export const contactFlux = (D) => 60e3 + 90e3 * (1 - Math.exp(-0.3 * D));

/**
 * Tepelný tok v bodě p = [x, y, z] od jednoho ohně.
 * fire = { x, y, z, Q [W], D [m], L [m], chiR, theta [rad od svislice], wx, wz (směr větru, jednotkový), sooty }
 * Vrací { rad, conv, total [W/m²], Tg [K] teplota plynu v místě, inFlame }.
 *  – uvnitř obálky plamene (kužel kolem nakloněné osy): kontaktní tok;
 *  – jinak sálání ze tří bodů na ose (1/6, 1/2, 5/6 L), strop zářivostí povrchu;
 *  – nad plamenem v oblaku: konvekce h·ΔT s Gaussovým profilem (b = 0,12 z·√(T/T∞)), h = 20 W/m²K. ★3
 */
export function fluxFromFire(fire, p) {
  const { Q, D, L } = fire;
  if (!(Q > 0)) return { rad: 0, conv: 0, total: 0, Tg: AMB.T, inFlame: false };
  const chiR = fire.chiR ?? 0.3, th = fire.theta || 0, s = Math.sin(th), c = Math.cos(th);
  const ax = s * (fire.wx || 0), ay = c, az = s * (fire.wz || 0);
  const dx = p[0] - fire.x, dy = p[1] - fire.y, dz = p[2] - fire.z;
  const along = dx * ax + dy * ay + dz * az; // výška podél osy plamene
  const px = dx - ax * along, py = dy - ay * along, pz = dz - az * along;
  const r = Math.hypot(px, py, pz);
  // obálka plamene: u paty D/2, ke špičce se zužuje na ~0,2 D
  const k = Math.min(1, Math.max(0, along / Math.max(L, 1e-3)));
  const rf = (D / 2) * (1 - 0.6 * k) + 0.02 * L;
  const inFlame = along >= -0.05 * D && along <= L && r <= rf;
  // sálání: tři body ve výškách 1/6, 1/2 a 5/6 L, posunuté z osy na přivrácený povrch plamene (blízké pole:
  // cíl „vidí“ stěnu plamene, ne osu). Daleko je posun zanedbatelný a zbývá bodový zdroj (Modak). Kalibrace: 1 MW dává
  // 20 kW/m² asi 1 m od okraje ohně (Babrauskas 1981, „Will the second item ignite?“). ★3
  let rad = 0;
  for (const f of [1 / 6, 1 / 2, 5 / 6]) {
    const h = f * L, ex = dx - ax * h, ey = dy - ay * h, ez = dz - az * h;
    const eh = Math.hypot(ex, ez), sh = Math.max(eh - (D / 2) * (1 - 0.6 * f), Math.min(eh, 0.05 * D + 0.01));
    const Rp = Math.hypot(sh, ey);
    rad += pointSourceFlux(Q / 3, chiR, Rp) * transmissivity(Rp);
  }
  rad = Math.min(rad, emissivePower(D, fire.sooty ?? true));
  // oblak nad plamenem i vedle něj (mimo obálku)
  let conv = 0, Tg = AMB.T;
  if (along > 0) {
    const pa = plumeAxis(Q, D, along, chiR);
    const dT = pa.dT * Math.exp(-(r * r) / Math.max(pa.b * pa.b, 1e-4));
    Tg = AMB.T + dT; conv = 20 * dT;
  }
  if (inFlame) { const qc = contactFlux(D); return { rad: qc * 0.7, conv: qc * 0.3, total: qc, Tg: 1200, inFlame }; }
  return { rad, conv, total: rad + conv, Tg, inFlame };
}

/** Součet toků od více ohňů (pole popisů jako u fluxFromFire). */
export function fluxAt(fires, p) {
  let rad = 0, conv = 0, Tg = AMB.T, inFlame = false;
  for (const f of fires) { const q = fluxFromFire(f, p); rad += q.rad; conv += q.conv; if (q.Tg > Tg) Tg = q.Tg; inFlame = inFlame || q.inFlame; }
  return { rad, conv, total: rad + conv, Tg, inFlame };
}

/**
 * Doba do vznícení při stálém toku q″ [W/m²].
 *  tlustý materiál:  t = (π/4)·kρc·(T_ig − T0)² / (q″ − q″crit)²   (Quintiere; tvar se ztrátami Mikkola & Wichman) ★4
 *  tenký materiál:   t = ρcδ·(T_ig − T0) / (q″ − q″crit)                                                       ★4
 *  kapalina:         pod bodem vzplanutí se musí ohřát povrchová vrstva (jako tenký materiál), nad ním hned    ★3
 */
export function timeToIgnition(q, mat, T0 = AMB.T) {
  const m = material(mat);
  if (!m || m.mode === 'inert') return Infinity;
  if (m.mode === 'liquid' && T0 >= m.flash) return 0;
  const net = q - m.qCrit; if (net <= 0) return Infinity;
  const dT = m.Tig - T0;
  if (m.mode === 'thick') return ((Math.PI / 4) * m.krc * dT * dT) / (net * net);
  return (m.rcd * dT) / net;
}

/**
 * Dávka do vznícení (Flux–Time Product, Shields & Silcock): jedno číslo na předmět místo řešení vedení tepla.
 *   dF/dt = (q″ − q″crit)ⁿ − F/τ,   vznícení při F ≥ FTP;   n = 2 tlustý, n = 1 tenký.
 * FTP plyne z t_ig při stálém toku, takže pro stálý tok dává dávka přesně timeToIgnition; při proměnném toku
 * (mihotání, přibližující se čelo, vítr) sčítá správně a po odeznění ohřevu chladne s konstantou τ = mat.cool. ★3
 */
export function ignitionDose(mat, T0 = AMB.T) {
  const m = material(mat);
  if (!m || m.mode === 'inert') return { n: 1, ftp: Infinity, qCrit: Infinity, tau: 60 };
  const dT = Math.max(m.Tig - T0, 0);
  if (m.mode === 'thick') return { n: 2, ftp: (Math.PI / 4) * m.krc * dT * dT, qCrit: m.qCrit, tau: m.cool };
  return { n: 1, ftp: m.rcd * dT, qCrit: m.qCrit, tau: m.cool };
}
/** Jeden krok dávky: vrací novou dávku F (porovnává volající s dose.ftp). */
export function stepDose(F, q, dt, dose) {
  const net = Math.max(0, q - dose.qCrit);
  const gain = dose.n === 2 ? net * net : net;
  // chladnutí jen když se neohřívá nad kritický tok (jinak by stálý tok nedal přesně t_ig)
  return net > 0 ? F + gain * dt : F * Math.exp(-dt / dose.tau);
}

/**
 * Vlastní hoření předmětu po vznícení → parametry křivky HRR (pro hrrCurve):
 *   Qpeak = HRRPUA · plocha;  doba rozhoření t_g = rozměr / rychlost šíření;  α = Qpeak / t_g²;
 *   plato tak, aby se uvolnila energie E = m · burnFrac · ΔHc:  E = Qpeak·(t_g/3 + t_plato + τ).
 * ★3 (HRRPUA a rychlost šíření mají rozptyl ±50 %)
 */
export function objectFire(mat, { mass, area, size }) {
  const m = material(mat), f = FUELS[m.fuel];
  const Qpeak = m.hrrpua * area;
  const tg = Math.max(2, (size ?? Math.sqrt(area)) / (m.spread * 4)); // šíření vzhůru a do stran ~4× rychlejší než čistě vodorovné ★2
  const E = mass * m.burnFrac * f.dHc;
  const tau = Math.max(5, 0.25 * (E / Qpeak));
  const tPlateau = Math.max(0, E / Qpeak - tg / 3 - tau);
  return { Qpeak, alpha: Qpeak / (tg * tg), tPlateau, tau, E, tg, duration: tg + tPlateau + 3 * tau, fuel: m.fuel };
}

/** Hloubka zuhelnatění dřeva po čase t [m] (EN 1995-1-2: 0,65 mm/min měkké, 0,5 mm/min tvrdé). ★5 */
export const charDepth = (t, mat = 'softwood') => (material(mat).charRate || 0) * t;

/**
 * Teplota tenkého plechu (soustředěná kapacita): ρcδ·dT/dt = ε·q″ − 2εσ(T⁴ − T0⁴) − 2h(T − T0).
 * Karoserie 0,8 mm v kontaktu s plamenem (80 kW/m²) se rozžhaví do minuty; lak shoří kolem 350 °C, od ~525 °C plech
 * viditelně žhne (Draperův bod). ★4
 */
export function stepSheetTemp(T, q, dt, mat = 'steelPainted', eps = 0.85, h = 15) {
  const m = material(mat), T0 = AMB.T;
  const dTdt = (eps * q - 2 * eps * SIGMA * (T ** 4 - T0 ** 4) - 2 * h * (T - T0)) / m.rcd;
  // implicitní omezení kroku, aby velký dt nepřestřelil rovnováhu
  const n = Math.max(1, Math.ceil(Math.abs(dTdt) * dt / 40));
  let t = T; const hstep = dt / n;
  for (let i = 0; i < n; i++) t += ((eps * q - 2 * eps * SIGMA * (t ** 4 - T0 ** 4) - 2 * h * (t - T0)) / m.rcd) * hstep;
  return Math.max(T0, t);
}
/** Rovnovážná teplota plechu při toku q″ (řešení bisekcí). */
export function sheetEquilibrium(q, eps = 0.85, h = 15) {
  let lo = AMB.T, hi = 2000;
  for (let i = 0; i < 40; i++) { const T = (lo + hi) / 2; const bal = eps * q - 2 * eps * SIGMA * (T ** 4 - AMB.T ** 4) - 2 * h * (T - AMB.T); if (bal > 0) lo = T; else hi = T; }
  return (lo + hi) / 2;
}

/**
 * Vzhled lakovaného plechu podle nejvyšší dosažené teploty Tmax [K] a toho, zda vychladl:
 *  < 470 K lak beze změny | 470–620 K lak hnědne a puchýřuje | > 620 K lak shořel na bělošedý popílek |
 *  > 800 K žhnul: okuje (modrošedá) | po vychladnutí a vlhku rez. Saze drží jen na chladném plechu (< ~650 K), na horkém
 *  shoří → „čistý výpal“ kolem ohniska a černý lem okolo (NFPA 921). ★3 (teploty), vzhled ★2
 */
export function sheetLook(Tmax) {
  const s = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  return { blister: s(470, 620, Tmax) * (1 - s(620, 700, Tmax)), paintOff: s(600, 700, Tmax), scale: s(780, 950, Tmax), sootHolds: 1 - s(600, 700, Tmax) };
}

/**
 * Usazování sazí na povrchu (termoforéza): saze jdou z horkého plynu na chladnější stěnu, rychlost ∝ koncentrace · ΔT/T.
 * Vrací přírůstek pokrytí 0..1 za sekundu: dS/dt = k · τ_m · (Tg − Ts)/Tg, k = 0,02 s⁻¹ (kalibrováno: stěna 1 m nad
 * pneumatikou zčerná do ~1 min, nad táborákem za desítky minut). Nad ~650 K povrchu saze naopak shoří. ★2
 */
export function sootRate(tauPerM, Tg, Ts) {
  if (Ts > 650) return -0.05 * Math.min(1, (Ts - 650) / 150);
  return 0.02 * tauPerM * Math.max(0, Tg - Ts) / Math.max(Tg, 1);
}

/** Stav okenního skla podle toku: praská ~5 kW/m² (ΔT střed–okraj ≈ 60–90 K), vypadává ~20 kW/m². ★2 */
export function glassState(q, mat = 'glass') {
  const m = material(mat);
  return q >= m.falloutQ ? 'vypadlé' : q >= m.crackQ ? 'popraskané' : 'celé';
}

/**
 * Okenní sklo v čase: tabule se ohřívá jako tenká deska (ρcδ), okraj v rámu zůstává studený → praskne při rozdílu
 * ΔT ≈ 60–90 K (Pagni & Joshi; Keski-Rahkonen ★4). Vypadne při toku nad ~20 kW/m² (9 začátek, 35 jistota) nebo teplotě
 * plynu nad ~360 °C (Babrauskas: Glass breakage in fires ★2–3). Tvrzené sklo vydrží až do celkového vzplanutí místnosti.
 * st = { T, state: 'celé' | 'popraskané' | 'vypadlé' }; q″ [W/m²], Tg [K].
 */
export function stepGlass(st, q, Tg, dt, mat = 'glass') {
  const m = material(mat), T0 = AMB.T;
  let T = st.T ?? T0, state = st.state ?? 'celé';
  if (state === 'vypadlé') return { T, state };
  const n = Math.max(1, Math.ceil(dt / 2));
  for (let i = 0; i < n; i++) T += ((0.9 * q - 2 * 0.9 * SIGMA * (T ** 4 - T0 ** 4) - 2 * 10 * (T - T0)) / m.rcd) * (dt / n);
  T = Math.max(T0, T);
  if (state === 'celé' && T - T0 >= m.crackDT) state = 'popraskané';
  if (state === 'popraskané' && (q >= m.falloutQ || Tg >= m.falloutT)) state = 'vypadlé';
  return { T, state };
}

/**
 * Tavení kovu: nad bodem tání jde teplo do skupenského tepla; vrací podíl roztaveného 0..1.
 * Hliník 660 °C (disky kol stečou do louží), olovo a zinek 330–420 °C, měď 1 085 °C (běžný požár ji neroztaví). ★5
 */
export function meltStep(frac, T, q, dt, mat) {
  const m = material(mat);
  if (!m.melt || T < m.melt || frac >= 1) return frac;
  const rhoD = m.rcd / (m.cp || 500); // kg/m²
  return Math.min(1, frac + (Math.max(0, 0.85 * q - 2 * 0.85 * SIGMA * (m.melt ** 4 - AMB.T ** 4)) * dt) / (m.latent * rhoD));
}

/**
 * Stopy na zdivu a betonu podle nejvyšší teploty povrchu Tmax [K] (NFPA 921; Ingham 2009 ★3):
 *  saze drží do ~430 °C, nad tím shoří → světlý „čistý výpal“ u ohniska s černým lemem okolo;
 *  beton s křemičitým kamenivem růžoví od ~300 °C, šedne nad 600 °C; omítka a povrch betonu odprýskává od ~300 °C.
 */
export function masonryLook(Tmax, soot = 0) {
  const s = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const clean = s(650, 760, Tmax);
  return { soot: soot * (1 - clean), cleanBurn: clean, pink: s(560, 640, Tmax) * (1 - s(850, 950, Tmax)), grey: s(850, 950, Tmax), spall: s(570, 800, Tmax) };
}

/** Účinky toku na člověka a věci (orientační, SFPE/CCPS). */
export const FLUX_EFFECTS = [
  [1.0e3, 'letní slunce'], [2.5e3, 'bolest kůže do ~30 s; mez pro hasiče bez ochrany'], [5e3, 'bolest do 10 s, puchýře do 30 s; sklo praská'],
  [8e3, 'vzplane sláma a suchá tráva'], [12.5e3, 'vzplane dřevo s pilotním plamenem; taví se plasty'], [20e3, 'podlaha při flashoveru; vypadává sklo'],
  [35e3, 'dřevo vzplane samo bez plamínku za desítky sekund'], [80e3, 'kontakt s plamenem'], [150e3, 'pohlcení velkým požárem kapalin'],
];
export function fluxEffect(q) { let t = '—'; for (const [v, s] of FLUX_EFFECTS) if (q >= v) t = s; return t; }
