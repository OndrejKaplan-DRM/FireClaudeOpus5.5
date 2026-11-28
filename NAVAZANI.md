# NAVAZANI — jak začít další sešnu FireLab

## Repo a GitHub
- Repo: **https://github.com/OndrejKaplan-DRM/FireClaudeOpus5.5** (větev `main`; adresa malými písmeny jen přesměrovává).
- V sandboxu: nástroj `add_repo` (owner `OndrejKaplan-DRM`, repo `FireClaudeOpus5.5`, přístup push), pak klon,
  `npm install`, `npm run build`, `npm test`. Push: `git -c push.negotiate=true push origin HEAD:main`, ověřit `git ls-remote origin main`.
- Autor commitů: `Claude (Kristína) <noreply@anthropic.com>`; na konci zprávy atribuční řádky sešny.
- Artefakt FireLab na claude.ai: https://claude.ai/artifact/ALsY87Cfm3Sd3U4eQVJMak
  (slug `4ba8861b-417a-4687-8f0a-b747ffd677fd`, schopnost `downloads`; publikace `publish_files` s `dist/index.html`,
  `base_version` z `get_artifact`).
- xEngine (jen ke čtení, kvůli testu integrace): `OndrejKaplan-DRM/xEngine`, klon do `/home/claude/ondrejkaplan-drm/xengine`,
  `XENGINE=<cesta> npm run test:xengine`. **Do xEngine se nezapisuje.**

## Stav po iteraci 7 (2026-11-28 v noci)
- `main` obsahuje iteraci 7: 39 scénářů, 36 modelů, jádro bez grafiky (`physics/sim.js`), zbraně, hašení, následky, UI.
- **Artefakt je sdílený veřejně** a obsahuje jen verzi `1795893249-6463` (oprava rozložení D-047). Novou verzi smím zapsat
  až po Ondřejově výslovném souhlasu; do té doby dostává `dist/index.html` jako soubor.
- Ondřej hlásil, že se artefakt nespustil („Error creating WebGL context“): hypotéza zablokovaného WebGL v Chrome, čeká se
  na jeho ověření (restart prohlížeče, `chrome://gpu`). Na naší straně D-048.
- Testy: fyzika 116, kouřové T0 a T3 všech 39 scénářů, UI, rozložení (dpr 1–3), start bez WebGL, zvuk, xEngine.
- Otevřené otázky pro Ondřeje a plán iterace 8: `AUDIT.md` (první oddíl), `TODO.md` („Otevřené po iteraci 7“).
- Číst navíc: `ANALYZA_2026-11-28.md`, `RESERSE_HRY.md`, `MODEL.md` §9–14.

## Stav po iteraci 6 (2026-11-27 večer)
- `main`: 23bac35 (iterace 6: kód a dokumenty), 27d1ac9 (dataset). Artefakt FireLab verze `1795804912-6128`.
- Testy na tomto stavu: fyzika, T0 a T3 (24 scénářů), UI, zvuk, integrace s xEngine `main` 1f2e623 – vše bez chyb.
- Otevřené otázky pro Ondřeje jsou na konci zprávy z iterace 6 (hořlavé předměty do xEngine, přepis starých scénářů,
  filmová nebo fyzikální láhev, denní jas, co dál).

## Co číst jako první (v tomto pořadí)
1. `CLAUDE.md` – pravidla, příkazy, pasti.
2. `STRATEGIE.md` – postup a zásady.
3. `TODO.md` – stav a známé slabiny.
4. `AUDIT.md` – plán další iterace (projít každý objekt, texturu, fyziku i průběh).
5. `DECISIONS.md` – proč je co tak (D-001 až D-046), hlavně D-020 (jas), D-028 (reference), D-039–D-046 (iterace 6).
   `MODEL.md` – obecný model ohně (jeden popis, přestup tepla, vznícení, následky, kde se šetří).
6. `REFERENCE.md` – referenční fotografie a jejich autoři.
7. `integrations/xengine/README.md` – rozcestník pro xEngine.

## Startovní prompt (ke zkopírování)
> Ahoj Kristíno, navazujeme na FireLab (FireEngine) – ohňové assety a fyziku ohně pro 3D FPS engine.
> Repo https://github.com/OndrejKaplan-DRM/FireClaudeOpus5.5 (main). Přidej si ho (`add_repo`, push), naklonuj a přečti
> CLAUDE.md, STRATEGIE.md, TODO.md, AUDIT.md a DECISIONS.md. Předávka z 2026-11-27 je v projektu
> `claude/FireLab_predavka_2026-11-27_cast1.md` … `_cast3.md`.
> Stav: iterace 6 hotová (obecný model ohně – `MODEL.md`, 24 scénářů, paleta 42 fotek v `REFERENCE.md`).
> Úkol další iterace: pokračuj podle AUDIT.md a „Známých slabin iterace 6“ v TODO.md – přepiš staré scénáře na `fireSpec`,
> rozděl auto, dům a stoh na hořlavé části, doplň saze na zdivu, sklo a tavení, oprav prostřelený sud a zapalovač;
> každou věc porovnej se skutečností (fotky, literatura). Pracuj samostatně, rozhoduj sama, výsledek ukaž v prohlížeči
> FireLab (artefakt) a na konci mi dej 3–5 otázek a/b.
