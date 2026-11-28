// SIMULACE OHNĚ BEZ GRAFIKY (iterace 7): jádro použitelné ve hře, v testu, na serveru i v tabulce.
//   const sim = new FireSim({ wind: { speed: 3, dir: 0 }, maxFires: 32 });
//   sim.addObject({ id: 'paleta', pos: [0, 0, 0], material: 'softwood', mass: 22, area: 3.5, size: 1.2, ignited: true });
//   sim.addObject({ id: 'sud',    pos: [2, 0, 0], material: 'steelPainted', explosive: { spec: { kind: 'fireball', mass: 25 }, cookT: 620 } });
//   sim.addAgent({ agent: 'waterJet', rate: 3.3, target: 'paleta', from: 120, until: 180 });
//   for (let t = 0; t < 600; t += 0.5) for (const e of sim.step(0.5)) console.log(e.t, e.type, e.id);
// Všechno jsou čisté výpočty nad physics/* (žádné Three.js, žádná náhoda bez seedu). Vizuální vrstva (fx/burnable.js)
// používá tentýž stavový automat `ThermalBody`, takže hra a simulace dávají stejné časy vznícení.
//
// Co model umí: tok tepla od všech ohňů (sálání, kontakt, vlečka) → dávka do vznícení → vlastní oheň z materiálu a hmotnosti
// → vyhoření; plech (teplota, saze, rez), sklo (prasknutí, vypadnutí), tavení kovů, zdivo (saze, čistý výpal);
// hašení (hasivo × třída požáru); nálože a nádoby (výbuch teplem, rázem nebo střepinami → řetěz); strop počtu ohňů.
// Co neumí: stínění překážkami, vedení tepla uvnitř předmětu, proudění v místnosti, šíření po povrchu jednoho předmětu.
import { AMB } from './combustion.js';
import { material } from './materials.js';
import { ignitionDose, stepDose, stepSheetTemp, sootRate, fluxAt, stepGlass, meltStep, SIGMA } from './heat.js';
import { fireSpec, explosionSpec } from './spec.js';
import { overpressure } from './blast.js';
import { flameTilt } from './wind.js';
import { suppressStep, fireClass, AGENTS } from './suppress.js';

/** Rovnovážná teplota povrchu stěny při toku q″ (ztráty jen z jedné strany). */
function wallEquilibrium(q, eps = 0.9, h = 12) {
  let lo = AMB.T, hi = 1800;
  for (let i = 0; i < 30; i++) { const T = (lo + hi) / 2; if (eps * q - eps * SIGMA * (T ** 4 - AMB.T ** 4) - h * (T - AMB.T) > 0) lo = T; else hi = T; }
  return (lo + hi) / 2;
}

/**
 * Kdy výbuch odpálí sousední nálož (sympatetická detonace). R [m], W [kg TNT] dárce. ★2
 *  R ≤ 0,5·W^⅓  ráz ji odpálí hned;  do 2,4·W^⅓ ji mohou odpálit střepiny (jen dárce v plášti), pravděpodobnost klesá
 *  se vzdáleností;  dál jen teplo. 2,4·Q^⅓ je vzdálenost NATO mezi sklady bez valu (AASTP-1) – tady hranice „už spíš ne“.
 */
export function sympathetic(R, W, { cased = false, shockK = 0.5, fragK = 2.4 } = {}) {
  const c = Math.cbrt(Math.max(W, 1e-9)), Rs = shockK * c, Rf = fragK * c;
  if (R <= Rs) return { mode: 'ráz', p: 1, delay: R / 6000 };
  if (cased && R <= Rf) return { mode: 'střepiny', p: 0.85 * (1 - (R - Rs) / (Rf - Rs)), delay: R / 1500 + 0.01 };
  return { mode: 'nic', p: 0, delay: 0 };
}

/**
 * Účinek výbuchu na okolní předměty (společné pro simulaci i vizuální vrstvu). es = výsledek explosionSpec, pos = [x,y,z].
 * Mění stav skla a malých plamenů, ponoří předměty v ohnivé kouli a vrací { events, pending: [{ delay, body, cause }] }.
 */
