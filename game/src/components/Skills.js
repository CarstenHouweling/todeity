import * as THREE from 'three';
import { additive, createTeapot, disposeTree } from './Ultimates.js';
import { markEffect } from './Effects.js';

/**
 * Skills: abilities Tode learns during a run, picked on every level-up (tea leaves are the experience).
 * Up to six; they always cast themselves when the moment is right, so the player can keep running and shooting.
 *
 * Each skill: `cooldown(level)`, `autoTarget(ctx)` → a target point (or null to wait),
 * and `cast(ctx, target, level)`. Levels go up when the same skill is picked again.
 */

export const MAX_SKILLS = 6;
export const MAX_SKILL_LEVEL = 5;

const power = (level) => 1 + 0.45 * (level - 1); // damage multiplier per level
const faster = (seconds, level) => seconds * (1 - 0.12 * (level - 1));

const FIRE = ['#ff6a00', '#ffb020', '#ffe066', '#ffffff'];
const ICE = ['#c8f0ff', '#8fdcff', '#ffffff'];
const TEA = ['#c98a2b', '#e7b45a', '#f3d29a'];
const SPARKS = ['#ffffff', '#cfe0ff', '#9fb8ff'];

// --- Targeting helpers -------------------------------------------------------

function near(ctx, position, radius) {
  return ctx.aliveEnemies().filter((enemy) => enemy.position.distanceTo(position) < radius + enemy.radius);
}

/** The bee with the most other bees around it, within `range` of Tode. */
function densest(ctx, range, clusterRadius = 80) {
  let best = null;
  let bestCount = 0;
  const candidates = near(ctx, ctx.player.position, range);
  for (const enemy of candidates) {
    const count = candidates.filter((other) => other.position.distanceTo(enemy.position) < clusterRadius).length;
    if (count > bestCount) {
      bestCount = count;
      best = enemy;
    }
  }
  return best && { position: best.position.clone().setZ(0), count: bestCount };
}

function nearest(ctx, range) {
  let best = null;
  let bestDistance = range;
  for (const enemy of ctx.aliveEnemies()) {
    const distance = enemy.position.distanceTo(ctx.player.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

// --- Effects that live for a while ----------------------------------------------

class TimedEffect {
  constructor(ctx, life) {
    this.ctx = ctx;
    this.life = life;
    this.age = 0;
    this.root = markEffect(new THREE.Group());
    ctx.scene.add(this.root);
  }

  update(delta) {
    this.age += delta;
    this.tick?.(delta);
    return this.age < this.life;
  }

  dispose() {
    disposeTree(this.root);
  }
}

/** A comet streaks down from the sky and explodes. */
class Comet extends TimedEffect {
  /** `frost`: a Frostfire Meteor (bigger, and it freezes what it doesn't burn away). */
  constructor(ctx, target, damage, { radius = 70, frost = false } = {}) {
    super(ctx, 0.55);
    this.target = target.clone().setZ(0);
    this.from = this.target.clone().add(new THREE.Vector3(-160, 160, 520));
    this.damage = damage;
    this.radius = radius;
    this.frost = frost;
    const size = radius / 70;
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(9 * size, 1), additive(frost ? '#bff0ff' : '#ffd36b', 1));
    this.glow = new THREE.Mesh(new THREE.IcosahedronGeometry(18 * size, 1), additive(frost ? '#4fb8ff' : '#ff6a00', 0.5));
    this.root.add(this.ball, this.glow);
    this.warning = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), additive(frost ? '#8fdcff' : '#ff8a2a', 0.8));
    this.warning.scale.setScalar(radius - 10);
    this.warning.position.set(this.target.x, this.target.y, 0.8);
    this.root.add(this.warning);
    ctx.play('whistle');
  }

  tick() {
    const t = Math.min(1, this.age / this.life);
    const position = this.from.clone().lerp(this.target, t * t);
    this.ball.position.copy(position);
    this.glow.position.copy(position);
    this.warning.material.opacity = 0.4 + 0.4 * Math.sin(this.age * 40);
    this.ctx.particles.burst(position.clone().setZ(0), { count: 4, colors: FIRE, speed: 30, up: 0, gravity: 0, height: position.z, size: 2.4, life: 0.35, glow: true });
    if (t >= 1 && !this.exploded) this.explode();
  }

  explode() {
    this.exploded = true;
    const { ctx, target } = this;
    ctx.play('boom');
    ctx.shake(9);
    ctx.postfx.pulse({ bloom: 0.6 });
    const { radius, frost } = this;
    ctx.particles.burst(target, { count: frost ? 80 : 40, colors: frost ? [...FIRE, ...ICE] : FIRE, speed: radius * 3.1, up: 160, size: 2.4, height: 4, life: 0.7, glow: true });
    ctx.effects.blast(target, { radius, damage: this.damage, knockback: 260, color: frost ? '#8fdcff' : '#ff8a2a', source: 'skill' });
    for (const enemy of near(ctx, target, radius)) {
      enemy.applyBurn(frost ? 6 : 2, 3);
      if (frost) enemy.applySlow(1, 2);
    }
    if (frost) ctx.effects.ring(target, { radius: radius * 1.4, color: '#bff0ff', duration: 0.5, thickness: 0.25 });
  }
}

/** A small teapot that keeps spitting at bees. */
class TeaTurret extends TimedEffect {
  constructor(ctx, position, level) {
    super(ctx, 7 + level * 2);
    this.position = position.clone().setZ(0);
    this.level = level;
    this.shotTimer = 0;
    const teapot = createTeapot();
    teapot.scale.setScalar(0.3);
    teapot.position.copy(this.position);
    this.teapot = teapot;
    this.root.add(teapot);
    ctx.effects.ring(this.position, { radius: 40, color: '#ffffff', duration: 0.4 });
    ctx.play('pick');
  }

  tick(delta) {
    const { ctx } = this;
    // Pop up, then sink away at the end.
    const appear = Math.min(1, this.age * 5);
    const vanish = Math.min(1, (this.life - this.age) * 3);
    this.teapot.scale.setScalar(0.3 * Math.min(appear, vanish));
    this.shotTimer -= delta;
    if (this.shotTimer > 0) return;
    let target = null;
    let best = 320;
    for (const enemy of ctx.aliveEnemies()) {
      const distance = enemy.position.distanceTo(this.position);
      if (distance < best) {
        best = distance;
        target = enemy;
      }
    }
    if (!target) return;
    this.shotTimer = 0.32;
    const direction = target.position.clone().sub(this.position).setZ(0).normalize();
    this.teapot.rotation.z = Math.atan2(direction.y, direction.x);
    ctx.fireSpit(this.position.clone().addScaledVector(direction, 14), direction, Math.round(2 * power(this.level)));
  }
}

/** A golden spirit copy of Tode that fights next to him. */
class MirrorTode extends TimedEffect {
  constructor(ctx, level) {
    super(ctx, 6 + level * 2);
    this.level = level;
    this.shotTimer = 0;
    this.angle = Math.random() * Math.PI * 2;
    const ghost = ctx.player.model.clone();
    const material = additive('#ffd36b', 0.55);
    ghost.traverse((child) => {
      if (child.isMesh) child.material = material;
    });
    this.ghost = ghost;
    this.root.add(ghost);
    this.root.position.copy(ctx.player.position);
    ctx.effects.ring(ctx.player.position, { radius: 50, color: '#ffd36b', duration: 0.5 });
    ctx.play('ultimateReady');
  }

  tick(delta) {
    const { ctx } = this;
    const { player } = ctx;
    // Hover at Tode's side, circling slowly.
    this.angle += delta * 0.8;
    const spot = player.position.clone().add(new THREE.Vector3(Math.cos(this.angle) * 45, Math.sin(this.angle) * 45, 0));
    this.root.position.lerp(spot, 1 - Math.exp(-6 * delta));
    this.ghost.position.z = player.groundOffset + 3 + Math.sin(this.age * 5) * 2;
    this.ghost.rotation.copy(player.model.rotation);
    const fade = Math.min(1, this.age * 4, (this.life - this.age) * 2);
    this.ghost.traverse((child) => child.isMesh && (child.material.opacity = 0.55 * fade));

    this.shotTimer -= delta;
    if (this.shotTimer > 0) return;
    const target = nearest({ ...ctx, player: { position: this.root.position } }, 380);
    if (!target) return;
    this.shotTimer = Math.max(0.12, player.stats.spitCooldown);
    const direction = target.position.clone().sub(this.root.position).setZ(0).normalize();
    this.ghost.rotation.y = Math.atan2(direction.x, -direction.y);
    ctx.fireSpit(this.root.position.clone().addScaledVector(direction, 12), direction, Math.max(1, Math.round(player.stats.spitDamage * 0.7 * power(this.level))));
  }
}

/** Tode leaps through the air and lands with a shockwave. */
class LilyPadLeap extends TimedEffect {
  constructor(ctx, target, damage) {
    super(ctx, 0.5);
    this.from = ctx.player.position.clone();
    this.target = target.clone().setZ(0);
    this.damage = damage;
    ctx.player.rooted = true;
    ctx.player.unstoppableLeft = Math.max(ctx.player.unstoppableLeft, 0.6);
    ctx.play('dash');
    ctx.particles.burst(this.from, { count: 10, colors: ['#3f9d3a', '#7ed957'], speed: 80, up: 60, size: 2 });
  }

  tick() {
    const { player } = this.ctx;
    const t = Math.min(1, this.age / this.life);
    player.position.lerpVectors(this.from, this.target, t);
    const height = Math.sin(t * Math.PI) * 55;
    player.model.position.z = player.groundOffset + height;
    player.adornments.position.z = height;
    if (t >= 1 && !this.landed) this.land();
  }

  land() {
    this.landed = true;
    const { ctx, target } = this;
    ctx.player.rooted = false;
    ctx.play('splash');
    ctx.shake(8);
    ctx.particles.burst(target, { count: 26, colors: ['#3f9d3a', '#7ed957', '#ff9ec7', '#ffffff'], speed: 200, up: 120, size: 2, height: 2 });
    ctx.effects.blast(target, { radius: 95, damage: this.damage, knockback: 420, color: '#7ed957', source: 'skill' });
  }

  dispose() {
    this.ctx.player.rooted = false;
    super.dispose();
  }
}

