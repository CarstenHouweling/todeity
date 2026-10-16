import * as THREE from 'three';
import { merge, piece } from './BeeModels.js';
import { upgradeMaterial } from './Graphics.js';

/**
 * Bee-zebub, the final boss: a winged devil. Crimson and muscular, with great curling bone horns, glowing eyes and a
 * fanged grin, goat legs on cloven hooves, bat wings with glowing veins, a whip of a tail with a spade at its end and
 * a hellfire trident. The bee in him: black-and-gold banded belt and bracers, and stripes on his tail.
 *
 * Built Y-up facing +Z at about the size of a drone (like `buildBee`); the Enemy scales and turns him. He is built
 * whatever the graphics level (it is one model, so Low only gets fewer segments and plain materials). The parts that
 * move are separate meshes on pivots: he hovers, flaps, swishes his tail, raises the trident when he winds up an
 * attack, leans into charges, slumps when staggered and tumbles when he falls.
 */

const COLORS = {
  skin: '#b3181c',
  shade: '#6e0a0e',
  dark: '#1c0606',
  fur: '#2a0d0a',
  hoof: '#120606',
  hornBase: '#2a1210',
  hornTip: '#f0e2bf',
  bone: '#e6d6b0',
  gold: '#e0a526',
  black: '#140a08',
  iron: '#34303a',
  membrane: '#4a0608',
  membraneEdge: '#1e0204',
  fire: '#ff7a1a',
  eye: '#ffd23f',
  ember: '#ff4a10',
};

const tmp = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** A tapered cylinder from `a` to `b` (radius `r0` at a, `r1` at b), with round joints if `joints`. */
function limb(pieces, a, b, r0, r1, color, seg, joints = true) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const length = start.distanceTo(end);
  const geometry = new THREE.CylinderGeometry(r1, r0, length, seg, 1, true).translate(0, length / 2, 0);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, end.clone().sub(start).normalize()));
  geometry.translate(start.x, start.y, start.z);
  pieces.push(piece(geometry, color));
  if (joints) {
    pieces.push(piece(new THREE.SphereGeometry(r0, seg, Math.max(4, seg >> 1)), color, { position: a }));
    pieces.push(piece(new THREE.SphereGeometry(r1, seg, Math.max(4, seg >> 1)), color, { position: b }));
  }
}

/** A curling horn: a tube along `points` that tapers from `r0` to `r1`, dark at the root and bone at the tip. */
function horn(points, r0, r1, seg) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const rings = 18;
  const geometry = new THREE.TubeGeometry(curve, rings, r0, seg, false);
  const position = geometry.attributes.position;
  const along = new Float32Array(position.count);
  const center = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    curve.getPointAt(t, center);
    const k = THREE.MathUtils.lerp(1, r1 / r0, t ** 0.8);
    for (let j = 0; j <= seg; j++) {
      const index = i * (seg + 1) + j;
      vertex.fromBufferAttribute(position, index).sub(center).multiplyScalar(k).add(center);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
      along[index] = t;
    }
  }
  geometry.setAttribute('along', new THREE.BufferAttribute(along, 1));
  geometry.computeVertexNormals();
  const g = piece(geometry, COLORS.hornBase);
  // Ridged: darker rings near the root, fading to bone.
  const colors = g.attributes.color;
  const base = new THREE.Color(COLORS.hornBase);
  const tip = new THREE.Color(COLORS.hornTip);
  for (let i = 0; i < colors.count; i++) {
    const t = g.attributes.along.getX(i);
    const ridge = t < 0.75 && Math.sin(t * 60) > 0.6 ? 0.82 : 1;
    tmp.copy(base).lerp(tip, Math.min(1, t * 1.25)).multiplyScalar(ridge);
    colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  g.deleteAttribute('along');
  return g;
}

/** A flat shape extruded and placed like a piece. */
function slab(shape, depth, color, transform) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.3, bevelSegments: 1, curveSegments: 6 });
  geometry.translate(0, 0, -depth / 2);
  return piece(geometry, color, transform);
}

/** The devil's tail tip: a spade, pointing along +Y in its own plane. */
function spadeShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.7);
  shape.quadraticCurveTo(1.1, -0.4, 2.2, 1.1);
  shape.quadraticCurveTo(1.6, 2.6, 0, 4.6);
  shape.quadraticCurveTo(-1.6, 2.6, -2.2, 1.1);
  shape.quadraticCurveTo(-1.1, -0.4, 0, 0.7);
  return shape;
}

