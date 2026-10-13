import * as THREE from 'three';
import { additive, createTeapot, disposeTree } from './Ultimates.js';

/**
 * Skills: active abilities Tode learns during a run (up to three).
 * By default they cast themselves when the moment is right, so the player can keep running and
 * shooting; in manual mode they fire on Q / E / F toward the cursor.
 *
 * Each skill: `cooldown(level)`, `autoTarget(ctx)` → a target point (or null to wait),
 * and `cast(ctx, target, level)`. Levels go up when the same skill is picked again.
 */

export const MAX_SKILLS = 3;
export const MAX_SKILL_LEVEL = 3;
export const SKILL_KEYS = ['KeyQ', 'KeyE', 'KeyF'];
export const SKILL_KEY_LABELS = ['Q', 'E', 'F'];

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
    this.root = new THREE.Group();
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
  constructor(ctx, target, damage) {
    super(ctx, 0.55);
    this.target = target.clone().setZ(0);
    this.from = this.target.clone().add(new THREE.Vector3(-160, 160, 520));
    this.damage = damage;
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), additive('#ffd36b', 1));
    this.glow = new THREE.Mesh(new THREE.IcosahedronGeometry(18, 1), additive('#ff6a00', 0.5));
    this.root.add(this.ball, this.glow);
    this.warning = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), additive('#ff8a2a', 0.8));
    this.warning.scale.setScalar(60);
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
    ctx.particles.burst(target, { count: 40, colors: FIRE, speed: 220, up: 160, size: 2.4, height: 4, life: 0.7, glow: true });
    ctx.effects.blast(target, { radius: 70, damage: this.damage, knockback: 260, color: '#ff8a2a', source: 'skill' });
    for (const enemy of near(ctx, target, 70)) enemy.applyBurn(2, 3);
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

// --- The skills ------------------------------------------------------------------

export const SKILLS = {
  tongue: {
    id: 'tongue',
    name: 'Tongue Lash',
    icon: '👅',
    text: (level) => `Whip your tongue at bees in front of you for ${Math.round(9 * power(level))} damage, smacking them away.`,
    cooldown: (level) => faster(2.6, level),
    autoTarget: (ctx) => nearest(ctx, 135)?.position ?? null,
    cast: (ctx, target, level) => new TongueLash(ctx, target, level),
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
    manualTarget: (ctx, point) => {
      // Leap toward the cursor, at most 220 units, to a free spot.
      const offset = point.clone().sub(ctx.player.position).setZ(0);
      if (offset.length() > 220) offset.setLength(220);
      for (let scale = 1; scale > 0.1; scale -= 0.15) {
        const spot = ctx.player.position.clone().addScaledVector(offset, scale);
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
  orb: {
    id: 'orb',
    name: 'Ball Lightning',
    icon: '🔮',
    text: (level) => `Release a crackling orb that drifts toward the swarm, zapping up to ${2 + level} bees at a time.`,
    cooldown: (level) => faster(10, level),
    autoTarget: (ctx) => densest(ctx, 380)?.position ?? null,
    cast: (ctx, target, level) => ctx.effects.addEffect(new BallLightning(ctx, target, level)),
  },
};

/** The skills Tode knows this run, with cooldowns. */
export class SkillBook {
  constructor(ctx) {
    this.ctx = ctx;
    this.slots = [];
  }

  reset() {
    this.slots = [];
  }

  level(id) {
    return this.slots.find((slot) => slot.id === id)?.level ?? 0;
  }

  /** Three different offers: new skills while there's room, otherwise upgrades. */
  offers() {
    const full = this.slots.length >= MAX_SKILLS;
    const pool = Object.values(SKILLS).filter((skill) => {
      const level = this.level(skill.id);
      return full ? level > 0 && level < MAX_SKILL_LEVEL : level < MAX_SKILL_LEVEL;
    });
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3).map((skill) => ({ skill, level: this.level(skill.id) + 1 }));
  }

  learn(id) {
    const slot = this.slots.find((s) => s.id === id);
    if (slot) slot.level++;
    else this.slots.push({ id, level: 1, cooldownLeft: 0 });
  }

  /** Counts down cooldowns; in auto mode casts every ready skill that has a good target. */
  update(delta, auto) {
    for (const slot of this.slots) {
      slot.cooldownLeft = Math.max(0, slot.cooldownLeft - delta);
      if (auto && slot.cooldownLeft === 0) {
        const target = SKILLS[slot.id].autoTarget(this.ctx);
        if (target) this.fire(slot, target);
      }
    }
  }

  /** Manual cast toward `point` (the cursor on the ground). */
  castManual(index, point) {
    const slot = this.slots[index];
    if (!slot || slot.cooldownLeft > 0) return;
    const skill = SKILLS[slot.id];
    const target = skill.manualTarget ? skill.manualTarget(this.ctx, point) : point.clone();
    if (target) this.fire(slot, target);
  }

  fire(slot, target) {
    if (this.ctx.player.rooted) return;
    const skill = SKILLS[slot.id];
    slot.cooldownLeft = skill.cooldown(slot.level);
    skill.cast(this.ctx, target, slot.level);
  }
}
