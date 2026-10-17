import * as THREE from 'three';
import { Player } from './Player.js';
import { Ascension } from './Ascension.js';
import { emoteById } from './Emotes.js';
import { cleanOutfit, shownOutfit } from './Wearables.js';
import { GardenFx } from './GardenFx.js';
import { duckMusicFor, groove } from './Sound.js';
import { GardenPond, LeafRush } from './GardenGames.js';

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
 * p (party ids, inviters only), c (countdown seconds, inviters only), e (a looping emote that is playing) }.
 *
 * **Playing together** (v0.24, v0.26): bounce, the cannon, the ball, boops (B): a boop shoves the frog in reach, gives
 * a waving frog a high five, kicks the ball, or pokes the nearest trinket (it wobbles and answers: chimes ring, the
 * duck quacks…). Emotes run as scripts (`EMOTE_FX`): a Ground Pound bounces everyone near, a Power Up's sonic boom
 * pushes them away. Sit still on the bench for a cup of tea. Every frog carries its account level as an aura.
 *
 * **Garden games** (v0.28, GardenGames.js): swimming in the pond, cannonballs, skipping stones, and Leaf Rush.
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
const BOOP = { reach: 34, push: 280, hop: 230, poke: 44 };
const POUND = { up: 560, reach: 130, bounce: 430 }; // Ground Pound: how high, how far the slam bounces frogs
const POWER = { charge: 1.5, end: 6, push: 130 }; // Power Up: the burst (s), back to normal (s), the boom's reach
const REST_AFTER = 0.8; // seconds standing still on the bench before Tode sits down for tea
const HEAR = 340; // other frogs' emotes are heard this close

// A divine form's colours, for the Power Up (index: the tier, see Ascension.js).
const TIER_COLORS = [
  ['#ffffff'],
  ['#ffffff', '#cfefff'],
  ['#ffe680', '#ffb000', '#ffffff'],
  ['#fff3a0', '#ffd36b', '#ffffff'],
  ['#ff6a3a', '#ffd36b', '#ffb000'],
  ['#c8b0ff', '#ffffff', '#9fd8ff'],
];

// What a booped trinket does besides wobbling: a sound, a word or emoji floating up, particles.
const POKES = {
  chimes: { sound: 'chime', emoji: ['🎵', '🎶'], colors: ['#bfe8ff', '#ffffff'] },
  crystal: { sound: 'chime', colors: ['#7ff0d0', '#bfe8ff', '#ffffff'], emoji: ['✨'] },
  duck: { sound: 'quack', word: 'Quack!' },
  gnome: { sound: 'boing', word: 'Boing!' },
  scarebee: { sound: 'boing', spin: true, word: 'Bzzt!' },
  snail: { sound: 'pop', emoji: ['💨'], word: 'Zoom!' },
  lantern: { sound: 'heal', fireflies: true },
  jar: { sound: 'heal', fireflies: true },
  teapot: { sound: 'whistle', steam: true },
  cups: { sound: 'tick', steam: true, emoji: ['☕'] },
  fountain: { sound: 'splash', water: true },
  hive: { sound: 'sting', word: 'Bzz!', colors: ['#ffb000', '#ffd23f'] },
  trophy: { sound: 'pick', colors: ['#ffd36b', '#ffffff'], spin: true },
  idol: { sound: 'legendary', colors: ['#ffd36b', '#fff3a0', '#ffffff'] },
  crown: { sound: 'pick', colors: ['#ffd36b', '#ffffff'], emoji: ['👑'] },
  helm: { sound: 'tick', colors: ['#c8c8d0', '#ffffff'] },
  horns: { sound: 'burn', colors: ['#ff6a3a', '#ffb020'] },
  feather: { sound: 'graze', colors: ['#ffffff', '#ffe9a0'] },
  banner: { sound: 'dash', colors: ['#ff5a7a', '#ffd23f'] },
  bonsai: { sound: 'pop', colors: ['#7ed957', '#c8f77a'] },
  tulips: { sound: 'pop', colors: ['#ff9ec7', '#ff5a7a', '#ffd23f'] },
  mushrooms: { sound: 'boing', colors: ['#c58aff', '#ff9ec7'], emoji: ['🍄'] },
  trampoline: { sound: 'boing' },
  launcher: { sound: 'whistle', steam: true },
  stage: { sound: 'fanfare', colors: ['#ff9ec7', '#7ed957', '#5fb8ff', '#ffd23f'] },
  bench: { sound: 'click', word: 'Sit?' },
};

/** A frog's height (feet to the top of its head): where its aura's halo floats. */
const frogHeight = (player) => {
  const box = new THREE.Box3().setFromObject(player.model);
  return box.max.z - box.min.z;
};

