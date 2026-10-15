import * as THREE from 'three';

/**
 * Charms: little trinkets that drop from elite bees, bosses, hives and Shrines of Chance. Unlike brews they have no
 * level cap: every copy stacks. Many trigger on hit, on kill or on a critical hit, and what they trigger can trigger
 * other charms in turn (with a weaker chance each step), so big stacks chain into fireworks.
 * Stat charms change Tode's stats once per copy (`apply(stats, n)` with the new count); the rest are read by main.js.
 * Every effect flattens out (`stacked`, `chance`, the `*_MAX` caps): a high-Steep run full of elites used to pile up
 * 50–90 copies of each, and stats that compounded per copy ran away (×200 damage, +750% speed).
 */
export const CHARM_RARITIES = {
  common: { name: 'Common', color: '#f2f2f2', weight: 66 },
  uncommon: { name: 'Uncommon', color: '#78f070', weight: 27 },
  rare: { name: 'Rare', color: '#ff5a5a', weight: 7 },
};

const pct = (value) => `${Math.round(value * 100)}%`;

/** A stacking bonus that starts at `base` per copy and flattens out toward `cap`. */
export const stacked = (base, n, cap) => cap * (1 - Math.exp((-base * n) / cap));
/** What the n-th copy adds on top of the ones before. */
const step = (base, n, cap) => stacked(base, n, cap) - stacked(base, n - 1, cap);

export const DICE_MAX = 3; // extra rolls from Loaded Dice
export const HEART_MAX = 5; // max hearts from Honey Hearts (later copies only heal)

export const CHARMS = [
  // Stats
  // Multipliers apply the ratio between n and n − 1 copies, so the total is exactly 1 + stacked(…).
  { id: 'bead', icon: '📿', name: 'Steeped Bead', rarity: 'common', text: (n) => `+${pct(stacked(0.08, n, 1))} damage (up to +100%).`, apply: (s, n) => (s.damageMultiplier *= (1 + stacked(0.08, n, 1)) / (1 + stacked(0.08, n - 1, 1))) },
  { id: 'lemon', icon: '🍋', name: 'Lemon Zest', rarity: 'common', text: (n) => `+${pct(stacked(0.05, n, 0.5))} critical hit chance (up to +50%).`, apply: (s, n) => (s.critChance += step(0.05, n, 0.5)) },
  { id: 'pretzel', icon: '🥨', name: 'Pretzel Legs', rarity: 'common', text: (n) => `Move ${pct(stacked(0.07, n, 0.6))} faster (up to 60%).`, apply: (s, n) => (s.moveSpeed *= (1 + stacked(0.07, n, 0.6)) / (1 + stacked(0.07, n - 1, 0.6))) },
  { id: 'candy', icon: '🍬', name: 'Rock Candy', rarity: 'common', text: (n) => `Spit ${pct(stacked(0.06, n, 1))} faster (up to twice as fast).`, apply: (s, n) => (s.spitCooldown /= (1 + stacked(0.06, n, 1)) / (1 + stacked(0.06, n - 1, 1))) },
  { id: 'honeyheart', icon: '💗', name: 'Honey Heart', rarity: 'rare', text: (n) => `+${Math.min(n, HEART_MAX)} max heart${n > 1 ? 's' : ''}${n >= HEART_MAX ? ` (the most it gives); more just heal` : ''}.`, apply: (s, n) => n <= HEART_MAX && (s.maxHp += 1), heal: 1 },
  // On hit
  { id: 'chili', icon: '🌶️', name: 'Chili Leaf', rarity: 'common', text: (n) => `${pct(chance(0.1, n))} chance on hit to set a bee on fire.` },
  { id: 'cube', icon: '🧊', name: 'Ice Cube', rarity: 'common', text: (n) => `${pct(chance(0.07, n))} chance on hit to freeze a bee for a moment.` },
  { id: 'spoon', icon: '🥄', name: 'Static Teaspoon', rarity: 'uncommon', text: (n) => `${pct(chance(0.09, n))} chance on hit to chain lightning through 3 bees.` },
  { id: 'biscuit', icon: '🍪', name: 'Homing Biscuit', rarity: 'uncommon', text: (n) => `${pct(chance(0.08, n))} chance on hit to launch a homing biscuit for 250% damage.` },
  // On critical hit
  { id: 'cup', icon: '☕', name: 'Hot Cup', rarity: 'uncommon', text: (n) => `Critical hits splash ${3 + 2 * n} damage around the bee.` },
  // On kill
  { id: 'firecracker', icon: '🧨', name: 'Sugar Firecracker', rarity: 'common', text: (n) => `Defeated bees have a 25% chance to explode for ${3 + 3 * n} damage.` },
  { id: 'battery', icon: '🔋', name: 'Leaf Battery', rarity: 'common', text: (n) => `Every defeated bee charges your ultimate by ${batteryCharge(n).toFixed(1)}% (up to 3%).` },
  // Rare
  { id: 'dice', icon: '🎲', name: 'Loaded Dice', rarity: 'rare', text: (n) => `Every chance effect gets ${Math.min(n, DICE_MAX)} extra roll${n > 1 ? 's' : ''}${n >= DICE_MAX ? ' (the most)' : ''}.` },
  { id: 'bell', icon: '🔔', name: 'Echo Bell', rarity: 'rare', text: (n) => `Spit has a ${pct(Math.min(1, 0.2 * n))} chance to fire a second volley.` },
];

