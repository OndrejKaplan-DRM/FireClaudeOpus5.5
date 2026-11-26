// FXWorld: správa efektů a rozpočtů; FireSource (hořící zdroj řízený fyzikou); Explosion (výbuch s časovou osou).
import * as THREE from 'three';
import { BillboardSystem, SparkSystem, HazeSystem, AirField } from './particles.js';
import { FlameVolume } from './volume.js';
import { FireLights } from './lights.js';
import { bakeAtlas } from './bake.js';
import { Debris } from './debris.js';
import { Scorch } from './decal.js';
import { FUELS } from '../physics/fuels.js';
import * as C from '../physics/combustion.js';
import { flameTilt, WIND_CLASSES } from '../physics/wind.js';
import { shockTable, shockRadiusAt } from '../physics/blast.js';
import { mulberry32, fbm1 } from '../engine/rng.js';
import { bbRGB } from './lights.js';
import { FLAMEK, PRE } from './shared.js';

export const FLAME_LUM = 12000; // jas plamene [cd/m²] při 1500 K a ε = 1 (po vizuální kompresi teploty) – viz DECISIONS D-010

export class FXWorld {
  constructor(renderer, scene, tier, pipeline) {
    this.renderer = renderer; this.scene = scene; this.pipeline = pipeline;
    this.air = new AirField();
    this.time = 0; this.scnTime = 0; this.sources = []; this.explosions = []; this.decals = [];
    this.gustNoise = fbm1(77); this.o2 = 1; this.vent = C.ventilation(1);
    this.shake = 0; this.flameLum = FLAME_LUM;
    this.layers = { flame: true, smoke: true, sparks: true, haze: true, light: true, volume: true };
    this.setTier(tier);
  }

  setTier(tier) {
    this.tier = tier;
    for (const k of ['bb', 'sp', 'hz']) if (this[k]) { this.scene.remove(this[k].mesh); this[k].geo.dispose(); this[k].mat.dispose(); }
    if (this.vols) this.vols.forEach((v) => { this.scene.remove(v.mesh); v.mat.dispose(); });
    if (this.balls) this.balls.forEach((v) => { this.scene.remove(v.mesh); v.mat.dispose(); });
    if (this.atlasRT) this.atlasRT.dispose();
    this.atlasRT = bakeAtlas(this.renderer, { res: tier.flipbookRes, steps: tier.id >= 2 ? 64 : 40 });
    const depth = this.pipeline.depthTexture;
    this.bb = new BillboardSystem(tier.particles.flame + tier.particles.smoke, this.atlasRT.texture, { depth, sort: tier.sortSmoke });
    this.sp = new SparkSystem(tier.particles.spark);
    this.scene.add(this.bb.mesh, this.sp.mesh);
    this.hz = tier.particles.haze ? new HazeSystem(tier.particles.haze) : null;
    if (this.hz) this.scene.add(this.hz.mesh);
    this.vols = []; this.balls = [];
    for (let i = 0; i < tier.volumes; i++) { const v = new FlameVolume({ depth, steps: tier.volumeSteps }); v.mesh.visible = false; this.scene.add(v.mesh); this.vols.push(v); }
    for (let i = 0; i < Math.min(3, tier.volumes); i++) { const v = new FlameVolume({ ball: true, depth, steps: Math.round(tier.volumeSteps * 0.75) }); v.mesh.visible = false; this.scene.add(v.mesh); this.balls.push(v); }
    if (this.lights) this.lights.setTier(tier); else this.lights = new FireLights(this.scene, tier);
    if (this.debris) this.debris.dispose();
    this.debris = new Debris(this.scene, tier.debris);
    this.budgetScale = { flame: 1, smoke: 1, spark: 1 };
  }

  setWind(cls, dirRad = 0) {
    const w = WIND_CLASSES[cls]; this.windClass = cls;
    this.air.U10 = w.U10; this.air.dir = dirRad; this.air.gust = w.gust; this.air.turb = w.turb;
  }
  setOxygen(o2) { this.o2 = o2; this.vent = C.ventilation(o2); }

