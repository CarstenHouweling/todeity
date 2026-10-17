import * as THREE from 'three';

export const PROJECTILE_HEIGHT = 10;

const geometries = new Map();
const materials = new Map();

// --- Batches: every simple spit of one look is drawn by one InstancedMesh ------------------------------------------
// A late-game build has ~100 spits in flight, and each was a mesh of its own, drawn twice (the shadow pass): ~200
// draw calls, a third of a busy frame. Round spits, darts, bolts and throwing stars are now plain Object3Ds that
// carry the transform (`Projectile.mesh`, still added to and removed from the scene by main.js), and
// `drawProjectiles()` copies the ones still in the scene into their batch right before rendering. The batched
// geometries have radius 1; the scale carries the size. Axes, potions and fireballs (several parts) stay meshes.
const batches = new Map();
let batchScene = null;

/**
 * The scene the batches are drawn in (main.js, once). Two batches stay in it even when empty, so the instanced
 * shaders of a lit and an unlit spit are compiled with each arena's lights (during the journey there), not when Tode
 * spits for the first time there. Three compiles the program of an empty InstancedMesh too.
 */
export function initProjectiles(scene) {
  batchScene = scene;
  for (const material of [glossy('#ffffff', '#000000'), glowing('#ffffff')]) {
    const batch = batchFor(sphere(1), material);
    batch.warm = true;
    grow(batch, 1);
  }
}

function batchFor(geometry, material) {
  const key = `${geometry.uuid}/${material.uuid}`;
  let batch = batches.get(key);
  if (!batch) batches.set(key, (batch = { geometry, material, mesh: null, items: [] }));
  return batch;
}

function grow(batch, needed) {
  let capacity = batch.mesh?.instanceMatrix.count ?? 32;
  while (capacity < needed) capacity *= 2;
  batch.mesh?.removeFromParent();
  batch.mesh?.dispose();
  const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.frustumCulled = false; // the spits are all over the arena; the bounds would need recomputing every frame
  mesh.userData.keepGeometry = true; // shared, cached geometry
  batch.mesh = mesh;
  batchScene.add(mesh);
}

/** Copies the batched spits' transforms into their batches. Call every frame before rendering. */
export function drawProjectiles() {
  for (const batch of batches.values()) {
    const { items } = batch;
    // Spits are removed from the scene when they're spent (or the world is cleared): drop those.
    let live = 0;
    for (const item of items) if (item.parent) items[live++] = item;
    items.length = live;
    if (live > (batch.mesh?.instanceMatrix.count ?? 0)) grow(batch, live);
    if (!batch.mesh) continue;
    if (!batch.mesh.parent) batchScene.add(batch.mesh);
    for (let i = 0; i < live; i++) {
      items[i].updateMatrix();
      batch.mesh.setMatrixAt(i, items[i].matrix);
    }
    batch.mesh.count = live;
    batch.mesh.visible = live > 0 || batch.warm;
    if (live) batch.mesh.instanceMatrix.needsUpdate = true;
  }
}

function sphere(radius) {
  if (!geometries.has(radius)) geometries.set(radius, new THREE.SphereGeometry(radius, 12, 8));
  return geometries.get(radius);
}

/** A flat four-pointed throwing star (lying in the ground plane, the world is Z-up). */
function starGeometry(radius) {
  const key = `star:${radius}`;
  if (!geometries.has(key)) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = i % 2 ? radius * 0.38 : radius * 1.5;
      if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    geometries.set(key, new THREE.ExtrudeGeometry(shape, { depth: radius * 0.25, bevelEnabled: false }).translate(0, 0, -radius * 0.12));
  }
  return geometries.get(key);
}

/** A throwing axe lying in the ground plane: a handle along +X and a curved blade at its end. */
function axe(radius) {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(cached(`axe-handle:${radius}`, () => new THREE.BoxGeometry(radius * 3.6, radius * 0.5, radius * 0.5)), glossy('#7a4a22', '#2a1408'));
  handle.position.x = -radius * 0.4;
  const blade = new THREE.Mesh(
    cached(`axe-blade:${radius}`, () => {
      const shape = new THREE.Shape();
      shape.moveTo(0, -radius * 0.4);
      shape.quadraticCurveTo(radius * 1.9, -radius * 1.4, radius * 1.4, radius * 0.2);
      shape.quadraticCurveTo(radius * 1.9, radius * 1.6, 0, radius * 0.4);
      shape.lineTo(0, -radius * 0.4);
      return new THREE.ExtrudeGeometry(shape, { depth: radius * 0.3, bevelEnabled: false }).translate(radius * 0.9, 0, -radius * 0.15);
    }),
    glossy('#d8dde6', '#4a5260')
  );
  group.add(handle, blade);
  return group;
}

/** A round flask of brew with a cork; the liquid's colour varies. */
const POTION_COLORS = ['#7ed957', '#ff6ab0', '#5fb8ff', '#ffb020', '#b48cff'];
function potion(radius) {
  const group = new THREE.Group();
  const color = POTION_COLORS[Math.floor(Math.random() * POTION_COLORS.length)];
  const flask = new THREE.Mesh(sphere(radius * 1.25), glowing(color));
  const glass = new THREE.Mesh(sphere(radius * 1.45), glass_());
  const neck = new THREE.Mesh(cached(`neck:${radius}`, () => new THREE.CylinderGeometry(radius * 0.45, radius * 0.55, radius * 1.2, 8).rotateX(Math.PI / 2)), glass_());
  neck.position.z = radius * 1.6;
  const cork = new THREE.Mesh(cached(`cork:${radius}`, () => new THREE.CylinderGeometry(radius * 0.5, radius * 0.45, radius * 0.6, 8).rotateX(Math.PI / 2)), glossy('#a0703a', '#2a1408'));
  cork.position.z = radius * 2.3;
  group.add(flask, glass, neck, cork);
  group.userData.color = color;
  return group;
}

