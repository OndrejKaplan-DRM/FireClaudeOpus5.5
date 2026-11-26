# ARCHITECTURE — jak je FireLab rozdělený

```
                ┌──────────────────────── src/physics (čisté funkce, bez Three.js) ───────────────────────┐
                │ blackbody  fuels  combustion  wind  blast  spread                                        │
                └───────────────▲───────────────────────────▲──────────────────────────▲──────────────────┘
                                │ Q, L, θ, T, f, τ, barva     │ Ps(R), Us, ohnivá koule  │ časy příchodu ohně
┌─ src/scenarios ───────────────┴─────────────────────────────┴──────────────────────────┴──────────────────┐
│ 18 use casů: build(ctx) → {update, info, controls}. Skládají assety + FireSource/Explosion z fyziky.      │
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
│ app (smyčka, scénáře, expozice, API window.__fire), pipeline (HDR řetězec), tiers (T0–T3), env, rng       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Tok jednoho snímku
1. `App.step(dt)` – čas scénáře `t += dt × timeScale` (průběh požáru), efekty běží v reálném čase `dt`.
2. `scenario.update(dtS, t)` – mění zdroje (výkon, ohořelost, šíření).
3. `FXWorld.update(dt)` – rozpočty (poptávka zdrojů → škála), přidělení objemů podle důležitosti,
   `FireSource.update` spočítá fyziku (Q, L, náklon, T, pulzace, τ kouře, svítivost) a vypustí částice,
   `Explosion.update` (ohnivá koule, rázová vlna z tabulky R(t), prach, trosky, záblesk),
   světla se sloučí do pevného bazénu, systémy částic integrují pohyb ve vzduchu (vítr + vztlak + strhávání).
4. `App.updateExposure()` – oko: měření osvětlení u pozorovatele → cílová expozice (adaptace 0,25 s dolů / 0,9 s nahoru),
   lokální adaptace plamene `flameLum = min(12 000, klíč / expozice)`.
5. `App.renderFrame` – **před-expozice** (`shared.PRE`): všechna světla a emise se násobí expozicí, aby HalfFloat HDR nepřetekl.
6. `Pipeline.render` – neprůhledná scéna → (T2+) kopie lineární hloubky → průhledné efekty (měkké částice, ořez objemů)
   → (T2+) heat haze do polovičního bufferu → bloom (dual filter) → ACES + sRGB + viněta (+ zrno).

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
Jediné místo s rozpočty. T0 = sprity z vypečeného atlasu bez post-procesu; T1 = + 2 levné objemy, bloom;
T2 = objemy 48 kroků, měkké částice, heat haze; T3 = 96 kroků, stín od ohně, ~40 k částic, LOD 3.
Automatika: `guessTier` podle názvu GPU (T460/Intel HD 5xx → T0, RTX 40xx → T3).

## Assety
Každý model je funkce `build({lod, seed})` → `THREE.Group`. LOD 0–4 míří na ~1e2–1e6 △ u velkých modelů.
Spalitelné materiály mají `applyChar` (uniformy `uChar`, `uGlow`; instancované přes atribut `aChar`).
Porost (`InstancedFlora`) má 2 instancované LOD (blízko/daleko) přeskládávané po 0,25 s.

## Integrace do jiného enginu
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
