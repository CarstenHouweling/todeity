import * as THREE from 'three';

export const PROJECTILE_HEIGHT = 10;

const geometries = new Map();
const materials = new Map();

function sphere(radius) {
  if (!geometries.has(radius)) geometries.set(radius, new THREE.SphereGeometry(radius, 12, 8));
  return geometries.get(radius);
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
    { speed, range, damage, radius = 3.5, color = 0x9be33a, emissive = 0x3f7a0c, stretch = 1, pierce = 0 }
  ) {
    this.mesh = new THREE.Mesh(sphere(radius), glossy(color, emissive));
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
  }

  dispose() {
    this.mesh.removeFromParent();
  }
}
