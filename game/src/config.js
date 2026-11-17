// The six colours the page uses, plus the numbers that decide how the yard feels. One file so a
// tuning pass is one edit: range, pace, and how hard a wave leans on you all live here.

export const PALETTE = {
  night: '#12151a',
  ground: '#3b352c',
  concrete: '#6d675e',
  brick: '#9a5f43',
  steel: '#8b8378',
  ember: '#e0662b',
  safe: '#58a3c6',
  sky: '#2b3542',
  fog: '#232a33',
  chalk: '#eae6dc',
};

// How the yard is measured. Metres and seconds, as a player feels them.
export const YARD = {
  width: 44,           // x, wall to wall
  depth: 52,           // z, the gate end to the kiln end
  wallHeight: 5.2,
  kilnFloor: -17,      // the z line a charge has to stay above
  ceiling: 9.2,
};

// The player's body: a 0.42 m radius capsule on two feet, eye at 1.66 m.
export const BODY = {
  radius: 0.42,
  eye: 1.66,
  walk: 5.0,           // m/s
  sprint: 7.4,
  accel: 46,
  damping: 11,
  jump: 5.1,
  gravity: 18.5,
};

// The wave director: how many come, how fast they get, how hard they hit.
export const WAVES = {
  opening: 4,          // attackers in wave one
  growth: 2,           // extra attackers per wave
  ceiling: 9,          // a wave never fields more than this at once
  stagger: 0.55,       // seconds between spawns inside a wave
  breakBetween: 5.5,   // seconds of quiet before the next wave
  scorePerKill: 25,
  scorePerHead: 40,
  scorePerWave: 150,
};

// The attacker: a body that walks a route, looks, and shoots back.
export const ATTACKER = {
  health: 100,
  speed: 2.5,
  turn: 3.4,           // rad/s of yaw
  sight: 26,           // metres it notices you at
  reaction: 0.34,      // seconds before it starts shooting
  burst: 3,            // shots per burst
  burstGap: 0.13,
  burstRest: 1.15,
  damage: 9,
  headDamage: 34,
  spread: 0.035,       // radians of aim slop
};

// The sights: magazine, cadence, damage, and how the viewmodel kicks.
export const WEAPONS = {
  carbine: {
    name: 'carbine',
    magazine: 30,
    reserve: 120,
    rpm: 640,
    damage: 24,
    headMultiplier: 3.1,
    spread: 0.008,
    recoil: 0.011,
    reloadTime: 1.75,
    automatic: true,
  },
};
