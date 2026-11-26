// Bake datasetu do dataset/: flipbooky, modely GLB (L0–L3 do 200 k △), textury, presety scénářů, náhledy, fyzikální tabulky.
// node tools/bake.mjs [--skip-previews]
import { open, ROOT } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { blackbody } from '../src/physics/blackbody.js';
import { blastSummary, bleveFireball, heFireball } from '../src/physics/blast.js';
import * as C from '../src/physics/combustion.js';

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
      const sec = { barrel: 7.3, acetylene: 1.56, grenade: 1.56, tnt: 2.15 }[id] ?? 3;
      const seek = { haystack: 300, tires: 200, car: 700, forest: 1500, brush: 400, house: 700, diesel: 20 }[id] ?? 0;
      const r = await page.evaluate(([id, sec, seek]) => {
        const f = window.__fire, a = f.app; a.loadScenario(id); if (seek) { a.t = seek; a.fx.scnTime = seek; }
        f.ff(sec); f.settle();
        const s = a.scn;
        const preset = { format: 'firelab-preset/1', id: s.id, name: s.name, group: s.group, desc: s.desc, time: s.time, timeScale: s.timeScale || 1, duration: s.duration || null, cams: s.cams,
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