/**
 * A bat wing reaching out along +X from its root (side = 1; the left one is built mirrored): an arm bone to the wrist,
 * four fingers fanning out, and a scalloped membrane between them. Returns `{ bones, membrane, veins }`.
 */
function batWing(side, seg) {
  const wrist = [9.5, 6.5, -2.2];
  const tips = [
    [13, 14.5, -3.4],
    [20, 9, -4.2],
    [21, 1.5, -3.8],
    [15, -4.5, -3],
  ];
  const lower = [3, -5.5, -1.6]; // where the membrane meets the back
  const mirror = ([x, y, z]) => [x * side, y, z];
  const bones = [];
  const veins = [];
  limb(bones, [0, 0, 0], mirror(wrist), 0.75, 0.55, COLORS.dark, seg);
  for (const [i, tipPoint] of tips.entries()) {
    limb(bones, mirror(wrist), mirror(tipPoint), 0.42, 0.14, COLORS.dark, Math.max(4, seg >> 1), false);
    // A glowing vein down the middle of each finger.
    const mid = tipPoint.map((v, k) => wrist[k] + (v - wrist[k]) * 0.55);
    limb(veins, mirror(wrist), mirror(mid), 0.16, 0.05, COLORS.ember, 4, false);
    if (i === 0) bones.push(piece(new THREE.ConeGeometry(0.5, 2.4, 6), COLORS.bone, { position: mirror([wrist[0], wrist[1] + 1.2, wrist[2]]), rotation: [0, 0, -side * 0.3] }));
  }

  // Membrane: a fan from the wrist over the outline root → finger tips (scalloped in between) → back.
  const outline = [mirror(tips[0])];
  for (let i = 1; i < tips.length; i++) {
    const a = tips[i - 1];
    const b = tips[i];
    const between = a.map((v, k) => (v + b[k]) / 2);
    // Pulled toward the wrist: the scallop.
    outline.push(mirror(between.map((v, k) => v + (wrist[k] - v) * 0.3)), mirror(b));
  }
  outline.push(mirror(tips[3].map((v, k) => (v + lower[k]) / 2 + (wrist[k] - (v + lower[k]) / 2) * 0.25)), mirror(lower), [0, 0, 0]);
  const w = mirror(wrist);
  const positions = [];
  const colors = [];
  const near = new THREE.Color(COLORS.membrane);
  const edge = new THREE.Color(COLORS.membraneEdge);
  const push = (p, t) => {
    positions.push(...p);
    tmp.copy(near).lerp(edge, t);
    colors.push(tmp.r, tmp.g, tmp.b);
  };
  for (let i = 0; i < outline.length - 1; i++) {
    push(w, 0);
    push(outline[i], 1);
    push(outline[i + 1], 1);
  }
  // From the root to the top finger as well, so the leading edge is closed.
  push(w, 0);
  push([0, 0, 0], 0.3);
  push(mirror(tips[0]), 1);
  const membrane = new THREE.BufferGeometry();
  membrane.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  membrane.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  membrane.computeVertexNormals();
  return { bones: merge(bones), membrane, veins: merge(veins) };
}

