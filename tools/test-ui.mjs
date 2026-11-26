// Interakce UI: záložky, atlas, assety, přepnutí stupně, skok na časové ose, klávesy. node tools/test-ui.mjs
import { open } from './harness.mjs';
const { browser, page, errs } = await open({ q: 'tier=0&scn=car', vp: { width: 1440, height: 850 } });
const click = async (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) throw new Error('chybí ' + sel); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); if (!e.contains(top) && top !== e) throw new Error('překryto: ' + sel + ' → ' + (top?.className || top?.tagName)); e.click(); window.__fire.ui.tick(); return true; }, sel);
const steps = [
  ['záložka technika', () => click('#tabs button[data-t="technika"]')],
  ['záložka ovládání', () => click('#tabs button[data-t="ovládání"]')],
  ['záložka export', () => click('#tabs button[data-t="export"]')],
  ['záložka fyzika', () => click('#tabs button[data-t="fyzika"]')],
  ['atlas otevřít', () => click('#top button[title="Flipbook atlas"]')],
  ['atlas zavřít', () => page.evaluate(() => { window.__fire.ui.showAtlas(); return !document.querySelector('#atlasWrap').classList.contains('show'); })],
  ['asset dům', () => click('#left .it[data-a="house"]')],
  ['scénář TNT', () => click('#left .it[data-s="tnt"]')],
  ['vítr vichr', () => click('#top .seg:nth-of-type(2) button:nth-child(4)')],
  ['stupeň T1', () => page.evaluate(() => { window.__fire.app.setTier(1); window.__fire.ui.refresh(); return window.__fire.app.tierId === 1; })],
  ['skok časové osy', () => page.evaluate(() => { const ui = window.__fire.ui, a = window.__fire.app; a.loadScenario('house'); const r = ui.tl.getBoundingClientRect(); ui.seek({ clientX: r.left + r.width * 0.5 }); return a.t > 1000; })],
  ['klávesa R', () => page.keyboard.press('r').then(() => true)],
  ['kamera přepnout', () => click('#cams .btn:nth-child(2)')],
  ['render', () => page.evaluate(() => { window.__fire.renderOnce(); return true; })],
];
let fail = 0;
for (const [n, f] of steps) {
  try { const r = await f(); console.log(r === false ? 'ERR' : 'ok ', n); if (r === false) fail++; } catch (e) { fail++; console.log('ERR', n, e.message.split('\n')[0]); }
}
const pe = errs.filter((e) => e.startsWith('PAGEERROR'));
console.log(pe.length ? pe : 'bez chyb stránky');
await browser.close();
process.exit(fail || pe.length ? 1 : 0);
