// Předvolby ohňů a výbuchů pro hostitele (xEngine): jméno → volby FXWorld.addSource / addExplosion.
// Hodnoty jsou převzaté ze scénářů FireLab (src/scenarios/index.js) – fyzika i vzhled stejné jako v prohlížeči.
// Pozice se doplní při zapálení; všechny jednotky SI.
import * as C from '../../src/physics/combustion.js';
import { bleveFireball, heFireball, gasTNT } from '../../src/physics/blast.js';

/** Ohně: { fuel, Q [W] nebo Q(t), D [m], ... }. `L` je výška plamene, když ji nechceme z Heskestada. */
export const FIRE_PRESETS = {
  candle: { fuel: 'paraffin', Q: 80, D: 0.016, L: () => 0.045, T: 1450, blue: 1, taper: 0.9, baseWide: -0.1, neck: 0.55, puffAmp: 0.12, turbAmp: 0.03, wobble: 0.04, tongues: 3, lightH: 0.4, mult: { smoke: 0.4, embers: 0, sparks: 0, haze: 0.5 } },
  torch: { fuel: 'woodResin', Q: 4000, D: 0.065, mult: { embers: 0.12, sparks: 0.08 }, taper: 0.9 },
  smallFire: { fuel: 'woodDry', Q: 15000, D: 0.32 },
  campfire: { fuel: 'woodDry', Q: 2e5, D: 0.8 },
  bonfire: { fuel: 'woodDry', Q: 3e6, D: 2.4 },
  tires: { fuel: 'rubber', Q: 8e5, D: 0.95, mult: { smoke: 1.3 } },
  diesel: (() => { const sp = C.spillFire('diesel', 20, 1.5); return { fuel: 'diesel', Q: sp.Q, D: sp.D, end: sp.duration }; })(),
  gasolinePool: { fuel: 'gasoline', Q: 1.2e6, D: 1.5 },
  car: { fuel: 'vehicle', Q: 3e6, D: 2.2, mult: { smoke: 1.2 } },
  room: { fuel: 'houseContents', Q: 1.5e6, D: 2, ventLocal: 0.5 },
};

/** Výbuchy: volby Explosion (W [kg TNT], ohnivá koule, kouř, trosky, jiskry) + doprovodné ohně. */
export const EXPLOSION_PRESETS = {
  barrel: () => {
    const fb = bleveFireball(25);
    return {
      ex: { W: 0.05, flash: 2e6, scorch: 6, fireball: { D: fb.D, t: fb.t, T: 1650, rise: fb.H, soot: 0.6 }, smoke: { n: 500, life: 16, albedo: [0.07, 0.065, 0.06], tau: 2.5, buoy: 6, buoyAcc: 2 }, debris: { n: 14, speed: 18, size: 0.12, hot: 0.5, up: 0.6, T: 1200 }, sparks: { n: 300, speed: 12 } },
      fires: [{ fuel: 'gasoline', Q: (t) => 6e6 * Math.max(0, 1 - t / 26), D: 3.5, start: 0.4, end: 26 }],
      dy: 0.4,
    };
  },
  grenade: () => {
    const W = 0.18 * 1.33, fb = heFireball(W);
    return { ex: { W, flash: 2e6, scorch: 1.4, dust: true, fireball: { D: fb.D, t: fb.t, T: 2600, soot: 1 }, smoke: { n: 140, life: 7, albedo: [0.11, 0.1, 0.095], tau: 1.6, buoy: 0.7, buoyAcc: 0.25 }, debris: { n: 160, speed: 300, size: 0.006, hot: 0.9, up: 0.25, T: 1100 }, sparks: { n: 220, speed: 70 } }, fires: [], dy: 0.05 };
  },
  acetylene: () => {
    const W = gasTNT(0.015, 'acetyleneO2'), fb = heFireball(W);
    return { ex: { W, flash: 3e6, scorch: 0.9, dust: true, dustAlbedo: [0.3, 0.3, 0.25], fireball: { D: fb.D, t: fb.t, T: 3000, soot: 0 }, smoke: { n: 60, life: 4, albedo: [0.75, 0.75, 0.77], tau: 0.25, buoy: 1.5 }, debris: { n: 24, speed: 30, size: 0.03, hot: 0.2, up: 0.5 }, sparks: { n: 80, speed: 25 } }, fires: [], dy: 0.4 };
  },
  tnt: () => {
    const W = 1000, fb = heFireball(W);
    return { ex: { W, flash: 6e8, scorch: 26, crater: 1, dust: true, dustAlbedo: [0.36, 0.3, 0.22], fireball: { D: fb.D, t: fb.t, T: 2400, soot: 1, rise: 30 }, smoke: { n: 1400, life: 50, albedo: [0.09, 0.085, 0.08], tau: 3, buoy: 14, buoyAcc: 5, dur: 4 }, debris: { n: 700, speed: 140, size: 0.35, hot: 0.25, up: 0.55, T: 1300 }, sparks: { n: 900, speed: 120 }, life: 70, mushroom: true, wilson: 2.5 }, fires: [], dy: 0.6 };
  },
};