/** A spinning tornado of tea that drifts out and drags bees into it. */
class TeaTornado extends TimedEffect {
  constructor(ctx, target, level) {
    super(ctx, 3 + level * 0.5);
    this.level = level;
    this.position = ctx.player.position.clone().setZ(0);
    const direction = target.clone().setZ(0).sub(this.position);
    this.velocity = direction.lengthSq() > 1 ? direction.normalize().multiplyScalar(90) : new THREE.Vector3();
    this.tickTimer = 0;
    this.funnel = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(10 + i * 6, 2.2, 6, 24), additive(i % 2 ? '#e7b45a' : '#fff3c4', 0.45));
      ring.position.z = 6 + i * 11;
      this.funnel.add(ring);
    }
    this.funnel.scale.setScalar(1 + 0.2 * (level - 1));
    this.root.add(this.funnel);
    ctx.play('nova');
  }

  tick(delta) {
    const { ctx } = this;
    this.position.addScaledVector(this.velocity, delta);
    this.funnel.position.copy(this.position);
    this.funnel.children.forEach((ring, i) => {
      ring.rotation.z += delta * (6 + i);
      ring.position.x = Math.sin(this.age * 7 + i) * 3;
    });
    const fade = Math.min(1, (this.life - this.age) * 2);
    this.funnel.scale.setScalar((1 + 0.2 * (this.level - 1)) * fade);
    ctx.particles.burst(this.position, { count: 2, colors: TEA, speed: 60, up: 80, size: 1.5, height: 4, life: 0.5 });

    // Pull bees toward the eye of the tornado.
    for (const enemy of near(ctx, this.position, 120)) {
      const pull = this.position.clone().sub(enemy.position).setZ(0);
      if (pull.lengthSq() > 1) enemy.knockback.addScaledVector(pull.normalize(), 500 * delta);
    }
    this.tickTimer -= delta;
    if (this.tickTimer <= 0) {
      this.tickTimer = 0.25;
      for (const enemy of near(ctx, this.position, 45)) ctx.damageEnemy(enemy, Math.round(2 * power(this.level)), null, 0, 'skill');
    }
  }
}

/** A crackling orb that floats toward the target and zaps everything around it. */
class BallLightning extends TimedEffect {
  constructor(ctx, target, level) {
    super(ctx, 5 + level);
    this.level = level;
    this.position = ctx.player.position.clone().setZ(14);
    this.target = target.clone().setZ(14);
    this.zapTimer = 0;
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), additive('#ffffff', 1));
    this.halo = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 1), additive('#9fb8ff', 0.45));
    this.root.add(this.core, this.halo);
    ctx.play('zap');
  }

  tick(delta) {
    const { ctx } = this;
    const toTarget = this.target.clone().sub(this.position);
    if (toTarget.length() > 2) this.position.addScaledVector(toTarget.normalize(), Math.min(70 * delta, toTarget.length()));
    this.core.position.copy(this.position);
    this.halo.position.copy(this.position);
    this.halo.scale.setScalar(1 + 0.2 * Math.sin(this.age * 30));

    this.zapTimer -= delta;
    if (this.zapTimer > 0) return;
    this.zapTimer = 0.35;
    const targets = near(ctx, this.position.clone().setZ(0), 110)
      .sort((a, b) => a.position.distanceTo(this.position) - b.position.distanceTo(this.position))
      .slice(0, 2 + this.level);
    for (const enemy of targets) {
      ctx.effects.bolt(this.position.clone(), enemy.position.clone().setZ(10), { width: 2, life: 0.15 });
      ctx.lightningHit(enemy);
      ctx.damageEnemy(enemy, Math.round(3 * power(this.level)), null, 0, 'lightning');
    }
    if (targets.length) ctx.play('zap');
  }
}

/** Tode's tongue whips out in a cone, hitting hard and smacking bees away. */
class TongueLash extends TimedEffect {
  constructor(ctx, target, level) {
    super(ctx, 0.28);
    this.level = level;
    this.range = 130 + level * 15;
    const { player } = ctx;
    this.direction = target.clone().sub(player.position).setZ(0);
    if (this.direction.lengthSq() < 1) this.direction.copy(player.facing);
    this.direction.normalize();
    player.aimAt(player.position.clone().addScaledVector(this.direction, 10));

    const tongue = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 3.2, 1, 8),
      new THREE.MeshStandardMaterial({ color: '#ff6f91', emissive: '#a0284a', roughness: 0.4 })
    );
    tongue.geometry.rotateZ(-Math.PI / 2);
    tongue.geometry.translate(0.5, 0, 0);
    this.tongue = tongue;
    this.root.add(tongue);
    ctx.play('dash');

    // Damage lands right away; the visual just has to look snappy.
    const cos = Math.cos(THREE.MathUtils.degToRad(38));
    for (const enemy of near(ctx, player.position, this.range)) {
      const to = enemy.position.clone().sub(player.position).setZ(0);
      if (to.length() > 1 && to.normalize().dot(this.direction) < cos) continue;
      enemy.knockback.addScaledVector(to, 420);
      ctx.damageEnemy(enemy, Math.round(9 * power(level)), null, 0, 'skill');
    }
  }

  tick() {
    const { player } = this.ctx;
    const t = this.age / this.life;
    const reach = Math.sin(Math.min(1, t) * Math.PI) * this.range;
    this.root.position.copy(player.position).addScaledVector(this.direction, player.radius * 0.6).setZ(9);
    this.root.rotation.z = Math.atan2(this.direction.y, this.direction.x);
    this.tongue.scale.set(Math.max(0.01, reach), 1, 1);
  }
}

/** A spinning leaf blade that bounces from bee to bee. */
class LeafGlaive extends TimedEffect {
  constructor(ctx, target, level) {
    super(ctx, 4);
    this.level = level;
    this.bounces = 3 + level;
    this.damage = Math.round(6 * power(level));
    this.position = ctx.player.position.clone().setZ(14);
    this.hit = new Set();
    this.target = target.clone().setZ(14);
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 1.2, 3), additive('#9be33a', 0.95));
    const edge = new THREE.Mesh(new THREE.TorusGeometry(11, 1.4, 6, 3), additive('#e8ffb0', 0.8));
    edge.rotation.x = Math.PI / 2;
    this.blade = new THREE.Group();
    this.blade.add(blade, edge);
    this.root.add(this.blade);
    ctx.play('dash');
  }

  tick(delta) {
    const { ctx } = this;
    const to = this.target.clone().sub(this.position);
    const step = 620 * delta;
    if (to.length() <= step) {
      this.position.copy(this.target);
      this.strike();
    } else {
      this.position.addScaledVector(to.normalize(), step);
    }
    this.blade.position.copy(this.position);
    this.blade.rotation.y += delta * 25;
    ctx.particles.burst(this.position.clone().setZ(0), { count: 1, colors: ['#9be33a', '#e8ffb0'], speed: 10, up: 0, gravity: 0, height: 14, size: 1.6, life: 0.25, glow: true });
  }

  strike() {
    const { ctx } = this;
    const victim = near(ctx, this.position.clone().setZ(0), 30).find((enemy) => !this.hit.has(enemy));
    if (victim) {
      this.hit.add(victim);
      ctx.damageEnemy(victim, this.damage, null, 0, 'skill');
      this.bounces--;
    }
    // On to the nearest bee not hit yet; back to Tode when there is none.
    const next = ctx.aliveEnemies()
      .filter((enemy) => !this.hit.has(enemy) && enemy.position.distanceTo(this.position) < 260)
      .sort((a, b) => a.position.distanceTo(this.position) - b.position.distanceTo(this.position))[0];
    if (this.bounces > 0 && next) this.target.copy(next.position).setZ(14);
    else this.life = this.age; // done
  }
}

/** Fireflies that seek out bees and burst. */
class FireflySwarm extends TimedEffect {
  constructor(ctx, level) {
    super(ctx, 4);
    this.damage = Math.round(5 * power(level));
    this.flies = Array.from({ length: 3 + level }, (_, i) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), additive('#fff27a', 1));
      const angle = (i / (3 + level)) * Math.PI * 2;
      mesh.position.copy(ctx.player.position).add(new THREE.Vector3(Math.cos(angle) * 20, Math.sin(angle) * 20, 18));
      this.root.add(mesh);
      return { mesh, velocity: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.6).multiplyScalar(160), target: null, done: false };
    });
    ctx.play('pick');
  }

  tick(delta) {
    const { ctx } = this;
    let flying = 0;
    for (const fly of this.flies) {
      if (fly.done) continue;
      flying++;
      if (!fly.target || fly.target.dying) fly.target = nearest({ ...ctx, player: { position: fly.mesh.position } }, 500);
      if (fly.target) {
        const want = fly.target.position.clone().setZ(10).sub(fly.mesh.position).normalize().multiplyScalar(420);
        fly.velocity.lerp(want, 1 - Math.exp(-5 * delta));
      }
      fly.mesh.position.addScaledVector(fly.velocity, delta);
      ctx.particles.burst(fly.mesh.position.clone().setZ(0), { count: 1, colors: ['#fff27a', '#ffd36b'], speed: 5, up: 0, gravity: 0, height: fly.mesh.position.z, size: 1.4, life: 0.3, glow: true });
      if (fly.target && fly.target.position.distanceTo(fly.mesh.position.clone().setZ(0)) < fly.target.radius + 6) {
        fly.done = true;
        fly.mesh.visible = false;
        ctx.effects.blast(fly.target.position.clone(), { radius: 40, damage: this.damage, knockback: 120, color: '#fff27a', source: 'skill' });
      }
    }
    if (!flying) this.life = this.age;
  }
}

