// Scénáře iterace 6 – rozšíření a zobecnění palety (Ondřej 2026-11-27 večer):
//   zapalovač (jiskra → plamen), hořící sud s naftou, prostřelený sud s hořícím vytékajícím palivem,
//   acetylenová láhev v požáru (jak by to opravdu dopadlo), řetěz vznícení (přestup tepla mezi předměty), obecný výbuch.
// Všechny stojí na jednom popisu ohně a výbuchu (physics/spec.js) a na hořlavých předmětech (fx/burnable.js).
import * as THREE from 'three';
import * as P from '../assets/props.js';
import * as P2 from '../assets/props2.js';
import * as B from '../assets/big.js';
import { makeMaterial } from '../assets/textures.js';
import { FUELS } from '../physics/fuels.js';
import { MATERIALS } from '../physics/materials.js';
import { fireSpec, sourceOptions, explosionSpec, torricelli, drainHead } from '../physics/spec.js';
import { timeToIgnition, fluxEffect, sheetLook } from '../physics/heat.js';
import { blastSummary } from '../physics/blast.js';
import { mulberry32 } from '../engine/rng.js';
import { PRE } from '../fx/shared.js';
import { fireRows, fmtW } from './index.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const kW = (q) => (q / 1000).toFixed(q < 10000 ? 1 : 0) + ' kW/m²';
const degC = (T) => (T - 273.15).toFixed(0) + ' °C';
const blastRows = (W) => [['TNT ekvivalent', W >= 1 ? W.toFixed(1) + ' kg' : (W * 1000).toFixed(0) + ' g', 'Kinney–Graham ★4'],
  ...blastSummary(W, [3, 10, 30, 100]).map((b) => [`  přetlak v ${b.R} m`, b.kPa < 1 ? (b.kPa * 1000).toFixed(0) + ' Pa' : b.kPa.toFixed(1) + ' kPa', b.effect])];
function tableTop(ctx, w = 0.9, d = 0.6) {
  const m = makeMaterial('woodPlank'); const g = new THREE.BoxGeometry(w, 0.04, d); g.translate(0, -0.02, 0);
  const t = new THREE.Mesh(g, m); t.receiveShadow = true; ctx.add(t);
}
const sheetState = (b) => `${degC(b.Ts)} (max ${degC(b.Tmax)}) – ${b.state === 'cold' ? 'chladný' : b.state}`;

