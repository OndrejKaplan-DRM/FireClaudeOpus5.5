# AUDIT — plán další iterace: projít celou paletu a přiblížit ji realitě

Ondřej 2026-11-27 17:46: *„… bude paletu FireEnginu rozšiřovat a zobecňovat – ať projde každý objekt, texturu, fyziku
i průběh a snaží se přiblížit realitě ve všech ohledech více.“*

Hodnocení „dnes“ je **můj odhad** (Kristína, 2026-11-27, po iteraci 5) realističnosti na T3 ve srovnání s fotkami,
★1–5. Není to Ondřejovo hodnocení ani měření. Stav položky: `—` neprošlo, `R` reference nalezena, `S` srovnáno,
`O` opraveno, `V` ověřeno snímkem. Po každé položce zapsat výsledek sem (sloupec Stav) a rozhodnutí do DECISIONS.

## 0. Postup pro každou položku (stejný pro objekt, texturu, fyziku i průběh)
1. **Reference:** 2–4 fotografie nebo video (Commons, CC/PD; zapsat do `dataset/reference/manifest.json`), u fyziky článek
   nebo norma s číslem (★).
2. **Srovnání:** render FireLab ve stejném měřítku a světle vedle reference (`tools/look.mjs`, montáž v PIL);
   seznam rozdílů slovy (tvar, rozměr, barva, jas, okraj, dynamika, časový průběh).
3. **Oprava** v kódu; čísla se zdrojem a ★; umělecké úpravy označit.
4. **Ověření:** nový render vedle reference; testy (viz STRATEGIE §5); T0 nesmí ztratit cestu.
5. **Zápis:** tento soubor (Stav), DECISIONS, TODO.

## Stav po iteraci 6 (2026-11-27 večer)
Hotovo z §4 a §5: zapálení mezi objekty (D-043), jeden popis ohně a obecný výbuch (D-041), hořlavý objekt jako komponenta
(D-043), stavy plechu (D-042), paliva butan/acetylen/aceton/líh, denní jas plamene (D-039), barva kouře (D-040).
Přibylo 6 scénářů (celkem 24) a 5 assetů (23). Obecný model je popsaný v `MODEL.md`, paleta 42 fotek v `REFERENCE.md`.
Z tabulek níže se tím změnily řádky označené **O** (opraveno) nebo **V** (ověřeno snímkem); ostatní čekají.

