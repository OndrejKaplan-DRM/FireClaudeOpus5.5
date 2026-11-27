# Zadání pro svodnou sešnu xEngine: oheň z FireLab (sloučení, kontrakty, rozhodnutí)

Připravila Kristína ve FireLab, 27. 11. 2026. Do xEngine jsem nic nezapisovala. Svodná slučuje jen s Ondřejovým
souhlasem a zadání (`docs/00_ZADANI.md`) mění jen Ondřej. Mapa souborů: [`MAPA.md`](MAPA.md),
návrhy s čísly F-1 až F-8: [`NAVRHY.md`](NAVRHY.md), práce sešen: [`SESNA_A.md`](SESNA_A.md), [`SESNA_B.md`](SESNA_B.md).

## 1. Pořadí práce (doporučení)
| Vlna | Kdo | Co | Hotovo, když |
|---|---|---|---|
| 1 | A | submodul ve `src/app/firelab`, systém `fx.fire` v `game.js`, výbuchy z `combat:exploded`, testy `a_*fire*` | `npm run test:a` zelený, snímek ohně v xLab |
| 1 | B | prefaby `campfire_01`, `barrel_explosive_01`, level s jedním kusem (pole mimo `formats.js`) | `xspace-check --strict` prošel pro zbytek balíku, návrh F-2 v `docs/navrhy/` |
| 2 | svodná | sloučení A + B, přesun submodulu do `vendor/firelab` (F-1), rozhodnutí F-2 | `npm run test:all` zelený na sloučené větvi |
| 2 | A | `?bench&fire=…` na T460 (F-4), poškození teplem (F-5) | čísla v `docs/mereni/` |
| 3 | B | generátor ohňů, validátor (po zápisu polí) | T5 s ohněm |

## 2. Co svodná rozhoduje a zapisuje
1. **Submodul (F-1):** `git mv src/app/firelab vendor/firelab`, oprava `.gitmodules` (`shallow = true`), import v
   `src/app/game.js` (jediné místo). `package-lock.json` se nemění (FireLab nepřidává závislosti za běhu).
   Pin = hash z `git -C vendor/firelab log -1 --format=%H -- integrations/xengine`. Do `DECISIONS.md`:
   *„D-0xx FireLab je mělký submodul ve `vendor/firelab`, pin na poslední změnu `integrations/xengine`; three jen z xEngine.“*
2. **Pole `fire` a `explosive` (F-2):** Ondřej 27. 11.: **hned po zkoušce na jednom kusu** (F-7 od B). Zápis do
   `src/xspace/formats.js` podle `FIRE_COMPONENTS` z FireLab `integrations/xengine/xspace.js`, `npm run doc`, mutace
   validátoru se stálými kódy z `CODES` (`checkFire`, `checkExplosive` – validátor je importuje, nekopíruje).
3. **Kontrakt `world.cellAt` (F-3)** do `docs/02_KONTRAKTY.md`.
4. **Čísla poškození (F-5)** do `docs/02_KONTRAKTY.md` nebo `06_ROZPOCTY.md` jako závazná pro hru (zdroje a ★ u čísel).
5. **Rozpočet T460 pro oheň** do `docs/06_ROZPOCTY.md` až z měření F-4 (do té doby jen „odhad, neměřeno“).

## 3. Kontrola při sloučení (nanečisto na dočasné větvi)
```bash
git fetch origin && git switch -c tmp-merge origin/main
git merge origin/sesna-a origin/sesna-b
git submodule update --init --depth 1
npm install && npm run test:all
XENGINE=$PWD node vendor/firelab/tools/test-xengine-node.mjs    # FireLab proti tomuto jádru (7 kontrol)
```
- FireLab testy z xEngine pouštěj **bez** `npm install` ve submodulu; `tools/test-xengine-node.mjs` bere jádro z `XENGINE`.
- Nic z dočasné větve nepushovat.

## 4. Pravidla, která FireLab dodržuje (ověř při revizi)
| Pravidlo xEngine | Jak to FireLab plní | Kde to ověřit |
|---|---|---|
| D-022 světlo po vrcholech, low ≤ 1 efektové světlo, bez `MeshStandardMaterial` | světla jen přes `light.addLight/setLight/moveLight`; low: 1 světlo, trosky vypnuté | `tools/test-xengine.mjs` |
| D-029 stupně 0–3 | `QUALITY_MAP` v `fire-system.js` | tamtéž |
| pevný krok, žádný `Math.random` ve hře | hoření a `heatFlux` v `step`; částice jen vzhled ve `frame` (vlastní semínko) | `test-xengine-node.mjs` (dva běhy bit po bitu) |
| deklarované události | `fire:ignited`, `fire:out`, `fire:exploded`; poslouchá `combat:exploded` | `E.eventList()` |
| vrstva 1 = zbraň | efekty ve vrstvě 0 | `test-xengine.mjs` |
| `snapshot`/`restore` | hořící ohně (předvolba, poloha, věk) | `test-xengine-node.mjs` |
| soubor do 600 řádků | `fire-system.js` ~330, `presets.js` ~50 | – |

## 5. Pro skill `xengine` (upravuje jen svodná po sloučení)
Návrh řádků do oddílu „Pasti“:
- *Oheň a výbuchy jsou FireLab (`vendor/firelab`): fyziku ani shadery v xEngine nekopírovat; předvolba je jméno.*
- *`flameLum` (plamen) a `lumRef` (výbuchy) jsou dvě adaptace jasu; sud se Ondřejovi líbí – `lumRef` neměnit.*
- *Po přepnutí vyhlazování (nový kontext WebGL) FireLab atlas nepřepeče – přepínat s novou hrou.*

## 6. Neověřeno (stav 27. 11. 2026)
Skutečný systém `light` s branami, skutečný level s ohněm, `?bench` na T460, sloučení se `zaklad-2`. Ověřeno jen proti
klonu `origin/main` (1f2e623) a `sesna-a` (cb492ae) v sandboxu.
