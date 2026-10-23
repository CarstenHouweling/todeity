import * as THREE from 'three';
import { MAP_HALF_SIZE } from './Map.js';
import {
  HOME,
  PATH,
  POND,
  TEA_TABLE,
  bush,
  insideArena,
  instanced,
  material,
  model,
  outsideArena,
  part,
  pick,
  pineTree,
  range,
  reseed,
  roundTree,
  scatterPoints,
  single,
} from './Environment.js';
import { buildSetShow, disposeSetShow } from './SetShows.js';

/**
 * The garden dressed up for its theme (Seasons.js): the four seasons and the celebrations. Each theme's builder
 * (`BUILDERS`) puts together pieces of a small kit: trees in other colours, things scattered over the lawn and the
 * meadow, a snow cover, something falling from the sky, critters, and shows borrowed from the garden sets
 * (SetShows.js: fireworks, sky lanterns, songbirds, butterflies). Nothing here blocks anything, so runs play the same.
 *
 * `apply(season)` switches at any time (⚙️ Settings, midnight): the trees swap their geometry (Divinity.js only hides
 * and shows those meshes, so its forms still work), some of the garden's own things hide (butterflies, flowers under
 * the snow), the rest is one group. A theme is built at its first use; switching to another frees it.
 */

const AUTUMN = ['#e8801a', '#d9601a', '#f0a020', '#c2402a', '#d9b03a'];
const AUTUMN_BUSH = ['#c2402a', '#d9601a', '#b8862a'];
const PUMPKIN = ['#f07a1a', '#e86a12', '#f58a26'];
const SEED = 20261031;

/** A ribbed pumpkin about 18 across and 13 high, its stem up (Y-up parts, like Environment.js). */
function pumpkinParts(colors = PUMPKIN) {
  const parts = [part(new THREE.SphereGeometry(9, 8, 6), colors[0], { position: [0, 6.5, 0], scale: [1, 0.72, 1] })];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 2;
    parts.push(
      part(new THREE.SphereGeometry(5.5, 6, 5), colors[1 + (i % 2)], {
        position: [Math.cos(angle) * 5, 6.5, Math.sin(angle) * 5],
        scale: [0.9, 1.15, 0.9],
      })
    );
  }
  parts.push(part(new THREE.CylinderGeometry(0.9, 1.4, 4.5, 5), '#5a6a2a', { position: [0.4, 13.6, 0], rotation: [0.15, 0, -0.2] }));
  return parts;
}

/**
 * A jack-o'-lantern's carved face: triangle eyes, a nose and a toothy grin, bent around the pumpkin's front so it
 * sits on the skin. Its own geometry (no vertex colours) for the flickering glow material.
 */
function faceGeometry() {
  const shapes = [];
  const triangle = (points) => shapes.push(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
  for (const s of [-1, 1]) triangle([[s * 1.4, 6.6], [s * 4.6, 6.6], [s * 3.2, 9.6]]);
  triangle([[-0.9, 5.4], [0.9, 5.4], [0, 6.8]]);
  // The grin: a wide crescent with two teeth up and one down.
  const mouth = [[-5.4, 4.6], [-3.8, 3.2], [-2.6, 2.6], [-2.2, 3.6], [-1.4, 2.4], [0.6, 2.2], [1.2, 3.2], [1.8, 2.3], [3.8, 3.2], [5.4, 4.6], [3.4, 3.9], [2.6, 4.6], [2, 3.8], [-0.8, 3.7], [-1.4, 4.6], [-2.2, 3.9]];
  triangle(mouth);
  const geometry = new THREE.ShapeGeometry(shapes);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    // On the skin: the body and the three lobes in front (see pumpkinParts), a hair outside them.
    const dy = y - 6.5;
    const shell = (cx, cz, rx, ry) => cz + rx * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2 - (dy / ry) ** 2));
    const z = Math.max(shell(0, 0, 9, 6.48), shell(0, 5, 4.95, 6.3), shell(-4.33, 2.5, 4.95, 6.3), shell(4.33, 2.5, 4.95, 6.3));
    positions.setZ(i, z + 0.35);
  }
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.deleteAttribute('uv');
  return geometry;
}

function gravestone(kind) {
  const stone = ['#8c8f99', '#9aa0a8', '#7f838c'][kind % 3];
  if (kind === 2) {
    // A little cross.
    return model([
      part(new THREE.BoxGeometry(3, 18, 3), stone, { position: [0, 9, 0] }),
      part(new THREE.BoxGeometry(11, 3, 3), stone, { position: [0, 13, 0] }),
      part(new THREE.BoxGeometry(8, 1.5, 6), '#6f8a3a', { position: [0, 0.4, 0] }),
    ]);
  }
  return model([
    part(new THREE.BoxGeometry(12, 13, 3.5), stone, { position: [0, 6.5, 0] }),
    part(new THREE.CylinderGeometry(6, 6, 3.5, 8, 1, false, 0, Math.PI), stone, { position: [0, 13, 0], rotation: [Math.PI / 2, 0, Math.PI / 2] }),
    part(new THREE.BoxGeometry(7, 1, 0.6), '#5f636c', { position: [0, 9, 1.9] }),
    part(new THREE.BoxGeometry(5, 1, 0.6), '#5f636c', { position: [0, 6.5, 1.9] }),
    part(new THREE.BoxGeometry(16, 1.5, 9), '#6f8a3a', { position: [0, 0.4, 2] }),
  ]);
}

function fallenLeaf(color) {
  return model([part(new THREE.CircleGeometry(2.4, 5), color, { position: [0, 0.35, 0], rotation: [-Math.PI / 2, 0, 0], scale: [1, 0.6, 1] })]);
}

/** A witch's cauldron of pumpkin-spice tea over a little fire: the pot is lit, the brew and the embers glow. */
function cauldron() {
  const profile = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    profile.push(new THREE.Vector2(Math.max(0.5, 11 * Math.sin(0.25 + t * 2.6)), t * 15));
  }
  profile.push(new THREE.Vector2(9.8, 15.6), new THREE.Vector2(9.2, 14.5));
  const pot = model([
    part(new THREE.LatheGeometry(profile, 10), '#2c2a32', { position: [0, 5, 0] }),
    part(new THREE.TorusGeometry(9.6, 1.2, 4, 12), '#3a3842', { position: [0, 20.2, 0], rotation: [Math.PI / 2, 0, 0] }),
    ...[0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2;
      return part(new THREE.BoxGeometry(2, 7, 2), '#2c2a32', { position: [Math.cos(a) * 8, 3, Math.sin(a) * 8] });
    }),
    ...[0, 1, 2].map((i) =>
      part(new THREE.CylinderGeometry(1.4, 1.4, 14, 5), '#6b4423', { position: [0, 1.2, 0], rotation: [Math.PI / 2, (i / 3) * Math.PI, 0] })
    ),
  ]);
  const brew = new THREE.CircleGeometry(9.4, 12);
  brew.translate(0, 0, 19.4);
  const embers = model([
    part(new THREE.IcosahedronGeometry(2.4, 0), '#ff7a1a', { position: [2, 2.4, 1] }),
    part(new THREE.IcosahedronGeometry(1.8, 0), '#ffb030', { position: [-2.4, 2.2, -1] }),
    part(new THREE.IcosahedronGeometry(1.6, 0), '#ff5a10', { position: [0, 2.6, -2.6] }),
  ]);
  return { pot, brew, embers };
}