## 1. Scénáře a jejich průběh (24)
| Scénář | Dnes | Hlavní rozdíly proti realitě | Průběh k ověření (literatura) | Stav |
|---|---|---|---|---|
| spark (bruska) | ★3 | jiskry oceli se nevětví („hvězdičky“ uhlíku), chybí rozžhavený kov v místě řezu, odrazy od podlahy | barva podle slitiny, délka stop | — |
| candle | ★4 | mihotání v průvanu, ohnutý knot se žhnoucí špičkou, menisk roztaveného vosku, čoudění při mihotání | zhasnutí → bílý dým (hotovo) | — |
| torch (louč) | ★3 | plamen moc úzký a vysoký, chybí černá sazová stopa a kapání smoly | doba hoření, výkon v čase | — |
| smallFire | ★3 | málo polen, chybí bílá pára na začátku | zapálení → rozhoření (t²) | — |
| campfire | ★3,5 | plamen obtéká polena jen celkově, ne každé poleno; polena se nepropadají; popel | rozhoření → plné hoření → lože uhlí (hodiny) | — |
| bonfire | ★3,5 | zřícení hranice, vítr ohýbá sloup, pyrolýzní plyny šlehají z mezer | HRR hranice (NIST) | — |
| haystack | ★3 | sláma hoří jasněji a rychleji, létající hořící stébla, doutnání uvnitř, propad balíků | rychlost šíření ve stohu | — |
| tires | ★3,5 | nízké plameny po obvodu hromady, louže roztavené pryže; denní jas opraven (D-039) | HRR pneumatik (vydatné, desítky min) | O |
| diesel | ★3,5 | velké víry puffingu, černý plášť kouře, zmenšování louže, lesk povrchu | spalovací rychlost m″ (hotovo), konec hoření | — |
| car | ★3 | postup motor → kabina → pneumatiky, praskání skel, výbuchy pneumatik, kapky hliníku, puchýře laku | HRR osobního auta (Okamoto, NIST: 3–8 MW za 10–20 min) | — |
| barrel | ★4 | rolující vír ohnivé koule, deformace sudu; **vzhled se Ondřejovi líbí – měnit jen se srovnáním** | ohřev → roztržení (D-008) | — |
| acetylene | ★3 | velmi jasný záblesk, skoro bez sazí, viditelná rázová vlna v prachu | detonace směsi | — |
| grenade | ★3,5 | stopy střepin, prachový prstenec, jizva v zemi, špína na objektivu zblízka | Gurney, kráter | — |
| tnt | ★3,5 | barva ohnivé koule, sukně prachu, kráter, vlnění země; hřib a prstenec hotové | stoupání termiky (★2) | — |
| forest | ★3 | korunový požár zblízka (plamínky ve větvích), přeskoky ohně (oharky zapalují před čelem), pyrokumulus, svah | Rothermel/Byram, přeskoky | — |
| brush | ★3 | tvar čela (linie plamenů), barva kouře, spálené zbytky trav | rychlost čela v trávě | — |
| house | ★3 | praskání oken, flashover viditelný oknem, kouř z podstřeší (šedý → černý), čouzení fasády nad okny, světlo dírou ve střeše | dvouzónový model místnosti (Kawagoe hotovo), čas flashoveru | — |
| lab (parametrický) | — | slouží k ladění; ověřit rozsahy parametrů; přibyla paliva butan, acetylen, aceton, líh | — | O |
| **lighter** (nový) | ★3,5 | plamen má špičatou a zrnitou špičku, modrá pata slabá; jiskry delší než na fotce; tělo v noci splývá | škrtnutí → zážeh, mez výbušnosti | V |
| **dieselBarrel** (nový) | ★3,5 | kouř na tuto velikost správně řídký, ale chybí valivé „květáky“; okraj sudu nežhne viditelně ve dne | rozhoření studené nafty, pokles hladiny | V |
| **leak** (nový) | ★3 | nad plameny mramorovaný pás (tetelení přes kouř); pruh neteče (pevná geometrie); čelo plamene skáče po úsecích | Torricelli, rovnovážná plocha, rychlost čela | V |
| **acetyleneCyl** (nový) | ★3,5 | úlomky jsou malé a rychle mizí z obrazu; před roztržením chybí syčení a šlehající plamen z ventilu | ohřev pláště → roztržení (čas ★2) | V |
| **chain** (nový) | ★3 | balík slámy pod plamenem splývá; sesedání jen měřítkem; jeden měřicí bod na předmět | pořadí a časy vznícení z materiálů | V |
| **blastLab** (nový) | — | laboratoř měřítka výbuchu; mezi 20 a 100 kg chybí plynulý náběh hřibu | mocninné zákony | V |

## 2. Objekty (18 modelů, `src/assets/`)
| Model | Dnes | Co chybí k realitě | Stav |
|---|---|---|---|
| candle (svícen) | ★3,5 | menisk vosku, stékající vosk, opotřebení mosazi | — |
| torch (louč v držáku) | ★3 | vláknitá struktura smolného dřeva, ovinutí | — |
| campfireS / campfire / bonfire | ★3,5 | rozmanitost polen (kůra, třísky), postupné ohořívání a propad, popel | — |
| tire / tirePile | ★3,5 | dezén, nápisy na boku, deformace hořením | — |
| barrel | ★4 | prolisy, deformace po výbuchu; stavy laku, saze a rez hotové (D-042) | O |
| grenade, tntDrum, acetylene | ★3,5 | detaily povrchu, nápisy (vlastní, ne značky) | — |
| grinder (bruska) | ★3 | kotouč, rozmazání pohybem, rozžhavený řez | — |
| puddle (louže + kanystr) | ★3 | lesk a duhový film nafty, vsakování | — |
| strawStack | ★3 | stébla na povrchu (karty), provázky | — |
| car | ★3 | interiér, skla, kola, postupné ohořívání po částech; plech karoserie má stavy laku a rez (D-042) | O |
| house | ★3 | interiér přes okna, krov, okna se sklem, čouzení | — |
| pine | ★3,5 | jedna textura karet, kůra s plátovitou strukturou, šišky | — |
| bush | ★2,5 | koule z ikosaedrů – chce karty větviček jako borovice | — |
| **lighter, barrelOpen, gasCylinder, pallet, crate** (nové) | ★3 | zapalovač bez potisku a pružinky, láhev bez nálepek a klobouku ventilu, paleta bez hřebů a razítek | V |

