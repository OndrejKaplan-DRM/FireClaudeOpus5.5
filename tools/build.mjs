// Build: esbuild → jeden soubor dist/index.html (vše vložené, bez CDN).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const watch = process.argv.includes('--watch');

function html(js, css) {
  return `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FireLab — ohňové assety a efekty</title>
<style>${css}</style></head>
<body>
<div id="loader"><div style="font-size:18px">FireLab</div><div class="lbl">generuji šum, textury, flipbooky a modely…</div></div>
<div id="app">
  <div id="top"></div>
  <div id="left"></div>
  <div id="view"><canvas></canvas><div id="hud"></div><div id="cams"></div><div id="desc"></div><div id="toast"></div><div id="atlasWrap"></div></div>
  <div id="right"><div id="tabs"></div><div id="pane"></div></div>
  <div id="corner"></div>
  <div id="bottom"><canvas id="tl"></canvas><div id="tc" class="tc"></div></div>
  <div id="corner2"></div>
</div>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>
</body></html>`;
}

async function once() {
  const t0 = Date.now();
  const r = await esbuild.build({
    entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020',
    legalComments: 'none', logLevel: 'warning',
  });
  const js = r.outputFiles[0].text;
  const css = fs.readFileSync(path.join(root, 'src/ui/style.css'), 'utf8');
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const out = html(js, css);
  fs.writeFileSync(path.join(root, 'dist/index.html'), out);
  console.log(`dist/index.html  ${(out.length / 1024).toFixed(0)} kB  (${Date.now() - t0} ms)`);
  // knihovna pro jiné projekty: ESM, three externí
  await esbuild.build({ entryPoints: [path.join(root, 'src/index.js')], bundle: true, format: 'esm', outfile: path.join(root, 'dist/firelab.module.js'), external: ['three', 'three/*'], target: 'es2020', logLevel: 'warning', legalComments: 'none' });
}

await once();
if (watch) {
  const { createServer } = await import('node:http');
  createServer((req, res) => { const p = path.join(root, 'dist', req.url === '/' ? 'index.html' : req.url.split('?')[0]); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200); res.end(d); } }); }).listen(8765);
  console.log('http://127.0.0.1:8765');
  let tm = null;
  fs.watch(path.join(root, 'src'), { recursive: true }, () => { clearTimeout(tm); tm = setTimeout(() => once().catch((e) => console.error(e.message)), 150); });
}
