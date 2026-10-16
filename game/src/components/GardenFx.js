import * as THREE from 'three';
import { GardenAura } from './GardenAuras.js';
import { rankTier } from './Rewards.js';

/**
 * The garden's own effects (GardenHub.js): what emotes, trinkets and the level aura show. Short-lived things live in
 * a list with an age (`add`) and are freed when they're done; `clear()` frees everything (leaving the garden).
 * The world is Z-up; flat things (rings, floors) lie in the XY plane.
 */

// --- Textures (made once, shared) -------------------------------------------------------------------------------
const labels = new Map();
/** A sprite texture for an emoji or a short word: { texture, aspect }. */
function labelTexture(text, color = '#ffffff') {
  const key = `${text}|${color}`;
  if (labels.has(key)) return labels.get(key);
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  const font = 'bold 88px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  g.font = font;
  const width = Math.ceil(g.measureText(text).width) + 28;
  canvas.width = Math.max(128, width);
  canvas.height = 128;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(40, 24, 10, 0.85)';
  g.strokeText(text, canvas.width / 2, 68);
  g.fillStyle = color;
  g.fillText(text, canvas.width / 2, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const entry = { texture, aspect: canvas.width / canvas.height };
  labels.set(key, entry);
  return entry;
}

let glowMap = null;
/** A soft round glow (motes, stars, rockets). */
function glow() {
  if (glowMap) return glowMap;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  glowMap = new THREE.CanvasTexture(canvas);
  return glowMap;
}

let fadeMap = null;
/** Bright at the bottom, gone at the top (pillars of light). */
function fadeUp() {
  if (fadeMap) return fadeMap;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 128, 0, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 4, 128);
  fadeMap = new THREE.CanvasTexture(canvas);
  return fadeMap;
}

let runeMap = null;
/** A ring of little glyphs (the highest level's aura). */
function runes() {
  if (runeMap) return runeMap;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(128, 128, 120, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(128, 128, 96, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.save();
    g.translate(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108);
    g.rotate(a + Math.PI / 2);
    g.beginPath();
    const r = (n) => ((Math.sin(i * 12.9 + n * 78.2) * 43758.5) % 1 + 1) % 1;
    g.moveTo(-5, -6);
    g.lineTo(r(1) * 10 - 5, 6);
    g.moveTo(r(2) * 10 - 5, -6);
    g.lineTo(5, r(3) * 12 - 6);
    g.stroke();
    g.restore();
  }
  runeMap = new THREE.CanvasTexture(canvas);
  return runeMap;
}

const additive = (color, opacity, extra = {}) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...extra });
const spriteOf = (map, color = '#ffffff', glowing = false) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, ...(glowing ? { blending: THREE.AdditiveBlending } : {}) }));

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const smooth = (k) => k * k * (3 - 2 * k);

/** Frees an effect's meshes (shared textures stay). */
function dispose(object) {
  object.removeFromParent();
  object.traverse((child) => {
    if (child.geometry && !child.geometry.userData.shared) child.geometry.dispose();
    child.material?.dispose();
  });
}

// --- Shared geometry ------------------------------------------------------------------------------------------
const shared = (geometry) => ((geometry.userData.shared = true), geometry);
const CONFETTI = shared(new THREE.PlaneGeometry(2.6, 1.5));
const DOME = shared(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2));
const RING = shared(new THREE.RingGeometry(0.86, 1, 64));

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -1);
  s.bezierCurveTo(-0.2, -0.75, -1.1, -0.35, -1.1, 0.25);
  s.bezierCurveTo(-1.1, 0.85, -0.45, 1.05, 0, 0.55);
  s.bezierCurveTo(0.45, 1.05, 1.1, 0.85, 1.1, 0.25);
  s.bezierCurveTo(1.1, -0.35, 0.2, -0.75, 0, -1);
  return s;
}
const HEART = shared(new THREE.ExtrudeGeometry(heartShape(), { depth: 0.45, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3, curveSegments: 16 }).center());

export class GardenFx {
  constructor({ scene, particles }) {
    Object.assign(this, { scene, particles });
    this.list = [];
  }

