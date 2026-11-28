# FireLab — ohňové assety a efekty pro 3D FPS engine

Procedurální, fyzikálně podložená knihovna ohně, kouře a výbuchů pro Three.js (WebGL2) s prohlížečem,
ve kterém se vše předvádí, měří a exportuje. Od ThinkPadu T460 (Intel HD 520) po RTX 4090/5090 (stupně T0–T5).
Napojení na xEngine: `integrations/xengine/` (systém jádra `fx.fire`).

**Otevři `dist/index.html`** (jeden soubor, běží offline z disku).

## Co obsahuje
- **39 scénářů**: zapalovač (jiskra → plamen), jiskra z brusky, svíčka, louč, ohýnek, táborák, velká hranice, stoh slámy,
  pneumatiky, řetěz vznícení (přestup tepla mezi předměty), rozlitá nafta 20 l, hořící sud s naftou, prostřelený sud s hořícím
  pramínkem, požár auta, výbuch sudu s benzínem, směs acetylenu s kyslíkem, acetylenová láhev v požáru, granát, 1 t TNT,
  lesní požár, suché křoví, požár domu, parametrický plamen, obecný výbuch (50 g – 5 t).
  Od iterace 7 navíc: výstřel z pistole, kulomet se žhnoucí hlavní, dělo a dopad granátu, řetězová exploze skladu munice,
  zápalná láhev, plamenomet, tryskový plamen (hořák → utržený ventil), hořící stopa k sudu, hašení (hasivo × co hoří),
  následky (saze na zdi, sklo, tavení hliníku), místnost s oknem (celkové vzplanutí), výbuch prachu, ohňostroj,
  termit a hořčík, ohnivý vír. Každý má popsanou levnou, střední a drahou cestu.
- **Jádro bez grafiky** (`physics/sim.js`): `FireSim` počítá šíření, hašení a řetěz výbuchů jako protokol událostí – použitelné
  ve hře, na serveru i v testu. Výstřely (`physics/gun.js`), hašení (`physics/suppress.js`).
- **Obecný model** (`MODEL.md`): jeden popis ohně a výbuchu (co hoří, kolik, v jakém tvaru → vše ostatní), tepelný tok na
  okolí, vznícení podle materiálu, hořlavé předměty, očouzený a vyhořelý plech.
- **Podpřípady**: vítr (bezvětří / vánek 2,5 m/s / vítr 9 m/s / vichr 19 m/s, směr), kyslík (ventilace → saze, CO, barva, tvar),
  denní doba (noc / soumrak / den).
- **23 modelů** s LOD 0–4 (~10² až ~10⁶ △), materiál ohořelosti se žhnoucími trhlinami.
- **Efekty**: objemový plamen a ohnivá koule (raymarching), flipbook atlas pečený z téhož pole (T0), jeden řazený systém plamen+kouř,
  jiskry, uhlíky a hořící oharky s chladnutím podle Plancka, objemový kouř (T4/T5), houbový mrak a Wilsonův dóm, horký vzduch,
  rázová vlna, trosky, spáleniště, světla ohně s blikáním podle frekvence pulzace.
- **Zvuk** (WebAudio, procedurální): hukot, praskání, lupnutí, rány se zpožděním 343 m/s (tlačítko 🔇/🔊 v prohlížeči).
- **Fyzika** (`src/physics`): Planck + CIE 1931, Heskestad, McCaffrey, AGA náklon, Babrauskas louže, Mulholland saze,
  Tewarson/ventilace, Kinney–Graham, Rankine–Hugoniot, CCPS ohnivá koule, Gurney, Byram, Anderson/FARSITE, Van Wagner,
  Thomas flashover, Kawagoe; přestup tepla a zapálení (Modak, Mudan & Croce, Quintiere, dávka FTP), EN 1995-1-2, Torricelli.
  Každé číslo má míru jistoty ★1–5.
- **Dataset** (`dataset/`): flipbooky PNG + popis kanálů, GLB modely, textury, presety scénářů (JSON), náhledy T0/T2, fyzikální tabulky.

## Rychlý start
```bash
npm install && npm run build      # dist/index.html
npm run test:physics              # korelace proti literatuře
npm test                          # všechny scénáře headless
npm run bake                      # přegenerovat dataset/
npm run test:xengine              # integrace s xEngine (potřebuje klon xEngine, viz integrations/xengine/README.md)
npm run test:audio                # zvuk bez reproduktoru (OfflineAudioContext)
```

Dokumentace: `CLAUDE.md` (pro AI), `STRATEGIE.md` (postup a zásady), `ARCHITECTURE.md` (moduly), `DECISIONS.md`
(laboratorní deník), `TODO.md` (stav), `AUDIT.md` (plán další iterace), `NAVAZANI.md` (navázání sešny, repo, startovní prompt),
`REFERENCE.md` (referenční fotografie).

Licence: CC0 1.0 – vše je vlastní procedurální práce.
