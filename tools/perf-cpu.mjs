// CPU cena simulace (bez kreslení) pro všechny scénáře a stupně. node tools/perf-cpu.mjs → dataset/physics/perf_cpu.json
import { open, ROOT } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const out = {};
for (const tier of [0, 1, 2, 3]) {
  const { browser, page } = await open({ q: `tier=${tier}&ui=0`, vp: { width: 640, height: 360 } });
  out['T' + tier] = await page.evaluate(() => {
    const f = window.__fire, a = f.app, res = {};
    const seek = { haystack: 300, tires: 200, car: 700, forest: 1500, brush: 400, house: 700, diesel: 20, barrel: 6, tnt: 1.9, grenade: 1.4, acetylene: 1.4 };
    for (const s of f.SCENARIOS) {
      a.loadScenario(s.id); if (seek[s.id]) { a.t = seek[s.id]; a.fx.scnTime = a.t; }
      f.ff(2.5);
      const t0 = performance.now(); const N = 60; for (let i = 0; i < N; i++) a.step(1 / 60);
      const ms = (performance.now() - t0) / N, st = a.stats();
      res[s.id] = { msPerFrame: +ms.toFixed(3), particles: st.flameSmoke + st.sparks + st.haze, volumes: st.volumes, lights: st.lights, sceneTris: st.sceneTris };
    }
    return res;
  });
  await browser.close();
  console.log('T' + tier, JSON.stringify(Object.fromEntries(Object.entries(out['T' + tier]).map(([k, v]) => [k, v.msPerFrame]))));
}
fs.writeFileSync(path.join(ROOT, 'dataset/physics/perf_cpu.json'), JSON.stringify({ note: 'CPU čas kroku simulace (bez kreslení) v headless Chrome na 2 jádrech sandboxu; GPU čas nevypovídá (swiftshader).', ...out }, null, 1));
