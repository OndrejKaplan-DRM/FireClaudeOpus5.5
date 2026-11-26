# FireLab — instrukce pro AI (čti jako první)

## Co to je
Knihovna **ohňových assetů a efektů** pro 3D FPS engine postavený na Three.js (WebGL2),
plus **prohlížeč** (FireLab), ve kterém se assety předvádějí, měří a exportují.
Autor zadání: Ondřej Kaplan. AI persona v tomto projektu: Kristína (ženský rod, tyká).

Vše je **vlastní práce** generovaná kódem: modely, textury, flipbooky i shadery.
Cizí data se nepoužívají (povolené by byly jen CC0 šablony – zatím žádné nejsou potřeba).

## Jak spustit
```bash
npm install            # three 0.170, esbuild, (playwright je v systému globálně)
npm run build          # → dist/index.html (jeden soubor, vše vložené)
npm run dev            # watch build + http server na :8765
npm test               # headless smoke test všech scénářů (Chrome + swiftshader)
npm run bake           # dataset/: flipbooky PNG, GLB modely, náhledy, presety JSON
```
Prohlížeč: otevři `dist/index.html` dvojklikem (funguje z `file://`).
Parametry URL: `?scn=<id>&tier=0..3&wind=0..3&o2=0..1&t=<s>&ui=0`.

## Mapa kódu (detail v ARCHITECTURE.md)
- `src/physics/` – čisté funkce bez Three.js (palivo, plamen, kouř, vítr, výbuch, šíření). Testovatelné v Node.
- `src/fx/` – vizuální efekty (shadery, částice, post-proces).
- `src/assets/` – procedurální modely s LOD a materiál ohořelosti.
- `src/scenarios/` – use casy = složení assetů + efektů z fyzikálního výpočtu.
- `src/engine/` – renderer, stupně kvality, prostředí (vítr, kyslík, čas).
- `src/ui/` – prohlížeč FireLab.
- `tools/` – bake datasetu, testy. `dataset/` – vygenerovaný výstup (commitovaný).

## Konvence
- Jednotky **SI** všude (m, s, kg, W, K, Pa). Kód v angličtině, dokumenty a UI česky.
- Fyzika: každý vzorec má v komentáři zdroj a míru jistoty (★1–5). Nevymýšlet čísla bez označení.
- Stupně kvality **T0–T3** (`src/engine/tiers.js`). T0 = ThinkPad T460 (Intel HD 520).
  T3 = herní PC ČR ~35 000 Kč (RTX 4060 třída, 8 GB VRAM). Každý efekt musí mít cestu pro T0.
- Determinismus: všechny generátory berou `seed`; stejný seed = stejný model / flipbook.
- Rozpočty (částice, objemy, △) se kontrolují v `tiers.js`; nikdy je neobcházet natvrdo v efektu.
- Po každé ucelené změně: `npm run build && npm test`, zápis do `TODO.md`, rozhodnutí do `DECISIONS.md`.

## Co nedělat
- Nepřidávat CDN závislosti (artefakt i `file://` musí běžet offline).
- Necommitovat LOD nad ~200 k △ jako GLB (generuje se za běhu ze seedu; viz DECISIONS D-007).
- Nepoužívat `pkill -f` v sandboxu (zabije vlastní shell).
- Neměnit význam polí v `scenarios/*.js` bez úpravy `dataset/presets` a dokumentace.
- Nepsat „realistické" u efektu, který jen vypadá dobře – rozlišovat *fyzikálně podložené* a *umělecké*.
