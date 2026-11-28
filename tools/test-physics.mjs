// Kontrola fyzikálního jádra proti známým hodnotám (rozsahy z literatury). node tools/test-physics.mjs
import { blackbody } from '../src/physics/blackbody.js';
import * as C from '../src/physics/combustion.js';
import * as W from '../src/physics/wind.js';
import * as B from '../src/physics/blast.js';
import * as S from '../src/physics/spread.js';
import * as H from '../src/physics/heat.js';
import * as SP from '../src/physics/spec.js';
import { MATERIALS } from '../src/physics/materials.js';

let fail = 0;
const check = (name, v, lo, hi, unit = '') => {
  const ok = v >= lo && v <= hi;
  if (!ok) fail++;
  console.log(`${ok ? 'OK ' : 'ERR'} ${name}: ${typeof v === 'number' ? v.toPrecision(4) : v} ${unit}  [${lo}–${hi}]`);
};

// Planck: 6500 K ≈ bílá (R≈G≈B), 1000 K výrazně červenooranžová
const w = blackbody(6500).rgb; check('6500K R/B', w[0] / w[2], 0.85, 1.15);
const o = blackbody(1200).rgb; check('1200K R/G (Charity: #ff4c00)', o[0] / o[1], 8, 20);
check('jas 1800K/1200K', blackbody(1800).lum / blackbody(1200).lum, 300, 2000);

// Heskestad: 1 MW, D=1 m → L ≈ 2,7 m
check('L(1MW,1m)', C.flameHeight(1e6, 1), 2.4, 3.0, 'm');
// diesel louže 2 m: Q ~ 4–5 MW
check('diesel D2 Q', C.poolFire('diesel', 2).Q / 1e6, 4, 7, 'MW');
// 20 l nafty rozlité
const sp = C.spillFire('diesel', 20);
check('20l spill D', sp.D, 3, 6, 'm'); check('20l spill Q', sp.Q / 1e6, 5, 25, 'MW'); check('20l spill trvání', sp.duration, 30, 200, 's');
check('20l spill L', sp.L, 4, 10, 'm');
// puffing svíčka 10–15 Hz (D≈1 cm), louže 1 m ~1,5 Hz
check('f svíčka', C.puffingFrequency(0.012), 10, 16, 'Hz');
// oblak 1 MW ve 10 m: ΔT ~ 60–110 K
check('ΔT 1MW z=10', C.plumeAxis(1e6, 1, 10).dT, 35, 120, 'K');
// pneumatika 0,5 MW kouř τ ve 4 m > 1 (neprůhledný), táborák 100 kW τ < 0,7
check('τ pneumatika', C.smokeOpticalDepth(5e5, 0.6, 4, 'rubber', C.ventilation(1)).tau, 1, 20);
check('τ táborák', C.smokeOpticalDepth(1e5, 0.8, 3, 'woodDry', C.ventilation(1)).tau, 0.05, 0.8);
// svíčka ~1 cd
check('svíčka cd', C.flameLuminousIntensity(80, 1300), 0.7, 1.4, 'cd');
// vítr: 9 m/s, 1 MW, D=1 → náklon 40–70°
check('náklon 9m/s', (W.flameTilt(9, 1e6, 1).theta * 180) / Math.PI, 35, 70, '°');
// Kinney-Graham: 1 kg TNT, 10 m volný vzduch ~ 7 kPa (tabulky 6–8 kPa)
check('Ps 1kg 10m free', B.overpressure(10, 1, false) / 1000, 5, 11, 'kPa');
// 1 t TNT na zemi, 50 m → ~ 40–60 kPa
check('Ps 1t 50m surf', B.overpressure(50, 1000) / 1000, 30, 80, 'kPa');
// BLEVE 20 kg → D ~ 15,7 m
check('BLEVE 20kg D', B.bleveFireball(20).D, 15, 16.5, 'm');
// Anderson LB při 9 m/s ~ 3–5
check('LB střed plamene 3,6 m/s', S.lengthToBreadth(3.6), 1.8, 3.5);
check('LB strop', S.lengthToBreadth(20), 8, 8);
check('ROS křoví 9 m/s', S.headROS('brush', 9 * 0.4) * 60, 5, 60, 'm/min');
check('Byram L křoví', S.byram('brush', S.headROS('brush', 3.6)).L, 1, 6, 'm');
check('Van Wagner I0', S.crownInitiation(4, 100) / 1000, 800, 2000, 'kW/m');
// granát
check('Gurney M67', B.gurneySphere(2700, 0.22, 0.18), 1200, 2200, 'm/s');