/** Sugar-cube mines dropped around Tode; bees that touch one set it off. */
class SugarMines extends TimedEffect {
  constructor(ctx, level) {
    super(ctx, 9);
    this.damage = Math.round(11 * power(level));
    const count = 2 + level;
    this.mines = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const position = ctx.player.position.clone().add(new THREE.Vector3(Math.cos(angle) * 60, Math.sin(angle) * 60, 0));
      const cube = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ff9ec7', emissiveIntensity: 0.4, roughness: 0.6 }));
      cube.position.copy(position).setZ(4);
      cube.rotation.set(Math.random(), Math.random(), Math.random());
      this.root.add(cube);
      return { cube, position: position.setZ(0), armed: 0.4, done: false };
    });
    ctx.play('pick');
  }

  tick(delta) {
    const { ctx } = this;
    let left = 0;
    for (const mine of this.mines) {
      if (mine.done) continue;
      left++;
      mine.armed -= delta;
      mine.cube.rotation.z += delta * 2;
      mine.cube.material.emissiveIntensity = 0.4 + 0.4 * Math.sin(this.age * 8);
      if (mine.armed > 0) continue;
      if (near(ctx, mine.position, 18).length || this.age > this.life - 0.05) {
        mine.done = true;
        mine.cube.visible = false;
        ctx.play('boom');
        ctx.shake(4);
        ctx.particles.burst(mine.position, { count: 22, colors: ['#ffffff', '#ff9ec7', '#ffe0f0'], speed: 200, up: 140, size: 2, height: 4, glow: true });
        ctx.effects.blast(mine.position, { radius: 65, damage: this.damage, knockback: 300, color: '#ff9ec7', source: 'skill' });
      }
    }
    if (!left) this.life = this.age;
  }
}

/** Steam erupts under the bees: a warning ring, then a scalding column. */
class SteamGeyser extends TimedEffect {
  constructor(ctx, position, damage, delay) {
    super(ctx, delay + 0.7);
    this.position = position.clone().setZ(0);
    this.damage = damage;
    this.delay = delay;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 36), additive('#e8f4ff', 0.7));
    this.ring.scale.setScalar(45);
    this.ring.position.copy(this.position).setZ(0.8);
    this.root.add(this.ring);
  }

  tick() {
    const { ctx } = this;
    if (this.age < this.delay) {
      this.ring.material.opacity = 0.3 + 0.4 * Math.sin(this.age * 30);
      return;
    }
    if (!this.erupted) {
      this.erupted = true;
      this.ring.visible = false;
      ctx.play('splash');
      ctx.particles.burst(this.position, { count: 40, colors: ['#ffffff', '#e8f4ff', '#c9e6ff'], speed: 50, up: 380, gravity: 200, size: 3.2, height: 2, life: 0.9 });
      for (const enemy of near(ctx, this.position, 45)) {
        enemy.applySlow(0.6, 1.5);
        ctx.damageEnemy(enemy, this.damage, null, 0, 'skill');
      }
    }
  }
}

/** Teacups circling Tode, smashing into bees. */
class OrbitingCups extends TimedEffect {
  constructor(ctx, level) {
    super(ctx, 6 + level);
    this.damage = Math.round(4 * power(level));
    this.radius = 55 + level * 4;
    this.cooldowns = new WeakMap();
    this.cups = Array.from({ length: 2 + level }, () => {
      const cup = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 3.6, 6, 14), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#5b8fd6', emissiveIntensity: 0.3, roughness: 0.3 }));
      body.rotation.x = Math.PI / 2;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.8, 6, 12), body.material);
      handle.position.x = 5.5;
      cup.add(body, handle);
      this.root.add(cup);
      return cup;
    });
    ctx.play('shield');
  }

  tick(delta) {
    const { ctx } = this;
    const center = ctx.player.position;
    const fade = Math.min(1, this.age * 4, (this.life - this.age) * 3);
    this.cups.forEach((cup, i) => {
      const angle = this.age * 3.2 + (i / this.cups.length) * Math.PI * 2;
      cup.position.set(center.x + Math.cos(angle) * this.radius, center.y + Math.sin(angle) * this.radius, 14);
      cup.rotation.z = angle * 2;
      cup.scale.setScalar(fade);
      for (const enemy of near(ctx, cup.position.clone().setZ(0), 12)) {
        if ((this.cooldowns.get(enemy) ?? 0) > this.age) continue;
        this.cooldowns.set(enemy, this.age + 0.45);
        ctx.damageEnemy(enemy, this.damage, enemy.position.clone().sub(center).setZ(0).normalize(), 220, 'skill');
      }
    });
  }
}

// --- More skills (v0.19): honey, bubbles, blossoms, shards, sunbeams, spores, rain, koi, the gong and brambles ---

const UP_AXIS = new THREE.Vector3(0, 0, 1);
const HONEY = ['#ffb52e', '#ffd36b', '#fff0b0'];
const SPORES = ['#a3e05a', '#d4ff8a', '#c58aff'];
const WATER = ['#ffffff', '#bfe8ff', '#e8f8ff'];

/** `count` directions spread over `spread` radians around `direction`. */
function fan(direction, count, spread) {
  const base = direction.clone().setZ(0).normalize();
  return Array.from({ length: count }, (_, i) => base.clone().applyAxisAngle(UP_AXIS, count > 1 ? (i / (count - 1) - 0.5) * spread : 0));
}

/** `count` directions all the way around. */
function radial(count, turn = Math.random() * Math.PI * 2) {
  return Array.from({ length: count }, (_, i) => {
    const angle = turn + (i / count) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
  });
}

/** Toward `target` from Tode (or his facing when it's right on top of him). */
function aimFrom(ctx, target) {
  const direction = target.clone().sub(ctx.player.position).setZ(0);
  return direction.lengthSq() > 1 ? direction.normalize() : ctx.player.facing.clone().setZ(0).normalize();
}

/** A sticky puddle of honey: bees in it crawl and get scalded; `pull` drags them toward the middle. */
class HoneyPuddle extends TimedEffect {
  constructor(ctx, position, { radius, life, damage, pull = 0, color = '#ffb52e' }) {
    super(ctx, life);
    Object.assign(this, { position: position.clone().setZ(0), radius, damage, pull });
    this.tickTimer = 0;
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), additive(color, 0.45));
    this.rim = new THREE.Mesh(new THREE.RingGeometry(radius - 4, radius, 48), additive('#fff0b0', 0.6));
    this.disc.position.copy(this.position).setZ(0.7);
    this.rim.position.copy(this.position).setZ(0.75);
    this.root.add(this.disc, this.rim);
    ctx.play('splash');
    ctx.particles.burst(this.position, { count: 24, colors: HONEY, speed: radius * 2, up: 90, size: 2, height: 2 });
  }

  tick(delta) {
    const { ctx } = this;
    const grow = Math.min(1, this.age * 5);
    const fade = Math.min(1, (this.life - this.age) * 2);
    this.disc.scale.setScalar(grow * (1 + 0.03 * Math.sin(this.age * 5)));
    this.rim.scale.setScalar(grow);
    this.disc.material.opacity = 0.45 * fade;
    this.rim.material.opacity = 0.6 * fade;
    if (this.pull) {
      for (const enemy of near(ctx, this.position, this.radius * 1.3)) {
        const pull = this.position.clone().sub(enemy.position).setZ(0);
        if (pull.lengthSq() > 25) enemy.knockback.addScaledVector(pull.normalize(), this.pull * delta);
      }
    }
    this.tickTimer -= delta;
    if (this.tickTimer > 0) return;
    this.tickTimer = 0.5;
    const inside = near(ctx, this.position, this.radius);
    for (const enemy of inside) {
      enemy.applySlow(0.7, 0.6);
      ctx.damageEnemy(enemy, this.damage, null, 0, 'skill');
    }
    ctx.particles.burst(this.position, { count: 3, colors: HONEY, ring: this.radius * 0.6, speed: 10, up: 40, size: 1.6, height: 1, life: 0.6 });
  }
}

/**
 * Small flying things (bubbles, ice shards, koi): each hits every bee it passes once (`pierce`) or pops on the
 * first one, and fades at the end of its range. `curve` makes them swim in waves, `wobble` drift side to side.
 */
class Volley extends TimedEffect {
  constructor(ctx, origin, directions, { speed, range, damage, radius = 12, pierce = false, slow = 0, knockback = 120, make, wobble = 0, curve = 0, popColors = WATER }) {
    super(ctx, range / speed + 0.1);
    Object.assign(this, { speed, damage, radius, pierce, slow, knockback, wobble, curve, popColors });
    this.items = directions.map((direction, i) => {
      const mesh = make(i);
      mesh.position.copy(origin).setZ(14);
      this.root.add(mesh);
      return { mesh, direction: direction.clone().setZ(0).normalize(), hit: new Set(), done: false, phase: Math.random() * 6 };
    });
  }

  tick(delta) {
    const { ctx } = this;
    const fade = Math.min(1, (this.life - this.age) * 6, this.age * 10 + 0.3);
    let flying = 0;
    for (const item of this.items) {
      if (item.done) continue;
      flying++;
      if (this.curve) item.direction.applyAxisAngle(UP_AXIS, this.curve * Math.cos(this.age * 7 + item.phase) * delta);
      item.mesh.position.addScaledVector(item.direction, this.speed * delta);
      if (this.wobble) item.mesh.position.add(new THREE.Vector3(-item.direction.y, item.direction.x, 0).multiplyScalar(Math.cos(this.age * 9 + item.phase) * this.wobble * delta));
      item.mesh.rotation.z = Math.atan2(item.direction.y, item.direction.x);
      item.mesh.scale.setScalar(fade);
      const spot = item.mesh.position.clone().setZ(0);
      for (const enemy of near(ctx, spot, this.radius)) {
        if (item.hit.has(enemy)) continue;
        item.hit.add(enemy);
        ctx.damageEnemy(enemy, this.damage, item.direction, this.knockback, 'skill');
        if (this.slow) enemy.applySlow(this.slow, 1.2);
        if (!this.pierce) {
          item.done = true;
          item.mesh.visible = false;
          ctx.particles.burst(spot, { count: 8, colors: this.popColors, speed: 90, up: 60, size: 1.6, height: 12, life: 0.4, glow: true });
          break;
        }
      }
    }
    if (!flying) this.life = this.age;
  }
}

const bubbleMesh = (size = 5) => {
  const bubble = new THREE.Group();
  bubble.add(new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), additive('#9fdcff', 0.4)));
  const shine = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 8, 6), additive('#ffffff', 0.9));
  shine.position.set(size * 0.35, size * 0.35, size * 0.45);
  bubble.add(shine);
  return bubble;
};

const shardMesh = (color = '#bff0ff') => {
  const geometry = new THREE.ConeGeometry(2.6, 15, 5);
  geometry.rotateZ(-Math.PI / 2);
  return new THREE.Mesh(geometry, additive(color, 0.95));
};

