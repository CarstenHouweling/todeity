import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { computeFootprintRadius } from './collision.js';

export const ENEMY_SCALE = 5;
const BASE_HP = 3;
const BASE_SPEED = 55; // units per second

/**
 * Bee types. `hp` and `speed` multiply the base values, `tint` recolours the model.
 * `ranged` bees keep their distance and shoot stingers; the `boss` runs its own attack pattern.
 */
export const ENEMY_TYPES = {
  drone: { name: 'Drone', scale: 5, hp: 1, speed: 1, damage: 1, score: 10 },
  zipper: { name: 'Zipper', scale: 3.8, hp: 0.5, speed: 1.75, damage: 1, score: 10, tint: '#ffe14d' },
  brute: { name: 'Bumble Brute', scale: 8, hp: 4, speed: 0.6, damage: 2, score: 30, tint: '#d9483b', knockback: 0.35 },
  stinger: {
    name: 'Stinger',
    scale: 5,
    hp: 1.2,
    speed: 0.85,
    damage: 1,
    score: 20,
    tint: '#a35cff',
    ranged: { distance: 200, cooldown: 2.2, windup: 0.45, speed: 230 },
  },
  queen: {
    name: 'Queen Buzzbelle',
    scale: 14,
    hp: 40,
    speed: 0.55,
    damage: 1,
    score: 300,
    tint: '#ffc43d',
    knockback: 0.08,
    boss: true,
  },
  // The final boss on the last wave: bigger, faster and meaner than the Queen.
  empress: {
    name: 'Empress Buzzbelle',
    scale: 18,
    hp: 70,
    speed: 0.6,
    damage: 2,
    score: 1000,
    tint: '#c86bff',
    knockback: 0.04,
    boss: true,
    attackDelayScale: 0.7,
  },
};

const FLY_ANIMATION = 'CharacterArmature|Fast_Flying';
const DEATH_ANIMATION = 'CharacterArmature|Death';
const HIT_FLASH_DURATION = 0.12; // seconds
const HIT_FLASH_COLOR = new THREE.Color(0xff5533);
const DEATH_DURATION = 0.8; // seconds
const KNOCKBACK_DAMPING = 7; // how quickly knockback wears off
const BURN_COLOR = new THREE.Color(0xff6a00);
const ICE_COLOR = new THREE.Color(0x66ccff);

const CROWN_LIFT = 7.5; // world units above the head bone

const loader = new GLTFLoader();
const radiusByType = {};

function createCrown() {
  const gold = new THREE.MeshStandardMaterial({
    color: '#ffd23f',
    emissive: '#4a3200',
    metalness: 0.5,
    roughness: 0.35,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const crown = new THREE.Group();
  crown.add(new THREE.Mesh(new THREE.CylinderGeometry(6, 5.2, 3.5, 10, 1, true), gold));
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.5, 4), gold);
    spike.position.set(Math.cos(angle) * 5.6, 3.8, Math.sin(angle) * 5.6);
    crown.add(spike);
  }
  const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), new THREE.MeshStandardMaterial({ color: '#e0245e' }));
  gem.position.set(0, 0.3, 6);
  crown.add(gem);
  crown.rotation.x = Math.PI / 2; // modelled Y-up, the world is Z-up
  crown.traverse((child) => (child.castShadow = true));
  return crown;
}
let template = null;

export async function loadEnemyModel() {
  template = await loader.loadAsync('/models/enemy.glb');
}

