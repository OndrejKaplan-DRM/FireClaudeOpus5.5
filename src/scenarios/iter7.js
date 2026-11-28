// Scénáře iterace 7 (Ondřej 2026-11-28): zbraně (pistole, kulomet, dělo), řetězová exploze, zápalná láhev, plamenomet,
// tryskový plamen, hašení, následky (saze na zdi, sklo, tavení), místnost s oknem (flashover), výbuch prachu, ohňostroj,
// kovy (termit, hořčík), ohnivý vír, benzínová stopa. Vše stojí na obecném jádru: physics/spec.js, gun.js, suppress.js,
// sim.js (ThermalBody) a na vizuálních stavebnicích fx/gun.js, fx/spray.js, fx/decal.js.
// Každý scénář má pole `tiers`: co dělá levná (T0–T1), střední (T2–T3) a drahá (T4–T5) cesta.
import * as THREE from 'three';
import * as P from '../assets/props.js';
import * as P2 from '../assets/props2.js';
import * as P3 from '../assets/props3.js';
import * as B from '../assets/big.js';
import { makeMaterial } from '../assets/textures.js';
import { FUELS } from '../physics/fuels.js';
import { MATERIALS } from '../physics/materials.js';
import { fireSpec, sourceOptions, explosionSpec, liquidSpread, jetFlameLength } from '../physics/spec.js';
import { fluxEffect, stepGlass, masonryLook } from '../physics/heat.js';
import { GUNS, muzzleSpec, stepBarrelTemp } from '../physics/gun.js';
import { AGENTS, fireClass, agentEffect, waterDemand } from '../physics/suppress.js';
import { sympathetic } from '../physics/sim.js';
import { blastSummary } from '../physics/blast.js';
import { mulberry32 } from '../engine/rng.js';
import { GunFX } from '../fx/gun.js';
import { fireRows, fmtW } from './index.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const kW = (q) => (q / 1000).toFixed(q < 10000 ? 1 : 0) + ' kW/m²';
const degC = (T) => (T - 273.15).toFixed(0) + ' °C';
const mmss = (t) => (t < 90 ? t.toFixed(0) + ' s' : (t / 60).toFixed(1) + ' min');
const table = (ctx, w = 0.9, d = 0.6) => { const g = new THREE.BoxGeometry(w, 0.04, d); g.translate(0, -0.02, 0); const t = new THREE.Mesh(g, makeMaterial('woodPlank')); t.receiveShadow = true; ctx.add(t); };
const wpos = (obj, v) => obj.localToWorld(v.clone());
const wdir = (obj, v) => v.clone().applyQuaternion(obj.quaternion).normalize();

// =============================================================================================== ZBRANĚ
export const ITER7_GUNS = [
  {
    id: 'pistol', group: 'Zbraně', name: 'Výstřel z pistole 9 mm', ground: 'concrete', time: 'soumrak', duration: 9, loop: true,
    desc: 'Náplň 0,4 g bezdýmného prachu: třetina energie jde do střely, pětina ohřeje hlaveň, zbytek odchází ústím jako horké plyny bohaté na CO a vodík. Ty se smísí se vzduchem a dohoří – to je záblesk: ~12 cm, 1,5 ms (kratší než jeden snímek, proto ho kreslíme 1/30 s). Rána 160 dB u střelce.',
    tiers: ['T0–T1: 2 ohnivé obláčky + světlo na jeden snímek', 'T2–T3: + zrna prachu, obláček kouře, vyhozená nábojnice', 'T4–T5: + tetelení, víc částic, stíny od záblesku'],
    cams: [{ name: 'detail', pos: [0.34, 0.31, 0.5], target: [0.14, 0.215, 0] }, { name: 'střelec', pos: [-0.55, 0.42, 0.22], target: [0.6, 0.2, 0] }, { name: 'z boku 3 m', pos: [0.3, 1.1, 3], target: [0.3, 0.3, 0] }],
    controls: [{ id: 'gunSupp', label: 'Tlumič hluku', type: 'check', value: false }],
    build(ctx) {
      table(ctx, 1.2, 0.6);
      const g = P3.pistol({ lod: ctx.lod }); ctx.add(g); g.updateMatrixWorld(true);
      const gun = new GunFX(ctx.fx, mulberry32(3)), ud = g.userData; let next = 1.2, shots = 0, ms = muzzleSpec('pistol9');
      return {
        update(dt, t) {
          ms = muzzleSpec('pistol9', { suppressor: ctx.controls.gunSupp }); gun.update(dt);
          if (t >= next) {
            next += 1.7; shots++; gun.fire(wpos(g, ud.muzzle), wdir(g, ud.dir), ms, { ground: 0 });
            if (ctx.tier.id > 0) ctx.fx.debris.burst(wpos(g, ud.eject).setY(ud.eject.y - 0.2), { n: 1, speed: 2.2, size: 0.009, hot: 0.1, up: 0.75 });
          }
        },
        info: () => [...ms.rows, ['Výstřelů', String(shots), ''], ['Kam jde energie', `střela ${(ms.eff * 100).toFixed(0)} %, hlaveň ${(ms.toBarrel * 100).toFixed(0)} %, plyny u ústí ${(ms.toGas * 100).toFixed(0)} %`, 'vnitřní balistika ★3'],
          ['Proč tlumič zhasne záblesk', 'plyny se v komorách ochladí a zpomalí dřív, než potkají vzduch', '★4']],
      };
    },
  },
  {
    id: 'machineGun', group: 'Zbraně', name: 'Kulomet: dávky a žhnoucí hlaveň', ground: 'dirt', time: 'soumrak', duration: 70,
    desc: 'Kulomet 7,62 mm, 650 ran/min. Každá rána ohřeje hlaveň o ~1,6 K; chlazení vzduchem stačí jen na zlomek. Po ~250 ranách v kuse je hlaveň přes 500 °C a začíná žhnout tmavě rudě, po 500 oranžově a je zničená. Každá pátá střela je svítící (stroncium, hoří 1,3 s). Kouř z prachu se při střelbě hromadí před zbraní.',
    tiers: ['T0–T1: záblesk 2 obláčky, bez jisker, svítící střely', 'T2–T3: + zrna prachu, kouř, nábojnice, zvířený prach', 'T4–T5: + tetelení nad hlavní, plný počet částic'],
    cams: [{ name: 'střelec', pos: [-1.5, 0.9, 0.9], target: [1.2, 0.45, 0] }, { name: 'z boku', pos: [0.5, 0.7, 2.6], target: [0.6, 0.45, 0] }, { name: 'před hlavní (pozor)', pos: [5, 1.1, 2.2], target: [0.6, 0.45, 0] }],
    controls: [{ id: 'mgMode', label: 'Režim střelby', type: 'select', value: 'dávky', options: ['dávky', 'dlouhá dávka', 'nepřetržitě'], restart: true },
      { id: 'mgGun', label: 'Zbraň', type: 'select', value: 'mg762', options: ['mg762', 'rifle556', 'hmg127'], restart: true }],
    build(ctx) {
      const g = P3.machineGun({ lod: ctx.lod }); ctx.add(g); g.updateMatrixWorld(true);
      const key = ctx.controls.mgGun || 'mg762', mode = ctx.controls.mgMode || 'dávky', ms = muzzleSpec(key), G = ms.gun, ud = g.userData, u = ud.char;
      const gun = new GunFX(ctx.fx, mulberry32(8)), r = mulberry32(9); let acc = 0, shots = 0, Tb = 293, Tmax = 293;
      const muz = wpos(g, ud.muzzle), dir0 = wdir(g, ud.dir), ej = wpos(g, ud.eject); ej.y -= 0.2; // Debris.burst přičítá 0,2 m
      return {
        update(dt, t) {
          gun.update(dt);
          const on = t > 1 && (mode === 'nepřetržitě' ? true : mode === 'dlouhá dávka' ? (t - 1) % 14 < 9 : (t - 1) % 3.2 < 1.1);
          let n = 0; if (on) { acc += dt / ms.period; while (acc >= 1) { acc -= 1; n++; } }
          for (let i = 0; i < n; i++) {
            shots++;
            const d = dir0.clone(); d.y += (r() - 0.5) * 0.012; d.z += (r() - 0.5) * 0.012; d.normalize();
            gun.fire(muz, d, ms, { ground: 0, tracer: G.tracerEvery ? shots % G.tracerEvery === 0 : false });
            if (ctx.tier.id > 0 && shots % 2 === 0) ctx.fx.debris.burst(ej, { n: 1, speed: 2.5, size: 0.011, hot: 0.15, up: 0.3 }, r);
          }
          Tb = stepBarrelTemp(Tb, n, dt, ms); Tmax = Math.max(Tmax, Tb);
          u.uTnow.value = Tb; u.uTmax.value = Tmax;
          // tetelení nad horkou hlavní (střelci kazí obraz v mířidlech)
          if (ctx.fx.hz && ctx.tier.id >= 2 && Tb > 420 && r() < dt * 8) ctx.fx.hz.spawn({ x: muz.x - 0.3 * r() * dir0.x * 2, y: muz.y + 0.05, z: muz.z, vy: 0.6, life: 0.8, size: 0.25 });
        },
        info: () => [...ms.rows.slice(0, 6), ['Kadence', G.rpm + ' ran/min', ''], ['Vystřeleno', String(shots), ''],
          ['Teplota hlavně', degC(Tb) + ' (max ' + degC(Tmax) + ')', Tb > 1100 ? 'žhne oranžově – hlaveň je zničená' : Tb > 800 ? 'žhne tmavě rudě (Draperův bod 525 °C)' : Tb > 470 ? 'náběhové barvy; náboj v komoře se může sám odpálit' : 'v pořádku'],
          ['Ohřev jednou ranou', ms.dTbarrel.toFixed(2) + ' K', '20 % energie náplně ★3'], ['Výměna hlavně podle předpisu', 'po ~200 ranách rychlé střelby', 'M240: 2 min při 200 ran/min ★4'],
          ['Svítící střela', G.tracerEvery ? `každá ${G.tracerEvery}., hoří ${G.cal > 0.01 ? '2,8' : '1,3'} s` : 'ne', 'stroncium + hořčík ★3']],
      };
    },
  },
  {
    id: 'cannon', group: 'Zbraně', name: 'Výstřel z děla a dopad granátu', ground: 'dryGrass', time: 'den', duration: 16, loop: true,
    desc: 'Tankový kanón 125 mm: 5 kg prachu, střela 23 kg, 850 m/s. Záblesk ~7 m a 35 ms, tlaková vlna zvedne prach do 13 m od ústí (pěchota nesmí stát před tankem). Granát doletí na 150 m za 0,18 s a 3,4 kg trhaviny v ocelovém plášti vybuchne; ránu od děla slyšíš hned, výbuch u cíle se zpožděním podle vzdálenosti. Stejná funkce spočítá i velkorážný kulomet nebo houfnici.',
    tiers: ['T0–T1: záblesk 5 obláčků, prach 30 částic, výbuch z plošných obláčků', 'T2–T3: + boční plameny brzdy, jiskry, objemová koule výbuchu', 'T4–T5: + objemový kouř, plný prachový prstenec, trosky'],
    cams: [{ name: 'u děla (10 m)', pos: [-3, 2.2, 10], target: [4, 1.3, 0] }, { name: 'z boku (45 m)', pos: [20, 4, 45], target: [20, 2, 0] }, { name: 'u cíle (50 m)', pos: [120, 3, 42], target: [150, 2, 0] }],
    controls: [{ id: 'cGun', label: 'Zbraň', type: 'select', value: 'tank125', options: ['tank125', 'how155', 'auto30', 'hmg127'], restart: true }],
    build(ctx) {
      const key = ctx.controls.cGun || 'tank125', ms = muzzleSpec(key), G = ms.gun, big = !!G.shellHE;
      const g = P3.fieldGun({ lod: ctx.lod, elev: 0.02 }); if (!big) g.scale.setScalar(G.cal > 0.02 ? 0.45 : 0.22); ctx.add(g); g.updateMatrixWorld(true);
      const tgt = P.barrel({ lod: Math.min(ctx.lod, 2), paint: 'metalRed' }); tgt.position.set(150, 0, 0); ctx.add(tgt);
      const fig = P3.figure({ lod: Math.min(ctx.lod, 2) }); fig.position.set(-2.5, 0, 2.2); ctx.add(fig);
      const gun = new GunFX(ctx.fx, mulberry32(12)), ud = g.userData, muz = wpos(g, ud.muzzle), dir = wdir(g, ud.dir), r = mulberry32(4);
      const es = big ? explosionSpec({ kind: 'he', explosive: 'compB', mass: G.shellHE, cased: true }) : null, tof = 150 / G.v0;
      const nShots = big ? 1 : 8; let fired = 0, hits = 0, acc = 0;
      return {
        update(dt, t) {
          gun.update(dt);
          if (t > 2 && fired < nShots) { acc += dt / (big ? 1 : ms.period); while ((fired === 0 || acc >= 1) && fired < nShots) { acc = Math.max(0, acc - 1); fired++; gun.fire(muz, dir, ms, { ground: 0, tracer: true }); this['h' + fired] = t + tof; if (fired === 1) acc = 0; } }
          for (let i = hits + 1; i <= fired; i++) if (this['h' + i] != null && t >= this['h' + i]) {
            hits = i; const p = V(150 + (r() - 0.5) * (big ? 0 : 3), 0.3, (r() - 0.5) * (big ? 0 : 2));
            if (big) { ctx.fx.blast(es, p, { cased: true, seed: 20 + i }); tgt.visible = false; }
            else { ctx.fx.debris.burst(p, { n: 26, speed: 9, size: 0.03, hot: 0.2, up: 0.7 }, r); for (let k = 0; k < 6; k++) ctx.fx.bb.spawnSmoke({ x: p.x, y: 0.2, z: p.z, vx: (r() - 0.5) * 3, vy: 1 + 2 * r(), vz: (r() - 0.5) * 3, life: 2 + 2 * r(), s0: 0.3, s1: 1.6, tau: 0.6, albedo: [0.36, 0.31, 0.23], drag: 1 }); }
          }
        },
        info: () => [...ms.rows, ['Zvířený prach do', ms.dustR.toFixed(1) + ' m od ústí', '★2'], ['Přetlak 2 m vedle ústí', (Math.pow(10, ms.spl(2) / 20) * 2e-5 / 1000).toFixed(1) + ' kPa', 'ušní bubínek praská od ~35 kPa ★3'],
          ['Let na 150 m', (tof * 1000).toFixed(0) + ' ms', ''], ...(es ? [...es.rows, ...blastSummary(es.W, [10, 50]).map((b) => [`  přetlak v ${b.R} m`, b.kPa.toFixed(1) + ' kPa', b.effect])] : [['Střela', 'bez trhaviny – jen prach a odražené úlomky', '']]),
          ['Zvuk dopadu u děla za', (150 / 343).toFixed(2) + ' s', 'rychlost zvuku']],
      };
    },
  },
];