const koiMesh = (i) => {
  const koi = new THREE.Group();
  const color = ['#ff8a3a', '#ffffff', '#ffb000', '#ff5a5a'][i % 4];
  const body = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), additive(color, 0.85));
  body.scale.set(2.2, 1, 0.8);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(5, 9, 3), additive(color, 0.7));
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -15;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(11, 10, 8), additive('#9fdcff', 0.18));
  glow.scale.set(2, 1, 0.6);
  koi.add(body, tail, glow);
  return koi;
};

/** A spinning blossom that flies out in an arc and comes back to Tode, cutting through every bee both ways. */
class Boomerang extends TimedEffect {
  constructor(ctx, direction, { damage, range, count = 1, spread = 0.6, color = '#ff9ec7' }) {
    super(ctx, 1.5);
    Object.assign(this, { damage, range });
    this.blades = fan(direction, count, spread * (count - 1)).map((dir, i) => {
      const mesh = new THREE.Group();
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), additive(p % 2 ? color : '#ffffff', 0.85));
        petal.scale.set(1.6, 0.7, 0.3);
        const angle = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(angle) * 8, Math.sin(angle) * 8, 0);
        petal.rotation.z = angle;
        mesh.add(petal);
      }
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), additive('#ffe680', 1)));
      this.root.add(mesh);
      return { mesh, direction: dir, side: i % 2 ? -1 : 1, hit: new Set(), back: false };
    });
    ctx.play('dash');
  }

  tick(delta) {
    const { ctx } = this;
    const t = Math.min(1, this.age / this.life);
    const out = Math.sin(t * Math.PI) * this.range;
    const swing = Math.sin(t * Math.PI * 2) * this.range * 0.22;
    for (const blade of this.blades) {
      if (t > 0.5 && !blade.back) {
        blade.back = true;
        blade.hit.clear(); // the way back hits again
      }
      const side = new THREE.Vector3(-blade.direction.y, blade.direction.x, 0);
      blade.mesh.position.copy(ctx.player.position).addScaledVector(blade.direction, out).addScaledVector(side, swing * blade.side).setZ(16);
      blade.mesh.rotation.z += delta * 22;
      const spot = blade.mesh.position.clone().setZ(0);
      for (const enemy of near(ctx, spot, 20)) {
        if (blade.hit.has(enemy)) continue;
        blade.hit.add(enemy);
        ctx.damageEnemy(enemy, this.damage, blade.direction, 140, 'skill');
      }
      if (Math.random() < 0.5) ctx.particles.burst(spot, { count: 1, colors: PETALS_SKILL, speed: 20, up: 10, gravity: 30, height: 16, size: 1.6, life: 0.6 });
    }
  }
}
const PETALS_SKILL = ['#ff9ec7', '#ffd1e3', '#ffffff'];

/** Beams of light that sweep a full circle around Tode, hitting every bee they pass once. */
class SweepBeam extends TimedEffect {
  constructor(ctx, { arms = 1, length, damage, duration = 1.1, color = '#ffe680', width = 12 }) {
    super(ctx, duration);
    Object.assign(this, { length, damage, width });
    this.turn = Math.random() * Math.PI * 2;
    this.hit = new Set();
    this.arms = Array.from({ length: arms }, (_, i) => {
      const geometry = new THREE.BoxGeometry(1, width, 3);
      geometry.translate(0.5, 0, 0);
      const beam = new THREE.Mesh(geometry, additive(color, 0.75));
      const core = new THREE.Mesh(geometry, additive('#ffffff', 0.9));
      core.scale.set(1, 0.35, 1);
      const arm = new THREE.Group();
      arm.add(beam, core);
      arm.userData.offset = (i / arms) * Math.PI * 2;
      this.root.add(arm);
      return arm;
    });
    ctx.play('beamCharge');
  }

  tick() {
    const { ctx } = this;
    const t = this.age / this.life;
    const reach = this.length * Math.min(1, this.age * 7) * Math.min(1, (this.life - this.age) * 8);
    this.root.position.copy(ctx.player.position).setZ(12);
    const base = this.turn + t * Math.PI * 2;
    for (const arm of this.arms) {
      const angle = base + arm.userData.offset;
      arm.rotation.z = angle;
      arm.scale.set(Math.max(0.01, reach), 1, 1);
      const along = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      for (const enemy of near(ctx, ctx.player.position, reach)) {
        if (this.hit.has(enemy)) continue;
        const to = enemy.position.clone().sub(ctx.player.position).setZ(0);
        const forward = to.dot(along);
        if (forward < 0 || Math.abs(to.x * along.y - to.y * along.x) > this.width + enemy.radius) continue;
        this.hit.add(enemy);
        ctx.damageEnemy(enemy, this.damage, to.normalize(), 160, 'skill');
        ctx.particles.burst(enemy.position, { count: 5, colors: ['#ffffff', '#ffe680'], speed: 80, up: 60, size: 1.6, height: 10, glow: true, life: 0.35 });
      }
    }
  }
}

/** A toadstool that puffs clouds of stinging spores around it. */
class Mushroom extends TimedEffect {
  constructor(ctx, position, { life, damage, radius = 70, every = 0.7, size = 1 }) {
    super(ctx, life);
    Object.assign(this, { position: position.clone().setZ(0), damage, radius, every, size });
    this.puffTimer = 0.3;
    this.model = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 14, 10), new THREE.MeshStandardMaterial({ color: '#f3e6c8', roughness: 0.8 }));
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 7;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9b4dff', emissive: '#4a1a8a', emissiveIntensity: 0.5, roughness: 0.5 }));
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 13;
    this.model.add(stem, cap);
    for (let i = 0; i < 6; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 4), additive('#d4ff8a', 0.9));
      const angle = (i / 6) * Math.PI * 2;
      dot.position.set(Math.cos(angle) * 8, Math.sin(angle) * 8, 20);
      this.model.add(dot);
    }
    this.model.position.copy(this.position);
    this.root.add(this.model);
    ctx.play('pick');
  }

  tick(delta) {
    const { ctx } = this;
    const appear = Math.min(1, this.age * 4);
    const vanish = Math.min(1, (this.life - this.age) * 3);
    const squash = 1 + 0.12 * Math.max(0, this.puffTimer > this.every - 0.15 ? 1 : 0);
    this.model.scale.set(this.size * Math.min(appear, vanish) * squash, this.size * Math.min(appear, vanish) * squash, this.size * Math.min(appear, vanish) / squash);
    this.puffTimer -= delta;
    if (this.puffTimer > 0) return;
    this.puffTimer = this.every;
    ctx.particles.burst(this.position, { count: 14, colors: SPORES, speed: this.radius * 1.4, up: 30, gravity: -10, size: 2.6, height: 14 * this.size, life: 0.8, glow: true });
    ctx.effects.ring(this.position, { radius: this.radius, color: '#a3e05a', duration: 0.4 });
    for (const enemy of near(ctx, this.position, this.radius)) {
      ctx.damageEnemy(enemy, this.damage, null, 0, 'skill');
      enemy.applyBurn(Math.max(1, Math.round(this.damage / 3)), 2);
    }
  }
}

/** A little cloud that follows Tode and rains scalding tea on the bees nearby (with `thunder`, lightning too). */
class RainCloud extends TimedEffect {
  constructor(ctx, { life, damage, every, range = 220, thunder = 0 }) {
    super(ctx, life);
    Object.assign(this, { damage, every, range, thunder });
    this.dropTimer = 0.2;
    this.cloud = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: thunder ? '#5a5f78' : '#f2f4ff', emissive: thunder ? '#2a2050' : '#8090b0', emissiveIntensity: 0.4, roughness: 1, transparent: true, opacity: 0.9 });
    for (const [x, y, r] of [[0, 0, 16], [14, 4, 12], [-14, -2, 12], [6, -10, 10], [-6, 10, 11]]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), material);
      puff.position.set(x, y, 0);
      this.cloud.add(puff);
    }
    this.cloud.position.copy(ctx.player.position).setZ(95);
    this.root.add(this.cloud);
    ctx.play(thunder ? 'thunder' : 'splash');
  }

  tick(delta) {
    const { ctx } = this;
    const target = ctx.player.position.clone().setZ(95);
    this.cloud.position.lerp(target, 1 - Math.exp(-4 * delta));
    const fade = Math.min(1, this.age * 3, (this.life - this.age) * 2);
    this.cloud.scale.setScalar(fade * (1 + 0.05 * Math.sin(this.age * 4)));
    ctx.particles.burst(this.cloud.position.clone().setZ(0), { count: 2, colors: ['#c98a2b', '#e7b45a', '#bfe8ff'], ring: 12, speed: 8, up: -60, gravity: 500, height: 85, size: 1.2, life: 0.35 });
    this.dropTimer -= delta;
    if (this.dropTimer > 0) return;
    this.dropTimer = this.every;
    const bees = near(ctx, ctx.player.position, this.range);
    const bee = bees[Math.floor(Math.random() * bees.length)];
    if (!bee) return;
    ctx.particles.burst(bee.position, { count: 8, colors: TEA, speed: 70, up: 50, size: 1.6, height: 6, life: 0.4 });
    ctx.damageEnemy(bee, this.damage, null, 0, 'skill');
    bee.applyBurn(1, 1.5);
    if (this.thunder && Math.random() < 0.35) {
      ctx.effects.bolt(this.cloud.position.clone(), bee.position.clone().setZ(10), { width: 3, life: 0.2 });
      ctx.effects.chain(bee.position, this.thunder, this.damage * 2, { range: 200 });
    }
  }
}

/** A bronze gong rings over Tode: the shockwave hurls every bee nearby away and dazes them. */
class GongVisual extends TimedEffect {
  constructor(ctx, center, size = 1) {
    super(ctx, 0.9);
    this.gong = new THREE.Mesh(new THREE.CylinderGeometry(18 * size, 18 * size, 2.5, 28), new THREE.MeshStandardMaterial({ color: '#d9a441', emissive: '#7a4a10', emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 }));
    this.gong.position.copy(center).setZ(70 * size);
    this.root.add(this.gong);
  }

  tick() {
    const shiver = Math.sin(this.age * 60) * 0.12 * (1 - this.age / this.life);
    this.gong.rotation.set(shiver, 0, this.age * 2);
    this.gong.scale.setScalar(Math.min(1, this.age * 8, (this.life - this.age) * 4));
  }
}

