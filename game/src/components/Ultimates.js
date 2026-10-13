import * as THREE from 'three';
import { MAP_HALF_SIZE } from './Map.js';

/**
 * Ultimates: chosen once per run, charged by fighting (like the God Gauge in Hades)
 * and fired with R / Q / middle mouse.
 */
export const ULTIMATES = {
  beam: {
    id: 'beam',
    name: 'Steeping Beam',
    icon: '☄️',
    text: 'Gather your power, then unleash a colossal beam of boiling tea that follows your aim.',
  },
  storm: {
    id: 'storm',
    name: 'Thunder Tea Storm',
    icon: '🌩️',
    text: 'Turn the sky black and call 24 lightning strikes down on the bees.',
  },
  teapot: {
    id: 'teapot',
    name: 'Grand Teapot Drop',
    icon: '🫖',
    text: 'A colossal teapot crashes down where you aim, flattening everything.',
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
const BEAM_FIRE = 1.9; // seconds of firing
const BEAM_LENGTH = 900;
const BEAM_TURN_RATE = 1.8; // radians per second it can follow the aim
const BEAM_DPS = 40;

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

    // Tode stands his ground while firing, and nothing can interrupt him.
    ctx.player.rooted = true;
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
    for (const { mesh, width: base } of this.layers) mesh.scale.set(BEAM_LENGTH, base * width, base * width);
    this.orb.scale.setScalar(18 * width);
    ctx.shake(4);
    ctx.postfx.pulse({ bloom: 1.3, aberration: 0.5 });

    this.tick -= delta;
    if (this.tick <= 0) {
      this.tick = 0.1;
      const reach = 16 * width;
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
    this.ctx.player.rooted = false;
    disposeTree(this.group);
  }
}

// --- Thunder Tea Storm ----------------------------------------------------------

const STORM_STRIKES = 24;
const STORM_INTERVAL = 0.1;
const STORM_DAMAGE = 12;

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

// --- Grand Teapot Drop ------------------------------------------------------------

const TEAPOT_DROP_TIME = 0.8;
const TEAPOT_HEIGHT = 700;
const TEAPOT_DAMAGE = 35;
const TEAPOT_RADIUS = 190;

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

class GrandTeapotDrop {
  constructor(ctx) {
    this.ctx = ctx;
    this.age = 0;
    const limit = MAP_HALF_SIZE - 40;
    this.target = ctx.aimGround.clone().setZ(0);
    this.target.x = THREE.MathUtils.clamp(this.target.x, -limit, limit);
    this.target.y = THREE.MathUtils.clamp(this.target.y, -limit, limit);

    this.teapot = createTeapot();
    this.teapot.position.set(this.target.x, this.target.y, TEAPOT_HEIGHT);
    this.teapot.rotation.z = Math.random() * Math.PI * 2;
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthWrite: false })
    );
    this.shadow.position.set(this.target.x, this.target.y, 0.7);
    ctx.scene.add(this.teapot, this.shadow);
    ctx.play('whistle');
  }

  update(delta) {
    const { ctx } = this;
    this.age += delta;
    if (!this.landed) {
      const t = Math.min(1, this.age / TEAPOT_DROP_TIME);
      this.teapot.position.z = TEAPOT_HEIGHT * (1 - t * t);
      this.teapot.rotation.z += delta * 3;
      this.shadow.scale.setScalar(30 + 110 * t);
      this.shadow.material.opacity = 0.45 * t;
      if (t >= 1) this.impact();
      return true;
    }

    const after = this.age - TEAPOT_DROP_TIME;
    if (after > 1.1) {
      this.teapot.position.z -= 90 * delta;
      this.teapot.scale.multiplyScalar(Math.exp(-2 * delta));
      this.shadow.material.opacity *= Math.exp(-4 * delta);
    }
    return after < 2;
  }

  impact() {
    const { ctx, target } = this;
    this.landed = true;
    ctx.play('boom');
    ctx.shake(26);
    ctx.postfx.flash('#fff1d0', 0.7);
    ctx.postfx.pulse({ bloom: 1.5, aberration: 1 });
    ctx.effects.ring(target, { radius: TEAPOT_RADIUS * 1.25, color: '#ffe1a0', duration: 0.7, thickness: 0.2 });
    ctx.effects.ring(target, { radius: TEAPOT_RADIUS * 0.8, color: '#ffffff', duration: 0.45 });
    ctx.particles.burst(target, { count: 90, colors: TEA, speed: 420, up: 260, size: 3.2, height: 6, life: 0.9 });
    ctx.effects.pool(target, { radius: 150, dps: 4, duration: 4.5, color: '#c98a2b', opacity: 0.45, particleColors: ['#ffffff', '#f3d29a'] });

    const damage = Math.round(TEAPOT_DAMAGE * ctx.player.stats.ultimatePower);
    for (const enemy of ctx.aliveEnemies()) {
      const away = enemy.position.clone().sub(target).setZ(0);
      if (away.length() > TEAPOT_RADIUS + enemy.radius * 0.5) continue;
      ctx.damageEnemy(enemy, damage, away.normalize(), 650, 'ultimate');
    }
  }

  dispose() {
    disposeTree(this.teapot);
    disposeTree(this.shadow);
  }
}

const EFFECTS = { beam: SteepingBeam, storm: ThunderTeaStorm, teapot: GrandTeapotDrop };

/** Fires an ultimate. `ctx` provides the game hooks (see main.js). */
export function startUltimate(id, ctx) {
  return ctx.effects.addEffect(new EFFECTS[id](ctx));
}