/** Another player's frog in the garden. */
class GardenFrog {
  constructor({ id, name, cls, color, lv, mt, o }, { scene, hud, fx }) {
    Object.assign(this, { id, name, color, hud });
    this.level = Math.max(1, Math.round(Number(lv) || 1));
    this.maxTier = Math.max(0, Math.min(5, Math.round(Number(mt) || 0)));
    this.puppet = new Player();
    this.puppet.setClass(cls ?? 'tode');
    this.outfit = cleanOutfit(o); // what they wear (looks only: their word is enough)
    this.puppet.setOutfit(this.outfit);
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
    this.aura = fx.levelAura(this.level, this.puppet.group, frogHeight(this.puppet));
    const frog = this;
    // What emote scripts work with (the same shape as my own, see GardenHub.me).
    this.actor = {
      own: false,
      frog,
      player: this.puppet,
      get position() {
        return frog.position;
      },
      get z() {
        return frog.z;
      },
    };
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
    this.puppet.setOutfit(shownOutfit(this.outfit, { tier: this.ascension?.tier ?? 0 })); // (a Power Up's crest)
    this.puppet.animate(delta);
    this.ascension?.update(delta); // only while a Power Up shows off a form
    this.aura?.update(delta, group.position, { moving: this.position.distanceToSquared(this.last) > (8 * delta) ** 2, hop: this.hop, visible: this.seen });
    updateCircle(this.circle, this.position, Boolean(this.state.i), time);
    const html = `${this.state.i ? '🚩 ' : ''}<b style="color:${this.color}">${escape(this.name)}</b> <small class="frog-level">Lv ${this.level}</small>${partyLabel ? ` <small>${partyLabel}</small>` : ''}`;
    this.hud.setWorldLabel(this.label, html);
    this.hud.updateWorldLabel(this.label, new THREE.Vector3(this.position.x, this.position.y, 0), this.z + 44, this.seen);
  }

  dispose() {
    this.ascension?.clearParts();
    this.aura?.dispose();
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
  /** `ascension`: my own frog's (main.js), borrowed by the Power Up; `effects` (bolts), `postfx` (flashes). */
  constructor({ net, scene, hud, player, particles, play, effects, ascension, postfx }, hooks = {}) {
    Object.assign(this, { net, scene, hud, player, particles, play, effects, ascension, postfx, hooks });
    this.fx = new GardenFx({ scene, particles });
    const hub = this;
    this.me = {
      own: true,
      player,
      get position() {
        return player.group.position;
      },
      get z() {
        return hub.z;
      },
    };
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
    this.pond = new GardenPond(this);
    this.rush = new LeafRush(this);
    net.on((message) => this.receive(message));
  }

  /** How many frogs are here, me included. */
  get count() {
    return this.frogs.size + 1;
  }

  /**
   * Enter a garden: `code` (null offline: alone, nothing sent), `own` (your own garden), `level` (the account level:
   * my aura), `maxTier` (the highest form reached: what my Power Up shows).
   */
  async enter({ code, own, name, cls, color, level = 1, maxTier = 0, outfit = {} }) {
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
    this.restFor = 0;
    this.identity = { name, cls, color, lv: level, mt: maxTier, o: outfit };
    this.myAura = this.fx.levelAura(level, this.player.group, frogHeight(this.player));
    this.pond.reset();
    if (!code) return;
    try {
      await this.net.connect();
      if (!this.active || this.code !== code) return;
      this.net.send({ t: 'genter', garden: code, ...this.identity });
    } catch {
      this.online = false;
      this.hooks.onChange?.();
    }
  }

  leave() {
    clearTimeout(this.retryTimer);
    if (this.myEmote) this.endEmote(this.myEmote); // (a Power Up gives the form back)
    this.myEmote = null;
    this.pounding = null;
    this.rush.stop();
    this.myAura?.dispose();
    this.myAura = null;
    this.fx.clear();
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
      if (this.own && this.look) this.setLook(this.look); // the newcomer sees my garden as I set it
      this.play?.('pop');
      this.hooks.onChange?.();
    } else if (message.t === 'gpart') {
      this.rush.left(message.id);
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
      this.party = [];
      if (this.rush.round && !this.rush.round.mine) this.rush.stop();
      this.hooks.onChange?.();
      this.reconnect();
    }
  }

  /** Lost the server (a restart for a deploy, a dropped connection): keep trying to get back into this garden. */
  reconnect(delay = 2_000) {
    clearTimeout(this.retryTimer);
    const code = this.code;
    if (!code) return;
    this.retryTimer = setTimeout(async () => {
      if (!this.active || this.code !== code || this.online) return;
      try {
        await this.net.connect();
        if (!this.active || this.code !== code) return;
        this.net.send({ t: 'genter', garden: code, ...this.identity }); // gwelcome brings everyone back
      } catch {
        this.reconnect(Math.min(delay * 1.6, 15_000));
      }
    }, delay * (0.75 + Math.random() * 0.5));
  }

  addFrog(info) {
    if (info.id === this.myId || this.frogs.has(info.id)) return;
    this.frogs.set(info.id, new GardenFrog(info, { scene: this.scene, hud: this.hud, fx: this.fx }));
  }