// =============================================================================================== ŘETĚZOVÁ EXPLOZE
export const ITER7_CHAIN = [
  {
    id: 'chainBlast', group: 'Exploze', name: 'Řetězová exploze: sklad munice', ground: 'dirt', time: 'den', duration: 40,
    desc: 'Šest palet po čtyřech granátech 155 mm (26 kg TNT na paletu). Fyzikálně: první výbuch odpálí sousedy rázem do 0,5·W^⅓ (1,5 m) a střepinami s klesající pravděpodobností do 2,4·W^⅓ (7 m) – celý řetěz proběhne za setiny sekundy a oko vidí jeden výbuch. Filmově: rozestup 0,35 s a benzín pro oranžové koule. Požár: hranice pod první paletou, granát se uvaří za minuty a pak už to jde rázem.',
    tiers: ['T0–T1: výbuchy z plošných obláčků, společný rozpočet částic se dělí mezi všechny', 'T2–T3: objemová koule u nejbližších dvou, trosky, prach', 'T4–T5: objemový kouř, hřib nad součtem náloží'],
    cams: [{ name: 'celek (60 m)', pos: [10, 6, 60], target: [5, 5, 0] }, { name: 'podél řady', pos: [-22, 3, 14], target: [5, 2, 0] }, { name: 'z dálky (200 m)', pos: [60, 14, 190], target: [5, 14, 0] }],
    controls: [{ id: 'chMode', label: 'Průběh', type: 'select', value: 'fyzikální', options: ['fyzikální', 'filmový', 'požár'], restart: true },
      { id: 'chGap', label: 'Rozestup palet [m]', type: 'range', min: 0.8, max: 10, value: 1.6, step: 0.1 }],
    build(ctx) {
      const fx = ctx.fx, mode = ctx.controls.chMode || 'fyzikální', gap = ctx.controls.chGap ?? 1.6, N = 6, Wst = 4 * 6.6;
      const spec = { kind: 'he', explosive: 'tnt', mass: Wst, cased: true }, es = explosionSpec(spec), items = [];
      if (mode === 'požár') ctx.setTimeScale(20);
      for (let i = 0; i < N; i++) {
        const st = P3.shellStack({ lod: Math.min(ctx.lod, 3), n: 2, seed: i + 1 }); st.position.set(i * gap, 0, 0); ctx.add(st);
        const b = fx.addBurnable({ label: 'paleta ' + (i + 1), pos: V(i * gap, 0, 0), material: 'steelThick', char: st.userData.char, probe: [0, 0.4, 0],
          explosive: { spec, cookT: 520, rcd: 7850 * 490 * 0.015 }, // TNT se vaří od ~240 °C; stěna granátu 15 mm ★3
          onEvent: (type, bb, e) => { if (type === 'exploded') { st.visible = false; bb.tBoom = ctx.t; bb.cause = e.cause; ctx.setTimeScale(1); } } });
        b.obj = st; items.push(b);
      }
      let pile = null;
      if (mode === 'požár') {
        const p = P2.pallet({ lod: Math.min(ctx.lod, 3) }); p.position.set(-0.75, 0, 0); ctx.add(p);
        pile = fx.addBurnable({ label: 'hořící palety', pos: V(-0.55, 0, 0), material: 'softwood', mass: 66, area: 10, size: 1.2, D: 1.3, ignited: true, char: p.userData.char, seed: 5 });
        fx.addScorch({ pos: V(-0.55, 0, 0), radius: 1.6, rate: 1 / 300, glow: 0.3, seed: 3 });
      }
      const film = explosionSpec({ kind: 'fireball', mass: 20, film: true });
      let started = false, k = 0;
      return {
        update(dt, t) {
          if (mode === 'fyzikální' && !started && t > 2) { started = true; fx.blast(spec, items[0].pos, { src: items[0], cause: 'rozbuška', seed: 41 }); }
          if (mode === 'filmový') while (k < N && t > 2 + 0.35 * k) { // pyrotechnik odpaluje nálože postupně; žádná fyzika šíření
            for (const f of items) f.body.ex.done = true;
            const b = items[k]; fx.blast(spec, b.pos, { src: b, cause: 'časovač', seed: 50 + k });
            fx.addExplosion({ pos: b.pos.clone().setY(1), seed: 60 + k, ...film.ex }); k++;
          }
        },
        info() {
          const sy = sympathetic(gap, es.W, { cased: true }), rows = [['Průběh', mode, mode === 'filmový' ? 'umělecké ★1' : 'pravidlo vzdálenosti ★2'], ['Nálož jedné palety', Wst.toFixed(1) + ' kg TNT', '4 × 6,6 kg'],
            ['Ráz odpálí souseda do', (0.5 * Math.cbrt(es.W)).toFixed(1) + ' m', '0,5·W^⅓ ★2'], ['Střepiny odpálí do', (2.4 * Math.cbrt(es.W)).toFixed(1) + ' m', '2,4·W^⅓ (NATO, sklady bez valu) ★3'],
            ['Při rozestupu ' + gap.toFixed(1) + ' m', sy.p >= 1 ? 'jistě (ráz)' : sy.p > 0 ? `pravděpodobnost ${(sy.p * 100).toFixed(0)} % (střepiny), zpoždění ${(sy.delay * 1000).toFixed(0)} ms` : 'řetěz se zastaví', '']];
          for (const b of items) rows.push([b.label, b.tBoom != null ? `výbuch v ${b.tBoom.toFixed(mode === 'požár' ? 0 : 3)} s (${b.cause})` : mode === 'požár' ? `plášť ${degC(b.body.ex.Tc)}, tok ${kW(b.q)}` : 'čeká', '']);
          if (pile) rows.push(['Hranice', fmtW(pile.src?.ph?.Q || 0), 'uvaření TNT od 240 °C ★3']);
          rows.push(['Součet', (N * Wst).toFixed(0) + ' kg TNT', ''], ...blastSummary(N * Wst, [50, 200]).map((b) => [`  přetlak v ${b.R} m (vše naráz)`, b.kPa.toFixed(1) + ' kPa', b.effect]));
          return rows;
        },
      };
    },
  },
];

