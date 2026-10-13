import * as THREE from 'three';
import { Player } from './Player.js';
import { Ascension, TIERS } from './Ascension.js';

const SMOOTHING = 14; // how quickly the puppet catches up with network positions

/**
 * Another player's Tode in co-op: a puppet driven by the state messages that player sends
 * (position, facing, hop height, health, ascension tier).
 */
export class RemoteTode {
  constructor({ id, name, color }, { scene, particles, effects, hud }) {
    Object.assign(this, { id, name, color, scene, particles, effects, hud });
    this.puppet = new Player();
    this.target = new THREE.Vector3();
    this.alive = true;
    this.tier = 0;
    this.hp = 0;
    this.maxHp = 5;
    this.seen = false;
  }

  async load() {
    await this.puppet.load();
    this.ascension = new Ascension(this.puppet, this.particles, this.effects);
    // A ring in the player's colour, so teammates are easy to tell apart.
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(14, 17, 32),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.ring.position.z = 0.6;
    this.puppet.group.add(this.ring);
    this.scene.add(this.puppet.group);
    this.tag = this.hud.attachNameTag(this.name, this.color);
    this.puppet.group.visible = false;
    return this;
  }

  get position() {
    return this.puppet.position;
  }

  get facing() {
    return this.puppet.facing;
  }

  applyState(state) {
    this.target.set(state.x, state.y, 0);
    if (!this.seen) this.puppet.position.copy(this.target);
    this.seen = true;
    this.puppet.facing.set(Math.cos(state.f), Math.sin(state.f), 0);
    this.puppet.applyFacing();
    this.hop = state.z;
    this.hp = state.hp;
    this.maxHp = state.mh;
    this.alive = !state.down;
    this.puppet.shield = Boolean(state.sh);
    if (state.tier !== this.tier) this.setTier(state.tier);
  }

  setTier(tier) {
    const rising = tier > this.tier;
    this.tier = tier;
    this.ascension?.setTier(tier);
    if (rising && this.seen) {
      // A teammate ascends: a burst of light where they stand.
      this.effects.ring(this.position, { radius: 200, color: '#ffe680', duration: 0.8, thickness: 0.25 });
      this.particles.burst(this.position, { count: 50, colors: ['#ffffff', '#ffe680', '#ffc93c'], speed: 260, up: 180, size: 2.2, glow: true });
      this.hud.showCallout(`${this.name}: ${TIERS[tier].banner}`);
    }
  }

  update(delta) {
    if (!this.ascension) return;
    const visible = this.seen && this.alive;
    this.puppet.group.visible = visible;
    this.puppet.position.lerp(this.target, 1 - Math.exp(-SMOOTHING * delta));
    this.puppet.model.position.z = this.puppet.groundOffset + (this.hop ?? 0);
    this.puppet.adornments.position.z = this.hop ?? 0;
    this.puppet.shieldBubble.visible = this.puppet.shield && visible;
    if (visible) this.ascension.update(delta);
    this.hud.updateNameTag(this.tag, this.position, visible, this.hp, this.maxHp);
  }

  dispose() {
    this.ascension?.clearParts();
    this.puppet.group.removeFromParent();
    this.hud.removeNameTag(this.tag);
  }
}
