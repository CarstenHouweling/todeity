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

/** The vertices of a flat strip through `points` that always faces the camera: two per point. */
function ribbonVertices(points, width) {
  const positions = new Float32Array(points.length * 6);
  const direction = new THREE.Vector3();
  const side = new THREE.Vector3();
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    direction.subVectors(after, before).normalize();
    side.crossVectors(direction, VIEW);
    if (side.lengthSq() < 1e-6) side.copy(SCREEN_RIGHT);
    side.normalize().multiplyScalar(width / 2);
    positions.set([point.x + side.x, point.y + side.y, point.z + side.z, point.x - side.x, point.y - side.y, point.z - side.z], i * 6);
  });
  return positions;
}

/**
 * Every bolt in flight is drawn by one mesh: each frame `draw()` writes their ribbons into a shared buffer, the
 * fade baked into the vertex colours (additive blending, so order doesn't matter). A bolt used to be two meshes of
 * its own with fresh geometry and materials: a late endless build's chain procs kept ~100 in flight.
 */
const BOLT_VERTICES = 16384;
class BoltBatch {
  constructor() {
    this.positions = new Float32Array(BOLT_VERTICES * 3);
    this.colors = new Float32Array(BOLT_VERTICES * 3);
    this.indices = new Uint16Array(BOLT_VERTICES * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(this.indices, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  /** Draws `bolts` (each with `ribbons`: [{ positions, color, opacity }] and its `fade`) into the scene. */
  draw(scene, bolts) {
    if (this.mesh.parent !== scene) scene.add(this.mesh);
    let vertex = 0;
    let index = 0;
    for (const bolt of bolts) {
      for (const { positions, color, opacity } of bolt.ribbons) {
        const count = positions.length / 3;
        if (vertex + count > BOLT_VERTICES) break;
        this.positions.set(positions, vertex * 3);
        const strength = opacity * bolt.fade;
        for (let i = 0; i < count; i++) {
          this.colors[(vertex + i) * 3] = color.r * strength;
          this.colors[(vertex + i) * 3 + 1] = color.g * strength;
          this.colors[(vertex + i) * 3 + 2] = color.b * strength;
        }
        for (let k = vertex; k < vertex + count - 2; k += 2) {
          this.indices.set([k, k + 1, k + 2, k + 1, k + 3, k + 2], index);
          index += 6;
        }
        vertex += count;
      }
    }
    const { geometry } = this.mesh;
    geometry.setDrawRange(0, index);
    this.mesh.visible = index > 0;
    if (!index) return;
    for (const attribute of [geometry.attributes.position, geometry.attributes.color, geometry.index]) {
      attribute.clearUpdateRanges?.();
      attribute.addUpdateRange?.(0, attribute === geometry.index ? index : vertex * 3);
      attribute.needsUpdate = true;
    }
  }

  clear() {
    this.mesh.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }
}

// Circles and rings are drawn at radius 1 and scaled, so they share one geometry per shape (an endless wave's
// hazards and procs made and freed hundreds a second). `Effect.dispose` leaves anything in SHARED alone.
const SHARED = new WeakSet();
const sharedGeometries = new Map();
function shared(key, make) {
  if (!sharedGeometries.has(key)) {
    const geometry = make();
    SHARED.add(geometry);
    sharedGeometries.set(key, geometry);
  }
  return sharedGeometries.get(key);
}
const unitCircle = (segments) => shared(`circle:${segments}`, () => new THREE.CircleGeometry(1, segments));
const unitRing = (inner, segments) => shared(`ring:${inner}:${segments}`, () => new THREE.RingGeometry(inner, 1, segments));

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
      if (!SHARED.has(mesh.geometry)) mesh.geometry.dispose();
      if (!SHARED.has(mesh.material)) mesh.material.dispose();
    }
  }
}

const WHITE = new THREE.Color('#ffffff');

class Bolt extends Effect {
  constructor(effects, from, to, { color = '#9fb8ff', width = 3, life = 0.2, jitter = 9 }) {
    super(effects);
    Object.assign(this, { from, to, width, life, jitter, color: new THREE.Color(color), fade: 1 });
    effects.bolts++;
    this.segments = Math.max(4, Math.round(from.distanceTo(to) / 25));
    this.shape();
  }

  /** A white core in a wider coloured glow along a fresh jagged path (drawn by the BoltBatch). */
  shape() {
    const points = jaggedPoints(this.from, this.to, this.segments, this.jitter);
    this.ribbons = [
      { positions: ribbonVertices(points, this.width * 4), color: this.color, opacity: 0.45 },
      { positions: ribbonVertices(points, this.width), color: WHITE, opacity: 1 },
    ];
  }

  update(delta) {
    this.age += delta;
    // Lightning flickers: re-draw the path once halfway.
    if (!this.flickered && this.age > this.life / 2) {
      this.flickered = true;
      this.shape();
    }
    this.fade = Math.max(0, 1 - this.age / this.life);
    return this.age < this.life;
  }

  dispose() {
    if (!this.gone) this.effects.bolts--;
    this.gone = true;
  }
}

