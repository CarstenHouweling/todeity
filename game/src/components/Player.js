import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeFootprintRadius } from './collision.js';
import { smoothGeometry, upgradeMaterial } from './Graphics.js';

export const PLAYER_SCALE = 20;

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
};

const ACCELERATION = 18; // how fast velocity reaches the target speed; higher = snappier
const HOP_LENGTH = 26; // distance per little hop while running
const HOP_HEIGHT = 5;
const DASH_HEIGHT = 14;
const LANDING_SPEED = 60; // how fast Tode settles to the ground when stopping
const HIT_INVULNERABILITY = 0.9; // seconds
const SHIELD_INVULNERABILITY = 0.6;
const DASH_GRACE = 0.25; // seconds Tode stays safe after landing, so hopping into a swarm doesn't backfire

const loader = new GLTFLoader();
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
    this.frogMaterials = [];
    this.frogMeshes = []; // { mesh, geometry, material, entry }: the classic look, to switch graphics levels
    this.graphicsLevel = 0;
    this.baseGroundOffset = 0;
    this.groundOffset = 0;
    this.radius = 10;

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

  async load() {
    const gltf = await loader.loadAsync('/models/tode.glb');
    const model = gltf.scene;
    model.scale.setScalar(PLAYER_SCALE);
    model.rotation.x = Math.PI / 2;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      // Own copies, so Tode can turn golden without touching the shared model.
      child.material = child.material.clone();
      const { color, emissive, metalness = 0, roughness = 1 } = child.material;
      const entry = {
        material: child.material,
        base: { color: color.clone(), emissive: emissive?.clone(), metalness, roughness },
      };
      this.frogMaterials.push(entry);
      this.frogMeshes.push({ mesh: child, geometry: child.geometry, material: child.material, entry });
    });

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    this.baseGroundOffset = this.groundOffset = -box.min.z;
    model.position.z = this.groundOffset;

    this.model = model;
    this.group.add(model);
    this.radius = computeFootprintRadius(this.group);
    this.applyFacing();
  }

  get position() {
    return this.group.position;
  }

  /** Classic faceted Tode at level 0; smooth, glossy skin from level 1 on (see Graphics.js). */
  setGraphics(level) {
    if (level === this.graphicsLevel) return;
    this.graphicsLevel = level;
    for (const look of this.frogMeshes) {
      const current = look.mesh.material;
      const next = level === 0 ? look.material : upgradeMaterial(look.material, level);
      next.flatShading = level === 0 && look.material.flatShading;
      // Keep the ascension colours it has right now.
      next.color.copy(current.color);
      next.emissive?.copy(current.emissive);
      if ('metalness' in next) {
        next.metalness = current.metalness;
        next.roughness = current.roughness;
      }
      next.needsUpdate = true;
      if (current !== look.material) current.dispose();
      look.mesh.material = next;
      look.mesh.geometry = level === 0 ? look.geometry : smoothGeometry(look.geometry);
      look.entry.material = next;
    }
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
    if (!this.model) return;
    this.model.scale.setScalar(PLAYER_SCALE * scale);
    this.groundOffset = this.baseGroundOffset * scale;
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

    // Blink while recovering from a hit.
    const visible = this.invulnerableLeft === 0 || Math.floor(this.invulnerableLeft * 14) % 2 === 0;
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
