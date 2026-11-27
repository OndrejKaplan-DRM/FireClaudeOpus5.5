// Vstup prohlížeče FireLab.
import { App } from './engine/app.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { texSet } from './assets/textures.js';
import { tris } from './assets/geo.js';
import { atlasToCanvas, atlasPreviewCanvas } from './fx/bake.js';
import { FUELS, EXPLOSIVES } from './physics/fuels.js';
import { WIND_CLASSES } from './physics/wind.js';
import { TIERS } from './engine/tiers.js';
import { UI } from './ui/ui.js';
import { SCENARIOS } from './scenarios/index.js';
import { ASSETS } from './assets/index.js';

const q = Object.fromEntries(new URLSearchParams(location.search));
const canvas = document.querySelector('#view canvas');
const app = new App(canvas, q);
if (q.wind) app.setWind(+q.wind);
if (q.o2) app.setO2(+q.o2);
if (q.time) app.timeOverride = q.time;
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
  app, ui, SCENARIOS, ASSETS,
  ff(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) app.step(dt); },
  renderOnce() { app.updateExposure(); app.renderFrame(1 / 30); },
  settle(n = 30) { for (let i = 0; i < n; i++) { app.updateExposure(); app.pipeline.exposure = app.pipeline.targetExposure; } app.updateExposure(); app.step(1 / 240); },
  shot() { app.updateExposure(); app.renderFrame(1 / 30); return app.renderer.domElement.toDataURL('image/png'); },
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