function bat() {
  // A scalloped wing, flat in the world's XY plane, its leading edge toward the head (-y).
  const wing = new THREE.Shape();
  wing.moveTo(0, -0.6);
  wing.lineTo(3, -2.2);
  wing.lineTo(7.4, -1.6);
  wing.lineTo(6.2, -0.2);
  wing.lineTo(5, 0.6);
  wing.lineTo(3.6, -0.2);
  wing.lineTo(2.4, 0.8);
  wing.lineTo(0, 0.6);
  const wingGeometry = new THREE.ShapeGeometry(wing);
  const body = model([
    part(new THREE.SphereGeometry(1.3, 6, 4), '#2a2238', { scale: [1, 1, 1.6] }),
    part(new THREE.SphereGeometry(1, 6, 4), '#2a2238', { position: [0, 0.4, 2] }),
    part(new THREE.ConeGeometry(0.4, 1.2, 3), '#2a2238', { position: [-0.5, 1.4, 2.2] }),
    part(new THREE.ConeGeometry(0.4, 1.2, 3), '#2a2238', { position: [0.5, 1.4, 2.2] }),
  ]);
  return { wingGeometry, body };
}

/** A friendly ghost: a round head, a wavy hem, little arms and a surprised face. */
function ghost() {
  const profile = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    // From the hem (flared) up over the round head.
    const radius = t < 0.55 ? 7.4 - t * 2 + Math.sin(t * 9) * 0.3 : 6.3 * Math.sqrt(Math.max(0, 1 - ((t - 0.55) / 0.45) ** 2));
    profile.push(new THREE.Vector2(Math.max(0.01, radius), t * 22));
  }
  const lathe = new THREE.LatheGeometry(profile, 12);
  // A wavy hem: the bottom ring goes up and down.
  const positions = lathe.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) > 0.1) continue;
    const angle = Math.atan2(positions.getZ(i), positions.getX(i));
    positions.setY(i, Math.sin(angle * 6) * 1.4);
  }
  const arms = [-1, 1].map((s) => {
    const arm = new THREE.SphereGeometry(1.6, 6, 4);
    arm.scale(1.6, 0.8, 1);
    arm.translate(s * 7, 10, 1);
    return arm;
  });
  const body = mergeBody(lathe, ...arms);
  body.rotateX(Math.PI / 2);
  const face = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(1.1, 6, 4);
    eye.scale(1, 1.4, 0.6);
    eye.translate(s * 2.2, 15.6, 5.4);
    face.push(eye);
  }
  const mouth = new THREE.SphereGeometry(1, 6, 4);
  mouth.scale(1, 1.3, 0.6);
  mouth.translate(0, 12.4, 5.8);
  face.push(mouth);
  const faceGeometryMerged = mergeBody(...face);
  faceGeometryMerged.rotateX(Math.PI / 2);
  return { body, face: faceGeometryMerged };
}

/** Merges plain geometries (positions and normals only). */
function mergeBody(...geometries) {
  const clean = geometries.map((g) => {
    const copy = (g.index ? g.toNonIndexed() : g.clone());
    for (const name of Object.keys(copy.attributes)) if (name !== 'position') copy.deleteAttribute(name);
    return copy;
  });
  let count = 0;
  for (const g of clean) count += g.attributes.position.count;
  const positions = new Float32Array(count * 3);
  let offset = 0;
  for (const g of clean) {
    positions.set(g.attributes.position.array, offset);
    offset += g.attributes.position.array.length;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}


const TAU = Math.PI * 2;
/** Faces turned toward the gameplay camera (it looks from +x, -y), give or take. */
const towardCamera = () => Math.PI / 4 + range(-0.7, 0.7);

// --- More models (Y-up parts, like Environment.js) --------------------------------------------------------------

function tulip(color) {
  return model([
    part(new THREE.CylinderGeometry(0.45, 0.5, 9, 4), '#4f9d3a', { position: [0, 4.5, 0] }),
    part(new THREE.ConeGeometry(1.4, 5, 4), '#5fb046', { position: [1.1, 2.5, 0], rotation: [0, 0, -0.4] }),
    part(new THREE.CylinderGeometry(2, 1.2, 3.6, 6), color, { position: [0, 10.4, 0] }),
    ...[0, 1, 2].map((i) => part(new THREE.ConeGeometry(0.9, 1.8, 3), color, { position: [Math.cos(i * 2.1) * 1.3, 12.8, Math.sin(i * 2.1) * 1.3] })),
  ]);
}

/** A sunflower, its face toward +z (toward the camera once turned by `towardCamera`). */
function sunflower() {
  const parts = [
    part(new THREE.CylinderGeometry(0.8, 1, 30, 5), '#4f8a2e', { position: [0, 15, 0] }),
    part(new THREE.ConeGeometry(3, 6, 4), '#5fa03a', { position: [2.6, 12, 0], rotation: [0, 0, -1.1], scale: [1, 1, 0.4] }),
    part(new THREE.ConeGeometry(3, 6, 4), '#5fa03a', { position: [-2.6, 18, 0], rotation: [0, 0, 1.1], scale: [1, 1, 0.4] }),
    part(new THREE.CylinderGeometry(3.6, 3.6, 1.6, 10), '#5a3a1a', { position: [0, 32, 1], rotation: [Math.PI / 2, 0, 0] }),
  ];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU;
    parts.push(part(new THREE.BoxGeometry(2, 4.2, 0.6), i % 2 ? '#ffcf1a' : '#ffdd3a', { position: [Math.cos(a) * 5.4, 32 + Math.sin(a) * 5.4, 0.6], rotation: [0, 0, a - Math.PI / 2] }));
  }
  return model(parts);
}

