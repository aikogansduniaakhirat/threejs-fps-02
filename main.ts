// Ember Yard's hand-in: verify the tree the way the scorer will, then stage it in /output.
//
// The kit's starter copies game/ and writes the dossier and says nothing when a file is wrong
// shape; this one reads the tree first and refuses with the path and the reason, because the
// scorer's refusal arrives after the entry is spent. Node 22, standard library only: the game
// itself is plain ES modules under game/, no library and no network request.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps (reference/gate.json). Only text_max_bytes shapes the dossier's bytes; the rest
// are checked here so a bad tree fails in a second rather than after the entry is spent.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

// What the entry must hold: the page that runs the game, and 3 or 4 renders with the cover first.
const REQUIRED = {
  entry: join('game', 'index.html'),
  coverMin: 3,
  coverMax: CAPS.screenshots.max,
  imageTypes: ['.png', '.jpg', '.jpeg'],
} as const;

function fail(message: string): never {
  console.error(`ember-yard: ${message}`);
  console.error('ember-yard: nothing was staged in /output.');
  process.exit(1);
}

function bytes(path: string): number {
  return statSync(path).size;
}

// Walk game/ once: the file count and byte sum the scorer caps, and the deepest path length. A
// directory counts as an entry, the way the platform counts it.
function measureGame(dir: string) {
  let files = 0;
  let total = 0;
  let longestPath = 0;
  let indexFound = false;

  const walk = (at: string): void => {
    files += 1;
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      files += 1;
      const size = bytes(full);
      total += size;
      const rel = relative(dir, full).split(sep).join('/');
      longestPath = Math.max(longestPath, Buffer.byteLength(rel, 'utf8'));
      if (rel === 'index.html') {
        indexFound = true;
        if (size > 1024 * 1024) fail(`game/index.html is ${size} bytes, over the 1 MiB the scorer reads`);
      }
    }
  };

  walk(dir);
  return { files, total, longestPath, indexFound };
}

function checkScreenshots(dir: string) {
  if (!existsSync(dir)) {
    fail(`no screenshots/ beside main.ts: the entry needs ${REQUIRED.coverMin} or ${REQUIRED.coverMax} renders of the game`);
  }
  const images = readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => REQUIRED.imageTypes.includes(name.slice(name.lastIndexOf('.')).toLowerCase()))
    .sort();

  if (images.length < REQUIRED.coverMin) {
    fail(`screenshots/ holds ${images.length} image${images.length === 1 ? '' : 's'} (${images.join(', ') || 'none'}): at least ${REQUIRED.coverMin} are needed, the first by name the cover`);
  }
  if (images.length > REQUIRED.coverMax) {
    fail(`screenshots/ holds ${images.length} images (${images.join(', ')}): at most ${REQUIRED.coverMax} are allowed, the first by name the cover`);
  }
  for (const name of images) {
    const size = bytes(join(dir, name));
    if (size > CAPS.screenshots.max_bytes) {
      fail(`screenshots/${name} is ${size} bytes, over the ${CAPS.screenshots.max_bytes}-byte cap; re-encode it smaller`);
    }
  }
  return images;
}

// ---- pre-flight: refuse before staging, so a bad tree never reaches /output ----
const gameDir = join(here, 'game');
if (!existsSync(gameDir)) fail('no game/ beside main.ts');

const measured = measureGame(gameDir);
if (!measured.indexFound) fail('game/index.html is missing: the page the browser loads is what the entry plays');
if (measured.files > CAPS.game_max_files) {
  fail(`game/ holds ${measured.files} entries, over the ${CAPS.game_max_files} the scorer allows`);
}
if (measured.total > CAPS.game_max_bytes) {
  fail(`game/ holds ${measured.total} bytes, over the ${CAPS.game_max_bytes} the scorer allows`);
}
if (measured.longestPath > CAPS.game_path_max_bytes) {
  fail(`a path under game/ is ${measured.longestPath} bytes, over the ${CAPS.game_path_max_bytes} the scorer allows`);
}

const images = checkScreenshots(join(here, 'screenshots'));

// ---- stage ----
// Clear what a previous run left, so a file removed from the tree cannot linger in /output and be
// graded as part of an entry that no longer has it.
for (const stale of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(out, stale), { recursive: true, force: true });
}
mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(
  `ember-yard: staged game/ (${measured.files} entries, ${(measured.total / 1024).toFixed(1)} KiB) `
  + `and ${images.length} screenshots (cover ${images[0]}), dossier ${(dossier.byteLength / 1024).toFixed(1)} KiB`,
);
