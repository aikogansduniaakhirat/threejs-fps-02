// The attackers: four bots that walk a route into the yard, hold angles, look and listen,
// shoot back with a reaction time of their own, and try to plant the charge. Each one is a
// small state machine over the same route graph the map exports, with a head and a torso so
// a shot can be read as a head shot. No new objects are made in the per-frame path.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { findRoute, nearestNode, NAV, inSite, SITE } from './world.js';

const HEALTH = 100;
const HEAD_HEIGHT = 1.58;
const TORSO_HEIGHT = 1.12;
const RADIUS = 0.36;
const WALK = 3.1;
const RUN = 4.35;
const SIGHT_RANGE = 46;
const HEARING_RANGE = 26;
const REACTION = 0.30;
const TURN_RATE = 5.2;
const FIRE_GAP = 0.34;
const BURST = 3;
const BURST_PAUSE = 0.62;
const ACCURACY = 0.035;
const DAMAGE = 17;

const STATES = ['advance', 'hold', 'engage', 'plant', 'dead'];

// Where each bot holds once it has taken its ground: an angle onto the site or a doorway.
const HOLD_POINTS = [
  { node: 8, look: [-9.5, -6.5] },
  { node: 7, look: [-8.0, -8.0] },
  { node: 12, look: [-2.0, -7.5] },
  { node: 13, look: [1.5, -8.0] },
];

