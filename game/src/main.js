// Ember Yard — the wiring. One fixed step drives the body, the carbine, the attackers and the wave
// director; the render pass reads their state and never writes it. ?shot=start|play|end with
// &seed=N builds a deterministic frame for a capture, renders twice, then freezes and raises
// window.__shotReady, which is how the screenshots in screenshots/ are taken.

import * as THREE from 'three';
import { PALETTE, BODY, WEAPONS, YARD } from './config.js';
import { createYard } from './yard.js';
import { createBody } from './body.js';
import { createCarbine } from './carbine.js';
import { createInput } from './input.js';
import { createAttackerKit, pickHolding } from './attacker.js';
import { createReadout } from './readout.js';
import { createWaves } from './waves.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

// A tiny seeded generator, so a capture frame is the same twice.
function mulberry32(initial) {
  let a = initial >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

// ---- the stage ----
const host = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.fog);
scene.fog = new THREE.Fog(PALETTE.fog, 30, 96);

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

// ---- light: one key from above the kiln, one cool fill from the gates, and a warm bounce ----
// The yard is a night scene, but a readable one: the key carries the geometry, the fill separates
// one wall from the next, and the hemisphere keeps the shadowed faces above black so a silhouette
// still reads at the far end.
const key = new THREE.DirectionalLight('#ffd9b8', 2.6);
key.position.set(-14, 26, -18);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -34;
key.shadow.camera.right = 34;
key.shadow.camera.top = 34;
key.shadow.camera.bottom = -34;
key.shadow.camera.near = 1;
key.shadow.camera.far = 78;
key.shadow.bias = -0.0006;
scene.add(key);

const fill = new THREE.DirectionalLight('#8ec2e8', 1.15);
fill.position.set(16, 14, 22);
scene.add(fill);

const rim = new THREE.DirectionalLight('#ffb27a', 0.8);
rim.position.set(6, 10, -26);
scene.add(rim);

const bounce = new THREE.HemisphereLight('#5d7285', '#3a2b22', 1.05);
scene.add(bounce);

// ---- the pieces ----
const yard = createYard(scene);
const body = createBody(yard.colliders, yard.spawns.player);
const carbine = createCarbine(camera);
const attackers = createAttackerKit(scene, yard);
const readout = createReadout();
const waves = createWaves();
const input = createInput(renderer.domElement, () => {});

// The player's own numbers, kept here rather than on the body: the body is movement only.
const player = {
  health: 100,
  maxHealth: 100,
  armour: 50,
  alive: true,
  hurtFlash: 0,
};

const raycaster = new THREE.Raycaster();
const shootables = yard.shootables.concat(attackers.hitMeshes);
const forward = new THREE.Vector3();
const muzzlePoint = new THREE.Vector3();
const eyePoint = new THREE.Vector3();

// Tracers: a pool of thin lines, reused, so a long burst does not allocate.
const TRACER_COUNT = 24;
const tracerGeometry = new THREE.BufferGeometry();
tracerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACER_COUNT * 6), 3));
const tracerMaterial = new THREE.LineBasicMaterial({ color: '#ffcf9a', transparent: true, opacity: 0.85 });
const tracers = new THREE.LineSegments(tracerGeometry, tracerMaterial);
tracers.frustumCulled = false;
scene.add(tracers);
const tracerLife = new Float32Array(TRACER_COUNT);
let tracerCursor = 0;

// Impact sparks: a small pool of points that fade where a round lands.
const SPARK_COUNT = 40;
const sparkGeometry = new THREE.BufferGeometry();
sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
const sparkMaterial = new THREE.PointsMaterial({ color: '#ffb066', size: 0.055, transparent: true, opacity: 0.9 });
const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
sparks.frustumCulled = false;
scene.add(sparks);

// ---- run state ----
const clock = { last: performance.now(), accumulator: 0 };
let running = false;
let started = false;
let paused = false;

function pushTracer(from, to) {
  const attr = tracerGeometry.getAttribute('position');
  const base = tracerCursor * 6;
  attr.array[base + 0] = from.x;
  attr.array[base + 1] = from.y;
  attr.array[base + 2] = from.z;
  attr.array[base + 3] = to.x;
  attr.array[base + 4] = to.y;
  attr.array[base + 5] = to.z;
  attr.needsUpdate = true;
  tracerLife[tracerCursor] = 0.055;
  tracerCursor = (tracerCursor + 1) % TRACER_COUNT;
}

function sparkAt(point) {
  const attr = sparkGeometry.getAttribute('position');
  // Reuse the oldest slot: the array doubles as a ring, which is fine for a 0.12 s effect.
  for (let i = SPARK_COUNT - 1; i > 0; i -= 1) {
    attr.array[i * 3 + 0] = attr.array[(i - 1) * 3 + 0];
    attr.array[i * 3 + 1] = attr.array[(i - 1) * 3 + 1];
    attr.array[i * 3 + 2] = attr.array[(i - 1) * 3 + 2];
  }
  attr.array[0] = point.x;
  attr.array[1] = point.y;
  attr.array[2] = point.z;
  attr.needsUpdate = true;
}

