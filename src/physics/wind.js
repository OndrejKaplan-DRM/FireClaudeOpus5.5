// Vítr: třídy, profil, náklon plamene.
import { AMB } from './combustion.js';

// Rychlosti v 10 m (Beaufort, střed třídy). ★★★★★
export const WIND_CLASSES = [
  { id: 0, name: 'bezvětří', bft: 0, U10: 0.0, gust: 0.0, turb: 0.0 },
  { id: 1, name: 'vánek', bft: 2, U10: 2.5, gust: 0.3, turb: 0.25 },
  { id: 2, name: 'vítr', bft: 5, U10: 9.0, gust: 0.35, turb: 0.2 },
  { id: 3, name: 'vichr', bft: 8, U10: 19.0, gust: 0.45, turb: 0.18 },
];

/** Logaritmický profil větru U(z) = U10 ln(z/z0)/ln(10/z0), drsnost z0 [m] (0,03 louka, 1 les). ★★★★ */
export function windAt(U10, z, z0 = 0.03) {
  if (U10 <= 0) return 0;
  return (U10 * Math.log(Math.max(z, z0 * 1.5) / z0)) / Math.log(10 / z0);
}

/**
 * Náklon plamene od svislice — AGA (1974): cos θ = 1 pro u* ≤ 1, cos θ = 1/√u* jinak.
 * u* = U / u_c, u_c = (g Q / (ρ cp T∞ D))^(1/3) (zobecnění pro nelouže; pro louže ≡ (g m'' D/ρa)^(1/3) až na konstantu). ★★★★
 * Prodloužení paty plamene po větru (flame drag) — Welker & Sliepcevich D'/D ≈ 1,5 Fr^0,069, zjednodušeno. ★★
 */
export function flameTilt(U, Q, D) {
  const uc = Math.pow((AMB.g * Q) / (AMB.rho * AMB.cp * AMB.T * Math.max(D, 0.01)), 1 / 3);
  const us = U / Math.max(uc, 1e-3);
  const cosT = us <= 1 ? 1 : 1 / Math.sqrt(us);
  const theta = Math.acos(Math.min(1, cosT));
  const drag = 1 + Math.min(1.2, Math.max(0, 0.25 * (us - 1)));
  return { theta, us, uc, drag };
}
