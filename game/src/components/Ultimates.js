import * as THREE from 'three';
import { MAP_HALF_SIZE } from './Map.js';

/**
 * Ultimates: chosen once per run, charged by fighting (like the God Gauge in Hades)
 * and fired with E / middle mouse.
 */
export const ULTIMATES = {
  beam: {
    id: 'beam',
    name: 'Steeping Beam',
    icon: '☄️',
    text: 'Gather your power, then unleash a colossal beam of boiling tea. Keep moving and sweep it across the swarm.',
  },
  storm: {
    id: 'storm',
    name: 'Thunder Tea Storm',
    icon: '🌩️',
    text: 'Turn the sky black and call 24 lightning strikes down on the bees.',
  },
  summon: {
    id: 'summon',
    name: 'Summoning: Great Tode',
    icon: '🐸',
    text: 'Slam a summoning seal: a colossal battle toad bursts from the smoke, stomps, tongue-lashes the swarm and body-slams it.',
  },
};

const TEA = ['#c98a2b', '#e7b45a', '#f3d29a', '#ffffff'];
const GOLD = ['#fff3c4', '#ffd36b', '#ffb02e', '#ffffff'];

export const additive = (color, opacity) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

export function disposeTree(root) {
  root.removeFromParent();
  root.traverse((child) => {
    child.geometry?.dispose();
    child.material?.dispose();
  });
}

// --- Steeping Beam ------------------------------------------------------------

const BEAM_CHARGE = 0.75; // seconds of gathering power
const BEAM_FIRE = 2.6; // seconds of firing
const BEAM_LENGTH = 1100;
const BEAM_TURN_RATE = 4.5; // radians per second it can follow the aim
const BEAM_DPS = 30;
const BEAM_WIDTH = 1.6; // the beam is enormous

class SteepingBeam {
  constructor(ctx) {
    this.ctx = ctx;
    this.age = 0;
    this.tick = 0;
    this.direction = ctx.player.facing.clone();
    this.group = new THREE.Group();

    // A unit cylinder along +X, scaled to the beam's length and width.
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    cylinder.rotateZ(-Math.PI / 2);
    cylinder.translate(0.5, 0, 0);
    this.layers = [
      { mesh: new THREE.Mesh(cylinder, additive('#ffffff', 1)), width: 7 },
      { mesh: new THREE.Mesh(cylinder.clone(), additive('#ffd36b', 0.75)), width: 16 },
      { mesh: new THREE.Mesh(cylinder.clone(), additive('#ff8a2a', 0.28)), width: 30 },
    ];
    for (const { mesh } of this.layers) {
      mesh.visible = false;
      this.group.add(mesh);
    }
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), additive('#fff3c4', 0.9));
    this.group.add(this.orb);
    ctx.scene.add(this.group);

    // Tode keeps moving (slowly) and aiming while firing, and nothing can interrupt him.
    ctx.player.channeling = true;
    ctx.player.unstoppableLeft = BEAM_CHARGE + BEAM_FIRE;
    ctx.play('beamCharge');
  }

  update(delta) {
    const { ctx } = this;
    const { player } = ctx;
    this.age += delta;

    // Swing toward where Tode is aiming, but not instantly.
    const current = Math.atan2(this.direction.y, this.direction.x);
    const wanted = Math.atan2(player.facing.y, player.facing.x);
    const difference = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
    const turned = current + THREE.MathUtils.clamp(difference, -BEAM_TURN_RATE * delta, BEAM_TURN_RATE * delta);
    this.direction.set(Math.cos(turned), Math.sin(turned), 0);

    const origin = player.position.clone().addScaledVector(this.direction, player.radius).setZ(12);
    this.group.position.copy(origin);
    this.group.rotation.z = turned;

    if (this.age < BEAM_CHARGE) {
      const t = this.age / BEAM_CHARGE;
      this.orb.scale.setScalar(2 + t * 11);
      ctx.particles.burst(origin.clone().setZ(0), {
        count: 3, colors: GOLD, ring: 70, speed: -150, up: 0, gravity: 0, height: 12, life: 0.45, glow: true,
      });
      ctx.postfx.pulse({ bloom: t * 0.8 });
      return true;
    }

    if (!this.fired) {
      this.fired = true;
      this.layers.forEach(({ mesh }) => (mesh.visible = true));
      ctx.play('beam');
      ctx.shake(12);
      ctx.postfx.flash('#fff2c0', 0.5);
    }

    const t = this.age - BEAM_CHARGE;
    const swell = t < 0.15 ? t / 0.15 : t > BEAM_FIRE - 0.3 ? Math.max(0, (BEAM_FIRE - t) / 0.3) : 1;
    const width = swell * (1 + 0.08 * Math.sin(this.age * 45));
    for (const { mesh, width: base } of this.layers) mesh.scale.set(BEAM_LENGTH, base * width * BEAM_WIDTH, base * width * BEAM_WIDTH);
    this.orb.scale.setScalar(18 * width * BEAM_WIDTH);
    ctx.shake(4);
    ctx.postfx.pulse({ bloom: 1.3, aberration: 0.5 });

    this.tick -= delta;
    if (this.tick <= 0) {
      this.tick = 0.1;
      const reach = 16 * width * BEAM_WIDTH;
      for (const enemy of ctx.aliveEnemies()) {
        const offset = enemy.position.clone().sub(origin).setZ(0);
        const along = offset.dot(this.direction);
        if (along < 0 || along > BEAM_LENGTH) continue;
        const across = offset.addScaledVector(this.direction, -along);
        if (across.length() > reach + enemy.radius) continue;
        ctx.damageEnemy(enemy, Math.round(BEAM_DPS * 0.1 * player.stats.ultimatePower), across.normalize(), 80, 'ultimate');
      }
    }
    const spot = origin.clone().addScaledVector(this.direction, Math.random() * 600).setZ(0);
    ctx.particles.burst(spot, { count: 3, colors: GOLD, speed: 90, up: 60, height: 12, size: 1.8, glow: true, life: 0.4 });

    return t < BEAM_FIRE;
  }

  dispose() {
    this.ctx.player.channeling = false;
    disposeTree(this.group);
  }
}

