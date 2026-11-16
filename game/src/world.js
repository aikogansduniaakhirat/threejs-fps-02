// The map: a brick kiln yard at dusk, built from boxes. Every box is a wall the player collides
// with and a surface a bullet stops on. No models, no textures, no network: the whole yard is
// described by the BRICKS table below, so the layout can be read and changed in one place.
//
//   x runs east (+), z runs south (+), y is up. The defenders hold the north end (-z); the
//   attackers come from the south (+z) and plant on the kiln floor in the north west.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITE = { min: [-20, -10], max: [-5, 2], center: [-12.5, -4] };
export const SPAWNS = {
  ct: { x: 0, z: -18.5, yaw: Math.PI },
  t: [
    { x: -7, z: 18.5 },
    { x: 0, z: 19 },
    { x: 7, z: 18.5 },
    { x: 3.5, z: 19.5 },
  ],
};

// width, height, depth, x, y, z, material, tag. `y` is the centre of the box.
const BRICKS = [
  // ---- the shell: a 44 x 44 m yard, 7 m walls, open to the dusk sky ----
  [44, 0.6, 44, 0, -0.3, 0, 'ground'],
  [44, 7, 1, 0, 3.5, -22, 'brick'],
  [44, 7, 1, 0, 3.5, 22, 'brick'],
  [1, 7, 44, -22, 3.5, 0, 'brick'],
  [1, 7, 44, 22, 3.5, 0, 'brick'],

  // ---- the spine: one long wall down the middle with a gap at each end, so the yard is two
  // lanes joined north and south. Its ends are the two doorways an attacker must pick. ----
  [1.6, 4.4, 13, 0, 2.2, 0, 'brickDark'],
  [2.6, 4.4, 1.6, 0, 2.2, -6.6, 'brickDark'],
  [2.6, 4.4, 1.6, 0, 2.2, 6.6, 'brickDark'],

  // ---- the kiln: the site's landmark, a squat brick tower with a lit mouth. Cover on three
  // sides, a sightline over the top, and the only warm light in the yard. ----
  [7, 6, 6, -17.5, 3, -8.5, 'kiln'],
  [2.4, 3.2, 2.4, -13.2, 1.6, -11.4, 'brickDark'],
  [3.4, 1.0, 1.4, -14.4, 0.5, -3.2, 'brick'],
  [1.4, 1.0, 3.4, -10.2, 0.5, -8.2, 'brick'],

  // ---- west lane: a low wall to break the long sightline, crates to crouch behind ----
  [3.2, 3.0, 1.2, -19.4, 1.5, 2.4, 'brickDark'],
  [1.2, 1.1, 1.2, -18.6, 0.55, 7.2, 'metal'],
  [1.2, 1.1, 1.2, -14.2, 0.55, 12.4, 'metal'],
  [4.2, 1.0, 1.2, -11.4, 0.5, 6.2, 'brick'],

  // ---- the mid doorways: cover on both sides of the north gap so a defender can hold it ----
  [1.2, 1.2, 1.4, -2.6, 0.6, -9.4, 'metal'],
  [1.2, 1.2, 1.4, 2.6, 0.6, -9.4, 'metal'],
  [1.4, 3.0, 1.4, -3.4, 1.5, -12.6, 'brickDark'],
  [1.4, 3.0, 1.4, 3.4, 1.5, -12.6, 'brickDark'],

  // ---- east lane: the long way round, a raised ledge that a defender can hold, and crates ----
  [1.6, 3.2, 9, 8.4, 1.6, -6.5, 'brickDark'],
  [5.0, 0.7, 3.0, 15.4, 0.35, -13.0, 'metal'],
  [1.4, 1.1, 1.4, 18.6, 0.55, -18.2, 'metal'],
  [1.4, 1.1, 1.4, 12.2, 0.55, 2.2, 'metal'],
  [3.0, 1.6, 1.4, 17.4, 0.8, 8.6, 'brick'],

  // ---- south half: the attackers' approach, two mouths into the mid and cover down the lane --
  [1.4, 2.8, 1.4, -6.2, 1.4, 13.4, 'brickDark'],
  [1.4, 2.8, 1.4, 6.2, 1.4, 13.4, 'brickDark'],
  [3.6, 1.0, 1.4, -3.0, 0.5, 16.8, 'brick'],
  [3.6, 1.0, 1.4, 3.0, 0.5, 16.8, 'brick'],

  // ---- defender spawn pocket: two short walls, so the start is not a bare corner ----
  [1.2, 3.4, 5, -5.4, 1.7, -19.4, 'brickDark'],
  [1.2, 3.4, 5, 5.4, 1.7, -19.4, 'brickDark'],
  [1.2, 1.1, 1.2, -7.4, 0.55, -16.2, 'metal'],
  [1.2, 1.1, 1.2, 7.4, 0.55, -16.2, 'metal'],
];

