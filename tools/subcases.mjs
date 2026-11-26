// Podpřípady: vítr 0–3 a kyslík pro jeden scénář → mřížka. node tools/subcases.mjs <scn> <tier> <out.png> [sekund] [cam]
import { open } from './harness.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const [scn = 'campfire', tier = '2', out = '/tmp/sub.png', sec = '4', cam = '0'] = process.argv.slice(2);
const { browser, page } = await open({ q: `scn=${scn}&tier=${tier}&ui=0`, vp: { width: 640, height: 360 } });
const cases = [[0, 1], [1, 1], [2, 1], [3, 1], [0, 0.5], [0, 0.05]];
const files = [];
for (const [w, o2] of cases) {
  const url = await page.evaluate(([w, o2, sec, cam]) => { const f = window.__fire, a = f.app; a.setWind(w); a.setO2(o2); a.loadScenario(a.scnId); a.setCam(+cam); f.ff(+sec); f.settle(); return f.shot(); }, [w, o2, sec, cam]);
  const fn = `/tmp/sub_${files.length}.png`; fs.writeFileSync(fn, Buffer.from(url.split(',')[1], 'base64'));
  files.push(`${fn}:vítr ${['bezvětří', 'vánek', 'vítr', 'vichr'][w]} · O2 ${Math.round(o2 * 100)} %`);
}
await browser.close();
execSync(['python3', 'tools/montage.py', out, '3', '640', '360', ...files].map((x) => `'${x}'`).join(' '));
console.log(out);
