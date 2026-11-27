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
import { FLAMEK, PRE, GTIME, sharedUniforms, GLSL_COMMON } from './shared.js';
import { LAYER_FX } from '../engine/pipeline.js';

/** Normální rozdělení N(0,1) z generátoru r (Box–Muller). */
const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-9))) * Math.cos(6.2831853 * r());

export const FLAME_LUM = 20000; // jas plamene [cd/m²] při 1500 K a ε = 1 (po vizuální kompresi teploty) – viz DECISIONS D-010

export class FXWorld {
  constructor(renderer, scene, tier, pipeline) {
    this.renderer = renderer; this.scene = scene; this.pipeline = pipeline;
    this.air = new AirField();
    this.time = 0; this.scnTime = 0; this.sources = []; this.explosions = []; this.decals = [];
    this.gustNoise = fbm1(77); this.o2 = 1; this.vent = C.ventilation(1);
    this.shake = 0; this.flameLum = FLAME_LUM; this.lumRef = 12000; // lumRef: původní klíč 16/expozice (výbuchy, jiskry, žhnutí) – vzhled sudu beze změny
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
    this._flowOut = [0, 0, 0];
    this.sp.trail = this.bb; this.sp.trailMul = Math.sqrt(tier.emberMul ?? 1); // hořící oharky kreslí plamínek a kouř do bb
    this.scene.add(this.bb.mesh, this.sp.mesh);
    this.hz = tier.particles.haze ? new HazeSystem(tier.particles.haze) : null;
    if (this.hz) this.scene.add(this.hz.mesh);
    this.vols = []; this.balls = [];
    const mrt = !!(tier.volumeTAA && depth); // časová akumulace objemů (pipeline.vol), jen s hloubkou scény
    for (let i = 0; i < tier.volumes; i++) { const v = new FlameVolume({ depth, steps: tier.volumeSteps, mrt }); v.mesh.visible = false; this.scene.add(v.mesh); this.vols.push(v); }
    for (let i = 0; i < Math.min(3, tier.volumes); i++) { const v = new FlameVolume({ ball: true, depth, steps: Math.round(tier.volumeSteps * 0.75), mrt }); v.mesh.visible = false; this.scene.add(v.mesh); this.balls.push(v); }
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
    for (const e of this.explosions) e.dispose?.();
    this.sources = []; this.explosions = [];
    this.bb.clear(); this.sp.clear(); this.hz?.clear(); this.debris.clear();
    for (const d of this.decals) d.dispose(); this.decals = [];
    this.vols.forEach((v) => (v.mesh.visible = false)); this.balls.forEach((v) => (v.mesh.visible = false));
  }

  addSource(opts) { const s = new FireSource(this, opts); this.sources.push(s); return s; }
  addExplosion(opts) { const e = new Explosion(this, opts); this.explosions.push(e); return e; }
  addScorch(opts) { const d = new Scorch(this.scene, opts); this.decals.push(d); return d; }