// --- Thunder Tea Storm ----------------------------------------------------------

const STORM_STRIKES = 20;
const STORM_INTERVAL = 0.12;
const STORM_DAMAGE = 10;

class ThunderTeaStorm {
  constructor(ctx) {
    this.ctx = ctx;
    this.age = 0;
    this.left = STORM_STRIKES;
    this.timer = 0.35; // a breath of darkness before the first strike
    ctx.weather.darken(STORM_STRIKES * STORM_INTERVAL + 1.2);
    ctx.play('thunder');
    ctx.postfx.pulse({ aberration: 0.6 });
  }

  target() {
    const { player } = this.ctx;
    const nearby = this.ctx
      .aliveEnemies()
      .sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))
      .slice(0, 14);
    if (nearby.length && Math.random() < 0.85) return nearby[Math.floor(Math.random() ** 1.5 * nearby.length)].position;
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 220;
    return player.position.clone().add(new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, 0));
  }

  update(delta) {
    this.age += delta;
    this.timer -= delta;
    while (this.timer <= 0 && this.left > 0) {
      this.left--;
      this.timer += STORM_INTERVAL;
      this.ctx.effects.strike(this.target(), {
        damage: Math.round(STORM_DAMAGE * this.ctx.player.stats.ultimatePower),
        radius: 50,
        source: 'ultimate',
      });
    }
    return this.left > 0;
  }

  dispose() {}
}

// --- The teapot model (Tea Turret, the golden teapot in the heavens) ---------------