// ---------------------------------------------------------------- iterace 6: přestup tepla, zapálení, jeden popis ohně a výbuchu
// doba do vznícení: smrk 50 kW/m² ~10–20 s, 25 kW/m² minuty; pod 12 kW/m² nikdy (Babrauskas, Ignition Handbook)
check('t_ig smrk 50 kW/m²', H.timeToIgnition(50e3, 'softwood'), 8, 30, 's');
check('t_ig smrk 25 kW/m²', H.timeToIgnition(25e3, 'softwood'), 60, 400, 's');
check('t_ig smrk 10 kW/m² (nikdy)', H.timeToIgnition(10e3, 'softwood') === Infinity ? 1 : 0, 1, 1);
check('t_ig sláma 20 kW/m²', H.timeToIgnition(20e3, 'straw'), 1, 15, 's');
check('benzín chytne od jiskry hned', H.timeToIgnition(0, 'gasoline'), 0, 0, 's');
check('studená nafta od jiskry nechytne', H.timeToIgnition(0, 'diesel') === Infinity ? 1 : 0, 1, 1);
{ // dávka (FTP) při stálém toku dává stejný čas jako vzorec
  const d = H.ignitionDose('softwood'); let F = 0, t = 0; while (F < d.ftp && t < 1e4) { F = H.stepDose(F, 35e3, 0.05, d); t += 0.05; }
  check('dávka = t_ig (35 kW/m², poměr)', t / H.timeToIgnition(35e3, 'softwood'), 0.98, 1.02);
}
check('zářivost plamene D 0,5 m', H.emissivePower(0.5) / 1e3, 125, 140, 'kW/m²');
check('zářivost plamene D 30 m (plášť kouře)', H.emissivePower(30) / 1e3, 20, 30, 'kW/m²');
{ const f = { x: 0, y: 0, z: 0, Q: 1e6, D: 1.1, L: C.flameHeight(1e6, 1.1), chiR: 0.3, sooty: false };
  check('1 MW: tok 1 m od okraje', H.fluxFromFire(f, [1.55, 0.5, 0]).total / 1e3, 8, 25, 'kW/m²');
  check('1 MW: tok 5 m od okraje', H.fluxFromFire(f, [5.55, 0.5, 0]).total / 1e3, 0.5, 1.5, 'kW/m²'); }
check('plech v plameni 80 kW/m² (rovnováha)', H.sheetEquilibrium(80e3), 800, 950, 'K');
check('zuhelnatění smrku za 30 min', H.charDepth(1800, 'softwood') * 1000, 19, 20, 'mm');
check('výtok otvorem 9 mm, 0,5 m', SP.torricelli(0.009, 0.5) * 1000, 0.1, 0.14, 'l/s');
check('sud vyteče za', SP.drainTime(0.5, 0.009, 0.258) / 60, 25, 45, 'min');
{ const b = SP.fireSpec({ kind: 'pool', fuel: 'diesel', D: 0.56, volumeL: 170 });
  check('sud nafty Q', b.Qpeak / 1e3, 300, 400, 'kW'); check('sud nafty L', b.L, 1.6, 2.2, 'm'); check('sud nafty hoří', b.duration / 3600, 4, 7, 'h'); }
{ const l = SP.fireSpec({ kind: 'leak', fuel: 'diesel', holeMM: 9, head: 0.5 });
  check('pramínek Q = ṁ·ΔHc', l.Qpeak / (l.mdot * 44.4e6), 0.999, 1.001); check('pramínek plocha', l.A, 3, 7, 'm²'); }
{ const z = SP.fireSpec({ kind: 'jet', fuel: 'butane', mdot: 1.25e-6 }); check('zapalovač Q', z.Qpeak, 50, 65, 'W'); check('zapalovač L', z.L * 1000, 20, 30, 'mm'); }
check('táborák 20 kg Q', SP.fireSpec({ kind: 'pile', material: 'softwood', mass: 20 }).Qpeak / 1e3, 100, 250, 'kW');
{ const g = SP.explosionSpec({ kind: 'he', explosive: 'compB', mass: 0.18, cased: true }).ex, t = SP.explosionSpec({ kind: 'he', explosive: 'tnt', mass: 1000 }).ex;
  check('obecný výbuch prochází granátem (záblesk)', g.flash / 2e6, 0.99, 1.01); check('… (kouř)', g.smoke.n, 140, 140);
  check('obecný výbuch prochází 1 t TNT (záblesk)', t.flash / 6e8, 0.99, 1.01); check('… (kouř)', t.smoke.n, 1400, 1400); check('… (spálenina)', t.scorch, 25.9, 26.1, 'm'); }
{ const c = SP.explosionSpec({ kind: 'gasCylinder' });
  check('acetylenová láhev: ohnivá koule', c.fb.D, 10, 15, 'm'); check('acetylenová láhev: TNT ekv.', c.W, 0.5, 4, 'kg'); check('acetylenová láhev: úlomky', c.vFrag, 50, 120, 'm/s'); }
