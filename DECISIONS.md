# DECISIONS — laboratorní deník

Formát: **D-xxx · datum · rozhodnutí** — proč, alternativy, důsledky, jistota.

---

### D-001 · 2026-11-26 · Platforma: Three.js 0.170 + WebGL2 + esbuild do jednoho HTML
- **Proč:** cíl je flexibilní FPS engine; Three.js je nejrozšířenější WebGL vrstva, běží na T460 (Intel HD 520 má WebGL2)
  i na moderní GPU; jeden HTML soubor jde otevřít dvojklikem i publikovat jako artefakt.
- **Alternativy:** WebGPU (T460 v Chrome nepodporuje spolehlivě → zamítnuto pro základ), Unreal/Godot (nejde předvést v prohlížeči).
- **Důsledek:** shadery GLSL ES 3.0; vše offline, bez CDN.

### D-002 · 2026-11-26 · Všechno procedurálně z kódu, ne z cizích souborů
- **Proč:** zadání „chci vlastní práci"; deterministické generátory se seedem dají libovolné LOD a varianty bez megabajtů dat.
- **Důsledek:** dataset (GLB, PNG) je *výstup* generátorů, ne zdroj. Kdykoli lze přegenerovat `npm run bake`.

### D-003 · 2026-11-26 · Čtyři stupně kvality T0–T3 místo plynulého škálování
- T0 „T460": flipbook sprity, bez post-procesu, ≤1 500 částic, poloviční rozlišení, LOD nejnižší.
- T1 „starší herní / iGPU nové": sprity + 1–2 levné objemy, levný bloom, ≤4 000 částic.
- T2 „střed": objemové plameny (48 kroků), heat haze, bloom, měkké částice, ≤12 000 částic.
- T3 „zlatý standard ČR 2026" (RTX 4060/RX 7600, 8 GB): 96 kroků, stíny od ohně, ≤40 000 částic, LOD nejvyšší.
- **Proč:** diskrétní stupně jdou otestovat a změřit; plynulé škálování nejde poctivě ověřit.
- **Automatika:** odhad podle `WEBGL_debug_renderer_info` + adaptivní pokles při > 22 ms/snímek.

### D-004 · 2026-11-26 · Flipbooky se pečou z vlastního objemového shaderu
- **Proč:** T0 nemá výkon na raymarching; místo cizích textur se stejný objemový plamen/kouř vyrenderuje do atlasu 8×8 snímků.
  Vzhled T0 a T3 tak vychází z jednoho modelu. Bake běží při startu prohlížeče (≈ desítky ms na GPU) a offline do `dataset/flipbooks`.

### D-005 · 2026-11-26 · Barva plamene z Planckova zákona, ne z ručního gradientu
- Barva emise = záření černého tělesa při lokální teplotě (CIE 1931 → lineární sRGB), saze jako šedé těleso.
  Plamen ~1 100–1 400 K (svíčka, dřevo) je oranžový, ohnivá koule ~1 600 K žlutobílá, jiskry oceli ~1 800 K.
- **Jistota:** ★★★★ (barva sazového plamene ≈ šedé těleso je standardní aproximace; modrá zóna chemiluminiscence CH*/C₂* je doplněna umělecky).

### D-006 · 2026-11-26 · Fyzika jako čisté funkce s citovanými korelacemi
- Výška plamene Heskestad, teplota a rychlost oblaku McCaffrey/Heskestad, náklon plamene AGA/Thomas,
  hoření louže (Babrauskas), kouř: výtěžek sazí podle paliva × funkce ekvivalenčního poměru Φ (Tewarson, zjednodušeno),
  rázová vlna Kinney–Graham, ohnivá koule CCPS, šíření požáru Byram + Andersonova elipsa.
- **Proč:** parametry efektů (výška, rychlost, barva, hustota kouře, délka) vycházejí z čísel, ne z odhadu oka.
- **Limity:** korelace platí pro typické podmínky; malé plameny (svíčka) jsou mimo platnost Heskestada → zadané změřenými hodnotami.

### D-007 · 2026-11-26 · Do repa jen GLB do ~200 k △
- LOD 1e6 by měly desítky MB; generují se za běhu ze seedu se stejným výsledkem. V `dataset/meshes/index.json` je uveden počet △ všech LOD.