class Ring extends Effect {
  constructor(effects, position, { radius, color = '#ffffff', duration = 0.5, opacity = 0.8, thickness = 0.12, z = 1 }) {
    super(effects);
    Object.assign(this, { radius, duration, opacity });
    this.ring = this.add(new THREE.Mesh(unitRing(1 - thickness, 64), glowMaterial(color, opacity)));
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
        new THREE.Mesh(unitRing(0.8, 48), glowMaterial(this.options.hurtsPlayer ? '#ff4040' : '#bcd4ff', 0.7))
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
    this.effects.bolt(sky, this.position.clone().setZ(2), { color, width: 6, life: 0.25, jitter: 22, always: true });
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
SHARED.add(meteorGeometry);
const rockMaterials = new Map(); // one per look, shared by every rock
function rockMaterial(look) {
  if (!rockMaterials.has(look)) {
    const material = new THREE.MeshStandardMaterial({ color: look.rock, roughness: 0.8, flatShading: true, emissive: look.glow ?? '#000000', emissiveIntensity: look.glow ? 0.6 : 0 });
    SHARED.add(material);
    rockMaterials.set(look, material);
  }
  return rockMaterials.get(look);
}
const TRAIL_EVERY = 1 / 30; // a falling rock's trail puffs at most this often, whatever the frame rate

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
    this.disc = this.add(new THREE.Mesh(unitCircle(40), glowMaterial('#ff3020', 0.2)));
    this.edge = this.add(new THREE.Mesh(unitRing(0.88, 48), glowMaterial('#ff4040', 0.8)));
    for (const mesh of [this.disc, this.edge]) {
      mesh.scale.setScalar(radius);
      mesh.position.set(position.x, position.y, 0.75);
    }
    this.from = this.position.clone().add(new THREE.Vector3(-220 + random(60), 220 + random(60), 650));
    this.rock = this.add(new THREE.Mesh(meteorGeometry, rockMaterial(this.look)));
    this.rock.scale.setScalar(radius * 0.32);
    this.rock.castShadow = true;
    this.rock.visible = false;
    this.fallTime = Math.min(0.6, delay * 0.6);
    this.trail = 0;
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
        if ((this.trail -= delta) <= 0) this.trail = TRAIL_EVERY;
        if (this.trail === TRAIL_EVERY) ctx.particles.burst(this.rock.position.clone().setZ(0), { count: 3, colors: this.look.trail, speed: 20, up: 0, gravity: 0, height: this.rock.position.z, size: 3, life: 0.4, glow: Boolean(this.look.glow) });
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
    this.disc = this.add(new THREE.Mesh(unitCircle(40), glowMaterial(color, 0.25)));
    this.edge = this.add(new THREE.Mesh(unitRing(0.9, 40), glowMaterial(color, 0.8)));
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
    this.disc = this.add(new THREE.Mesh(unitCircle(40), glowMaterial(color, opacity)));
    this.disc.position.set(position.x, position.y, 0.6);
    this.tick = 0;
  }

  update(delta) {
    this.age += delta;
    const { ctx } = this.effects;
    const t = this.age / this.duration;
    const grow = Math.min(1, this.age * 6);
    this.disc.scale.setScalar(this.radius * grow * (1 + 0.04 * Math.sin(this.age * 8)));
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
    this.bolts = 0; // bolts in flight
    this.boltBatch = new BoltBatch();
    // At most this many bolts at once (main.js lowers it on phones). Bolts are only looks (callers deal the damage),
    // and a late endless build's chain procs kept ~100 in flight. `always`: a strike's own bolt.
    this.boltBudget = 80;
  }

  addEffect(effect) {
    this.list.push(effect);
    return effect;
  }

  bolt(from, to, options = {}) {
    if (this.bolts >= this.boltBudget && !options.always) return null;
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
    const alive = ctx.aliveEnemies();
    for (let i = 0; i < count; i++) {
      let next = null;
      let best = range * range;
      for (const enemy of alive) {
        if (hit.has(enemy) || enemy.dying) continue;
        const dx = enemy.position.x - from.x;
        const dy = enemy.position.y - from.y;
        const dz = enemy.position.z;
        const distance = dx * dx + dy * dy + dz * dz;
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

  /**
   * `hold`: effects marked `waitsForPlay` (Tode's own ultimate) stand still while a menu or cut-scene is up and carry
   * on after it; `hide`: and are out of sight meanwhile (cut-scenes).
   */
  update(delta, { hold = false, hide = false } = {}) {
    // Effects can start new effects while updating (a storm calls strikes), so collect those separately.
    const current = this.list;
    this.list = [];
    const survivors = current.filter((effect) => {
      if (effect.waitsForPlay) {
        effect.show?.(!(hold && hide));
        if (hold) return true;
      }
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
    this.boltBatch.draw(this.ctx.scene, this.list.filter((effect) => effect instanceof Bolt));
  }

  clear() {
    for (const effect of this.list) effect.dispose();
    this.list = [];
    this.bolts = 0;
    this.boltBatch.clear();
    // Anything an effect put in the scene that slipped out of the list goes too (tagged by `markEffect`).
    for (const object of [...this.ctx.scene.children]) if (object.userData.effect) object.removeFromParent();
  }
}
