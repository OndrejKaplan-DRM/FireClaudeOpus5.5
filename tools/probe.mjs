// Ad-hoc sonda: node tools/probe.mjs <scn> <tier> <sekund> [cam] [out.png] [extra query]
import { open, shot, ROOT } from './harness.mjs';
import path from 'node:path';
const [scn = 'campfire', tier = '2', sec = '3', cam = '0', out = '/tmp/probe.png', extra = ''] = process.argv.slice(2);
const t0 = Date.now();
const { browser, page, errs } = await open({ q: `scn=${scn}&tier=${tier}&ui=0&${extra}`, vp: { width: 960, height: 540 } });
console.log('load', Date.now() - t0, 'ms');
const info = await page.evaluate(([sec, cam]) => {
  const f = window.__fire; f.app.setCam(+cam);
  const t = performance.now(); f.ff(+sec); f.settle();
  const simMs = performance.now() - t;
  return { simMs, stats: f.app.stats(), rows: (f.app.run?.info?.() || []).slice(0, 12) };
}, [sec, cam]);
await shot(page, out);
console.log(JSON.stringify(info, null, 1).slice(0, 2500));
console.log('ERR', errs.slice(0, 15));
await browser.close();
