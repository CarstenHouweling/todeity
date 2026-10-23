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
  range,
  reseed,
  roundTree,
  scatterPoints,
  single,
} from './Environment.js';

/**
 * The garden dressed up for a season (Seasons.js). Halloween: autumn trees, fallen leaves, a pumpkin patch,
 * jack-o'-lanterns along the path and by the hives, a bubbling cauldron by the tea table, gravestones and friendly
 * ghosts in the meadow, and bats where the butterflies flew. Nothing here blocks anything, so runs play the same.
 *
 * `apply(season)` switches it on or off at any time (⚙️ Settings): the trees swap their geometry (Divinity.js only
 * hides and shows those meshes, so its forms still work), the rest is one group. Built at its first use.
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

/** Faces turned toward the gameplay camera (it looks from +x, -y), give or take. */
const towardCamera = () => Math.PI / 4 + range(-0.7, 0.7);

function buildHalloween(environment) {
  reseed(SEED); // the same decorations every time
  const group = new THREE.Group();
  const updates = [];
  const { blocked, keepClear } = environment;
  const edge = MAP_HALF_SIZE;

  // Autumn: the round trees and bushes turn orange and red (the pines stay green).
  const swaps = [];
  const autumnFor = (kind) => (kind === 'roundTree' ? roundTree(AUTUMN) : kind === 'bush' ? bush(AUTUMN_BUSH) : null);
  for (const { kind, mesh } of [...environment.gardenProps, ...environment.forestMeshes]) {
    const geometry = autumnFor(kind);
    if (geometry) swaps.push({ mesh, plain: mesh.geometry, autumn: geometry });
  }

  // Fallen leaves on the lawn and the meadow.
  ['#d9601a', '#e8a020', '#b8401f', '#c89040'].forEach((color) => {
    const inside = scatterPoints(70, { inside: insideArena(10), spacing: 16, avoid: [{ x: POND.x, y: POND.y, radius: POND.radius + 6 }] });
    const outside = scatterPoints(120, { inside: outsideArena(4, 600), spacing: 18, avoid: keepClear });
    group.add(instanced(fallenLeaf(color), [...inside, ...outside].map((p) => ({ ...p, scale: range(0.8, 1.5) })), { shadows: false }));
  });

  // A pumpkin patch out in the meadow, and a few by the fence inside.
  const patch = scatterPoints(46, { inside: outsideArena(20, 520), spacing: 30, avoid: keepClear });
  const byFence = scatterPoints(10, {
    inside: () => {
      const along = range(-edge + 60, edge - 60);
      const side = Math.floor(range(0, 4));
      const off = edge - range(14, 26);
      return [[along, off], [along, -off], [off, along], [-off, along]][side];
    },
    spacing: 60,
    avoid: blocked,
  });
  const pumpkinGeometry = model(pumpkinParts());
  group.add(instanced(pumpkinGeometry, [...patch, ...byFence].map((p) => ({ ...p, scale: range(0.6, 1.25) }))));

  // Jack-o'-lanterns: along the path, by the house, the tea table, the pond and every hive.
  const lanterns = [];
  PATH.slice(0, -1).forEach(([x, y], i) => {
    const [nx, ny] = PATH[i + 1];
    const length = Math.hypot(nx - x, ny - y);
    const side = i % 2 ? 1 : -1;
    lanterns.push({ x: (x + nx) / 2 + ((ny - y) / length) * 30 * side, y: (y + ny) / 2 - ((nx - x) / length) * 30 * side, scale: range(0.75, 0.95) });
  });
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
  faces.castShadow = false;
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

  return {
    group,
    apply(on) {
      for (const swap of swaps) swap.mesh.geometry = on ? swap.autumn : swap.plain;
      for (const butterfly of environment.butterflies) butterfly.visible = !on;
      environment.pollen.material.color.set(on ? '#ffc48a' : '#fffbe0');
      group.visible = on;
    },
    update(time) {
      for (const update of updates) update(time);
    },
    dispose() {
      // Put the plain trees back first, so the world's own clean-up frees them; the autumn ones go here.
      for (const swap of swaps) {
        swap.mesh.geometry = swap.plain;
        swap.autumn.dispose();
      }
      group.removeFromParent();
      group.traverse((child) => {
        child.geometry?.dispose();
        if (child.material && child.material !== material) child.material.dispose();
      });
    },
  };
}

const BUILDERS = { halloween: buildHalloween };

export class SeasonDecor {
  /** `environment`: what createEnvironment returned (the decorations go into its group). */
  constructor(environment) {
    this.environment = environment;
    this.built = new Map(); // season id → its decorations
    this.season = null;
  }

  /** Dresses the garden for `season` (null: plain). */
  apply(season) {
    const id = season?.id ?? null;
    if (id === this.season) return;
    this.built.get(this.season)?.apply(false);
    this.season = id;
    if (!id || !BUILDERS[id]) return;
    if (!this.built.has(id)) {
      const decor = BUILDERS[id](this.environment);
      this.environment.group.add(decor.group);
      this.built.set(id, decor);
    }
    this.built.get(id).apply(true);
  }

  update(time) {
    this.built.get(this.season)?.update(time);
  }

  dispose() {
    for (const decor of this.built.values()) decor.dispose();
    this.built.clear();
    this.season = null;
  }
}
