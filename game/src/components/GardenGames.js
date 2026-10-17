import * as THREE from 'three';
import { POND } from './Environment.js';
import { duckMusicFor } from './Sound.js';

/**
 * Things to do in a garden besides hopping around (v0.28, used by GardenHub.js).
 *
 * **The pond** (`GardenPond`): frogs on the lawn's level inside the water swim (slower, sunk in, paddling, ripples
 * behind them; every screen works that out for every frog from its position, so nothing extra is sent). A big fall
 * into the water (the cannon, the trampoline, a Ground Pound) is a cannonball: a `splash` event, and frogs close by
 * get soaked and washed back a little. Boop at the water's edge with nothing else in reach and Tode skips a stone
 * across it: the path is worked out from the throw (`skipPath`), so the `skip` event replays it exactly everywhere.
 * Now and then a koi leaps (each screen its own).
 *
 * **Leaf Rush** (`LeafRush`): a 30-second round for everyone in the garden. The frog that starts it runs it: its
 * screen scatters golden leaves (`rleaf`), decides who got each one (`rgrab` → `rgot`, first come) and ends the round
 * (`rend` with the scores). Leaves can lie on the roof, on trinkets or over the pond. Alone it's a race against your
 * best (`hub.hooks.onRecord`).
 */
// `paddle`: [base, swing, beat] of the swimming legs (the run pose's legs and arms, see rig.setLocomotion); it was
// 0.55 ± 0.45 at 9 rad/s, a full run cycle flailing in the water.
const SWIM = { speed: 0.55, sink: 7, bob: 0.4, ripple: 0.3, still: 1.4, paddle: [0.28, 0.17, 5.5] };
const paddling = (time) => SWIM.paddle[0] + SWIM.paddle[1] * Math.sin(time * SWIM.paddle[2]);
const CANNONBALL = -430; // falling faster than this into the water is a cannonball
// Slower than this isn't a landing: GardenHub lands a frog standing on the ground every frame (one frame of gravity,
// ~-25), and until v0.29.2 each of those was a splash: a burst of drops and a bright ring 60 times a second, a
// glowing cloud round a swimming frog. Walking in splashes once on its own (`updateMe`).
const LANDING = -120;
const SOAK = 95; // a cannonball soaks frogs this close
const SKIP = { first: 14, step: 26, shrink: 0.82, height: 0.28, look: 70 };
const KOI_EVERY = [6, 14];
const HEAR = 340;

export const RUSH = { countdown: 3, length: 30, field: 6, perFrog: 2, max: 14, big: 0.12, reach: 20, results: 7, spawnEvery: 0.3 };

/** Inside the pond's water (its outline wobbles by up to a tenth, so a little margin). */
export const inPond = (x, y, margin = 6) => Math.hypot(x - POND.x, y - POND.y) < POND.radius - margin;

const shared = (geometry) => ((geometry.userData.shared = true), geometry);
const STONE = shared(new THREE.SphereGeometry(2.2, 8, 6).scale(1, 1, 0.45));
const KOI_BODY = shared(new THREE.SphereGeometry(4, 10, 8).scale(1.9, 0.8, 0.9));
const KOI_TAIL = shared(new THREE.ConeGeometry(2.6, 5, 6).rotateZ(Math.PI / 2).translate(-9, 0, 0));
const KOI_SPOT = shared(new THREE.SphereGeometry(1.6, 8, 6).scale(1.4, 1, 0.5).translate(1.5, 0, 3.2));

function leafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -3);
  shape.quadraticCurveTo(2.6, 0, 0, 3.4);
  shape.quadraticCurveTo(-2.6, 0, 0, -3);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2 });
  return shared(geometry.center().rotateX(Math.PI / 2));
}
const LEAF = leafGeometry();
const LEAF_MATERIALS = {
  // Golden on the green lawn (green leaves vanished in the grass); the big ones glow amber.
  small: new THREE.MeshStandardMaterial({ color: '#ffe680', emissive: '#d4a000', emissiveIntensity: 0.8, roughness: 0.35 }),
  big: new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7a00', emissiveIntensity: 1, roughness: 0.3 }),
};
const SHADOW = shared(new THREE.CircleGeometry(6, 16));
const SHADOW_MATERIAL = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false });