export const ITER6_FIRST = [
  // ---------------------------------------------------------------------------------------------- zapalovač
  {
    id: 'lighter', group: 'Zážeh', name: 'Zapalovač: jiskra → plamen', ground: 'dirt', time: 'noc', duration: 9, loop: true,
    desc: 'Křesací kolečko strhne z „kamínku“ (ferrocer) třísky, které na vzduchu samy vzplanou (~3 000 °C). První škrtnutí nechytne, druhé zapálí butan: laminární plamínek 25 mm, ~57 W, modrá pata a žlutá špička.',
    cams: [{ name: 'detail', pos: [0.075, 0.105, 0.13], target: [0, 0.075, 0] }, { name: 'stůl', pos: [0.35, 0.28, 0.5], target: [0, 0.05, 0] }],
    build(ctx) {
      tableTop(ctx);
      const L = P2.lighter({ lod: ctx.lod }); ctx.add(L);
      const at = L.userData.flameAt, sk = L.userData.sparkAt, r = mulberry32(21);
      const sp = fireSpec({ kind: 'jet', fuel: 'butane', mdot: 1.25e-6 });
      const strikes = [0.7, 1.7], tOn = 1.74, tOff = 7.2;
      const lit = (t) => (t < tOn ? 0 : t < tOff ? Math.min(1, (t - tOn) / 0.12) : Math.max(0, 1 - (t - tOff) / 0.08));
      const src = ctx.fx.addSource({ pos: V(at.x, at.y, at.z), seed: 6, volume: true, ...sourceOptions(sp), end: Infinity, Q: (t) => sp.Qpeak * lit(t) });
      let prev = 0;
      return {
        update(dt, t) {
          const fx = ctx.fx;
          for (const ts of strikes) {
            const k = (t - ts) / 0.07;
            if (k >= 0 && k < 1) {
              L.userData.wheel.rotation.z -= dt * 55;
              // ferrocerové třísky: 60–120 µm, hoří celou dobu letu (drží teplotu), na konci se část rozprskne
              let n = Math.round(dt * 900 * fx.budgetScale.spark); if (prev < ts) n += 6;
              for (let i = 0; i < n; i++) {
                const v = 0.9 + 1.9 * r(), a = (r() - 0.5) * 1.5, e = 0.5 + 0.9 * r();
                fx.sp.spawn({ x: sk.x, y: sk.y, z: sk.z, vx: -Math.cos(e) * Math.cos(a) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * v * 0.8, life: 0.04 + 0.14 * r() * r(), T: 2500 + 400 * r(), tauC: 0.9, size: 0.0001 + 0.00016 * r(), drag: 22 + 22 * r(), grav: 1, seed: r() });
              }
              if (r() < dt * 60) { // rozprsk na konci dráhy
                const d = 0.02 + 0.03 * r(), px = sk.x - d * 0.7, py = sk.y + d * 0.8, pz = sk.z + (r() - 0.5) * 0.03;
                for (let i = 0; i < 5; i++) fx.sp.spawn({ x: px, y: py, z: pz, vx: (r() - 0.5) * 1.6, vy: (r() - 0.3) * 1.6, vz: (r() - 0.5) * 1.6, life: 0.04 + 0.06 * r(), T: 2700, tauC: 0.5, size: 0.00008, drag: 25, grav: 1, seed: r() });
              }
              fx.lights.add(sk.x, sk.y + 0.005, sk.z, 0.9 * (0.6 + 0.8 * r()), 2800, 0.01);
            }
          }
          prev = t;
        },
        info: () => [...sp.rows, ...fireRows(src).slice(1, 6), ['Jiskra', 'ferrocer (Ce + Fe), vznítí se při 150–180 °C, hoří ~3 000 °C', '★4'],
          ['Proč první škrtnutí nechytne', 'plyn ještě nedosáhl dolní meze výbušnosti 1,8 % u jisker', '★3'], ['Sálání ve 3 cm od plamene', kW(ctx.fx.heatFlux([at.x + 0.03, at.y + 0.012, at.z]).total), 'bodový zdroj ★3']],
      };
    },
  },
];

