# Mapa: kam sáhnout pro co (FireLab ↔ xEngine)

Pro všechny sešny xEngine. Cesty ve FireLab jsou od kořene repa `OndrejKaplan-DRM/FireClaudeOpus5.5`
(v xEngine pod submodulem, dočasně `src/app/firelab/`, po F-1 `vendor/firelab/`). Když tabulka a kód nesouhlasí, platí kód.

## A. Chci něco udělat ve hře
| Potřeba | Kde ve FireLab | Kdo v xEngine | Kde v xEngine |
|---|---|---|---|
| Zapojit oheň do hry | `integrations/xengine/fire-system.js` → `createFireSystem({ render, light, quality, cellOf })` | A | `src/app/game.js` |
| Zapálit / uhasit oheň | `fire.ignite(preset, [x,y,z], over?) → id`, `fire.extinguish(id)` | A | systém hry (`src/play`, `src/world`) |
| Výbuch | `fire.explode(preset, pos)`; sám reaguje na `combat:exploded` (převod `explosionFor`) | A | `src/world/combat.js` vysílá `combat:exploded` |
| Poškození teplem | `fire.heatFlux(x, y, z)` [W/m²], prahy v `NAVRHY.md` F-5 | A | krok hráče/nepřátel (`step`) |
| Poškození výbuchem | `dataset/physics/blast_tables.json`, `src/physics/blast.js` (`blastSummary(W, [R])`) | A | `combat.explode` |
| Uložit / nahrát hru | `snapshot()` / `restore()` systému `fx.fire` (jádro je volá samo) | – | nic |
| Světlo ohně na svět | most v `fire-system.js` (`bridgeLights`): `light.addLight` / `setLight` / `moveLight` | A | systém `light` (D-022), `world.cellAt` |
| Stupeň kvality | `QUALITY_MAP` a `hostTier()` v `fire-system.js` (0 clean → nic, 1 low → T0, 2 mid → T1, 3 high → T2) | A | nastavení Shellu `quality` |
| Vrstva kreslení | `setFxLayer(0)` (`src/engine/pipeline.js`) | – | vrstva 1 kamery = zbraň |
| Vítr | `fire.fx.setWind(třída 0–3, směr rad)` | A | `level.env` (až bude vítr v datech) |
| Okolní světlo pro kouř | volba `ambient` při vytvoření, nebo `fire.fx.env.T.hemi` | A | `level.env` |

## B. Chci nový druh ohně nebo výbuchu
| Potřeba | Kde | Poznámka |
|---|---|---|
| Nová předvolba ohně | `integrations/xengine/presets.js` → `FIRE_PRESETS` | `{ fuel, Q [W], D [m], L?(Q), mult? }`; jméno pak smí do dat (F-2) |
| Nová předvolba výbuchu | `presets.js` → `EXPLOSION_PRESETS` | `{ ex: volby Explosion, fires: [doprovodné ohně], dy }` |
| Nové palivo | `src/physics/fuels.js` | každé číslo se zdrojem a ★; `fv` (saze ppm), `Tlum`, `ys`, `chiR`, `embers`, `sparks` |
| Výška plamene, výkon, tok | `src/physics/combustion.js` (Heskestad, McCaffrey, Modak) | čisté funkce, testované v Node |
| Šíření požáru po ploše | `src/physics/spread.js` (Anderson, Byram, Van Wagner) | jen scénáře FireLab; v xEngine zatím ne |
| Ohnivá koule, tlak, střepiny | `src/physics/blast.js` (CCPS, Kinney–Graham, Gurney) | |

## C. Chci změnit vzhled
| Co | Kde | Pozor |
|---|---|---|
| Objemový plamen (jazyky, okraje, barva, svíčka) | `src/fx/volume.js` (`fieldFlame`, `tongues`) | `patch` je v GLSL vyhrazené slovo |
| Barva plamene podle teploty | `src/fx/shared.js` (`sootColorG`, Planck + posun podle fotek) | |
| Sprity plamene a kouře (low) | `src/fx/particles.js` (`BillboardSystem`), atlas `src/fx/bake.js` | atlas se peče při `build()` |
| Jiskry, uhlíky, hořící oharky | `src/fx/particles.js` (`SparkSystem`, typ 2 = oharek se stopou) | |
| Výbuchy, houbový mrak, Wilsonův dóm | `src/fx/world.js` (`Explosion`, `flow`, `makeWilsonDome`) | `lumRef` neměnit (sud se Ondřejovi líbí) |
| Zuhelnatění povrchů | `src/fx/char.js` (`applyChar`) | jen pro hostitele s osvětlenými materiály (ne low) |
| Jas plamene × výbuchů | `flameLum` vs `lumRef` (`src/engine/app.js`, `world.js`) | dvě různé adaptace – nesahat bez srovnání |

## D. Chci ověřit
| Co | Příkaz (ve FireLab) |
|---|---|
| Systém v jádře xEngine bez plátna | `XENGINE=<klon> node tools/test-xengine-node.mjs` |
| Systém se skutečným `createRender` | `XENGINE=<klon> npm run test:xengine` (snímky `/tmp/xfire/q1.png`, `q3.png`) |
| Fyzika proti literatuře | `npm run test:physics` |
| Všechny scénáře | `npm test` (`/tmp/firetest_T0/sheet.png`) |
| Jeden snímek s úpravou stavu | `node tools/look.mjs <scn> <tier> <s> "x,y,z" "tx,ty,tz" out.png "<js>"` |

## E. Kdo smí co (pravidla xEngine platí beze změny)
- **Sešna A** (běh): zapojení systému, události, poškození, testy `test/a_*`, submodul dočasně ve `src/app/`.
- **Sešna B** (obsah): prefaby s ohněm, ukázkový balík, generátor (rozmístění ohňů), validátor dat přes návrh.
- **Svodná:** kořen repa (submodul `vendor/`), `formats.js` (nová pole po zkoušce D-030), `02_KONTRAKTY.md`, sloučení.
- **FireLab** (Kristína v tomto repu): fyzika, shadery, předvolby, most `fire-system.js`. Změnu chtěnou z xEngine
  napiš do svého `*_STAV.md` jako „pro FireLab“; promítne se sem.