function egg(color, stripe) {
  return model([
    part(new THREE.SphereGeometry(3, 7, 6), color, { position: [0, 3.6, 0], scale: [1, 1.3, 1] }),
    part(new THREE.TorusGeometry(2.95, 0.45, 3, 10), stripe, { position: [0, 3.9, 0], rotation: [Math.PI / 2, 0, 0] }),
    part(new THREE.TorusGeometry(2.4, 0.4, 3, 10), stripe, { position: [0, 6.2, 0], rotation: [Math.PI / 2, 0, 0] }),
  ]);
}

function basket() {
  const profile = [[0.5, 0], [6, 0.5], [8, 5], [8.6, 7]].map(([x, y]) => new THREE.Vector2(x, y));
  const eggShape = () => new THREE.SphereGeometry(2.2, 6, 5);
  return model([
    part(new THREE.LatheGeometry(profile, 10), '#b07a3a'),
    part(new THREE.TorusGeometry(7.6, 0.7, 4, 12, Math.PI), '#9a6a30', { position: [0, 7, 0] }),
    part(eggShape(), '#ffb7d5', { position: [-3, 7, 1], scale: [1, 1.3, 1] }),
    part(eggShape(), '#a8e0ff', { position: [2.6, 7.2, -1], scale: [1, 1.3, 1] }),
    part(eggShape(), '#fff27a', { position: [0, 7.6, 2.6], scale: [1, 1.3, 1] }),
  ]);
}

/** A snowman with a coal face, a carrot nose (toward +z), a scarf, a top hat and twig arms. */
function snowman() {
  const snow = '#dfe8ef';
  const parts = [
    part(new THREE.IcosahedronGeometry(9, 1), snow, { position: [0, 8, 0] }),
    part(new THREE.IcosahedronGeometry(6.5, 1), snow, { position: [0, 20, 0] }),
    part(new THREE.IcosahedronGeometry(4.6, 1), snow, { position: [0, 29.5, 0] }),
    part(new THREE.ConeGeometry(0.9, 4.5, 5), '#ff7a1a', { position: [0, 29.2, 6], rotation: [Math.PI / 2, 0, 0] }),
    part(new THREE.TorusGeometry(4.4, 1.2, 4, 10), '#d9443a', { position: [0, 25.6, 0], rotation: [Math.PI / 2, 0, 0] }),
    part(new THREE.BoxGeometry(2.2, 5, 0.8), '#d9443a', { position: [2.6, 22.4, 4.6], rotation: [0.2, 0, 0.2] }),
    part(new THREE.CylinderGeometry(3.6, 3.6, 0.8, 8), '#2a2a32', { position: [0, 33.6, 0] }),
    part(new THREE.CylinderGeometry(2.5, 2.5, 4.2, 8), '#2a2a32', { position: [0, 36, 0] }),
  ];
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), '#1a1a1a', { position: [s * 1.6, 31, 4] }));
    parts.push(part(new THREE.CylinderGeometry(0.45, 0.55, 11, 4), '#6b4423', { position: [s * 9.5, 23, 0], rotation: [0, 0, s * 1.05] }));
  }
  for (const y of [22, 18, 14]) parts.push(part(new THREE.BoxGeometry(1, 1, 1), '#1a1a1a', { position: [0, y, Math.sqrt(Math.max(0, (y > 16 ? 42 : 81) - (y - (y > 16 ? 20 : 8)) ** 2)) + 0.2] }));
  return model(parts);
}

/** A pine with snow on every tier (white caps a little fatter than the green, so they show). */
function snowyPine() {
  const parts = [part(new THREE.CylinderGeometry(2.5, 3.5, 14, 6), '#8a5a33', { position: [0, 7, 0] })];
  for (let i = 0; i < 3; i++) {
    const radius = 22 - i * 6;
    const middle = 20 + i * 13;
    parts.push(part(new THREE.ConeGeometry(radius, 26, 7), pick(['#2f6d3b', '#2a6434']), { position: [0, middle, 0], jitter: 1.2 }));
    parts.push(part(new THREE.ConeGeometry(radius * 0.62, 26 * 0.55, 7), '#f2f7fa', { position: [0, middle + 13 - 26 * 0.275 + 0.6, 0] }));
  }
  return model(parts);
}

function present(color, ribbon, size) {
  const h = size * 0.8;
  return model([
    part(new THREE.BoxGeometry(size, h, size), color, { position: [0, h / 2, 0] }),
    part(new THREE.BoxGeometry(size + 0.3, h + 0.3, size * 0.22), ribbon, { position: [0, h / 2, 0] }),
    part(new THREE.BoxGeometry(size * 0.22, h + 0.3, size + 0.3), ribbon, { position: [0, h / 2, 0] }),
    part(new THREE.BoxGeometry(size * 0.45, size * 0.3, size * 0.2), ribbon, { position: [-size * 0.22, h + size * 0.12, 0], rotation: [0, 0, 0.5] }),
    part(new THREE.BoxGeometry(size * 0.45, size * 0.3, size * 0.2), ribbon, { position: [size * 0.22, h + size * 0.12, 0], rotation: [0, 0, -0.5] }),
  ]);
}

function candyCane() {
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(part(new THREE.CylinderGeometry(0.9, 0.9, 3, 6), i % 2 ? '#ffffff' : '#e8263a', { position: [0, 1.5 + i * 3, 0] }));
  // The hook: an arc over the top.
  for (let i = 0; i < 5; i++) {
    const a = Math.PI - ((i + 0.5) / 5) * Math.PI;
    parts.push(part(new THREE.CylinderGeometry(0.9, 0.9, 2, 6), i % 2 ? '#e8263a' : '#ffffff', { position: [2.4 + Math.cos(a) * 2.4, 18 + Math.sin(a) * 2.4, 0], rotation: [0, 0, a] }));
  }
  return model(parts);
}

function haystack() {
  return model([
    part(new THREE.CylinderGeometry(11, 12, 12, 10), '#e0b84a', { position: [0, 6, 0], jitter: 0.8 }),
    part(new THREE.SphereGeometry(11, 10, 5, 0, TAU, 0, Math.PI / 2), '#e8c45a', { position: [0, 12, 0], scale: [1, 0.55, 1], jitter: 0.8 }),
  ]);
}

