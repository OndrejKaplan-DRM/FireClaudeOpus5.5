// Vstup prohlížeče FireLab.
import { App } from './engine/app.js';
import { UI } from './ui/ui.js';
import { SCENARIOS } from './scenarios/index.js';

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
  app, ui, SCENARIOS,
  ff(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) app.step(dt); },
  renderOnce() { app.updateExposure(); app.renderFrame(1 / 30); },
  settle(n = 30) { for (let i = 0; i < n; i++) { app.updateExposure(); app.pipeline.exposure = app.pipeline.targetExposure; } },
  shot() { app.updateExposure(); app.renderFrame(1 / 30); return app.renderer.domElement.toDataURL('image/png'); },
  ready: true,
};
