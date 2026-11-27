// Databáze paliv. Hodnoty z: Babrauskas (SFPE Handbook, kap. Heat Release Rates; Pool fires),
// Tewarson (SFPE, Generation of Heat and Chemical Compounds), Mulholland (soot extinction),
// Byram/Rothermel/Anderson (lesní paliva), Ingason & Lönnermark (vozidla). Jistota u každé položky.
//
// Pole:
//  dHc       efektivní spalné teplo [J/kg]
//  mInf      hmotnostní rychlost odhořívání nekonečné louže [kg/m²/s] (jen kapaliny)
//  kBeta     koeficient extinkce×délkový faktor louže [1/m] (jen kapaliny)
//  rho       hustota kapaliny/paliva [kg/m³]
//  ys        výtěžek sazí při dobré ventilaci [kg sazí/kg paliva]
//  yCO       výtěžek CO při dobré ventilaci [kg/kg]
//  chiR      podíl vyzářeného tepla [-]
//  Tflame    typická „vizuální" teplota svítivé zóny [K] (pro barvu; odhad z pyrometrie sazí)
//  water     podíl vodní páry v kouři (vlhká paliva → bílý kouř) [0..1] (umělecký parametr kalibrovaný na pozorování)
//  tar       podíl dehtu/kapiček pyrolyzátu (hnědý nádech) [0..1] (umělecký)
//  embers    sklon k tvorbě létajících žhavých částic [0..1] (umělecký)
//  sparks    sklon k jiskření [0..1]
//  fv        objemový podíl sazí ve svítivé zóně [ppm] → κ ≈ 2,7·fv [1/m] při 1 500 K (Planckův střed, Tien & Lee) ★3
//  conf      ★ jistota hlavních čísel

