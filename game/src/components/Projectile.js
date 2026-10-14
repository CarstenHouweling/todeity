import * as THREE from 'three';

export const PROJECTILE_HEIGHT = 10;

const geometries = new Map();
const materials = new Map();

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
    // The classes' spit (see Classes.js): pellets, darts, magic bolts or throwing stars; Tode's is a round blob.
    if (shape === 'pellet') radius *= 0.75;
    if (shape === 'dart') stretch = 2.6;
    this.mesh =
      shape === 'star'
        ? new THREE.Mesh(starGeometry(radius), glossy('#c8ccd4', '#3a3a4a'))
        : new THREE.Mesh(sphere(shape === 'dart' ? radius * 0.7 : radius), shape === 'bolt' ? glowing('#d8c0ff') : shape === 'dart' ? glossy('#e8d9a0', '#6a5a2a') : glossy(color, emissive));
    this.shape = shape;
    this.mesh.castShadow = true;
    this.mesh.position.set(origin.x, origin.y, PROJECTILE_HEIGHT);
    this.direction = direction.clone().setZ(0).normalize();
    this.mesh.scale.set(stretch, 1, 1);
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
    this.mesh.position.addScaledVector(this.direction, step);
    this.traveled += step;
    if (this.shape === 'star') this.mesh.rotation.z += delta * 22; // spinning
    else this.mesh.rotation.z = Math.atan2(this.direction.y, this.direction.x); // homing bolts turn as they steer
  }

  dispose() {
    this.mesh.removeFromParent();
  }
}
