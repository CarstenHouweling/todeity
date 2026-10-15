import * as THREE from 'three';
import { Player } from './Player.js';

/**
 * Gardens as a meeting place. In a garden (your own or someone else's) Tode hops around slowly, jumps with Space
 * and can land on other frogs' heads: frogs stack into towers and ride along on each other. Everybody in the same
 * garden sees everybody else (garden rooms in server.js, over the co-op socket).
 *
 * **Inviting:** a frog raises a flag (🚩) and a circle of light spreads around it. Frogs that hop into the circle
 * join its party (the inviter's screen decides who is in, `party` in its state) and press ✋ Ready. When everyone in
 * the party is ready a countdown runs; then the inviter opens a private co-op room, tells the party its code
 * (`go` event), they join, and the run starts (main.js: `startPartyRun`, `hostStartCoop`).
 *
 * State message (12 a second): { x, y, z (standing height), h (hop), f (facing), i (inviting), r (ready),
 * p (party ids, inviters only), c (countdown seconds, inviters only) }.
 */
export const INVITE_RADIUS = 95;
const WALK_SPEED = 105; // a gentle hop, slower than in a fight
const ACCELERATION = 10;
const HOP_LENGTH = 22;
const HOP_HEIGHT = 6;
const JUMP_SPEED = 300;
const GRAVITY = 950;
const FROG_RADIUS = 12; // frogs bump into each other on the same level
const STAND_RADIUS = 15; // how far off a frog's middle you can still stand on its head
const WALK_LIMIT = 330; // how far from the middle of the garden frogs may hop
const SEND_EVERY = 1 / 12;
const COUNTDOWN = 4;
const PARTY_MAX = 3; // plus the inviter: four frogs, like a co-op room
const SMOOTHING = 12;

