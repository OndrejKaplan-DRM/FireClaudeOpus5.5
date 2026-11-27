# STRATEGIE — jak FireLab vzniká a podle čeho se rozhoduje

Stav k 2026-11-27 (po iteraci 5). Tento soubor popisuje **postup a zásady**, které se během iterací 1–5 osvědčily.
Proč konkrétní věci vypadají, jak vypadají, je v `DECISIONS.md` (D-001 až D-038); co se právě dělá, je v `TODO.md`;
co se má projít v další iteraci, je v `AUDIT.md`; jak navázat, je v `NAVAZANI.md`.

## 1. Cíl a měřítko úspěchu
- Ondřejovo zadání (2026-11-26): univerzální dataset ohňových assetů a fyziky ohně pro 3D FPS engine, **hyperrealistický**,
  škálovatelný od ThinkPadu T460 po současné herní PC, vlastní práce (CC0 šablony povolené), vlastní prohlížeč.
- Ondřejovo hodnocení: iterace 1 „3–4 hvězdičky z 5“ (2026-11-27 06:39), výbuch sudu s benzínem se mu líbí.
  Ondřej 2026-11-27 10:19: realističnost **na všech stupních i za cenu výkonu**; pro praktické použití pak „ekonomicky
  příznivější varianta“ (nižší stupně).
- Úspěch = efekt obstojí ve srovnání **obraz vedle fotografie** (REFERENCE.md) a jeho čísla mají zdroj s ★.

## 2. Fyzika první, oko druhé
1. Každý efekt začíná fyzikální veličinou z korelace (výška plamene Heskestad, stoupání McCaffrey, náklon AGA, optická
   tloušťka kouře, Kinney–Graham, CCPS ohnivá koule, Byram/Anderson/Van Wagner, Planck). Čisté funkce v `src/physics/`,
   testované proti literatuře (`npm run test:physics`).
2. Vzhled se dolaďuje až potom, a to **označeně**: každé umělecké číslo má v komentáři „umělecké ★1–2“ a záznam v DECISIONS.
   Slovo „realistické“ jen u fyzikálně podloženého; jinak „umělecké“ nebo „filmové“.
3. Dvě adaptace jasu: `flameLum` pro plameny (částečná adaptace oka β = 0,4, zisk podle optické tloušťky) a `lumRef` pro
   výbuchy, jiskry a žhnutí. **`lumRef` se nemění bez srovnání snímků** – sud se Ondřejovi líbí.
4. Fyzikální a filmové varianty žijí vedle sebe (sud: `barrel` × `barrelFilm`, Wilsonův dóm: volba `wilson`), rozhoduje Ondřej.

## 3. Stupně kvality a „ekonomická varianta“
- T0–T5 v `src/engine/tiers.js` (jediné místo s rozpočty). T0 = T460 (sprity z vypečeného atlasu, bez objemů);
  T1 = 2 levné objemy; T2 = 6 objemů + časová akumulace; T3 = herní PC ~35 tis. Kč (16 objemů, stín od ohně);
  T4 Ultra a T5 Kino navíc objemový kouř.
- Každá nová věc má cestu pro T0 (aspoň sprite nebo vypnutí bez rozbití obrazu). Drahé věci se škálují počtem
  (`smokeMul`, `emberMul`, `particles`, `volumes`, `smokeVolumes`), ne natvrdo v efektu.
- Výkon se měří **počty** v sandboxu (volání kreslení, △, částice; `tools/tri.mjs`), čas GPU až na Ondřejově stroji.
  Odhad se nikdy nevydává za měření.

## 4. Kalibrace podle skutečnosti
- Reference: fotografie z Wikimedia Commons (jen CC / volné dílo), **necommitují se**, v repu jen
  `dataset/reference/manifest.json` (autor, licence, odkaz) a naměřené statistiky. Viz REFERENCE.md.
- Postup na jeden efekt: fotka a render vedle sebe ve stejném měřítku → slovní seznam rozdílů (tvar, okraj, barva, jas,
  dynamika) → oprava → nový render vedle fotky. Číselná metrika barvy (odstín, sytost svítivých pixelů) jen na nočních snímcích.
- Literatura před fotkou, když jde o čísla (velikosti oharků, rychlosti, teploty).

## 5. Ověřování (každá ucelená změna)
1. `npm run build` → `npm test` (T0), u změn vzhledu i `node tools/test.mjs 3` a `4` (snímky všech scénářů,
   `/tmp/firetest_T*/sheet.png` – **podívat se na ně**).
2. `npm run test:physics`, `npm run test:ui`, `npm run test:audio`, `XENGINE=<klon> npm run test:xengine`.
3. Detail okem: `tools/look.mjs` (kamera + úprava stavu), `tools/seq.mjs` (časová řada), srovnávací montáž v PIL.
4. Zápis: `DECISIONS.md` (nové D-xxx), `TODO.md`, `ARCHITECTURE.md`, `CLAUDE.md` (pasti).
5. `npm run bake` (dataset), commit s atribučními řádky, push na `main`, nová verze artefaktu.
6. Zpráva Ondřejovi: co se změnilo, co nesedí (poctivě), ukázkový obrázek, 3–5 otázek a/b.

## 6. Spolupráce s Ondřejem
- Kristína pracuje samostatně a rozhoduje sama; Ondřej rozhoduje mezi variantami přes krátké otázky a/b/c (stačí písmeno).
- Jeho rozhodnutí se zapisují doslovně (DECISIONS, `integrations/xengine/NAVRHY.md`, paměť projektu).
- Hodnocení „hyperrealistické“ dává Ondřej, ne Kristína; ve zprávě se neříká, že je hotovo, když nesedí srovnání s fotkou.

## 7. xEngine
- FireLab je jedna pravda pro fyziku i shadery ohně; xEngine jen volá systém `fx.fire` (`integrations/xengine/fire-system.js`).
- Do repa xEngine FireLab **nezapisuje** (role sešen A, B a svodné, Ondřejovo slovo). Návrhy a návody jsou v
  `integrations/xengine/` (MAPA, NAVRHY F-1 až F-9, SVODNA, SESNA_A, SESNA_B) a data ohně pro xSpace v `xspace.js`.
- Pravidla hostitele (světlo po vrcholech D-022, vrstva 0, pevný krok, deklarované události, kvalita 0–3) hlídá
  `npm run test:xengine` proti skutečnému jádru z klonu.

## 8. Dataset a repo
- Vše generuje kód ze semínka (modely, textury, flipbooky, zvuk). Do repa jen GLB do ~200 k △ (D-007).
- `dataset/` se přepéká po každé iteraci (`npm run bake`, ~5 min na sandboxu); `dist/index.html` je jeden soubor, běží
  z `file://` i jako artefakt na claude.ai.
