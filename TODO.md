# TODO — co se právě dělá

Stav k 2026-11-27: **iterace 2 hotová** (vše zaškrtnuté je v `main` a v artefaktu FireLab). Iterace 1 viz git historie.

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

## Známé slabiny (priorita shora)
1. **Zrno objemu na statickém snímku**: jeden paprsek na pixel s chvěním; v pohybu se slije, na snímku je vidět. Chce časovou
   akumulaci (TAA jen pro vrstvu efektů) – hlavně pro T4/T5.
2. **Velké louže (nafta)** jsou lepší, ale pořád trochu „kompaktní“; chybí velké odtržené jazyky v horní třetině a výraznější
   černý plášť. Kouř nad nimi je fyzikálně tmavý (v noci skoro neviditelný) – správně, ale méně efektní.
3. **Pneumatiky ve dne**: plamen u paty malý, sloup kouře hezký. Chce víc plamene po obvodu hromady (víc zdrojů).
4. **Výbuchy kromě sudu**: granát a acetylen jsou fyzikálně v pořádku, ale chybí prachové výtrysky ze země, kondenzační
   prstenec u 1 t TNT a dohořívání.
5. **Dům**: kouř je hodně podsvícený do červena, chybí zhroucení střechy, čouzení fasády nad okny.
6. **Les zblízka**: hořící kmeny, padající větve, korunový požár jen velkými jazyky.
7. **Výkon** na skutečném T460 a RTX 4060 nezměřen (sandbox = swiftshader). Záložka Technika v prohlížeči ukáže časy.
8. xEngine: integrace ověřená jen na zkušební stránce se záznamníkem světla – ve skutečné hře (level, buňky, `cellOf`) ještě ne.

## Nápady (neschváleno)
- Objemový kouř pro T4/T5 (3D textura hustoty, 6směrové osvětlení), WebGPU compute částic
- Procedurální zvuk (praskání, hukot, výbuch se zpožděním 343 m/s)
- Hasicí efekty (voda → pára, prášek)
