# TODO — co se právě dělá

Stav k 2026-11-27 pozdě večer: **iterace 6 hotová** (vše zaškrtnuté je v `main` a v artefaktu FireLab). Iterace 1 viz git historie.

## Hotovo (iterace 6 – rozšíření a zobecnění palety, Ondřej 2026-11-27 18:12)
- [x] Paleta 42 fotek (Commons), měření denního jasu plamene, barev kouře, vyhořelých aut a zuhelnatělého dřeva. `REFERENCE.md`.
- [x] Jeden popis ohně a výbuchu `physics/spec.js` (louže, rozlití, vytékání, hromada, předmět, tryska, knot; trhavina,
      ohnivá koule, směs plynu, tlaková láhev). D-041.
- [x] Přestup tepla, zapálení dávkou, 16 materiálů, hořlavé předměty `fx/burnable.js`. D-043.
- [x] Očouzený a vyhořelý plech (stavy laku, saze, okuje, rez, žhnutí). D-042.
- [x] Denní jas plamene (D-039), černý kouř uhlovodíků (D-040).
- [x] Scénáře: zapalovač, hořící sud s naftou, prostřelený sud s hořícím pramínkem, acetylenová láhev v požáru, řetěz
      vznícení, obecný výbuch. Rekvizity: zapalovač, sud bez víka, láhev a úlomky, paleta, bedna. D-044, D-045.
- [x] xEngine: předvolby z popisu, `heatFluxFull`, `ignitionTimeAt`, návrh komponenty `flammable` (F-10). D-046.
- [x] Dokumenty: `MODEL.md` (obecný model), `ANALYZA_2026-11-27.md` (5Why, konzilium, FAQ, mentální modely, ELI20).

## Další iterace (Ondřej 2026-11-27 17:46)
Paletu FireEngine rozšiřovat a zobecňovat: projít každý objekt, texturu, fyziku i průběh a přiblížit je realitě.
Plán a tabulky se stavem položek: **`AUDIT.md`**. Otevřené otázky na Ondřeje: zvuk do xEngine (FireLab / xEngine),
mlha na oheň (přidat / nechat), poměr hlasitosti (filmový / realistický) – viz `integrations/xengine/NAVRHY.md`.

## Hotovo (iterace 5 – Ondřej: a + b + c + d, hřib a, sud b, komponenta a)
- [x] (d) Výkon porostu: stín z levných náhrad ve vrstvě stínu, tři prstence LOD. Křoví T3 26 → 3,8 M △, les 6,4 → 2,9 M △. D-034.
- [x] (a) Koruny borovic z karet větví s jehličím, plameny přilnuté ke kmeni. D-035.
- [x] (b) Objemový kouř T4/T5 (rozptyl slunce, vlastní stín, podsvícení ohněm). D-036.
- [x] (c) Zvuk: hukot, praskání, lupnutí, rány se zpožděním 343 m/s; test bez reproduktoru, ukázky WAV. D-037.
- [x] Hřib TNT s kondenzačním prstencem; sud ve hře filmový (`barrelFilm`); `xspace.js` pro komponentu ohně. D-038.

## Hotovo (iterace 4 – fotky, oharky, TNT, les zblízka, TAA T2, xEngine pro všechny sešny)
- [x] 39 referenčních fotografií (Commons), srovnání a statistiky barvy, `REFERENCE.md`. Obrázky mimo repo. D-028.
- [x] Plamen podle fotek: jazyky, ostré okraje v metrech, barva podle fotek, zisk tenkých plamenů, vzplanutí. D-028.
- [x] Svíčka: laminární kapka, tmavé jádro u knotu, modrý kalich jen v plášti, prosvícený vosk. D-029.
- [x] Hořící oharky se stopou plamínku a kouře; sazové výrony; dávka oharků při zřícení střechy. D-030.
- [x] 1 t TNT: houbový mrak (prstenec + prachový sloupec), výraznější Wilsonův dóm (Ondřej: b). Výbuchy zblízka: hroudy,
      jemnější výtrysky. D-031.
