// Boot, the one loop, and the wiring between the modules: a fixed 60 Hz simulation feeding a
// render at the display's rate, rounds scored by the match, and every subsystem keeping to its
// own file. ?shot=start|play|end|buy with &seed=N sets up a deterministic frame for a capture,
// renders twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SPAWNS, SITE, inSite } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, GRENADE, WEAPONS } from './arsenal.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createMatch, BUY_LIST } from './match.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

// ---- renderer, scene, camera ----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 34, 96);
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.04, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

// The sky dome: a single inverted sphere with a vertical gradient, so the dusk reads above the
// walls and the fog never meets a flat colour.
const skyGeometry = new THREE.SphereGeometry(150, 24, 16);
const skyColors = new Float32Array(skyGeometry.attributes.position.count * 3);
const top = new THREE.Color(PALETTE.sky).lerp(new THREE.Color('#0e1116'), 0.55);
const bottom = new THREE.Color(PALETTE.ember).lerp(new THREE.Color(PALETTE.ground), 0.72);
const positionAttribute = skyGeometry.attributes.position;
const tempColor = new THREE.Color();
for (let i = 0; i < positionAttribute.count; i += 1) {
  const y = positionAttribute.getY(i) / 150;
  tempColor.copy(bottom).lerp(top, Math.max(0, Math.min(1, y * 0.5 + 0.5)));
  skyColors[i * 3] = tempColor.r;
  skyColors[i * 3 + 1] = tempColor.g;
  skyColors[i * 3 + 2] = tempColor.b;
}
skyGeometry.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
const skyDome = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
scene.add(skyDome);

const world = createWorld(scene);
world.spawns = SPAWNS.t;

const player = createPlayer(world.colliders, SPAWNS.ct);
player.health = 100;
const arsenal = createArsenal(camera);
player.arsenal = arsenal;
const bots = createBots(scene, world);
const hud = createHud();
const match = createMatch(player);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const shootMeshes = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const body = player.state;

// The bomb: a small box that appears on the ground when the charge is planted.
const bombMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.2, 0.26),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.brickDark), roughness: 0.6, metalness: 0.3, emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 0.35 }),
);
bombMesh.visible = false;
scene.add(bombMesh);

// The grenade's blast: a ring that expands and fades.
const blastMesh = new THREE.Mesh(
  new THREE.RingGeometry(0.4, 0.9, 26),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.glow), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
);
blastMesh.rotation.x = -Math.PI / 2;
blastMesh.visible = false;
scene.add(blastMesh);
let blastTimer = 0;
const blastAt = new THREE.Vector3();

// Live grenades in the air: one projectile table, cleared each round.
const grenadeMesh = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.11, 1),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), roughness: 0.5, metalness: 0.6 }),
);
grenadeMesh.visible = false;
scene.add(grenadeMesh);
const liveGrenade = { active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), fuse: 0 };

let score = 0;
let frozen = false;
let suppressBotFire = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let firingHeld = false;

hud.onPlay(() => {
  if (shot) return;
  if (match.state.phase === 'matchover') restartMatch();
  input.requestLock();
});
hud.onBuy((id) => {
  const result = match.buy(id);
  if (result.ok) {
    refreshBuy();
    hud.pushFeed(`<b>bought</b> ${id.toUpperCase()}`);
  }
});

upholdObjective();
hud.setScore(0, 0, 1);
hud.setWallet(match.state.money);
refreshWallet();

function refreshWallet() {
  hud.setWeapon(arsenal.spec().name, arsenal.state.mag, arsenal.state.reserve, arsenal.state.grenades, true);
  hud.setVitals(player.health, match.state.armor);
  hud.setWallet(match.state.money);
}

function refreshBuy() {
  hud.showBuy(match.state.money, arsenal.state.owned, match.state.armor >= 100, match.state.hasDefuseKit, arsenal.state.grenades);
}