/** Another player's frog in the garden. */
class GardenFrog {
  constructor({ id, name, cls, color }, { scene, hud }) {
    Object.assign(this, { id, name, color, hud });
    this.puppet = new Player();
    this.puppet.setClass(cls ?? 'tode');
    this.puppet.rig.inPlace = true;
    this.target = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.z = 0;
    this.targetZ = 0;
    this.hop = 0;
    this.last = new THREE.Vector3();
    this.state = {};
    this.seen = false;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(13, 16, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.position.z = 0.6;
    this.puppet.group.add(this.ring);
    this.circle = inviteCircle(color);
    scene.add(this.puppet.group, this.circle);
    this.label = hud.attachWorldLabel('', color);
    this.puppet.group.visible = false;
  }

  apply(state) {
    this.state = state;
    this.target.set(state.x, state.y, 0);
    this.targetZ = state.z ?? 0;
    if (!this.seen) {
      this.position.copy(this.target);
      this.z = this.targetZ;
    }
    this.seen = true;
    this.hop = state.h ?? 0;
    this.puppet.facing.set(Math.cos(state.f ?? 0), Math.sin(state.f ?? 0), 0);
    this.puppet.applyFacing();
  }

  update(delta, time, partyLabel) {
    this.last.copy(this.position);
    const k = 1 - Math.exp(-SMOOTHING * delta);
    this.position.lerp(this.target, k);
    this.z += (this.targetZ - this.z) * k;
    const group = this.puppet.group;
    group.visible = this.seen;
    group.position.set(this.position.x, this.position.y, this.z);
    this.puppet.model.position.z = this.puppet.groundOffset + this.hop;
    this.puppet.rig.setLocomotion(this.hop / HOP_HEIGHT);
    // An inviting frog waves now and then, so the invitation reads from afar.
    if (this.state.i && (this.waveIn = (this.waveIn ?? 2) - delta) <= 0 && this.hop < 0.5) {
      this.waveIn = 4 + Math.random() * 2;
      this.puppet.rig.play('victory', { once: true });
    }
    this.puppet.animate(delta);
    updateCircle(this.circle, this.position, Boolean(this.state.i), time);
    const html = `${this.state.i ? '🚩 ' : ''}<b style="color:${this.color}">${escape(this.name)}</b>${partyLabel ? ` <small>${partyLabel}</small>` : ''}`;
    this.hud.setWorldLabel(this.label, html);
    this.hud.updateWorldLabel(this.label, new THREE.Vector3(this.position.x, this.position.y, 0), this.z + 44, this.seen);
  }

  dispose() {
    this.puppet.group.removeFromParent();
    this.circle.removeFromParent();
    this.circle.geometry.dispose();
    this.circle.material.dispose();
    this.label.remove();
  }
}

function inviteCircle(color) {
  const circle = new THREE.Mesh(
    new THREE.RingGeometry(INVITE_RADIUS - 4, INVITE_RADIUS, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(INVITE_RADIUS - 4, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  circle.add(fill);
  circle.visible = false;
  return circle;
}

function updateCircle(circle, position, on, time) {
  circle.visible = on;
  if (!on) return;
  circle.position.set(position.x, position.y, 1.2);
  circle.scale.setScalar(1 + 0.025 * Math.sin(time * 3));
  circle.material.opacity = 0.55 + 0.25 * Math.sin(time * 3);
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class GardenHub {
  /** `hooks`: { onChange() (the HUD redraws), onGo(code) (join the party's co-op room), onDecor(decor), onCountdownDone(party) }. */
  constructor({ net, scene, hud, player, particles, play }, hooks = {}) {
    Object.assign(this, { net, scene, hud, player, particles, play, hooks });
    this.code = null;
    this.own = false;
    this.online = false;
    this.frogs = new Map();
    this.myId = null;
    this.active = false;
    this.velocity = new THREE.Vector3();
    this.z = 0;
    this.vz = 0;
    this.hopPhase = 0;
    this.hop = 0;
    this.standingOn = null;
    this.inviting = false;
    this.ready = false;
    this.party = []; // inviting: the frogs in my circle, in the order they came
    this.countdown = null;
    this.sendTimer = 0;
    this.time = 0;
    this.myCircle = inviteCircle('#ffd36b');
    scene.add(this.myCircle);
    this.myLabel = null;
    net.on((message) => this.receive(message));
  }

  /** How many frogs are here, me included. */
  get count() {
    return this.frogs.size + 1;
  }

  /** Enter a garden: `code` (null offline: alone, nothing sent), `own` (your own garden). */
  async enter({ code, own, name, cls, color }) {
    // Stepping back into the same garden (a new name) keeps Tode where he stands.
    const stay = this.active && this.code === code ? this.player.group.position.clone().setZ(0) : null;
    this.leave();
    Object.assign(this, { code, own, active: true, inviting: false, ready: false, party: [], countdown: null, z: 0, vz: 0, standingOn: null });
    this.player.group.position.copy(stay ?? new THREE.Vector3(0, -40, 0));
    this.player.velocity.set(0, 0, 0);
    this.player.rig.inPlace = true;
    this.topHeight = this.measureTop();
    this.myLabel = this.hud.attachWorldLabel('', '#ffd36b');
    if (!code) return;
    try {
      await this.net.connect();
      if (!this.active || this.code !== code) return;
      this.net.send({ t: 'genter', garden: code, name, cls, color });
    } catch {
      this.online = false;
      this.hooks.onChange?.();
    }
  }

  leave() {
    if (this.code && this.net.connected) this.net.send({ t: 'gleave' });
    for (const frog of this.frogs.values()) frog.dispose();
    this.frogs.clear();
    this.myLabel?.remove();
    this.myLabel = null;
    this.myCircle.visible = false;
    Object.assign(this, { active: false, code: null, online: false, myId: null, inviting: false, ready: false, party: [], countdown: null });
    this.player.group.position.set(0, 0, 0);
    this.player.model && (this.player.model.position.z = this.player.groundOffset);
    this.player.rig?.setLocomotion(0);
    this.player.facing.set(0, -1, 0);
    this.player.applyFacing();
  }

  /** The top of a frog's head, where another frog can stand. */
  measureTop() {
    const box = new THREE.Box3().setFromObject(this.player.model);
    return Math.max(18, (box.max.z - box.min.z) * 0.82);
  }

  // --- Network -----------------------------------------------------------------------------------

  receive(message) {
    if (!this.active) return;
    if (message.t === 'gwelcome' && message.garden === this.code) {
      this.online = true;
      this.myId = message.id;
      for (const info of message.frogs) this.addFrog(info);
      this.hooks.onChange?.();
    } else if (message.t === 'gjoin') {
      this.addFrog(message.frog);
      this.play?.('pop');
      this.hooks.onChange?.();
    } else if (message.t === 'gpart') {
      this.frogs.get(message.id)?.dispose();
      this.frogs.delete(message.id);
      this.party = this.party.filter((id) => id !== message.id);
      this.hooks.onChange?.();
    } else if (message.t === 'gstate') {
      this.frogs.get(message.from)?.apply(message.d);
    } else if (message.t === 'gevent') {
      this.event(message.from, message.d);
    } else if (message.t === 'gfull') {
      this.online = false;
      this.hooks.onFull?.();
    } else if (message.t === 'disconnected') {
      this.online = false;
      for (const frog of this.frogs.values()) frog.dispose();
      this.frogs.clear();
      this.hooks.onChange?.();
    }
  }

  addFrog(info) {
    if (info.id === this.myId || this.frogs.has(info.id)) return;
    this.frogs.set(info.id, new GardenFrog(info, { scene: this.scene, hud: this.hud }));
  }

  event(from, data) {
    if (data.k === 'go' && data.party?.includes(this.myId)) {
      // My party sets off: join its co-op room.
      this.hooks.onGo?.(data.code, from);
    } else if (data.k === 'decor' && !this.own) {
      this.hooks.onDecor?.(data.decor); // the owner is redecorating
    } else if (data.k === 'wave') {
      this.frogs.get(from)?.puppet.rig.play('victory', { once: true });
    }
  }

  send(type, data) {
    if (this.online && this.net.connected) this.net.send({ t: type, d: data });
  }

  // --- Inviting and parties ------------------------------------------------------------------------------

  /** The inviter whose party I'm in (from their states), or null. */
  get leader() {
    for (const frog of this.frogs.values()) if (frog.state.i && frog.state.p?.includes(this.myId)) return frog;
    return null;
  }

  toggleInvite() {
    this.inviting = !this.inviting;
    this.ready = false;
    this.party = [];
    this.countdown = null;
    if (this.inviting) {
      this.player.rig.play('victory', { once: true });
      this.send('gevent', { k: 'wave' });
      this.play?.('legendary');
    }
    this.hooks.onChange?.();
  }

  toggleReady() {
    if (!this.leader) return;
    this.ready = !this.ready;
    this.play?.(this.ready ? 'pick' : 'click');
    if (this.ready) this.player.rig.play('victory', { once: true });
    this.hooks.onChange?.();
  }

  /** Inviter: the frogs standing in my circle (the first ones in, at most three) and whether they're ready. */
  updateParty() {
    const me = this.player.group.position;
    const inside = [...this.frogs.values()].filter((frog) => frog.seen && !frog.state.i && Math.hypot(frog.position.x - me.x, frog.position.y - me.y) < INVITE_RADIUS);
    const before = this.party.join();
    this.party = this.party.filter((id) => inside.some((frog) => frog.id === id));
    for (const frog of inside) if (!this.party.includes(frog.id) && this.party.length < PARTY_MAX) this.party.push(frog.id);
    if (this.party.join() !== before) {
      this.play?.('pop');
      this.hooks.onChange?.();
    }
    const members = this.party.map((id) => this.frogs.get(id)).filter(Boolean);
    const allReady = members.length > 0 && members.every((frog) => frog.state.r);
    if (allReady && this.countdown === null) {
      this.countdown = COUNTDOWN;
      this.play?.('charge');
      this.hooks.onChange?.();
    } else if (!allReady && this.countdown !== null) {
      this.countdown = null;
      this.hooks.onChange?.();
    }
  }

  /** Inviter: set off with the ready frogs now (or when the countdown ends). */
  startParty() {
    const ready = this.party.filter((id) => this.frogs.get(id)?.state.r);
    if (!this.inviting || !ready.length) return false;
    this.countdown = null;
    this.hooks.onSetOff?.(ready);
    return true;
  }

  /** Inviter: tell the party where to go (after the co-op room is made). */
  sendGo(code, party) {
    this.send('gevent', { k: 'go', code, party });
  }

  /** Owner: the garden was redecorated. */
  sendDecor(decor) {
    if (this.own) this.send('gevent', { k: 'decor', decor });
  }

  // --- Every frame -------------------------------------------------------------------------------------

  /** `move`: the wanted direction on the ground (unit or zero); `jump`: Space was pressed. */
  update(delta, move, jump, walking) {
    if (!this.active) return;
    this.time += delta;
    const { player } = this;
    const pos = player.group.position;

    // Standing on a frog that moves carries you along.
    const carrier = this.standingOn && this.frogs.get(this.standingOn);
    if (carrier) {
      pos.x += carrier.position.x - carrier.last.x;
      pos.y += carrier.position.y - carrier.last.y;
    }

    // Walking: a gentle hop.
    const wanted = walking ? move : new THREE.Vector3();
    this.velocity.lerp(wanted.clone().multiplyScalar(WALK_SPEED), 1 - Math.exp(-ACCELERATION * delta));
    const step = this.velocity.clone().multiplyScalar(delta);
    pos.x += step.x;
    pos.y += step.y;
    // Frogs on the same level bump each other.
    for (const frog of this.frogs.values()) {
      if (!frog.seen || Math.abs(frog.z - this.z) > this.topHeight * 0.7) continue;
      const dx = pos.x - frog.position.x;
      const dy = pos.y - frog.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance < FROG_RADIUS * 2 && distance > 0.01) {
        pos.x = frog.position.x + (dx / distance) * FROG_RADIUS * 2;
        pos.y = frog.position.y + (dy / distance) * FROG_RADIUS * 2;
      }
    }
    const fromMiddle = Math.hypot(pos.x, pos.y);
    if (fromMiddle > WALK_LIMIT) pos.multiplyScalar(WALK_LIMIT / fromMiddle).setZ(pos.z);

    // Jumping and landing: the ground is the lawn or the head of the highest frog under you.
    let ground = 0;
    let groundFrog = null;
    for (const frog of this.frogs.values()) {
      if (!frog.seen) continue;
      const top = frog.z + this.topHeight;
      if (Math.hypot(pos.x - frog.position.x, pos.y - frog.position.y) < STAND_RADIUS && this.z >= top - 8 && top > ground) {
        ground = top;
        groundFrog = frog.id;
      }
    }
    const grounded = this.z <= ground + 0.5 && this.vz <= 0;
    if (jump && grounded && walking) {
      this.vz = JUMP_SPEED;
      this.play?.('dash');
      player.rig.play('hop', { once: true });
    }
    this.vz -= GRAVITY * delta;
    this.z += this.vz * delta;
    // Land on the lawn, or on a head only when coming down onto it (jumping up through a frog is fine).
    if (this.z <= ground && (this.vz <= 0 || !groundFrog)) {
      if (this.vz < -150) {
        this.particles?.burst(new THREE.Vector3(pos.x, pos.y, ground), { count: 6, colors: ['#d9c9a0', '#c4b48a'], speed: 45, up: 20, size: 1.6, height: 1 });
        if (groundFrog) this.play?.('pop');
      }
      this.z = ground;
      this.vz = 0;
      this.standingOn = groundFrog;
    } else if (this.z > ground + 1) {
      this.standingOn = null;
    }
    pos.z = this.z;

    // The little running hops, and facing where we go.
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed > 8 && this.z <= ground + 0.5) {
      this.hopPhase += ((speed * delta) / HOP_LENGTH) * Math.PI;
      this.hop = Math.abs(Math.sin(this.hopPhase)) * HOP_HEIGHT;
    } else {
      this.hop = Math.max(0, this.hop - 40 * delta);
    }
    if (speed > 8) {
      player.facing.set(this.velocity.x, this.velocity.y, 0).normalize();
      player.applyFacing();
    }
    player.model.position.z = player.groundOffset + this.hop;
    player.adornments.position.z = this.hop;
    player.rig.inPlace = true;
    player.rig.setLocomotion(this.hop / HOP_HEIGHT);

    // Parties. An inviting Tode waves now and then while he stands still.
    if (this.inviting && speed < 8 && (this.waveIn = (this.waveIn ?? 3) - delta) <= 0) {
      this.waveIn = 4 + Math.random() * 2;
      player.rig.play('victory', { once: true });
    }
    if (this.inviting) {
      this.updateParty();
      if (this.countdown !== null) {
        const before = Math.ceil(this.countdown);
        this.countdown -= delta;
        if (Math.ceil(this.countdown) !== before) this.play?.('click');
        if (this.countdown <= 0) this.startParty();
      }
    } else if (this.ready && !this.leader) {
      this.ready = false; // the inviter stopped, or I left the circle
      this.hooks.onChange?.();
    }

    // Everybody else.
    for (const frog of this.frogs.values()) {
      const leader = !frog.state.i && [...this.frogs.values(), null].find((other) => other?.state.i && other.state.p?.includes(frog.id));
      const inMyParty = this.inviting && this.party.includes(frog.id);
      frog.update(delta, this.time, inMyParty || leader ? (frog.state.r ? '✋ ready' : '…') : '');
    }

    // My own circle and label.
    updateCircle(this.myCircle, pos, this.inviting, this.time);
    const status = this.inviting
      ? `🚩 Join me! ${this.party.length + 1}/4${this.countdown !== null ? ` · ${Math.ceil(this.countdown)}` : ''}`
      : this.leader ? (this.ready ? '✋ Ready' : '✋ press Ready') : '';
    if (this.myLabel) {
      this.hud.setWorldLabel(this.myLabel, status ? `<b>${status}</b>` : '');
      this.hud.updateWorldLabel(this.myLabel, new THREE.Vector3(pos.x, pos.y, 0), this.z + 46, Boolean(status));
    }

    // The HUD redraws when anything it shows changes: my party, its readiness, the countdown, who's here.
    const leader = this.leader;
    const key = [this.count, this.online, leader?.id, leader?.state.c, this.party.join(), this.party.map((id) => this.frogs.get(id)?.state.r).join(), this.countdown === null ? '' : Math.ceil(this.countdown)].join('|');
    if (key !== this.statusKey) {
      this.statusKey = key;
      this.hooks.onChange?.();
    }

    // Tell the others (a dozen times a second).
    if ((this.sendTimer -= delta) <= 0) {
      this.sendTimer = SEND_EVERY;
      const angle = Math.atan2(player.facing.y, player.facing.x);
      this.send('gstate', {
        x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(this.z * 10) / 10, h: Math.round(this.hop * 10) / 10, f: Math.round(angle * 100) / 100,
        i: this.inviting ? 1 : 0, r: this.ready ? 1 : 0, ...(this.inviting ? { p: this.party, c: this.countdown === null ? null : Math.ceil(this.countdown) } : {}),
      });
    }
  }
}
