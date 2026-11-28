// Smoke test všech scénářů: načtení, simulace, snímek, chyby konzole, rozpočty. node tools/test.mjs [tier] [outdir] [sekund]
// Výstup: <outdir>/<scn>.png, <outdir>/sheet.png (mřížka), report.json. Selže při PAGEERROR nebo NaN ve statistikách.
import { open, ROOT } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const tier = process.argv[2] ?? '0';
const out = process.argv[3] ?? path.join('/tmp', 'firetest_T' + tier);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const { browser, page, errs } = await open({ q: `tier=${tier}&ui=0`, vp: { width: 640, height: 360 } });
console.log(`načteno ${(Date.now() - t0) / 1000}s`);
const ids = await page.evaluate(() => window.__fire.SCENARIOS.map((s) => [s.id, s.duration || 0, s.timeScale || 1]));
const report = [];
let fail = 0;
for (const [id, dur] of ids) {
  if (only && !only.includes(id)) continue;
  const e0 = errs.length, ts = Date.now();
  // explozím dát čas po spuštění, dlouhým scénářům posunout čas
  const sec = { barrel: 7.2, acetylene: 1.7, grenade: 1.62, tnt: 2.6, forest: 4, brush: 4, lighter: 2.6, blastLab: 2.2, chain: 40, leak: 30, dieselBarrel: 20, acetyleneCyl: +(process.env.CYL_SEC ?? 21),
    pistol: 1.22, machineGun: 1.7, cannon: 2.05, chainBlast: 2.1, molotov: 3.0, flamethrower: 3.2, jetFire: 3, trail: 6, extinguish: 14, aftermath: 45, flashover: 36, dust: 3.35, fireworks: 6.6, thermite: 8, whirl: 8 }[id] ?? 3;
  const seek = { haystack: 300, tires: 200, car: 700, forest: 1800, brush: 500, house: 700, diesel: 20 }[id] ?? 0;
  const res = await page.evaluate(([id, sec, seek]) => { try {
    const f = window.__fire, a = f.app;
    a.loadScenario(id);
    if (seek) { a.t = seek; a.fx.scnTime = seek; }
    const t = performance.now();
    if (id === 'acetyleneCyl') { for (let i = 0; i < 60 && !/roztr/.test(a.run.info()[0][1]); i++) f.ff(1, 1 / 30); f.ff(0.45); } // do roztržení lahve + 0,45 s
    else f.ff(sec);
    const simMs = performance.now() - t;
    f.settle();
    const url = f.shot();
    const st = a.stats();
    return { simMs, st, url, info: (a.run?.info?.() || []).slice(0, 6).map((r) => r[0] + ': ' + r[1]) };
  } catch (e) { return { simMs: 0, st: { exposure: 0, calls: 0, gpuTris: 0, flameSmoke: 0, sparks: 0, volumes: 0, err: 'EXC ' + e.message + ' ' + (e.stack || '').split('\n')[1] }, url: window.__fire.shot(), info: [] }; } }, [id, sec, seek]);
  if (res.st.err) errs.push('PAGEERROR ' + res.st.err);
  const file = path.join(out, id + '.png');
  fs.writeFileSync(file, Buffer.from(res.url.split(',')[1], 'base64'));
  const newErr = errs.slice(e0).filter((e) => !/GPU stall|GL_CLOSE_PATH/.test(e));
  const bad = newErr.some((e) => e.startsWith('PAGEERROR')) || Object.values(res.st).some((v) => typeof v === 'number' && Number.isNaN(v));
  if (bad) fail++;
  report.push({ id, ok: !bad, ms: Date.now() - ts, simMs: Math.round(res.simMs), calls: res.st.calls, tris: res.st.gpuTris, particles: res.st.flameSmoke + res.st.sparks, volumes: res.st.volumes, exposure: res.st.exposure, errs: newErr.slice(0, 5), info: res.info });
  console.log(`${bad ? 'ERR' : 'ok '} ${id.padEnd(10)} ${String(Date.now() - ts).padStart(6)} ms  calls ${res.st.calls}  △ ${res.st.gpuTris}  částic ${res.st.flameSmoke + res.st.sparks}  obj ${res.st.volumes}  exp ${res.st.exposure.toExponential(1)} ${newErr.length ? newErr.slice(0, 2).join(' | ') : ''}`);
}
await browser.close();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
// mřížka
try {
  const { execSync } = await import('node:child_process');
  execSync(`python3 -c "
from PIL import Image, ImageDraw
import json,os
r=json.load(open('${out}/report.json'))
W,H=320,180; cols=4; rows=(len(r)+cols-1)//cols
s=Image.new('RGB',(W*cols,H*rows),(20,20,20)); d=ImageDraw.Draw(s)
for i,e in enumerate(r):
  im=Image.open(os.path.join('${out}',e['id']+'.png')).resize((W,H)); x,y=(i%cols)*W,(i//cols)*H; s.paste(im,(x,y)); d.text((x+4,y+4),e['id'],fill=(255,200,80))
s.save('${out}/sheet.png')"`);
} catch (e) { console.log('mřížka:', e.message); }
console.log(fail ? `\n${fail} SCÉNÁŘŮ S CHYBOU` : '\nvše bez chyb stránky');
process.exit(fail ? 1 : 0);