export function blastOn(bodies, es, pos, { cased = false, rnd = Math.random, src = null, t = 0 } = {}) {
  const events = [], pending = [], fbR = es.ex?.fireball ? es.ex.fireball.D / 2 : 0, fbT = es.ex?.fireball?.t ?? 0;
  for (const b of bodies) {
    if (b === src || b.exploded) continue;
    const R = Math.max(0.05, Math.hypot(b.p[0] - pos[0], b.p[1] - pos[1], b.p[2] - pos[2])), P = es.W > 0 ? overpressure(R, es.W) : 0;
    if (b.glass && b.glass.state !== 'vypadlé' && P >= 3500) { b.glass.state = 'vypadlé'; b.state = 'vypadlé'; events.push({ type: 'fallout', id: b.id, body: b, cause: 'tlak', kPa: P / 1000 }); } // okna praskají od 1–7 kPa ★4
    if (b.burning && P >= 20e3 && b.Qnow() < 2e5) { b.state = 'uhašeno'; b.F = 0; events.push({ type: 'extinguished', id: b.id, body: b, cause: 'tlaková vlna' }); } // sfouknutí malého plamene ★2
    if (b.ex && !b.ex.done) {
      const sy = sympathetic(R, es.W, { cased: cased || !!b.ex.fragile, shockK: b.ex.shockK, fragK: b.ex.fragK });
      if (sy.p > 0 && rnd() < sy.p) { b.ex.done = true; pending.push({ delay: sy.delay, body: b, cause: sy.mode }); }
    }
    if (R <= fbR && fbT > 0) for (const e of b.step({ q: 200e3, Tg: 1500, inFlame: true, tau: 1 }, fbT, t)) { if (e.type === 'explode') pending.push({ delay: 0.05 + 0.2 * rnd(), body: b, cause: 'ohnivá koule' }); else events.push({ id: b.id, body: b, ...e, cause: 'ohnivá koule' }); }
  }
  return { events, pending };
}

/** Jeden předmět ve světě ohně: hořlavý, nebo jen ohřívaný (plech, sklo, kov, zdivo), případně s náloží uvnitř. */
export class ThermalBody {
  /** o = { id, pos: [x,y,z], material, mass, area, size, height, probe: [dx,dy,dz], D, ignited, spec, explosive, rustTime, label } */
  constructor(o) {
    this.o = o; this.id = o.id; this.mat = material(o.material); this.label = o.label || this.mat.name;
    const p = o.pos; this.pos = [p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z];
    const pr = o.probe || [0, o.height ?? (o.size ?? 0.5) * 0.5, 0];
    this.p = [this.pos[0] + pr[0], this.pos[1] + pr[1], this.pos[2] + pr[2]];
    this.dose = ignitionDose(this.mat); this.F = 0; this.cls = fireClass(this.mat);
    this.state = 'cold'; this.q = 0; this.Tg = AMB.T; this.tIgn = null; this.tb = 0; this.burned = 0; this.spec = null;
    this.Ts = AMB.T; this.Tmax = AMB.T; this.soot = 0; this.rust = 0; this.melt = 0; this.glass = this.mat.look === 'glass' ? { T: AMB.T, state: 'celé' } : null;
    this.supp = { s: 0, wet: 0, out: false }; this.steam = 0; this.note = '';
    this.ex = o.explosive ? { cookT: 520, done: false, Tc: AMB.T, rcd: 7850 * 490 * 0.003, ...o.explosive } : null;
    if (o.ignited) this.ignite(0);
  }
  get inert() { return this.mat.mode === 'inert'; }
  get burning() { return this.state === 'burning'; }
  /** Podíl dávky do vznícení 0..1. */
  get heat() { return Number.isFinite(this.dose.ftp) ? Math.min(1, this.F / this.dose.ftp) : 0; }

  ignite(t) {
    if (this.burning || this.state === 'burnt' || this.inert) return false;
    const o = this.o;
    this.spec = this.spec || o.spec || fireSpec({ kind: 'solid', material: o.material, mass: o.mass, area: o.area, size: o.size, D: o.D });
    this.state = 'burning'; if (this.tIgn == null) this.tIgn = t; this.supp.out = false; this.supp.s = Math.min(this.supp.s, 0.5);
    return true;
  }
  /** Okamžitý výkon vlastního ohně [W] (včetně hašení). */
  Qnow() {
    if (!this.burning || !this.spec) return 0;
    const q = typeof this.spec.Q === 'function' ? this.spec.Q(this.tb) : this.spec.Q;
    return q * Math.min(2.5, Math.max(0, 1 - this.supp.s));
  }
  /** Popis ohně pro fluxFromFire, nebo null. wind = { speed, dir }. */
  fire(wind) {
    const Q = this.Qnow(); if (!(Q > 0)) return null;
    const sp = this.spec, D = sp.D, L = sp.extra?.L ? sp.extra.L(Q) : 0.235 * Math.pow(Q / 1000, 0.4) - 1.02 * D;
    const tilt = wind?.speed ? flameTilt(wind.speed, Q, D) : null;
    return { x: this.pos[0], y: this.pos[1] + (this.o.fireY ?? 0.02), z: this.pos[2], Q, D, L: Math.max(L, 0.02), chiR: sp.chiR ?? 0.3, theta: tilt?.theta || 0, wx: Math.cos(wind?.dir || 0), wz: Math.sin(wind?.dir || 0), owner: this };
  }

