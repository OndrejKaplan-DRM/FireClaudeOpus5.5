// Barva a jas záření černého tělesa (Planck) → lineární sRGB.
// CIE 1931 2° color matching functions: analytická víceloboká aproximace
// Wyman, Sloan, Shirley (2013) "Simple Analytic Approximations to the CIE XYZ CMFs", JCGT 2(2). ★★★★★
// XYZ→lineární sRGB (D65) matice IEC 61966-2-1. ★★★★★

const h = 6.62607015e-34, c = 2.99792458e8, kB = 1.380649e-23;

function g(x, mu, s1, s2) { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); }
export function cmf(lnm) {
  return [
    1.056 * g(lnm, 599.8, 37.9, 31.0) + 0.362 * g(lnm, 442.0, 16.0, 26.7) - 0.065 * g(lnm, 501.1, 20.4, 26.2),
    0.821 * g(lnm, 568.8, 46.9, 40.5) + 0.286 * g(lnm, 530.9, 16.3, 31.1),
    1.217 * g(lnm, 437.0, 11.8, 36.0) + 0.681 * g(lnm, 459.0, 26.0, 13.8),
  ];
}

/** Spektrální radiance Planck [W·sr⁻¹·m⁻³] */
export function planck(lambdaM, T) {
  return (2 * h * c * c) / Math.pow(lambdaM, 5) / (Math.exp((h * c) / (lambdaM * kB * T)) - 1);
}

/** XYZ (absolutní, v libovolných ale konzistentních jednotkách) pro teplotu T [K] */
export function blackbodyXYZ(T) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const B = planck(l * 1e-9, T), m = cmf(l);
    X += B * m[0]; Y += B * m[1]; Z += B * m[2];
  }
  return [X, Y, Z];
}

export function xyzToLinearSRGB([X, Y, Z]) {
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.2040 * Y + 1.0570 * Z,
  ];
}

const Yref = blackbodyXYZ(1500)[1];
/**
 * Lineární sRGB barva normovaná na jas Y = 1 (chromatičnost) a relativní jas vůči 1500 K.
 * Záporné složky (mimo gamut sRGB) se ořezávají – červená pod ~1000 K je mimo gamut.
 */
export function blackbody(T) {
  const xyz = blackbodyXYZ(T);
  const rgb = xyzToLinearSRGB(xyz).map((v) => Math.max(0, v / xyz[1]));
  return { rgb, lum: xyz[1] / Yref };
}

/**
 * LUT pro shader: N vzorků v rozsahu [Tmin, Tmax], RGBA float: rgb = chromatičnost (Y=1),
 * a = log2(relativní jas). Jas plamene roste extrémně (∝ přibližně T^10 ve viditelném pásmu u 1000–1500 K).
 */
export function blackbodyLUT(N = 256, Tmin = 500, Tmax = 3500) {
  const data = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const T = Tmin + ((Tmax - Tmin) * i) / (N - 1);
    const { rgb, lum } = blackbody(T);
    data.set([rgb[0], rgb[1], rgb[2], Math.log2(Math.max(lum, 1e-12))], i * 4);
  }
  return { data, N, Tmin, Tmax };
}