// Tlum [K]: teplota svítivých zón (horké proužky) pro barvu objemu – velké louže měří max. 1 100–1 250 °C (Koseki 1989, ★3);
// Tflame je efektivní teplota pro vyzařování a světlo (nižší kvůli plášti sazí).
export const FUELS = {
  paraffin: {
    fv: 5, name: 'Parafín (svíčka)', dHc: 42.0e6, rho: 900, ys: 0.01, yCO: 0.003, chiR: 0.25,
    Tflame: 1300, water: 0.0, tar: 0.0, embers: 0, sparks: 0, conf: 4,
  },
  woodDry: {
    fv: 0.6, name: 'Dřevo suché (smrk/buk)', dHc: 15.0e6, rho: 500, ys: 0.015, yCO: 0.004, chiR: 0.3,
    Tflame: 1250, water: 0.15, tar: 0.1, embers: 0.6, sparks: 0.5, conf: 4,
  },
  woodResin: {
    fv: 1.2, Tlum: 1300, name: 'Louč (smolné dřevo)', dHc: 18.0e6, rho: 600, ys: 0.04, yCO: 0.01, chiR: 0.32,
    Tflame: 1200, water: 0.05, tar: 0.35, embers: 0.4, sparks: 0.3, conf: 3,
  },
  straw: {
    fv: 0.4, Tlum: 1300, name: 'Sláma (balík)', dHc: 14.0e6, rho: 120, ys: 0.01, yCO: 0.006, chiR: 0.3,
    Tflame: 1200, water: 0.45, tar: 0.15, embers: 1.0, sparks: 0.2, conf: 3,
  },
  diesel: {
    sootBlack: 0.96, fv: 2.0, Tlum: 1380, name: 'Nafta', dHc: 44.4e6, mInf: 0.045, kBeta: 2.1, rho: 840, ys: 0.059, yCO: 0.012, chiR: 0.35,
    Tflame: 1150, water: 0.0, tar: 0.15, embers: 0, sparks: 0, conf: 4,
  },
  gasoline: {
    sootBlack: 0.92, fv: 1.5, Tlum: 1400, name: 'Benzín', dHc: 43.7e6, mInf: 0.055, kBeta: 2.1, rho: 740, ys: 0.038, yCO: 0.01, chiR: 0.35,
    Tflame: 1200, water: 0.0, tar: 0.05, embers: 0, sparks: 0, conf: 4,
  },
  rubber: {
    fv: 4.0, Tlum: 1350, name: 'Pryž (pneumatika, SBR)', dHc: 27.0e6, rho: 1150, ys: 0.13, yCO: 0.05, chiR: 0.4,
    Tflame: 1100, water: 0.0, tar: 0.5, embers: 0.1, sparks: 0.05, conf: 3,
  },
  vehicle: {
    sootBlack: 0.92, fv: 1.8, Tlum: 1360, name: 'Osobní auto (plasty, pryž, palivo)', dHc: 25.0e6, rho: 0, ys: 0.08, yCO: 0.04, chiR: 0.35,
    Tflame: 1150, water: 0.05, tar: 0.35, embers: 0.2, sparks: 0.3, conf: 3,
  },
  houseContents: {
    fv: 1.4, Tlum: 1350, name: 'Obsah domu (dřevo, PU pěna, plasty)', dHc: 20.0e6, rho: 0, ys: 0.06, yCO: 0.03, chiR: 0.33,
    Tflame: 1150, water: 0.1, tar: 0.3, embers: 0.6, sparks: 0.3, conf: 3,
  },
  forestLitter: {
    fv: 0.5, name: 'Lesní hrabanka + podrost (borovice)', dHc: 18.6e6, rho: 0, ys: 0.02, yCO: 0.06, chiR: 0.25,
    Tflame: 1150, water: 0.35, tar: 0.25, embers: 0.8, sparks: 0.2, conf: 3,
    // lesní parametry: w [kg/m²] spotřebované palivo, R0 [m/s] rychlost bez větru, wind a·U^b, tr doba hoření v místě [s]
    w: 1.2, R0: 0.01, wa: 0.9, wb: 1.3, tr: 90,
  },
  crown: {
    fv: 0.5, name: 'Koruny jehličnanů', dHc: 18.6e6, rho: 0, ys: 0.03, yCO: 0.06, chiR: 0.25,
    Tflame: 1150, water: 0.25, tar: 0.25, embers: 1.0, sparks: 0.2, conf: 2,
    w: 1.0, R0: 0.02, wa: 1.6, wb: 1.2, tr: 35,
  },
  brush: {
    fv: 0.4, name: 'Suché křoví (keře, tráva)', dHc: 18.0e6, rho: 0, ys: 0.012, yCO: 0.04, chiR: 0.25,
    Tflame: 1180, water: 0.25, tar: 0.15, embers: 0.7, sparks: 0.1, conf: 3,
    w: 1.5, R0: 0.02, wa: 1.3, wb: 1.4, tr: 40,
  },
  // --- doplněno v iteraci 6 (zobecnění palety): plyny a rozpouštědla. Výtěžky sazí Tewarson (SFPE), louže Babrauskas.
  butane: {
    fv: 3.0, name: 'Butan (zapalovač)', dHc: 45.7e6, rho: 580, ys: 0.029, yCO: 0.007, chiR: 0.28,
    Tflame: 1400, water: 0.0, tar: 0.0, embers: 0, sparks: 0, conf: 4,
  },
  acetylene: {
    // acetylen na vzduchu: nejsazovější běžný plyn (ys ≈ 0,096), oslnivě žlutý plamen a vlající černé vločky sazí
    sootBlack: 1, fv: 6.0, Tlum: 1500, name: 'Acetylen (na vzduchu)', dHc: 48.2e6, rho: 1.1, ys: 0.096, yCO: 0.04, chiR: 0.4,
    Tflame: 1350, water: 0.0, tar: 0.1, embers: 0, sparks: 0, conf: 4,
  },
  acetone: {
    fv: 0.8, Tlum: 1350, name: 'Aceton', dHc: 25.8e6, mInf: 0.041, kBeta: 1.9, rho: 790, ys: 0.014, yCO: 0.003, chiR: 0.27,
    Tflame: 1250, water: 0.0, tar: 0.0, embers: 0, sparks: 0, conf: 4,
  },
  ethanol: {
    // líh: téměř nesvítivý modrý plamen (ys ≈ 0,008), ve dne skoro neviditelný
    fv: 0.15, name: 'Líh (etanol)', dHc: 26.8e6, mInf: 0.015, kBeta: 100, rho: 790, ys: 0.008, yCO: 0.001, chiR: 0.2,
    Tflame: 1500, water: 0.0, tar: 0.0, embers: 0, sparks: 0, conf: 4,
  },
  steelSpark: {
    fv: 0, name: 'Ocelová jiskra (broušení)', dHc: 0, rho: 7850, ys: 0, yCO: 0, chiR: 1, Tflame: 1800,
    water: 0, tar: 0, embers: 0, sparks: 1, conf: 4,
  },
};

// Výbušniny — ekvivalent TNT (hmotnostní, pro tlak). TNT = 4,184 MJ/kg (definice). ★★★★★
export const EXPLOSIVES = {
  tnt: { name: 'TNT', eqP: 1.0, dens: 1600, gurney: 2440, conf: 5 },
  compB: { name: 'Composition B (granát M67)', eqP: 1.33, dens: 1720, gurney: 2700, conf: 4 },
  acetyleneO2: { name: 'C₂H₂ + O₂ (stechiometrie, detonace)', eqP: null, dHc: 48.2e6, eff: 0.45, conf: 3 },
  petrolVapour: { name: 'Benzínové páry (deflagrace)', eqP: null, dHc: 43.7e6, eff: 0.03, conf: 2 },
};

export const TNT_J_PER_KG = 4.184e6;
