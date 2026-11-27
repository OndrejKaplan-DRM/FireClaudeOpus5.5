# Zadání pro sešnu A xEngine: oheň, kouř a výbuchy z FireLab (systém `fx.fire`)

Připravila Kristína ve FireLab, 27. 11. 2026. **Ondřejova rozhodnutí z 27. 11.:** napojení dělá **sešna A** podle tohoto
souboru, FireLab se do xEngine připojí jako **git submodul**. Do xEngine jsem nic nezapisovala; vše níže je pro tebe.

Pravda o FireLab je v repu `OndrejKaplan-DRM/FireClaudeOpus5.5`. Když se tenhle soubor a kód rozcházejí, platí kód
(`integrations/xengine/fire-system.js`) a jeho testy. Souvisí: [`MAPA.md`](MAPA.md) (kam sáhnout pro co),
[`NAVRHY.md`](NAVRHY.md) (F-1 až F-8), [`SVODNA.md`](SVODNA.md), [`SESNA_B.md`](SESNA_B.md).

**Novinky iterace 4 (27. 11. odpoledne), které se tě týkají:**
- Hořící oharky, sazové výrony a vzplanutí běží v systému samy (žádné nové API). Na low je jich polovina (`emberMul` 0,5).
- Předvolba `candle` je laminární (hladká kapka); `tnt` má houbový mrak a výraznější Wilsonův dóm (Ondřej: varianta b).
- Houbový mrak přidává po dobu výbuchu pole proudění ke **všem** částicím FireLab (`air.extraUp`); u hry s více ohni
  v okolí to je správně (nasávání k sloupci), jen to nepovažuj za chybu větru.
- Stupeň 3 high = FireLab T2: ve FireLab má T2 nově časovou akumulaci objemů (TAA); v xEngine je vypnutá
  (`hostTier` – hostitel kreslí přímo na plátno bez hloubky a historie). Objemy proto na high mírně zrní; když to bude
  vadit, napiš – řešením je hloubková textura hostitele (návrh pro svodnou, zatím ne).
- Pin submodulu: commit iterace 4 (hash poslední změny `integrations/xengine`, příkaz v 2.1).

---

## 0. Co dostaneš (shrnutí)
- Jeden systém jádra **`fx.fire`** (fáze `late`, běží před `render`), který kreslí oheň, kouř, jiskry, uhlíky a výbuchy
  do scény xEngine a svítí na svět **přes tvůj systém `light`** (po vrcholech, D-022).
- Metody pro hru: `ignite(předvolba, [x,y,z]) → id`, `extinguish(id)`, `explode(předvolba, [x,y,z])`,
  `heatFlux(x,y,z)` [W/m²] (sálání pro poškození), `burning(id)`.
- Události (deklaruje `fx.fire`): `fire:ignited {id, preset, pos}`, `fire:exploded {preset, pos, W, fireballD}`, `fire:out {id}`.
- Poslouchá tvoji **`combat:exploded`** (`src/world/combat.js`): podle `weapon` vykreslí výbuch (sud → `barrel`,
  granát/raketa → `grenade`, TNT/nálož → `tnt`, plazma a ostatní → nic). Převod jde změnit volbou `explosionFor`.
- **Uložení hry** samo: `snapshot()` / `restore()` jádra nesou hořící ohně a jejich věk (i louže po výbuchu sudu).
- **Bez plátna** (Node, `createNullRender`, `headless: true`) běží jen simulace ohně: `heatFlux`, události, uložení –
  tvoje Node testy nepotřebují WebGL.

## 1. Pravidla xEngine, která systém už dodržuje (ověřeno testem, viz 6)
| Pravidlo | Jak |
|---|---|
| D-022: žádné světlo three.js ve scéně | světla FireLab jsou virtuální; most volá `light.addLight` / `setLight` / `moveLight` |
| D-022: low ≤ 1 světlo efektu, žádný `MeshStandardMaterial` | low: 1 světlo ohně, trosky výbuchů vypnuté (jediný standardní materiál FireLab) |
| vrstva 1 kamery = zbraň a ruce | efekty se kreslí do vrstvy 0 (`setFxLayer(0)`) |
| pevný krok 120 Hz, žádný `Math.random` ve hře | průběh hoření (čas, výkon, `heatFlux`) běží ve `step`; částice jsou jen vzhled ve `frame` se semínky FireLab (mulberry32) |
| expozice levelu (`env.exposure`, ACES) | FireLab nemá vlastní expozici: před-expozice 1, tónovou křivku a sRGB berou jeho shadery z three.js (`fxOut`) |
| deklarované události | `fire:*` deklaruje `fx.fire`; `combat:exploded` jen poslouchá, když existuje |
| stupně kvality 0–3 (D-029) | 0 clean = vypnuto, 1 low = FireLab T0 (sprity), 2 mid = T1 (2 objemy), 3 high = T2 (6 objemů) |

