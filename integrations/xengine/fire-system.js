// FireLab → xEngine: systém jádra „fx.fire“ (oheň, kouř, jiskry, výbuchy) pro hru na xEngine.
//
// Zapojení (src/app/game.js hostitele, před E.add(render)):
//   import { createFireSystem } from 'firelab/integrations/xengine/fire-system.js';
//   const fire = createFireSystem({ render, light, quality: settings.quality, cellOf: world.cellAt });
//   E.add(fire);
//   ... fire.ignite('campfire', [x, y, z]);  fire.explode('barrel', [x, y, z]);
//
// Pravidla xEngine, která systém dodržuje (docs/DECISIONS.md hostitele):
//  - D-022: ve scéně žádné světlo three.js; světlo ohně jde do systému „light“ (po vrcholech) jako záznam
//    addLight / setLight (úroveň) / moveLight (jen po posunu > 0,5 m). Na stupni low nejvýš 1 světlo efektu,
//    žádný MeshStandardMaterial (trosky výbuchů vypnuté), žádná stínová mapa.
//  - Vrstva 1 kamery patří zbrani a rukám → efekty kreslí do vrstvy 0 (setFxLayer).
//  - Pevný krok 120 Hz: čas simulace ohně (fáze hoření, HRR) běží ve step(), vizuální částice ve frame()
//    (jen vzhled, mimo stav hry). Náhoda efektů jde z vlastního semínka (mulberry32), ne z Math.random hry.
//  - Expozici dělá hostitel (toneMappingExposure = env.exposure); FireLab běží s před-expozicí 1 a tónovou
//    křivku dostanou jeho shadery z three.js (fxOut).
//  - Události jen deklarované: systém vysílá fire:ignited, fire:out, fire:exploded; poslouchá combat:explode,
//    pokud ji někdo deklaroval (Aréna A-3).
import * as THREE from 'three';
import { FXWorld, FLAME_LUM } from '../../src/fx/world.js';
import { TIERS } from '../../src/engine/tiers.js';
import { PRE } from '../../src/fx/shared.js';
import { setFxLayer } from '../../src/engine/pipeline.js';
import { bbRGB } from '../../src/fx/lights.js';
import { FIRE_PRESETS, EXPLOSION_PRESETS } from './presets.js';

/** Stupeň kvality xEngine (0 clean, 1 low = T460, 2 mid, 3 high) → stupeň FireLab a limity hostitele. */
export const QUALITY_MAP = {
  0: null,
  1: { tier: 0, lights: 1, debris: 0 },
  2: { tier: 1, lights: 2, debris: 60 },
  3: { tier: 2, lights: 4, debris: 200 },
};

/** Stupeň FireLab upravený pro kreslení přímo na plátno hostitele (bez HDR cíle, hloubky a oparu). */
export function hostTier(quality) {
  const q = QUALITY_MAP[quality];
  if (!q) return null;
  const base = TIERS[q.tier];
  return {
    ...base,
    particles: { ...base.particles, haze: 0 },
    softParticles: false, haze: false, bloom: 0, shadows: false,
    lights: q.lights, lightObjects: false, debris: q.debris,
  };
}

const V = (a) => (Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : a.clone());

/**
 * @param {object} o
 * @param {object} o.render systém vykreslení xEngine (scene, camera, renderer)
 * @param {object} [o.light] systém světla xEngine (addLight, setLight, moveLight); bez něj oheň nesvítí na svět
 * @param {number} [o.quality=1] stupeň xEngine 0..3
 * @param {(x,y,z)=>string|null} [o.cellOf] buňka levelu pro světlo
 * @param {number} [o.seed=1] semínko efektů
 * @param {number[]} [o.ambient] okolní osvětlení [lx] RGB pro kouř (výchozí noc ve městě)
 * @param {number} [o.wind=0] třída větru 0..3, [o.windDir=0] směr [rad]
 */