/** Ultimate charge per kill (percent) from `n` Leaf Batteries. */
export const batteryCharge = (n) => stacked(0.3, n, 3);
/** The Sugar Firecracker's blast radius: it grows with copies, but never past twice the first. */
export const firecrackerRadius = (n) => 60 + stacked(6, n, 60);

/** Stacking chance with diminishing returns: never quite 100%. */
export function chance(base, stacks) {
  return 1 - 1 / (1 + base * stacks * 1.1);
}

export const charmById = (id) => CHARMS.find((charm) => charm.id === id);

/** A random charm, weighted by rarity; `minRarity` ('uncommon', 'rare') skips the commoner ones. */
export function rollCharm(minRarity = 'common') {
  const order = Object.keys(CHARM_RARITIES);
  const allowed = order.slice(order.indexOf(minRarity));
  const total = allowed.reduce((sum, id) => sum + CHARM_RARITIES[id].weight, 0);
  let roll = Math.random() * total;
  const rarity = allowed.find((id) => (roll -= CHARM_RARITIES[id].weight) < 0) ?? allowed[0];
  const pool = CHARMS.filter((charm) => charm.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- Charms lying on the ground ----------------------------------------------------------
const iconTextures = new Map();

/** An emoji drawn on a canvas, for a sprite that always faces the camera. */
export function iconTexture(icon) {
  if (!iconTextures.has(icon)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    context.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(icon, 64, 72);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    iconTextures.set(icon, texture);
  }
  return iconTextures.get(icon);
}

const GEM = new THREE.OctahedronGeometry(6, 0);
const RING = new THREE.RingGeometry(13, 16, 32);
const PICKUP_REACH = 26;

/** Charms waiting to be picked up: a spinning gem in the rarity colour with the charm's icon above it. */
export class CharmDrops {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.time = 0;
  }

  drop(position, charm) {
    const group = new THREE.Group();
    const color = CHARM_RARITIES[charm.rarity].color;
    const gem = new THREE.Mesh(GEM, new THREE.MeshBasicMaterial({ color, fog: false }));
    gem.position.z = 10;
    const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
    ring.position.z = 0.8;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(charm.icon), depthWrite: false, fog: false }));
    sprite.scale.set(20, 20, 1);
    sprite.position.z = 30;
    group.add(gem, ring, sprite);
    // Pop out of the bee a little way.
    const angle = Math.random() * Math.PI * 2;
    const from = position.clone().setZ(0);
    const to = from.clone().add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(20 + Math.random() * 25));
    group.position.copy(from);
    this.scene.add(group);
    this.list.push({ charm, group, gem, ring, from, to, age: 0, flying: false });
  }

  /** Moves the drops; returns the charms Tode picked up this frame. */
  update(delta, playerPosition, active = true) {
    this.time += delta;
    const picked = [];
    for (const drop of [...this.list]) {
      drop.age += delta;
      const { group } = drop;
      if (drop.flying) {
        group.position.lerp(playerPosition, 1 - Math.exp(-8 * delta));
      } else if (drop.age < 0.4) {
        const t = drop.age / 0.4;
        group.position.lerpVectors(drop.from, drop.to, t);
        group.position.z = Math.sin(t * Math.PI) * 30;
      } else {
        group.position.z = 0;
      }
      drop.gem.rotation.z += delta * 2.5;
      drop.gem.position.z = 10 + Math.sin(this.time * 3 + drop.age) * 2.5;
      drop.ring.scale.setScalar(1 + 0.12 * Math.sin(this.time * 4));
      const reach = (group.position.x - playerPosition.x) ** 2 + (group.position.y - playerPosition.y) ** 2;
      if (active && drop.age > 0.4 && reach < PICKUP_REACH ** 2) {
        picked.push(drop.charm);
        this.remove(drop);
      }
    }
    return picked;
  }

  /** At the end of a wave every charm left on the ground flies to Tode. */
  vacuum() {
    for (const drop of this.list) drop.flying = true;
  }

  remove(drop) {
    this.list.splice(this.list.indexOf(drop), 1);
    drop.group.removeFromParent();
    drop.gem.material.dispose();
    drop.ring.material.dispose();
    drop.group.children[2].material.dispose();
  }

  clear() {
    for (const drop of [...this.list]) this.remove(drop);
  }
}
