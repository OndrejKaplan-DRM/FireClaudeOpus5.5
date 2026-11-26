// Kontrola fyzikálního jádra proti známým hodnotám (rozsahy z literatury). node tools/test-physics.mjs
import { blackbody } from '../src/physics/blackbody.js';
import * as C from '../src/physics/combustion.js';
import * as W from '../src/physics/wind.js';
import * as B from '../src/physics/blast.js';
import * as S from '../src/physics/spread.js';

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

console.log(fail ? `\n${fail} CHYB` : '\nvše v mezích');
process.exit(fail ? 1 : 0);