  clear() {
    for (const s of this.sources) s.dispose?.();
    this.sources = []; this.explosions = [];
    this.bb.clear(); this.sp.clear(); this.hz?.clear(); this.debris.clear();
    for (const d of this.decals) d.dispose(); this.decals = [];
    this.vols.forEach((v) => (v.mesh.visible = false)); this.balls.forEach((v) => (v.mesh.visible = false));
  }

  addSource(opts) { const s = new FireSource(this, opts); this.sources.push(s); return s; }
  addExplosion(opts) { const e = new Explosion(this, opts); this.explosions.push(e); return e; }
  addScorch(opts) { const d = new Scorch(this.scene, opts); this.decals.push(d); return d; }

  update(dt, camera) {
    this.time += dt;
    const a = this.air; a.time = this.time;
    a.gustNow = a.gust * this.gustNoise(this.time * 0.35);
    this.lights.begin();
    // rozpočty: poptávka z minulého snímku → škála
    const dem = { flame: 0, smoke: 0, spark: 0 };
    for (const s of this.sources) { dem.flame += s.demand.flame; dem.smoke += s.demand.smoke; dem.spark += s.demand.spark; }
    const capF = this.tier.particles.flame, capS = this.tier.particles.smoke, capP = this.tier.particles.spark;
    this.budgetScale.flame = Math.min(1, (capF * 0.92) / Math.max(dem.flame, 1));
    this.budgetScale.smoke = Math.min(1, (capS * 0.92) / Math.max(dem.smoke, 1));
    this.budgetScale.spark = Math.min(1, (capP * 0.92) / Math.max(dem.spark, 1));
    // přidělení objemů podle důležitosti
    const want = this.layers.volume ? this.sources.filter((s) => s.wantsVolume()) : [];
    const cp = camera.position;
    want.forEach((s) => { s._imp = (s.ph?.L || 1) / (s.pos.distanceTo(cp) + 0.5); });
    want.sort((x, y) => y._imp - x._imp);
    this.sources.forEach((s) => (s.vol = null));
    want.slice(0, this.vols.length).forEach((s, i) => (s.vol = this.vols[i]));
    this.vols.forEach((v) => (v.mesh.visible = false));
    for (const s of this.sources) s.update(dt, this.time);
    this.sources = this.sources.filter((s) => !s.dead);
    let bi = 0;
    this.balls.forEach((v) => (v.mesh.visible = false));
    for (const e of this.explosions) e.update(dt, this.time, e.wantsBall() && bi < this.balls.length ? this.balls[bi++] : null, camera);
    this.explosions = this.explosions.filter((e) => !e.dead);
    for (const d of this.decals) d.update(dt);
    const lights = this.lights.end(camera);
    this.bb.mesh.visible = this.layers.flame || this.layers.smoke;
    const dtex = this.pipeline.depthTexture;
    if (this.bb.mat.uniforms.tDepth.value !== dtex && dtex) this.bb.mat.uniforms.tDepth.value = dtex;
    for (const v of [...this.vols, ...this.balls]) if (dtex) v.u.tDepth.value = dtex;
    this.bb.pre = PRE.value;
    if (this.env) { const T = this.env.T, k = 1 / Math.PI; this.bb.mat.uniforms.uAmb.value.setRGB(0.75, 0.8, 0.95).multiplyScalar(T.hemi * k * 0.9); this.bb.mat.uniforms.uSunCol.value.setRGB(1, 0.95, 0.88).multiplyScalar((T.sun + T.moon) * k * 0.6); }
    this.bb.update(dt, a, camera, lights);
    this.bb.mat.uniforms.uFlameLum.value = this.flameLum; FLAMEK.value = this.flameLum; this.sp.mat.uniforms.uLum.value = this.flameLum;
    this.sp.viewportH = this.pipeline.size?.H || 720;
    this.sp.update(dt, a, camera); this.sp.mesh.visible = this.layers.sparks;
    if (this.hz) { this.hz.update(dt, a, this.time); this.hz.mesh.visible = this.layers.haze; }
    this.debris.update(dt, this);
    this.shake *= Math.exp(-dt * 6);
    for (const v of [...this.vols, ...this.balls]) v.u.uTime.value = this.time;
    if (!this.layers.light) this.lights.pool.forEach((l) => (l.intensity = 0));
  }

