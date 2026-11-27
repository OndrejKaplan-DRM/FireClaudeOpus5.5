// FireLab → xEngine: jedna pravda pro data ohně ve formátu xSpace (komponenty `fire` a `explosive`, návrh F-2).
// Bez Three.js – import v Node (validátor xspace-check, generátor xGen, testy sešny B).
// Ondřej 27. 11. 2026: komponenta ohně do dat **hned po zkoušce na jednom kusu** (F-7, D-030 xEngine).
//
// Použití (sešna B / svodná):
//   import { FIRE_COMPONENTS, checkFire, checkExplosive, fireNumbers } from '<firelab>/integrations/xengine/xspace.js';
//   const nálezy = checkFire(entity.components.fire, { cellHeight: 3.0, portalDist: 1.1 });
//   → [{ code: 'FIRE_ABOVE_CEILING', level: 'warn', msg: '…' }]
import { FIRE_PRESETS, EXPLOSION_PRESETS } from './presets.js';
import * as C from '../../src/physics/combustion.js';
import { FUELS } from '../../src/physics/fuels.js';

/** Popis polí (pro formats.js a dokument polí; svodná je přepíše do jedné pravdy xEngine). */
export const FIRE_COMPONENTS = {
  fire: {
    preset: { type: 'string', required: true, enum: () => Object.keys(FIRE_PRESETS), doc: 'předvolba FireLab (fyzika i vzhled jsou ve FireLab, ne v datech)' },
    on: { type: 'boolean', default: true, doc: 'hoří při načtení; přepíná výstup io (on/off)' },
    node: { type: 'string', doc: 'id uzlu kostry prefabu, se kterým se oheň veze' },
    offset: { type: 'vec3', unit: 'm', default: [0, 0, 0], doc: 'posun od uzlu / počátku prefabu' },
    scale: { type: 'number', min: 0.25, max: 2, default: 1, doc: 'násobek výkonu Q (průměr a výška plamene se dopočtou)' },
  },
  explosive: {
    preset: { type: 'string', required: true, enum: () => Object.keys(EXPLOSION_PRESETS), doc: 'předvolba výbuchu FireLab' },
    trigger: { type: 'string', enum: () => ['destroyed', 'use', 'io'], default: 'destroyed', doc: 'co výbuch spustí' },
    hp: { type: 'number', min: 1, doc: 'výdrž, když ji prefab nemá jinde' },
  },
};

/** Stálé kódy nálezů (nemění se; nové jen přibývají). */
export const CODES = {
  FIRE_UNKNOWN_PRESET: 'neznámá předvolba ohně',
  FIRE_BAD_SCALE: 'scale mimo 0,25–2',
  FIRE_ABOVE_CEILING: 'plamen sahá nad 80 % výšky buňky',
  FIRE_NEAR_PORTAL: 'průchod je blíž než vzdálenost bolesti (2,5 kW/m²)',
  EXPLOSIVE_UNKNOWN_PRESET: 'neznámá předvolba výbuchu',
  EXPLOSIVE_BAD_TRIGGER: 'neznámý spouštěč výbuchu',
  EXPLOSIVE_CHAIN: 'jiná výbušnina blíž než 2 m (řetězová reakce)',
};

/**
 * Čísla předvolby pro data: výkon Q [W], průměr D [m], výška plamene L [m] (Heskestad ★4, svíčka a louč pevně ★3)
 * a vzdálenosti od osy, kde sálání (bodový zdroj χr·Q/4πR², Modak ★3) klesne na 2,5 / 5 / 12,5 kW/m².
 * `scale` násobí Q; D se škáluje √scale (stejná plošná hustota výkonu).
 */
export function fireNumbers(preset, scale = 1) {
  const p = FIRE_PRESETS[preset]; if (!p) return null;
  const Q0 = typeof p.Q === 'function' ? p.Q(10) : p.Q, Q = Q0 * scale, D = p.D * Math.sqrt(scale);
  const L = p.L ? p.L(Q) * Math.pow(scale, 0.4) : C.flameHeight(Q, D);
  const chi = FUELS[p.fuel]?.chiR ?? 0.3, R = (q) => Math.sqrt((chi * Q) / (4 * Math.PI * q));
  return { fuel: p.fuel, Q, D, L, R25: R(2500), R5: R(5000), R125: R(12500) };
}

const f = (code, level, extra = '') => ({ code, level, msg: CODES[code] + (extra ? ` (${extra})` : '') });

/** Kontrola komponenty `fire`. ctx = { cellHeight [m], portalDist [m] od osy ohně k nejbližšímu průchodu }. */
export function checkFire(c, ctx = {}) {
  const out = [];
  if (!c || !FIRE_PRESETS[c.preset]) return [f('FIRE_UNKNOWN_PRESET', 'error', String(c?.preset))];
  const sc = c.scale ?? 1;
  if (!(sc >= 0.25 && sc <= 2)) out.push(f('FIRE_BAD_SCALE', 'error', String(sc)));
  const n = fireNumbers(c.preset, Math.min(2, Math.max(0.25, sc)));
  if (ctx.cellHeight != null && n.L > 0.8 * ctx.cellHeight) out.push(f('FIRE_ABOVE_CEILING', 'warn', `L ${n.L.toFixed(2)} m, buňka ${ctx.cellHeight} m`));
  if (ctx.portalDist != null && ctx.portalDist < n.R25) out.push(f('FIRE_NEAR_PORTAL', 'warn', `${ctx.portalDist.toFixed(2)} < ${n.R25.toFixed(2)} m`));
  return out;
}

/** Kontrola komponenty `explosive`. ctx = { nearestExplosive [m] }. */
export function checkExplosive(c, ctx = {}) {
  const out = [];
  if (!c || !EXPLOSION_PRESETS[c.preset]) return [f('EXPLOSIVE_UNKNOWN_PRESET', 'error', String(c?.preset))];
  if (c.trigger != null && !['destroyed', 'use', 'io'].includes(c.trigger)) out.push(f('EXPLOSIVE_BAD_TRIGGER', 'error', String(c.trigger)));
  if (ctx.nearestExplosive != null && ctx.nearestExplosive < 2) out.push(f('EXPLOSIVE_CHAIN', 'warn', `${ctx.nearestExplosive.toFixed(2)} m`));
  return out;
}
