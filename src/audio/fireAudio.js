// Zvuk ohně a výbuchů (iterace 5): procedurální WebAudio, bez nahrávek (vlastní práce, deterministická semínka).
//
// Fyzika a jistota:
//  - Hukot plamene = spalovací šum turbulentního plamene, spektrum s maximem ~100–1 000 Hz, níž pro větší plameny
//    (Strahle 1978; Hassan 1974: f_max klesá s velikostí) ★3. Akustický výkon: Lw ≈ 60 + 10·log10(Q / 10 kW) dB –
//    odhad řádu podle záznamů táboráků a požárů (účinnost ~10⁻⁸–10⁻⁷ Q) ★1–2.
//  - Pulzace hlasitosti frekvencí puffingu f ≈ 1,5/√D (combustion.puffingFrequency) ★4.
//  - Praskání dřeva: krátké impulzy 2–15 ms z vypařování vody a pryskyřice v pórech, 2–6 kHz ★3; četnost podle paliva ★2.
//  - Výbuch: zpoždění vzdálenost / 343 m/s ★5, hladina ze špičkového přetlaku (SPL = 20·log10(Ps / 20 µPa), Kinney–Graham ★4),
//    stlačená do rozsahu reproduktoru (umělecké ★1); útlum výšek vzduchem ∝ vzdálenost (ISO 9613-1, zjednodušeně) ★2;
//    doba doznění ~0,15 + 0,35·W^⅓ s (ozvěna terénu, umělecké ★1).
// Dynamiku hlídá kompresor na výstupu; nic nehraje, dokud uživatel zvuk nezapne (pravidla prohlížečů).
import { mulberry32 } from '../engine/rng.js';
import { blastSummary } from '../physics/blast.js';

const C_SOUND = 343;

/** Hnědý / růžový šum do AudioBufferu (deterministický). */
export function noiseBuffer(ctx, seconds, seed = 1, color = 'brown') {
  const n = Math.round(seconds * ctx.sampleRate), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = mulberry32(seed);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
  }
  // plynulá smyčka: prolnutí konce do začátku (20 ms)
  const f = Math.min(n >> 2, Math.round(0.02 * ctx.sampleRate));
  for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
  return b;
}

/** Praskání: řídké impulzy (log-normální amplituda, 2–15 ms, vysoké frekvence). rate [1/s]. */
export function crackleBuffer(ctx, seconds, seed = 2, rate = 6) {
  const sr = ctx.sampleRate, n = Math.round(seconds * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), r = mulberry32(seed);
  let t = 0;
  while (true) {
    t += -Math.log(Math.max(r(), 1e-6)) / rate;                  // Poissonův proces
    const i0 = Math.round(t * sr); if (i0 >= n) break;
    const len = Math.round(sr * (0.002 + 0.013 * r() * r())), amp = Math.min(1, 0.15 * Math.exp(0.9 * (r() + r() - 1)));
    let prev = 0;
    for (let k = 0; k < len && i0 + k < n; k++) {
      const w = r() * 2 - 1, hp = w - prev; prev = w;              // derivace → posun k výškám
      d[i0 + k] += hp * amp * Math.exp(-k / (len * 0.25));
    }
    if (r() < 0.25) { const j = i0 + Math.round(sr * (0.004 + 0.02 * r())); for (let k = 0; k < 60 && j + k < n; k++) d[j + k] += (r() * 2 - 1) * amp * 0.5 * Math.exp(-k / 12); } // dvojité lupnutí
  }
  return b;
}

