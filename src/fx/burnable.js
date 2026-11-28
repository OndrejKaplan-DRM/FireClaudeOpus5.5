// Hořlavý (nebo jen ohřívaný) předmět: obecná komponenta, která z ohně dělá prvek světa (AUDIT §5.2, iterace 6).
//   oheň → tepelný tok v místě předmětu (physics/heat.js) → dávka do vznícení → vlastní oheň z materiálu a hmotnosti
//   (physics/spec.js) → postup ohoření do shaderu (uChar/uGlow, u plechu uTmax/uTnow/uSoot/uRust) → vyhoření a zbytek.
// Od iterace 7 je stavový automat v physics/sim.js (`ThermalBody`) – stejný kód běží ve hře i v simulaci bez grafiky.
// Tady zůstává jen to viditelné: zdroj plamene, dým před vzplanutím, pára při hašení, uniformy ohoření, zvuk.
import * as THREE from 'three';
import { ThermalBody } from '../physics/sim.js';
import { sourceOptions } from '../physics/spec.js';
import { mulberry32 } from '../engine/rng.js';

export class Burnable {
  /**
   * o = { pos: Vector3 (pata předmětu), material, mass [kg], area [m² hořícího povrchu], size [m], height [m] (kde se měří tok),
   *       char (uniformy applyChar), source (další volby FireSource), ignited (hoří od začátku), label,
   *       spec (hotový fireSpec místo odvození z materiálu), probe: [dx,dy,dz] (posun měřicího bodu),
   *       explosive: { spec, cookT } (nálož nebo nádoba uvnitř), onIgnite(b), onBurnout(b), onEvent(type, b, e) }
   */
  constructor(world, o) {
    this.w = world; this.o = o;
    this.pos = o.pos.clone ? o.pos.clone() : new THREE.Vector3(...o.pos);
    this.body = new ThermalBody({ ...o, pos: [this.pos.x, this.pos.y, this.pos.z], ignited: false });
    this.mat = this.body.mat; this.p = this.body.p; this.label = this.body.label; this.src = null; this.agent = null;
    this.last = world.scnTime; this.rnd = mulberry32((o.seed ?? 77) * 31 + 7);
    if (o.ignited) this.ignite();
  }
  get inert() { return this.body.inert; }
  get heat() { return this.body.heat; }
  get state() { return this.body.state; }
  get q() { return this.body.q; }
  get Tg() { return this.body.Tg; }
  get Ts() { return this.body.Ts; }
  get Tmax() { return this.body.Tmax; }
  get soot() { return this.body.soot; }
  get rust() { return this.body.rust; }
  get melt() { return this.body.melt; }
  get glass() { return this.body.glass; }
  get F() { return this.body.F; }
  get dose() { return this.body.dose; }
  get tIgn() { return this.body.tIgn; }
  get burned() { return this.body.burned; }
  get spec() { return this.body.spec; }
  get supp() { return this.body.supp; }

  ignite() {
    if (!this.body.ignite(this.w.scnTime)) return;
    this.startFire();
    this.o.onIgnite?.(this);
  }
  startFire() {
    const o = this.o, w = this.w, b = this.body;
    if (this.src) { this.src.enabled = true; return; }
    this.src = w.addSource({ pos: this.pos.clone().add(new THREE.Vector3(0, o.fireY ?? 0.02, 0)), seed: o.seed ?? 77, volume: true, ...sourceOptions(b.spec), ...(o.source || {}), Q: () => b.Qnow(), end: Infinity });
    this.src.owner = this;
    if (w.audioEvents && w.audioEvents.length < 64) w.audioEvents.push({ type: 'pop', pos: this.pos.clone() }); // lupnutí při vzplanutí
  }