  /** Adds `object` to `parent` (the scene) for `life` seconds; `step(k, age, delta)` runs every frame. */
  add(object, life, step, parent = this.scene) {
    parent.add(object);
    const entry = { object, life, age: 0, step };
    this.list.push(entry);
    return entry;
  }

  /** Ends an effect added with an endless life (a dance floor) on its next frame. */
  end(entry) {
    if (entry) entry.life = Math.min(entry.life, entry.age);
  }

  update(delta) {
    for (const entry of this.list) {
      entry.age += delta;
      try {
        entry.step?.(Math.min(1, entry.age / entry.life), entry.age, delta);
      } catch (error) {
        console.error(error);
        entry.age = entry.life;
      }
    }
    for (const entry of this.list.filter((e) => e.age >= e.life)) dispose(entry.object);
    this.list = this.list.filter((e) => e.age < e.life);
  }

  clear() {
    for (const entry of this.list) dispose(entry.object);
    this.list = [];
  }

  // --- Floating words and emoji -------------------------------------------------------------------------------
  /** A word or emoji that pops up at `position` and floats away: { size, rise, drift, life, color, wobble }. */
  float(text, position, { size = 9, rise = 22, drift = 0, life = 1.6, color = '#ffffff', wobble = 3, grow = 0 } = {}) {
    const { texture, aspect } = labelTexture(text, color);
    const sprite = spriteOf(texture);
    const from = position.clone();
    const side = Math.random() * Math.PI * 2;
    const phase = Math.random() * 10;
    return this.add(sprite, life, (k, age) => {
      const popIn = Math.min(1, age / 0.18);
      const scale = size * (0.4 + 0.6 * smooth(popIn) + (popIn < 1 ? 0 : grow * k)) * (k > 0.8 ? 1 - (k - 0.8) * 2 : 1);
      sprite.scale.set(scale * aspect, scale, 1);
      sprite.position.set(
        from.x + Math.cos(side) * drift * k + Math.sin(age * 4 + phase) * wobble,
        from.y + Math.sin(side) * drift * k,
        from.z + rise * k
      );
      sprite.material.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    });
  }

  // --- Love: a big beating heart that bursts into little ones ----------------------------------------------------
  heart(anchor, height) {
    const heart = new THREE.Mesh(HEART, new THREE.MeshStandardMaterial({ color: '#ff4a78', emissive: '#ff2a5a', emissiveIntensity: 0.55, roughness: 0.35 }));
    heart.rotation.x = Math.PI / 2;
    const group = new THREE.Group();
    group.add(heart);
    let burst = false;
    return this.add(group, 2.5, (k, age) => {
      group.position.copy(anchor()).setZ(anchor().z + height + 6 + k * 6);
      const beat = 1 + 0.18 * Math.max(0, Math.sin(age * 9)) ** 4;
      group.scale.setScalar(5.5 * Math.min(1, age / 0.3) * beat * (k > 0.88 ? 1 + (k - 0.88) * 6 : 1));
      group.rotation.z = Math.sin(age * 2) * 0.3;
      if (k > 0.94 && !burst) {
        burst = true;
        const at = group.position.clone();
        for (let i = 0; i < 9; i++) this.float(pick(['❤️', '💕', '💖']), at, { size: 5 + Math.random() * 3, rise: 26 + Math.random() * 20, drift: 26 + Math.random() * 20, life: 1.3 + Math.random() * 0.6 });
        this.particles?.burst(at, { count: 26, colors: ['#ff5a7a', '#ff9ec7', '#ffffff'], speed: 110, up: 60, size: 2, height: 0, glow: true, life: 0.8 });
      }
    });
  }