function gongStrike(ctx, center, { radius, damage, daze, size = 1 }) {
  ctx.play('boom');
  ctx.play('shield');
  ctx.shake(10 * size);
  ctx.postfx.pulse({ warp: 0.4 * size, bloom: 0.3 });
  ctx.effects.addEffect(new GongVisual(ctx, center, size));
  for (const k of [0.35, 0.7, 1]) ctx.effects.ring(center, { radius: radius * k, color: '#ffcf6b', duration: 0.25 + 0.35 * k, thickness: 0.2 });
  ctx.particles.burst(center, { count: 30, colors: ['#ffcf6b', '#ffffff', '#d9a441'], speed: radius * 2.4, up: 40, size: 2, height: 6, glow: true });
  for (const enemy of near(ctx, center, radius)) {
    const away = enemy.position.clone().sub(center).setZ(0);
    ctx.damageEnemy(enemy, damage, away.lengthSq() > 1 ? away.normalize() : null, 650, 'skill');
    enemy.applySlow(1, daze);
  }
}

/** Thorny brambles burst out of the ground in a line, rooting the bees they catch. */
class VineLine extends TimedEffect {
  constructor(ctx, origin, direction, { length, damage, root = 1.2, width = 30 }) {
    const step = 26;
    const count = Math.max(3, Math.floor(length / step));
    const speed = 650;
    super(ctx, (count * step) / speed + 1);
    Object.assign(this, { damage, rootTime: root, width });
    this.hit = new Set();
    const spike = new THREE.ConeGeometry(3.4, 22, 5);
    spike.rotateX(Math.PI / 2);
    spike.translate(0, 0, 11);
    const material = new THREE.MeshStandardMaterial({ color: '#3f9d3a', emissive: '#1f5a10', emissiveIntensity: 0.5, roughness: 0.7 });
    this.segments = Array.from({ length: count }, (_, i) => {
      const position = origin.clone().addScaledVector(direction, (i + 1) * step).setZ(0);
      const group = new THREE.Group();
      for (let s = 0; s < 3; s++) {
        const thorn = new THREE.Mesh(spike, material);
        thorn.position.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 0);
        thorn.rotation.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0);
        thorn.scale.setScalar(0.7 + Math.random() * 0.6);
        group.add(thorn);
      }
      group.position.copy(position);
      group.scale.set(1, 1, 0.01);
      this.root.add(group);
      return { position, group, at: (i * step) / speed, done: false };
    });
    ctx.play('dash');
  }

  tick() {
    const { ctx } = this;
    for (const segment of this.segments) {
      const t = this.age - segment.at;
      if (t < 0) continue;
      const rise = Math.min(1, t * 10) * Math.min(1, (this.life - this.age) * 3);
      segment.group.scale.set(1, 1, Math.max(0.01, rise));
      if (segment.done) continue;
      segment.done = true;
      ctx.particles.burst(segment.position, { count: 6, colors: ['#3f9d3a', '#7ed957', '#8a6a3a'], speed: 70, up: 90, size: 1.8, height: 2, life: 0.5 });
      for (const enemy of near(ctx, segment.position, this.width)) {
        if (this.hit.has(enemy)) continue;
        this.hit.add(enemy);
        ctx.damageEnemy(enemy, this.damage, null, 0, 'skill');
        enemy.applySlow(1, this.rootTime);
      }
    }
  }
}

// --- Fusions: two well-trained skills merge into one (see FUSIONS below) ------------------------

/** A storm orb crowning Tode, throwing chain lightning at the swarm. */
class StormCrown extends TimedEffect {
  constructor(ctx, { life, damage, targets, every = 0.35 }) {
    super(ctx, life);
    Object.assign(this, { damage, targets, every });
    this.zapTimer = 0.2;
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), additive('#ffffff', 1));
    this.halo = new THREE.Mesh(new THREE.IcosahedronGeometry(20, 1), additive('#9fb8ff', 0.4));
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(28, 1.4, 6, 40), additive('#cfe0ff', 0.7));
    this.root.add(this.core, this.halo, this.ring);
    ctx.play('thunder');
  }

  tick(delta) {
    const { ctx } = this;
    const spot = ctx.player.position.clone().setZ(80 + Math.sin(this.age * 3) * 6);
    for (const mesh of [this.core, this.halo, this.ring]) mesh.position.copy(spot);
    const fade = Math.min(1, this.age * 4, (this.life - this.age) * 3);
    this.halo.scale.setScalar(fade * (1 + 0.25 * Math.sin(this.age * 30)));
    this.core.scale.setScalar(fade);
    this.ring.scale.setScalar(fade);
    this.ring.rotation.set(Math.sin(this.age) * 0.6, Math.cos(this.age * 1.3) * 0.6, this.age * 3);
    this.zapTimer -= delta;
    if (this.zapTimer > 0) return;
    this.zapTimer = this.every;
    const first = nearest(ctx, 320);
    if (!first) return;
    ctx.effects.bolt(spot, first.position.clone().setZ(10), { width: 4, life: 0.2 });
    ctx.effects.chain(first.position, this.targets, this.damage, { range: 230 });
  }
}

/** The tongue whirls around Tode twice, smacking everything in reach outward. */
class TongueSpin extends TimedEffect {
  constructor(ctx, { range, damage, turns = 2 }) {
    super(ctx, 0.8);
    Object.assign(this, { range, damage, turns });
    this.turn = Math.atan2(ctx.player.facing.y, ctx.player.facing.x);
    this.lastHit = new Map();
    const tongue = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 4, 1, 8), new THREE.MeshStandardMaterial({ color: '#ff6f91', emissive: '#a0284a', roughness: 0.4 }));
    tongue.geometry.rotateZ(-Math.PI / 2);
    tongue.geometry.translate(0.5, 0, 0);
    this.tongue = tongue;
    this.root.add(tongue);
    ctx.play('dash');
  }

  tick() {
    const { ctx } = this;
    const t = this.age / this.life;
    const angle = this.turn + t * this.turns * Math.PI * 2;
    const reach = this.range * Math.min(1, this.age * 10) * Math.min(1, (this.life - this.age) * 10);
    this.root.position.copy(ctx.player.position).setZ(9);
    this.root.rotation.z = angle;
    this.tongue.scale.set(Math.max(0.01, reach), 1, 1);
    const pass = Math.floor(t * this.turns * 2); // each half turn may hit a bee again
    const along = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    for (const enemy of near(ctx, ctx.player.position, reach)) {
      if (this.lastHit.get(enemy) === pass) continue;
      const to = enemy.position.clone().sub(ctx.player.position).setZ(0);
      if (to.dot(along) < 0 || Math.abs(to.x * along.y - to.y * along.x) > 14 + enemy.radius) continue;
      this.lastHit.set(enemy, pass);
      ctx.damageEnemy(enemy, this.damage, to.normalize(), 480, 'skill');
    }
  }
}

/** The tornado leaves a trail of steam geysers. */
class SteamCyclone extends TeaTornado {
  constructor(ctx, target, level, geyserDamage) {
    super(ctx, target, level);
    this.geyserDamage = geyserDamage;
    this.geyserTimer = 0.2;
  }

  tick(delta) {
    super.tick(delta);
    this.geyserTimer -= delta;
    if (this.geyserTimer > 0) return;
    this.geyserTimer = 0.4;
    const angle = Math.random() * Math.PI * 2;
    const spot = this.position.clone().add(new THREE.Vector3(Math.cos(angle) * 40, Math.sin(angle) * 40, 0));
    this.ctx.effects.addEffect(new SteamGeyser(this.ctx, spot, this.geyserDamage, 0.3));
  }
}

/** Lily Pad Leap that lands in a ring of sugar mines. */
class SugarLeap extends LilyPadLeap {
  constructor(ctx, target, damage, mineLevel) {
    super(ctx, target, damage);
    this.mineLevel = mineLevel;
  }

  land() {
    super.land();
    this.ctx.effects.blast(this.target, { radius: 150, damage: this.damage, knockback: 500, color: '#ff9ec7', source: 'skill' });
    this.ctx.effects.addEffect(new SugarMines(this.ctx, this.mineLevel));
  }
}

// --- The skills ------------------------------------------------------------------

