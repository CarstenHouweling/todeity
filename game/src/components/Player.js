import * as THREE from 'three';
import { upgradeMaterial } from './Graphics.js';
import { buildFrog } from './FrogModels.js';

// The frogs of FrogModels.js are built about 25 units tall; at this size they match the original glTF Tode.
export const FROG_SCALE = 0.65;
// Tode's footprint (measured on the original model), the same for every class so balance doesn't change.
const PLAYER_RADIUS = 17;
const FROG_GROUND = 0.8; // the toes reach a little below the frog's origin

// Base stats for a fresh run. Brews modify the player's copy of these.
export const BASE_STATS = {
  maxHp: 5,
  moveSpeed: 170,
  damageMultiplier: 1,
  critChance: 0.05,
  critMultiplier: 2, // critical hits deal double damage
  magnet: 75, // range at which tea leaves fly to Tode
  leafValue: 1,
  swarmScale: 1, // bees per wave (the Swarm Horn curse)

  // Spit (left mouse)
  spitDamage: 1,
  spitCooldown: 0.25,
  spitSpeed: 520,
  spitRange: 380,
  spitCount: 1, // projectiles per shot
  spitSpread: 0.18, // radians between projectiles
  spitPierce: 0, // extra bees a projectile passes through
  spitBurst: 0, // damage of the burst when spit hits
  burstRadius: 35,
  spitSlow: 0, // chill on hit (0..1)
  spitBurn: 0, // burning damage per second on hit
  spitChain: 0, // lightning jumps on hit
  spitSplit: false, // split into 3 on hit
  boltEvery: 0, // every Nth spit is a chain-lightning bolt
  spitHealEvery: 0, // heal a heart every N spit hits

  // Tea bomb (thrown by itself at the thickest crowd): explodes into a splash that also washes away stingers
  splashDamage: 8,
  splashRadius: 100,
  splashCooldown: 2.2, // seconds per charge
  bombCharges: 2,
  splashKnockback: 420,
  splashBurn: 0,
  splashSlow: 0,
  splashBolts: 0, // lightning bolts called by each splash
  lavaPool: 0, // damage per second of the lava pool it leaves

  // Hop dash (Space / Shift / right mouse): Tode can't be hurt mid-hop and bumps bees aside
  dashSpeed: 800,
  dashDuration: 0.22,
  dashCooldown: 1,
  dashCharges: 1,
  dashDamage: 2, // damage to bees Tode dashes through
  landingSplash: 0, // strength of the splash released when a dash lands
  steamTrail: false,
  freezeDash: 0, // shatter damage of bees frozen by dashing through them
  dashHealEvery: 0,

  // Life
  honeyEvery: 0, // heal a heart every N kills
  revives: 0,
  reviveHp: 2,
  shieldEvery: 0, // seconds for the petal shield to regrow
  regenEvery: 0, // seconds per regrown heart
  waveHeal: 1, // hearts restored by clearing a wave
  healNova: 0, // damage of the nova released by healing
  hitStorm: 0, // lightning bolts called when hit

  // Lightning & ultimate
  orbitLeaves: 0,
  stormCloud: 0, // damage of each storm-cloud strike
  lightningFreeze: false,
  gaugeRate: 1,
  ultimatePower: 1,

  // Class mechanics (see Classes.js)
  dashKnockback: 1, // how hard the hop-dash shoves bees
  skillCooldown: 1, // multiplies skill cooldowns
  spitHoming: 0, // spit steers toward bees (the Mage's bolts)
  spitStyle: null, // how the spit looks: null (Tode's), 'pellet', 'dart', 'bolt', 'fireball', 'potion' (lobbed), 'axe' or 'star'
  bombElements: false, // every tea bomb gets a random element (the Alchemist)
  companions: 0, // little pond toads at Tode's side (the Summoner)
  dashDecoy: false, // the hop-dash vanishes in smoke and leaves a decoy (the Ninja)
};

const ACCELERATION = 18; // how fast velocity reaches the target speed; higher = snappier
const HOP_LENGTH = 26; // distance per little hop while running
const HOP_HEIGHT = 5;
const DASH_HEIGHT = 14;
const LANDING_SPEED = 60; // how fast Tode settles to the ground when stopping
const HIT_INVULNERABILITY = 0.9; // seconds
const SHIELD_INVULNERABILITY = 0.6;
const DASH_GRACE = 0.25; // seconds Tode stays safe after landing, so hopping into a swarm doesn't backfire

const targetVelocity = new THREE.Vector3();
const lastPosition = new THREE.Vector3();
const STILL = new THREE.Vector3();

