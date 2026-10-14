import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeFootprintRadius } from './collision.js';
import { buildBee, buildNest, buildWard } from './BeeModels.js';

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
    hp: 56,
    speed: 0.55,
    damage: 1,
    score: 300,
    tint: '#ffc43d',
    knockback: 0.08,
    boss: true,
    attackDelayScale: 0.85,
  },
  // The final boss on the last wave: bigger, faster and meaner than the Queen.
  empress: {
    name: 'Empress Buzzbelle',
    scale: 18,
    hp: 105,
    speed: 0.6,
    damage: 2,
    score: 1000,
    tint: '#c86bff',
    knockback: 0.04,
    boss: true,
    attackDelayScale: 0.7,
  },
  // A hive that keeps letting out bees until it is smashed (a side objective).
  nest: { name: 'Wild Hive', scale: 11, hp: 30, speed: 0, damage: 0, score: 150, knockback: 0, structure: true },
  // Raid adds (see BOSS_SCRIPTS in main.js): nurses fly to the boss and heal it; guardians keep it shielded.
  nurse: { name: 'Royal Nurse', scale: 4.5, hp: 2, speed: 0.8, damage: 0, score: 40, tint: '#6dffa8', knockback: 0.6, model: 'zipper', label: '💚 Nurse' },
  guardian: { name: 'Hive Guardian', scale: 10, hp: 12, speed: 0.75, damage: 2, score: 250, tint: '#ffd36b', knockback: 0.15, model: 'brute', label: '🛡 Guardian' },
  // A crystal that keeps a boss's shield up until it is smashed (a raid mechanic, see main.js).
  ward: { name: 'Shield Ward', scale: 9, hp: 7, speed: 0, damage: 0, score: 100, knockback: 0, structure: true, ward: true },
  // Sage Mountain's boss: armoured, fast, and fond of charging.
  shogun: {
    name: 'Hornet Shogun',
    scale: 15,
    hp: 66,
    speed: 0.65,
    damage: 2,
    score: 1400,
    tint: '#b8322a',
    knockback: 0.05,
    boss: true,
    attackDelayScale: 0.85,
  },
  // The Sky Citadel's boss: rings of light and feathered volleys.
  seraph: {
    name: 'Seraph Queen',
    scale: 16,
    hp: 78,
    speed: 0.6,
    damage: 2,
    score: 1800,
    tint: '#fff1b8',
    knockback: 0.05,
    boss: true,
    attackDelayScale: 0.8,
  },
  // The lord of the Underworld: the true final boss.
  beezebub: {
    name: 'Bee-zebub',
    scale: 23,
    hp: 150,
    speed: 0.58,
    damage: 2,
    score: 3000,
    tint: '#2a0606',
    emissive: '#4a0800',
    knockback: 0.02,
    boss: true,
    attackDelayScale: 0.6,
    hellfire: true,
  },
};

/** Elite modifiers: tougher bees with a twist, worth more points. */
export const ELITE_MODS = {
  shielded: { name: 'Shielded', icon: '🛡️', color: '#6fb8ff' }, // takes half damage
  explosive: { name: 'Explosive', icon: '💥', color: '#ff6a3d' }, // explodes when it dies
  splitting: { name: 'Splitting', icon: '🧬', color: '#7ed957' }, // splits into two Zippers
  swift: { name: 'Swift', icon: '⚡', color: '#ffe14d' }, // much faster
  giant: { name: 'Giant', icon: '🗿', color: '#c98a5a' }, // huge and very tough
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
const HITBOX_PER_SCALE = 2.56; // the garden bee's footprint radius per unit of `scale`

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
/** Curved demon horns, modelled Y-up like the crown, with glowing tips. */
function createHorns() {
  const horn = new THREE.MeshStandardMaterial({ color: '#1a0a08', emissive: '#ff2a00', emissiveIntensity: 0.2, roughness: 0.3, metalness: 0.4 });
  const tip = new THREE.MeshBasicMaterial({ color: '#ff6a1a' });
  const horns = new THREE.Group();
  for (const side of [-1, 1]) {
    let x = side * 4;
    let y = 0;
    let angle = side * 0.55; // splayed outward, curling back up
    let radius = 2.6;
    for (let i = 0; i < 6; i++) {
      const length = 3.6;
      const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.78, radius, length + 0.4, 10), i === 5 ? tip : horn);
      segment.position.set(x + Math.sin(angle) * length * 0.5, y + Math.cos(angle) * length * 0.5, 0);
      segment.rotation.z = -angle;
      horns.add(segment);
      x += Math.sin(angle) * length;
      y += Math.cos(angle) * length;
      angle -= side * 0.28;
      radius *= 0.8;
    }
  }
  horns.rotation.x = Math.PI / 2;
  horns.traverse((child) => (child.castShadow = true));
  return horns;
}