/** A lantern post: the pole, the arm and the lantern's golden caps (the paper glows on its own, `paperLantern`). */
function lanternPost() {
  return model([
    part(new THREE.CylinderGeometry(0.8, 1, 28, 5), '#5a2a1a', { position: [0, 14, 0] }),
    part(new THREE.BoxGeometry(7, 1, 1), '#5a2a1a', { position: [3, 27.5, 0] }),
    part(new THREE.CylinderGeometry(2.6, 2.6, 1, 8), '#e8b030', { position: [6, 25.6, 0] }),
    part(new THREE.CylinderGeometry(2.6, 2.6, 1, 8), '#e8b030', { position: [6, 17.8, 0] }),
    part(new THREE.CylinderGeometry(0.3, 0.3, 4, 4), '#e8b030', { position: [6, 15.4, 0] }),
  ]);
}

function paperLantern() {
  return model([part(new THREE.SphereGeometry(4.4, 8, 6), '#ffffff', { position: [6, 21.7, 0], scale: [1, 0.85, 1] })]);
}

function heartShape() {
  const heart = new THREE.Shape();
  heart.moveTo(5, 5);
  heart.bezierCurveTo(5, 5, 4, 0, 0, 0);
  heart.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  heart.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  heart.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  heart.bezierCurveTo(16, 7, 16, 0, 10, 0);
  heart.bezierCurveTo(7, 0, 5, 5, 5, 5);
  return heart;
}

/** A heart balloon about 11 across, standing up (Z-up), its knot at the origin. */
function heartBalloon() {
  const geometry = new THREE.ExtrudeGeometry(heartShape(), { depth: 3, bevelEnabled: true, bevelSize: 1.4, bevelThickness: 1.4, bevelSegments: 1, curveSegments: 5 });
  geometry.translate(-5, -19, -1.5); // the point (at y = 19 in the shape) to the origin
  geometry.rotateZ(Math.PI); // point down
  geometry.scale(0.55, 0.55, 0.55);
  geometry.rotateX(Math.PI / 2);
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  return geometry;
}

function flatHeart() {
  const geometry = new THREE.ShapeGeometry(heartShape(), 3);
  geometry.translate(-5, -10, 0);
  geometry.scale(0.11, -0.11, 0.11);
  return geometry;
}

// --- The kit -----------------------------------------------------------------------------------------------------
// A theme builder gets `k`: { env, group, updates, swaps, hide, shows, pollen, edge, particles, camera } and adds to it.

/** Trees in other colours: builders per kind (each returns a geometry); `keep`: meshes that stay as they are. */
function trees(k, { round, bushes, pine, keep = [] }) {
  const builders = { roundTree: round, bush: bushes, pineTree: pine };
  for (const { kind, mesh } of [...k.env.gardenProps, ...k.env.forestMeshes]) {
    if (!builders[kind] || keep.includes(mesh)) continue;
    k.swaps.push({ mesh, plain: mesh.geometry, look: builders[kind]() });
  }
}

const onLawn = (k, count, spacing) => scatterPoints(count, { inside: insideArena(16), spacing, avoid: k.env.blocked });
const inMeadow = (k, count, spacing, from = 20, to = 520) => scatterPoints(count, { inside: outsideArena(from, to), spacing, avoid: k.env.keepClear });
/** The meadow behind the far fence (+y), where the gameplay camera looks. */
const farMeadow = (k, count, spacing) =>
  scatterPoints(count, { inside: () => [range(-k.edge + 40, k.edge - 120), range(k.edge + 40, k.edge + 190)], spacing, avoid: k.env.keepClear });
/** Just inside the fence, all round. */
const byFence = (k, count, spacing = 60) =>
  scatterPoints(count, {
    inside: () => {
      const along = range(-k.edge + 60, k.edge - 60);
      const off = k.edge - range(14, 26);
      return [[along, off], [along, -off], [off, along], [-off, along]][Math.floor(range(0, 4))];
    },
    spacing,
    avoid: k.env.blocked,
  });
/** Beside the path, every stretch: one side each (`alternate`) or both. */
const besidePath = (offset = 30, alternate = true) =>
  PATH.slice(0, -1).flatMap(([x, y], i) => {
    const [nx, ny] = PATH[i + 1];
    const length = Math.hypot(nx - x, ny - y);
    return (alternate ? [i % 2 ? 1 : -1] : [-1, 1]).map((side) => ({
      x: (x + nx) / 2 + ((ny - y) / length) * offset * side,
      y: (y + ny) / 2 - ((nx - x) / length) * offset * side,
    }));
  });

const scaled = (points, min, max) => points.map((p) => ({ ...p, scale: range(min, max) }));
const facing = (points) => points.map((p) => ({ ...p, rotation: towardCamera() }));

function fallenLeaves(k, colors = ['#d9601a', '#e8a020', '#b8401f', '#c89040']) {
  colors.forEach((color) => {
    const inside = scatterPoints(70, { inside: insideArena(10), spacing: 16, avoid: [{ x: POND.x, y: POND.y, radius: POND.radius + 6 }] });
    k.group.add(instanced(fallenLeaf(color), scaled([...inside, ...inMeadow(k, 120, 18, 4, 600)], 0.8, 1.5), { shadows: false }));
  });
}

function pumpkinPatch(k, outside = 46, inside = 10) {
  k.group.add(instanced(model(pumpkinParts()), scaled([...inMeadow(k, outside, 30), ...byFence(k, inside)], 0.6, 1.25)));
}

/**
 * Bits falling from the sky over the whole garden, over and over: snow, petals, leaves, confetti, hearts. One
 * instanced mesh; `lit`: shaded by the sun (leaves, petals) instead of flat (snow, confetti).
 */
