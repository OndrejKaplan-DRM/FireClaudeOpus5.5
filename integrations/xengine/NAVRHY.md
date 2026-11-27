# Návrhy pro xEngine: oheň, kouř a výbuchy z FireLab

Napsala Kristína ve FireLab (27. 11. 2026, iterace 4). Texty jsou připravené k přenesení do `docs/navrhy/` repa xEngine.
**Do xEngine je zapíše jen sešna s přidělenou rolí a s Ondřejovým slovem** (sešna A čísluje od 101, sešna B od 001;
číslo dostane návrh až tam). Do té doby žijí tady. Kdo co dělá: [`SVODNA.md`](SVODNA.md), [`SESNA_A.md`](SESNA_A.md),
[`SESNA_B.md`](SESNA_B.md); kde co je: [`MAPA.md`](MAPA.md).

## Rozhodnuto Ondřejem
| Datum | Rozhodnutí |
|---|---|
| 27. 11. | Napojení na xEngine **ano**; dělá ho **sešna A** podle `SESNA_A.md`. |
| 27. 11. | FireLab v xEngine jako **git submodul** (ne zkopírovaný balík). |
| 27. 11. | Návrhy a návody píše Kristína **sem** (FireLab), pro svodnou sešnu, sešnu A i sešnu B. |
| 27. 11. | Kondenzační (Wilsonův) dóm u 1 t TNT **výraznější, filmový** (umělecké ★1, ve FireLab volba `wilson`). |
| 27. 11. | Komponenta `fire` (a `explosive`) do dat **hned po zkoušce na jednom kusu** (F-7 → F-2). Pole, kódy nálezů a čísla předvoleb dává FireLab jako jednu pravdu: `integrations/xengine/xspace.js`. |
| 27. 11. | Výbuch sudu ve hře **filmový**: `combat:exploded` se sudem → předvolba `barrelFilm` (fyzikální `barrel` zůstává). |
| 27. 11. | Svíčka: bělavé jádro (kompromis oka a fotoaparátu) zůstává; hřib TNT: přidat bílý prstenec kondenzace (umělecké ★1). |

Otevřené otázky jsou na konci.

---

## F-1 (A → svodná): FireLab jako mělký submodul `vendor/firelab`
- **Problém:** kořen repa patří svodné; sešna A smí jen do `src/app` atd. Submodul proto A dočasně dá do `src/app/firelab`.
- **Návrh:** svodná ho při sloučení vlny přesune do `vendor/firelab` (`git mv`, oprava `.gitmodules`, jeden import v `game.js`).
  `build.mjs` se nemění (esbuild najde import sám). `npm install` ve složce submodulu se **nepouští** – three bere z xEngine
  (obě 0.187.0; dvě kopie by rozbily `instanceof`).
- **Pin:** vždy commit FireLab, ve kterém se naposled změnila složka `integrations/xengine` (ne větev `main`).
- **Zkouška:** `npm run test:all` xEngine zelený + `test/a_*fire*` (viz F-6).

## F-2 (A → B a svodná): komponenty `fire` a `explosive` ve formátu xSpace
- **Problém:** obsah jsou data; oheň dnes jde jen kódem (`fire.ignite`), výbuch jen přes `combat:exploded`.
- **Návrh polí** (do `src/xspace/formats.js` až po zkoušce na jednom kusu, D-030):
  ```json
  "components": {
    "fire":      { "preset": "campfire", "on": true, "node": "logs", "offset": [0, 0.05, 0], "scale": 1 },
    "explosive": { "preset": "barrel", "trigger": "destroyed", "hp": 40 }
  }
  ```
  | pole | typ | povinné | význam |
  |---|---|---|---|
  | `fire.preset` | řetězec z FireLab `FIRE_PRESETS` | ano | jméno předvolby (fyzika i vzhled jsou ve FireLab, ne v datech) |
  | `fire.on` | bool | ne (true) | hoří při načtení; přepíná výstup `io` (`on`/`off`) |
  | `fire.node` | id uzlu kostry | ne | oheň se veze s uzlem (louč v držáku, kamna s dvířky) |
  | `fire.offset` | [m, m, m] | ne | posun od uzlu / počátku prefabu |
  | `fire.scale` | 0,25–2 | ne (1) | násobek výkonu Q (průměr a výška plamene se dopočtou) |
  | `explosive.preset` | řetězec z FireLab `EXPLOSION_PRESETS` | ano | `barrel`, `grenade`, `acetylene`, `tnt` |
  | `explosive.trigger` | `destroyed` \| `use` \| `io` | ne (`destroyed`) | co výbuch spustí |
  | `explosive.hp` | číslo | ne | výdrž, když ji prefab nemá jinde |