  stats() {
    return {
      flameSmoke: this.bb.n, sparks: this.sp.n, haze: this.hz ? this.hz.n : 0,
      volumes: this.vols.filter((v) => v.mesh.visible).length + this.balls.filter((v) => v.mesh.visible).length,
      lights: (this.lights.active || []).length, debris: this.debris.n,
      dropped: this.bb.dropped + this.sp.dropped,
    };
  }
}

// ---------------------------------------------------------------------------------------------------
/**
 * Hořící zdroj. Možnosti:
 *  pos, fuel, D [m] (průměr půdorysu), Q [W] nebo Q(t), footprint {type:'disk'|'rect', w, d, rot},
 *  L(Q) volitelná výška plamene, T volitelná teplota, mult {flame, smoke, embers, sparks, haze, light},
 *  volume (true/false), blue (modrá zóna 0..1), seed, start [s], end [s], ventLocal (vlastní ventilace o2), smokeLife
 */
export class FireSource {
  constructor(world, o) {
    this.w = world; this.o = { volume: true, blue: 0, start: 0, end: Infinity, footprint: { type: 'disk' }, mult: {}, ...o };
    this.o.mult = { flame: 1, smoke: 1, embers: 1, sparks: 1, haze: 1, light: 1, ...o.mult };
    this.pos = o.pos.clone ? o.pos.clone() : new THREE.Vector3(...o.pos);
    this.rnd = mulberry32(o.seed ?? 1); this.fl = fbm1((o.seed ?? 1) * 13 + 5);
    this.acc = { flame: 0, smoke: 0, ember: 0, spark: 0, haze: 0 };
    this.demand = { flame: 0, smoke: 0, spark: 0 };
    this.ph = null; this.vol = null; this.t0 = world.scnTime; this.enabled = true;
    this.fpScale = 1; this.D = typeof o.D === 'number' ? o.D : (o.footprint ? Math.sqrt((4 * (o.footprint.w || 1) * (o.footprint.d || 1)) / Math.PI) : 1);
  }
  get fuel() { return FUELS[this.o.fuel]; }
  wantsVolume() { return this.enabled && this.o.volume && this.ph && this.ph.Q > 1 && this.w.tier.volumes > 0 && this.active; }
  Qat(t) { const q = this.o.Q; return typeof q === 'function' ? q(t) : q; }

  /** Fyzikální stav v čase t (lokální čas zdroje) */
  physics(t) {
    const f = this.fuel, D = this.D, vent = this.o.ventLocal != null ? C.ventilation(this.o.ventLocal) : this.w.vent;
    const Q = Math.max(0, this.Qat(t)) * vent.chi;
    const Lb = this.o.L ? this.o.L(Q) : C.flameHeight(Q, D);
    const L = Lb * (1 + 0.35 * vent.lift);
    const U = this.w.air.windAt(Math.max(L * 0.5, 0.05) + this.pos.y);
    const tilt = flameTilt(U, Math.max(Q, 1), D);
    const T = this.o.T ?? C.flameColorTemp(this.o.fuel, vent);
    const fp = C.puffingFrequency(D);
    const Qc = ((1 - f.chiR) * Q) / 1000;
    const z0 = C.virtualOrigin(Math.max(Q, 1), D);
    const zs = L * 1.1 + D * 0.3;
    const sm = Q > 10 ? C.smokeOpticalDepth(Q, D, zs, this.o.fuel, vent) : { tau: 0, b: D };
    const col = C.smokeColor(this.o.fuel, vent);
    const I = C.flameLuminousIntensity(Q, T) * this.o.mult.light;
    return { Q, L, U, tilt, T, fp, Qc, z0, tau: sm.tau, b: sm.b, smoke: col, I, vent };
  }

