import * as THREE from 'three';

// The camera always looks along this direction; ribbons are turned to face it.
const VIEW = new THREE.Vector3(-1, 1, -1).normalize();
const SCREEN_RIGHT = new THREE.Vector3(1, 1, 0).normalize();
const SPARKS = ['#ffffff', '#cfe0ff', '#9fb8ff'];

const random = (amount) => (Math.random() * 2 - 1) * amount;
const failures = new Set(); // errors already logged by Effects.update

/** Tags an object an effect adds to the scene, so `Effects.clear()` removes it even if the effect got lost. */
export function markEffect(object) {
  object.userData.effect = true;
  return object;
}

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
    this.meshes.push(markEffect(mesh));
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

    for (const enemy of this.options.hitsBees === false ? [] : ctx.aliveEnemies()) {
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

// Looks of falling hazards: meteors from space, brimstone from the Underworld, boulders from the mountain.
const METEOR_LOOKS = {
  meteor: { rock: '#3a2a4a', glow: '#c070ff', trail: ['#c070ff', '#9ff4ff', '#ffffff'], scorch: '#2a1a3a' },
  brimstone: { rock: '#2a1210', glow: '#ff5a10', trail: ['#ff6a00', '#ffb020', '#ffe066'], scorch: '#1a0804' },
  boulder: { rock: '#7d7a72', glow: null, trail: ['#d9c9a0', '#a8a598'], scorch: '#4a4638' },
};
const meteorGeometry = new THREE.DodecahedronGeometry(1, 1);

/**
 * A rock from the sky: a warning circle, a fall at an angle, an impact that hurts bees and (when
 * `hurtsPlayer`) Tode, and a scorch mark that fades. Like strikes, everyone simulates it; only the caller
 * deals damage to bees (`hitsBees`).
 */
class Meteor extends Effect {
  constructor(effects, position, { radius = 55, delay = 1.2, damage = 10, kind = 'meteor', hurtsPlayer = true, hitsBees = true }) {
    super(effects);
    Object.assign(this, { radius, delay, damage, hurtsPlayer, hitsBees });
    this.look = METEOR_LOOKS[kind] ?? METEOR_LOOKS.meteor;
    this.position = position.clone().setZ(0);
    this.disc = this.add(new THREE.Mesh(new THREE.CircleGeometry(1, 40), glowMaterial('#ff3020', 0.2)));
    this.edge = this.add(new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), glowMaterial('#ff4040', 0.8)));
    for (const mesh of [this.disc, this.edge]) {
      mesh.scale.setScalar(radius);
      mesh.position.set(position.x, position.y, 0.75);
    }
    this.from = this.position.clone().add(new THREE.Vector3(-220 + random(60), 220 + random(60), 650));
    this.rock = this.add(new THREE.Mesh(meteorGeometry.clone(), new THREE.MeshStandardMaterial({ color: this.look.rock, roughness: 0.8, flatShading: true, emissive: this.look.glow ?? '#000000', emissiveIntensity: this.look.glow ? 0.6 : 0 })));
    this.rock.scale.setScalar(radius * 0.32);
    this.rock.castShadow = true;
    this.rock.visible = false;
    this.fallTime = Math.min(0.6, delay * 0.6);
  }

  update(delta) {
    this.age += delta;
    const { ctx } = this.effects;
    if (this.age < this.delay) {
      const t = this.age / this.delay;
      this.disc.material.opacity = 0.12 + 0.2 * Math.abs(Math.sin(this.age * (6 + t * 26)));
      this.edge.scale.setScalar(this.radius * (0.6 + 0.4 * t));
      // The rock falls in during the last part of the warning.
      const fall = (this.age - (this.delay - this.fallTime)) / this.fallTime;
      if (fall > 0) {
        this.rock.visible = true;
        this.rock.position.lerpVectors(this.from, this.position, fall * fall);
        this.rock.rotation.x += delta * 6;
        this.rock.rotation.y += delta * 4;
        ctx.particles.burst(this.rock.position.clone().setZ(0), { count: 3, colors: this.look.trail, speed: 20, up: 0, gravity: 0, height: this.rock.position.z, size: 3, life: 0.4, glow: Boolean(this.look.glow) });
      }
      return true;
    }
    if (!this.landed) this.impact();
    // The scorch fades away.
    const fade = Math.max(0, 1 - (this.age - this.delay) / 1.5);
    this.disc.material.opacity = 0.5 * fade;
    return fade > 0;
  }

  impact() {
    this.landed = true;
    const { ctx } = this.effects;
    this.rock.visible = false;
    this.edge.visible = false;
    this.disc.material.dispose();
    this.disc.material = new THREE.MeshBasicMaterial({ color: this.look.scorch, transparent: true, opacity: 0.5, depthWrite: false });
    this.disc.scale.setScalar(this.radius * 0.8);
    ctx.play('boom');
    ctx.shake(8);
    this.effects.ring(this.position, { radius: this.radius * 1.5, color: this.look.glow ?? '#d9c9a0', duration: 0.5, thickness: 0.2 });
    ctx.particles.burst(this.position, { count: 36, colors: this.look.trail, speed: 260, up: 220, size: 2.6, height: 4, glow: Boolean(this.look.glow) });
    ctx.particles.burst(this.position, { count: 14, colors: [this.look.rock, '#5a4a40'], speed: 180, up: 260, size: 2.2, height: 4 });
    if (this.hitsBees) {
      for (const enemy of ctx.aliveEnemies()) {
        if (enemy.position.distanceTo(this.position) > this.radius + enemy.radius * 0.6) continue;
        const away = enemy.position.clone().sub(this.position).setZ(0).normalize();
        ctx.damageEnemy(enemy, this.damage, away, 260, 'blast');
      }
    }
    if (this.hurtsPlayer && ctx.player.position.distanceTo(this.position) < this.radius + ctx.player.radius * 0.6) ctx.hurtPlayer(1);
  }
}