## 2. Kroky
### 2.1 Submodul
FireLab má složku `dataset/` (~50 MB náhledů a modelů), hra z ní nic nepotřebuje → **mělký** submodul.
Dočasně ve tvé složce (do kořene by to musela dát svodná, viz návrh v 5):
```bash
git submodule add --depth 1 https://github.com/OndrejKaplan-DRM/FireClaudeOpus5.5 src/app/firelab
git config -f .gitmodules submodule.src/app/firelab.shallow true
# pin: commit, ve kterém se naposled měnila integrace (ne větev main)
git -C src/app/firelab log -1 --format=%H -- integrations/xengine
git -C src/app/firelab checkout <ten hash>
git add .gitmodules src/app/firelab
```
- Přístup: v sandboxu nejdřív `add_repo` na `OndrejKaplan-DRM/FireClaudeOpus5.5` (stačí čtení). Adresa malými písmeny
  jen přesměrovává – v `.gitmodules` nech velká písmena.
- **Ve složce submodulu nepouštěj `npm install`.** FireLab importuje `three` a resolver ho má najít v `node_modules`
  xEngine (stejná verze **0.187.0**). Druhá kopie three by rozbila `instanceof` (materiály, geometrie).
- Ostatní závislosti FireLab za běhu nemá (esbuild a playwright jsou jen pro jeho build a testy).

### 2.2 Zapojení v `src/app/game.js`
```js
import { createFireSystem } from './firelab/integrations/xengine/fire-system.js';
// … po vytvoření render, light, world:
const fire = createFireSystem({
  render, light,
  quality,                                        // stupeň běhu 0–3 (D-029); auto podle tvého měření
  cellOf: (x, y, z) => world.cellAt([x, y, z])?.id ?? null,   // buňka pro světlo (brány, viditelnost)
  seed: 1,
  // explosionFor: (e) => e.weapon === 'barrel_explosive_01' ? 'barrel' : null,  // vlastní převod zbraní
});
E.add(fire);   // kdekoli mezi ostatní; fáze 'late' je vždy před 'view'
```
- `world.cellAt(p)` na `sesna-a` existuje (vrací buňku, z ní `id`). Když bod leží mimo buňky, vrací nejbližší – pro oheň
  u zdi to stačí.
- Světlo: `fx.fire` volá tvoje `light.addLight(def, { id: 'fx.fire.N', cell, fixed: false })` **jednou** na světlo, mihotání
  jen `setLight` (úroveň po 1/64, ~30× za sekundu na světlo) a `moveLight` jen po posunu > 0,5 m. Na low je to 1 světlo
  ohně. **Záblesk zbraně zůstává tvým jediným efektovým světlem po pixelech** – oheň jde přes vrstvy světla, ne přes něj.
  Ověř, že mihotání přes `setLight` nestojí v `?bench` víc než ~0,2 ms; když ano, zvedni kvantování nebo frekvenci
  (proměnná v `bridgeLights`, napiš mi to do `A_STAV.md` a já to dám do FireLab).
- Okolní světlo pro kouř: volba `ambient` [lx] (výchozí noc). Když chceš kouř nasvícený podle levelu, předej
  `level.env.ambient` při načtení (`fire.fx.env.T.hemi = …`) – zatím stačí výchozí.

### 2.3 Hra
- **Zapálení z dat** zatím nejde (formát nemá komponentu ohně – návrh pro B a svodnou v 5). Do té doby jen kódem:
  výbuchy přes `combat:exploded` fungují bez změny dat. Zkušební oheň dej do testu, ne do levelu (obsah jsou data).
- **Poškození hráče** (až bude mít zdraví): v kroku `q = fire.heatFlux(oko hráče)`; prahy (SFPE, ★3):
  2,5 kW/m² bolest do ~20 s, 5 kW/m² popáleniny 2. stupně do ~10 s, 12,5 kW/m² vznícení dřeva.
  Přetlak výbuchu máš ve svém `combat.explode`; FireLab má tabulky Kinney–Graham v `dataset/physics/blast_tables.json`.
- **Předvolby** (`integrations/xengine/presets.js`): ohně `candle`, `torch`, `smallFire`, `campfire`, `bonfire`, `tires`,
  `diesel`, `gasolinePool`, `car`, `room`; výbuchy `barrel`, `grenade`, `acetylene`, `tnt`. Vlastní oheň:
  `fire.ignite({ fuel: 'woodDry', Q: 5e5, D: 1.2 }, pos)` (paliva v `src/physics/fuels.js`, Q ve W, D v m).

### 2.4 Výkon a měření (měř, nevěř)
- Odhad, **neměřeno**: low = sprity z atlasu, 2 volání kreslení (plamen+kouř řazené, jiskry), ≤ 1 600 částic; GPU
  0,5–2 ms při ohni přes čtvrtinu obrazu (hlavní cena je přeplnění průhlednými sprity). CPU simulace FireLab T0 0,02–0,4 ms
  na krok scény (`dataset/physics/perf_cpu.json` FireLab, sandbox).
