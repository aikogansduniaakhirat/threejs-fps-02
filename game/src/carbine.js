// The carbine: magazine, cadence, recoil, and the viewmodel that sits in the corner of the frame.
// The viewmodel is a child of the camera, so it inherits the look without any extra bookkeeping.

import * as THREE from 'three';
import { PALETTE, WEAPONS } from './config.js';

export function createCarbine(camera) {
  const spec = WEAPONS.carbine;

  const rig = new THREE.Group();
  camera.add(rig);

  const metal = new THREE.MeshStandardMaterial({ color: '#6b7480', roughness: 0.42, metalness: 0.55 });
  const polymer = new THREE.MeshStandardMaterial({ color: '#454d58', roughness: 0.78 });
  const heat = new THREE.MeshStandardMaterial({
    color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.9, roughness: 0.6,
  });

  // ---- the viewmodel: receiver, barrel, stock, grip, magazine, and a front sight ----
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.10, 0.42), metal);
  receiver.position.set(0, 0, -0.05);
  rig.add(receiver);

  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.075, 0.30), polymer);
  handguard.position.set(0, -0.004, -0.36);
  rig.add(handguard);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.26, 10), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.56);
  rig.add(barrel);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.055, 10), heat);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.012, -0.70);
  rig.add(muzzle);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.085, 0.22), polymer);
  stock.position.set(0, -0.012, 0.24);
  rig.add(stock);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.06), polymer);
  grip.position.set(0, -0.10, 0.06);
  grip.rotation.x = -0.16;
  rig.add(grip);

  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.075), metal);
  magazine.position.set(0, -0.11, -0.13);
  magazine.rotation.x = 0.1;
  rig.add(magazine);

  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.014), metal);
  frontSight.position.set(0, 0.062, -0.45);
  rig.add(frontSight);

  // The rest pose: low right, angled in, so it reads as held rather than pasted on the screen.
  // Kept small on purpose: the viewmodel frames the shot, it must not own the frame.
  const REST = { x: 0.155, y: -0.135, z: -0.215 };
  rig.position.set(REST.x, REST.y, REST.z);
  rig.rotation.set(0, -0.05, 0);
  rig.scale.setScalar(0.72);

  const flash = new THREE.PointLight('#ffb066', 0, 6, 2);
  flash.position.set(0, 0.02, -0.74);
  rig.add(flash);

  const state = {
    magazine: spec.magazine,
    reserve: spec.reserve,
    maxMagazine: spec.magazine,
    reloading: false,
    reloadLeft: 0,
    cooldown: 0,
    kick: 0,        // recoil in the current frame, decays
    shake: 0,       // viewmodel displacement, decays
    flashLeft: 0,
    shotsFired: 0,
    emptyClick: 0,
  };

  // The muzzle's world position, which is where a tracer starts.
  const muzzleWorld = new THREE.Vector3();

  function canFire() {
    return !state.reloading && state.cooldown <= 0 && state.magazine > 0;
  }

  // Pull the trigger. Returns the number of shots this call produced: at most one per frame,
  // which is enough at 640 rpm and keeps the hit test one ray per frame.
  function fire() {
    if (state.reloading) return 0;
    if (state.magazine <= 0) {
      if (state.emptyClick <= 0) {
        state.emptyClick = 0.25;
        beginReload();
      }
      return 0;
    }
    if (state.cooldown > 0) return 0;

    state.magazine -= 1;
    state.shotsFired += 1;
    state.cooldown = 60 / spec.rpm;
    state.kick = Math.min(0.5, state.kick + spec.recoil);
    state.shake = 1;
    state.flashLeft = 0.045;
    flash.intensity = 9;
    return 1;
  }

  function beginReload() {
    if (state.reloading || state.magazine === state.maxMagazine || state.reserve <= 0) return false;
    state.reloading = true;
    state.reloadLeft = spec.reloadTime;
    return true;
  }

  // Advance timers and move the viewmodel toward where the moment says it should be.
  function step(dt, moving, sprinting) {
    if (state.cooldown > 0) state.cooldown -= dt;
    if (state.emptyClick > 0) state.emptyClick -= dt;
    if (state.flashLeft > 0) {
      state.flashLeft -= dt;
      if (state.flashLeft <= 0) flash.intensity = 0;
    }

    if (state.reloading) {
      state.reloadLeft -= dt;
      if (state.reloadLeft <= 0) {
        const needed = state.maxMagazine - state.magazine;
        const taken = Math.min(needed, state.reserve);
        state.magazine += taken;
        state.reserve -= taken;
        state.reloading = false;
      }
    }

    state.kick *= Math.max(0, 1 - 9 * dt);
    state.shake *= Math.max(0, 1 - 7 * dt);

    // Idle sway: a slow figure-eight while standing, a wider bob while moving. Sprinting drops
    // the weapon down and out of the way, which also signals the state to the player.
    const time = performance.now() * 0.001;
    const bobAmount = sprinting ? 0.024 : moving ? 0.012 : 0.0035;
    const bobSpeed = sprinting ? 11.5 : moving ? 8.2 : 1.9;
    const bobX = Math.cos(time * bobSpeed) * bobAmount;
    const bobY = Math.abs(Math.sin(time * bobSpeed * 0.5)) * bobAmount * 0.9;

    const lower = sprinting ? 0.075 : 0;
    const reloadDip = state.reloading
      ? Math.sin(Math.min(1, (spec.reloadTime - state.reloadLeft) / spec.reloadTime) * Math.PI) * 0.16
      : 0;

    rig.position.x = REST.x + bobX - state.shake * 0.012;
    rig.position.y = REST.y + bobY - lower - reloadDip + state.shake * 0.008;
    rig.position.z = REST.z + state.kick * 0.055;
    rig.rotation.x = state.kick * 0.9 + reloadDip * 1.6;
    rig.rotation.z = -state.shake * 0.02 + bobX * 0.35;
  }

  function worldMuzzle() {
    rig.updateWorldMatrix(true, false);
    muzzle.getWorldPosition(muzzleWorld);
    return muzzleWorld;
  }

  function ratio() {
    return state.magazine / state.maxMagazine;
  }

  return { state, spec, fire, beginReload, step, worldMuzzle, canFire, ratio, rig };
}