let template = null;
let graphicsLevel = 0;
let baseColors = null; // vertex colours of the merged bee, before tinting
const geometryByType = {};

/** Bees spawned from now on use this graphics level (see Graphics.js). */
export function setEnemyGraphics(level) {
  graphicsLevel = level;
}

export async function loadEnemyModel() {
  template = await loader.loadAsync('/models/enemy.glb');
  mergeBeeParts(template.scene);
}

/**
 * The bee model comes as 7 skinned meshes that differ only in colour. Merged into one mesh with vertex colours,
 * a bee costs 1 draw call (+1 for its shadow) and 1 skeleton update instead of 7 each.
 */
function mergeBeeParts(root) {
  const parts = [];
  root.traverse((child) => child.isSkinnedMesh && parts.push(child));
  if (parts.length < 2) return;
  const geometries = parts.map((part) => {
    const geometry = part.geometry.clone();
    const { count } = geometry.attributes.position;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) part.material.color.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  const geometry = mergeGeometries(geometries);
  if (!geometry) return; // incompatible parts: keep the original meshes
  const [first] = parts;
  const material = first.material.clone();
  material.color.set(0xffffff);
  material.vertexColors = true;
  const bee = new THREE.SkinnedMesh(geometry, material);
  bee.name = 'Bee';
  first.parent.add(bee);
  bee.bind(first.skeleton, first.bindMatrix);
  for (const part of parts) part.removeFromParent();
  baseColors = geometry.attributes.color.array.slice();
}

/** The merged bee geometry recoloured toward a type's tint (shared by every bee of that type). */
function beeGeometry(kind, geometry) {
  const tint = ENEMY_TYPES[kind].tint;
  if (!tint || !baseColors) return geometry;
  if (!geometryByType[kind]) {
    const tinted = geometry.clone();
    const color = new THREE.Color();
    const target = new THREE.Color(tint);
    const colors = tinted.attributes.color.array;
    for (let i = 0; i < colors.length; i += 3) color.fromArray(baseColors, i).lerp(target, 0.55).toArray(colors, i);
    geometryByType[kind] = tinted;
  }
  return geometryByType[kind];
}

export class Enemy {
  constructor(kind = 'drone', { hpScale = 1, speedScale = 1, elite = null } = {}) {
    if (!template) throw new Error('Call loadEnemyModel() first');
    const type = ENEMY_TYPES[kind];
    this.kind = kind;
    this.type = type;

    this.group = new THREE.Group();
    this.elite = elite && ELITE_MODS[elite];
    this.eliteId = elite;
    const size = elite === 'giant' ? 1.6 : elite ? 1.2 : 1;
    // Own materials per enemy, so a hit flash only lights up the one that got hit.
    this.materials = [];
    let model;
    if (type.ward) {
      this.rig = buildWard(graphicsLevel);
      model = this.rig.root;
      model.scale.setScalar(type.scale / ENEMY_TYPES.drone.scale);
      this.materials.push(...this.rig.materials);
    } else if (type.structure) {
      this.rig = buildNest(graphicsLevel);
      model = this.rig.root;
      model.scale.setScalar(type.scale / ENEMY_TYPES.drone.scale);
      this.materials.push(...this.rig.materials);
    } else if (graphicsLevel > 0) {
      // A new species for every arena after the garden (see BeeModels.js).
      this.rig = buildBee(type.model ?? kind, graphicsLevel);
      model = this.rig.root;
      model.scale.setScalar((type.scale / ENEMY_TYPES.drone.scale) * size);
      this.materials.push(...this.rig.materials);
    } else {
      model = SkeletonUtils.clone(template.scene);
      model.scale.setScalar(type.scale * size);
      const tint = type.tint && new THREE.Color(type.tint);
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.frustumCulled = false; // skinned bounds don't follow the animation
        child.material = child.material.clone();
        if (child.material.vertexColors) child.geometry = beeGeometry(kind, child.geometry);
        else if (tint) child.material.color.lerp(tint, 0.55);
        if (child.material.emissive) this.materials.push(child.material);
      });
    }
    model.rotation.x = Math.PI / 2;
    for (const material of this.materials) {
      if (type.emissive) material.emissive.set(type.emissive);
      material.userData.baseEmissive = material.emissive.clone();
    }

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    model.position.z = -box.min.z;
    this.height = box.max.z - box.min.z;

    this.model = model;
    this.group.add(model);
    // Cached per kind at normal size (the first bee of a kind may be an enlarged elite). The arena species keep
    // the garden bee's hitbox, so balance doesn't change with the looks.
    this.radius = this.rig
      ? HITBOX_PER_SCALE * type.scale * size
      : (radiusByType[kind] ??= computeFootprintRadius(this.group) / size) * size;

    const eliteHp = elite === 'giant' ? 4 : elite ? 2.5 : 1;
    this.hp = this.maxHp = Math.max(1, Math.round(BASE_HP * type.hp * hpScale * eliteHp));
    this.speed = BASE_SPEED * type.speed * speedScale * (elite === 'swift' ? 1.6 : 1);
    this.score = type.score * (elite ? 3 : 1);
    if (this.elite) {
      // A glowing ring under elite bees, in the colour of their modifier.
      this.eliteRing = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 1, 32),
        new THREE.MeshBasicMaterial({ color: this.elite.color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      this.eliteRing.scale.setScalar(this.radius * 1.3);
      this.eliteRing.position.z = 0.8;
      this.group.add(this.eliteRing);
    }
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
    const clips = this.rig ? [] : template.animations;
    const flyClip = THREE.AnimationClip.findByName(clips, FLY_ANIMATION);
    const deathClip = THREE.AnimationClip.findByName(clips, DEATH_ANIMATION);
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

    // Fit the crown to the animated pose, not the rest pose. (Arena species wear their own regalia.)
    if (type.boss && !this.rig) {
      this.mixer.update(0);
      this.addCrown();
    }
  }

  /** Puts a crown (or Bee-zebub's horns) on the head bone, so it follows the flying animation. */
  addCrown() {
    const head = this.model.getObjectByName('Head');
    if (!head) return;
    this.group.updateMatrixWorld(true);
    const top = head.getWorldPosition(new THREE.Vector3());
    const crown = this.type.hellfire ? createHorns() : createCrown();
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
    this.onStatus?.('burn', dps, duration); // co-op: forward to the host, who owns the bees
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnLeft = Math.max(this.burnLeft, duration);
  }

  applySlow(amount, duration) {
    if (this.dying || amount <= 0) return;
    this.onStatus?.('slow', amount, duration);
    // Bosses resist being frozen solid.
    const capped = this.type.boss ? Math.min(amount, 0.5) : amount;
    this.slow = Math.max(this.slowLeft > 0 ? this.slow : 0, capped);
    this.slowLeft = Math.max(this.slowLeft, duration);
  }

  /** Returns true when this hit killed the enemy. */
  takeDamage(amount, direction, force) {
    if (this.dying) return false;
    if (this.elite === ELITE_MODS.shielded) amount = Math.ceil(amount / 2);
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
    if (this.rig) this.rig.animate(this.age, delta, this);
    else this.mixer.update(this.isFrozen ? 0 : delta * this.speedFactor);
    this.knockback.multiplyScalar(Math.exp(-KNOCKBACK_DAMPING * delta));

    if (this.eliteRing) {
      this.eliteRing.material.opacity = 0.45 + 0.3 * Math.sin(this.age * 6);
      this.eliteRing.rotation.z += delta;
    }
    if (this.shieldBubble) {
      this.shieldBubble.rotation.z += delta * 0.4;
      this.shieldBubble.rotation.x = Math.sin(this.age * 0.7) * 0.3;
      this.shieldBubble.children[0].material.opacity = 0.16 + 0.06 * Math.sin(this.age * 5);
    }
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

  /** A boss's shield: a shimmering bubble while `on` (the boss takes no damage, see main.js). */
  setShield(on) {
    this.shielded = Boolean(on);
    if (on && !this.shieldBubble) {
      const size = Math.max(this.radius * 1.5, this.height * 0.75);
      const bubble = new THREE.Group();
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(size, 32, 20),
        new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      const lattice = new THREE.Mesh(
        new THREE.IcosahedronGeometry(size * 1.01, 2),
        new THREE.MeshBasicMaterial({ color: '#bff0ff', wireframe: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      bubble.add(shell, lattice);
      bubble.position.z = this.height * 0.5;
      this.shieldBubble = bubble;
      this.group.add(bubble);
    } else if (!on && this.shieldBubble) {
      this.shieldBubble.removeFromParent();
      for (const mesh of this.shieldBubble.children) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      this.shieldBubble = null;
    }
  }

  dispose() {
    this.setShield(false);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.group.removeFromParent();
    this.group.traverse((child) => {
      // Each cloned skeleton owns a bone texture on the GPU; the bee geometry is shared and stays.
      if (child.isSkinnedMesh) child.skeleton.dispose();
      else if (child.isMesh && !child.userData.shared && !child.userData.keepGeometry) {
        child.geometry.dispose(); // crown and elite ring
        child.material.dispose();
      }
    });
    for (const material of this.materials) material.dispose();
  }
}
