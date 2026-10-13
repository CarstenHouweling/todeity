import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_HALF_SIZE } from './Map.js';

// Fixed seed: the garden looks the same every run.
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20261013;
let random = seededRandom(SEED);
const range = (min, max) => min + random() * (max - min);
const pick = (items) => items[Math.floor(random() * items.length)];

export const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });

// --- Low-poly geometry helpers -------------------------------------------
// Parts are modelled Y-up like regular three.js geometry; `model()` turns the result Z-up.

function part(geometry, color, { position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], jitter = 0 } = {}) {
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const g = mergeVertices(geometry);
  const positions = g.attributes.position;
  if (jitter) {
    for (let i = 0; i < positions.count; i++) {
      positions.setXYZ(
        i,
        positions.getX(i) + range(-jitter, jitter),
        positions.getY(i) + range(-jitter, jitter),
        positions.getZ(i) + range(-jitter, jitter)
      );
    }
  }
  g.scale(...scale);
  g.rotateX(rotation[0]);
  g.rotateY(rotation[1]);
  g.rotateZ(rotation[2]);
  g.translate(...position);

  const c = new THREE.Color(color);
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function model(parts) {
  const geometry = mergeGeometries(parts);
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

const TRUNK = '#8a5a33';
const LEAVES = ['#3f9a45', '#4caf50', '#5cbf5a', '#378c3e'];
const PINE = ['#2f7d3b', '#3a8f45', '#46a050'];

// Builders take colour palettes, so the divine world can grow blossom, golden and crystal versions.
export function pineTree(colors = PINE, trunk = TRUNK) {
  const parts = [part(new THREE.CylinderGeometry(2.5, 3.5, 14, 6), trunk, { position: [0, 7, 0] })];
  for (let i = 0; i < 3; i++) {
    parts.push(
      part(new THREE.ConeGeometry(22 - i * 6, 26, 7), colors[i % colors.length], { position: [0, 20 + i * 13, 0], jitter: 1.5 })
    );
  }
  return model(parts);
}

export function roundTree(leaves = LEAVES, trunk = TRUNK) {
  return model([
    part(new THREE.CylinderGeometry(3, 4.5, 24, 6), trunk, { position: [0, 12, 0], jitter: 0.5 }),
    part(new THREE.IcosahedronGeometry(18, 0), pick(leaves), { position: [0, 36, 0], jitter: 2.5 }),
    part(new THREE.IcosahedronGeometry(12, 0), pick(leaves), { position: [11, 29, 4], jitter: 2 }),
    part(new THREE.IcosahedronGeometry(13, 0), pick(leaves), { position: [-9, 31, -6], jitter: 2 }),
  ]);
}

export function bush(leaves = LEAVES) {
  return model([
    part(new THREE.IcosahedronGeometry(9, 0), pick(leaves), { position: [0, 6, 0], jitter: 1.5 }),
    part(new THREE.IcosahedronGeometry(7, 0), pick(leaves), { position: [8, 4, 3], jitter: 1.2 }),
    part(new THREE.IcosahedronGeometry(6, 0), pick(leaves), { position: [-7, 4, -2], jitter: 1.2 }),
  ]);
}

export function rock(size = 10, colors = ['#9aa0a6', '#8d939a', '#a7acb1']) {
  return model([
    part(new THREE.DodecahedronGeometry(size, 0), pick(colors), {
      position: [0, size * 0.3, 0],
      scale: [1, 0.6, 1.2],
      jitter: size * 0.22,
    }),
  ]);
}

function grassTuft() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const height = range(5, 10);
    parts.push(
      part(new THREE.ConeGeometry(range(0.8, 1.3), height, 3), pick(['#4f9d3a', '#5fb046', '#3f8a30']), {
        position: [range(-2, 2), height / 2, range(-2, 2)],
        rotation: [range(-0.3, 0.3), 0, range(-0.3, 0.3)],
      })
    );
  }
  return model(parts);
}

