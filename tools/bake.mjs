// Bake datasetu do dataset/: flipbooky, modely GLB (L0–L3 do 200 k △), textury, presety scénářů, náhledy, fyzikální tabulky.
// node tools/bake.mjs [--skip-previews]
import { open, ROOT } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { blackbody } from '../src/physics/blackbody.js';
import { blastSummary, bleveFireball, heFireball } from '../src/physics/blast.js';
import * as C from '../src/physics/combustion.js';
import { MATERIALS } from '../src/physics/materials.js';
import { timeToIgnition, fluxFromFire, emissivePower, FLUX_EFFECTS } from '../src/physics/heat.js';
import { fireSpec, explosionSpec } from '../src/physics/spec.js';

const D = path.join(ROOT, 'dataset');
const w = (rel, data) => { const f = path.join(D, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const png = (rel, url) => w(rel, Buffer.from(url.split(',')[1], 'base64'));
const skipPrev = process.argv.includes('--skip-previews');
const MAX_COMMIT_TRIS = 200000, MAX_COMMIT_KB = 3000;

// ---------------------------------------------------------------- fyzikální tabulky (Node, bez prohlížeče)
const lut = ['T_K;R_lin;G_lin;B_lin;lum_rel_1500K'];
for (let T = 600; T <= 3500; T += 50) { const b = blackbody(T); lut.push([T, ...b.rgb.map((v) => v.toFixed(5)), b.lum.toExponential(4)].join(';')); }
w('physics/blackbody_lut.csv', lut.join('\n') + '\n');
const blast = {};
for (const [name, W] of [['granat_M67', 0.24], ['acetylen_50l', 0.16], ['sud_roztrzeni', 0.05], ['TNT_1t', 1000]]) blast[name] = { W_TNT_kg: W, table: blastSummary(W, [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 500]).map((r) => ({ R_m: r.R, Ps_kPa: +r.kPa.toFixed(3), td_ms: +(r.td * 1000).toFixed(2), effect: r.effect })) };
blast.fireballs = { bleve_25kg: bleveFireball(25), he_1t: heFireball(1000), he_grenade: heFireball(0.24) };
w('physics/blast_tables.json', JSON.stringify(blast, null, 1));
const flames = [];
for (const [fuel, Q, Dm] of [['paraffin', 80, 0.012], ['woodResin', 4e3, 0.065], ['woodDry', 15e3, 0.32], ['woodDry', 2e5, 0.8], ['woodDry', 3e6, 2.4], ['rubber', 1.5e6, 0.66], ['diesel', C.spillFire('diesel', 20).Q, C.spillFire('diesel', 20).D], ['straw', 12e6, 4.7]]) {
  const v = C.ventilation(1);
  flames.push({ fuel, Q_W: Math.round(Q), D_m: +Dm.toFixed(3), L_heskestad_m: +C.flameHeight(Q, Dm).toFixed(3), puff_Hz: +C.puffingFrequency(Dm).toFixed(2), smoke_tau_at_1_2L: +C.smokeOpticalDepth(Q, Dm, C.flameHeight(Q, Dm) * 1.2, fuel, v).tau.toFixed(3), smoke_rgb: C.smokeColor(fuel, v).rgb.map((x) => +x.toFixed(3)), light_cd: +C.flameLuminousIntensity(Q).toFixed(1) });
}
w('physics/flames.json', JSON.stringify(flames, null, 1));
// iterace 6: materiály, zapálení, jeden popis ohně a výbuchu (čisté funkce → tabulky pro jiný engine)
w('physics/materials.json', JSON.stringify(MATERIALS, (k, v) => (v === Infinity ? 'Infinity' : v), 1));
const FLUXES = [8e3, 10e3, 12.5e3, 15e3, 20e3, 25e3, 35e3, 50e3, 80e3, 150e3];
w('physics/ignition_times_s.json', JSON.stringify({ flux_W_m2: FLUXES, note: 'doba do vznícení [s], null = pod kritickým tokem', materials: Object.fromEntries(Object.keys(MATERIALS).filter((m) => MATERIALS[m].mode !== 'inert').map((m) => [m, FLUXES.map((q) => { const t = timeToIgnition(q, m); return Number.isFinite(t) ? +t.toFixed(2) : null; })])), effects: FLUX_EFFECTS }, null, 1));
const clean = (sp) => Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v !== 'function' && typeof v !== 'object').map(([k, v]) => [k, typeof v === 'number' ? +v.toPrecision(5) : v]));
const SPECS = { lighter: { kind: 'jet', fuel: 'butane', mdot: 1.25e-6 }, candle: { kind: 'wick', fuel: 'paraffin', Q: 80 }, dieselBarrel: { kind: 'pool', fuel: 'diesel', D: 0.56, volumeL: 170 }, gasolineBarrel: { kind: 'pool', fuel: 'gasoline', D: 0.56, volumeL: 170 },
  dieselSpill20l: { kind: 'spill', fuel: 'diesel', volumeL: 20 }, leakDiesel9mm: { kind: 'leak', fuel: 'diesel', holeMM: 9, head: 0.5 }, leakGasoline9mm: { kind: 'leak', fuel: 'gasoline', holeMM: 9, head: 0.5 },
  smallFire1kg: { kind: 'pile', material: 'softwood', mass: 1, stick: 0.03 }, campfire20kg: { kind: 'pile', material: 'softwood', mass: 20, stick: 0.08 }, bonfire600kg: { kind: 'pile', material: 'softwood', mass: 600, stick: 0.1 },
  propaneTorch2g: { kind: 'jet', fuel: 'propane', mdot: 0.0022 }, propaneValve200g: { kind: 'jet', fuel: 'propane', mdot: 0.2 }, gasolineTrail12m: { kind: 'line', fuel: 'gasoline', length: 12, width: 0.28 }, dieselTrail12m: { kind: 'line', fuel: 'diesel', length: 12, width: 0.28 },
  room4x35: { kind: 'room', floor: [4, 3.5], H: 2.6, opening: [1.2, 1.4], load: 25 }, thermite1kg: { kind: 'metal', fuel: 'thermite', mass: 1 }, magnesium2kg: { kind: 'metal', fuel: 'magnesium', mass: 2 }, molotovSpill: { kind: 'spill', fuel: 'gasoline', volumeL: 0.55, depthMM: 0.55 },
  pallets2: { kind: 'solid', material: 'softwood', mass: 44, area: 7, size: 1.2 }, strawBale: { kind: 'solid', material: 'straw', mass: 250, area: 9, size: 1.6 }, tire: { kind: 'solid', material: 'rubber', mass: 9, area: 1.2, size: 0.65, D: 0.65 }, crate: { kind: 'solid', material: 'softwood', mass: 9, area: 2.2, size: 0.6 } };
