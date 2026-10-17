import * as THREE from 'three';

const HEIGHT = 10;

/**
 * Enemy bullets for the bullet hell: hundreds of glowing orbs drawn with three instanced meshes (a dark rim, a
 * coloured halo and a white-hot core), so a screen full of bullets costs three draw calls.
 * Readability: the dark rim keeps bullets visible on bright floors and in bloom, and bullets draw after every
 * other transparent effect, so Tode's own sparkles never cover them.
 * A bullet: { x, y, dx, dy, speed, radius, damage, range, traveled, color, dead }.
 */
export class Bullets {
  constructor(scene, max = 900) {
    this.max = max;
    this.list = [];
    const sphere = new THREE.SphereGeometry(1, 10, 7); // a dot a few pixels wide: 126 triangles, three layers of hundreds
    this.core = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) }), max);
    this.halo = new THREE.InstancedMesh(
      sphere,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
      max
    );
    this.rim = new THREE.InstancedMesh(
      sphere,
      // Back faces only: the white core (in front of them) stays visible, the rim shows around it.
      new THREE.MeshBasicMaterial({ color: '#12001c', transparent: true, opacity: 0.5, depthWrite: false, fog: false, side: THREE.BackSide }),
      max
    );
    this.rim.renderOrder = 20;
    this.halo.renderOrder = 21;
    this.core.renderOrder = 22;
    for (const mesh of [this.rim, this.core, this.halo]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    this.halo.setColorAt(0, new THREE.Color()); // creates the colour buffer
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.color = new THREE.Color();
    this.time = 0;
  }

  /**
   * The core's look in an arena: `tint` takes in some of the arena's bullet colour, `glow` is how far past white it
   * goes (the bloom threshold is 0.93). The Underworld's stronger bloom turned white-hot 2.2 cores into big white
   * blobs, and on the Sky Citadel's white marble they were white on white, so those arenas tint them (`bulletCore`).
   */
  setCore(color, { tint = 0, glow = 2.2 } = {}) {
    this.core.material.color.set('#ffffff').lerp(new THREE.Color(color), tint).multiplyScalar(glow);
  }

  spawn(origin, direction, { speed = 230, radius = 4, damage = 1, range = 700, color = '#c070ff', stretch = 1.6 } = {}) {
    if (this.list.length >= this.max) return null;
    const length = Math.hypot(direction.x, direction.y) || 1;
    const bullet = {
      x: origin.x,
      y: origin.y,
      dx: direction.x / length,
      dy: direction.y / length,
      speed,
      radius,
      damage,
      range,
      traveled: 0,
      color: new THREE.Color(color),
      stretch,
      dead: false,
    };
    this.list.push(bullet);
    return bullet;
  }

  /** Moves the bullets; `each(bullet)` may set `bullet.dead`. Dead and spent bullets are removed. */
  update(delta, each) {
    this.time += delta;
    for (const bullet of this.list) {
      const step = bullet.speed * delta;
      bullet.x += bullet.dx * step;
      bullet.y += bullet.dy * step;
      bullet.traveled += step;
      if (bullet.traveled >= bullet.range) bullet.dead = true;
      if (!bullet.dead) each?.(bullet);
    }
    this.list = this.list.filter((bullet) => !bullet.dead);
    this.draw();
  }

  /** Kills every bullet within `radius` of `center`; returns the ones it removed. */
  cancel(center, radius) {
    const removed = this.list.filter((b) => (b.x - center.x) ** 2 + (b.y - center.y) ** 2 < radius * radius);
    for (const bullet of removed) bullet.dead = true;
    this.list = this.list.filter((bullet) => !bullet.dead);
    this.draw();
    return removed;
  }

  clear() {
    this.list = [];
    this.draw();
  }

  draw() {
    const { matrix, position, scale, rotation } = this;
    const pulse = 1 + 0.15 * Math.sin(this.time * 18);
    this.list.forEach((bullet, i) => {
      rotation.setFromAxisAngle(Z_AXIS, Math.atan2(bullet.dy, bullet.dx));
      position.set(bullet.x, bullet.y, HEIGHT);
      scale.set(bullet.radius * bullet.stretch * 0.75, bullet.radius * 0.6, bullet.radius * 0.6);
      matrix.compose(position, rotation, scale);
      this.core.setMatrixAt(i, matrix);
      // The rim sticks out past the halo: a dark outline around the glow.
      scale.set(bullet.radius * bullet.stretch * 1.7 * pulse, bullet.radius * 1.5 * pulse, bullet.radius * 1.5 * pulse);
      matrix.compose(position, rotation, scale);
      this.rim.setMatrixAt(i, matrix);
      scale.set(bullet.radius * bullet.stretch * 1.5 * pulse, bullet.radius * 1.3 * pulse, bullet.radius * 1.3 * pulse);
      matrix.compose(position, rotation, scale);
      this.halo.setMatrixAt(i, matrix);
      this.halo.setColorAt(i, bullet.color);
    });
    this.core.count = this.halo.count = this.rim.count = this.list.length;
    this.rim.instanceMatrix.needsUpdate = true;
    this.core.instanceMatrix.needsUpdate = true;
    this.halo.instanceMatrix.needsUpdate = true;
    if (this.halo.instanceColor) this.halo.instanceColor.needsUpdate = true;
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
