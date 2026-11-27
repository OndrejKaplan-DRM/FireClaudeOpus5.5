// Scénáře (use casy). Každý scénář skládá assety a efekty z fyzikálního výpočtu.
// build(ctx) → { update(dt, t), info() → [[popis, hodnota, zdroj]], controls?, message? }
import * as THREE from 'three';
import * as P from '../assets/props.js';
import * as B from '../assets/big.js';
import { InstancedFlora } from '../assets/vegetation.js';
import { makeMaterial } from '../assets/textures.js';
import * as C from '../physics/combustion.js';
import { FUELS } from '../physics/fuels.js';
import { bleveFireball, heFireball, blastSummary, gasTNT, gurneySphere } from '../physics/blast.js';
import { arrivalTimes, headROS, byram, lengthToBreadth, crownInitiation } from '../physics/spread.js';
import { mulberry32 } from '../engine/rng.js';
import { fbm2 } from '../assets/textures.js';
import { PRE } from '../fx/shared.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const fmtW = (q) => (q >= 1e6 ? (q / 1e6).toFixed(2) + ' MW' : q >= 1e3 ? (q / 1e3).toFixed(1) + ' kW' : q.toFixed(0) + ' W');
const deg = (r) => ((r * 180) / Math.PI).toFixed(0) + '°';

/** Standardní řádky fyziky pro hořící zdroj */
export function fireRows(src, label = '') {
  const ph = src.ph || src.physics(0), f = src.fuel, p = label ? label + ': ' : '';
  return [
    [p + 'Palivo', f.name, `ΔHc ${(f.dHc / 1e6).toFixed(1)} MJ/kg`],
    [p + 'Tepelný výkon Q', fmtW(ph.Q), 'model scénáře'],
    [p + 'Výška plamene L', ph.L.toFixed(ph.L < 1 ? 3 : 2) + ' m', src.o.L ? 'měřená hodnota' : 'Heskestad ★5'],
    [p + 'Náklon plamene', deg(ph.tilt.theta) + `  (u* = ${ph.tilt.us.toFixed(2)})`, 'AGA ★4'],
    [p + 'Teplota svítivé zóny', ph.T.toFixed(0) + ' K', 'pyrometrie sazí ★3'],
    [p + 'Pulzace plamene', ph.fp.toFixed(1) + ' Hz', 'Cetegen & Ahmed ★4'],
    [p + 'Optická tl. kouře τ', ph.tau.toFixed(2), 'Mulholland σs ★3'],
    [p + 'Ekvivalenční poměr Φ', ph.vent.phi.toFixed(2) + `  saze ×${ph.vent.sootMul.toFixed(2)}`, 'Tewarson ★2'],
    [p + 'Výtěžek sazí / CO', (f.ys * ph.vent.sootMul).toFixed(3) + ' / ' + Math.max(f.yCO, ph.vent.coYield).toFixed(3) + ' kg/kg', 'SFPE ★3'],
    [p + 'Svítivost', ph.I < 1e4 ? ph.I.toFixed(1) + ' cd' : (ph.I / 1e3).toFixed(0) + ' kcd', 'odhad ★2'],
  ];
}
function blastRows(W, label = 'TNT ekv.') {
  return [[label, W >= 1 ? W.toFixed(1) + ' kg' : (W * 1000).toFixed(0) + ' g', 'Kinney–Graham ★4'],
    ...blastSummary(W, [1, 3, 10, 30, 100, 300]).map((b) => [`  přetlak v ${b.R} m`, b.kPa < 1 ? (b.kPa * 1000).toFixed(0) + ' Pa' : b.kPa.toFixed(1) + ' kPa', b.effect])];
}

function table(ctx, w = 1.2, d = 0.7) {
  const m = makeMaterial('woodPlank'); const g = new THREE.BoxGeometry(w, 0.04, d); g.translate(0, -0.02, 0);
  const t = new THREE.Mesh(g, m); t.receiveShadow = true; ctx.add(t);
  const leg = new THREE.BoxGeometry(0.05, 0.72, 0.05);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const l = new THREE.Mesh(leg, m); l.position.set(x * (w / 2 - 0.05), -0.4, z * (d / 2 - 0.05)); ctx.add(l); }
}