/** Hlas jednoho ohně: hukot (šum → dolní propust, pulzace) + praskání, prostorově přes PannerNode. */
export function fireVoice(ctx, dest, { seed = 1, crackle = 1 } = {}) {
  const panner = ctx.createPanner();
  panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.rolloffFactor = 1; panner.maxDistance = 1e4;
  panner.connect(dest);
  const roar = ctx.createBufferSource(); roar.buffer = noiseBuffer(ctx, 4, seed, 'brown'); roar.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7; lp.frequency.value = 800;
  const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 18000; air.Q.value = 0.5; // útlum výšek vzduchem
  const g = ctx.createGain(); g.gain.value = 0;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 1.5; const lfoG = ctx.createGain(); lfoG.gain.value = 0;
  lfo.connect(lfoG); lfoG.connect(g.gain);
  roar.connect(lp); lp.connect(g); g.connect(air); air.connect(panner);
  const cr = ctx.createBufferSource(); cr.buffer = crackleBuffer(ctx, 6, seed + 7, 7); cr.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 1200;
  const cg = ctx.createGain(); cg.gain.value = 0;
  cr.connect(bp); bp.connect(cg); cg.connect(air);
  roar.start(); cr.start(); lfo.start();
  return {
    panner, nodes: [roar, lp, g, lfo, lfoG, cr, bp, cg, air, panner],
    /** Q [W], fp [Hz] pulzace, flare 0..1, crackle 0..1, dist [m] (pro útlum výšek), at = AudioContext čas. */
    set({ Q, fp, flare = 0, crackleK = crackle, dist = 10, x = 0, y = 0, z = 0 }, at) {
      const Lw = 60 + 10 * Math.log10(Math.max(Q, 1) / 1e4);
      const amp = Math.pow(10, (Lw - 11 - 80) / 20) * (1 + 0.6 * flare);  // 80 dB SPL ≈ plný rozsah (trvalé zvuky; rány zvlášť) ★1
      const T = 0.15;
      g.gain.setTargetAtTime(amp, at, T); lfoG.gain.setTargetAtTime(amp * 0.25, at, T);
      lfo.frequency.setTargetAtTime(Math.min(8, Math.max(0.3, fp)), at, 0.5);
      lp.frequency.setTargetAtTime(Math.min(2000, Math.max(150, 1800 * Math.pow(Math.max(Q, 1) / 1e4, -0.15))), at, 0.5);
      cg.gain.setTargetAtTime(amp * 2.2 * crackleK * Math.pow(Math.max(Q, 1) / 2e5, -0.1), at, T);
      air.frequency.setTargetAtTime(Math.max(2500, 18000 / (1 + dist / 120)), at, 0.3);
      if (panner.positionX) { panner.positionX.setValueAtTime(x, at); panner.positionY.setValueAtTime(y, at); panner.positionZ.setValueAtTime(z, at); }
      else panner.setPosition(x, y, z);
    },
    stop(at) {
      g.gain.setTargetAtTime(0, at, 0.3); cg.gain.setTargetAtTime(0, at, 0.3);
      for (const n of [roar, cr, lfo]) { try { n.stop(at + 2); } catch (e) { /* už zastaveno */ } }
    },
  };
}

/**
 * Rána výbuchu: šumový impulz (dolní propust podle vzdálenosti a velikosti) + podbasový úder s poklesem výšky.
 * when = čas AudioContextu příchodu čela k posluchači. W [kg TNT], dist [m]. Vrací použitou hladinu SPL [dB].
 */
export function boom(ctx, dest, { when, W, dist, seed = 3 }) {
  const Ps = W > 0 ? blastSummary(W, [Math.max(dist, 1)])[0].Ps : 200;
  const spl = 20 * Math.log10(Math.max(Ps, 1e-3) / 20e-6);
  const amp = Math.min(1.0, Math.max(0.02, Math.pow(10, (spl - 150) / 40)));   // stlačení dynamiky 2:1 (umělecké ★1)
  const k = Math.cbrt(Math.max(W, 0.01)), dur = 0.15 + 0.35 * k;
  const len = Math.min(12, dur * 3 + 0.3), src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, len, seed, 'pink');
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = Math.max(250, Math.min(9000, (9000 / (1 + dist / 150)) / (0.6 + 0.4 * k)));
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(amp, when + 0.004);
  g.gain.setTargetAtTime(amp * 0.35, when + 0.004, 0.05 * (0.5 + k * 0.2)); g.gain.setTargetAtTime(0, when + 0.08, dur / 3); // e^-9 na konci bufferu – bez useknutí
  src.connect(lp); lp.connect(g); g.connect(dest);
  src.start(when); src.stop(when + len);
  // podbas: 55 → 25 Hz (tlaková vlna, „úder do hrudi“)
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(60 / (0.7 + 0.3 * k), when); o.frequency.exponentialRampToValueAtTime(22, when + 0.25 + 0.2 * k);
  const og = ctx.createGain(); og.gain.setValueAtTime(0, when); og.gain.linearRampToValueAtTime(amp * 0.9, when + 0.01); og.gain.setTargetAtTime(0, when + 0.02, 0.12 + 0.1 * k);
  o.connect(og); og.connect(dest); o.start(when); o.stop(when + 1 + k);
  return spl;
}