function decayEffects(dt) {
  const attr = tracerGeometry.getAttribute('position');
  let dirty = false;
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    if (tracerLife[i] > 0) {
      tracerLife[i] -= dt;
      if (tracerLife[i] <= 0) {
        const base = i * 6;
        for (let k = 0; k < 6; k += 1) attr.array[base + k] = 0;
        dirty = true;
      }
    }
  }
  if (dirty) attr.needsUpdate = true;
  sparkMaterial.opacity = 0.9;
}

// ---- shooting ----
function fireOnce() {
  if (!player.alive) return;
  const produced = carbine.fire();
  if (!produced) return;

  carbine.rig.updateWorldMatrix(true, false);
  carbine.worldMuzzle();
  carbine.rig.getWorldPosition(muzzlePoint);

  forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  // Spread: a small cone sample, wider while moving.
  const moving = Math.hypot(body.state.velocity.x, body.state.velocity.z) > 1.2;
  const cone = carbine.spec.spread * (moving ? 2.1 : 1);
  forward.x += (random() - 0.5) * cone;
  forward.y += (random() - 0.5) * cone;
  forward.z += (random() - 0.5) * cone;
  forward.normalize();

  const origin = camera.getWorldPosition(eyePoint);
  raycaster.set(origin, forward);
  raycaster.far = 140;

  const hits = raycaster.intersectObjects(shootables, false);
  let end = origin.clone().add(forward.clone().multiplyScalar(90));

  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point.clone();
    const attacker = hit.object.userData.attacker;
    if (attacker && attacker.alive) {
      const head = hit.object.userData.zone === 'head';
      const damage = carbine.spec.damage * (head ? carbine.spec.headMultiplier : 1);
      const result = attackers.damage(attacker, damage, head);
      readout.hitMarker();
      if (result.killed) {
        waves.addKill(head);
        readout.dispatch(
          head
            ? '<b>you</b> → attacker <span>head shot</span>'
            : '<b>you</b> → attacker <span>body</span>',
        );
      }
    } else {
      sparkAt(hit.point);
    }
  }

  // The tracer starts at the muzzle and ends where the round stopped.
  pushTracer(carbine.worldMuzzle().clone(), end);
  // A round fired close enough to the player's eye reads as a shake upward.
  body.state.pitch += carbine.spec.recoil * 0.55;
}

function takePlayerDamage(amount, head) {
  if (!player.alive) return;
  let incoming = amount;
  if (player.armour > 0) {
    const absorbed = Math.min(player.armour, incoming * 0.6);
    player.armour -= absorbed;
    incoming -= absorbed;
  }
  player.health -= incoming;
  player.hurtFlash = 1;
  if (player.health <= 0) {
    player.health = 0;
    player.alive = false;
    endRun();
  }
}

function spawnOne() {
  const gate = Math.floor(random() * yard.spawns.attackers.length);
  const at = yard.spawns.attackers[gate];
  const holding = pickHolding(gate * 2 + waves.run.wave);
  // Nudge the spawn so two bodies never start inside each other.
  attackers.spawn({
    at: { x: at.x + (random() - 0.5) * 1.6, z: at.z + (random() - 0.5) * 1.6 },
    holding,
  });
}

function startRun() {
  player.health = player.maxHealth;
  player.armour = 50;
  player.alive = true;
  player.hurtFlash = 0;
  body.state.position.set(yard.spawns.player.x, 0, yard.spawns.player.z);
  body.state.velocity.set(0, 0, 0);
  body.state.yaw = yard.spawns.player.yaw;
  body.state.pitch = 0;
  carbine.state.magazine = carbine.spec.magazine;
  carbine.state.reserve = carbine.spec.reserve;
  carbine.state.reloading = false;
  for (const attacker of attackers.attackers.slice()) attackers.clearDead();
  waves.begin();
  readout.hideReport();
  readout.showTitle(false);
  readout.setScore(0);
  readout.setWave(1, 0);
  readout.gunLabel(carbine.spec.name);
  started = true;
  running = true;
  paused = false;
  input.request();
  readout.callout('WAVE 1', 'hold the kiln floor', 2.2);
}

function endRun() {
  running = false;
  waves.end();
  const report = {
    waves: waves.run.wavesHeld,
    score: waves.run.score,
    kills: waves.run.kills,
    heads: waves.run.heads,
    line: runLine(),
  };
  readout.showReport(report);
  input.release();
}

