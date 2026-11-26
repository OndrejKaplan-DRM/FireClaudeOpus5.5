// Šíření požáru v krajině: Byram (intenzita, délka plamene), Andersonova elipsa (tvar),
// Van Wagner (přechod do korun), časy příchodu na mřížce (Dijkstra, 16 sousedů).
import { FUELS } from './fuels.js';


/** Rychlost šíření hlavy požáru R = R0 (1 + a U^b) [m/s], U = vítr ve výšce středu plamene. ★★ (kalibrace řádově na Rothermelovy modely) */
export function headROS(fuel, U) {
  const f = FUELS[fuel];
  return f.R0 * (1 + f.wa * Math.pow(Math.max(U, 0), f.wb));
}

/** Byramova intenzita čela I = H w R [W/m]; délka plamene L = 0,0775 I^0,46 [m, I v kW/m]. ★★★★ */
export function byram(fuel, R) {
  const f = FUELS[fuel];
  const I = f.dHc * f.w * R;
  return { I, L: 0.0775 * Math.pow(I / 1000, 0.46) };
}

/**
 * Anderson (1983) ve tvaru FARSITE (Finney 1998): LB = 0,936 e^(0,2566 U) + 0,461 e^(−0,1548 U) − 0,397,
 * U = vítr ve středu plamene [m/s], strop LB ≤ 8. ★★★★
 */
export function lengthToBreadth(U) {
  return Math.min(8, Math.max(1, 0.936 * Math.exp(0.2566 * U) + 0.461 * Math.exp(-0.1548 * U) - 0.397));
}

/** Rychlost ve směru θ od směru větru (počátek v ohnisku elipsy): R(θ) = Rh (1−e)/(1−e cos θ). ★★★★ */
export function rosAt(Rh, LB, theta) {
  const e = Math.sqrt(Math.max(0, 1 - 1 / (LB * LB)));
  return (Rh * (1 - e)) / (1 - e * Math.cos(theta));
}

/** Van Wagner (1977): kritická intenzita přechodu do korun I0 = (0,010 CBH (460 + 25,9 FMC))^1,5 [kW/m]. ★★★ */
export function crownInitiation(CBH = 4, FMC = 100) { return Math.pow(0.01 * CBH * (460 + 25.9 * FMC), 1.5) * 1000; }

/**
 * Mapa časů příchodu ohně na mřížce nx × ny s krokem cell [m].
 * fuelMap: Float32Array hustoty paliva 0..1 (0 = nehořlavé), windDir [rad] (kam vítr fouká), U [m/s].
 * Vrací Float32Array časů [s] (Infinity = nedosaženo).
 */
export function arrivalTimes({ nx, ny, cell, fuel, fuelMap, ignitions, windDir, U, slopeFn = null }) {
  const Rh = headROS(fuel, U), LB = lengthToBreadth(U);
  const T = new Float32Array(nx * ny).fill(Infinity);
  // 16 sousedů (méně „čtverečkovaný" tvar)
  const N = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!dx && !dy) continue;
    if ((Math.abs(dx) === 2 || Math.abs(dy) === 2) && (Math.abs(dx) !== 1 && Math.abs(dy) !== 1)) continue;
    const d = Math.hypot(dx, dy) * cell, ang = Math.atan2(dy, dx);
    const R = rosAt(Rh, LB, ang - windDir);
    N.push({ dx, dy, d, R });
  }
  // binární halda
  const heap = [], hp = (i, t) => { heap.push([t, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (const [ix, iy, t0] of ignitions) { const i = iy * nx + ix; T[i] = t0 || 0; hp(i, T[i]); }
  while (heap.length) {
    const [t, i] = pop();
    if (t > T[i]) continue;
    const x = i % nx, y = (i / nx) | 0;
    for (const n of N) {
      const X = x + n.dx, Y = y + n.dy;
      if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue;
      const j = Y * nx + X, fm = fuelMap[j];
      if (fm <= 0.02) continue;
      let R = n.R * (0.35 + 0.65 * fm);
      if (slopeFn) R *= slopeFn(x, y, X, Y);
      const tj = t + n.d / R;
      if (tj < T[j]) { T[j] = tj; hp(j, tj); }
    }
  }
  return { T, Rh, LB };
}
