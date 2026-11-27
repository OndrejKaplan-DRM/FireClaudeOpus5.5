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

## Co číst jako první (v tomto pořadí)
1. `CLAUDE.md` – pravidla, příkazy, pasti.
2. `STRATEGIE.md` – postup a zásady.
3. `TODO.md` – stav a známé slabiny.
4. `AUDIT.md` – plán další iterace (projít každý objekt, texturu, fyziku i průběh).
5. `DECISIONS.md` – proč je co tak (D-001 až D-038), hlavně D-020 (jas), D-028 (reference), D-034–D-038 (iterace 5).
6. `REFERENCE.md` – referenční fotografie a jejich autoři.
7. `integrations/xengine/README.md` – rozcestník pro xEngine.

## Startovní prompt (ke zkopírování)
> Ahoj Kristíno, navazujeme na FireLab (FireEngine) – ohňové assety a fyziku ohně pro 3D FPS engine.
> Repo https://github.com/OndrejKaplan-DRM/FireClaudeOpus5.5 (main). Přidej si ho (`add_repo`, push), naklonuj a přečti
> CLAUDE.md, STRATEGIE.md, TODO.md, AUDIT.md a DECISIONS.md. Předávka z 2026-11-27 je v projektu
> `claude/FireLab_predavka_2026-11-27_cast1.md` … `_cast3.md`.
> Úkol další iterace: paletu FireEngine rozšiřovat a zobecňovat – projdi podle AUDIT.md každý objekt, texturu, fyziku
> i průběh, porovnej se skutečností (fotky, literatura) a přibliž je realitě ve všech ohledech. Pracuj samostatně,
> rozhoduj sama, výsledek ukaž v prohlížeči FireLab (artefakt) a na konci mi dej 3–5 otázek a/b.
