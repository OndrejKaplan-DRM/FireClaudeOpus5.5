// Integrační test FireLab × xEngine (jádro + vykreslení xEngine, systém fx.fire): node tools/test-xengine.mjs
// Kontroluje: start bez chyb, události fire:*, reakci na combat:explode, světla přes systém light (low ≤ 1),
// že na low nevzniká žádné světlo three.js ani MeshStandardMaterial, a že oheň je v obraze vidět.
import { open } from './harness.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const out = '/tmp/xfire';
execFileSync('node', ['tools/build-xengine.mjs'], { stdio: 'inherit' });
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'CHYBA ') + m); if (!c) fail++; };
for (const quality of [1, 3]) {
  const { browser, page, errs } = await open({ html: out + '/index.html', q: `quality=${quality}`, vp: { width: 960, height: 540 } });
  const r = await page.evaluate(() => {
    const f = window.__fire;
    const id = f.fire.ignite('campfire', [0, 0, 0]);
    f.fire.ignite('candle', [1.2, 0.5, 1]);
    f.sim(3);
    const flux = f.fire.heatFlux(0, 1, 2);
    f.E.emit('combat:explode', { kind: 'barrel', pos: [3, 0, -2] });
    f.sim(1.2);
    const s1 = f.stats();
    const url = f.shot();
    const three = { lights: 0, standard: 0 };
    f.render.scene.traverse((o) => { if (o.isLight) three.lights++; if (o.material && o.visible && [].concat(o.material).some((m) => m.isMeshStandardMaterial)) three.standard++; });
    const out = f.fire.extinguish(id);
    return { s1, url, flux, three, out, events: f.events.map((e) => e[0]), light: { add: f.light.add, set: f.light.set, move: f.light.move, maxOn: f.light.maxOn }, layers: f.fire.fx.bb.mesh.layers.mask };
  });
  fs.writeFileSync(`${out}/q${quality}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
  const bad = errs.filter((e) => /PAGEERROR|ERROR: 0:/.test(e));
  console.log(`--- quality ${quality}: calls ${r.s1.calls} △ ${r.s1.tris} částic ${r.s1.particles} objemů ${r.s1.volumes} světla add/set/move ${r.light.add}/${r.light.set}/${r.light.move}`);
  ok(bad.length === 0, 'bez chyb stránky ' + bad.slice(0, 2).join(' | '));
  ok(r.events.includes('fire:ignited') && r.events.includes('fire:exploded') && r.events.includes('fire:out'), 'události fire:ignited / fire:exploded (z combat:explode) / fire:out');
  ok(r.layers === 1, 'efekty ve vrstvě 0 (vrstva 1 patří zbrani)');
  ok(r.three.lights === 0, 'žádné světlo three.js ve scéně (D-022)');
  if (quality === 1) { ok(r.light.maxOn <= 1, `low: nejvýš 1 světlo efektu (bylo ${r.light.maxOn})`); ok(r.three.standard === 0, 'low: žádný viditelný MeshStandardMaterial'); }
  ok(r.light.add >= 1 && r.light.set + r.light.move > 0, 'světlo ohně předané systému light');
  ok(r.flux > 200 && r.flux < 20000, `sálavý tok 2 m od táboráku ${r.flux.toFixed(0)} W/m² (čekáno ~0,5–5 kW/m²)`);
  ok(r.s1.particles > 50, 'částice běží');
  // oheň vidět: jasné oranžové pixely
  const px = execFileSync('python3', ['-c', `from PIL import Image\nimport numpy as np\na=np.asarray(Image.open('${out}/q${quality}.png').convert('RGB')).astype(int)\nprint(int(((a[...,0]>180)&(a[...,0]>a[...,2]+60)).sum()))`]).toString().trim();
  ok(+px > 300, `oheň v obraze (${px} jasných oranžových px)`);
  await browser.close();
}
console.log(fail ? `\n${fail} chyb` : '\nintegrace s xEngine v pořádku');
process.exit(fail ? 1 : 0);
