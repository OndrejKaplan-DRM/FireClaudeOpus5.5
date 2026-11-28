# Oheň ve hrách a enginech – rešerše (2026-11-28)

Co řešili jiní, k čemu došli a co z toho bereme. U každého bodu zdroj a jistota (★1–5). Parafráze, ne citace.
Co je označené „(vlastní znalost)“, nemá v této rešerši ověřený odkaz – ber to jako výchozí bod, ne jako fakt.

## 1. Vývojové etapy zobrazení ohně a výbuchů

| Etapa | Roky | Technika | Co vyřešila | Co nechala nevyřešené |
|---|---|---|---|---|
| 1 | ~1993–1998 | ručně kreslené nebo natočené animované sprity (vlastní znalost) | levné, čitelné | plochost, opakování, žádná reakce na svět |
| 2 | ~1998–2005 | částicové systémy s aditivním mícháním (vlastní znalost) | pohyb, vítr, objem z mnoha kousků | přepal, tvrdé průniky s geometrií, kouř nejde nasvítit |
| 3 | ~2004–2012 | flipbooky zapečené ze simulace tekutin (FumeFX, Houdini) + měkké částice | detail simulace za cenu textury | paměť, plochost, trhání při zpomalení |
| 4 | ~2012–2020 | flipbook + vektory pohybu (optický tok), barva z teplotní mapy přes gradient, 6směrné osvětlení kouře | plynulost s méně snímky, kouř reaguje na světla, jedna textura pro mnoho vzhledů | stále 2D, průlet kamerou efektem |
| 5 | 2014 → | simulace v reálném čase na mřížce (NVIDIA FlameWorks, později Niagara Fluids, 2D simulace v Unity) | interakce se scénou, neopakovatelnost | cena; pro hru se nakonec často stejně peče do flipbooku |
| 6 | 2022 → | objemové vykreslení: řídké objemové textury, VDB přehrávané v reálném čase | skutečný 3D objem, správné stínění | data (komprese), cena kroku paprsku |
| 7 | 2026 → | výzkum: oheň v naskenovaných scénách (gaussovské splaty + fyzika), hoření dřevěných konstrukcí na voxelech | šíření a zuhelnatění podle scény | zatím ne produkční |

Zdroje: flipbook jako „klam“ a dělení rozlišení mezi snímky – loronsodev.github.io/posts/explosion-fx ★3;
teplotní mapa + gradient + optický tok u Star Citizen – 80.lv/articles/vfx-of-star-citizen-working-on-explosions ★3;
vektory pohybu stačí v polovičním rozlišení a hlavní zisk je paměť – polycount.com (TFlow) ★3;
FlameWorks = mřížkový simulátor + objemové vykreslení v reálném čase – history.siggraph.org (SIGGRAPH 2014) ★4;
řídké objemové textury a heterogenní objemy v UE – forums.unrealengine.com (Unreal Fest 2023) ★4;
ZibraVDB – history.siggraph.org ★3; FieryGS – gamedev.net ★2; FlameForge – arxiv.org/html/2412.16735v1 ★4.

## 2. Šíření ohně jako herní systém

**Far Cry 2 (Dunia, 2008)** – gamedeveloper.com (rozhovor s J.-F. Lévesquem) ★4, jeho popis systému (zrcadlo
symmetricaldatasecurity.blogspot.com) ★4, gmtk.substack.com ★3.
- Pravidelná mřížka buněk: 2D pro trávu a terén, 3D pro předměty a stromy (krychle uvnitř kolizního tvaru).
- Buňka má „životy“ (příklad 50) a dobu hoření podle paliva. Hořící buňka ubírá životy sousedům; na nule soused vzplane.
- Vítr: skalární součin směru větru a směru k sousedovi (po větru víc, proti větru méně); stejně tíha (nahoru rychleji).
- Mokro = více životů a kratší hoření. Papír hoří kratší dobu než poleno.
- Strop velikosti: rozpočet „bodů šíření“ (Molotov 60 bodů ≈ 7 buněk po 8). Oheň se tedy nikdy nerozšíří donekonečna.
- Výkon: emitory se přesouvají zpoza kamery před ni, hustěji u hráče; hořící buňky se sdružují do kvádrů.
- Vědomě obětováno: žádná dynamika tekutin, žádný přenos tepla – jen tolik věrnosti, aby hráč uvěřil.
- Autor na tom pracoval rok a půl a prošel si předchůdce (Postal, Overlord, Mercenaries 2, Alone in the Dark).

**Zelda: Breath of the Wild (2017)** – gamesbeat.com ★4, thumbsticks.com ★3, tomsguide.com ★3.
- „Chemický engine“ = pravidlový výpočet stavů vedle fyzikálního enginu (ten počítá pohyb).
- Živly (oheň, voda, led, vítr, elektřina) × materiály (dřevo, kov, tráva…). Tři pravidla: živel mění stav materiálu;
  živel mění stav živlu; materiál nemění stav materiálu.
- Síla je v důslednosti: pravidlo platí všude bez výjimky (oheň + tráva → stoupavý proud).

**GTA V / RAGE** – gta.fandom.com, gta.wiki ★3 (wiki, ne vývojářský zdroj).
- Benzin jako fyzická látka: stopa z kanystru nebo z proražené nádrže, po zapálení oheň běží po stopě a zapaluje
  lidi, předměty a vozidla; vozidlo nakonec vybuchne.