/**
 * One of each thing the garden games draw, for main.js to compile their shaders on the way into a garden (the first
 * koi or leaf used to stall a frame, enough on a slow machine to cost a quality step). Kept: a program whose last
 * material is disposed is deleted.
 */
let warm = null;
export function gardenWarmup() {
  if (warm) return warm;
  warm = new THREE.Group();
  const koi = new THREE.Mesh(KOI_BODY, new THREE.MeshStandardMaterial({ color: '#ff7a2e', roughness: 0.35 }));
  const stone = new THREE.Mesh(STONE, new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.6 }));
  const ring = new THREE.Mesh(STONE, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(document.createElement('canvas')), transparent: true, depthWrite: false }));
  warm.add(koi, stone, ring, label, new THREE.Mesh(LEAF, LEAF_MATERIALS.small), new THREE.Mesh(SHADOW, SHADOW_MATERIAL));
  return warm;
}

/**
 * A skipped stone's landings from where it was thrown: [{ x, y, wet, t }] (t: when it lands, from the throw). It
 * stops after `bounces`, at the first landing on the bank, or when the hops get too small.
 */
export function skipPath(origin, angle, bounces, lead) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const landings = [];
  let x = origin.x;
  let y = origin.y;
  let t = 0;
  let step = lead;
  for (let i = 0; i <= bounces && step > 3; i++) {
    x += dx * step;
    y += dy * step;
    t += 0.1 + step / 190;
    const wet = inPond(x, y, 2);
    landings.push({ x, y, wet, t, step });
    if (!wet) break;
    step = i === 0 ? SKIP.step : step * SKIP.shrink;
  }
  return landings;
}

export class GardenPond {
  constructor(hub) {
    this.hub = hub;
    this.reset();
  }

  reset() {
    this.swimming = false;
    this.rippleIn = 0;
    this.splashedAt = -9;
    this.koiIn = 3 + Math.random() * 4;
    this.paddle = 0;
  }

  get sink() {
    return SWIM.sink - Math.sin(this.hub.time * 2.2) * SWIM.bob;
  }

  /** How fast my frog may hop now (slower in the water). */
  get speedFactor() {
    return this.swimming ? SWIM.speed : 1;
  }

  /** My frog, every frame. `level`: standing on the lawn (not a trinket, a roof or a frog). Returns swimming. */
  updateMe(delta, pos, level, speed) {
    const hub = this.hub;
    const was = this.swimming;
    this.swimming = level && hub.z <= 1 && inPond(pos.x, pos.y);
    if (this.swimming && !was && hub.time - this.splashedAt > 0.3) this.wade(pos, true);
    if (this.swimming) {
      this.paddle = speed > 8 ? paddling(hub.time) : 0;
      if ((this.rippleIn -= delta) <= 0) {
        this.rippleIn = speed > 8 ? SWIM.ripple : SWIM.still;
        this.ripple(pos, speed > 8 ? 24 : 16);
      }
    }
    this.updateKoi(delta);
    return this.swimming;
  }

  /** Another frog, after its own update: sunk into the water and paddling while it's in. */
  puppet(frog, delta) {
    const wet = frog.seen && frog.z < 1 && inPond(frog.position.x, frog.position.y);
    if (wet && !frog.wet) this.wade(frog.position, false);
    frog.wet = wet;
    if (!wet) return;
    const moving = frog.position.distanceToSquared(frog.last) > (8 * delta) ** 2;
    frog.puppet.model.position.z = frog.puppet.groundOffset - this.sink;
    frog.puppet.rig.setLocomotion(moving ? paddling(this.hub.time) : 0);
    if ((frog.rippleIn = (frog.rippleIn ?? 0) - delta) <= 0) {
      frog.rippleIn = moving ? SWIM.ripple : SWIM.still;
      this.ripple(frog.position, moving ? 24 : 16);
    }
  }