export function flower(color) {
  return model([
    part(new THREE.CylinderGeometry(0.4, 0.4, 7, 3), '#4f9d3a', { position: [0, 3.5, 0] }),
    part(new THREE.IcosahedronGeometry(2, 0), color, { position: [0, 7.5, 0] }),
    part(new THREE.IcosahedronGeometry(1, 0), '#ffd84d', { position: [0, 8.6, 0] }),
  ]);
}

function mushroom() {
  return model([
    part(new THREE.CylinderGeometry(1.2, 1.6, 4, 6), '#f3ead8', { position: [0, 2, 0] }),
    part(new THREE.SphereGeometry(3.6, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), '#e0453a', { position: [0, 3.6, 0] }),
  ]);
}

/** A straw beehive (skep) on a little wooden stand. */
function beehive() {
  const profile = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const radius = Math.max(0.01, 17 * Math.sqrt(1 - t ** 1.8) + (i % 2) * 1.2);
    profile.push(new THREE.Vector2(radius, t * 32));
  }
  return model([
    part(new THREE.BoxGeometry(40, 4, 40), '#9b6a3c', { position: [0, 10, 0] }),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => part(new THREE.BoxGeometry(4, 10, 4), '#86592f', { position: [sx * 15, 4, sz * 15] }))
    ),
    part(new THREE.LatheGeometry(profile, 10), '#d9a74a', { position: [0, 12, 0] }),
    part(new THREE.BoxGeometry(7, 4, 4), '#3b2a14', { position: [0, 15, 15] }),
  ]);
}

function teaTable() {
  return model([
    part(new THREE.CylinderGeometry(15, 15, 2, 12), '#f2e8d5', { position: [0, 14, 0] }),
    part(new THREE.CylinderGeometry(1.8, 3, 13, 6), '#b58250', { position: [0, 6.5, 0] }),
    part(new THREE.CylinderGeometry(7, 7, 1, 8), '#b58250', { position: [0, 0.5, 0] }),
    // Teapot
    part(new THREE.SphereGeometry(5, 8, 6), '#f7f7f7', { position: [-3, 19.5, 0], scale: [1, 0.85, 1] }),
    part(new THREE.SphereGeometry(1.6, 6, 4), '#5b8fd6', { position: [-3, 24, 0] }),
    part(new THREE.ConeGeometry(1.2, 6, 5), '#f7f7f7', { position: [2.6, 20.5, 0], rotation: [0, 0, -1.0] }),
    part(new THREE.TorusGeometry(2.4, 0.7, 4, 8), '#f7f7f7', { position: [-8, 20, 0] }),
    // Cups
    part(new THREE.CylinderGeometry(1.8, 1.4, 3, 7), '#5b8fd6', { position: [7, 16.5, 6] }),
    part(new THREE.CylinderGeometry(1.8, 1.4, 3, 7), '#5b8fd6', { position: [5, 16.5, -8] }),
  ]);
}

function stool() {
  return model([
    part(new THREE.CylinderGeometry(5, 5, 2, 8), '#b58250', { position: [0, 8, 0] }),
    part(new THREE.CylinderGeometry(1.5, 2, 8, 6), '#9b6a3c', { position: [0, 4, 0] }),
  ]);
}

function reed() {
  const height = range(14, 22);
  return model([
    part(new THREE.CylinderGeometry(0.5, 0.6, height, 4), '#6b8e23', { position: [0, height / 2, 0] }),
    part(new THREE.CylinderGeometry(1.1, 1.1, 4, 6), '#6b4423', { position: [0, height - 2, 0] }),
  ]);
}

// --- Placement --------------------------------------------------------------

/** One InstancedMesh per geometry: [{ x, y, rotation?, scale? }, ...]. */
export function instanced(geometry, placements, { shadows = true, tint = 0.15, surface = material } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, surface, placements.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 0, 1);
  const color = new THREE.Color();
  placements.forEach(({ x, y, z = 0, rotation = random() * Math.PI * 2, scale = 1 }, i) => {
    quaternion.setFromAxisAngle(up, rotation);
    matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(scale, scale, scale));
    mesh.setMatrixAt(i, matrix);
    const shade = 1 - tint / 2 + random() * tint;
    mesh.setColorAt(i, color.setRGB(shade, shade, shade));
  });
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

