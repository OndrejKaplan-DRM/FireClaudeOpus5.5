// Zkušební stránka integrace: skutečné jádro (createEngine) a vykreslení (createRender) xEngine + systém fx.fire.
// Světlo xEngine se tu napodobuje záznamníkem (skutečný systém „light“ potřebuje načtený level se zastíněním);
// záznamník hlídá pravidlo D-022 (na low nejvýš 1 světlo efektu) a počítá volání.
// Build: node tools/build-xengine.mjs (alias three → jedna kopie), test: node tools/test-xengine.mjs
import * as THREE from 'three';
import { createEngine } from 'xengine/src/kernel/engine.js';
import { createRender } from 'xengine/src/render/render.js';
import { createFireSystem } from './fire-system.js';

const q = new URLSearchParams(location.search);
const quality = +(q.get('quality') ?? 1);

const canvas = document.querySelector('canvas');
const E = createEngine({ strictEvents: true });
const render = createRender({ canvas, rows: +(q.get('rows') ?? 576) });

// záznamník systému světla (stejné API jako src/world/lighting.js)
const lightLog = { add: 0, set: 0, move: 0, maxOn: 0, recs: [] };
const light = {
  addLight(def, o) { const L = { ...def, ...o, pos: [...def.pos], level: o.level ?? 1, on: o.on ?? true }; lightLog.recs.push(L); lightLog.add++; count(); return L; },
  setLight() { lightLog.set++; count(); },
  moveLight() { lightLog.move++; count(); },
};
function count() { lightLog.maxOn = Math.max(lightLog.maxOn, lightLog.recs.filter((r) => r.on).length); }

// hra vysílá combat:explode (Aréna A-3) – fx.fire na ni reaguje, když je deklarovaná
const events = [];
E.add({ name: 'combat', phase: 'sim', events: ['combat:explode'] });
const fire = createFireSystem({ render, light, quality, seed: 7 });
E.add(fire);
E.add(render);
for (const ev of ['fire:ignited', 'fire:out', 'fire:exploded']) E.on(ev, (d) => events.push([ev, d]));

// minimální svět: zem (MeshBasic s barvou vrcholů jako statiky xEngine) a zeď
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2a2622 }));
const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.3), new THREE.MeshBasicMaterial({ color: 0x3a3430 }));
wall.position.set(0, 2, -4);
render.scene.add(ground, wall);
render.renderer.toneMappingExposure = +(q.get('exposure') ?? 0.02);

await E.init();
E.setMode('playing');
render.camera.position.set(0, 1.7, 6);
render.camera.lookAt(0, 1.2, 0);

window.__fire = {
  ready: true, E, fire, light: lightLog, events, render,
  /** n sekund hry po snímcích 1/30 s (krok 120 Hz uvnitř) */
  sim(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) E.tick(dt); },
  look(p, t) { render.camera.position.set(...p); render.camera.lookAt(...t); },
  shot() { E.tick(1 / 60); return render.renderer.domElement.toDataURL('image/png'); },
  stats() { const i = render.renderer.info.render; return { calls: i.calls, tris: i.triangles, particles: fire.fx ? fire.fx.bb.n + fire.fx.sp.n : 0, volumes: fire.fx ? fire.fx.vols.filter((v) => v.mesh.visible).length : 0, ...fire.stats }; },
};
