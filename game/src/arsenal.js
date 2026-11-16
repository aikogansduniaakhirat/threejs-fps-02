// The arsenal: four weapons and a frag grenade, each with its own numbers in one table, and a
// view model built from boxes. main.js owns the ray and the damage; this module owns the state
// of what is in the player's hands: the magazine, the reload, the spread, the recoil, the
// fire rate, and the switch between them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    name: 'MK9 SIDEARM',
    slot: 1,
    price: 0,
    damage: 26,
    headMultiplier: 3.2,
    magSize: 12,
    reserve: 60,
    fireGap: 0.16,
    reloadTime: 1.5,
    spreadStill: 0.0034,
    spreadMoving: 0.032,
    spreadPerShot: 0.009,
    spreadRecover: 0.10,
    recoilPitch: 0.016,
    recoilYaw: 0.005,
    range: 60,
    auto: false,
    pellets: 1,
    model: { length: 0.26, height: 0.16, tint: 'gunmetal' },
  },
  smg: {
    name: 'VESPER SMG',
    slot: 2,
    price: 1250,
    damage: 21,
    headMultiplier: 2.6,
    magSize: 30,
    reserve: 120,
    fireGap: 0.078,
    reloadTime: 1.9,
    spreadStill: 0.0062,
    spreadMoving: 0.040,
    spreadPerShot: 0.0062,
    spreadRecover: 0.075,
    recoilPitch: 0.0095,
    recoilYaw: 0.0048,
    range: 50,
    auto: true,
    pellets: 1,
    model: { length: 0.46, height: 0.16, tint: 'gunBody' },
  },
  rifle: {
    name: 'KILN AR',
    slot: 3,
    price: 2700,
    damage: 33,
    headMultiplier: 4.0,
    magSize: 30,
    reserve: 90,
    fireGap: 0.098,
    reloadTime: 2.2,
    spreadStill: 0.0022,
    spreadMoving: 0.038,
    spreadPerShot: 0.0072,
    spreadRecover: 0.085,
    recoilPitch: 0.0135,
    recoilYaw: 0.0042,
    range: 90,
    auto: true,
    pellets: 1,
    model: { length: 0.58, height: 0.17, tint: 'gunBody' },
  },
  shotgun: {
    name: 'FOUNDRY 12',
    slot: 4,
    price: 1800,
    damage: 15,
    headMultiplier: 2.0,
    magSize: 7,
    reserve: 28,
    fireGap: 0.72,
    reloadTime: 2.9,
    spreadStill: 0.030,
    spreadMoving: 0.048,
    spreadPerShot: 0.004,
    spreadRecover: 0.2,
    recoilPitch: 0.036,
    recoilYaw: 0.012,
    range: 30,
    auto: false,
    pellets: 8,
    model: { length: 0.62, height: 0.18, tint: 'gunWood' },
  },
};

const MAX_GRENADES = 2;
const GRENADE_PRICE = 300;

