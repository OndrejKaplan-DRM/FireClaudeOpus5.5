// Build zkušební stránky integrace s xEngine: node tools/build-xengine.mjs [cesta k xEngine] [výstup.html]
// three se bere jen z FireLab (jedna kopie pro obě knihovny), xEngine z místního klonu (jen čtení).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const xe = process.argv[2] || process.env.XENGINE || '/home/claude/ondrejkaplan-drm/xengine';
const out = process.argv[3] || '/tmp/xfire/index.html';
const r = await esbuild.build({
  entryPoints: [path.join(root, 'integrations/xengine/demo.js')], bundle: true, format: 'esm', write: false, minify: true, target: 'es2022',
  alias: { three: path.join(root, 'node_modules/three/build/three.module.js'), xengine: xe },
  logLevel: 'warning',
});
const js = r.outputFiles[0].text;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>FireLab × xEngine</title>
<style>html,body{margin:0;height:100%;background:#000}canvas{width:100%;height:100%;display:block}</style></head>
<body><canvas></canvas><script type="module">${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`);
console.log(out, (js.length / 1024).toFixed(0) + ' kB');
