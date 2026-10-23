import * as THREE from 'three';
import { markEffect } from './Effects.js';
import { buildFrog } from './FrogModels.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_HALF_SIZE } from './Map.js';

/**
 * Ultimates: chosen once per run, charged by fighting (like the God Gauge in Hades)
 * and fired with E / middle mouse. The first three are there from the start; the others unlock with the account
 * level (`unlock.level`, see `ultimateUnlocked`; v0.36). The Daily Brew only offers the first three, so it stays the
 * same run for everyone. `short`: the one line the pick shows on a phone held upright.
 */
export const ULTIMATES = {
  beam: {
    id: 'beam',
    name: 'Steeping Beam',
    icon: '☄️',
    short: 'A colossal beam of boiling tea: sweep the swarm or melt a boss.',
    text: 'Gather your power, then unleash a colossal beam of boiling tea. Sweep it across the swarm, or hold it on a boss and watch it melt.',
  },
  storm: {
    id: 'storm',
    name: 'Thunder Tea Storm',
    icon: '🌩️',
    short: 'The sky turns black and lightning rains down on the bees.',
    text: 'Turn the sky black and call 24 lightning strikes down on the bees.',
  },
  summon: {
    id: 'summon',
    name: 'Summoning: Great Tode',
    icon: '🐸',
    short: 'A giant battle toad stomps, tongue-lashes and body-slams the swarm.',
    text: 'Slam a summoning seal: a colossal battle toad bursts from the smoke, stomps, tongue-lashes the swarm and body-slams it.',
  },
  nova: {
    id: 'nova',
    name: 'Tea Nova',
    icon: '💥',
    short: 'A supernova of golden light blasts the whole arena, three times.',
    unlock: { level: 3 },
    text: 'A pillar of light pours down on you as you draw in every last drop of power. Then you go supernova: a dome of golden light blasts the whole arena, and two echoes race out after it. Nothing can touch you while it builds.',
  },
  starfall: {
    id: 'starfall',
    name: 'Starfall',
    icon: '🌠',
    short: 'Sixty orbs fill the sky, then rain down on every bee.',
    unlock: { level: 6 },
    text: 'Fling sixty orbs of light into the sky. They hang there like a field of stars… then rain down on every bee in sight.',
  },
  tempest: {
    id: 'tempest',
    name: 'Tempest Star',
    icon: '🌀',
    short: 'Hurl a sphere of wind: a lightning tornado hunts the swarm, then bursts.',
    unlock: { level: 9 },
    text: 'Spin a howling sphere of wind with four blades in your palm and hurl it. It bursts into a towering tornado crackling with lightning that hunts down the swarm, shreds everything inside, then explodes.',
  },
  legion: {
    id: 'legion',
    name: 'Frog Legion',
    icon: '👥',
    short: 'Ten copies of you hop into the swarm, spitting away.',
    unlock: { level: 12 },
    text: 'POOF! Ten copies of you burst from the smoke and hop into the swarm, spitting everything they have.',
  },
};

