// The player: acceleration, friction, gravity, crouch, the eye that lowers when crouching, and
// a box swept one axis at a time against the map's colliders so a wall never swallows a
// defender. Nothing here draws; main.js reads state and places the camera.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.78;
const CROUCH_HEIGHT = 1.14;
const STAND_EYE = 1.64;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.2;
const GROUND_ACCEL = 46;
const AIR_ACCEL = 8;
const FRICTION = 10;
const GRAVITY = 21;
const JUMP_SPEED = 6.4;
const LAND_DIP = 0.055;

export function createPlayer(colliders, spawn) {
  const state = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    bob: 0,
    landTimer: 0,
    speed: 0,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // lift raises the probe a touch so standing on the floor is not read as walking into a wall.
  function blockingAt(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0021) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.5, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys) {
    const wantsCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantsCrouch && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!wantsCrouch && state.crouching
      && !blockingAt(state.position.x, state.position.y, state.position.z, STAND_HEIGHT, 0.02)) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 13);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe);
      if (wish.lengthSq() > 0) wish.normalize();
    }

    const maxSpeed = state.crouching ? CROUCH_SPEED : WALK_SPEED;
    const accel = state.onGround ? GROUND_ACCEL : AIR_ACCEL;
    const blend = Math.min(1, accel * dt / maxSpeed);
    state.velocity.x += (wish.x * maxSpeed - state.velocity.x) * blend;
    state.velocity.z += (wish.z * maxSpeed - state.velocity.z) * blend;

    if (state.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
      if (Math.abs(state.velocity.x) < 0.02) state.velocity.x = 0;
      if (Math.abs(state.velocity.z) < 0.02) state.velocity.z = 0;
    }

    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;

    const nextX = state.position.x + state.velocity.x * dt;
    if (!blockingAt(nextX, state.position.y, state.position.z, state.height, 0.06)) state.position.x = nextX;
    else state.velocity.x = 0;

    const nextZ = state.position.z + state.velocity.z * dt;
    if (!blockingAt(state.position.x, state.position.y, nextZ, state.height, 0.06)) state.position.z = nextZ;
    else state.velocity.z = 0;

    const wasAirborne = !state.onGround;
    const fallSpeed = state.velocity.y;
    state.position.y += state.velocity.y * dt;
    state.onGround = false;
    const hit = blockingAt(state.position.x, state.position.y, state.position.z, state.height, 0);
    if (hit && state.velocity.y <= 0) {
      state.position.y = hit.max.y;
      state.velocity.y = 0;
      state.onGround = true;
      if (wasAirborne && fallSpeed < -6) state.landTimer = LAND_DIP;
    } else if (hit) {
      state.position.y = hit.min.y - state.height;
      state.velocity.y = 0;
    }
    if (state.position.y < 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }
    state.velocity.y = Math.max(-34, state.velocity.y);
    state.landTimer = Math.max(0, state.landTimer - dt);

    state.speed = Math.hypot(state.velocity.x, state.velocity.z);
    if (state.onGround) state.bob += state.speed * dt * 2.4;
  }

  return {
    state,
    step,
    look,
    recoil,
    speed() {
      return state.speed;
    },
    aimPoint(target) {
      return new THREE.Vector3(state.position.x, state.position.y + state.eye, state.position.z);
    },
    reset(spawnPoint) {
      state.position.set(spawnPoint.x, 0, spawnPoint.z);
      state.velocity.set(0, 0, 0);
      state.yaw = spawnPoint.yaw ?? 0;
      state.pitch = 0;
      state.eye = STAND_EYE;
      state.crouching = false;
      state.height = STAND_HEIGHT;
      state.onGround = true;
      state.bob = 0;
      state.landTimer = 0;
    },
  };
}
