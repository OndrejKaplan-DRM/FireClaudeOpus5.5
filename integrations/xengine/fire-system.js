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
//  - Události jen deklarované: systém vysílá fire:ignited, fire:out, fire:exploded; poslouchá combat:exploded
//    (xEngine sešna A, src/world/combat.js: { pos, radius, damage, push, weapon }) a combat:explode (Aréna A-3:
//    { kind, pos }), pokud je někdo deklaroval. Který výbuch se vykreslí, rozhoduje explosionFor(událost).
//  - Uložení hry: snapshot() / restore() nesou hořící ohně (předvolba, poloha, věk); výbuchy jsou jen vzhled.
import * as THREE from 'three';
import { FXWorld, FireSource, FLAME_LUM } from '../../src/fx/world.js';
import { TIERS } from '../../src/engine/tiers.js';
import { PRE } from '../../src/fx/shared.js';
import { setFxLayer } from '../../src/engine/pipeline.js';
import { bbRGB } from '../../src/fx/lights.js';
import { FIRE_PRESETS, EXPLOSION_PRESETS } from './presets.js';
import * as C from '../../src/physics/combustion.js';

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
    softParticles: false, haze: false, bloom: 0, shadows: false, volumeTAA: false, // hostitel kreslí přímo na plátno: bez hloubky a historie
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
/** Výchozí převod výbuchu z boje na předvolbu FireLab: podle jména zbraně, jinak nic (plazma není oheň). */
export function defaultExplosionFor(e) {
  const w = String(e?.weapon || e?.kind || '').toLowerCase();
  if (EXPLOSION_PRESETS[w]) return w;
  if (/barrel|sud/.test(w)) return 'barrelFilm'; // Ondřej 27. 11.: sud ve hře filmový (fyzikální = 'barrel')
  if (/grenade|granat|rocket|raketa|mortar/.test(w)) return 'grenade';
  if (/tnt|c4|charge|nalož/.test(w)) return 'tnt';
  return null;
}