- Start: atlas plamene a kouře se peče při `build()` na GPU (128 px, 128 snímků); na T460 odhad 0,1–0,5 s jednou.
- Navrhuji do `?bench` parametr `&fire=campfire` (táborák 3 m před trasou) a `&fire=barrel` (výbuch v polovině průletu);
  výsledek do `docs/mereni/`.

## 3. Co přidat do tvých testů
- **Node** (`test/a_NN_fire.mjs`): jádro + `createNullRender` + `fx.fire` (headless). Vzor: FireLab
  `tools/test-xengine-node.mjs` – sálavý tok ~1/R², události, výbuch z `combat:exploded` (plazma bez ohně),
  `snapshot`/`restore` (tok po nahrání stejný), dva běhy bit po bitu stejné.
- **Prohlížeč** (`test/a_NN_fire_view.cjs` přes `test/h.cjs`): xLab, oheň 3 m před hráčem, snímek z plátna; kontroly
  jako FireLab `tools/test-xengine.mjs`: bez chyb stránky, efekty ve vrstvě 0, `scene.traverse` nenajde světlo three.js,
  na low žádný viditelný `MeshStandardMaterial`, počet světel efektu ≤ 1, oheň v obraze (jasné oranžové body).
- Rozpočet souborů: zkoušky pomocí v `test/a_lib/`.

## 4. Co FireLab o xEngine předpokládá (kdyby se to změnilo, napiš)
- Kernel: `E.add`, `E.on`, `E.emit`, `E.eventList()`, `E.mode`, `E.timeScale`, metody systému `init/build/reset/step/frame/
  snapshot/restore`.
- Render: `render.scene`, `render.camera`, `render.renderer` (getter; po přepnutí vyhlazování nový – FireLab ho čte každý
  snímek), `render.size`, `render.headless`; kreslí jen v režimu `playing` (v pauze se efekty nehýbou – správně).
- Light: `addLight(def, {id, cell, on, level, fixed})` vrací záznam s `pos`, `color`, `intensity`, `range`, `on`, `level`;
  `setLight(L)`, `moveLight(L)`. Jednotky: kandely, decay 2, `range` = dosah.

## 5. Návrhy do `docs/navrhy/` (číslo dej podle svého pořadí, A od 101)
**N-1xx (A → svodná): FireLab jako submodul v `vendor/firelab`.** Dnes je dočasně v `src/app/firelab` (moje složka);
kořen patří svodné. Přesun = změna cesty v `.gitmodules` a v importu v `game.js`. Build: `build.mjs` nemusí nic znát,
esbuild import najde.

**N-0xx (pro B a svodnou): komponenta `fire` a pole `explosive` v xSpace** (D-030: nejdřív zkouška na jednom kusu):
```json
"components": { "fire": { "preset": "campfire", "on": true, "node": "logs", "offset": [0, 0.05, 0] } }
"components": { "explosive": { "preset": "barrel", "trigger": "destroyed" } }
```
Data nesou jen jméno předvolby FireLab, ne fyziku. Běh: entita s `fire` při načtení `ignite`, výstup `on/off` přes `io`;
`explosive` při `combat:destroyed` → `combat.explode(...)` (poškození tvoje) a `fire.explode(preset)` (vzhled FireLab).
Validátor: neznámá předvolba = nález (seznam z FireLab `presets.js`).

## 6. Jak je to ověřené ve FireLab (27. 11. 2026)
- `node tools/test-xengine-node.mjs` (jádro z klonu xEngine, headless): 7/7.
- `node tools/test-xengine.mjs` (skutečné `createEngine` + `createRender` z klonu, záznamník místo systému light,
  kvalita 1 a 3): všechny kontroly prošly, snímky `/tmp/xfire/q1.png`, `q3.png`.
- **Neověřeno:** skutečný systém `light` s levelem a branami, skutečný `world.cellAt`, `?bench` na T460, sloučení
  s `zaklad-2`.

## 7. Pasti
- `combat:exploded` je sdílený přepisovaný objekt – `fx.fire` si hodnoty kopíruje hned (nesahej na to).
- `flameLum` (plamen) a `lumRef` (výbuchy, jiskry, žhnutí) jsou dvě různé adaptace jasu ve FireLab; sud se Ondřejovi líbí
  takový, jaký je – neměň `lumRef`.
- FireLab peče atlas do vlastního render targetu: po přepnutí vyhlazování (nový kontext WebGL) se atlas musí upéct znovu –
  zatím to FireLab neumí, napiš, jestli přepnutí za běhu potřebuješ (dnes doporučuji přepnutí s novou hrou).
- Kouř a plamen jsou průhledné sprity → mlha levelu (`FogExp2`) na ně nepůsobí. Ve velké mlze vypadá oheň „nad mlhou“.
  Když to bude vadit, napiš; přidám mlhu do shaderů FireLab.