function single(geometry, { x, y, rotation = 0, scale = 1 }) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, 0);
  mesh.rotation.z = rotation;
  mesh.scale.setScalar(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Random points in a region, kept `spacing` apart from each other and from `avoid` circles. */
export function scatterPoints(count, { inside, spacing, avoid = [] }) {
  const points = [];
  for (let attempt = 0; attempt < count * 30 && points.length < count; attempt++) {
    const candidate = inside();
    if (!candidate) continue;
    const [x, y] = candidate;
    const tooClose =
      points.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < spacing ** 2) ||
      avoid.some((a) => (a.x - x) ** 2 + (a.y - y) ** 2 < a.radius ** 2);
    if (!tooClose) points.push({ x, y });
  }
  return points;
}

export const insideArena = (margin) => () => [
  range(-MAP_HALF_SIZE + margin, MAP_HALF_SIZE - margin),
  range(-MAP_HALF_SIZE + margin, MAP_HALF_SIZE - margin),
];

/** Outside the fence, denser close to it. */
export const outsideArena = (from, to) => () => {
  const x = range(-to, to);
  const y = range(-to, to);
  const edgeDistance = Math.max(Math.abs(x), Math.abs(y)) - MAP_HALF_SIZE;
  if (edgeDistance < from) return null;
  if (random() > 1.15 - edgeDistance / (to - MAP_HALF_SIZE)) return [x, y];
  return null;
};

// --- Garden layout -----------------------------------------------------------

export const HOME = { x: -205, y: 205, turns: 2 };
export const PATH = [
  [-175, 150],
  [-140, 95],
  [-80, 55],
  [-30, 15],
  [0, 0],
];

const POND = { x: 195, y: 175, radius: 62 };
const TEA_TABLE = { x: -95, y: 175 };
const hiveOffset = () => MAP_HALF_SIZE + 38;
const CORNER_GAP = 80; // fence opening at each corner, where the bees come in

// Garden props Tode and the bees bump into: [kind, x, y, collision radius, scale]
const GARDEN_PROPS = [
  ['roundTree', 255, -45, 15, 1.1],
  ['roundTree', -40, -255, 15, 1],
  ['pineTree', -285, -20, 13, 1.05],
  ['pineTree', 90, 300, 13, 0.9],
  ['rock', 135, -205, 13, 1.3],
  ['rock', 160, -230, 8, 0.8],
  ['rock', -215, -195, 12, 1.2],
  ['bush', 40, 205, 13, 1.2],
  ['bush', -300, 110, 13, 1.1],
  ['bush', 300, 90, 12, 1],
];

function createFence() {
  const parts = [];
  const offset = MAP_HALF_SIZE + 4;
  const from = -MAP_HALF_SIZE + CORNER_GAP;
  const to = MAP_HALF_SIZE - CORNER_GAP;
  const spacing = 30;
  const count = Math.round((to - from) / spacing);

  for (const side of [0, 1, 2, 3]) {
    const along = side % 2 === 0 ? 'x' : 'y';
    const fixed = side < 2 ? offset : -offset;
    for (let i = 0; i <= count; i++) {
      const t = from + (i * (to - from)) / count;
      const [x, y] = along === 'x' ? [t, fixed] : [fixed, t];
      // Y-up parts: modelled at (x, height, -y) so they land on (x, y) after turning Z-up.
      parts.push(part(new THREE.BoxGeometry(4, 22, 4), '#a0703f', { position: [x, 11, -y], jitter: 0.4 }));
      if (i === count) continue;
      const step = (to - from) / count;
      const [rx, ry] = along === 'x' ? [t + step / 2, fixed] : [fixed, t + step / 2];
      for (const height of [8, 16]) {
        parts.push(
          part(new THREE.BoxGeometry(step, 2.5, 1.5), '#b58250', {
            position: [rx, height, -ry],
            rotation: [0, along === 'x' ? 0 : Math.PI / 2, 0],
          })
        );
      }
    }
  }
  const fence = new THREE.Mesh(model(parts), material);
  fence.castShadow = true;
  fence.receiveShadow = true;
  return fence;
}