  event(from, data) {
    if (data.k === 'splash' || data.k === 'skip') return this.pond.event(from, data);
    if (['rush', 'rleaf', 'rgrab', 'rgot', 'rend'].includes(data.k)) return this.rush.event(from, data);
    if (data.k === 'go' && data.party?.includes(this.myId)) {
      // My party sets off: join its co-op room.
      this.hooks.onGo?.(data.code, from);
    } else if (data.k === 'decor' && !this.own) {
      this.hooks.onDecor?.(data.decor); // the owner is redecorating
    } else if (data.k === 'look' && !this.own) {
      this.hooks.onLook?.(data); // the owner switched day or night, or the song
    } else if (data.k === 'wave') {
      this.frogs.get(from)?.puppet.rig.play('victory', { once: true });
    } else if (data.k === 'outfit') {
      const frog = this.frogs.get(from); // changed clothes (no twirl: trying things on is a burst of clicks)
      if (frog) frog.outfit = cleanOutfit(data.o);
    } else if (data.k === 'emote') {
      const frog = this.frogs.get(from);
      const emote = emoteById(data.id);
      if (frog && emote) frog.emote = this.startEmote(emote, frog.actor, data);
    } else if (data.k === 'slam' && Number.isFinite(data.x) && Number.isFinite(data.y)) {
      this.slam(new THREE.Vector3(data.x, data.y, data.z ?? 0), false);
    } else if (data.k === 'five' && data.to === this.myId) {
      const frog = this.frogs.get(from);
      if (frog) this.highFive(frog, false);
    } else if (data.k === 'poke') {
      const item = this.world?.items?.().find((i) => i.id === data.id && !i.fresh && Math.hypot(i.x - data.x, i.y - data.y) < 20);
      if (item) this.pokeItem(item, false);
    } else if (data.k === 'ball') {
      // Somebody kicked the ball: everybody takes over where it is and where it flies.
      const item = this.world?.items?.().find((i) => i.id === 'ball');
      if (item && data.p && data.v) item.ball = { p: new THREE.Vector3(...data.p), v: new THREE.Vector3(...data.v), spin: item.ball?.spin ?? 0 };
    } else if (data.k === 'boop' && data.to === this.myId) {
      // Booped: a little shove and a hop.
      this.shove(data.d[0], data.d[1], BOOP.push, BOOP.hop);
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

  /** I changed clothes (the wardrobe): everyone here sees it now, and the server tells whoever comes in later. */
  setOutfit(outfit) {
    if (!this.active) return;
    this.identity.o = outfit;
    this.send('gevent', { k: 'outfit', o: outfit });
  }

  /** Owner: my garden's look ({ night, song }); everyone here gets it now, and whoever comes in later on arrival. */
  setLook(look) {
    this.look = look;
    if (this.own) this.send('gevent', { k: 'look', night: look.night, song: look.song });
  }

  // --- Emotes, the ball and boops ------------------------------------------------------------------------

  /** Plays one of my emotes (if unlocked: the caller checks) and shows it to everybody. */
  playEmote(id) {
    const emote = emoteById(id);
    if (!emote || !this.active) return;
    const data = emote.fx === 'power' ? { tier: this.identity.mt } : {};
    this.myEmote = this.startEmote(emote, this.me, data);
    this.send('gevent', { k: 'emote', id, ...data });
    // On the Little Stage an emote gets confetti too.
    const pos = this.player.group.position;
    if (this.onItem?.id === 'stage') this.particles?.burst(new THREE.Vector3(pos.x, pos.y, this.z), { count: 40, colors: ['#ff9ec7', '#7ed957', '#5fb8ff', '#ffd23f'], speed: 120, up: 200, size: 2, height: 30, life: 1.4 });
  }

  /** Starts an emote on an actor (`this.me` or a frog's `actor`); `data`: what came with it (a Power Up's tier). */
  startEmote(emote, actor, data = {}) {
    const running = actor.own ? this.myEmote : actor.frog.emote;
    if (running) this.endEmote(running);
    const { player } = actor;
    if (emote.move) player.rig.play(emote.move, { once: !emote.loop });
    const at = actor.position;
    if (emote.burst) this.particles?.burst(new THREE.Vector3(at.x, at.y, actor.z), { count: 30, colors: emote.burst, speed: 110, up: 160, size: 2, height: 20, glow: true, life: 1 });
    const state = { emote, actor, data, t: 0, script: EMOTE_FX[emote.fx], parts: {}, over: false };
    state.script?.start?.call(this, state);
    return state;
  }

  /** Stops an emote (done, cut short by hopping off, or replaced by another). */
  endEmote(state) {
    if (!state || state.over) return;
    state.over = true;
    state.script?.end?.call(this, state);
    const { player } = state.actor;
    if (state.emote.loop || state.t < (state.emote.time ?? EMOTE_TIME)) player.rig.play('idle');
    player.applyFacing();
  }

  /** Runs an emote on a frog (mine or a puppet): its spin, hops, bubble, particles and script. */
  updateEmote(state, delta, bubble) {
    if (!state || state.over) {
      if (bubble?.innerHTML) bubble.innerHTML = '';
      if (bubble) this.hud.updateWorldLabel(bubble, this.player.group.position, 0, false);
      return;
    }
    state.t += delta;
    const { emote, actor } = state;
    const frog = actor.player;
    const position = actor.position;
    const z = actor.z;
    const k = state.t / (emote.time ?? EMOTE_TIME);
    if (emote.spin) frog.model.rotation.y = Math.atan2(frog.facing.x, -frog.facing.y) + Math.min(1, k * 1.4) * emote.spin * Math.PI * 2;
    if (emote.hops && k < 0.85) {
      frog.model.position.z += Math.abs(Math.sin((k / 0.85) * Math.PI * emote.hops)) * 9;
      frog.rig.setLocomotion(1);
    }
    if (emote.burst && Math.floor(state.t * 4) !== Math.floor((state.t - delta) * 4) && state.t < 1.2) {
      this.particles?.burst(new THREE.Vector3(position.x, position.y, z), { count: 6, colors: emote.burst, speed: 60, up: 120, size: 1.6, height: 28, glow: true, life: 0.8 });
    }
    state.script?.update?.call(this, state, delta);
    if (bubble) {
      const html = emote.bubble ? `<span>${emote.bubble}</span>` : '';
      if (bubble.innerHTML !== html) bubble.innerHTML = html;
      this.hud.updateWorldLabel(bubble, new THREE.Vector3(position.x, position.y, 0), z + 62 + Math.sin(state.t * 4) * 2, Boolean(emote.bubble));
    }
    if (!emote.loop && k >= 1) this.endEmote(state);
  }

  // Helpers for the emote scripts.
  /** How far an actor is from my frog. */
  distanceTo(actor) {
    const me = this.player.group.position;
    return Math.hypot(actor.position.x - me.x, actor.position.y - me.y);
  }

  /** A sound from an actor: mine always, other frogs' when they're close. */
  sound(actor, name) {
    if (!actor.own && this.distanceTo(actor) >= HEAR) return;
    this.play?.(name);
    duckMusicFor(1.2); // emotes and boops are heard over the garden's music
  }

  /** The top of an actor's head above its feet (in its group, so it hops along). */
  topOf(actor) {
    const box = new THREE.Box3().setFromObject(actor.player.model);
    return Math.max(16, (box.max.z - box.min.z) * 0.9);
  }

  /** The flat direction from my camera past a point (for effects that should stay in view). */
  awayFromCamera(point) {
    const camera = this.hud.camera?.getWorldPosition(new THREE.Vector3());
    const away = camera ? new THREE.Vector3(point.x - camera.x, point.y - camera.y, 0) : new THREE.Vector3(0, 1, 0);
    return away.lengthSq() > 1 ? away.normalize() : away.set(0, 1, 0);
  }

  /** A point over an actor's head (where the head really is: lying down, it's off to the side). */
  headOf(actor, extra = 0) {
    const head = actor.player.rig?.parts.head;
    if (head) return head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 10 + extra));
    const at = actor.position;
    return new THREE.Vector3(at.x, at.y, actor.z + (actor.top ??= this.topOf(actor)) + extra);
  }

