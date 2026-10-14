import * as THREE from 'three';

/**
 * Tea-leaf experience orbs: bees drop them, they bob on the ground and fly to Tode once he is within his
 * magnet range. Drawn as one instanced mesh. Every player collects their own copy in co-op.
 */
export class Leaves {
  constructor(scene, max = 500) {
    this.max = max;
    this.list = [];
    const shape = new THREE.Shape();
    shape.moveTo(0, -3);
    shape.quadraticCurveTo(2.6, 0, 0, 3.4);
    shape.quadraticCurveTo(-2.6, 0, 0, -3);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2 });
    geometry.center();
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.3, 1.3) }), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.colors = [new THREE.Color('#7ed957'), new THREE.Color('#c8f77a'), new THREE.Color('#ffd36b')];
    this.time = 0;
  }

  /** Scatters `count` leaves worth `value` in total around `position`. */
  drop(position, value, count = 1) {
    for (let i = 0; i < count && this.list.length < this.max; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 14 * Math.sqrt(count);
      const worth = value / count;
      this.list.push({
        x: position.x + Math.cos(angle) * distance,
        y: position.y + Math.sin(angle) * distance,
        z: 20,
        vz: 60 + Math.random() * 60,
        value: worth,
        size: worth >= 5 ? 1.6 : worth >= 2 ? 1.25 : 1,
        color: this.colors[worth >= 5 ? 2 : worth >= 2 ? 1 : 0],
        phase: Math.random() * 10,
        pulled: false,
        speed: 0,
      });
    }
  }

  /** Bobs, magnetises and collects; returns the value Tode picked up this frame. */
  update(delta, target, magnet, pickup = 14) {
    this.time += delta;
    let collected = 0;
    for (const leaf of this.list) {
      // Pop out, then settle just above the ground.
      if (leaf.z > 6 || leaf.vz > 0) {
        leaf.vz -= 260 * delta;
        leaf.z = Math.max(6, leaf.z + leaf.vz * delta);
        if (leaf.z === 6) leaf.vz = 0;
      }
      const dx = target.x - leaf.x;
      const dy = target.y - leaf.y;
      const distance = Math.hypot(dx, dy);
      if (distance < magnet) leaf.pulled = true;
      if (leaf.pulled) {
        leaf.speed = Math.min(900, leaf.speed + 1600 * delta);
        const step = Math.min(distance, leaf.speed * delta);
        leaf.x += (dx / (distance || 1)) * step;
        leaf.y += (dy / (distance || 1)) * step;
      }
      if (distance < pickup) {
        leaf.collected = true;
        collected += leaf.value;
      }
    }
    this.list = this.list.filter((leaf) => !leaf.collected);
    this.draw();
    return collected;
  }

  /** Pulls every leaf on the field to Tode (at the end of a wave). */
  vacuum() {
    for (const leaf of this.list) leaf.pulled = true;
  }

  clear() {
    this.list = [];
    this.draw();
  }

  draw() {
    const { matrix, quaternion, euler, position, scale } = this;
    this.list.forEach((leaf, i) => {
      const t = this.time * 3 + leaf.phase;
      quaternion.setFromEuler(euler.set(0.9, t, 0.3 * Math.sin(t)));
      position.set(leaf.x, leaf.y, leaf.z + Math.sin(t * 1.3) * 1.5);
      scale.setScalar(leaf.size * (1 + 0.12 * Math.sin(t * 2)));
      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(i, matrix);
      this.mesh.setColorAt(i, leaf.color);
    });
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Tea leaves needed to go from `level` to the next one. */
// About one level per wave: 8 leaves for the first, then steeper.
export const leavesForLevel = (level) => Math.round(8 + level * 5 + level * level * 0.6);