  /**
   * Krok. env = { q [W/m²], Tg [K], inFlame, tau (optická hustota kouře na metr) }; agent = { agent, rate } nebo null.
   * Vrací pole událostí { type, ... } (bez času a id – doplní volající).
   */
  step(env, dt, t, agent = null) {
    const ev = [], m = this.mat; this.q = env.q; this.Tg = env.Tg; this.steam = 0;
    // --- nálož nebo nádoba uvnitř: plášť se ohřívá, při cookT vybuchne
    if (this.ex && !this.ex.done) {
      const X = this.ex; X.Tc = stepSheetTemp(X.Tc, env.q, dt, { rcd: X.rcd });
      if (X.Tc >= X.cookT) { X.done = true; ev.push({ type: 'explode', cause: 'teplo', spec: X.spec }); }
    }
    if (this.inert) {
      if (this.glass) {
        const g0 = this.glass.state; this.glass = stepGlass(this.glass, env.q, env.Tg, dt, m); this.Ts = this.glass.T;
        if (this.glass.state !== g0) ev.push({ type: this.glass.state === 'vypadlé' ? 'fallout' : 'crack' });
        this.state = this.glass.state;
      } else if (Number.isFinite(m.rcd)) {
        // kus kovu celý v plameni je ohřívaný z obou stran (panel před ohněm jen z jedné) → dvojnásobný příkon ★3
        const qEff = env.q * ((this.o.engulfed ?? !!m.melt) && env.inFlame ? 2 : 1);
        this.Ts = stepSheetTemp(this.Ts, qEff, dt, m);
        if (m.melt) { const f0 = this.melt; this.melt = meltStep(this.melt, this.Ts, qEff, dt, m); if (this.melt > 0) this.Ts = Math.min(this.Ts, m.melt + 30 * this.melt); if (f0 === 0 && this.melt > 0) ev.push({ type: 'melt' }); if (f0 < 1 && this.melt >= 1) ev.push({ type: 'melted' }); }
      } else { const Te = wallEquilibrium(env.q); this.Ts += (Te - this.Ts) * (1 - Math.exp(-dt / (Te > this.Ts ? 240 : 900))); } // zdivo: povrch se blíží rovnováze pomalu
      this.Tmax = Math.max(this.Tmax, this.Ts);
      this.soot = Math.min(1, Math.max(0, this.soot + sootRate(env.tau || 0, env.Tg, this.Ts) * dt));
      if (m.look === 'metal' && this.Tmax > 700 && this.Ts < 400) this.rust = Math.min(1, this.rust + dt / (this.o.rustTime ?? 600));
      if (!this.glass) this.state = this.melt >= 1 ? 'roztaveno' : this.melt > 0 ? 'taví se' : this.Ts > 800 ? 'žhne' : this.Tmax > 620 ? (m.look === 'metal' ? 'lak shořel' : 'čistý výpal') : this.Tmax > 470 ? (m.look === 'metal' ? 'lak puchýřuje' : 'očazeno') : env.q > 1000 ? 'ohřívá se' : 'cold';
      return ev;
    }
    // --- hašení (i zbytková voda na povrchu)
    if (agent || this.supp.wet > 0 || this.supp.s !== 0) {
      const Q0 = this.burning && this.spec ? (typeof this.spec.Q === 'function' ? this.spec.Q(this.tb) : this.spec.Q) : 0;
      const r = suppressStep(this.supp, { Q0, A: this.o.area ?? 1, agent: this.burning ? agent?.agent : (agent && AGENTS[agent.agent].mode === 'cool' ? agent.agent : null), rate: agent?.rate ?? 0, cls: this.cls, dt, qExt: env.q });
      const was = this.supp.out; this.supp = { s: r.s, wet: r.wet, out: r.out }; this.steam = r.steam; if (r.note) this.note = r.note;
      if (!this.burning && agent && AGENTS[agent.agent].mode === 'cool') this.supp.wet = Math.min(4, this.supp.wet + ((agent.rate * 0.4) / Math.max(this.o.area ?? 1, 0.1)) * dt); // skrápění ještě nehořícího
      if (r.out && !was && this.burning) { this.state = 'uhašeno'; this.F = 0; ev.push({ type: 'extinguished', burned: this.burned }); }
    }
    if (this.state === 'cold' || this.state === 'heating' || this.state === 'uhašeno') {
      if (this.supp.wet > 0) return ev;                               // mokrý povrch: nejdřív se musí voda odpařit
      this.F = stepDose(this.F, env.q, dt, this.dose);
      if (this.state !== 'uhašeno' || this.F > 0) this.state = this.F > 0.02 * this.dose.ftp ? 'heating' : this.state === 'uhašeno' ? 'uhašeno' : 'cold';
      if (this.F >= this.dose.ftp) { if (this.ignite(t)) ev.push({ type: this.tb > 0 ? 'reignite' : 'ignite', q: env.q }); }
      return ev;
    }
    if (this.burning) {
      const k = Math.max(0, 1 - this.supp.s);
      this.tb += dt * Math.min(1.5, k);                               // potlačený oheň spotřebovává palivo pomaleji
      this.burned = Math.min(1, this.tb / Math.max(this.spec.duration, 1));
      if (this.tb >= this.spec.duration) { this.state = 'burnt'; ev.push({ type: 'burnout' }); }
    }
    return ev;
  }
}

