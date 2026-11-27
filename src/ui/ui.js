// Prohlížeč FireLab: seznamy scénářů a assetů, panel fyziky, techniky, ovládání a exportu, časová osa, galerie flipbooku.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { TIERS } from '../engine/tiers.js';
import { WIND_CLASSES } from '../physics/wind.js';
import { SCENARIOS } from '../scenarios/index.js';
import { ASSETS, assetById } from '../assets/index.js';
import { LOD_NAMES, tris } from '../assets/geo.js';
import { atlasToCanvas, atlasPreviewCanvas } from '../fx/bake.js';
import { FUELS } from '../physics/fuels.js';
import { fmtW } from '../scenarios/index.js';

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const $ = (s) => document.querySelector(s);
const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d));
const SANDBOX = (() => { try { return window.top !== window; } catch { return true; } })();
function dataURLtoBlob(u) { const [h, b] = u.split(','); const bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: h.slice(5).split(';')[0] }); }
// minimální ZIP (metoda „store“) – GLB není na seznamu povolených přípon náhledu claude.ai, ZIP ano
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
async function zipStore(name, blob) {
  const data = new Uint8Array(await blob.arrayBuffer()), fn = new TextEncoder().encode(name);
  let crc = 0xffffffff; for (let i = 0; i < data.length; i++) crc = CRC[(crc ^ data[i]) & 255] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0;
  const lh = new DataView(new ArrayBuffer(30)); [[0, 0x04034b50, 4], [4, 20, 2], [8, 0, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, fn.length, 2]].forEach(([o, v, n]) => (n === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true)));
  const ch = new DataView(new ArrayBuffer(46)); [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, fn.length, 2]].forEach(([o, v, n]) => (n === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true)));
  const end = new DataView(new ArrayBuffer(22)); [[0, 0x06054b50, 4], [8, 1, 2], [10, 1, 2], [12, 46 + fn.length, 4], [16, 30 + fn.length + data.length, 4]].forEach(([o, v, n]) => (n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
  return new Blob([lh, fn, data, ch, fn, end], { type: 'application/zip' });
}
async function download(name, data) {
  let blob = data instanceof Blob ? data : dataURLtoBlob(data);
  if (SANDBOX) {
    const dl = window.claude?.use ? await window.claude.use('downloads') : null;
    if (!dl) { window.__fireUI?.toast('Ukládání souborů tu není dostupné – použij dist/index.html z repozitáře.'); return; }
    if (name.endsWith('.glb')) { blob = await zipStore(name, blob); name = name.replace(/\.glb$/, '.zip'); }
    try { await dl.save({ filename: name, data: blob }); } catch (e) { if (e?.code !== 'declined') window.__fireUI?.toast('Uložení se nepovedlo: ' + (e?.code || e?.message)); }
    return;
  }
  const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(blob);
  document.body.append(a); a.click(); a.remove();
}

export class UI {
  constructor(app) {
    this.app = app; this.tab = 'fyzika'; this.hist = []; window.__fireUI = this;
    this.build();
    app.onMessage = (m) => this.toast(m);
    app.onScenario = () => this.refresh();
    setInterval(() => this.tick(), 250);
    addEventListener('keydown', (e) => this.key(e));
  }

  build() {
    const a = this.app;
    $('#top').append(
      h('div', { class: 'logo' }, h('i'), 'FireLab', h('span', { class: 'lbl' }, ' · ohňové assety a efekty')),
      h('span', { class: 'lbl' }, 'Kvalita'),
      this.tierSeg = h('div', { class: 'seg' }, ...TIERS.map((t) => h('button', { title: t.name + ' — ' + t.hw, onclick: () => { a.setTier(t.id); this.refresh(); } }, 'T' + t.id + (t.id === a.autoTier ? '*' : '')))),
      h('span', { class: 'lbl' }, 'Vítr'),
      this.windSeg = h('div', { class: 'seg' }, ...WIND_CLASSES.map((w) => h('button', { title: `${w.name}: ${w.U10} m/s v 10 m (Bft ${w.bft})`, onclick: () => { a.setWind(w.id); this.refresh(); } }, w.name))),
      h('span', { class: 'lbl' }, 'Doba'),
      this.timeSeg = h('div', { class: 'seg' }, ...['noc', 'soumrak', 'den'].map((n) => h('button', { onclick: () => { a.timeOverride = n; a.env.setTime(n); this.refresh(); } }, n))),
      h('div', { class: 'sp' }),
      this.playBtn = h('button', { class: 'btn', onclick: () => { a.paused = !a.paused; this.refresh(); }, title: 'Mezerník' }, '⏸'),
      h('button', { class: 'btn', onclick: () => { a.paused = true; a.step(1 / 30); }, title: 'Krok 1/30 s' }, '⏭'),
      this.speedSel = h('select', { onchange: (e) => { a.timeScale = +e.target.value; }, title: 'Rychlost scénáře (efekty běží v reálném čase)' }, ...[0.1, 0.25, 0.5, 1, 2, 4, 10, 20, 50].map((v) => h('option', { value: v }, '×' + v))),
      h('button', { class: 'btn', onclick: () => this.restart(), title: 'R' }, '⟲'),
      this.sndBtn = h('button', { class: 'btn', onclick: () => { if (a.audio.on) a.audio.disable(); else a.audio.enable(); this.sndBtn.textContent = a.audio.on ? '🔊' : '🔇'; }, title: 'Zvuk ohně a výbuchů (procedurální, rána se zpožděním 343 m/s)' }, '🔇'),
      h('button', { class: 'btn', onclick: () => this.shot(), title: 'Snímek PNG' }, '📷'),
      h('button', { class: 'btn', onclick: () => this.showAtlas(), title: 'Flipbook atlas' }, 'Atlas'),
      h('button', { class: 'btn', onclick: () => document.body.classList.toggle('noui'), title: 'H – skrýt rozhraní' }, '⛶'),
    );
    // levý panel
    const left = $('#left');
    const groups = [...new Set(SCENARIOS.map((s) => s.group))];
    for (const g of groups) {
      left.append(h('h4', {}, g));
      for (const s of SCENARIOS.filter((x) => x.group === g)) left.append(h('button', { class: 'it', 'data-s': s.id, onclick: () => { a.loadScenario(s.id); } }, s.name));
    }
    left.append(h('h4', {}, 'Assety (modely)'));
    for (const as of ASSETS) left.append(h('button', { class: 'it', 'data-a': as.id, onclick: () => { a.loadAsset(as.id); } }, as.name, h('small', {}, as.cat)));
    // pravý panel
    $('#tabs').append(...['fyzika', 'technika', 'ovládání', 'export'].map((t) => h('button', { 'data-t': t, onclick: () => { this.tab = t; this.renderPane(true); } }, t[0].toUpperCase() + t.slice(1))));
    // časová osa
    this.tl = $('#tl'); this.tc = $('#tc');
    this.tl.addEventListener('click', (e) => this.seek(e));
    $('#cams');
  }

  key(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const a = this.app;
    if (e.code === 'Space') { a.paused = !a.paused; e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') this.restart();
    else if (e.key >= '1' && e.key <= '4') a.setWind(+e.key - 1);
    else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('noui');
    else if (e.key === 't' || e.key === 'T') a.setTier((a.tierId + 1) % TIERS.length);
    else if (e.key === 'c' || e.key === 'C') { a.setCam(((a.camIndex || 0) + 1) % (a.scn?.cams?.length || 1)); }
    this.refresh();
  }

  restart() { const a = this.app; if (a.mode === 'asset') a.loadAsset(a.assetId); else a.loadScenario(a.scnId, { keepCamera: true }); }

  seek(e) {
    const a = this.app, s = a.scn; if (!s?.duration) return;
    const r = this.tl.getBoundingClientRect(), t = ((e.clientX - r.left) / r.width) * s.duration;
    a.loadScenario(s.id, { keepCamera: true });
    // přeskočit: časová osa scénáře je funkcí času → stačí posunout hodiny a předehřát efekty 2 s
    a.t = t - 2 * a.timeScale; a.fx.scnTime = a.t;
    a.run.update?.(0, a.t);
    for (let i = 0; i < 60; i++) a.step(1 / 30);
  }

  toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 3500); }

  refresh() {
    const a = this.app;
    [...this.tierSeg.children].forEach((b, i) => b.classList.toggle('on', i === a.tierId));
    [...this.windSeg.children].forEach((b, i) => b.classList.toggle('on', i === a.wind));
    [...this.timeSeg.children].forEach((b) => b.classList.toggle('on', b.textContent === a.env.time));
    this.playBtn.textContent = a.paused ? '▶' : '⏸';
    this.speedSel.value = String(a.timeScale);
    document.querySelectorAll('#left .it').forEach((b) => b.classList.toggle('on', (a.mode === 'scenario' && b.dataset.s === a.scnId) || (a.mode === 'asset' && b.dataset.a === a.assetId)));
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
    const cams = $('#cams'); cams.innerHTML = '';
    if (a.scn) a.scn.cams.forEach((c, i) => cams.append(h('button', { class: 'btn' + (a.camIndex === i ? ' on' : ''), onclick: () => { a.setCam(i); this.refresh(); } }, c.name)));
    const d = $('#desc');
    if (a.mode === 'asset') { const as = assetById(a.assetId); d.innerHTML = `<b>${as.name}</b> — ${LOD_NAMES[a.lod]} · ${a.assetTris.toLocaleString('cs')} △ · postaveno za ${a.assetBuildMs.toFixed(0)} ms`; }
    else d.innerHTML = `<b>${a.scn.name}</b> — ${a.scn.desc}`;
    this.hist = []; this.curve = null;
    this.renderPane(true);
  }

  tick() {
    const a = this.app, st = a.stats();
    $('#hud').textContent = `${fmt(st.fps, 0)} fps  ${fmt(st.frameMs, 1)} ms  CPU ${fmt(st.cpuMs, 1)} ms\n${TIERS[a.tierId].name}\ndraw ${st.calls}  △ ${(st.gpuTris / 1000).toFixed(0)}k  částice ${st.flameSmoke + st.sparks}  objemy ${st.volumes}`;
    if (this.tab === 'fyzika' || this.tab === 'technika') this.renderPane(false);
    this.drawTimeline();
    $('#corner').innerHTML = `GPU: ${(a.gpu || '?').slice(0, 60)}<br>auto stupeň: T${a.autoTier}`;
    $('#corner2').innerHTML = `Klávesy: mezerník pauza · R znovu · 1–4 vítr · T kvalita · C kamera · H rozhraní`;
  }

  rowsTable(rows) {
    const t = h('table', { class: 'kv' });
    for (const [k, v, s] of rows) {
      t.append(h('tr', { class: s ? 'sub' : '' }, h('td', {}, k), h('td', {}, String(v))));
      if (s) t.append(h('tr', {}, h('td', { class: 'src', colspan: 2 }, s)));
    }
    return t;
  }

  renderPane(full) {
    const a = this.app, p = $('#pane');
    if (this.tab === 'fyzika') {
      p.innerHTML = '';
      if (a.mode === 'asset') {
        const as = assetById(a.assetId), sz = a.assetSize;
        p.append(this.rowsTable([['Model', as.name, ''], ['Kategorie', as.cat, ''], ['LOD', LOD_NAMES[a.lod], ''], ['Trojúhelníky', a.assetTris.toLocaleString('cs'), ''], ['Rozměr', `${sz.x.toFixed(2)} × ${sz.y.toFixed(2)} × ${sz.z.toFixed(2)} m`, ''], ['Stavba', a.assetBuildMs.toFixed(0) + ' ms (procedurálně, seed 1)', '']]));
        p.append(h('p', { class: 'note' }, 'Materiály: PBR (albedo, normála, drsnost) z vlastních generátorů; spalitelné části mají materiál ohořelosti (char + žhnutí trhlin). V záložce Ovládání lze měnit LOD a ohořelost.'));
        return;
      }
      const rows = a.run?.info?.() || [];
      p.append(this.rowsTable([['Čas scénáře', fmt(a.t, 1) + ' s' + (a.scn.duration ? ' / ' + a.scn.duration + ' s' : ''), ''], ['Vítr (10 m)', `${WIND_CLASSES[a.wind].name} ${WIND_CLASSES[a.wind].U10} m/s`, 'Beaufort'], ['Kyslík (ventilace)', (a.o2 * 100).toFixed(0) + ' %', ''], ...rows]));
      p.append(h('p', { class: 'note' }, '★ = míra jistoty vzorce/čísla (1–5). Zdroje a rozhodnutí: DECISIONS.md v repozitáři.'));
    } else if (this.tab === 'technika') {
      const st = a.stats(), t = TIERS[a.tierId];
      p.innerHTML = '';
      p.append(this.rowsTable([
        ['Stupeň', t.name, t.hw], ['Rozlišení vnitřní', st.res + ` (×${t.renderScale})`, ''],
        ['Snímek', fmt(st.frameMs, 1) + ' ms (' + fmt(st.fps, 0) + ' fps)', 'rozpočet ' + t.frameBudgetMs + ' ms'], ['CPU simulace+příprava', fmt(st.cpuMs, 2) + ' ms', ''],
        ['Draw cally', st.calls, ''], ['Trojúhelníky (GPU)', st.gpuTris.toLocaleString('cs'), ''], ['Trojúhelníky scény', st.sceneTris.toLocaleString('cs'), ''],
        ['Částice plamen+kouř', `${st.flameSmoke} / ${t.particles.flame + t.particles.smoke}`, t.sortSmoke ? 'řazené' : 'neřazené'],
        ['Jiskry/uhlíky', `${st.sparks} / ${t.particles.spark}`, ''], ['Horký vzduch', `${st.haze} / ${t.particles.haze}`, t.haze ? 'zapnuto' : 'vypnuto'],
        ['Objemové plameny', `${st.volumes} / ${t.volumes + Math.min(3, t.volumes)}`, `${t.volumeSteps} kroků`], ['Světla ohně', `${st.lights} / ${t.lights}`, t.shadows ? 'stíny 1×' : 'bez stínů'],
        ['Trosky', `${st.debris} / ${t.debris}`, ''], ['Průchody', st.passes, `bloom ${t.bloom} úrovní`],
        ['Expozice', st.exposure.toExponential(2), 'auto (oko)'], ['Jas plamene po adaptaci', st.flameLum.toFixed(0) + ' cd/m²', ''],
        ['Paměť RT', fmt(st.rtMB, 1) + ' MB', ''], ['Atlas flipbooku', fmt(st.atlasMB, 1) + ' MB', `bake ${fmt(st.bakeMs, 0)} ms`],
        ['Textur / geometrií / programů', `${st.textures} / ${st.geometries} / ${st.programs}`, ''],
        ['Zahozené částice (limit)', st.dropped, ''],
      ]));
    } else if (this.tab === 'ovládání') {
      if (!full) return;
      p.innerHTML = '';
      const range = (label, min, max, step, val, on, fmtF = (v) => v) => {
        const out = h('span', { class: 'pill' }, fmtF(val));
        const i = h('input', { type: 'range', min, max, step, value: val, oninput: (e) => { on(+e.target.value); out.textContent = fmtF(+e.target.value); } });
        return h('div', { class: 'row' }, h('label', {}, label, ' ', out), i);
      };
      p.append(range('Směr větru', 0, 360, 5, (a.windDir * 180) / Math.PI, (v) => a.setWindDir((v * Math.PI) / 180), (v) => v + '°'));
      p.append(range('Kyslík / ventilace (0 = dusivé, 1 = volný prostor)', 0, 1, 0.01, a.o2, (v) => a.setO2(v), (v) => (v * 100).toFixed(0) + ' %'));
      p.append(h('p', { class: 'note' }, 'Nízký kyslík: Φ > 1 → víc sazí a CO, chladnější tmavě oranžový plamen, odtržené jazyky, hustý černý kouř.'));
      p.append(range('Lokální adaptace plamene (klíč)', 0.5, 20, 0.1, a.flameKey, (v) => (a.flameKey = v)));
      p.append(range('Korekce expozice (EV)', -4, 4, 0.25, Math.log2(a.expBias || 1), (v) => (a.expBias = 2 ** v), (v) => (v > 0 ? '+' : '') + v));
      p.append(range('Bloom', 0, 2, 0.05, a.pipeline.bloomStrength, (v) => (a.pipeline.bloomStrength = v)));
      if (a.scn?.controls) {
        p.append(h('h4', {}, 'Parametry scénáře'));
        for (const c of a.scn.controls) {
          if (c.type === 'check') p.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', ...(a.controlsVals[c.id] ? { checked: '' } : {}), onchange: (e) => { a.controlsVals[c.id] = e.target.checked; this.restart(); } }), c.label));
          else if (c.type === 'select') p.append(h('div', { class: 'row' }, h('label', {}, c.label), h('select', { onchange: (e) => (a.controlsVals[c.id] = e.target.value) }, ...c.options.map((o) => h('option', { value: o, ...(o === a.controlsVals[c.id] ? { selected: '' } : {}) }, FUELS[o]?.name || o)))));
          else if (c.log) p.append(range(c.label, Math.log10(c.min), Math.log10(c.max), 0.01, Math.log10(a.controlsVals[c.id]), (v) => (a.controlsVals[c.id] = 10 ** v), (v) => (10 ** v).toPrecision(3)));
          else p.append(range(c.label, c.min, c.max, c.step || 0.01, a.controlsVals[c.id], (v) => (a.controlsVals[c.id] = v)));
        }
      }
      p.append(h('h4', {}, 'Vrstvy'));
      const L = a.fx.layers;
      p.append(h('div', { class: 'grid2' }, ...Object.entries({ flame: 'plamen', smoke: 'kouř', sparks: 'jiskry', haze: 'horký vzduch', light: 'světla', volume: 'objemy' }).map(([k, n]) =>
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', ...(L[k] ? { checked: '' } : {}), onchange: (e) => (L[k] = e.target.checked) }), n))));
      p.append(h('h4', {}, 'Geometrie'));
      p.append(h('div', { class: 'row' }, h('label', {}, 'LOD modelů (prázdné = podle stupně)'), h('select', { onchange: (e) => { a.lodOverride = e.target.value === '' ? null : +e.target.value; this.restart(); } }, h('option', { value: '' }, 'auto (' + LOD_NAMES[a.tier.lod] + ')'), ...LOD_NAMES.map((n, i) => h('option', { value: i, ...(a.lodOverride === i ? { selected: '' } : {}) }, n)))));
      p.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', ...(a.wire ? { checked: '' } : {}), onchange: (e) => { a.wire = e.target.checked; a.applyWire(); } }), 'drátový model'));
      if (a.mode === 'asset') {
        const setChar = (k, v) => a.assetObj.traverse((o) => { const m = o.material; for (const mm of Array.isArray(m) ? m : [m]) if (mm?.userData?.char) mm.userData.char[k].value = v; });
        p.append(range('Ohořelost', 0, 1, 0.01, 0, (v) => setChar('uChar', v)));
        p.append(range('Žhnutí', 0, 1, 0.01, 0, (v) => setChar('uGlow', v)));
        p.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', onchange: (e) => (this.turn = e.target.checked) }), 'otáčet'));
      }
    } else if (this.tab === 'export') {
      if (!full) return;
      p.innerHTML = '';
      p.append(h('p', { class: 'note' }, 'Vše je generované kódem v prohlížeči. Stejné soubory vytváří offline nástroj npm run bake do složky dataset/ (v repozitáři už jsou).'));
      if (SANDBOX) p.append(h('p', { class: 'note' }, 'V náhledu claude.ai se soubor ukládá po potvrzení; model GLB přijde zabalený v ZIP.'));
      p.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.exportGLB() }, a.mode === 'asset' ? 'Model GLB (aktuální LOD)' : 'Modely scény GLB')));
      p.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.exportAtlas() }, 'Flipbook atlas PNG (16×8)')));
      p.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.exportPreset() }, 'Preset scénáře JSON')));
      p.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.exportLODTable() }, 'Tabulka LOD všech modelů (CSV)')));
      p.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.shot() }, 'Snímek obrazovky PNG')));
    }
  }

  drawTimeline() {
    const a = this.app, cv = this.tl, g = cv.getContext('2d');
    const W = (cv.width = cv.clientWidth * devicePixelRatio), H = (cv.height = cv.clientHeight * devicePixelRatio);
    g.clearRect(0, 0, W, H);
    const s = a.scn;
    if (!s) { this.tc.textContent = 'model'; return; }
    // historie celkového výkonu
    const Q = a.fx.sources.reduce((q, x) => q + (x.active && x.ph ? x.ph.Q : 0), 0);
    const dur = s.duration || 60;
    this.hist.push([a.t, Q]); if (this.hist.length > 2000) this.hist.shift();
    const qmax = Math.max(1, ...this.hist.map((x) => x[1]));
    g.strokeStyle = '#ff7a1a'; g.lineWidth = 2 * devicePixelRatio; g.beginPath();
    this.hist.forEach(([t, q], i) => { const x = ((s.duration ? t / dur : (t % 60) / 60)) * W, y = H - 6 - (q / qmax) * (H - 18); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    const x = (s.duration ? a.t / dur : (a.t % 60) / 60) * W;
    g.fillStyle = '#ffb347'; g.fillRect(x - 1, 0, 2 * devicePixelRatio, H);
    g.fillStyle = '#9a907e'; g.font = `${11 * devicePixelRatio}px monospace`; g.fillText('HRR ' + fmtW(Q) + '  (max ' + fmtW(qmax) + ')', 8, 14 * devicePixelRatio);
    this.tc.innerHTML = `t = ${a.t.toFixed(1)} s<br>${s.duration ? '/ ' + s.duration + ' s' : 'bez konce'}<br>×${a.timeScale}`;
    if (this.turn && a.assetObj) a.assetObj.rotation.y += 0.02;
  }

  shot() {
    const a = this.app; a.renderFrame(0);
    download(`firelab_${a.scnId || a.assetId}_T${a.tierId}.png`, a.renderer.domElement.toDataURL('image/png'));
  }

  showAtlas() {
    const a = this.app, w = $('#atlasWrap');
    if (w.classList.contains('show')) { w.classList.remove('show'); cancelAnimationFrame(this._af); return; }
    w.innerHTML = '';
    const raw = atlasToCanvas(a.renderer, a.fx.atlasRT), pv = atlasPreviewCanvas(raw);
    const res = a.fx.atlasRT.texture.userData.res;
    w.append(h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, h('b', {}, `Flipbook atlas ${raw.width}×${raw.height} (buňka ${res} px, 2 × 64 snímků) · vypečeno za ${a.fx.atlasRT.texture.userData.bakeMs.toFixed(0)} ms`), h('button', { class: 'btn', onclick: () => this.showAtlas() }, 'Zavřít')));
    w.append(h('p', { class: 'note' }, 'Vlevo plamenný jazyk (R intenzita, G teplota, B saze, A pokrytí), vpravo kouřový chuchvalec (R hustota, G světlo shora, B okraj). Zobrazeno v náhledovém obarvení; surová data exportuj v záložce Export.'));
    w.append(pv);
    const f1 = h('canvas', { width: 256, height: 256 }), f2 = h('canvas', { width: 256, height: 256 });
    w.append(h('div', { class: 'flip' }, h('div', {}, 'plamen (30 fps)', h('br'), f1), h('div', {}, 'kouř (12 fps)', h('br'), f2)));
    w.classList.add('show');
    const c = res, t0 = performance.now();
    const anim = () => {
      const t = (performance.now() - t0) / 1000;
      for (const [cv, sheet, fps] of [[f1, 0, 30], [f2, 8, 12]]) {
        const fr = Math.floor(t * fps) % 64, col = (fr % 8) + sheet, row = Math.floor(fr / 8);
        const g = cv.getContext('2d'); g.clearRect(0, 0, 256, 256);
        g.drawImage(pv, col * c, pv.height - (row + 1) * c, c, c, 0, 0, 256, 256);
      }
      this._af = requestAnimationFrame(anim);
    };
    anim();
  }

  exportAtlas() { const a = this.app; const raw = atlasToCanvas(a.renderer, a.fx.atlasRT); raw.toBlob((b) => download(`flipbook_atlas_${a.fx.atlasRT.texture.userData.res}.png`, b)); }

  exportGLB() {
    const a = this.app, ex = new GLTFExporter();
    const root = new THREE.Group();
    for (const o of a.objects) root.add(o.clone(true));
    ex.parse(root, (res) => download(`${a.mode === 'asset' ? a.assetId + '_L' + a.lod : a.scnId}.glb`, new Blob([res], { type: 'model/gltf-binary' })), (e) => this.toast('Export selhal: ' + e.message), { binary: true });
  }

  exportPreset() {
    const a = this.app, s = a.scn; if (!s) return;
    const preset = {
      format: 'firelab-preset/1', id: s.id, name: s.name, desc: s.desc, wind: WIND_CLASSES[a.wind], o2: a.o2, time: a.env.time, timeScale: a.timeScale,
      tier: TIERS[a.tierId], physics: (a.run?.info?.() || []).map(([k, v, src]) => ({ k, v, src })),
      sources: a.fx.sources.filter((x) => x.ph).map((x) => ({ fuel: x.o.fuel, pos: x.pos.toArray(), D: x.D, Q: x.ph.Q, L: x.ph.L, T: x.ph.T, tiltDeg: (x.ph.tilt.theta * 180) / Math.PI, puffHz: x.ph.fp, smokeTau: x.ph.tau, smokeRGB: x.ph.smoke.rgb, lightCd: x.ph.I })),
    };
    download(`preset_${s.id}.json`, new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }));
  }

  exportLODTable() {
    let csv = 'asset;' + LOD_NAMES.join(';') + '\n';
    for (const as of ASSETS) { const r = [as.id]; for (let l = 0; l < 4; l++) r.push(tris(as.build({ lod: l, seed: 1 }))); r.push('(L4 za běhu)'); csv += r.join(';') + '\n'; }
    download('lod_table.csv', new Blob([csv], { type: 'text/csv' }));
  }
}