export const ITER6_LIQUIDS = [
  // ---------------------------------------------------------------------------------------------- hořící sud s naftou
  {
    id: 'dieselBarrel', group: 'Kapaliny', name: 'Hořící sud s naftou', ground: 'concrete', time: 'den', timeScale: 6, duration: 900,
    desc: 'Sud 200 l bez víka, ~170 l nafty. Louže o průměru 0,56 m: ~350 kW, plamen ~1,9 m, pulzace 2 Hz, hustý černý kouř. Hoří skoro 6 hodin (hladina klesá 2,2 mm/min). Lak nad hladinou shoří, pod hladinou ho kapalina chladí.',
    cams: [{ name: 'celek', pos: [3.6, 1.9, 4.4], target: [0, 1.5, 0] }, { name: 'hráč', pos: [2.4, 1.7, 2.2], target: [0, 1.1, 0] }, { name: 'sloup kouře', pos: [10, 2.5, 13], target: [0, 5, 0] }],
    build(ctx) {
      const b = P2.barrelOpen({ lod: ctx.lod, paint: 'metalBlue', level: 0.8 }); ctx.add(b);
      const ud = b.userData, sp = fireSpec({ kind: 'pool', fuel: 'diesel', D: 2 * (ud.R - 0.006), volumeL: 170 });
      // nafta pod bodem vzplanutí: plamen se od zapáleného hadru šíří po hladině pomalu a výkon roste s ohřevem vrstvy ★3
      const grow = (t) => Math.min(1, (t / 12) ** 2) * (1 - 0.6 * Math.exp(-t / 45));
      // plamen ze sudu: sloup v šířce sudu, zaškrcení ~1 D nad okrajem a kulovité „puffy“ (pulzace 2 Hz) – fotky hořících sudů a louží
      const src = ctx.fx.addSource({ pos: V(0, ud.liquidY + 0.01, 0), seed: 31, volume: true, ...sourceOptions(sp), end: Infinity, Q: (t) => sp.Qpeak * grow(t), start: 1, shapeK: 1.6, taper: 0.7, neck: 0.25, puffAmp: 0.9, volTongues: 0, turbAmp: 0.8, volSoot: 0.6, mult: { smoke: 2.6 } }); // smoke ×2,6: hladina 18 cm pod okrajem → plamen uvnitř sudu je podvětraný a sází víc (★2); teplota svítivé zóny nad okrajem zůstává
      const shell = ctx.fx.addBurnable({ pos: V(0, 0, 0), material: 'steelPainted', char: ud.char, probe: [ud.R - 0.02, ud.H - 0.03, 0], label: 'plášť u okraje' });
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: 0.9, rate: 1 / 500, seed: 9 });
      const rate = sp.mdot / sp.Qpeak; let burnt = 0;
      return {
        update(dt) { if (src.ph) { burnt += src.ph.Q * rate * dt; ud.liquid.position.y = -burnt / (FUELS.diesel.rho * Math.PI * (ud.R - 0.006) ** 2); } },
        info: () => [...sp.rows, ...fireRows(src).slice(1), ['Shořelo', burnt.toFixed(2) + ' kg', 'ṁ = Q/ΔHc'], ['Plášť u okraje', sheetState(shell), 'tenký plech ★4'],
          ['Tok na plášť', kW(shell.q), 'kontakt s plamenem ★3'], ['Sálání ve 2 m (výška pasu)', kW(ctx.fx.heatFlux([2, 1, 0]).total) + ' – ' + fluxEffect(ctx.fx.heatFlux([2, 1, 0]).total), 'Modak ★4']],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- prostřelený sud
  {
    id: 'leak', group: 'Kapaliny', name: 'Prostřelený sud: hořící pramínek', ground: 'concrete', time: 'den', timeScale: 4, duration: 420,
    desc: 'Otvor 9 mm půl metru pod hladinou: vytéká 0,12 l/s (Torricelli). Vše, co vyteče, shoří → ~4,6 MW na pruhu ~8 × 0,6 m, plameny ~2,4 m, černý kouř. Benzín vzplane po celé délce za pár sekund, nafta se rozhořívá pomalu od zdroje zapálení.',
    cams: [{ name: 'celek', pos: [4.5, 3.2, 11], target: [4.2, 1.6, 0] }, { name: 'hráč', pos: [-2.2, 1.7, 4.5], target: [3, 1.2, 0] }, { name: 'od sudu', pos: [-1.6, 1.3, 1.2], target: [4, 0.9, 0] }],
    controls: [{ id: 'leakFuel', label: 'Palivo', type: 'select', value: 'diesel', options: ['diesel', 'gasoline'], restart: true }],
    build(ctx) {
      const fuel = ctx.controls.leakFuel || 'diesel', mat = MATERIALS[fuel];
      const b = P.barrel({ lod: ctx.lod, paint: 'metalRed' }); ctx.add(b);
      const R = b.userData.R, hole = 0.3, head = 0.5;
      const sp = fireSpec({ kind: 'leak', fuel, holeMM: 9, head });
      const v0 = Math.sqrt(2 * 9.81 * head) * 0.97;
      const jet = P2.fuelJet({ lod: ctx.lod, v: v0, h: hole }); jet.position.set(R, 0, 0); ctx.add(jet);
      const x0 = R + jet.userData.reach - 0.15, len = sp.stream.len, w = sp.stream.w;
      const strip = P2.spillStrip({ lod: ctx.lod, len, w, seed: 5 }); strip.position.x = x0; ctx.add(strip);
      const holeM = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 12), new THREE.MeshBasicMaterial({ color: 0x000000 })); holeM.position.set(R + 0.001, hole, 0); holeM.rotation.y = Math.PI / 2; ctx.add(holeM);
      // zapálení na vzdáleném konci pruhu; čelo plamene běží zpět k sudu rychlostí podle paliva (benzín 1,7 m/s, studená nafta 0,05 m/s)
      const N = ctx.tier.id === 0 ? 4 : 5, seg = len / N, tIgn = 3, spread = mat.spread * (fuel === 'diesel' ? 2.5 : 1); // nafta na tenké vrstvě se ohřeje rychleji než v hluboké louži ★2
      const srcs = [];
      for (let i = 0; i < N; i++) {
        const xc = x0 + (N - 0.5 - i) * seg, start = tIgn + (i * seg) / spread;
        const kq = 0.75 + 0.5 * ((i * 0.618) % 1); // nestejně vydatné úseky (nerovnosti podkladu) ★2
        srcs.push(ctx.fx.addSource({ pos: V(xc, 0.01, (i % 2 ? 0.06 : -0.06)), fuel, seed: 40 + i * 7, volume: true, footprint: { type: 'rect', w: seg * 1.7, d: w * 1.15 }, start, shapeK: 1.45, taper: 0.6, puffAmp: 0.7, volSoot: 0.3, mult: { smoke: 1.5, haze: 0.35 },
          Q: (t) => (sp.Q(ctx.t) / N) * kq * Math.min(1, t / (fuel === 'diesel' ? 14 : 2)) }));
        ctx.fx.addScorch({ pos: V(xc, 0, 0), radius: seg * 0.75, rate: 1 / 200, seed: 12 + i });
      }
      // hořící pramínek a loužička u paty sudu, až čelo doběhne
      const tBack = tIgn + len / spread;
      const foot = ctx.fx.addSource({ pos: V(R + 0.35, 0.01, 0), fuel, seed: 55, volume: true, D: 0.7, start: tBack, Q: (t) => 3.5e5 * Math.min(1, t / 6) });
      const shell = ctx.fx.addBurnable({ pos: V(0, 0, 0), material: 'steelPainted', char: b.userData.char, probe: [R + 0.02, 0.35, 0], label: 'plášť sudu' });
      b.userData.char.uCharBase.value = 0; b.userData.char.uCharH.value = 0.88; b.userData.char.uHeatFall.value = 0.5;
      return {
        update(dt, t) {
          const h = drainHead(t, head, 0.009, 0.258); jet.scale.x = Math.sqrt(h / head) || 0.01; jet.visible = h > 0.002;
          this.tot = [...srcs, foot].reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0);
        },
        info() {
          return [...sp.rows, ['Palivo', FUELS[fuel].name, mat.flash ? `bod vzplanutí ${degC(mat.flash)}` : ''], ['Celkový výkon', fmtW(this.tot || 0), 'součet úseků'],
            ['Šíření plamene po pruhu', (spread * 100).toFixed(0) + ' cm/s → k sudu za ' + (len / spread).toFixed(0) + ' s', '★2–3'], ['Výška plamenů pruhu', sp.stream.L.toFixed(1) + ' m', 'Yuan & Cox ★4'],
            ...fireRows(srcs[N - 1], 'úsek u sudu').slice(4, 8), ['Plášť sudu', sheetState(shell), 'tenký plech ★4'], ['Tok na plášť', kW(shell.q), '★3'],
            ['Co hrozí', shell.Tmax > 700 ? 'zavřený sud v plameni: roztržení a ohnivá koule (viz Výbuch sudu)' : 'dokud plamen nedoběhne k sudu, jen sálání', 'D-008']];
        },
      };
    },
  },
];