## 3. Textury (22, `src/assets/textures.js`, kreslené kódem)
`bark, woodEnd, woodPlank, wax, rubber, metalRed, metalBlue, metalGreen, metalOlive, carPaint, steel, straw, plaster,
brick, roof, needles, leaves, stone, tnt, acetylene, glass, asphaltCar` (+ normálové mapy u kůry, cihel, střechy, pryže,
kamene, slámy).
- Projít každou proti fotce materiálu: rozlišení, mapy drsnosti a AO (dnes skoro všude jen barva + případně normála),
  měřítko vzoru (m na opakování), opakování dlaždic na zemi (zem `dirt`/`dryGrass` se viditelně opakuje – vidět na
  snímcích TNT).
- Stavy hoření materiálu: čerstvý → osmahlý → zuhelnatělý (aligátoří kůže) → popel; dnes `applyChar` jedním parametrem.
| Skupina | Dnes | Stav |
|---|---|---|
| dřevo (bark, woodEnd, woodPlank) | ★3 | — |
| kovy (metal*, steel, carPaint) | ★3 | — |
| stavební (plaster, brick, roof, stone, glass) | ★3 | — |
| organické (straw, needles, leaves) | ★3 | — |
| ostatní (wax, rubber, tnt, acetylene, asphaltCar) | ★3 | — |
| země scénářů (dirt, grass, dryGrass, forest, concrete, asphalt) | ★2,5 | — |

## 4. Fyzika (`src/physics/`, čisté funkce)
| Modul / jev | Dnes | Co doplnit nebo ověřit | Stav |
|---|---|---|---|
| combustion: výška plamene, vlečka, puffing, louže, ventilace, kouř, HRR křivky, místnost | ★4 | úbytek paliva a dohoření pro všechny zdroje (dnes hlavně louže), dvouzónová vrstva kouře v místnosti | — |
| fuels: 17 paliv + 3 výbušniny | ★3–4 | přibyl butan, acetylen, aceton, líh; PU pěna, papír a plasty jsou jako materiály v `materials.js`; chybí PVC, LPG | O |
| blackbody + barva sazí | ★4 | spektrální emisivita sazí (ε ∝ λ⁻¹·³⁹) místo posunu ×1,28 | — |
| wind: profil, náklon | ★4 | poryvy jako spektrum (dnes šum) | — |
| blast: přetlak, impuls, ohnivá koule, Gurney, plyny | ★4 | odraz od země a zdí, stínění překážkou | — |
| spread: Anderson, Byram, Van Wagner, Dijkstra | ★3 | přeskoky oharky (spotting) z fyziky letu oharků (už je), svah terénu | — |
| zapálení mezi objekty (`heat.js`, `materials.js`, `burnable.js`) | ★3 | hotovo D-043; chybí zastínění sálání, víc měřicích bodů na velké předměty, vlhkost paliva | O |
| chybí: hašení | — | voda → pára, chlazení, inertizace; prášek | — |
| zvuk (src/audio) | ★2 | hladiny z měření (literatura akustiky požárů), ozvěna, různá dřeva | — |

## 5. Zobecnění palety (návrhy, rozhoduje Ondřej)
1. **Jeden popis ohně** – **hotovo** (`physics/spec.js`, D-041). Zbývá: přepsat 18 starých scénářů a 10 starých předvoleb na
   `fireSpec` (zatím jen nové; staré mají čísla pořád na dvou místech – přepis chce srovnání snímků před a po).
2. **Hořlavý objekt** – **hotovo** (`fx/burnable.js`, D-043). Zbývá: auto, dům a stoh jako sada hořlavých částí.
3. **Obecný výbuch** – **hotovo** (`explosionSpec`, D-041), scénář `blastLab`.
4. **Knihovna materiálů hoření** – zčásti: dřevo (`applyChar`), plech (`metal`, D-042). Zbývá zdivo se sazemi nad otvory,
   plasty a pryž s tavením, sláma s vločkami popela, sklo.
5. **Porost**: karty pro keře, trávu a listnáče stejně jako u borovice; rozmanitost textur karet.
6. **Automatické srovnání s referencí**: pro noční scény metrika barvy a tvaru (obrys plamene) proti uloženým číslům
   z `dataset/reference/color_stats.json`.
