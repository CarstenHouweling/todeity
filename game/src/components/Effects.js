import * as THREE from 'three';

// The camera always looks along this direction; ribbons are turned to face it.
const VIEW = new THREE.Vector3(-1, 1, -1).normalize();
const SCREEN_RIGHT = new THREE.Vector3(1, 1, 0).normalize();
const SPARKS = ['#ffffff', '#cfe0ff', '#9fb8ff'];

const random = (amount) => (Math.random() * 2 - 1) * amount;

function jaggedPoints(from, to, segments, jitter) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const point = from.clone().lerp(to, i / segments);
    if (i > 0 && i < segments) point.add(new THREE.Vector3(random(jitter), random(jitter), random(jitter)));
    points.push(point);
  }
  return points;
}

/** A flat strip through `points` that always faces the camera. */
function ribbonGeometry(points, width) {
  const positions = [];
  const indices = [];
  const direction = new THREE.Vector3();
  const side = new THREE.Vector3();
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    direction.subVectors(after, before).normalize();
    side.crossVectors(direction, VIEW);
    if (side.lengthSq() < 1e-6) side.copy(SCREEN_RIGHT);
    side.normalize().multiplyScalar(width / 2);
    positions.push(point.x + side.x, point.y + side.y, point.z + side.z, point.x - side.x, point.y - side.y, point.z - side.z);
    if (i < points.length - 1) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

const glowMaterial = (color, opacity) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });

/** Base class: a set of meshes with a lifetime. `update()` returns false when done. */
class Effect {
  constructor(effects) {
    this.effects = effects;
    this.meshes = [];
    this.age = 0;
  }

  add(mesh) {
    this.meshes.push(mesh);
    this.effects.ctx.scene.add(mesh);
    return mesh;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

class Bolt extends Effect {
  constructor(effects, from, to, { color = '#9fb8ff', width = 3, life = 0.2, jitter = 9 }) {
    super(effects);
    Object.assign(this, { from, to, color, width, life, jitter });
    this.build();
  }

  build() {
    this.dispose();
    this.meshes = [];
    const segments = Math.max(4, Math.round(this.from.distanceTo(this.to) / 25));
    const points = jaggedPoints(this.from, this.to, segments, this.jitter);
    this.core = this.add(new THREE.Mesh(ribbonGeometry(points, this.width), glowMaterial('#ffffff', 1)));
    this.glow = this.add(new THREE.Mesh(ribbonGeometry(points, this.width * 4), glowMaterial(this.color, 0.45)));
  }

  update(delta) {
    this.age += delta;
    // Lightning flickers: re-draw the path once halfway.
    if (!this.flickered && this.age > this.life / 2) {
      this.flickered = true;
      this.build();
    }
    const fade = 1 - this.age / this.life;
    this.core.material.opacity = fade;
    this.glow.material.opacity = 0.45 * fade;
    return this.age < this.life;
  }
}

class Ring extends Effect {
  constructor(effects, position, { radius, color = '#ffffff', duration = 0.5, opacity = 0.8, thickness = 0.12, z = 1 }) {
    super(effects);
    Object.assign(this, { radius, duration, opacity });
    this.ring = this.add(new THREE.Mesh(new THREE.RingGeometry(1 - thickness, 1, 64), glowMaterial(color, opacity)));
    this.ring.position.set(position.x, position.y, z);
  }

  update(delta) {
    this.age += delta;
    const t = Math.min(1, this.age / this.duration);
    this.ring.scale.setScalar(Math.max(0.01, this.radius * (1 - (1 - t) ** 3)));
    this.ring.material.opacity = this.opacity * (1 - t);
    return t < 1;
  }
}

/** A warning circle, then a bolt from the sky. */
class Strike extends Effect {
  constructor(effects, position, options) {
    super(effects);
    this.position = position.clone().setZ(0);
    this.options = { damage: 8, radius: 40, delay: 0, hurtsPlayer: false, color: '#9fb8ff', ...options };
    if (this.options.delay > 0) {
      this.warning = this.add(
        new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), glowMaterial(this.options.hurtsPlayer ? '#ff4040' : '#bcd4ff', 0.7))
      );
      this.warning.scale.setScalar(this.options.radius);
      this.warning.position.set(position.x, position.y, 0.8);
    }
  }

  update(delta) {
    this.age += delta;
    const { delay } = this.options;
    if (this.warning && this.age < delay) {
      this.warning.material.opacity = 0.35 + 0.35 * Math.sin(this.age * 30);
      return true;
    }
    if (!this.struck) this.strike();
    return false;
  }