export const SKILLS = {
  tongue: {
    id: 'tongue',
    name: 'Tongue Lash',
    icon: '👅',
    text: (level) => `Whip your tongue at bees in front of you for ${Math.round(9 * power(level))} damage, smacking them away.`,
    cooldown: (level) => faster(2.6, level),
    autoTarget: (ctx) => nearest(ctx, 135)?.position ?? null,
    cast: (ctx, target, level) => ctx.effects.addEffect(new TongueLash(ctx, target, level)),
  },
  comet: {
    id: 'comet',
    name: 'Ember Comet',
    icon: '☄️',
    text: (level) => `Call ${level} blazing comet${level > 1 ? 's' : ''} down on the biggest swarm: ${Math.round(12 * power(level))} damage and burning.`,
    cooldown: (level) => faster(5, level),
    autoTarget: (ctx) => densest(ctx, 420)?.position ?? null,
    cast: (ctx, target, level) => {
      const damage = Math.round(12 * power(level));
      for (let i = 0; i < level; i++) {
        const offset = i === 0 ? new THREE.Vector3() : new THREE.Vector3((Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, 0);
        ctx.effects.addEffect(new Comet(ctx, target.clone().add(offset), damage));
      }
    },
  },
  turret: {
    id: 'turret',
    name: 'Tea Turret',
    icon: '🫖',
    text: (level) => `Drop a teapot turret that spits at bees for ${7 + level * 2} seconds.`,
    cooldown: (level) => faster(13, level),
    autoTarget: (ctx) => (nearest(ctx, 350) ? ctx.player.position : null),
    cast: (ctx, target, level) => {
      // Set it down beside Tode, not on top of him.
      const { player } = ctx;
      const side = new THREE.Vector3(-player.facing.y, player.facing.x, 0).multiplyScalar(40);
      const spot = [side, side.clone().negate()].map((s) => player.position.clone().add(s)).find((p) => ctx.isFree(p, 14));
      ctx.effects.addEffect(new TeaTurret(ctx, spot ?? player.position, level));
    },
  },
  mirror: {
    id: 'mirror',
    name: 'Mirror Tode',
    icon: '🪞',
    text: (level) => `Summon a golden spirit Tode that fights by your side for ${6 + level * 2} seconds.`,
    cooldown: (level) => faster(15, level),
    autoTarget: (ctx) => (ctx.aliveEnemies().length >= 3 ? ctx.player.position : null),
    cast: (ctx, target, level) => ctx.effects.addEffect(new MirrorTode(ctx, level)),
  },
  leap: {
    id: 'leap',
    name: 'Lily Pad Leap',
    icon: '🪷',
    text: (level) => `Leap out of trouble and land with a shockwave: ${Math.round(8 * power(level))} damage.`,
    cooldown: (level) => faster(7, level),
    // Auto: when crowded, leap away from the swarm toward the cursor side.
    autoTarget: (ctx) => {
      const crowd = near(ctx, ctx.player.position, 85);
      if (crowd.length < 3 && !(crowd.length && ctx.player.hp <= 2)) return null;
      const away = new THREE.Vector3();
      for (const enemy of crowd) away.add(ctx.player.position.clone().sub(enemy.position));
      away.setZ(0).normalize();
      for (const angle of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
        const spot = ctx.player.position.clone().add(away.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), angle).multiplyScalar(170));
        if (ctx.isFree(spot, ctx.player.radius)) return spot;
      }
      return null;
    },
    cast: (ctx, target, level) => ctx.effects.addEffect(new LilyPadLeap(ctx, target, Math.round(8 * power(level)))),
  },
  tornado: {
    id: 'tornado',
    name: 'Tea Tornado',
    icon: '🌪️',
    text: () => 'Unleash a whirling tornado that drags bees in and grinds them down.',
    cooldown: (level) => faster(9, level),
    autoTarget: (ctx) => densest(ctx, 330)?.position ?? null,
    cast: (ctx, target, level) => ctx.effects.addEffect(new TeaTornado(ctx, target, level)),
  },
  frost: {
    id: 'frost',
    name: 'Frost Nova',
    icon: '❄️',
    text: (level) => `Freeze every bee around you solid for ${(1.6 + level * 0.4).toFixed(1)}s and chill them for ${Math.round(4 * power(level))} damage.`,
    cooldown: (level) => faster(10, level),
    autoTarget: (ctx) => (near(ctx, ctx.player.position, 140).length >= 3 ? ctx.player.position : null),
    cast: (ctx, target, level) => {
      const center = ctx.player.position.clone();
      ctx.play('shield');
      ctx.shake(5);
      ctx.effects.ring(center, { radius: 150, color: '#8fdcff', duration: 0.5, thickness: 0.3 });
      ctx.particles.burst(center, { count: 40, colors: ICE, speed: 260, up: 60, size: 1.8, height: 4, glow: true });
      for (const enemy of near(ctx, center, 150)) {
        enemy.applySlow(1, 1.6 + level * 0.4);
        ctx.damageEnemy(enemy, Math.round(4 * power(level)), null, 0, 'frost');
      }
    },
  },
  glaive: {
    id: 'glaive',
    name: 'Leaf Glaive',
    icon: '🍃',
    text: (level) => `Throw a spinning leaf that bounces through ${3 + level} bees for ${Math.round(6 * power(level))} damage each.`,
    cooldown: (level) => faster(4, level),
    autoTarget: (ctx) => nearest(ctx, 380)?.position ?? null,
    cast: (ctx, target, level) => ctx.effects.addEffect(new LeafGlaive(ctx, target, level)),
  },
  fireflies: {
    id: 'fireflies',
    name: 'Firefly Swarm',
    icon: '✨',
    text: (level) => `Release ${3 + level} fireflies that hunt bees down and burst for ${Math.round(5 * power(level))} damage.`,
    cooldown: (level) => faster(6, level),
    autoTarget: (ctx) => (nearest(ctx, 450) ? ctx.player.position : null),
    cast: (ctx, target, level) => ctx.effects.addEffect(new FireflySwarm(ctx, level)),
  },
  mines: {
    id: 'mines',
    name: 'Sugar Mines',
    icon: '🍬',
    text: (level) => `Scatter ${2 + level} sugar-cube mines around you that explode for ${Math.round(11 * power(level))} damage.`,
    cooldown: (level) => faster(8, level),
    autoTarget: (ctx) => (near(ctx, ctx.player.position, 200).length >= 2 ? ctx.player.position : null),
    cast: (ctx, target, level) => ctx.effects.addEffect(new SugarMines(ctx, level)),
  },
  geyser: {
    id: 'geyser',
    name: 'Steam Geysers',
    icon: '♨️',
    text: (level) => `Steam bursts out under ${2 + level} bees: ${Math.round(8 * power(level))} damage and slowed.`,
    cooldown: (level) => faster(7, level),
    autoTarget: (ctx) => (nearest(ctx, 400) ? ctx.player.position : null),
    cast: (ctx, target, level) => {
      const bees = near(ctx, ctx.player.position, 400).sort(() => Math.random() - 0.5).slice(0, 2 + level);
      const damage = Math.round(8 * power(level));
      bees.forEach((bee, i) => ctx.effects.addEffect(new SteamGeyser(ctx, bee.position, damage, 0.45 + i * 0.08)));
    },
  },
  thunder: {
    id: 'thunder',
    name: 'Thunder Aura',
    icon: '⚡',
    text: (level) => `Lightning leaps from you through ${3 + level} bees for ${Math.round(5 * power(level))} damage.`,
    cooldown: (level) => faster(3.2, level),
    autoTarget: (ctx) => nearest(ctx, 220)?.position ?? null,
    cast: (ctx, target, level) => {
      ctx.effects.ring(ctx.player.position, { radius: 40, color: '#cfe0ff', duration: 0.3 });
      ctx.effects.chain(ctx.player.position, 3 + level, Math.round(5 * power(level)), { range: 220 });
    },
  },
  cups: {
    id: 'cups',
    name: 'Orbiting Teacups',
    icon: '☕',
    text: (level) => `${2 + level} teacups circle you for ${6 + level} seconds, smashing bees for ${Math.round(4 * power(level))} damage.`,
    cooldown: (level) => faster(12, level),
    autoTarget: (ctx) => (near(ctx, ctx.player.position, 250).length >= 1 ? ctx.player.position : null),
    cast: (ctx, target, level) => ctx.effects.addEffect(new OrbitingCups(ctx, level)),
  },
  orb: {
    id: 'orb',
    name: 'Ball Lightning',
    icon: '🔮',
    text: (level) => `Release a crackling orb that drifts toward the swarm, zapping up to ${2 + level} bees at a time.`,
    cooldown: (level) => faster(10, level),
    autoTarget: (ctx) => densest(ctx, 380)?.position ?? null,
    cast: (ctx, target, level) => ctx.effects.addEffect(new BallLightning(ctx, target, level)),
  },
  honey: {
    id: 'honey',
    name: 'Honey Trap',
    icon: '🍯',
    text: (level) => `Splash a pool of honey on the biggest swarm for ${4 + level}s: bees crawl and take ${Math.round(2 * power(level))} damage every half second.`,
    cooldown: (level) => faster(9, level),
    autoTarget: (ctx) => {
      const crowd = densest(ctx, 380);
      return crowd && crowd.count >= 2 ? crowd.position : null;
    },
    cast: (ctx, target, level) => ctx.effects.addEffect(new HoneyPuddle(ctx, target, { radius: 70 + level * 5, life: 4 + level, damage: Math.round(2 * power(level)) })),
  },
  bubbles: {
    id: 'bubbles',
    name: 'Bubble Barrage',
    icon: '🫧',
    text: (level) => `Blow a fan of ${4 + level} bubbles that pop on bees for ${Math.round(4 * power(level))} damage each.`,
    cooldown: (level) => faster(3.5, level),
    autoTarget: (ctx) => nearest(ctx, 380)?.position ?? null,
    cast: (ctx, target, level) => {
      ctx.play('pop');
      ctx.effects.addEffect(new Volley(ctx, ctx.player.position, fan(aimFrom(ctx, target), 4 + level, 0.9), { speed: 300, range: 420, damage: Math.round(4 * power(level)), radius: 12, wobble: 60, make: () => bubbleMesh() }));
    },
  },
  boomerang: {
    id: 'boomerang',
    name: 'Blossom Boomerang',
    icon: '🌸',
    text: (level) => `Throw ${1 + Math.floor((level - 1) / 2)} spinning blossom${level >= 3 ? 's' : ''} that fly out and back, cutting every bee twice for ${Math.round(6 * power(level))}.`,
    cooldown: (level) => faster(5, level),
    autoTarget: (ctx) => nearest(ctx, 320)?.position ?? null,
    cast: (ctx, target, level) =>
      ctx.effects.addEffect(new Boomerang(ctx, aimFrom(ctx, target), { damage: Math.round(6 * power(level)), range: 280, count: 1 + Math.floor((level - 1) / 2) })),
  },
  shards: {
    id: 'shards',
    name: 'Ice Shards',
    icon: '🧊',
    text: (level) => `${8 + level * 2} shards of ice burst out of you, piercing bees for ${Math.round(3 * power(level))} and chilling them.`,
    cooldown: (level) => faster(6, level),
    autoTarget: (ctx) => (near(ctx, ctx.player.position, 260).length >= 2 ? ctx.player.position : null),
    cast: (ctx, target, level) => {
      ctx.play('shield');
      ctx.effects.addEffect(new Volley(ctx, ctx.player.position, radial(8 + level * 2), { speed: 520, range: 280, damage: Math.round(3 * power(level)), radius: 10, pierce: true, slow: 0.5, knockback: 60, make: () => shardMesh() }));
    },
  },
  sunbeam: {
    id: 'sunbeam',
    name: 'Sunbeam Sweep',
    icon: '☀️',
    text: (level) => `A beam of sunlight ${level >= 5 ? '(two at Lv 5) ' : ''}sweeps all around you, burning every bee it passes for ${Math.round(6 * power(level))}.`,
    cooldown: (level) => faster(8, level),
    autoTarget: (ctx) => (near(ctx, ctx.player.position, 240).length >= 3 ? ctx.player.position : null),
    cast: (ctx, target, level) => ctx.effects.addEffect(new SweepBeam(ctx, { arms: level >= 5 ? 2 : 1, length: 220 + level * 20, damage: Math.round(6 * power(level)) })),
  },
  spores: {
    id: 'spores',
    name: 'Spore Toadstool',
    icon: '🍄',
    text: (level) => `Grow a toadstool in the swarm for ${6 + level}s; it puffs stinging spores for ${Math.round(2.5 * power(level))} damage and poison.`,
    cooldown: (level) => faster(11, level),
    autoTarget: (ctx) => {
      const crowd = densest(ctx, 360);
      return crowd && crowd.count >= 3 ? crowd.position : null;
    },
    cast: (ctx, target, level) => ctx.effects.addEffect(new Mushroom(ctx, target, { life: 6 + level, damage: Math.round(2.5 * power(level)) })),
  },
  raincloud: {
    id: 'raincloud',
    name: 'Scalding Rain',
    icon: '🌧️',
    lasting: true,
    text: (level) => `A cloud follows you for ${5 + level}s, raining hot tea on nearby bees for ${Math.round(3 * power(level))} damage.`,
    cooldown: (level) => faster(14, level),
    autoTarget: (ctx) => (nearest(ctx, 260) ? ctx.player.position : null),
    cast: (ctx, target, level) => ctx.effects.addEffect(new RainCloud(ctx, { life: 5 + level, damage: Math.round(3 * power(level)), every: 0.3 })),
  },
  koi: {
    id: 'koi',
    name: 'Koi Spirits',
    icon: '🐟',
    text: (level) => `${2 + Math.floor(level / 2)} spirit koi swim through the swarm, hitting every bee they pass for ${Math.round(6 * power(level))}.`,
    cooldown: (level) => faster(6, level),
    autoTarget: (ctx) => nearest(ctx, 420)?.position ?? null,
    cast: (ctx, target, level) => {
      ctx.play('splash');
      ctx.effects.addEffect(new Volley(ctx, ctx.player.position, fan(aimFrom(ctx, target), 2 + Math.floor(level / 2), 0.7), { speed: 380, range: 520, damage: Math.round(6 * power(level)), radius: 16, pierce: true, curve: 3, make: koiMesh }));
    },
  },
  gong: {
    id: 'gong',
    name: 'Temple Gong',
    icon: '🔔',
    text: (level) => `When bees crowd you, a gong rings: ${Math.round(5 * power(level))} damage, a huge shove and ${(0.8 + level * 0.2).toFixed(1)}s dazed.`,
    cooldown: (level) => faster(9, level),
    autoTarget: (ctx) => (near(ctx, ctx.player.position, 150).length >= 4 ? ctx.player.position : null),
    cast: (ctx, target, level) => gongStrike(ctx, ctx.player.position.clone(), { radius: 160 + level * 10, damage: Math.round(5 * power(level)), daze: 0.8 + level * 0.2 }),
  },
  vines: {
    id: 'vines',
    name: 'Bramble Line',
    icon: '🌱',
    text: (level) => `Brambles tear out of the ground toward the swarm: ${Math.round(7 * power(level))} damage, rooting bees for ${(0.8 + level * 0.2).toFixed(1)}s.`,
    cooldown: (level) => faster(7, level),
    autoTarget: (ctx) => densest(ctx, 340)?.position ?? null,
    cast: (ctx, target, level) =>
      ctx.effects.addEffect(new VineLine(ctx, ctx.player.position, aimFrom(ctx, target), { length: 240 + level * 20, damage: Math.round(7 * power(level)), root: 0.8 + level * 0.2 })),
  },
};

