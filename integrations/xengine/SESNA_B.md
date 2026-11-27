# Zadání pro sešnu B xEngine: oheň a výbušniny v datech (prefaby, generátor, validátor)

Připravila Kristína ve FireLab, 27. 11. 2026. Ondřej chce, aby každá sešna xEngine měla všechny informace pro oheň.
Do xEngine jsem nic nezapisovala. Pravidla xEngine (skill `xengine`, `CLAUDE.md`, D-028 až D-037) platí beze změny:
**do cizích složek se nepíše, nová pole formátu až po zkoušce na jednom kusu (D-030), obsah jsou data.**

Mapa souborů: [`MAPA.md`](MAPA.md). Návrhy: [`NAVRHY.md`](NAVRHY.md) (pro tebe hlavně F-2 a F-7).

**Ondřej 27. 11.: komponenta ohně do dat hned po zkoušce na jednom kusu.** Udělej F-7 (jeden `campfire_01` a jeden
`barrel_explosive_01` v ukázkovém levelu) a pošli svodné návrh F-2. Pole, stálé kódy nálezů a čísla předvoleb ber
z FireLab `integrations/xengine/xspace.js` (`FIRE_COMPONENTS`, `CODES`, `checkFire`, `checkExplosive`, `fireNumbers`) –
nic z toho nekopíruj. Sud v datech nes jako `explosive: { preset: "barrelFilm" }` (ve hře filmový, Ondřej 27. 11.).

## 1. Co od tebe oheň potřebuje
1. **Prefaby s ohněm** (xForge, `packs/kit_base` nebo nový `packs/kit_fire`):
   | prefab | díly | oheň | poznámka |
   |---|---|---|---|
   | `campfire_01` | kruh 8–10 kamenů Ø 1,0 m, 4–5 polen v jehlanu | `fire: campfire`, `offset [0, 0.05, 0]` | polena mají materiál „ohořelé dřevo“ (viz 4) |
   | `torch_wall_01` | držák na zeď + louč 0,6 m | `fire: torch`, `node: "torch"` (kloub `hinge` pro vyjmutí) | výška plamene 0,34 m |
   | `brazier_01` | kovový koš na nohách 0,9 m | `fire: smallFire` | |
   | `candle_01` | svíčka Ø 2 cm, 12 cm | `fire: candle` | jen dekorace; nesvítí na low (rozpočet 1 světla) |
   | `barrel_explosive_01` | sud 200 l (Ø 0,58 × 0,88 m), červený s nápisem | `explosive: barrel`, `trigger: destroyed` | po výbuchu hořící louže 3,5 m, 26 s |
   | `tire_pile_01` | 4–6 pneumatik na sobě | `fire: tires` | hustý černý kouř – ne do malých místností |
   Kostra před tvarem: každý prefab má `rig` (i když jen jeden uzel). Přední strana +Z.
2. **Ukázkový level** (zkouška D-030): jeden level v `gen_demo` (nebo `fire_demo`) s jedním `campfire_01` a jedním
   `barrel_explosive_01`. Pole `fire`/`explosive` zatím mimo `formats.js` → návrh F-2 a dočasně ve vlastní složce
   (např. `packs/fire_demo/levels/*.json` s poznámkou), až do rozhodnutí svodné.
3. **Validátor** (návrh pro svodnou, tvoje dočasná kontrola v `test/b_*`):
   - neznámá předvolba = nález (jména níže v tabulce 2);
   - plamen pod stropem: `L × fire.scale^0,4 > 0,8 × výška buňky` = varování (oheň by „prorazil“ strop);
   - odstup od dveří a průchodů: vzdálenost středu ohně od nejbližšího průchodu < `R(2,5 kW/m²)` = varování
     (hráč by v průchodu bral poškození);
   - `explosive` blíž než 2 m od jiného `explosive` = varování (řetězová reakce – chtěná jen výslovně).
4. **Generátor xGen** (rozmístění): ohně jen do buněk s výškou ≥ `L / 0,8`; mimo osu průchodů; táborák a sud nejvýš
   jeden na buňku 6 × 6 m (přeplnění průhlednými sprity je hlavní cena na T460 – zatím neměřeno, viz F-4).
5. **xBake (zapékání světla, D-035):** světlo ohně se **nezapéká** – oheň jde zhasnout a mihotá (dynamická vrstva přes
   systém `light`). Výjimka k úvaze: „věčná“ louč na zdi může mít zapečený slabý podíl (30 %) a zbytek dynamicky; to je
   rozhodnutí pro svodnou, ne pro FireLab.