function createPond() {
  const group = new THREE.Group();
  group.position.set(POND.x, POND.y, 0);

  const outline = (radius, wobble) => {
    const shape = new THREE.Shape();
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const r = radius * (1 + wobble * Math.sin(angle * 3) + wobble * 0.6 * Math.cos(angle * 5));
      const point = [Math.cos(angle) * r, Math.sin(angle) * r];
      i ? shape.lineTo(...point) : shape.moveTo(...point);
    }
    return new THREE.ShapeGeometry(shape);
  };

  const bank = new THREE.Mesh(outline(POND.radius + 9, 0.06), new THREE.MeshLambertMaterial({ color: '#b89a68' }));
  bank.position.z = 0.3;
  bank.receiveShadow = true;
  const water = new THREE.Mesh(
    outline(POND.radius, 0.06),
    new THREE.MeshStandardMaterial({ color: '#3d9bd6', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.92 })
  );
  water.position.z = 0.6;
  water.receiveShadow = true;
  group.add(bank, water);

  const padMaterial = new THREE.MeshLambertMaterial({ color: '#3f9d3a', side: THREE.DoubleSide });
  const blossomMaterial = new THREE.MeshLambertMaterial({ color: '#ff9ec7' });
  for (let i = 0; i < 7; i++) {
    const angle = range(0, Math.PI * 2);
    const distance = range(8, POND.radius - 14);
    const radius = range(5, 9);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(radius, 12, 0.35, Math.PI * 2 - 0.7), padMaterial);
    pad.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, 1);
    pad.rotation.z = range(0, Math.PI * 2);
    group.add(pad);
    if (i % 3 === 0) {
      const blossom = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3, 6), blossomMaterial);
      blossom.rotation.x = Math.PI / 2;
      blossom.position.set(pad.position.x, pad.position.y, 2.5);
      group.add(blossom);
    }
  }

  // Ripples that spread across the water.
  const ripples = Array.from({ length: 3 }, (_, i) => {
    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 32),
      new THREE.MeshBasicMaterial({ color: '#d9f2ff', transparent: true, depthWrite: false })
    );
    ripple.userData = { phase: i / 3, x: range(-25, 25), y: range(-25, 25) };
    ripple.position.z = 0.8;
    group.add(ripple);
    return ripple;
  });

  const reedPlacements = [];
  for (let i = 0; i < 18; i++) {
    const angle = range(Math.PI * 0.6, Math.PI * 1.6);
    const distance = POND.radius + range(-2, 8);
    reedPlacements.push({ x: POND.x + Math.cos(angle) * distance, y: POND.y + Math.sin(angle) * distance });
  }
  const pebbles = [];
  for (let i = 0; i < 14; i++) {
    const angle = range(-Math.PI * 0.4, Math.PI * 0.6);
    const distance = POND.radius + range(4, 10);
    pebbles.push({ x: POND.x + Math.cos(angle) * distance, y: POND.y + Math.sin(angle) * distance, scale: range(0.25, 0.5) });
  }

  return {
    group,
    water,
    extras: [instanced(reed(), reedPlacements, { shadows: false }), instanced(rock(10), pebbles)],
    update(time) {
      for (const ripple of ripples) {
        const t = (time * 0.35 + ripple.userData.phase) % 1;
        if (t < 0.02) Object.assign(ripple.userData, { x: range(-30, 30), y: range(-30, 30) });
        ripple.position.x = ripple.userData.x;
        ripple.position.y = ripple.userData.y;
        ripple.scale.setScalar(2 + t * 22);
        ripple.material.opacity = 0.6 * (1 - t);
      }
    },
  };
}

