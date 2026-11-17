# threejs-fps-02

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/aikogansduniaakhirat/threejs-fps-02/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/aikogansduniaakhirat/threejs-fps-02/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Ember Yard** — a first-person wave-defence shooter in plain three.js. You hold a foundry yard
against waves of attackers coming through four gates. One kiln floor behind you, one carbine in
your hands, a wave director that keeps raising the count. Head shots pay more, sprinting lowers
the weapon, and the yard has no ceiling to hide behind.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Then open `game/index.html` in a desktop browser, or serve it locally:

```sh
node serve.ts   # http://localhost:8080
```

Node 22 or later. No dependencies to install: the game is static ES modules and `three` is
vendored under `game/vendor/`, so it runs offline with no network request.

## How it plays

| Control | Action |
|---|---|
| `W` `A` `S` `D` | move |
| mouse | look |
| left click | fire |
| `R` | reload |
| `Space` | sprint |

- **Waves.** Each wave sends more attackers than the last, staggered in through the gates.
  Clear one and the next follows after a short break.
- **Cover and lanes.** Crate stacks, a waist-high wall and two steel tanks break the yard into
  lanes. Attackers route to a holding point and watch a lane, so where you stand decides who
  sees you first.
- **Head shots.** A head hit pays 40 extra and drops an attacker faster than three body shots.
- **The readout.** Vitals and armour bottom left, ammunition bottom right, wave and score top
  corners, and a kill line that keeps the last five events.

## Layout

```
game/index.html        the page: HUD markup, styles, and the import map
game/src/main.js       the fixed-step loop and the wiring
game/src/body.js       capsule movement, per-axis push-out
game/src/carbine.js    magazine, cadence, recoil, viewmodel
game/src/attacker.js   route following, sight, reaction, bursts
game/src/waves.js      quota, stagger, breaks, score
game/src/readout.js    HUD writes, one function per element
game/src/yard.js       the yard, cover, gates, nav graph, Dijkstra
game/src/config.js     every number in one place
main.ts                validates the tree, stages it in /output, writes dossier.json
```

`screenshots/` holds three renders, the first by name the cover.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