  update() {
    const w = this.w, dt = Math.max(0, w.scnTime - this.last); this.last = w.scnTime;
    if (dt <= 0 || dt > 600) return;
    const b = this.body, f = w.heatFlux(this.p, this.src), u = this.o.char, r = this.rnd;
    const evs = b.step({ q: f.total, Tg: f.Tg, inFlame: f.inFlame, tau: w.smokeAt ? w.smokeAt(this.p) : 0 }, dt, w.scnTime, this.agent);
    this.agent = null; // hasivo se zadává každý snímek znovu (FXWorld.addSpray)
    for (const e of evs) {
      if (e.type === 'ignite' || e.type === 'reignite') { this.startFire(); this.o.onIgnite?.(this); }
      else if (e.type === 'burnout') { if (this.src) this.src.enabled = false; if (u && u.uChar) { u.uChar.value = 1; u.uGlow.value = 0.25; } this.o.onBurnout?.(this); }
      else if (e.type === 'extinguished') { if (this.src) this.src.enabled = false; if (u && u.uGlow) u.uGlow.value = 0; }
      else if (e.type === 'explode') { w.pendingBlasts.push({ b: this, spec: e.spec, cause: e.cause }); }
      if (e.type !== 'explode' && w.events.length < 400) w.events.push({ t: w.scnTime, type: e.type, label: this.label, cause: e.cause });
      this.o.onEvent?.(e.type, this, e);
    }
    // pára z hašení a z mokrého povrchu: bílé stoupající obláčky (1 kg vody → 1,7 m³ páry)
    if (b.steam > 0 && w.layers.smoke && w.bb) {
      this._st = (this._st || 0) + w.dtReal * Math.min(60, 6 + 40 * b.steam) * (w.tier.smokeMul ?? 1) * w.budgetScale.smoke;
      const s = this.o.size ?? 0.6;
      while (this._st >= 1) { this._st -= 1; w.bb.spawnSmoke({ x: this.p[0] + (r() - 0.5) * s, y: this.pos.y + s * (0.2 + 0.6 * r()), z: this.p[2] + (r() - 0.5) * s, vx: (r() - 0.5) * 0.6, vy: 1.2 + 1.5 * r(), vz: (r() - 0.5) * 0.6, life: 1.4 + 1.6 * r(), s0: 0.12 * s + 0.08, s1: 0.9 * s + 0.5, tau: 0.5, albedo: [0.92, 0.93, 0.95], drag: 0.6 }); }
    }
    if (this.inert) {
      if (u && u.uTmax) {
        u.uTmax.value = b.Tmax; u.uTnow.value = b.Ts; u.uSoot.value = b.soot; u.uRust.value = b.rust;
        // nejsilnější oheň určuje přivrácenou stranu (v plameni se rozdíl stran stírá)
        let best = null, bq = 0;
        for (const s of w.fireList(this.src)) { const d2 = (s.x - this.pos.x) ** 2 + (s.z - this.pos.z) ** 2 + 0.05, k = s.Q / d2; if (k > bq) { bq = k; best = s; } }
        if (best && u.uHeatSrc) { u.uHeatSrc.value.set(best.x, best.y + best.L * 0.3, best.z); u.uObjC.value.set(this.pos.x, this.pos.y + (this.o.size ?? 0.9) * 0.5, this.pos.z); u.uHeatSide.value = Math.max(u.uHeatSide.value * 0.98, f.inFlame ? 0.3 : 1); }
      }
      return;
    }
    const st = b.state;
    if (st === 'heating') {
      // před vznícením: pyrolýza – bílý dým z povrchu (viditelné varování; fotky a videa zkoušek vznícení) ★3
      if (b.heat > 0.3 && w.layers.smoke && w.bb) {
        this._sm = (this._sm || 0) + w.dtReal * 14 * b.heat * (w.tier.smokeMul ?? 1);
        while (this._sm >= 1) { this._sm -= 1; const s = this.o.size ?? 0.5; w.bb.spawnSmoke({ x: this.p[0] + (r() - 0.5) * s, y: this.p[1] + (r() - 0.3) * s * 0.5, z: this.p[2] + (r() - 0.5) * s, vy: 0.4 + 0.5 * r(), life: 1.6 + 1.5 * r(), s0: 0.05 * s + 0.03, s1: 0.5 * s + 0.2, tau: 0.25 * b.heat, albedo: [0.8, 0.8, 0.82], drag: 0.5 }); }
      }
      if (u && u.uChar) u.uChar.value = Math.max(u.uChar.value, 0.18 * b.heat);
    } else if (st === 'burning') {
      const tl = b.tb;
      if (u && u.uChar) { u.uChar.value = Math.max(u.uChar.value, Math.min(1, 0.2 + 1.1 * Math.sqrt(b.burned))); u.uGlow.value = Math.min(1, tl / 20) * (b.burned < 0.85 ? 1 : 0.5) * Math.max(0, 1 - b.supp.s); }
    }
  }
}