w('physics/fire_specs.json', JSON.stringify(Object.fromEntries(Object.entries(SPECS).map(([k, sp]) => { const o = fireSpec(sp); return [k, { spec: sp, result: clean(o), rows: o.rows }]; })), null, 1));
const EX = {}; for (const m of [0.05, 0.24, 1, 10, 100, 1000, 5000]) { const e = explosionSpec({ kind: 'he', explosive: 'tnt', mass: m }); EX['tnt_' + m + 'kg'] = { W: e.W, ...e.ex }; }
for (const m of [5, 25, 100]) { const e = explosionSpec({ kind: 'fireball', mass: m }); EX['fireball_' + m + 'kg'] = { W: e.W, ...e.ex }; }
{ const e = explosionSpec({ kind: 'gasCylinder' }); EX.acetyleneCylinder50l = { W: e.W, vFrag: e.vFrag, Eburst_J: e.Eburst, ...e.ex, rows: e.rows }; }
{ const e = explosionSpec({ kind: 'gasCylinder', film: true }); EX.acetyleneCylinder50l_film = { W: e.W, ...e.ex, rows: e.rows }; }
for (const m of [0.1, 1, 10]) { const e = explosionSpec({ kind: 'dust', mass: m }); EX['dust_' + m + 'kg'] = { W: e.W, ...e.ex }; }
{ const e = explosionSpec({ kind: 'dust', mass: 5, confined: true }); EX.dust_5kg_silo = { W: e.W, ...e.ex }; }
for (const m of [1, 10]) { const e = explosionSpec({ kind: 'vapor', fuel: 'gasoline', mass: m }); EX['gasolineVapour_' + m + 'kg'] = { W: e.W, ...e.ex }; }
for (const c of [75, 100, 150, 200]) { const e = explosionSpec({ kind: 'pyro', caliber: c }); EX['shell_' + c + 'mm'] = { W: e.W, H: e.H, R: e.R, tLift: e.tLift, burn: e.burn, stars: e.stars, starV: e.starV, mass: e.mass }; }
w('physics/explosion_specs.json', JSON.stringify(EX, (k, v) => (typeof v === 'number' ? +v.toPrecision(5) : v), 1));
{ const f = { x: 0, y: 0, z: 0, Q: 1e6, D: 1.1, L: C.flameHeight(1e6, 1.1), chiR: 0.3, sooty: false };
{ // iterace 7: zbraně, hašení
  const G = await import('../src/physics/gun.js'), SU = await import('../src/physics/suppress.js');
  w('physics/guns.json', JSON.stringify(Object.fromEntries(Object.keys(G.GUNS).map((k) => { const m = G.muzzleSpec(k); return [k, { ...G.GUNS[k], energy_J: m.E, muzzleEnergy_J: m.KE, efficiency: +m.eff.toFixed(3), flashLength_m: +m.flashL.toPrecision(3), flashTime_s: +m.flashT.toPrecision(3), tntEq_kg: +m.W.toPrecision(3), spl1m_dB: +m.spl(1).toFixed(1), spl10m_dB: +m.spl(10).toFixed(1), smoke_m3: +m.smokeV.toPrecision(3), dustRadius_m: +m.dustR.toFixed(2), barrelHeatPerShot_K: +m.dTbarrel.toFixed(3), recoil_Ns: +m.impulse.toPrecision(4) }]; })), null, 1));
  w('physics/suppression.json', JSON.stringify({ L_water_J_kg: SU.L_WATER, steam_m3_per_kg: SU.STEAM_M3_PER_KG, agents: SU.AGENTS, rules: SU.RULES, waterDemand_l_min_per_MW: { waterJet: +(SU.waterDemand(1e6) * 60).toFixed(1), waterFog: +(SU.waterDemand(1e6, 'waterFog') * 60).toFixed(1) } }, null, 1));
}
  w('physics/heat_flux_1MW.json', JSON.stringify({ note: 'tepelný tok [kW/m²] ve výšce 0,5 m v dané vzdálenosti od okraje ohně 1 MW, D 1,1 m', table: [0.3, 0.6, 0.9, 1.2, 1.5, 2, 3, 5, 8].map((e) => ({ edge_m: e, kW_m2: +(fluxFromFire(f, [0.55 + e, 0.5, 0]).total / 1000).toFixed(2) })), emissive_power_kW_m2: [0.1, 0.5, 1, 2, 5, 10, 30].map((D) => ({ D_m: D, E: +(emissivePower(D) / 1000).toFixed(1) })) }, null, 1)); }

