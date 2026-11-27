# Návrh pro xEngine: oheň a výbuchy z FireLab (systém `fx.fire`)

*Text je připravený pro `docs/navrhy/` v repu xEngine. Do xEngine ho zapíše jen sešna s přidělenou rolí a s Ondřejovým slovem
(číslo dostane podle role: sešna A od 101, B od 001). Do té doby žije tady.*

**Ondřejova rozhodnutí 27. 11. 2026:** napojení dělá **sešna A**, FireLab jako **git submodul**. Krok za krokem:
[`SESNA_A.md`](SESNA_A.md). Otázka 3 (fyzikální × filmový sud) zůstává otevřená.

## Co se navrhuje
1. **Sešna A (běh)** zaregistruje v `src/app/game.js` systém `createFireSystem` z FireLab (`integrations/xengine/fire-system.js`)
   a přidá ho jako závislost (`dependencies`: FireLab jako git submodul nebo zkopírovaný balík `firelab` – viz otázka 1).
2. **Datový kontrakt xSpace** (sešna B a svodná): nová komponenta entity `fire` (jen po zkoušce na jednom kusu, D-030):
   ```json
   "components": { "fire": { "preset": "campfire", "on": true, "node": "logs", "offset": [0, 0.05, 0] } }
   ```
   a pole `explosive` u prefabu (sud, granát): `{ "preset": "barrel", "trigger": "damage" | "use" }`.
   Předvolby jsou jména z `presets.js` (FireLab), takže data nenesou fyziku – jen odkaz.
3. **Událost** `combat:explode { kind, pos }` (Aréna A-3) zůstává v hře; `fx.fire` na ni reaguje, když je deklarovaná.
4. **Poškození**: hra čte `fire.heatFlux(x, y, z)` v pevném kroku (W/m²). Prahy (★3, SFPE): 2,5 kW/m² bolest do ~20 s,
   5 kW/m² popáleniny 2. stupně do ~10 s, 12,5 kW/m² vznícení dřeva. Výbuch: přetlak z `fire:exploded.W` (tabulky
   `dataset/physics/blast_tables.json` FireLab, Kinney–Graham).
5. **Světlo**: `cellOf(x, y, z)` – veřejná funkce xWorld „buňka v bodě“, aby světlo ohně šlo do správné buňky a zastínily ho brány.
   Dokud neexistuje, světlo ohně nemá buňku (svítí bez bran).

## Proč takhle
- Žádná kopie kódu efektů v xEngine: FireLab je jedna pravda pro fyziku ohně i shadery, xEngine jen volá systém.
- Pravidla xEngine platí beze změny: D-022 (světlo po vrcholech, low ≤ 1 světlo efektu, bez MeshStandardMaterial), vrstva 1
  pro zbraň, pevný krok, deklarované události, kvalita 0–3 (D-029).
- Zkouška: `npm run test:xengine` ve FireLab pouští skutečné `createEngine` a `createRender` z klonu xEngine.

## Co se měří na T460 (neměřeno, odhad)
- low = FireLab T0: sprity z vypečeného atlasu, 1 řazený instancovaný draw (plamen + kouř) + 1 draw jisker, ≤ 1 600 částic.
  Odhad GPU 0,5–2 ms při ohni přes čtvrtinu obrazu (přeplnění alfou je hlavní cena). Měřit `?bench` s ohněm v záběru.
- Most světla: mihotání jen úrovní (dorovnání vrstvy o rozdíl), kvantované po 1/64 → ~30 volání `setLight` za sekundu.

## Otázky na Ondřeje
1. ~~submodul / balík~~ → **submodul** (27. 11.).
2. Komponentu `fire` v xSpace **hned** (B ji přidá do `formats.js` po zkoušce na jednom kusu) / **až po první hře s ohněm**?
3. Výbuch sudu v Aréně: **fyzikální** (CCPS, slabá tlaková vlna) / **filmový** (větší koule, víc trosek – přepínač ve FireLab existuje)?