  /** My frog is thrown: along (dx, dy) at `speed`, up at `up` (a boop, a slam, a sonic boom). */
  shove(dx, dy, speed, up) {
    if (this.myEmote) this.endEmote(this.myEmote);
    this.myEmote = null;
    this.velocity.set(dx * speed, dy * speed, 0);
    this.vz = Math.max(this.vz, up);
    this.flying = true;
    this.player.rig.play('dash', { once: true });
  }

  /** Ground Pound landing (mine, or another frog's `slam` event): a shockwave that bounces frogs and trinkets. */
  slam(at, mine) {
    this.fx.shockwave(at, { radius: 115, color: '#fff1d0', life: 0.6, opacity: 0.32 });
    this.fx.ring(at, { radius: 150, color: '#ffe6a0', life: 0.8, opacity: 0.7 });
    this.particles?.burst(at, { count: 44, colors: ['#d9c9a0', '#c4b48a', '#a08a60', '#7ed957'], speed: 230, up: 90, size: 2.4, height: 1, life: 0.8 });
    this.particles?.burst(at, { count: 14, colors: ['#8a7a6a', '#6a5a4a'], speed: 120, up: 220, size: 3, height: 2, life: 1 });
    const me = this.player.group.position;
    if (mine || Math.hypot(at.x - me.x, at.y - me.y) < HEAR) this.play?.('boom');
    if (mine) this.postfx?.pulse({ warp: 0.35, aberration: 0.25 });
    // Trinkets nearby jump, and so does every frog close enough (each screen bounces its own).
    for (const item of this.world?.items?.() ?? []) {
      if (!item.fresh && item.id !== 'ball' && Math.hypot(item.x - at.x, item.y - at.y) < POUND.reach) this.world.poke?.(item);
    }
    const ball = this.world?.items?.().find((i) => i.id === 'ball' && i.ball);
    if (ball && ball.ball.p.distanceTo(at) < POUND.reach) ball.ball.v.z = Math.max(ball.ball.v.z, 380);
    if (!mine) {
      const d = Math.hypot(me.x - at.x, me.y - at.y);
      if (d < POUND.reach && Math.abs(this.z - (at.z ?? 0)) < 30) {
        const away = d > 1 ? [(me.x - at.x) / d, (me.y - at.y) / d] : [0, 0];
        this.shove(away[0], away[1], 120, POUND.bounce * (1 - (d / POUND.reach) * 0.5));
        this.play?.('boing');
        duckMusicFor(1);
      }
    }
  }