export function createFireSystem({ render, light = null, quality = 1, cellOf = null, seed = 1, ambient = [0.4, 0.42, 0.5], wind = 0, windDir = 0, flameKey = 100 } = {}) {
  let E = null, fx = null, tier = null, simT = 0, seedN = seed;
  const fires = new Map(); // id → { src, preset, out }
  const recs = []; // záznamy světel v systému light (opakovaně používané)
  let nextId = 1, listening = false;
  const stats = { fires: 0, explosions: 0, lights: 0, lightMoves: 0, lightLevels: 0 };

  function mkFx() {
    if (fx || !tier) return;
    setFxLayer(0);
    PRE.value = 1;
    const pipeline = { depthTexture: null };
    fx = new FXWorld(render.renderer, render.scene, tier, pipeline);
    fx.env = { T: { hemi: (ambient[0] + ambient[1] + ambient[2]) / 3, sun: 0, moon: 0 } };
    fx.setWind(wind, windDir); fx.setOxygen(1);
  }

  /** Expozice hostitele → lokální adaptace plamene (stejný vzorec jako FireLab app.updateExposure). */
  function adapt() {
    const ex = Math.max(render.renderer.toneMappingExposure || 1, 1e-9);
    fx.flameLum = Math.min(FLAME_LUM, (flameKey / ex) * Math.min(1.3, Math.max(0.1, Math.pow(ex / 0.25, 0.4))));
    fx.lumRef = Math.min(12000, 16 / ex);
  }

  /** Světla FireLab (sloučená podle důležitosti) → záznamy v systému light hostitele. */
  function bridgeLights() {
    if (!light) return;
    const act = fx.lights.active || [];
    for (let i = 0; i < Math.max(act.length, recs.length); i++) {
      const a = act[i];
      let R = recs[i];
      if (!a) { if (R && R.on) { R.on = false; light.setLight(R); } continue; }
      const c = bbRGB(a.T * 1.28);
      // dosah: kde osvětlení klesne pod 0,05 lx (decay 2)
      const range = Math.min(60, Math.sqrt(a.I / 0.05));
      if (!R) {
        R = light.addLight({ type: 'point', pos: [a.x, a.y, a.z], color: c, intensity: a.I, range }, { id: 'fx.fire.' + i, cell: cellOf ? cellOf(a.x, a.y, a.z) : undefined, on: true, level: 1, fixed: false });
        R._I0 = a.I; recs.push(R); stats.lights = recs.length;
        continue;
      }
      const dx = R.pos[0] - a.x, dy = R.pos[1] - a.y, dz = R.pos[2] - a.z;
      if (dx * dx + dy * dy + dz * dz > 0.25 || !R.on) {
        R.pos[0] = a.x; R.pos[1] = a.y; R.pos[2] = a.z; R.intensity = a.I; R._I0 = a.I; R.range = range; R.color = c; R.on = true;
        if (cellOf) R.cell = cellOf(a.x, a.y, a.z);
        light.moveLight(R); stats.lightMoves++;
        continue;
      }
      // mihotání jen úrovní (levné: vrstva se dorovná o rozdíl), kvantované po 1/64
      const lv = Math.round((a.I / Math.max(R._I0, 1e-6)) * 64) / 64;
      if (lv !== R.level) { R.level = lv; light.setLight(R); stats.lightLevels++; }
    }
  }

  const sys = {
    name: 'fx.fire',
    phase: 'late',
    after: [],
    events: ['fire:ignited', 'fire:out', 'fire:exploded'],
    stats,
    get fx() { return fx; },
    get tier() { return tier; },

    init(engine) {
      E = engine;
      tier = hostTier(quality);
      if (!listening && E.eventList().some((e) => e.event === 'combat:explode')) {
        listening = true;
        // Aréna A-3: { pos: [x,y,z], kind?: 'grenade'|'barrel'|... }
        E.on('combat:explode', (d) => sys.explode(d?.kind || 'grenade', d?.pos || [0, 0, 0]));
      }
    },
    build() { mkFx(); },
    reset() {
      simT = 0; fires.clear();
      if (fx) fx.clear();
      for (const R of recs) if (R.on) { R.on = false; light?.setLight(R); }
    },

    /**
     * Zapálí oheň: preset (jméno z FIRE_PRESETS) nebo vlastní volby FireLab, pozice [x,y,z].
     * Vrací id ohně (pro extinguish a heatFlux) nebo null na stupni clean.
     */
    ignite(preset, pos, over = {}) {
      if (!fx) return null;
      const base = typeof preset === 'string' ? FIRE_PRESETS[preset] : preset;
      if (!base) throw new Error(`fx.fire: neznámý oheň „${preset}“`);
      const id = nextId++;
      // start/end jsou relativní k zapálení (FireSource.t0 = čas světa při vzniku)
      const src = fx.addSource({ volume: tier.volumes > 0, seed: seedN++, ...base, ...over, pos: V(pos) });
      fires.set(id, { src, preset: typeof preset === 'string' ? preset : 'custom', out: false });
      stats.fires = fires.size;
      E?.emit('fire:ignited', { id, preset: typeof preset === 'string' ? preset : 'custom', pos: [...(Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z])] });
      return id;
    },
    extinguish(id) {
      const f = fires.get(id); if (!f) return false;
      f.src.enabled = false; f.out = true; fires.delete(id); stats.fires = fires.size;
      E?.emit('fire:out', { id });
      return true;
    },
    /** Výbuch z EXPLOSION_PRESETS (barrel, grenade, acetylene, tnt). */
    explode(preset, pos) {
      if (!fx) return null;
      const mk = EXPLOSION_PRESETS[preset];
      if (!mk) throw new Error(`fx.fire: neznámý výbuch „${preset}“`);
      const p = mk(), P = V(pos);
      fx.addExplosion({ ...p.ex, pos: P.clone().add(new THREE.Vector3(0, p.dy || 0, 0)), seed: seedN++ });
      for (const f of p.fires) sys.ignite(f, [P.x, P.y + 0.01, P.z]);
      stats.explosions++;
      E?.emit('fire:exploded', { preset, pos: [P.x, P.y, P.z], W: p.ex.W, fireballD: p.ex.fireball?.D ?? 0 });
      return p.ex.W;
    },
    /**
     * Sálavý tok [W/m²] v bodě od všech hořících ohňů (bodový zdroj χr·Q/4πR², Modak ★3) – pro poškození
     * hráče a vznícení okolí. Deterministické: závisí jen na čase simulace.
     */
    heatFlux(x, y, z) {
      let q = 0;
      for (const { src } of fires.values()) {
        const ph = src.ph; if (!ph || !src.active) continue;
        const cx = src.pos.x, cy = src.pos.y + ph.L * 0.4, cz = src.pos.z;
        const R2 = Math.max((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2, (src.D * 0.5) ** 2);
        q += ((src.fuel.chiR ?? 0.3) * ph.Q) / (4 * Math.PI * R2);
      }
      return q;
    },
    /** Hoří oheň s tímto id? */
    burning(id) { const f = fires.get(id); return !!(f && f.src.active); },

    step(dt) {
      simT += dt;
      if (fx) fx.scnTime = simT;
    },
    frame(real) {
      if (!fx) return;
      const playing = E ? E.mode === 'playing' : true;
      const dt = playing ? real * (E?.timeScale ?? 1) : 0;
      adapt();
      fx.pipeline.size = { H: render.size?.[1] || 720 };
      fx.scnTime = simT;
      fx.update(dt, render.camera);
      PRE.value = 1;
      bridgeLights();
    },
  };
  return sys;
}
