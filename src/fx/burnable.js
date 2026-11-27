// Hořlavý (nebo jen ohřívaný) předmět: obecná komponenta, která z ohně dělá prvek světa (AUDIT §5.2, iterace 6).
//   oheň → tepelný tok v místě předmětu (physics/heat.js) → dávka do vznícení → vlastní oheň z materiálu a hmotnosti
//   (physics/spec.js) → postup ohoření do shaderu (uChar/uGlow, u plechu uTmax/uTnow/uSoot/uRust) → vyhoření a zbytek.
// Jedno číslo dávky na předmět místo řešení vedení tepla; vše běží ve scénářovém čase (timeScale), deterministicky.
import * as THREE from 'three';
import { material } from '../physics/materials.js';
import { ignitionDose, stepDose, stepSheetTemp, sootRate } from '../physics/heat.js';
import { fireSpec, sourceOptions } from '../physics/spec.js';
import { AMB } from '../physics/combustion.js';
import { mulberry32 } from '../engine/rng.js';

export class Burnable {
  /**
   * o = { pos: Vector3 (pata předmětu), material, mass [kg], area [m² hořícího povrchu], size [m], height [m] (kde se měří tok),
   *       char (uniformy applyChar), source (další volby FireSource), ignited (hoří od začátku), label,
   *       spec (hotový fireSpec místo odvození z materiálu), onIgnite(b), onBurnout(b), probe: [dx,dy,dz] (posun měřicího bodu) }
   */
  constructor(world, o) {
    this.w = world; this.o = o; this.mat = material(o.material);
    this.pos = o.pos.clone ? o.pos.clone() : new THREE.Vector3(...o.pos);
    const pr = o.probe || [0, o.height ?? (o.size ?? 0.5) * 0.5, 0];
    this.p = [this.pos.x + pr[0], this.pos.y + pr[1], this.pos.z + pr[2]];
    this.dose = ignitionDose(this.mat); this.F = 0;
    this.state = 'cold'; this.q = 0; this.Tg = AMB.T; this.tIgn = null; this.burned = 0; this.src = null;
    this.Ts = AMB.T; this.Tmax = AMB.T; this.soot = 0; this.rust = 0; this.label = o.label || this.mat.name;
    this.last = world.scnTime; this.rnd = mulberry32((o.seed ?? 77) * 31 + 7);
    if (o.ignited) this.ignite();
  }
  get inert() { return this.mat.mode === 'inert'; }
  /** Podíl dávky do vznícení 0..1 (pro UI a „čmoudění“ před vzplanutím). */
  get heat() { return Number.isFinite(this.dose.ftp) ? Math.min(1, this.F / this.dose.ftp) : 0; }

  ignite() {
    if (this.state === 'burning' || this.state === 'burnt' || this.inert) return;
    const o = this.o, w = this.w;
    this.spec = o.spec || fireSpec({ kind: 'solid', material: o.material, mass: o.mass, area: o.area, size: o.size, D: o.D });
    this.src = w.addSource({ pos: this.pos.clone().add(new THREE.Vector3(0, o.fireY ?? 0.02, 0)), seed: o.seed ?? 77, volume: true, ...sourceOptions(this.spec), ...(o.source || {}) });
    this.src.owner = this; this.state = 'burning'; this.tIgn = w.scnTime;
    if (w.audioEvents && w.audioEvents.length < 64) w.audioEvents.push({ type: 'pop', pos: this.pos.clone() }); // lupnutí při vzplanutí
    o.onIgnite?.(this);
  }

