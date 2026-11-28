// Spuštění bez WebGL a ztráta kontextu za běhu: stránka nesmí viset na úvodní obrazovce, musí říct, co se stalo a co dělat.
// Chyba z 2026-11-28: prohlížeč nevydal kontext („Error creating WebGL context“) a FireLab mlčky zůstal na „generuji…“. D-048.
import { createRequire } from 'node:module';
import path from 'node:path';
import { open, ROOT } from './harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'));
let fail = 0;
{ // 1) WebGL úplně vypnuté
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--disable-3d-apis'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto('file://' + path.join(ROOT, 'dist/index.html'), { timeout: 60000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const l = document.getElementById('loader'); return { fatal: l.classList.contains('fatal'), text: l.innerText.slice(0, 400), btn: !!l.querySelector('button'), over: document.documentElement.scrollWidth > innerWidth + 1 }; });
  const ok = r.fatal && /WebGL/.test(r.text) && /chrome:\/\/gpu/.test(r.text) && r.btn && !r.over;
  if (!ok) fail++;
  console.log(`${ok ? 'ok ' : 'ERR'} bez WebGL: hlášení ${r.fatal ? 'zobrazeno' : 'CHYBÍ'}, tlačítko ${r.btn ? 'ano' : 'ne'} — „${r.text.split('\n')[0]}“`);
  await page.screenshot({ path: '/tmp/nogl.png' });
  await browser.close();
}
{ // 2) ztráta kontextu za běhu (rozšíření WEBGL_lose_context)
  const { browser, page } = await open({ q: 'tier=0&scn=campfire', vp: { width: 1100, height: 700 }, loop: true });
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__noReload = true; const gl = window.__fire.app.renderer.getContext(); window.__ext = gl.getExtension('WEBGL_lose_context'); window.__ext.loseContext(); });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const l = document.getElementById('loader'); return { fatal: l.classList.contains('fatal'), text: l.innerText.slice(0, 200), lost: window.__fire.app.contextLost, paused: window.__fire.app.paused }; });
  const ok = r.fatal && r.lost && /ztracen/.test(r.text);
  if (!ok) fail++;
  console.log(`${ok ? 'ok ' : 'ERR'} ztráta kontextu za běhu: hlášení ${r.fatal ? 'zobrazeno' : 'CHYBÍ'}, kreslení ${r.lost ? 'zastaveno' : 'BĚŽÍ'} — „${r.text.split('\n')[0]}“`);
  // 3) obnovení kontextu → stránka se sama načte znovu a běží
  await Promise.all([page.waitForNavigation({ timeout: 120000 }).catch(() => null), page.evaluate(() => window.__ext.restoreContext())]);
  await page.waitForFunction(() => window.__fire && window.__fire.ready, null, { timeout: 180000 }).catch(() => null);
  const back = await page.evaluate(() => !!(window.__fire && window.__fire.ready) && !document.getElementById('loader').classList.contains('fatal'));
  if (!back) fail++;
  console.log(`${back ? 'ok ' : 'ERR'} po obnovení kontextu: stránka ${back ? 'běží znovu' : 'NEBĚŽÍ'}`);
  await browser.close();
}
console.log(fail ? `\n${fail} chyb` : '\nspuštění bez grafiky a ztráta kontextu ošetřeny');
process.exit(fail ? 1 : 0);
