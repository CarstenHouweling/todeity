import * as THREE from 'three';

/**
 * Garden auras: in the gardens a frog shows off its account rank (`rankTier` in Rewards.js), and each rank adds to
 * the one before, so a seasoned player stands out in a crowd:
 *   0 Tadpole        nothing
 *   1 Pond Hopper    a glowing ring under the frog
 *   2 Leaf Brewer    tea leaves circling on the ring; a puff of leaves where it lands
 *   3 Tea Adept      fireflies circling it
 *   4 Kettle Master  steam curling up from the ring; golden sparks where it lands
 *   5 Tea Sage       a halo over its head
 *   6 Todeity        a crown of light on the halo, a golden pillar of light with sparkles rising in it
 * Looks only. The aura is a child of the frog's group (Z-up, the frog's feet at 0); geometry and materials are
 * shared, so a garden full of frogs costs a handful of small meshes each. Trails go through the shared particles.
 */

export const AURAS = [
  null,
  { ring: '#7ed957' },
  { ring: '#b8f06a', leaves: 6, leaf: '#7ed957', landing: { colors: ['#7ed957', '#c8f77a', '#4fae3a'], count: 4, glow: false } },
  { ring: '#7fd8ff', leaves: 6, leaf: '#9be86a', fireflies: 3, firefly: '#fff2a0', landing: { colors: ['#7ed957', '#c8f77a'], count: 4, glow: false } },
  { ring: '#ffb347', leaves: 8, leaf: '#c8f77a', fireflies: 4, firefly: '#ffe680', steam: true, landing: { colors: ['#ffd36b', '#ffb347', '#fff2c0'], count: 5, glow: true } },
  { ring: '#fff2a0', leaves: 8, leaf: '#e8ff9a', fireflies: 5, firefly: '#fffbe0', steam: true, halo: '#ffe680', landing: { colors: ['#fff2a0', '#ffd36b', '#ffffff'], count: 6, glow: true } },
  { ring: '#ffd36b', leaves: 10, leaf: '#ffe680', fireflies: 6, firefly: '#ffffff', steam: true, halo: '#ffd36b', crown: true, pillar: '#ffc93c', landing: { colors: ['#ffd36b', '#ffffff', '#ff9ec7'], count: 8, glow: true } },
];

const geometries = {};
const materials = new Map();

function geometry(name, make) {
  return (geometries[name] ??= make());
}

/** Additive glow in `color`; `bright` pushes it past the bloom threshold. */
function glow(color, { opacity = 1, bright = 1, side = THREE.FrontSide, vertexColors = false } = {}) {
  const key = `${color}|${opacity}|${bright}|${side}|${vertexColors}`;
  if (!materials.has(key)) {
    materials.set(
      key,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(bright),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side,
        vertexColors,
        fog: false,
      })
    );
  }
  return materials.get(key);
}

function leafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -2.2);
  shape.quadraticCurveTo(1.9, 0, 0, 2.6);
  shape.quadraticCurveTo(-1.9, 0, 0, -2.2);
  return new THREE.ShapeGeometry(shape, 4);
}