- [x] Les zblízka: hořící kmeny u kamery, padající hořící větve, tenčí kmeny; oprava – na T4/T5 les nehořel. D-032.
- [x] Časová akumulace objemů i na T2.
- [x] xEngine: `NAVRHY.md`, `MAPA.md`, `SVODNA.md`, `SESNA_A.md` (doplněno), `SESNA_B.md`. D-033.

## Hotovo (iterace 3 – Ondřejova volba: výbuchy + zrno, dům se zřícením)
- [x] Časová akumulace objemů T3–T5 (reprojekce podle vzdálenosti, ořez okolím) – plamen bez zrna i na snímku. D-025.
- [x] Výbuchy: výtrysky zeminy, Wilsonův kondenzační dóm (1 t TNT), dohořívání v mraku, měkké okraje kouře. Sud beze změny. D-026.
- [x] Dům: díra ve střeše s žhnoucím lemem, zřícení střechy (uhlíky, kouř, trosky, vzplanutí). D-027.
- [x] Velké louže: menší ohyb pole a kontrast proužků → plameny místo „mramoru“.
- [x] xEngine: zadání pro sešnu A (`integrations/xengine/SESNA_A.md`), `combat:exploded`, uložení hry, režim bez plátna,
      `tools/test-xengine-node.mjs`. Rozhodnutí: sešna A, submodul.

## Hotovo (iterace 2 – „víc skutečného života“ + xEngine)
- [x] **Plamen v2** (objem): emise–absorpce sazí v rovnováze (κ = 2,7·f_v), teplota svítivých zón `Tlum` (Koseki), horké proužky,
      chladné sazové kapsy, plášť kouře velkých louží se „světelnými skvrnami“, sloupový tvar pro L/D < 3, přerušovaná zóna,
      advekce s virtuálním počátkem (bez vodorovných „plástů“), antialiasovaný šum (oktávy pod stopou pixelu/kroku → střed),
      krok omezený optickou tloušťkou, modrá zóna jen tam, kde nesvítí saze. D-020, D-021.
- [x] **Adaptace oka**: částečná (β = 0,4) + zisk podle optické tloušťky zdroje; výbuchy, jiskry a žhnutí na původním klíči
      (vzhled sudu beze změny). D-020.
- [x] **Kouř v2**: hustota emise podle stupně (`smokeMul`), náběh krytí 0,3 s (žádná mezera nad plamenem), podsvícení ohněm
      stíněné vlastním sloupcem (svítí jen spodek sloupce), světlo v barvě svítivých zón. D-022.
- [x] **Uhlíky v2**: log-normální velikost, pádová rychlost a odpor z fyziky, T podle obtékání (880 + 150√v, strop 1 340 K),
      popel (poklesy jasu), dohoření; praskání dřeva (výstřely drobných jisker). D-023.
- [x] **Lože žhavého uhlí** (instancované, „dýchající“), **aligátoří trhliny** na polenech, dýchání žhnutí všech ohořelých ploch.
      Trojúhelníky ohnišť +20 % (LOD3 60 → 73 k, LOD4 614 → 736 k).
- [x] **Šíření**: žhnoucí lože za čelem (emise, skvrny, dýchání), doutnání – světlý líný kouř za čelem.
- [x] **Stupně T4 Ultra a T5 Kino** (víc kroků paprsku, jemnější okraj, víc částic, kouře a uhlíků); UI je prochází všechny.
- [x] **xEngine**: systém jádra `fx.fire` (`integrations/xengine/`), světlo přes systém `light` (po vrcholech, low ≤ 1),
      vrstva 0, tónová křivka hostitele, události `fire:*`, reakce na `combat:explode`, `heatFlux()` pro poškození.
      Test `npm run test:xengine` (skutečné jádro a vykreslení xEngine z klonu). D-024.