export function createArsenal(camera) {
  const root = new THREE.Group();
  camera.add(root);

  const materials = {
    metal: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4d545c'), roughness: 0.42, metalness: 0.75 }),
    brickDark: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2f28'), roughness: 0.85 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember) }),
    gunmetal: new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f353c'), roughness: 0.5, metalness: 0.6 }),
    gunBody: new THREE.MeshStandardMaterial({ color: new THREE.Color('#5c6169'), roughness: 0.62, metalness: 0.35 }),
    gunWood: new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a4030'), roughness: 0.78, metalness: 0.05 }),
  };

  const flashMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.glow), transparent: true, opacity: 0.92,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMaterial);
  flash.visible = false;
  root.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 7, 2);
  root.add(flashLight);

  // The view model lives on the camera, so it answers to its own key light: a hard warm light
  // from up and left that gives the gun an edge, plus a cool fill so its shadow side never goes
  // to black. Without this the model reads as a flat pasted-on slab.
  const viewKey = new THREE.DirectionalLight(new THREE.Color('#ffe2c2'), 1.15);
  viewKey.position.set(-0.7, 1.1, 0.5);
  camera.add(viewKey);
  viewKey.target.position.set(0, -0.3, -1);
  camera.add(viewKey.target);
  const viewFill = new THREE.DirectionalLight(new THREE.Color('#7fa8c9'), 0.55);
  viewFill.position.set(0.9, -0.4, 0.7);
  camera.add(viewFill);

  const models = {};
  for (const [id, spec] of Object.entries(WEAPONS)) {
    const model = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, spec.model.height * 0.34, spec.model.length * 0.82), materials[spec.model.tint]);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, spec.model.length * 0.38), materials.metal);
    barrel.position.set(0, 0.008, -spec.model.length * 0.58);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, spec.model.height * 0.26, spec.model.length * 0.34), materials.brickDark);
    stock.position.set(0, -0.011, spec.model.length * 0.34);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.085, 0.045), materials.brickDark);
    grip.position.set(0, -0.075, 0.05);
    grip.rotation.x = -0.22;
    model.add(body, barrel, stock, grip);
    if (id === 'rifle' || id === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.04), materials.metal);
      mag.position.set(0, -0.072, -0.032);
      mag.rotation.x = 0.12;
      model.add(mag);
    }
    if (id === 'rifle' || id === 'smg' || id === 'pistol') {
      // A sight rail: a small dark block on top, which is the visual cue the barrel is aimed.
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.05), materials.metal);
      sight.position.set(0, spec.model.height * 0.19, 0.02);
      model.add(sight);
    }
    model.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = false; } });
    model.visible = false;
    root.add(model);
    models[id] = model;
  }

  const state = {
    current: 'pistol',
    owned: { pistol: true, smg: false, rifle: false, shotgun: false },
    mag: WEAPONS.pistol.magSize,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    spread: WEAPONS.pistol.spreadStill,
    bloom: 0,
    kick: 0,
    flashTimer: 0,
    grenades: 0,
    switching: 0,
    pendingSwitch: null,
  };

  function spec() {
    return WEAPONS[state.current];
  }

  function equip(id, instant = false) {
    if (!state.owned[id] || id === state.current) return false;
    state.pendingSwitch = id;
    state.switching = instant ? 0 : 0.28;
    if (instant) applySwitch();
    return true;
  }

  function applySwitch() {
    const id = state.pendingSwitch;
    if (!id) return;
    state.current = id;
    state.mag = Math.min(WEAPONS[id].magSize, state.mag > 0 ? WEAPONS[id].magSize : WEAPONS[id].magSize);
    state.reserve = WEAPONS[id].reserve;
    state.reloadLeft = 0;
    state.cooldown = 0.12;
    state.pendingSwitch = null;
    for (const key of Object.keys(models)) models[key].visible = key === id;
  }

  const basePosition = new THREE.Vector3(0.255, -0.30, -0.62);
  root.scale.setScalar(0.82);

  function step(dt, speed) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flashTimer = Math.max(0, state.flashTimer - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 15);
    state.bloom = Math.max(0, state.bloom - spec().spreadRecover * dt);

    if (state.switching > 0) {
      state.switching = Math.max(0, state.switching - dt);
      if (state.switching === 0) applySwitch();
    }

    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const total = spec().reloadTime;
      const progress = 1 - state.reloadLeft / total;
      const model = models[state.current];
      model.rotation.x = -0.72 * Math.sin(Math.PI * Math.min(1, progress));
      model.position.y = basePosition.y - 0.13 * Math.sin(Math.PI * Math.min(1, progress));
      if (state.reloadLeft === 0) {
        const need = spec().magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
        model.rotation.x = 0;
        model.position.y = basePosition.y;
      }
    } else {
      const model = models[state.current];
      const sway = Math.min(1, speed / 5.2);
      const bob = Math.sin(performance.now() * 0.008) * 0.005 * sway;
      model.position.set(basePosition.x + bob, basePosition.y + Math.abs(bob) * 0.6 - state.switching * 0.2, basePosition.z + state.kick * 0.6);
      model.rotation.x = state.kick * 2.4;
      model.rotation.z = -bob * 0.8;
    }

    flash.visible = state.flashTimer > 0;
    if (flash.visible) {
      flash.position.set(basePosition.x, basePosition.y + 0.03, basePosition.z - spec().model.length * 0.72);
      flash.rotation.z = state.flashTimer * 42;
      flash.scale.setScalar(0.7 + state.flashTimer * 5);
      flashLight.intensity = 20;
      flashLight.position.copy(flash.position);
    } else {
      flashLight.intensity = 0;
    }
  }

  return {
    state,
    spec,
    step,
    models,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switching === 0;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    pullTrigger(speed) {
      const s = spec();
      state.cooldown = s.fireGap;
      state.flashTimer = 0.055;
      state.kick = 0.06 + s.recoilPitch * 1.5;
      state.bloom = Math.min(0.06, state.bloom + s.spreadPerShot);
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === spec().magSize || state.reserve === 0) return false;
      state.reloadLeft = spec().reloadTime;
      return true;
    },
    spread(speed) {
      const s = spec();
      return s.spreadStill + Math.min(1, speed / 5.2) * s.spreadMoving + state.bloom;
    },
    equip,
    cycle(direction = 1) {
      const available = Object.keys(WEAPONS).filter((id) => state.owned[id]).sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot);
      if (available.length < 2) return;
      const at = available.indexOf(state.current);
      const next = available[(at + direction + available.length) % available.length];
      equip(next);
    },
    buy(id) {
      if (!WEAPONS[id]) return false;
      if (state.owned[id]) return false;
      state.owned[id] = true;
      state.mag = WEAPONS[id].magSize;
      state.reserve = WEAPONS[id].reserve;
      equip(id, true);
      return true;
    },
    buyGrenade() {
      if (state.grenades >= MAX_GRENADES) return false;
      state.grenades += 1;
      return true;
    },
    useGrenade() {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      return true;
    },
    refill() {
      state.mag = spec().magSize;
      state.reserve = spec().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.bloom = 0;
      state.kick = 0;
      state.flashTimer = 0;
      state.grenades = 0;
      for (const id of Object.keys(state.owned)) state.owned[id] = id === 'pistol';
      state.current = 'pistol';
      for (const key of Object.keys(models)) models[key].visible = key === 'pistol';
    },
  };
}

export const GRENADE = { price: GRENADE_PRICE, max: MAX_GRENADES, damage: 62, radius: 5.4, fuse: 2.1 };
