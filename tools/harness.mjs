// Headless prohlížeč pro testy a bake (Chrome + softwarové WebGL). Řídí simulaci přes window.__fire, ne snímky.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const gm = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(gm, 'playwright'));

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export async function open({ q = '', vp = { width: 1280, height: 720 }, html = path.join(ROOT, 'dist/index.html'), dpr = 1, loop = false } = {}) {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dpr }); // dpr ≠ 1 = zvětšení stránky nebo měřítko systému
  const errs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto('file://' + html + (loop ? '?' : '?noloop=1&') + q, { timeout: 180000 }); // loop: skutečná smyčka rAF jako u uživatele
  await page.waitForFunction(() => window.__fire && window.__fire.ready, null, { timeout: 180000 });
  return { browser, page, errs };
}

export async function shot(page, file) {
  const url = await page.evaluate(() => window.__fire.shot());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  return file;
}
