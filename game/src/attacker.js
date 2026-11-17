// The attacker: a body that walks its route, holds a lane, notices you, and shoots in bursts.
// It is deliberately legible — a dark silhouette with one hot visor — so a player can pick it out
// against the yard at forty metres and know which way it is facing.

import * as THREE from 'three';
import { ATTACKER } from './config.js';
import { findRoute, nearestNode, HOLDINGS } from './yard.js';

export function createAttackerKit(scene, yard) {
  const { nodes, links, spawns } = yard;

  // One geometry set shared by every attacker: eight of them on the field at once would
  // otherwise build eight copies of the same boxes.
  const geometries = {
    torso: new THREE.BoxGeometry(0.62, 0.78, 0.38),
    head: new THREE.BoxGeometry(0.28, 0.28, 0.28),
    visor: new THREE.BoxGeometry(0.30, 0.075, 0.02),
    leg: new THREE.BoxGeometry(0.19, 0.72, 0.22),
    arm: new THREE.BoxGeometry(0.15, 0.5, 0.17),
  };
  const materials = {
    cloth: new THREE.MeshStandardMaterial({ color: '#8e97a6', roughness: 0.86 }),
    gear: new THREE.MeshStandardMaterial({ color: '#5c6472', roughness: 0.78 }),
    visor: new THREE.MeshStandardMaterial({
      color: '#ff8a3d', emissive: '#ff7a2a', emissiveIntensity: 2.6, roughness: 0.22,
    }),
    // The shoulder stripe is the tell: a hot band that separates an attacker from wall and cover
    // at any distance, in one colour the rest of the scene never uses.
    stripe: new THREE.MeshStandardMaterial({
      color: '#ffd27f', emissive: '#ffbe55', emissiveIntensity: 1.5, roughness: 0.4,
    }),
  };

  const attackers = [];
  const hitMeshes = [];
  let nextId = 1;

  // The route an attacker walks: from the gate it spawns at, to the holding it was given.
  function makeRoute(fromNode, holding) {
    return findRoute(nodes, links, fromNode, holding.node).map((index) => nodes[index]);
  }

  // Build one attacker. Everything it needs to act lives on the object so the update pass is a
  // single loop with no lookups.
  function spawn({ at, holding, health = ATTACKER.health }) {
    const root = new THREE.Group();
    const torso = new THREE.Mesh(geometries.torso, materials.cloth);
    torso.position.y = 1.18;
    torso.castShadow = true;
    root.add(torso);

    const head = new THREE.Mesh(geometries.head, materials.gear);
    head.position.y = 1.72;
    head.castShadow = true;
    root.add(head);

    // The visor is the read: it says where the attacker is looking, so a player can break line.
    const visor = new THREE.Mesh(geometries.visor, materials.visor);
    visor.position.set(0, 1.74, -0.145);
    head.add(visor);

    const leftArm = new THREE.Mesh(geometries.arm, materials.cloth);
    leftArm.position.set(-0.38, 1.20, 0);
    root.add(leftArm);
    const rightArm = new THREE.Mesh(geometries.arm, materials.cloth);
    rightArm.position.set(0.38, 1.20, 0);
    root.add(rightArm);

    // A band across the shoulders, front and back, so an attacker reads at any facing.
    const bandFront = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.09, 0.02), materials.stripe);
    bandFront.position.set(0, 1.50, -0.20);
    root.add(bandFront);
    const bandBack = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.09, 0.02), materials.stripe);
    bandBack.position.set(0, 1.50, 0.20);
    root.add(bandBack);

    const leftLeg = new THREE.Mesh(geometries.leg, materials.gear);
    leftLeg.position.set(-0.16, 0.36, 0);
    root.add(leftLeg);
    const rightLeg = new THREE.Mesh(geometries.leg, materials.gear);
    rightLeg.position.set(0.16, 0.36, 0);
    root.add(rightLeg);

    root.position.set(at.x, 0, at.z);
    scene.add(root);

    // Every hit-testable piece points back at its owner, so a ray that lands knows the body.
    for (const part of [torso, head, leftArm, rightArm, leftLeg, rightLeg]) {
      part.userData.attacker = null;   // filled in below, once the attacker object exists
      part.userData.zone = part === head ? 'head' : 'body';
      hitMeshes.push(part);
    }

    const attacker = {
      id: nextId,
      root,
      parts: { torso, head, leftArm, rightArm, leftLeg, rightLeg },
      health,
      maxHealth: health,
      alive: true,
      yaw: 0,
      route: makeRoute(nearestNode(nodes, at.x, at.z), holding),
      waypoint: 0,
      look: holding.look,
      noticed: false,
      reactionLeft: 0,
      burstLeft: 0,
      shotGap: 0,
      restLeft: 0,
      walkPhase: Math.random() * Math.PI * 2,
      hasFiredThisFrame: false,
      deathLeft: 0,
    };
    nextId += 1;

    for (const part of [torso, head, leftArm, rightArm, leftLeg, rightLeg]) {
      part.userData.attacker = attacker;
    }

    attackers.push(attacker);
    return attacker;
  }

  // Put a body back into the pool. The geometry is shared, so disposing the meshes is enough.
  function retire(attacker) {
    scene.remove(attacker.root);
    for (const part of Object.values(attacker.parts)) {
      const at = hitMeshes.indexOf(part);
      if (at !== -1) hitMeshes.splice(at, 1);
    }
    const at = attackers.indexOf(attacker);
    if (at !== -1) attackers.splice(at, 1);
  }

  // Damage an attacker. Returns { killed, head } so the caller can score and speak.
  function damage(attacker, amount, head) {
    if (!attacker.alive) return { killed: false, head };
    attacker.health -= amount;
    attacker.noticed = true;
    if (attacker.health <= 0) {
      attacker.alive = false;
      attacker.deathLeft = 0.9;
      return { killed: true, head };
    }
    return { killed: false, head };
  }

  // One tick. The AI is three states deep at most: walk the route, hold and scan, then shoot
  // when it has a line. Nothing here runs for a dead body beyond the fall animation.
  function step(dt, playerEye, onPlayerHit) {
    for (const attacker of attackers) {
      if (!attacker.alive) {
        attacker.deathLeft -= dt;
        const fall = Math.min(1, 1 - attacker.deathLeft / 0.9);
        attacker.root.rotation.x = -fall * Math.PI * 0.42;
        attacker.root.position.y = -fall * 0.1;
        continue;
      }

      const dx = playerEye.x - attacker.root.position.x;
      const dz = playerEye.z - attacker.root.position.z;
      const distance = Math.hypot(dx, dz);
      const toPlayer = Math.atan2(dx, dz);

      // Notice the player on sight, with a reaction delay so an engagement is not instant.
      if (!attacker.noticed && distance < ATTACKER.sight) {
        attacker.noticed = true;
        attacker.reactionLeft = ATTACKER.reaction;
      }
      if (attacker.noticed && distance > ATTACKER.sight * 1.6) {
        attacker.noticed = false;
        attacker.burstLeft = 0;
      }

      // Walk the route while there is one, then settle into the holding and scan.
      const target = attacker.waypoint < attacker.route.length
        ? attacker.route[attacker.waypoint]
        : null;

      if (target) {
        const tx = target.x - attacker.root.position.x;
        const tz = target.z - attacker.root.position.z;
        const span = Math.hypot(tx, tz);
        if (span < 0.45) {
          attacker.waypoint += 1;
        } else {
          const pace = ATTACKER.speed * (attacker.noticed ? 1.35 : 1);
          attacker.root.position.x += (tx / span) * pace * dt;
          attacker.root.position.z += (tz / span) * pace * dt;
          attacker.walkPhase += dt * pace * 3.4;
          // Legs swing while walking: the cheapest way to make motion read at distance.
          const swing = Math.sin(attacker.walkPhase) * 0.34;
          attacker.parts.leftLeg.rotation.x = swing;
          attacker.parts.rightLeg.rotation.x = -swing;
          attacker.parts.leftArm.rotation.x = -swing * 0.6;
          attacker.parts.rightArm.rotation.x = swing * 0.6;
        }
      }

      // Face the player when engaged, otherwise face where the holding says to watch.
      const wantYaw = attacker.noticed ? toPlayer : Math.atan2(
        attacker.look[0] - attacker.root.position.x,
        attacker.look[1] - attacker.root.position.z,
      );
      attacker.yaw = turnToward(attacker.yaw, wantYaw, ATTACKER.turn * dt);
      attacker.root.rotation.y = attacker.yaw + Math.PI;

      attacker.hasFiredThisFrame = false;

      // The shooting loop: reaction, then bursts with gaps, so there are always windows to move.
      if (attacker.noticed) {
        if (attacker.reactionLeft > 0) {
          attacker.reactionLeft -= dt;
        } else if (attacker.burstLeft > 0) {
          attacker.shotGap -= dt;
          if (attacker.shotGap <= 0) {
            attacker.shotGap = ATTACKER.burstGap;
            attacker.burstLeft -= 1;
            attacker.hasFiredThisFrame = true;

            // A burst lands only if the attacker is actually facing the player, and even then
            // the shot can stray: the spread is the player's escape hatch.
            const facing = Math.abs(angleGap(attacker.yaw, toPlayer));
            if (facing < 0.30 && Math.random() > ATTACKER.spread) {
              const head = Math.random() < 0.12;
              onPlayerHit(head ? ATTACKER.headDamage : ATTACKER.damage, head, attacker);
            }
          }
        } else {
          attacker.restLeft -= dt;
          if (attacker.restLeft <= 0) {
            attacker.burstLeft = ATTACKER.burst;
            attacker.shotGap = 0;
            attacker.restLeft = ATTACKER.burstRest;
          }
        }
      }
    }
  }

  // Drop the bodies that finished falling.
  function clearDead() {
    for (const attacker of attackers.slice()) {
      if (!attacker.alive && attacker.deathLeft <= 0) retire(attacker);
    }
  }

  function liveCount() {
    return attackers.filter((a) => a.alive).length;
  }

  return { spawn, damage, step, clearDead, attackers, hitMeshes, liveCount };
}

// Turn a heading toward another by at most `rate`, taking the short way round the circle.
function turnToward(current, target, rate) {
  let gap = angleGap(current, target);
  if (Math.abs(gap) <= rate) return target;
  return current + Math.sign(gap) * rate;
}

// The signed smallest angle from `current` to `target`.
function angleGap(current, target) {
  let gap = (target - current) % (Math.PI * 2);
  if (gap > Math.PI) gap -= Math.PI * 2;
  if (gap < -Math.PI) gap += Math.PI * 2;
  return gap;
}

// A holding to aim a newly spawned attacker at: pick the one nearest its gate so the route is
// short, and rotate through them so a wave does not stack on one point.
export function pickHolding(spawnIndex) {
  return HOLDINGS[spawnIndex % HOLDINGS.length];
}