function faller(k, { geometry, colors, count = 220, speed = 18, sway = 12, spin = 2, size = 1, top = 170, lit = false, bright = 1 }) {
  const look = lit ? new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }) : new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  if (bright !== 1) look.color.setScalar(bright);
  const mesh = new THREE.InstancedMesh(geometry, look, count);
  mesh.frustumCulled = false;
  const color = new THREE.Color();
  const reach = k.edge + 180;
  const spot = () => (Math.random() * 2 - 1) * reach;
  const bits = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, color.set(colors[i % colors.length]));
    return { x: spot(), y: spot(), z: Math.random() * top, speed: speed * (0.7 + Math.random() * 0.6), phase: Math.random() * TAU, size: size * (0.7 + Math.random() * 0.6) };
  });
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  k.group.add(mesh);
  k.updates.push((time, delta) => {
    for (let i = 0; i < count; i++) {
      const bit = bits[i];
      bit.z -= bit.speed * Math.min(delta, 0.1);
      if (bit.z < 0) Object.assign(bit, { z: bit.z + top, x: spot(), y: spot() });
      position.set(bit.x + Math.sin(time * 0.8 + bit.phase) * sway, bit.y + Math.cos(time * 0.6 + bit.phase) * sway, bit.z);
      rotation.setFromEuler(euler.set(time * spin + bit.phase, time * spin * 0.7, bit.phase));
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale.setScalar(bit.size)));
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/** A show from a garden set (SetShows.js) at a spot: fireworks ('champions'), sky lanterns ('temple'), songbirds… */
function show(k, id, at) {
  const built = buildSetShow({ id }, { particles: k.particles, camera: k.camera });
  built.group.position.set(at.x, at.y, 0);
  k.group.add(built.group);
  k.shows.push(built);
  k.updates.push((time, delta, night) => built.update(time, delta, night));
}

/** Little glowing things (fairy lights, ornaments) that twinkle through their colours. */
function twinkling(k, points, colors, { size = 1.4, rate = 0.7, bright = 1.6 } = {}) {
  const look = new THREE.MeshBasicMaterial();
  look.color.setScalar(bright); // over the bloom's threshold: they glow
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(size, 0), look, points.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  points.forEach((p, i) => mesh.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z ?? 0)));
  let step = -1;
  k.group.add(mesh);
  k.updates.push((time) => {
    const now = Math.floor(time / rate);
    if (now === step) return;
    step = now;
    for (let i = 0; i < points.length; i++) {
      color.set(colors[(i + now) % colors.length]);
      if ((i * 7 + now) % 5 === 0) color.multiplyScalar(0.35); // a few dim at a time
      mesh.setColorAt(i, color);
    }
    mesh.instanceColor.needsUpdate = true;
  });
}

/** Fairy lights along the top rail of the fence. */
function fenceLights(k, colors) {
  const spots = [];
  const offset = k.edge + 4;
  for (let t = -k.edge + 80; t <= k.edge - 80; t += 12) {
    const z = 17.5 - Math.abs(Math.sin((t / 30) * Math.PI)) * 1.6; // sagging between the posts
    for (const [x, y] of [[t, offset], [t, -offset], [offset, t], [-offset, t]]) spots.push({ x, y, z });
  }
  twinkling(k, spots, colors);
}

/** Snow over the lawn (the path and the pond stay clear) and the meadow; the flowers and mushrooms go under it. */
function snowCover(k) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f2f7fb';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(190, 212, 235, 0.35)' : 'rgba(255, 255, 255, 0.7)';
    const dot = 1 + Math.random() * 5;
    g.fillRect(Math.random() * size, Math.random() * size, dot, dot);
  }
  const scale = size / (k.edge * 2);
  const at = ([x, y]) => [(x + k.edge) * scale, (k.edge - y) * scale];
  g.globalCompositeOperation = 'destination-out';
  g.lineCap = g.lineJoin = 'round';
  // The trodden path, with soft edges.
  for (const [width, alpha] of [[46, 0.3], [36, 0.55], [26, 0.85]]) {
    g.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    g.lineWidth = width * scale;
    g.beginPath();
    PATH.forEach((p, i) => (i ? g.lineTo(...at(p)) : g.moveTo(...at(p))));
    g.stroke();
  }
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(...at([POND.x, POND.y]), (POND.radius + 6) * scale, 0, TAU);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Snow is darker than white: lit by the sun, white went past the bloom's threshold and hazed the whole screen.
  const snow = new THREE.MeshLambertMaterial({ map: texture, transparent: true, depthWrite: false });
  snow.color.setScalar(0.64);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(k.edge * 2, k.edge * 2), snow);
  lawn.position.z = 0.15;
  lawn.receiveShadow = true;
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: new THREE.Color('#eaf1f7').multiplyScalar(0.64) }));
  meadow.position.z = -0.3;
  meadow.receiveShadow = true;
  k.group.add(lawn, meadow);
  k.hide.push(...k.env.flowers, ...k.env.mushrooms);
}

// --- The themes ------------------------------------------------------------------------------------------------------
const BLOSSOM = ['#ffb7d5', '#ff9ec7', '#ffd1e3', '#ffffff'];
const PLUM = ['#ff5a7a', '#ff8aa0', '#ffd1dc', '#e8304a'];
const SNOWY = ['#eef4f8', '#dde8ee', '#eef4f8', '#5a7a5a'];
const petal = () => new THREE.CircleGeometry(1.4, 5).scale(1, 0.6, 1);

function springTime(k) {
  trees(k, { round: () => roundTree(BLOSSOM, '#9a6a40'), bushes: () => bush(['#ff9ec7', '#ffffff', '#f78fb3']) });
  ['#e8263a', '#ffd23f', '#ff8ac8', '#b48cff', '#ffffff'].forEach((color) => {
    k.group.add(instanced(tulip(color), scaled([...onLawn(k, 22, 20), ...inMeadow(k, 40, 22, 6, 480)], 0.9, 1.3), { shadows: false }));
  });
  faller(k, { geometry: petal(), colors: BLOSSOM, count: 180, speed: 10, sway: 18, lit: true });
  show(k, 'birdsong', { x: 60, y: 120 });
  show(k, 'birdsong', { x: -200, y: -120 });
  k.pollen = '#fff0f6';
}

function winterTime(k, { keep = [] } = {}) {
  snowCover(k);
  trees(k, { round: () => roundTree(SNOWY, '#7a5a3a'), bushes: () => bush(SNOWY), pine: snowyPine, keep });
  k.group.add(instanced(snowman(), facing(scaled([{ x: 150, y: 40 }, { x: -150, y: -110 }, { x: -260, y: k.edge + 90 }, { x: k.edge + 70, y: -200 }], 0.9, 1.15))));
  faller(k, { geometry: new THREE.IcosahedronGeometry(0.9, 0), colors: ['#ffffff', '#f2f8ff', '#e4f0ff'], count: 600, speed: 22, sway: 10, spin: 1 });
  k.hide.push(...k.env.butterflies);
  k.pollen = '#ffffff';
}

/** The garden's pine on the far side (the one the gameplay camera sees best), for the Winter Holidays' tree. */
const holidayPine = (k) => k.env.gardenProps.find(({ kind, mesh }) => kind === 'pineTree' && mesh.position.y > 0)?.mesh;