### D-008 · 2026-11-26 · Sud s benzínem: realistický model je roztržení a ohnivá koule, ne detonace
- Benzín ve volném sudu nedetonuje (filmový mýtus „střela → výbuch"). Modeluji roztržení zahřátého sudu
  s ohnivou koulí z podílu paliva (CCPS: D = 5,8 M^⅓, t = 0,45 M^⅓) a slabou tlakovou vlnou. Ve scénáři je přepínač
  „filmový" (zesílená tlaková vlna a trosky) – označený jako umělecký.

### D-009 · 2026-11-26 · Acetylenová „bomba" = sáček se směsí C₂H₂ + O₂, detonace
- Typický případ (pyrotechnický žert, průmyslové nehody v potrubí) je stechiometrická směs v PE sáčku.
  50 l směsi ≈ 15 g C₂H₂ → ≈ 0,7 MJ → ekvivalent ≈ 0,15 kg TNT. Jasný záblesk, málo kouře (téměř bez sazí při přebytku O₂).
  **Jistota:** ★★★ (účinnost přepočtu na TNT pro plynné detonace je nejistá, rozpětí 0,1–0,3 kg).

### D-010 · 2026-11-26 · Před-expozice a lokální adaptace plamene
- Světla jsou ve fyzikálních jednotkách (cd, lx): svíčka ~1 cd, táborák ~2 kcd, den ~65 klx slunce. HDR buffer je HalfFloat
  (max 65 504) → záblesk 1 t TNT by přetekl. Řešení (Frostbite): všechna emise a světla se násobí expozicí už při stínování
  (`shared.PRE`), finální průchod jen tónuje (ACES). Expozice se měří „okem“ (osvětlení u pozorovatele + jas oblohy), adaptace
  nahoru 0,9 s / dolů 0,25 s → záblesk výbuchu na chvíli přepálí obraz (žádoucí).
- Jas plamene: fyzikální ~10⁴ cd/m² (`FLAME_LUM` 12 000 při 1 500 K a ε = 1), ale omezený `klíč / expozice` (klíč 16) –
  napodobení lokální adaptace oka / HDR fotografie, aby plamen nebyl jen bílá skvrna. Umělecké, ★2. Klíč je v UI.
- Teplotní závislost jasu je komprimovaná (`BB_GAMMA` 0,3); skutečný poměr jasu 1 000 K : 1 500 K je ~1 : 5 000.

### D-011 · 2026-11-26 · Barva sazového plamene = Planck při ~1,28 × T
- Emisivita sazí ε(λ) ∝ λ^−1,39 (Hottel–Broughton) zvyšuje barevnou teplotu oproti skutečné: svíčka má saze ~1 450 K,
  ale naměřená CCT ~1 850 K. `sootColor(T)` bere barvu z LUT při 1,28·T a jas při T. Pevné látky (uhlíky, jiskry, ohořelé
  povrchy) zůstávají na čistém Planckovi. Světla ohně dostávají barvu z 1,28·T. ★★★★

### D-012 · 2026-11-26 · Oprava Andersonovy elipsy na tvar FARSITE
- Původní dosazení U v mph dávalo L/B ≈ 160 pro 9 m/s (nesmysl). FARSITE (Finney 1998) používá vítr ve středu plamene v m/s
  a strop L/B ≤ 8. Vítr ve středu plamene = U10 × 0,22 (les) / 0,4 (křoví). Odhaleno testem `tools/test-physics.mjs`.

### D-013 · 2026-11-26 · Jeden řazený systém pro plamen, kouř a ohnivé chuchvalce
- Aditivní plamen kreslený zvlášť od kouře dává chybné pořadí (kouř za plamenem by ho zakryl). Všechny billboardy jsou v jednom
  instancovaném systému s premultiplikovanou alfou (plamen ≈ čistá emise, kouř = albedo × světlo × α), řazeném odzadu (T1+).
  Jeden draw call. Typ částice: 0 jazyk, 1 kouř, 2 žhnoucí kouř, 3 ohnivý chuchvalec (ohnivá koule, horní část velkých požárů).

### D-014 · 2026-11-26 · Čas scénáře ≠ čas efektů
- Požár auta trvá desítky minut; přehrávání ×20 by zrychlilo i plameny. Proto `timeScale` posouvá jen průběh scénáře (HRR, šíření,
  ohořelost) a částice, pulzace a výbuchy běží v reálném čase. Časová osa v UI ukazuje HRR a umí skok (přepočet + předehřátí 2 s).

### D-015 · 2026-11-26 · Kouř: optická tloušťka z fyziky, ředění ∝ s0/s
- τ sloupce = σs · c_sazí · 2b (Heskestadův hmotnostní tok oblaku). V oblaku c ∝ 1/b² a tloušťka ∝ b → τ ∝ 1/b; částice proto
  ředí τ ∝ s0/s (ne s0²/s², to by kouř zmizel moc rychle). Pneumatika: τ ≈ 5 (černý neprůhledný), táborák τ ≈ 0,4 (průsvitný). ★★★

### D-016 · 2026-11-26 · Ohořelost jako rozšíření standardního PBR materiálu
- `applyChar` přidá do MeshStandardMaterial frontu ohoření podle šumu a výšky, popel (šednutí) a žhnoucí trhliny (Planck 880–1 180 K).
  Funguje i instancovaně (atribut `aChar`), takže 8 000 stromů má každý vlastní stav bez dalších draw callů.

### D-017 · 2026-11-26 · Les: časy příchodu (Dijkstra, 16 sousedů) místo buněčného automatu
- Deterministické, okamžitě přepočitatelné při změně větru (dosavadní hořící/vyhořelé buňky slouží jako zdroje), bez „čtverečkového“
  tvaru. Hořící buňky dostávají zdroje z bazénu (T0 40 … T3 180) seřazené podle vzdálenosti od kamery. Přechod do korun, když Byramova
  intenzita přesáhne 0,6 × I0 (Van Wagner, CBH 4 m, FMC 100 %). ★★

### D-018 · 2026-11-26 · Objem ve větru: pata se prodlužuje jen po větru
- Původně byl kvádr centrován na zdroj a osa počítaná od jeho kraje → ve větru se plamen „rozlil“ i proti větru. Nyní kvádr začíná
  1,3 R proti větru a střed se posouvá po větru o Wx/2 − 1,3 R; prodloužení paty (flame drag) jde jen po větru. Ověřeno `tools/subcases.mjs`.
- Světlo ohně je ve výšce 0,65 L (střed svítivé zóny), ne uvnitř palivového lože – jinak polena stíní celé okolí (T3 stíny).

### D-019 · 2026-11-26 · Export z artefaktu přes schopnost `downloads`, GLB balený do ZIP
- Rámec claude.ai neumí `<a download>`. Artefakt deklaruje `downloads` a ukládá přes `claude.use('downloads').save()`.
  Přípona .glb není na seznamu povolených → model se zabalí do ZIP (vlastní minimální zapisovač, metoda store, CRC32).
  Z `dist/index.html` otevřeného z disku se stahuje přímo.

## Iterace 2 (2026-11-27)

### D-020 · 2026-11-27 · Jas plamene: emise–absorpce sazí, částečná adaptace a zisk podle optické tloušťky
- Objem už nenormalizuje hustotu ručně: zdrojová funkce je Planck (sootColor) a svítivost řídí κ = 2,7·f_v [1/m] z objemového
  podílu sazí paliva (`fv` v `fuels.js`, ppm; svíčka 5, dřevo 0,6, nafta 2, pryž 4) ★3. Tenký plamen svíčky je proto průsvitný,
  louže nafty opticky tlustá.
- Opticky tlustý plamen má po celé ploše jas černého tělesa a s pevným klíčem byl bílý. Oko se na velký jasný zdroj adaptuje:
  (1) klíč 100 a částečná adaptace `flameLum = klíč/ex · (ex/0,25)^0,4` (Hood & Finkelstein: adaptace ~L^0,3–0,5 ★3),
  (2) zisk zdroje `(1 + 0,6(τ_D − 1))^−0,6`, τ_D = κ·D/2 (umělecké ★2). Výbuchy, jiskry a žhnutí používají původní klíč 16/ex
  (`lumRef`) – sud, který se Ondřejovi líbil, vypadá stejně.
- Barva objemu jde z teploty svítivých zón `Tlum` (Koseki 1989: maxima 1 100–1 250 °C ve velkých loužích ★3), ne z efektivní
  teploty záření `Tflame` (ta zůstává pro světlo a sálání).
- Zjištěno při ladění: `__fire.settle()` neobnovoval uniformy zdrojů → testy první scény sady vykreslovaly se zastaralým jasem.
  Opraveno (settle končí krokem 1/240 s); starší náhledy z iterace 1 byly u první scény jasnější, než by byly v prohlížeči.

### D-021 · 2026-11-27 · Antialiasovaný šum objemu a krok podle optické tloušťky
- Jemné oktávy fbm byly menší než stopa vzorku (pixel ve vzdálenosti t nebo krok paprsku) → „srst“ a třpyt. Oktáva se nyní plynule
  nahradí střední hodnotou, když je stopa ≥ její buňka (`octv`), což i šetří čtení textury.
- Krok paprsku ≤ 0,6/κ (jinak první zásah povrchu skáče o celý krok → třpytivý povrch); okraj ≥ krok.
- Advekce s časem letu 2√(zL) má virtuální počátek z0 = 0,15 L – bez něj se šum u paty nekonečně stlačuje do vodorovných pásů.

### D-022 · 2026-11-27 · Kouř: hustota emise podle stupně, náběh krytí v sekundách, stínění podsvícení
- `smokeMul` (T0 1 … T5 8): víc menších částic, τ každé ∝ (budget·mul)^−0,7 → celková τ sloupce zůstává podle fyziky (D-015).
- Krytí částice naběhne za 0,3 s (ne 8 % života – při životě 28 s vznikla 2 s mezera mezi plamenem a kouřem).
- Podsvícení kouře ohněm: E = I/(d² + r²/4) · 0,05 · exp(−k·(d − r/2)·0,6), k = τ/2b je extinkce vlastního sloupce. Svítí jen
  spodek sloupce jako na nočních fotografiích. Světlo ohně má barvu svítivých zón (Tlum − 40 K), ne efektivní T (byla moc červená).

### D-023 · 2026-11-27 · Uhlíky jako firebrandy
- Průměr log-normálně (medián 1,6 mm, σ_ln 0,65; Manzello ★3), ρ = 250 kg/m³, pádová rychlost v_t = √(4ρgd/3ρ_a C_D) a relaxační
  čas τ = v_t/g → malé uhlíky vynese sloup, velké padají zpět. Teplota se blíží T_eq = 880 + 150·√v_rel (strop 1 340 K;
  Urban 2019, Kim 2021: 900–1 300 K ★2). Popel: náhodné poklesy jasu ~0,4 s; posledních 25 % života dohoření.
- Praskání dřeva: výstřel 6–24 drobných jisker (0,3–0,9 mm, 1 400–1 550 K) z jednoho bodu lože; jen dřevo a sláma.
- Bodový zdroj pod pixel se kreslí ×2,5 jasněji (oslnění – umělecké ★2), jinak by uhlíky na snímku zmizely.

### D-024 · 2026-11-27 · Napojení na xEngine: systém `fx.fire`, ne kopie kódu
- Adaptér žije ve FireLab (`integrations/xengine/`), xEngine se nemění (zápis do něj jen s rolí a Ondřejovým slovem). Hra ho
  zaregistruje jako systém jádra (fáze `late`, tedy před vykreslením), simulace ohně (čas, HRR) běží ve `step` (pevný krok),
  vzhled ve `frame`.
- D-022 xEngine: ve scéně žádné světlo three.js. Světla FireLab jsou „virtuální“ (`lightObjects: false`) a most je předává systému
  `light` hostitele (`addLight`, úroveň `setLight` po 1/64, `moveLight` jen po posunu > 0,5 m). Low ≤ 1 světlo efektu,
  žádný MeshStandardMaterial (trosky vypnuté), mid 2 a high 4 světla.
- Vrstva 1 kamery xEngine patří zbrani → `setFxLayer(0)`. Expozici dělá hostitel: před-expozice 1 a shadery FireLab volají `fxOut`
  (tónová křivka a sRGB z three.js jen při kreslení přímo na plátno; ve vlastním HDR potrubí FireLab beze změny).
- Stupně: xEngine 1 low → FireLab T0, 2 mid → T1, 3 high → T2 (bez hloubky, oparu a bloomu, protože hostitel kreslí přímo).
- Gameplay dostává `heatFlux(x,y,z)` (bodový zdroj χr·Q/4πR², Modak ★3) a události `fire:ignited`, `fire:out`, `fire:exploded`;
  na `combat:explode` (Aréna A-3) reaguje, jen když ji někdo deklaroval (jádro je přísné na události).

## Iterace 3 (2026-11-27, Ondřejova volba: výbuchy + zrno plamene, dům fyzikálně se zřícením střechy)

### D-025 · 2026-11-27 · Časová akumulace objemů (T3–T5)
- Objemy se kreslí do vlastního cíle se dvěma výstupy: barva (předvynásobená) a vzdálenost podél paprsku vážená krytím
  (`VOL_MRT`, blendování jako barva → po dělení krytím průměrná vzdálenost). Rozlišení = hlavní cíl, HalfFloat.
- Reprojekce do minulého snímku podle té vzdálenosti, historie se ořízne na min/max okolí 3×3 aktuálního snímku, váha nového
  snímku 0,12; střih kamery (> 1,5 m, > 25°) nebo nový scénář historii zahodí. Chvění paprsku (IGN + zlatý řez) se mění
  každým kreslením (`uFrame` v `onBeforeRender`), takže i zastavený čas se dočistí; `__fire.shot()` na T3+ kreslí 10×.
- Proč ne poloviční rozlišení + rozostření: rozmazává hrany jazyků proti polenům a nezbavuje zrna v pohybu. Proč ne TAA celé
  scény: FireLab je knihovna efektů, hostitel (xEngine) má vlastní řetězec – akumulace patří jen vrstvě objemů.
- Past: průchody přes celou obrazovku se kreslí kamerou a ta má nastavenou masku vrstev → po kreslení vrstvy objemů vrátit
  `camera.layers.set(0)`, jinak se TAA a skládání vůbec nevykreslí (zjištěno: objemy zmizely).

### D-026 · 2026-11-27 · Výbuchy v2: výtrysky zeminy, Wilsonův mrak, dohořívání, měkčí okraje kouře
- Výtrysky: jen výbuch na zemi (h/W^⅓ < 0,5), 8–14 paprsků pod 35–70°, v0 ≈ 12·W^⅙ m/s, zemina po balistické dráze
  (`spawnSmoke({grav})`), prach se odtrhává (★2).
- Wilsonův mrak: jedna polokoule (ne částice – ty dělaly „vločky“ po celé obloze), jen W ≥ 50 kg, při 70–25 kPa, náběh 0,05 s,
  zánik 0,3 s, jasnější okraj, kreslí se jen když je kamera venku (zevnitř je to jen opar) (★2).
- Dohořívání produktů s nedostatkem kyslíku (saze ≥ 0,8: TNT, Comp B): oranžové kapsy v tmavém mraku 1–3 tf. Sud (saze 0,6)
  beze změny – ověřeno porovnáním snímků.
- Kouř: okraj chuchvalce vždy měkký (`smoothstep` hustoty) a stínování jednoho chuchvalce tlumené → mrak nevypadá jako hrozen koulí.

### D-027 · 2026-11-27 · Dům: díra ve střeše a zřícení (Ondřej: fyzikální verze + zřícení)
- `applyChar({hole})`: díra propálená nad obývákem (nad výškou stropu, ne okna), nepravidelný okraj ze šumu, žhnoucí lem.
  Roste od prohoření (~14 min) do 1,8 m, po 5 min (★2) zřícení: skok na 3,1 m, výtrysk ~500 uhlíků, kouř, trosky, otřes,
  vzplanutí střešního zdroje ×2,3 doznívající s τ = 45 s (čerstvý vzduch a nové palivo).

### D-028 · 2026-11-27 · Kalibrace podle fotografií (iterace 4) – reference bez obrázků v repu
- 39 fotografií z Wikimedia Commons (13 kategorií), srovnání obraz vedle obrazu + statistiky barvy nočních snímků
  (`REFERENCE.md`). **Obrázky se necommitují** (CC BY-SA vyžaduje uvedení a stejnou licenci; dataset FireLab je vlastní práce),
  v repu je jen seznam s autory a odkazy (`dataset/reference/manifest.json`) a naměřená čísla.
- Plamen: jazyky (`tongues()`, 3–7 podle průměru), okraj v metrech (`flameEdgeM`), barva `sootColorG(T, 0,45)` s posunem
  odstínu podle fotek, zisk opticky tenkých plamenů (1/τ)^0,5 do 2×, vzplanutí (Poisson podle paliva). Umělecké ★2–3.
- Metrika „svítivých pixelů“ funguje jen v noci: ve dne do ní padá obloha a osvětlená zem (první pokus to ukázal).

### D-029 · 2026-11-27 · Laminární svíčka
- `uTurb.x` < 0,05 přepíná pole plamene do laminárního režimu: bez odtrhávání a skvrn, kužel tmavého jádra par nad knotem
  (do ~40 % výšky), svítivá zóna až nad modrým kalichem, chladnutí špičky slabší. Modrá emise CH*/C2* jen v tenkém plášti
  (`gBlue`) a slabší – jinak modrá zalitá přes celé tělo dává levandulový nádech (zjištěno na snímku). ★3 (Faraday, fotky).
- Parafín nemá vzplanutí (klidný vzduch); `wobble` (vlnění osy) je nová volba zdroje.

### D-030 · 2026-11-27 · Hořící oharky a sazové výrony
- Typ částice 2 v `SparkSystem`: kus 6–35 mm (log-normálně, medián 12 mm ★3), pádová rychlost z ρ = 300 kg/m³, C_D ≈ 1;
  první 25–65 % života vlastní plamínek (sprite `FLAME` ~2–4× průměr), pak jen doutná a kouří (stopa do `BillboardSystem`,
  45/7 částic za s × √emberMul). Kreslí se aditivně jako jiskra, ale se skvrnitou maskou (žhnou praskliny, ne celý povrch).
- Zdroje: dřevo (embers > 0,3) průběžně 0,45·embers·√(Q/100 kW) za s a dávka 1–5 při vzplanutí; `brandBurst(n)` pro scénáře
  (zřícení střechy 45, dopad větve 6). Četnosti umělecké ★2.
- Sazový výron: při vzplanutí sazového paliva (ys > 0,03) 4–8 hustých černých chuchvalců nad špičkou (τ 3–6). ★2.

### D-031 · 2026-11-27 · Houbový mrak 1 t TNT a výraznější Wilsonův dóm (Ondřej: varianta b)
- Explosion s `mushroom: true` počítá termiku: z ≈ 1,8·(B t²)^¼, B = g·0,35·E/(ρ c_p T) (Morton–Taylor–Turner, Scorer ★2),
  prstenec a = 0,34 z, rychlost w = dz/dt. Pole proudění (`flow`) se přičítá ke všem částicím přes `air.extraUp`: rotace kolem
  zploštělého jádra prstence, stoupání klobouku, osový sloupec a přítok u země. Prachový sloupec = částice zvířené u paty.
  Pole doznívá s τ 50 s. Bez nového systému částic – stačí stávající kouř.
- Wilsonův dóm: volba `wilson` (násobek; TNT 2,5): širší okno tlaku (80–18 kPa), delší zánik 0,55 s, tenký plášť s jasným
  lemem a průsvitným středem, zadní strana slabší, bílý (albedo kondenzátu ~0,8). Umělecké ★1 – rozhodnutí Ondřeje.
- Výbuchy na zemi zblízka: hroudy zeminy jako trosky (balistika, 50–290 ks podle náplně a stupně), výtrysky z menších
  a hustších částic (dřív „vatové koule“).

### D-032 · 2026-11-27 · Les zblízka: hořící kmeny a padající větve (`src/scenarios/forestDetail.js`)
- K nejbližším hořícím stromům do 45 m se přidají zdroje na kmenech (smolné dřevo, 160 kW × velikost stromu, L 1,6–5,2 m ★3
  podle Byrama) – počet podle stupně (2–10). Z korun (korunový režim) a ze suchých spodních větví (přízemní režim) padají
  hořící větve: válec s ohořením + malý zdroj nesený s větví, po dopadu dávka oharků a doutnání 14–24 s. Četnosti ★1.
- Kmeny borovic tenčí: poloměr u paty 1,6 % výšky (DBH ≈ 3 % výšky, dřív 5 %) ★3.
- Oprava: `poolN` lesa/křoví indexoval pole jen do T3 → **na T4/T5 les vůbec nehořel**. Teď 240/300 zdrojů.
- Opar od desítek buněk se sčítal do vlnění celého obrazu → `haze` buněk 0,15 (dřív 0,4).

### D-033 · 2026-11-27 · xEngine: návrhy a návody pro všechny tři sešny v repu FireLab
- Ondřej: návrhy patří do tohoto repa a mají pokrýt svodnou sešnu, sešnu A i sešnu B. `integrations/xengine/`:
  `NAVRHY.md` (F-1 až F-8 + rozhodnutí + otevřené otázky), `MAPA.md` (kam sáhnout pro co), `SVODNA.md`, `SESNA_A.md`,
  `SESNA_B.md` (prefaby, validátor, generátor, tabulka předvoleb s výškou plamene a vzdálenostmi sálání).
- Do xEngine se nic nezapisuje (pravidlo rolí); texty jsou připravené k přenesení sešnami.
- `hostTier` vypíná `volumeTAA` (hostitel kreslí bez hloubky a historie); předvolby `candle` a `tnt` srovnané se scénáři.

### D-034 · 2026-11-27 · Výkon porostu: stín z levných náhrad, tři prstence LOD (Ondřej: d)
- Příčina 26 M △ u křoví na T3 (stejné v iteraci 3 i 4): bodové světlo ohně se stínem kreslí stínovou mapu 6× (stěny
  krychle) a vrhaly ji všechny blízké instance porostu v plném LOD (3,6 M △ × 6). Oprava: blízké kusy porostu stín nevrhají;
  vrhají ho jejich náhrady (LOD o 2 níž, nejvýš kužely LOD 1) ve vrstvě `LAYER_SHADOW` = 7, kterou vidí jen stínová kamera
  (`shadow.camera.layers`; three.js pak bere masku stínové kamery, ne hlavní). Dosah stínu 200 → 80 m.
- Křoví: blízko (do 14 m) plné LOD, střed (do 40 m) LOD 1, dál LOD 0. Borovice: blízko karty větví (LOD 3), daleko LOD 1.
- Změřeno (`tools/tri.mjs`, sandbox, jeden snímek T3): křoví 26,2 → 3,8 M △, les 6,4 → 2,9 M △ (les víc stromů v kartách,
  ale bez stínu v plném LOD). Na GPU neměřeno.

### D-035 · 2026-11-27 · Koruny z karet a plameny po kmeni (Ondřej: a)
- Borovice LOD ≥ 2: přesleny větví (válec) s kartami jehličí (alfa ořez 0,45, oboustranné, textura kreslená canvasem: páry
  jehlic, vlevo pruh kůry pro válce větví), normála karet „ven a nahoru“ (měkké světlo listí). LOD 3 ≈ 2,7 k △ (dřív 12,9 k
  kuželů). LOD 0–1 zůstávají kužele (daleko). Koruna na horních ~60 % výšky ★3.
- Plameny na kmeni: volba zdroje `attach` (0..1) zmenší náklon větrem na 30 % (stěnový plamen přilne k povrchu ★2) a osa ohně
  sedí na závětrné straně kůry (posun o poloměr kmene). Dřív dlouhé šikmé pásy přes les.

### D-036 · 2026-11-27 · Objemový kouř T4/T5 (Ondřej: b)
- `src/fx/smokeVolume.js`: raymarch sloupce nad nejdůležitějšími zdroji (τ·L / vzdálenost; T4 4 sloupce × 48 kroků, T5 8 × 72).
  Gaussův profil s b(z) = b0 + 0,12·Δz ★4, σ ∝ τ/b² podle zředění ★3, turbulence fbm s ohybem pole, ohyb větrem.
  Světlo: slunce s HG (g = 0,4) a vlastním stínem (4 kroky), obloha, podsvícení ohněm zastíněné sloupcem (3 kroky).
- Kvádr má poloměr 2,1 b (dřív 1,3 b → viditelné svislé hrany). Podsvícení je slabší než u částic (0,02 místo 0,05 × I a
  zjemnění poloměrem plamene) – objem sčítá rozptyl po celé dráze a bez toho sloup svítil jako plamen. Umělecké ★2.
- Částicový kouř zdroje s objemem ×0,4 (doplňuje vzdálenou vlečku). Kreslí se s časovou akumulací objemů (MRT).

### D-037 · 2026-11-27 · Zvuk (Ondřej: c)
- `src/audio/fireAudio.js`, WebAudio, bez nahrávek: hukot = hnědý šum → dolní propust (níž pro větší plameny ★3), pulzace
  frekvencí puffingu ★4, praskání = řídké impulzy 2–15 ms podle paliva ★2–3, lupnutí synchronně s výstřely jisker (události
  `fx.audioEvents`). Hladina Lw ≈ 60 + 10·log10(Q/10 kW) dB ★1–2, prostor PannerNode (1/r), útlum výšek vzduchem ★2.
- Rána: zpoždění vzdálenost/343 m/s ★5, SPL z přetlaku Kinney–Graham ★4 stlačený 2:1 do rozsahu reproduktoru ★1,
  podbasový úder 60 → 22 Hz, doznění τ = (0,15 + 0,35·W^⅓)/3. Výstup: kompresor + omezovač (rány s náběhem 4 ms by jinak ořezávaly).
- Zapíná se tlačítkem 🔇/🔊 (prohlížeče nedovolí zvuk bez gesta). Test bez reproduktoru `npm run test:audio` (OfflineAudioContext),
  ukázky do WAV `node tools/audio-demo.mjs`.

### D-038 · 2026-11-27 · Hřib TNT: kondenzační prstenec; sud ve hře filmový; komponenta ohně hned
- Prstenec (Ondřej: a): bílé částice v kruhu 0,6–0,9 a pod kloboukem (zc − a), 5–26 s, stoupají s mrakem. Filmové ★1.
- xEngine: `combat:exploded` se sudem → `barrelFilm` (W 4, koule ×1,2, prach, 120 trosek). Fyzikální `barrel` zůstává.
- Komponenta `fire`/`explosive` do dat hned po zkoušce na jednom kusu: jedna pravda polí, kódů nálezů a čísel předvoleb
  v `integrations/xengine/xspace.js` (bez Three.js, import v Node pro validátor a generátor xEngine).
- Svíčka: bělavé jádro zůstává (Ondřej: b).

---
## Iterace 6 (2026-11-27 večer) – rozšíření a zobecnění palety
Ondřej 2026-11-27 18:12: *„Cíl je sestavit komplexní systémy … od přestupu tepla, generování horkého vzduchu … zapaluje
hořlavé materiály. Oheň, který se šíří podle hořlavosti materiálu … chci každý asset zobecnit tak, abychom ho mohli
škálovat … i dopady hoření (škoda, zničení materiálu, začouzení, očouzený plech …)“* + paleta 40 fotek + nové use casy
(jiskra zapalovače, hořící sud s naftou, hořící kapalina unikající ze sudu, výbuch acetylenové bomby „jaký by skutečně byl“).

### D-039 · 2026-11-27 · Denní jas plamene podle fotek
- Na 22 denních fotkách palety má plamen zobrazený jas (lineárně) medián 0,39 a 9. decil 0,66; render měl 0,23 / 0,30
  (tmavě hnědočervený plamen vedle osluněné země). Příčina: strop `FLAME_LUM` 20 000 cd/m² laděný na noc.
- Strop se ve dne zvedá až 6,5× (`App.updateExposure`, plynule mezi expozicí 5·10⁻⁴ a 6·10⁻⁵). V noci a za soumraku se
  neuplatní (ověřeno: noční scény beze změny). Sud nafty T3 po úpravě 0,41 / 0,50. `lumRef` (výbuchy) nedotčen.
- **Umělecké ★2**: fyzikálně má černé těleso 1 400 K jen ~1 800 cd/m²; jas fotek odpovídá svítivým vírům 1 500–1 650 K.

### D-040 · 2026-11-27 · Barva kouře podle složení částic (`sootBlack`)
- Kouř kapalných uhlovodíků, aut a acetylenu je černý bez ohledu na výtěžek sazí (částice = skoro čistý uhlík, albedo ~0,05);
  výtěžek určuje hustotu. `smokeColor` bere `fuel.sootBlack` (nafta 0,96, benzín 0,92, auto 0,92, acetylen 1). Dřevo a sláma
  beze změny. ★3 (fotky: pneumatiky, auta, ropné požáry).

### D-041 · 2026-11-27 · Jeden popis ohně a výbuchu (`src/physics/spec.js`)
- `fireSpec({ kind, … })` pro louži, rozlití, vytékání, hromadu dřeva, předmět, trysku a knot → Q(t), D, L, doba, řádky pro UI.
  `scaleFire`, `sourceOptions`. Nová paliva: butan, acetylen, aceton, líh. Staré scénáře se nepřepisovaly (regresní riziko);
  nové scénáře a nové předvolby xEngine už z popisu vycházejí.
- `explosionSpec({ kind: 'he' | 'fireball' | 'gasMix' | 'gasCylinder', … })`: mocninné zákony mezi dvěma kalibračními body
  (granát 0,24 kg a 1 t TNT) – funkce prochází oběma předvolbami přesně (test), exponenty blízko ⅓ a ⅔.
- Torricelli pro výtok otvorem a vyprazdňování nádoby ★5; rovnovážná plocha hořícího pramínku A = ṁ/m″ ★3.

### D-042 · 2026-11-27 · Očouzený a vyhořelý plech (`applyChar({ metal: true })`)
- Místo zčernání jako dřevo prochází lakovaný plech stavy podle nejvyšší dosažené teploty: puchýře 470–620 K, lak shořel
  nad 620 K, okuje nad 800 K, rez po vychladnutí; saze drží jen na chladnějším plechu (černý lem kolem „čistého výpalu“);
  žhnutí nad ~800 K. Barvy ze shluků barev na fotkách vyhořelých aut (paleta p21–p23).
- Strana přivrácená k ohni je horká a čistá, odvrácená chladnější a jen lehce očouzená (`uHeatSrc`, `uObjC`, `uHeatSide`;
  `Burnable` je nastavuje podle nejsilnějšího ohně). Bez toho byl sud vedle ohně celý černý i zezadu.
- Sud a karoserie auta používají `metal: true`. Starší scénáře řídí jen `uChar/uGlow` – stav se z nich odvodí
  (T_max = 293 + 720·uChar), takže dostaly nový vzhled bez úprav. Teploty ★3, rozložení šumem ★2.

### D-043 · 2026-11-27 · Přestup tepla a vznícení (`physics/heat.js`, `physics/materials.js`, `fx/burnable.js`)
- Tepelný tok v bodě: sálání ze tří bodů na povrchu plamene (strop zářivostí Mudan & Croce), kontakt s plamenem, horký
  oblak; kalibrace na Babrauskasovo pravidlo druhého předmětu. `FXWorld.heatFlux(p)`, `smokeAt(p)`.
- Vznícení dávkou (Flux–Time Product), 16 materiálů s q″crit, T_ig, kρc nebo ρcδ, HRRPUA, rychlostí šíření.
- `Burnable`: hořlavý předmět se vznítí a hoří z vlastního `fireSpec`; nehořlavý plech má teplotu, saze a rez.
  Před vznícením bílý dým pyrolýzy. Vše ve scénářovém čase, deterministicky.
- První verze sálání (body na ose) dávala v blízkém poli 2–3× méně než pravidlo → nic se nevznítilo; opraveno posunem
  bodů na přivrácený povrch plamene.

### D-044 · 2026-11-27 · „Acetylenová bomba“ = tlaková láhev, ne sáček
- V češtině je „bomba“ tlaková láhev. Dosavadní scénář (50 l sáček směsi C₂H₂ + O₂, detonace) zůstává pod názvem „Výbuch
  směsi acetylen + kyslík (sáček)“. Nový scénář `acetyleneCyl`: láhev 50 l v hořící hranici palet, plášť se ohřívá
  (soustředěná kapacita, 2× kvůli náplni ★2), při ~550 °C roztržení (★4 ztráta pevnosti oceli).
- Následek podle literatury (Jankůj & Mynarz 2022, VŠB; HSE; BCGA): ohnivá koule ~10 m (model 13 m, CCPS ★4), úlomky stovky
  metrů, zóna 200 m. TNT ekvivalent 1,8 kg je odhad ★2 (rozsah 0,2–4 kg: roztržení 0,17 kg + 2 % energie oblaku).
- Scénář po roztržení přepne zrychlení času na 1 (`ctx.setTimeScale`).

### D-045 · 2026-11-27 · Nové scénáře a rekvizity
- Scénáře: `lighter` (jiskra → plamen), `dieselBarrel`, `leak` (prostřelený sud, palivo volitelné), `acetyleneCyl`, `chain`
  (řetěz vznícení), `blastLab` (obecný výbuch). Celkem 24.
- Rekvizity `src/assets/props2.js`: zapalovač, sud bez víka s hladinou, pramínek, rozteklý pruh, acetylenová láhev a její
  úlomky, europaleta, bedna. Celkem 23 assetů.
- Plamen ze sudu a z pruhu: nové volby zdroje `volTongues`, `shapeK`, `volSoot`.

### D-046 · 2026-11-27 · xEngine: nové předvolby a návrh hořlavých předmětů
- `presets.js`: `fireFromSpec`, `explosionFromSpec`; předvolby `lighter`, `dieselBarrel`, `pallets`, `strawBale`, `tire`,
  `acetyleneCylinder`. `fire-system.js`: `heatFluxFull()` a `ignitionTimeAt()`; `heatFlux()` beze změny (kontrakt testů).
- `xspace.js`: návrh komponenty `flammable` (F-10) a kontrola `checkFlammable`. Do xEngine nezapsáno; test integrace prošel
  proti klonu xEngine `main` 1f2e623.

### D-047 · 2026-11-28 · Rozložení stránky: plátno nesmí řídit šířku (chyba „okno se donekonečna rozšiřuje“)
- **Chyba** (hlášení Ondřeje, artefakt při zvětšení stránky ≠ 100 %): plátno časové osy bylo pružná položka s `min-width:auto`
  a každý snímek dostalo `width = clientWidth × devicePixelRatio`. Při neceločíselném dpr zaokrouhlení změnilo poměr stran,
  položka povyrostla (~0,5 % za snímek), sloupec mřížky `1fr` (= `minmax(auto,1fr)`) se roztáhl a s ním celá stránka.
  Chyba byla od iterace 1; testy v sandboxu běžely vždy při dpr 1, proto ji nechytily.
- **Oprava**: sloupce `minmax(0,1fr)`, `min-width:0` na všech pružných položkách, plátno osy `flex:1 1 0; width:0`,
  velikost bitmapy zaokrouhlená, omezená (≤ 4096) a přiřazovaná jen při změně; `ResizeObserver` na pohledu; pravý panel
  zalamuje dlouhé hodnoty (`table-layout:fixed`), výběrová pole se vejdou do panelu; pod 760 px se panely skládají pod sebe.
- **Pravidlo**: žádné plátno nesmí určovat rozměr svého rodiče. Každá změna UI se zkouší při dpr 1,25 a 1,5
  (`npm run test:layout`: 9 velikostí × zvětšení, 3 běhy skutečné smyčky, přetečení pravého panelu u všech scénářů a záložek).
