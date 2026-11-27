# MODEL — obecný model ohně FireLab (iterace 6, 2026-11-27)

Ondřej 2026-11-27 večer: *„Cílem je zacházet s ohněm tak, jako by to byl prvek z reality … izoluj, pochop a rozpracuj
jednotlivé charakteristiky do obecného enginu, který … pomocí matematických triků … s minimem dat, úsilí a výpočetního
výkonu“* dodá co nejvíc výsledku.

Tento soubor popisuje **jak je oheň ve FireLab zobecněný**: z čeho se počítá, co z toho vypadne a kde se šetří.
Zdroje čísel a jistota ★ jsou u funkcí v `src/physics/`. Slovo „realistické“ jen u fyzikálně podloženého; jinak „umělecké“.

## 1. Řetěz, který dělá z ohně prvek světa
```
materiál + množství + tvar ──► fireSpec ──► Q(t), D, L, doba hoření            (physics/spec.js)
                                   │
                                   ▼
                           FireSource (plamen, kouř, jiskry, světlo, zvuk)       (fx/world.js)
                                   │  tepelný tok q″(x) = sálání + kontakt + horký oblak   (physics/heat.js)
                                   ▼
              Burnable: dávka F = ∫(q″ − q″crit)ⁿ dt ──► F ≥ FTP ──► vznícení    (fx/burnable.js)
                 │                                                    │
                 │ nehořlavé (plech, sklo, zdivo)                     ▼
                 ▼                                         vlastní fireSpec z materiálu a hmotnosti
        teplota plechu, saze, shořelý lak, okuje, rez                 │
        (shader applyChar metal)                                      ▼
                                                    ohoření (uChar), sesednutí, vyhoření, zbytek
```
Jedno číslo dávky na předmět nahrazuje řešení vedení tepla; pořadí vznícení (sláma → bedna → pneumatika) **vychází samo**
z materiálů a vzdáleností (scénář „Přestup tepla: řetěz vznícení“).

## 2. Jeden popis ohně: `fireSpec` (physics/spec.js)
| Druh | Vstup | Co se dopočítá | Zdroj, ★ |
|---|---|---|---|
| `pool` louže v nádobě | palivo, D, objem | m″ = m″∞(1 − e^(−kβD)), Q, L, pokles hladiny, doba hoření | Babrauskas ★4, Heskestad ★5 |
| `spill` rozlitá kapalina | palivo, litry, tloušťka vrstvy | plocha, D, Q, doba | Gottuk & White ★3 |
| `leak` vytékající kapalina | palivo, otvor [mm] a výška hladiny, nebo l/s | výtok (Torricelli), rovnovážná hořící plocha A = ṁ/m″, Q = ṁ·ΔHc, pruh š × d, výška plamenů | ★5 / ★3 / Yuan & Cox ★4 |
| `pile` hromada dřeva | materiál, hmotnost, tloušťka polen | povrch A = 4m/ρb, Qpeak = HRRPUA·A·½, křivka t², doba, prohoření polena | SFPE ★3, EN 1995-1-2 ★5 |
| `solid` hořící předmět | materiál, hmotnost, povrch, rozměr | Qpeak, rozhoření = rozměr/rychlost šíření, plato z energie m·ΔHc | ★3 |
| `jet` plamen z trysky | palivo, průtok | Q, laminární výška L ∝ Q | Roper ★4 |
| `wick` knot | palivo, Q | výška, spotřeba, doba | ★4 |

Měřítko: `scaleFire(spec, k)` – k-násobný výkon při stejné plošné hustotě výkonu (D ∝ √k, L z Heskestada).
Volby zdroje: `sourceOptions(spec)`. Předvolby xEngine z popisu: `fireFromSpec` v `integrations/xengine/presets.js`.

Příklady čísel (test `npm run test:physics`): sud nafty 0,56 m → 340 kW, plamen 1,85 m, hoří 5,2 h; průstřel 9 mm půl metru
pod hladinou → 0,12 l/s → 4,6 MW na 4,6 m², sud vyteče za 35 min; zapalovač 1,25 mg/s → 57 W, 25 mm.