export class Enemy {
  constructor(kind = 'drone', { hpScale = 1, speedScale = 1 } = {}) {
    if (!template) throw new Error('Call loadEnemyModel() first');
    const type = ENEMY_TYPES[kind];
    this.kind = kind;
    this.type = type;

    this.group = new THREE.Group();
    const model = SkeletonUtils.clone(template.scene);
    model.scale.setScalar(type.scale);
    model.rotation.x = Math.PI / 2;

    // Own materials per enemy, so a hit flash only lights up the one that got hit.
    const tint = type.tint && new THREE.Color(type.tint);
    this.materials = [];
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.frustumCulled = false; // skinned bounds don't follow the animation
      child.material = child.material.clone();
      if (tint) child.material.color.lerp(tint, 0.55);
      if (child.material.emissive) {
        child.material.userData.baseEmissive = child.material.emissive.clone();
        this.materials.push(child.material);
      }
    });

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    model.position.z = -box.min.z;
    this.height = box.max.z - box.min.z;

    this.model = model;
    this.group.add(model);
    this.radius = radiusByType[kind] ??= computeFootprintRadius(this.group);

    this.hp = this.maxHp = Math.max(1, Math.round(BASE_HP * type.hp * hpScale));
    this.speed = BASE_SPEED * type.speed * speedScale;
    this.damage = type.damage;
    this.knockback = new THREE.Vector3();
    this.flashLeft = 0;
    this.glow = 0; // 0..1 wind-up glow before an attack
    this.glowColor = new THREE.Color(0xffffff);
    this.dying = false;
    this.deathLeft = 0;

    // Status effects
    this.burnLeft = 0; // seconds of burning left
    this.burnDps = 0;
    this.burnTick = 0;
    this.slowLeft = 0;
    this.slow = 0; // 0..1, fraction of speed lost
    this.age = 0;

    // Per-type AI state, used by the game loop.
    this.attackTimer = type.ranged ? type.ranged.cooldown * (0.5 + Math.random()) : 0;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.ai = {};

    this.mixer = new THREE.AnimationMixer(model);
    const flyClip = THREE.AnimationClip.findByName(template.animations, FLY_ANIMATION);
    const deathClip = THREE.AnimationClip.findByName(template.animations, DEATH_ANIMATION);
    if (flyClip) {
      this.flyAction = this.mixer.clipAction(flyClip);
      this.flyAction.time = Math.random() * flyClip.duration;
      this.flyAction.timeScale = type.boss ? 0.7 : 1;
      this.flyAction.play();
    }
    if (deathClip) {
      this.deathAction = this.mixer.clipAction(deathClip);
      this.deathAction.setLoop(THREE.LoopOnce, 1);
      this.deathAction.clampWhenFinished = true;
    }

    // Fit the crown to the animated pose, not the rest pose.
    if (type.boss) {
      this.mixer.update(0);
      this.addCrown();
    }
  }

  /** Puts a crown on the head bone, so it follows the flying animation. */
  addCrown() {
    const head = this.model.getObjectByName('Head');
    if (!head) return;
    this.group.updateMatrixWorld(true);
    const top = head.getWorldPosition(new THREE.Vector3());
    const crown = createCrown();
    const size = this.type.scale / ENEMY_TYPES.queen.scale;
    crown.scale.setScalar(size);
    crown.position.set(top.x, top.y, top.z + CROWN_LIFT * size);
    this.group.add(crown);
    crown.updateMatrixWorld(true);
    head.attach(crown);
  }

  get position() {
    return this.group.position;
  }

  get isGone() {
    return this.dying && this.deathLeft <= 0;
  }

  faceTowards(target) {
    const dx = target.x - this.group.position.x;
    const dy = target.y - this.group.position.y;
    if (dx || dy) this.faceDirection(dx, dy);
  }

  faceDirection(dx, dy) {
    this.model.rotation.y = Math.atan2(dx, -dy);
  }

  /** Movement multiplier from chill/freeze. */
  get speedFactor() {
    return this.slowLeft > 0 ? 1 - this.slow : 1;
  }

  get isFrozen() {
    return this.slowLeft > 0 && this.slow >= 0.95;
  }

  applyBurn(dps, duration) {
    if (this.dying || dps <= 0) return;
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnLeft = Math.max(this.burnLeft, duration);
  }

  applySlow(amount, duration) {
    if (this.dying || amount <= 0) return;
    // Bosses resist being frozen solid.
    const capped = this.type.boss ? Math.min(amount, 0.5) : amount;
    this.slow = Math.max(this.slowLeft > 0 ? this.slow : 0, capped);
    this.slowLeft = Math.max(this.slowLeft, duration);
  }

  /** Returns true when this hit killed the enemy. */
  takeDamage(amount, direction, force) {
    if (this.dying) return false;
    this.hp -= amount;
    this.flashLeft = HIT_FLASH_DURATION;
    if (direction) this.knockback.addScaledVector(direction, force * (this.type.knockback ?? 1));
    if (this.hp > 0) return false;
    this.die();
    return true;
  }

  die() {
    this.dying = true;
    this.glow = 0;
    this.deathLeft = DEATH_DURATION * (this.type.boss ? 2 : 1);
    if (this.deathAction) {
      this.flyAction?.fadeOut(0.1);
      this.deathAction.reset().fadeIn(0.1).play();
    }
  }

  update(delta) {
    this.age += delta;
    this.slowLeft = Math.max(0, this.slowLeft - delta);
    this.burnLeft = Math.max(0, this.burnLeft - delta);
    if (this.burnLeft === 0) this.burnDps = 0;
    // Frozen bees stop flapping.
    this.mixer.update(this.isFrozen ? 0 : delta * this.speedFactor);
    this.knockback.multiplyScalar(Math.exp(-KNOCKBACK_DAMPING * delta));

    this.flashLeft = Math.max(0, this.flashLeft - delta);
    for (const material of this.materials) {
      const emissive = material.emissive.copy(material.userData.baseEmissive);
      if (this.flashLeft > 0) emissive.copy(HIT_FLASH_COLOR);
      else if (this.glow > 0) emissive.lerp(this.glowColor, this.glow);
      else if (this.burnLeft > 0) emissive.lerp(BURN_COLOR, 0.35 + 0.15 * Math.sin(this.age * 25));
      else if (this.slowLeft > 0) emissive.lerp(ICE_COLOR, 0.25 + 0.4 * this.slow);
    }

    if (this.dying) {
      this.deathLeft -= delta;
      const total = DEATH_DURATION * (this.type.boss ? 2 : 1);
      const shrink = THREE.MathUtils.clamp(this.deathLeft / (total * 0.3), 0.01, 1);
      this.group.scale.setScalar(shrink);
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.group.removeFromParent();
    for (const material of this.materials) material.dispose();
  }
}
