import * as THREE from 'three';
import { Player } from './Player.js';
import { emoteById } from './Emotes.js';

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
const STEP_UP = 7; // a ledge this low is stepped onto
const BOUNCE = { trampoline: 720, mushrooms: 480 }; // trinkets that throw frogs back up (vertical speed)
const CANNON = { speed: 330, up: 520 };
const BALL = { radius: 9, gravity: 700, restitution: 0.6, friction: 1.6, kick: 260, lift: 170 };
const EMOTE_TIME = 2.6;
const BOOP = { reach: 34, push: 280, hop: 230 };

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
    this.bubble = hud.attachWorldLabel('', color);
    this.bubble.classList.add('emote-bubble');
    this.emote = null;
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
    this.bubble.remove();
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
    this.myBubble = this.hud.attachWorldLabel('', '#ffd36b');
    this.myBubble.classList.add('emote-bubble');
    this.myEmote = null;
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
    this.myBubble?.remove();
    this.myBubble = null;
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
    } else if (data.k === 'emote') {
      const frog = this.frogs.get(from);
      const emote = emoteById(data.id);
      if (frog && emote) frog.emote = this.startEmote(emote, frog.puppet, frog.position, frog.z);
    } else if (data.k === 'ball') {
      // Somebody kicked the ball: everybody takes over where it is and where it flies.
      const item = this.world?.items?.().find((i) => i.id === 'ball');
      if (item && data.p && data.v) item.ball = { p: new THREE.Vector3(...data.p), v: new THREE.Vector3(...data.v), spin: item.ball?.spin ?? 0 };
    } else if (data.k === 'boop' && data.to === this.myId) {
      // Booped: a little shove and a hop.
      this.velocity.set(data.d[0] * BOOP.push, data.d[1] * BOOP.push, 0);
      this.vz = BOOP.hop;
      this.flying = true;
      this.player.rig.play('dash', { once: true });
      this.play?.('pop');
    } else if (data.k === 'fired') {
      this.particles?.burst(new THREE.Vector3(data.x, data.y, 26), { count: 20, colors: ['#ffffff', '#e8f4ff'], speed: 110, up: 70, size: 3, height: 0, life: 0.7 });
      this.play?.('boom');
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

  // --- Emotes, the ball and boops ------------------------------------------------------------------------

  /** Plays one of my emotes (if unlocked: the caller checks) and shows it to everybody. */
  playEmote(id) {
    const emote = emoteById(id);
    if (!emote || !this.active) return;
    const pos = this.player.group.position;
    this.myEmote = this.startEmote(emote, this.player, pos, this.z);
    this.send('gevent', { k: 'emote', id });
    // On the Little Stage an emote gets confetti too.
    if (this.onItem?.id === 'stage') this.particles?.burst(new THREE.Vector3(pos.x, pos.y, this.z), { count: 40, colors: ['#ff9ec7', '#7ed957', '#5fb8ff', '#ffd23f'], speed: 120, up: 200, size: 2, height: 30, life: 1.4 });
  }

  startEmote(emote, frog, position, z) {
    if (emote.move) frog.rig.play(emote.move, { once: true });
    if (emote.burst) this.particles?.burst(new THREE.Vector3(position.x, position.y, z), { count: 30, colors: emote.burst, speed: 110, up: 160, size: 2, height: 20, glow: true, life: 1 });
    return { emote, t: 0 };
  }

  /** Runs an emote on a frog (mine or a puppet): its spin, hops, bubble and particles. */
  updateEmote(state, frog, position, z, delta, bubble) {
    if (!state?.emote) {
      if (bubble?.innerHTML) bubble.innerHTML = '';
      if (bubble) this.hud.updateWorldLabel(bubble, position, 0, false);
      return;
    }
    state.t += delta;
    const { emote } = state;
    const k = state.t / EMOTE_TIME;
    if (emote.spin) frog.model.rotation.y = Math.atan2(frog.facing.x, -frog.facing.y) + Math.min(1, k * 1.4) * emote.spin * Math.PI * 2;
    if (emote.hops && k < 0.85) {
      frog.model.position.z += Math.abs(Math.sin((k / 0.85) * Math.PI * emote.hops)) * 9;
      frog.rig.setLocomotion(1);
    }
    if (emote.burst && Math.floor(state.t * 4) !== Math.floor((state.t - delta) * 4) && state.t < 1.2) {
      this.particles?.burst(new THREE.Vector3(position.x, position.y, z), { count: 6, colors: emote.burst, speed: 60, up: 120, size: 1.6, height: 28, glow: true, life: 0.8 });
    }
    if (bubble) {
      const html = emote.bubble ? `<span>${emote.bubble}</span>` : '';
      if (bubble.innerHTML !== html) bubble.innerHTML = html;
      this.hud.updateWorldLabel(bubble, new THREE.Vector3(position.x, position.y, 0), z + 62 + Math.sin(state.t * 4) * 2, Boolean(emote.bubble));
    }
    if (k >= 1) {
      state.emote = null;
      frog.applyFacing();
    }
  }

  /** Boop the nearest frog in reach: it gets a little shove and a hop (on its own screen). */
  boop() {
    if (!this.active) return false;
    const pos = this.player.group.position;
    let target = null;
    let best = BOOP.reach;
    for (const frog of this.frogs.values()) {
      const d = Math.hypot(frog.position.x - pos.x, frog.position.y - pos.y);
      if (frog.seen && d < best && Math.abs(frog.z - this.z) < 24) [target, best] = [frog, d];
    }
    this.player.rig.play('attack', { once: true });
    if (!target) return false;
    const dx = (target.position.x - pos.x) / (best || 1);
    const dy = (target.position.y - pos.y) / (best || 1);
    this.send('gevent', { k: 'boop', to: target.id, d: [Math.round(dx * 100) / 100, Math.round(dy * 100) / 100] });
    target.puppet.rig.play('dash', { once: true });
    this.particles?.burst(new THREE.Vector3(target.position.x, target.position.y, target.z), { count: 10, colors: ['#ffffff', '#ffd36b'], speed: 90, up: 80, size: 1.8, height: 16, glow: true, life: 0.4 });
    this.play?.('pop');
    return true;
  }

  /** The Tea Ball: rolls, bounces off the house and the fence, and anyone who hops into it kicks it. */
  updateBall(delta, me) {
    const item = this.world?.items?.().find((i) => i.id === 'ball' && !i.fresh);
    if (!item) return;
    const ball = (item.ball ??= { p: new THREE.Vector3(item.x, item.y, 0), v: new THREE.Vector3(), spin: 0 });
    const dx = ball.p.x - me.x;
    const dy = ball.p.y - me.y;
    const distance = Math.hypot(dx, dy);
    if (distance < BALL.radius + FROG_RADIUS && Math.abs(ball.p.z - this.z) < 22 && this.time - (this.kickedAt ?? -9) > 0.25) {
      this.kickedAt = this.time;
      const angle = distance > 0.1 ? Math.atan2(dy, dx) : Math.atan2(this.player.facing.y, this.player.facing.x);
      const speed = BALL.kick + Math.hypot(this.velocity.x, this.velocity.y) * 0.8;
      ball.v.set(Math.cos(angle) * speed, Math.sin(angle) * speed, BALL.lift + (this.vz > 0 ? 140 : 0));
      ball.p.z = Math.max(ball.p.z, 1);
      this.play?.('pop');
      const round = (v) => [Math.round(v.x), Math.round(v.y), Math.round(v.z)];
      this.send('gevent', { k: 'ball', p: round(ball.p), v: round(ball.v) });
    }
    const height = (x, y) => this.world.heightAt(x, y).h;
    ball.v.z -= BALL.gravity * delta;
    const nx = ball.p.x + ball.v.x * delta;
    const ny = ball.p.y + ball.v.y * delta;
    if (height(nx, ny) > ball.p.z + 6) {
      ball.v.x *= -0.6; // off the wall
      ball.v.y *= -0.6;
    } else {
      ball.p.x = nx;
      ball.p.y = ny;
    }
    ball.p.z += ball.v.z * delta;
    const floor = height(ball.p.x, ball.p.y);
    if (ball.p.z <= floor) {
      ball.p.z = floor;
      ball.v.z = ball.v.z < -40 ? -ball.v.z * BALL.restitution : 0;
      const slow = Math.exp(-BALL.friction * delta);
      ball.v.x *= slow;
      ball.v.y *= slow;
    }
    const r = Math.hypot(ball.p.x, ball.p.y);
    if (r > WALK_LIMIT) {
      const nxr = ball.p.x / r;
      const nyr = ball.p.y / r;
      const along = ball.v.x * nxr + ball.v.y * nyr;
      if (along > 0) {
        ball.v.x -= 2 * along * nxr * 0.8;
        ball.v.y -= 2 * along * nyr * 0.8;
      }
      ball.p.x = nxr * WALK_LIMIT;
      ball.p.y = nyr * WALK_LIMIT;
    }
    ball.spin += (Math.hypot(ball.v.x, ball.v.y) * delta) / BALL.radius;
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

    // Walking: a gentle hop. Fired from the cannon or booped, the flight keeps its speed until the landing.
    const wanted = walking && !this.flying ? move : new THREE.Vector3();
    if (!this.flying) this.velocity.lerp(wanted.clone().multiplyScalar(WALK_SPEED), 1 - Math.exp(-ACCELERATION * delta));
    const before = { x: pos.x, y: pos.y };
    pos.x += this.velocity.x * delta;
    pos.y += this.velocity.y * delta;
    // Walls: the house and tall trinkets stop you unless you're up high enough to step onto them.
    const terrain = (x, y) => this.world?.heightAt(x, y) ?? { h: 0, item: null };
    if (terrain(pos.x, pos.y).h > this.z + STEP_UP) {
      if (terrain(pos.x, before.y).h <= this.z + STEP_UP) pos.y = before.y;
      else if (terrain(before.x, pos.y).h <= this.z + STEP_UP) pos.x = before.x;
      else {
        pos.x = before.x;
        pos.y = before.y;
      }
      if (this.flying) this.velocity.multiplyScalar(-0.3); // bonk
    }
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

    // Jumping and landing: the ground is the lawn, the roof or a trinket under you, or the head of a frog.
    const under = terrain(pos.x, pos.y);
    let ground = under.h;
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
    // Land on the ground, or on a head only when coming down onto it (jumping up through a frog is fine).
    if (this.z <= ground && (this.vz <= 0 || !groundFrog)) {
      const falling = this.vz;
      if (falling < -150) {
        this.particles?.burst(new THREE.Vector3(pos.x, pos.y, ground), { count: 6, colors: ['#d9c9a0', '#c4b48a'], speed: 45, up: 20, size: 1.6, height: 1 });
        if (groundFrog) this.play?.('pop');
      }
      this.z = ground;
      this.vz = 0;
      this.flying = false;
      this.standingOn = groundFrog;
      // Bouncy things throw you back up.
      const bounce = !groundFrog && under.item && BOUNCE[under.item.id];
      if (bounce && (falling < -60 || jump)) {
        this.vz = bounce * (jump ? 1.15 : 1);
        this.world?.spring?.(under.item);
        this.play?.('dash');
        player.rig.play('hop', { once: true });
      }
    } else if (this.z > ground + 1) {
      this.standingOn = null;
    }
    pos.z = this.z;
    this.onItem = this.z <= ground + 0.5 && !groundFrog ? under.item : null;

    // The teapot cannon: hop into it and it fires you across the garden, the way its spout points.
    const cannon = this.world?.items?.().find((item) => item.id === 'launcher' && !item.fresh && Math.hypot(item.x - pos.x, item.y - pos.y) < 16);
    if (cannon && this.z < 30 && this.time - (this.firedAt ?? -9) > 1.2 && walking) {
      this.firedAt = this.time;
      this.velocity.set(Math.cos(cannon.r), Math.sin(cannon.r), 0).multiplyScalar(CANNON.speed);
      this.vz = CANNON.up;
      this.z = Math.max(this.z, 26);
      this.flying = true;
      pos.x = cannon.x + Math.cos(cannon.r) * 20;
      pos.y = cannon.y + Math.sin(cannon.r) * 20;
      this.play?.('boom');
      this.particles?.burst(new THREE.Vector3(pos.x, pos.y, 26), { count: 24, colors: ['#ffffff', '#e8f4ff', '#bfe8ff'], speed: 120, up: 80, size: 3, height: 0, life: 0.7 });
      player.rig.play('flip', { once: true });
      this.send('gevent', { k: 'fired', x: Math.round(pos.x), y: Math.round(pos.y) });
    }

    this.updateBall(delta, pos);

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
    this.updateEmote(this.myEmote, player, pos, this.z, delta, this.myBubble);

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
      this.updateEmote(frog.emote, frog.puppet, frog.position, frog.z, delta, frog.bubble);
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

    // Achievements: a tower of three frogs (you on top of one that stands on another, or one on you while you stand
    // on one), and three visitors in your own garden.
    const onMe = [...this.frogs.values()].some((frog) => frog.seen && frog.z > this.z + this.topHeight - 4 && Math.hypot(frog.position.x - pos.x, frog.position.y - pos.y) < STAND_RADIUS + 4);
    if ((carrier && carrier.z > this.topHeight - 4) || (this.standingOn && onMe)) this.hooks.onAchieve?.('tower');
    if (this.own && this.frogs.size >= 3) this.hooks.onAchieve?.('openhouse');

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