/** Svět ohně bez grafiky. */
export class FireSim {
  constructor({ wind = { speed: 0, dir: 0 }, maxFires = 64, seed = 1 } = {}) {
    this.wind = wind; this.maxFires = maxFires; this.t = 0; this.bodies = []; this.free = []; this.agents = []; this.pending = []; this.log = [];
    let a = seed >>> 0; this.rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  addObject(o) { const b = new ThermalBody({ id: 'o' + this.bodies.length, ...o }); this.bodies.push(b); return b; }
  /** Volný oheň (není vázaný na předmět): spec z fireSpec, pos = [x,y,z], t0 = čas zapálení. */
  addFire(spec, pos, t0 = 0) { const f = { spec, pos, t0 }; this.free.push(f); return f; }
  /** Hasivo: { agent, rate [kg/s], target: id | { pos, radius }, from, until }. */
  addAgent(a) { this.agents.push({ from: 0, until: Infinity, ...a }); return a; }
  get(id) { return this.bodies.find((b) => b.id === id); }

  /** Popisy všech hořících ohňů (pro fluxAt); skip = těleso, jehož vlastní oheň se nepočítá. */
  fires(skip = null) {
    const out = [];
    for (const f of this.free) {
      const tl = this.t - f.t0; if (tl < 0 || tl > f.spec.duration) continue;
      const Q = typeof f.spec.Q === 'function' ? f.spec.Q(tl) : f.spec.Q; if (!(Q > 0)) continue;
      const D = f.spec.D, L = f.spec.extra?.L ? f.spec.extra.L(Q) : Math.max(0.02, 0.235 * Math.pow(Q / 1000, 0.4) - 1.02 * D);
      const tilt = this.wind.speed ? flameTilt(this.wind.speed, Q, D) : null;
      out.push({ x: f.pos[0], y: f.pos[1], z: f.pos[2], Q, D, L, chiR: f.spec.chiR ?? 0.3, theta: tilt?.theta || 0, wx: Math.cos(this.wind.dir), wz: Math.sin(this.wind.dir) });
    }
    for (const b of this.bodies) { if (b === skip) continue; const f = b.fire(this.wind); if (f) out.push(f); }
    return out;
  }
  fluxAt(p, skip = null) { return fluxAt(this.fires(skip), p); }
  get totalQ() { return this.fires().reduce((s, f) => s + f.Q, 0); }
  get burningCount() { return this.bodies.filter((b) => b.burning).length; }

  /** Výbuch v bodě pos: tlak na okna, odpálení sousedních náloží, pohlcení ohnivou koulí, sfouknutí malých plamenů. */
  explode(spec, pos, cause = 'ručně', src = null) {
    const es = spec.ex !== undefined ? spec : explosionSpec(spec), ev = [{ t: this.t, type: 'explode', id: src?.id ?? null, cause, W: es.W, pos }];
    if (src) { src.state = 'burnt'; src.exploded = true; }
    const r = blastOn(this.bodies, es, pos, { cased: !!spec.cased, rnd: this.rnd, src, t: this.t });
    for (const e of r.events) { const { body, ...rest } = e; ev.push({ t: this.t, ...rest }); }
    for (const p of r.pending) this.pending.push({ t: this.t + p.delay, b: p.body, cause: p.cause });
    for (const f of es.fires || []) this.addFire({ Q: f.Q, D: f.D, duration: f.end ?? 30, chiR: 0.3, extra: {} }, [pos[0], 0.01, pos[2]], this.t + (f.start || 0));
    this.log.push(...ev); return ev;
  }

  /** Krok simulace o dt [s]; vrací události tohoto kroku [{ t, type, id, … }]. */
  step(dt) {
    this.t += dt; const out = [], t = this.t;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].t <= t) { const p = this.pending.splice(i, 1)[0]; out.push(...this.explode(p.b.ex.spec, p.b.pos, p.cause, p.b)); }
    const fires = this.fires(), burning = this.burningCount;
    // hasiva: rozdělení dodávky mezi zasažené hořící předměty podle plochy
    const ag = new Map();
    for (const a of this.agents) {
      if (t < a.from || t > a.until) continue;
      const hit = typeof a.target === 'string' ? this.bodies.filter((b) => b.id === a.target) : this.bodies.filter((b) => Math.hypot(b.pos[0] - a.target.pos[0], b.pos[2] - a.target.pos[2]) <= a.target.radius);
      const sum = hit.reduce((s, b) => s + (b.o.area ?? 1), 0) || 1;
      for (const b of hit) ag.set(b, { agent: a.agent, rate: (a.rate * (b.o.area ?? 1)) / sum });
    }
    let allowed = Math.max(0, this.maxFires - burning);
    for (const b of this.bodies) {
      if (b.exploded) continue;
      const own = fires.filter((f) => f.owner !== b), f = fluxAt(own, b.p);
      let tau = 0; for (const s of own) { const dx = b.p[0] - s.x, dz = b.p[2] - s.z, dy = b.p[1] - s.y; if (dy > 0) { const bb = 0.12 * dy + s.D / 2; tau += 0.4 * Math.sqrt(s.Q / 1e6) * Math.exp(-(dx * dx + dz * dz) / (bb * bb)); } }
      const wasCold = !b.burning, F0 = b.F;
      const evs = b.step({ q: f.total, Tg: f.Tg, inFlame: f.inFlame, tau }, dt, t, ag.get(b));
      for (const e of evs) {
        if ((e.type === 'ignite' || e.type === 'reignite') && wasCold) {
          if (allowed <= 0) { b.state = 'heating'; b.F = Math.max(F0, b.dose.ftp * 0.999); b.tIgn = b.tb > 0 ? b.tIgn : null; out.push({ t, type: 'deferred', id: b.id }); continue; } // strop počtu ohňů
          allowed--;
        }
        if (e.type === 'explode') { out.push(...this.explode(e.spec, b.pos, e.cause, b)); continue; }
        out.push({ t, id: b.id, ...e });
      }
    }
    this.log.push(...out.filter((e) => e.type !== 'explode' && e.type !== 'deferred'));
    return out;
  }

  /** Běh do času tEnd (nebo do vyhasnutí); vrací protokol událostí. */
  run(tEnd, dt = 0.5) { while (this.t < tEnd) { this.step(dt); if (this.t > 5 && !this.fires().length && !this.pending.length && this.bodies.every((b) => b.heat < 0.02 || b.inert || b.state === 'burnt')) break; } return this.log; }
  /** Stav všech předmětů (pro uložení, síť, UI). */
  snapshot() { return this.bodies.map((b) => ({ id: b.id, state: b.state, heat: +b.heat.toFixed(3), burned: +b.burned.toFixed(3), Q: Math.round(b.Qnow()), Ts: Math.round(b.Ts), Tmax: Math.round(b.Tmax), soot: +b.soot.toFixed(2), melt: +b.melt.toFixed(2), wet: +b.supp.wet.toFixed(2) })); }
}