/** The three every frog starts with (and the only ones in the Daily Brew). */
export const STARTING_ULTIMATES = ['beam', 'storm', 'summon'];
/** Whether an account at `level` has unlocked `ultimate`. */
export const ultimateUnlocked = (ultimate, level) => !ultimate.unlock || level >= ultimate.unlock.level;

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
const BEAM_DPS = 30; // against bees, times the wave's toughness (`waveScale`), so it cuts through any wave
// Against a boss: this share of its health per second, whatever the build or wave (×Ultimate Power). Held on a
// moving boss that's ~38% of it (~50% if every tick lands); flat damage took 11% of the Queen and less after her.
const BEAM_BOSS_SHARE = 0.2;
const BEAM_WIDTH = 2; // the beam is enormous
const BEAM_REACH = 24; // half-width that hits, per unit of BEAM_WIDTH (the gold layer and most of the orange glow)

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
    // Additive layers stack: kept dim enough that the beam (and the boss in it) stays readable instead of a white-out.
    this.layers = [
      { mesh: new THREE.Mesh(cylinder, additive('#fff6dc', 0.65)), width: 6 },
      { mesh: new THREE.Mesh(cylinder.clone(), additive('#ffc23a', 0.45)), width: 15 },
      { mesh: new THREE.Mesh(cylinder.clone(), additive('#ff7a1a', 0.16)), width: 28 },
    ];
    for (const { mesh } of this.layers) {
      mesh.visible = false;
      this.group.add(mesh);
    }
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), additive('#fff3c4', 0.6));
    this.group.add(this.orb);
    ctx.scene.add(markEffect(this.group));

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
    this.orb.scale.setScalar(11 * width * BEAM_WIDTH);
    ctx.shake(4);
    ctx.postfx.pulse({ bloom: 0.3, aberration: 0.35 }); // more washed a bright arena out (the Sky Citadel, a high tier)

    this.tick -= delta;
    if (this.tick <= 0) {
      this.tick = 0.1;
      const reach = BEAM_REACH * width * BEAM_WIDTH;
      const power = player.stats.ultimatePower;
      for (const enemy of ctx.aliveEnemies()) {
        const offset = enemy.position.clone().sub(origin).setZ(0);
        const along = offset.dot(this.direction);
        if (along < 0 || along > BEAM_LENGTH) continue;
        const across = offset.addScaledVector(this.direction, -along);
        if (across.length() > reach + enemy.radius) continue;
        if (enemy.type.boss) {
          // The boss melts: a share of its health, with molten tea spraying off where the beam hits.
          ctx.damageEnemy(enemy, Math.round(enemy.maxHp * BEAM_BOSS_SHARE * 0.1 * power), null, 0, 'ultimate', { raw: true, steady: true });
          const hit = origin.clone().addScaledVector(this.direction, Math.max(0, along - enemy.radius * 0.6)).setZ(0);
          ctx.particles.burst(hit, { count: 14, colors: [...GOLD, '#ff8a2a'], speed: 220, up: 160, size: 2.4, height: enemy.height * 0.5, life: 0.5, glow: true });
          ctx.shake(7);
        } else {
          ctx.damageEnemy(enemy, Math.round(BEAM_DPS * 0.1 * power * ctx.waveScale()), across.normalize(), 80, 'ultimate', { steady: true });
        }
      }
    }
    const spot = origin.clone().addScaledVector(this.direction, Math.random() * 600).setZ(0);
    ctx.particles.burst(spot, { count: 3, colors: GOLD, speed: 90, up: 60, height: 12, size: 1.8, glow: true, life: 0.4 });

    return t < BEAM_FIRE;
  }

  show(shown) {
    this.group.visible = shown;
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
    ctx.scene.add(markEffect(this.seal));
    ctx.play('charge');
    ctx.shake(6);
  }

  /**
   * A copy of the player's frog many times its size, with battle-worn reddish skin. The Summoner calls up his own
   * Ancient Pond Toad instead (see FrogModels.js).
   */
  createToad() {
    const { ctx } = this;
    const toad = new THREE.Group();
    const ancient = ctx.player.frogClass === 'summoner';
    let model;
    if (ancient) {
      model = buildFrog('giant').root;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(ctx.player.model.scale.x * 0.85);
      model.position.z = ctx.player.model.position.z;
    } else {
      model = ctx.player.rig?.cloneAtRest() ?? ctx.player.model.clone(); // (at rest: no tongue frozen mid-spit)
    }
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = child.material.clone();
      if (!ancient) {
        child.material.color.lerp(new THREE.Color('#d0704a'), 0.45);
        child.material.emissive?.set('#2a0a00');
      }
      child.castShadow = true;
    });
    model.scale.multiplyScalar(SUMMON_SCALE);
    model.position.z = (model.position.z / ctx.player.model.scale.x) * model.scale.x; // feet on the ground
    model.rotation.y = Math.atan2(Math.cos(this.facing), -Math.sin(this.facing));
    model.visible = true;
    toad.add(model);
    const box = new THREE.Box3().setFromObject(model);
    this.height = box.max.z - box.min.z;
    // The mouth: at the front of the head. The tongue is a curved tube from there to its tip, rebuilt every frame.
    this.mouthForward = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) * 0.42;
    this.mouthHeight = this.height * 0.5;
    this.tongue = new THREE.Group();
    this.tongueMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#ff7a9a', emissive: '#6a1020', roughness: 0.35 }));
    this.tongueTip = new THREE.Mesh(new THREE.SphereGeometry(22, 20, 14), this.tongueMesh.material);
    this.tongue.add(this.tongueMesh, this.tongueTip);
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

  show(shown) {
    this.seal.visible = shown;
    if (this.toad) this.toad.visible = shown && !this.vanished;
  }

  appear() {
    const { ctx, center } = this;
    this.toad = this.createToad();
    this.baseScale = this.toad.children[0].scale.x;
    ctx.scene.add(markEffect(this.toad));
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
    // Shoots out of the mouth, whips across the crowd, snaps back in.
    const reach = Math.sin(Math.min(1, k * 2.2) * Math.PI * 0.5) * (k > 0.78 ? Math.max(0, (1 - k) / 0.22) : 1);
    const whip = THREE.MathUtils.smoothstep(k, 0.15, 0.8);
    const angle = this.sweepCenter + this.sweepSide * (whip * 2 - 1) * 0.6;
    const length = SUMMON_TONGUE_LENGTH * reach;
    const facing = new THREE.Vector3(Math.cos(this.sweepCenter), Math.sin(this.sweepCenter), 0);
    const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const mouth = facing.clone().multiplyScalar(this.mouthForward).setZ(this.mouthHeight);
    const tip = direction.clone().multiplyScalar(this.mouthForward + length).setZ(14 + 30 * (1 - reach));
    // Arcs up out of the mouth, then down onto the bees; it bends against the swing, like a whip.
    const bend = new THREE.Vector3(-direction.y, direction.x, 0).multiplyScalar(-this.sweepSide * length * 0.18);
    const control = mouth.clone().lerp(tip, 0.45).add(bend).setZ(this.mouthHeight + 40 + length * 0.12);
    this.tongue.visible = length > 4;
    this.tongueMesh.geometry.dispose();
    this.tongueMesh.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(mouth, control, tip), 24, 11, 10, false);
    this.tongueTip.position.copy(tip);
    this.tongueTip.scale.setScalar(0.4 + 0.6 * reach);

    // Bees near the tongue get slapped once per sweep.
    const swing = new THREE.Vector3(-direction.y, direction.x, 0).multiplyScalar(this.sweepSide);
    const damage = Math.round(SUMMON_TONGUE_DAMAGE * ctx.player.stats.ultimatePower);
    for (const enemy of ctx.aliveEnemies()) {
      if (this.hits.has(enemy)) continue;
      const offset = enemy.position.clone().sub(center).setZ(0);
      const along = offset.dot(direction);
      if (along < this.mouthForward * 0.5 || along > this.mouthForward + length + 20) continue;
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

// --- The unlockable ultimates (v0.36) ------------------------------------------------------
// Against bees they scale with the wave like the beam (`waveScale`); against a boss a hit takes a share of its
// health (`boss`), so they keep up with any wave and build. Each lands about a third of a boss's health when all
// of it goes into him (the beam ~40–50% held on him). Aiming uses `ctx.seeEnemies` (a teammate's ultimate on my
// screen aims at the bees I see, even though only their own screen deals the damage).

const seeEnemies = (ctx) => (ctx.seeEnemies ?? ctx.aliveEnemies)();
const alive = (enemy) => enemy && !enemy.dying && enemy.hp > 0;

function ultimateHit(ctx, enemy, { bee, boss }, direction = null, force = 0, steady = false) {
  const power = ctx.player.stats.ultimatePower;
  if (enemy.type.boss) ctx.damageEnemy(enemy, Math.max(1, Math.round(enemy.maxHp * boss * power)), null, 0, 'ultimate', { raw: true, steady });
  else ctx.damageEnemy(enemy, Math.max(1, Math.round(bee * power * ctx.waveScale())), direction, force, 'ultimate', { steady });
}

const glowVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }`;
// `swirl` 0: streaks sweeping around a dome, brightest low (the nova); 1: bands spiralling over a ball (the tempest).
const glowFragment = /* glsl */ `
  uniform vec3 color;
  uniform vec3 hot;
  uniform float opacity;
  uniform float time;
  uniform float swirl;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vec3 normal = length(vNormal) > 0.0001 ? normalize(vNormal) : normalize(vView);
    float facing = clamp(abs(dot(normal, normalize(vView))), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.0);
    float angle = atan(vLocal.y, vLocal.x);
    float bands = sin(angle * mix(11.0, 6.0, swirl) + vLocal.z * mix(7.0, 10.0, swirl) - time * mix(6.0, 16.0, swirl)) * 0.5 + 0.5;
    bands = smoothstep(0.55, 1.0, bands);
    float low = mix(1.0 - smoothstep(0.0, 0.45, vLocal.z), 1.0, swirl);
    float alpha = (0.07 + rim * 0.75 + bands * low * 0.35) * opacity;
    gl_FragColor = vec4(mix(color, hot, clamp(rim * 0.8 + bands * low * 0.5, 0.0, 1.0)), clamp(alpha, 0.0, 1.0));
  }`;

function glowMaterial(color, hot, swirl = 0, blending = THREE.AdditiveBlending) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, hot: { value: new THREE.Color(hot) }, opacity: { value: 1 }, time: { value: 0 }, swirl: { value: swirl } },
    vertexShader: glowVertex,
    fragmentShader: glowFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending,
    fog: false,
  });
}

const DUST = ['#d9c9a0', '#b8a47a', '#8a7a6a', '#fff3c4'];

// --- Tea Nova: a supernova of tea light that swells across the arena, twice more in echoes -----------------

// Main front: `bee` × the wave's toughness and `boss` of a boss's health; each echo another `echoBee`/`echoBoss`
// (v0.39.2: a lone boss takes ~40%, was 25%, and bees 105× where they took 45×).
const NOVA = { charge: 1.1, grow: 1.2, echoes: 2, echoGap: 0.42, echoGrow: 0.95, fade: 0.9, bee: 55, boss: 0.2, echoBee: 25, echoBoss: 0.1, force: 1100, rays: 14 };
const PILLAR_HEIGHT = 900;

/** Thin wedges of light from the centre out to radius 1, bright at the centre and fading to nothing (additive). */
function sunburstGeometry(count) {
  const positions = [];
  const colors = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (i % 2) * 0.09;
    const w = i % 2 ? 0.035 : 0.06;
    positions.push(0, 0, 0, Math.cos(a - w), Math.sin(a - w), 0, Math.cos(a + w), Math.sin(a + w), 0);
    colors.push(1, 1, 1, 0, 0, 0, 0, 0, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** An open tube standing on the ground, radius 1 and height 1 (scaled to size). */
const pillarGeometry = (top = 1, bottom = 1) => new THREE.CylinderGeometry(top, bottom, 1, 32, 6, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);

class TeaNova {
  constructor(ctx) {
    this.ctx = ctx;
    this.age = 0;
    this.hit = new Set();
    this.center = ctx.player.position.clone().setZ(0);
    this.reach = MAP_HALF_SIZE * 1.6; // from anywhere in the arena to its far corners
    this.group = new THREE.Group();
    this.core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), additive('#fff3c4', 0.85));
    this.core.position.z = 18;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), glowMaterial('#ffb02e', '#fff6dc'));
    this.dome.visible = false;
    this.disk = new THREE.Mesh(new THREE.CircleGeometry(1, 64), additive('#ffd36b', 0));
    this.disk.position.z = 1;
    // On a bright floor (marble, snow) added light barely shows: everything inside is tinted gold, and the front is a
    // solid band of gold with a dark edge on the ground.
    const plain = (color, opacity, side = THREE.FrontSide) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side, fog: false });
    this.tint = new THREE.Mesh(this.dome.geometry, plain('#ffc94a', 0, THREE.BackSide));
    this.front = new THREE.Mesh(new THREE.RingGeometry(0.955, 1, 160), plain('#ffd36b', 0.85));
    this.edge = new THREE.Mesh(new THREE.RingGeometry(1, 1.02, 160), plain('#7a4a10', 0.5));
    this.front.position.z = this.edge.position.z = 1.5;
    for (const mesh of [this.tint, this.front, this.edge]) mesh.visible = false;
    // The charge: a pillar of light pours down on him from the sky, two sigils close in around him.
    this.pillar = new THREE.Mesh(pillarGeometry(), glowMaterial('#ffc94a', '#ffffff', 1));
    this.pillarCore = new THREE.Mesh(pillarGeometry(), additive('#fff6dc', 0));
    this.sigils = [0.9, 0.82].map((inner, i) => {
      const sigil = new THREE.Mesh(new THREE.RingGeometry(inner, 1, 6 + i * 2, 1), additive(i ? '#fff3c4' : '#ffb02e', 0));
      sigil.position.z = 2 + i;
      return sigil;
    });
    // The burst: a sunburst of rays across the ground, and the echoes that race out after the dome.
    this.rays = new THREE.Mesh(sunburstGeometry(NOVA.rays), new THREE.MeshBasicMaterial({ vertexColors: true, color: '#ffa726', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.rays.position.z = 2.5;
    this.echoes = Array.from({ length: NOVA.echoes }, () => {
      const ring = new THREE.Mesh(this.front.geometry, additive('#ffc94a', 0));
      ring.position.z = 2;
      ring.visible = false;
      return { ring, hit: new Set() };
    });
    this.group.add(this.core, this.dome, this.disk, this.tint, this.front, this.edge, this.pillar, this.pillarCore, this.rays, ...this.sigils, ...this.echoes.map((echo) => echo.ring));
    this.group.position.copy(this.center);
    ctx.scene.add(markEffect(this.group));
    ctx.player.channeling = true;
    // Nothing touches him from the first breath until the dome has swept the arena.
    ctx.player.unstoppableLeft = Math.max(ctx.player.unstoppableLeft, NOVA.charge + NOVA.grow + 0.3);
    ctx.play('beamCharge');
    ctx.play('powerUp');
  }

  update(delta) {
    const { ctx } = this;
    this.age += delta;
    const t = this.age;
    this.dome.material.uniforms.time.value = t;
    this.pillar.material.uniforms.time.value = t;
    if (t < NOVA.charge) {
      // Gathering: light pours into him from above, the sigils close in, the air shakes harder and harder.
      const k = t / NOVA.charge;
      this.center.copy(ctx.player.position).setZ(0);
      this.group.position.copy(this.center);
      this.core.scale.setScalar(3 + k * k * 16 * (1 + 0.08 * Math.sin(t * 50)));
      this.disk.scale.setScalar(40 + k * 60);
      this.disk.material.opacity = 0.35 * k;
      const width = 34 - k * 20 + 2 * Math.sin(t * 40);
      this.pillar.scale.set(width, width, PILLAR_HEIGHT);
      this.pillar.material.uniforms.opacity.value = Math.min(1, k * 2);
      this.pillarCore.scale.set(width * 0.35, width * 0.35, PILLAR_HEIGHT);
      this.pillarCore.material.opacity = 0.7 * k;
      this.sigils.forEach((sigil, i) => {
        sigil.scale.setScalar(260 - k * 170 + i * 40);
        sigil.rotation.z = (i ? -1 : 1) * t * (2 + k * 6);
        sigil.material.opacity = 0.8 * Math.min(1, k * 3);
      });
      ctx.particles.burst(this.center, { count: 5, colors: GOLD, ring: 160 - k * 60, speed: -320, up: 20, gravity: 0, height: 14, life: 0.45, glow: true });
      ctx.particles.burst(this.center, { count: 2, colors: GOLD, ring: width, speed: 0, up: -500, gravity: 0, height: 420, size: 2.4, life: 0.8, glow: true });
      ctx.shake(2 + k * 12);
      ctx.postfx.pulse({ bloom: k * 0.7, aberration: k * 0.6 });
      return true;
    }
    if (!this.burst) {
      this.burst = true;
      ctx.player.channeling = false;
      for (const mesh of [this.dome, this.tint, this.front, this.edge]) mesh.visible = true;
      for (const sigil of this.sigils) sigil.visible = false;
      ctx.play('nova');
      ctx.play('boom');
      ctx.play('sonicBoom');
      ctx.shake(40);
      // (kept below a white-out: the field and the bees must stay readable through the burst)
      ctx.postfx.flash('#ffd98a', 0.3);
      ctx.postfx.pulse({ bloom: 0.8, warp: 1.3, aberration: 1.2 });
      ctx.effects.ring(this.center, { radius: 260, color: '#ffffff', duration: 0.45, thickness: 0.3 });
      ctx.effects.ring(this.center, { radius: 420, color: '#ffd36b', duration: 0.7, thickness: 0.12 });
      ctx.particles.burst(this.center, { count: 90, colors: GOLD, speed: 620, up: 300, size: 3.2, height: 14, life: 1.1, glow: true });
      ctx.particles.burst(this.center, { count: 16, colors: GOLD, speed: 60, up: 900, size: 2.6, height: 20, life: 0.9, glow: true });
    }
    const after = t - NOVA.charge;
    const g = after / NOVA.grow;
    const k = Math.min(1, g);
    const radius = Math.max(30, this.reach * (1 - (1 - k) ** 3));
    const end = NOVA.grow + NOVA.echoGap * NOVA.echoes + NOVA.echoGrow * 0.6;
    const fade = after < end ? 1 - k * 0.35 : Math.max(0, 0.65 * (1 - (after - end) / NOVA.fade));
    this.dome.scale.set(radius, radius, radius * 0.75);
    this.dome.material.uniforms.opacity.value = fade;
    this.core.scale.setScalar(Math.max(0.01, 19 * (1 - k * 2)));
    this.tint.scale.copy(this.dome.scale);
    this.tint.material.opacity = 0.16 * fade;
    for (const ring of [this.front, this.edge]) {
      ring.scale.setScalar(radius);
      ring.visible = g < 1;
    }
    this.front.material.opacity = 0.85 * (1 - k * 0.5);
    this.disk.scale.setScalar(radius);
    this.disk.material.opacity = 0.3 * fade * (1 - k);
    // The pillar flares wide, then thins away into the sky.
    const flare = Math.min(1, after / 0.35);
    const pillarWidth = Math.max(0.01, 14 + Math.sin(flare * Math.PI) * 55);
    this.pillar.scale.set(pillarWidth, pillarWidth, PILLAR_HEIGHT);
    this.pillar.material.uniforms.opacity.value = (1 - flare) * 0.8;
    this.pillarCore.scale.set(pillarWidth * 0.3, pillarWidth * 0.3, PILLAR_HEIGHT);
    this.pillarCore.material.opacity = 0.45 * (1 - flare);
    this.rays.scale.setScalar(radius * 1.05);
    this.rays.rotation.z = after * 0.35;
    this.rays.material.opacity = 0.32 * fade * (0.8 + 0.2 * Math.sin(after * 18));
    if (g < 1) {
      // The wall of light tears up the ground as it passes, and sweeps every bullet and bee away.
      ctx.particles.burst(this.center, { count: 12, colors: DUST, ring: radius, speed: 140, up: 220, size: 3, height: 3, life: 0.9 });
      ctx.particles.burst(this.center, { count: 6, colors: GOLD, ring: radius, speed: 60, up: 320, size: 2.2, height: 6, life: 0.6, glow: true });
      ctx.cancelBullets?.(this.center, radius);
      ctx.shake(12 * (1 - k));
      this.sweep(radius, this.hit, NOVA.bee, NOVA.boss);
    }
    // The echoes: two more fronts of light race out after the dome, each hitting every bee again.
    this.echoes.forEach((echo, i) => {
      const e = (after - NOVA.grow * 0.55 - NOVA.echoGap * i) / NOVA.echoGrow;
      echo.ring.visible = e > 0 && e < 1;
      if (!echo.ring.visible) return;
      if (!echo.started) {
        echo.started = true;
        ctx.play('nova');
        ctx.shake(16);
        ctx.postfx.pulse({ bloom: 0.6, warp: 0.5 });
      }
      const echoRadius = Math.max(20, this.reach * (1 - (1 - e) ** 2));
      echo.ring.scale.setScalar(echoRadius);
      echo.ring.material.opacity = 0.85 * (1 - e * 0.6);
      ctx.particles.burst(this.center, { count: 6, colors: GOLD, ring: echoRadius, speed: 90, up: 260, size: 2.4, height: 4, life: 0.6, glow: true });
      ctx.cancelBullets?.(this.center, echoRadius);
      this.sweep(echoRadius, echo.hit, NOVA.echoBee, NOVA.echoBoss);
    });
    // Afterglow: golden embers drift down over the field.
    if (after > NOVA.grow * 0.5 && fade > 0.1) {
      const spot = this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * radius * 1.2, (Math.random() - 0.5) * radius * 1.2, 0));
      ctx.particles.burst(spot, { count: 2, colors: GOLD, speed: 20, up: -40, gravity: 30, height: 260, size: 2, life: 1.4, glow: true });
    }
    return after < end + NOVA.fade;
  }

  /** Hits every bee inside `radius` that `hit` hasn't seen yet. */
  sweep(radius, hit, bee, boss) {
    const { ctx } = this;
    for (const enemy of ctx.aliveEnemies()) {
      if (hit.has(enemy)) continue;
      const away = enemy.position.clone().sub(this.center).setZ(0);
      if (away.length() > radius + enemy.radius) continue;
      hit.add(enemy);
      ultimateHit(ctx, enemy, { bee, boss }, away.normalize(), NOVA.force);
    }
  }

  show(shown) {
    this.group.visible = shown;
  }

  dispose() {
    this.ctx.player.channeling = false;
    disposeTree(this.group);
  }
}

// --- Starfall: orbs fill the sky, then rain down ------------------------------------------

const STARFALL = { count: 60, rise: 0.8, hover: 0.9, interval: 0.035, speed: 1150, blast: 60, bee: 16, boss: 0.0055, spread: 440, height: [140, 250], reach: 950 };

class Starfall {
  constructor(ctx) {
    this.ctx = ctx;
    this.age = 0;
    const center = ctx.player.position.clone().setZ(0);
    this.orbs = Array.from({ length: STARFALL.count }, (_, i) => {
      // A field of stars over the arena: a sunflower spiral, so they spread evenly.
      const r = Math.sqrt((i + 0.5) / STARFALL.count) * STARFALL.spread;
      const a = i * 2.39996;
      return {
        from: center.clone().setZ(24),
        spot: new THREE.Vector3(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r, THREE.MathUtils.randFloat(...STARFALL.height)),
        position: center.clone().setZ(24),
        delay: Math.random() * 0.25,
        size: 0.7 + Math.random() * 0.6,
        phase: Math.random() * 10,
        done: false,
      };
    });
    const sphere = new THREE.SphereGeometry(1, 12, 8);
    this.cores = new THREE.InstancedMesh(sphere, additive('#fff6dc', 0.95), STARFALL.count);
    this.halos = new THREE.InstancedMesh(sphere, additive('#ffb02e', 0.3), STARFALL.count);
    this.group = new THREE.Group();
    for (const mesh of [this.cores, this.halos]) {
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    ctx.scene.add(markEffect(this.group));
    ctx.play('launch');
    ctx.postfx.pulse({ bloom: 0.5 });
  }

  /** The rain: every orb gets a bee, spread over them all (a boss draws two of every three). */
  aim() {
    const { ctx } = this;
    const here = this.ctx.player.position;
    const bees = seeEnemies(ctx).filter((enemy) => enemy.position.distanceTo(here) < STARFALL.reach);
    const pool = bees.flatMap((enemy) => (enemy.type.boss ? [enemy, enemy, enemy, enemy] : [enemy]));
    const order = [...this.orbs].sort(() => Math.random() - 0.5);
    order.forEach((orb, i) => {
      orb.target = pool.length ? pool[i % pool.length] : null;
      orb.ground = orb.target
        ? orb.target.position.clone()
        : here.clone().add(new THREE.Vector3((Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600, 0));
      orb.fallAt = this.age + i * STARFALL.interval;
    });
    this.ctx.play('whistle');
  }

  impact(orb) {
    const { ctx } = this;
    orb.done = true;
    const at = orb.position.clone().setZ(0);
    ctx.particles.burst(at, { count: 14, colors: GOLD, speed: 220, up: 180, size: 2.2, height: 6, life: 0.55, glow: true });
    ctx.effects.ring(at, { radius: STARFALL.blast * 1.3, color: '#ffd36b', duration: 0.3 });
    ctx.shake(5);
    if ((this.impacts = (this.impacts ?? 0) + 1) % 3 === 1) ctx.play('zap');
    for (const enemy of ctx.aliveEnemies()) {
      const away = enemy.position.clone().sub(at).setZ(0);
      if (away.length() > STARFALL.blast + enemy.radius) continue;
      if (enemy.type.boss && enemy !== orb.target) continue; // a boss takes only the orbs aimed at him
      ultimateHit(ctx, enemy, STARFALL, away.normalize(), 300);
    }
  }

  update(delta) {
    this.age += delta;
    const t = this.age;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const still = new THREE.Quaternion();
    if (t >= STARFALL.rise + STARFALL.hover && !this.raining) {
      this.raining = true;
      this.aim();
    }
    let left = 0;
    this.orbs.forEach((orb, i) => {
      if (!orb.done) left++;
      if (!this.raining || t < orb.fallAt) {
        // Up into the sky, then hanging there, twinkling.
        const k = THREE.MathUtils.clamp((t - orb.delay) / STARFALL.rise, 0, 1);
        const ease = 1 - (1 - k) ** 3;
        orb.position.lerpVectors(orb.from, orb.spot, ease);
        orb.position.z += Math.sin(k * Math.PI) * 60 + (k >= 1 ? Math.sin(t * 3 + orb.phase) * 6 : 0);
      } else if (!orb.done) {
        if (alive(orb.target)) orb.ground.copy(orb.target.position);
        const goal = orb.ground.clone().setZ(alive(orb.target) ? (orb.target.height ?? 20) * 0.4 : 0);
        const step = goal.clone().sub(orb.position);
        const distance = step.length();
        if (distance < STARFALL.speed * delta + 6) {
          orb.position.copy(goal);
          this.impact(orb);
        } else {
          orb.position.addScaledVector(step.divideScalar(distance), STARFALL.speed * delta);
          this.ctx.particles.burst(orb.position, { count: 1, colors: GOLD, speed: 10, up: 0, gravity: 0, size: 2, height: 0, life: 0.3, glow: true });
        }
      }
      const twinkle = orb.done ? 0 : orb.size * (1 + 0.25 * Math.sin(t * 9 + orb.phase));
      matrix.compose(orb.position, still, scale.setScalar(7 * twinkle));
      this.cores.setMatrixAt(i, matrix);
      matrix.compose(orb.position, still, scale.setScalar(18 * twinkle));
      this.halos.setMatrixAt(i, matrix);
    });
    this.cores.instanceMatrix.needsUpdate = true;
    this.halos.instanceMatrix.needsUpdate = true;
    return left > 0;
  }

  show(shown) {
    this.group.visible = shown;
  }

  dispose() {
    this.cores.geometry.dispose();
    this.cores.material.dispose();
    this.halos.material.dispose();
    this.group.removeFromParent();
  }
}

// --- Tempest Star: a bladed sphere of wind, thrown, bursting into a tornado that hunts the swarm ----------------

// Each tick `bee` × the wave's toughness and `boss` of a boss's health; the final burst `burstBee`/`burstBoss`
// (v0.39.2: a lone boss in it takes ~41%, was ~31%; bigger, longer, and it drifts after the crowd).
const TEMPEST = { form: 0.8, speed: 760, minRange: 180, maxRange: 560, grow: 0.3, last: 3.2, collapse: 0.35, radius: 300, tick: 0.1, bee: 9, boss: 0.011, pull: 280, drift: 120, retarget: 0.25, burstBee: 40, burstBoss: 0.06, burstReach: 1.5, bolt: 0.09, funnel: 250 };
const WIND = ['#e8fff8', '#bff3e6', '#8fe0d0', '#fff3c4'];

class TempestStar {
  constructor(ctx) {
    this.ctx = ctx;
    this.age = 0;
    this.tick = 0;
    this.boltIn = 0;
    this.group = new THREE.Group();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), glowMaterial('#7fe0d0', '#ffffff', 1));
    // Four blades of wind around it, spinning flat.
    this.blades = new THREE.Group();
    const blade = new THREE.ConeGeometry(1, 1, 4).rotateZ(-Math.PI / 2).translate(0.5, 0, 0);
    blade.scale(1, 0.22, 0.05);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(blade, additive('#e8fff8', 0.7));
      mesh.rotation.z = (i / 4) * Math.PI * 2;
      this.blades.add(mesh);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 48), additive('#bff3e6', 0.6));
    this.group.add(this.ball, this.blades, this.ring);
    // The storm's cuts: thin arcs of wind slashing in every direction.
    this.cuts = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 4, 24, Math.PI * (0.35 + Math.random() * 0.4)), additive(i % 3 ? '#8fe0d0' : '#e8fff8', 0.35));
      arc.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      arc.userData.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(16);
      arc.userData.size = 0.5 + Math.random() * 0.35;
      this.cuts.add(arc);
    }
    this.cuts.visible = false;
    this.group.add(this.cuts);
    // The tornado on the ground: two funnels of wind spinning against each other, and a wind-carved ring on the floor.
    this.storm = new THREE.Group();
    // The outer funnel is painted, not added: additive layers over the ball washed a bright arena white. The inner one
    // glows.
    this.funnel = new THREE.Mesh(pillarGeometry(0.62, 0.22), glowMaterial('#2f8f86', '#d8fff8', 1, THREE.NormalBlending));
    this.inner = new THREE.Mesh(pillarGeometry(0.38, 0.1), glowMaterial('#1d6b63', '#e8fff8', 1));
    // Only their far, inner side: the near wall swept across half the screen whenever the storm was by the frog.
    this.funnel.material.side = this.inner.material.side = THREE.BackSide;
    this.floor = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 96), additive('#bff3e6', 0));
    this.floor.position.z = 1.5;
    this.storm.add(this.funnel, this.inner, this.floor);
    this.storm.visible = false;
    ctx.scene.add(markEffect(this.group), markEffect(this.storm));
    ctx.player.channeling = true;
    ctx.player.unstoppableLeft = Math.max(ctx.player.unstoppableLeft, TEMPEST.form + 0.3);
    ctx.play('beamCharge');
  }

  /**
   * Where it flies: the thickest crowd within reach, favouring the side he aims at (the spit aims itself, and so
   * does this: on a phone the aim is wherever the stick last pointed); with no bees, toward the aim.
   */
  pickTarget() {
    const { ctx } = this;
    const from = ctx.player.position.clone().setZ(0);
    const toward = ctx.aimGround.clone().sub(from).setZ(0);
    let distance = toward.length();
    if (distance < 20) toward.copy(ctx.player.facing).setZ(0), (distance = 360);
    toward.normalize();
    const bees = seeEnemies(ctx).filter((enemy) => enemy.position.distanceTo(from) < TEMPEST.maxRange + TEMPEST.radius * 0.5);
    let best = null;
    let bestScore = 0;
    for (const enemy of bees) {
      const crowd = bees.reduce((sum, other) => sum + (other.position.distanceTo(enemy.position) < TEMPEST.radius * 0.8 ? (other.type.boss ? 4 : 1) : 0), 0);
      const offset = enemy.position.clone().sub(from).setZ(0);
      const ahead = offset.length() > 1 ? offset.normalize().dot(toward) : 1;
      const score = crowd * (1.25 + 0.5 * ahead);
      if (score > bestScore) [best, bestScore] = [enemy, score];
    }
    if (best) {
      const offset = best.position.clone().sub(from).setZ(0);
      distance = offset.length();
      toward.copy(offset.normalize());
    }
    const range = THREE.MathUtils.clamp(distance, TEMPEST.minRange, TEMPEST.maxRange);
    return this.clampToField(from.addScaledVector(toward, range));
  }

  clampToField(spot) {
    const limit = MAP_HALF_SIZE - 60;
    spot.x = THREE.MathUtils.clamp(spot.x, -limit, limit);
    spot.y = THREE.MathUtils.clamp(spot.y, -limit, limit);
    return spot;
  }

  /** Where the landed storm drifts: after a boss near it, or else to the middle of the bees around it. */
  pickDrift() {
    const near = seeEnemies(this.ctx).filter((enemy) => enemy.position.distanceTo(this.center) < TEMPEST.radius * 2.2);
    const boss = near.find((enemy) => enemy.type.boss);
    this.chasing = Boolean(boss);
    if (boss) return void (this.drift = this.clampToField(boss.position.clone().setZ(0)));
    const sum = new THREE.Vector3();
    for (const enemy of near) sum.add(enemy.position);
    this.drift = near.length ? this.clampToField(sum.divideScalar(near.length).setZ(0)) : null;
  }

  update(delta) {
    const { ctx } = this;
    this.age += delta;
    const t = this.age;
    for (const material of [this.ball.material, this.funnel.material, this.inner.material]) material.uniforms.time.value = t;
    this.blades.rotation.z += delta * (this.landed ? 30 : 18);
    if (t < TEMPEST.form) {
      // Spun up in his hand, above his head: wind howls in from all around.
      const k = t / TEMPEST.form;
      this.group.position.copy(ctx.player.position).setZ(48);
      this.ball.scale.setScalar(4 + k * 12);
      this.blades.scale.setScalar(6 + k * 30);
      this.ring.scale.setScalar(10 + k * 18);
      this.ring.rotation.x = Math.sin(t * 9) * 0.3;
      ctx.particles.burst(ctx.player.position, { count: 4, colors: WIND, ring: 110, speed: -240, up: 40, gravity: 0, height: 40, life: 0.4, glow: true });
      ctx.shake(2 + k * 5);
      ctx.postfx.pulse({ aberration: k * 0.4 });
      return true;
    }
    if (!this.thrown) {
      this.thrown = true;
      ctx.player.channeling = false;
      this.from = this.group.position.clone();
      this.target = this.pickTarget();
      this.flight = Math.max(0.15, this.from.distanceTo(this.target) / TEMPEST.speed);
      this.thrownAt = t;
      ctx.play('dash');
      ctx.play('whistle');
    }
    if (!this.landed) {
      const k = Math.min(1, (t - this.thrownAt) / this.flight);
      this.group.position.lerpVectors(this.from, this.target, k).setZ(48 * (1 - k) + 22 * k);
      ctx.particles.burst(this.group.position, { count: 4, colors: WIND, speed: 40, up: 20, gravity: 0, size: 2.2, height: 0, life: 0.4, glow: true });
      if (k < 1) return true;
      this.landed = true;
      this.landedAt = t;
      this.center = this.target.clone();
      this.cuts.visible = true;
      this.storm.visible = true;
      ctx.play('sonicBoom');
      ctx.play('boom');
      ctx.play('thunder');
      ctx.shake(30);
      ctx.postfx.flash('#bff3e6', 0.3);
      ctx.postfx.pulse({ bloom: 0.4, warp: 1.1, aberration: 1 });
      ctx.effects.ring(this.center, { radius: TEMPEST.radius * 1.6, color: '#e8fff8', duration: 0.5, thickness: 0.25 });
      ctx.particles.burst(this.center, { count: 50, colors: [...WIND, ...DUST], speed: 380, up: 240, size: 2.8, height: 10, life: 0.9 });
    }
    // The storm: it swells, shreds, pulls everything in and hunts the crowd, then collapses and bursts.
    const s = t - this.landedAt;
    const grow = Math.min(1, s / TEMPEST.grow);
    const closing = Math.max(0, (s - TEMPEST.last) / TEMPEST.collapse);
    const radius = TEMPEST.radius * (1 - (1 - grow) ** 2) * (1 - closing * closing) * (1 + 0.04 * Math.sin(t * 40));
    if ((this.retargetIn = (this.retargetIn ?? 0) - delta) <= 0) {
      this.retargetIn = TEMPEST.retarget;
      this.pickDrift();
    }
    if (this.drift) {
      const toward = this.drift.clone().sub(this.center);
      const distance = toward.length();
      const speed = TEMPEST.drift * (this.chasing ? 1.8 : 1); // it hunts a boss down faster
      if (distance > 4) this.center.addScaledVector(toward.divideScalar(distance), Math.min(distance, speed * delta));
    }
    // Landed, it hugs the ground (squashed): a storm as tall as it is wide reached up past the camera when it landed
    // on the camera's side, and its arcs crossed the whole screen.
    this.group.position.copy(this.center).setZ(radius * 0.12);
    this.group.scale.set(1, 1, 0.4);
    this.ball.scale.setScalar(Math.max(0.01, radius));
    this.ball.material.uniforms.opacity.value = 0.18;
    this.blades.scale.setScalar(Math.max(0.01, radius * 1.05));
    for (const blade of this.blades.children) blade.material.opacity = 0.12;
    this.ring.scale.setScalar(Math.max(0.01, radius * 1.15));
    this.ring.rotation.x = 0;
    this.cuts.children.forEach((arc) => {
      arc.rotation.x += arc.userData.spin.x * delta;
      arc.rotation.y += arc.userData.spin.y * delta;
      arc.rotation.z += arc.userData.spin.z * delta;
      arc.scale.setScalar(Math.max(0.01, radius * arc.userData.size));
    });
    // The tornado towers over the storm and leans as it wanders.
    const wobble = Math.sin(t * 2.3) * 0.08;
    this.storm.position.copy(this.center);
    this.funnel.scale.set(Math.max(0.01, radius * 0.95), Math.max(0.01, radius * 0.95), Math.max(0.01, TEMPEST.funnel * grow * (1 - closing)));
    this.funnel.rotation.set(wobble, -wobble, this.funnel.rotation.z + delta * 7);
    this.funnel.material.uniforms.opacity.value = 0.55;
    this.inner.scale.set(Math.max(0.01, radius * 0.9), Math.max(0.01, radius * 0.9), Math.max(0.01, TEMPEST.funnel * 0.85 * grow * (1 - closing)));
    this.inner.rotation.set(-wobble, wobble, this.inner.rotation.z - delta * 11);
    this.inner.material.uniforms.opacity.value = 0.3;
    this.floor.scale.setScalar(Math.max(0.01, radius * 1.2));
    this.floor.rotation.z -= delta * 3;
    this.floor.material.opacity = 0.35 * (1 - closing);
    if (closing > 0 && !this.collapsing) {
      this.collapsing = true;
      ctx.play('nova');
    }
    if (closing >= 1) {
      this.finale();
      return false;
    }
    ctx.shake(6);
    // Debris whirls in and is torn up into the funnel; lightning crackles inside it.
    ctx.particles.burst(this.center, { count: 4, colors: WIND, ring: radius * 0.9, speed: -140, up: 60, gravity: 0, size: 2, height: 10, life: 0.4, glow: true });
    ctx.particles.burst(this.center, { count: 3, colors: DUST, ring: radius * 0.5, speed: -40, up: 260, gravity: -120, size: 2.6, height: 6, life: 0.9 });
    if ((this.boltIn -= delta) <= 0 && radius > 40) {
      this.boltIn = TEMPEST.bolt * (0.6 + Math.random() * 0.8);
      const a = Math.random() * Math.PI * 2;
      const high = this.center.clone().add(new THREE.Vector3(Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.5, 160 + Math.random() * 260));
      const low = this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * radius, (Math.random() - 0.5) * radius, 6));
      ctx.effects.bolt(high, low, { color: '#9ff4ff', width: 2.5, life: 0.16, jitter: 16 });
      if (Math.random() < 0.3) ctx.play('zap');
    }
    ctx.cancelBullets?.(this.center, radius);
    this.tick -= delta;
    if (this.tick <= 0 && radius > 20) {
      this.tick += TEMPEST.tick;
      for (const enemy of ctx.aliveEnemies()) {
        const inward = this.center.clone().sub(enemy.position).setZ(0);
        if (inward.length() > radius + enemy.radius) continue;
        ultimateHit(ctx, enemy, TEMPEST, inward.normalize(), TEMPEST.pull, true);
      }
    }
    return true;
  }

  /** The storm collapses into a point and bursts: a last blast of wind that throws every bee around it away. */
  finale() {
    const { ctx } = this;
    const reach = TEMPEST.radius * TEMPEST.burstReach;
    ctx.play('boom');
    ctx.play('sonicBoom');
    ctx.shake(30);
    ctx.postfx.flash('#bff3e6', 0.3);
    ctx.postfx.pulse({ bloom: 0.5, warp: 1.2, aberration: 1.1 });
    ctx.effects.ring(this.center, { radius: reach, color: '#ffffff', duration: 0.45, thickness: 0.3 });
    ctx.effects.ring(this.center, { radius: reach * 1.25, color: '#8fe0d0', duration: 0.7, thickness: 0.12 });
    ctx.particles.burst(this.center, { count: 80, colors: WIND, speed: 560, up: 220, size: 2.8, height: 20, life: 0.9, glow: true });
    ctx.particles.burst(this.center, { count: 30, colors: DUST, speed: 300, up: 380, size: 3, height: 10, life: 1 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const tip = this.center.clone().add(new THREE.Vector3(Math.cos(a) * reach, Math.sin(a) * reach, 8));
      ctx.effects.bolt(this.center.clone().setZ(30), tip, { color: '#bff3e6', width: 4, life: 0.25, jitter: 20 });
    }
    ctx.cancelBullets?.(this.center, reach);
    for (const enemy of ctx.aliveEnemies()) {
      const away = enemy.position.clone().sub(this.center).setZ(0);
      if (away.length() > reach + enemy.radius) continue;
      ultimateHit(ctx, enemy, { bee: TEMPEST.burstBee, boss: TEMPEST.burstBoss }, away.normalize(), 700);
    }
  }

  show(shown) {
    this.group.visible = shown;
    this.storm.visible = shown && Boolean(this.landed);
  }

  dispose() {
    this.ctx.player.channeling = false;
    disposeTree(this.group);
    disposeTree(this.storm);
  }
}

// --- Frog Legion: copies of Tode pop out of the smoke and fight beside him -------------------------

const LEGION = { count: 10, appear: 0.07, last: 6.5, speed: 260, keep: 150, interval: 0.45, range: 540, shot: 700, bee: 8, boss: 0.0025 };

/**
 * The frog as he looks right now (class, form colours, outfit), baked into one geometry per material in his own
 * space, so ten copies are a few instanced draw calls instead of ten frogs of ~30 meshes each.
 */
function bakeFrog(player) {
  const model = player.rig?.cloneAtRest() ?? player.model.clone();
  model.position.set(0, 0, player.groundOffset ?? 0);
  model.rotation.y = 0; // facing -Y, like Player.applyFacing
  model.updateMatrixWorld(true);
  const groups = new Map();
  model.traverse((child) => {
    if (!child.isMesh || child.isInstancedMesh || child.userData.silhouette || child.userData.formRim) return;
    for (let parent = child; parent; parent = parent.parent) if (!parent.visible) return;
    if (child.material.transparent) return;
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color'].includes(name)) geometry.deleteAttribute(name);
    geometry.morphAttributes = {};
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (!geometry.attributes.color) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
    if (!groups.has(child.material)) groups.set(child.material, []);
    groups.get(child.material).push(geometry);
  });
  return [...groups].map(([material, list]) => {
    const geometry = mergeGeometries(list);
    for (const part of list) part.dispose();
    return { geometry, material };
  });
}

class FrogLegion {
  constructor(ctx) {
    this.ctx = ctx;
    this.age = 0;
    const { player } = ctx;
    const limit = MAP_HALF_SIZE - 40;
    this.frogs = Array.from({ length: LEGION.count }, (_, i) => {
      const angle = (i / LEGION.count) * Math.PI * 2 + Math.random() * 0.3;
      const distance = 90 + Math.random() * 130;
      const position = player.position.clone().add(new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, 0)).setZ(0);
      position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
      position.y = THREE.MathUtils.clamp(position.y, -limit, limit);
      return { position, angle: Math.atan2(Math.cos(angle), -Math.sin(angle)), appearAt: i * LEGION.appear, cool: 0.3 + Math.random() * 0.4, hop: Math.random() * 6, rethink: 0, target: null };
    });
    this.group = new THREE.Group();
    this.parts = bakeFrog(player).map(({ geometry, material }) => {
      const mesh = new THREE.InstancedMesh(geometry, material, LEGION.count);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    });
    // A gold ring under each copy, like Tode's own: a pale frog among bees on pale stones was hard to find.
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(10, 14, 28), additive('#ffd36b', 0.75), LEGION.count);
    this.rings.frustumCulled = false;
    this.group.add(this.rings);
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const part of [...this.parts, this.rings]) for (let i = 0; i < LEGION.count; i++) part.setMatrixAt(i, hidden);
    this.shots = [];
    this.spits = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), additive('#ffe680', 0.95), 160);
    this.spits.frustumCulled = false;
    this.spits.count = 0;
    this.group.add(this.spits);
    ctx.scene.add(markEffect(this.group));
    ctx.play('charge');
  }

  puff(position, count = 26) {
    this.ctx.particles.burst(position, { count, colors: SMOKE, speed: 160, up: 110, size: 5, height: 14, life: 0.8, gravity: -30 });
  }

  update(delta) {
    const { ctx } = this;
    this.age += delta;
    const t = this.age;
    const ending = t >= LEGION.last;
    const bees = seeEnemies(ctx);
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);
    const still = new THREE.Quaternion();
    const limit = MAP_HALF_SIZE - 40;
    this.frogs.forEach((frog, i) => {
      let size = 0;
      if (t >= frog.appearAt && !frog.gone) {
        if (!frog.shown) {
          frog.shown = true;
          this.puff(frog.position);
          if (i % 3 === 0) ctx.play('pop');
        }
        if (ending) {
          frog.gone = true;
          this.puff(frog.position, 30);
        } else {
          const k = Math.min(1, (t - frog.appearAt) / 0.18);
          size = k < 1 ? k * 1.15 : 1;
          // Pick the nearest bee now and then, hop toward it, face it and spit.
          frog.rethink -= delta;
          if (frog.rethink <= 0 || !alive(frog.target)) {
            frog.rethink = 0.5;
            let best = null;
            let bestDistance = Infinity;
            for (const bee of bees) {
              const distance = bee.position.distanceToSquared(frog.position) * (bee.type.boss ? 0.5 : 1);
              if (distance < bestDistance) [best, bestDistance] = [bee, distance];
            }
            frog.target = best;
          }
          let moving = false;
          if (frog.target) {
            const toward = frog.target.position.clone().sub(frog.position).setZ(0);
            const distance = toward.length();
            frog.angle = Math.atan2(toward.x, -toward.y);
            if (distance > LEGION.keep + (frog.target.radius ?? 0)) {
              moving = true;
              frog.position.addScaledVector(toward.divideScalar(distance), Math.min(distance, LEGION.speed * delta));
              frog.position.x = THREE.MathUtils.clamp(frog.position.x, -limit, limit);
              frog.position.y = THREE.MathUtils.clamp(frog.position.y, -limit, limit);
            }
            frog.cool -= delta;
            if (frog.cool <= 0 && distance < LEGION.range && this.shots.length < this.spits.instanceMatrix.count) {
              frog.cool = LEGION.interval * (0.85 + Math.random() * 0.3);
              const facing = new THREE.Vector3(Math.sin(frog.angle), -Math.cos(frog.angle), 0);
              this.shots.push({ position: frog.position.clone().addScaledVector(facing, 14).setZ(16 + frog.position.z), target: frog.target, age: 0 });
              if (i % 4 === 0) ctx.play('spit');
            }
          }
          frog.hop += delta * (moving ? 9 : 3);
          frog.position.z = moving ? Math.abs(Math.sin(frog.hop)) * 16 : Math.abs(Math.sin(frog.hop)) * 2;
        }
      }
      turn.setFromAxisAngle(up, frog.angle);
      matrix.compose(frog.position, turn, scale.setScalar(Math.max(0.0001, size)));
      for (const part of this.parts) part.setMatrixAt(i, matrix);
      matrix.compose(frog.position.clone().setZ(1), still, scale.setScalar(Math.max(0.0001, size * (1 + 0.08 * Math.sin(t * 6 + i)))));
      this.rings.setMatrixAt(i, matrix);
    });
    for (const part of [...this.parts, this.rings]) part.instanceMatrix.needsUpdate = true;
    if (ending && !this.poofed) {
      this.poofed = true;
      ctx.play('pop');
    }

    // Their spits home in on the bee they were aimed at.
    this.shots = this.shots.filter((shot) => {
      shot.age += delta;
      if (shot.age > 1.2) return false;
      const goal = alive(shot.target) ? shot.target.position.clone().setZ((shot.target.height ?? 20) * 0.4) : null;
      if (!goal) return false;
      const step = goal.sub(shot.position);
      const distance = step.length();
      if (distance < LEGION.shot * delta + (shot.target.radius ?? 10)) {
        ctx.particles.burst(shot.position, { count: 5, colors: GOLD, speed: 90, up: 60, size: 1.6, height: 0, life: 0.3, glow: true });
        if (ctx.aliveEnemies().includes(shot.target)) ultimateHit(ctx, shot.target, LEGION, step.normalize(), 120);
        return false;
      }
      shot.position.addScaledVector(step.divideScalar(distance), LEGION.shot * delta);
      return true;
    });
    this.shots.forEach((shot, i) => {
      matrix.compose(shot.position, still, scale.setScalar(4));
      this.spits.setMatrixAt(i, matrix);
    });
    this.spits.count = this.shots.length;
    this.spits.instanceMatrix.needsUpdate = true;
    return t < LEGION.last + 0.4;
  }

  show(shown) {
    this.group.visible = shown;
  }

  dispose() {
    for (const part of this.parts) part.geometry.dispose(); // (the materials are the frog's own)
    this.rings.geometry.dispose();
    this.rings.material.dispose();
    this.spits.geometry.dispose();
    this.spits.material.dispose();
    this.group.removeFromParent();
  }
}

const EFFECTS = { beam: SteepingBeam, storm: ThunderTeaStorm, summon: GreatTodeSummon, nova: TeaNova, starfall: Starfall, tempest: TempestStar, legion: FrogLegion };

/** Fires an ultimate. `ctx` provides the game hooks (see main.js). */
export function startUltimate(id, ctx) {
  return ctx.effects.addEffect(new EFFECTS[id](ctx));
}
