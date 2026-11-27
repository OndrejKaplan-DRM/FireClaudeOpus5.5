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

console.log(fail ? `\n${fail} CHYB` : '\nvše v mezích');
process.exit(fail ? 1 : 0);