function createPollen() {
  const count = 260;
  const positions = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: range(-MAP_HALF_SIZE - 150, MAP_HALF_SIZE + 150),
      y: range(-MAP_HALF_SIZE - 150, MAP_HALF_SIZE + 150),
      z: range(4, 70),
      speed: range(0.2, 0.6),
      phase: range(0, Math.PI * 2),
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#fffbe0', size: 2.2, transparent: true, opacity: 0.85, depthWrite: false })
  );
  return {
    points,
    update(time) {
      seeds.forEach((seed, i) => {
        positions[i * 3] = seed.x + Math.sin(time * seed.speed + seed.phase) * 20 + time * 4 * seed.speed;
        positions[i * 3 + 1] = seed.y + Math.cos(time * seed.speed * 0.8 + seed.phase) * 20;
        positions[i * 3 + 2] = seed.z + Math.sin(time * seed.speed * 2 + seed.phase) * 4;
        // Wrap around so pollen keeps drifting over the garden.
        const limit = MAP_HALF_SIZE + 150;
        if (positions[i * 3] > limit) seed.x -= limit * 2;
      });
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

function createButterflies() {
  const colors = ['#ffd84d', '#ffffff', '#ff9ec7', '#8fd3ff'];
  const wingGeometry = new THREE.PlaneGeometry(5, 4);
  wingGeometry.translate(2.5, 0, 0);
  const butterflies = Array.from({ length: 7 }, (_, i) => {
    const wingMaterial = new THREE.MeshLambertMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide });
    const group = new THREE.Group();
    const left = new THREE.Mesh(wingGeometry, wingMaterial);
    const right = new THREE.Mesh(wingGeometry, wingMaterial);
    right.rotation.z = Math.PI;
    group.add(left, right);
    group.userData = {
      left,
      right,
      center: new THREE.Vector2(range(-300, 300), range(-300, 300)),
      radius: range(30, 90),
      speed: range(0.2, 0.45) * (random() < 0.5 ? -1 : 1),
      phase: range(0, Math.PI * 2),
    };
    return group;
  });
  return {
    butterflies,
    update(time) {
      for (const butterfly of butterflies) {
        const { left, right, center, radius, speed, phase } = butterfly.userData;
        const angle = time * speed + phase;
        butterfly.position.set(
          center.x + Math.cos(angle) * radius,
          center.y + Math.sin(angle * 1.3) * radius * 0.7,
          26 + Math.sin(time * 2 + phase) * 6
        );
        butterfly.rotation.z = angle + Math.PI / 2 * Math.sign(speed);
        const flap = Math.sin(time * 18 + phase) * 1.1;
        left.rotation.x = flap;
        right.rotation.x = -flap;
      }
    },
  };
}

/**
 * Builds Tode's garden: fence, beehives, pond, tea table, trees, rocks, flowers and the
 * meadow beyond. Returns the scene group, the obstacles for collisions, and an
 * `update(time)` for the ambient animation.
 */