function buildGeometry(seg) {
  const half = Math.max(5, seg >> 1);
  const torso = [];
  const torsoGlow = [];
  // Hips with a fur loincloth and the bee's banded belt.
  torso.push(piece(new THREE.SphereGeometry(3, seg, half), COLORS.fur, { position: [0, 10.6, 0], scale: [1.25, 0.85, 0.95] }));
  for (const [i, color] of [COLORS.gold, COLORS.black, COLORS.gold].entries()) {
    torso.push(piece(new THREE.TorusGeometry(3.25 - i * 0.05, 0.42, 6, seg * 2), color, { position: [0, 11.5 + i * 0.75, 0.15], rotation: [Math.PI / 2, 0, 0], scale: [1.08, 0.88, 1] }));
  }
  // A V-shaped torso: belly, a broad chest, pecs, a thick neck, huge shoulders.
  torso.push(piece(new THREE.SphereGeometry(3, seg, half), COLORS.skin, { position: [0, 13.8, 0.3], scale: [1.05, 1.05, 0.85] }));
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++) torso.push(piece(new THREE.SphereGeometry(0.85, half, 4), COLORS.shade, { position: [side * 0.95, 12.6 + row * 1.15, 2.55], scale: [1, 0.75, 0.5] }));
  }
  torso.push(piece(new THREE.SphereGeometry(3.8, seg, half), COLORS.skin, { position: [0, 16.9, 0.1], scale: [1.5, 0.95, 0.92] }));
  for (const side of [-1, 1]) {
    torso.push(piece(new THREE.SphereGeometry(2.1, seg, half), COLORS.shade, { position: [side * 1.9, 17, 2.35], scale: [1.15, 0.82, 0.6] }));
    torso.push(piece(new THREE.SphereGeometry(2.4, seg, half), COLORS.skin, { position: [side * 5.3, 18.2, 0] }));
    // Spiked iron pauldrons.
    torso.push(piece(new THREE.SphereGeometry(2.7, seg, half, 0, Math.PI * 2, 0, Math.PI / 2), COLORS.iron, { position: [side * 5.4, 18.7, 0], scale: [1, 0.8, 1] }));
    for (let i = 0; i < 3; i++) {
      torso.push(piece(new THREE.ConeGeometry(0.55, 2.6, half), COLORS.bone, { position: [side * (4.6 + i * 0.9), 20.6 - i * 0.25, -0.6 + i * 0.6], rotation: [0, 0, -side * (0.25 + i * 0.3)] }));
    }
  }
  torso.push(piece(new THREE.SphereGeometry(1.9, seg, half), COLORS.skin, { position: [0, 19.2, -0.2], scale: [1.7, 1, 1.05] }));
  // Spikes down the spine (the camera looks down on his back a lot).
  for (let i = 0; i < 5; i++) {
    torso.push(piece(new THREE.ConeGeometry(0.6 - i * 0.06, 2.4 - i * 0.2, half), COLORS.bone, { position: [0, 19 - i * 1.7, -3.1 + i * 0.25], rotation: [-1.15, 0, 0] }));
  }
  // Cracks of hellfire across the chest and a burning heart.
  torsoGlow.push(piece(new THREE.SphereGeometry(0.75, half, 4), COLORS.fire, { position: [0, 16.4, 3.35], scale: [1, 1.3, 0.5] }));
  for (const [x, y, rz, length] of [
    [-0.9, 17.4, 0.7, 2.2],
    [0.9, 17.4, -0.7, 2.2],
    [-1.4, 15.4, -0.4, 1.8],
    [1.4, 15.4, 0.4, 1.8],
    [0, 14.2, 0, 1.6],
  ]) {
    torsoGlow.push(piece(new THREE.BoxGeometry(0.22, length, 0.3), COLORS.ember, { position: [x, y, 3.25 - Math.abs(x) * 0.25], rotation: [0, 0, rz] }));
  }

  // Head (around its own pivot at the neck).
  const head = [];
  const headGlow = [];
  head.push(piece(new THREE.SphereGeometry(2.6, seg, half), COLORS.skin, { position: [0, 2.3, 0.5], scale: [1, 1.12, 1.05] }));
  head.push(piece(new THREE.SphereGeometry(1.6, seg, half), COLORS.skin, { position: [0, 1, 1.9], scale: [1.15, 0.8, 0.9] })); // jaw
  for (const side of [-1, 1]) {
    // A scowling brow, pointed ears, a fang.
    head.push(piece(new THREE.BoxGeometry(2.2, 0.7, 1), COLORS.shade, { position: [side * 1.05, 3.25, 2.55], rotation: [0.2, 0, side * 0.38] }));
    head.push(piece(new THREE.ConeGeometry(0.7, 2.6, half), COLORS.skin, { position: [side * 2.9, 2.9, 0.1], rotation: [0, 0, -side * 1.15] }));
    head.push(piece(new THREE.ConeGeometry(0.22, 0.9, 5), COLORS.bone, { position: [side * 0.6, 0.55, 3.15], rotation: [Math.PI, 0, 0] }));
    headGlow.push(piece(new THREE.SphereGeometry(0.55, half, 4), COLORS.eye, { position: [side * 1, 2.65, 2.85], scale: [1.35, 0.6, 0.5], rotation: [0, 0, side * 0.25] }));
    head.push(horn([[side * 1.3, 3.8, 0.4], [side * 3, 4.7, 0], [side * 4.7, 5.4, -0.5], [side * 5.8, 7.4, -0.1], [side * 5.6, 9.7, 0.9], [side * 4.6, 11, 2.1]], 1.05, 0.08, Math.max(6, half)));
  }
  head.push(piece(new THREE.BoxGeometry(2.3, 0.35, 0.5), COLORS.black, { position: [0, 0.95, 3] })); // the grin
  head.push(piece(new THREE.ConeGeometry(0.6, 2.4, half), COLORS.black, { position: [0, -0.5, 2.3], rotation: [Math.PI + 0.35, 0, 0] })); // goatee

  // Arms: upper arm on the shoulder pivot, forearm on the elbow pivot. Banded bracers, clawed hands.
  const upperArm = {};
  const forearm = {};
  for (const side of [-1, 1]) {
    const upper = [];
    limb(upper, [0, 0, 0], [side * 0.6, -4.6, 0.2], 1.55, 1.2, COLORS.skin, seg);
    upperArm[side] = merge(upper);
    const lower = [];
    limb(lower, [0, 0, 0], [0, -4, 0.6], 1.2, 1, COLORS.skin, seg);
    for (const [i, color] of [COLORS.gold, COLORS.black, COLORS.gold, COLORS.black].entries()) {
      lower.push(piece(new THREE.CylinderGeometry(1.32, 1.32, 0.6, seg), color, { position: [0, -1.4 - i * 0.6, 0.2 + i * 0.09], rotation: [0.15, 0, 0] }));
    }
    lower.push(piece(new THREE.SphereGeometry(1.25, seg, half), COLORS.skin, { position: [0, -4.6, 0.8], scale: [1, 1.1, 0.9] }));
    for (let i = 0; i < 4; i++) {
      lower.push(piece(new THREE.ConeGeometry(0.22, 1.3, 5), COLORS.black, { position: [(i - 1.5) * 0.55, -5.6, 1.4], rotation: [0.9, 0, (i - 1.5) * 0.15] }));
    }
    forearm[side] = merge(lower);
  }

  // Goat legs: furry thighs, backward-bent hocks, cloven hooves.
  const legs = {};
  for (const side of [-1, 1]) {
    const leg = [];
    const knee = [side * 0.3, -3.6, 1.7];
    const hock = [side * 0.25, -6.6, -1.1];
    const fetlock = [side * 0.25, -8.9, -0.3];
    leg.push(piece(new THREE.SphereGeometry(2.1, seg, half), COLORS.fur, { position: [side * 0.2, -1.6, 0.8], scale: [1, 1.45, 1.1] }));
    limb(leg, knee, hock, 1.05, 0.7, COLORS.shade, seg);
    limb(leg, hock, fetlock, 0.65, 0.55, COLORS.shade, seg);
    for (const toe of [-1, 1]) {
      leg.push(piece(new THREE.CylinderGeometry(0.45, 0.62, 1.2, half), COLORS.hoof, { position: [fetlock[0] + toe * 0.33, fetlock[1] - 0.8, fetlock[2] + 0.35], rotation: [0.25, 0, 0] }));
    }
    legs[side] = merge(leg);
  }

  // Tail: tapering segments with the bee's stripes, and the spade.
  const tailSegments = [];
  for (let i = 0; i < TAIL.length; i++) {
    const r0 = 0.85 - i * 0.09;
    const r1 = 0.85 - (i + 1) * 0.09;
    const segment = [];
    limb(segment, [0, 0, 0], [0, 0, -TAIL_LENGTH], r0, r1, i % 2 ? COLORS.black : COLORS.skin, half);
    tailSegments.push(merge(segment));
  }
  const spade = [slab(spadeShape(), 0.45, COLORS.black, { rotation: [-Math.PI / 2, 0, 0], position: [0, 0, -0.2] })];

  // The trident, held in the right hand: an iron shaft, a golden crossguard, three barbed prongs with burning tips.
  const trident = [];
  const tridentGlow = [];
  limb(trident, [0, -7, 0], [0, 17, 0], 0.5, 0.5, COLORS.iron, half, false);
  trident.push(piece(new THREE.SphereGeometry(0.9, half, 4), COLORS.gold, { position: [0, -7.2, 0] }));
  trident.push(piece(new THREE.BoxGeometry(7, 0.9, 0.9), COLORS.gold, { position: [0, 17.2, 0] }));
  for (const x of [-3.1, 0, 3.1]) {
    const length = x ? 5 : 6.4;
    limb(trident, [x, 17.4, 0], [x * 1.05, 17.4 + length, 0], 0.48, 0.4, COLORS.iron, half, false);
    tridentGlow.push(piece(new THREE.ConeGeometry(0.8, 2.8, half), COLORS.fire, { position: [x * 1.05, 17.4 + length + 1.3, 0] }));
    // A barb on each prong.
    trident.push(piece(new THREE.ConeGeometry(0.4, 1.5, 4), COLORS.iron, { position: [x * 1.05 + (x <= 0 ? -0.45 : 0.45), 17.4 + length - 1, 0], rotation: [0, 0, x <= 0 ? 2.6 : -2.6] }));
  }

  const wings = { 1: batWing(1, half), [-1]: batWing(-1, half) };
  return {
    torso: merge(torso),
    torsoGlow: merge(torsoGlow),
    head: merge(head),
    headGlow: merge(headGlow),
    upperArm,
    forearm,
    legs,
    tailSegments,
    spade: merge(spade),
    trident: merge(trident),
    tridentGlow: merge(tridentGlow),
    wings,
    fireball: new THREE.IcosahedronGeometry(1.5, 1),
  };
}