## 2. Předvolby FireLab a čísla pro data (z fyziky FireLab, `node` výpočet 27. 11. 2026)
Výška plamene `L` (Heskestad ★4, svíčka a louč měřené ★3), sálání bodovým zdrojem `χr·Q/4πR²` (Modak ★3).
`R(q)` = vzdálenost od osy ohně, kde tok klesne na `q`.

| předvolba | palivo | Q [kW] | D [m] | L [m] | R(2,5 kW/m²) | R(5) | R(12,5) |
|---|---|---|---|---|---|---|---|
| `candle` | parafín | 0,08 | 0,016 | 0,04 | 0,03 | 0,02 | 0,01 |
| `torch` | smolné dřevo | 4 | 0,065 | 0,34 | 0,20 | 0,14 | 0,09 |
| `smallFire` | suché dřevo | 15 | 0,32 | 0,37 | 0,38 | 0,27 | 0,17 |
| `campfire` | suché dřevo | 200 | 0,8 | 1,14 | 1,38 | 0,98 | 0,62 |
| `bonfire` | suché dřevo | 3 000 | 2,4 | 3,33 | 5,35 | 3,78 | 2,39 |
| `tires` | pryž | 800 | 0,95 | 2,44 | 3,19 | 2,26 | 1,43 |
| `diesel` | nafta 20 l | 13 300 | 4,1 | 6,29 | 12,2 | 8,6 | 5,5 |
| `gasolinePool` | benzín | 1 200 | 1,5 | 2,48 | 3,66 | 2,59 | 1,64 |
| `car` | auto | 3 000 | 2,2 | 3,54 | 5,78 | 4,09 | 2,59 |
| `room` | obsah místnosti | 1 500 | 2,0 | 2,34 | 3,97 | 2,81 | 1,78 |

Výbuchy (`EXPLOSION_PRESETS`): `barrel` (sud 25 kg benzínu: ohnivá koule ~17 m, slabá tlaková vlna, hořící louže),
`grenade` (180 g Comp B ≈ 0,24 kg TNT), `acetylene` (15 l směsi s kyslíkem), `tnt` (1 000 kg; houbový mrak – pro level
nevhodné, jen venkovní scéna).

## 3. Co neděláš ty (aby se sešny nepotkaly)
- Fyzika, shadery, předvolby a most → FireLab (tohle repo). Když potřebuješ novou předvolbu (např. `stove`, `gasLeak`),
  napiš ji do `B_STAV.md` jako „pro FireLab“ s parametry (palivo, Q, D) a já ji přidám do `presets.js`.
- Zapojení systému, poškození, události → sešna A (`SESNA_A.md`).
- Zápis polí do `formats.js`, `02_KONTRAKTY.md`, submodul v kořeni → svodná (`SVODNA.md`).

## 4. Materiály a vzhled prefabů (doporučení)
- Polena a louč: materiál s ohořením FireLab (`src/fx/char.js`, „aligátoří kůže“ trhlin a žhnutí) funguje jen na
  osvětlených materiálech (`MeshStandardMaterial`) → na low (D-022) ho nepoužívat; pro low stačí tmavá barva vrcholů
  a žhnoucí spodní stěna (emise v barvě vrcholů, 900–1 100 K ≈ tmavě oranžová).
- Kameny kolem ohniště: horní strany začernalé sazemi (barva vrcholů ×0,4 v horních 30 %).
- Sud: červená barva s okrajem odřené oceli; po výbuchu se prefab skryje (FireLab kreslí trosky jen na mid/high).

## 5. Testy pro tebe
- `test/b_NN_fire_data.mjs`: všechny prefaby s `fire`/`explosive` projdou `checkFire`/`checkExplosive` z `xspace.js`
  bez chyb (varování vypsat); čísla nikdy natvrdo – když FireLab změní předvolbu, test se přizpůsobí.
- T5 (A × B): robot projde level s ohněm; po zapojení A ověří, že hráč u táboráku dostává tok 2–5 kW/m² na 1,0–1,4 m.

## 6. Pasti
- `L` z tabulky je střední výška; špičky přerušované zóny sahají o ~30 % výš a vzplanutí (dřevo, sláma) krátce o 20 %.
- Kouř je průhledný sprite: v malé místnosti s `tires` nebo `room` zaplní obraz → nejhorší případ pro T460. Do levelů
  pro T460 dávej tyto předvolby jen do velkých prostor, dokud A nezměří F-4.
- Předvolba je jméno, ne číslo: nikdy nekopíruj `Q`, `D` do dat (jedna pravda je FireLab).
