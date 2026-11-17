// The yard: a walled foundry, four gates, cover to fight around, and the kiln floor the attackers
// want. Everything is boxes so collision stays a list of rectangles the body can slide along, and
// the nav graph is the handful of points a route actually needs.

import * as THREE from 'three';
import { PALETTE, YARD } from './config.js';

function block(material, width, height, depth, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createYard(scene) {
  const colliders = [];   // { x, z, halfX, halfZ, tall } in the x/z plane
  const shootables = [];  // meshes a bullet can hit
  const group = new THREE.Group();
  scene.add(group);

  const mats = {
    ground: new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 0.98 }),
    concrete: new THREE.MeshStandardMaterial({ color: PALETTE.concrete, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ color: PALETTE.brick, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.5, metalness: 0.4 }),
    ember: new THREE.MeshStandardMaterial({
      color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.8, roughness: 0.6,
    }),
  };

  const halfW = YARD.width / 2;
  const halfD = YARD.depth / 2;

  // ---- floor, sky, and the kiln line ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(YARD.width + 10, YARD.depth + 10), mats.ground);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  shootables.push(floor);

  const kiln = new THREE.Mesh(new THREE.PlaneGeometry(YARD.width - 5, 4.5), mats.ember);
  kiln.rotation.x = -Math.PI / 2;
  kiln.position.set(0, 0.014, YARD.kilnFloor - 1.2);
  group.add(kiln);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(130, 18, 12),
    new THREE.MeshBasicMaterial({ color: PALETTE.sky, side: THREE.BackSide, fog: false }),
  );
  group.add(sky);

  // ---- the four walls ----
  const wallHeight = YARD.wallHeight;
  const walls = [
    block(mats.concrete, 1.4, wallHeight, YARD.depth, -halfW, wallHeight / 2, 0),
    block(mats.concrete, 1.4, wallHeight, YARD.depth, halfW, wallHeight / 2, 0),
    block(mats.concrete, YARD.width, wallHeight, 1.4, 0, wallHeight / 2, halfD),
    block(mats.concrete, YARD.width, wallHeight, 1.4, 0, wallHeight / 2, -halfD),
  ];
  for (const wall of walls) {
    group.add(wall);
    shootables.push(wall);
  }
  colliders.push({ x: -halfW, z: 0, halfX: 0.7, halfZ: halfD, tall: true });
  colliders.push({ x: halfW, z: 0, halfX: 0.7, halfZ: halfD, tall: true });
  colliders.push({ x: 0, z: halfD, halfX: halfW, halfZ: 0.7, tall: true });
  colliders.push({ x: 0, z: -halfD, halfX: halfW, halfZ: 0.7, tall: true });

  // ---- cover: crate stacks, a waist-high wall, two steel tanks ----
  const crates = [
    [10.5, 6.0], [12.4, 7.6], [9.2, 7.9],
    [-11.5, 3.2], [-13.4, 4.8], [-10.2, 5.1],
    [5.6, -6.8], [-6.2, -8.4],
  ];
  for (const [x, z] of crates) {
    const size = 1.7;
    const crate = block(mats.brick, size, 1.65, size, x, 1.65 / 2, z);
    group.add(crate);
    shootables.push(crate);
    colliders.push({ x, z, halfX: size / 2, halfZ: size / 2, tall: false });
  }

  const lowWall = block(mats.concrete, 13, 1.15, 0.95, 0, 0.575, 1.8);
  group.add(lowWall);
  shootables.push(lowWall);
  colliders.push({ x: 0, z: 1.8, halfX: 6.5, halfZ: 0.475, tall: false });

  for (const x of [-8.6, 8.6]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4.4, 16), mats.steel);
    tank.position.set(x, 2.2, -12.2);
    tank.castShadow = true;
    tank.receiveShadow = true;
    group.add(tank);
    shootables.push(tank);
    colliders.push({ x, z: -12.2, halfX: 1.5, halfZ: 1.5, tall: true });
  }

  // ---- overhead steel: trusses across the yard, which is what a foundry looks like from below
  // and also fills the empty band of sky a first-person camera otherwise stares into ----
  const trussMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.62, metalness: 0.42 });
  for (const z of [-13, -5.5, 2, 9.5, 17]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(YARD.width + 2, 0.28, 0.36), trussMaterial);
    beam.position.set(0, 8.6, z);
    beam.castShadow = true;
    group.add(beam);
    // A pair of thin hangers per beam, so the truss reads as structure and not a floating bar.
    for (const x of [-halfW + 3, 0, halfW - 3]) {
      const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), trussMaterial);
      hanger.position.set(x, 9.2, z);
      group.add(hanger);
    }
  }

  // ---- the furnace: the yard's reason to exist, and the silhouette the far wall was missing ----
  const furnace = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 11, 20), mats.brick);
  shell.position.set(-15, 5.5, -21);
  shell.castShadow = true;
  furnace.add(shell);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 12.5, 14), mats.steel);
  throat.position.set(-15, 15, -21);
  furnace.add(throat);
  // The mouth: a hot rectangle, the brightest thing in the scene, low enough to be in frame.
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 0.4), mats.ember);
  mouth.position.set(-15, 2.2, -18.6);
  furnace.add(mouth);
  const mouthGlow = new THREE.PointLight('#ff7a2a', 55, 32, 2);
  mouthGlow.position.set(-15, 2.6, -17.0);
  furnace.add(mouthGlow);
  group.add(furnace);
  shootables.push(shell);

  // ---- the gates: four ways in, each with a lamp so an arrival reads ----
  const gates = [
    { x: -halfW + 2.4, z: 13.5 },
    { x: halfW - 2.4, z: 11.5 },
    { x: -12.5, z: halfD - 2.4 },
    { x: 12.5, z: halfD - 2.4 },
  ];
  for (const gate of gates) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.6, 0.55), mats.ember);
    post.position.set(gate.x, 1.8, gate.z);
    group.add(post);
    const lamp = new THREE.PointLight(PALETTE.ember, 16, 13, 2);
    lamp.position.set(gate.x, 3.1, gate.z);
    group.add(lamp);
  }

  // ---- the nav graph ----
  const nodes = [
    { x: -halfW + 4, z: halfD - 4 },        // 0
    { x: halfW - 4, z: halfD - 4 },         // 1
    { x: -12, z: 10 },                      // 2
    { x: 12, z: 10 },                       // 3
    { x: 0, z: 8.5 },                       // 4
    { x: -9.5, z: 0 },                      // 5
    { x: 9.5, z: 0 },                       // 6
    { x: 0, z: -2.5 },                      // 7
    { x: -8.6, z: -8.5 },                   // 8
    { x: 8.6, z: -8.5 },                    // 9
    { x: 0, z: YARD.kilnFloor + 2.5 },      // 10
  ];
  const links = [
    [0, 2], [0, 4], [1, 3], [1, 4],
    [2, 4], [3, 4], [2, 5], [3, 6],
    [4, 5], [4, 6], [4, 7],
    [5, 7], [6, 7], [5, 8], [6, 9],
    [7, 8], [7, 9], [7, 10], [8, 10], [9, 10],
  ];

  const spawns = {
    player: { x: 0, z: YARD.kilnFloor + 5.5, yaw: Math.PI },
    attackers: gates.map((gate) => ({ x: gate.x, z: gate.z - 2.5 })),
  };

  return { group, colliders, shootables, nodes, links, spawns };
}

