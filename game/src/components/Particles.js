import * as THREE from 'three';

const GRAVITY = 260; // units per second², pulls particles back to the ground

function particleMesh(material, max) {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, max);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/**
 * Small flying bits drawn as instanced meshes: lit ones (droplets, fluff, dust)
 * and glowing ones (sparks, flames, magic) that light up with bloom.
 */
export class Particles {
  constructor(max = 900) {
    this.max = max;
    this.lit = particleMesh(new THREE.MeshLambertMaterial({ flatShading: true }), max);
    this.glowing = particleMesh(new THREE.MeshBasicMaterial({ fog: false }), max);
    this.mesh = new THREE.Group();
    this.mesh.add(this.lit, this.glowing);
    this.particles = [];
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.color = new THREE.Color();
    this.density = 1; // fewer particles with calm effects (pause menu)
  }

  /**
   * Sprays `count` particles from `position`.
   * `colors` are picked at random; `speed` is outward (negative = inward), `up` is the upward kick.
   * A negative `gravity` makes particles float up, like flames or sparkles.
   */
  burst(
    position,
    { count = 8, colors = ['#ffffff'], speed = 80, up = 60, size = 1.6, life = 0.5, height = 8, ring = 0, gravity = GRAVITY, glow = false }
  ) {
    count = this.density < 1 ? Math.round(count * this.density + Math.random() * 0.5) : count;
    for (let i = 0; i < count && this.particles.length < this.max; i++) {
      const angle = Math.random() * Math.PI * 2;
      const outward = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x: position.x + Math.cos(angle) * ring,
        y: position.y + Math.sin(angle) * ring,
        z: (position.z || 0) + height,
        vx: Math.cos(angle) * outward,
        vy: Math.sin(angle) * outward,
        vz: up * (0.5 + Math.random() * 0.8),
        size: size * (0.6 + Math.random() * 0.6),
        gravity,
        glow,
        age: 0,
        life: life * (0.7 + Math.random() * 0.6),
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  update(delta) {
    this.particles = this.particles.filter((p) => (p.age += delta) < p.life);
    let lit = 0;
    let glowing = 0;
    for (const p of this.particles) {
      p.vz -= p.gravity * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z = Math.max(0.5, p.z + p.vz * delta);
      if (p.z === 0.5) {
        p.vx *= 0.8;
        p.vy *= 0.8;
      }
      const shrink = 1 - (p.age / p.life) ** 2;
      this.matrix.compose(this.position.set(p.x, p.y, p.z), this.quaternion, this.scale.setScalar(p.size * shrink));
      const mesh = p.glow ? this.glowing : this.lit;
      const index = p.glow ? glowing++ : lit++;
      mesh.setMatrixAt(index, this.matrix);
      mesh.setColorAt(index, this.color.set(p.color));
    }
    for (const [mesh, count] of [
      [this.lit, lit],
      [this.glowing, glowing],
    ]) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    this.particles = [];
    this.lit.count = 0;
    this.glowing.count = 0;
  }
}
