// Jádro prohlížeče: renderer, scéna, kamera, načítání scénářů a assetů, smyčka, měření, testovací API.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TIERS, guessTier } from './tiers.js';
import { Pipeline } from './pipeline.js';
import { Environment } from './env.js';
import { FXWorld, FLAME_LUM } from '../fx/world.js';
import { PRE, noiseTexture } from '../fx/shared.js';
import { SCENARIOS, scenarioById } from '../scenarios/index.js';
import { ASSETS, assetById } from '../assets/index.js';
import { tris } from '../assets/geo.js';
import { setTextureSize } from '../assets/textures.js';
import { fbm1 } from './rng.js';
import { FireAudio } from '../audio/fireAudio.js';

export class App {
  constructor(canvas, q = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!q.preserve });
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const g = guessTier(this.renderer);
    this.gpu = g.gpu; this.autoTier = g.tier;
    this.tierId = q.tier != null ? +q.tier : g.tier;
    this.tier = TIERS[this.tierId];
    this.renderer.shadowMap.enabled = this.tier.shadows;
    setTextureSize(this.tier.id >= 4 ? 1024 : this.tier.id >= 2 ? 512 : 256);
    noiseTexture();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.01, 4000);
    this.camera.position.set(3, 2, 4);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.pipeline = new Pipeline(this.renderer, this.tier);
    this.env = new Environment(this.scene);
    this.fx = new FXWorld(this.renderer, this.scene, this.tier, this.pipeline);
    this.audio = new FireAudio();
    this.fx.env = this.env;
    this.objects = []; this.disposables = []; this.flora = [];
    this.timeScale = 1; this.paused = false; this.t = 0; this.wind = 0; this.windDir = 0; this.o2 = 1;
    this.flameKey = 140; // γ 0,45 v plameni: chladnější místa tmavší, klíč vyrovná střed (iterace 4) this.lodOverride = null; this.wire = false;
    this.controlsVals = {};
    this.mode = 'scenario';
    this.frameMs = 16; this.cpuMs = 0; this._fpsAcc = []; this.shakeN = fbm1(3);
    this.onMessage = () => {}; this.onScenario = () => {};
    this.clock = { last: performance.now(), getDelta() { const n = performance.now(), d = (n - this.last) / 1000; this.last = n; return d; } };
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get lod() { return this.lodOverride ?? this.tier.lod; }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(320, r.width | 0), h = Math.max(200, r.height | 0);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.pipeline.resize(w, h);
  }

  setTier(id) {
    this.tierId = id; this.tier = TIERS[id];
    this.renderer.shadowMap.enabled = this.tier.shadows;
    setTextureSize(this.tier.id >= 4 ? 1024 : this.tier.id >= 2 ? 512 : 256);
    this.pipeline.setTier(this.tier);
    this.resize();
    this.fx.pipeline = this.pipeline;
    this.fx.setTier(this.tier);
    this.renderer.compile(this.scene, this.camera);
    if (this.mode === 'asset') this.loadAsset(this.assetId); else this.loadScenario(this.scnId, { keepCamera: true });
  }

  clearScene() {
    this.fx.clear();
    for (const o of this.objects) { this.scene.remove(o); o.traverse((c) => { if (c.isMesh) { c.geometry.dispose(); } }); }
    for (const d of this.disposables) d.dispose();
    this.objects = []; this.disposables = []; this.flora = [];
  }

  ctx() {
    const app = this;
    return {
      scene: this.scene, fx: this.fx, env: this.env, tier: this.tier, lod: this.lod, camera: this.camera, flora: this.flora,
      controls: this.controlsVals,
      get t() { return app.t; },
      add: (o) => { this.scene.add(o); this.objects.push(o); o.traverse((c) => { if (c.isMesh) { c.castShadow = c.castShadow && this.tier.shadows; c.receiveShadow = true; } }); return o; },
      addDisposable: (d) => this.disposables.push(d),
      message: (m) => this.onMessage(m),
      setTimeScale: (k) => { this.timeScale = k; }, // scénář může za běhu změnit zrychlení (dlouhý ohřev → výbuch v reálném čase)
    };
  }

  loadScenario(id, { keepCamera = false } = {}) {
    this.audio?.clear();
    const s = scenarioById(id) || SCENARIOS[0];
    this.mode = 'scenario'; this.scnId = s.id; this.scn = s;
    this.clearScene(); this.pipeline.resetHistory();
    this.env.setGround(s.ground || 'dirt', s.groundSize || 800);
    this.env.setTime(this.timeOverride || s.time || 'soumrak');
    this.env.ground.visible = true;
    for (const c of s.controls || []) if (!(c.id in this.controlsVals) || this._lastScn !== s.id) this.controlsVals[c.id] = c.value;
    this._lastScn = s.id;
    if (s.wind != null && this._lastWindScn !== s.id) { this.wind = s.wind; this._windFromScn = true; }
    else if (s.wind == null && this._windFromScn) { this.wind = 0; this._windFromScn = false; }
    this._lastWindScn = s.id;
    this.fx.setWind(this.wind, this.windDir); this.fx.setOxygen(this.o2);
    this.fx.scnTime = 0; this.t = 0;
    this.timeScale = s.timeScale || 1;
    this.run = s.build(this.ctx());
    if (s.startT) { this.t = s.startT; this.fx.scnTime = s.startT; this.run.update?.(0, this.t); }
    if (!keepCamera) this.setCam(0);
    this.applyWire();
    this.onScenario(s);
  }

  loadAsset(id, { lod = null } = {}) {
    const a = assetById(id) || ASSETS[0];
    this.mode = 'asset'; this.assetId = a.id;
    this.clearScene();
    this.env.setTime(this.timeOverride || 'den');
    this.env.setGround('concrete', 200);
    const L = lod ?? this.lod;
    const t0 = performance.now();
    const obj = a.build({ lod: L, seed: 1 });
    this.assetBuildMs = performance.now() - t0;
    this.ctx().add(obj);
    this.assetObj = obj; this.assetTris = tris(obj);
    const box = new THREE.Box3().setFromObject(obj), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    this.assetSize = sz;
    const d = Math.max(sz.x, sz.y, sz.z) * 1.6 + 0.05;
    this.camera.position.set(c.x + d * 0.8, c.y + d * 0.45, c.z + d * 0.9); this.controls.target.copy(c); this.controls.update();
    this.run = null; this.scn = null;
    this.applyWire();
    this.onScenario(null);
  }

  setCam(i) {
    const s = this.scn; if (!s) return;
    const c = (s.cams || [])[i] || s.cams?.[0]; if (!c) return;
    this.camera.position.set(...c.pos); this.controls.target.set(...c.target); this.controls.update();
    this.camIndex = i;
  }

  setWind(cls) { this.wind = cls; this._windFromScn = false; this.fx.setWind(cls, this.windDir); }
  setWindDir(rad) { this.windDir = rad; this.fx.setWind(this.wind, rad); }
  setO2(v) { this.o2 = v; this.fx.setOxygen(v); }
  applyWire() { this.scene.traverse((o) => { if (o.isMesh && o.material && !o.material.isShaderMaterial) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if ('wireframe' in m) m.wireframe = this.wire; }); }); }

  /** Krok simulace (bez kreslení). dtVis = reálný čas efektů, scénář běží × timeScale. */
  step(dtVis) {
    const dtS = dtVis * this.timeScale;
    if (this.run) {
      this.t += dtS; this.fx.scnTime = this.t;
      const s = this.scn;
      if (s.duration && this.t > s.duration) {
        if (s.loop) { this.loadScenario(s.id, { keepCamera: true }); return; }
        this.t = s.duration; this.fx.scnTime = this.t;
      }
      this.run.update?.(dtS, this.t);
    }
    this.fx.update(dtVis, this.camera);
    this.audio.update(this.fx, this.camera); // zvuk (jen po zapnutí gestem uživatele)
    for (const f of this.flora) if (f !== this.run?.flora) f.update?.(this.camera, this.fx.time);
  }

  /** Auto-expozice: metrika osvětlení v cíli kamery + jas oblohy (logaritmicky vážené). */
  updateExposure() {
    // měření jako oko: osvětlení v místě pozorovatele a v půli cesty k cíli (ne v ohni samotném)
    const c = this.camera.position, tgt = this.controls.target;
    const mid = c.clone().lerp(tgt, 0.5);
    const E = this.env.ambientE + (this.fx.lights.illuminanceAt(c) + this.fx.lights.illuminanceAt(mid) + 0.08 * this.fx.lights.illuminanceAt(tgt)) / 2.08;
    const Ls = (0.25 / Math.PI) * E;
    const Lavg = Math.exp(0.75 * Math.log(Math.max(Ls, 1e-5)) + 0.25 * Math.log(Math.max(this.env.skyL, 1e-5)));
    this.pipeline.targetExposure = Math.min(50, Math.max(2e-6, (0.25 / Lavg) * (this.expBias || 1)));
    // lokální adaptace na plamen jen částečná (β = 0,4): velký požár v záběru stáhne i adaptaci oka (Hood & Finkelstein,
    // částečná adaptace ~ L^0,4 v mezopickém rozsahu ★3) → velké plameny oranžově žluté, ne bílé; svíčka beze změny
    const ex = Math.max(this.pipeline.exposure, 1e-9);
    // strop jasu: ve dne (malá expozice) až 6,5× FLAME_LUM – na denních fotkách jsou sazové plameny jasně oranžové až žluté
    // i vedle osluněné země (svítivé víry 1 500–1 650 K ≈ 6–25 tis. cd/m²; se stropem 20 tis. při 1 500 K vycházel plamen
    // ve dne tmavě hnědočervený). V noci a za soumraku se strop neuplatní (umělecké ★2 podle fotek, D-039).
    const cap = FLAME_LUM * (1 + 5.5 * Math.min(1, Math.max(0, (Math.log10(1 / ex) - 3.3) / 0.9)));
    this.fx.flameLum = Math.min(cap, (this.flameKey / ex) * Math.min(1.3, Math.max(0.1, Math.pow(ex / 0.25, 0.4))));
    this.fx.lumRef = Math.min(12000, 16 / ex);
    PRE.value = this.pipeline.exposure;
  }

  renderFrame(dtVis) {
    const r = this.renderer;
    r.info.reset();
    this.controls.update();
    // otřes kamery od rázové vlny
    const sh = this.fx.shake, tt = this.fx.time;
    const off = new THREE.Vector3(this.shakeN(tt * 18) * sh, this.shakeN(tt * 21 + 5) * sh * 0.6, this.shakeN(tt * 16 + 9) * sh).multiplyScalar(0.25);
    this.camera.position.add(off);
    PRE.value = this.pipeline.exposure;
    this.env.update(PRE.value);
    this.fx.lights.applyPre(this.fx.layers.light);
    this.pipeline.render(this.scene, this.camera, dtVis, this.fx.time);
    this.camera.position.sub(off);
  }

  loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const t0 = performance.now();
      if (!this.paused) this.step(dt);
      this.updateExposure();
      this.renderFrame(dt);
      this.cpuMs = this.cpuMs * 0.9 + (performance.now() - t0) * 0.1;
      this.frameMs = this.frameMs * 0.92 + dt * 1000 * 0.08;
    };
    tick();
  }

  stats() {
    const i = this.renderer.info, fx = this.fx.stats();
    let sceneTris = 0; for (const o of this.objects) sceneTris += tris(o);
    for (const f of this.flora) sceneTris += f.tris();
    const ps = this.pipeline.size;
    const rtMB = ((ps.W * ps.H * (8 + 4)) + (this.pipeline.depth ? ps.W * ps.H * 16 : 0) + (this.pipeline.haze ? ps.W * ps.H * 2 : 0)) / 1048576;
    const atlas = this.fx.atlasRT; const atlasMB = (atlas.width * atlas.height * 4 * 1.33) / 1048576;
    return {
      fps: 1000 / this.frameMs, frameMs: this.frameMs, cpuMs: this.cpuMs, calls: i.render.calls, gpuTris: i.render.triangles,
      sceneTris, ...fx, passes: this.pipeline.stats.passes, exposure: this.pipeline.exposure, flameLum: this.fx.flameLum,
      res: `${ps.W}×${ps.H}`, rtMB, atlasMB, noiseMB: 1.0, textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length,
      bakeMs: atlas.texture.userData.bakeMs,
    };
  }
}