export function createTeapot() {
  const porcelain = new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.3, flatShading: true });
  const blue = new THREE.MeshStandardMaterial({ color: '#3f78d1', roughness: 0.4, flatShading: true });
  const teapot = new THREE.Group();
  const part = (geometry, material, [x, y, z], rotation = [0, 0, 0], scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    teapot.add(mesh);
  };
  // Modelled Y-up; the group is turned Z-up below.
  part(new THREE.SphereGeometry(40, 16, 12), porcelain, [0, 34, 0], [0, 0, 0], [1, 0.85, 1]);
  part(new THREE.TorusGeometry(40, 2.5, 6, 32), blue, [0, 34, 0], [Math.PI / 2, 0, 0]);
  part(new THREE.CylinderGeometry(20, 26, 10, 16), porcelain, [0, 68, 0]);
  part(new THREE.SphereGeometry(7, 10, 8), blue, [0, 78, 0]);
  part(new THREE.CylinderGeometry(5, 9, 46, 10), porcelain, [46, 44, 0], [0, 0, -0.8]);
  part(new THREE.TorusGeometry(17, 4.5, 8, 20, Math.PI * 1.3), porcelain, [-40, 38, 0], [0, 0, Math.PI * 0.35]);
  teapot.rotation.x = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(teapot);
  return holder;
}

// --- Summoning: Great Tode ---------------------------------------------------------

const SUMMON_SCALE = 6.5; // times Tode's size
const SUMMON_STOMP_RADIUS = 210;
const SUMMON_STOMP_DAMAGE = 18;
const SUMMON_TONGUE_LENGTH = 420;
const SUMMON_TONGUE_DAMAGE = 16;
const SUMMON_SLAM_RADIUS = 300;
const SUMMON_SLAM_DAMAGE = 30;
const SMOKE = ['#ffffff', '#e8e4dc', '#cfc8bc'];
// Timeline (seconds): seal, appear, three tongue sweeps, a body slam, vanish.
const SUMMON = { appear: 0.6, sweeps: [1.4, 2.4, 3.4], sweepTime: 0.75, jump: 4.5, slam: 5.2, vanish: 6.4, end: 7 };

