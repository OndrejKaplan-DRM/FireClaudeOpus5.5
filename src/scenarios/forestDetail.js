// Lesní požár zblízka (iterace 4): hořící kmeny u kamery a padající hořící větve z korun.
// Buňkový model šíření (spread.js) dává jen plošné zdroje 5 × 5 m; hráč v lese ale vidí jednotlivé stromy.
// Tady se k nejbližším hořícím stromům přidají malé zdroje na kmenech a z korun padají větve s vlastním plamenem.
// Vzhled podle záznamů lesních požárů (kůra borovice hoří pruhy po návětrné i závětrné straně, smola kape) – umělecké ★2,
// délka plamene na kmeni 2–5 m odpovídá „bark flame“ u přízemního požáru s I ~ 1–3 MW/m (Byram L = 0,0775 I^0,46) ★3.
import * as THREE from 'three';
import { makeMaterial } from '../assets/textures.js';
import { applyChar } from '../fx/char.js';
import { mulberry32 } from '../engine/rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function forestDetail(ctx, { flora, arr, fuel, seed = 1 }) {
  const tid = Math.min(ctx.tier.id, 5);
  const nTrunk = [2, 3, 5, 6, 8, 10][tid], nBranch = [0, 2, 3, 5, 6, 8][tid];
  const r = mulberry32(seed);
  const trunks = [];
  for (let i = 0; i < nTrunk; i++) {
    // attach: plamen přilne ke kmeni (náklon větrem jen 30 %), sedí na závětrné straně kůry
    const s = ctx.fx.addSource({ pos: V(0, 0, 0), fuel: 'woodResin', Q: 0, D: 0.38, footprint: { type: 'disk' }, volume: true, seed: 400 + i, taper: 1.15, attach: 1, mult: { smoke: 0.5, embers: 0.8, haze: 0.1, light: 0.7 } });
    s.enabled = false; trunks.push({ s, item: -1 });
  }
  // větve: válec s kůrou + zuhelnatění; plamen = malý zdroj (jen sprity) nesený s větví
  const bark = makeMaterial('bark');
  applyChar(bark, { scale: 6, alligator: [6, 10] }); const charU = bark.userData.char;
  const geo = new THREE.CylinderGeometry(0.02, 0.035, 1, 6, 1); geo.rotateZ(Math.PI / 2);
  const branches = [];
  for (let i = 0; i < nBranch; i++) {
    const mesh = new THREE.Mesh(geo, bark); mesh.visible = false; mesh.castShadow = true; ctx.add(mesh);
    const s = ctx.fx.addSource({ pos: V(0, 0, 0), fuel: 'woodResin', Q: 0, D: 0.3, footprint: { type: 'disk' }, volume: false, seed: 500 + i, mult: { smoke: 0.5, embers: 1.5, haze: 0, light: 0.5 } });
    s.enabled = false;
    branches.push({ mesh, s, on: false, p: V(0, 0, 0), v: V(0, 0, 0), w: V(0, 0, 0), len: 1, ground: false, tg: 0, life: 0 });
  }
  if (charU) { charU.uChar.value = 0.85; charU.uGlow.value = 0.7; }
  let lastScan = -1, cand = [], lastFx = ctx.fx.time, spawnAcc = 0;

  return {
    /** t = čas scénáře, crown = korunový režim, trBurn = doba hoření kmene [s scénáře] */
    update(t, crown) {
      const now = ctx.fx.time, dt = Math.min(0.1, now - lastFx); lastFx = now; // reálný čas (scénář běží × timeScale)
      const cp = ctx.camera.position, trB = fuel.tr * 1.3;
      // kandidáti: stromy v buňkách, které hoří nebo nedávno hořely, do 45 m od kamery (přepočet po 0,25 s)
      if (now - lastScan > 0.25 || lastScan < 0) {
        lastScan = now; cand = [];
        for (let i = 0; i < flora.items.length; i++) {
          const it = flora.items[i], ta = arr().T[it.cell];
          if (ta === Infinity || t < ta || t > ta + trB) continue;
          const d2 = (it.x - cp.x) ** 2 + (it.z - cp.z) ** 2;
          if (d2 < 45 * 45) cand.push({ i, d2, ta });
        }
        cand.sort((a, b) => a.d2 - b.d2);
      }
      for (let k = 0; k < trunks.length; k++) {
        const T = trunks[k], c = cand[k];
        if (!c) { T.s.enabled = false; continue; }
        const it = flora.items[c.i], age = (t - c.ta) / trB, env = Math.sin(Math.PI * Math.min(1, age)) ** 0.5;
        const sc = Math.min(1.4, it.s / 14);
        // závětrná strana kmene: osa ohně posunutá po větru o poloměr kmene (DBH ≈ 3 % výšky)
        const rt = 0.016 * it.s, wd = ctx.fx.air.dir;
        T.s.enabled = true; T.s.pos.set(it.x + Math.cos(wd) * rt * 0.9, 0.05, it.z + Math.sin(wd) * rt * 0.9);
        T.s.o.Q = 160e3 * env * sc; T.s.o.L = () => (1.6 + 3.6 * env) * sc;
      }
      // padající větve: z hořících stromů do 35 m; v korunovém režimu z korun (~0,35 s⁻¹), jinak suché spodní větve (~0,12 s⁻¹) ★1 umělecké
      if (branches.length) {
        spawnAcc += dt * (crown ? 0.35 : 0.12) * Math.min(1, cand.length / 4);
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          const b = branches.find((x) => !x.on), c = cand[Math.floor(r() * Math.min(cand.length, 8))];
          if (!b || !c || c.d2 > 35 * 35) break;
          const it = flora.items[c.i], a = r() * 6.283, rr = 0.8 + 1.6 * r();
          b.on = true; b.ground = false; b.tg = 0; b.len = 0.6 + 0.9 * r();
          b.p.set(it.x + Math.cos(a) * rr, it.s * (crown ? 0.5 + 0.3 * r() : 0.15 + 0.15 * r()), it.z + Math.sin(a) * rr);
          b.v.set(Math.cos(a) * 0.8, 0.5 * r(), Math.sin(a) * 0.8);
          b.w.set((r() - 0.5) * 6, (r() - 0.5) * 3, (r() - 0.5) * 6);
          b.mesh.scale.set(b.len, 1, 1); b.mesh.rotation.set(r() * 6, r() * 6, r() * 6); b.mesh.visible = true;
          b.life = 14 + 10 * r(); b.s.enabled = true;
        }
      }
      for (const b of branches) {
        if (!b.on) continue;
        if (!b.ground) {
          // pád: odpor zanedbatelný (kus dřeva ~1 kg), rotace se zpomaluje
          b.v.y -= 9.81 * dt; b.p.addScaledVector(b.v, dt);
          b.mesh.rotation.x += b.w.x * dt; b.mesh.rotation.y += b.w.y * dt; b.mesh.rotation.z += b.w.z * dt;
          if (b.p.y <= 0.06) {
            b.p.y = 0.06; b.ground = true; b.mesh.rotation.set(0, b.mesh.rotation.y, 0);
            b.s.brandBurst(6, 0.7, [b.p.x, 0.05, b.p.z]); // dopad: odlétající uhlíky a hořící drobky
          }
        } else b.tg += dt;
        b.mesh.position.copy(b.p);
        const left = 1 - b.tg / b.life;
        if (left <= 0) { b.on = false; b.mesh.visible = false; b.s.enabled = false; continue; }
        b.s.pos.set(b.p.x, b.p.y - 0.05, b.p.z);
        b.s.o.Q = 45e3 * b.len * (b.ground ? Math.max(0.15, left) : 1); b.s.o.L = () => (b.ground ? 0.6 : 1.0) * b.len * (0.4 + 0.6 * left);
      }
    },
    dispose() { geo.dispose(); },
  };
}
