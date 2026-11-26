// Časová řada snímků jednoho scénáře: node tools/seq.mjs <scn> <tier> <t1,t2,...> <out.png> [cam] [query]
import { open } from './harness.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const [scn, tier = '2', times = '1,2,3', out = '/tmp/seq.png', cam = '0', extra = ''] = process.argv.slice(2);
const { browser, page, errs } = await open({ q: `scn=${scn}&tier=${tier}&ui=0&${extra}`, vp: { width: 640, height: 360 } });
const ts = times.split(',').map(Number);
const files = [];
let prev = 0;
for (const t of ts) {
  const url = await page.evaluate(([dt, cam, first]) => { const f = window.__fire; if (first) f.app.setCam(+cam); f.ff(dt, 1 / 60); f.settle(); return f.shot(); }, [t - prev, cam, prev === 0]);
  prev = t;
  const fn = `/tmp/seq_${files.length}.png`; fs.writeFileSync(fn, Buffer.from(url.split(',')[1], 'base64')); files.push([fn, t]);
}
await browser.close();
execSync(['python3', 'tools/montage.py', out, '3', '640', '360', ...files.map(([f, t]) => `${f}:t=${t}s`)].map((x) => `'${x}'`).join(' '));
console.log(out, errs.filter((e) => !/GPU stall/.test(e)).slice(0, 5));