  /** A boop on a waving frog is a high five instead (`mine`: I gave it). */
  highFive(frog, mine) {
    const me = this.player.group.position;
    const middle = new THREE.Vector3((me.x + frog.position.x) / 2, (me.y + frog.position.y) / 2, Math.max(this.z, frog.z) + 30);
    this.player.rig.play('victory', { once: true });
    frog.puppet.rig.play('victory', { once: true });
    if (frog.emote) this.endEmote(frog.emote);
    frog.emote = null;
    this.fx.float('✋', middle, { size: 12, rise: 14, life: 1 });
    this.fx.starBurst(middle, ['#ffe680', '#ffffff', '#ff9ec7'], 0.45);
    this.play?.('clap');
    duckMusicFor(1);
    if (mine) this.send('gevent', { k: 'five', to: frog.id });
  }

  /** A trinket was booped (`mine`: by me; others hear about it with a `poke` event). */
  pokeItem(item, mine) {
    const poke = POKES[item.id] ?? { sound: 'pop', colors: ['#ffffff', '#ffe680'] };
    this.world?.poke?.(item, { spin: poke.spin });
    const at = new THREE.Vector3(item.x, item.y, 0);
    const top = new THREE.Vector3(item.x, item.y, 34);
    const me = this.player.group.position;
    if (mine || Math.hypot(item.x - me.x, item.y - me.y) < HEAR) {
      this.play?.(poke.sound);
      duckMusicFor(1.2);
    }
    if (poke.word) this.fx.float(poke.word, top, { size: 7, rise: 18, life: 1.2, color: '#fff3c4' });
    for (const emoji of poke.emoji ?? []) this.fx.float(emoji, top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, -6)), { size: 7, rise: 24, drift: 10, life: 1.4 });
    if (poke.colors) this.particles?.burst(at, { count: 24, colors: poke.colors, speed: 80, up: 140, size: 1.9, height: 18, glow: true, life: 0.9 });
    if (poke.fireflies) this.particles?.burst(at, { count: 16, colors: ['#e8ff8a', '#ffe680'], speed: 40, up: 50, gravity: -12, size: 1.8, height: 16, ring: 8, glow: true, life: 2.6 });
    if (poke.steam) this.particles?.burst(at, { count: 14, colors: ['#ffffff', '#f3eadf'], speed: 14, up: 40, gravity: -30, size: 2.6, height: 24, life: 1.6 });
    if (poke.water) {
      this.particles?.burst(at, { count: 36, colors: ['#bfe8ff', '#7fd8ff', '#ffffff'], speed: 70, up: 230, size: 1.8, height: 14, life: 1.1 });
      this.fx.ring(at, { radius: 40, color: '#bfe8ff', life: 0.7 });
    }
    if (mine) this.send('gevent', { k: 'poke', id: item.id, x: Math.round(item.x), y: Math.round(item.y) });
  }

  /**
   * Boop (B): the nearest frog in reach gets a little shove and a hop (on its own screen), or a high five if it's
   * waving; with nobody in reach, the ball gets a kick or the nearest trinket a poke.
   */
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
    if (!target) return this.boopThing();
    if (target.emote && !target.emote.over && target.emote.emote.id === 'wave') {
      this.highFive(target, true);
      return true;
    }
    const dx = (target.position.x - pos.x) / (best || 1);
    const dy = (target.position.y - pos.y) / (best || 1);
    this.send('gevent', { k: 'boop', to: target.id, d: [Math.round(dx * 100) / 100, Math.round(dy * 100) / 100] });
    target.puppet.rig.play('dash', { once: true });
    this.particles?.burst(new THREE.Vector3(target.position.x, target.position.y, target.z), { count: 10, colors: ['#ffffff', '#ffd36b'], speed: 90, up: 80, size: 1.8, height: 16, glow: true, life: 0.4 });
    this.play?.('pop');
    return true;
  }

  /** Boop with no frog in reach: kick the ball, poke the nearest trinket, or skip a stone across the pond. */
  boopThing() {
    const pos = this.player.group.position;
    let nearest = null;
    let best = BOOP.poke;
    for (const item of this.world?.items?.() ?? []) {
      if (item.fresh) continue;
      const p = item.ball?.p ?? item;
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < best && Math.abs((item.ball?.p.z ?? 0) - this.z) < 40) [nearest, best] = [item, d];
    }
    if (!nearest) return this.pond.skip();
    if (nearest.id === 'ball') {
      const ball = (nearest.ball ??= { p: new THREE.Vector3(nearest.x, nearest.y, 0), v: new THREE.Vector3(), spin: 0 });
      const f = this.player.facing;
      ball.v.set(f.x * 380, f.y * 380, 240);
      ball.p.z = Math.max(ball.p.z, 1);
      this.kickedAt = this.time;
      this.play?.('pop');
      this.send('gevent', { k: 'ball', p: [Math.round(ball.p.x), Math.round(ball.p.y), Math.round(ball.p.z)], v: [Math.round(ball.v.x), Math.round(ball.v.y), Math.round(ball.v.z)] });
      return true;
    }
    this.player.facing.set(nearest.x - pos.x, nearest.y - pos.y, 0).normalize();
    this.player.applyFacing();
    this.pokeItem(nearest, true);
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
    const wanted = walking && !this.flying && !this.pounding ? move : new THREE.Vector3();
    // A looping emote (a dance, a nap, a rest on the bench) lasts until Tode hops off.
    if (this.myEmote?.over) this.myEmote = null;
    if (this.myEmote?.emote.loop && (wanted.lengthSq() > 0.04 || (jump && walking) || this.flying)) {
      this.endEmote(this.myEmote);
      this.myEmote = null;
    }
    if (!this.flying) this.velocity.lerp(wanted.clone().multiplyScalar(WALK_SPEED * this.pond.speedFactor), 1 - Math.exp(-ACCELERATION * delta));
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
      if (!groundFrog && !under.item) this.pond.landed(pos, ground, falling);
      if (this.pounding && falling < -100) {
        // Ground Pound: the slam (everyone else gets a `slam` event and bounces on their own screen).
        this.pounding = null;
        const at = new THREE.Vector3(pos.x, pos.y, ground);
        this.slam(at, true);
        this.send('gevent', { k: 'slam', x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(ground) });
      }
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

    // The little running hops (swimming: paddling), and facing where we go.
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const swimming = this.pond.updateMe(delta, pos, !groundFrog && !under.item && ground <= 0.5, speed);
    if (speed > 8 && this.z <= ground + 0.5 && !swimming) {
      this.hopPhase += ((speed * delta) / HOP_LENGTH) * Math.PI;
      this.hop = Math.abs(Math.sin(this.hopPhase)) * HOP_HEIGHT;
    } else {
      this.hop = Math.max(0, this.hop - 40 * delta);
    }
    if (speed > 8) {
      player.facing.set(this.velocity.x, this.velocity.y, 0).normalize();
      player.applyFacing();
    }
    player.model.position.z = player.groundOffset + this.hop - (swimming ? this.pond.sink : 0);
    player.adornments.position.z = this.hop;
    player.rig.inPlace = true;
    player.rig.setLocomotion(swimming ? this.pond.paddle : this.hop / HOP_HEIGHT);
    // Sitting still on the bench: time for a cup of tea.
    const resting = this.onItem?.id === 'bench' && speed < 5 && !this.flying && !this.myEmote && walking;
    this.restFor = resting ? this.restFor + delta : 0;
    if (this.restFor > REST_AFTER) {
      this.restFor = 0;
      this.myEmote = this.startEmote(emoteById('rest'), this.me);
    }
    if (this.pounding && this.time - this.pounding > 3) this.pounding = null;
    this.updateEmote(this.myEmote, delta, this.myBubble);
    if (this.myEmote?.over) this.myEmote = null;
    this.myAura?.update(delta, pos, { moving: speed > 8, hop: this.hop });
    this.fx.update(delta);

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
      // Looping emotes follow the frog's state (`e`): it stopped (hopped off), or it was going when I came in.
      if (frog.emote?.over) frog.emote = null;
      const looping = frog.emote?.emote.loop ? frog.emote.emote.id : null;
      if (looping && frog.state.e !== looping && frog.emote.t > 0.6) {
        this.endEmote(frog.emote);
        frog.emote = null;
      } else if (!frog.emote && frog.state.e && emoteById(frog.state.e)?.loop) {
        frog.emote = this.startEmote(emoteById(frog.state.e), frog.actor);
      }
      this.updateEmote(frog.emote, delta, frog.bubble);
      this.pond.puppet(frog, delta);
    }
    this.rush.update(delta, pos);

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
        ...(this.myEmote?.emote.loop ? { e: this.myEmote.emote.id } : {}),
      });
    }
  }
}