## 3. Jeden popis výbuchu: `explosionSpec`
| Druh | Vstup | Výstup |
|---|---|---|
| `he` trhavina | druh, hmotnost, plášť ano/ne | TNT ekvivalent, záblesk, ohnivá koule, kouř, trosky nebo střepiny, jiskry, kráter, od 100 kg hřib, od 300 kg prstenec a kondenzační dóm |
| `fireball` nádoba s hořlavou kapalinou | palivo, zapojená hmotnost, filmově ano/ne | koule CCPS D = 5,8 M^⅓, t = 0,45 M^⅓, slabá tlaková vlna, hořící louže |
| `gasMix` plyn + kyslík | hmotnost plynu | detonace směsi, modrobílý záblesk bez sazí |
| `gasCylinder` tlaková láhev v požáru | náplň, plášť, tlak roztržení | energie roztržení (Brode), deflagrace oblaku, koule ~13 m plná sazí, úlomky ~80 m/s |

**Trik:** každý parametr je mocninný zákon v = v₁·(W/W₁)^p mezi dvěma ručně vyladěnými body (granát 0,24 kg a 1 t TNT).
Exponenty vycházejí blízko fyzikálních (záblesk p = 0,68 ≈ ⅔ – plocha koule; spálenina p = 0,35 ≈ ⅓ – Hopkinson–Cranz),
takže funkce prochází oběma předvolbami přesně a mezi nimi i za nimi se chová rozumně. Scénář „Obecný výbuch“ to ukazuje
posuvníkem 50 g – 5 t.

## 4. Přestup tepla (physics/heat.js)
- **Sálání:** tři body na ose plamene posunuté na přivrácený povrch (blízké pole), daleko přechází v bodový zdroj
  χr·Q/4πR² (Modak ★4). Strop zářivostí povrchu E = 140·e^(−0,12D) + 20·(1 − e^(−0,12D)) kW/m² (Mudan & Croce ★4) –
  velké sazové požáry svítí jen „okny“ v plášti kouře.
- **Kontakt:** uvnitř obálky plamene 60–150 kW/m² podle velikosti ★3.
- **Horký oblak:** nad plamenem h·ΔT s Heskestadovou osovou teplotou a Gaussovým profilem ★3. Vítr osu naklání (AGA),
  takže po větru se věci vznítí dřív.
- Kalibrace: 1 MW dává 20 kW/m² asi 0,75 m a 10 kW/m² asi 1,2 m od okraje ohně (Babrauskas: „Will the second item ignite?“ ★3).

## 5. Zapálení (physics/heat.js + physics/materials.js)
- Tlustý materiál: t = (π/4)·kρc·(T_ig − T₀)²/(q″ − q″crit)²; tenký: t = ρcδ·(T_ig − T₀)/(q″ − q″crit) ★4.
- **Dávka (Flux–Time Product):** dF/dt = (q″ − q″crit)ⁿ, vznícení při F ≥ FTP; n = 2 tlusté, n = 1 tenké. Při stálém toku dá
  přesně vzorec výše (test: poměr 1,001), při proměnném toku sčítá a po odeznění chladne s časovou konstantou materiálu.
- Kapaliny: benzín (bod vzplanutí −43 °C) chytne od jiskry hned; nafta (> 55 °C) od jiskry ne – musí se ohřát vrstva u hladiny.
- Před vznícením předmět **čmoudí bílým dýmem** (pyrolýza) – viditelné varování, intenzita podle dávky.

| Materiál | q″crit | Doba do vznícení při 20 / 35 / 50 kW/m² | Výkon z povrchu | Zbytek |
|---|---|---|---|---|
| sláma, suchá tráva | 8 kW/m² | 4 s / 1,9 s / 1,2 s | 200 kW/m² | černé strniště, bílý popel |
| papír, karton | 10 | 11 s / 4,5 s / 2,8 s | 180 | vločky, popel |
| PU pěna | 7 | 13 s / 2,7 s / 1,2 s | 400 | kapky, škvarek |
| měkké dřevo | 12 | 6 min / 43 s / 16 s | 130 | uhlí → popel, 0,65 mm/min do hloubky |
| plast (PP, ABS) | 15 | 53 min / 3,3 min / 65 s | 500 | tavenina |
| pryž (pneumatika) | 17 | 2,2 h / 3,7 min / 66 s | 250 | kord, saze |
| nafta (studená) | 3 | 6,6 s / 3,5 s / 2,4 s | 2 000 | mastná skvrna |

