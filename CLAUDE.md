# FireLab — instrukce pro AI (čti jako první)

## Co to je
Knihovna **ohňových assetů a efektů** pro 3D FPS engine postavený na Three.js (WebGL2),
plus **prohlížeč** (FireLab), ve kterém se assety předvádějí, měří a exportují.
Autor zadání: Ondřej Kaplan. AI persona v tomto projektu: Kristína (ženský rod, tyká).

Vše je **vlastní práce** generovaná kódem: modely, textury, flipbooky i shadery.
Cizí data se nepoužívají (povolené by byly jen CC0 šablony – zatím žádné nejsou potřeba).

## Navázání a plán
- Postup a zásady: `STRATEGIE.md`. Plán další iterace (projít každý objekt, texturu, fyziku i průběh): `AUDIT.md`.
  Jak začít novou sešnu (repo, GitHub, artefakt, startovní prompt): `NAVAZANI.md`. Reference: `REFERENCE.md`.
- Stav k 2026-11-27: iterace 1–5 hotové (poslední commit iterace 5: 53a4ec2, dataset 2c7fedb).

## Jak spustit
```bash
npm install            # three 0.187 (stejná jako xEngine), esbuild, (playwright je v systému globálně)
npm run build          # → dist/index.html (jeden soubor, vše vložené)
npm run dev            # watch build + http server na :8765
npm test               # headless smoke test všech scénářů (Chrome + swiftshader) → /tmp/firetest_T0/sheet.png
npm run test:physics   # korelace proti literatuře (Node, 1 s)
npm run test:ui        # kliky na záložky, atlas, assety, časovou osu
npm run perf           # CPU cena simulace všech scénářů na T0–T3 → dataset/physics/perf_cpu.json
npm run bake           # dataset/: flipbooky PNG, GLB modely, náhledy, presety JSON (~25 min)
npm run test:xengine   # integrace s xEngine (jádro + vykreslení z klonu, systém fx.fire)
npm run test:audio     # zvuk bez reproduktoru (OfflineAudioContext): hlasy ohně, zpoždění rány, útlum výšek
node tools/audio-demo.mjs [outdir]                        # ukázky zvuku do WAV
node tools/tri.mjs <scn> <tier> <seek s> <sim s>          # volání kreslení a △ jednoho snímku
node tools/look.mjs <scn> <tier> <s> "x,y,z" "tx,ty,tz" out.png "<js>"   # snímek s úpravou stavu
node tools/sweep.mjs <tier> "scn1,scn2" "a.flameKey=v" "40,100" out.png [s]  # mřížka scénář × parametr
node tools/seq.mjs <scn> <tier> <t1,t2,..> out.png [cam]   # časová řada snímků
node tools/subcases.mjs <scn> <tier> out.png               # vítr 0–3 a kyslík v mřížce
node tools/probe.mjs <scn> <tier> <s> [cam] [out] [query]   # jeden snímek + statistiky
```
Prohlížeč: otevři `dist/index.html` dvojklikem (funguje z `file://`).
Parametry URL: `?scn=<id>&tier=0..5&wind=0..3&o2=0..1&t=<s>&ui=0`.

## Mapa kódu (detail v ARCHITECTURE.md)
- `src/physics/` – čisté funkce bez Three.js (palivo, plamen, kouř, vítr, výbuch, šíření). Testovatelné v Node.
- `src/fx/` – vizuální efekty (shadery, částice, post-proces).
- `src/assets/` – procedurální modely s LOD a materiál ohořelosti.
- `src/scenarios/` – use casy = složení assetů + efektů z fyzikálního výpočtu.
- `src/engine/` – renderer, stupně kvality, prostředí (vítr, kyslík, čas).
- `src/ui/` – prohlížeč FireLab.
- `tools/` – bake datasetu, testy. `dataset/` – vygenerovaný výstup (commitovaný).
- `src/index.js` → `dist/firelab.module.js` – knihovna pro jiné projekty (ESM, three externí).
- Artefakt FireLab na claude.ai: https://claude.ai/artifact/ALsY87Cfm3Sd3U4eQVJMak (slug 4ba8861b-417a-4687-8f0a-b747ffd677fd, schopnost `downloads`).