const BUILDERS = {
  spring: springTime,

  easter(k) {
    springTime(k);
    const colors = [['#ffb7d5', '#ffffff'], ['#a8e0ff', '#ffe680'], ['#fff27a', '#ff9ec7'], ['#b8f0a0', '#b48cff'], ['#d8b8ff', '#ffffff'], ['#ffc89a', '#7fd0ff']];
    const eggs = facing(scaled([...onLawn(k, 42, 26), ...inMeadow(k, 30, 40, 6, 400)], 0.9, 1.3));
    colors.forEach(([color, stripe], i) => k.group.add(instanced(egg(color, stripe), eggs.filter((_, j) => j % colors.length === i), { tint: 0.05 })));
    k.group.add(single(basket(), { x: HOME.x + 78, y: HOME.y - 30, rotation: 0.6, prop: false, look: material }));
  },

  summer(k) {
    const sunflowers = [];
    for (let x = -k.edge + 100; x <= k.edge - 100; x += 26) sunflowers.push({ x: x + range(-6, 6), y: k.edge - 18 + range(-4, 4) });
    for (let y = -k.edge + 100; y <= k.edge - 160; y += 30) sunflowers.push({ x: -k.edge + 18 + range(-4, 4), y: y + range(-6, 6) });
    k.group.add(instanced(sunflower(), facing(scaled([...sunflowers, ...farMeadow(k, 30, 26)], 0.85, 1.2)).map((p) => ({ ...p, rotation: Math.PI / 4 + range(-0.3, 0.3) }))));
    // A parasol and a deckchair by the pond.
    const at = { x: POND.x - POND.radius - 24, y: POND.y - 46 };
    const stripes = Array.from({ length: 8 }, (_, i) =>
      part(new THREE.ConeGeometry(17, 7, 1, 1, true, (i / 8) * TAU, TAU / 8), i % 2 ? '#ffffff' : '#ff5a4a', { position: [0, 30, 0] })
    );
    k.group.add(
      single(model([part(new THREE.CylinderGeometry(0.7, 0.7, 30, 5), '#f4f1ea', { position: [0, 15, 0] }), ...stripes]), { ...at, prop: false, look: material }),
      single(
        model([
          part(new THREE.BoxGeometry(10, 1, 16), '#5fb8ff', { position: [0, 5, 0], rotation: [0.35, 0, 0] }),
          ...[-1, 1].map((s) => part(new THREE.BoxGeometry(1, 6, 16), '#b58250', { position: [s * 5, 3, 0], rotation: [0.35, 0, 0] })),
        ]),
        { x: at.x + 16, y: at.y - 10, rotation: 0.9, prop: false, look: material }
      )
    );
    show(k, 'harvest', { x: -60, y: 60 });
    show(k, 'harvest', { x: 120, y: -150 });
    k.pollen = '#ffe9a0';
  },

  autumn(k) {
    trees(k, { round: () => roundTree(AUTUMN), bushes: () => bush(AUTUMN_BUSH) });
    fallenLeaves(k);
    pumpkinPatch(k, 24, 6);
    k.group.add(instanced(haystack(), scaled([...farMeadow(k, 5, 70), ...inMeadow(k, 4, 120, 40, 300)], 0.8, 1.2)));
    faller(k, { geometry: petal().scale(1.4, 1.4, 1), colors: AUTUMN, count: 120, speed: 12, sway: 22, spin: 2.6, lit: true });
    k.pollen = '#ffd8a0';
  },

  halloween(k) {
    trees(k, { round: () => roundTree(AUTUMN), bushes: () => bush(AUTUMN_BUSH) });
    fallenLeaves(k);
    pumpkinPatch(k);
    spooky(k);
    k.hide.push(...k.env.butterflies);
    k.pollen = '#ffc48a';
  },

  winter: winterTime,

  winterfest(k) {
    const pine = holidayPine(k);
    winterTime(k, { keep: pine ? [pine] : [] });
    if (pine) {
      // Ornaments on the cones of the garden's pine, a star on top, presents underneath.
      const s = pine.scale.x;
      const ornaments = [];
      for (let tier = 0; tier < 3; tier++) {
        const radius = 22 - tier * 6;
        const middle = 20 + tier * 13;
        for (let i = 0; i < 12 - tier * 3; i++) {
          const y = middle - 10 + range(0, 15);
          const r = radius * (1 - (y - (middle - 13)) / 26) + 1;
          const a = range(0, TAU);
          ornaments.push({ x: pine.position.x + Math.cos(a) * r * s, y: pine.position.y + Math.sin(a) * r * s, z: y * s });
        }
      }
      twinkling(k, ornaments, ['#ff3a3a', '#ffd23f', '#5fb8ff', '#ffffff', '#ff8ac8'], { size: 1.8, rate: 0.9, bright: 1.3 });
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(4, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23f').multiplyScalar(1.6) }));
      star.position.set(pine.position.x, pine.position.y, 61 * s);
      k.group.add(star);
      k.updates.push((time) => (star.rotation.z = time * 0.8));
      const gifts = [['#d4262e', '#ffd23f', 8], ['#3a8a4a', '#ffffff', 6], ['#5fb8ff', '#ff3a6a', 7], ['#ffd23f', '#d4262e', 5], ['#b48cff', '#ffffff', 6]];
      gifts.forEach(([color, ribbon, size], i) => {
        const a = -0.8 + i * 0.5;
        k.group.add(single(present(color, ribbon, size), { x: pine.position.x + Math.cos(a) * 24, y: pine.position.y - Math.abs(Math.sin(a)) * 22 - 4, rotation: range(0, 1), prop: false, look: material }));
      });
    }
    fenceLights(k, ['#ff3a3a', '#ffd23f', '#3ad86a', '#5fb8ff']);
    k.group.add(instanced(candyCane(), besidePath(26, false).map((p) => ({ ...p, rotation: towardCamera(), scale: 0.9 }))));
  },

  newyear(k) {
    winterTime(k);
    show(k, 'champions', { x: -120, y: 160 });
    show(k, 'champions', { x: 150, y: 220 });
    show(k, 'champions', { x: -230, y: -60 });
    faller(k, { geometry: new THREE.PlaneGeometry(1.8, 0.9), colors: ['#ff5a7a', '#ffd23f', '#5fb8ff', '#7ed957', '#c58aff', '#ffffff'], count: 260, speed: 14, sway: 14, spin: 5 });
    fenceLights(k, ['#ffd23f', '#ffffff', '#ffe9a0']);
  },

  lunar(k) {
    trees(k, { round: () => roundTree(PLUM, '#5a3020'), bushes: () => bush(PLUM) });
    const posts = facing([...besidePath(28, false), { x: TEA_TABLE.x + 30, y: TEA_TABLE.y + 30 }, { x: POND.x - POND.radius - 16, y: POND.y - 26 }, { x: HOME.x + 76, y: HOME.y - 44 }]);
    k.group.add(instanced(lanternPost(), posts));
    const paper = new THREE.MeshBasicMaterial({ color: '#ff3a24' });
    const glow = new THREE.Color('#ff3a24');
    k.group.add(instanced(paperLantern(), posts, { shadows: false, tint: 0, surface: paper }));
    k.updates.push((time) => paper.color.copy(glow).multiplyScalar(1.15 + Math.sin(time * 3.1) * 0.08 + Math.sin(time * 7.7) * 0.05));
    show(k, 'temple', { x: -160, y: 60 });
    show(k, 'temple', { x: 150, y: 230 });
    faller(k, { geometry: petal(), colors: ['#ff5a7a', '#ffd1dc', '#ffcf3a'], count: 120, speed: 9, sway: 18, lit: true });
    k.pollen = '#ffd36b';
  },

  valentine(k) {
    trees(k, { bushes: () => bush(['#c2203a', '#e8264e', '#3f9a45', '#ff7a9a']) });
    // Heart balloons on strings, bobbing.
    const spots = [...besidePath(34, false), { x: TEA_TABLE.x + 28, y: TEA_TABLE.y + 26 }, { x: HOME.x + 74, y: HOME.y - 36 }, { x: POND.x - POND.radius - 12, y: POND.y + 10 }, { x: 60, y: -160 }];
    const balloons = new THREE.InstancedMesh(heartBalloon(), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }), spots.length);
    const strings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 3).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: '#f4f1ea' }), spots.length);
    balloons.castShadow = true;
    const color = new THREE.Color();
    spots.forEach((_, i) => balloons.setColorAt(i, color.set(['#e8264e', '#ff5a8a', '#ff8ab0', '#d4123a'][i % 4])));
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    const heights = spots.map(() => range(30, 44));
    k.group.add(balloons, strings);
    k.updates.push((time) => {
      spots.forEach((p, i) => {
        const z = heights[i] + Math.sin(time * 1.4 + i) * 2.5;
        const sway = Math.sin(time * 0.9 + i * 2) * 0.12;
        balloons.setMatrixAt(i, matrix.compose(position.set(p.x, p.y, z), rotation.setFromEuler(euler.set(sway, 0, Math.PI / 4 + Math.sin(time * 0.5 + i) * 0.3)), scale.set(1, 1, 1)));
        strings.setMatrixAt(i, matrix.compose(position.set(p.x, p.y, 0), rotation.setFromEuler(euler.set(sway * 0.5, 0, 0)), scale.set(1, 1, z)));
      });
      balloons.instanceMatrix.needsUpdate = strings.instanceMatrix.needsUpdate = true;
    });
    faller(k, { geometry: flatHeart(), colors: ['#ff5a8a', '#ff8ab0', '#e8264e', '#ffd1e3'], count: 150, speed: 9, sway: 16, spin: 1.6, size: 1.6 });
    k.pollen = '#ffd1e3';
  },
};

