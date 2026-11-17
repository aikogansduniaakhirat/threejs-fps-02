// The match: rounds that end by elimination, by the charge detonating or by a defuse, the money
// that carries between rounds, the buy phase, and the bomb. It owns the score and the clock; it
// tells the HUD what to say and asks main.js to place things in the scene.
import { WEAPONS, GRENADE } from './arsenal.js';
import { PALETTE } from './palette.js';

// The buy menu: what a defender can spend on between rounds. Prices are the economy's spine,
// and the loss bonus is what keeps a losing round from being a dead round.
export const BUY_LIST = [
  { key: '1', id: 'smg', label: 'VESPER SMG', note: 'Fast, cheap, punishing on the move', price: WEAPONS.smg.price },
  { key: '2', id: 'rifle', label: 'KILN AR', note: 'One-tap headshots, slow to swing', price: WEAPONS.rifle.price },
  { key: '3', id: 'shotgun', label: 'FOUNDRY 12', note: 'Eight pellets, close quarters only', price: WEAPONS.shotgun.price },
  { key: '4', id: 'armor', label: 'FLAK VEST', note: 'Halves incoming damage', price: 650 },
  { key: '5', id: 'grenade', label: 'FRAG', note: 'Fuse 2.1s, 5.4m blast', price: GRENADE.price },
  { key: '6', id: 'defuse', label: 'DEFUSE KIT', note: 'Halves defuse time', price: 400 },
];

const ROUND_SECONDS = 105;
const PLANT_SECONDS = 3.4;
const DEFUSE_SECONDS = 8.0;
const DEFUSE_KIT_SECONDS = 4.0;
const BOMB_SECONDS = 38;
const START_MONEY = 800;
const KILL_REWARD = 325;
const WIN_REWARD = 3000;
const LOSS_BASE = 1400;
const MAX_MONEY = 9000;
const HALF_TIME = 6;