export function createFireSystem({ render, light = null, quality = 1, cellOf = null, seed = 1, ambient = [0.4, 0.42, 0.5], wind = 0, windDir = 0, flameKey = 100, explosionFor = defaultExplosionFor } = {}) {
  let E = null, fx = null, tier = null, simT = 0, seedN = seed;
  const fires = new Map(); // id → { src, preset, out }
  const recs = []; // záznamy světel v systému light (opakovaně používané)
  let nextId = 1, listening = false;
  const stats = { fires: 0, explosions: 0, lights: 0, lightMoves: 0, lightLevels: 0 };

  // Bez plátna (Node, createNullRender, headless: true): jen simulace ohně pro hru – heatFlux, snapshot, události.
  const headless = !!render.headless || !render.renderer;
  const simW = { scnTime: 0, vent: C.ventilation(1), tier: { volumes: 0 } };
  const world = () => fx || simW;

  function mkFx() {
    if (fx || !tier || headless) return;
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
    get headless() { return headless; },
    get tier() { return tier; },

    init(engine) {
      E = engine;
      tier = hostTier(quality);
      if (!listening) {
        listening = true;
        const declared = new Set(E.eventList().map((e) => e.event));
        // událost je sdílený (přepisovaný) objekt → hodnoty hned zkopírovat
        const onBoom = (d) => { const pre = explosionFor(d); if (pre) sys.explode(pre, [d.pos[0], d.pos[1], d.pos[2]]); };
        if (declared.has('combat:exploded')) E.on('combat:exploded', onBoom); // xEngine sešna A
        if (declared.has('combat:explode')) E.on('combat:explode', onBoom); // Aréna A-3
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
    ignite(preset, pos, over = {}, quiet = false) {
      if (!fx && !(headless && tier)) return null;
      const base = typeof preset === 'string' ? FIRE_PRESETS[preset] : preset;
      if (!base) throw new Error(`fx.fire: neznámý oheň „${preset}“`);
      const id = nextId++;
      // start/end jsou relativní k zapálení (FireSource.t0 = čas světa při vzniku)
      const opts = { volume: tier.volumes > 0, seed: seedN++, ...base, ...over, pos: V(pos) };
      simW.scnTime = simT;
      const src = fx ? fx.addSource(opts) : new FireSource(simW, opts);
      fires.set(id, { src, preset: typeof preset === 'string' ? preset : 'custom', def: typeof preset === 'string' ? null : preset, over, out: false });
      stats.fires = fires.size;
      if (!quiet) E?.emit('fire:ignited', { id, preset: typeof preset === 'string' ? preset : 'custom', pos: [...(Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z])] });
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
      if (!fx && !(headless && tier)) return null;
      const mk = EXPLOSION_PRESETS[preset];
      if (!mk) throw new Error(`fx.fire: neznámý výbuch „${preset}“`);
      const p = mk(), P = V(pos);
      if (fx) fx.addExplosion({ ...p.ex, pos: P.clone().add(new THREE.Vector3(0, p.dy || 0, 0)), seed: seedN++ });
      stats.explosions++;
      E?.emit('fire:exploded', { preset, pos: [P.x, P.y, P.z], W: p.ex.W, fireballD: p.ex.fireball?.D ?? 0 });
      // až po výbuchu: ohně, které zanechal (louže benzínu)
      p.fires.forEach((f, k) => { const id = sys.ignite(f, [P.x, P.y + 0.01, P.z]); if (id != null) fires.get(id).origin = { explosion: preset, k }; });
      return p.ex.W;
    },
    /**
     * Sálavý tok [W/m²] v bodě od všech hořících ohňů (bodový zdroj χr·Q/4πR², Modak ★3) – pro poškození
     * hráče a vznícení okolí. Deterministické: závisí jen na čase simulace.
     */
    heatFlux(x, y, z) {
      // jen z času simulace (ne z posledního snímku): Q(t) zdroje, ventilace, Heskestadova výška → deterministické
      let q = 0;
      for (const { src } of fires.values()) {
        if (!src.enabled) continue;
        const o = src.o, tl = simT - src.t0 - o.start;
        if (tl < 0 || simT - src.t0 > o.end) continue;
        const vent = o.ventLocal != null ? C.ventilation(o.ventLocal) : world().vent;
        const Q = Math.max(0, src.Qat(tl)) * vent.chi; if (Q <= 1) continue;
        const D = typeof o.D === 'function' ? o.D(tl) : src.D;
        const L = o.L ? o.L(Q) : C.flameHeight(Q, D);
        const cx = src.pos.x, cy = src.pos.y + L * 0.4, cz = src.pos.z;
        const R2 = Math.max((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2, (D * 0.5) ** 2);
        q += ((src.fuel.chiR ?? 0.3) * Q) / (4 * Math.PI * R2);
      }
      return q;
    },
    /** Hoří oheň s tímto id? */
    burning(id) { const f = fires.get(id); return !!(f && f.src.active); },

    /** Uložení: jen to, co ovlivňuje hru (hořící ohně a jejich věk). Vlastní volby s funkcemi Q(t) se neukládají. */
    snapshot() {
      const list = [];
      for (const [id, f] of fires) {
        const p = f.src.pos, rec = { id, pos: [p.x, p.y, p.z], age: simT - f.src.t0, over: f.over };
        if (f.origin) rec.origin = f.origin; // oheň z výbuchu: předvolba výbuchu + pořadí (Q(t) je funkce)
        else if (f.def && Object.values(f.def).some((v) => typeof v === 'function')) continue; // vlastní Q(t) neumím uložit
        else { rec.preset = f.preset; rec.def = f.def; }
        list.push(rec);
      }
      return { simT, nextId, fires: list };
    },
    restore(d) {
      sys.reset();
      simT = d.simT || 0; simW.scnTime = simT; nextId = d.nextId || 1;
      if (fx) fx.scnTime = simT;
      for (const f of d.fires || []) {
        const def = f.origin ? EXPLOSION_PRESETS[f.origin.explosion]().fires[f.origin.k] : f.def || f.preset;
        const got = sys.ignite(def, f.pos, f.over || {}, true); // bez události: oheň už hořel
        if (got == null) continue;
        const rec = fires.get(got); fires.delete(got); fires.set(f.id, rec);
        rec.src.t0 = simT - f.age; if (f.origin) rec.origin = f.origin;
      }
      nextId = Math.max(nextId, ...(d.fires || []).map((f) => f.id + 1));
    },

    step(dt) {
      simT += dt; simW.scnTime = simT;
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