- V novější verzi se oheň šíří snáz a rychleji po hořlavých materiálech (dřevo, paliva).
- Mody (More Fire) ukazují, které parametry má systém: doba hoření, strop počtu ohňů, poloměr šíření, účinnost hasičáku.
- Technický popis od Rockstaru jsem **nenašla**. Přednáška F. Bauera (SIGGRAPH 2019, RDR2) je o oblacích, mlze a
  objemovém světle, ne o ohni.

**Teardown (2020)** – techradar.com ★3. Voxelový svět, kouř a hasicí přístroj kolidují s prostředím; oheň jako
vedlejší produkt ničení. Mody (ThiccSmoke) řeší hlavně cenu: částice jen tam, kde oheň opravdu je, a ne každý snímek.

**Ignitement (Unity, 2026)** – unity.com/blog (sólo vývojář) ★4. Jedna sdílená 2D simulace tekutin 1024²
(teplota, „reakce“ = kde hoří), oheň kreslený z reakční textury paralaxním trikem, kouř z téže simulace, jiskry
vzorkují rychlostní pole. Simulace se počítá jen v okně kolem kamery.

## 3. Co mají enginy v základu

**Unreal Engine 5** – dev.epicgames.com ★5.
- Niagara (částice na GPU) + Niagara Fluids: plyny na mřížce (hustota, teplota, vztlak, řešení tlaku), kapaliny FLIP.
- Šablony 2D/3D plyn (oheň, výbuch), kolize s objekty scény. Dokumentace sama doporučuje těžké simulace **zapéct do
  flipbooku**. Plugin je stále označený jako beta.
- Ukládání simulací do řídkých objemových textur a vykreslení jako heterogenní objem.
- Běžná praxe: Houdini Pyro / EmberGen → flipbooky → Niagara, k tomu trosky, světla, lom, decaly.

**Unity (VFX Graph, HDRP/URP)** – unity.com/blog, docs.unity3d.com ★5.
- VFX Graph (částice na GPU), flipbooky s prolínáním, od 2022.2 materiál „Six-Way Smoke Lit“: dvě textury se
  šesti směrovými světelnými mapami + alfa + volitelná emisní maska; kouř pak reaguje na všechna světla scény.
- Unity dává knihovnu hotových map; samo přiznává slabinu: je to stále plochý trik.

## 4. Poučení pro FireLab (co bereme)

| # | Poučení | Odkud | Stav u nás |
|---|---|---|---|
| 1 | Rozpočet šíření: oheň musí mít strop, jinak sežere výkon i hru | Far Cry 2 | **nové v iteraci 7**: `FireSim.budget` |
| 2 | Pravidla živel × materiál, platná všude | Zelda | máme materiály; **nové**: voda/pěna/CO₂ jako „živel“ (`suppress.js`) |
| 3 | Kapalina jako fyzická stopa, po které běží plamen | GTA V | scénář `leak`; **nové**: `trail` (stopa, rychlost šíření po hladině) |
| 4 | Barva z teploty přes gradient, ne zapečená | Star Citizen | máme (teplota → barva černého tělesa) |
| 5 | Vektory pohybu u flipbooků | TFlow, UE | **chybí** – kandidát na iteraci 8 (T0–T1 by ušetřily snímky atlasu) |
| 6 | 6směrné osvětlení kouře | Unity | **chybí** – náš kouř je stínovaný analyticky; zvážit pro T1–T2 |
| 7 | Emitory jen tam, kde je vidí kamera | Far Cry 2, Teardown | částečně (rozpočty v `tiers.js`); **chybí** přesun podle kamery |
| 8 | Simulaci počítat jen kolem kamery | Ignitement | netýká se (nemáme mřížkovou simulaci) |
| 9 | Hasicí přístroj a kouř kolidují se světem | Teardown | **nové**: hašení; kolize kouře se stropem **chybí** |
| 10 | Těžké věci péct, lehké počítat | UE dokumentace | máme (bake atlasu při startu ze seedu) |

## 5. V čem se lišíme

**Mají navíc (UE / Unity):** uzlový editor efektů; simulaci tekutin na GPU; kolize částic a plynu se scénou;
objemové textury a VDB; 6směrné osvětlení; ničení geometrie (Chaos); decaly a světla napojená na celý engine;
profilovací nástroje; obrovskou knihovnu hotových efektů a návodů.

**Máme navíc my:** fyzikální popis – z paliva, hmotnosti a rozměru vyjde výkon, výška plamene, sálání, doba vznícení
sousedů a kouř, každé číslo se zdrojem a mírou jistoty; přestup tepla a vznícení bez ručního skriptování; následky
na materiálu (zuhelnatění, stav plechu, sklo); zvuk odvozený z téhož popisu; všechno ze seedu v ~1 MB bez jediné
stažené textury; šest stupňů kvality od integrované grafiky; testy proti literatuře; běh z jednoho souboru.

**Poctivě:** náš oheň je procedurální shader a částice, ne simulace tekutin. Zblízka a v pohybu kolem překážek
prohraje s Niagara Fluids i s dobrým flipbookem z Houdini. Vyhráváme tam, kde je potřeba *hodně různých ohňů z čísel*,
ne jeden dokonalý záběr.