export function createMatch(player) {
  const state = {
    phase: 'buy', // buy | live | ended | matchover
    round: 1,
    scoreCT: 0,
    scoreT: 0,
    money: START_MONEY,
    clock: ROUND_SECONDS,
    bomb: { planted: false, timer: 0, defusing: false, defuseLeft: 0, planting: false, plantLeft: 0, position: null },
    armor: 0,
    hasDefuseKit: false,
    lastResult: null,
    roundOverTimer: 0,
    buyOpen: false,
    streak: 0,
    noise: 0,
  };

  const events = [];

  function award(amount) {
    state.money = Math.min(MAX_MONEY, state.money + amount);
  }

  function startRound() {
    state.phase = 'buy';
    state.clock = ROUND_SECONDS;
    state.bomb = { planted: false, timer: 0, defusing: false, defuseLeft: 0, planting: false, plantLeft: 0, position: null };
    state.lastResult = null;
    state.roundOverTimer = 0;
    state.buyOpen = true;
    state.noise = 0;
    events.push({ type: 'roundStart', round: state.round });
  }

  function endRound(winner, reason) {
    if (state.phase === 'ended' || state.phase === 'matchover') return;
    state.phase = 'ended';
    state.buyOpen = false;
    state.lastResult = { winner, reason };
    state.roundOverTimer = 0;
    if (winner === 'ct') {
      state.scoreCT += 1;
      state.streak = 0;
      award(WIN_REWARD);
    } else {
      state.scoreT += 1;
      state.streak += 1;
      award(LOSS_BASE + Math.min(3, state.streak) * 300);
    }
    events.push({ type: 'roundEnd', winner, reason });
  }

  function nextRound() {
    state.round += 1;
    if (state.round > HALF_TIME) {
      // The sides do not swap in a one-defender match; the second half simply pays more.
      award(1000);
    }
    startRound();
  }

  // ---- buying ------------------------------------------------------------------------------
  function buy(id) {
    const item = BUY_LIST.find((entry) => entry.id === id);
    if (!item) return { ok: false, why: 'unknown' };
    if (state.phase !== 'buy' && state.phase !== 'live') return { ok: false, why: 'closed' };
    if (item.id === 'armor' && state.armor >= 100) return { ok: false, why: 'owned' };
    if (item.id === 'defuse' && state.hasDefuseKit) return { ok: false, why: 'owned' };
    if (item.id === 'grenade' && player.arsenal.state.grenades >= GRENADE.max) return { ok: false, why: 'full' };
    if (item.id !== 'armor' && item.id !== 'defuse' && item.id !== 'grenade' && player.arsenal.state.owned[item.id]) {
      return { ok: false, why: 'owned' };
    }
    if (state.money < item.price) return { ok: false, why: 'poor' };
    state.money -= item.price;
    if (item.id === 'armor') state.armor = 100;
    else if (item.id === 'defuse') state.hasDefuseKit = true;
    else if (item.id === 'grenade') player.arsenal.buyGrenade();
    else player.arsenal.buy(item.id);
    events.push({ type: 'buy', id: item.id });
    return { ok: true };
  }

  // ---- damage ------------------------------------------------------------------------------
  function damagePlayer(amount) {
    if (state.phase !== 'live') return 0;
    if (state.godMode) return 0;
    let incoming = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, Math.round(incoming * 0.5));
      state.armor -= absorbed;
      incoming -= absorbed;
    }
    player.health = Math.max(0, player.health - Math.round(incoming));
    if (player.health <= 0) {
      events.push({ type: 'playerDead' });
      endRound('t', 'defender eliminated');
    }
    return incoming;
  }

  // ---- the round clock, the bomb, the defuse ------------------------------------------------
  function step(dt, context) {
    state.noise = Math.max(0, state.noise - dt);
    if (state.phase === 'buy') {
      state.clock -= dt;
      if (state.clock <= 0 || context.playerMovedAndReady) {
        // The buy phase ends on the clock or the first shot; either way the round goes live.
      }
      if (state.clock <= 0) {
        state.phase = 'live';
        state.buyOpen = false;
        state.clock = ROUND_SECONDS;
        events.push({ type: 'live' });
      }
      return;
    }

    if (state.phase === 'ended') {
      state.roundOverTimer += dt;
      return;
    }

    if (state.phase === 'live') {
      if (state.bomb.planted) {
        state.bomb.timer -= dt;
        if (state.bomb.timer <= 0) {
          events.push({ type: 'explode' });
          endRound('t', 'charge detonated');
          return;
        }
      } else {
        state.clock -= dt;
        if (state.clock <= 0) endRound('ct', 'time expired');
      }

      if (state.bomb.defusing) {
        state.bomb.defuseLeft -= dt;
        if (state.bomb.defuseLeft <= 0) {
          state.bomb.defusing = false;
          state.bomb.planted = false;
          events.push({ type: 'defused' });
          endRound('ct', 'charge defused');
        }
      }
    }
  }

  function plantProgress(dt) {
    if (state.phase !== 'live') return;
    state.bomb.planting = true;
    state.bomb.plantLeft = Math.max(0, state.bomb.plantLeft - dt);
    if (state.bomb.plantLeft <= 0) {
      state.bomb.planted = true;
      state.bomb.planting = false;
      state.bomb.timer = BOMB_SECONDS;
      state.clock = BOMB_SECONDS;
      events.push({ type: 'planted' });
    }
  }

  function startPlant() {
    if (state.bomb.planted || state.phase !== 'live') return;
    if (state.bomb.plantLeft === 0) state.bomb.plantLeft = PLANT_SECONDS;
    state.bomb.planting = true;
  }

  function stopPlant() {
    state.bomb.planting = false;
    state.bomb.plantLeft = 0;
  }

  function tryDefuse(dt) {
    if (!state.bomb.planted) return;
    const duration = state.hasDefuseKit ? DEFUSE_KIT_SECONDS : DEFUSE_SECONDS;
    if (!state.bomb.defusing) {
      state.bomb.defusing = true;
      state.bomb.defuseLeft = duration;
    }
    state.bomb.defuseLeft = Math.max(0, state.bomb.defuseLeft - dt);
  }

  function stopDefuse() {
    state.bomb.defusing = false;
    state.bomb.defuseLeft = 0;
  }

  function registerNoise(x, z) {
    state.noise = 0.25;
    state.noiseX = x;
    state.noiseZ = z;
  }

  return {
    state,
    events,
    startRound,
    nextRound,
    endRound,
    buy,
    damagePlayer,
    step,
    plantProgress,
    startPlant,
    stopPlant,
    tryDefuse,
    stopDefuse,
    registerNoise,
    award,
    reset() {
      state.phase = 'buy';
      state.round = 1;
      state.scoreCT = 0;
      state.scoreT = 0;
      state.money = START_MONEY;
      state.clock = ROUND_SECONDS;
      state.armor = 0;
      state.hasDefuseKit = false;
      state.streak = 0;
      state.bomb = { planted: false, timer: 0, defusing: false, defuseLeft: 0, planting: false, plantLeft: 0, position: null };
      state.lastResult = null;
      state.buyOpen = true;
      events.length = 0;
    },
    takeEvents() {
      const out = events.slice();
      events.length = 0;
      return out;
    },
    constants: {
      ROUND_SECONDS, BOMB_SECONDS, PLANT_SECONDS, DEFUSE_SECONDS, DEFUSE_KIT_SECONDS, KILL_REWARD,
    },
  };
}