// =============================================================================================== ZÁPALNÉ A PLYN
export const ITER7_INCEND = [
  {
    id: 'molotov', group: 'Kapaliny', name: 'Zápalná láhev', ground: 'concrete', time: 'soumrak', duration: 50, loop: true,
    desc: 'Láhev 0,7 l benzínu s hořícím hadrem letí 10 m. Po rozbití se část benzínu rozpráší a vzplane v kouli ~2 m (0,15 s), zbytek se rozlije na ~1 m² a hoří čtvrt minuty: ~2 MW na metr čtvereční hladiny. Bedna vedle chytne od sálání a plamenů, paleta dál jen zčerná.',
    tiers: ['T0–T1: koule z 20 obláčků, louže jako jeden plošný plamen', 'T2–T3: objemový plamen louže, střepy, černý kouř', 'T4–T5: objemový kouř, jiskry z hadru, tetelení'],
    cams: [{ name: 'celek', pos: [1.5, 2.4, 9], target: [3.2, 0.9, 0] }, { name: 'hráč (vrhač)', pos: [-7, 1.7, 1.2], target: [4, 0.6, 0] }, { name: 'u dopadu', pos: [7.5, 1.4, 3.2], target: [4.6, 0.5, 0] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(7), bottle = P3.molotov({ lod: ctx.lod }); ctx.add(bottle);
      const p0 = V(-6, 1.6, 0), v0 = V(9, 4.5, 0), tThrow = 1.5, tof = (v0.y + Math.sqrt(v0.y * v0.y + 2 * 9.81 * p0.y)) / 9.81, hit = V(p0.x + v0.x * tof, 0, 0);
      const wick = fx.addSource({ pos: p0.clone(), fuel: 'gasoline', Q: 700, D: 0.03, seed: 3, end: Infinity, mult: { smoke: 0.3, embers: 0, sparks: 0 } });
      const cr = P2.crate({ lod: ctx.lod, s: 0.6 }); cr.position.set(hit.x + 0.95, 0, -0.35); cr.rotation.y = 0.3; ctx.add(cr);
      const bc = fx.addBurnable({ label: 'bedna (0,9 m)', pos: cr.position.clone(), material: 'softwood', mass: 9, area: 2.2, size: 0.6, probe: [-0.3, 0.3, 0.1], char: cr.userData.char, fireY: 0.25, seed: 5 });
      const pl = P2.pallet({ lod: ctx.lod }); pl.position.set(hit.x - 0.4, 0, 2.6); pl.rotation.y = 0.5; ctx.add(pl);
      const bp = fx.addBurnable({ label: 'paleta (2,6 m)', pos: pl.position.clone(), material: 'softwood', mass: 22, area: 3.5, size: 1.2, probe: [0, 0.15, -0.5], char: pl.userData.char, seed: 6 });
      const sp = fireSpec({ kind: 'spill', fuel: 'gasoline', volumeL: 0.55, depthMM: 0.55 }), fbS = explosionSpec({ kind: 'vapor', fuel: 'gasoline', mass: 0.07 });
      let broke = false, pool = null;
      return {
        update(dt, t) {
          const tl = t - tThrow;
          if (!broke) {
            const tt = Math.max(0, tl); bottle.position.set(p0.x + v0.x * tt, p0.y + v0.y * tt - 4.905 * tt * tt, 0); bottle.rotation.z = -tt * 7;
            bottle.updateMatrixWorld(true); wick.pos.copy(wpos(bottle, bottle.userData.wick));
            if (tl >= tof) {
              broke = true; bottle.visible = false; wick.enabled = false;
              fx.addExplosion({ pos: V(hit.x, 0.5, 0), seed: 9, ...fbS.ex, debris: { n: 0, speed: 1, size: 0.01, hot: 0, up: 0.5 }, dust: false, scorch: 0 });
              fx.debris.burst(V(hit.x, 0.05, 0), { n: ctx.tier.id > 0 ? 46 : 12, speed: 5, size: 0.012, hot: 0, up: 0.45 }, r);
              pool = fx.addSource({ pos: V(hit.x + 0.25, 0.01, 0), seed: 11, volume: true, ...sourceOptions(sp), footprint: { type: 'rect', w: 1.5, d: 0.9 }, shapeK: 1.4, volSoot: 0.3, mult: { smoke: 1.4 } });
              fx.addScorch({ pos: V(hit.x + 0.25, 0, 0), radius: 1.0, rate: 1 / 12, seed: 4 });
            }
          }
        },
        info: () => [['Náplň', '0,7 l benzínu (0,5 kg)', ''], ['Let', `${(v0.length()).toFixed(0)} m/s, ${tof.toFixed(2)} s, ${(v0.x * tof).toFixed(1)} m`, 'balistika'],
          ['Koule při rozbití', fbS.ex.fireball.D.toFixed(1) + ' m / ' + fbS.ex.fireball.t.toFixed(2) + ' s', '~15 % náplně se rozpráší ★2'], ...sp.rows.slice(1), ...(pool ? fireRows(pool, 'louže').slice(1, 3) : []),
          [bc.label, `${kW(bc.q)} · ${bc.state === 'burning' ? 'HOŘÍ od ' + mmss(bc.tIgn - tThrow - tof) + ' po dopadu' : bc.state === 'burnt' ? 'vyhořelo' : 'dávka ' + (bc.heat * 100).toFixed(0) + ' %'}`, ''],
          [bp.label, `${kW(bp.q)} · ${bp.state === 'burning' ? 'HOŘÍ' : 'dávka ' + (bp.heat * 100).toFixed(0) + ' %'}`, 'práh dřeva 12 kW/m²'], ['Hašení', 'voda benzín roznese; prášek, pěna, písek nebo deka', 'třída B']],
      };
    },
  },
  {
    id: 'flamethrower', group: 'Kapaliny', name: 'Plamenomet', ground: 'dirt', time: 'soumrak', duration: 34, loop: true,
    desc: 'Tryska vrhá 1,5 l/s zahuštěného benzínu rychlostí 30 m/s na 16 m. Ve vzduchu shoří asi třetina (hořící povrch proudu), zbytek dopadne a hoří na zemi a na cíli – proto je plamenomet zbraň proti úkrytům, ne proti prostoru. Potenciální výkon 50 MW; po třech sekundách zbude hořící pás a hustý černý kouř.',
    tiers: ['T0–T1: 90 větších obláčků/s v oblouku, jeden zdroj na zemi', 'T2–T3: 200 obláčků, tři zdroje na zemi, černý kouř, tetelení', 'T4–T5: + objemové plameny dopadu, objemový kouř, jiskry'],
    cams: [{ name: 'z boku', pos: [8, 3, 17], target: [8, 1.6, 0] }, { name: 'obsluha', pos: [-2.2, 1.7, 1.3], target: [10, 1.2, 0] }, { name: 'u cíle', pos: [20, 1.8, 6], target: [15, 1, 0] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(17), ft = P3.flamethrower({ lod: ctx.lod }); ctx.add(ft); ft.updateMatrixWorld(true);
      const muz = wpos(ft, ft.userData.muzzle), v0 = 30, el = 0.16, vx = v0 * Math.cos(el), vy = v0 * Math.sin(el), cd = 1.15; // odpor proudu: dolet 16 m místo 29 m ve vakuu
      const path = (tau, o) => { const e = Math.exp(-cd * tau); o.x = muz.x + (vx / cd) * (1 - e); o.y = muz.y + ((vy + 9.81 / cd) / cd) * (1 - e) - (9.81 / cd) * tau; o.vx = vx * e; o.vy = (vy + 9.81 / cd) * e - 9.81 / cd; return o; };
      let tLand = 0; { const o = {}; for (let tau = 0; tau < 4; tau += 0.01) { path(tau, o); if (o.y <= 0.05) { tLand = tau; break; } } }
      const land = path(tLand, {}), flow = 1.5, f = FUELS.napalm, Qpot = (flow / 1000) * f.rho * f.dHc, o = {};
      const bale = B.strawStack({ lod: Math.min(ctx.lod, 3), nx: 1, ny: 1, nz: 1, seed: 8 }); bale.position.set(land.x + 1.6, 0, -0.6); ctx.add(bale);
      const bb = fx.addBurnable({ label: 'balík slámy', pos: bale.position.clone(), material: 'straw', mass: 120, area: 6, size: 1.2, height: 0.5, probe: [-0.7, 0.4, 0.3], char: bale.userData.char, fireY: 0.5, seed: 4 });
      const nG = ctx.tier.id === 0 ? 1 : 3, ground = []; let landed = 0, acc = 0;
      for (let i = 0; i < nG; i++) ground.push(fx.addSource({ pos: V(land.x + (i - (nG - 1) / 2) * 1.3, 0.01, (i % 2) * 0.3 - 0.15), fuel: 'napalm', seed: 30 + i, volume: true, D: 1.3, shapeK: 1.4, volSoot: 0.4, mult: { smoke: 1.6 }, end: Infinity,
        Q: () => { const m = landed / nG; return Math.min(2.2e6, m * f.dHc / 14); } }));   // co dopadlo, hoří ~14 s
      fx.addScorch({ pos: V(land.x, 0, 0), radius: 2.6, rate: 1 / 20, glow: 0.2, seed: 6 });
      return {
        update(dt, t) {
          const on = t % 11 > 1 && t % 11 < 4;
          if (on) {
            landed += 0.65 * (flow / 1000) * f.rho * dt;
            acc += fx.dtReal * (ctx.tier.id === 0 ? 90 : ctx.tier.id >= 4 ? 320 : 200) * Math.max(0.35, fx.budgetScale.flame); const big = ctx.tier.id === 0 ? 1.7 : 1;
            while (acc >= 1) {
              acc -= 1; const tau = r() * tLand, k = tau / tLand; path(tau, o);
              fx.bb.spawnFirePuff({ x: o.x, y: Math.max(0.1, o.y + (r() - 0.5) * 0.25 * (0.3 + k)), z: muz.z + (r() - 0.5) * 0.3 * (0.2 + k), vx: o.vx * 0.55, vy: o.vy * 0.55 + 1.2 * k, vz: (r() - 0.5) * 1.5,
                life: 0.28 + 0.5 * r(), s0: (0.14 + 0.5 * k) * big, s1: (0.5 + 1.4 * k) * big, T: 1500 - 150 * k, lum: 1.2, soot: 0.25 + 0.45 * k, drag: 1.6, buoy: 2.5 * k, seed: r() });
              if (ctx.tier.id > 0 && r() < 0.22) fx.bb.spawnSmoke({ x: o.x, y: o.y + 0.4, z: muz.z, vx: o.vx * 0.3, vy: 1.5 + 2 * r(), vz: (r() - 0.5), life: 3 + 3 * r(), s0: 0.4, s1: 2.5, tau: 1.6, albedo: [0.05, 0.045, 0.04], drag: 0.8 });
            }
            fx.lights.add(muz.x + 4, muz.y + 1, muz.z, 6e5, 1500, 1.5);
          }
          landed = Math.max(0, landed - (ground.reduce((s, g) => s + (g.ph ? g.ph.Q : 0), 0) / f.dHc) * dt);
        },
        info: () => [['Palivo', f.name, 'ΔHc 43 MJ/kg'], ['Průtok', flow + ' l/s, 30 m/s', 'přenosný plamenomet ~1,9 l/s ★3'], ['Dolet', land.x.toFixed(1) + ' m za ' + tLand.toFixed(2) + ' s', 'balistika s odporem ★2'],
          ['Potenciální výkon', fmtW(Qpot), 'kdyby shořelo vše naráz'], ['Hoří ve vzduchu / dopadne', '~35 % / ~65 %', '★2'], ['Na zemi teď', (landed).toFixed(2) + ' kg, ' + fmtW(ground.reduce((s, g) => s + (g.ph ? g.ph.Q : 0), 0)), ''],
          [bb.label, `${kW(bb.q)} · ${bb.state === 'burning' ? 'HOŘÍ' : bb.state === 'burnt' ? 'vyhořelo' : 'dávka ' + (bb.heat * 100).toFixed(0) + ' %'}`, 'práh slámy 8 kW/m²'],
          ['Sálání u obsluhy', kW(fx.heatFlux([muz.x - 0.5, 1.5, 0]).total) + ' – ' + fluxEffect(fx.heatFlux([muz.x - 0.5, 1.5, 0]).total), '']],
      };
    },
  },
  {
    id: 'jetFire', group: 'Zážeh', name: 'Tryskový plamen: hořák → utržený ventil', ground: 'concrete', time: 'noc', duration: 3600,
    desc: 'Plyn pod tlakem hoří jinak než louže: hybnost proudu převládá nad vztlakem, plamen je dlouhý, úzký, hlučný a u trysky modrý. Jedna korelace (Lowesmith: L = 2,89·Q^0,37) platí od opalovacího hořáku (2 g/s, 100 kW, 1,2 m) po utržený ventil lahve (200 g/s, 9 MW, 6,6 m). Posuň průtok a sleduj délku, výkon a sálání.',
    tiers: ['T0–T1: plošné jazyky bez modré paty', 'T2–T3: objemový plamen s modrou patou, tetelení', 'T4–T5: + jemná turbulence, objemový kouř u velkých průtoků'],
    cams: [{ name: 'celek', pos: [3.4, 1.6, 4.2], target: [1.3, 1.5, 0] }, { name: 'detail hořáku', pos: [2.1, 0.9, 1.1], target: [1.35, 1.0, 0] }, { name: 'z dálky', pos: [8, 3, 14], target: [1.3, 3.5, 0] }],
    controls: [{ id: 'jetFlow', label: 'Průtok plynu [g/s]', type: 'range', min: 0.02, max: 300, value: 2.2, log: true }],
    build(ctx) {
      const cyl = P3.propaneCylinder({ lod: ctx.lod }); ctx.add(cyl); cyl.updateMatrixWorld(true);
      const nz = wpos(cyl, cyl.userData.nozzle); let sp = fireSpec({ kind: 'jet', fuel: 'propane', mdot: (ctx.controls.jetFlow ?? 2.2) / 1000 }), last = -1;
      const src = ctx.fx.addSource({ pos: nz.clone(), seed: 5, volume: true, ...sourceOptions(sp), end: Infinity, Q: () => sp.Qpeak, L: (q) => (sp.extra.L ? sp.extra.L(q) : sp.L) });
      const shell = ctx.fx.addBurnable({ pos: V(0, 0, 0), material: 'steelPainted', char: cyl.userData.char, probe: [0.1, 0.5, 0], label: 'plášť lahve' });
      return {
        update() {
          const fl = ctx.controls.jetFlow ?? 2.2;
          if (fl !== last) { last = fl; sp = fireSpec({ kind: 'jet', fuel: 'propane', mdot: fl / 1000 }); src.D = sp.D; const { mult, ...ex } = sp.extra; Object.assign(src.o, ex, { L: (q) => (sp.extra.L ? sp.extra.L(q) : sp.L) }); Object.assign(src.o.mult, mult); }
        },
        info: () => [...sp.rows, ...fireRows(src).slice(1, 5), ['Délka podle korelace', jetFlameLength(sp.Qpeak).toFixed(2) + ' m', 'Lowesmith 2007 ★4'], ['Láhev 10 kg vydrží', mmss(10 / sp.mdot), ''],
          ['Sálání ve 2 m od plamene', kW(ctx.fx.heatFlux([nz.x + 2, nz.y + sp.L * 0.5, 0]).total) + ' – ' + fluxEffect(ctx.fx.heatFlux([nz.x + 2, nz.y + sp.L * 0.5, 0]).total), 'bodový zdroj ★3'],
          ['Plášť lahve', degC(shell.Ts), 'plamen nesmí olizovat láhev: roztržení (viz Acetylenová láhev)'], ['Hašení', 'plamen plynu nehasit – uzavřít ventil; uhašený únik = výbušný oblak', 'třída C']],
      };
    },
  },
  {
    id: 'trail', group: 'Kapaliny', name: 'Hořící stopa k sudu', ground: 'concrete', time: 'soumrak', duration: 60, loop: true,
    desc: 'Stopa rozlitého paliva 12 m dlouhá vede k sudu. Benzín je nad bodem vzplanutí: plamen běží parami nad hladinou 1,7 m/s a je u sudu za 7 sekund. Nafta je pod bodem vzplanutí (55 °C): čelo plamene si musí kapalinu před sebou ohřát a leze 5 cm/s – čtyři minuty. Sud se zbytkem benzínu po ohřátí pláště vybuchne ohnivou koulí.',
    tiers: ['T0–T1: 4 úseky stopy, plošné plameny', 'T2–T3: 6 úseků s objemovým plamenem, černý kouř', 'T4–T5: + objemový kouř, plná ohnivá koule sudu'],
    cams: [{ name: 'celek', pos: [6, 3.5, 13], target: [6, 1, 0] }, { name: 'od zapálení', pos: [-2.5, 1.7, 2], target: [8, 0.5, 0] }, { name: 'u sudu', pos: [15, 1.8, 5], target: [12, 0.8, 0] }],
    controls: [{ id: 'trFuel', label: 'Palivo', type: 'select', value: 'gasoline', options: ['gasoline', 'diesel'], restart: true }],
    build(ctx) {
      const fx = ctx.fx, fuel = ctx.controls.trFuel || 'gasoline', len = 12, w = 0.28, N = ctx.tier.id === 0 ? 4 : 6, seg = len / N;
      const sp = fireSpec({ kind: 'line', fuel, length: len, width: w, depthMM: 1.2 }), v = liquidSpread(fuel), tIgn = 2;
      if (fuel === 'diesel') ctx.setTimeScale(8);
      const strip = P2.spillStrip({ lod: ctx.lod, len, w: w * 1.3, seed: 9 }); ctx.add(strip);
      const drum = P.barrel({ lod: ctx.lod, paint: 'metalRed' }); drum.position.set(len + 0.5, 0, 0); ctx.add(drum);
      const srcs = [];
      for (let i = 0; i < N; i++) {
        const xc = (i + 0.5) * seg, start = tIgn + xc / v;
        srcs.push(fx.addSource({ pos: V(xc, 0.01, 0), fuel, seed: 20 + i * 3, volume: true, footprint: { type: 'rect', w: seg * 1.5, d: w * 1.2 }, start, end: start + sp.duration, shapeK: 1.45, taper: 0.6, puffAmp: 0.7, volSoot: 0.3, mult: { smoke: 1.3, haze: 0.4 },
          Q: (t) => (sp.Qpeak / N) * Math.min(1, t / (fuel === 'diesel' ? 10 : 1.2)) * (t > sp.duration - 4 ? Math.max(0, (sp.duration - t) / 4) : 1) }));
      }
      const es = explosionSpec({ kind: 'fireball', fuel: 'gasoline', mass: 12 });
      const b = fx.addBurnable({ label: 'sud (zbytek 15 l benzínu)', pos: drum.position.clone(), material: 'steelPainted', char: drum.userData.char, probe: [-0.3, 0.3, 0],
        explosive: { spec: es, cookT: 560, rcd: 7850 * 490 * 0.0012 }, onEvent: (type, bb) => { if (type === 'exploded') { drum.visible = false; bb.tBoom = ctx.t; ctx.setTimeScale(1); } } });
      drum.userData.char.uHeatFall.value = 0.3;
      return {
        info: () => [...sp.rows, ['Palivo', FUELS[fuel].name, `bod vzplanutí ${degC(MATERIALS[fuel].flash)}`], ['Čelo plamene u sudu za', mmss(len / v), `${len} m / ${v >= 1 ? v.toFixed(1) + ' m/s' : (v * 100).toFixed(0) + ' cm/s'}`],
          ['Výška plamenů stopy', sp.L.toFixed(2) + ' m', 'Yuan & Cox ★4'], ['Výkon celé stopy', fmtW(srcs.reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0)), ''],
          ['Plášť sudu', b.tBoom != null ? `vybuchl v ${mmss(b.tBoom)}` : `${degC(b.body.ex.Tc)} (tok ${kW(b.q)})`, 'roztržení při ~290 °C pláště ★2'], ...es.rows.slice(1)],
      };
    },
  },
];

// =============================================================================================== HAŠENÍ A NÁSLEDKY
const EX_FUELS = { 'palety (A)': 'A', 'nafta (B)': 'B', 'benzín (B)': 'B', 'hořčík (D)': 'D' };
export const ITER7_AFTER = [
  {
    id: 'extinguish', group: 'Hašení', name: 'Hašení: hasivo × co hoří', ground: 'concrete', time: 'soumrak', duration: 80,
    desc: 'Jedna tabulka pravidel: hasivo × třída požáru. Voda chladí (2,6 MJ na kilogram odpařené vody) a na hořící dřevo stačí ~0,4 l/s na megawatt; na benzín je k ničemu, protože ho rozstříkne, a hořčík nebo rozpálený olej s ní vybuchnou. Pěna odřízne páry od vzduchu, prášek zastaví reakci v plameni, ale nechladí – dřevo po něm znovu vzplane. Zvol, co hoří a čím hasíš; hasit se začíná v 10. sekundě.',
    tiers: ['T0–T1: proud 60 kapek/s, pára 8 obláčků/s', 'T2–T3: 150–250 kapek/s, pára podle odpařené vody, pěnový koberec', 'T4–T5: + objemový kouř slábnoucího ohně'],
    cams: [{ name: 'celek', pos: [-1.2, 2.4, 6.5], target: [-1.2, 0.9, 0] }, { name: 'hasič', pos: [-5.2, 1.7, 1.2], target: [0, 0.6, 0] }, { name: 'detail ohně', pos: [1.8, 1.3, 2.6], target: [0, 0.6, 0] }],
    controls: [{ id: 'exFuel', label: 'Co hoří', type: 'select', value: 'palety (A)', options: Object.keys(EX_FUELS), restart: true },
      { id: 'exAgent', label: 'Hasivo', type: 'select', value: 'waterJet', options: Object.keys(AGENTS), restart: true }],
    build(ctx) {
      const fx = ctx.fx, what = ctx.controls.exFuel || 'palety (A)', agent = ctx.controls.exAgent || 'waterJet', cls = EX_FUELS[what], a = AGENTS[agent];
      const dist = Math.min(4.2, a.reach * 0.8), nz = P3.nozzle({ lod: ctx.lod, elev: 0.12 }); nz.position.set(-dist, 0, 0); ctx.add(nz); nz.updateMatrixWorld(true);
      let burn = null, src = null, A = 1, sp;
      if (cls === 'A') {
        for (let i = 0; i < 2; i++) { const p = P2.pallet({ lod: ctx.lod }); p.position.set(0.02 * i, i * 0.146, 0.02 * i); p.rotation.y = i * 0.15; ctx.add(p); if (!i) burn = p; }
        sp = fireSpec({ kind: 'pile', material: 'softwood', mass: 44, stick: 0.03, D: 1.1, tGrow: 7 }); A = 7;
        burn = fx.addBurnable({ label: '2 palety', pos: V(0, 0, 0), material: 'softwood', mass: 44, area: A, size: 1.2, ignited: true, spec: sp, char: burn.userData.char, seed: 3, source: { footprint: { type: 'rect', w: 1.2, d: 0.8 } } });
      } else if (cls === 'B') {
        const fuel = what.startsWith('nafta') ? 'diesel' : 'gasoline', D = 1.2; A = Math.PI * D * D / 4;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(D / 2, 40), new THREE.MeshStandardMaterial({ color: 0x0b0a08, roughness: 0.05 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.006; ctx.add(disc);
        sp = fireSpec({ kind: 'pool', fuel, D, depth: 0.02 });
        src = fx.addSource({ pos: V(0, 0.01, 0), seed: 5, volume: true, ...sourceOptions(sp), end: Infinity, Q: (t) => sp.Qpeak * Math.min(1, t / 4), mult: { smoke: 1.5 }, label: FUELS[fuel].name });
      } else {
        const pile = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.4, metalness: 0.9 })); pile.position.y = 0.05; ctx.add(pile);
        sp = fireSpec({ kind: 'metal', fuel: 'magnesium', mass: 2, duration: 150 }); A = 0.1;
        src = fx.addSource({ pos: V(0, 0.06, 0), seed: 5, volume: true, ...sourceOptions(sp), end: Infinity, Q: (t) => sp.Qpeak * Math.min(1, t / 3), label: 'hořčík' });
      }
      const spray = fx.addSpray({ agent, from: wpos(nz, nz.userData.muzzle), to: V(0, cls === 'A' ? 0.3 : 0.05, 0), radius: 0.9, on: false, seed: 4 });
      const e = agentEffect(agent, cls); let tOut = null, said = false;
      return {
        update(dt, t) {
          spray.on = t > 10 && t < 55;
          const out = burn ? burn.state === 'uhašeno' : src && !src.enabled;
          if (out && tOut == null) { tOut = t; ctx.message('Uhašeno za ' + (t - 10).toFixed(0) + ' s.'); }
          if (!said && t > 13 && e.k < 0) { said = true; ctx.message('Pozor: ' + a.name + ' tento požár zhoršuje – ' + e.note + '.'); }
          this.Q = burn ? burn.src?.ph?.Q || 0 : src.ph?.Q || 0;
        },
        info() {
          const Q0 = sp.Qpeak;
          return [['Co hoří', what, 'třída ' + cls], ['Výkon bez hašení', fmtW(Q0), ''], ['Výkon teď', fmtW(this.Q || 0), ''], ...spray.rows(cls, Q0, A),
            ['Potřeba hasiva', a.mode === 'cool' ? (waterDemand(Q0, agent) * 60).toFixed(0) + ' l/min' : '—', 'F = 0,5·Q / (η·2,6 MJ/kg) ★3'], ['Dodáno', (spray.used).toFixed(1) + (a.total ? ' / ' + a.total : '') + ' kg', ''],
            ['Stav', tOut != null ? 'UHAŠENO za ' + (tOut - 10).toFixed(0) + ' s' : spray.active ? (e.k < 0 ? 'ZHORŠUJE SE' : e.k === 0 ? 'bez účinku' : 'hasí se') : 'hoří', burn ? `potlačení ${(burn.supp.s * 100).toFixed(0)} %, voda na povrchu ${burn.supp.wet.toFixed(1)} kg/m²` : src?.supp ? `potlačení ${(src.supp.s * 100).toFixed(0)} %` : ''],
            ['Pravidlo', e.note || '—', 'physics/suppress.js']];
        },
      };
    },
  },
  {
    id: 'aftermath', group: 'Následky', name: 'Následky: saze na zdi, sklo, hliník', ground: 'concrete', time: 'den', timeScale: 12, duration: 1500,
    desc: 'Tři palety hoří u omítnuté zdi (~1,3 MW). Saze stoupají s kouřem a usazují se na chladné stěně do tvaru V; u ohniska je zeď tak horká (nad ~430 °C), že saze shoří – světlý „čistý výpal“ s černým lemem, podle kterého vyšetřovatelé hledají ohnisko. Okenní tabule opodál praskne, když se střed ohřeje o ~70 °C víc než okraj v rámu, a vypadne při toku nad 20 kW/m². Litý disk v plamenech se při 660 °C roztaví a steče do louže; ocel jen ztratí lak.',
    tiers: ['T0–T1: stopy na zdi jedním průchodem, střepy 12 kusů', 'T2–T3: + objemový plamen, střepy 60 kusů, žhnoucí louže', 'T4–T5: + objemový kouř, plné rozlišení šumu stop'],
    cams: [{ name: 'celek', pos: [1.2, 2, 6.4], target: [0.6, 1.3, -0.3] }, { name: 'zeď po požáru', pos: [0, 1.7, 4.2], target: [0, 1.5, -0.6] }, { name: 'okno a disk', pos: [3.6, 1.2, 2.6], target: [1.2, 0.6, 0.2] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(5), W = P3.wall({ lod: ctx.lod, w: 5, h: 3.2, t: 0.3 }); W.position.set(0, 0, -0.75); ctx.add(W);
      const pal = []; for (let i = 0; i < 3; i++) { const p = P2.pallet({ lod: ctx.lod }); p.position.set(0.02 * i, i * 0.146, 0.02 * i - 0.05); p.rotation.y = i * 0.12; ctx.add(p); pal.push(p); }
      const core = fx.addBurnable({ label: '3 palety', pos: V(0, 0, 0), material: 'softwood', mass: 66, area: 10.5, size: 1.2, D: 1.15, ignited: true, char: pal[0].userData.char, seed: 3, source: { footprint: { type: 'rect', w: 1.2, d: 0.8 } } });
      const lo = fx.addBurnable({ label: 'zeď u ohniska (0,8 m)', pos: V(0, 0, -0.6), material: 'masonry', probe: [0, 0.8, 0] }), hi = fx.addBurnable({ label: 'zeď nahoře (2,6 m)', pos: V(0, 0, -0.6), material: 'masonry', probe: [0, 2.6, 0] });
      const soot = fx.addWallSoot({ pos: V(0, 1.6, -0.6), axis: 'z', sign: 1, w: 5, h: 3.2, fire: [2.5, 0], b0: 0.65, Lf: 2.2, seed: 4 });
      // okno ve vlastním rámu, 2,1 m od ohně
      const gp = P3.glassPane({ w: 1.0, h: 1.2, seed: 6 }); gp.position.set(2.1, 0.95, 0.5); gp.rotation.y = -1.15; ctx.add(gp);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.12), makeMaterial('plaster')); fr.position.set(2.1, 0.17, 0.5); fr.rotation.y = -1.15; ctx.add(fr);
      const gb = fx.addBurnable({ label: 'okno (' + Math.hypot(2.1, 0.5).toFixed(1) + ' m)', pos: V(2.1, 0, 0.5), material: 'glass', probe: [0, 0.95, 0],
        onEvent: (type) => { if (type === 'crack') { gp.userData.setCrack(1); ctx.message('Okno prasklo (střed o 70 °C teplejší než okraj).'); if (fx.audioEvents.length < 64) fx.audioEvents.push({ type: 'pop', pos: gp.position.clone() }); }
          if (type === 'fallout') { gp.visible = false; fx.debris.burst(gp.position.clone(), { n: ctx.tier.id > 0 ? 60 : 12, speed: 2.5, size: 0.03, hot: 0, up: 0.2 }, r); ctx.message('Sklo vypadlo.'); } } });
      // litý disk na okraji plamenů
      const wh = P3.aluWheel({ lod: ctx.lod }); wh.position.set(-0.6, 0, 0.5); ctx.add(wh);
      const pud = P3.meltPuddle({ lod: ctx.lod, R: 0.5 }); pud.position.set(-0.68, 0.004, 0.6); ctx.add(pud);
      const ab = fx.addBurnable({ label: 'litý disk (hliník)', pos: wh.position.clone(), material: 'aluminium', probe: [0.3, 0.12, -0.25] });
      const dr = P.barrel({ lod: ctx.lod, paint: 'metalBlue' }); dr.position.set(-1.9, 0, 0.3); ctx.add(dr); dr.userData.char.uHeatFall.value = 0.25;
      const sb = fx.addBurnable({ label: 'ocelový sud (1,9 m)', pos: dr.position.clone(), material: 'steelPainted', char: dr.userData.char, probe: [0.3, 0.5, -0.05] });
      fx.addScorch({ pos: V(0, 0, 0), radius: 1.7, rate: 1 / 500, glow: 0.3, seed: 3 });
      return {
        update() {
          // saze na stěně mimo plamen: úměrné času × výkonu (stěna vedle ohně zčerná za minuty) – kalibrace na fotky ★2
          const ml = masonryLook(lo.Tmax, 1); this.sootK = Math.min(1, (this.sootK || 0) + ((fx.scnDt || 0) * (core.src?.ph?.Q || 0)) / 1e6 / 240); soot.u.uSoot.value = Math.max(soot.u.uSoot.value, this.sootK, hi.soot); soot.u.uClean.value = Math.max(soot.u.uClean.value, ml.cleanBurn);
          if (core.src?.ph) soot.u.uLf.value = Math.max(soot.u.uLf.value * 0.999, core.src.ph.L);
          gp.userData.setSoot(Math.min(0.6, gb.soot));
          soot.fireLit = Math.min(0.35, (core.src?.ph?.Q || 0) / 4e6);
          wh.scale.y = Math.max(0.06, 1 - 0.94 * ab.melt); wh.scale.x = wh.scale.z = 1 + 0.15 * ab.melt; pud.scale.setScalar(Math.max(0.001, 0.5 * Math.sqrt(ab.melt)));
          const gl = Math.max(0, Math.min(1, (ab.Ts - 800) / 200)); pud.userData.mat.emissive.setRGB(0.9 * gl, 0.25 * gl, 0.05 * gl); wh.userData.mat.color.setRGB(0.79 - 0.5 * ab.soot, 0.8 - 0.5 * ab.soot, 0.82 - 0.5 * ab.soot);
          for (let i = 1; i < 3; i++) { const u = pal[i].userData.char, u0 = pal[0].userData.char; u.uChar.value = u0.uChar.value; u.uGlow.value = u0.uGlow.value; }
          if (core.state === 'burning' || core.state === 'burnt') pal.forEach((p, i) => { p.scale.y = 1 - 0.6 * core.burned ** 1.5; p.position.y = i * 0.146 * p.scale.y; });
        },
        info() {
          const ml = masonryLook(lo.Tmax, lo.soot);
          return [['Ohnisko', core.state === 'burnt' ? 'vyhořelo' : fmtW(core.src?.ph?.Q || 0), '3 palety, 66 kg'],
            [lo.label, `${kW(lo.q)} · ${degC(lo.Ts)} (max ${degC(lo.Tmax)})`, ml.cleanBurn > 0.5 ? 'čistý výpal (saze shořely)' : lo.Tmax > 570 ? 'omítka praská, růžoví' : 'saze'], [hi.label, `${kW(hi.q)} · ${degC(hi.Ts)}`, hi.Tmax > 700 ? 'v plameni: saze tu shoří' : 'saze'], ['Saze na zdi kolem plamene', ((this.sootK || 0) * 100).toFixed(0) + ' %', 'čas × výkon, kalibrace na fotky ★2'],
            [gb.label, `${kW(gb.q)} · sklo ${degC(gb.Ts)} · ${gb.state === 'cold' ? 'celé' : gb.state}`, 'prasknutí ΔT 70 K ★4, vypadnutí 20 kW/m² ★2'],
            [ab.label, `${degC(ab.Ts)} · roztaveno ${(ab.melt * 100).toFixed(0)} %`, 'tání 660 °C ★5'], [sb.label, `${degC(sb.Ts)} (max ${degC(sb.Tmax)}) – ${sb.state === 'cold' ? 'beze změny' : sb.state}`, 'ocel taje až při 1 500 °C'],
            ['Co čte vyšetřovatel', 'V ukazuje k ohnisku; čistý výpal = nejdelší a nejhorkější hoření; roztavený hliník = přes 660 °C', 'NFPA 921 ★4']];
        },
      };
    },
  },
  {
    id: 'flashover', group: 'Následky', name: 'Místnost: celkové vzplanutí a plameny z okna', ground: 'dirt', time: 'soumrak', timeScale: 6, duration: 700,
    desc: 'Pokoj 4 × 3,5 m s jedním oknem. Oheň roste s druhou mocninou času, horká vrstva pod stropem sílí. Kolem 100–150 °C praská okno, při ~360 °C vypadne. Jakmile vrstva dosáhne ~500–600 °C (tady při 1,3 MW, po necelých 3 minutách), vzplane naráz všechno v místnosti. Dál už rozhoduje vzduch: oknem ho projde jen na 3 MW, zbytek hořlavých plynů hoří venku – plameny šlehají 2,5 m nad okno a zapalují patro nad ním.',
    tiers: ['T0–T1: jeden plošný plamen uvnitř a jeden v okně, stopy na fasádě', 'T2–T3: objemové plameny, kouř valící se pod nadpražím, střepy', 'T4–T5: + objemový kouř, žhnoucí interiér'],
    cams: [{ name: 'před domem', pos: [4.5, 2.2, 8.5], target: [0, 2.2, 1.5] }, { name: 'z boku', pos: [7.5, 3, 3.5], target: [0, 2.4, 2] }, { name: 'detail okna', pos: [1.6, 1.7, 5], target: [0, 1.8, 2] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(6), dim = { w: 4, d: 3.5, H: 2.6, win: [1.2, 1.4], sill: 0.9 };
      const R = P3.room({ lod: ctx.lod, ...dim }); ctx.add(R); const ud = R.userData, zf = ud.front, wy = ud.window.cy, top = dim.sill + dim.win[1];
      const up = P3.wall({ lod: ctx.lod, w: 4.5, h: 2.6, t: 0.25 }); up.position.set(0, dim.H + 0.18, zf - 0.125); ctx.add(up); // patro nad oknem
      const sofa = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.95 })); sofa.position.set(-0.9, 0.41, -1.1); ctx.add(sofa);
      const gp = P3.glassPane({ w: dim.win[0] - 0.1, h: dim.win[1] - 0.1, seed: 2 }); gp.position.set(0, wy, zf - 0.12); ctx.add(gp);
      const sp = fireSpec({ kind: 'room', floor: [dim.w, dim.d], H: dim.H, opening: dim.win, load: 25 }), rm = sp.room;
      const seat = fx.addSource({ pos: V(-0.9, 0.78, -1.1), fuel: 'houseContents', seed: 3, volume: true, D: 0.9, end: Infinity, Q: (t) => (t < rm.tFo ? sp.Q(t) : 0), L: (q) => Math.max(0.08, Math.min(dim.H - 0.9, 0.235 * Math.pow(q / 1000, 0.4) - 0.9)) });
      const full = fx.addSource({ pos: V(0, 0.08, 0), fuel: 'houseContents', seed: 4, volume: true, D: 3, footprint: { type: 'rect', w: dim.w - 0.5, d: dim.d - 0.5 }, start: rm.tFo, end: Infinity, Q: (t) => Math.min(rm.Qin, sp.Q(t + rm.tFo)) * Math.min(1, t / 6), L: () => dim.H - 0.25, mult: { smoke: 0.3 } });
      const win = fx.addSource({ pos: V(0, dim.sill + 0.55, zf + 0.22), fuel: 'houseContents', seed: 5, volume: true, D: 1.1, footprint: { type: 'rect', w: dim.win[0] - 0.15, d: 0.35 }, start: rm.tFo + 2, end: Infinity, shapeK: 1.3,
        Q: (t) => (rm.Qext + 0.25 * rm.Qin) * Math.min(1, t / 5) * (sp.Q(t + rm.tFo + 2) / sp.Qpeak), L: () => rm.zf + dim.win[1] * 0.6, mult: { smoke: 1.8 } });
      const soot = fx.addWallSoot({ pos: V(0, top + 1.55, zf), axis: 'z', sign: 1, w: 4.4, h: 3.1, fire: [2.2, 0], b0: 0.6, Lf: rm.zf, seed: 8 });
      let glass = { T: 293, state: 'celé' }, acc = 0, tCrack = null, tFall = null, said = false;
      return {
        update(dt, t) {
          const Q = sp.Q(t), Tl = rm.layerT(Math.min(Q, rm.Qin)), qg = 0.5 * 5.67e-8 * (Tl ** 4 - 293 ** 4) + 15 * (Tl - 293) * 0.5; this.Tl = Tl; this.Q = Q;
          const g0 = glass.state; glass = stepGlass(glass, qg, Tl, dt);
          if (glass.state !== g0) {
            if (glass.state === 'popraskané') { tCrack = t; gp.userData.setCrack(1); }
            else { tFall = t; gp.visible = false; fx.debris.burst(V(0, wy, zf + 0.1), { n: ctx.tier.id > 0 ? 70 : 14, speed: 3, size: 0.03, hot: 0, up: 0.15 }, r); ctx.message('Okno vypadlo – oheň dostal vzduch.'); }
          }
          gp.userData.setSoot(Math.min(0.95, (Tl - 293) / 250));
          if (!said && t >= rm.tFo) { said = true; ctx.message('Celkové vzplanutí: hoří celá místnost, plameny jdou oknem ven.'); }
          // kouř valící se z okna pod nadpražím (před vzplanutím i po něm), jen když je okno pryč
          if (tFall != null && fx.layers.smoke) {
            acc += fx.dtReal * Math.min(40, 4 + 20 * Math.sqrt(Q / 1e6)) * (fx.tier.smokeMul ?? 1) * Math.max(0.3, fx.budgetScale.smoke);
            while (acc >= 1) { acc -= 1; fx.bb.spawnSmoke({ x: (r() - 0.5) * dim.win[0] * 0.8, y: top - 0.25 * r(), z: zf + 0.1, vx: (r() - 0.5) * 0.5, vy: 1.5 + 1.5 * r(), vz: 1.2 + 1.2 * r(), life: 4 + 4 * r(), s0: 0.35, s1: 2.6 + 1.5 * r(), tau: 1.4, albedo: [0.07, 0.065, 0.06], drag: 0.5, glowing: t > rm.tFo && r() < 0.3 }); }
          }
          const k = t < rm.tFo ? 0 : Math.min(1, (t - rm.tFo) / 240);
          soot.u.uSoot.value = Math.max(soot.u.uSoot.value, tFall != null ? Math.min(1, 0.25 * (t - tFall) / 120 + k) : 0); soot.u.uClean.value = Math.max(soot.u.uClean.value, k * 0.9);
          if (t >= rm.tFo) sofa.material.color.setRGB(0.05, 0.04, 0.035);
          soot.fireLit = Math.min(0.5, (win.ph?.Q || 0) / 2e6);   // fasádu nad oknem osvětlují plameny z okna
        },
        info() {
          return [...sp.rows, ['Výkon teď', fmtW(this.Q || 0), 'růst t² „fast“ ★3'], ['Horká vrstva pod stropem', degC(this.Tl || 293), 'MQH 1981 ★4'],
            ['Okno', glass.state + (tCrack != null ? ` (prasklo v ${mmss(tCrack)}${tFall != null ? ', vypadlo v ' + mmss(tFall) : ''})` : ''), `sklo ${degC(glass.T)}`],
            ['Uvnitř hoří nejvýš', fmtW(rm.Qin), 'kolik vzduchu projde oknem'], ['Plamen z okna', fmtW(win.ph?.Q || 0) + ', ' + rm.zf.toFixed(1) + ' m nad nadpraží', 'Law 1978 ★3'],
            ['Sálání na fasádu naproti (6 m)', kW(fx.heatFlux([0, 2, zf + 6]).total), fluxEffect(fx.heatFlux([0, 2, zf + 6]).total)], ['Přežití v místnosti', (this.Tl || 293) > 420 ? 'nemožné (vrstva nad 150 °C)' : 'při zemi ještě ano', '']];
        },
      };
    },
  },
];