// ---------------------------------------------------------------- prohlížeč
const runTier = async (tier, fn) => { const s = await open({ q: `tier=${tier}&ui=0&scn=lab`, vp: { width: 960, height: 540 } }); try { return await fn(s.page); } finally { await s.browser.close(); } };

// flipbooky (T0 = 128 px buňka, T3 = 192 px)
for (const tier of [0, 3]) {
  await runTier(tier, async (page) => {
    const a = await page.evaluate(() => window.__fire.atlas());
    png(`flipbooks/atlas_${a.meta.res}.png`, a.raw); png(`flipbooks/atlas_${a.meta.res}_preview.png`, a.preview);
    w(`flipbooks/atlas_${a.meta.res}.json`, JSON.stringify({ ...a.meta, grid: [16, 8], frames: 64, loopSeconds: 2.0, channels: { flame: { R: 'intenzita emise 1−e^−H', G: 'vážená normovaná teplota', B: 'opacita sazí', A: 'pokrytí' }, smoke: { R: 'optická tloušťka/3', G: 'propustnost ke světlu shora', B: 'okraj (1 − τ)', A: '1' } }, usage: 'barva plamene = sootColor(T_částice × (0,8 + 0,25 G)) × R; kouř: α = 1 − e^(−R·τ·2,2)' }, null, 1));
    console.log('atlas', a.meta.res);
  });
}

// modely + textury
await runTier(1, async (page) => {
  const ids = await page.evaluate(() => window.__fire.ASSETS.map((a) => a.id));
  const index = {};
  for (const id of ids) {
    index[id] = { lods: [] };
    for (let lod = 0; lod <= 4; lod++) {
      if (lod <= 3) {
        const r = await page.evaluate(([id, lod]) => window.__fire.glb(id, lod), [id, lod]);
        const entry = { lod, tris: r.tris };
        if (r.tris <= MAX_COMMIT_TRIS && r.b64.length * 0.75 / 1024 <= MAX_COMMIT_KB) { w(`meshes/${id}_L${lod}.glb`, Buffer.from(r.b64, 'base64')); entry.file = `${id}_L${lod}.glb`; entry.kB = Math.round(r.b64.length * 0.75 / 1024); }
        else entry.note = 'generuje se za běhu (D-007)';
        index[id].lods.push(entry);
      } else {
        const t = await page.evaluate(([id]) => window.__fire.trisOf(id, 4), [id]);
        index[id].lods.push({ lod: 4, tris: t, note: 'generuje se za běhu (D-007)' });
      }
    }
    console.log(id, index[id].lods.map((l) => l.tris).join(' / '));
  }
  w('meshes/index.json', JSON.stringify(index, null, 1));
  const tx = await page.evaluate(() => window.__fire.textures());
  for (const [n, u] of Object.entries(tx)) if (u) png(`textures/${n}.png`, u);
  w('physics/database.json', JSON.stringify(await page.evaluate(() => window.__fire.db()), null, 1));
});