export class Player {
  constructor() {
    this.group = new THREE.Group();
    // Things that hop and turn with Tode: aura, crest, halo, shield bubble.
    this.adornments = new THREE.Group();
    this.group.add(this.adornments);
    this.model = null;
    this.rig = null; // the animated frog (FrogModels.js)
    this.frogClass = null;
    this.frogMaterials = []; // { material (current), original, base }: what ascension tints
    this.frogMeshes = []; // { mesh, entry }: to swap materials between graphics levels
    this.graphicsLevel = 0;
    this.visualScale = 1;
    this.baseGroundOffset = 0;
    this.groundOffset = 0;
    this.radius = PLAYER_RADIUS;

    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(17, 20, 14),
      new THREE.MeshBasicMaterial({ color: '#ff9ec7', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.shieldBubble.position.z = 9;
    this.shieldBubble.visible = false;
    this.adornments.add(this.shieldBubble);

    this.velocity = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, -1, 0);
    this.reset();
  }

  async load(frogClass = 'tode') {
    this.setClass(frogClass);
  }

  /** Builds (or rebuilds) the frog of a class (see Classes.js): its model, materials and animations. */
  setClass(id) {
    if (this.rig && this.frogClass === id) return;
    if (this.model) {
      this.model.removeFromParent();
      this.model.traverse((child) => child.isMesh && !child.userData.shared && child.geometry?.dispose());
      for (const { material, original } of this.frogMaterials) {
        material.dispose();
        if (original !== material) original.dispose();
      }
    }
    this.frogClass = id;
    const rig = buildFrog(id, { ownMaterials: true });
    this.rig = rig;
    const model = rig.root;
    model.rotation.x = Math.PI / 2; // built Y-up, the world is Z-up
    model.traverse((child) => {
      if (child.isMesh) child.castShadow = true;
    });
    this.frogMaterials = rig.materials.map((material) => ({
      material,
      original: material,
      base: { color: material.color.clone(), emissive: material.emissive?.clone(), metalness: material.metalness ?? 0, roughness: material.roughness ?? 1 },
    }));
    this.frogMeshes = [];
    model.traverse((child) => {
      const entry = child.isMesh && this.frogMaterials.find((e) => e.original === child.material);
      if (entry) this.frogMeshes.push({ mesh: child, entry });
    });
    this.model = model;
    this.group.add(model);
    this.radius = PLAYER_RADIUS;
    this.setVisualScale(this.visualScale);
    // Back to the graphics level we were at.
    const level = this.graphicsLevel;
    this.graphicsLevel = 0;
    this.setGraphics(level);
    this.applyFacing();
  }

  /** Runs the frog's animations (every frame, menus and cut-scenes too). */
  animate(delta) {
    this.rig?.update(delta);
  }

  get position() {
    return this.group.position;
  }

  /** The voxel look at level 0; glossier blocks from level 1 on (see Graphics.js). They stay blocky. */
  setGraphics(level) {
    if (level === this.graphicsLevel) return;
    this.graphicsLevel = level;
    for (const entry of this.frogMaterials) {
      const current = entry.material;
      const next = level === 0 ? entry.original : upgradeMaterial(entry.original, level);
      next.flatShading = true;
      next.side = entry.original.side;
      // Keep the ascension colours it has right now.
      next.color.copy(current.color);
      next.emissive?.copy(current.emissive);
      if ('metalness' in next) {
        next.metalness = current.metalness;
        next.roughness = current.roughness;
      }
      next.needsUpdate = true;
      if (current !== entry.original) current.dispose();
      entry.material = next;
    }
    for (const { mesh, entry } of this.frogMeshes) mesh.material = entry.material;
  }

  get isDashing() {
    return this.dash !== null;
  }

  get isInvulnerable() {
    return this.isDashing || this.invulnerableLeft > 0 || this.unstoppableLeft > 0;
  }

  get isDead() {
    return this.hp <= 0;
  }

  /** Grows Tode as he ascends; his aura and crest grow with him. */
  setVisualScale(scale) {
    this.visualScale = scale;
    if (!this.model) return;
    this.model.scale.setScalar(FROG_SCALE * scale);
    this.groundOffset = FROG_GROUND * scale;
    this.adornments.scale.setScalar(scale);
  }

  aimAt(point) {
    const dx = point.x - this.group.position.x;
    const dy = point.y - this.group.position.y;
    if (dx * dx + dy * dy < 1) return;
    this.facing.set(dx, dy, 0).normalize();
    this.applyFacing();
  }

  applyFacing() {
    // The model looks along -Y with no extra rotation; turn it about the up axis.
    const angle = Math.atan2(this.facing.x, -this.facing.y);
    if (this.model) this.model.rotation.y = angle;
    this.adornments.rotation.z = angle;
  }

  /** Dashes along `direction`, or where Tode is facing when standing still. */
  startDash(direction) {
    if (this.dash || this.dashCharges < 1 || this.rooted) return false;
    const dashDirection = direction.lengthSq() > 0 ? direction.clone() : this.facing.clone();
    this.dash = { direction: dashDirection.normalize(), elapsed: 0, hits: new Set() };
    this.rig?.play('dash', { once: true, length: this.stats.dashDuration + 0.25 });
    this.dashCharges--;
    this.dashes++;
    if (this.dashCooldownLeft === 0) this.dashCooldownLeft = this.stats.dashCooldown;
    return true;
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    return this.hp - before;
  }

  /** Returns false (no effect), 'shield' (blocked by the petal shield) or true (hurt). */
  takeDamage(amount) {
    if (this.isInvulnerable || this.isDead) return false;
    if (this.shield) {
      this.shield = false;
      this.shieldTimer = this.stats.shieldEvery;
      this.invulnerableLeft = SHIELD_INVULNERABILITY;
      return 'shield';
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableLeft = HIT_INVULNERABILITY;
    return true;
  }

  revive(hearts) {
    this.hp = Math.min(this.stats.maxHp, hearts);
    this.invulnerableLeft = 2.5;
  }

  /**
   * `moveDirection` is the desired world-space direction (unit length or zero).
   * `move(dx, dy)` applies a displacement while respecting collisions.
   */
  update(delta, moveDirection, move) {
    this.justLanded = false;
    this.invulnerableLeft = Math.max(0, this.invulnerableLeft - delta);
    this.unstoppableLeft = Math.max(0, this.unstoppableLeft - delta);

    // Dash charges come back one at a time.
    if (this.dashCharges < this.stats.dashCharges) {
      this.dashCooldownLeft = Math.max(0, this.dashCooldownLeft - delta);
      if (this.dashCooldownLeft === 0) {
        this.dashCharges++;
        if (this.dashCharges < this.stats.dashCharges) this.dashCooldownLeft = this.stats.dashCooldown;
      }
    } else {
      this.dashCharges = this.stats.dashCharges;
      this.dashCooldownLeft = 0;
    }

    // The petal shield regrows.
    if (this.stats.shieldEvery && !this.shield) {
      this.shieldTimer -= delta;
      if (this.shieldTimer <= 0) this.shield = true;
    }
    this.shieldBubble.visible = this.shield;
    if (this.shield) this.shieldBubble.material.opacity = 0.18 + 0.06 * Math.sin(performance.now() / 200);

    const direction = this.rooted ? STILL : moveDirection;
    let height = 0;
    if (this.dash) {
      this.dash.elapsed += delta;
      const progress = Math.min(1, this.dash.elapsed / this.stats.dashDuration);
      this.velocity.copy(this.dash.direction).multiplyScalar(this.stats.dashSpeed);
      height = Math.sin(progress * Math.PI) * DASH_HEIGHT;
      if (progress >= 1) {
        this.velocity.copy(this.dash.direction).multiplyScalar(this.stats.moveSpeed);
        this.dash = null;
        this.justLanded = true;
        this.unstoppableLeft = Math.max(this.unstoppableLeft, DASH_GRACE);
      }
    } else {
      targetVelocity.copy(direction).multiplyScalar(this.stats.moveSpeed * this.speedFactor * (this.channeling ? 0.45 : 1));
      this.velocity.lerp(targetVelocity, 1 - Math.exp(-ACCELERATION * delta));
    }

    lastPosition.copy(this.group.position);
    move(this.velocity.x * delta, this.velocity.y * delta);
    const moved = lastPosition.distanceTo(this.group.position);

    if (!this.dash && direction.lengthSq() > 0 && moved > 0.05) {
      // Little hops while running, so Tode still moves like a frog.
      this.hopPhase += (moved / HOP_LENGTH) * Math.PI;
      height = Math.abs(Math.sin(this.hopPhase)) * HOP_HEIGHT;
    } else if (!this.dash) {
      this.hopPhase = 0;
      height = Math.max(0, this.model.position.z - this.groundOffset - LANDING_SPEED * delta);
    }
    this.model.position.z = this.groundOffset + height;
    this.adornments.position.z = height;
    // The legs push out behind in every running hop.
    this.rig?.setLocomotion(this.dash || !moved ? 0 : height / HOP_HEIGHT);

    // Blink while recovering from a hit; the Ninja vanishes into smoke while he hops.
    const visible = (this.invulnerableLeft === 0 || Math.floor(this.invulnerableLeft * 14) % 2 === 0) && !(this.dash && this.stats.dashDecoy);
    this.model.visible = visible;
    this.adornments.visible = visible;
  }

  reset() {
    this.stats = { ...BASE_STATS };
    this.hp = this.stats.maxHp;
    this.velocity.set(0, 0, 0);
    this.facing.set(0, -1, 0);
    this.dash = null;
    this.dashes = 0;
    this.dashCharges = this.stats.dashCharges;
    this.dashCooldownLeft = 0;
    this.justLanded = false;
    this.invulnerableLeft = 0;
    this.unstoppableLeft = 0; // can't be hurt, without blinking (while firing the beam)
    this.hopPhase = 0;
    this.rooted = false;
    this.speedFactor = 1; // swimming, rift boosts (set by the game each frame)
    this.channeling = false; // firing the beam: slower, but still moving
    this.shield = false;
    this.shieldTimer = 0;
    // Only update() hides the bubble, and it doesn't run on the title screen or in a garden: a run that ended with
    // the shield up kept it drawn there.
    this.shieldBubble.visible = false;
    this.gauge = 0; // ultimate charge, 0–100
    this.ultimate = null;
    this.group.position.set(0, 0, 0);
    this.group.visible = true;
    this.adornments.position.z = 0;
    if (this.model) {
      this.model.visible = true;
      this.model.position.z = this.groundOffset;
    }
    this.applyFacing();
  }
}
