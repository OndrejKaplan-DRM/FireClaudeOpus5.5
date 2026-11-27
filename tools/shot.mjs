// Snímek z libovolné kamery: node tools/shot.mjs <scn> <tier> <s> "x,y,z" "tx,ty,tz" out.png [w] [h] [query] [fov]
import { open } from './harness.mjs';
import fs from 'node:fs';
const [scn, tier = '2', sec = '3', pos, tgt, out = '/tmp/shot.png', w = '1280', h = '720', extra = '', fov = '0'] = process.argv.slice(2);
const { browser, page, errs } = await open({ q: `scn=${scn}&tier=${tier}&ui=0&${extra}`, vp: { width: +w, height: +h } });
const url = await page.evaluate(([sec, pos, tgt, fov]) => {
  const f = window.__fire, a = f.app;
  if (pos) { a.camera.position.set(...pos.split(',').map(Number)); a.controls.target.set(...tgt.split(',').map(Number)); a.controls.update(); }
  if (+fov) { a.camera.fov = +fov; a.camera.updateProjectionMatrix(); }
  f.ff(+sec, 1 / 60); f.settle(); return f.shot();
}, [sec, pos, tgt, fov]);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
const bad = errs.filter((e) => /PAGEERROR|ERROR: 0:/.test(e));
console.log(out, bad.slice(0, 3));
await browser.close();
