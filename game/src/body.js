// The body: a capsule that walks, sprints, jumps and slides along the yard's rectangles. Collision
// is a push-out pass per axis rather than a sweep, which is what keeps a player from catching on
// the corner of a crate while strafing.

import * as THREE from 'three';
import { BODY } from './config.js';

export function createBody(colliders, spawn) {
  const position = new THREE.Vector3(spawn.x, 0, spawn.z);
  const velocity = new THREE.Vector3();
  const state = {
    position,
    velocity,
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    onGround: true,
    height: 0,
    sprinting: false,
  };

  // Move the body out of any rectangle it overlaps, one axis at a time: x first with the old z,
  // then z with the settled x. Trying both at once makes corners sticky.
  function resolve(px, pz) {
    for (const rect of colliders) {
      const dx = px - rect.x;
      const dz = pz - rect.z;
      const overlapX = rect.halfX + BODY.radius - Math.abs(dx);
      const overlapZ = rect.halfZ + BODY.radius - Math.abs(dz);
      if (overlapX <= 0 || overlapZ <= 0) continue;
      // Push out along the shallower axis: that is the face the body actually walked into.
      if (overlapX < overlapZ) {
        px += dx > 0 ? overlapX : -overlapX;
      } else {
        pz += dz > 0 ? overlapZ : -overlapZ;
      }
    }
    return { px, pz };
  }

  function step(dt, wishX, wishZ, wantsJump) {
    const target = state.sprinting ? BODY.sprint : BODY.walk;
    const wishLength = Math.hypot(wishX, wishZ);
    const dirX = wishLength > 0 ? wishX / wishLength : 0;
    const dirZ = wishLength > 0 ? wishZ / wishLength : 0;

    // Accelerate toward the wish direction, then damp: the damping term is what stops the body
    // dead when the stick is released instead of letting it glide.
    velocity.x += dirX * BODY.accel * dt;
    velocity.z += dirZ * BODY.accel * dt;
    const damp = Math.max(0, 1 - BODY.damping * dt);
    velocity.x *= damp;
    velocity.z *= damp;

    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > target) {
      velocity.x = (velocity.x / speed) * target;
      velocity.z = (velocity.z / speed) * target;
    }

    if (wantsJump && state.onGround) {
      velocity.y = BODY.jump;
      state.onGround = false;
    }
    velocity.y -= BODY.gravity * dt;

    position.x += velocity.x * dt;
    position.z += velocity.z * dt;
    position.y += velocity.y * dt;

    const settled = resolve(position.x, position.z);
    position.x = settled.px;
    position.z = settled.pz;

    if (position.y <= 0) {
      position.y = 0;
      velocity.y = 0;
      state.onGround = true;
    }

    // Keep the body inside the yard's own bounds even if a rectangle was missed.
    state.height = position.y;
  }

  function look(mouseX, mouseY, sensitivity = 0.0022) {
    state.yaw -= mouseX * sensitivity;
    state.pitch -= mouseY * sensitivity;
    const limit = Math.PI / 2 - 0.03;
    state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
  }

  function eye(out = new THREE.Vector3()) {
    return out.set(position.x, position.y + BODY.eye, position.z);
  }

  return { state, step, look, eye };
}