  ripple(at, radius) {
    this.hub.fx.ring(new THREE.Vector3(at.x, at.y, 0.2), { radius, color: '#e6f6ff', life: 1.1, opacity: 0.5 });
  }

  /** Hopping (or falling gently) into the water. */
  wade(at, mine) {
    const hub = this.hub;
    hub.particles?.burst(new THREE.Vector3(at.x, at.y, 0), { count: 14, colors: ['#bfe8ff', '#7fd8ff', '#ffffff'], speed: 50, up: 110, size: 1.6, height: 2, life: 0.7 });
    this.ripple(at, 30);
    if (mine || hub.distanceTo({ position: at }) < HEAR / 2) hub.play?.('plink');
  }

  /** My frog landed (`falling`: its speed down). A hard landing in the water is a cannonball for everyone. */
  landed(pos, ground, falling) {
    if (falling > LANDING || ground > 0.5 || !inPond(pos.x, pos.y)) return;
    this.splashedAt = this.hub.time;
    if (falling > CANNONBALL) return this.wade(pos, true);
    const strength = Math.min(1, -falling / 900);
    this.cannonball(pos, strength, true);
    this.hub.send('gevent', { k: 'splash', x: Math.round(pos.x), y: Math.round(pos.y), s: Math.round(strength * 100) / 100 });
  }

  cannonball(at, strength, mine) {
    const hub = this.hub;
    const spot = new THREE.Vector3(at.x, at.y, 0);
    hub.particles?.burst(spot, { count: Math.round(40 + 60 * strength), colors: ['#bfe8ff', '#7fd8ff', '#ffffff'], speed: 90 + 90 * strength, up: 260 + 200 * strength, size: 2.2, height: 4, life: 1.3 });
    hub.particles?.burst(spot, { count: 24, colors: ['#ffffff', '#e6f6ff'], speed: 40, up: 120, size: 3, height: 2, ring: 18, life: 0.9 });
    hub.fx.ring(spot, { radius: 50 + 50 * strength, color: '#e6f6ff', life: 0.9, opacity: 0.8 });
    hub.fx.ring(spot, { radius: 90 + 60 * strength, color: '#bfe8ff', life: 1.4, opacity: 0.5 });
    hub.fx.float('Cannonball!', new THREE.Vector3(at.x, at.y, 46), { size: 8, rise: 20, life: 1.3, color: '#bfefff' });
    const me = hub.player.group.position;
    const d = Math.hypot(me.x - at.x, me.y - at.y);
    if (mine || d < HEAR) {
      hub.play?.('splash');
      duckMusicFor(1.2);
    }
    if (mine) hub.postfx?.pulse({ warp: 0.2, aberration: 0.15 });
    // Frogs nearby get soaked: each screen washes back its own frog.
    if (!mine && d < SOAK && hub.z < 30) {
      const away = d > 1 ? [(me.x - at.x) / d, (me.y - at.y) / d] : [1, 0];
      hub.shove(away[0], away[1], 90, 150);
      hub.fx.float('💦', new THREE.Vector3(me.x, me.y, hub.z + 40), { size: 9, rise: 18, life: 1.2 });
    }
  }

  // --- Skipping stones ---------------------------------------------------------------------------------------
  /** Boop at the water's edge: skip a stone the way Tode faces. Returns false when there's no water ahead. */
  skip() {
    const hub = this.hub;
    const pos = hub.player.group.position;
    const facing = hub.player.facing;
    let lead = 0;
    for (let d = 10; d <= SKIP.look; d += 5) {
      if (inPond(pos.x + facing.x * d, pos.y + facing.y * d, 8)) {
        lead = d + SKIP.first;
        break;
      }
    }
    if (!lead || hub.z > 40) return false;
    // A good run-up skips further; now and then one just flies.
    const speed = Math.hypot(hub.velocity.x, hub.velocity.y);
    const bounces = 3 + Math.floor(Math.random() * 4) + (speed > 60 ? 2 : 0) + (Math.random() < 0.1 ? 3 : 0);
    const angle = Math.round(Math.atan2(facing.y, facing.x) * 100) / 100;
    const origin = { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(hub.z) };
    this.throwStone(origin, angle, bounces, Math.round(lead), true);
    hub.send('gevent', { k: 'skip', o: [origin.x, origin.y, origin.z], a: angle, n: bounces, l: Math.round(lead) });
    return true;
  }