- **Validátor:** hotové funkce ve FireLab `integrations/xengine/xspace.js` (bez Three.js, import v Node):
  `checkFire(c, { cellHeight, portalDist })`, `checkExplosive(c, { nearestExplosive })`, stálé kódy `CODES`
  (`FIRE_UNKNOWN_PRESET`, `FIRE_BAD_SCALE`, `FIRE_ABOVE_CEILING`, `FIRE_NEAR_PORTAL`, `EXPLOSIVE_UNKNOWN_PRESET`,
  `EXPLOSIVE_BAD_TRIGGER`, `EXPLOSIVE_CHAIN`) a popis polí `FIRE_COMPONENTS`. Čísla předvoleb `fireNumbers(preset, scale)`.
- **Stav:** Ondřej 27. 11. – zapsat **hned po zkoušce F-7** (jeden táborák a jeden sud v ukázkovém levelu).
- **Běh (A):** entita s `fire` při načtení `fire.ignite(preset, pos)`; `io` přepíná `extinguish`/`ignite`;
  `explosive` při `combat:destroyed` → `combat.explode(...)` (poškození je A) a vzhled `fire.explode(preset, pos)`.

## F-3 (A → svodná): veřejná funkce „buňka v bodě“ (`world.cellAt`)
- **Problém:** světlo ohně patří do buňky levelu, aby ho zadržely zavřené brány (D-035) a viditelnost buněk.
- **Stav:** na `sesna-a` existuje `world.cellAt(p)`; FireLab ho volá přes `cellOf`. Návrh: zapsat ho do
  `docs/02_KONTRAKTY.md` jako závazné rozhraní (vstup `[x, y, z]`, výstup buňka nebo nejbližší buňka, nikdy výjimka).

## F-4 (A): měření ohně v `?bench`
- `?bench&fire=campfire` (táborák 3 m před trasou), `?bench&fire=barrel` (výbuch v polovině průletu),
  `?bench&fire=room` (požár místnosti, kouř přes celý obraz – nejhorší přeplnění). Výsledek do `docs/mereni/`.
- **Proč:** ceny ve FireLab jsou ze sandboxu (swiftshader) a jsou jen odhad; rozhoduje T460.

## F-5 (svodná): poškození ohněm a výbuchem jako závazná čísla
- Sálání: `fire.heatFlux(x, y, z)` [W/m²] v pevném kroku. Prahy (SFPE Handbook, ★3): **2,5 kW/m²** bolest do ~20 s,
  **5 kW/m²** popáleniny 2. stupně do ~10 s, **12,5 kW/m²** vznícení dřeva (pilotované). Dávka: `∫ q^(4/3) dt`
  (tepelná dávka, Eisenberg ★3) – stav „hoří mi kůže“ podle dávky, ne podle okamžitého toku.
- Výbuch: přetlak a impuls z tabulek Kinney–Graham (`dataset/physics/blast_tables.json` FireLab, ★4). Prahy: 7 kPa
  rozbitá okna, 35 kPa ušní bubínky (50 %), 100 kPa+ plíce (★3). Poškození počítá A ve `combat`, ne FireLab.

## F-6 (A): testy ohně v xEngine
- Node `test/a_NN_fire.mjs` podle FireLab `tools/test-xengine-node.mjs` (7 kontrol: tok ~1/R², události, výbuch z
  `combat:exploded`, plazma bez ohně, `snapshot/restore`, dva běhy bit po bitu stejné).
- Prohlížeč `test/a_NN_fire_view.cjs` podle FireLab `tools/test-xengine.mjs` (vrstva 0, žádné světlo three.js, na low
  ≤ 1 světlo efektu a žádný viditelný `MeshStandardMaterial`, oheň v obraze).

## F-7 (B): ukázkový balík s ohněm (zkouška D-030 na jednom kusu)
- Jeden prefab `campfire_01` (kameny + polena + `fire: campfire`) a jeden `barrel_explosive_01` (`explosive: barrel`)
  v jednom levelu `gen_demo`. Až projde validátor i T5, rozhodne svodná o zápisu polí do `formats.js`.

## F-8 (FireLab, pro informaci): co přibylo v iteraci 4 a jak se to projeví v xEngine
- Hořící oharky (drobky dřeva s vlastním plamínkem a kouřovou stopou), sazové výrony u sazových plamenů, vzplanutí.
  V xEngine běží samy; cena roste s `emberMul` stupně (low = 0,5).
- Svíčka je laminární kapka (modrý kalich, tmavé jádro u knotu). Předvolba `candle` je upravená.
- 1 t TNT: houbový mrak (vírový prstenec + prachový sloupec), výraznější Wilsonův dóm. Pole proudění se přičítá ke
  všem částicím FireLab jen po dobu výbuchu.
- Les zblízka: hořící kmeny a padající hořící větve (jen scénář FireLab; pro xEngine zatím ne – žádný les v levelech).

## F-9 (FireLab, pro informaci): iterace 5
- Zvuk (WebAudio, procedurální): hukot, praskání, lupnutí, rána se zpožděním 343 m/s. V xEngine by ho systém `fx.fire`
  mohl vést sám (posluchač = kamera hráče) – rozhoduje Ondřej (otázka 2).