// =============================================================================================== PRACH, PYROTECHNIKA, KOVY, VÍR
const STAR = { red: 1, green: 2, blue: 3, yellow: 4, purple: 5, white: 6 };
export const ITER7_SPECIAL = [
  {
    id: 'dust', group: 'Exploze', name: 'Výbuch prachu (mouka)', ground: 'concrete', time: 'soumrak', duration: 14, loop: true,
    desc: 'Mouka v pytli nehoří. Rozvířená do oblaku (~0,5 kg/m³) má obrovský povrch a hoří jako plyn: plamen proběhne oblakem za zlomek sekundy a spaliny se roztáhnou sedmkrát. Venku je to valivá oranžová koule skoro bez tlaku; v uzavřeném silu stejné množství vytvoří 7–9 barů a budovu roztrhne. Posuň hmotnost a přepni „uzavřený prostor“.',
    tiers: ['T0–T1: oblak 30 částic, koule z plošných obláčků', 'T2–T3: oblak 120 částic, objemová koule, kouř', 'T4–T5: + objemový kouř, trosky u uzavřené varianty'],
    cams: [{ name: 'celek', pos: [3, 2.2, 7.5], target: [0, 1.6, 0] }, { name: 'hráč', pos: [5.5, 1.7, 5], target: [0, 1.5, 0] }, { name: 'z dálky', pos: [14, 4, 22], target: [0, 3, 0] }],
    controls: [{ id: 'duMass', label: 'Rozvířený prach [kg]', type: 'range', min: 0.05, max: 25, value: 1, log: true }, { id: 'duConf', label: 'Uzavřený prostor (silo)', type: 'check', value: false }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(3), sk = P3.sack({ lod: ctx.lod }); ctx.add(sk);
      const cd = P.candle({ lod: Math.min(ctx.lod, 2) }); cd.position.set(0.9, 0, 0.3); ctx.add(cd);
      fx.addSource({ pos: V(0.9, cd.userData?.flameAt?.y ?? 0.22, 0.3), seed: 3, volume: true, ...sourceOptions(fireSpec({ kind: 'wick', fuel: 'paraffin' })), end: 3.1 });
      const mk = () => explosionSpec({ kind: 'dust', mass: ctx.controls.duMass ?? 1, confined: !!ctx.controls.duConf }); let es = mk(), boom = false, acc = 0;
      return {
        update(dt, t) {
          if (!boom) es = mk();
          const Rc = es.fb.D / 3.8;
          if (t > 1.4 && t < 3 && fx.layers.smoke) { // stlačený vzduch rozvíří prach
            acc += fx.dtReal * (ctx.tier.id === 0 ? 20 : 80) * Math.max(0.3, fx.budgetScale.smoke);
            while (acc >= 1) { acc -= 1; const a = r() * 6.28, u = r(); fx.bb.spawnSmoke({ x: 0, y: 0.3, z: 0, vx: Math.cos(a) * Rc * (0.5 + u), vy: Rc * (1.2 + 1.5 * r()), vz: Math.sin(a) * Rc * (0.5 + u), life: 2.5, s0: 0.2, s1: Rc * 1.3, tau: 0.5, albedo: [0.88, 0.85, 0.76], drag: 1.8 }); }
          }
          if (!boom && t > 3) { boom = true; fx.blast(es, V(0, Math.max(0.6, Rc * 1.1), 0), { seed: 12 }); }
        },
        info: () => [...es.rows, ['Proč pytel nehoří', 'malý povrch; oblak má ~100 m² povrchu zrnek na kilogram a všude kolem vzduch', ''], ['Dolní mez výbušnosti', '~60 g/m³ (mouka), cukr 30, uhelný prach 60', '★4'],
          ...blastSummary(Math.max(es.W, 1e-4), [3, 10]).map((b) => [`  přetlak v ${b.R} m`, b.kPa < 1 ? (b.kPa * 1000).toFixed(0) + ' Pa' : b.kPa.toFixed(1) + ' kPa', b.effect]), ['Druhotný výbuch', 'první rána zvíří usazený prach v celé hale → druhá bývá ničivější', '★4']],
      };
    },
  },
  {
    id: 'fireworks', group: 'Exploze', name: 'Ohňostroj: kulová puma', ground: 'grass', time: 'noc', duration: 22, loop: true,
    desc: 'Barva hvězdic není teplota, ale čárové spektrum kovových solí: stroncium červená, baryum zelená, měď modrá, sodík žlutá. Výmetná náplň vystřelí pumu z trubky, zpožďovač hoří 3–6 s, trhací náplň ji ve výšce roztrhne a zapálí hvězdice. Pravidla pyrotechniků: výška 1,2 m a průměr květu 0,54 m na každý milimetr ráže.',
    tiers: ['T0–T1: 40 hvězdic na pumu, bez stopy', 'T2–T3: 70–160 hvězdic, zlatá stopa při výstupu, kouř rozprasku', 'T4–T5: plný počet, dohořívající jiskry, osvětlený kouř'],
    cams: [{ name: 'diváci (150 m)', pos: [0, 1.7, 150], target: [0, 70, 0] }, { name: 'u trubek', pos: [3, 1.2, 5], target: [0, 6, 0] }, { name: 'ze strany (300 m)', pos: [280, 20, 120], target: [0, 90, 0] }],
    controls: [{ id: 'fwCal', label: 'Ráže [mm]', type: 'range', min: 50, max: 200, value: 100, step: 5 }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(21), rack = P3.mortarRack({ lod: ctx.lod, n: 4, cal: 100 }); ctx.add(rack); rack.updateMatrixWorld(true);
      const cols = ['red', 'green', 'blue', 'yellow'], shells = cols.map((c, i) => ({ c, t0: 1.5 + i * 3.2, tube: wpos(rack, rack.userData.tubes[i]), st: 0 }));
      let sp = explosionSpec({ kind: 'pyro', caliber: ctx.controls.fwCal ?? 100, color: 'red' });
      return {
        update(dt, t) {
          const cal = ctx.controls.fwCal ?? 100, q = ctx.tier.id;
          for (const s of shells) {
            if (s.st === 0 && t >= s.t0) { // výmet: záblesk u ústí, rána, kouř
              s.st = 1; s.sp = explosionSpec({ kind: 'pyro', caliber: cal, color: s.c }); sp = s.sp; s.wob = (r() - 0.5) * 0.08;
              fx.lights.add(s.tube.x, s.tube.y + 0.3, s.tube.z, 3e5, 1900, 0.4);
              for (let i = 0; i < (q === 0 ? 3 : 10); i++) fx.bb.spawnSmoke({ x: s.tube.x, y: s.tube.y, z: s.tube.z, vx: (r() - 0.5) * 2, vy: 2 + 5 * r(), vz: (r() - 0.5) * 2, life: 2 + 2 * r(), s0: 0.15, s1: 1.2, tau: 0.5, albedo: [0.7, 0.7, 0.72], drag: 1.2 });
              if (fx.audioEvents.length < 64) fx.audioEvents.push({ type: 'shot', pos: s.tube.clone(), W: 0.01 });
            }
            if (s.st === 1) {
              const tl = t - s.t0, k = tl / s.sp.tLift, y = s.tube.y + s.sp.H * (1 - (1 - Math.min(1, k)) ** 2), x = s.tube.x + s.wob * s.sp.H * k;
              if (q > 0 && r() < dt * 60) fx.sp.spawn({ x, y, z: s.tube.z, vx: (r() - 0.5) * 2, vy: -3, vz: (r() - 0.5) * 2, life: 0.5 + 0.6 * r(), T: 1500, tauC: 0.8, size: 0.02, drag: 1.5, grav: 0.6, seed: r() }); // zlatá stopa
              if (k >= 1) {
                s.st = 2; const n = Math.round(s.sp.stars * (q === 0 ? 0.35 : q >= 4 ? 1.6 : 1) * Math.max(0.4, fx.budgetScale.spark)), c = V(x, y, s.tube.z);
                for (let i = 0; i < n; i++) { // rovnoměrně po kouli (zlatý úhel), hvězdice brzdí odpor vzduchu → kulový květ
                  const u = 1 - (2 * (i + 0.5)) / n, a = i * 2.39996, sr = Math.sqrt(1 - u * u), v = s.sp.starV * (0.92 + 0.16 * r());
                  fx.sp.spawn({ x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * sr * v, vy: u * v, vz: Math.sin(a) * sr * v, life: s.sp.burn * (0.85 + 0.3 * r()), T: 2500, tauC: 50, size: 0.05 + 0.0006 * cal, drag: 1.9, grav: 0.35, seed: r(), star: STAR[s.c] });
                }
                s.burst = c; s.tb = t;
                for (let i = 0; i < (q === 0 ? 4 : 14); i++) fx.bb.spawnSmoke({ x: c.x + (r() - 0.5) * 4, y: c.y + (r() - 0.5) * 4, z: c.z + (r() - 0.5) * 4, vx: (r() - 0.5) * 6, vy: (r() - 0.5) * 6, vz: (r() - 0.5) * 6, life: 5 + 4 * r(), s0: 2, s1: 8 + 0.1 * cal, tau: 0.25, albedo: [0.6, 0.6, 0.62], drag: 1 });
                if (fx.audioEvents.length < 64) fx.audioEvents.push({ type: 'shot', pos: c.clone(), W: s.sp.W });
              }
            }
            if (s.st === 2 && t - s.tb < s.sp.burn) { const k = 1 - (t - s.tb) / s.sp.burn, tn = s.sp.tint; fx.lights.add(s.burst.x, s.burst.y, s.burst.z, 4e6 * k * (cal / 100) ** 2, 2500, s.sp.R * 0.4); void tn; }
          }
        },
        info: () => [...sp.rows, ['Rychlost z trubky', sp.v0.toFixed(0) + ' m/s', '★2'], ['Rána u diváků (150 m) za', (Math.hypot(150, sp.H) / 343).toFixed(2) + ' s po záblesku', 'rychlost zvuku'],
          ['Bezpečná vzdálenost', (0.8 * (ctx.controls.fwCal ?? 100)).toFixed(0) + ' m', '~0,8 m na mm ráže (NFPA 1123: 70 stop na palec) ★3'], ['Modrá je nejtěžší', 'chlorid měďný se nad ~1 200 °C rozpadá → slabá a snadno vybledne', '★4']],
      };
    },
  },
  {
    id: 'thermite', group: 'Materiály', name: 'Kovy: termit a hořčík', ground: 'concrete', time: 'soumrak', duration: 60, loop: true,
    desc: 'Termit (oxid železitý + hliník) nepotřebuje vzduch: 4 MJ/kg, ~2 500 °C, žádný plamen – jen oslnivá sprška jisker a tekuté železo, které proteče květináčem a propálí ocelovou desku. Zapaluje se hořčíkovou páskou. Hořčík hoří bíle při ~3 100 °C a voda ho neuhasí: rozloží se na vodík a požár vybuchne (ve 30. sekundě kbelík vody).',
    tiers: ['T0–T1: 150 jisker/s, plošné plameny', 'T2–T3: 600 jisker/s, bílý dým, žhnoucí deska, louže železa', 'T4–T5: 1 500 jisker/s, objemový dým, tetelení'],
    cams: [{ name: 'celek', pos: [1.3, 0.9, 2.3], target: [0.25, 0.4, 0] }, { name: 'detail', pos: [0.5, 0.75, 1.0], target: [0, 0.5, 0] }, { name: 'hořčík', pos: [1.6, 0.6, 1.4], target: [0.9, 0.15, 0] }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(4), pot = P3.thermitePot({ lod: ctx.lod }); ctx.add(pot); const ud = pot.userData, u = ud.char;
      const sp = fireSpec({ kind: 'metal', fuel: 'thermite', mass: 1 }), mg = fireSpec({ kind: 'metal', fuel: 'magnesium', mass: 0.4, duration: 45 });
      const t0 = 4, rib = fx.addSource({ pos: V(0, ud.top.y + 0.03, 0), fuel: 'magnesium', seed: 2, Q: 900, D: 0.02, start: 1.5, end: t0 + 0.5, T: 3200, mult: { smoke: 1, sparks: 3 } });
      const th = fx.addSource({ pos: V(0, ud.top.y, 0), seed: 3, volume: true, ...sourceOptions(sp), start: t0, end: t0 + sp.duration, label: 'termit' });
      const pud = P3.meltPuddle({ lod: ctx.lod, R: 0.25, seed: 9 }); pud.position.set(0.02, 0.004, 0.02); ctx.add(pud); pud.userData.mat.color.setRGB(0.25, 0.22, 0.2); pud.userData.mat.metalness = 0.8; pud.userData.mat.roughness = 0.5;
      const pile = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.4, metalness: 0.9 })); pile.position.set(0.9, 0.03, 0.1); ctx.add(pile);
      const ms = fx.addSource({ pos: V(0.9, 0.04, 0.1), seed: 6, volume: true, ...sourceOptions(mg), start: 14, end: 14 + mg.duration, label: 'hořčík' });
      const bucket = fx.addSpray({ agent: 'bucket', from: V(1.9, 1.0, 0.9), to: V(0.9, 0.05, 0.1), radius: 0.4, on: false, rate: 6, seed: 8 });
      let Tp = 293, hole = 0, iron = 0, said = false;
      return {
        update(dt, t) {
          const on = t > t0 && t < t0 + sp.duration, k = on ? 1 : 0, q = ctx.tier.id;
          if (on && fx.layers.sparks) { // sprška jisker železa a strusky z květináče + odkapávající tavenina
            let n = Math.round(dt * (q === 0 ? 150 : q >= 4 ? 1500 : 600) * Math.max(0.3, fx.budgetScale.spark));
            for (let i = 0; i < n; i++) { const a = r() * 6.28, e = 0.5 + 1.0 * r(), v = 1.5 + 4.5 * r(); fx.sp.spawn({ x: 0, y: ud.top.y, z: 0, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * Math.cos(e) * v, life: 0.5 + 1.2 * r(), T: 2500 + 300 * r(), tauC: 1.4, size: 0.002 + 0.004 * r(), drag: 0.9, grav: 1, seed: r() }); }
            n = Math.round(dt * 120); for (let i = 0; i < n; i++) fx.sp.spawn({ x: (r() - 0.5) * 0.02, y: ud.drip.y, z: (r() - 0.5) * 0.02, vx: (r() - 0.5) * 0.3, vy: -1, vz: (r() - 0.5) * 0.3, life: 0.5, T: 2300, tauC: 3, size: 0.006, drag: 0.1, grav: 1, seed: r() });
            fx.lights.add(0, ud.top.y + 0.1, 0, 2.5e6, 2700, 0.15);
          }
          // deska: tekuté železo ~1 800 °C dopadá na 8 mm oceli → propálí ji za pár sekund
          Tp += (k * (2100 - Tp) * 0.5 - (Tp - 293) * 0.035) * dt; if (Tp > 1700 && hole < 1) hole = Math.min(1, hole + dt / 3);
          if (hole >= 1 && on) iron = Math.min(1, iron + dt / (sp.duration * 0.6));
          u.uTnow.value = Tp; u.uTmax.value = Math.max(u.uTmax.value, Tp);
          pud.scale.setScalar(Math.max(0.001, 0.25 * Math.sqrt(iron))); const gl = Math.max(0, Math.min(1, (Tp - 700) / 900)) * (iron > 0 ? 1 : 0); pud.userData.mat.emissive.setRGB(1.2 * gl, 0.4 * gl, 0.08 * gl);
          bucket.on = t > 30 && t < 31.2;
          if (!said && t > 30.3) { said = true; ctx.message('Voda na hořící hořčík: rozklad na vodík, požár se rozhořel.'); }
          if (t > 14 && t < 14 + mg.duration) fx.lights.add(0.9, 0.2, 0.1, 1.5e6 * (ms.suppK ?? 1), 3200, 0.1);
        },
        info: () => [...sp.rows, ...fireRows(th, 'termit').slice(1, 3), ['Reakce', 'Fe₂O₃ + 2 Al → 2 Fe + Al₂O₃, 3,98 MJ/kg', '★4'], ['Zapálení', 'hořčíková páska (~3 100 °C); zápalka nestačí, termit chytá až nad ~1 200 °C', '★4'],
          ['Ocelová deska 8 mm', degC(Tp) + (hole >= 1 ? ' – PROPÁLENA' : hole > 0 ? ' – taví se' : ''), 'ocel taje při ~1 500 °C'], ['Hořčík', ms.ph ? fmtW(ms.ph.Q) : '—', 'ΔHc 24,7 MJ/kg, bílý MgO'],
          ['Voda na hořčík', bucket.note || 've 30. s', 'Mg + H₂O → MgO + H₂ ★5'], ['Hašení kovů', 'jen suchý písek nebo speciální prášek (třída D)', '']],
      };
    },
  },
  {
    id: 'whirl', group: 'Ohně', name: 'Ohnivý vír', ground: 'dryGrass', time: 'soumrak', duration: 120, wind: 1,
    desc: 'Když se k ohni přidá rotace vzduchu (vítr za překážkou, střih větru u lesního požáru), plamen se stáhne do úzkého sloupu: rotace brzdí mísení se vzduchem po stranách, plamen se prodlouží 3–10× a palivo odhořívá 2–7× rychleji (Emmons & Ying 1967). Louže 1,5 m: bez víru plamen 4 m, s vírem přes 10 m. Přepni vír a porovnej.',
    tiers: ['T0–T1: jeden úzký plošný plamen, 20 jisker/s ve šroubovici', 'T2–T3: tři obíhající objemová jádra, 120 jisker/s, kouř', 'T4–T5: + objemový kouř stočený do šroubovice'],
    cams: [{ name: 'celek', pos: [7, 3, 15], target: [0, 5.5, 0] }, { name: 'hráč', pos: [5, 1.7, 6], target: [0, 4, 0] }, { name: 'z dálky', pos: [25, 6, 40], target: [0, 8, 0] }],
    controls: [{ id: 'whOn', label: 'Rotace vzduchu (vír)', type: 'check', value: true }, { id: 'whK', label: 'Síla víru (násobek odhořívání)', type: 'range', min: 1.5, max: 7, value: 3, step: 0.1 }],
    build(ctx) {
      const fx = ctx.fx, r = mulberry32(5), D = 1.5, sp = fireSpec({ kind: 'pool', fuel: 'diesel', D, depth: 0.05 });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(D / 2, 48), new THREE.MeshStandardMaterial({ color: 0x0b0a08, roughness: 0.05 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.006; ctx.add(disc);
      const fig = P3.figure({ lod: Math.min(ctx.lod, 2) }); fig.position.set(3.2, 0, 1.5); ctx.add(fig);
      const nC = ctx.tier.id === 0 ? 1 : 3, K = () => (ctx.controls.whOn ? ctx.controls.whK ?? 3 : 1), L0 = 0.235 * Math.pow(sp.Qpeak / 1000, 0.4) - 1.02 * D, Lw = () => L0 * (ctx.controls.whOn ? 1 + 0.6 * (K() - 1) : 1); // výška ∝ síle víru ★2
      const cores = []; let sm = 0;
      for (let i = 0; i < nC; i++) cores.push(fx.addSource({ pos: V(0, 0.01, 0), seed: 9 + i * 4, volume: true, ...sourceOptions(sp), D: D / Math.sqrt(nC) * 0.9, end: Infinity, Q: (t) => (sp.Qpeak * K() / nC) * Math.min(1, t / 5), L: (q) => Math.max(0.3, Lw() * Math.min(1, (q * nC) / (sp.Qpeak * K()) + 0.05)), shapeK: 1.9, taper: 0.45, mult: { smoke: 1.2 / nC } }));
      return {
        update(dt, t) {
          const on = !!ctx.controls.whOn, w = on ? 2.2 + 0.5 * K() : 0, rr = on ? 0.12 * D : 0.22 * D;
          cores.forEach((c, i) => { const a = t * w + (i / nC) * 6.2832; c.pos.set(Math.cos(a) * rr * (nC > 1 ? 1 : 0), 0.01, Math.sin(a) * rr * (nC > 1 ? 1 : 0)); });
          const L = cores[0].ph?.L || 4;
          if (on && fx.layers.sparks) { // jiskry a oharky nasáté do šroubovice
            sm += dt * (ctx.tier.id === 0 ? 20 : 120) * Math.max(0.3, fx.budgetScale.spark);
            while (sm >= 1) { sm -= 1; const a = r() * 6.28, h = r() * L, rad = 0.25 * D * (1 + h / L), vt = w * rad * 2.2; fx.sp.spawn({ x: Math.cos(a) * rad, y: 0.2 + h, z: Math.sin(a) * rad, vx: -Math.sin(a) * vt, vy: 5 + 6 * r(), vz: Math.cos(a) * vt, life: 0.7 + 1.2 * r(), T: 1500, tauC: 1, size: 0.004, drag: 0.6, grav: 0.2, ember: true, seed: r() }); }
          }
          this.Q = cores.reduce((s, c) => s + (c.ph ? c.ph.Q : 0), 0); this.L = L;
        },
        info() {
          return [...sp.rows, ['Vír', ctx.controls.whOn ? 'ANO, odhořívání ×' + K().toFixed(1) : 'ne (volná louže)', 'Emmons & Ying ★3'], ['Výkon', fmtW(this.Q || 0), ''], ['Výška plamene', (this.L || 0).toFixed(1) + ' m', ctx.controls.whOn ? 'prodloužení rotací ★2' : 'Heskestad ★5'],
            ['Bez víru by bylo', L0.toFixed(1) + ' m při ' + fmtW(sp.Qpeak), 'Heskestad ★5'], ['Doba hoření', mmss(sp.duration / K()), 'palivo ubývá rychleji'],
            ['Sálání u postavy (3,5 m)', kW(fx.heatFlux([3.2, 1.2, 1.5]).total) + ' – ' + fluxEffect(fx.heatFlux([3.2, 1.2, 1.5]).total), ''], ['Kde vzniká', 'lesní požáry (střih větru), za rohem budovy, hořící sklad v údolí', '']];
        },
      };
    },
  },
];