## 6. Následky hoření (co po ohni zůstane)
| Jev | Model | Kde |
|---|---|---|
| Zuhelnatění dřeva, aligátoří trhliny, žhnutí, popel | `applyChar` (uChar, uGlow), postup z Burnable | fx/char.js |
| **Očouzený plech**: lak hnědne a puchýřuje (200–350 °C) → shoří na bělošedý popílek a holou ocel (> 350 °C) → okuje (> 500 °C) → rez | `applyChar({ metal: true })`: uTmax, uTnow, uSoot, uRust; barvy změřené na fotkách vyhořelých aut | fx/char.js |
| „Čistý výpal“: saze drží jen na chladnějším plechu, na horkém shoří → černý lem kolem světlého středu | saze × (1 − shořelý lak), šmouhy vzhůru | fx/char.js |
| Žhnoucí plech nad ~525 °C | emise Planck podle uTnow | fx/char.js |
| Teplota tenkého plechu | ρcδ·dT/dt = εq″ − 2εσ(T⁴ − T₀⁴) − 2h(T − T₀); v plameni 80 kW/m² rovnováha ~580 °C | physics/heat.js |
| Usazování sazí | termoforéza: dS/dt ∝ hustota kouře · (Tg − Ts)/Tg | physics/heat.js, FXWorld.smokeAt |
| Sesednutí vyhořelých věcí | výška × (1 − k·vyhoření^1,5) podle typu materiálu | scénář chain |
| Spálenina na zemi, kráter | decal (už dřív) | fx/decal.js |
| Praskání a vypadnutí skla | prahy 5 a 20 kW/m² (★2), zatím jen funkce `glassState` | physics/heat.js |

## 7. Kde se šetří (matematické triky, řazeno podle úspory)
1. **Rozměrová analýza místo simulace proudění.** Výška plamene, puffing, rychlost a teplota v oblaku, náklon větrem,
   přetlak výbuchu – vše jsou uzavřené vzorce z Q, D, W. Žádná mřížka, žádný řešič; cena nanosekundy.
2. **Jedna dávka na předmět** místo vedení tepla (FTP): 1 float, 1 sčítání za krok.
3. **Mocninné zákony mezi kalibračními body** pro výbuchy: 2 body → celá škála 50 g – 5 t.
4. **Plamen jako analytické pole** (obálka + advekovaný šum) vzorkované paprskem; pro T0 vypečené do atlasu ze stejného pole.
5. **Emise–absorpce sazí** v lokální rovnováze: jas a neprůhlednost z jediné veličiny (objemový podíl sazí).
6. **Barva z Plancka** (tabulka 1D) – žádné ruční gradienty; barva kouře z podílu sazí, vody a dehtu.
7. **Stavy materiálu z nejvyšší dosažené teploty** (1 uniforma) místo simulace laku, oxidace a rzi.
8. **Rozpočty podle stupně**: fyzika stejná na T0–T5, mění se jen počet částic, kroků a objemů.
9. **Sdílený popis** pro scénář, předvolbu enginu i data levelu – žádné opisování čísel.

## 8. Co model záměrně nedělá (meze)
- Neřeší proudění (CFD): kouř v místnosti, komínový efekt, flashover a backdraft jsou jen korelace nebo chybí.
- Tok se měří v jednom bodě předmětu; velké věci (dům, auto) potřebují víc bodů nebo zóny.
- Zastínění sálání překážkou se nepočítá (plech mezi ohněm a bednou bednu nechrání).
- Hašení (voda, pěna, prášek) chybí celé.
- Saze na zdi mají zatím jen shader plechu; zdivo a fasáda nad okny čekají (AUDIT).
- Čísla materiálů mají rozptyl ±50 % (HRRPUA, rychlost šíření ★2–3); pořadí a řády sedí, sekundy ne.