  throwStone(origin, angle, bounces, lead, mine) {
    const hub = this.hub;
    const landings = skipPath(origin, angle, bounces, lead);
    if (!landings.length) return;
    const last = landings[landings.length - 1];
    const across = !last.wet && landings.length > 1; // skipped all the way to the far bank
    const skips = landings.filter((l) => l.wet).length - (across ? 0 : 1);
    const stone = new THREE.Mesh(STONE, new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.6 }));
    const hearIt = mine || Math.hypot(origin.x - hub.player.group.position.x, origin.y - hub.player.group.position.y) < HEAR;
    let landed = 0;
    let from = { x: origin.x, y: origin.y, z: origin.z + 14, t: 0 };
    hub.fx.add(stone, last.t + (last.wet ? 0.35 : 0.1), (k, age) => {
      while (landed < landings.length && age >= landings[landed].t) {
        const l = landings[landed];
        const spot = new THREE.Vector3(l.x, l.y, 0);
        const final = landed === landings.length - 1;
        if (l.wet) {
          hub.fx.ring(spot, { radius: final ? 26 : 18, color: '#e6f6ff', life: 1, opacity: 0.7 });
          hub.particles?.burst(spot, { count: final ? 14 : 6, colors: ['#bfe8ff', '#ffffff'], speed: 30, up: final ? 90 : 60, size: 1.3, height: 1, life: 0.5 });
          if (hearIt) hub.play?.('plink');
        } else if (hearIt) hub.play?.('tick');
        from = { x: l.x, y: l.y, z: 0, t: l.t };
        landed++;
        if (final) this.skipDone(l, skips, across, mine);
      }
      const next = landings[landed];
      if (!next) {
        // Sinking (or lying on the bank).
        stone.position.z = last.wet ? Math.max(-6, stone.position.z - 20 * (age - last.t)) : 0.6;
        stone.visible = !last.wet || age - last.t < 0.2;
        return;
      }
      const f = (age - from.t) / Math.max(0.01, next.t - from.t);
      const arc = next.step * SKIP.height * 4 * f * (1 - f);
      stone.position.set(from.x + (next.x - from.x) * f, from.y + (next.y - from.y) * f, from.z * (1 - f) + arc + 0.8);
      stone.rotation.z = age * 25;
    });
  }

  skipDone(at, skips, across, mine) {
    const hub = this.hub;
    const top = new THREE.Vector3(at.x, at.y, 30);
    if (!mine) {
      if (skips > 0) hub.fx.float(`${skips}!`, top, { size: 7, rise: 16, life: 1.2, color: '#e6f6ff' });
      return;
    }
    const best = hub.hooks.onRecord?.('skips', skips) ?? 0;
    const words = skips === 0 ? 'Plop.' : across ? `🪨 ${skips} skips, all the way across!` : `🪨 ${skips} skip${skips === 1 ? '' : 's'}!`;
    hub.fx.float(words, top, { size: skips >= 8 || across ? 9 : 7, rise: 18, life: 1.8, color: '#fff3c4' });
    if (skips > best && best > 0) {
      hub.fx.float('New best!', top.clone().add(new THREE.Vector3(0, 0, 14)), { size: 7, rise: 18, life: 1.8, color: '#ffd36b' });
      hub.fx.starBurst(top, ['#bfe8ff', '#ffffff', '#ffd36b'], 0.4);
      hub.play?.('pick');
    }
  }

  // --- The koi ----------------------------------------------------------------------------------------------
  updateKoi(delta) {
    if ((this.koiIn -= delta) > 0) return;
    this.koiIn = KOI_EVERY[0] + Math.random() * (KOI_EVERY[1] - KOI_EVERY[0]);
    this.leap();
  }

  leap() {
    const hub = this.hub;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * (POND.radius - 30);
    const heading = Math.random() * Math.PI * 2;
    const from = new THREE.Vector3(POND.x + Math.cos(angle) * r, POND.y + Math.sin(angle) * r, 0);
    const to = from.clone().add(new THREE.Vector3(Math.cos(heading) * 34, Math.sin(heading) * 34, 0));
    if (!inPond(to.x, to.y, 10)) to.lerp(from, 0.6);
    const fish = new THREE.Group();
    const body = new THREE.Group();
    const orange = new THREE.MeshStandardMaterial({ color: Math.random() < 0.3 ? '#ffffff' : '#ff7a2e', roughness: 0.35 });
    body.add(new THREE.Mesh(KOI_BODY, orange), new THREE.Mesh(KOI_TAIL, orange.clone()));
    body.add(new THREE.Mesh(KOI_SPOT, new THREE.MeshStandardMaterial({ color: Math.random() < 0.5 ? '#ffffff' : '#d23a1a', roughness: 0.35 })));
    fish.add(body);
    fish.rotation.z = heading;
    const height = 22 + Math.random() * 10;
    const splash = (at) => {
      hub.fx.ring(at, { radius: 20, color: '#e6f6ff', life: 0.8, opacity: 0.7 });
      hub.particles?.burst(at, { count: 10, colors: ['#bfe8ff', '#ffffff'], speed: 35, up: 80, size: 1.4, height: 1, life: 0.6 });
      if (hub.distanceTo({ position: at }) < HEAR / 2) hub.play?.('plink');
    };
    splash(from);
    let down = false;
    hub.fx.add(fish, 0.95, (k) => {
      fish.position.lerpVectors(from, to, k).setZ(4 * height * k * (1 - k) - 3);
      body.rotation.y = (k - 0.5) * 2.2; // nose up, then down
      body.rotation.x = Math.sin(k * 20) * 0.25; // a wriggle
      if (k > 0.97 && !down) {
        down = true;
        splash(to);
      }
    });
  }

  event(from, data) {
    if (data.k === 'splash' && Number.isFinite(data.x) && Number.isFinite(data.y)) {
      this.cannonball({ x: data.x, y: data.y }, Math.max(0, Math.min(1, Number(data.s) || 0.5)), false);
    } else if (data.k === 'skip' && Array.isArray(data.o) && Number.isFinite(data.a)) {
      const [x, y, z] = data.o.map(Number);
      const n = Math.max(0, Math.min(14, Math.round(Number(data.n) || 0)));
      const lead = Math.max(10, Math.min(SKIP.look + SKIP.first, Number(data.l) || 30));
      if ([x, y, z].every(Number.isFinite)) this.throwStone({ x, y, z }, data.a, n, lead, false);
    }
  }
}

