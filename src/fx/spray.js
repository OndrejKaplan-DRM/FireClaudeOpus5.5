// Proud hasiva (iterace 7): viditelné kapky / pěna / prášek + účinek na ohně v dosahu podle physics/suppress.js.
// Hasivo × třída požáru rozhoduje, zda oheň slábne, nebo se zhorší (voda na hořící kov nebo benzín).
import * as THREE from 'three';
import { AGENTS, suppressStep, fireClass, L_WATER, agentEffect } from '../physics/suppress.js';
import { mulberry32 } from '../engine/rng.js';

const LOOK = { cool: [0.7, 0.8, 0.9], smother: [0.95, 0.95, 0.93], inhibit: [0.93, 0.9, 0.8], dilute: [0.9, 0.92, 0.95] };

export class Spray {
  /** o = { agent, rate [kg/s] (výchozí z AGENTS), from: Vector3 (proudnice), to: Vector3 (kam míří), radius [m] zásahu, on } */
  constructor(world, o) {
    this.w = world; this.o = o; this.agent = o.agent; this.a = AGENTS[o.agent]; this.rate = o.rate ?? this.a.rate;
    this.from = o.from.clone(); this.to = o.to.clone(); this.radius = o.radius ?? 0.8; this.on = o.on ?? true;
    this.rnd = mulberry32(o.seed ?? 5); this.acc = 0; this.used = 0; this.steam = 0; this.note = ''; this.foam = null;
  }
  update(dt) {
    const w = this.w; this.steam = 0;
    if (!this.on || (this.a.total && this.used >= this.a.total)) { this.active = false; return; }
    this.active = true; this.used += this.rate * dt;
    const r = this.rnd, a = this.a, d = this.to.clone().sub(this.from), dist = d.length(), col = LOOK[a.mode];
    // --- viditelný proud: kapky po balistické dráze (rychlost z dostřiku), mlha a prášek jako rozptýlený kužel
    const v0 = Math.max(6, Math.sqrt(9.81 * Math.max(dist, 1)) * 1.25), tf = dist / v0, wide = this.agent === 'waterFog' || a.mode !== 'cool' ? 0.16 : 0.035;
    if (w.layers.smoke && w.bb) {
      this.acc += w.dtReal * Math.min(260, 60 + 90 * Math.sqrt(this.rate)) * (w.tier.smokeMul ?? 1) * Math.max(0.3, w.budgetScale.smoke);
      const dir = d.clone().multiplyScalar(1 / Math.max(dist, 1e-3));
      while (this.acc >= 1) {
        this.acc -= 1;
        const vx = dir.x * v0 + (r() - 0.5) * v0 * wide * 2, vz = dir.z * v0 + (r() - 0.5) * v0 * wide * 2, vy = dir.y * v0 + 0.5 * 9.81 * tf + (r() - 0.5) * v0 * wide * 2;
        w.bb.spawnSmoke({ x: this.from.x, y: this.from.y, z: this.from.z, vx, vy, vz, life: tf * (0.85 + 0.3 * r()), s0: 0.03 + 0.03 * Math.sqrt(this.rate), s1: (0.18 + 0.5 * wide * dist) * (0.8 + 0.5 * r()), tau: a.mode === 'cool' ? 0.35 : 0.9, albedo: col, drag: 0.02, grav: 1 });
      }
    }
    // --- účinek: hořlavé předměty v dosahu (dodávka dělená plochou) a volné zdroje
    const hitB = w.burnables.filter((b) => !b.inert && Math.hypot(b.pos.x - this.to.x, b.pos.z - this.to.z) <= this.radius + (b.o.size ?? 0.5) * 0.5);
    const hitS = w.sources.filter((s) => !s.owner && s.enabled && s.active && s.ph && s.ph.Q > 1 && Math.hypot(s.pos.x - this.to.x, s.pos.z - this.to.z) <= this.radius + s.D * 0.5);
    const sum = hitB.reduce((x, b) => x + (b.o.area ?? 1), 0) + hitS.reduce((x, s) => x + Math.PI * s.D * s.D / 4, 0) || 1;
    for (const b of hitB) b.agent = { agent: this.agent, rate: (this.rate * (b.o.area ?? 1)) / sum };
    for (const s of hitS) {
      const A = Math.PI * s.D * s.D / 4, cls = fireClass(s.o.fuel), Q0 = s.ph.Q / Math.max(s.suppK ?? 1, 0.05);
      s.supp = suppressStep(s.supp || {}, { Q0, A, agent: this.agent, rate: (this.rate * A) / sum, cls, dt: w.scnDt ?? dt, qExt: 0 });
      s.suppK = Math.min(2.5, Math.max(0, 1 - s.supp.s)); this.steam += s.supp.steam; this.note = s.supp.note || this.note;
      if (s.supp.out) { s.enabled = false; w.events.push({ t: w.scnTime, type: 'extinguished', label: s.o.label || 'oheň', cause: a.name }); }
      // zhoršení: voda na hořící kapalinu nebo kov → rozstřik hořících kapek a záblesk
      if (s.supp.s < -0.2 && w.layers.sparks && r() < dt * 30) for (let i = 0; i < 6; i++) w.sp.spawn({ x: s.pos.x, y: s.pos.y + 0.1, z: s.pos.z, vx: (r() - 0.5) * 9, vy: 2 + 6 * r(), vz: (r() - 0.5) * 9, life: 0.4 + 0.8 * r(), T: cls === 'D' ? 3000 : 1500, tauC: 1.2, size: 0.006, drag: 0.8, grav: 1, seed: r() });
    }
    for (const b of hitB) { this.steam += b.body.steam; if (b.body.note) this.note = b.body.note; }
    if (!hitB.length && !hitS.length) this.note = '';
    // --- pára v místě dopadu (jen chladicí hasiva na horký povrch) a pěnový koberec
    if (a.mode === 'cool' && this.steam > 0 && w.layers.smoke && w.bb) {
      this._st = (this._st || 0) + w.dtReal * Math.min(80, 8 + 50 * this.steam) * (w.tier.smokeMul ?? 1) * Math.max(0.3, w.budgetScale.smoke);
      while (this._st >= 1) { this._st -= 1; w.bb.spawnSmoke({ x: this.to.x + (r() - 0.5) * this.radius * 1.6, y: this.to.y + 0.2 + r() * 0.8, z: this.to.z + (r() - 0.5) * this.radius * 1.6, vx: (r() - 0.5), vy: 1.5 + 2 * r(), vz: (r() - 0.5), life: 1.5 + 2 * r(), s0: 0.25, s1: 1.2 + this.radius, tau: 0.55, albedo: [0.93, 0.94, 0.96], drag: 0.6 }); }
    }
    if (this.agent === 'foam' || this.agent === 'sand') {
      if (!this.foam) this.foam = w.addScorch({ pos: new THREE.Vector3(this.to.x, 0.004, this.to.z), radius: this.radius * 1.5, rate: 0, grow: 0.01, seed: 3, color: this.agent === 'foam' ? [0.9, 0.9, 0.86] : [0.55, 0.47, 0.33] });
      this.foam.u.uGrow.value = Math.min(1, this.foam.u.uGrow.value + dt / (this.agent === 'foam' ? 45 : 12));
    }
  }
  /** Řádky pro UI: co hasivo dělá s tím, co hoří. */
  rows(cls, Q, A = 1) {
    const e = agentEffect(this.agent, cls);
    return [['Hasivo', `${this.a.name}, ${(this.rate * 60).toFixed(0)} ${this.a.mode === 'cool' || this.agent === 'foam' ? 'l' : 'kg'}/min`, ''], ['Účinek na třídu ' + cls, e.k > 0 ? `hasí (×${e.k})` : e.k < 0 ? 'ZHORŠUJE' : 'žádný', e.note],
      ...(this.a.mode === 'cool' ? [['Chladicí výkon', ((this.rate * this.a.eta * L_WATER) / 1e6).toFixed(2) + ' MW', `η = ${this.a.eta}, 2,6 MJ/kg ★3`], ['Pára', (this.steam * 1.7).toFixed(2) + ' m³/s', '1 kg → 1,7 m³ ★5']] : [])];
  }
}