- Objemový kouř jen T4/T5 FireLab → v xEngine se neprojeví (high = T2).
- Sud: `barrelFilm` je výchozí převod `combat:exploded` se sudem.

## F-10 (návrh, iterace 6): hořlavé předměty – oheň jako prvek světa
- **Co to je:** předmět s komponentou `flammable` dostává od ohňů tepelný tok, sčítá dávku do vznícení podle materiálu a
  pak hoří vlastním ohněm (výkon a doba z materiálu, hmotnosti a povrchu). Nehořlavé materiály (plech, sklo, zdivo) jen
  mění vzhled (shořelý lak, saze, rez). Ve FireLab hotové: `src/fx/burnable.js`, scénář „Přestup tepla: řetěz vznícení“.
- **Data (xSpace), návrh polí** – jedna pravda v `integrations/xengine/xspace.js` (`FIRE_COMPONENTS.flammable`, `checkFlammable`):
  | Pole | Typ | Povinné | Význam |
  |---|---|---|---|
  | `flammable.material` | řetězec z FireLab `MATERIALS` | ano | `softwood`, `hardwood`, `woodWet`, `paper`, `straw`, `textile`, `puFoam`, `plastic`, `rubber`, `gasoline`, `diesel`, `steelPainted`, `steelThick`, `aluminium`, `glass`, `masonry` |
  | `flammable.mass` | kg | u hořlavých | hmotnost hořlavé části |
  | `flammable.area` | m² | u hořlavých | hořící povrch |
  | `flammable.size` | m | u hořlavých | největší rozměr (doba rozhoření) |
  | `flammable.ignited` | boolean | ne | hoří od načtení |
- **Běh (sešna A):** v pevném kroku pro každý hořlavý předmět `q = fire.heatFluxFull(x, y, z).total`, dávka
  `F = stepDose(F, q, dt, ignitionDose(material))`, při `F ≥ ftp` zapálit `fire.ignite(fireFromSpec({ kind: 'solid', … }), pos)`.
  Funkce jsou čisté (`src/physics/heat.js`, `spec.js`), bez Three.js; determinismus drží pevný krok.
- **Uložení hry:** snapshot musí nést dávku `F`, stav a čas vznícení každého předmětu (dnes nese jen hořící ohně) – úkol sešny A.
- **Level design (sešna B):** `checkFlammable(c, { flux })` hlásí `FLAMMABLE_NEAR_FIRE`, když se předmět od sousedního ohně
  vznítí do minuty (řetěz může být záměr); `fire.ignitionTimeAt(material, x, y, z)` pro nápovědu v editoru.
- **Herní čísla (★3):** sláma chytne od ~8 kW/m² za sekundy, dřevo od 12 kW/m² za minuty, pneumatika od 17 kW/m²;
  1 MW oheň dává 20 kW/m² asi 0,75 m od svého okraje. Prostřelený sud (otvor 9 mm) vytéká 0,12 l/s a hořící pramínek má 4,6 MW.
- **Cena:** vzorce, jednotky mikrosekund na předmět a krok; víc hořících předmětů = víc zdrojů → hlídat rozpočet stupně
  (low: slučovat ohně blíž než ~1,5 m do jednoho).

## F-11 (FireLab, pro informaci): iterace 6
- Nové předvolby ohně: `lighter`, `dieselBarrel`, `pallets`, `strawBale`, `tire`; výbuch `acetyleneCylinder` (tlaková láhev
  v požáru: koule ~13 m, tlaková vlna ~1,8 kg TNT, ne detonace). Vlastní: `fireFromSpec(popis)`, `explosionFromSpec(popis)`.
- `fire.heatFluxFull(x, y, z)` → `{ rad, conv, total, Tg, inFlame }` (blízké pole, kontakt s plamenem, horký oblak);
  `fire.heatFlux` beze změny.
- Plameny jsou **ve dne jasnější** (strop jasu podle fotek, D-039 FireLab) a kouř nafty, benzínu a aut je černý (D-040).
  V xEngine se projeví podle expozice hostitele – po připojení zkontrolovat denní level.
- Sud a karoserie mají stavy plechu (shořelý lak, saze, rez) – jen modely FireLab; prefaby xEngine by potřebovaly stejný
  materiál (`applyChar({ metal: true })`), to je na domluvě se sešnou B.

## Otevřené otázky na Ondřeje
1. Mlha levelu na kouř a plamen: **přidat do shaderů FireLab** (oheň v mlze slábne) / **nechat** (oheň „svítí přes mlhu“)?
2. Zvuk: FireLab od iterace 5 zvuk má (procedurální, WebAudio). **Dodat ho do xEngine přes `fx.fire`** / **zvuk dělá xEngine
   sám** (FireLab jen popíše parametry)?