// --- Leaf Rush ----------------------------------------------------------------------------------------------------
export class LeafRush {
  constructor(hub) {
    this.hub = hub;
    this.round = null;
    this.result = null; // { html, until } after a round
    this.group = new THREE.Group();
    hub.scene.add(this.group);
  }

  get me() {
    return this.hub.myId ?? 'me';
  }

  get running() {
    return Boolean(this.round);
  }

  /** Anyone starts a round (when none runs); their screen runs it. */
  start() {
    if (this.round || !this.hub.active) return false;
    this.begin(this.me, true);
    this.hub.send('gevent', { k: 'rush' });
    return true;
  }

  begin(hostId, mine) {
    this.clearLeaves();
    this.result = null;
    this.round = { hostId, mine, t: 0, leaves: new Map(), scores: new Map(), names: new Map(), next: 1, spawnIn: 0, said: RUSH.countdown + 1 };
    this.hub.play?.('charge');
    this.hub.hooks.onChange?.();
  }

  /** Leaving the garden, or the round is called off. */
  stop() {
    this.clearLeaves();
    this.round = null;
    this.result = null;
    this.hub.hud.setRushBoard?.('');
  }

  clearLeaves() {
    for (const leaf of this.round?.leaves.values() ?? []) leaf.mesh.removeFromParent();
    this.group.clear();
  }