function upholdObjective() {
  if (match.state.bomb.planted) {
    hud.setObjective('CHARGE PLANTED — hold E on the kiln floor to defuse.', true);
  } else if (match.state.phase === 'live') {
    hud.setObjective('Stop the attackers reaching the kiln floor. Headshots end fights.', false);
  } else {
    hud.setObjective('Buy phase. Spend before the doors open.', false);
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (match.state.phase !== 'matchover') {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function restartMatch() {
  match.reset();
  arsenal.refill();
  player.health = 100;
  player.reset(SPAWNS.ct);
  bots.reset();
  bots.spawnForRound(1);
  score = 0;
  bombMesh.visible = false;
  liveGrenade.active = false;
  grenadeMesh.visible = false;
  hud.hideBanner();
  hud.setScore(0, 0, 1);
  refreshWallet();
  upholdObjective();
  match.startRound();
  hud.showOverlay('start');
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye - body.landTimer, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0);
  // The weapon's own sway rides on the camera, so the view model never lags the look.
  camera.position.y -= body.crouching ? 0 : 0;
  skyDome.position.copy(camera.position);
}

// ---- shooting --------------------------------------------------------------------------------
function shootRay(spread, damage, pellets, range, headMultiplier, falloff) {
  let hits = 0;
  let killed = 0;
  camera.getWorldDirection(direction);
  for (let pellet = 0; pellet < pellets; pellet += 1) {
    const dir = direction.clone();
    if (spread > 0) {
      dir.x += (random() * 2 - 1) * spread;
      dir.y += (random() * 2 - 1) * spread;
      dir.z += (random() * 2 - 1) * spread;
      dir.normalize();
    }
    raycaster.set(camera.position, dir);
    raycaster.far = range;
    const hit = raycaster.intersectObjects(shootMeshes, false)[0];
    if (!hit) continue;
    const botIndex = bots.hitMeshes.indexOf(hit.object);
    if (botIndex === -1) continue;
    const bot = bots.items.find((entry) => entry.head === hit.object || entry.torso === hit.object
      || entry.legL === hit.object || entry.legR === hit.object || entry.armL === hit.object || entry.armR === hit.object);
    if (!bot || !bot.alive) continue;
    const part = hit.object.userData.part ?? 'limb';
    const scaled = part === 'head' ? damage * headMultiplier : damage;
    const away = hit.distance / (falloff || 60);
    const finalDamage = scaled * Math.max(0.35, 1 - away * 0.55);
    const isKill = bots.damage(bot, finalDamage, part);
    hits += 1;
    if (isKill) {
      killed += 1;
      match.award(match.constants.KILL_REWARD);
      hud.pushFeed(`<b>you</b> → ${part === 'head' ? 'HEADSHOT' : 'attacker'}`);
      if (bots.aliveCount() === 0) {
        match.endRound('ct', 'attackers eliminated');
      }
    }
  }
  return { hits, killed };
}

function fire() {
  const spec = arsenal.spec();
  if (!arsenal.ready()) return;
  if (!arsenal.takeRound()) {
    arsenal.reload();
    return;
  }
  const spread = arsenal.spread(player.speed());
  const result = shootRay(spread, spec.damage, spec.pellets, spec.range, spec.headMultiplier, spec.range);
  arsenal.pullTrigger(player.speed());
  player.recoil(spec.recoilPitch * (1 + random() * 0.3), (random() * 2 - 1) * spec.recoilYaw);
  if (result.hits > 0) hud.hitMarker(result.killed > 0);
  match.registerNoise(body.position.x, body.position.z);
  if (match.state.phase === 'buy') {
    match.state.phase = 'live';
    match.state.buyOpen = false;
    match.state.clock = match.constants.ROUND_SECONDS;
    hud.hideBuy();
    upholdObjective();
  }
  refreshWallet();
}

function throwGrenade() {
  if (!arsenal.useGrenade()) return;
  liveGrenade.active = true;
  liveGrenade.fuse = GRENADE.fuse;
  camera.getWorldDirection(direction);
  liveGrenade.position.set(camera.position.x, camera.position.y, camera.position.z);
  liveGrenade.position.addScaledVector(direction, 0.5);
  liveGrenade.velocity.copy(direction).multiplyScalar(17);
  liveGrenade.velocity.y += 3.4;
  grenadeMesh.visible = true;
  grenadeMesh.position.copy(liveGrenade.position);
  match.registerNoise(body.position.x, body.position.z);
  refreshWallet();
}

function stepGrenade(dt) {
  if (!liveGrenade.active) return;
  liveGrenade.fuse -= dt;
  liveGrenade.velocity.y -= 19 * dt;
  liveGrenade.position.addScaledVector(liveGrenade.velocity, dt);
  if (liveGrenade.position.y < 0.12) {
    liveGrenade.position.y = 0.12;
    liveGrenade.velocity.set(liveGrenade.velocity.x * 0.55, -liveGrenade.velocity.y * 0.34, liveGrenade.velocity.z * 0.55);
    if (Math.abs(liveGrenade.velocity.y) < 0.6) liveGrenade.velocity.y = 0;
  }
  grenadeMesh.position.copy(liveGrenade.position);
  grenadeMesh.rotation.x += dt * 8;
  grenadeMesh.rotation.y += dt * 5;
  if (liveGrenade.fuse <= 0) {
    liveGrenade.active = false;
    grenadeMesh.visible = false;
    blastAt.copy(liveGrenade.position);
    blastTimer = 0.42;
    blastMesh.visible = true;
    blastMesh.position.copy(blastAt);
    blastMesh.scale.setScalar(1);
    blastMesh.material.opacity = 0.9;
    match.registerNoise(blastAt.x, blastAt.z);
    for (const bot of bots.items) {
      if (!bot.alive) continue;
      const distance = Math.hypot(bot.position.x - blastAt.x, bot.position.z - blastAt.z);
      if (distance > GRENADE.radius) continue;
      const falloff = 1 - distance / GRENADE.radius;
      const killed = bots.damage(bot, GRENADE.damage * falloff, 'torso');
      if (killed) {
        match.award(match.constants.KILL_REWARD);
        hud.pushFeed('<b>frag</b> → attacker');
      }
    }
    if (bots.aliveCount() === 0 && match.state.phase === 'live') match.endRound('ct', 'attackers eliminated');
    const selfDistance = Math.hypot(body.position.x - blastAt.x, body.position.z - blastAt.z);
    if (selfDistance < GRENADE.radius) {
      match.damagePlayer(Math.round(GRENADE.damage * 0.55 * (1 - selfDistance / GRENADE.radius)));
      hud.flashDamage();
    }
  }
}

function stepBlast(dt) {
  if (blastTimer <= 0) return;
  blastTimer = Math.max(0, blastTimer - dt);
  blastMesh.scale.setScalar(1 + (0.42 - blastTimer) * 9);
  blastMesh.material.opacity = blastTimer * 1.6;
  if (blastTimer === 0) blastMesh.visible = false;
}

// ---- the round -------------------------------------------------------------------------------
function startRoundPlay() {
  bots.spawnForRound(match.state.round);
  player.health = 100;
  player.reset(SPAWNS.ct);
  arsenal.state.mag = arsenal.spec().magSize;
  arsenal.state.reserve = arsenal.spec().reserve;
  arsenal.state.grenades = Math.min(arsenal.state.grenades, GRENADE.max);
  bombMesh.visible = false;
  refreshWallet();
  upholdObjective();
}

function handleEvents() {
  for (const event of match.takeEvents()) {
    if (event.type === 'roundStart') {
      hud.hideBanner();
      hud.showBanner(`ROUND ${event.round}`, 'Buy phase — press B', '');
      setTimeout(() => hud.hideBanner(), 2400);
    } else if (event.type === 'live') {
      hud.hideBuy();
      upholdObjective();
      hud.showBanner('LIVE', 'Attackers moving', '');
      setTimeout(() => hud.hideBanner(), 1400);
    } else if (event.type === 'roundEnd') {
      const won = event.winner === 'ct';
      hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', `${event.reason} · $${Math.round(match.state.money)}`, won ? 'win' : 'lose');
      hud.pushFeed(`<b>round</b> → ${event.winner.toUpperCase()} (${event.reason})`);
      // The next round starts on a short delay, which is the only pause in the loop.
      setTimeout(() => {
        if (match.state.phase !== 'ended') return;
        match.nextRound();
        startRoundPlay();
        hud.hideBanner();
        hud.showBanner(`ROUND ${match.state.round}`, 'Buy phase — press B', '');
        setTimeout(() => hud.hideBanner(), 2200);
        hud.showBuy(match.state.money, arsenal.state.owned, match.state.armor >= 100, match.state.hasDefuseKit, arsenal.state.grenades);
      }, 3200);
    } else if (event.type === 'planted') {
      hud.pushFeed('<b>attacker</b> → charge planted');
      upholdObjective();
    } else if (event.type === 'defused') {
      hud.pushFeed('<b>you</b> → charge defused');
    } else if (event.type === 'explode') {
      hud.pushFeed('<b>charge</b> → detonated');
      hud.flashDamage();
    }
  }
}

// ---- input actions ---------------------------------------------------------------------------
function handleKeys() {
  const pressed = input.takePressed();
  const keys = input.state.keys;

  if (pressed.has('KeyB')) {
    if (hud.isBuyOpen()) hud.hideBuy();
    else {
      refreshBuy();
      match.state.buyOpen = true;
    }
  }

  if (hud.isBuyOpen()) {
    for (const item of BUY_LIST) {
      if (!pressed.has(`Digit${item.key}`)) continue;
      const result = match.buy(item.id);
      if (result.ok) refreshBuy();
      else hud.pushFeed(`<b>cannot</b> buy ${item.id} (${result.why})`);
    }
  } else {
    if (pressed.has('Digit1')) arsenal.equip('pistol');
    if (pressed.has('Digit2')) arsenal.equip('smg');
    if (pressed.has('Digit3')) arsenal.equip('rifle');
    if (pressed.has('Digit4')) arsenal.equip('shotgun');
    if (pressed.has('KeyG')) throwGrenade();
  }

  if (pressed.has('KeyR')) arsenal.reload();
  if (pressed.has('KeyE') && match.state.phase === 'matchover') restartMatch();
  void keys;
}

// ---- the fixed step --------------------------------------------------------------------------
function step(dt) {
  handleKeys();
  player.step(dt, hud.isBuyOpen() ? new Set() : input.state.keys);
  arsenal.step(dt, player.speed());
  syncCamera();

  // The muzzle point, used for the bomb and defuse checks.
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.35);

  const holdingE = input.state.keys.has('KeyE') && !hud.isBuyOpen();
  const canPlant = false; // the defender never plants
  void canPlant;

  // Defusing: hold E on the planted charge.
  if (match.state.bomb.planted) {
    const distance = Math.hypot(body.position.x - (match.state.bomb.position?.x ?? SITE.center[0]), body.position.z - (match.state.bomb.position?.z ?? SITE.center[1]));
    if (holdingE && distance < 2.0 && match.state.phase === 'live') {
      match.tryDefuse(dt);
      hud.showProgress('DEFUSING', 1 - match.state.bomb.defuseLeft / (match.state.hasDefuseKit ? match.constants.DEFUSE_KIT_SECONDS : match.constants.DEFUSE_SECONDS));
    } else {
      match.stopDefuse();
      hud.hideProgress();
    }
  } else {
    hud.hideProgress();
  }

  // Bots: they see the player, shoot, plant, and walk their route. During the buy phase the doors
  // are shut, so they advance their route but hold fire — taking damage while reading a menu is a
  // bug, not tension.
  const noise = match.state.phase === 'live' ? match.state.noise : 0;
  const canEngage = player.health > 0 && match.state.phase === 'live';
  bots.step(
    dt,
    new THREE.Vector3(body.position.x, body.position.y + 1.1, body.position.z),
    canEngage,
    noise,
    onBotShoot,
    onBotPlant,
  );

  stepGrenade(dt);
  stepBlast(dt);

  // The bomb's own clock and the round's.
  match.step(dt, { playerMovedAndReady: false });

  // Firing, on the fixed step so the fire rate is the same at every frame rate.
  if (input.state.firing && !hud.isBuyOpen() && match.state.phase !== 'ended' && match.state.phase !== 'matchover') {
    const spec = arsenal.spec();
    if (spec.auto) {
      if (arsenal.ready()) fire();
    } else if (!firingHeld) {
      firingHeld = true;
      fire();
    }
  }
  if (!input.state.firing) firingHeld = false;

  if (match.state.bomb.planted) {
    bombMesh.visible = true;
    bombMesh.position.set(
      match.state.bomb.position.x,
      0.1 + Math.sin(performance.now() * 0.006) * 0.01,
      match.state.bomb.position.z,
    );
    bombMesh.material.emissiveIntensity = 0.3 + Math.sin(performance.now() * 0.012) * 0.25;
  }

  handleEvents();

  // Vitals and the wallet, pushed once per step rather than once per frame.
  hud.setVitals(player.health, match.state.armor);
  hud.setWallet(match.state.money);
  hud.setWeapon(arsenal.spec().name, arsenal.state.mag, arsenal.state.reserve, arsenal.state.grenades, true);
  hud.setClock(match.state.bomb.planted ? match.state.bomb.timer : match.state.clock, match.state.bomb.planted);
  hud.setScore(match.state.scoreCT, match.state.scoreT, match.state.round);
  const spreadPixels = arsenal.spread(player.speed()) * 1500;
  hud.setSpread(spreadPixels);

  if (match.state.phase === 'matchover') {
    hud.showOverlay('matchover', `${match.state.scoreCT} — ${match.state.scoreT}`);
    input.state.firing = false;
  }
}

function onBotShoot(bot, aimAt, damage, distance) {
  if (suppressBotFire) return false;
  // A bot's shot is a ray against the player's body box: head, torso, or a miss.
  muzzle.set(bot.position.x, 1.4, bot.position.z);
  const toTarget = aimAt.clone().sub(muzzle);
  const length = toTarget.length();
  toTarget.normalize();
  const playerCenter = new THREE.Vector3(body.position.x, body.position.y + (body.crouching ? 0.75 : 1.1), body.position.z);
  const toPlayer = playerCenter.clone().sub(muzzle);
  const along = toPlayer.dot(toTarget);
  if (along < 0) return false;
  const closest = muzzle.clone().addScaledVector(toTarget, along);
  const miss = closest.distanceTo(playerCenter);
  // The body is roughly a 0.5 m cylinder; a shot inside it lands, a head-height shot hits harder.
  if (miss > 0.62) return false;
  const headY = body.position.y + (body.crouching ? 1.02 : 1.62);
  const isHead = Math.abs(closest.y - headY) < 0.24 && miss < 0.34;
  const dealt = match.damagePlayer(isHead ? damage * 2.6 : damage);
  hud.flashDamage();
  hud.pushFeed(`<b>${bot.index === 0 ? 'carrier' : 'attacker'}</b> → you${isHead ? ' (head)' : ''}`);
  if (player.health <= 0) {
    hud.showBanner('DEFENDER DOWN', 'The attackers take the round', 'lose');
  }
  return true;
}

function onBotPlant(bot, dt) {
  if (match.state.bomb.planted) return;
  match.state.bomb.position = { x: bot.position.x, z: bot.position.z };
  match.registerNoise(bot.position.x, bot.position.z);
  match.plantProgress(dt);
  if (match.state.bomb.planted) {
    hud.pushFeed('<b>carrier</b> → charge armed');
  }
}

// ---- the loop --------------------------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

// ---- deterministic shot frames ---------------------------------------------------------------
function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAtPoint(point) {
  const dx = point.x - camera.position.x;
  const dy = point.y - camera.position.y;
  const dz = point.z - camera.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideAllPanels();
  hud.hideBanner();
  hud.clearFeed();
  match.startRound();
  // The capture harness must not be shot at: the frames show the defender holding a lane, not
  // the defender dying in a cutscene.
  suppressBotFire = true;
  bots.spawnForRound(1);
  hud.setScore(0, 0, 1);
  hud.setWallet(match.state.money);

  if (name === 'play' || name === 'end') {
    body.position.set(-9.5, 0, 1.5);
    body.yaw = Math.PI * 0.86;
    body.pitch = -0.02;
    arsenal.buy('rifle');
    arsenal.state.mag = 24;
    arsenal.state.grenades = 1;
    match.state.armor = 100;
    match.state.money = 3450;
    match.state.phase = 'live';
    match.state.godMode = true;
    settle(6);
    // Walk the bots into the yard so the frames show a real engagement rather than a spawn,
    // then stagger them: four attackers on one line reads as wallpaper, four at four depths
    // reads as a yard with people in it.
    settle(200);
    const staging = [
      [-13.6, -4.4, 2.7],
      [-8.9, -7.8, 3.0],
      [-3.2, -3.1, 2.4],
      [-0.6, -9.2, 2.85],
    ];
    bots.items.forEach((bot, index) => {
      const [x, z, yaw] = staging[index % staging.length];
      bot.position.set(x, 0, z);
      bot.yaw = yaw;
      bot.targetYaw = yaw;
      bot.group.position.set(x, 0, z);
      bot.group.rotation.y = yaw;
      bot.state = 'hold';
      bot.holdTimer = 3;
    });
    settle(12);
    const target = bots.items.find((bot) => bot.alive) ?? bots.items[0];
    aimAtPoint(new THREE.Vector3(target.position.x, target.position.y + 1.3, target.position.z));
    for (let burst = 0; burst < 3; burst += 1) {
      fire();
      settle(4);
    }
    if (name === 'end') {
      // Down the rest of them: the end frame is the round won, feed full, score moved.
      for (const bot of bots.items) {
        if (!bot.alive) continue;
        aimAtPoint(new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z));
        for (let shot = 0; shot < 4; shot += 1) {
          arsenal.state.mag = 30;
          fire();
          settle(3);
        }
      }
      // The round is over: the clock stops, the score moves, the objective clears. The plant is
      // shown as evidence the attackers got the charge down before they were cleared.
      match.state.phase = 'ended';
      match.state.scoreCT = 1;
      match.state.scoreT = 0;
      match.state.bomb.planted = true;
      match.state.bomb.position = { x: -12.4, z: -3.6 };
      match.state.bomb.timer = 0;
      match.state.money = 6100;
      match.state.armor = 100;
      player.health = 68;
      body.position.set(-10.6, 0, 0.4);
      aimAtPoint(new THREE.Vector3(-12.4, 0.2, -3.6));
      hud.showBanner('ROUND WON', 'Attackers eliminated', 'win');
      hud.setObjective('Round won. Press E to deploy into the next one.', false);
      hud.setScore(1, 0, 1);
      hud.setClock(0, false);
      hud.setWallet(6100);
      hud.pushFeed('<b>you</b> → attacker <span>headshot</span>');
      hud.pushFeed('<b>you</b> → attacker');
      hud.pushFeed('<b>you</b> → attacker');
      hud.pushFeed('<b>carrier</b> → charge down');
      settle(2);
    } else {
      player.health = 84;
      hud.hideBanner();
      hud.pushFeed('<b>you</b> → attacker <span>headshot</span>');
      hud.pushFeed('<b>you</b> → attacker');
      settle(2);
    }
    refreshWallet();
    hud.setClock(match.state.bomb.planted ? match.state.bomb.timer : 62, match.state.bomb.planted);
    hud.setObjective(match.state.bomb.planted ? 'CHARGE PLANTED — hold E on the kiln floor to defuse.' : 'Stop the attackers reaching the kiln floor. Headshots end fights.', match.state.bomb.planted);
    hud.setSpread(2);
  } else if (name === 'buy') {
    body.position.set(-1.0, 0, -16.5);
    body.yaw = Math.PI * 1.02;
    body.pitch = -0.03;
    match.state.phase = 'buy';
    match.state.money = 4150;
    match.state.armor = 100;
    arsenal.buy('rifle');
    refreshBuy();
    settle(4);
    hud.setObjective('Buy phase. Spend before the doors open.', false);
    hud.setScore(0, 0, 3);
    hud.setClock(105, false);
    hud.setWallet(4150);
    hud.setVitals(100, 100);
    hud.hideBanner();
  } else {
    // start: the defender's spawn pocket looking down the west lane at the lit kiln.
    body.position.set(0, 0, -16.2);
    body.yaw = Math.PI * 1.16;
    body.pitch = -0.12;
    match.state.phase = 'live';
    match.state.money = 800;
    settle(3);
    hud.showOverlay('start');
  }

  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Pointer lock is the input path; the escape key releases it and pauses.
document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && hud.isBuyOpen()) hud.hideBuy();
});

syncCamera();
for (const key of Object.keys(WEAPONS)) arsenal.models[key].visible = key === 'pistol';
if (shot) runShot(shot);
else {
  match.startRound();
  bots.spawnForRound(1);
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