  update() {
    const w = this.w, dt = Math.max(0, w.scnTime - this.last); this.last = w.scnTime;
    if (dt <= 0 || dt > 600) return;
    const f = w.heatFlux(this.p, this.src);
    this.q = f.total; this.Tg = f.Tg;
    const u = this.o.char;
    if (this.inert) {
      // plech: teplota, nejvyšší teplota, saze (usazují se z kouře na chladný povrch, na horkém shoří), rez po vychladnutí
      if (Number.isFinite(this.mat.rcd)) this.Ts = stepSheetTemp(this.Ts, this.q, dt, this.mat);
      this.Tmax = Math.max(this.Tmax, this.Ts);
      const tauM = w.smokeAt ? w.smokeAt(this.p) : 0;
      this.soot = Math.min(1, Math.max(0, this.soot + sootRate(tauM, f.Tg, this.Ts) * dt));
      if (this.Tmax > 700 && this.Ts < 400) this.rust = Math.min(1, this.rust + dt / (this.o.rustTime ?? 600));
      if (u && u.uTmax) {
        u.uTmax.value = this.Tmax; u.uTnow.value = this.Ts; u.uSoot.value = this.soot; u.uRust.value = this.rust;
        // nejsilnější oheň určuje přivrácenou stranu (v plameni se rozdíl stran stírá)
        let best = null, bq = 0;
        for (const s of w.fireList(this.src)) { const d2 = (s.x - this.pos.x) ** 2 + (s.z - this.pos.z) ** 2 + 0.05, k = s.Q / d2; if (k > bq) { bq = k; best = s; } }
        if (best && u.uHeatSrc) { u.uHeatSrc.value.set(best.x, best.y + best.L * 0.3, best.z); u.uObjC.value.set(this.pos.x, this.pos.y + (this.o.size ?? 0.9) * 0.5, this.pos.z); u.uHeatSide.value = Math.max(u.uHeatSide.value * 0.98, f.inFlame ? 0.3 : 1); }
      }
      this.state = this.Ts > 800 ? 'žhne' : this.Tmax > 620 ? 'lak shořel' : this.Tmax > 470 ? 'lak puchýřuje' : this.q > 1000 ? 'ohřívá se' : 'cold';
      return;
    }
    if (this.state === 'cold' || this.state === 'heating') {
      this.F = stepDose(this.F, this.q, dt, this.dose);
      this.state = this.F > 0.02 * this.dose.ftp ? 'heating' : 'cold';
      // před vznícením: pyrolýza – bílý dým z povrchu (viditelné varování; fotky a videa zkoušek vznícení) ★3
      if (this.state === 'heating' && this.heat > 0.3 && w.layers.smoke && w.bb) {
        this._sm = (this._sm || 0) + w.dtReal * 14 * this.heat * (w.tier.smokeMul ?? 1);
        while (this._sm >= 1) { this._sm -= 1; const s = this.o.size ?? 0.5, r = this.rnd; w.bb.spawnSmoke({ x: this.p[0] + (r() - 0.5) * s, y: this.p[1] + (r() - 0.3) * s * 0.5, z: this.p[2] + (r() - 0.5) * s, vy: 0.4 + 0.5 * r(), life: 1.6 + 1.5 * r(), s0: 0.05 * s + 0.03, s1: 0.5 * s + 0.2, tau: 0.25 * this.heat, albedo: [0.8, 0.8, 0.82], drag: 0.5 }); }
      }
      if (u) { u.uChar.value = Math.max(u.uChar.value, 0.18 * this.heat); }
      if (this.F >= this.dose.ftp) this.ignite();
      return;
    }
    if (this.state === 'burning') {
      const sp = this.spec, tl = w.scnTime - this.tIgn;
      this.burned = Math.min(1, tl / Math.max(sp.duration, 1));
      if (u) { u.uChar.value = Math.max(u.uChar.value, Math.min(1, 0.2 + 1.1 * Math.sqrt(this.burned))); u.uGlow.value = Math.min(1, tl / 20) * (this.burned < 0.85 ? 1 : 0.5); }
      if (tl >= sp.duration) { this.state = 'burnt'; if (this.src) this.src.enabled = false; if (u) { u.uChar.value = 1; u.uGlow.value = 0.25; } this.o.onBurnout?.(this); }
    }
  }
}
