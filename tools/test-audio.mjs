// Zvuk bez reproduktoru: OfflineAudioContext v prohlížeči (stejný kód jako v FireLab). node tools/test-audio.mjs
// Kontroly: hlas táboráku nenulový, bez NaN, bez ořezu; pulzace (kolísání RMS); rána přijde ve správný čas (vzdálenost/343);
// větší vzdálenost = méně výšek; hladina SPL z přetlaku v rozumném rozsahu.
import { open } from './harness.mjs';
const { browser, page, errs } = await open({ q: 'scn=lab&tier=0&ui=0', vp: { width: 320, height: 200 } });
const r = await page.evaluate(async () => {
  const A = window.__fire.AUDIO, sr = 44100, out = {};
  const stats = (d, a, b) => { let s = 0, pk = 0, nan = 0; for (let i = a; i < b; i++) { const v = d[i]; if (!Number.isFinite(v)) nan++; s += v * v; pk = Math.max(pk, Math.abs(v)); } return { rms: Math.sqrt(s / (b - a)), pk, nan }; };
  { // táborák 5 m
    const ctx = new OfflineAudioContext(1, sr * 4, sr), v = A.fireVoice(ctx, ctx.destination, { seed: 3, crackle: 1 });
    v.set({ Q: 2e5, fp: 1.6, dist: 5, x: 0, y: 1, z: -5 }, 0);
    const d = (await ctx.startRendering()).getChannelData(0);
    const seg = []; for (let k = 2; k < 16; k++) seg.push(stats(d, k * sr / 4, (k + 1) * sr / 4).rms);
    out.camp = { ...stats(d, sr, sr * 4), segMin: Math.min(...seg), segMax: Math.max(...seg) };
  }
  const hf = (d, a, b) => { let s = 0, s2 = 0; for (let i = a + 1; i < b; i++) { s += (d[i] - d[i - 1]) ** 2; s2 += d[i] ** 2; } return s / Math.max(s2, 1e-12); };
  for (const [name, W, dist] of [['gr60', 0.24, 60], ['gr600', 0.24, 600]]) {
    const ctx = new OfflineAudioContext(1, sr * 4, sr);
    const spl = A.boom(ctx, ctx.destination, { when: dist / 343, W, dist, seed: 4 });
    const d = (await ctx.startRendering()).getChannelData(0);
    let on = -1; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1e-3) { on = i / sr; break; }
    out[name] = { spl, onset: on, expect: dist / 343, hf: hf(d, Math.round(on * sr), Math.round(on * sr) + 4000), ...stats(d, 0, d.length) };
  }
  return out;
});
const ok = (c, m) => { console.log((c ? 'ok   ' : 'CHYBA') + ' ' + m); if (!c) process.exitCode = 1; };
ok(r.camp.nan === 0 && r.camp.rms > 1e-4, `táborák 5 m: RMS ${r.camp.rms.toExponential(2)}, špička ${r.camp.pk.toFixed(3)}, NaN ${r.camp.nan}`);
ok(r.camp.pk < 1, 'táborák bez ořezu');
ok(r.camp.segMax / r.camp.segMin > 1.15, `pulzace hlasitosti: RMS úseků ${r.camp.segMin.toExponential(2)}–${r.camp.segMax.toExponential(2)}`);
ok(Math.abs(r.gr60.onset - r.gr60.expect) < 0.01, `granát 60 m: rána za ${r.gr60.onset.toFixed(3)} s (čekáno ${r.gr60.expect.toFixed(3)} s), SPL ${r.gr60.spl.toFixed(0)} dB`);
ok(Math.abs(r.gr600.onset - r.gr600.expect) < 0.01, `granát 600 m: rána za ${r.gr600.onset.toFixed(3)} s (čekáno ${r.gr600.expect.toFixed(3)} s), SPL ${r.gr600.spl.toFixed(0)} dB`);
ok(r.gr600.hf < r.gr60.hf, `vzduch tlumí výšky: podíl výšek 60 m ${r.gr60.hf.toFixed(3)} > 600 m ${r.gr600.hf.toFixed(3)}`);
ok(r.gr60.spl > 130 && r.gr60.spl < 175, 'SPL granátu v 60 m v rozsahu 130–175 dB');
ok(r.gr60.nan === 0 && r.gr600.nan === 0, 'rány bez NaN');
ok(!errs.some((e) => /PAGEERROR/.test(e)), 'bez chyb stránky');
await browser.close();