/** A pulsing warning circle; calls `onDone` when time is up (e.g. an exploding elite bee). */
class Warning extends Effect {
  constructor(effects, position, { radius, delay, color = '#ff4040', onDone }) {
    super(effects);
    Object.assign(this, { delay, onDone });
    this.disc = this.add(new THREE.Mesh(new THREE.CircleGeometry(1, 40), glowMaterial(color, 0.25)));
    this.edge = this.add(new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), glowMaterial(color, 0.8)));
    for (const mesh of [this.disc, this.edge]) {
      mesh.scale.setScalar(radius);
      mesh.position.set(position.x, position.y, 0.7);
    }
  }

  update(delta) {
    this.age += delta;
    const t = this.age / this.delay;
    // Blink faster as the moment approaches.
    this.disc.material.opacity = 0.15 + 0.25 * Math.abs(Math.sin(this.age * (8 + t * 30)));
    if (t < 1) return true;
    this.onDone?.();
    return false;
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

  warning(position, options) {
    return this.addEffect(new Warning(this, position, options));
  }

  meteor(position, options) {
    return this.addEffect(new Meteor(this, position, options));
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
      try {
        const alive = effect.update(delta);
        if (!alive) effect.dispose();
        return alive;
      } catch (error) {
        // One broken effect must not take the rest with it: an exception here used to drop every effect still in
        // flight from the list without disposing it, and they stayed in the scene, frozen, into the garden.
        if (!failures.has(String(error))) {
          failures.add(String(error));
          console.error('Effect failed:', error);
        }
        try {
          effect.dispose();
        } catch {
          // clear() sweeps what's left
        }
        return false;
      }
    });
    this.list = [...survivors, ...this.list];
  }

  clear() {
    for (const effect of this.list) effect.dispose();
    this.list = [];
    // Anything an effect put in the scene that slipped out of the list goes too (tagged by `markEffect`).
    for (const object of [...this.ctx.scene.children]) if (object.userData.effect) object.removeFromParent();
  }
}
