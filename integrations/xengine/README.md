# FireLab × xEngine

Oheň, kouř, jiskry a výbuchy z FireLab jako jeden systém jádra xEngine (`fx.fire`). xEngine se kvůli tomu nemění:
hra systém zaregistruje stejně jako ostatní a volá jeho metody.

## Zapojení (src/app/game.js hry, sešna A)
```js
import { createFireSystem } from '<FireLab>/integrations/xengine/fire-system.js';

const fire = createFireSystem({ render, light, quality: settings.quality, cellOf: (x, y, z) => world.cellAt?.(x, y, z) ?? null });
E.add(fire);           // fáze 'late' → běží před vykreslením (fáze 'view')

// kdekoli ve hře (systémy fáze sim/late):
const id = fire.ignite('campfire', [x, y, z]);   // táborák; vrací id
fire.explode('barrel', [x, y, z]);               // výbuch sudu + hořící louže
const q = fire.heatFlux(px, py, pz);             // sálavý tok [W/m²] → poškození hráče (např. > 2,5 kW/m² bolest do 20 s)
fire.extinguish(id);
```
Události (deklaruje `fx.fire`): `fire:ignited {id, preset, pos}`, `fire:out {id}`, `fire:exploded {preset, pos, W, fireballD}`.
Když ve hře existuje `combat:explode` (Aréna A-3), `fx.fire` na ni sám vykreslí výbuch (`{ kind, pos }`, výchozí granát).

## Předvolby (`presets.js`)
Ohně: `candle`, `torch`, `smallFire`, `campfire`, `bonfire`, `tires`, `diesel` (20 l rozlité nafty), `gasolinePool`, `car`, `room`.
Výbuchy: `barrel` (sud s benzínem, CCPS ohnivá koule 17 m), `grenade` (M67), `acetylene`, `tnt` (1 t).
Vlastní oheň: `fire.ignite({ fuel: 'woodDry', Q: 5e5, D: 1.2 }, pos)` – paliva viz `src/physics/fuels.js`.

## Kvalita a pravidla xEngine
| xEngine | FireLab | objemy | světla efektu | trosky |
|---|---|---|---|---|
| 0 clean | vypnuto | – | – | – |
| 1 low (T460) | T0 (sprity z atlasu) | 0 | 1 | ne (MeshStandardMaterial) |
| 2 mid | T1 | 2 × 32 kroků | 2 | 60 |
| 3 high | T2 | 6 × 64 kroků | 4 | 200 |

- **Světlo** jde do systému `light` hostitele (po vrcholech, D-022): `addLight` jednou, mihotání jen `setLight` (úroveň po 1/64),
  `moveLight` jen po posunu > 0,5 m. Ve scéně není žádné světlo three.js.
- **Vrstva** 0 (vrstva 1 patří zbrani a rukám).
- **Expozice** je hostitele (`toneMappingExposure = env.exposure`); shadery FireLab si tónovou křivku vezmou z three.js.
- **Determinismus**: průběh hoření (čas, výkon, `heatFlux`) běží v pevném kroku `step`; částice jsou jen vzhled (`frame`) se
  semínky FireLab, mimo stav hry a mimo `snapshot`.

## Test
```bash
XENGINE=/cesta/ke/klonu/xEngine npm run test:xengine
```
Postaví zkušební stránku (`demo.js`: skutečné `createEngine` + `createRender` z klonu, záznamník světla), zapálí táborák a svíčku,
vyšle `combat:explode` a zkontroluje: bez chyb stránky, události, vrstvu 0, žádné světlo three.js, na low ≤ 1 světlo efektu
a žádný viditelný MeshStandardMaterial, sálavý tok v rozumném rozsahu, oheň v obraze. Snímky `/tmp/xfire/q1.png`, `q3.png`.

## Co ještě chybí (ve skutečné hře neověřeno)
- `cellOf` (buňka levelu pro světlo) – xEngine zatím veřejnou funkci „buňka v bodě“ nemá; bez ní se světlo nezastíní branami.
- Zvuk ohně a výbuchu (doběh 343 m/s) – FireLab zvuk nemá.
- Měření na T460: odhad je, že T0 sprity (1–3 volání kreslení, < 2 000 částic) se vejdou do ~1–2 ms GPU; neměřeno.