export function createBots(scene, world) {
  // Attackers wear cold slate and iron, not the map's terracotta. Against a kiln-yards' warm
  // walls that is the whole point: a silhouette you can read in a quarter second, at range, in
  // a dark corner. The visor is the only emissive thing on them, so a head reads as a target.
  const skin = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#41546a'), roughness: 0.6, metalness: 0.14,
    emissive: new THREE.Color('#1d2b3a'), emissiveIntensity: 1.15,
  });
  const gear = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#222c38'), roughness: 0.74,
    emissive: new THREE.Color('#121a24'), emissiveIntensity: 1.1,
  });
  const visor = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8ff0ff'), roughness: 0.25, metalness: 0.4, emissive: new THREE.Color('#37c8e8'), emissiveIntensity: 2.4 });

  const torsoGeometry = new THREE.BoxGeometry(0.62, 0.86, 0.36);
  const hipGeometry = new THREE.BoxGeometry(0.52, 0.34, 0.32);
  const legGeometry = new THREE.BoxGeometry(0.19, 0.72, 0.21);
  const armGeometry = new THREE.BoxGeometry(0.15, 0.6, 0.16);
  const headGeometry = new THREE.SphereGeometry(0.168, 14, 10);
  const visorGeometry = new THREE.BoxGeometry(0.24, 0.07, 0.06);
  const gunGeometry = new THREE.BoxGeometry(0.09, 0.1, 0.62);
  const tracerGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);

  const items = [];
  const hitMeshes = [];
  const tracerMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.glow), transparent: true, opacity: 0.85 });

  for (let index = 0; index < 4; index += 1) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeometry, skin);
    torso.position.y = TORSO_HEIGHT;
    torso.userData.part = 'torso';
    const hip = new THREE.Mesh(hipGeometry, gear);
    hip.position.y = 0.86;
    const legL = new THREE.Mesh(legGeometry, gear);
    legL.position.set(-0.14, 0.52, 0);
    const legR = new THREE.Mesh(legGeometry, gear);
    legR.position.set(0.14, 0.52, 0);
    const armL = new THREE.Mesh(armGeometry, gear);
    armL.position.set(-0.37, TORSO_HEIGHT - 0.02, 0.02);
    const armR = new THREE.Mesh(armGeometry, gear);
    armR.position.set(0.37, TORSO_HEIGHT - 0.02, 0.02);
    const head = new THREE.Mesh(headGeometry, skin);
    head.position.y = HEAD_HEIGHT;
    head.userData.part = 'head';
    const face = new THREE.Mesh(visorGeometry, visor);
    face.position.set(0, HEAD_HEIGHT + 0.02, -0.14);
    const gun = new THREE.Mesh(gunGeometry, gear);
    gun.position.set(0.2, TORSO_HEIGHT - 0.04, -0.3);
    group.add(torso, hip, legL, legR, armL, armR, head, face, gun);
    group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (mesh.userData.part) hitMeshes.push(mesh);
    });
    group.visible = false;
    scene.add(group);

    items.push({
      index,
      group,
      head,
      torso,
      legL,
      legR,
      armL,
      armR,
      health: HEALTH,
      alive: false,
      state: 'advance',
      route: null,
      routeAt: 0,
      hold: HOLD_POINTS[index % HOLD_POINTS.length],
      position: new THREE.Vector3(),
      yaw: 0,
      targetYaw: 0,
      reaction: 0,
      fireLeft: 0,
      burstLeft: 0,
      burstPause: 0,
      sees: false,
      lastSeen: new THREE.Vector3(),
      hearsTimer: 0,
      holdTimer: 0,
      deathTimer: 0,
      spawnIndex: index,
      planter: index === 0,
      hasBomb: index === 0,
      stagger: index * 0.55,
      walkPhase: 0,
      aimPitch: 0,
    });
  }

  const eye = new THREE.Vector3();
  const aimAt = new THREE.Vector3();
  const toPlayer = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  ray.far = SIGHT_RANGE;

  function canSee(from, target, colliders, checkMeshes) {
    ray.set(from, toPlayer.copy(target).sub(from).normalize());
    const blocked = ray.intersectObjects(colliders, false);
    const wanted = toPlayer.length();
    if (blocked.length && blocked[0].distance < wanted - 0.4) return false;
    if (!checkMeshes || !checkMeshes.length) return true;
    const first = ray.intersectObjects(checkMeshes, false)[0];
    if (!first) return false;
    return first.distance >= wanted - 0.9;
  }

  function routeTo(bot, goalIndex) {
    bot.route = findRoute(bot.position.x, bot.position.z, goalIndex);
    bot.routeAt = 0;
  }

  function advanceRoute(bot, dt, speed) {
    if (!bot.route || bot.routeAt >= bot.route.length) return true;
    const node = NAV.nodes[bot.route[bot.routeAt]];
    const dx = node[0] - bot.position.x;
    const dz = node[1] - bot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.7) {
      bot.routeAt += 1;
      return bot.routeAt >= bot.route.length;
    }
    const step = Math.min(speed * dt, distance);
    bot.position.x += (dx / distance) * step;
    bot.position.z += (dz / distance) * step;
    bot.targetYaw = Math.atan2(-dx, -dz);
    return false;
  }

  function faceToward(bot, x, z, dt, rate = TURN_RATE) {
    const desired = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let delta = desired - bot.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = rate * dt;
    bot.yaw += Math.max(-maxTurn, Math.min(maxTurn, delta));
  }

  function spawnForRound(round) {
    items.forEach((bot, index) => {
      const spawn = world.spawns[index % world.spawns.length];
      bot.position.set(spawn.x + (index - 1.5) * 0.9, 0, spawn.z - (index % 2) * 1.1);
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'advance';
      bot.reaction = REACTION + index * 0.06;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.fireLeft = 0;
      bot.deathTimer = 0;
      bot.holdTimer = 0;
      bot.yaw = Math.PI;
      bot.targetYaw = Math.PI;
      bot.group.visible = true;
      bot.group.rotation.set(0, Math.PI, 0);
      bot.group.position.set(bot.position.x, 0, bot.position.z);
      bot.head.visible = true;
      bot.torso.visible = true;
      bot.legL.visible = true;
      bot.legR.visible = true;
      bot.armL.visible = true;
      bot.armR.visible = true;
      bot.hasBomb = index === 0;
      // Each round the plan spreads: two bots take the west lane, two the east, so a defender
      // cannot hold one doorway and win.
      const goal = index % 2 === 0 ? 7 : 13;
      routeTo(bot, goal);
    });
  }

  return {
    items,
    hitMeshes,
    spawnForRound,
    aliveCount() {
      let count = 0;
      for (const bot of items) if (bot.alive) count += 1;
      return count;
    },
    bombCarrier() {
      for (const bot of items) if (bot.alive && bot.hasBomb) return bot;
      return null;
    },
    damage(bot, amount, part) {
      if (!bot.alive) return false;
      const scaled = part === 'head' ? amount * 3.4 : part === 'torso' ? amount : amount * 0.72;
      bot.health -= scaled;
      if (bot.health <= 0) {
        bot.health = 0;
        bot.alive = false;
        bot.state = 'dead';
        bot.deathTimer = 0;
        bot.group.rotation.x = 0;
        bot.head.visible = false;
        return true;
      }
      // Being shot at makes a bot turn and answer, which reads as a reaction rather than a script.
      bot.state = 'engage';
      bot.reaction = Math.min(bot.reaction, 0.18);
      return false;
    },
    step(dt, playerPosition, playerAlive, playerNoise, onShoot, onPlant) {
      const colliders = world.shootables;
      for (const bot of items) {
        if (bot.state === 'dead') {
          if (bot.deathTimer < 1) {
            bot.deathTimer = Math.min(1, bot.deathTimer + dt * 2.6);
            bot.group.rotation.x = -Math.PI * 0.5 * bot.deathTimer;
            bot.group.position.y = -0.16 * bot.deathTimer;
            if (bot.deathTimer >= 1) bot.group.visible = false;
          }
          continue;
        }
        if (!bot.alive) continue;

        bot.position.y = 0;
        eye.set(bot.position.x, HEAD_HEIGHT - 0.1, bot.position.z);

        // ---- perception: line of sight, a reaction delay, and the sound of a shot nearby ----
        let seen = false;
        if (playerAlive) {
          toPlayer.copy(playerPosition).sub(eye);
          const distance = toPlayer.length();
          if (distance < SIGHT_RANGE) {
            // A bot sees a 100 degree cone in front of it, or anything close behind it.
            const forwardX = -Math.sin(bot.yaw);
            const forwardZ = -Math.cos(bot.yaw);
            const dot = (toPlayer.x * forwardX + toPlayer.z * forwardZ) / (distance || 1);
            const inCone = dot > 0.17 || distance < 6;
            if (inCone && canSee(eye, playerPosition, colliders, null)) seen = true;
          }
        }
        if (playerNoise > 0) {
          const noiseDistance = bot.position.distanceTo(playerPosition);
          if (noiseDistance < HEARING_RANGE) {
            bot.hearsTimer = 1.2;
            bot.lastSeen.copy(playerPosition);
          }
        }
        bot.hearsTimer = Math.max(0, bot.hearsTimer - dt);
        bot.sees = seen;
        if (seen) bot.lastSeen.copy(playerPosition);

        if (seen && bot.reaction > 0) bot.reaction = Math.max(0, bot.reaction - dt);

        // ---- decide ----
        if (bot.state === 'advance' && (seen || bot.hearsTimer > 0)) bot.state = 'engage';
        else if (bot.state === 'engage' && !seen && bot.hearsTimer === 0) {
          bot.holdTimer += dt;
          if (bot.holdTimer > 2.4) {
            bot.holdTimer = 0;
            bot.state = 'advance';
            if (bot.route && bot.routeAt < bot.route.length) routeTo(bot, bot.route[bot.route.length - 1]);
            else routeTo(bot, bot.hold.node);
          }
        } else if (bot.state === 'advance' && bot.routeAt >= (bot.route ? bot.route.length : 0)) {
          bot.state = 'hold';
          bot.holdTimer = 0;
        } else if (bot.state === 'hold' && seen) bot.state = 'engage';

        if (bot.state === 'engage' && !seen && bot.hearsTimer === 0 && bot.holdTimer === 0) bot.holdTimer = 0;

        // ---- act ----
        if (bot.state === 'advance') {
          const done = advanceRoute(bot, dt, bot.index % 2 === 0 ? WALK : RUN);
          if (bot.targetYaw !== bot.yaw) faceToward(bot, bot.position.x - Math.sin(bot.targetYaw) * 2, bot.position.z - Math.cos(bot.targetYaw) * 2, dt);
          bot.walkPhase += dt * 8;
        } else if (bot.state === 'hold') {
          bot.holdTimer += dt;
          faceToward(bot, bot.hold.look[0], bot.hold.look[1], dt, 2.4);
          // A bot holding ground drifts onto its angle and crouches after a moment, which reads
          // as a player settling behind cover.
          const node = NAV.nodes[bot.hold.node];
          const dx = node[0] - bot.position.x;
          const dz = node[1] - bot.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance > 0.6) {
            bot.position.x += (dx / distance) * WALK * 0.55 * dt;
            bot.position.z += (dz / distance) * WALK * 0.55 * dt;
            bot.walkPhase += dt * 6;
          }
          if (bot.holdTimer > 5 && inSite(bot.position.x, bot.position.z) && bot.hasBomb && onPlant) {
            bot.state = 'plant';
            bot.holdTimer = 0;
          }
        } else if (bot.state === 'plant') {
          bot.holdTimer += dt;
          faceToward(bot, SITE.center[0], SITE.center[1], dt, 3.4);
          if (onPlant) onPlant(bot, dt);
          if (bot.holdTimer > 3.6) {
            bot.state = 'hold';
            bot.holdTimer = 0;
            bot.hasBomb = false;
          }
        } else if (bot.state === 'engage') {
          if (seen) {
            faceToward(bot, playerPosition.x, playerPosition.z, dt, 7.5);
            bot.fireLeft = Math.max(0, bot.fireLeft - dt);
            bot.burstPause = Math.max(0, bot.burstPause - dt);
            if (bot.reaction === 0 && bot.fireLeft === 0 && bot.burstPause === 0 && bot.burstLeft === 0) {
              bot.burstLeft = BURST;
              bot.fireLeft = 0;
            }
            if (bot.reaction === 0 && bot.fireLeft === 0 && bot.burstPause === 0 && bot.burstLeft > 0) {
              bot.burstLeft -= 1;
              bot.fireLeft = FIRE_GAP;
              if (bot.burstLeft === 0) bot.burstPause = BURST_PAUSE;
              aimAt.copy(playerPosition);
              const distance = bot.position.distanceTo(playerPosition);
              const miss = ACCURACY * (1 + distance / 22);
              aimAt.x += (Math.random() * 2 - 1) * miss * 6;
              aimAt.y += (Math.random() * 2 - 1) * miss * 4;
              aimAt.z += (Math.random() * 2 - 1) * miss * 6;
              const hit = onShoot(bot, aimAt, DAMAGE, distance);
              // A tracer from the bot's muzzle to where the shot went, fading out.
              const tracer = new THREE.Line(tracerGeometry, tracerMaterial);
              tracer.position.copy(eye);
              tracer.lookAt(aimAt);
              tracer.scale.z = eye.distanceTo(aimAt);
              scene.add(tracer);
              tracer.userData.life = 0.07;
              traces.push(tracer);
              void hit;
            }
            bot.aimPitch = Math.atan2(playerPosition.y - eye.y, toPlayer.length());
          } else {
            // Lost sight: turn onto the last known position and lean there, so the bot hunts
            // instead of standing still.
            faceToward(bot, bot.lastSeen.x, bot.lastSeen.z, dt, 4.2);
            const dx = bot.lastSeen.x - bot.position.x;
            const dz = bot.lastSeen.z - bot.position.z;
            const distance = Math.hypot(dx, dz);
            if (distance > 1.6 && bot.hearsTimer > 0) {
              bot.position.x += (dx / distance) * WALK * 0.85 * dt;
              bot.position.z += (dz / distance) * WALK * 0.85 * dt;
              bot.walkPhase += dt * 7;
            }
          }
        }

        // ---- keep the body out of the map: a cheap push out of any wall it overlaps ----
        for (const collider of world.colliders) {
          if (bot.position.x + RADIUS > collider.min.x && bot.position.x - RADIUS < collider.max.x
            && bot.position.z + RADIUS > collider.min.z && bot.position.z - RADIUS < collider.max.z) {
            if (collider.max.y < 0.8) continue;
            const pushLeft = Math.abs(bot.position.x - RADIUS - collider.max.x);
            const pushRight = Math.abs(collider.min.x - (bot.position.x + RADIUS));
            const pushUp = Math.abs(bot.position.z - RADIUS - collider.max.z);
            const pushDown = Math.abs(collider.min.z - (bot.position.z + RADIUS));
            const smallest = Math.min(pushLeft, pushRight, pushUp, pushDown);
            if (smallest === pushLeft) bot.position.x += pushLeft + 0.01;
            else if (smallest === pushRight) bot.position.x -= pushRight + 0.01;
            else if (smallest === pushUp) bot.position.z += pushUp + 0.01;
            else bot.position.z -= pushDown + 0.01;
          }
        }

        bot.group.position.set(bot.position.x, bot.group.position.y, bot.position.z);
        bot.group.rotation.y = bot.yaw;
        // Legs swing with the walk phase, so movement is legible from the body alone.
        const swing = Math.sin(bot.walkPhase) * 0.42;
        bot.legL.rotation.x = swing;
        bot.legR.rotation.x = -swing;
        bot.armL.rotation.x = -swing * 0.5;
      }

      // Age the tracers out.
      for (let i = traces.length - 1; i >= 0; i -= 1) {
        traces[i].userData.life -= dt;
        if (traces[i].userData.life <= 0) {
          scene.remove(traces[i]);
          traces.splice(i, 1);
        }
      }
    },
    reset() {
      for (const trace of traces) scene.remove(trace);
      traces.length = 0;
      for (const bot of items) {
        bot.group.visible = false;
        bot.state = 'dead';
        bot.alive = false;
      }
    },
    nearestAliveTo(x, z) {
      let best = null;
      let bestDistance = Infinity;
      for (const bot of items) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.position.x - x, bot.position.z - z);
        if (d < bestDistance) { bestDistance = d; best = bot; }
      }
      return best;
    },
    nodeForHolding: (index) => HOLD_POINTS[index % HOLD_POINTS.length].node,
  };
}

const traces = [];
export { STATES };
