// Rozložení stránky při různých šířkách okna a zvětšeních (devicePixelRatio ≠ 1): nic nesmí přetéct okno ani růst v čase.
// Chyba z 2026-11-28: plátno časové osy mělo šířku = clientWidth × dpr a jako pružná položka s min-width:auto tím
// samo sebe roztahovalo → při zvětšení stránky se okno donekonečna rozšiřovalo doprava. node tools/test-layout.mjs
import { open } from './harness.mjs';
const CASES = [[1440, 850, 1], [1440, 850, 1.25], [1440, 850, 1.5], [1280, 720, 2], [1000, 700, 1.25], [815, 650, 1.1], [815, 650, 1.5], [640, 600, 1.75], [420, 700, 3]];
let fail = 0;
for (const [w, h, dpr] of CASES) {
  const { browser, page, errs } = await open({ q: 'tier=0&scn=haystack', vp: { width: w, height: h }, dpr });
  const r = await page.evaluate(async () => {
    const f = window.__fire, ui = f.ui, a = f.app, de = document.documentElement, tl = ui.tl, widths = [];
    for (let i = 0; i < 14; i++) { a.resize(); ui.drawTimeline(); widths.push(tl.clientWidth); await new Promise((r) => setTimeout(r, 0)); }
    const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width)]; };
    return { iw: innerWidth, dprPage: devicePixelRatio, widths, scrollW: de.scrollWidth, appW: document.querySelector('#app').scrollWidth, view: box('#view'), right: box('#right'), bottom: box('#bottom'), tlAttr: tl.width, cvAttr: a.canvas.width, cvCss: Math.round(a.canvas.getBoundingClientRect().width), topScroll: document.querySelector('#top').scrollWidth - document.querySelector('#top').clientWidth, rightVisible: getComputedStyle(document.querySelector('#right')).display !== 'none' };
  });
  const grow = r.widths[r.widths.length - 1] - r.widths[0];
  const bad = [];
  if (Math.abs(grow) > 1) bad.push(`časová osa roste ${r.widths[0]} → ${r.widths[r.widths.length - 1]} px`);
  if (r.scrollW > r.iw + 1 || r.appW > r.iw + 1) bad.push(`stránka přetéká okno (${Math.max(r.scrollW, r.appW)} > ${r.iw})`);
  if (r.view[1] > r.iw + 1 || r.view[2] < 150) bad.push(`pohled mimo okno nebo příliš úzký ${r.view}`);
  if (r.rightVisible && r.right[1] > r.iw + 1) bad.push(`pravý panel mimo okno ${r.right}`);
  if (r.bottom[1] > r.iw + 1) bad.push(`spodní lišta mimo okno ${r.bottom}`);
  if (r.tlAttr > 8192) bad.push(`plátno časové osy ${r.tlAttr} px`);
  if (Math.abs(r.cvCss - r.view[2]) > 2) bad.push(`plátno ${r.cvCss} ≠ pohled ${r.view[2]}`);
  const pe = errs.filter((e) => e.startsWith('PAGEERROR'));
  if (pe.length) bad.push(pe[0]);
  if (bad.length) fail++;
  console.log(`${bad.length ? 'ERR' : 'ok '} ${w}×${h} @${dpr}  pohled ${r.view[2]} px, osa ${r.widths[0]}→${r.widths[r.widths.length - 1]} px (plátno ${r.tlAttr}), pravý panel ${r.rightVisible ? r.right[2] + ' px' : 'skrytý'}, lišta přetéká o ${r.topScroll} px ${bad.join(' | ')}`);
  await browser.close();
}
// skutečná smyčka (jako v artefaktu): šířky se během 3 s nesmí pohnout; snímky pro kontrolu okem
for (const [w, h, dpr, shot] of [[1152, 650, 1.25, '/tmp/layout_1152.png'], [1536, 864, 1.25, null], [652, 720, 1.5, '/tmp/layout_652.png']]) {
  const { browser, page, errs } = await open({ q: 'tier=0&scn=haystack', vp: { width: w, height: h }, dpr, loop: true });
  const m = () => page.evaluate(() => ({ tl: window.__fire.ui.tl.clientWidth, view: Math.round(document.querySelector('#view').getBoundingClientRect().width), sw: document.documentElement.scrollWidth, app: document.querySelector('#app').scrollWidth, iw: innerWidth, topH: Math.round(document.querySelector('#top').getBoundingClientRect().height) }));
  await page.waitForTimeout(500); const a = await m(); await page.waitForTimeout(3000); const b = await m();
  const bad = a.tl !== b.tl || a.view !== b.view || b.sw > b.iw + 1 || b.app > b.iw + 1 || errs.some((e) => e.startsWith('PAGEERROR'));
  if (bad) fail++;
  if (shot) await page.screenshot({ path: shot, timeout: 120000 });
  console.log(`${bad ? 'ERR' : 'ok '} smyčka ${w}×${h} @${dpr}  osa ${a.tl}→${b.tl} px, pohled ${a.view}→${b.view} px, stránka ${b.sw}/${b.iw} px, horní lišta ${b.topH} px`);
  await browser.close();
}
// pravý panel: žádný scénář ani záložka nesmí panel roztáhnout do šířky (dlouhé hodnoty se musí zalomit)
for (const [w, h, dpr] of [[1152, 650, 1.25], [820, 700, 1.5], [420, 700, 3]]) {
  const { browser, page } = await open({ q: 'tier=0', vp: { width: w, height: h }, dpr });
  const r = await page.evaluate(() => { const f = window.__fire, ui = f.ui, a = f.app, out = [], pane = document.querySelector('#pane');
    for (const s of f.SCENARIOS) { a.loadScenario(s.id); f.ff(1.2); for (const tab of ['fyzika', 'technika', 'ovládání', 'export']) { ui.tab = tab; ui.renderPane(true); const over = pane.scrollWidth - pane.clientWidth; if (over > 1) out.push(`${s.id}/${tab} +${over} px`); } ui.tab = 'fyzika'; }
    return { out, n: f.SCENARIOS.length, pw: pane.clientWidth }; });
  if (r.out.length) fail++;
  console.log(`${r.out.length ? 'ERR' : 'ok '} pravý panel ${w}×${h} @${dpr}  šířka ${r.pw} px, ${r.n} scénářů × 4 záložky, přetečení ${r.out.length}${r.out.length ? ': ' + r.out.slice(0, 4).join(', ') : ''}`);
  await browser.close();
}
console.log(fail ? `\n${fail} chyb rozložení` : '\nrozložení v pořádku');
process.exit(fail ? 1 : 0);