  footprintPoint() {
    const r = this.rnd, fp = this.o.footprint, D = this.D, k = this.fpScale;
    let x, z;
    if (fp.type === 'rect') { x = (r() - 0.5) * fp.w * k; z = (r() - 0.5) * fp.d * k; const c = Math.cos(fp.rot || 0), s = Math.sin(fp.rot || 0); [x, z] = [x * c - z * s, x * s + z * c]; }
    else if (fp.type === 'points') { const p = fp.pts[(r() * fp.pts.length) | 0]; x = p[0] + (r() - 0.5) * (fp.jit || 0.2); z = p[1] + (r() - 0.5) * (fp.jit || 0.2); return [this.pos.x + x, (p[2] || 0) + this.pos.y, this.pos.z + z]; }
    else { const a = r() * 6.2832, rr = (D / 2) * Math.sqrt(r()); x = Math.cos(a) * rr; z = Math.sin(a) * rr; }
    return [this.pos.x + x, this.pos.y, this.pos.z + z];
  }

  get t() { return this.w.scnTime - this.t0; }
  update(dt, gt) {
    const lt = this.t;
    this.active = this.enabled && lt >= this.o.start && lt <= this.o.end;
    if (!this.active) { this.demand = { flame: 0, smoke: 0, spark: 0 }; return; }
    const tl = lt - this.o.start;
    this.fpScale = this.o.scale ? Math.max(0.02, this.o.scale(tl)) : 1;
    const fpo = this.o.footprint;
    this.D = typeof this.o.D === 'function' ? this.o.D(tl) : fpo.type === 'rect' ? Math.sqrt((4 * fpo.w * fpo.d * this.fpScale ** 2) / Math.PI) : this.o.D * this.fpScale;
    const ph = (this.ph = this.physics(tl));
    if (ph.Q <= 1) { this.demand = { flame: 0, smoke: 0, spark: 0 }; return; }
    const w = this.w, m = this.o.mult, f = this.fuel, r = this.rnd, D = this.D;
    const push = this.o.push || [0, 0, 0];
    const cw = Math.cos(w.air.dir), sw = Math.sin(w.air.dir);
    const lean = Math.tan(Math.min(ph.tilt.theta, 1.3));
    const flick = 0.8 + 0.2 * this.fl(gt * ph.fp * 0.6) + 0.12 * this.fl(gt * 0.4 + 9);
    // --- objem
    const useVol = this.vol && w.layers.volume;
    if (useVol) {
      const v = this.vol; v.mesh.visible = w.layers.flame;
      const Rz = this.o.footprint.type === 'rect' ? Math.max(this.o.footprint.d * this.fpScale, 0.1) / 2 : null;
      const Rx = this.o.footprint.type === 'rect' ? Math.max(this.o.footprint.w * this.fpScale, 0.1) / 2 : D / 2;
      v.place(this.pos, ph.L * (0.95 + 0.1 * flick), Math.max(Rx, 0.004), ph.tilt.theta, w.air.dir, ph.tilt.drag, Rz);
      const u = v.u;
      u.uTpeak.value = ph.T + 80; u.uTamb.value = 700;
      u.uIntensity.value = w.flameLum * (1.3 / Math.max(D * 0.7 + ph.L * 0.15, 0.01)) * flick;
      u.uSigma.value = 0.6 / Math.max(D, 0.02);
      u.uSeed.value = (this.o.seed ?? 1) * 0.37;
      const sc = Math.max(D, ph.L * 0.35);
      u.uTurb.value.set(this.o.turbAmp ?? 0.5 + 0.25 * ph.vent.lift, sc * 0.55, Math.max(ph.L * ph.fp * 0.9, 0.05), 0.25 + 0.1 * w.air.turb + 0.25 * ph.vent.lift);
      u.uPuff.value.set(ph.fp, this.o.puffAmp ?? 0.5);
      u.uShape.value.y = this.o.taper ?? 0.85; u.uShape.value.z = this.o.baseWide ?? 0.25; u.uShape.value.w = this.o.neck ?? 0.2;
      u.uSoot.value = Math.min(1.5, f.ys * ph.vent.sootMul * 18);
      u.uBlue.value = this.o.blue; u.uLift.value = ph.vent.lift;
    }
    // --- jazyky plamene (sprity)
    const L = ph.L;
    // jazyky: rodí se u paty, za život urazí výšku plamene (střední rychlost v plameni ~1,5 Q^(1/5), McCaffrey ★3)
    const uf = 1.5 * Math.pow(ph.Q / 1000, 0.2);
    const life = Math.min(2.5, Math.max(0.22, L / uf));
    const s0 = 1.45 * Math.max(Math.min(0.9 * L, Math.max(0.5 * L, 0.65 * D)), 0.004); // jazyk v atlasu zabírá ~60 % buňky
    let nF = Math.min(160, 5 + 4 * (D / s0) ** 2 * (L / s0)) * m.flame * (useVol ? 0.3 : 1);
    if (this.o.tongues) nF = this.o.tongues * (useVol ? 0.3 : 1);
    this.demand.flame = nF;
    if (w.layers.flame && !(useVol && this.o.volumeOnly)) {
      this.acc.flame += (nF * w.budgetScale.flame * dt) / life;
      while (this.acc.flame >= 1) {
        this.acc.flame -= 1;
        const [x, y, z] = this.footprintPoint();
        const up = (L / life) * 0.75;
        if (D > 1.2 && r() < 0.35) {
          const h = L * (0.25 + 0.5 * r());
          w.bb.spawnFirePuff({ x: x + lean * h * cw, y: y + h, z: z + lean * h * sw, vx: up * lean * cw + push[0], vy: up * 0.8 + push[1], vz: up * lean * sw + push[2], life: life * (0.8 + 0.6 * r()), s0: s0 * 0.7, s1: s0 * 1.1, T: ph.T * (0.95 + 0.1 * r()), lum: flick * 0.8, soot: Math.min(1, f.ys * ph.vent.sootMul * 10), drag: life * 3, seed: r() });
          continue;
        }
        w.bb.spawnFlame({
          x, y: y + L * 0.08 * r(), z, vx: up * lean * cw + push[0], vy: up + push[1], vz: up * lean * sw + push[2],
          life: life * (0.75 + 0.5 * r()), s0: s0 * (0.8 + 0.4 * r()), s1: s0 * 0.55, T: ph.T + (r() - 0.5) * 100,
          lum: flick * 0.75, tint: [1, 1, 1],
          ox: this.pos.x, oz: this.pos.z, pq: 0, pz0: 0, drag: life * 4, stretch: 0.6 + ph.tilt.us * 0.1, R0: D / 2,
          seed: r(),
        });
      }
    }
    // --- kouř
    const smokeLife = (this.o.smokeLife ?? 1) * Math.min(28, Math.max(2.5, 4 + Math.sqrt(ph.Q / 1e5) * 3));
    const nS = Math.min(700, 8 + 22 * Math.sqrt(ph.Q / 1e5)) * m.smoke;
    this.demand.smoke = ph.tau > 0.003 ? nS : 0;
    if (w.layers.smoke && ph.tau > 0.003) {
      this.acc.smoke += (nS * w.budgetScale.smoke * dt) / smokeLife;
      const zs = this.pos.y + L * (0.75 + 0.3 * r());
      const b = Math.max(ph.b, D * 0.35, 0.02);
      while (this.acc.smoke >= 1) {
        this.acc.smoke -= 1;
        const [x, , z] = this.footprintPoint();
        const k = 0.45 + 0.4 * r();
        const s0s = b * (1.2 + 0.6 * r());
        // viditelná optická tloušťka sloupce → τ jedné částice (překryv ~3)
        const tau0 = Math.min(8, ph.tau * 0.5 * (1 / Math.max(this.w.budgetScale.smoke, 0.25)) ** 0.5);
        w.bb.spawnSmoke({
          x: x + lean * L * cw * k + push[0] * 0.3, y: zs, z: z + lean * L * sw * k + push[2] * 0.3, vx: push[0] * 0.5, vy: Math.max(1, L * ph.fp * 0.5), vz: push[2] * 0.5,
          life: smokeLife * (0.7 + 0.6 * r()), s0: s0s, s1: s0s * (4 + 4 * r()) + smokeLife * 0.15, tau: tau0,
          albedo: ph.smoke.rgb, ox: this.pos.x, oz: this.pos.z, pq: ph.Qc, pz0: this.pos.y + ph.z0, drag: 0.5, seed: r(), R0: D / 2,
          glowing: ph.vent.lift > 0.5 && r() < 0.3,
        });
      }
    }
    // --- žhavé uhlíky a jiskry
    const qk = Math.sqrt(ph.Q / 1e5);
    const rE = f.embers * 10 * qk * m.embers, rS = f.sparks * 4 * qk * m.sparks;
    this.demand.spark = (rE * 4 + rS * 1);
    if (w.layers.sparks) {
      this.acc.ember += rE * w.budgetScale.spark * dt;
      while (this.acc.ember >= 1) {
        this.acc.ember -= 1;
        const [x, y, z] = this.footprintPoint();
        w.sp.spawn({
          x, y: y + L * r() * 0.6, z, vx: (r() - 0.5) * 0.6, vy: 1 + r() * Math.min(6, L * 1.5), vz: (r() - 0.5) * 0.6,
          life: 2 + 5 * r(), T: 1050 + 220 * r(), tauC: 1.8 + 3 * r(), size: 0.0015 + 0.004 * r(), drag: 0.4 + r(), grav: 0.35,
          ox: this.pos.x, oz: this.pos.z, pq: ph.Qc, pz0: this.pos.y + ph.z0, seed: r(), R0: D / 2,
        });
      }
      this.acc.spark += rS * w.budgetScale.spark * dt;
      while (this.acc.spark >= 1) {
        this.acc.spark -= 1;
        const [x, y, z] = this.footprintPoint();
        const a = r() * 6.283, sp = 2 + 5 * r();
        w.sp.spawn({
          x, y: y + L * 0.15, z, vx: Math.cos(a) * sp * 0.5, vy: sp * (0.6 + 0.4 * r()), vz: Math.sin(a) * sp * 0.5,
          life: 0.5 + r(), T: 1350 + 250 * r(), tauC: 0.4, size: 0.001, drag: 0.9, grav: 1, seed: r(),
        });
      }
    }
    // --- horký vzduch
    if (w.hz && w.layers.haze) {
      this.acc.haze += Math.min(14, 3 + qk * 4) * m.haze * dt;
      while (this.acc.haze >= 1) {
        this.acc.haze -= 1;
        const [x, y, z] = this.footprintPoint();
        w.hz.spawn({ x, y: y + L * (0.7 + 0.5 * r()), z, vy: 1.5, life: 1.2 + r(), size: Math.max(L * 0.7, D * 1.2), ox: this.pos.x, oz: this.pos.z, pq: ph.Qc, pz0: this.pos.y + ph.z0, R0: D / 2 });
      }
    }
    // --- světlo
    const lh = this.o.lightH ?? 0.65;
    w.lights.add(this.pos.x + lean * L * lh * cw, this.pos.y + L * lh, this.pos.z + lean * L * lh * sw, ph.I * flick, ph.T - 80, Math.max(D * 0.6, L * 0.5));
  }
}

