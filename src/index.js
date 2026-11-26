// Veřejné API knihovny FireLab pro použití v jiném projektu na Three.js (ESM, three jako externí závislost).
//
//   import * as THREE from 'three';
//   import { FXWorld, Pipeline, TIERS, PRE } from 'firelab';
//   const pipeline = new Pipeline(renderer, TIERS[2]);
//   const fx = new FXWorld(renderer, scene, TIERS[2], pipeline);
//   fx.setWind(1, 0); fx.setOxygen(1);
//   fx.addSource({ pos: new THREE.Vector3(0, 0, 0), fuel: 'woodDry', Q: 2e5, D: 0.8 });
//   každý snímek: fx.scnTime += dt; fx.update(dt, camera); PRE.value = expozice; fx.lights.applyPre(); pipeline.render(scene, camera, dt, t);
export { FXWorld, FireSource, Explosion, FLAME_LUM } from './fx/world.js';
export { BillboardSystem, SparkSystem, HazeSystem, AirField, PTYPE } from './fx/particles.js';
export { FlameVolume, VOLUME_FIELDS, VOLUME_FS } from './fx/volume.js';
export { bakeAtlas, atlasToCanvas } from './fx/bake.js';
export { applyChar } from './fx/char.js';
export { FireLights } from './fx/lights.js';
export { Debris } from './fx/debris.js';
export { Scorch } from './fx/decal.js';
export { PRE, FLAMEK, GLSL_COMMON, sharedUniforms, noiseTexture, bbTexture } from './fx/shared.js';
export { Pipeline, LAYER_FX, LAYER_HAZE } from './engine/pipeline.js';
export { TIERS, guessTier } from './engine/tiers.js';
export { Environment, TIMES } from './engine/env.js';
export { ASSETS, assetById } from './assets/index.js';
export { SCENARIOS, scenarioById } from './scenarios/index.js';
export * as physics from './physics/index.js';
