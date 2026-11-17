// The wave director: it decides how many come, when the next one starts, and when the run is over.
// All of the run's numbers live here so the HUD and the report sheet read one source of truth.

import { WAVES } from './config.js';

export function createWaves() {
  const run = {
    wave: 0,
    spawnedThisWave: 0,
    quotaThisWave: 0,
    spawnTimer: 0,
    breakLeft: 0,
    phase: 'idle',      // idle | spawning | clearing | resting | over
    score: 0,
    kills: 0,
    heads: 0,
    wavesHeld: 0,
    over: false,
    won: false,
  };

  function quotaFor(wave) {
    return Math.min(WAVES.ceiling, WAVES.opening + (wave - 1) * WAVES.growth);
  }

  function begin() {
    run.wave = 0;
    run.score = 0;
    run.kills = 0;
    run.heads = 0;
    run.wavesHeld = 0;
    run.over = false;
    run.won = false;
    run.phase = 'resting';
    run.breakLeft = 1.2;
  }

  // Called once a frame. Returns the number of attackers to spawn this frame, and the events the
  // caller has to react to: a wave starting, a wave cleared, and the run ending.
  function step(dt, liveAttackers) {
    const events = { spawn: 0, waveStarted: 0, waveCleared: 0, ended: false };

    if (run.over) return events;

    if (run.phase === 'resting') {
      run.breakLeft -= dt;
      if (run.breakLeft <= 0) {
        run.wave += 1;
        run.quotaThisWave = quotaFor(run.wave);
        run.spawnedThisWave = 0;
        run.spawnTimer = 0;
        run.phase = 'spawning';
        events.waveStarted = run.wave;
      }
      return events;
    }

    if (run.phase === 'spawning') {
      run.spawnTimer -= dt;
      if (run.spawnTimer <= 0 && run.spawnedThisWave < run.quotaThisWave) {
        run.spawnTimer = WAVES.stagger;
        run.spawnedThisWave += 1;
        events.spawn = 1;
      }
      if (run.spawnedThisWave >= run.quotaThisWave) run.phase = 'clearing';
      return events;
    }

    if (run.phase === 'clearing') {
      if (liveAttackers === 0) {
        run.wavesHeld += 1;
        run.score += WAVES.scorePerWave + run.wave * 20;
        run.phase = 'resting';
        run.breakLeft = WAVES.breakBetween;
        events.waveCleared = run.wave;
      }
    }

    return events;
  }

  function addKill(head) {
    run.kills += 1;
    run.score += WAVES.scorePerKill + (head ? WAVES.scorePerHead : 0);
    if (head) run.heads += 1;
  }

  // The run ends when the player dies. There is no win state in a wave defence, only how long you
  // held: the report says the waves you kept off the floor.
  function end() {
    run.over = true;
    run.phase = 'over';
    run.won = false;
  }

  return { run, begin, step, addKill, end };
}