// The tail's resting curl: each segment's bend (down from the hips, then up and back) and its length.
const TAIL = [-0.75, 0.2, 0.35, 0.35, 0.3, 0.25, 0.15];
const TAIL_LENGTH = 2.6;

const geometryCache = new Map();
let glowMaterial = null;
let fireMaterial = null;

const mesh = (geometry, material, shadow = false) => {
  const m = new THREE.Mesh(geometry, material);
  m.userData.shared = true; // cached geometry; the per-boss materials are disposed through `materials`
  m.castShadow = shadow;
  return m;
};

/** Eases `value` toward `target` at `rate` per second. */
const ease = (value, target, rate, delta) => value + (target - value) * (1 - Math.exp(-rate * delta));

/** Builds the devil: `{ root, materials, animate(time, delta, enemy) }`, like `buildBee`. */
export function buildDevil(level) {
  const seg = level >= 3 ? 14 : level > 0 ? 12 : 9;
  if (!geometryCache.has(seg)) geometryCache.set(seg, buildGeometry(seg));
  const parts = geometryCache.get(seg);
  glowMaterial ??= new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.35, 1.35, 1.35) });
  fireMaterial ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.42, 0.08) });

  let surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
  if (level > 0) {
    surface = upgradeMaterial(surface, level);
    surface.iridescence = 0; // a devil, not a beetle
    surface.sheenColor.set('#ff6040');
  }
  const membrane = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.94 });

  const root = new THREE.Group();
  const inner = new THREE.Group(); // hovers, leans and tumbles
  root.add(inner);
  inner.add(mesh(parts.torso, surface, true), mesh(parts.torsoGlow, glowMaterial));

  const head = new THREE.Group();
  head.position.set(0, 19.8, 0.3);
  head.add(mesh(parts.head, surface, true), mesh(parts.headGlow, glowMaterial));
  inner.add(head);

  const arms = {};
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 5.6, 18, 0);
    shoulder.add(mesh(parts.upperArm[side], surface, true));
    const elbow = new THREE.Group();
    elbow.position.set(side * 0.6, -4.6, 0.2);
    elbow.add(mesh(parts.forearm[side], surface));
    shoulder.add(elbow);
    inner.add(shoulder);
    arms[side] = { shoulder, elbow };
  }
  // The trident in his right hand (+X), the fireball over his left palm.
  const trident = new THREE.Group();
  trident.position.set(0, -4.6, 1.1);
  trident.add(mesh(parts.trident, surface, true), mesh(parts.tridentGlow, glowMaterial));
  arms[1].elbow.add(trident);
  const fireball = mesh(parts.fireball, fireMaterial);
  fireball.position.set(0, -4.4, 3.4);
  arms[-1].elbow.add(fireball);

  const legs = {};
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 2.2, 10.4, 0);
    hip.add(mesh(parts.legs[side], surface));
    inner.add(hip);
    legs[side] = hip;
  }

  const tail = [];
  let parent = inner;
  let joint = [0, 10.2, -2.4];
  for (const [i, geometry] of parts.tailSegments.entries()) {
    const segment = new THREE.Group();
    segment.position.set(...joint);
    segment.add(mesh(geometry, surface));
    parent.add(segment);
    tail.push(segment);
    parent = segment;
    joint = [0, 0, -TAIL_LENGTH];
    if (i === parts.tailSegments.length - 1) {
      const spade = mesh(parts.spade, surface);
      spade.position.set(0, 0, -TAIL_LENGTH);
      segment.add(spade);
    }
  }

  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.8, 17.6, -2.7);
    const { bones, membrane: skin, veins } = parts.wings[side];
    pivot.add(mesh(bones, surface), mesh(skin, membrane), mesh(veins, glowMaterial));
    inner.add(pivot);
    wings.push({ pivot, side });
  }

  const pose = { raise: 0, lean: 0, slump: 0 };
  return {
    root,
    materials: [surface, membrane],
    height: 27, // hooves to brow while hovering (the horns and the trident reach higher)
    animate(time, delta, enemy) {
      const rate = enemy.isFrozen ? 0 : enemy.speedFactor * (enemy.enraged ? 1.5 : 1);
      enemy.flapTime = (enemy.flapTime ?? Math.random() * 10) + delta * rate;
      const t = enemy.flapTime;
      // Poses ease in and out: the trident goes up while he winds up an attack, he leans into a charge, a stagger
      // slumps him.
      pose.raise = ease(pose.raise, enemy.glow > 0.3 && !enemy.dying ? 1 : 0, 7, delta);
      pose.lean = ease(pose.lean, enemy.ai?.mode === 'charge' ? 1 : 0, 6, delta);
      pose.slump = ease(pose.slump, enemy.ai?.staggerLeft > 0 ? 1 : 0, 5, delta);
      const { raise, lean, slump } = pose;

      inner.position.y = 1.6 + Math.sin(t * 2.2) * 1.3 - slump * 1.4;
      inner.rotation.x = lean * 0.5 + slump * 0.3 - raise * 0.12;
      head.rotation.x = slump * 0.5 - raise * 0.35 + Math.sin(t * 1.1) * 0.05;
      head.rotation.y = Math.sin(t * 0.7) * 0.18;

      // Right arm: trident held up at his side, raised high to strike. Left arm: the fireball held forward.
      const right = arms[1];
      right.shoulder.rotation.x = THREE.MathUtils.lerp(-0.35 + Math.sin(t * 2.2) * 0.06, -2.5, raise) + slump * 0.4;
      right.shoulder.rotation.z = 0.18 + raise * 0.1;
      right.elbow.rotation.x = THREE.MathUtils.lerp(-0.85, -0.25, raise);
      // The trident stands upright at his side and points forward over his head when raised.
      trident.rotation.x = THREE.MathUtils.lerp(0.1, 1, raise) - right.shoulder.rotation.x - right.elbow.rotation.x;
      const left = arms[-1];
      left.shoulder.rotation.x = THREE.MathUtils.lerp(-0.45 + Math.sin(t * 2.2 + 1) * 0.06, -1.35, raise) + slump * 0.5;
      left.shoulder.rotation.z = -0.22;
      left.elbow.rotation.x = THREE.MathUtils.lerp(-1.25, -0.5, raise) + slump * 0.6;
      fireball.scale.setScalar((1 + Math.sin(t * 9) * 0.12 + raise * 0.7) * (1 - slump * 0.6));
      fireball.rotation.y += delta * 3;

      // Goat legs dangle and kick while he hovers; they trail behind in a charge.
      for (const side of [-1, 1]) legs[side].rotation.x = 0.15 + Math.sin(t * 2.2 + side) * 0.12 + lean * 0.6;

      // The tail swishes from the root to the spade.
      tail.forEach((segment, i) => {
        segment.rotation.x = TAIL[i] + Math.sin(t * 1.8 - i * 0.5) * 0.08 - (i === 0 ? slump * 0.3 : 0);
        segment.rotation.y = Math.sin(t * 2.4 - i * 0.6) * (0.22 + lean * 0.1);
      });

      // Slow, heavy wingbeats; swept back in a charge, drooping when staggered.
      const flap = Math.sin(t * 4.5);
      for (const { pivot, side } of wings) {
        pivot.rotation.z = side * (0.2 + flap * 0.42 - slump * 0.5);
        pivot.rotation.y = side * (0.35 + lean * 0.55 + flap * 0.12);
      }

      if (enemy.dying) {
        // He falls out of the air, wings folding.
        inner.rotation.z += delta * 2.4;
        inner.rotation.x += delta * 1.2;
        for (const { pivot, side } of wings) pivot.rotation.z = side * -0.7;
      }
    },
  };
}