  strike() {
    this.struck = true;
    const { ctx } = this.effects;
    const { damage, radius, hurtsPlayer, color, from, source = 'lightning' } = this.options;
    const sky = from ?? this.position.clone().add(new THREE.Vector3(random(60), random(60), 420));
    this.effects.bolt(sky, this.position.clone().setZ(2), { color, width: 6, life: 0.25, jitter: 22 });
    this.effects.ring(this.position, { radius: radius * 1.4, color, duration: 0.35 });
    ctx.particles.burst(this.position, { count: 14, colors: SPARKS, speed: 140, up: 120, size: 1.6, height: 4, glow: true });
    ctx.play('zap');
    if (damage >= 8) ctx.play('thunder');
    ctx.shake(5);
    ctx.postfx.flash('#dfe8ff', 0.18);

    for (const enemy of ctx.aliveEnemies()) {
      const distance = enemy.position.distanceTo(this.position);
      if (distance > radius + enemy.radius * 0.6) continue;
      const away = enemy.position.clone().sub(this.position).setZ(0).normalize();
      ctx.lightningHit?.(enemy);
      ctx.damageEnemy(enemy, damage, away, 120, source);
    }
    if (hurtsPlayer && ctx.player.position.distanceTo(this.position) < radius + ctx.player.radius * 0.6) ctx.hurtPlayer(1);
  }

  dispose() {
    super.dispose();
  }
}

/** A puddle on the ground that sets bees inside it burning (lava, scalding steam). */
class Pool extends Effect {
  constructor(effects, position, { radius, dps, duration, color = '#ff5a1f', opacity = 0.5, particleColors }) {
    super(effects);
    Object.assign(this, { position: position.clone().setZ(0), radius, dps, duration, opacity, particleColors });
    this.disc = this.add(new THREE.Mesh(new THREE.CircleGeometry(radius, 40), glowMaterial(color, opacity)));
    this.disc.position.set(position.x, position.y, 0.6);
    this.tick = 0;
  }

  update(delta) {
    this.age += delta;
    const { ctx } = this.effects;
    const t = this.age / this.duration;
    const grow = Math.min(1, this.age * 6);
    this.disc.scale.setScalar(grow * (1 + 0.04 * Math.sin(this.age * 8)));
    this.disc.material.opacity = this.opacity * (t > 0.75 ? (1 - t) / 0.25 : 1);

    this.tick -= delta;
    if (this.tick <= 0) {
      this.tick = 0.25;
      for (const enemy of ctx.aliveEnemies()) {
        if (enemy.position.distanceTo(this.position) < this.radius + enemy.radius * 0.5) enemy.applyBurn(this.dps, 1);
      }
      if (this.particleColors) {
        const spot = this.position.clone().add(new THREE.Vector3(random(this.radius * 0.7), random(this.radius * 0.7), 0));
        ctx.particles.burst(spot, { count: 2, colors: this.particleColors, speed: 10, up: 70, size: 1.6, height: 1, gravity: -40, life: 0.7, glow: true });
      }
    }
    return t < 1;
  }
}

/** Manages short-lived visual effects. Damage goes through `ctx` so kills are counted normally. */
export class Effects {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
  }

  addEffect(effect) {
    this.list.push(effect);
    return effect;
  }

  bolt(from, to, options = {}) {
    return this.addEffect(new Bolt(this, from, to, options));
  }

  ring(position, options) {
    return this.addEffect(new Ring(this, position, options));
  }

  strike(position, options) {
    return this.addEffect(new Strike(this, position, options));
  }

  pool(position, options) {
    return this.addEffect(new Pool(this, position, options));
  }

  /** Damages every bee within `radius` and shows a ring of the given colour. */
  blast(position, { radius, damage, knockback = 200, color = '#ffd27a', source = 'blast', particleColors }) {
    const { ctx } = this;
    this.ring(position, { radius, color, duration: 0.35 });
    if (particleColors) ctx.particles.burst(position, { count: 10, colors: particleColors, speed: radius * 2.5, up: 80, size: 1.5, height: 8 });
    for (const enemy of ctx.aliveEnemies()) {
      const away = enemy.position.clone().sub(position).setZ(0);
      if (away.length() > radius + enemy.radius * 0.5) continue;
      ctx.damageEnemy(enemy, damage, away.normalize(), knockback, source);
    }
  }

  /**
   * Lightning that jumps from `start` to up to `count` bees, each closest to the last.
   * `hit` holds bees that shouldn't be hit again.
   */
  chain(start, count, damage, { range = 170, hit = new Set() } = {}) {
    const { ctx } = this;
    let from = start.clone().setZ(10);
    for (let i = 0; i < count; i++) {
      let next = null;
      let best = range;
      for (const enemy of ctx.aliveEnemies()) {
        if (hit.has(enemy)) continue;
        const distance = enemy.position.distanceTo(from.clone().setZ(0));
        if (distance < best) {
          best = distance;
          next = enemy;
        }
      }
      if (!next) break;
      hit.add(next);
      const to = next.position.clone().setZ(10);
      this.bolt(from, to, { width: 2.5, life: 0.18 });
      ctx.lightningHit?.(next);
      ctx.damageEnemy(next, damage, null, 0, 'lightning');
      from = to;
    }
    if (count > 0) ctx.play('zap');
  }

  update(delta) {
    // Effects can start new effects while updating (a storm calls strikes), so collect those separately.
    const current = this.list;
    this.list = [];
    const survivors = current.filter((effect) => {
      const alive = effect.update(delta);
      if (!alive) effect.dispose();
      return alive;
    });
    this.list = [...survivors, ...this.list];
  }

  clear() {
    for (const effect of this.list) effect.dispose();
    this.list = [];
  }
}
