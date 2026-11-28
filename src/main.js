// Vstup prohlížeče FireLab.
import { App } from './engine/app.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { texSet } from './assets/textures.js';
import { tris } from './assets/geo.js';
import { atlasToCanvas, atlasPreviewCanvas } from './fx/bake.js';
import { FUELS, EXPLOSIVES } from './physics/fuels.js';
import { WIND_CLASSES } from './physics/wind.js';
import { TIERS } from './engine/tiers.js';
import * as AUDIO from './audio/fireAudio.js';
import { UI } from './ui/ui.js';
import { SCENARIOS } from './scenarios/index.js';
import { ASSETS } from './assets/index.js';

const q = Object.fromEntries(new URLSearchParams(location.search));
const canvas = document.querySelector('#view canvas');
/** Srozumitelné hlášení místo nekonečného načítání, když prohlížeč nevydá grafický kontext nebo ho za běhu ztratí. */
function fatal(kind, e) {
  const probe = (name) => { try { return !!document.createElement('canvas').getContext(name); } catch { return false; } };
  const gl2 = probe('webgl2'), gl1 = probe('webgl'), l = document.getElementById('loader');
  const head = kind === 'lost' ? 'Grafický kontext byl ztracen' : 'FireLab se nespustil: prohlížeč nevydal grafický kontext (WebGL 2)';
  const why = kind === 'lost' ? 'Ovladač grafiky nebo prohlížeč kontext zrušil (nedostatek paměti grafiky, uspání, pád ovladače). Zkouším ho obnovit; když se to do pár sekund nepovede, načti stránku znovu.'
    : gl2 ? 'Zkušební kontext teď vytvořit jde – nejspíš šlo o přechodný stav. Zkus stránku načíst znovu.'
      : 'Prohlížeč WebGL pro tuto stránku právě odmítá. Nejčastěji ho zablokoval po opakované ztrátě kontextu, je otevřeno příliš mnoho karet s 3D obsahem, nebo je vypnutá hardwarová akcelerace.';
  l.classList.remove('gone'); l.classList.add('fatal');
  l.innerHTML = `<div class="box"><h3>${head}</h3><p>${why}</p><ol><li>Zavři ostatní karty s FireLabem a jiným 3D obsahem.</li><li>Úplně ukonči prohlížeč (všechna okna) a spusť ho znovu.</li>`
    + `<li>V Chrome otevři <code>chrome://gpu</code>: řádek „WebGL“ má být „Hardware accelerated“. Nastavení → Systém → „Používat grafickou akceleraci“.</li><li>Zkus jiný prohlížeč (Edge, Firefox).</li></ol>`
    + `<button onclick="location.reload()">Načíst znovu</button><pre>WebGL 2: ${gl2 ? 'ano' : 'NE'} · WebGL 1: ${gl1 ? 'ano' : 'NE'} · ${String(e?.cause?.message || e?.message || e || '').slice(0, 160)}\n${navigator.userAgent.slice(0, 180)}</pre></div>`;
}
window.__fireFatal = fatal;
let app;
try { app = new App(canvas, q); } catch (e) { fatal('start', e); throw e; }
// ztráta kontextu za běhu: zastavit kreslení, říct to, po obnovení načíst stránku znovu (všechny prostředky GPU jsou pryč)
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); app.paused = true; app.contextLost = true; fatal('lost'); });
canvas.addEventListener('webglcontextrestored', () => { location.reload(); });
if (q.wind) app.setWind(+q.wind);
if (q.o2) app.setO2(+q.o2);
if (q.time) app.timeOverride = q.time;
for (const [k, v] of Object.entries(q)) if (k.startsWith('c.')) app.controlsVals[k.slice(2)] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(+v) ? v : +v; // hodnoty ovladačů scénáře z odkazu
if (q.heat === '1') app.fx.heatOn = true;
if (q.asset) app.loadAsset(q.asset); else app.loadScenario(q.scn || 'campfire');
const ui = q.ui === '0' ? null : new UI(app);
if (q.ui === '0') document.body.classList.add('noui');
app.resize();
if (q.t) { const t = +q.t; app.t = t; app.fx.scnTime = t; }
if (q.noloop !== '1') app.loop();
ui?.refresh();
document.getElementById('loader').classList.add('gone');

// testovací a integrační API
window.__fire = {
  app, ui, SCENARIOS, ASSETS, AUDIO,
  ff(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) app.step(dt); },
  renderOnce() { app.updateExposure(); app.renderFrame(1 / 30); },
  settle(n = 30) { for (let i = 0; i < n; i++) { app.updateExposure(); app.pipeline.exposure = app.pipeline.targetExposure; } app.updateExposure(); app.step(1 / 240); },
  // s časovou akumulací objemů (T3+) víc kreslení stejného okamžiku (mění se jen chvění paprsku) → snímek bez zrna
  shot(n = app.pipeline.vol ? 10 : 1) { app.updateExposure(); for (let i = 0; i < n; i++) app.renderFrame(i === n - 1 ? 1 / 30 : 0); return app.renderer.domElement.toDataURL('image/png'); },
  /** GLB modelu jako base64 (pro bake datasetu) */
  glb(id, lod) {
    const a = ASSETS.find((x) => x.id === id), obj = a.build({ lod, seed: 1 });
    return new Promise((res, rej) => new GLTFExporter().parse(obj, (b) => {
      const u8 = new Uint8Array(b); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
      res({ b64: btoa(s), tris: tris(obj) });
    }, rej, { binary: true }));
  },
  trisOf(id, lod) { const a = ASSETS.find((x) => x.id === id); return tris(a.build({ lod, seed: 1 })); },
  textures() { const out = {}; for (const n of ['bark', 'woodEnd', 'woodPlank', 'rubber', 'metalRed', 'metalBlue', 'metalOlive', 'carPaint', 'steel', 'straw', 'plaster', 'brick', 'roof', 'needles', 'leaves', 'stone', 'tnt', 'acetylene']) { const t = texSet(n); out[n] = t.map.userData.canvas?.toDataURL('image/png'); if (t.normalMap) out[n + '_normal'] = t.normalMap.userData.canvas?.toDataURL('image/png'); } return out; },
  atlas() { const raw = atlasToCanvas(app.renderer, app.fx.atlasRT); return { raw: raw.toDataURL('image/png'), preview: atlasPreviewCanvas(raw).toDataURL('image/png'), meta: app.fx.atlasRT.texture.userData }; },
  db() { return { FUELS, EXPLOSIVES, WIND_CLASSES, TIERS }; },
  ready: true,
};