// presety scénářů + náhledy T0/T2
if (!skipPrev) for (const tier of [0, 2]) {
  await runTier(tier, async (page) => {
    const ids = await page.evaluate(() => window.__fire.SCENARIOS.map((s) => s.id));
    for (const id of ids) {
      const sec = { barrel: 7.3, acetylene: 1.56, grenade: 1.56, tnt: 2.15, lighter: 2.6, blastLab: 2.2, chain: 40, leak: 30, dieselBarrel: 20,
        pistol: 1.22, machineGun: 1.7, cannon: 2.05, chainBlast: 2.1, molotov: 3.0, flamethrower: 3.2, jetFire: 3, trail: 6, extinguish: 14, aftermath: 45, flashover: 36, dust: 3.35, fireworks: 6.6, thermite: 8, whirl: 8 }[id] ?? 3;
      const seek = { haystack: 300, tires: 200, car: 700, forest: 1500, brush: 400, house: 700, diesel: 20 }[id] ?? 0;
      const r = await page.evaluate(([id, sec, seek]) => {
        const f = window.__fire, a = f.app; a.loadScenario(id); if (seek) { a.t = seek; a.fx.scnTime = seek; }
        if (id === 'acetyleneCyl') { for (let i = 0; i < 60 && !/roztr/.test(a.run.info()[0][1]); i++) f.ff(1, 1 / 30); f.ff(0.45); } else f.ff(sec);
        f.settle();
        const s = a.scn;
        const preset = { format: 'firelab-preset/1', id: s.id, name: s.name, group: s.group, desc: s.desc, time: s.time, timeScale: s.timeScale || 1, duration: s.duration || null, cams: s.cams, tiers: s.tiers || null, controls: (s.controls || []).map((c) => ({ id: c.id, label: c.label, type: c.type, value: c.value, options: c.options, min: c.min, max: c.max })),
          physics: (a.run?.info?.() || []).map(([k, v, src]) => ({ k, v: String(v), src })),
          sources: a.fx.sources.filter((x) => x.ph && x.active).slice(0, 12).map((x) => ({ fuel: x.o.fuel, pos: x.pos.toArray().map((v) => +v.toFixed(3)), D: +x.D.toFixed(3), Q_W: Math.round(x.ph.Q), L_m: +x.ph.L.toFixed(3), T_K: Math.round(x.ph.T), puff_Hz: +x.ph.fp.toFixed(2), smoke_tau: +x.ph.tau.toFixed(3), smoke_rgb: x.ph.smoke.rgb.map((v) => +v.toFixed(3)), light_cd: +x.ph.I.toFixed(1) })) };
        return { url: f.shot(), preset };
      }, [id, sec, seek]);
      png(`previews/${id}_T${tier}.png`, r.url);
      if (tier === 2) w(`presets/${id}.json`, JSON.stringify(r.preset, null, 1));
      console.log('náhled', id, 'T' + tier);
    }
  });
}
if (!skipPrev) {
  const ids = fs.readdirSync(path.join(D, 'previews')).filter((f) => f.endsWith('_T2.png')).map((f) => f.replace('_T2.png', '')).sort();
  for (const t of [0, 2]) execSync(['python3', 'tools/montage.py', path.join(D, `previews/_sheet_T${t}.png`), '4', '480', '270', ...ids.map((i) => `${path.join(D, 'previews', i + '_T' + t + '.png')}:${i} T${t}`)].map((x) => `'${x}'`).join(' '), { cwd: ROOT });
}
// náhledy do JPEG (menší repozitář)
if (!skipPrev) execSync(`python3 -c "import glob,os\nfrom PIL import Image\nfor p in glob.glob('${path.join(D, 'previews')}/*.png'):\n  Image.open(p).convert('RGB').save(p[:-4]+'.jpg',quality=88); os.remove(p)"`);
console.log('hotovo →', D);