function runLine() {
  const held = waves.run.wavesHeld;
  if (held === 0) return 'They walked through the gates you were holding.';
  if (held < 3) return `You held ${held} wave${held === 1 ? '' : 's'} before the yard gave way.`;
  if (held < 6) return `${held} waves down and the kiln floor still yours — until it was not.`;
  return `${held} waves. The gates never stopped coming.`;
}

// ---- one fixed step ----
function stepWorld(dt) {
  const pressed = input.takePressed();
  const look = input.takeLook();

  if (player.alive && running) {
    body.look(look.x, look.y);
    body.state.sprinting = input.state.keys.has('Space');

    let wishX = 0;
    let wishZ = 0;
    if (input.state.keys.has('KeyW')) wishZ -= 1;
    if (input.state.keys.has('KeyS')) wishZ += 1;
    if (input.state.keys.has('KeyA')) wishX -= 1;
    if (input.state.keys.has('KeyD')) wishX += 1;

    // Move relative to where the player is looking, not the world axes.
    const sin = Math.sin(body.state.yaw);
    const cos = Math.cos(body.state.yaw);
    const worldX = wishX * cos - wishZ * sin;
    const worldZ = wishX * sin + wishZ * cos;

    body.step(dt, worldX, worldZ, false);

    if (pressed.includes('KeyR')) carbine.beginReload();
    if (pressed.includes('Escape')) input.release();

    if (input.state.firing) fireOnce();
  } else {
    input.takeLook();
  }

  carbine.step(
    dt,
    Math.hypot(body.state.velocity.x, body.state.velocity.z) > 0.9,
    body.state.sprinting,
  );

  const eye = body.eye(eyePoint);

  // The attackers only act while the run is live: a body that arrives during the report is quiet.
  if (running) {
    attackers.step(dt, eye, takePlayerDamage);
    const result = waves.step(dt, attackers.liveCount());
    for (let i = 0; i < result.spawn; i += 1) spawnOne();
    if (result.waveStarted > 0) {
      readout.callout(`WAVE ${result.waveStarted}`, `${waves.run.quotaThisWave} coming`, 2.0);
    }
    if (result.waveCleared > 0) {
      readout.callout('WAVE HELD', 'they are regrouping', 2.2);
      readout.dispatch('<b>wave held</b> <span>+bonus</span>', 3.0);
    }
    attackers.clearDead();
  }

  if (player.hurtFlash > 0) player.hurtFlash = Math.max(0, player.hurtFlash - dt * 2.4);

  decayEffects(dt);
  readout.tick(dt);
  readout.setVitals(player.health, player.armour);
  readout.setAmmo(carbine.state.magazine, carbine.state.maxMagazine, carbine.state.reloading);
  readout.setScore(waves.run.score);
  const remaining = Math.max(0, waves.run.quotaThisWave - waves.run.spawnedThisWave) + attackers.liveCount();
  readout.setWave(Math.max(1, waves.run.wave), remaining);
}

// ---- the camera follows the body ----
const camTarget = new THREE.Vector3();
const camQuat = new THREE.Quaternion();
const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');

function syncCamera() {
  body.eye(camTarget);
  // A small bob while walking, and a lean into the strafe, so the body reads as having weight.
  const speed = Math.hypot(body.state.velocity.x, body.state.velocity.z);
  const bob = speed > 0.9 ? Math.sin(performance.now() * 0.0105) * 0.019 : 0;
  camTarget.y += bob;
  camera.position.copy(camTarget);
  camEuler.set(body.state.pitch, body.state.yaw, 0);
  camQuat.setFromEuler(camEuler);
  camera.quaternion.copy(camQuat);
}

// ---- capture frames ----
// Each one lays out the world as if the player had been at it for a while: the point is to show
// the loop, not to be playable.
function placeAttacker(at, holding, offset = 0) {
  const attacker = attackers.spawn({ at, holding });
  if (offset > 0) {
    attacker.waypoint = offset;
    attacker.root.position.set(at.x, 0, at.z);
  }
  return attacker;
}

