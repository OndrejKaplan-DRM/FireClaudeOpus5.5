// Stupně kvality. Jediné místo s rozpočty (viz CLAUDE.md, DECISIONS D-003).
export const TIERS = [
  {
    id: 0, name: 'T0 · ThinkPad T460', hw: 'Intel HD 520 (2016), 1366×768–1080p',
    renderScale: 0.67, maxPixelRatio: 1, msaa: 0,
    particles: { flame: 900, smoke: 700, spark: 400, haze: 0 }, sortSmoke: false, softParticles: false,
    volumes: 0, volumeSteps: 0, volumeScale: 0.5,
    bloom: 0, haze: false, shadows: false, lights: 2, debris: 60,
    lod: 0, treeMax: 400, flipbookRes: 128, flameLight: 'cheap', grain: false,
    frameBudgetMs: 33,
  },
  {
    id: 1, name: 'T1 · starší herní / nové iGPU', hw: 'GTX 1050 / Iris Xe / Radeon 680M',
    renderScale: 0.85, maxPixelRatio: 1, msaa: 0,
    particles: { flame: 2200, smoke: 1800, spark: 1200, haze: 0 }, sortSmoke: true, softParticles: false,
    volumes: 2, volumeSteps: 24, volumeScale: 0.5,
    bloom: 3, haze: false, shadows: false, lights: 4, debris: 150,
    lod: 1, treeMax: 1200, flipbookRes: 128, flameLight: 'normal', grain: false,
    frameBudgetMs: 22,
  },
  {
    id: 2, name: 'T2 · střední herní', hw: 'GTX 1660 / RTX 3050 / RX 6600',
    renderScale: 1.0, maxPixelRatio: 1.25, msaa: 0,
    particles: { flame: 5000, smoke: 5000, spark: 3000, haze: 600 }, sortSmoke: true, softParticles: true,
    volumes: 6, volumeSteps: 48, volumeScale: 0.75,
    bloom: 5, haze: true, shadows: false, lights: 6, debris: 400,
    lod: 2, treeMax: 3000, flipbookRes: 160, flameLight: 'normal', grain: true,
    frameBudgetMs: 16.7,
  },
  {
    id: 3, name: 'T3 · herní PC ČR 2026 (~35 tis. Kč)', hw: 'RTX 4060 / RX 7600, 8 GB VRAM, 1080p–1440p',
    renderScale: 1.0, maxPixelRatio: 2, msaa: 0,
    particles: { flame: 14000, smoke: 14000, spark: 9000, haze: 1500 }, sortSmoke: true, softParticles: true,
    volumes: 16, volumeSteps: 96, volumeScale: 1.0,
    bloom: 6, haze: true, shadows: true, lights: 8, debris: 1200,
    lod: 3, treeMax: 8000, flipbookRes: 192, flameLight: 'shadow', grain: true,
    frameBudgetMs: 16.7,
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
  else if (/RTX (40|50)\d\d|RTX 30[6-9]0|RX (7|9)\d{3}|RX 6[7-9]\d\d|Apple M[2-4]/i.test(s)) t = 3;
  return { tier: t, gpu: s };
}