- [x] three 0.170 → 0.187 (stejná verze jako xEngine).
- [x] Nástroje: `tools/look.mjs` (snímek s úpravou stavu), `tools/shot.mjs`, `tools/sweep.mjs` (mřížka scénář × parametr).

## Známé slabiny iterace 6 (priorita shora)
1. **Staré scénáře nejsou přepsané na `fireSpec`** – čísla 18 scénářů a 10 předvoleb zůstávají na dvou místech.
2. **Prostřelený sud**: nad plameny mramorovaný pás (tetelení přes kouř), pruh kapaliny neteče (pevná geometrie),
   čelo plamene postupuje po úsecích skokem.
3. **Řetěz vznícení**: jeden měřicí bod na předmět, žádné zastínění; hořící balík pod plamenem splývá; sesedání měřítkem.
4. **Zapalovač**: špička plamene zrnitá, modrá pata slabá, jiskry delší než na fotce.
5. **Hořící sud**: kouř bez valivých „květáků“ (částice), okraj sudu ve dne viditelně nežhne.
6. **Acetylenová láhev**: čas do roztržení ★2, TNT ekvivalent ★2 (rozsah 0,2–4 kg), úlomky malé.
7. **Denní strop jasu** je umělecký (★2) – ověřeno na sudu nafty a pneumatikách, ostatní denní scény (křoví, TNT, granát)
   jen testem bez chyb a mřížkou T3, ne srovnáním s fotkou.
8. Saze na zdivu a fasádě, sklo, tavení plastů a pryže chybí; hašení chybí.
9. Uložení hry (snapshot xEngine) nenese dávku a stav hořlavých předmětů.

## Známé slabiny starší (priorita shora)
1. **Zrno na T1** zůstává (akumulace je T2+); cena akumulace na T2 nezměřena (odhad ~2 průchody přes obrazovku).
2. **Velké louže (nafta)** jsou lepší, ale pořád trochu „kompaktní“; chybí velké odtržené jazyky v horní třetině a výraznější
   černý plášť. Kouř nad nimi je fyzikálně tmavý (v noci skoro neviditelný) – správně, ale méně efektní.
3. **Pneumatiky ve dne**: plamen u paty malý, sloup kouře hezký. Chce víc plamene po obvodu hromady (víc zdrojů).
4. **Výbuchy**: hřib TNT je z kouřových částic – klobouk zblízka „hrudkovitý“, chybí sukně kondenzace pod kloboukem;
   granát zblízka bez rozstřiku hlíny na kameru (čočka).
5. **Dům**: kouř je hodně podsvícený do červena, chybí čouzení fasády nad okny; díra ve střeše nestíní (stínová mapa ji nevidí).
6. **Les zblízka**: karty jehličí mají jednu texturu (všechny větve stejné), korunový požár jen velkými jazyky; hořící
   koruna zblízka bez plamínků na větvích (jen žhnutí karet).
7. **Svíčka** je oproti fotkám méně sytá (bělavé jádro) – záměrný kompromis mezi okem a fotoaparátem.
8. **Zvuk**: jeden typ praskání pro všechna dřeva, bez ozvěny lesa a budov; louže hučí stejně jako dřevo (jen bez praskání).
   Hladiny jsou řádové (★1–2), neměřené. Do xEngine zatím ne (otázka v `NAVRHY.md`).
9. **Výkon** na skutečném T460 a RTX 4060 nezměřen (sandbox = swiftshader). Záložka Technika v prohlížeči ukáže časy.
10. xEngine: integrace ověřená jen na zkušební stránce se záznamníkem světla a v Node – ve skutečné hře ji zapojí sešna A (`SESNA_A.md`).

## Nápady (neschváleno)
- Objemový kouř pro T4/T5 (3D textura hustoty, 6směrové osvětlení), WebGPU compute částic
- Procedurální zvuk (praskání, hukot, výbuch se zpožděním 343 m/s)
- Hasicí efekty (voda → pára, prášek)
