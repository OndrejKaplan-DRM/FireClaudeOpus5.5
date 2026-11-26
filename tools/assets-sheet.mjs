// Galerie modelů: node tools/assets-sheet.mjs <lod> <out.png> [tier]
import { open } from './harness.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const [lod = '2', out = '/tmp/assets.png', tier = '1'] = process.argv.slice(2);
const { browser, page, errs } = await open({ q: `tier=${tier}&ui=0&asset=candle`, vp: { width: 480, height: 360 } });
const ids = await page.evaluate(() => window.__fire.app.constructor && Array.from(document.querySelectorAll('x')).length === 0 && window.__fire.ASSETS);
const list = await page.evaluate(() => (window.__fire.ASSETS || []).map((a) => a.id));
const files = [];
for (const id of list) {
  const r = await page.evaluate(([id, lod]) => { const f = window.__fire; f.app.lodOverride = +lod; f.app.loadAsset(id); f.ff(0.2); f.settle(); return { url: f.shot(), tris: f.app.assetTris, ms: f.app.assetBuildMs }; }, [id, lod]);
  const fn = `/tmp/asset_${id}.png`; fs.writeFileSync(fn, Buffer.from(r.url.split(',')[1], 'base64'));
  files.push(`${fn}:${id} L${lod} ${r.tris.toLocaleString('cs')} tri ${r.ms.toFixed(0)}ms`);
  console.log(id, r.tris, r.ms.toFixed(0) + ' ms');
}
await browser.close();
execSync(['python3', 'tools/montage.py', out, '6', '320', '240', ...files].map((x) => `'${x}'`).join(' '));
console.log(out, errs.filter((e) => !/GPU stall/.test(e)).slice(0, 5));