/** A small fireball: a white-hot core in a flickering flame. */
function fireball(radius) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(sphere(radius * 0.8), glowing('#fff0b0'));
  const flame = new THREE.Mesh(sphere(radius * 1.35), additiveGlow('#ff7a1a', 0.75));
  const halo = new THREE.Mesh(sphere(radius * 2), additiveGlow('#ff3a00', 0.3));
  group.add(halo, flame, core);
  group.userData.flame = flame;
  group.userData.halo = halo;
  return group;
}

function cached(key, make) {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
}

function glass_() {
  const key = 'glass';
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }));
  return materials.get(key);
}

function additiveGlow(color, opacity) {
  const key = `add:${color}:${opacity}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  return materials.get(key);
}

const LOB_GRAVITY = 1400; // potions fall back down in an arc
const LOB_TIME = [0.5, 0.8]; // seconds in the air: short throws go up higher, long ones fly faster

function glowing(color) {
  const key = `glow:${color}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  return materials.get(key);
}

function glossy(color, emissive) {
  const key = `${color}/${emissive}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.3 }));
  return materials.get(key);
}

export class Projectile {
  constructor(
    origin,
    direction,
    { speed, range, damage, radius = 3.5, color = 0x9be33a, emissive = 0x3f7a0c, stretch = 1, pierce = 0, shape = null }
  ) {
    // The classes' spit (see Classes.js): darts, fireballs, potions, axes or throwing stars; Tode's is a round blob.
    if (shape === 'pellet') radius *= 0.75;
    if (shape === 'dart') stretch = 2.6;
    let size = 1; // a batched spit's scale (its geometry has radius 1)
    if (shape === 'axe') this.mesh = axe(radius * 1.3);
    else if (shape === 'potion') this.mesh = potion(radius);
    else if (shape === 'fireball') this.mesh = fireball(radius);
    else {
      const look =
        shape === 'star'
          ? [starGeometry(1), glossy('#c8ccd4', '#3a3a4a')]
          : [sphere(1), shape === 'bolt' ? glowing('#d8c0ff') : shape === 'dart' ? glossy('#e8d9a0', '#6a5a2a') : glossy(color, emissive)];
      size = shape === 'dart' ? radius * 0.7 : radius;
      this.mesh = new THREE.Object3D();
      this.mesh.matrixAutoUpdate = false; // drawProjectiles() updates the matrix
      batchFor(...look).items.push(this.mesh);
    }
    // A potion is lobbed: it flies over the bees in an arc and shatters where it lands (after `range`).
    this.lob = shape === 'potion';
    this.age = 0;
    if (this.lob) speed = range / Math.min(LOB_TIME[1], Math.max(LOB_TIME[0], range / speed));
    this.climb = this.lob ? (LOB_GRAVITY * (range / speed)) / 2 : 0;
    this.shape = shape;
    this.mesh.castShadow = true;
    this.mesh.position.set(origin.x, origin.y, PROJECTILE_HEIGHT);
    this.direction = direction.clone().setZ(0).normalize();
    this.mesh.scale.set(stretch * size, size, size);
    this.mesh.rotation.z = Math.atan2(this.direction.y, this.direction.x);
    this.speed = speed;
    this.range = range;
    this.damage = damage;
    this.radius = radius;
    this.pierce = pierce; // how many extra enemies it can pass through
    this.hits = new Set();
    this.traveled = 0;
  }

  get position() {
    return this.mesh.position;
  }

  get isSpent() {
    return this.traveled >= this.range;
  }

  update(delta) {
    const step = this.speed * delta;
    this.age += delta;
    this.mesh.position.addScaledVector(this.direction, step);
    this.traveled += step;
    if (this.shape === 'star') this.mesh.rotation.z += delta * 22; // spinning
    else if (this.shape === 'axe') this.mesh.rotation.z -= delta * 16; // spinning end over end, seen from above
    else if (this.lob) {
      // Thrown like a ball: up, then gravity brings it down; the flask tumbles.
      this.mesh.position.z = PROJECTILE_HEIGHT + this.climb * this.age - (LOB_GRAVITY * this.age ** 2) / 2;
      this.mesh.rotation.x += delta * 9;
      this.mesh.rotation.y += delta * 5;
    } else this.mesh.rotation.z = Math.atan2(this.direction.y, this.direction.x); // homing bolts turn as they steer
    if (this.shape === 'fireball') {
      const flicker = 1 + 0.18 * Math.sin(this.age * 47) + 0.1 * Math.sin(this.age * 83);
      this.mesh.userData.flame.scale.setScalar(flicker);
      this.mesh.userData.halo.scale.setScalar(2 - flicker);
    }
  }

  get color() {
    return this.mesh.userData.color;
  }

  dispose() {
    this.mesh.removeFromParent();
  }
}