// ---------------------------------------------------------------------------------------------------
/**
 * Výbuch. o = { pos, W (kg TNT pro tlak), fireball: {D, t, T, rise, soot, kind}, flash [cd], debris: {n, speed, size, hot, mat},
 *  sparks: {n, speed}, smoke: {n, life, size, albedo, buoy}, dust: bool, scorch: radius, after: fn(world) }
 */
export class Explosion {
  constructor(world, o) {
    this.w = world; this.o = o; this.t = 0; this.pos = o.pos.clone ? o.pos.clone() : new THREE.Vector3(...o.pos);
    this.rnd = mulberry32(o.seed ?? 5);
    this.table = o.W > 0 ? shockTable(o.W, Math.max(60, Math.cbrt(o.W) * 60)) : null;
    this.started = false; this.dustAcc = 0; this.smokeAcc = 0; this.dead = false; this.fbAcc = 0;
    this.camHit = false;
  }
  wantsBall() { const fb = this.o.fireball; return fb && this.t < fb.t * 2.2 && this.w.tier.volumes > 0 && this.w.layers.volume; }
  update(dt, gt, ball, camera) {
    const w = this.w, o = this.o, r = this.rnd, fb = o.fireball;
    this.t += dt; const t = this.t;
    if (!this.started) {
      this.started = true;
      if (o.debris) w.debris.burst(this.pos, o.debris, r);
      if (o.sparks) for (let i = 0; i < o.sparks.n * w.budgetScale.spark; i++) {
        const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u), v = o.sparks.speed * (0.4 + 0.6 * r());
        w.sp.spawn({ x: this.pos.x, y: this.pos.y + 0.1, z: this.pos.z, vx: Math.cos(a) * s * v, vy: Math.abs(u) * v * 0.8 + 1, vz: Math.sin(a) * s * v, life: 0.4 + r() * 1.4, T: 1600 + 600 * r(), tauC: 0.35 + r() * 0.4, size: 0.003 + r() * 0.01, drag: 1.5 + r() * 3, grav: 1, seed: r() });
      }
      if (o.scorch) w.addScorch({ pos: this.pos, radius: o.scorch, seed: o.seed, crater: o.crater || 0 });
    }
    // ohnivá koule
    if (fb) {
      const Rmax = fb.D / 2, tf = fb.t;
      const grow = 1 - Math.exp(-t / (0.12 * tf + 0.005));
      const R = Rmax * grow * (1 + 0.15 * Math.min(t / tf, 2));
      const age = Math.min(1, t / (tf * 2.0));
      const yc = this.pos.y + Math.max(R * 0.85, (fb.rise || 0) * Math.min(1, t / (tf * 2.5)) + R * 0.6);
      this.fbR = R; this.fbY = yc;
      if (ball && t < tf * 2.2) {
        ball.mesh.visible = true;
        const S = R * 2.3;
        ball.mesh.position.set(this.pos.x, yc - S / 2, this.pos.z); ball.mesh.rotation.set(0, 0, 0); ball.mesh.scale.set(S, S, S);
        const u = ball.u; u.uScale.value.set(S, S, S);
        u.uAge.value = age; u.uTpeak.value = fb.T; u.uTamb.value = 700;
        u.uIntensity.value = w.flameLum * 1.8 / Math.max(R, 0.05) * (1 - age * 0.6);
        u.uSigma.value = 0.8 / Math.max(R, 0.05);
        u.uSoot.value = (fb.soot ?? 0.5) * 2.0 / Math.max(R, 0.1) * 0.5;
        u.uTurb.value.set(0.5, Math.max(R * 0.6, 0.05), Math.max(R / tf * 0.4, 0.2), 0);
        u.uSeed.value = (o.seed ?? 5) * 0.21;
      } else if (t < tf * 1.6 && w.layers.flame) {
        // T0/T1: ohnivá koule ze spritů
        this.fbAcc += dt * (90 / Math.max(tf, 0.05)) * w.budgetScale.flame;
        while (this.fbAcc >= 1) {
          this.fbAcc -= 1;
          const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u), rr = R * Math.cbrt(r()) * 0.75;
          const out = (R / tf) * 0.4;
          w.bb.spawnFirePuff({ x: this.pos.x + Math.cos(a) * s * rr, y: yc + u * rr, z: this.pos.z + Math.sin(a) * s * rr, vx: Math.cos(a) * s * out, vy: R / tf * 0.3 + u * out, vz: Math.sin(a) * s * out, life: tf * (0.7 + 0.8 * r()) + 0.05, s0: R * 0.55, s1: R * 0.9, T: fb.T * (1 - age * 0.3) * (0.9 + 0.2 * r()), lum: 1, soot: (fb.soot ?? 0.5) * 0.6, drag: 0.5, seed: r() });
        }
      }
      // světlo: záblesk + žár koule (W∝R², T⁴)
      const Ifb = (o.flash || 1e5) * Math.exp(-t / (0.25 * tf + 0.004)) + C.flameLuminousIntensity(fb.D * fb.D * 4e5 * Math.max(0, 1 - t / (tf * 1.8)), fb.T * (1 - age * 0.4));
      if (t < tf * 3) w.lights.add(this.pos.x, yc, this.pos.z, Ifb, fb.T * (1 - age * 0.3), R * 0.7 + 0.1);
      // kouř z koule (houba)
      if (o.smoke && t > tf * 0.4 && t < tf * 0.4 + (o.smoke.dur || tf * 3)) {
        this.smokeAcc += dt * (o.smoke.n / (o.smoke.dur || tf * 3)) * w.budgetScale.smoke;
        while (this.smokeAcc >= 1) {
          this.smokeAcc -= 1;
          const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u), rr = R * (0.4 + 0.6 * r());
          w.bb.spawnSmoke({ x: this.pos.x + Math.cos(a) * s * rr, y: yc + u * rr * 0.7, z: this.pos.z + Math.sin(a) * s * rr, vx: Math.cos(a) * s * 0.5, vy: (o.smoke.buoy ?? 4), vz: Math.sin(a) * s * 0.5, life: o.smoke.life * (0.6 + 0.6 * r()), s0: R * 0.5, s1: R * (1.4 + r()), tau: o.smoke.tau ?? 2, albedo: o.smoke.albedo, drag: 1.2, buoy: o.smoke.buoyAcc ?? 1.5, seed: r() });
        }
      }
    }
    // rázová vlna
    if (this.table) {
      const s = shockRadiusAt(this.table, t);
      this.shockR = s.R; this.shockPs = s.Ps;
      if (s.Ps > 2500 && w.hz && w.layers.haze && t < 3) w.hz.spawn({ x: this.pos.x, y: this.pos.y + s.R * 0.3, z: this.pos.z, vy: 0, life: 0.06, size: s.R * 2.2, ring: 1 });
      if (o.dust && s.Ps > 2500 && t < 4) {
        this.dustAcc += dt * 600 * w.budgetScale.smoke * Math.min(1, s.Ps / 3e4);
        while (this.dustAcc >= 1) {
          this.dustAcc -= 1;
          const a = r() * 6.283;
          w.bb.spawnSmoke({ x: this.pos.x + Math.cos(a) * s.R, y: 0.2 + r() * 0.5, z: this.pos.z + Math.sin(a) * s.R, vx: Math.cos(a) * 6, vy: 1 + r() * 2, vz: Math.sin(a) * 6, life: 4 + 6 * r(), s0: 0.5 + Math.cbrt(o.W) * 0.15, s1: 2 + Math.cbrt(o.W) * 0.6, tau: 0.8, albedo: o.dustAlbedo || [0.32, 0.27, 0.2], drag: 0.8, seed: r() });
        }
      }
      // otřes kamery při průchodu čela
      const dc = camera.position.distanceTo(this.pos);
      if (!this.camHit && s.R >= dc) { this.camHit = true; w.shake = Math.min(1.2, Math.max(w.shake, (s.Ps / 2e4) ** 0.5)); this.camPs = s.Ps; }
    }
    if (o.after && !this.afterDone && t > (o.afterT ?? 0.2)) { this.afterDone = true; o.after(w, this); }
    if (t > (o.life || 30)) this.dead = true;
  }
}