export function createEnvironment() {
  random = seededRandom(SEED); // the same garden every time it is (re)built
  const group = new THREE.Group();
  const obstacles = [];
  const circle = (x, y, radius) => obstacles.push({ x, y, radius });

  // Fence and beehives at the corners.
  group.add(createFence());
  const hives = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => ({
      x: sx * hiveOffset(),
      y: sy * hiveOffset(),
      rotation: Math.atan2(-sx, sy),
    }))
  );
  group.add(instanced(beehive(), hives, { tint: 0 }));

  // Pond
  const pond = createPond();
  group.add(pond.group, ...pond.extras);
  circle(POND.x, POND.y, POND.radius - 6);

  // Tea table with stools, next to the path.
  group.add(single(teaTable(), { ...TEA_TABLE, rotation: 0.4 }));
  group.add(single(stool(), { x: TEA_TABLE.x - 22, y: TEA_TABLE.y + 6 }));
  group.add(single(stool(), { x: TEA_TABLE.x + 20, y: TEA_TABLE.y - 12 }));
  circle(TEA_TABLE.x, TEA_TABLE.y, 16);

  // Garden trees, rocks and bushes that block movement.
  const builders = { roundTree, pineTree, rock: () => rock(10), bush };
  const gardenProps = [];
  for (const [kind, x, y, radius, scale] of GARDEN_PROPS) {
    const mesh = single(builders[kind](), { x, y, scale, rotation: range(0, Math.PI * 2) });
    group.add(mesh);
    gardenProps.push({ kind, mesh });
    circle(x, y, radius);
  }

  // Forest and meadow outside the fence (decoration only).
  const keepClear = [...hives.map((h) => ({ ...h, radius: 70 }))];
  const forest = scatterPoints(260, { inside: outsideArena(40, 900), spacing: 34, avoid: keepClear });
  const treeKinds = [pineTree(), pineTree(), roundTree(), roundTree(), bush(), rock(12)];
  const kindNames = ['pineTree', 'pineTree', 'roundTree', 'roundTree', 'bush', 'rock'];
  const byKind = treeKinds.map(() => []);
  forest.forEach((point) => byKind[Math.floor(random() * treeKinds.length)].push({ ...point, scale: range(0.8, 1.5) }));
  const forestMeshes = [];
  treeKinds.forEach((geometry, i) => {
    if (!byKind[i].length) return;
    const mesh = instanced(geometry, byKind[i]);
    group.add(mesh);
    forestMeshes.push({ kind: kindNames[i], mesh });
  });
  const outside = forestMeshes.map(({ mesh }) => mesh);

  // Small details: no collisions.
  const blocked = [
    ...obstacles.map((o) => ({ ...o, radius: o.radius + 12 })),
    { x: POND.x, y: POND.y, radius: POND.radius + 16 },
    { x: HOME.x, y: HOME.y, radius: 75 },
    ...PATH.map(([x, y]) => ({ x, y, radius: 34 })),
  ];
  const grassInside = scatterPoints(220, { inside: insideArena(10), spacing: 18, avoid: blocked });
  const grassOutside = scatterPoints(900, { inside: outsideArena(8, 700), spacing: 16, avoid: keepClear });
  const tuft = grassTuft();
  const outsideGrass = instanced(tuft, grassOutside, { shadows: false });
  const insideGrass = instanced(tuft, grassInside, { shadows: false });
  group.add(insideGrass, outsideGrass);
  outside.push(outsideGrass);

  ['#ffffff', '#ffd84d', '#ff8fb8', '#b48cff'].forEach((color) => {
    const flowers = scatterPoints(45, { inside: insideArena(10), spacing: 22, avoid: blocked });
    const wild = scatterPoints(70, { inside: outsideArena(5, 500), spacing: 20, avoid: keepClear });
    const geometry = flower(color);
    const wildMesh = instanced(geometry, wild, { shadows: false });
    group.add(instanced(geometry, flowers, { shadows: false }), wildMesh);
    outside.push(wildMesh);
  });

  const mushrooms = GARDEN_PROPS.filter(([kind]) => kind.endsWith('Tree')).flatMap(([, x, y]) =>
    Array.from({ length: 3 }, () => ({ x: x + range(-28, 28), y: y + range(-28, 28), scale: range(0.8, 1.3) }))
  );
  group.add(instanced(mushroom(), mushrooms, { shadows: false }));

  const pollen = createPollen();
  const butterflies = createButterflies();
  group.add(pollen.points, ...butterflies.butterflies);

  return {
    group,
    obstacles,
    // Handles for the divine transformation (see Divinity.js).
    gardenProps,
    forestMeshes,
    outside,
    pondWater: pond.water,
    insideGrass,
    blocked,
    keepClear,
    update(time) {
      pond.update(time);
      pollen.update(time);
      butterflies.update(time);
    },
  };
}
