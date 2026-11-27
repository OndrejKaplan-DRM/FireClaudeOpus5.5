// Integrační test bez prohlížeče: jádro xEngine (createEngine z klonu) + fx.fire v režimu headless (jako test:a v Node
// s createNullRender). Ověřuje simulaci pro hru: heatFlux, události, výbuch z combat:exploded, snapshot/restore,
// determinismus (dva běhy stejné). node tools/test-xengine-node.mjs [cesta k xEngine]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const xe = process.argv[2] || process.env.XENGINE || '/home/claude/ondrejkaplan-drm/xengine';
const { createEngine } = await import(pathToFileURL(path.join(xe, 'src/kernel/engine.js')).href);
const { createFireSystem } = await import('../integrations/xengine/fire-system.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'CHYBA ') + m); if (!c) fail++; };

async function run() {
  const E = createEngine();
  const events = [];
  E.add({ name: 'combat', phase: 'sim', events: ['combat:exploded'] });
  const fire = createFireSystem({ render: { headless: true, name: 'render' }, quality: 1 });
  E.add(fire);
  for (const ev of ['fire:ignited', 'fire:out', 'fire:exploded']) E.on(ev, (d) => events.push(ev));
  await E.init(); E.setMode('playing');
  const id = fire.ignite('campfire', [0, 0, 0]);
  E.sim(10);
  const q2 = fire.heatFlux(0, 1, 2), q5 = fire.heatFlux(0, 1, 5);
  E.emit('combat:exploded', { pos: [4, 0, 0], radius: 5, damage: 60, push: 8, weapon: 'barrel' });
  E.sim(2);
  const qBarrel = fire.heatFlux(4, 1, 3);
  const snap = JSON.parse(JSON.stringify(E.snapshot()));
  E.sim(5); const qLater = fire.heatFlux(0, 1, 2);
  E.restore(snap); E.sim(5); const qLater2 = fire.heatFlux(0, 1, 2);
  fire.extinguish(id);
  return { q2, q5, qBarrel, qLater, qLater2, events, burning: fire.burning(id), headless: fire.headless, nSnap: snap.systems['fx.fire'].fires.length };
}
const a = await run(), b = await run();
ok(a.headless, 'headless režim (bez plátna, jen simulace)');
ok(a.q2 > 300 && a.q2 < 5000 && a.q5 < a.q2 / 3, `sálavý tok táboráku 2 m: ${a.q2.toFixed(0)} W/m², 5 m: ${a.q5.toFixed(0)} W/m² (~1/R²)`);
ok(a.qBarrel > a.q2, `hořící louže po výbuchu sudu zvýší tok (${a.qBarrel.toFixed(0)} W/m²)`);
ok(a.events.join() === 'fire:ignited,fire:exploded,fire:ignited,fire:out', 'události: ' + a.events.join(', '));
ok(a.nSnap === 2 && Math.abs(a.qLater - a.qLater2) < 1e-9, `uložení a nahrání: ${a.nSnap} ohně, tok po 5 s ${a.qLater.toFixed(1)} = ${a.qLater2.toFixed(1)}`);
ok(JSON.stringify(a) === JSON.stringify(b), 'dva běhy dají stejná čísla (pevný krok, bez Math.random)');
ok(!a.burning, 'uhašený oheň nehoří');
console.log(fail ? `\n${fail} chyb` : '\nheadless integrace v pořádku');
process.exit(fail ? 1 : 0);