// --- Fusions -------------------------------------------------------------------------
// Two skills that are both at FUSE_LEVEL or higher can fuse into one stronger skill (offered as a level-up card).
// The fusion takes one slot instead of two and has FUSION_MAX levels of its own. `vlevel` turns a fusion level into
// the level the old skill classes understand (Lv 1 hits harder than a mastered skill).
export const FUSE_LEVEL = 3; // was 4 until v0.24: fusions took too long, especially in co-op
export const FUSION_MAX = 3;
const vlevel = (level) => 5 + 2 * level;
const fpower = (level) => power(vlevel(level));

export const FUSIONS = {
  frostfire: {
    name: 'Frostfire Meteors',
    icon: '🌠',
    parts: ['comet', 'frost'],
    text: (level) => `${3 + level} giant meteors of fire and ice: ${Math.round(14 * fpower(level))} damage each, burning and freezing everything they hit.`,
    cooldown: (level) => 6 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => densest(ctx, 460)?.position ?? null,
    cast: (ctx, target, level) => {
      const damage = Math.round(14 * fpower(level));
      for (let i = 0; i < 3 + level; i++) {
        const offset = i === 0 ? new THREE.Vector3() : new THREE.Vector3((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 260, 0);
        ctx.effects.addEffect(new Comet(ctx, target.clone().add(offset), damage, { radius: 110, frost: true }));
      }
    },
  },
  tempest: {
    name: 'Storm Crown',
    icon: '🌩️',
    parts: ['thunder', 'orb'],
    lasting: true,
    text: (level) => `A storm orb crowns you for ${6 + level * 2}s, throwing lightning through ${5 + level * 2} bees at a time for ${Math.round(4 * fpower(level))}.`,
    cooldown: (level) => 12 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => (nearest(ctx, 320) ? ctx.player.position : null),
    cast: (ctx, target, level) => ctx.effects.addEffect(new StormCrown(ctx, { life: 6 + level * 2, damage: Math.round(4 * fpower(level)), targets: 5 + level * 2 })),
  },
  ceremony: {
    name: 'Grand Tea Ceremony',
    icon: '🍵',
    parts: ['turret', 'mirror'],
    lasting: true,
    text: () => 'Three teapot turrets ring you and a golden spirit Tode joins the fight, all of them hitting far harder.',
    cooldown: (level) => 18 * (1 - 0.1 * (level - 1)),
    autoTarget: (ctx) => (ctx.aliveEnemies().length >= 3 ? ctx.player.position : null),
    cast: (ctx, target, level) => {
      for (const direction of radial(3)) {
        const spot = ctx.player.position.clone().addScaledVector(direction, 70);
        ctx.effects.addEffect(new TeaTurret(ctx, ctx.isFree(spot, 14) ? spot : ctx.player.position, vlevel(level)));
      }
      ctx.effects.addEffect(new MirrorTode(ctx, vlevel(level)));
    },
  },
  seekers: {
    name: 'Firefly Glaives',
    icon: '💫',
    parts: ['glaive', 'fireflies'],
    text: (level) => `${2 + level} glowing glaives each hunt their own bee and bounce through ${vlevel(level) + 3} more for ${Math.round(6 * fpower(level))}.`,
    cooldown: (level) => 4 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => nearest(ctx, 420)?.position ?? null,
    cast: (ctx, target, level) => {
      const bees = near(ctx, ctx.player.position, 420).sort(() => Math.random() - 0.5);
      for (let i = 0; i < 2 + level; i++) ctx.effects.addEffect(new LeafGlaive(ctx, (bees[i] ?? bees[0])?.position ?? target, vlevel(level)));
    },
  },
  cyclone: {
    name: 'Steam Cyclone',
    icon: '🌀',
    parts: ['tornado', 'geyser'],
    text: (level) => `A roaring cyclone drags bees in while steam geysers burst all along its path for ${Math.round(8 * fpower(level))}.`,
    cooldown: (level) => 8 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => densest(ctx, 360)?.position ?? null,
    cast: (ctx, target, level) => ctx.effects.addEffect(new SteamCyclone(ctx, target, vlevel(level), Math.round(8 * fpower(level)))),
  },
  whirl: {
    name: 'Whirling Tea Party',
    icon: '🪀',
    parts: ['tongue', 'cups'],
    text: (level) => `Your tongue whirls around you twice for ${Math.round(9 * fpower(level))} per pass while ${vlevel(level) + 2} teacups orbit you.`,
    cooldown: (level) => 3 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => (near(ctx, ctx.player.position, 170).length >= 1 ? ctx.player.position : null),
    cast: (ctx, target, level) => {
      ctx.effects.addEffect(new TongueSpin(ctx, { range: 170 + level * 20, damage: Math.round(9 * fpower(level)) }));
      if (!ctx.effects.list?.some((effect) => effect instanceof OrbitingCups)) ctx.effects.addEffect(new OrbitingCups(ctx, vlevel(level)));
    },
  },
  prism: {
    name: 'Prism Nova',
    icon: '🔆',
    parts: ['sunbeam', 'shards'],
    text: (level) => `Six beams of light sweep around you while ${16 + level * 4} crystal shards burst out: ${Math.round(6 * fpower(level))} damage each.`,
    cooldown: (level) => 7 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => (near(ctx, ctx.player.position, 260).length >= 2 ? ctx.player.position : null),
    cast: (ctx, target, level) => {
      const damage = Math.round(6 * fpower(level));
      ctx.effects.addEffect(new SweepBeam(ctx, { arms: 6, length: 260 + level * 30, damage, color: '#ffc8f0' }));
      ctx.effects.addEffect(new Volley(ctx, ctx.player.position, radial(16 + level * 4), { speed: 560, range: 320, damage, radius: 10, pierce: true, slow: 0.5, knockback: 60, make: (i) => shardMesh(['#ffc8f0', '#bff0ff', '#fff2a0'][i % 3]) }));
    },
  },
  bloom: {
    name: 'Honeybloom',
    icon: '🌻',
    parts: ['honey', 'spores'],
    text: (level) => `A giant toadstool grows in a lake of honey that sucks the swarm in: ${Math.round(3 * fpower(level))} damage every half second, spores and poison.`,
    cooldown: (level) => 10 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => densest(ctx, 380)?.position ?? null,
    cast: (ctx, target, level) => {
      const damage = Math.round(3 * fpower(level));
      ctx.effects.addEffect(new HoneyPuddle(ctx, target, { radius: 130, life: 6 + level, damage, pull: 320 }));
      ctx.effects.addEffect(new Mushroom(ctx, target, { life: 6 + level, damage, radius: 120, every: 0.6, size: 1.8 }));
    },
  },
  tide: {
    name: 'Koi Tide',
    icon: '🌊',
    parts: ['koi', 'bubbles'],
    text: (level) => `A tide of ${5 + level * 2} koi and a wall of bubbles sweeps toward the swarm: ${Math.round(6 * fpower(level))} damage each.`,
    cooldown: (level) => 5 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => nearest(ctx, 460)?.position ?? null,
    cast: (ctx, target, level) => {
      const direction = aimFrom(ctx, target);
      const damage = Math.round(6 * fpower(level));
      ctx.play('splash');
      ctx.effects.addEffect(new Volley(ctx, ctx.player.position, fan(direction, 5 + level * 2, 1.6), { speed: 400, range: 600, damage, radius: 18, pierce: true, curve: 3, make: koiMesh }));
      ctx.effects.addEffect(new Volley(ctx, ctx.player.position, fan(direction, 10, 1.2), { speed: 260, range: 460, damage, radius: 13, wobble: 70, make: () => bubbleMesh(7) }));
    },
  },
  thunderhead: {
    name: 'Thunderhead',
    icon: '⛈️',
    parts: ['raincloud', 'thunder'],
    lasting: true,
    text: (level) => `A black storm cloud follows you for ${7 + level}s, pouring scalding rain and calling lightning through ${3 + level} bees.`,
    cooldown: (level) => 12 * (1 - 0.1 * (level - 1)),
    autoTarget: (ctx) => (nearest(ctx, 300) ? ctx.player.position : null),
    cast: (ctx, target, level) => ctx.effects.addEffect(new RainCloud(ctx, { life: 7 + level, damage: Math.round(3.5 * fpower(level)), every: 0.15, range: 290, thunder: 3 + level })),
  },
  quake: {
    name: 'Earthshaker',
    icon: '🪨',
    parts: ['gong', 'vines'],
    text: (level) => `A colossal gong shakes the earth: ${Math.round(6 * fpower(level))} damage around you and six lines of brambles that root everything they catch.`,
    cooldown: (level) => 8 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => (near(ctx, ctx.player.position, 200).length >= 3 ? ctx.player.position : null),
    cast: (ctx, target, level) => {
      const damage = Math.round(6 * fpower(level));
      gongStrike(ctx, ctx.player.position.clone(), { radius: 220 + level * 20, damage, daze: 1.6, size: 1.6 });
      for (const direction of radial(6)) ctx.effects.addEffect(new VineLine(ctx, ctx.player.position, direction, { length: 300 + level * 30, damage, root: 2 }));
    },
  },
  sugarrush: {
    name: 'Sugar Rush',
    icon: '🍭',
    parts: ['leap', 'mines'],
    text: (level) => `Leap out of the crowd onto a sugar blast of ${Math.round(8 * fpower(level))} and land in a ring of ${vlevel(level) + 2} sugar mines.`,
    cooldown: (level) => 6 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => SKILLS.leap.autoTarget(ctx),
    cast: (ctx, target, level) => ctx.effects.addEffect(new SugarLeap(ctx, target, Math.round(8 * fpower(level)), vlevel(level))),
  },
  halo: {
    name: 'Blossom Halo',
    icon: '🏵️',
    parts: ['boomerang', 'cups'],
    text: (level) => `Blossoms fly out in all four directions and back for ${Math.round(6 * fpower(level))}, with ${vlevel(level) + 2} teacups circling you.`,
    cooldown: (level) => 4.5 * (1 - 0.12 * (level - 1)),
    autoTarget: (ctx) => nearest(ctx, 320)?.position ?? null,
    cast: (ctx, target, level) => {
      const damage = Math.round(6 * fpower(level));
      for (const direction of radial(4, Math.atan2(target.y - ctx.player.position.y, target.x - ctx.player.position.x))) {
        ctx.effects.addEffect(new Boomerang(ctx, direction, { damage, range: 300, count: 1 }));
      }
      if (!ctx.effects.list?.some((effect) => effect instanceof OrbitingCups)) ctx.effects.addEffect(new OrbitingCups(ctx, vlevel(level)));
    },
  },
};

// Fusions live in SKILLS too (co-op replays casts by id; the HUD shows them like any skill).
for (const [id, fusion] of Object.entries(FUSIONS)) SKILLS[id] = { id, fusion: true, ...fusion };

/** The fusions a skill can be part of. */
export const fusionsOf = (id) => Object.entries(FUSIONS).filter(([, fusion]) => fusion.parts.includes(id)).map(([fid]) => SKILLS[fid]);

const maxLevel = (skill) => (skill.fusion ? FUSION_MAX : MAX_SKILL_LEVEL);
const MASTERY_ECHO = 0.35; // seconds before a mastered skill casts again
// Skills that last a while (or move Tode) don't echo when mastered; they cool down faster instead.
const ECHOLESS = new Set(['turret', 'mirror', 'cups', 'leap', 'raincloud', 'sugarrush', ...Object.keys(FUSIONS).filter((id) => FUSIONS[id].lasting)]);

/** The skills Tode knows this run, with cooldowns. */
export class SkillBook {
  constructor(ctx) {
    this.ctx = ctx;
    this.slots = [];
    this.echoes = [];
  }

  reset() {
    this.slots = [];
    this.echoes = [];
  }

  level(id) {
    return this.slots.find((slot) => slot.id === id)?.level ?? 0;
  }

  owns(id) {
    return this.level(id) > 0;
  }

  /** Fusions whose two skills are both trained up to FUSE_LEVEL. */
  fusionsReady() {
    return Object.entries(FUSIONS)
      .filter(([id, fusion]) => !this.owns(id) && fusion.parts.every((part) => this.level(part) >= FUSE_LEVEL))
      .map(([id]) => SKILLS[id]);
  }

  /**
   * Three different offers: new skills while there's room, otherwise upgrades. A fusion that is ready always takes
   * the first card. Each offer carries a `hint`: what it fuses with, or what its mastery does.
   */
  offers() {
    const full = this.slots.length >= MAX_SKILLS;
    const pool = Object.values(SKILLS).filter((skill) => {
      const level = this.level(skill.id);
      if (skill.fusion) return level > 0 && level < FUSION_MAX;
      return full ? level > 0 && level < MAX_SKILL_LEVEL : level < MAX_SKILL_LEVEL;
    });
    const shuffle = (list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    shuffle(pool);
    // Upgrades that bring a fusion closer (both parts owned, one still below FUSE_LEVEL) come first more often.
    const towardFusion = (skill) =>
      !skill.fusion && this.owns(skill.id) && this.level(skill.id) < FUSE_LEVEL && fusionsOf(skill.id).some((f) => f.parts.every((part) => this.owns(part)) && !this.owns(f.id));
    const nearer = pool.filter((skill) => towardFusion(skill) && Math.random() < 0.6);
    const fusions = shuffle(this.fusionsReady()).slice(0, 1);
    const picks = [...fusions, ...nearer, ...pool.filter((skill) => !nearer.includes(skill))].slice(0, 3);
    return picks.map((skill) => {
      const level = this.level(skill.id) + 1;
      return { skill, level, fusion: Boolean(skill.fusion) && level === 1, hint: this.hint(skill, level) };
    });
  }

  hint(skill, level) {
    if (skill.fusion && level === 1) {
      const [a, b] = skill.parts.map((part) => SKILLS[part]);
      return `🔗 Fuses ${a.icon} ${a.name} + ${b.icon} ${b.name} into one slot`;
    }
    if (level === maxLevel(skill)) return ECHOLESS.has(skill.id) ? '★ Mastery: cools down 30% faster' : '★ Mastery: casts twice';
    if (skill.fusion) return null;
    const options = fusionsOf(skill.id).map((fusion) => ({ fusion, partner: SKILLS[fusion.parts.find((part) => part !== skill.id)] }));
    const owned = options.find(({ partner }) => this.owns(partner.id)) ?? options[0];
    if (!owned) return null;
    const { fusion, partner } = owned;
    return this.owns(partner.id)
      ? `🔗 With ${partner.icon} at Lv ${FUSE_LEVEL}: becomes ${fusion.icon} ${fusion.name}`
      : `🔗 Fuses with ${partner.icon} ${partner.name}`;
  }

  learn(id) {
    const slot = this.slots.find((s) => s.id === id);
    if (slot) {
      slot.level++;
      return;
    }
    const skill = SKILLS[id];
    if (skill?.fusion) {
      // The two skills become one, in the slot of the first.
      const at = Math.min(...skill.parts.map((part) => this.slots.findIndex((s) => s.id === part)).filter((i) => i >= 0), this.slots.length);
      this.slots = this.slots.filter((s) => !skill.parts.includes(s.id));
      this.slots.splice(Math.min(at, this.slots.length), 0, { id, level: 1, cooldownLeft: 0 });
      return;
    }
    this.slots.push({ id, level: 1, cooldownLeft: 0 });
  }

  /** True when this slot has reached its last level. */
  mastered(slot) {
    return slot.level >= maxLevel(SKILLS[slot.id]);
  }

  /** Counts down cooldowns and casts every ready skill that has a good target. */
  update(delta) {
    // Mastered skills cast a second time, a moment after the first.
    for (const echo of this.echoes) echo.left -= delta;
    for (const echo of this.echoes.filter((e) => e.left <= 0)) {
      if (!this.ctx.player.rooted) {
        SKILLS[echo.id].cast(this.ctx, echo.target, echo.level);
        this.ctx.onSkillCast?.(echo.id, echo.level, echo.target);
      }
    }
    this.echoes = this.echoes.filter((e) => e.left > 0);
    for (const slot of this.slots) {
      slot.cooldownLeft = Math.max(0, slot.cooldownLeft - delta);
      if (slot.cooldownLeft === 0) {
        const target = SKILLS[slot.id].autoTarget(this.ctx);
        if (target) this.fire(slot, target);
      }
    }
  }

  fire(slot, target) {
    if (this.ctx.player.rooted) return;
    const skill = SKILLS[slot.id];
    const mastered = this.mastered(slot);
    const echoless = ECHOLESS.has(slot.id);
    // The Mage's cool down faster; a mastered lasting skill too.
    slot.cooldownLeft = skill.cooldown(slot.level) * (this.ctx.player.stats.skillCooldown ?? 1) * (mastered && echoless ? 0.7 : 1);
    skill.cast(this.ctx, target, slot.level);
    this.ctx.onSkillCast?.(slot.id, slot.level, target); // co-op: show it to teammates
    if (mastered && !echoless) this.echoes.push({ id: slot.id, level: slot.level, target: target.clone(), left: MASTERY_ECHO });
  }
}
