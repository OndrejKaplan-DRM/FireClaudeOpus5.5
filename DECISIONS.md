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
