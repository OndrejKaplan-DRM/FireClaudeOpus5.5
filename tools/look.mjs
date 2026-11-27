// Ladicí snímek s úpravou stavu: node tools/look.mjs <scn> <tier> <s> "x,y,z" "tx,ty,tz" out.png "<js po načtení>" [w] [h] [query]
// js dostane proměnné f (__fire), a (app); vrácený objekt se vypíše.
import { open } from './harness.mjs';
import fs from 'node:fs';
const [scn, tier = '2', sec = '3', pos, tgt, out = '/tmp/look.png', js = '', w = '960', h = '540', extra = ''] = process.argv.slice(2);
const { browser, page, errs } = await open({ q: `scn=${scn}&tier=${tier}&ui=0&${extra}`, vp: { width: +w, height: +h } });
const res = await page.evaluate(([sec, pos, tgt, js]) => {
  const f = window.__fire, a = f.app;
  if (pos) { a.camera.position.set(...pos.split(',').map(Number)); a.controls.target.set(...tgt.split(',').map(Number)); a.controls.update(); }
  const pre = js ? new Function('f', 'a', 'phase', js) : null;
  pre?.(f, a, 'pre');
  f.ff(+sec, 1 / 60); f.settle();
  const info = pre?.(f, a, 'post');
  return { url: f.shot(), info };
}, [sec, pos, tgt, js]);
fs.writeFileSync(out, Buffer.from(res.url.split(',')[1], 'base64'));
console.log(out, JSON.stringify(res.info ?? null).slice(0, 1500), errs.filter((e) => /PAGEERROR|ERROR: 0:/.test(e)).slice(0, 3));
await browser.close();