export const ITER6_BLAST = [
  // ---------------------------------------------------------------------------------------------- acetylenová láhev
  {
    id: 'acetyleneCyl', group: 'Exploze', name: 'Výbuch acetylenové lahve (v požáru)', ground: 'dirt', time: 'soumrak', timeScale: 20, duration: 560,
    desc: 'Tlaková láhev 50 l (7 kg C₂H₂ v acetonu) v hořící hranici palet. Ocel při ~550 °C ztrácí polovinu pevnosti, acetylen se uvnitř rozkládá → plášť se roztrhne na kusy, plyn vzplane v ohnivou kouli ~13 m (1 s), oslnivě žlutou a plnou sazí. Tlaková vlna ≈ 1–2 kg TNT, úlomky letí ~80 m/s na stovky metrů (zóna hasičů 200 m).',
    cams: [{ name: 'celek', pos: [15, 4, 19], target: [0, 4.5, 0] }, { name: 'hráč (12 m)', pos: [9, 1.7, 8], target: [0, 2.5, 0] }, { name: 'z dálky (70 m)', pos: [55, 6, 45], target: [0, 7, 0] }],
    build(ctx) {
      const pal = []; const rr = mulberry32(5);
      for (let i = 0; i < 4; i++) { const p = P2.pallet({ lod: Math.min(ctx.lod, 3) }); p.position.set((rr() - 0.5) * 0.08, i * 0.146, (rr() - 0.5) * 0.08); p.rotation.y = (rr() - 0.5) * 0.25 + (i % 2) * Math.PI / 2; ctx.add(p); pal.push(p); }
      { const p = P2.pallet({ lod: Math.min(ctx.lod, 3) }); p.position.set(-0.95, 0.5, 0.1); p.rotation.z = -1.12; ctx.add(p); pal.push(p); }
      { const p = P2.pallet({ lod: Math.min(ctx.lod, 3) }); p.position.set(-0.1, 0.38, -0.78); p.rotation.x = -1.05; ctx.add(p); pal.push(p); }
      const cyl = P2.gasCylinder({ lod: ctx.lod }); cyl.rotation.z = Math.PI / 2; cyl.position.set(0.58, 0.69, 0); ctx.add(cyl);
      const pile = fireSpec({ kind: 'pile', material: 'softwood', mass: 132, stick: 0.03, D: 1.5, tGrow: 90 });
      const src = ctx.fx.addSource({ pos: V(0, 0.1, 0), seed: 61, volume: true, ...sourceOptions(pile), end: Infinity });
      // plášť 5 mm + část tepla odvádí porézní hmota a aceton uvnitř → dvojnásobná plošná kapacita (★2; pokusy: minuty až čtvrt hodiny)
      const shell = ctx.fx.addBurnable({ pos: V(0, 0, 0), material: { ...MATERIALS.steelThick, rcd: MATERIALS.steelThick.rcd * 2 }, char: cyl.userData.char, probe: [0, 0.75, 0], label: 'plášť lahve' });
      cyl.userData.char.uHeatFall.value = 0.1;
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: 2.2, rate: 1 / 300, glow: 0.3, seed: 7 });
      const es = explosionSpec({ kind: 'gasCylinder' });
      const Tburst = MATERIALS.steelThick.weak; let boom = false, tBoom = 0; const frags = [];
      return {
        update(dt, t) {
          for (const p of pal) { const u = p.userData.char; u.uChar.value = Math.min(1, t / 240); u.uGlow.value = Math.min(1, t / 40); }
          if (!boom && shell.Ts >= Tburst) {
            boom = true; tBoom = t; cyl.visible = false; ctx.setTimeScale(1); // od roztržení běží děj v reálném čase
            const c = V(0, 0.7, 0);
            ctx.fx.addExplosion({ pos: c, seed: 17, ...es.ex });
            for (const f of es.fires) ctx.fx.addSource({ pos: V(0.4, 0.01, 0.3), seed: 71, volume: true, ...f });
            src.brandBurst(70, 3.2); src.o.Q = ((q) => (tt) => 0.35 * q(tt))(src.o.Q); // hranice rozmetaná
            // rozmetané hořící kusy palet
            for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3, R = 2.5 + 2.2 * rr(); ctx.fx.addSource({ pos: V(Math.cos(a) * R, 0.02, Math.sin(a) * R), fuel: 'woodDry', Q: 6e4 + 8e4 * rr(), D: 0.5, start: 0.8, end: 200 + 200 * rr(), volume: i < 3, seed: 80 + i }); }
            pal.forEach((p, i) => { p.position.x += (rr() - 0.5) * 1.6; p.position.z += (rr() - 0.5) * 1.6; p.position.y = 0.02 + (i % 2) * 0.1; p.rotation.x += (rr() - 0.5) * 0.7; p.rotation.z += (rr() - 0.5) * 0.7; });
            // úlomky pláště: dno a hrdlo letí podél osy lahve na opačné strany, pláty do stran (balistika s odporem)
            const fr = P2.cylinderFragments({ lod: Math.min(ctx.lod, 3), seed: 3 });
            const dirs = [V(-1, 0.55, 0.1), V(1, 0.75, -0.15), V(0.1, 0.9, 1), V(-0.2, 0.5, -1), V(0.3, 1.2, 0.4)];
            fr.parts.forEach((g, i) => { g.position.copy(c); ctx.add(g); frags.push({ g, v: dirs[i].normalize().multiplyScalar(es.vFrag * (i < 2 ? 0.75 : 0.45) * (0.8 + 0.4 * rr())), w: V(rr() * 9, rr() * 9, rr() * 9), rest: false }); });
            this.fragU = fr.char;
            ctx.message('Láhev se roztrhla: ohnivá koule ' + es.fb.D.toFixed(0) + ' m, úlomky ' + es.vFrag.toFixed(0) + ' m/s.');
          }
          if (boom) {
            for (const f of frags) {
              if (f.rest) continue;
              f.v.y -= 9.81 * dt; f.v.multiplyScalar(Math.exp(-0.05 * dt)); f.g.position.addScaledVector(f.v, dt);
              f.g.rotation.x += f.w.x * dt; f.g.rotation.y += f.w.y * dt; f.g.rotation.z += f.w.z * dt;
              if (f.g.position.y < 0.08) { f.g.position.y = 0.08; if (Math.abs(f.v.y) < 2.5) { f.rest = true; } else { f.v.y *= -0.3; f.v.x *= 0.5; f.v.z *= 0.5; f.w.multiplyScalar(0.4); } }
            }
            if (this.fragU) this.fragU.uTnow.value = 293 + 600 * Math.exp(-(t - tBoom) / 90);
          }
        },
        info: () => [['Stav', boom ? `roztržena v čase ${(tBoom / 60).toFixed(1)} min` : 'ohřívá se v plameni (čas zrychlen 20×)', ''], ['Plášť lahve', sheetState(shell), `mez ${degC(Tburst)} ★4`], ['Tok na plášť', kW(shell.q), 'kontakt ★3'],
          ...es.rows, ...blastRows(es.W).slice(1), ...fireRows(src, 'hranice').slice(1, 3), ['Dolet úlomku bez odporu', ((es.vFrag * 0.75) ** 2 / 9.81).toFixed(0) + ' m', 'v²/g ★3'],
          ['Proč ne „detonace“', 'rozklad C₂H₂ v porézní hmotě je pomalý; ničí roztržení a oheň, ne brizance', 'Jankůj & Mynarz 2022 ★4']],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- obecný výbuch
  {
    id: 'blastLab', group: 'Laboratoř', name: 'Obecný výbuch (nálož → vše)', ground: 'dryGrass', time: 'den', duration: 26, loop: true,
    desc: 'Jeden popis výbuchu: druh a hmotnost → přetlak, ohnivá koule, kouř, trosky, kráter, od 50 g po 5 t. Mocninné zákony procházejí ručně vyladěnými body (granát 0,24 kg, 1 t TNT), mezi nimi drží fyzikální exponenty (délky ∝ W^⅓, plochy ∝ W^⅔).',
    cams: [{ name: '25 m', pos: [18, 3, 17], target: [0, 3, 0] }, { name: '80 m', pos: [62, 6, 50], target: [0, 14, 0] }, { name: '300 m', pos: [240, 20, 180], target: [0, 50, 0] }],
    controls: [
      { id: 'bKind', label: 'Druh', type: 'select', value: 'he', options: ['he', 'fireball', 'gasCylinder'], restart: true },
      { id: 'bMass', label: 'Hmotnost [kg]', type: 'range', min: 0.05, max: 5000, value: 10, log: true },
      { id: 'bCased', label: 'Kovový plášť (střepiny)', type: 'check', value: false },
    ],
    build(ctx) {
      const mk = () => explosionSpec(ctx.controls.bKind === 'he' ? { kind: 'he', explosive: 'tnt', mass: ctx.controls.bMass, cased: ctx.controls.bCased } : ctx.controls.bKind === 'fireball' ? { kind: 'fireball', mass: ctx.controls.bMass } : { kind: 'gasCylinder', gasMass: Math.min(20, Math.max(1, ctx.controls.bMass)) });
      const ref = P.barrel({ lod: Math.min(ctx.lod, 2), paint: 'metalOlive' }); ref.position.set(6, 0, -3); ctx.add(ref); // měřítko: sud 0,88 m
      let boom = false, es = mk();
      return {
        update(dt, t) {
          if (!boom && t > 1.5) { boom = true; es = mk(); ctx.fx.addExplosion({ pos: V(0, es.dy, 0), seed: 23, ...es.ex }); for (const f of es.fires) ctx.fx.addSource({ pos: V(0, 0.01, 0), seed: 24, volume: true, ...f }); }
        },
        info: () => { const e = boom ? es : mk(); return [...e.rows, ...blastRows(e.W).slice(1), ['Kouř (částic / život)', e.ex.smoke.n + ' / ' + e.ex.smoke.life.toFixed(0) + ' s', 'mocninný zákon'], ['Trosky (počet / rychlost)', e.ex.debris.n + ' / ' + e.ex.debris.speed.toFixed(0) + ' m/s', ''], ['Hřib / kondenzační dóm', (e.ex.mushroom ? 'ano' : 'ne') + ' / ' + (e.ex.wilson ? 'ano' : 'ne'), 'od 100 / 300 kg']]; },
      };
    },
  },
];