  // --- Party Popper: a fountain of paper confetti that flutters down --------------------------------------------
  confetti(position, facing, count = 150) {
    const mesh = new THREE.InstancedMesh(CONFETTI, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }), count);
    mesh.frustumCulled = false;
    const colors = ['#ff5a7a', '#ffd23f', '#7ed957', '#5fb8ff', '#c58aff', '#ff9a3c', '#ffffff'];
    const base = Math.atan2(facing.y, facing.x);
    const bits = Array.from({ length: count }, (_, i) => {
      const angle = base + (Math.random() - 0.5) * 1.6;
      const out = 40 + Math.random() * 120;
      mesh.setColorAt(i, new THREE.Color(pick(colors)));
      return {
        p: new THREE.Vector3(position.x, position.y, position.z + 20),
        v: new THREE.Vector3(Math.cos(angle) * out, Math.sin(angle) * out, 200 + Math.random() * 200),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 6),
        phase: Math.random() * 10,
        landed: false,
      };
    });
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    return this.add(mesh, 4.2, (k, age, delta) => {
      for (const [i, bit] of bits.entries()) {
        if (!bit.landed) {
          bit.v.z -= 520 * delta;
          if (bit.v.z < -38) bit.v.z = -38; // paper drifts: air holds it up
          bit.v.x *= Math.exp(-1.6 * delta);
          bit.v.y *= Math.exp(-1.6 * delta);
          bit.p.addScaledVector(bit.v, delta);
          bit.p.x += Math.sin(age * 5 + bit.phase) * 14 * delta;
          if (bit.p.z <= 0.4) {
            bit.landed = true;
            bit.p.z = 0.4;
          }
        }
        const flutter = bit.landed ? 0 : age;
        euler.set(bit.landed ? 0 : flutter * bit.spin.x, bit.landed ? 0 : flutter * bit.spin.y, flutter * bit.spin.z + bit.phase);
        rotation.setFromEuler(euler);
        scale.setScalar(k > 0.85 ? (1 - k) / 0.15 : 1);
        matrix.compose(bit.p, rotation, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  // --- Fireworks: a rocket that whistles up and bursts into a ball of stars ------------------------------------
  rocket(from, { height = 200, colors = ['#ffd23f', '#ffffff'], onBurst } = {}) {
    const sprite = spriteOf(glow(), colors[0], true);
    sprite.scale.setScalar(7);
    const sway = (Math.random() - 0.5) * 50;
    let burst = false;
    return this.add(sprite, 1, (k) => {
      const climb = 1 - (1 - k) ** 2;
      sprite.position.set(from.x + sway * climb, from.y + sway * 0.4 * climb, from.z + 10 + height * climb);
      this.particles?.burst(sprite.position, { count: 2, colors: ['#ffe9b0', '#ffb84a'], speed: 10, up: -30, size: 1.3, height: 0, glow: true, life: 0.45, gravity: 30 });
      if (k >= 1 && !burst) {
        burst = true;
        this.starBurst(sprite.position.clone(), colors);
        onBurst?.(sprite.position.clone());
      }
    });
  }

  /** A ball of glowing stars falling slowly, with a flash in the middle. */
  starBurst(at, colors, size = 1) {
    for (const up of [150, -110]) this.particles?.burst(at, { count: Math.round(70 * size), colors, speed: 170 * size, up: up * size, size: 3.4, height: 0, glow: true, life: 1.5, gravity: 70 });
    this.particles?.burst(at, { count: 16, colors: ['#ffffff'], speed: 60 * size, up: 30, size: 2, height: 0, glow: true, life: 0.9, gravity: 20 });
    const flash = spriteOf(glow(), colors[0], true);
    this.add(flash, 0.45, (k) => {
      flash.position.copy(at);
      flash.scale.setScalar(70 * size * (0.4 + k));
      flash.material.opacity = (1 - k) * 0.9;
    });
  }

  // --- Star Shower: shooting stars streaking down all around -------------------------------------------------
  shootingStar(to, { color = '#fff2a0', onLand } = {}) {
    const sprite = spriteOf(glow(), color, true);
    const from = to.clone().add(new THREE.Vector3(-110 + Math.random() * 40, 70 + Math.random() * 40, 230));
    let landed = false;
    return this.add(sprite, 0.55, (k) => {
      sprite.position.lerpVectors(from, to, k * k);
      sprite.scale.setScalar(15);
      this.particles?.burst(sprite.position, { count: 4, colors: [color, '#ffffff'], speed: 6, up: 0, size: 2.4, height: 0, glow: true, life: 0.55, gravity: 0 });
      if (k >= 1 && !landed) {
        landed = true;
        this.particles?.burst(to, { count: 26, colors: [color, '#ffffff', '#ffd36b'], speed: 100, up: 130, size: 2.4, height: 1, glow: true, life: 0.8 });
        this.ring(to, { radius: 32, color, life: 0.55, opacity: 0.8 });
        onLand?.();
      }
    });
  }

  // --- Rings, shockwaves and pillars ---------------------------------------------------------------------------
  /** A flat ring that spreads out on the ground and fades. */
  ring(at, { radius = 60, color = '#ffffff', life = 0.6, opacity = 0.7, width = 1 } = {}) {
    const ring = new THREE.Mesh(RING, additive(color, opacity));
    return this.add(ring, life, (k) => {
      ring.position.set(at.x, at.y, (at.z ?? 0) + 0.8);
      const r = radius * (0.1 + 0.9 * (1 - (1 - k) ** 3));
      ring.scale.set(r, r, 1);
      ring.material.opacity = opacity * (1 - k) * width;
    });
  }

  /** A sonic boom: a dome of light bursting outward with rings on the ground. */
  shockwave(at, { radius = 220, color = '#ffffff', life = 0.9, opacity = 0.45 } = {}) {
    const dome = new THREE.Mesh(DOME, additive(color, opacity, { side: THREE.FrontSide }));
    dome.rotation.x = Math.PI / 2; // the open side down, on the lawn
    this.add(dome, life, (k) => {
      dome.position.set(at.x, at.y, at.z ?? 0);
      const r = radius * (1 - (1 - k) ** 3);
      dome.scale.set(r, r * 0.55, r);
      dome.material.opacity = opacity * (1 - k) ** 1.5;
    });
    this.ring(at, { radius: radius * 1.15, color, life: life * 1.1, opacity: 0.85 });
    this.ring(at, { radius: radius * 0.7, color: '#ffffff', life: life * 0.8, opacity: 0.6 });
  }

  /** A column of light that rises out of the ground and fades. */
  pillar(anchor, { color = '#fff2c0', life = 1.6, radius = 16, height = 260, opacity = 0.55 } = {}) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.2, height, 32, 1, true), additive(color, opacity, { map: fadeUp() }));
    pillar.rotation.x = Math.PI / 2;
    return this.add(pillar, life, (k) => {
      const at = anchor();
      pillar.position.set(at.x, at.y, (at.z ?? 0) + height / 2);
      pillar.scale.set(1 + k * 0.6, 0.3 + 0.7 * Math.min(1, k * 4), 1 + k * 0.6);
      pillar.material.opacity = opacity * (k < 0.15 ? k / 0.15 : (1 - k) / 0.85);
    });
  }

  // --- Royal bow: a red carpet rolls out, and a crown comes down -------------------------------------------------
  carpet(at, angle, life = 3.6) {
    const group = new THREE.Group();
    const roll = new THREE.Group(); // grows along +x from Tode's feet
    group.add(roll);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(1, 16, 0.5), new THREE.MeshStandardMaterial({ color: '#b3122e', roughness: 0.8 }));
    cloth.position.x = 0.5;
    const trim = new THREE.MeshStandardMaterial({ color: '#ffcf4a', emissive: '#b88a10', emissiveIntensity: 0.3, metalness: 0.4, roughness: 0.4 });
    roll.add(cloth);
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 0.6), trim);
      edge.position.set(0.5, side * 7.6, 0.05);
      roll.add(edge);
    }
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 17, 12), new THREE.MeshStandardMaterial({ color: '#9a0f27', roughness: 0.8 }));
    group.add(tube);
    group.rotation.z = angle;
    group.position.set(at.x, at.y, (at.z ?? 0) + 0.3);
    const length = 70;
    return this.add(group, life, (k, age) => {
      const out = smooth(Math.min(1, age / 0.7));
      const away = k > 0.85 ? (k - 0.85) / 0.15 : 0;
      roll.scale.set(Math.max(0.01, length * out * (1 - away)), 1, 1);
      roll.position.x = 10;
      tube.position.set(10 + length * out * (1 - away), 0, 2.4 * (1 - out) + 0.3);
      tube.rotation.z = 0;
      tube.visible = out < 0.98 || away > 0;
      tube.rotation.y = -age * 8;
    });
  }

  crown(parent, height, life = 2.4) {
    const crown = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: '#ffcf4a', emissive: '#c78a10', emissiveIntensity: 0.45, metalness: 0.7, roughness: 0.3 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5, 3, 16, 1, true), gold);
    band.rotation.x = Math.PI / 2;
    crown.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4, 6), gold);
      spike.rotation.x = Math.PI / 2;
      spike.position.set(Math.cos(a) * 5.2, Math.sin(a) * 5.2, 3.4);
      crown.add(spike);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshStandardMaterial({ color: pick(['#ff3a5a', '#3ab0ff', '#5aff8a']), emissive: '#ffffff', emissiveIntensity: 0.15 }));
      gem.position.set(Math.cos(a + 0.5) * 5.4, Math.sin(a + 0.5) * 5.4, 0);
      crown.add(gem);
    }
    let landed = false;
    return this.add(crown, life, (k, age) => {
      const fall = Math.min(1, age / 0.6);
      const bounce = fall < 1 ? 0 : Math.abs(Math.sin((age - 0.6) * 9)) * Math.max(0, 1 - (age - 0.6) * 2.5) * 2;
      crown.position.set(0, 0, height + (1 - smooth(fall)) * 30 + bounce);
      crown.rotation.z = age * 1.2;
      crown.scale.setScalar(k > 0.9 ? (1 - k) / 0.1 : 1);
      if (fall >= 1 && !landed) {
        landed = true;
        const world = crown.getWorldPosition(new THREE.Vector3());
        this.particles?.burst(world, { count: 30, colors: ['#ffe680', '#ffffff', '#ffcf4a'], speed: 80, up: 90, size: 1.8, height: 0, glow: true, life: 0.8 });
      }
    }, parent);
  }

  // --- Dance: a disco floor of tiles changing colour with the beat --------------------------------------------
  disco(anchor) {
    const floor = new THREE.Group();
    const colors = ['#ff5a7a', '#ffd23f', '#7ed957', '#5fb8ff', '#c58aff', '#ff9a3c'];
    const tiles = [];
    for (let x = -2; x <= 2; x++) {
      for (let y = -2; y <= 2; y++) {
        if (Math.hypot(x, y) > 2.4) continue;
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 10.5), additive(colors[0], 0.3));
        tile.position.set(x * 11.5, y * 11.5, 0);
        tile.userData.seed = (x * 7 + y * 13 + 50) % colors.length;
        floor.add(tile);
        tiles.push(tile);
      }
    }
    return this.add(floor, Infinity, (k, age) => {
      const at = anchor();
      floor.position.set(at.x, at.y, (at.z ?? 0) + 0.7);
      const beat = Math.floor(age * 2); // the dance's beat: two a second
      const pulse = 1 - (age * 2 - beat);
      for (const tile of tiles) {
        tile.material.color.set(colors[(tile.userData.seed + beat) % colors.length]);
        tile.material.opacity = Math.min(1, age * 3) * (0.16 + 0.22 * pulse * ((tile.userData.seed + beat) % 2));
      }
    });
  }

  // --- The level aura: how far a frog has come, always on -------------------------------------------------------
  /**
   * A frog's account level as a permanent aura (`parent`: the frog's group, so it follows him; `height`: the frog's,
   * for the halo). The looks are a GardenAura (GardenAuras.js), one more layer per rank; a Todeity also gets the
   * turning rune circle. Returns { group, stage, update(delta, position, { moving, hop }), dispose } or null below
   * level 3.
   */
  levelAura(level, parent, height = 30) {
    const aura = new GardenAura(rankTier(level), { height, particles: this.particles });
    if (!aura.look) return null;
    aura.group.userData.levelAura = aura.tier;
    parent.add(aura.group);
    let circle = null;
    if (aura.tier >= 6) {
      circle = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), additive('#ffe9a0', 0.22, { map: runes() }));
      circle.position.z = 0.5;
      aura.group.add(circle);
    }
    let time = Math.random() * 10;
    return {
      group: aura.group,
      stage: aura.tier,
      update: (delta, position, state) => {
        time += delta;
        aura.update(time, delta, position, state);
        if (circle) circle.rotation.z = -time * 0.15;
      },
      dispose: () => {
        if (circle) dispose(circle); // (its texture is shared and stays)
        aura.dispose();
      },
    };
  }
}