// --- Emote scripts ----------------------------------------------------------------------------------------------
// `start(state)`, `update(state, delta)` and `end(state)` run with the hub as `this`. `state`: { emote, actor
// (this.me or a frog's actor), data (from the event), t (seconds), parts (whatever the script keeps) }.
// Things that happen at a moment check a flag in `parts`, so they happen once on every screen.
const once = (state, key, at) => state.t >= at && !state.parts[key] && (state.parts[key] = true);
const every = (state, key, seconds, delta) => {
  state.parts[key] = (state.parts[key] ?? 0) - delta;
  if (state.parts[key] > 0) return false;
  state.parts[key] += seconds;
  return true;
};
const facingAngle = (actor) => Math.atan2(actor.player.facing.y, actor.player.facing.x);
const around = (at, radius, z = 0) => {
  const a = Math.random() * Math.PI * 2;
  const r = radius * Math.sqrt(Math.random());
  return new THREE.Vector3(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, z);
};

const EMOTE_FX = {
  love: {
    start(state) {
      this.fx.heart(() => state.actor.position.clone().setZ(state.actor.z), (state.actor.top ??= this.topOf(state.actor)));
      this.sound(state.actor, 'love');
    },
  },

  laugh: {
    start(state) {
      this.sound(state.actor, 'laugh');
    },
    update(state, delta) {
      if (once(state, 'again', 1.6)) this.sound(state.actor, 'laugh');
      if (state.t < 2.9 && every(state, 'ha', 0.3, delta)) {
        const at = this.headOf(state.actor).add(new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, Math.random() * 6));
        this.fx.float(Math.random() < 0.6 ? 'HA!' : 'HA', at, { size: 5 + Math.random() * 3, rise: 14, drift: 12, life: 0.9, color: '#ffe066' });
      }
    },
  },

  dance: {
    start(state) {
      state.parts.floor = this.fx.disco(() => state.actor.position.clone().setZ(state.actor.z));
      this.sound(state.actor, 'pick');
    },
    update(state, delta) {
      // The groove: an eighth note every quarter second (heard from my own frog, and from dancers close by).
      if (every(state, 'beat', 0.25, delta) && (state.actor.own || this.distanceTo(state.actor) < HEAR)) groove((state.parts.step = (state.parts.step ?? -1) + 1));
      if (every(state, 'note', 0.5, delta)) {
        const at = this.headOf(state.actor).add(new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, 0));
        this.fx.float(Math.random() < 0.5 ? '♪' : '♫', at, { size: 7, rise: 26, drift: 14, life: 1.6, color: ['#ff9ec7', '#7fd8ff', '#ffe066', '#b8ff9a'][Math.floor(Math.random() * 4)] });
      }
      // Every second bar a twirl.
      const bar = state.t % 4;
      if (bar > 3.5) {
        const frog = state.actor.player;
        frog.model.rotation.y = Math.atan2(frog.facing.x, -frog.facing.y) + ((bar - 3.5) / 0.5) * Math.PI * 2;
      }
    },
    end(state) {
      this.fx.end(state.parts.floor);
    },
  },

  nap: {
    update(state, delta) {
      if (state.t > 0.6 && every(state, 'z', 1.1, delta)) {
        state.parts.n = (state.parts.n ?? 0) + 1;
        const at = this.headOf(state.actor, -2);
        this.fx.float('Z', at, { size: 4 + (state.parts.n % 3) * 2, rise: 30, drift: 12, life: 2.4, color: '#cfe8ff', wobble: 4, grow: 0.5 });
      }
      if (state.t > 1 && every(state, 'snore', 2.6, delta)) this.sound(state.actor, 'snore');
    },
  },

  popper: {
    update(state) {
      if (!once(state, 'pop', 0.35)) return;
      const at = state.actor.position.clone().setZ(state.actor.z);
      this.fx.confetti(at, state.actor.player.facing);
      this.particles?.burst(at, { count: 12, colors: ['#ffffff', '#ffe680'], speed: 90, up: 160, size: 2, height: 24, glow: true, life: 0.5 });
      this.sound(state.actor, 'popper');
    },
  },

  fireworks: {
    update(state) {
      const palettes = [['#ff5a7a', '#ffd0dc', '#ffffff'], ['#5fb8ff', '#e0f4ff', '#ffffff'], ['#ffd23f', '#fff3c4', '#ff9a3c'], ['#7ed957', '#e8ffd0', '#ffffff'], ['#c58aff', '#f0e0ff', '#ff9ec7']];
      for (const [i, at] of [0.25, 0.8, 1.35].entries()) {
        if (!once(state, `rocket${i}`, at)) continue;
        // The garden camera looks down at the lawn: the rockets go up a little beyond the frog, as seen from my
        // camera, and burst low enough to stay in view (each screen places its own).
        const away = this.awayFromCamera(state.actor.position);
        const from = around(state.actor.position, 40, state.actor.z).addScaledVector(away, 25 + i * 20);
        const colors = palettes[Math.floor(Math.random() * palettes.length)];
        this.fx.rocket(from, { height: 80 + Math.random() * 30, colors, onBurst: () => this.sound(state.actor, 'crackle') });
        this.sound(state.actor, 'launch');
      }
    },
  },

  royal: {
    start(state) {
      const at = state.actor.position.clone().setZ(state.actor.z);
      this.fx.carpet(at, facingAngle(state.actor), 3.6);
      this.sound(state.actor, 'dash');
    },
    update(state) {
      if (once(state, 'crown', 0.9)) {
        const frog = state.actor.player;
        this.fx.crown(frog.adornments, (state.actor.top ??= this.topOf(state.actor)) / frog.visualScale + 1, 2.7);
      }
      if (once(state, 'fanfare', 1.4)) this.sound(state.actor, 'fanfare');
    },
  },

  pound: {
    start(state) {
      this.sound(state.actor, 'dash');
      if (!state.actor.own) return;
      // Up high (the slam comes on landing, in GardenHub.update).
      this.velocity.set(0, 0, 0);
      this.vz = POUND.up;
      this.flying = true;
      this.pounding = this.time || 0.001;
    },
    update(state, delta) {
      if (state.t < 0.9 && every(state, 'trail', 0.05, delta)) {
        const at = state.actor.position.clone().setZ(state.actor.z);
        this.particles?.burst(at, { count: 2, colors: ['#fff3c4', '#ffffff'], speed: 10, up: -20, size: 1.6, height: 12, glow: true, life: 0.4 });
      }
    },
  },

  starfall: {
    start(state) {
      this.sound(state.actor, 'legendary');
    },
    update(state, delta) {
      if (state.t > 0.3 && state.t < 2.8 && every(state, 'star', 0.16, delta)) {
        const to = around(state.actor.position, 150, 0);
        if (Math.hypot(to.x - state.actor.position.x, to.y - state.actor.position.y) < 24) to.x += 30;
        const color = ['#fff2a0', '#ffffff', '#ffd0f0', '#bfe8ff'][Math.floor(Math.random() * 4)];
        const chime = Math.random() < 0.3;
        this.fx.shootingStar(to, { color, onLand: () => chime && this.sound(state.actor, 'graze') });
      }
    },
  },

  power: {
    start(state) {
      const { actor } = state;
      // The highest form this frog ever reached (mine from my save, theirs from their event).
      const tier = Math.max(1, Math.min(5, Math.round(Number(actor.own ? this.identity.mt : state.data.tier ?? actor.frog.maxTier) || 1)));
      state.parts.tier = tier;
      state.parts.colors = TIER_COLORS[tier];
      state.parts.ascension = actor.own ? this.ascension : (actor.frog.ascension ??= new Ascension(actor.player, this.particles, this.effects));
      this.sound(actor, 'powerUp');
    },
    update(state, delta) {
      const { actor, parts } = state;
      const at = actor.position.clone().setZ(actor.z);
      const ascension = parts.ascension;
      if (state.t < POWER.charge) {
        // Charging: stars pour in, dust and pebbles rise, the air trembles.
        const k = state.t / POWER.charge;
        ascension?.pullStars(delta, 80 + 260 * k, parts.colors, 1.3);
        if (every(state, 'dust', 0.04, delta)) {
          this.particles?.burst(at, { count: 2, colors: ['#d9c9a0', '#a08a60'], speed: 20, up: 40 + 80 * k, gravity: 30, size: 1.8, height: 1, ring: 26 + 20 * (1 - k), life: 0.9 });
          this.particles?.burst(at, { count: 1, colors: parts.colors, speed: 8, up: 90, gravity: -40, size: 1.6, height: 2, ring: 18, glow: true, life: 0.7 });
        }
        if (actor.own) this.postfx?.pulse({ aberration: 0.3 * k, warp: 0.2 * k });
      }
      if (once(state, 'burst', POWER.charge)) {
        // The burst: the form comes, with a sonic boom that knocks the dust (and nearby frogs) away.
        ascension?.setTier(parts.tier, { intensity: 0.4 });
        const color = parts.colors[0];
        // (Additive layers on a sunny lawn wash out to white quickly: keep them thin.)
        this.fx.shockwave(at, { radius: 170 + parts.tier * 25, color, life: 0.9, opacity: 0.22 });
        this.fx.ring(at, { radius: 280 + parts.tier * 30, color: '#ffffff', life: 1.4, opacity: 0.45 });
        this.fx.pillar(() => actor.position.clone().setZ(actor.z), { color, life: 2.2, radius: 12 + parts.tier * 2, height: 300, opacity: 0.3 });
        this.particles?.burst(at, { count: 70, colors: ['#d9c9a0', '#c4b48a', '#a08a60'], speed: 360, up: 40, size: 2.6, height: 1, life: 0.9 });
        this.particles?.burst(at, { count: 34, colors: parts.colors, speed: 200, up: 280, size: 2, height: 10, glow: true, life: 1.2 });
        this.sound(actor, 'sonicBoom');
        this.sound(actor, 'ascend');
        const d = this.distanceTo(actor);
        if (actor.own) {
          this.postfx?.flash(color, 0.22);
          this.postfx?.pulse({ warp: 0.7, aberration: 0.6 });
        } else if (d < HEAR) {
          this.postfx?.pulse({ warp: 0.5 * (1 - d / HEAR), aberration: 0.5 * (1 - d / HEAR) });
          if (d < POWER.push && Math.abs(this.z - actor.z) < 40) {
            const me = this.player.group.position;
            this.shove((me.x - at.x) / (d || 1), (me.y - at.y) / (d || 1), 190 * (1 - d / POWER.push) + 60, 220);
          }
        }
      }
      if (state.t > POWER.charge && state.t < POWER.end && every(state, 'divine', 0.07, delta)) {
        // Divine sparkles spiralling up around him.
        this.particles?.burst(at, { count: 2 + parts.tier, colors: [...parts.colors, '#ffffff'], speed: 18, up: 70 + parts.tier * 12, gravity: -30, size: 1.8, height: 6, ring: 22 + Math.random() * 18, glow: true, life: 1.1 });
      }
      if (once(state, 'down', POWER.end)) this.powerDown(state);
    },
    end(state) {
      this.powerDown(state);
    },
  },

  rest: {
    update(state, delta) {
      // Steam from the cup.
      if (state.t > 0.8 && every(state, 'steam', 0.45, delta)) {
        const at = this.headOf(state.actor, -8);
        this.particles?.burst(at, { count: 1, colors: ['#ffffff', '#f3eadf'], speed: 4, up: 24, gravity: -8, size: 2, height: 0, life: 1.4 });
      }
    },
  },
};

/** The Power Up ends: back to plain Tode in a puff of sparkles. */
GardenHub.prototype.powerDown = function powerDown(state) {
  const { parts, actor } = state;
  if (parts.powered === false || !parts.ascension) return;
  parts.powered = false;
  if (parts.ascension.tier !== 0) {
    parts.ascension.setTier(0);
    const at = actor.position.clone().setZ(actor.z);
    this.particles?.burst(at, { count: 30, colors: [...parts.colors, '#ffffff'], speed: 90, up: 120, size: 2, height: 16, glow: true, life: 0.8 });
  }
};
