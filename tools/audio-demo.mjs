// Ukázky zvuku do WAV (stejný řetězec jako v prohlížeči: hlasy → master 0,8 → kompresor). node tools/audio-demo.mjs [outdir]
import { open } from './harness.mjs';
import fs from 'node:fs';
const out = process.argv[2] ?? '/tmp/firelab_audio';
fs.mkdirSync(out, { recursive: true });
const { browser, page } = await open({ q: 'scn=lab&tier=0&ui=0', vp: { width: 320, height: 200 } });
const clips = await page.evaluate(async () => {
  const A = window.__fire.AUDIO, sr = 32000, res = {};
  const chain = (ctx) => { const c = ctx.createDynamicsCompressor(); c.threshold.value = -14; c.ratio.value = 6; c.attack.value = 0.003; c.release.value = 0.25; const l = ctx.createDynamicsCompressor(); l.threshold.value = -2; l.knee.value = 0; l.ratio.value = 20; l.attack.value = 0.001; l.release.value = 0.1; const m = ctx.createGain(); m.gain.value = 0.8; m.connect(c); c.connect(l); l.connect(ctx.destination); return m; };
  const fire = async (Q, fp, dist, crackle, sec = 8) => { const ctx = new OfflineAudioContext(2, sr * sec, sr), m = chain(ctx); const v = A.fireVoice(ctx, m, { seed: 5, crackle }); v.set({ Q, fp, dist, x: dist * 0.5, y: 1, z: -dist * 0.87 }, 0); for (let k = 0; k < 6; k++) A.pop(ctx, m, { when: 1 + k * 1.1 + (k % 2) * 0.37, dist, seed: 20 + k }); const b = await ctx.startRendering(); return [Array.from(b.getChannelData(0)), Array.from(b.getChannelData(1))]; };
  const bang = async (W, dist, sec) => { const ctx = new OfflineAudioContext(2, sr * sec, sr), m = chain(ctx); A.boom(ctx, m, { when: 0.5 + dist / 343, W, dist, seed: 9 }); const b = await ctx.startRendering(); return [Array.from(b.getChannelData(0)), Array.from(b.getChannelData(1))]; };
  res.taborak_5m = await fire(2e5, 1.68, 5, 1);
  res.hranice_10m = await fire(3e6, 0.97, 10, 1);
  res.pneumatiky_8m = await fire(8e5, 1.54, 8, 0.15);
  res.granat_60m = await bang(0.24, 60, 4);
  res.sud_filmovy_40m = await bang(4, 40, 5);
  res.tnt_400m = await bang(1000, 400, 7);
  return { sr, res };
});
const wav = (chs, sr) => {
  const n = chs[0].length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(chs[c][i] * 32767))), 44 + i * 4 + c * 2);
  return b;
};
for (const [k, v] of Object.entries(clips.res)) { const p = `${out}/${k}.wav`; fs.writeFileSync(p, wav(v, clips.sr)); let pk = 0; for (const x of v[0]) pk = Math.max(pk, Math.abs(x)); console.log(p, 'špička', pk.toFixed(3)); }
await browser.close();