/** Halloween's own: jack-o'-lanterns, a cauldron, gravestones, ghosts and bats. */
function spooky(k) {
  const { group, updates, edge } = k;
  const { keepClear } = k.env;
  // Jack-o'-lanterns: along the path, by the house, the tea table, the pond and every hive.
  const lanterns = scaled(besidePath(30), 0.75, 0.95);
  lanterns.push(
    { x: HOME.x + 70, y: HOME.y - 40, scale: 1 },
    { x: HOME.x + 40, y: HOME.y - 72, scale: 0.8 },
    { x: TEA_TABLE.x + 4, y: TEA_TABLE.y - 3, z: 15, scale: 0.36 },
    { x: POND.x - POND.radius - 14, y: POND.y - 20, scale: 0.9 },
    { x: POND.x + 10, y: POND.y - POND.radius - 16, scale: 0.75 }
  );
  const hive = edge + 38;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) lanterns.push({ x: sx * (hive - 48), y: sy * (hive - 6), scale: 0.85 });
  for (const lantern of lanterns) lantern.rotation = towardCamera();
  // The big one out in the meadow, where the gameplay camera looks (-x, +y).
  lanterns.push({ x: -150, y: edge + 120, scale: 3.2, rotation: Math.PI / 4 });
  const lanternGlow = new THREE.MeshBasicMaterial({ color: '#ffa030' });
  const glowColor = new THREE.Color('#ffa030');
  const lanternBodies = instanced(model(pumpkinParts(['#e8701a', '#dc6212', '#ef8220'])), lanterns, { tint: 0.08 });
  const faces = instanced(faceGeometry(), lanterns, { shadows: false, tint: 0, surface: lanternGlow });
  group.add(lanternBodies, faces);
  updates.push((time) => {
    // Candlelight: two slow waves and a quick one, never dark.
    const flicker = 1.05 + Math.sin(time * 7.3) * 0.12 + Math.sin(time * 13.1 + 1.7) * 0.08 + Math.sin(time * 2.1) * 0.1;
    lanternGlow.color.copy(glowColor).multiplyScalar(flicker);
  });

  // The cauldron by the tea table, bubbling over.
  const pot = cauldron();
  const at = { x: TEA_TABLE.x + 44, y: TEA_TABLE.y + 34 };
  group.add(single(pot.pot, { ...at, prop: false, look: material }));
  const brewGlow = new THREE.MeshBasicMaterial({ color: '#8aff5a' });
  const brew = new THREE.Mesh(pot.brew, brewGlow);
  brew.position.set(at.x, at.y, 0);
  const embers = new THREE.Mesh(pot.embers, new THREE.MeshBasicMaterial({ vertexColors: true }));
  embers.position.set(at.x, at.y, 0);
  group.add(brew, embers);
  const bubbleGeometry = new THREE.IcosahedronGeometry(1.6, 0);
  const bubbles = Array.from({ length: 6 }, (_, i) => {
    const bubble = new THREE.Mesh(bubbleGeometry, brewGlow);
    bubble.userData = { phase: i / 6, angle: range(0, Math.PI * 2), radius: range(1, 6) };
    group.add(bubble);
    return bubble;
  });
  updates.push((time) => {
    for (const bubble of bubbles) {
      const { phase, angle, radius } = bubble.userData;
      const k = (time * 0.7 + phase) % 1;
      bubble.position.set(at.x + Math.cos(angle) * radius, at.y + Math.sin(angle) * radius, 19.6 + k * 14);
      bubble.scale.setScalar(Math.sin(k * Math.PI) * (0.8 + phase * 0.6) + 0.01);
    }
    embers.scale.setScalar(0.9 + Math.sin(time * 9) * 0.08);
  });

  // Gravestones in the meadow behind the fence, leaning this way and that.
  const graves = scatterPoints(18, {
    inside: () => [range(-edge + 40, edge - 120), range(edge + 40, edge + 190)],
    spacing: 36,
    avoid: keepClear,
  });
  [0, 1, 2].forEach((kind) => {
    const spots = graves.filter((_, i) => i % 3 === kind).map((p) => ({ ...p, rotation: range(-0.35, 0.35), scale: range(0.9, 1.3) }));
    group.add(instanced(gravestone(kind), spots, { tint: 0.2 }));
  });

  // Friendly ghosts drifting about the meadow (and one over the pond).
  const ghostShape = ghost();
  const ghostLook = new THREE.MeshStandardMaterial({
    color: '#f2f4ff',
    emissive: '#aab8ff',
    emissiveIntensity: 0.35,
    roughness: 0.6,
    transparent: true,
    opacity: 0.82,
    flatShading: true,
  });
  const ghostFace = new THREE.MeshBasicMaterial({ color: '#2a2238' });
  const ghostSpots = [
    { x: 120, y: edge + 130 },
    { x: -edge - 110, y: 60 },
    { x: -320, y: edge + 90 },
    { x: edge + 120, y: -160 },
    { x: POND.x, y: POND.y },
  ];
  const ghosts = ghostSpots.map((spot, i) => {
    const ghostGroup = new THREE.Group();
    const body = new THREE.Mesh(ghostShape.body, ghostLook);
    body.castShadow = true;
    ghostGroup.add(body, new THREE.Mesh(ghostShape.face, ghostFace));
    ghostGroup.userData = { ...spot, radius: range(20, 45), speed: range(0.25, 0.45) * (i % 2 ? 1 : -1), phase: range(0, Math.PI * 2), lift: i === 4 ? 14 : 8 };
    ghostGroup.scale.setScalar(i === 4 ? 0.8 : 1);
    group.add(ghostGroup);
    return ghostGroup;
  });
  updates.push((time) => {
    for (const ghostGroup of ghosts) {
      const { x, y, radius, speed, phase, lift } = ghostGroup.userData;
      const angle = time * speed + phase;
      ghostGroup.position.set(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.7, lift + Math.sin(time * 1.6 + phase) * 4);
      // Looking toward the camera (their faces are the point), with a lazy sway.
      ghostGroup.rotation.z = Math.PI / 4 + Math.sin(time * 0.7 + phase) * 0.6;
      ghostGroup.rotation.x = Math.sin(time * 1.3 + phase) * 0.08;
    }
  });

  // Bats flit over the garden where the butterflies were.
  const batShape = bat();
  const batLook = new THREE.MeshLambertMaterial({ color: '#2a2238', side: THREE.DoubleSide });
  const bats = Array.from({ length: 10 }, () => {
    const batGroup = new THREE.Group();
    const body = new THREE.Mesh(batShape.body, batLook);
    const left = new THREE.Mesh(batShape.wingGeometry, batLook);
    const right = new THREE.Mesh(batShape.wingGeometry, batLook);
    right.scale.x = -1;
    batGroup.add(body, left, right);
    batGroup.userData = {
      left,
      right,
      center: new THREE.Vector2(range(-edge, edge), range(-edge, edge)),
      radius: range(50, 130),
      speed: range(0.5, 0.9) * (range(0, 1) < 0.5 ? -1 : 1),
      phase: range(0, Math.PI * 2),
      height: range(55, 95),
    };
    group.add(batGroup);
    return batGroup;
  });
  updates.push((time) => {
    for (const batGroup of bats) {
      const { left, right, center, radius, speed, phase, height } = batGroup.userData;
      const angle = time * speed + phase;
      // A wobbly loop, dipping now and then.
      batGroup.position.set(
        center.x + Math.cos(angle) * radius + Math.sin(angle * 3) * 12,
        center.y + Math.sin(angle * 1.4) * radius * 0.8,
        height + Math.sin(time * 2.3 + phase) * 10
      );
      batGroup.rotation.z = angle + (Math.PI / 2) * Math.sign(speed) + Math.PI / 2; // head (-y) first
      const flap = Math.sin(time * 16 + phase) * 0.9;
      left.rotation.y = flap;
      right.rotation.y = -flap;
    }
  });
}