// The routes the attackers walk: a waypoint graph laid over the lanes, every edge chosen so the
// straight line between its two nodes crosses no wall. A* over it gives a bot a route through
// the map that reads like a plan instead of a straight line into brick.
export const NAV = {
  nodes: [
    [0, -18.5], [-8, -17], [8, -17],            // 0-2  defender side
    [-15, -14], [15, -14], [0, -10],            // 3-5  north connectors
    [-12, -8], [-18, -3], [-9, -3],             // 6-8  the kiln floor
    [-14, 3], [-17, 10], [-8, 14],              // 9-11 west lane south
    [0, 10], [8, 14], [16, 10],                 // 12-14 mid south, east lane south
    [16, -2], [9, -5], [15, -13],               // 15-17 east lane mid
    [0, 19],                                    // 18   attacker spawn
  ],
  edges: [
    [0, 1], [0, 2], [0, 5], [1, 3], [2, 17], [3, 6], [6, 7], [7, 9], [9, 10], [10, 11],
    [11, 18], [6, 8], [8, 9], [5, 6], [4, 17], [4, 15], [15, 16], [16, 5], [16, 13],
    [13, 14], [14, 15], [13, 12], [12, 11], [11, 18], [14, 18], [12, 13], [9, 8], [17, 4],
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  group.name = 'kiln-yard';
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'glow' || name === 'ember' ? 0.5 : 0.94,
      metalness: name === 'metal' ? 0.45 : 0.04,
    });
  }

  const colliders = [];
  const shootables = [];
  const box = new THREE.BoxGeometry(1, 1, 1);

  for (const [w, h, d, x, y, z, material] of BRICKS) {
    const mesh = new THREE.Mesh(box, materials[material]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = material !== 'ground';
    mesh.receiveShadow = true;
    mesh.updateMatrixWorld();
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(w, h, d),
    ));
    shootables.push(mesh);
  }

  // The lit kiln mouth: a glowing panel and one warm point light that reads across the yard.
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.glow) }),
  );
  mouth.position.set(-14.0, 1.15, -5.52);
  mouth.rotation.y = Math.PI;
  group.add(mouth);

  const fire = new THREE.PointLight(new THREE.Color(PALETTE.ember), 26, 22, 2);
  fire.position.set(-14.0, 1.4, -4.6);
  group.add(fire);

  const chimney = new THREE.PointLight(new THREE.Color(PALETTE.ember), 8, 12, 2);
  chimney.position.set(-17.5, 6.2, -8.5);
  group.add(chimney);

  // Lighting: a bright dusk sky over warm ground bounce, one sharp key from the east so shadows
  // fall across the lanes, a cool rim from the north west that separates every silhouette from the
  // wall behind it, and a flat ambient term so no surface is ever crushed to pure black. In an FPS
  // the lighting is a gameplay tool: if an attacker cannot be read against a wall, the map is broken.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#9fb4cf'), new THREE.Color('#5b5142'), 2.5));
  scene.add(new THREE.AmbientLight(new THREE.Color('#6b7a8f'), 0.85));

  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9b8'), 2.6);
  key.position.set(20, 26, 12);
  key.target.position.set(-3, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(new THREE.Color(PALETTE.ct), 1.9);
  rim.position.set(-18, 14, -22);
  scene.add(rim);

  // A warm bounce off the kiln floor, so the site reads as the lit heart of the yard.
  const bounce = new THREE.DirectionalLight(new THREE.Color(PALETTE.ember), 0.7);
  bounce.position.set(-14, 2, -4);
  scene.add(bounce);

  return { colliders, shootables, group, nav: NAV, site: SITE };
}

// A* over the waypoint graph. Returns the node indices from start to goal, or null when no
// route exists. Held to the node table so a route can be reasoned about, and cheap enough to
// run once per bot per round.
export function findRoute(fromX, fromZ, toIndex) {
  const nodes = NAV.nodes;
  const count = nodes.length;
  const nearest = nearestNode(fromX, fromZ);
  const startIndex = nearest;
  const goalIndex = toIndex;
  const open = [startIndex];
  const gScore = new Float64Array(count).fill(Infinity);
  const fScore = new Float64Array(count).fill(Infinity);
  const cameFrom = new Int16Array(count).fill(-1);
  const closed = new Uint8Array(count);
  gScore[startIndex] = 0;
  fScore[startIndex] = Math.hypot(nodes[goalIndex][0] - nodes[startIndex][0], nodes[goalIndex][1] - nodes[startIndex][1]);

  while (open.length) {
    let bestAt = 0;
    for (let i = 1; i < open.length; i += 1) if (fScore[open[i]] < fScore[open[bestAt]]) bestAt = i;
    const current = open.splice(bestAt, 1)[0];
    if (current === goalIndex) {
      const path = [];
      let step = current;
      while (step !== -1) {
        path.push(step);
        step = cameFrom[step];
      }
      return path.reverse();
    }
    closed[current] = 1;
    for (const [a, b] of NAV.edges) {
      let next = -1;
      if (a === current) next = b;
      else if (b === current) next = a;
      if (next === -1 || closed[next]) continue;
      const tentative = gScore[current] + Math.hypot(nodes[next][0] - nodes[current][0], nodes[next][1] - nodes[current][1]);
      if (tentative >= gScore[next]) continue;
      cameFrom[next] = current;
      gScore[next] = tentative;
      fScore[next] = tentative + Math.hypot(nodes[goalIndex][0] - nodes[next][0], nodes[goalIndex][1] - nodes[next][1]);
      if (!open.includes(next)) open.push(next);
    }
  }
  return null;
}

export function nearestNode(x, z) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < NAV.nodes.length; i += 1) {
    const dx = NAV.nodes[i][0] - x;
    const dz = NAV.nodes[i][1] - z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export function inSite(x, z) {
  return x >= SITE.min[0] && x <= SITE.max[0] && z >= SITE.min[1] && z <= SITE.max[1];
}
