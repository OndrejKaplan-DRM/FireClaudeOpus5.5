# FireLab — ohňové assety a efekty pro 3D FPS engine

Procedurální, fyzikálně podložená knihovna ohně, kouře a výbuchů pro Three.js (WebGL2) s prohlížečem,
ve kterém se vše předvádí, měří a exportuje. Od ThinkPadu T460 (Intel HD 520) po herní PC s RTX 4060.

**Otevři `dist/index.html`** (jeden soubor, běží offline z disku).

## Co obsahuje
- **18 scénářů**: jiskra z brusky, svíčka, louč, ohýnek, táborák, velká hranice, stoh slámy, pneumatiky, rozlitá nafta 20 l,
  požár auta, výbuch sudu s benzínem, acetylenová bomba, granát, 1 t TNT, lesní požár, suché křoví, požár domu, parametrický plamen.
- **Podpřípady**: vítr (bezvětří / vánek 2,5 m/s / vítr 9 m/s / vichr 19 m/s, směr), kyslík (ventilace → saze, CO, barva, tvar),
  denní doba (noc / soumrak / den).
- **18 modelů** s LOD 0–4 (~10² až ~10⁶ △), materiál ohořelosti se žhnoucími trhlinami.
- **Efekty**: objemový plamen a ohnivá koule (raymarching), flipbook atlas pečený z téhož pole (T0), jeden řazený systém plamen+kouř,
  jiskry a uhlíky s chladnutím podle Plancka, horký vzduch, rázová vlna, trosky, spáleniště, světla ohně s blikáním podle frekvence pulzace.
- **Fyzika** (`src/physics`): Planck + CIE 1931, Heskestad, McCaffrey, AGA náklon, Babrauskas louže, Mulholland saze,
  Tewarson/ventilace, Kinney–Graham, Rankine–Hugoniot, CCPS ohnivá koule, Gurney, Byram, Anderson/FARSITE, Van Wagner,
  Thomas flashover, Kawagoe. Každé číslo má míru jistoty ★1–5.
- **Dataset** (`dataset/`): flipbooky PNG + popis kanálů, GLB modely, textury, presety scénářů (JSON), náhledy T0/T2, fyzikální tabulky.

## Rychlý start
```bash
npm install && npm run build      # dist/index.html
npm run test:physics              # korelace proti literatuře
npm test                          # všechny scénáře headless
npm run bake                      # přegenerovat dataset/
```

Dokumentace: `CLAUDE.md` (pro AI), `ARCHITECTURE.md` (moduly), `DECISIONS.md` (laboratorní deník), `TODO.md` (stav).

Licence: CC0 1.0 – vše je vlastní procedurální práce.