/** Puts a builder's pieces together: `apply(on)`, `update(time, delta, night)`, `dispose()`. */
function build(id, environment, { particles, camera }) {
  reseed(SEED); // the same decorations every time
  const k = { env: environment, group: new THREE.Group(), updates: [], swaps: [], hide: [], shows: [], pollen: null, edge: MAP_HALF_SIZE, particles, camera };
  BUILDERS[id](k);
  return {
    group: k.group,
    apply(on) {
      for (const swap of k.swaps) swap.mesh.geometry = on ? swap.look : swap.plain;
      for (const object of k.hide) object.visible = !on;
      if (k.pollen) environment.pollen.material.color.set(on ? k.pollen : '#fffbe0');
      k.group.visible = on;
    },
    update(time, delta, night) {
      for (const update of k.updates) update(time, delta, night);
    },
    dispose() {
      this.apply(false); // the plain trees back first, so the world's own clean-up frees them; the others go here
      for (const swap of k.swaps) swap.look.dispose();
      for (const built of k.shows) disposeSetShow(built); // (their shared geometry stays)
      k.group.removeFromParent();
      k.group.traverse((child) => {
        child.geometry?.dispose();
        if (child.material && child.material !== material) child.material.dispose();
        if (child.isInstancedMesh) child.dispose();
      });
    },
  };
}

export class SeasonDecor {
  /** `environment`: what createEnvironment returned (the decorations go into its group); `particles` for fireworks. */
  constructor(environment, ctx = {}) {
    this.environment = environment;
    this.ctx = ctx; // { particles, camera }, read when a theme is built
    this.decor = null; // the theme's decorations, built at its first use
    this.season = null;
  }

  /** Dresses the garden for `season` (null: plain). Another theme's decorations are freed. */
  apply(season) {
    const id = season?.id ?? null;
    if (id === this.season) return;
    this.season = id;
    if (this.decor && this.decor.id !== id) {
      this.decor.dispose();
      this.decor = null;
    }
    if (this.decor) this.decor.apply(true);
    else if (id && BUILDERS[id]) {
      this.decor = { id, ...build(id, this.environment, this.ctx) };
      this.environment.group.add(this.decor.group);
      this.decor.apply(true);
    }
  }

  update(time, delta = 0, night = false) {
    if (this.season) this.decor?.update(time, delta, night);
  }

  dispose() {
    this.decor?.dispose();
    this.decor = null;
    this.season = null;
  }
}
