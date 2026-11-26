// Deterministické náhodné generátory.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const range = (r, a, b) => a + (b - a) * r();
export function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** Hladký 1D šum (pro poryvy větru, blikání světel). */
export function noise1(seed) {
  const r = mulberry32(seed), P = 256, v = new Float32Array(P);
  for (let i = 0; i < P; i++) v[i] = r() * 2 - 1;
  return (x) => {
    const i = Math.floor(x), f = x - i, a = v[((i % P) + P) % P], b = v[(((i + 1) % P) + P) % P];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}
export function fbm1(seed) {
  const a = noise1(seed), b = noise1(seed + 1), c = noise1(seed + 2);
  return (x) => 0.55 * a(x) + 0.3 * b(x * 2.1) + 0.15 * c(x * 4.3);
}
