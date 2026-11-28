// Materiály z pohledu ohně: zapálení, vlastní hoření, poškození a zbytky. Doplňuje fuels.js (vzhled a chemie plamene)
// o chování věcí, které oheň ohřívá. Čisté funkce, SI. Jistota ★1–5 u každé položky (`conf`).
//
// Zdroje: Quintiere & Harkleroad (1984, LIFT – kρc a T_ig), Quintiere: Fundamentals of Fire Phenomena (2006),
// Babrauskas: Ignition Handbook (2003), SFPE Handbook (Tewarson – HRRPUA), EN 1995-1-2 (zuhelnatění dřeva 0,65 mm/min),
// Mikkola & Wichman (1989, tvar t_ig), Shields/Silcock (FTP), Mealy–Benfer–Gottuk (2011, rozlité kapaliny),
// EN 590 a EN 228 (bod vzplanutí nafty a benzínu), Babrauskas: Glass breakage in fires.
//
// Pole:
//  fuel      klíč do FUELS (vzhled plamene a kouře, ΔHc)
//  mode      'thick' tepelně tlustý (dřevo, plasty) | 'thin' tenký (papír, sláma, látka) | 'liquid' kapalina | 'inert' nehoří
//  Tig       teplota povrchu při zapálení pilotním plamenem [K]
//  qCrit     kritický tepelný tok [W/m²] – pod ním se nezapálí nikdy
//  krc       tepelná setrvačnost kρc [W²·s·m⁻⁴·K⁻²] (thick; efektivní hodnota při zapálení)
//  rcd       plošná tepelná kapacita ρ·c·δ [J·m⁻²·K⁻¹] (thin)
//  flash     bod vzplanutí kapaliny [K]; pod ním jiskra louži nezapálí
//  hrrpua    výkon z jednotky hořícího povrchu [W/m²]
//  spread    rychlost šíření plamene po povrchu [m/s] (vodorovně; vzhůru ~5–10× rychleji)
//  burnFrac  podíl hmotnosti, který shoří plamenem (zbytek = uhlí, popel, kov)
//  charRate  rychlost zuhelnatění do hloubky [m/s] (dřevo)
//  cool      časová konstanta chladnutí povrchu [s] – jak rychle se „zapomíná“ předchozí ohřev
//  look      typ poškození pro shader: 'char' | 'fluff' | 'melt' | 'metal' | 'glass' | 'mineral' | 'liquid'
//  residue   co zůstane (text pro UI)
export const MATERIALS = {
  softwood: {
    name: 'Měkké dřevo suché (smrk, borovice)', fuel: 'woodDry', mode: 'thick', Tig: 633, qCrit: 12e3, krc: 0.25e6,
    hrrpua: 130e3, spread: 0.002, burnFrac: 0.8, charRate: 0.65e-3 / 60, cool: 90, look: 'char', residue: 'dřevěné uhlí → šedý popel', conf: 4,
  },
  hardwood: {
    name: 'Tvrdé dřevo suché (buk, dub)', fuel: 'woodDry', mode: 'thick', Tig: 620, qCrit: 11e3, krc: 0.45e6,
    hrrpua: 150e3, spread: 0.0015, burnFrac: 0.8, charRate: 0.5e-3 / 60, cool: 120, look: 'char', residue: 'dřevěné uhlí → šedý popel', conf: 4,
  },
  woodWet: {
    name: 'Dřevo vlhké (30 % vody)', fuel: 'woodDry', mode: 'thick', Tig: 653, qCrit: 15e3, krc: 0.6e6,
    hrrpua: 90e3, spread: 0.001, burnFrac: 0.7, charRate: 0.5e-3 / 60, cool: 90, look: 'char', residue: 'uhlí, hodně páry a bílého dýmu', conf: 3,
  },
  paper: {
    name: 'Papír, karton', fuel: 'woodDry', mode: 'thin', Tig: 533, qCrit: 10e3, rcd: 700 * 1340 * 0.0005,
    hrrpua: 180e3, spread: 0.01, burnFrac: 0.92, cool: 12, look: 'fluff', residue: 'černé vločky → bílý popel', conf: 3,
  },
  straw: {
    name: 'Sláma, seno, suchá tráva', fuel: 'straw', mode: 'thin', Tig: 573, qCrit: 8e3, rcd: 400 * 1500 * 0.0003,
    hrrpua: 200e3, spread: 0.05, burnFrac: 0.9, cool: 7, look: 'fluff', residue: 'černé strniště, bílý popel, doutnající jádro', conf: 3,
  },
  textile: {
    name: 'Látka (bavlna), čalounění bez pěny', fuel: 'woodDry', mode: 'thin', Tig: 573, qCrit: 10e3, rcd: 300 * 1300 * 0.0006,
    hrrpua: 150e3, spread: 0.008, burnFrac: 0.9, cool: 10, look: 'fluff', residue: 'zuhelnatělé cáry', conf: 2,
  },
  puFoam: {
    name: 'PU pěna (sedačky, matrace)', fuel: 'houseContents', mode: 'thick', Tig: 573, qCrit: 7e3, krc: 0.035e6,
    hrrpua: 400e3, spread: 0.008, burnFrac: 0.95, cool: 20, look: 'melt', residue: 'hořící kapky, černý škvarek', conf: 3,
  },
  plastic: {
    name: 'Plast (PP, ABS – nárazníky, interiér)', fuel: 'vehicle', mode: 'thick', Tig: 673, qCrit: 15e3, krc: 0.7e6,
    hrrpua: 500e3, spread: 0.002, burnFrac: 0.95, cool: 90, look: 'melt', residue: 'hořící louže taveniny, černý škvarek', conf: 3,
  },
  rubber: {
    name: 'Pryž (pneumatika)', fuel: 'rubber', mode: 'thick', Tig: 683, qCrit: 17e3, krc: 0.6e6,
    hrrpua: 250e3, spread: 0.0008, burnFrac: 0.7, cool: 150, look: 'melt', residue: 'ocelový kord, saze, pyrolýzní olej', conf: 2,
  },
  gasoline: {
    name: 'Benzín (kapalina)', fuel: 'gasoline', mode: 'liquid', flash: 230, Tig: 230, qCrit: 0, rcd: 0,
    hrrpua: 0.055 * 43.7e6, spread: 1.7, burnFrac: 1, cool: 5, look: 'liquid', residue: 'spálenina na podkladu', conf: 5,
  },
  diesel: {
    name: 'Nafta (kapalina)', fuel: 'diesel', mode: 'liquid', flash: 328, Tig: 328, qCrit: 3e3, rcd: 840 * 1900 * 0.002,
    hrrpua: 0.045 * 44.4e6, spread: 0.05, burnFrac: 1, cool: 60, look: 'liquid', residue: 'mastná černá skvrna, saze', conf: 4,
  },
  steelPainted: {
    name: 'Lakovaný ocelový plech (karoserie, sud)', fuel: null, mode: 'inert', Tig: Infinity, qCrit: Infinity,
    rcd: 7850 * 490 * 0.0008, paintOff: 620, glow: 800, cool: 60, look: 'metal', residue: 'holý šedý plech s okujemi, za pár dní rez', conf: 4,
  },
  steelThick: {
    name: 'Tlustá ocel (tlaková láhev, nosník)', fuel: null, mode: 'inert', Tig: Infinity, qCrit: Infinity,
    rcd: 7850 * 490 * 0.005, paintOff: 620, glow: 800, weak: 823, cool: 400, look: 'metal', residue: 'okuje, při 550 °C poloviční pevnost', conf: 4,
  },
  aluminium: {
    name: 'Hliník (disky kol, blok motoru)', fuel: null, mode: 'inert', Tig: Infinity, qCrit: Infinity,
    rcd: 2700 * 900 * 0.004, cp: 900, melt: 933, latent: 397e3, cool: 200, look: 'metal', residue: 'ztuhlé stříbrné louže a kapky', conf: 5,
  },
  glass: {
    name: 'Okenní sklo 4 mm', fuel: null, mode: 'inert', Tig: Infinity, qCrit: Infinity,
    rcd: 2500 * 840 * 0.004, crackDT: 70, crackQ: 5e3, falloutQ: 20e3, falloutT: 630, soften: 973, look: 'glass', residue: 'popraskané, vypadlé, střepy; nad 700 °C měkne', conf: 2,
  },
  masonry: {
    name: 'Zdivo, beton, omítka', fuel: null, mode: 'inert', Tig: Infinity, qCrit: Infinity,
    rcd: Infinity, spall: 573, cleanBurn: 700, look: 'mineral', residue: 'saze nad otvory, „čistý výpal“ u ohniska, odprýskaná omítka', conf: 3,
  },
  // --- doplněno v iteraci 7
  magnesium: {
    // třísky a tenké odlitky; masivní kus teplo odvede a nechytne (k = 156 W/mK). Zapálí se až kolem bodu tání 650 °C. ★3
    name: 'Hořčík (třísky, tenký odlitek)', fuel: 'magnesium', mode: 'thin', Tig: 900, qCrit: 30e3, rcd: 1740 * 1020 * 0.0005,
    hrrpua: 700e3, spread: 0.01, burnFrac: 1, cool: 20, look: 'metal', residue: 'bílý kyprý oxid hořečnatý', conf: 3,
  },
  cardboardBox: {
    name: 'Kartonová krabice s obsahem', fuel: 'woodDry', mode: 'thin', Tig: 533, qCrit: 10e3, rcd: 700 * 1340 * 0.003,
    hrrpua: 220e3, spread: 0.006, burnFrac: 0.9, cool: 25, look: 'fluff', residue: 'zborcená černá hromádka, popel', conf: 3,
  },
  curtain: {
    name: 'Záclona, závěs', fuel: 'woodDry', mode: 'thin', Tig: 560, qCrit: 9e3, rcd: 250 * 1300 * 0.0004,
    hrrpua: 180e3, spread: 0.03, burnFrac: 0.95, cool: 6, look: 'fluff', residue: 'cáry a hořící kapky (syntetika)', conf: 2,
  },
  leadSolder: {
    name: 'Olovo, pájka, zinkové odlitky', fuel: null, mode: 'inert', Tig: Infinity, qCrit: Infinity,
    rcd: 11340 * 130 * 0.003, cp: 130, melt: 600, latent: 23e3, cool: 120, look: 'metal', residue: 'ztuhlé kapky; ukazatel teplot nad 330–420 °C', conf: 4,
  },
  copper: {
    name: 'Měď (vodiče, trubky)', fuel: null, mode: 'inert', Tig: Infinity, qCrit: Infinity,
    rcd: 8960 * 385 * 0.002, cp: 385, melt: 1358, latent: 205e3, cool: 150, look: 'metal', residue: 'zčernalá, v běžném požáru se netaví (1 085 °C)', conf: 5,
  },
};

/** Vyhledání materiálu podle klíče nebo objektu. */
export const material = (m) => (typeof m === 'string' ? MATERIALS[m] : m);
