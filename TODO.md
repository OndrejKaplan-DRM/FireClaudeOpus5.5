# TODO — co se právě dělá

Stav k 2026-11-26 ráno: **iterace 1 hotová** (vše níže zaškrtnuté je v `main` a v artefaktu FireLab).

## Hotovo (iterace 1)
- [x] Řídicí dokumenty (CLAUDE, ARCHITECTURE, DECISIONS, TODO, README)
- [x] Build esbuild → `dist/index.html` (1 soubor, offline, ~0,7 MB)
- [x] Fyzika: Planck/CIE, paliva, Heskestad, McCaffrey, AGA, louže, saze/ventilace, Kinney–Graham, CCPS, Gurney, Byram, Anderson, Van Wagner, Thomas, Kawagoe (+ `tools/test-physics.mjs`, 24 kontrol)
- [x] Efekty: objemový plamen + ohnivá koule, flipbook atlas pečený z pole, řazený billboard systém (jazyky, kouř, ohnivé chuchvalce), jiskry/uhlíky, heat haze, rázová vlna, trosky, spáleniště, světla ohně, materiál ohořelosti
- [x] Před-expozice + adaptace oka + lokální adaptace plamene (D-010), sazová barva plamene (D-011)
- [x] 18 modelů s LOD 0–4, procedurální textury
- [x] 18 scénářů, vítr 4 třídy + směr, kyslík, denní doba
- [x] Prohlížeč: seznamy, kamera, HUD, záložky Fyzika / Technika / Ovládání / Export, časová osa HRR se skokem, galerie atlasu, klávesy
- [x] Testy: `npm test` (všechny scénáře, snímky + mřížka), `tools/seq.mjs`, `tools/assets-sheet.mjs`
- [x] Dataset: `npm run bake`

## Známé slabiny (priorita shora)
1. **T0 jazyky plamene** (sprity) jsou ještě trochu „pilovité“ – atlas jazyka by chtěl víc velkých vln a méně šumu na okraji.
2. **Lesní a křovinný požár** vypadá dobře zdálky; zblízka chybí hořící kmeny a padající větve, korunový požár je jen velké jazyky.
3. **Dům**: plameny z oken jsou jen sprity tlačené ven; chybí zhroucení střechy a lámání skel (zvuk/praskání).
4. **Svíčka na T2+**: bloom kolem plamene je výrazný (realistické pro fotoaparát, oko vidí méně) – zvážit menší bloom pro malé zdroje.
5. **Výkon**: CPU strana změřená (`tools/perf-cpu.mjs` → `dataset/physics/perf_cpu.json`): krok simulace 0,02–0,4 ms (T0) až 0,03–2,9 ms (T3, 1 t TNT). GPU čas ze sandboxu (swiftshader) nevypovídá – reálné měření na T460 a RTX 4060 chybí (stačí otevřít `dist/index.html` a záložku Technika).
6. Heat haze je jen T2+ a jednoduchý (šum); rázová vlna lomí obraz jen jako prstenec.

## Nápady (neschváleno)
- WebGPU větev (compute částice, 3D textura hustoty kouře → objemový kouř)
- Procedurální zvuk (praskání, hukot, výbuch s doběhem podle vzdálenosti – 343 m/s)
- 2D řez simulace tekutin pro kouř v místnostech / chodbách (FPS interiéry)
- Hasicí efekty (voda → pára = bílý kouř, prášek)
- Napojení na xEngine (smlouva dat: preset JSON → zdroj ohně)