  /** A frog left the garden: if it ran the round, the round is off. */
  left(id) {
    if (this.round && this.round.hostId === id) {
      this.stop();
      this.result = { html: '🍃 Leaf Rush called off: its host left.', until: this.hub.time + 3 };
      this.hub.hooks.onChange?.();
    }
  }

  nameOf(id) {
    if (id === this.me) return 'You';
    const frog = this.hub.frogs.get(id);
    if (frog) this.round?.names.set(id, frog.name);
    return frog?.name ?? this.round?.names.get(id) ?? 'A frog';
  }

  // --- Leaves -------------------------------------------------------------------------------------------------
  /** Host: a new leaf somewhere a frog can get to (not too close to anybody, not on a high roof). */
  spawn() {
    const hub = this.hub;
    const frogs = [hub.player.group.position, ...[...hub.frogs.values()].map((frog) => frog.position)];
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.sqrt(Math.random()) * 270;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      if (frogs.some((p) => Math.hypot(p.x - x, p.y - y) < 45)) continue;
      const ground = hub.world?.heightAt(x, y).h ?? 0;
      if (ground > 45) continue;
      const leaf = { i: this.round.next++, x, y, b: Math.random() < RUSH.big ? 1 : 0 };
      this.addLeaf(leaf);
      return leaf;
    }
    return null;
  }

  addLeaf({ i, x, y, b }) {
    if (!this.round || this.round.leaves.has(i)) return;
    const ground = this.hub.world?.heightAt(x, y).h ?? 0;
    const mesh = new THREE.Group();
    const leaf = new THREE.Mesh(LEAF, b ? LEAF_MATERIALS.big : LEAF_MATERIALS.small);
    leaf.scale.setScalar(b ? 3.2 : 2.3);
    const shadow = new THREE.Mesh(SHADOW, SHADOW_MATERIAL);
    shadow.position.z = 0.4 - 10;
    mesh.add(leaf, shadow);
    mesh.position.set(x, y, ground + 10);
    this.group.add(mesh);
    this.round.leaves.set(i, { i, x, y, z: ground + 10, b, mesh, leaf, born: this.hub.time });
    this.hub.particles?.burst(mesh.position, { count: 8, colors: b ? ['#ffb347', '#ffffff'] : ['#ffe680', '#ffffff'], speed: 40, up: 60, size: 1.6, height: 0, glow: true, life: 0.5 });
  }

  removeLeaf(i, by) {
    const leaf = this.round?.leaves.get(i);
    if (!leaf) return;
    this.round.leaves.delete(i);
    leaf.mesh.removeFromParent();
    this.hub.particles?.burst(leaf.mesh.position, { count: leaf.b ? 26 : 12, colors: leaf.b ? ['#ffb347', '#fff3a0', '#ffffff'] : ['#ffe680', '#ffffff'], speed: 70, up: 110, size: 1.8, height: 0, glow: true, life: 0.6 });
    if (by !== undefined && by !== this.me) this.hub.frogs.get(by)?.puppet.rig.play('victory', { once: true });
  }

  /** Host: leaf `i` goes to `by` (first come); everybody hears who got it and their score. */
  award(i, by) {
    const round = this.round;
    const leaf = round?.leaves.get(i);
    if (!leaf || round.t < RUSH.countdown || round.t > RUSH.countdown + RUSH.length) return;
    const score = (round.scores.get(by) ?? 0) + (leaf.b ? 3 : 1);
    round.scores.set(by, score);
    this.nameOf(by);
    this.removeLeaf(i, by);
    this.hub.send('gevent', { k: 'rgot', i, by, s: score });
    if (by === this.me) this.gotOne(leaf);
    this.hub.hooks.onChange?.();
  }

  gotOne(leaf) {
    const hub = this.hub;
    const me = hub.player.group.position;
    hub.fx.float(leaf.b ? '+3' : '+1', new THREE.Vector3(me.x, me.y, hub.z + 44), { size: leaf.b ? 9 : 7, rise: 18, life: 0.9, color: leaf.b ? '#ffd36b' : '#d8ff9a' });
    hub.play?.(leaf.b ? 'legendary' : 'pick');
    duckMusicFor(0.6);
  }

  // --- Every frame --------------------------------------------------------------------------------------------
  update(delta, pos) {
    const hub = this.hub;
    if (this.result && hub.time > this.result.until) {
      this.result = null;
      hub.hooks.onChange?.();
    }
    const round = this.round;
    if (!round) {
      hub.hud.setRushBoard?.(this.result ? `<b>${this.result.html}</b>` : '');
      return;
    }
    round.t += delta;
    const playing = round.t >= RUSH.countdown && round.t < RUSH.countdown + RUSH.length;

    // 3, 2, 1, go!
    const say = Math.ceil(RUSH.countdown - round.t);
    if (say < round.said && say >= 0) {
      round.said = say;
      hub.play?.(say === 0 ? 'waveStart' : 'click');
    }

    // Host: keep the field full.
    if (round.mine && playing && (round.spawnIn -= delta) <= 0) {
      round.spawnIn = RUSH.spawnEvery;
      const want = Math.min(RUSH.max, RUSH.field + RUSH.perFrog * hub.frogs.size);
      const fresh = [];
      for (let n = 0; n < 4 && round.leaves.size < want; n++) {
        const leaf = this.spawn();
        if (leaf) fresh.push([leaf.i, leaf.x, leaf.y, leaf.b]);
      }
      if (fresh.length) hub.send('gevent', { k: 'rleaf', l: fresh });
    }

    // Leaves spin and bob; hop into one to grab it.
    for (const leaf of round.leaves.values()) {
      const age = hub.time - leaf.born;
      leaf.leaf.rotation.z = age * 2.4;
      leaf.leaf.position.z = Math.sin(age * 3 + leaf.i) * 2;
      leaf.mesh.scale.setScalar(Math.min(1, age * 4));
      if ((leaf.sparkleIn = (leaf.sparkleIn ?? Math.random() * 0.4) - delta) <= 0) {
        leaf.sparkleIn = 0.35;
        hub.particles?.burst(leaf.mesh.position, { count: leaf.b ? 3 : 2, colors: ['#fff3a0', '#ffffff'], speed: 18, up: 30, gravity: -10, size: 1.5, height: 0, ring: 6, glow: true, life: 0.8 });
      }
      if (!playing || leaf.claimed) continue;
      const near = Math.hypot(leaf.x - pos.x, leaf.y - pos.y) < RUSH.reach;
      const height = leaf.z - hub.z;
      if (near && height > -6 && height < 34) {
        if (round.mine) this.award(leaf.i, this.me);
        else {
          // Not mine to decide: hide it now, the host says who really got it.
          leaf.claimed = true;
          leaf.mesh.visible = false;
          hub.send('gevent', { k: 'rgrab', i: leaf.i });
        }
      }
    }

    // The end: the host sends the scores; a guest that never hears them ends with what it has.
    if (round.mine && round.t >= RUSH.countdown + RUSH.length) {
      hub.send('gevent', { k: 'rend', s: [...round.scores] });
      this.finish([...round.scores]);
    } else if (!round.mine && round.t >= RUSH.countdown + RUSH.length + 3) {
      this.finish([...round.scores]);
    }
    if (this.round) hub.hud.setRushBoard?.(this.board());
  }

  board() {
    const round = this.round;
    if (round.t < RUSH.countdown) return `<b>🍃 Leaf Rush in ${Math.ceil(RUSH.countdown - round.t)}…</b> <small>hop into the leaves, gold ones count 3</small>`;
    const left = Math.max(0, Math.ceil(RUSH.countdown + RUSH.length - round.t));
    const rows = this.ranking([...round.scores]).slice(0, 4);
    if (!rows.some(([id]) => id === this.me)) rows.push([this.me, round.scores.get(this.me) ?? 0]);
    const list = rows.map(([id, n]) => `<span class="${id === this.me ? 'me' : ''}">${escape(this.nameOf(id))} <b>${n}</b></span>`).join('');
    return `<b>🍃 Leaf Rush · 0:${String(left).padStart(2, '0')}</b>${list}`;
  }

  ranking(scores) {
    return scores.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  }

  finish(scores) {
    const hub = this.hub;
    const round = this.round;
    if (!round) return;
    const ranking = this.ranking(scores);
    const top = ranking[0]?.[1] ?? 0;
    const winners = ranking.filter(([, n]) => n === top).map(([id]) => id);
    const mine = scores.find(([id]) => id === this.me)?.[1] ?? 0;
    let html;
    if (hub.frogs.size === 0 && !ranking.some(([id]) => id !== this.me)) {
      // Alone: against my best.
      const best = hub.hooks.onRecord?.('rush', mine) ?? 0;
      html = `🍃 You caught ${mine} leaves!${mine > best && best > 0 ? ' A new best!' : best ? ` Best: ${Math.max(best, mine)}` : ''}`;
      if (mine > best) hub.play?.('fanfare');
    } else if (!top) {
      html = '🍃 Nobody caught a leaf!';
    } else if (winners.length > 1) {
      html = `🤝 A tie at ${top}: ${winners.map((id) => escape(this.nameOf(id))).join(' & ')}!`;
    } else {
      html = winners[0] === this.me ? `🏆 You win with ${top} leaves!` : `🏆 ${escape(this.nameOf(winners[0]))} wins with ${top} leaves!`;
    }
    if (winners.includes(this.me)) {
      hub.play?.('fanfare');
      hub.player.rig.play('victory', { once: true });
    }
    for (const id of winners) {
      const at = id === this.me ? hub.player.group.position : hub.frogs.get(id)?.position;
      if (at) hub.fx.starBurst(new THREE.Vector3(at.x, at.y, (id === this.me ? hub.z : hub.frogs.get(id).z) + 50), ['#ffd36b', '#b6f06a', '#ffffff'], 0.6);
    }
    this.clearLeaves();
    this.round = null;
    this.result = { html, until: hub.time + RUSH.results };
    hub.hooks.onChange?.();
  }

  event(from, data) {
    const round = this.round;
    if (data.k === 'rush') {
      // Two frogs started at once: the round of the lower id wins.
      if (round && !(round.mine && from < this.me)) return;
      this.begin(from, false);
      this.round.names.set(from, this.hub.frogs.get(from)?.name ?? 'A frog');
    } else if (!round) {
      return;
    } else if (data.k === 'rleaf' && from === round.hostId && Array.isArray(data.l)) {
      for (const [i, x, y, b] of data.l.slice(0, RUSH.max)) if ([i, x, y].every(Number.isFinite)) this.addLeaf({ i, x, y, b: b ? 1 : 0 });
    } else if (data.k === 'rgrab' && round.mine && Number.isFinite(data.i)) {
      this.award(data.i, from);
    } else if (data.k === 'rgot' && from === round.hostId && Number.isFinite(data.i)) {
      const leaf = round.leaves.get(data.i);
      round.scores.set(data.by, Number(data.s) || 0);
      this.nameOf(data.by);
      if (data.by === this.me && leaf) this.gotOne(leaf);
      this.removeLeaf(data.i, data.by);
    } else if (data.k === 'rend' && from === round.hostId && Array.isArray(data.s)) {
      this.finish(data.s.filter((row) => Array.isArray(row) && Number.isFinite(row[1])));
    }
  }
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