class GreatTodeSummon {
  constructor(ctx) {
    this.ctx = ctx;
    this.age = 0;
    const limit = MAP_HALF_SIZE - 90;
    // The toad lands a little ahead of Tode, toward the aim.
    const toward = ctx.aimGround.clone().sub(ctx.player.position).setZ(0);
    const ahead = Math.min(140, toward.length());
    this.center = ctx.player.position.clone().addScaledVector(toward.normalize(), ahead).setZ(0);
    this.center.x = THREE.MathUtils.clamp(this.center.x, -limit, limit);
    this.center.y = THREE.MathUtils.clamp(this.center.y, -limit, limit);
    this.facing = Math.atan2(toward.y, toward.x) || 0;
    this.hits = new Set();

    // The summoning seal on the ground.
    this.seal = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(150, 162, 96), additive('#ffb02e', 0.9));
    const inner = new THREE.Mesh(new THREE.RingGeometry(96, 102, 96), additive('#ffd36b', 0.8));
    this.seal.add(ring, inner);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.PlaneGeometry(56, 5), additive('#ffd36b', 0.8));
      const angle = (i / 8) * Math.PI * 2;
      spoke.position.set(Math.cos(angle) * 128, Math.sin(angle) * 128, 0);
      spoke.rotation.z = angle;
      this.seal.add(spoke);
    }
    this.seal.position.set(this.center.x, this.center.y, 0.8);
    this.seal.scale.setScalar(0.01);
    ctx.scene.add(this.seal);
    ctx.play('charge');
    ctx.shake(6);
  }

  /** A copy of Tode many times his size, with battle-worn reddish skin. */
  createToad() {
    const { ctx } = this;
    const toad = new THREE.Group();
    const model = ctx.player.model.clone();
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = child.material.clone();
      child.material.color.lerp(new THREE.Color('#d0704a'), 0.45);
      child.material.emissive?.set('#2a0a00');
      child.castShadow = true;
    });
    model.scale.multiplyScalar(SUMMON_SCALE);
    model.position.z = (model.position.z / ctx.player.model.scale.x) * model.scale.x; // feet on the ground
    model.rotation.y = Math.atan2(Math.cos(this.facing), -Math.sin(this.facing));
    model.visible = true;
    toad.add(model);
    const box = new THREE.Box3().setFromObject(model);
    this.height = box.max.z - box.min.z;
    // The tongue: a pivot at the mouth, extended along +X.
    this.tongue = new THREE.Group();
    const tongueGeometry = new THREE.CylinderGeometry(9, 14, 1, 14).rotateZ(-Math.PI / 2).translate(0.5, 0, 0);
    this.tongueMesh = new THREE.Mesh(tongueGeometry, new THREE.MeshStandardMaterial({ color: '#ff7a9a', emissive: '#6a1020', roughness: 0.35 }));
    this.tongueTip = new THREE.Mesh(new THREE.SphereGeometry(22, 20, 14), this.tongueMesh.material);
    this.tongue.add(this.tongueMesh, this.tongueTip);
    this.tongue.position.z = this.height * 0.35;
    this.tongue.visible = false;
    toad.add(this.tongue);
    toad.position.copy(this.center);
    return toad;
  }

  puff(count, size = 6) {
    const { ctx, center } = this;
    ctx.particles.burst(center, { count, colors: SMOKE, speed: 260, up: 160, size, height: 20, life: 1.1, gravity: -40 });
  }

  update(delta) {
    const { ctx } = this;
    this.age += delta;
    const t = this.age;

    // The seal spins open.
    this.seal.scale.setScalar(Math.min(1, t / 0.45));
    this.seal.rotation.z += delta * 2.5;
    this.seal.children.forEach((child) => (child.material.opacity = Math.max(0, 0.9 - Math.max(0, t - 1.2) * 0.8)));

    if (!this.toad && t >= SUMMON.appear) this.appear();
    if (!this.toad) return true;

    // Breathing, then the attacks.
    const model = this.toad.children[0];
    const breathe = 1 + 0.03 * Math.sin(t * 3);
    model.scale.set(breathe, breathe, 1 / breathe).multiplyScalar(this.baseScale);

    const sweep = SUMMON.sweeps.findIndex((start) => t >= start && t < start + SUMMON.sweepTime);
    if (sweep >= 0) this.updateTongue(sweep, (t - SUMMON.sweeps[sweep]) / SUMMON.sweepTime);
    else this.tongue.visible = false;

    if (t >= SUMMON.jump && t < SUMMON.slam) {
      const k = (t - SUMMON.jump) / (SUMMON.slam - SUMMON.jump);
      this.toad.position.z = Math.sin(k * Math.PI) * 220 * (1 - k * 0.3);
      if (k > 0.85) this.toad.position.z *= (1 - k) / 0.15;
    } else if (t >= SUMMON.slam && !this.slammed) {
      this.toad.position.z = 0;
      this.slam();
    }

    if (t >= SUMMON.vanish && !this.vanished) {
      this.vanished = true;
      this.puff(70, 8);
      ctx.play('pop');
      this.toad.visible = false;
    }
    return t < SUMMON.end;
  }

  appear() {
    const { ctx, center } = this;
    this.toad = this.createToad();
    this.baseScale = this.toad.children[0].scale.x;
    ctx.scene.add(this.toad);
    this.puff(110, 9);
    ctx.play('boom');
    ctx.shake(28);
    ctx.postfx.flash('#fff1d0', 0.55);
    ctx.postfx.pulse({ bloom: 1.2, aberration: 0.9, warp: 0.6 });
    ctx.effects.ring(center, { radius: SUMMON_STOMP_RADIUS * 1.2, color: '#ffe1a0', duration: 0.7, thickness: 0.22 });
    this.hitAround(SUMMON_STOMP_RADIUS, SUMMON_STOMP_DAMAGE, 600);
  }

  /** Each sweep turns toward the thickest crowd of bees, then lashes across it. */
  updateTongue(index, k) {
    const { ctx, center } = this;
    if (this.sweep !== index) {
      this.sweep = index;
      this.hits.clear();
      const bees = ctx.aliveEnemies();
      let best = this.facing;
      let bestCount = -1;
      for (let a = 0; a < 16; a++) {
        const angle = (a / 16) * Math.PI * 2;
        const count = bees.filter((bee) => {
          const dx = bee.position.x - center.x;
          const dy = bee.position.y - center.y;
          const d = Math.hypot(dx, dy);
          return d < SUMMON_TONGUE_LENGTH && Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle))) < 0.9;
        }).length;
        if (count > bestCount) [best, bestCount] = [angle, count];
      }
      this.sweepCenter = best;
      this.sweepSide = index % 2 ? -1 : 1;
      this.toad.children[0].rotation.y = Math.atan2(Math.cos(best), -Math.sin(best));
      ctx.play('dash');
    }
    // Out, across, back in.
    const reach = Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * (k > 0.8 ? (1 - k) / 0.2 : 1);
    const angle = this.sweepCenter + this.sweepSide * (k * 2 - 1) * 0.9;
    const length = SUMMON_TONGUE_LENGTH * reach;
    this.tongue.visible = true;
    this.tongue.rotation.z = angle;
    this.tongueMesh.scale.set(Math.max(1, length), 1, 1);
    this.tongueTip.position.x = length;

    // Bees near the tongue get slapped once per sweep.
    const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const swing = new THREE.Vector3(-direction.y, direction.x, 0).multiplyScalar(this.sweepSide);
    const damage = Math.round(SUMMON_TONGUE_DAMAGE * ctx.player.stats.ultimatePower);
    for (const enemy of ctx.aliveEnemies()) {
      if (this.hits.has(enemy)) continue;
      const offset = enemy.position.clone().sub(center).setZ(0);
      const along = offset.dot(direction);
      if (along < 0 || along > length + 20) continue;
      const across = Math.abs(offset.x * direction.y - offset.y * direction.x);
      if (across > 30 + enemy.radius) continue;
      this.hits.add(enemy);
      ctx.damageEnemy(enemy, damage, swing, 700, 'ultimate');
    }
  }

  slam() {
    const { ctx, center } = this;
    this.slammed = true;
    ctx.play('boom');
    ctx.shake(32);
    ctx.postfx.flash('#fff1d0', 0.7);
    ctx.postfx.pulse({ bloom: 1.5, aberration: 1.2, warp: 1 });
    ctx.effects.ring(center, { radius: SUMMON_SLAM_RADIUS * 1.2, color: '#ffffff', duration: 0.8, thickness: 0.2 });
    ctx.effects.ring(center, { radius: SUMMON_SLAM_RADIUS * 0.8, color: '#ffb02e', duration: 0.5 });
    ctx.particles.burst(center, { count: 90, colors: TEA, speed: 460, up: 260, size: 3.2, height: 6, life: 0.9 });
    ctx.effects.pool(center, { radius: 170, dps: 5, duration: 4, color: '#c98a2b', opacity: 0.45, particleColors: ['#ffffff', '#f3d29a'] });
    this.hitAround(SUMMON_SLAM_RADIUS, SUMMON_SLAM_DAMAGE, 800);
  }

  hitAround(radius, damage, force) {
    const { ctx, center } = this;
    const amount = Math.round(damage * ctx.player.stats.ultimatePower);
    for (const enemy of ctx.aliveEnemies()) {
      const away = enemy.position.clone().sub(center).setZ(0);
      if (away.length() > radius + enemy.radius * 0.5) continue;
      ctx.damageEnemy(enemy, amount, away.normalize(), force, 'ultimate');
    }
  }

  dispose() {
    disposeTree(this.seal);
    if (this.toad) {
      this.toad.removeFromParent();
      // The model shares geometry with Tode; only the copies made here are freed.
      this.toad.traverse((child) => {
        if (!child.isMesh) return;
        child.material.dispose();
        if (child.parent === this.toad || child.parent === this.tongue) child.geometry.dispose();
      });
    }
  }
}

const EFFECTS = { beam: SteepingBeam, storm: ThunderTeaStorm, summon: GreatTodeSummon };

/** Fires an ultimate. `ctx` provides the game hooks (see main.js). */
export function startUltimate(id, ctx) {
  return ctx.effects.addEffect(new EFFECTS[id](ctx));
}