## Konvence
- Jednotky **SI** všude (m, s, kg, W, K, Pa). Kód v angličtině, dokumenty a UI česky.
- Fyzika: každý vzorec má v komentáři zdroj a míru jistoty (★1–5). Nevymýšlet čísla bez označení.
- Stupně kvality **T0–T5** (`src/engine/tiers.js`). T0 = ThinkPad T460 (Intel HD 520).
  T3 = herní PC ČR ~35 000 Kč (RTX 4060 třída, 8 GB VRAM), T4 Ultra (4070–4080), T5 Kino (4090/5090). Každý efekt musí mít cestu pro T0.
- Determinismus: všechny generátory berou `seed`; stejný seed = stejný model / flipbook.
- Rozpočty (částice, objemy, △) se kontrolují v `tiers.js`; nikdy je neobcházet natvrdo v efektu.
- Po každé ucelené změně: `npm run build && npm test`, zápis do `TODO.md`, rozhodnutí do `DECISIONS.md`.

## Pasti (ověřené)
- `__fire.settle()` musí končit krokem simulace (uniformy zdrojů se počítají v `FireSource.update` z `flameLum`) – jinak testy první
  scény kreslí se zastaralým jasem (iterace 1 to měla, D-020).
- Jas plamene (`flameLum`) a výbuchů/jisker (`lumRef`) jsou dvě různé věci: sud se Ondřejovi líbí, nesahat na `lumRef` bez srovnání.
- GLSL: `patch` je vyhrazené slovo (WebGL2) – proměnná se tak jmenovat nesmí.
- Průchody přes celou obrazovku se kreslí kamerou s maskou vrstev: po kreslení jiné vrstvy (LAYER_VOL) vrátit `camera.layers.set(0)`,
  jinak se průchod tiše nevykreslí (D-025).
- T3+ má časovou akumulaci objemů: `__fire.shot()` kreslí 10× (dočištění); nový scénář volá `pipeline.resetHistory()`.
- xEngine: vrstva kamery 1 patří zbrani → efekty `setFxLayer(0)`; ve scéně xEngine nesmí být světlo three.js (D-022 hostitele).
- Před-expozice: světla se nastavují až těsně před kreslením (`lights.applyPre`), jinak testy bez smyčky vidí intenzitu × 1.
- `pipeline.depthTexture` se při změně velikosti vyrábí znovu – materiály ji berou každý snímek z `FXWorld.update`, ne při stavbě.
- Testy: `?noloop=1`, simulace přes `window.__fire.ff()`, snímek přes `__fire.shot()` (toDataURL ve stejné úloze).
- Nebuildovat, když běží `npm run bake` nebo testy (stránka se načte s jiným kódem).
- Swiftshader: T2/T3 načtení 20–30 s (bake atlasu + překlad shaderů); na GPU desítky ms.
- Referenční fotky (Commons) se **necommitují** – jen `dataset/reference/manifest.json` (autor, licence, odkaz). D-028.
- Metrika barvy z fotek („svítivé pixely“) platí jen pro noční snímky; ve dne měří oblohu.
- `air.extraUp` je jedno pole pro všechny částice: skládá ho `FXWorld.update` z výbuchů s `mf` (houbový mrak). Kdo ho
  nastaví jinde, přepíše hřib.
- Scénáře s polem podle `tier.id` (`[..][ctx.tier.id]`) musí mít 6 hodnot (T0–T5) nebo `??` – jinak T4/T5 tiše nic (les, D-032).
- Laminární plamen se zapíná malým `turbAmp` (< 0,05); modrá zóna pak jen v plášti (`gBlue`), jinak levandulový nádech.
- Bodové světlo se stínem kreslí stínovou mapu 6×: co vrhá stín, se počítá šestkrát. Porost vrhá stín jen přes náhrady
  ve vrstvě `LAYER_SHADOW` (7); nový instancovaný porost musí udělat totéž (D-034).
- Zvuk se zapíná jen gestem; `fx.audioEvents` se bez zvuku drží na 64 (hostitel bez FireAudio je nevybírá).
- Objemový kouř: kvádr musí mít poloměr ≥ 2 b, jinak jsou vidět svislé hrany (D-036).

## Co nedělat
- Nepřidávat CDN závislosti (artefakt i `file://` musí běžet offline).
- Necommitovat LOD nad ~200 k △ jako GLB (generuje se za běhu ze seedu; viz DECISIONS D-007).
- Nepoužívat `pkill -f` v sandboxu (zabije vlastní shell).
- Neměnit význam polí v `scenarios/*.js` bez úpravy `dataset/presets` a dokumentace.
- Nepsat „realistické" u efektu, který jen vypadá dobře – rozlišovat *fyzikálně podložené* a *umělecké*.