// =====================================================================================================
export const SCENARIOS = [
  // ---------------------------------------------------------------------------------------------- jiskra
  {
    id: 'spark', group: 'Zážeh', name: 'Jiskra (broušení oceli)', ground: 'concrete', time: 'noc',
    desc: 'Úhlová bruska na nosníku IPE 160. Ocelové jiskry ~1 800 K chladnou zářením za desetiny sekundy, odráží se od země a občas se rozprsknou (oxidace uhlíku).',
    cams: [{ name: 'detail', pos: [1.1, 1.05, 1.5], target: [-0.35, 0.5, 0.25] }, { name: 'z boku', pos: [-0.6, 0.8, 2.6], target: [-0.9, 0.35, 0.6] }],
    build(ctx) {
      const rig = P.grinderRig({ lod: ctx.lod }); ctx.add(rig);
      const r = mulberry32(9); let acc = 0, burst = 0;
      const at = rig.userData.sparkAt, dir = rig.userData.sparkDir;
      return {
        update(dt, t) {
          const fx = ctx.fx, on = (t % 6) < 4.5;
          if (!on) return;
          acc += dt * 420 * fx.budgetScale.spark;
          while (acc >= 1) {
            acc -= 1;
            const sp = 14 + 24 * r(), ax = (r() - 0.5) * 0.5, ay = (r() - 0.5) * 0.35;
            const d = V(dir.x + ax, dir.y + ay, dir.z + (r() - 0.5) * 0.3).normalize();
            fx.sp.spawn({ x: at.x, y: at.y, z: at.z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: 0.4 + r() * 1.2, T: 1700 + 250 * r(), tauC: 0.22 + 0.4 * r(), size: 0.0003 + 0.0006 * r(), drag: 0.25 + 0.35 * r(), grav: 1, seed: r() });
          }
          burst += dt * 14;
          while (burst >= 1) {
            burst -= 1;
            const k = 0.3 + r() * 1.3, p = at.clone().addScaledVector(dir, k); p.y += -0.5 * 9.81 * (k / 25) ** 2;
            for (let i = 0; i < 6; i++) { const a = r() * 6.28, b = r() * 3.14; fx.sp.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * Math.sin(b) * 4 + dir.x * 8, vy: Math.cos(b) * 4, vz: Math.sin(a) * Math.sin(b) * 4 + dir.z * 8, life: 0.15 + r() * 0.2, T: 1900, tauC: 0.12, size: 0.0003, drag: 0.15, grav: 1, seed: r() }); }
          }
          fx.lights.add(at.x, at.y + 0.02, at.z, 6 * (0.8 + 0.4 * r()), 1800, 0.05);
        },
        info: () => [
          ['Materiál', 'ocel S235 (0,2 % C)', ''], ['Teplota jiskry', '1 700–1 950 K', 'pyrometrie jisker ★3'],
          ['Průměr částic', '0,3–0,9 mm', '★3'], ['Rychlost odletu', '14–38 m/s', 'obvod kotouče 80 m/s ★3'],
          ['Chladnutí', 'τ ≈ 0,2–0,6 s (záření + konvekce)', '★3'], ['Rozprsk', 'mikrovýbuchy CO v kapce', 'kvalitativní ★3'],
        ],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- svíčka
  {
    id: 'candle', group: 'Zážeh', name: 'Plamen svíčky', ground: 'dirt', time: 'noc',
    desc: 'Parafínová svíčka ~80 W. Modrá zóna u knotu, žlutý sazový plamen, pulzace ~14 Hz. Ve vichru zhasne a vypustí bílý dým parafínu.',
    cams: [{ name: 'detail', pos: [0.18, 0.16, 0.26], target: [0, 0.1, 0] }, { name: 'stůl', pos: [0.6, 0.45, 0.8], target: [0, 0.05, 0] }],
    build(ctx) {
      table(ctx);
      const c = P.candle({ lod: ctx.lod }); ctx.add(c);
      const at = c.userData.flameAt;
      const src = ctx.fx.addSource({
        pos: V(at.x, at.y - 0.004, at.z), fuel: 'paraffin', Q: 80, D: 0.016, L: () => 0.045, T: 1450, blue: 1.0, volume: true,
        taper: 1.25, baseWide: -0.1, neck: 0.55, puffAmp: 0.12, turbAmp: 0.12, tongues: 3, lightH: 0.4,
        mult: { smoke: 0.4, embers: 0, sparks: 0, haze: 0.5 }, seed: 2,
      });
      let out = false, wisp = 0;
      return {
        update(dt) {
          const U = ctx.fx.air.windAt(0.1);
          if (U > 3.0 && !out) { out = true; src.enabled = false; wisp = 6; ctx.message('Vichr svíčku sfoukl (vítr u plamene > 3 m/s).'); }
          if (U <= 3.0 && out) { out = false; src.enabled = true; ctx.message('Svíčka znovu zapálena.'); }
          c.userData.wax.emissiveIntensity = out ? 0 : 4 * PRE.value; // prosvícený vosk u knotu (podpovrchový rozptyl, odhad ~12 cd/m²)
          if (wisp > 0) { wisp -= dt; if (Math.random() < dt * 25) ctx.fx.bb.spawnSmoke({ x: at.x, y: at.y - 0.008, z: at.z, vy: 0.15, life: 3, s0: 0.004, s1: 0.06, tau: 0.6 * Math.max(wisp / 6, 0), albedo: [0.85, 0.85, 0.86], drag: 0.3 }); }
        },
        info: () => [...fireRows(src), ['Stav', out ? 'zhasnutá (vítr)' : 'hoří', 'práh ~3 m/s ★2']],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- louč
  {
    id: 'torch', group: 'Zážeh', name: 'Louč', ground: 'dirt', time: 'noc',
    desc: 'Smolná louč ~4 kW: oranžový plamen 30–40 cm, tmavší kouř z pryskyřice, odlétající uhlíky.',
    cams: [{ name: 'detail', pos: [0.9, 0.9, 1.2], target: [0, 0.65, 0] }, { name: 'hráč', pos: [1.6, 1.7, 2.2], target: [0, 0.7, 0] }],
    build(ctx) {
      const t = P.torch({ lod: ctx.lod }); ctx.add(t);
      t.userData.char.uChar.value = 0.55; t.userData.char.uGlow.value = 0.8;
      const at = t.userData.flameAt;
      const src = ctx.fx.addSource({ pos: V(at.x, at.y - 0.06, at.z), fuel: 'woodResin', Q: 4000, D: 0.065, volume: true, mult: { embers: 0.12, sparks: 0.08 }, taper: 0.9, seed: 3 });
      return { update() {}, info: () => fireRows(src) };
    },
  },
  // ---------------------------------------------------------------------------------------------- ohýnek
  {
    id: 'smallFire', group: 'Ohně', name: 'Ohýnek', ground: 'grass', time: 'soumrak',
    desc: 'Malé ohniště z klestí ~15 kW. Plamen ~40 cm, slabý šedavý kouř.',
    cams: [{ name: 'u ohně', pos: [1.1, 0.8, 1.3], target: [0, 0.2, 0] }, { name: 'hráč', pos: [2.4, 1.7, 2.6], target: [0, 0.2, 0] }],
    build(ctx) {
      const f = P.campfire({ lod: ctx.lod, size: 'small' }); ctx.add(f);
      f.userData.char.uChar.value = 0.45; f.userData.char.uGlow.value = 0.7;
      const src = ctx.fx.addSource({ pos: V(0, 0.04, 0), fuel: 'woodDry', Q: (t) => 15000 * (0.9 + 0.1 * Math.sin(t * 0.7)), D: 0.32, volume: true, seed: 4 });
      return { update() {}, info: () => fireRows(src) };
    },
  },
  // ---------------------------------------------------------------------------------------------- táborák
  {
    id: 'campfire', group: 'Ohně', name: 'Oheň (táborák)', ground: 'grass', time: 'soumrak',
    desc: 'Týpí z polen ~200 kW. Plamen ~1,2 m, pulzace 1,7 Hz, jiskry a uhlíky stoupají v oblaku.',
    cams: [{ name: 'u ohně', pos: [2.6, 1.6, 3.0], target: [0, 0.7, 0] }, { name: 'hráč', pos: [4, 1.7, 4.5], target: [0, 0.8, 0] }, { name: 'shora', pos: [0.5, 7, 1.5], target: [0, 0.5, 0] }],
    build(ctx) {
      const f = P.campfire({ lod: ctx.lod, size: 'medium' }); ctx.add(f);
      f.userData.char.uChar.value = 0.5; f.userData.char.uGlow.value = 0.8;
      const src = ctx.fx.addSource({ pos: V(0, 0.05, 0), fuel: 'woodDry', Q: (t) => 2e5 * (0.92 + 0.08 * Math.sin(t * 0.5)), D: 0.8, volume: true, seed: 5 });
      return { update() {}, info: () => fireRows(src) };
    },
  },
  // ---------------------------------------------------------------------------------------------- velká hranice
  {
    id: 'bonfire', group: 'Ohně', name: 'Požár (velká hranice)', ground: 'dirt', time: 'noc',
    desc: 'Hranice ~3 MW, plamen ~3,3 m, silné stoupání uhlíků, výrazný horký vzduch.',
    cams: [{ name: 'celek', pos: [7, 3, 8], target: [0, 2, 0] }, { name: 'hráč', pos: [6, 1.7, 6], target: [0, 1.6, 0] }],
    build(ctx) {
      const f = P.campfire({ lod: ctx.lod, size: 'large' }); ctx.add(f);
      f.userData.char.uChar.value = 0.65; f.userData.char.uGlow.value = 1;
      const src = ctx.fx.addSource({ pos: V(0, 0.08, 0), fuel: 'woodDry', Q: (t) => 3e6 * (0.9 + 0.1 * Math.sin(t * 0.3)), D: 2.4, volume: true, seed: 6 });
      return { update() {}, info: () => fireRows(src) };
    },
  },
  // ---------------------------------------------------------------------------------------------- stoh slámy
  {
    id: 'haystack', group: 'Materiály', name: 'Hořící stoh slámy', ground: 'dryGrass', time: 'soumrak', timeScale: 4, duration: 1500,
    desc: 'Stoh 36 velkých balíků (~4,8 × 3,6 × 2,7 m). Ultrarychlý růst t², vrchol ~12 MW. Hustý bílo-žlutý kouř (vlhkost), obrovské množství uhlíků.',
    cams: [{ name: 'celek', pos: [16, 6, 18], target: [0, 3, 0] }, { name: 'hráč', pos: [12, 1.7, 9], target: [0, 2.5, 0] }],
    build(ctx) {
      const s = B.strawStack({ lod: ctx.lod }); ctx.add(s);
      const { W, D, H } = s.userData;
      const curve = { alpha: C.T2_ALPHA.ultrafast, Qpeak: 12e6, tPlateau: 600, tau: 400 };
      const tg = Math.sqrt(curve.Qpeak / curve.alpha);
      const src = ctx.fx.addSource({ pos: V(0, H * 0.55, 0), fuel: 'straw', Q: (t) => C.hrrCurve(t, curve), footprint: { type: 'rect', w: W * 1.05, d: D * 1.05 }, scale: (t) => Math.min(1, 0.15 + Math.sqrt(t / tg)), volume: true, mult: { embers: 2 }, seed: 7 });
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: Math.max(W, D) * 1.0, rate: 1 / 900, glow: 0.6, seed: 2 });
      return {
        update(dt, t) { s.userData.char.uChar.value = Math.min(1, t / (tg + curve.tPlateau)); s.userData.char.uGlow.value = Math.min(1, t / 60); },
        info: () => [...fireRows(src), ['Křivka HRR', `t² ultrarychlá, α = ${curve.alpha.toFixed(0)} W/s², vrchol v ${(tg / 60).toFixed(1)} min`, 'NFPA 72 ★4']],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- pneumatiky
  {
    id: 'tires', group: 'Materiály', name: 'Hořící pneumatiky', ground: 'dirt', time: 'den', timeScale: 3, duration: 1200,
    desc: 'Hromada 5 pneumatik. Pryž (SBR) má výtěžek sazí ~0,13 kg/kg → neprůhledný černý sloup s hnědavým dehtovým okrajem; tavenina vytváří hořící louži.',
    cams: [{ name: 'celek', pos: [7, 3, 9], target: [0, 3, 0] }, { name: 'sloup', pos: [18, 6, 22], target: [0, 8, 0] }],
    build(ctx) {
      const p = P.tirePile({ lod: Math.max(0, ctx.lod - 1), n: 5 }); ctx.add(p);
      const curve = { alpha: C.T2_ALPHA.medium, Qpeak: 1.5e6, tPlateau: 500, tau: 300 };
      const src = ctx.fx.addSource({ pos: V(0, 0.25, 0), fuel: 'rubber', Q: (t) => C.hrrCurve(t + 60, curve), D: 0.95, volume: true, seed: 8, mult: { smoke: 1.3 } });
      const pool = ctx.fx.addSource({ pos: V(0, 0.01, 0), fuel: 'rubber', Q: (t) => 3e5 * Math.min(1, t / 60), D: 1.5, start: 120, volume: false, seed: 9, mult: { smoke: 0.6, embers: 0 } });
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: 1.6, rate: 1 / 200, glow: 0.3, seed: 3 });
      return { update(dt, t) { p.userData.char.uChar.value = Math.min(1, 0.2 + t / 900); p.userData.char.uGlow.value = 0.5; }, info: () => [...fireRows(src), ...fireRows(pool, 'louže taveniny').slice(1, 3)] };
    },
  },
  // ---------------------------------------------------------------------------------------------- nafta
  {
    id: 'diesel', group: 'Kapaliny', name: 'Rozlitá nafta 20 l', ground: 'concrete', time: 'soumrak', duration: 90,
    desc: 'Tenká vrstva 1,5 mm na betonu: D ≈ 4,1 m, Q ≈ 13 MW, plamen ~6 m, hoří ~1 min. Plamen se po zapálení šíří po hladině.',
    cams: [{ name: 'celek', pos: [10, 3.5, 12], target: [0, 3, 0] }, { name: 'hráč', pos: [7, 1.7, 7], target: [0, 2.2, 0] }],
    build(ctx) {
      const sp = C.spillFire('diesel', 20, 1.5);
      const pd = P.puddle({ lod: ctx.lod, R: sp.D / 2 }); ctx.add(pd);
      const spread = 1.2; // m/s po předehřáté hladině (★2)
      const Dt = (t) => Math.min(sp.D, 0.3 + spread * t);
      const Q = (t) => { const k = (Dt(t) / sp.D) ** 2; const fade = t < sp.duration ? 1 : Math.max(0, 1 - (t - sp.duration) / 12); return sp.Q * k * fade; };
      const src = ctx.fx.addSource({ pos: V(0, 0.01, 0), fuel: 'diesel', Q, D: Dt, volume: true, seed: 10, start: 0.5 });
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: sp.D * 0.6, rate: 1 / 60, seed: 4 });
      return {
        update() {},
        info: () => [...fireRows(src), ['Plocha louže', sp.A.toFixed(1) + ' m² (D ' + sp.D.toFixed(2) + ' m)', 'vrstva 1,5 mm ★3'], ['Doba hoření', sp.duration.toFixed(0) + ' s', 'm/ṁ ★3'], ['Odhořívání', (sp.mdot * 1000).toFixed(0) + ' g/s', 'Babrauskas ×0,5 tenká vrstva ★3']],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- auto
  {
    id: 'car', group: 'Velké požáry', name: 'Požár auta', ground: 'asphalt', time: 'soumrak', timeScale: 20, duration: 2400,
    desc: 'Osobní auto: začíná v motorovém prostoru, po ~4 min praskají skla a hoří kabina, později pneumatiky a unikající palivo. Vrchol ~5 MW kolem 10. minuty.',
    cams: [{ name: 'celek', pos: [8, 3.5, 9], target: [0, 1.6, 0] }, { name: 'hráč', pos: [6, 1.7, 4], target: [0, 1.3, 0] }],
    build(ctx) {
      const c = B.car({ lod: ctx.lod }); ctx.add(c);
      const L2 = c.userData.L / 2;
      const eng = ctx.fx.addSource({ pos: V(L2 - 0.75, 0.75, 0), fuel: 'vehicle', Q: (t) => C.hrrCurve(t, { alpha: C.T2_ALPHA.medium, Qpeak: 1.5e6, tPlateau: 600, tau: 400 }), footprint: { type: 'rect', w: 1.1, d: 1.4 }, volume: true, seed: 11 });
      const cab = ctx.fx.addSource({ pos: V(-0.2, 0.95, 0), fuel: 'vehicle', start: 240, Q: (t) => C.hrrCurve(t, { alpha: C.T2_ALPHA.fast, Qpeak: 3.5e6, tPlateau: 400, tau: 500 }), footprint: { type: 'rect', w: 2.2, d: 1.4 }, volume: true, seed: 12 });
      const tires = [];
      for (const wx of [-1.35, 1.35]) for (const wz of [-0.85, 0.85]) tires.push(ctx.fx.addSource({ pos: V(wx, 0.05, wz), fuel: 'rubber', start: 480 + (wx > 0 ? 0 : 120), end: 1500, Q: (t) => 2.5e5 * Math.min(1, t / 90), D: 0.5, volume: false, seed: 20 + tires.length, mult: { smoke: 0.5 } }));
      const fuel = ctx.fx.addSource({ pos: V(-1.5, 0.01, 0), fuel: 'gasoline', start: 420, end: 600, Q: (t) => 8e5 * Math.min(1, t / 20) * Math.max(0, 1 - t / 180), D: 1.6, volume: false, seed: 30 });
      ctx.fx.addScorch({ pos: V(0, 0, 0), radius: 3.2, rate: 1 / 1200, glow: 0.2, seed: 5 });
      return {
        update(dt, t) {
          const u = c.userData.char; u.uChar.value = Math.min(1, t / 1100); u.uGlow.value = Math.min(1, t / 300) * (t < 1800 ? 1 : 0.4);
          c.userData.tireChar.uChar.value = Math.min(1, Math.max(0, (t - 450) / 600)); c.userData.tireChar.uGlow.value = 0.6;
          const tot = [eng, cab, ...tires, fuel].reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0);
          this.total = tot;
        },
        info() { return [['Celkový výkon', fmtW(this.total || 0), 'součet zdrojů'], ['Fáze', ctx.t < 240 ? 'motorový prostor' : ctx.t < 480 ? 'kabina (rozbitá skla)' : 'plně rozvinutý', 'Ingason & Lönnermark ★3'], ...fireRows(cab, 'kabina').slice(1, 4), ...fireRows(eng, 'motor').slice(1, 3)]; },
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- sud s benzínem
  {
    id: 'barrel', group: 'Exploze', name: 'Výbuch sudu s benzínem', ground: 'dirt', time: 'soumrak', duration: 40, loop: true,
    desc: 'Zahřívaný sud praskne (~6 s) → ohnivá koule CCPS (25 kg zapojeného paliva: D ≈ 17 m, 1,3 s), sud odletí nahoru, hořící louže a cákance. Tlaková vlna je slabá – benzín ve volném sudu nedetonuje (D-008).',
    cams: [{ name: 'celek', pos: [24, 6, 28], target: [0, 6, 0] }, { name: 'hráč', pos: [16, 1.7, 14], target: [0, 4, 0] }],
    controls: [{ id: 'film', label: 'Filmový výbuch (umělecký)', type: 'check', value: false }],
    build(ctx) {
      const b = P.barrel({ lod: ctx.lod }); ctx.add(b);
      const pre = ctx.fx.addSource({ pos: V(0.3, 0.01, 0.2), fuel: 'gasoline', Q: 4e5, D: 0.7, end: 6, volume: true, seed: 40 });
      const M = 25, fb = bleveFireball(M), film = () => ctx.controls.film;
      const Wburst = 0.05;
      let boom = false; const vel = V(0, 0, 0); let spin = 0;
      return {
        update(dt, t) {
          if (!boom && t > 6) {
            boom = true;
            const W = film() ? 4 : Wburst;
            ctx.fx.addExplosion({
              pos: V(0, 0.4, 0), W, seed: 3, flash: 2e6, scorch: 6, dust: film(),
              fireball: { D: fb.D * (film() ? 1.2 : 1), t: fb.t, T: 1650, rise: fb.H, soot: 0.6 },
              smoke: { n: 500, life: 16, albedo: [0.07, 0.065, 0.06], tau: 2.5, buoy: 6, buoyAcc: 2 },
              debris: { n: film() ? 120 : 14, speed: film() ? 40 : 18, size: 0.12, hot: 0.5, up: 0.6, T: 1200 },
              sparks: { n: 300, speed: 12 },
            });
            for (let i = 0; i < 7; i++) { const a = i * 0.9, R = 2 + (i % 3) * 2.2; ctx.fx.addSource({ pos: V(Math.cos(a) * R, 0.01, Math.sin(a) * R), fuel: 'gasoline', Q: 1.2e5, D: 0.4, start: 0.6, end: 12 + i * 3, volume: false, seed: 50 + i }); }
            ctx.fx.addSource({ pos: V(0, 0.01, 0), fuel: 'gasoline', Q: (q) => 6e6 * Math.max(0, 1 - q / 26), D: 3.5, start: 0.4, end: 26, volume: true, seed: 60 });
            vel.set(1.5, film() ? 28 : 17, -1); spin = 6;
          }
          if (boom) {
            vel.y -= 9.81 * dt; b.position.addScaledVector(vel, dt); b.rotation.x += spin * dt; b.rotation.z += spin * 0.6 * dt;
            if (b.position.y < 0) { b.position.y = 0; vel.multiplyScalar(0.3); vel.y = Math.abs(vel.y) < 1 ? 0 : -vel.y; spin *= 0.4; b.rotation.x = Math.PI / 2; }
            b.userData.char.uChar.value = Math.min(1, b.userData.char.uChar.value + dt * 0.4); b.userData.char.uGlow.value = 0.5;
          }
        },
        info: () => [['Zapojené palivo', M + ' kg (z ~150 kg)', 'předpoklad ★2'], ['Ohnivá koule D', fb.D.toFixed(1) + ' m', 'CCPS ★4'], ['Trvání koule', fb.t.toFixed(2) + ' s', 'CCPS ★4'], ['Výška středu', fb.H.toFixed(1) + ' m', 'CCPS ★3'], ['Energie roztržení', '≈ 0,05 kg TNT (3 bar, 0,2 m³)', 'Brode ★3'], ...blastRows(ctx.controls.film ? 4 : 0.05).slice(1, 5)],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- acetylen
  {
    id: 'acetylene', group: 'Exploze', name: 'Výbuch acetylenové bomby', ground: 'grass', time: 'soumrak', duration: 12, loop: true,
    desc: '50 l PE sáček se stechiometrickou směsí C₂H₂ + O₂ (≈ 15 g C₂H₂). Detonace → modrobílý záblesk ~3 000 K, téměř bez sazí, ostrá tlaková vlna.',
    cams: [{ name: 'celek', pos: [5, 2, 6], target: [0, 0.6, 0] }, { name: 'hráč', pos: [9, 1.7, 9], target: [0, 0.6, 0] }],
    build(ctx) {
      const b = P.acetyleneBag({ lod: ctx.lod }); ctx.add(b);
      const mC2H2 = 0.015, W = gasTNT(mC2H2, 'acetyleneO2'), fb = heFireball(W);
      let boom = false;
      return {
        update(dt, t) {
          if (!boom && t > 1.5) {
            boom = true; b.children[0].visible = false; b.children[2].visible = false;
            ctx.fx.addExplosion({ pos: V(0, 0.4, 0), W, seed: 7, flash: 3e6, scorch: 0.9, dust: true, dustAlbedo: [0.3, 0.3, 0.25], fireball: { D: fb.D, t: fb.t, T: 3000, soot: 0 }, smoke: { n: 60, life: 4, albedo: [0.75, 0.75, 0.77], tau: 0.25, buoy: 1.5 }, debris: { n: 24, speed: 30, size: 0.03, hot: 0.2, up: 0.5 }, sparks: { n: 80, speed: 25 } });
          }
        },
        info: () => [['Směs', 'C₂H₂ : O₂ = 1 : 2,5, 50 l', ''], ['Hmotnost C₂H₂', (mC2H2 * 1000).toFixed(0) + ' g', ''], ['Účinnost → TNT', '45 %', 'odhad ★2'], ...blastRows(W), ['Ohnivá koule', fb.D.toFixed(2) + ' m / ' + (fb.t * 1000).toFixed(0) + ' ms', 'objem produktů ★2']],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- granát
  {
    id: 'grenade', group: 'Exploze', name: 'Výbuch granátu', ground: 'dirt', time: 'den', duration: 12, loop: true,
    desc: 'Ruční granát typu M67: 180 g Composition B (≈ 0,24 kg TNT). Krátký záblesk, černý kouř (výbušnina s nedostatkem kyslíku), prach a střepiny ~2 km/s.',
    cams: [{ name: 'celek', pos: [6, 2.2, 7], target: [0, 0.6, 0] }, { name: 'hráč', pos: [12, 1.7, 10], target: [0, 0.6, 0] }],
    build(ctx) {
      const g = P.grenade({ lod: ctx.lod }); g.position.y = 0.032; g.rotation.z = 1.3; ctx.add(g);
      const W = 0.18 * 1.33, fb = heFireball(W), v = gurneySphere(2700, 0.22, 0.18);
      let boom = false;
      return {
        update(dt, t) {
          if (!boom && t > 1.5) {
            boom = true; g.visible = false;
            ctx.fx.addExplosion({ pos: V(0, 0.05, 0), W, seed: 9, flash: 2e6, scorch: 1.4, dust: true, fireball: { D: fb.D, t: fb.t, T: 2600, soot: 1 }, smoke: { n: 140, life: 7, albedo: [0.11, 0.1, 0.095], tau: 1.6, buoy: 0.7, buoyAcc: 0.25 }, debris: { n: 160, speed: 300, size: 0.006, hot: 0.9, up: 0.25, T: 1100 }, sparks: { n: 220, speed: 70 } });
            ctx.fx.debris.burst(V(0, 0.05, 0), { n: 40, speed: 12, size: 0.05, hot: 0, up: 0.7 });
          }
        },
        info: () => [['Náplň', '180 g Composition B (RE 1,33)', '★4'], ...blastRows(W), ['Rychlost střepin', v.toFixed(0) + ' m/s', 'Gurney ★4'], ['Ohnivá koule', fb.D.toFixed(2) + ' m / ' + (fb.t * 1000).toFixed(0) + ' ms', '★2']],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- 1 t TNT
  {
    id: 'tnt', group: 'Exploze', name: 'Exploze 1 t TNT', ground: 'dryGrass', time: 'den', duration: 60, loop: true,
    desc: '1 000 kg TNT v sudu na zemi. Ohnivá koule ~25 m (0,5 s), rázová vlna (kondenzace a prach), stoupající černý mrak (TNT má nedostatek kyslíku → saze), kráter.',
    cams: [{ name: '160 m', pos: [130, 8, 95], target: [0, 18, 0] }, { name: '400 m', pos: [330, 25, 230], target: [0, 40, 0] }, { name: 'blízko (60 m)', pos: [50, 4, 35], target: [0, 10, 0] }],
    build(ctx) {
      const d = P.tntDrum({ lod: ctx.lod }); ctx.add(d);
      const W = 1000, fb = heFireball(W);
      let boom = false;
      return {
        update(dt, t) {
          if (!boom && t > 2) {
            boom = true; d.visible = false;
            ctx.fx.addExplosion({ pos: V(0, 0.6, 0), W, seed: 11, flash: 6e8, scorch: 26, crater: 1, dust: true, dustAlbedo: [0.36, 0.3, 0.22], fireball: { D: fb.D, t: fb.t, T: 2400, soot: 1, rise: 30 }, smoke: { n: 1400, life: 50, albedo: [0.09, 0.085, 0.08], tau: 3, buoy: 14, buoyAcc: 5, dur: 4 }, debris: { n: 700, speed: 140, size: 0.35, hot: 0.25, up: 0.55, T: 1300 }, sparks: { n: 900, speed: 120 }, life: 70 });
          }
        },
        info: () => [...blastRows(W), ['Ohnivá koule', fb.D.toFixed(0) + ' m / ' + fb.t.toFixed(2) + ' s', '★2'], ['Rychlost čela v 10 m', '≈ ' + (343 * Math.sqrt(1 + (6 * blastSummary(W, [10])[0].Ps) / (7 * 101325))).toFixed(0) + ' m/s', 'Rankine–Hugoniot ★5']],
      };
    },
  },
  // ---------------------------------------------------------------------------------------------- les
  {
    id: 'forest', group: 'Velké požáry', name: 'Lesní požár', ground: 'forest', time: 'soumrak', timeScale: 30, wind: 2, startT: 900, duration: 3600,
    desc: 'Borový les 260 × 260 m. Šíření po zemi (hrabanka) podle Andersonovy elipsy; kde Byramova intenzita překročí práh Van Wagnera, požár přechází do korun.',
    cams: [{ name: 'nad lesem', pos: [-95, 45, 95], target: [-45, 0, 0] }, { name: 'v lese', pos: [-12, 1.7, 22], target: [-45, 5, 0] }, { name: 'daleko', pos: [-200, 90, 260], target: [0, 10, 0] }],
    build(ctx) { return landscapeFire(ctx, { kind: 'pine', size: 260, cell: 5, fuel: 'forestLitter', crown: true, density: 1, seed: 71 }); },
  },
  // ---------------------------------------------------------------------------------------------- křoví
  {
    id: 'brush', group: 'Velké požáry', name: 'Hoření suchého křoví', ground: 'dryGrass', time: 'den', timeScale: 6, wind: 2, startT: 150, duration: 1500,
    desc: 'Suché křoví a tráva 160 × 160 m. Rychlé šíření (~10 m/min ve větru), plameny 2–4 m, šedobílý kouř.',
    cams: [{ name: 'nad plochou', pos: [-60, 22, 55], target: [-30, 0, 0] }, { name: 'hráč', pos: [-15, 1.7, 14], target: [-35, 2, 0] }],
    build(ctx) { return landscapeFire(ctx, { kind: 'bush', size: 160, cell: 3, fuel: 'brush', crown: false, density: 2.2, seed: 81 }); },
  },
  // ---------------------------------------------------------------------------------------------- dům
  {
    id: 'house', group: 'Velké požáry', name: 'Požár domu', ground: 'grass', time: 'noc', timeScale: 15, duration: 2400,
    desc: 'Požár začne v obýváku, flashover podle Thomase, pak ventilací řízené hoření (Kawagoe) s plameny z oken a černým kouřem; přeskok do kuchyně a prohoření střechy.',
    cams: [{ name: 'průčelí', pos: [12, 4, 16], target: [0, 3, 0] }, { name: 'hráč', pos: [8, 1.7, 11], target: [0, 2.5, 0] }, { name: 'celek', pos: [26, 12, 26], target: [0, 4, 0] }],
    build(ctx) { return houseFire(ctx); },
  },
  // ---------------------------------------------------------------------------------------------- laboratoř
  {
    id: 'lab', group: 'Laboratoř', name: 'Parametrický plamen', ground: 'concrete', time: 'noc',
    desc: 'Volný plamen pro ladění enginu: zvol palivo, výkon a průměr – výška, náklon, barva a kouř se spočítají.',
    cams: [{ name: 'celek', pos: [6, 3, 7], target: [0, 1.5, 0] }],
    controls: [
      { id: 'fuel', label: 'Palivo', type: 'select', value: 'woodDry', options: ['woodDry', 'diesel', 'gasoline', 'rubber', 'straw', 'paraffin', 'vehicle', 'houseContents'] },
      { id: 'Q', label: 'Výkon Q [kW]', type: 'range', min: 1, max: 20000, value: 500, log: true },
      { id: 'D', label: 'Průměr D [m]', type: 'range', min: 0.05, max: 6, value: 1, log: true },
    ],
    build(ctx) {
      const src = ctx.fx.addSource({ pos: V(0, 0.01, 0), fuel: 'woodDry', Q: () => ctx.controls.Q * 1000, D: () => ctx.controls.D, volume: true, seed: 90 });
      return { update() { src.o.fuel = ctx.controls.fuel; }, info: () => fireRows(src) };
    },
  },
];

// =====================================================================================================
/** Krajinný požár: porost, mapa paliva, časy příchodu (Dijkstra), bazén zdrojů pro hořící buňky. */
function landscapeFire(ctx, o) {
  const { size, cell } = o, nx = Math.round(size / cell), ny = nx;
  const r = mulberry32(o.seed), f2 = fbm2(o.seed, 3, 5);
  const fuelMap = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = f2(i / nx, j / ny); fuelMap[j * nx + i] = Math.max(0, Math.min(1, (v - 0.28) * 2.6)); }
  // porost
  const maxN = Math.round(ctx.tier.treeMax * (o.kind === 'bush' ? 1.5 : 1));
  const items = [];
  let tries = 0;
  while (items.length < maxN && tries < maxN * 20) {
    tries++;
    const x = (r() - 0.5) * size, z = (r() - 0.5) * size;
    const ci = Math.min(nx - 1, Math.floor((x / size + 0.5) * nx)), cj = Math.min(ny - 1, Math.floor((z / size + 0.5) * ny));
    if (r() > fuelMap[cj * nx + ci] * o.density * 0.6) continue;
    items.push({ x, z, s: o.kind === 'pine' ? 10 + r() * 8 : 0.9 + r() * 0.9, sy: 1, rot: r() * 6.28, cell: cj * nx + ci });
  }
  const flora = new InstancedFlora(ctx.scene, o.kind, items, { lodNear: Math.min(ctx.lod, o.kind === 'pine' ? 2 : 3), lodFar: 0, nearDist: o.kind === 'pine' ? 45 : 25, seed: o.seed });
  ctx.addDisposable(flora); ctx.flora.push(flora);
  const fuel = FUELS[o.fuel];
  // zapálení: krátká linie napříč větru (např. od cesty), palivo v ní zajištěné
  const ign = [];
  for (let k = -3; k <= 3; k++) { const i = Math.round(nx * 0.2), j = Math.round(ny * 0.5) + k; fuelMap[j * nx + i] = Math.max(fuelMap[j * nx + i], 0.8); ign.push([i, j, Math.abs(k) * 20]); }
  let arr = null, lastWind = null;
  const midflame = o.kind === 'pine' ? 0.22 : 0.4; // redukce větru ve výšce plamene (zápoj) ★3
  const recompute = (t) => {
    const U = ctx.fx.air.U10 * midflame;
    const ignitions = arr ? [] : ign;
    if (arr) for (let k = 0; k < nx * ny; k++) if (arr.T[k] <= t) ignitions.push([k % nx, (k / nx) | 0, arr.T[k]]);
    arr = arrivalTimes({ nx, ny, cell, fuel: o.fuel, fuelMap, ignitions, windDir: ctx.fx.air.dir, U });
    lastWind = ctx.fx.air.U10;
  };
  recompute(0);
  const I0 = crownInitiation(4, 100);
  const poolN = [40, 70, 110, 180][ctx.tier.id];
  const pool = [];
  for (let i = 0; i < poolN; i++) pool.push(ctx.fx.addSource({ pos: V(0, 0, 0), fuel: o.fuel, Q: 0, D: cell, footprint: { type: 'rect', w: cell, d: cell }, volume: i < 4, seed: 100 + i, mult: { smoke: 1, embers: 0.6, haze: 0.4, light: 1 } }));
  pool.forEach((s) => (s.enabled = false));
  const scorch = ctx.fx.addScorch({ pos: V(0, 0, 0), radius: 0.1, seed: 9 }); scorch.mesh.visible = false;
  let stats = { burning: 0, burnt: 0, crown: 0 };
  const cellCenter = (k) => [((k % nx) + 0.5) * cell - size / 2, (((k / nx) | 0) + 0.5) * cell - size / 2];
  // spálená plocha – textura překrytá přes zem
  const cv = document.createElement('canvas'); cv.width = nx; cv.height = ny; const cg = cv.getContext('2d'); const img = cg.createImageData(nx, ny);
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.LinearFilter;
  const burnPlane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  burnPlane.rotation.x = -Math.PI / 2; burnPlane.position.y = 0.02; ctx.add(burnPlane);
  let lastTex = -10;
  return {
    flora,
    update(dt, t) {
      if (lastWind !== ctx.fx.air.U10) recompute(t);
      const U = ctx.fx.air.U10 * midflame, R = headROS(o.fuel, U), by = byram(o.fuel, R);
      const crownCell = o.crown && by.I > I0 * 0.6;
      // hořící buňky
      const burning = [];
      let burnt = 0;
      for (let k = 0; k < nx * ny; k++) {
        const ta = arr.T[k]; if (ta === Infinity) continue;
        if (t >= ta) { if (t < ta + fuel.tr) burning.push(k); else burnt++; }
      }
      const cp = ctx.camera.position;
      burning.sort((a, b) => { const [ax, az] = cellCenter(a), [bx, bz] = cellCenter(b); return ((ax - cp.x) ** 2 + (az - cp.z) ** 2) - ((bx - cp.x) ** 2 + (bz - cp.z) ** 2); });
      stats = { burning: burning.length, burnt, crown: crownCell ? burning.length : 0, R, I: by.I, L: by.L, LB: lengthToBreadth(U), I0 };
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i], k = burning[i];
        if (k === undefined) { s.enabled = false; continue; }
        const [x, z] = cellCenter(k), age = (t - arr.T[k]) / fuel.tr, fm = fuelMap[k];
        const env = Math.sin(Math.PI * Math.min(1, age)) ** 0.6;
        const qa = (fuel.dHc * fuel.w * cell * cell) / fuel.tr * fm * env;
        const crown = crownCell && fm > 0.4 && o.crown;
        s.enabled = true; s.pos.set(x, crown ? 3.5 : 0.02, z);
        s.o.Q = crown ? qa * 2.2 : qa;
        s.o.L = crown ? () => 14 + 8 * env : () => Math.max(0.3, by.L * env);
        s.o.fuel = crown ? 'crown' : o.fuel;
      }
      // spálené stromy a keře
      for (let i = 0; i < flora.items.length; i++) {
        const ta = arr.T[flora.items[i].cell];
        if (ta === Infinity || t < ta) { flora.setChar(i, 0, 0); continue; }
        const a = (t - ta) / fuel.tr;
        flora.setChar(i, Math.min(1, a * 1.5), a < 1.5 ? Math.min(1, a * 3) * (1 - a / 1.5) : 0);
      }
      flora.update(ctx.camera, t);
      if (t - lastTex > 2) {
        lastTex = t;
        for (let k = 0; k < nx * ny; k++) {
          const ta = arr.T[k], a = ta === Infinity || t < ta ? 0 : Math.min(1, (t - ta) / fuel.tr);
          const glow = ta !== Infinity && t >= ta && t < ta + fuel.tr * 1.6 ? 1 - (t - ta) / (fuel.tr * 1.6) : 0;
          img.data.set([12 + glow * 120, 10 + glow * 30, 8, a * 235], k * 4);
        }
        cg.putImageData(img, 0, 0); tex.needsUpdate = true;
      }
    },
    info: () => [
      ['Palivo', fuel.name, `w = ${fuel.w} kg/m²`], ['Rychlost čela R', (stats.R * 60).toFixed(1) + ' m/min', 'Rothermel-lite ★2'],
      ['Byramova intenzita', (stats.I / 1000).toFixed(0) + ' kW/m', 'Byram ★4'], ['Délka plamene', stats.L?.toFixed(1) + ' m', 'Byram ★4'],
      ['Tvar L/B', stats.LB?.toFixed(2), 'Anderson ★4'], ['Práh korun I0', (stats.I0 / 1000).toFixed(0) + ' kW/m', 'Van Wagner ★3'],
      ['Hořící buňky', `${stats.burning} (${cell}×${cell} m)`, ''], ['Vyhořelo', ((stats.burnt * cell * cell) / 1e4).toFixed(2) + ' ha', ''],
      ['Režim', stats.crown ? 'korunový požár' : 'přízemní požár', ''], ['Porost', `${flora.items.length} ks, △ ${(flora.tris() / 1e6).toFixed(2)} M`, `LOD blízko/daleko`],
    ],
  };
}

/** Požár domu: dvě místnosti, flashover, plameny z oken, střecha. */
function houseFire(ctx) {
  const h = B.house({ lod: ctx.lod }); ctx.add(h);
  const ud = h.userData, Hw = 2.9;
  const room = (i) => {
    const rm = ud.rooms[i];
    const Ao = rm.wins.reduce((s, w) => s + w.w * w.h * (w.door ? 0.3 : 1), 0);
    const Ho = rm.wins.reduce((s, w) => s + w.h * w.w, 0) / Math.max(rm.wins.reduce((s, w) => s + w.w, 0), 1e-3);
    const AT = 2 * (rm.w * rm.d + rm.w * Hw + rm.d * Hw);
    return { ...rm, ...C.compartment({ Ao, Ho, AT }), Ao, Ho, AT };
  };
  const rooms = [room(0), room(1)];
  const tStart = [0, 0];
  const srcs = [];
  const mkRoom = (k, start) => {
    const rm = rooms[k], alpha = C.T2_ALPHA.fast;
    const tfo = Math.sqrt(rm.Qfo / alpha);
    rm.tfo = start + tfo;
    const Qin = (t) => (t < tfo ? alpha * t * t : rm.Qmax * Math.min(1, 0.6 + (t - tfo) / 120) * (t > tfo + 1500 ? Math.exp(-(t - tfo - 1500) / 400) : 1));
    rm.Qin = Qin;
    const inside = ctx.fx.addSource({ pos: V(rm.x, 0.12, rm.z), fuel: 'houseContents', start, Q: (t) => Math.min(Qin(t), rm.Qmax * 0.7), footprint: { type: 'rect', w: rm.w * 0.6, d: rm.d * 0.6 }, scale: (t) => Math.min(1, 0.2 + t / tfo), L: () => Hw * 0.95, ventLocal: 0.35, volume: false, seed: 200 + k, mult: { smoke: 0.4, embers: 0.2, haze: 0 } });
    srcs.push(inside);
    // plameny z oken po flashoveru
    for (const w of rm.wins) {
      if (w.door) continue;
      const wall = w.wall, n = { S: [0, 0, 1], N: [0, 0, -1], E: [1, 0, 0], W: [-1, 0, 0] }[wall];
      const off = { S: [w.u, ud.D / 2], N: [-w.u, -ud.D / 2], E: [ud.W / 2, -w.u], W: [-ud.W / 2, w.u] }[wall];
      const share = (w.w * w.h) / rm.Ao;
      const s = ctx.fx.addSource({
        pos: V(off[0] + n[0] * 0.25, w.y + w.h * 0.55, off[1] + n[2] * 0.25), fuel: 'houseContents', start: start + tfo,
        Q: (t) => Math.max(0, Qin(t + tfo) - rm.Qmax * 0.6) * share * 0.9 + 2e5 * share,
        footprint: { type: 'rect', w: wall === 'E' || wall === 'W' ? 0.25 : w.w * 0.9, d: wall === 'E' || wall === 'W' ? w.w * 0.9 : 0.25 },
        push: [n[0] * 2.2, 0.6, n[2] * 2.2], ventLocal: 0.55, volume: true, seed: 210 + srcs.length, mult: { smoke: 1.4, embers: 0.6 },
      });
      srcs.push(s);
    }
  };
  mkRoom(0, 0);
  tStart[1] = rooms[0].tfo + 180;
  mkRoom(1, tStart[1]);
  const roofT = rooms[0].tfo + 600;
  const roof = ctx.fx.addSource({ pos: V(-1.5, Hw + 1.8, 0), fuel: 'houseContents', start: roofT, Q: (t) => 6e6 * Math.min(1, t / 240), footprint: { type: 'rect', w: 5, d: 4 }, scale: (t) => Math.min(1, 0.2 + t / 300), volume: true, seed: 230, mult: { embers: 2 } });
  return {
    update(dt, t) {
      const c = ud.char;
      c.plaster.uChar.value = Math.min(0.55, Math.max(0, (t - rooms[0].tfo) / 1500)); c.plaster.uGlow.value = 0;
      c.roof.uChar.value = Math.min(1, Math.max(0, (t - roofT + 200) / 600)); c.roof.uGlow.value = t > roofT ? 0.8 : 0;
      c.wood.uChar.value = Math.min(1, Math.max(0, (t - rooms[0].tfo + 60) / 400)); c.wood.uGlow.value = t > rooms[0].tfo ? 0.7 : 0;
      this.total = [...srcs, roof].reduce((s, x) => s + (x.active && x.ph ? x.ph.Q : 0), 0);
    },
    info() {
      const r0 = rooms[0], r1 = rooms[1], t = ctx.t;
      return [
        ['Celkový výkon', fmtW(this.total || 0), 'součet zdrojů'],
        ['Fáze', t < r0.tfo ? 'rozvoj v obýváku' : t < tStart[1] ? 'flashover obýváku, plameny z oken' : t < roofT ? 'hoří obě místnosti' : 'prohořelá střecha', ''],
        ['Flashover obývák', fmtW(r0.Qfo) + ` v ${(r0.tfo / 60).toFixed(1)} min`, 'Thomas ★4'],
        ['Qmax obývák (ventilace)', fmtW(r0.Qmax) + `  Ao√Ho = ${(r0.Ao * Math.sqrt(r0.Ho)).toFixed(2)} m^2,5`, 'Kawagoe ★4'],
        ['Flashover kuchyň', fmtW(r1.Qfo) + ` v ${(r1.tfo / 60).toFixed(1)} min`, 'Thomas ★4'],
        ['Prohoření střechy', (roofT / 60).toFixed(1) + ' min', 'předpoklad ★2'],
        ...fireRows(srcs[1], 'okno').slice(1, 4),
      ];
    },
  };
}

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id);