function runShot(which) {
  readout.showTitle(false);
  waves.begin();
  readout.gunLabel(carbine.spec.name);
  readout.setScore(0);
  readout.setWave(1, 0);

  if (which === 'start') {
    // The title screen over the yard: the sheet carries the pitch, the frame carries the place.
    readout.showTitle(true);
    body.state.position.set(2.5, 0, -2.0);
    body.state.yaw = Math.PI * 0.94;
    body.state.pitch = -0.05;
    camTarget.set(body.state.position.x, BODY.eye, body.state.position.z);
    camera.position.copy(camTarget);
    camEuler.set(body.state.pitch, body.state.yaw, 0);
    camera.quaternion.setFromEuler(camEuler);
    renderer.render(scene, camera);
    window.__shotReady = true;
    return;
  }

  if (which === 'play') {
    // Mid-fight: the player is pushing the kiln approach with three attackers closing. The camera
    // is close enough that a body fills a fair share of the frame, because a capture of a shooter
    // has to show what the gun is pointed at.
    body.state.position.set(-1.0, 0, -10.4);
    // Aimed at the centre attacker's chest, not at the wall: the crosshair and the tracer have to
    // agree with what the frame is about. Chest sits ~0.35 m below the eye over a 7.8 m gap, so
    // the pitch is a hair negative.
    body.state.yaw = Math.PI + 0.239;
    body.state.pitch = -0.048;
    player.health = 76;
    player.armour = 28;

    const closeOne = placeAttacker({ x: -4.2, z: -3.0 }, { node: 7, look: [0, -10] });
    const closeTwo = placeAttacker({ x: 0.9, z: -2.6 }, { node: 4, look: [0, -4] });
    const closeThree = placeAttacker({ x: 6.0, z: -4.4 }, { node: 6, look: [9.5, -6] });
    for (const attacker of [closeOne, closeTwo, closeThree]) {
      attacker.root.rotation.y = Math.PI;
      attacker.noticed = true;
      // Mid-stride: legs apart reads as motion even in a still.
      attacker.parts.leftLeg.rotation.x = 0.42;
      attacker.parts.rightLeg.rotation.x = -0.34;
      attacker.parts.leftArm.rotation.x = -0.26;
      attacker.parts.rightArm.rotation.x = 0.3;
    }

    // A burst in the air: a tracer from the muzzle into the middle attacker, a spark where the
    // round lands, and the muzzle flash lit. Set here because a capture renders one frame and the
    // live effect pools would already have decayed.
    carbine.state.magazine = 19;
    carbine.rig.updateWorldMatrix(true, false);
    const muzzleAt = carbine.worldMuzzle().clone();
    const impactAt = new THREE.Vector3(0.9, 1.34, -2.6);
    pushTracer(muzzleAt, impactAt);
    tracerLife[0] = 999;
    sparkAt(impactAt);
    carbine.rig.traverse((child) => {
      if (child.isPointLight) child.intensity = 11;
    });

    readout.setVitals(player.health, player.armour);
    readout.setAmmo(19, 30, false);
    readout.setScore(640);
    readout.setWave(3, 3);
    readout.hitMarker();
    readout.dispatch('<b>you</b> → attacker <span>head shot</span>', 60);
    readout.dispatch('<b>you</b> → attacker <span>body</span>', 60);
    readout.dispatch('<b>wave held</b> <span>+bonus</span>', 60);

    syncCamera();
    renderer.render(scene, camera);
    window.__shotReady = true;
    return;
  }

  if (which === 'end') {
    // The after-action report, with a real run behind it.
    player.health = 0;
    player.alive = false;
    running = false;
    waves.run.wave = 4;
    waves.run.wavesHeld = 3;
    waves.run.score = 1840;
    waves.run.kills = 21;
    waves.run.heads = 9;
    body.state.position.set(-1.0, 0, -4.0);
    body.state.yaw = Math.PI;
    body.state.pitch = -0.02;
    placeAttacker({ x: 1.2, z: 5.0 }, { node: 4, look: [0, -6] });
    placeAttacker({ x: 5.0, z: 1.0 }, { node: 6, look: [9.5, -6] });
    syncCamera();
    readout.showReport({
      waves: 3, score: 1840, kills: 21, heads: 9,
      line: 'You held 3 waves before the yard gave way.',
    });
    renderer.render(scene, camera);
    window.__shotReady = true;
    return;
  }

  // Anything else is a title frame.
  readout.showTitle(true);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// ---- the loop ----
function frame(now) {
  const raw = (now - clock.last) / 1000;
  clock.last = now;
  // A tab that was backgrounded returns one huge delta; clamp it so nothing tunnels.
  const dt = Math.min(raw, 0.1);

  if (running) {
    clock.accumulator += dt;
    let guard = 0;
    while (clock.accumulator >= FIXED_STEP && guard < 8) {
      stepWorld(FIXED_STEP);
      clock.accumulator -= FIXED_STEP;
      guard += 1;
    }
    if (guard >= 8) clock.accumulator = 0;
  } else if (started) {
    // The report is up: keep the readout alive for the fade, but stop the world.
    readout.tick(dt);
  }

  syncCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

readout.onBegin(startRun);
readout.onAgain(startRun);

if (shot) {
  runShot(shot);
} else {
  // The idle attract frame behind the title sheet: the yard, lit, with the title over it.
  body.state.position.set(2.5, 0, -2.0);
  body.state.yaw = Math.PI * 0.94;
  body.state.pitch = -0.05;
  readout.showTitle(true);
  syncCamera();
  renderer.render(scene, camera);
  clock.last = performance.now();
  requestAnimationFrame(frame);
}
