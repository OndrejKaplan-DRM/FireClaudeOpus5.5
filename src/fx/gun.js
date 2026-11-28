// Výstřel (iterace 7): záblesk u ústí, dohořívající zrna prachu, kouř, zvířený prach, světlo, rána, svítící střela.
// Všechno z jednoho popisu `muzzleSpec` (physics/gun.js) – stejná funkce kreslí pistoli i houfnici.
// Levná cesta (T0): 2–4 ohnivé obláčky + světlo na jeden snímek. Střední: + jiskry, kouř, prach. Drahá: víc částic,
// boční plameny úsťové brzdy, tetelení. Fyzikální záblesk ručních zbraní trvá 1,5–3 ms, tedy méně než jeden snímek:
// zobrazujeme ho nejméně 1/20 s (umělecký ústupek, jinak by nebyl vidět vůbec).
import * as THREE from 'three';
import { tracer } from '../physics/gun.js';

const MIN_VISIBLE = 1 / 20;

export class GunFX {
  constructor(world, seedRnd) { this.w = world; this.r = seedRnd; this.flashes = []; }
  /** Jedna rána: pos = ústí hlavně (Vector3), dir = jednotkový směr, ms = muzzleSpec, o = { tracer: bool, ground: výška země } */
  fire(pos, dir, ms, o = {}) {
    const w = this.w, r = this.r, L = ms.flashL, D = ms.flashD, vis = Math.max(ms.flashT, MIN_VISIBLE), q = w.tier.id, bs = w.budgetScale;
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize(), up = new THREE.Vector3().crossVectors(side, dir);
    if (w.layers.flame) {
      // jádro: obláčky podél osy, největší ve třetině délky; u úsťové brzdy dva boční jazyky
      const n = Math.max(2, Math.round((3 + 5 * Math.cbrt(L / 0.1)) * (q === 0 ? 0.5 : q >= 4 ? 1.6 : 1) * Math.max(0.4, bs.flame)));
      for (let i = 0; i < n; i++) {
        const t = (i + r()) / n, k = 1 - Math.abs(t - 0.35) * 1.3, off = D * 0.25 * (1 - t);
        w.bb.spawnFirePuff({ x: pos.x + dir.x * L * t + (r() - 0.5) * off, y: pos.y + dir.y * L * t + (r() - 0.5) * off, z: pos.z + dir.z * L * t + (r() - 0.5) * off,
          vx: dir.x * (L / vis) * 0.35 * (1 - t), vy: dir.y * (L / vis) * 0.35 * (1 - t) + 0.3, vz: dir.z * (L / vis) * 0.35 * (1 - t),
          life: vis * (0.7 + 0.9 * r() + 2.2 * r() ** 3), s0: Math.max(0.01, D * (0.3 + 0.5 * Math.max(0, k))), s1: D * (0.7 + 0.5 * r()), T: ms.flashTemp * (1 - 0.22 * t), lum: 1.6, soot: 0.05, drag: 5, seed: r() });
      }
      if (ms.sideJets && q > 0) for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) {
        const t = (i + r()) / 3;
        w.bb.spawnFirePuff({ x: pos.x + side.x * sg * L * 0.45 * t, y: pos.y + 0.02, z: pos.z + side.z * sg * L * 0.45 * t, vx: side.x * sg * (L / vis) * 0.2, vy: 0.4, vz: side.z * sg * (L / vis) * 0.2,
          life: vis * (0.6 + 0.6 * r()), s0: D * 0.3, s1: D * 0.6, T: ms.flashTemp * 0.9, lum: 1.3, soot: 0.05, drag: 5, seed: r() });
      }
    }
    this.flashes.push({ x: pos.x + dir.x * L * 0.35, y: pos.y + dir.y * L * 0.35, z: pos.z + dir.z * L * 0.35, I: ms.flashI, r: Math.max(D * 0.6, 0.03), t: vis });
    // dohořívající zrna prachu
    if (w.layers.sparks && q > 0) {
      const n = Math.round(Math.min(120, 4 + 10 * Math.cbrt(ms.gun.charge / 0.0004)) * Math.max(0.3, bs.spark));
      for (let i = 0; i < n; i++) {
        const v = (25 + 55 * r()) * Math.min(3, Math.cbrt(L / 0.1)), sx = (r() - 0.5) * 0.5, sy = (r() - 0.5) * 0.5;
        w.sp.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: (dir.x + side.x * sx + up.x * sy) * v, vy: (dir.y + up.y * sy) * v, vz: (dir.z + side.z * sx + up.z * sy) * v,
          life: 0.04 + 0.12 * r() * Math.cbrt(L / 0.1), T: 1700 + 400 * r(), tauC: 0.5, size: 0.0006 + 0.0015 * r() * Math.cbrt(L / 0.1), drag: 9, grav: 1, seed: r() });
      }
    }
    // kouř: plyny po vychladnutí × nasátý vzduch; bezdýmný prach = řídký šedomodrý obláček
    if (w.layers.smoke) {
      const R = Math.cbrt(ms.smokeV * 40), n = Math.max(1, Math.round((2 + 3 * Math.cbrt(R / 0.2)) * (q === 0 ? 0.5 : 1) * Math.max(0.3, bs.smoke)));
      for (let i = 0; i < n; i++) {
        const t = r(), v = 2 + 9 * Math.cbrt(L / 0.1) * (1 - t);
        w.bb.spawnSmoke({ x: pos.x + dir.x * L * t, y: pos.y + dir.y * L * t, z: pos.z + dir.z * L * t, vx: dir.x * v + (r() - 0.5), vy: dir.y * v + 0.3 + 0.4 * r(), vz: dir.z * v + (r() - 0.5),
          life: (1.2 + 2.5 * r()) * Math.min(4, 1 + R), s0: R * 0.35, s1: R * (1.6 + 1.4 * r()) + 0.15, tau: Math.min(0.9, 0.12 + 0.12 * R), albedo: [0.62, 0.63, 0.66], drag: 1.6, seed: r() });
      }
      // zvířený prach u země (velké ráže, nízko položená hlaveň)
      const h = pos.y - (o.ground ?? 0);
      if (ms.dustR > 1.2 && h < ms.dustR * 0.5 && q > 0) {
        const nd = Math.round(Math.min(90, 8 * ms.dustR) * Math.max(0.3, bs.smoke));
        for (let i = 0; i < nd; i++) {
          const a = r() * 6.2832, fw = 0.5 + 0.5 * Math.max(0, Math.cos(a - Math.atan2(dir.z, dir.x))), rr = ms.dustR * (0.15 + 0.5 * r()), v = (3 + 7 * r()) * fw * Math.cbrt(ms.dustR / 4);
          w.bb.spawnSmoke({ x: pos.x + Math.cos(a) * rr, y: (o.ground ?? 0) + 0.1 + 0.3 * r(), z: pos.z + Math.sin(a) * rr, vx: Math.cos(a) * v, vy: 0.6 + 1.5 * r(), vz: Math.sin(a) * v,
            life: 3 + 5 * r(), s0: 0.5, s1: 2 + 0.25 * ms.dustR * (1 + r()), tau: 0.8, albedo: [0.36, 0.31, 0.23], drag: 1.2, seed: r() });
        }
      }
    }
    if (w.hz && w.layers.haze && q >= 2) w.hz.spawn({ x: pos.x + dir.x * L * 0.5, y: pos.y, z: pos.z + dir.z * L * 0.5, vy: 0.8, life: 0.6, size: Math.max(0.15, D * 1.5) });
    if (o.tracer && w.layers.sparks) {
      const tr = tracer(ms.gun);
      w.sp.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * tr.v0 * 0.25, vy: dir.y * tr.v0 * 0.25, vz: dir.z * tr.v0 * 0.25, life: tr.burn, T: tr.T, tauC: 30, size: 0.012 + ms.gun.cal, drag: tr.drag * 0.15, grav: 0.25, seed: r() }); // rychlost ¼ (jinak by stopa přeskakovala mezi snímky) – umělecké
    }
    if (w.audioEvents && w.audioEvents.length < 64) w.audioEvents.push({ type: 'shot', pos: pos.clone(), W: ms.W });
    w.shake = Math.max(w.shake, Math.min(1, ms.W * 4));
  }
  /** Každý snímek: světlo záblesku po dobu jeho viditelnosti. */
  update(dt) {
    for (const f of this.flashes) { this.w.lights.add(f.x, f.y, f.z, f.I * Math.min(1, f.t / MIN_VISIBLE), 2400, f.r); f.t -= dt; }
    this.flashes = this.flashes.filter((f) => f.t > 0);
  }
}