check('materiály mají zdroj paliva', Object.values(MATERIALS).filter((m) => m.mode !== 'inert' && !m.fuel).length, 0, 0);

// ---------------------------------------------------------------------------------------------- iterace 7
{ const G = await import('../src/physics/gun.js'), SU = await import('../src/physics/suppress.js'), SM = await import('../src/physics/sim.js');
  for (const k of Object.keys(G.GUNS)) check(`${k}: balistická účinnost`, G.muzzleSpec(k).eff * 100, 24, 45, '%');
  check('pistole: rána v 1 m', G.muzzleSpec('pistol9').spl(1), 155, 165, 'dB'); check('kulomet 7,62: rána v 1 m', G.muzzleSpec('mg762').spl(1), 160, 170, 'dB');
  check('pistole: záblesk', G.muzzleSpec('pistol9').flashL * 100, 8, 20, 'cm'); check('tank 125 mm: záblesk', G.muzzleSpec('tank125').flashL, 5, 10, 'm');
  check('tlumič: útlum rány', G.muzzleSpec('rifle556').spl(1) - G.muzzleSpec('rifle556', { suppressor: true }).spl(1), 15, 35, 'dB');
  { const ms = G.muzzleSpec('mg762'); let T = 293; for (let i = 0; i < 60; i++) T = G.stepBarrelTemp(T, 200 / 60, 1, ms); check('kulomet: hlaveň po 200 ranách za minutu', T - 273, 250, 480, '°C');
    T = 293; for (let i = 0; i < 60; i++) T = G.stepBarrelTemp(T, 650 / 60, 1, ms); check('kulomet: hlaveň po 650 ranách v kuse (žhne)', T - 273, 650, 1000, '°C'); }
  check('voda na 1 MW, plný proud', SU.waterDemand(1e6) * 60, 25, 60, 'l/min'); check('voda na 1 MW, mlha', SU.waterDemand(1e6, 'waterFog') * 60, 12, 30, 'l/min');
  const sup = (o, T = 120) => { let st = {}, t = 0; for (; t < T; t += 0.1) { st = SU.suppressStep(st, { ...o, dt: 0.1 }); if (st.out) break; } return { st, t }; };
  { const r = sup({ Q0: 9e5, A: 7, agent: 'waterJet', rate: 3.3, cls: 'A' }); check('proud C uhasí 0,9 MW dřeva', r.st.out ? r.t : 999, 5, 60, 's'); }
  { const r = sup({ Q0: 9e5, A: 7, agent: 'hose', rate: 0.3, cls: 'A' }); check('zahradní hadice 0,9 MW neuhasí (jen oslabí)', r.st.out ? 0 : r.st.s, 0.2, 0.8); }
  { const r = sup({ Q0: 2e6, A: 0.1, agent: 'waterJet', rate: 3.3, cls: 'D' }, 10); check('voda na hořčík požár zhorší', r.st.s, -1.6, -0.5); }
  { const r = sup({ Q0: 2e6, A: 1.1, agent: 'waterJet', rate: 3.3, cls: 'B' }, 20); check('plný proud na benzín požár zhorší', r.st.s, -1.6, -0.05); }
  { const r = sup({ Q0: 4.6e6, A: 5, agent: 'foam', rate: 3.3, cls: 'B' }, 300); check('pěna uhasí 5 m² benzínu', r.st.out ? r.t : 999, 20, 180, 's'); }
  { const r = sup({ Q0: 9e5, A: 7, agent: 'powder', rate: 0.4, cls: 'A' }, 15); check('prášek dřevo srazí, ale neuhasí trvale', r.st.out ? 0 : r.st.s, 0.5, 1.01); }
  check('propustnost vzduchu 10 m', H.transmissivity(10), 0.8, 0.92); check('propustnost vzduchu 100 m', H.transmissivity(100), 0.65, 0.78);
  check('tryskový plamen 100 kW', SP.jetFlameLength(1e5), 1.0, 1.6, 'm'); check('tryskový plamen 10 MW', SP.jetFlameLength(1e7), 6, 8, 'm');
  check('zapalovač zůstává laminární', SP.fireSpec({ kind: 'jet', fuel: 'butane', mdot: 1.25e-6 }).L * 1000, 20, 30, 'mm');
  { const r = SP.fireSpec({ kind: 'room' }).room; check('pokoj 4×3,5 m: flashover', r.Qfo / 1e6, 1.0, 1.6, 'MW'); check('… horká vrstva při flashoveru', r.layerT(r.Qfo) - 273, 450, 620, '°C');
    check('… strop větráním', r.Qvent / 1e6, 2.5, 3.5, 'MW'); check('… plamen nad oknem', r.zf, 1.2, 4, 'm'); }
  check('benzínová stopa: šíření', SP.liquidSpread('gasoline'), 1.3, 2.2, 'm/s'); check('naftová stopa: šíření', SP.liquidSpread('diesel') * 100, 1, 12, 'cm/s');
  check('prach 100 g: ohnivá koule', SP.explosionSpec({ kind: 'dust', mass: 0.1 }).fb.D, 1, 2, 'm'); check('prach 5 kg v silu: TNT ekv.', SP.explosionSpec({ kind: 'dust', mass: 5, confined: true }).W, 1, 3, 'kg');
  { const y = SP.explosionSpec({ kind: 'pyro', caliber: 150 }); check('puma 150 mm: výška', y.H, 150, 220, 'm'); check('puma 150 mm: průměr květu', 2 * y.R, 70, 100, 'm'); check('puma 150 mm: zpožďovač', y.tLift, 4, 7, 's'); }
  { const c = SP.explosionSpec({ kind: 'gasCylinder' }), f = SP.explosionSpec({ kind: 'gasCylinder', film: true }); check('filmová láhev: větší koule', f.ex.fireball.D / c.ex.fireball.D, 1.3, 2); check('filmová láhev: stejná tlaková vlna', f.W / c.W, 0.999, 1.001); }
  { let g = {}, tc = null, t = 0; for (; t < 600; t += 1) { g = H.stepGlass(g, 10e3, 293, 1); if (g.state !== 'celé' && tc == null) tc = t; } check('sklo při 10 kW/m²: praskne za', tc ?? 999, 30, 300, 's'); check('sklo při 10 kW/m²: nevypadne', g.state === 'popraskané' ? 1 : 0, 1, 1);
    g = {}; for (t = 0; t < 300; t += 1) g = H.stepGlass(g, 25e3, 293, 1); check('sklo při 25 kW/m²: vypadne', g.state === 'vypadlé' ? 1 : 0, 1, 1); }
  { const b = new SM.ThermalBody({ pos: [0, 0, 0], material: 'aluminium' }); let t = 0, tm = null; for (; t < 1800; t += 1) { b.step({ q: 80e3, Tg: 1200, inFlame: true, tau: 0 }, 1, t); if (b.melt >= 1 && tm == null) tm = t; } check('hliníkový disk v plameni se roztaví za', (tm ?? 99999) / 60, 2, 15, 'min');
    const s = new SM.ThermalBody({ pos: [0, 0, 0], material: 'steelPainted' }); for (t = 0; t < 1800; t += 1) s.step({ q: 80e3, Tg: 1200, inFlame: true, tau: 0 }, 1, t); check('ocelový plech se netaví', s.melt, 0, 0); }
  check('zdivo: čistý výpal při 730 °C', H.masonryLook(1003, 1).cleanBurn, 0.99, 1); check('zdivo: saze drží při 230 °C', H.masonryLook(503, 1).soot, 0.99, 1);
  check('sympatetická detonace 1 m od 26 kg', SM.sympathetic(1, 26, { cased: true }).p, 1, 1); check('… 20 m od 26 kg', SM.sympathetic(20, 26, { cased: true }).p, 0, 0);
  const mk = (seed) => { const sim = new SM.FireSim({ seed });
    sim.addObject({ id: 'ohnisko', pos: [0, 0, 0], material: 'softwood', mass: 44, area: 7, size: 1.2, D: 1.1, ignited: true });
    sim.addObject({ id: 'slama', pos: [2.7, 0, 0.2], material: 'straw', mass: 250, area: 9, size: 1.6, height: 0.5, probe: [-1.0, 0.5, 0] });
    sim.addObject({ id: 'bedna', pos: [-0.25, 0, -1.5], material: 'softwood', mass: 9, area: 2.2, size: 0.6, probe: [0.05, 0.4, 0.32] });
    sim.addObject({ id: 'pneu', pos: [-0.3, 0, 1.4], material: 'rubber', mass: 9, area: 1.2, size: 0.65, probe: [0.05, 0.3, -0.33], D: 0.65 });
    sim.addObject({ id: 'daleko', pos: [-4.5, 0, 0.6], material: 'softwood', mass: 22, area: 3.5, size: 1.2, probe: [0.5, 0.2, 0] }); return sim; };
  { const sim = mk(1), log = sim.run(1500), ig = (id) => log.find((e) => e.type === 'ignite' && e.id === id)?.t ?? 99999;
    check('simulace bez grafiky: sláma chytne za', ig('slama'), 120, 240, 's'); check('… bedna za', ig('bedna'), 180, 360, 's'); check('… pneumatika po bedně', ig('pneu') - ig('bedna'), 1, 600, 's');
    check('… paleta ve 4,5 m nechytne', ig('daleko') > 9999 ? 1 : 0, 1, 1); check('… dva běhy se stejným seedem dají stejný protokol', JSON.stringify(mk(1).run(1500)) === JSON.stringify(log) ? 1 : 0, 1, 1); }
  { const sim = new SM.FireSim({ maxFires: 3 }); for (let i = 0; i < 10; i++) sim.addObject({ id: 's' + i, pos: [i * 0.5, 0, 0], material: 'straw', mass: 5, area: 2, size: 0.5, ignited: i === 0 }); let mx = 0; for (let t = 0; t < 60; t += 0.5) { sim.step(0.5); mx = Math.max(mx, sim.burningCount); } check('strop počtu ohňů (3) se dodrží', mx, 3, 3); }
  { const sim = new SM.FireSim({}); sim.addObject({ id: 'p', pos: [0, 0, 0], material: 'softwood', mass: 44, area: 7, size: 1.2, ignited: true }); sim.addAgent({ agent: 'waterJet', rate: 3.3, target: 'p', from: 200, until: 260 }); const log = sim.run(900);
    check('simulace: proud vody uhasí palety za', (log.find((e) => e.type === 'extinguished')?.t ?? 9999) - 200, 5, 60, 's'); check('… a zůstane uhašeno', sim.get('p').state === 'uhašeno' ? 1 : 0, 1, 1); }
  { const sim = new SM.FireSim({ seed: 3 }); for (let i = 0; i < 6; i++) sim.addObject({ id: 'g' + i, pos: [i * 1.2, 0, 0], material: 'steelThick', explosive: { spec: { kind: 'he', mass: 26, cased: true }, cookT: 520 } });
    sim.explode({ kind: 'he', mass: 26, cased: true }, [-1.2, 0, 0]); for (let i = 0; i < 300; i++) sim.step(0.001); const n = sim.log.filter((e) => e.type === 'explode').length;
    check('řetěz 6 palet po 1,2 m: vybuchne vše', n, 7, 7); check('… za méně než', Math.max(...sim.log.filter((e) => e.type === 'explode').map((e) => e.t)) * 1000, 1, 120, 'ms');
    const far = new SM.FireSim({ seed: 3 }); for (let i = 0; i < 3; i++) far.addObject({ id: 'g' + i, pos: [i * 25, 0, 0], material: 'steelThick', explosive: { spec: { kind: 'he', mass: 26, cased: true } } });
    far.explode({ kind: 'he', mass: 26, cased: true }, [-25, 0, 0]); for (let i = 0; i < 300; i++) far.step(0.001); check('řetěz po 25 m se zastaví', far.log.filter((e) => e.type === 'explode').length, 1, 1); }
}

console.log(fail ? `\n${fail} CHYB` : '\nvše v mezích');
process.exit(fail ? 1 : 0);
