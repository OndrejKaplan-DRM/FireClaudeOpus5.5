# ARCHITECTURE — jak je FireLab rozdělený

```
                ┌──────────────────────── src/physics (čisté funkce, bez Three.js) ───────────────────────┐
                │ blackbody  fuels  combustion  wind  blast  spread                                        │
                └───────────────▲───────────────────────────▲──────────────────────────▲──────────────────┘
                                │ Q, L, θ, T, f, τ, barva     │ Ps(R), Us, ohnivá koule  │ časy příchodu ohně
┌─ src/scenarios ───────────────┴─────────────────────────────┴──────────────────────────┴──────────────────┐
│ 18 use casů: build(ctx) → {update, info, controls}. Skládají assety + FireSource/Explosion z fyziky.      │
│ forestDetail: hořící kmeny a padající větve u kamery (les zblízka)                                         │
└───────▲────────────────────────────────▲──────────────────────────────────────────────▲────────────────────┘
        │ modely                          │ zdroje ohně, výbuchy                          │ UI, časová osa
┌─ src/assets ─────────┐   ┌─ src/fx ─────────────────────────────────────────┐   ┌─ src/ui ───────────────┐
│ props, big,          │   │ world: FXWorld (rozpočty), FireSource, Explosion │   │ prohlížeč FireLab      │
│ vegetation (LOD 0–4) │   │ particles: Billboard (plamen+kouř+ohnivé         │   │ fyzika/technika/       │
│ textures (vlastní)   │   │   chuchvalce, 1 řazený draw), Spark, Haze        │   │ ovládání/export, atlas │
│ geo (pomůcky)        │   │ volume: raymarch plamene a ohnivé koule          │   └────────────────────────┘
└──────────────────────┘   │ bake: flipbook atlas z objemového pole           │
                           │ lights (bazén PointLight), char (ohořelost),     │
                           │ debris, decal, shared (šum 3D, LUT Planck, PRE)  │
                           └───────────────────────▲──────────────────────────┘
┌─ src/engine ─────────────────────────────────────┴────────────────────────────────────────────────────────┐
│ app (smyčka, scénáře, expozice, API window.__fire), pipeline (HDR řetězec), tiers (T0–T5), env, rng       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Spark kreslí i hořící oharky (typ 2); jejich plamínek a kouřová stopa jdou do Billboard (`sp.trail`).
`src/fx/smokeVolume.js` – objemový kouř T4/T5 (raymarch sloupce, D-036). `src/audio/fireAudio.js` – zvuk (WebAudio, D-037),
`App.step` volá `audio.update(fx, camera)`. Porost: tři prstence LOD a stín z náhrad ve vrstvě `LAYER_SHADOW` (D-034).
`integrations/xengine/xspace.js` – pole a kontroly dat ohně pro xEngine (bez Three.js).

## Iterace 6: obecný model (podrobně `MODEL.md`)
- `src/physics/materials.js` – 16 materiálů z pohledu ohně (zapálení, výkon z povrchu, šíření, zbytek).
- `src/physics/heat.js` – tepelný tok v bodě (`fluxFromFire`, `fluxAt`), doba do vznícení, dávka (FTP), ohřev plechu,
  usazování sazí, zuhelnatění, sklo.
- `src/physics/spec.js` – jeden popis ohně (`fireSpec`, `scaleFire`, `sourceOptions`) a výbuchu (`explosionSpec`), výtok otvorem.
- `src/fx/burnable.js` – `Burnable`: hořlavý nebo ohřívaný předmět. `FXWorld.addBurnable`, `heatFlux`, `smokeAt`, `fireList`.
- `src/fx/char.js` – volba `metal: true` (stavy lakovaného plechu). `src/assets/props2.js` – rekvizity iterace 6.
- `src/scenarios/iter6.js` – 6 scénářů; vkládají se do seznamu v `scenarios/index.js`. Scénář smí volat `ctx.setTimeScale`.
- Nové volby zdroje: `volTongues` (0 = jedna obálka bez jazyků), `shapeK`, `volSoot`; `App.updateExposure` má denní strop jasu.

## Tok jednoho snímku
1. `App.step(dt)` – čas scénáře `t += dt × timeScale` (průběh požáru), efekty běží v reálném čase `dt`.
2. `scenario.update(dtS, t)` – mění zdroje (výkon, ohořelost, šíření).
3. `FXWorld.update(dt)` – rozpočty (poptávka zdrojů → škála), přidělení objemů podle důležitosti, po zdrojích krok
   hořlavých předmětů (`Burnable.update`: tok → dávka → vznícení; plech: teplota, saze),
   `FireSource.update` spočítá fyziku (Q, L, náklon, T, pulzace, τ kouře, svítivost) a vypustí částice,
   `Explosion.update` (ohnivá koule, rázová vlna z tabulky R(t), prach, trosky, záblesk, u velkých náloží pole proudění
   houbového mraku `flow` → `air.extraUp`),
   světla se sloučí do pevného bazénu, systémy částic integrují pohyb ve vzduchu (vítr + vztlak + strhávání).
4. `App.updateExposure()` – oko: měření osvětlení u pozorovatele → cílová expozice (adaptace 0,25 s dolů / 0,9 s nahoru),
   lokální adaptace plamene `flameLum = klíč/ex · (ex/0,25)^0,4` (částečná, D-020) a `lumRef = 16/ex` pro výbuchy, jiskry, žhnutí.
5. `App.renderFrame` – **před-expozice** (`shared.PRE`): všechna světla a emise se násobí expozicí, aby HalfFloat HDR nepřetekl.
6. `Pipeline.render` – neprůhledná scéna → (T2+) kopie lineární hloubky → (T3+) objemy do vlastního cíle + časová akumulace
   (reprojekce, ořez okolím, D-025) a složení → průhledné efekty (měkké částice, ořez objemů)
   → (T2+; T2 nově s akumulací objemů) heat haze do polovičního bufferu → bloom (dual filter) → ACES + sRGB + viněta (+ zrno).

## Fyzika → efekt (klíčové vazby)
| Veličina | Zdroj | Kde se projeví |
|---|---|---|
| L (Heskestad) | `combustion.flameHeight` | výška objemu, délka života jazyků |
| f (puffing) | `combustion.puffingFrequency` | pulzace v shaderu, blikání světla |
| u(z) (McCaffrey) | `particles.integrate` | stoupání jiskry, kouře, uhlíků |
| θ (AGA) | `wind.flameTilt` | náklon objemu i jazyků |
| T, sootColor | `fuels` + `ventilation` | barva (Planck + posun sazí), světlo |
| τ (σs = 8,7 m²/g) | `combustion.smokeOpticalDepth` | neprůhlednost kouře, ředění ∝ s0/s |
| Φ | `combustion.ventilation(o2)` | víc sazí/CO, chladnější plamen, odtržené jazyky |
| Ps(R), Us | `blast` | poloměr rázové vlny v čase, prach, otřes kamery |
| D, t koule | `blast.bleveFireball / heFireball` | ohnivá koule |
| R, LB, I, I0 | `spread` | mapa časů příchodu, přízemní/korunový požár |

## Stupně kvality (src/engine/tiers.js)
Jediné místo s rozpočty. T0 = sprity z vypečeného atlasu bez post-procesu; T1 = + 2 levné objemy (32 kroků), bloom;
T2 = 6 objemů × 64 kroků, měkké částice, heat haze; T3 = 16 × 112 kroků, stín od ohně, LOD 3;
T4 Ultra = 24 × 160 kroků, 64 k částic; T5 Kino = 32 × 192 kroků, LOD 4, pro snímky a videa.
`smokeMul`/`emberMul` škálují hustotu emise kouře a uhlíků (stejná fyzika, víc menších částic).
Automatika: `guessTier` podle názvu GPU (T460/Intel HD 5xx → T0, RTX 4060 → T3, 4070–4080 → T4, 4090/5080/5090 → T5).

## Objemový plamen v2 (src/fx/volume.js, D-020, D-021)
Pole `fieldFlame` vrací (svítivá hustota, T, saze). Obálka (Heskestad L, tvar `uShapeK` kužel/sloup podle L/D), domain-warp
šum advektovaný časem letu 2(√((z+z0)L) − √(z0 L)), přerušovaná zóna, plášť sazí velkých požárů se světelnými skvrnami, chladné
kapsy. Integrace emise–absorpce: κe = 2,7·f_v·hustota·T/1500, κs = saze·σ; zdroj Planck s posunem barvy sazí. Šum je antialiasovaný
podle stopy vzorku (`gFpq`), krok ≤ 0,6/κ, chvění IGN + zlatý řez v čase.

## Assety
Každý model je funkce `build({lod, seed})` → `THREE.Group`. LOD 0–4 míří na ~1e2–1e6 △ u velkých modelů.
Spalitelné materiály mají `applyChar` (uniformy `uChar`, `uGlow`; instancované přes atribut `aChar`).
Porost (`InstancedFlora`) má 2 instancované LOD (blízko/daleko) přeskládávané po 0,25 s.

## Integrace do jiného enginu
- **xEngine** (Ondřejův engine): `integrations/xengine/fire-system.js` – systém jádra `fx.fire` (D-024), předvolby ohňů a výbuchů
  v `presets.js`, zkušební stránka `demo.js` se skutečným jádrem a vykreslením xEngine, test `npm run test:xengine`.
  Návod `integrations/xengine/README.md`, návrhy a návody pro sešny xEngine `integrations/xengine/{NAVRHY,MAPA,SVODNA,SESNA_A,SESNA_B}.md`.
- **Three.js**: importuj `src/fx/world.js` (FXWorld), `src/engine/pipeline.js` (nebo vlastní post-proces s před-expozicí),
  zdroje `fx.addSource({...})`, výbuchy `fx.addExplosion({...})`.
- **Jiný engine**: `dataset/presets/*.json` (fyzikální parametry zdrojů), `dataset/flipbooks/*` (atlas + kanály),
  `dataset/meshes/*.glb`, `dataset/physics/*` (LUT Planck, tabulky výbuchů, databáze paliv). Shadery jsou GLSL ES 3.0
  a přenositelné (objemový plamen: `VOLUME_FIELDS` + `VOLUME_FS` ve `src/fx/volume.js`).

## Testy a nástroje
- `tools/test-physics.mjs` – korelace proti literatuře (Node).
- `tools/test.mjs` – všechny scénáře v headless Chrome (swiftshader), snímky + mřížka + report.
- `tools/seq.mjs` – časová řada jednoho scénáře; `tools/probe.mjs` – jeden snímek + statistiky; `tools/assets-sheet.mjs` – galerie modelů.
- `tools/bake.mjs` – dataset.
- `tools/look.mjs` (snímek s úpravou stavu JS), `tools/shot.mjs` (libovolná kamera), `tools/sweep.mjs` (mřížka scénář × parametr).
- `tools/build-xengine.mjs` + `tools/test-xengine.mjs` – integrace s xEngine (klon v `XENGINE`, výchozí `/home/claude/ondrejkaplan-drm/xengine`).