/** An open cylinder whose colour fades to nothing at the top (additive black is invisible). */
function pillarGeometry() {
  const g = new THREE.CylinderGeometry(13, 17, 90, 24, 4, true).rotateX(Math.PI / 2).translate(0, 0, 45);
  const position = g.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = position.getZ(i) / 90;
    const fade = (1 - t) ** 1.6;
    colors.set([fade, fade, fade], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const mesh = (g, m) => {
  const out = new THREE.Mesh(g, m);
  out.userData.shared = true;
  return out;
};

const at = new THREE.Vector3();

export class GardenAura {
  /** `tier`: 0–6 (0 builds nothing); `height`: the frog's height, for the halo; `particles`: the shared bursts. */
  constructor(tier, { height = 30, particles = null } = {}) {
    this.tier = Math.max(0, Math.min(AURAS.length - 1, tier | 0));
    this.look = AURAS[this.tier];
    this.particles = particles;
    this.height = height;
    this.group = new THREE.Group();
    this.timers = { steam: Math.random(), sparkle: Math.random() * 0.2 };
    this.wasUp = false;
    const look = this.look;
    if (!look) return;

    this.ring = mesh(geometry('ring', () => new THREE.RingGeometry(18, 21, 48)), glow(look.ring, { opacity: 0.55, bright: 1.1 }));
    this.ring.position.z = 0.7;
    this.group.add(this.ring);
    if (this.tier >= 4) {
      this.disc = mesh(geometry('disc', () => new THREE.CircleGeometry(18, 40)), glow(look.ring, { opacity: 0.12 }));
      this.disc.position.z = 0.6;
      this.group.add(this.disc);
    }

    // Leaves circling on the ring.
    this.leaves = new THREE.Group();
    for (let i = 0; i < (look.leaves ?? 0); i++) {
      const leaf = mesh(geometry('leaf', leafGeometry), glow(look.leaf, { bright: 1.15, side: THREE.DoubleSide }));
      const angle = (i / look.leaves) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 19.5, Math.sin(angle) * 19.5, 1.4);
      leaf.rotation.z = angle;
      this.leaves.add(leaf);
    }
    this.group.add(this.leaves);

    this.fireflies = [];
    for (let i = 0; i < (look.fireflies ?? 0); i++) {
      const fly = mesh(geometry('firefly', () => new THREE.SphereGeometry(1.1, 8, 6)), glow(look.firefly, { bright: 1.6 }));
      this.fireflies.push({ mesh: fly, phase: (i / look.fireflies) * Math.PI * 2, speed: 0.9 + Math.random() * 0.5, lift: 0.4 + Math.random() * 0.5 });
      this.group.add(fly);
    }

    if (look.halo) {
      this.halo = new THREE.Group();
      this.halo.add(mesh(geometry('halo', () => new THREE.TorusGeometry(6.5, 0.6, 8, 40)), glow(look.halo, { bright: 1.5 })));
      if (look.crown) {
        for (let i = 0; i < 8; i++) {
          const ray = mesh(geometry('ray', () => new THREE.ConeGeometry(0.7, 4.5, 6).rotateX(Math.PI / 2).translate(0, 0, 2.6)), glow('#fff2c0', { bright: 1.6 }));
          const angle = (i / 8) * Math.PI * 2;
          ray.position.set(Math.cos(angle) * 6.5, Math.sin(angle) * 6.5, 0);
          this.halo.add(ray);
        }
      }
      this.halo.position.z = height + 3;
      this.group.add(this.halo);
    }

    if (look.pillar) {
      this.pillar = mesh(geometry('pillar', pillarGeometry), glow(look.pillar, { opacity: 0.17, side: THREE.DoubleSide, vertexColors: true }));
      this.group.add(this.pillar);
    }
  }

  /** `world`: where the frog stands; `moving`: hopping along; `hop`: its hop height (a landing is when it drops to 0). */
  update(time, delta, world, { moving = false, hop = 0, visible = true } = {}) {
    const { look } = this;
    this.group.visible = visible;
    if (!look || !visible) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
    this.ring.scale.setScalar(1 + 0.04 * pulse);
    this.leaves.rotation.z = time * 0.6;
    for (const [i, leaf] of this.leaves.children.entries()) leaf.position.z = 1.4 + Math.sin(time * 3 + i) * 0.8;
    for (const fly of this.fireflies) {
      const angle = fly.phase + time * fly.speed;
      const r = 23 + Math.sin(time * 1.3 + fly.phase) * 4;
      fly.mesh.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 10 + this.height * fly.lift + Math.sin(time * 2.1 + fly.phase * 2) * 4);
    }
    if (this.halo) {
      this.halo.rotation.z = time * 0.8;
      this.halo.rotation.x = Math.sin(time * 1.1) * 0.12;
      this.halo.position.z = this.height + 3 + Math.sin(time * 2) * 0.8 + hop;
    }
    if (this.pillar) {
      this.pillar.rotation.z = time * 0.3;
      this.pillar.scale.set(1 + 0.05 * pulse, 1 + 0.05 * pulse, 0.92 + 0.08 * pulse);
    }

    const { particles } = this;
    if (!particles) return;
    this.group.getWorldPosition(at);
    // Steam curling up from the ring now and then.
    if (look.steam && (this.timers.steam -= delta) <= 0) {
      this.timers.steam = 0.35 + Math.random() * 0.3;
      particles.burst(at, { count: 1, colors: ['#ffffff', '#f0f6ff'], ring: 19, speed: 3, up: 26, gravity: -12, size: 2.6, height: 2, life: 1.3 });
    }
    // Sparkles rising in the pillar.
    if (look.pillar && (this.timers.sparkle -= delta) <= 0) {
      this.timers.sparkle = 0.12;
      particles.burst(at, { count: 1, colors: ['#ffffff', '#ffe680', '#fff2c0'], ring: Math.random() * 12, speed: 2, up: 45, gravity: -25, size: 1.5, height: 3, life: 1.4, glow: true });
    }
    // A puff where it lands.
    const up = hop > 0.6;
    if (look.landing && this.wasUp && !up && moving) {
      particles.burst(at, { count: look.landing.count, colors: look.landing.colors, speed: 45, up: 35, size: 1.5, height: 1, life: 0.55, glow: look.landing.glow });
    }
    this.wasUp = up;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
