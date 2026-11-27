// Stupně kvality. Jediné místo s rozpočty (viz CLAUDE.md, DECISIONS D-003).
// smokeMul: hustota emise kouře (víc menších částic, stejná celková optická tloušťka sloupce); emberMul: uhlíky a jiskry.
export const TIERS = [
  {
    id: 0, name: 'T0 · ThinkPad T460', hw: 'Intel HD 520 (2016), 1366×768–1080p',
    renderScale: 0.67, maxPixelRatio: 1, msaa: 0,
    particles: { flame: 900, smoke: 700, spark: 400, haze: 0 }, smokeMul: 1, emberMul: 0.5, sortSmoke: false, softParticles: false,
    volumes: 0, volumeSteps: 0, volumeScale: 0.5,
    bloom: 0, haze: false, shadows: false, lights: 2, debris: 60,
    lod: 1, treeMax: 400, flipbookRes: 128, flameLight: 'cheap', grain: false,
    frameBudgetMs: 33,
  },
  {
    id: 1, name: 'T1 · starší herní / nové iGPU', hw: 'GTX 1050 / Iris Xe / Radeon 680M',
    renderScale: 0.85, maxPixelRatio: 1, msaa: 0,
    particles: { flame: 2200, smoke: 1800, spark: 1200, haze: 0 }, smokeMul: 1.5, emberMul: 1, sortSmoke: true, softParticles: false,
    volumes: 2, volumeSteps: 32, volumeScale: 0.5, volumeDetail: 0, flameEdge: 0.2,
    bloom: 3, haze: false, shadows: false, lights: 4, debris: 150,
    lod: 2, treeMax: 1200, flipbookRes: 128, flameLight: 'normal', grain: false,
    frameBudgetMs: 22,
  },
  {
    id: 2, name: 'T2 · střední herní', hw: 'GTX 1660 / RTX 3050 / RX 6600',
    renderScale: 1.0, maxPixelRatio: 1.25, msaa: 0,
    particles: { flame: 5000, smoke: 5000, spark: 3000, haze: 600 }, smokeMul: 2.5, emberMul: 1.5, sortSmoke: true, softParticles: true,
    volumes: 6, volumeSteps: 64, volumeScale: 0.75, volumeDetail: 1, flameEdge: 0.14,
    bloom: 5, haze: true, shadows: false, lights: 6, debris: 400,
    lod: 2, treeMax: 3000, flipbookRes: 160, flameLight: 'normal', grain: true,
    frameBudgetMs: 16.7,
  },
  {
    id: 3, name: 'T3 · herní PC ČR 2026 (~35 tis. Kč)', hw: 'RTX 4060 / RX 7600, 8 GB VRAM, 1080p–1440p',
    renderScale: 1.0, maxPixelRatio: 2, msaa: 0,
    particles: { flame: 14000, smoke: 14000, spark: 9000, haze: 1500 }, smokeMul: 4, emberMul: 2.5, sortSmoke: true, softParticles: true,
    volumes: 16, volumeSteps: 112, volumeScale: 1.0, volumeDetail: 2, flameEdge: 0.1,
    bloom: 6, haze: true, shadows: true, lights: 8, debris: 1200,
    lod: 3, treeMax: 8000, flipbookRes: 192, flameLight: 'shadow', grain: true,
    frameBudgetMs: 16.7,
  },
  {
    id: 4, name: 'T4 · Ultra (silné herní GPU)', hw: 'RTX 4070 Super – 4080 / RX 7900, 12–16 GB, 1440p',
    renderScale: 1.0, maxPixelRatio: 2, msaa: 0,
    particles: { flame: 22000, smoke: 26000, spark: 16000, haze: 2500 }, smokeMul: 6, emberMul: 3.5, sortSmoke: true, softParticles: true,
    volumes: 24, volumeSteps: 160, volumeScale: 1.0, volumeDetail: 2, flameEdge: 0.08, smokeVolumes: 2,
    bloom: 6, haze: true, shadows: true, lights: 10, debris: 2000,
    lod: 3, treeMax: 12000, flipbookRes: 256, flameLight: 'shadow', grain: true,
    frameBudgetMs: 16.7,
  },
  {
    id: 5, name: 'T5 · Kino (RTX 4090/5090, snímky a videa)', hw: 'RTX 4090 / 5090, 24–32 GB, 4K',
    renderScale: 1.0, maxPixelRatio: 2, msaa: 0,
    particles: { flame: 32000, smoke: 40000, spark: 24000, haze: 4000 }, smokeMul: 8, emberMul: 5, sortSmoke: true, softParticles: true,
    volumes: 32, volumeSteps: 192, volumeScale: 1.0, volumeDetail: 2, flameEdge: 0.07, smokeVolumes: 4,
    bloom: 6, haze: true, shadows: true, lights: 12, debris: 3000,
    lod: 4, treeMax: 16000, flipbookRes: 256, flameLight: 'shadow', grain: true,
    frameBudgetMs: 33,
  },
];

/** Odhad stupně z názvu GPU (WEBGL_debug_renderer_info). Konzervativní: neznámé → T2. */
export function guessTier(renderer) {
  const gl = renderer.getContext();
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { /* nic */ }
  const s = String(name);
  let t = 2;
  if (/swiftshader|llvmpipe|software/i.test(s)) t = 0;
  else if (/Intel.*(HD|UHD) Graphics (4|5|6)\d\d/i.test(s) || /Intel.*HD Graphics$/i.test(s)) t = 0;
  else if (/Intel.*(Iris|UHD|Xe)|Radeon\(TM\) Graphics|Vega \d|Apple M1/i.test(s)) t = 1;
  else if (/GTX (7|9)\d\d|GTX 10[1-5]0|RX (4|5)[0-6]0|MX\d{3}/i.test(s)) t = 1;
  else if (/RTX (4090|5080|5090)/i.test(s)) t = 5;
  else if (/RTX (4070|4080|5070)|RX 79\d\d|RX 9070/i.test(s)) t = 4;
  else if (/RTX (40|50)\d\d|RTX 30[6-9]0|RX (7|9)\d{3}|RX 6[7-9]\d\d|Apple M[2-4]/i.test(s)) t = 3;
  return { tier: t, gpu: s };
}