/** Jedno lupnutí (praskání dřeva s výstřelem jisker) v čase when, hlasitost podle vzdálenosti. */
export function pop(ctx, dest, { when, dist, seed = 5 }) {
  const src = ctx.createBufferSource(); src.buffer = crackleBuffer(ctx, 0.08, seed, 60);
  const g = ctx.createGain(); g.gain.value = Math.min(1, 1.2 / Math.max(dist, 1));
  src.connect(g); g.connect(dest); src.start(when);
}

/** Správce zvuku pro FXWorld + kameru (prohlížeč FireLab). Zapíná se gestem uživatele (enable). */
export class FireAudio {
  constructor() { this.ctx = null; this.on = false; this.voices = new Map(); this.heard = new WeakSet(); this.maxVoices = 12; this.seed = 1; }
  enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      this.ctx = new AC();
      this.comp = this.ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.25;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8;
      // omezovač za kompresorem: rány mají náběh 4 ms, kompresor (3 ms) je nechytí celé → bez něj ořez
      this.lim = this.ctx.createDynamicsCompressor(); this.lim.threshold.value = -2; this.lim.knee.value = 0; this.lim.ratio.value = 20; this.lim.attack.value = 0.001; this.lim.release.value = 0.1;
      this.master.connect(this.comp); this.comp.connect(this.lim); this.lim.connect(this.ctx.destination);
    }
    this.ctx.resume(); this.on = true; return true;
  }
  disable() { this.on = false; if (this.ctx) this.ctx.suspend(); }
  clear() { if (!this.ctx) return; const at = this.ctx.currentTime; for (const v of this.voices.values()) v.stop(at); this.voices.clear(); }
  /** Každý snímek: posluchač = kamera, hlasy nejbližších ohňů, nové výbuchy a lupnutí (fx.audioEvents). */
  update(fx, camera) {
    if (!this.on || !this.ctx) { if (fx.audioEvents) fx.audioEvents.length = 0; return; }
    const ctx = this.ctx, at = ctx.currentTime, L = ctx.listener, cp = camera.position;
    const f = camera.getWorldDirection(this._f || (this._f = cp.clone())), u = camera.up;
    if (L.positionX) { L.positionX.value = cp.x; L.positionY.value = cp.y; L.positionZ.value = cp.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
    else { L.setPosition(cp.x, cp.y, cp.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    // ohně: nejbližší a nejhlasitější (Q / r²) dostanou hlas
    const act = fx.sources.filter((s) => s.enabled && s.active && s.ph && s.ph.Q > 500);
    act.forEach((s) => { s._aimp = s.ph.Q / (s.pos.distanceToSquared(cp) + 1); });
    const keep = new Set(act.sort((a, b) => b._aimp - a._aimp).slice(0, this.maxVoices));
    for (const [s, v] of this.voices) if (!keep.has(s)) { v.stop(at); this.voices.delete(s); }
    for (const s of keep) {
      let v = this.voices.get(s);
      const wood = (s.fuel.embers ?? 0) > 0.3 ? 1 : (s.fuel.sparks ?? 0) > 0.2 ? 0.5 : 0.15;
      if (!v) { v = fireVoice(ctx, this.master, { seed: (s.o.seed ?? 1) + 11, crackle: wood }); this.voices.set(s, v); }
      v.set({ Q: s.ph.Q, fp: s.ph.fp, flare: s.flare || 0, crackleK: wood, dist: s.pos.distanceTo(cp), x: s.pos.x, y: s.pos.y + s.ph.L * 0.4, z: s.pos.z }, at);
    }
    // výbuchy: jednou na výbuch, zpoždění vzdálenost/343 minus to, co už uběhlo
    for (const e of fx.explosions) {
      if (this.heard.has(e)) continue;
      this.heard.add(e);
      const dist = e.pos.distanceTo(cp), delay = dist / C_SOUND - e.t;
      if (delay < -0.5) continue;                                   // zapnuto až po příchodu rány
      boom(ctx, this.master, { when: at + Math.max(0.01, delay), W: e.o.W || 0.05, dist, seed: (e.o.seed ?? 3) + this.seed++ });
    }
    for (const ev of fx.audioEvents || []) if (ev.type === 'pop') pop(ctx, this.master, { when: at + ev.pos.distanceTo(cp) / C_SOUND, dist: ev.pos.distanceTo(cp), seed: this.seed++ });
    if (fx.audioEvents) fx.audioEvents.length = 0;
  }
}
