// Počet volání kreslení a trojúhelníků jednoho snímku: node tools/tri.mjs <scn> <tier> <seek s> <sim s>
import { open } from './harness.mjs';
const [scn, tier, seek, sec] = process.argv.slice(2);
const { browser, page } = await open({ q: `scn=${scn}&tier=${tier}&ui=0`, vp: { width: 640, height: 360 } });
const r = await page.evaluate(([seek, sec]) => { const f = window.__fire, a = f.app; a.t = +seek; a.fx.scnTime = +seek; f.ff(+sec); f.settle(); f.shot(); const s = a.stats(); return { calls: s.calls, tris: s.gpuTris, lights: s.lights }; }, [seek, sec]);
console.log(scn, tier, JSON.stringify(r)); await browser.close();