  update(dt, camera) {
    this.time += dt; GTIME.value = this.time;
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
    for (const e of this.explosions) if (e.dead) e.dispose();
    this.explosions = this.explosions.filter((e) => !e.dead);
    for (const d of this.decals) d.update(dt);
    // proudění od výbuchů (houbový mrak: vírový prstenec + nasávání u země) – přidá se k větru všech částic
    const flows = this.explosions.filter((e) => e.mf);
    a.extraUp = flows.length ? (x, y, z) => { const o = this._flowOut; o[0] = o[1] = o[2] = 0; for (const e of flows) e.flow(x, y, z, o); return o; } : null;
    const lights = this.lights.end(camera);
    this.bb.mesh.visible = this.layers.flame || this.layers.smoke;
    const dtex = this.pipeline.depthTexture;
    if (this.bb.mat.uniforms.tDepth.value !== dtex && dtex) this.bb.mat.uniforms.tDepth.value = dtex;
    for (const v of [...this.vols, ...this.balls]) if (dtex) v.u.tDepth.value = dtex;
    this.bb.pre = PRE.value;
    if (this.env) { const T = this.env.T, k = 1 / Math.PI; this.bb.mat.uniforms.uAmb.value.setRGB(0.75, 0.8, 0.95).multiplyScalar(T.hemi * k * 0.9); this.bb.mat.uniforms.uSunCol.value.setRGB(1, 0.95, 0.88).multiplyScalar((T.sun + T.moon) * k * 0.6); }
    this.bb.update(dt, a, camera, lights);
    this.bb.mat.uniforms.uFlameLum.value = this.lumRef; FLAMEK.value = this.lumRef; this.sp.mat.uniforms.uLum.value = this.lumRef;
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

  /** Hořící oharek z ohniště (scénáře: rozvalení hranice, zřícení střechy). sc = měřítko rychlosti. */
  spawnBrand(sc = 1, at = null) {
    const w = this.w, r = this.rnd, ph = this.ph, L = ph?.L ?? 1, D = this.D ?? 0.5;
    const [x, y, z] = at ?? this.footprintPoint();
    // velikost log-normálně, medián ~12 mm; zuhelnatělé dřevo ρ ≈ 300 kg/m³, C_D ≈ 1 → v_t ≈ √(4ρ g d / 3ρa) ★3–4
    const dm = Math.min(0.035, Math.max(0.005, 0.012 * Math.exp(0.55 * gauss(r))));
    const vt = Math.sqrt((4 * 300 * 9.81 * dm) / 3.6);
    const a = r() * 6.283, sp = (1 + 2.5 * r()) * sc, up = (2 + 4 * r()) * sc * Math.min(1.6, 0.6 + L * 0.3);
    w.sp.spawn({
      x: x + (r() - 0.5) * D * 0.3, y: y + L * (0.1 + 0.3 * r()), z: z + (r() - 0.5) * D * 0.3,
      vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp,
      life: 3 + 5 * r() + dm * 120, T: 1050 + 200 * r(), size: dm, drag: vt / 9.81, grav: 1, seed: r(),
      ox: this.pos.x, oz: this.pos.z, pq: ph ? ph.Qc * 0.5 : 0, pz0: this.pos.y + (ph?.z0 ?? 0), R0: D / 2,
      ember: true, vt, brand: 0.25 + 0.4 * r(), smokeRGB: [0.2 + 0.1 * r()],
    });
  }
  /** Dávka oharků najednou (zřícení, rozvalení) – n kusů, rychlost × sc. */
  brandBurst(n, sc = 1.5, at = null) {
    const k = Math.round(n * Math.sqrt(this.w.tier.emberMul ?? 1) * this.w.budgetScale.spark);
    for (let i = 0; i < k; i++) this.spawnBrand(sc * (0.6 + 0.8 * this.rnd()), at);
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
    // vzplanutí: náhodné krátké zesílení (kapsy pryskyřice, plyn z rozkladu, poryv) – Poissonův proces, rozpad τ 0,45 s.
    // Četnost podle paliva (dřevo, sláma častěji; louže zřídka) – vzhled podle videí ★2, semínko zdroje → deterministické
    const flareRate = { straw: 0.25, woodDry: 0.14, woodResin: 0.18, forestLitter: 0.2, brush: 0.2, houseContents: 0.1, vehicle: 0.08, rubber: 0.06, paraffin: 0 }[this.o.fuel] ?? 0.03;
    this.flare = (this.flare || 0) * Math.exp(-dt / 0.45);
    let flared = false;
    if (r() < flareRate * dt) { this.flare = Math.min(1, this.flare + 0.35 + 0.45 * r()); flared = true; }
    const flick = (0.8 + 0.2 * this.fl(gt * ph.fp * 0.6) + 0.12 * this.fl(gt * 0.4 + 9)) * (1 + 0.5 * this.flare);
    const kE = 2.7 * (f.fv ?? 0.6) * (0.7 + 0.6 * Math.min(1, ph.vent.sootMul - 0.5));
    // opticky tlustý plamen (τ_D = κ·D/2 ≫ 1) má jas černého tělesa po celé ploše; oko se na takový zdroj adaptuje
    // víc než na tenký jazyk svíčky → zisk (1 + 0,6(τ−1))^−0,6 (umělecké ★2, D-020); platí pro objem i sprity
    const tauD = kE * D * 0.5;
    // opticky tenký plamen (τ_D < 1): na fotkách přesto „ostrý“ a žlutý – expozice ho přepálí; bez zesílení by byl
    // průsvitný a měkký (jas ∝ délka dráhy). Zisk (1/τ)^0,5 do 2× (umělecké ★2, iterace 4 podle fotek)
    this.gainVol = tauD < 1 ? Math.min(2, Math.pow(1 / Math.max(tauD, 0.05), 0.5)) : Math.pow(1 + 0.6 * Math.max(0, tauD - 1), -(w.gainExp ?? 0.6));
    const Tvis = (f.Tlum ?? ph.T + 80) - ph.vent.tempDrop - 60; // barva spritů podle svítivých zón
    const kSpr = this.gainVol * w.flameLum / Math.max(w.lumRef, 1e-6); // sprity sdílejí uniformu lumRef s výbuchy
    // --- objem
    const useVol = this.vol && w.layers.volume;
    if (useVol) {
      const v = this.vol; v.mesh.visible = w.layers.flame;
      const Rz = this.o.footprint.type === 'rect' ? Math.max(this.o.footprint.d * this.fpScale, 0.1) / 2 : null;
      const Rx = this.o.footprint.type === 'rect' ? Math.max(this.o.footprint.w * this.fpScale, 0.1) / 2 : D / 2;
      v.place(this.pos, ph.L * (0.95 + 0.1 * flick + 0.2 * this.flare), Math.max(Rx, 0.004), ph.tilt.theta, w.air.dir, ph.tilt.drag, Rz);
      const u = v.u, tier = w.tier;
      u.uTpeak.value = (f.Tlum ?? ph.T + 80) - ph.vent.tempDrop + (w.tBoost ?? 50); u.uTamb.value = 700;
      // zdrojová funkce = Planck × jas po adaptaci; svítivost řídí κ ze sazí (emise–absorpce), ne ruční normalizace
      u.uIntensity.value = w.flameLum * flick * this.gainVol;
      u.uFlame2.value.set(kE,
        Math.min(1, Math.max(0, (D - 1.5) / 4)) * Math.min(1, f.ys * ph.vent.sootMul * 20), tier.flameEdge ?? 0.14, (0.65 + 0.2 * w.air.turb) * (1 - 0.45 * Math.min(1, Math.max(0, (3 - ph.L / Math.max(D, 0.01)) * 0.5))));
      this._volR = Math.max(Rx, 0.004);
      u.uSigma.value = 0.6 / Math.max(D, 0.02);
      u.uSigmaSoot.value = 3.0 / Math.max(Math.sqrt(D), 0.1);
      u.uSeed.value = (this.o.seed ?? 1) * 0.37;
      const eddy = Math.max(D, ph.L * 0.3) * 0.42;
      const U = 1.75 * Math.pow(ph.Q / 1000, 0.2); // rychlost v přerušované zóně (McCaffrey 1,93 Q^⅕) ★4
      const bigK = Math.min(1, Math.max(0, (3 - ph.L / Math.max(D, 0.01)) * 0.5));
      u.uTurb.value.set(this.o.turbAmp ?? 0.55 + 0.25 * ph.vent.lift + 0.3 * bigK, eddy, Math.max(U, 0.05), (this.o.wobble ?? 0.25) + 0.1 * w.air.turb + 0.25 * ph.vent.lift);
      u.uFlowL.value = Math.max(ph.L, 0.01);
      u.uShapeK.value = this.o.shapeK ?? Math.min(2.2, Math.max(1, 1 + (3 - ph.L / Math.max(D, 0.01)) * 0.5));
      // počet jazyků: malé zdroje (svíčka, louč) jedna obálka; ohniště 3–5, velké požáry až 7 (+ sloup)
      u.uTongues.value = this.o.volTongues ?? (D < 0.12 ? 0 : Math.min(7, Math.max(3, Math.round(2.5 + D * 1.4))));
      u.uDetail.value = tier.volumeDetail ?? 1;
      const sc = v.mesh.scale, boxMax = Math.max(sc.x, sc.y, sc.z);
      // krok: zlomek víru, ale opticky ne tlustší než ~0,6 (jinak třpytivý povrch z rozptylu prvního zásahu)
      u.uStepLen.value = Math.max(Math.min(eddy * 0.1, 0.6 / Math.max(kE, 0.1)), boxMax / tier.volumeSteps * 0.85);
      // okraj nesmí být ostřejší než krok paprsku (jinak „zrnité“ okraje bez TAA)
      // okraj: plamen má ostré hrany (fotky: 10–90 % přechodu v cm) – měkkost v metrech, ne v poměru k poloměru;
      // dolní mez dává krok paprsku (jinak zrno), u malých plamenů (svíčka) platí poměr ze stupně
      const edgeM = tier.flameEdgeM ?? 0.05;
      u.uFlame2.value.z = Math.max(Math.min(tier.flameEdge ?? 0.14, edgeM / this._volR), (1.3 * u.uStepLen.value) / this._volR * 0.5);
      u.uPuff.value.set(ph.fp, this.o.puffAmp ?? 0.5);
      u.uShape.value.y = this.o.taper ?? 0.85; u.uShape.value.z = this.o.baseWide ?? 0.25; u.uShape.value.w = this.o.neck ?? 0.2;
      u.uSoot.value = Math.min(1.0, f.ys * ph.vent.sootMul * 18);
      u.uBlue.value = this.o.blue; u.uLift.value = ph.vent.lift;
    }
    // --- jazyky plamene (sprity)
    const L = ph.L;
    // jazyky: rodí se u paty, za život urazí výšku plamene (střední rychlost v plameni ~1,5 Q^(1/5), McCaffrey ★3)
    const uf = 1.5 * Math.pow(ph.Q / 1000, 0.2);
    const life = Math.min(2.5, Math.max(0.22, L / uf));
    const s0 = 1.45 * Math.max(Math.min(0.9 * L, Math.max(0.5 * L, 0.65 * D)), 0.004); // jazyk v atlasu zabírá ~60 % buňky
    let nF = Math.min(160, 5 + 4 * (D / s0) ** 2 * (L / s0)) * m.flame * (useVol ? 0.5 : 1);
    if (this.o.tongues) nF = this.o.tongues * (useVol ? 0.5 : 1);
    this.demand.flame = nF;
    if (w.layers.flame && !(useVol && this.o.volumeOnly)) {
      this.acc.flame += (nF * w.budgetScale.flame * dt) / life;
      while (this.acc.flame >= 1) {
        this.acc.flame -= 1;
        const [x, y, z] = this.footprintPoint();
        const up = (L / life) * 0.75;
        if (useVol) {
          // s objemem jen odtržené plaménky nad hrotem (přerušovaná zóna): malé, krátce žijící, bez „květákových“ puffů
          const h = L * (0.55 + 0.45 * r()), sz = s0 * (0.18 + 0.14 * r());
          w.bb.spawnFlame({
            x: x * 0.6 + this.pos.x * 0.4 + lean * h * cw, y: y + h, z: z * 0.6 + this.pos.z * 0.4 + lean * h * sw,
            vx: up * lean * cw + push[0], vy: up * 1.2 + push[1], vz: up * lean * sw + push[2],
            life: life * (0.25 + 0.2 * r()), s0: sz, s1: sz * 0.3, T: Tvis + (r() - 0.5) * 80, lum: flick * 0.6 * kSpr, tint: [1, 1, 1],
            ox: this.pos.x, oz: this.pos.z, pq: 0, pz0: 0, drag: life * 4, stretch: 0.8, R0: D / 2, seed: r(),
          });
          continue;
        }
        if (D > 1.2 && r() < 0.35) {
          const h = L * (0.25 + 0.5 * r());
          w.bb.spawnFirePuff({ x: x + lean * h * cw, y: y + h, z: z + lean * h * sw, vx: up * lean * cw + push[0], vy: up * 0.8 + push[1], vz: up * lean * sw + push[2], life: life * (0.8 + 0.6 * r()), s0: s0 * 0.7, s1: s0 * 1.1, T: Tvis * (0.95 + 0.1 * r()), lum: flick * 0.8 * kSpr, soot: Math.min(1, f.ys * ph.vent.sootMul * 10), drag: life * 3, seed: r() });
          continue;
        }
        w.bb.spawnFlame({
          x, y: y + L * 0.08 * r(), z, vx: up * lean * cw + push[0], vy: up + push[1], vz: up * lean * sw + push[2],
          life: life * (0.75 + 0.5 * r()), s0: s0 * (0.8 + 0.4 * r()), s1: s0 * 0.55, T: Tvis + (r() - 0.5) * 100,
          lum: flick * 0.75 * kSpr, tint: [1, 1, 1],
          ox: this.pos.x, oz: this.pos.z, pq: 0, pz0: 0, drag: life * 4, stretch: 0.6 + ph.tilt.us * 0.1, R0: D / 2,
          seed: r(),
        });
      }
    }
    // --- kouř
    const smokeLife = (this.o.smokeLife ?? 1) * Math.min(28, Math.max(2.5, 4 + Math.sqrt(ph.Q / 1e5) * 3));
    const sMul = w.tier.smokeMul ?? 1;
    const nS = Math.min(700 * sMul, (8 + 22 * Math.sqrt(ph.Q / 1e5)) * sMul) * m.smoke;
    this.demand.smoke = ph.tau > 0.003 ? nS : 0;
    if (w.layers.smoke && ph.tau > 0.003) {
      this.acc.smoke += (nS * w.budgetScale.smoke * dt) / smokeLife;
      const zs = this.pos.y + L * (0.75 + 0.3 * r());
      const b = Math.max(ph.b, D * 0.35, 0.02);
      while (this.acc.smoke >= 1) {
        this.acc.smoke -= 1;
        const [x, , z] = this.footprintPoint();
        const k = 0.45 + 0.4 * r();
        const s0s = b * (1.2 + 0.6 * r()) / Math.pow(sMul, 0.25);
        // viditelná optická tloušťka sloupce → τ jedné částice (překryv ~3)
        // víc částic → menší τ každé (překryv roste ∝ hustota emise); celková τ sloupce zůstává podle fyziky
        const tau0 = Math.min(8, ph.tau * 0.5 * (1 / Math.max(this.w.budgetScale.smoke * sMul, 0.25)) ** 0.7);
        w.bb.spawnSmoke({
          x: x + lean * L * cw * k + push[0] * 0.3, y: zs, z: z + lean * L * sw * k + push[2] * 0.3, vx: push[0] * 0.5, vy: Math.max(1, L * ph.fp * 0.5), vz: push[2] * 0.5,
          life: smokeLife * (0.7 + 0.6 * r()), s0: s0s, s1: s0s * (4 + 4 * r()) + smokeLife * 0.15, tau: tau0,
          albedo: ph.smoke.rgb, ox: this.pos.x, oz: this.pos.z, pq: ph.Qc, pz0: this.pos.y + ph.z0, drag: 0.5, seed: r(), R0: D / 2,
          glowing: ph.vent.lift > 0.5 && r() < 0.3,
        });
      }
    }
    // --- žhavé uhlíky a jiskry
    const qk = Math.sqrt(ph.Q / 1e5), eMul = w.tier.emberMul ?? 1;
    const rE = f.embers * 10 * qk * m.embers * eMul, rS = f.sparks * 4 * qk * m.sparks * eMul;
    this.demand.spark = (rE * 4 + rS * 1);
    if (w.layers.sparks) {
      this.acc.ember += rE * w.budgetScale.spark * dt;
      while (this.acc.ember >= 1) {
        this.acc.ember -= 1;
        const [x, y, z] = this.footprintPoint();
        // velikost uhlíků log-normálně (Manzello: medián ~1–2 mm, ojediněle cm) ★3; zuhelnatělé dřevo ρ ≈ 250 kg/m³
        const dm = Math.min(0.012, Math.max(0.0006, 0.0016 * Math.exp(0.65 * gauss(r))));
        const vt = Math.sqrt((4 * 250 * 9.81 * dm) / (3 * 1.2 * 1.0)); // pádová rychlost (C_D ≈ 1) ★4
        w.sp.spawn({
          x, y: y + L * r() * 0.5, z, vx: (r() - 0.5) * 0.8, vy: 0.5 + r() * Math.min(5, L * 1.2), vz: (r() - 0.5) * 0.8,
          life: Math.min(14, 1.5 + dm * 1600 * (0.6 + 0.8 * r())), T: 1000 + 200 * r(), size: dm * 1.2, drag: vt / 9.81, grav: 1,
          ox: this.pos.x, oz: this.pos.z, pq: ph.Qc, pz0: this.pos.y + ph.z0, seed: r(), R0: D / 2, ember: true, vt,
        });
      }
      // praskání dřeva: vlhkost a pryskyřice v pórech → výstřel 6–24 drobných jisker z jednoho bodu (jen dřevo, sláma)
      if (f.sparks >= 0.2 && f.embers > 0.3) {
        this.acc.pop = (this.acc.pop || 0) + 0.25 * qk * m.sparks * Math.min(1.5, eMul) * dt;
        if (this.acc.pop >= 1 && r() < 0.5) {
          this.acc.pop = 0;
          const [px, py, pz] = this.footprintPoint(), cnt = Math.round((6 + 18 * r()) * Math.min(1.5, eMul) * w.budgetScale.spark);
          const ay = 0.6 + 0.4 * r(), az = r() * 6.283;
          for (let k = 0; k < cnt; k++) {
            const a = az + (r() - 0.5) * 2.2, el = ay + (r() - 0.5) * 0.7, sp = 3 + 6 * r();
            const dm = 0.0003 + 0.0006 * r(), vt = Math.sqrt((4 * 300 * 9.81 * dm) / 3.6);
            w.sp.spawn({
              x: px, y: py + L * 0.08 * r() + 0.02, z: pz, vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp, vz: Math.sin(a) * Math.cos(el) * sp,
              life: 0.5 + 1.1 * r(), T: 1400 + 150 * r(), tauC: 0.5 + 0.5 * r(), size: dm, drag: vt / 9.81, grav: 1, seed: r(),
            });
          }
        }
      }
      // hořící oharky (drobky dřeva, kůra, kusy izolace): větší kusy 6–30 mm s vlastním plamínkem a kouřovou stopou.
      // Ze dřeva odlétají hlavně při vzplanutí a praskání (Manzello 2020: firebrandy cm velikosti u větších požárů) ★2–3
      if (f.embers > 0.3 && m.embers > 0) {
        const eB = Math.sqrt(eMul) * w.budgetScale.spark;
        this.acc.brand = (this.acc.brand || 0) + 0.45 * f.embers * qk * eB * dt;
        let nb = 0;
        while (this.acc.brand >= 1) { this.acc.brand -= 1; nb++; }
        if (flared && r() < 0.6) nb += 1 + Math.floor(r() * 2.5 * Math.min(2, qk));
        for (let k = 0; k < nb; k++) this.spawnBrand(r() < 0.5 ? 1 : 0.6);
      }
      // sazový výron: při vzplanutí sazového plamene se nad špičkou utrhne hustý černý chuchvalec (fotky pneumatik, nafty) ★2
      if (flared && (f.ys ?? 0) > 0.03 && w.layers.smoke !== false) {
        const nS = Math.round((4 + 4 * r()) * Math.min(2, this.w.budgetScale.smoke * (w.tier.smokeMul ?? 1)));
        for (let k = 0; k < nS; k++) {
          const [x, , z] = this.footprintPoint(), s0 = D * (0.25 + 0.2 * r());
          w.bb.spawnSmoke({
            x: x * 0.6 + this.pos.x * 0.4 + push[0] * 0.3, y: this.pos.y + L * (0.75 + 0.35 * r()), z: z * 0.6 + this.pos.z * 0.4 + push[2] * 0.3,
            vx: (r() - 0.5) * 0.5, vy: Math.max(1.2, L * ph.fp * 0.6), vz: (r() - 0.5) * 0.5, life: 4 + 3 * r(), s0, s1: s0 * 5 + D,
            tau: 3 + 3 * r(), albedo: [0.05, 0.048, 0.046], ox: this.pos.x, oz: this.pos.z, pq: ph.Qc, pz0: this.pos.y + ph.z0, drag: 0.5, seed: r(), R0: D / 2,
          });
        }
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
    w.lights.add(this.pos.x + lean * L * lh * cw, this.pos.y + L * lh, this.pos.z + lean * L * lh * sw, ph.I * flick, (f.Tlum ?? ph.T + 80) - ph.vent.tempDrop - 40, Math.max(D * 0.6, L * 0.5), ph.tau / Math.max(2 * ph.b, 0.05));
  }
}

// ---------------------------------------------------------------------------------------------------
/**
 * Výbuch. o = { pos, W (kg TNT pro tlak), fireball: {D, t, T, rise, soot, kind}, flash [cd], debris: {n, speed, size, hot, mat},
 *  sparks: {n, speed}, smoke: {n, life, size, albedo, buoy}, dust: bool, scorch: radius, after: fn(world) }
 */
/** Kondenzační dóm (Wilsonův mrak): polokoule s šumem, okraj jasnější (delší dráha tenkou vrstvou). */
function makeWilsonDome() {
  const u = { ...sharedUniforms(), uA: { value: 0 }, uCov: { value: 0.35 }, uTime: { value: 0 }, uAmb: { value: new THREE.Color() }, uSun: { value: new THREE.Color() } };
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: u,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `out vec3 vW; out vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `precision highp float; precision highp sampler3D;
${GLSL_COMMON}
in vec3 vW; in vec3 vN; out vec4 o; uniform float uA, uTime, uCov; uniform vec3 uAmb, uSun;
void main(){
  vec3 v = normalize(cameraPosition - vW);
  float rim = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
  // mraky z videí zkoušek: hladký bílý plášť s jemnými pruhy, jasnější lem, u země řidší (teplý vzduch nad terénem)
  vec3 nN = normalize(vN);
  float n = 0.65 * fbm3(nN * 3.0 + vec3(0.0, uTime * 0.05, 0.0)) + 0.35 * fbm3(vW * 0.05);
  // tenký plášť: střed průsvitný, jasný lem (delší dráha paprsku v plášti) – fotky Sailor Hat, Minor Scale
  float a = uA * (0.04 + 0.96 * pow(rim, 0.75)) * mix(0.45, 1.0, smoothstep(uCov, uCov + 0.45, n)) * smoothstep(0.02, 0.3, nN.y) * (gl_FrontFacing ? 1.0 : 0.6);
  // kondenzát (kapky ~µm) má albedo ~0,8 a na slunci září bíle jasněji než obloha
  vec3 c = (uAmb * 1.1 + uSun * (0.8 + 0.9 * max(dot(nN, normalize(vec3(0.3, 1.0, 0.2))), 0.0))) * 1.6 * uPreExp;
  o = fxOut(vec4(c * a, a));
}`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  mesh.layers.set(LAYER_FX); mesh.renderOrder = 4; mesh.frustumCulled = false;
  return { mesh, u };
}

export class Explosion {
  constructor(world, o) {
    this.w = world; this.o = o; this.t = 0; this.pos = o.pos.clone ? o.pos.clone() : new THREE.Vector3(...o.pos);
    this.rnd = mulberry32(o.seed ?? 5);
    this.table = o.W > 0 ? shockTable(o.W, Math.max(60, Math.cbrt(o.W) * 60)) : null;
    this.started = false; this.dustAcc = 0; this.smokeAcc = 0; this.dead = false; this.fbAcc = 0;
    this.camHit = false;
  }
  dispose() { if (this.wc) { this.w.scene.remove(this.wc.mesh); this.wc.mesh.geometry.dispose(); this.wc.mesh.material.dispose(); this.wc = null; } }
  /** Rychlostní pole houbového mraku v bodě (přičte do out): rotace kolem jádra prstence, stoupání klobouku, sloupec, přítok. */
  flow(x, y, z, out) {
    const m = this.mf, dx = x - m.x, dz = z - m.z, r = Math.sqrt(dx * dx + dz * dz) + 1e-3, ex = dx / r, ez = dz / r;
    const pr = r - m.a, pz = y - m.zc, d = Math.sqrt(pr * pr + pz * pz) + 1e-3, c = 0.5 * m.a;
    const Vc = 1.3 * m.w * m.k, sp = d < c ? (Vc * d) / c : Vc * (c / d) * Math.exp(-(d - c) / (1.2 * c));
    let vr = (sp * pz) / d, vy = (-0.6 * sp * pr) / d;   // zploštělé jádro: klobouk širší než vyšší (záznamy zkoušek) ★2                         // uvnitř nahoru, nahoře ven, venku dolů, dole dovnitř
    vy += m.w * Math.exp(-(r * r) / (3.2 * m.a * m.a) - (pz * pz) / (1.7 * m.a * m.a));   // klobouk stoupá jako celek
    if (y < m.zc) { const rs = 0.26 * m.a + 2; vy += 1.4 * m.w * m.k * Math.exp(-(r * r) / (rs * rs)); } // sloupec
    const hg = 0.08 * (m.zc - m.y0) + 2;
    if (r > 0.12 * m.a) vr -= 0.55 * m.w * m.k * Math.min(1, m.a / r) * Math.exp(-Math.max(y - m.y0, 0) / hg); // přítok u země
    out[0] += vr * ex; out[1] += vy; out[2] += vr * ez;
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
      // výtrysky zeminy u výbuchu na zemi (škálovaná výška h/W^⅓ < 0,5 m/kg^⅓): 8–14 paprsků pod 35–70°,
      // rychlost v0 ≈ 12·W^⅙ m/s (★2, řád podle Cooper: ejecta 10–100 m/s), zemina po balistické dráze, prach se odtrhává
      if (o.dust && o.W > 0 && this.pos.y / Math.cbrt(o.W) < 0.5) {
        const k = Math.cbrt(o.W), nJ = Math.round(8 + 6 * Math.min(1, k / 4)), v0 = 12 * Math.pow(o.W, 1 / 6);
        const soil = (o.dustAlbedo || [0.32, 0.27, 0.2]).map((c) => c * 0.7);
        const per = Math.max(5, Math.round(22 * Math.min(1.5, w.tier.smokeMul ?? 1) * w.budgetScale.smoke));
        // hroudy zeminy: tmavé kusy po balistické dráze (fotky trhacích prací: stovky černých teček v oblaku) ★3
        w.debris.burst(this.pos, { n: Math.round((50 + 60 * Math.min(4, k)) * Math.min(2, w.tier.smokeMul ?? 1)), speed: v0 * 1.3, size: 0.012 + 0.025 * Math.min(4, k), hot: 0, up: 0.7 }, r);
        for (let j = 0; j < nJ; j++) {
          const az = (j / nJ) * 6.283 + (r() - 0.5) * 0.5, el = 0.6 + 0.6 * r(), vj = v0 * (0.75 + 0.5 * r());
          for (let i = 0; i < per; i++) {
            const f = 0.3 + 0.7 * Math.pow(r(), 0.7), v = vj * f, e = el + (r() - 0.5) * 0.12, a = az + (r() - 0.5) * 0.12;
            w.bb.spawnSmoke({ x: this.pos.x, y: Math.max(0.05, this.pos.y), z: this.pos.z, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * Math.cos(e) * v,
              life: 2.5 + 3 * r(), s0: 0.07 * k + 0.06, s1: (0.5 + 0.7 * r()) * k + 0.35, tau: 2.2 + r(), albedo: soil, drag: 0.9 + 0.9 * f, grav: 0.85, seed: r() });
          }
        }
      }
      // vyvržená zemina a prach z kráteru (hustý prstenec u středu, rozlet ven)
      if (o.dust && o.W > 0) {
        const k = Math.cbrt(o.W), n = Math.min(260, 40 + 50 * k) * w.budgetScale.smoke;
        for (let i = 0; i < n; i++) {
          const a = r() * 6.283, rr = 0.3 * k * r(), v = (2 + 6 * r()) * Math.min(3, 0.6 + k * 0.4);
          w.bb.spawnSmoke({ x: this.pos.x + Math.cos(a) * rr, y: 0.1 + r() * 0.3 * k, z: this.pos.z + Math.sin(a) * rr, vx: Math.cos(a) * v, vy: 0.5 + r() * 2 * k, vz: Math.sin(a) * v, life: 4 + 6 * r(), s0: 0.25 + 0.35 * k, s1: 1 + 1.6 * k, tau: 1.4, albedo: o.dustAlbedo || [0.32, 0.27, 0.2], drag: 0.7, seed: r() });
        }
      }
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
        u.uIntensity.value = w.lumRef * 1.8 / Math.max(R, 0.05) * (1 - age * 0.6);
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
          w.bb.spawnSmoke({ x: this.pos.x + Math.cos(a) * s * rr, y: yc + u * rr * 0.7, z: this.pos.z + Math.sin(a) * s * rr, vx: Math.cos(a) * s * 0.5, vy: (o.smoke.buoy ?? 4), vz: Math.sin(a) * s * 0.5, life: o.smoke.life * (0.6 + 0.6 * r()), s0: R * 0.5, s1: R * (1.4 + r()), tau: o.smoke.tau ?? 2, albedo: o.smoke.albedo, drag: o.mushroom ? 1.5 : 1.2, buoy: o.mushroom ? 0.2 : o.smoke.buoyAcc ?? 1.5, seed: r() });
        }
      }
    }
    // dohořívání produktů s nedostatkem kyslíku (TNT, Comp B): oranžové kapsy v tmavém mraku 1–3 tf (★2)
    if (fb && (fb.soot ?? 0.5) >= 0.8 && t > fb.t && t < fb.t * 3.2 && w.layers.flame && this.fbR) {
      const R = this.fbR, rate = (70 / fb.t) * (1 - (t - fb.t) / (fb.t * 2.2)) * w.budgetScale.flame;
      this.abAcc = (this.abAcc || 0) + dt * Math.max(0, rate);
      while (this.abAcc >= 1) {
        this.abAcc -= 1;
        const u = r() * 2 - 1, a = r() * 6.283, sn = Math.sqrt(1 - u * u), rr = R * Math.cbrt(r()) * 0.7;
        w.bb.spawnFirePuff({ x: this.pos.x + Math.cos(a) * sn * rr, y: this.fbY + u * rr * 0.8, z: this.pos.z + Math.sin(a) * sn * rr, vx: 0, vy: R / fb.t * 0.15, vz: 0,
          life: fb.t * (0.5 + 0.7 * r()), s0: R * 0.25, s1: R * 0.45, T: 1250 + 250 * r(), lum: 0.7, soot: 0.8, drag: 0.6, seed: r() });
      }
    }
    // houbový mrak (velké nálože na zemi): ohnivá koule se mění v termiku – vírový prstenec, který stoupá jako
    // z ≈ c·(B t²)^¼ (Morton–Taylor–Turner, Scorer; B = g·E_t/(ρ c_p T), E_t ≈ 35 % energie, c ≈ 1,8) ★2,
    // poloměr prstence ≈ 0,3 z (úhel rozšiřování termiky) ★3; pod ním sloupec prachu nasátého přízemním přítokem ★2
    if (o.mushroom && fb && o.W > 0) {
      const E = 4.184e6 * o.W, B = (9.81 * 0.35 * E) / (1.2 * 1005 * 290), tt = Math.max(t - fb.t * 0.5, 0.05);
      const zr = 1.8 * Math.pow(B * tt * tt, 0.25), y0 = this.pos.y;
      const zc = Math.max(this.fbY ?? y0, y0 + zr), wv = (0.5 * zr) / tt;
      this.mf = { x: this.pos.x, z: this.pos.z, y0, zc, a: Math.max(fb.D * 0.45, 0.34 * (zc - y0)), w: Math.min(wv, 25), k: Math.exp(-t / 50) };
      // prachový sloupec: zemina a prach zvířené přítokem u paty, stoupají osou do klobouku
      if (o.dust && t > fb.t * 1.5 && t < 30) {
        const m = this.mf;
        this.stemAcc = (this.stemAcc || 0) + dt * 32 * Math.min(1.5, w.tier.smokeMul ?? 1) * w.budgetScale.smoke * Math.exp(-t / 12);
        while (this.stemAcc >= 1) {
          this.stemAcc -= 1;
          const a = r() * 6.283, rr = m.a * (0.15 + 1.2 * Math.sqrt(r()));
          w.bb.spawnSmoke({ x: m.x + Math.cos(a) * rr, y: 0.3 + r() * 1.5, z: m.z + Math.sin(a) * rr, vx: -Math.cos(a) * 2, vy: 1 + 2 * r(), vz: -Math.sin(a) * 2,
            life: 18 + 12 * r(), s0: 0.06 * m.a + 1, s1: 0.35 * m.a + 3, tau: 1.1 + 0.8 * r(), albedo: (o.dustAlbedo || [0.32, 0.27, 0.2]).map((c) => c * (0.6 + 0.25 * r())), drag: 1.0, seed: r() });
        }
      }
    }
    // rázová vlna
    if (this.table) {
      const s = shockRadiusAt(this.table, t);
      this.shockR = s.R; this.shockPs = s.Ps;
      // Wilsonův kondenzační mrak: ve vlhkém vzduchu za čelem (podtlaková fáze) kondenzuje pára → tenká bílá
      // polokoule, jen velké nálože (≥ 50 kg TNT), mezi ~70 a ~25 kPa, rozplyne se za ~0,3 s (★2, vzhled podle záznamů zkoušek).
      // Jedna polokoule (ne částice): z vnitřku je to slabý závoj, zvenku dóm s jasnějším okrajem.
      if (o.W >= 50 && fb) {
        // o.wilson > 1: výraznější „filmový“ dóm (Ondřej, iterace 4: varianta b) – umělecké ★1
        const hum = o.humidity ?? 0.6, wf = o.wilson ?? 1, on = s.Ps < (wf > 1 ? 8e4 : 7e4) && s.Ps > (wf > 1 ? 1.8e4 : 2.5e4) && s.R > fb.D * 0.6;
        if (on && !this.wc && !this.wcDone) { this.wc = makeWilsonDome(); w.scene.add(this.wc.mesh); this.wcT = 0; }
        if (this.wc) {
          this.wcT += dt;
          const fade = on ? Math.min(1, this.wcT / 0.05) : Math.max(0, (this.wcA ?? 1) - dt / (wf > 1 ? 0.55 : 0.3));
          this.wcA = fade;
          const m = this.wc.mesh; m.position.copy(this.pos); m.position.y = 0; m.scale.setScalar(s.R * 0.95);
          // zevnitř je kondenzace jen opar kolem pozorovatele – dóm se kreslí, jen když je kamera venku
          const outside = Math.min(1, Math.max(0, (camera.position.distanceTo(this.pos) - s.R) / (0.15 * s.R)));
          const u = this.wc.u; u.uA.value = fade * hum * Math.min(0.8, 0.3 * wf) * outside; u.uTime.value = t; u.uCov.value = wf > 1 ? 0.22 : 0.35;
          u.uAmb.value.copy(w.bb.mat.uniforms.uAmb.value); u.uSun.value.copy(w.bb.mat.uniforms.uSunCol.value);
          if (fade <= 0 && !on) { w.scene.remove(m); m.geometry.dispose(); m.material.dispose(); this.wc = null; this.wcDone = true; }
        }
      }
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
