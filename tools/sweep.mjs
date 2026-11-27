// Mřížka scénář × hodnota parametru: node tools/sweep.mjs <tier> "scn1,scn2" "<js výraz s v>" "v1,v2,v3" out.png [sek]
// př.: node tools/sweep.mjs 3 campfire,diesel "a.flameKey=v" "8,16,32" /tmp/sw.png
import { open } from './harness.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [tier = '3', scns = 'campfire', expr = 'a.flameKey=v', vals = '16', out = '/tmp/sweep.png', sec = '3'] = process.argv.slice(2);
const { browser, page, errs } = await open({ q: `tier=${tier}&ui=0`, vp: { width: 480, height: 270 } });
const files = [];
const seek = { haystack: 300, tires: 200, car: 700, forest: 1800, brush: 500, house: 700, diesel: 20 };
for (const id of scns.split(',')) for (const v of vals.split(',')) {
  const url = await page.evaluate(([id, expr, v, sec, sk]) => {
    const f = window.__fire, a = f.app; a.loadScenario(id);
    if (sk) { a.t = sk; a.fx.scnTime = sk; }
    new Function('a', 'f', 'v', expr)(a, f, isNaN(+v) ? v : +v);
    f.ff(+sec); f.settle(); return f.shot();
  }, [id, expr, v, sec, seek[id] || 0]);
  const fn = `/tmp/_sw_${id}_${v}.png`; fs.writeFileSync(fn, Buffer.from(url.split(',')[1], 'base64')); files.push([fn, `${id} ${v}`]);
}
await browser.close();
const cols = vals.split(',').length;
execFileSync('python3', ['-c', `
import sys,json
from PIL import Image, ImageDraw
fs=json.loads(sys.argv[1]); cols=int(sys.argv[2]); W,H=480,270
rows=(len(fs)+cols-1)//cols
m=Image.new('RGB',(W*cols,H*rows),(20,20,20)); d=ImageDraw.Draw(m)
for i,(f,l) in enumerate(fs):
  m.paste(Image.open(f).convert('RGB').resize((W,H)),((i%cols)*W,(i//cols)*H)); d.text(((i%cols)*W+4,(i//cols)*H+3),l,fill=(255,200,80))
m.save(sys.argv[3])`, JSON.stringify(files), String(cols), out]);
console.log(out, errs.filter((e) => /PAGEERROR|ERROR: 0:/.test(e)).slice(0, 3));