export const ITER6_SPREAD = [
  // ---------------------------------------------------------------------------------------------- řetěz vznícení
  {
    id: 'chain', group: 'Šíření', name: 'Přestup tepla: řetěz vznícení', ground: 'dirt', time: 'den', timeScale: 10, duration: 1500,
    desc: 'Hoří dvě palety (~0,9 MW). Okolní věci dostávají tepelný tok podle vzdálenosti a každá sčítá svou dávku do vznícení podle materiálu: sláma chytne od ~8 kW/m² za sekundy, dřevo až nad 12 kW/m² za minuty, pneumatika až nad 17 kW/m². Co chytne, přidá vlastní teplo a zapálí další. Paleta ve 4,5 m zůstane pod prahem; plech sudu nehoří, ale ztratí lak a zčerná.',
    cams: [{ name: 'celek', pos: [5.5, 3.6, 6.5], target: [0, 0.9, 0] }, { name: 'hráč', pos: [3.6, 1.7, 5.2], target: [0, 0.8, 0] }, { name: 'shora', pos: [0.5, 9, 2.5], target: [0, 0.3, 0] }],
    build(ctx) {
      const fx = ctx.fx, items = [];
      const put = (obj, x, z, ry = 0) => { obj.position.set(x, 0, z); obj.rotation.y = ry; ctx.add(obj); return obj; };
      const add = (label, obj, o) => { const b = fx.addBurnable({ label, char: obj.userData.char, ...o, onBurnout: () => { obj.userData.done = true; } }); b.obj = obj; items.push(b); return b; };
      // ohnisko: dvě palety na sobě, zapálené
      const p1 = put(P2.pallet({ lod: ctx.lod }), 0, 0), p2 = P2.pallet({ lod: ctx.lod }); p2.position.set(0.03, 0.146, 0.02); p2.rotation.y = 0.12; ctx.add(p2);
      const core = add('2 palety (ohnisko)', p1, { pos: V(0, 0, 0), material: 'softwood', mass: 44, area: 7, size: 1.2, ignited: true, seed: 3, source: { footprint: { type: 'rect', w: 1.2, d: 0.8 } } });
      const u2 = p2.userData.char; // druhá paleta má vlastní uniformy, průběh ohoření přebírá od první
      // okolí
      const bale = put(B.strawStack({ lod: ctx.lod, nx: 2, ny: 1, nz: 1, seed: 8 }), 2.7, 0.2, 0.25);
      add('balík slámy (1,7 m)', bale, { pos: V(2.7, 0, 0.2), material: 'straw', mass: 250, area: 9, size: 1.6, height: 0.5, probe: [-1.0, 0.5, 0], seed: 4, fireY: 0.55, source: { footprint: { type: 'rect', w: 2.4, d: 1.2, rot: 0.25 } } });
      const cr = put(P2.crate({ lod: ctx.lod, s: 0.6 }), -0.25, -1.5, 0.3);
      add('bedna (1,2 m)', cr, { pos: V(-0.25, 0, -1.5), material: 'softwood', mass: 9, area: 2.2, size: 0.6, probe: [0.05, 0.4, 0.32], seed: 5, fireY: 0.25 });
      const ti = put(P.tire({ lod: ctx.lod, rim: false }), -0.3, 1.4); ti.rotation.x = 0;
      add('pneumatika (1,1 m)', ti, { pos: V(-0.3, 0, 1.4), material: 'rubber', mass: 9, area: 1.2, size: 0.65, probe: [0.05, 0.3, -0.33], seed: 6, D: 0.65, fireY: 0.15 });
      const far = put(P2.pallet({ lod: ctx.lod }), -4.5, 0.6, 1.3);
      add('paleta daleko (4,5 m)', far, { pos: V(-4.5, 0, 0.6), material: 'softwood', mass: 22, area: 3.5, size: 1.2, probe: [0.5, 0.2, 0], seed: 7 });
      const drum = put(P.barrel({ lod: ctx.lod, paint: 'metalBlue' }), -1.25, -0.2);
      drum.userData.char.uHeatFall.value = 0.25;
      const sh = fx.addBurnable({ label: 'sud – plech (0,9 m)', pos: V(-1.25, 0, -0.2), material: 'steelPainted', char: drum.userData.char, probe: [0.3, 0.5, 0.03] }); sh.obj = drum; items.push(sh);
      fx.addScorch({ pos: V(0, 0, 0), radius: 1.6, rate: 1 / 400, glow: 0.3, seed: 3 });
      return {
        update() {
          u2.uChar.value = p1.userData.char.uChar.value; u2.uGlow.value = p1.userData.char.uGlow.value;
          // sesedání vyhořelých kusů (dřevo a sláma ztrácí objem)
          for (const b of items) if (b.state === 'burning' || b.state === 'burnt') { const k = b.mat.look === 'fluff' ? 0.55 : b.mat.look === 'melt' ? 0.5 : 0.65; b.obj.scale.y = 1 - k * b.burned ** 1.5; if (b === core) p2.scale.y = b.obj.scale.y, p2.position.y = 0.146 * b.obj.scale.y; }
          this.tot = fx.sources.reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0);
        },
        info() {
          const rows = [['Celkový výkon', fmtW(this.tot || 0), 'součet zdrojů']];
          for (const b of items) {
            const st = b.inert ? sheetState(b) : b.state === 'burning' ? `HOŘÍ od ${(b.tIgn / 60).toFixed(1)} min, ${fmtW(b.src?.ph?.Q || 0)}` : b.state === 'burnt' ? 'vyhořelo' : `dávka ${(b.heat * 100).toFixed(0)} %`;
            const tig = b.inert || b.state === 'burning' || b.state === 'burnt' ? '' : (() => { const t = timeToIgnition(b.q, b.mat); return Number.isFinite(t) ? `při tomto toku za ${t < 90 ? t.toFixed(0) + ' s' : (t / 60).toFixed(1) + ' min'}` : `pod prahem ${(b.mat.qCrit / 1000).toFixed(0)} kW/m²`; })();
            rows.push([b.label, `${kW(b.q)} · ${st}`, tig]);
          }
          rows.push(['Sálání ve 3 m (hráč)', kW(fx.heatFlux([3, 1.2, 3]).total) + ' – ' + fluxEffect(fx.heatFlux([3, 1.2, 3]).total), 'Modak ★4'], ['Model', 'dávka = ∫(q″ − q″crit)ⁿ dt, n = 2 tlusté, 1 tenké', 'Quintiere; Shields ★3–4']);
          return rows;
        },
      };
    },
  },
];