// Where an attacker holds once it has taken ground: a point with a facing that covers a lane.
export const HOLDINGS = [
  { node: 8, look: [-9.5, -6.0] },
  { node: 9, look: [9.5, -6.0] },
  { node: 2, look: [-8.0, 5.0] },
  { node: 3, look: [8.0, 5.0] },
  { node: 7, look: [0, -10.0] },
  { node: 4, look: [0, -4.0] },
];

// Shortest route through the nav graph, as a list of node indices. Eleven nodes, so a plain
// Dijkstra is clearer than a heap and fast enough to run on every spawn.
export function findRoute(nodes, links, from, to) {
  const adjacent = nodes.map(() => []);
  for (const [a, b] of links) {
    const weight = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
    adjacent[a].push([b, weight]);
    adjacent[b].push([a, weight]);
  }

  const best = new Array(nodes.length).fill(Infinity);
  const previous = new Array(nodes.length).fill(-1);
  const settled = new Array(nodes.length).fill(false);
  best[from] = 0;

  for (let step = 0; step < nodes.length; step += 1) {
    let at = -1;
    for (let i = 0; i < nodes.length; i += 1) {
      if (!settled[i] && (at === -1 || best[i] < best[at])) at = i;
    }
    if (at === -1 || best[at] === Infinity) break;
    settled[at] = true;
    for (const [next, weight] of adjacent[at]) {
      if (best[at] + weight < best[next]) {
        best[next] = best[at] + weight;
        previous[next] = at;
      }
    }
  }

  const route = [];
  for (let at = to; at !== -1; at = previous[at]) route.unshift(at);
  return route[0] === from ? route : [];
}

// The nav node nearest a point: an attacker spawned at a gate walks from the node it lands on.
export function nearestNode(nodes, x, z) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const distance = Math.hypot(nodes[i].x - x, nodes[i].z - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
