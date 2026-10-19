import * as THREE from 'three';
import { withoutSilhouette } from './PlayerBeacon.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural voxel frogs for the classes (a look test; the game still uses tode.glb). They match Tode's blocky style
 * but every limb has its own joint, so they can really animate: breathing, blinking, hopping, spitting, dashing,
 * cheering and a signature move per class.
 *
 * Built Y-up, facing +Z, standing on y = 0, about Tode's size (the game would turn them Z-up like the bees).
 * `buildFrog(id)` returns { root, play(name), update(delta) }.
 */

// Looks per class. `build` stretches the body: [width, height, length], plus the leg length.
export const FROG_CLASSES = {
  tode: {
    name: 'Tode',
    short: 'Tode',
    title: 'The Classic',
    text: 'Balanced: spit, tea bombs and a hop-dash.',
    colors: { skin: '#3f9d3a', back: '#2f8a2e', belly: '#b9dd7a', eye: '#141414', ring: '#9ad35a', mouth: '#173d14', hand: '#4fb04a' },
    build: { width: 1, height: 1, length: 1, legs: 1 },
    signature: 'sip',
  },
  brawler: {
    name: 'Bullfrog Brawler',
    short: 'Brawler',
    title: 'The Wall',
    text: '8 hearts, slow. Spit like a shotgun, tongue lash built in, dashes hit hard.',
    colors: { skin: '#5d6b2a', back: '#45521c', belly: '#e8d27a', eye: '#1a1208', ring: '#d9b03a', mouth: '#2a2a0c', hand: '#6d7a32' },
    build: { width: 1.25, height: 1.15, length: 1.1, legs: 1.05, scale: 1.18 },
    signature: 'slam',
  },
  sharpshooter: {
    name: 'Tree Frog Sharpshooter',
    short: 'Sharpshooter',
    title: 'The Eye',
    text: '4 hearts. Long-range piercing spit and extra critical hits.',
    colors: { skin: '#7ed957', back: '#5fc23c', belly: '#f2f6d0', eye: '#d42a1a', ring: '#ff6a3a', mouth: '#2d5a1a', hand: '#ff8a2a', flank: '#2f6bd9' },
    build: { width: 0.85, height: 0.9, length: 1.05, legs: 1.3 },
    signature: 'aim',
  },
  alchemist: {
    name: 'Toad Alchemist',
    short: 'Alchemist',
    title: 'The Brewer',
    text: 'Weak spit. Three tea bombs that recharge fast, and brews that bubble over.',
    colors: { skin: '#9a6f3a', back: '#7a5428', belly: '#e0c48a', eye: '#d9a020', ring: '#5a3a18', mouth: '#3a2410', hand: '#a87a42', wart: '#6a4a20' },
    build: { width: 1.15, height: 1, length: 1, legs: 0.9 },
    signature: 'throw',
  },
  mage: {
    name: 'Starleaf Mage',
    short: 'Mage',
    title: 'The Spark',
    text: 'Fragile. Spit becomes homing magic bolts; skills recharge faster.',
    colors: { skin: '#5fc8bd', back: '#47ada3', belly: '#dff6f0', eye: '#2a1a4a', ring: '#b48cff', mouth: '#1f4a46', hand: '#72d8cf' },
    build: { width: 0.95, height: 0.95, length: 0.95, legs: 1 },
    signature: 'cast',
  },
  summoner: {
    name: 'Toad Summoner',
    short: 'Summoner',
    title: 'The Caller',
    text: 'Weak alone. Calls helpers that fight for him; his ultimate is a giant ancient toad.',
    colors: { skin: '#7d8a5a', back: '#66724a', belly: '#d8d0a0', eye: '#e8b020', ring: '#3a2a10', mouth: '#2a2a14', hand: '#8a9666' },
    build: { width: 1.1, height: 1.05, length: 1, legs: 0.95 },
    signature: 'summon',
  },
  ninja: {
    name: 'Ninja Toad',
    short: 'Ninja',
    title: 'The Shadow',
    text: 'Throws spinning stars; the hop-dash vanishes in smoke and leaves a decoy.',
    colors: { skin: '#4a5a5e', back: '#3a484c', belly: '#9aa8a4', eye: '#f0c020', ring: '#1a1a1a', mouth: '#1a2224', hand: '#55666a' },
    build: { width: 0.95, height: 0.95, length: 1, legs: 1.15 },
    signature: 'vanish',
  },
  // The Summoner's companions: little pond toads with lily-pad hats (not a class of their own).
  pondling: {
    hidden: true,
    name: 'Pond Toad',
    colors: { skin: '#5fbf6a', back: '#4aa856', belly: '#d8f0b0', eye: '#141414', ring: '#a8e07a', mouth: '#1f4a24', hand: '#6fd07a' },
    build: { width: 0.95, height: 0.95, length: 0.9, legs: 1 },
    signature: 'idle',
  },
  // The Summoner's giant: not a class of its own (hidden from the class list).
  giant: {
    hidden: true,
    name: 'Ancient Pond Toad',
    colors: { skin: '#6b7f5a', back: '#56684a', belly: '#c9c79a', eye: '#e0a020', ring: '#3a2a10', mouth: '#24301c', hand: '#748a62', wart: '#4f5f40' },
    build: { width: 1.2, height: 1.1, length: 1.05, legs: 0.9 },
    signature: 'idle',
  },
};

const PUFF = new THREE.BoxGeometry(1, 1, 1);

/**
 * A cloud of smoke that swells and fades: `set(k)` shows it at k (0–1) of its life, hidden outside that. It is a pure
 * function of k, so a frozen frame looks the same as a live one.
 */
function smoke(parent, position, { radius = 10, count = 16, color = '#f4f4f0' } = {}) {
  const group = new THREE.Group();
  group.position.set(...position);
  const material = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.9, flatShading: true, roughness: 1, depthWrite: false });
  const puffs = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.4;
    const lift = 0.15 + (i % 4) * 0.28;
    const mesh = new THREE.Mesh(PUFF, material);
    group.add(mesh);
    return { mesh, direction: new THREE.Vector3(Math.cos(angle), lift, Math.sin(angle)), size: 0.7 + ((i * 37) % 10) / 15 };
  });
  group.visible = false;
  parent.add(group);
  return {
    set(k) {
      group.visible = k > 0 && k < 1;
      if (!group.visible) return;
      const grow = 1 - (1 - k) ** 3;
      for (const { mesh, direction, size } of puffs) {
        mesh.position.copy(direction).multiplyScalar(radius * grow);
        mesh.scale.setScalar(radius * 0.5 * size * (0.4 + grow));
        mesh.rotation.set(k * 2 + size, k * 3, 0);
      }
      material.opacity = 0.9 * (1 - k * k);
    },
  };
}

/** A glowing rune circle on the ground: `set(k, turn)` fades it in and out and turns it. */
function runeCircle(parent, position, radius, color) {
  const group = new THREE.Group();
  group.position.set(...position);
  const boxes = [];
  const count = Math.round(radius * 1.6);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    box(boxes, [radius * 0.12, 0.3, 1], [Math.cos(angle) * radius, 0, Math.sin(angle) * radius], color, [0, -angle, 0]);
    if (i % 2 === 0) box(boxes, [radius * 0.08, 0.3, 0.8], [Math.cos(angle) * radius * 0.78, 0, Math.sin(angle) * radius * 0.78], color, [0, -angle, 0]);
  }
  for (let i = 0; i < 6; i++) {
    // A six-pointed star of spokes.
    const angle = (i / 6) * Math.PI * 2;
    box(boxes, [radius * 1.5, 0.3, 0.8], [0, 0, 0], color, [0, angle, 0]);
  }
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, depthWrite: false });
  group.add(new THREE.Mesh(mergeGeometries(boxes), material));
  group.visible = false;
  parent.add(group);
  return {
    set(k, turn = 0) {
      group.visible = k > 0;
      material.opacity = Math.min(1, k * 1.2);
      group.rotation.y = turn;
      group.scale.setScalar(0.6 + 0.4 * Math.min(1, k * 2));
    },
  };
}

/** Sparks bursting out from a point: `set(k)` flies them out and fades them. */
function sparks(parent, position, { count = 14, reach = 22, color = '#fff27a' } = {}) {
  const group = new THREE.Group();
  group.position.set(...position);
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, depthWrite: false });
  const bits = Array.from({ length: count }, (_, i) => {
    const mesh = new THREE.Mesh(PUFF, material);
    const theta = (i / count) * Math.PI * 2;
    const rise = ((i * 53) % 10) / 10 - 0.3;
    group.add(mesh);
    return { mesh, direction: new THREE.Vector3(Math.cos(theta), rise, Math.sin(theta)).normalize() };
  });
  group.visible = false;
  parent.add(group);
  return {
    set(k) {
      group.visible = k > 0 && k < 1;
      if (!group.visible) return;
      for (const { mesh, direction } of bits) {
        mesh.position.copy(direction).multiplyScalar(reach * (1 - (1 - k) ** 2));
        mesh.scale.setScalar(1.6 * (1 - k) + 0.3);
      }
      material.opacity = 1 - k * k;
    },
  };
}

const tmpColor = new THREE.Color();

/** A box of `size` at `position` (optionally turned), coloured by vertex colour, ready to merge into a part. */
export function box(boxes, size, position, color, rotation = null) {
  const geometry = new THREE.BoxGeometry(...size).toNonIndexed();
  if (rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
  geometry.translate(...position);
  tmpColor.set(color);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < geometry.attributes.position.count; i++) tmpColor.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  boxes.push(geometry);
}

const SKIN = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75 });
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const CLOTH = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });

const SHARED = { skin: SKIN, glow: GLOW, cloth: CLOTH };

/** A moving part: a pivot group holding merged boxes (and glowing ones). */
function part(parent, pivot, draw, { glow = null, cloth = null } = {}, materials = SHARED) {
  const group = new THREE.Group();
  group.position.set(...pivot);
  const add = (fill, material) => {
    if (!fill) return;
    const boxes = [];
    fill(boxes);
    if (!boxes.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(boxes), material);
    mesh.castShadow = true;
    group.add(mesh);
  };
  add(draw, materials.skin);
  add(glow, materials.glow);
  add(cloth, materials.cloth);
  parent.add(group);
  return group;
}

/** Builds a frog of a class: its parts, its gear and its animations. */
export function buildFrog(id, { ownMaterials = false } = {}) {
  // In the game every frog gets its own materials, so ascension can turn just this one golden.
  const materials = ownMaterials ? { skin: SKIN.clone(), glow: GLOW.clone(), cloth: CLOTH.clone() } : SHARED;
  const piece = (parent, pivot, draw, extra = {}) => part(parent, pivot, draw, extra, materials);
  const look = FROG_CLASSES[id];
  const c = look.colors;
  const b = look.build;
  const W = 14 * b.width;
  const H = 9 * b.height;
  const L = 15 * b.length;
  const legs = b.legs;

  const root = new THREE.Group();
  const frame = new THREE.Group(); // the whole frog moves with this (hops, flips)
  frame.scale.setScalar(b.scale ?? 1);
  root.add(frame);

  // --- Body -------------------------------------------------------------------------------------
  const bodyY = 6.5 * legs;
  const body = piece(frame, [0, bodyY, 0], (p) => {
    box(p, [W, H, L], [0, 1.5, 0], c.skin);
    box(p, [W - 2, 1.2, L - 2], [0, 1.5 + H / 2 + 0.4, -0.5], c.back);
    box(p, [W - 3, 2, L - 3], [0, 1.5 - H / 2 - 0.6, 1.5], c.belly);
    if (c.flank) for (const s of [-1, 1]) box(p, [0.6, H - 3, L - 4], [s * (W / 2 + 0.2), 0.5, -0.5], c.flank);
    if (c.spot) {
      for (const [x, z, s] of [[-3, -3, 2.4], [3.5, 1, 2], [0, -5.5, 1.8], [-4.5, 3, 1.6], [4, -4, 1.6]]) {
        box(p, [s, 0.5, s], [x * b.width, 1.5 + H / 2 + 1.1, z * b.length], c.spot);
      }
      for (const s of [-1, 1]) {
        for (const [y, z, size] of [[2.5, -3, 2.4], [-0.5, 2.5, 2], [0, -6, 1.6], [3.5, 3.5, 1.4]]) {
          box(p, [0.5, size, size], [s * (W / 2 + 0.2), y, z * b.length], c.spot);
        }
      }
    }
    if (c.wart) {
      for (const [x, z] of [[-3.5, -4], [2.5, -2], [-1, 1.5], [4, 2.5], [-4.5, 0.5], [1, -5.5], [3.5, -6]]) {
        box(p, [1.6, 1, 1.6], [x * b.width, 1.5 + H / 2 + 1.2, z], c.wart);
      }
    }
  });
  body.rotation.x = -0.18; // sitting up a little, like Tode

  // --- Head (on the neck), with a jaw that opens and eyes that blink ------------------------------
  const headW = W * 0.95;
  const head = piece(body, [0, 2.5 + H * 0.25, L / 2 - 1.5], (p) => {
    box(p, [headW, 5, 10], [0, 2.5, 4], c.skin);
    box(p, [headW - 2, 1, 8], [0, 5.4, 3.5], c.back);
    box(p, [headW - 1, 0.7, 0.6], [0, 0.4, 9.1], c.mouth); // the long frog smile
    box(p, [1.4, 0.8, 0.6], [-2, 3.4, 9.1], c.mouth); // nostrils
    box(p, [1.4, 0.8, 0.6], [2, 3.4, 9.1], c.mouth);
    if (c.spot) for (const [x, z] of [[-2.5, 7], [2, 1], [0.5, 8.4]]) box(p, [1.8, 0.4, 1.8], [x, 6, z], c.spot);
  });
  const jaw = piece(head, [0, 0.4, 0], (p) => {
    box(p, [headW - 0.6, 2.4, 9.6], [0, -1.2, 4.2], c.skin);
    box(p, [headW - 3, 1, 7], [0, -2.5, 4.5], c.belly);
  });
  const throat = piece(jaw, [0, -2.4, 4.5], (p) => box(p, [7, 2.2, 5], [0, -0.6, 0], c.belly));
  // The tongue lies in the mouth and shoots out when spitting.
  const tongue = piece(jaw, [0, -0.7, 2], (p) => {
    box(p, [3, 0.8, 5], [0, 0, 2.5], '#ff6f91');
    box(p, [3.8, 1.2, 1.8], [0, 0, 5.2], '#ff4a78');
  });
  const eyes = [];
  const sockets = [];
  for (const s of [-1, 1]) {
    const x = s * (headW / 2 - 2.4);
    // Big eyes bulging up from the top of the head, like Tode's.
    const socket = piece(head, [x, 6.8, 4], (p) => {
      box(p, [5.4, 5.6, 5.4], [0, 0.4, 0], c.skin);
      box(p, [5.6, 1, 5.6], [0, 3.2, 0], c.back);
    });
    const eye = piece(socket, [0, 0.6, 2.5], (p) => {
      box(p, [4.4, 4.2, 1], [0, 0, 0.3], c.ring);
      box(p, [3.4, 3.4, 0.8], [s * 0.2, -0.1, 0.8], c.eye);
    }, { glow: (p) => box(p, [1.1, 1.1, 0.4], [s * -0.6, 0.8, 1.3], '#ffffff') });
    eyes.push(eye);
    sockets.push(socket);
  }

  // --- Arms: shoulder, elbow, a webbed hand -------------------------------------------------------
  const arms = [];
  for (const s of [-1, 1]) {
    // Elbows out, hands turned in under the chest: a frog's arms, not a table's legs.
    const arm = piece(body, [s * (W / 2 - 2), -0.5, L / 2 - 2.5], (p) => box(p, [3, 4.4, 3], [0, -2.2, 0.5], c.skin));
    arm.rotation.z = s * 0.45;
    const forearm = piece(arm, [0, -4.2, 0.5], (p) => box(p, [2.6, 3.8 * legs, 2.6], [0, -1.9 * legs, 0.4], c.skin));
    forearm.rotation.z = -s * 0.7;
    const hand = piece(forearm, [0, -3.8 * legs, 0.6], (p) => {
      box(p, [4, 1, 3.4], [s * 0.5, -0.4, 1.2], c.hand);
      for (const f of [-1, 0, 1]) box(p, [1, 0.8, 2], [s * 0.5 + f * 1.5, -0.5, 3.6 - Math.abs(f) * 0.4], c.hand);
    });
    hand.rotation.z = s * 0.25;
    arms.push({ side: s, arm, forearm, hand });
  }

  // --- Back legs: a folded thigh, shin and long foot ----------------------------------------------
  const hindLegs = [];
  for (const s of [-1, 1]) {
    const thigh = piece(body, [s * (W / 2 - 0.5), -1.5, -L / 2 + 3], (p) => box(p, [4.4, 4.6, 8 * legs], [s * 0.6, -0.6, 3 * legs], c.skin));
    const shin = piece(thigh, [s * 0.6, -1.6, 6.5 * legs], (p) => box(p, [3.4, 3.2, 8 * legs], [0, -1, -3.6 * legs], c.back));
    const foot = piece(shin, [0, -2.2, -7.2 * legs], (p) => {
      box(p, [4.4, 1.2, 7 * legs], [s * 0.4, -0.9, 3 * legs], c.hand);
      for (const f of [-1, 0, 1]) box(p, [1.1, 0.9, 2.4], [s * 0.4 + f * 1.6, -1, 6.6 * legs + 0.6 - Math.abs(f) * 0.5], c.hand);
    });
    hindLegs.push({ side: s, thigh, shin, foot });
  }

  // --- Gear per class ------------------------------------------------------------------------------
  const gear = {};
  // The class's own gear per wardrobe slot: a worn item (WearableModels.js) covers what's in its slot.
  const slotGear = { head: [], face: [], back: [] };
  const tag = (slot, group) => (slotGear[slot].push(group), group);
  {
    // A teacup for the sip (Tode's signature; every frog sips in the ending). Only shown while sipping. Carried
    // by the head (the sip moves it from below the chin up to the mouth), so it always shows.
    gear.cup = piece(head, [-2, -6, 10], (p) => {
      box(p, [4, 3.2, 4], [0, 0, 0], '#f4f1ea');
      box(p, [3.2, 0.3, 3.2], [0, 1.55, 0], '#b06a2a');
      box(p, [1, 2, 1], [-2.5, 0.2, 0], '#f4f1ea');
      box(p, [5, 0.5, 5], [0, -1.6, 0], '#f4f1ea');
      box(p, [4.2, 0.6, 4.2], [0, -0.4, 0], '#7fb8e8'); // a blue band
    });
    gear.cup.visible = false;
  }
  if (id === 'brawler') {
    // An iron helmet with horns (behind his eyes), brass bracers and a belt.
    tag('head', piece(head, [0, 6.6, -0.8], (p) => {
      box(p, [headW + 1, 2.6, 7], [0, 0, 0], '#6a6a72');
      box(p, [headW + 1.6, 0.8, 7.6], [0, -1.3, 0], '#8a8a92');
      box(p, [1.2, 0.8, 7.4], [0, 1.6, 0], '#8a8a92');
      for (const s of [-1, 1]) {
        box(p, [1.6, 1.6, 1.6], [s * (headW / 2 + 1.2), 0.6, 0], '#e8dcc0');
        box(p, [1.2, 2.6, 1.2], [s * (headW / 2 + 2.2), 2, 0], '#e8dcc0', [0, 0, -s * 0.5]);
        box(p, [0.9, 2, 0.9], [s * (headW / 2 + 2.6), 3.8, 0], '#f4ecd8', [0, 0, -s * 0.1]);
      }
    }));
    for (const { forearm } of arms) piece(forearm, [0, -2.2, 0.4], (p) => box(p, [3.4, 2, 3.4], [0, 0, 0], '#c9922a'));
    piece(body, [0, -1.6, 0], (p) => {
      box(p, [W + 0.6, 1.6, L + 0.6], [0, 0, 0], '#5a3418');
      box(p, [3, 2.2, 0.8], [0, 0, L / 2 + 0.6], '#d9b03a');
    });
  }
  if (id === 'sharpshooter') {
    // A leaf hood and a cape that sways, and a bamboo blowpipe on the back (in the hands when aiming).
    tag('head', piece(head, [0, 6, -1.8], () => {}, {
      cloth: (p) => {
        box(p, [headW + 1.2, 1, 5], [0, 0, 0], '#3a7a2a');
        box(p, [headW + 1.2, 6, 1], [0, -2.6, -2.4], '#3a7a2a');
        for (const s of [-1, 1]) box(p, [1, 5, 5], [s * (headW / 2 + 0.6), -2.2, 0], '#3a7a2a');
        box(p, [2, 1.6, 2.4], [0, 1, -1.2], '#2f6a22');
      },
    }));
    gear.cape = tag('back', piece(body, [0, 5.6, -L / 2 + 2], () => {}, { cloth: (p) => box(p, [W - 1, 0.6, 10], [0, 0, -4], '#3a7a2a') }));
    gear.pipe = piece(body, [W / 2 - 3, 6.4, -2], (p) => {
      box(p, [1.4, 1.4, 18], [0, 0, 0], '#c9b26a');
      for (const z of [-6, 0, 6]) box(p, [1.8, 1.8, 0.6], [0, 0, z], '#8a7a3a');
    });
    gear.pipe.rotation.set(0.5, 0, 0.3);
    tag('back', gear.pipe);
    // While aiming, the blowpipe is at the mouth (held by the head, so it lines up with the eyes).
    gear.aimPipe = piece(head, [0, 1.2, 9], (p) => {
      box(p, [1.4, 1.4, 16], [0, 0, 8], '#c9b26a');
      for (const z of [3, 9, 15]) box(p, [1.8, 1.8, 0.6], [0, 0, z], '#8a7a3a');
    });
    gear.aimPipe.visible = false;
  }
  if (id === 'alchemist') {
    // Brass goggles, a belt of glowing vials and a little kettle on the back that steams.
    tag('face', piece(head, [0, 6.8, 5.5], (p) => {
      box(p, [headW + 0.8, 1, 1.4], [0, 0, -2], '#4a2a10');
      for (const s of [-1, 1]) {
        box(p, [3.2, 3.2, 1.6], [s * 2.6, 0.6, 0], '#c9922a');
        box(p, [2.2, 2.2, 0.4], [s * 2.6, 0.6, 0.9], '#5fd8e8');
      }
    }));
    piece(body, [0, -1.4, 0], (p) => box(p, [W + 0.6, 1.4, L + 0.6], [0, 0, 0], '#4a2a10'), {
      glow: (p) => {
        for (const [x, color] of [[-4, '#7dff6a'], [0, '#ff5ad0'], [4, '#5ac8ff']]) {
          box(p, [1.8, 2.6, 1.8], [x * b.width, -0.6, L / 2 + 1.1], color);
        }
      },
    });
    gear.kettle = piece(body, [0, 6.4, -3], (p) => {
      box(p, [7, 5, 6], [0, 2.5, 0], '#8a8f96');
      box(p, [5, 1, 4], [0, 5.5, 0], '#a8adb4');
      box(p, [1.6, 1, 1.6], [0, 6.4, 0], '#2a2a2a');
      box(p, [1.4, 1.4, 4], [0, 3, 4], '#8a8f96', [0.5, 0, 0]);
    });
    tag('back', gear.kettle);
    gear.potion = piece(arms[0].hand, [0, 1.8, 2.2], () => {}, {
      glow: (p) => {
        box(p, [2.4, 3, 2.4], [0, 0, 0], '#7dff6a');
        box(p, [1.2, 1.2, 1.2], [0, 2, 0], '#e8f4ff');
      },
    });
    gear.potion.visible = false;
  }
  if (id === 'mage') {
    // A tall starry wizard's hat (its brim above the eyes), a purple cape and a staff with a glowing orb.
    tag('head', piece(head, [0, 10.8, 1], (p) => {
      box(p, [headW + 5, 0.8, 14], [0, 0, 0], '#3a2a8a');
      box(p, [headW - 0.6, 1, 9.4], [0, 1, -0.5], '#d9b03a');
      box(p, [headW - 1, 3, 9], [0, 2.8, -0.5], '#3a2a8a');
      box(p, [headW - 4, 3, 7], [0, 5.6, -1], '#3a2a8a');
      box(p, [headW - 7, 3, 5], [0, 8.4, -2], '#3a2a8a');
      box(p, [2.6, 3, 3], [0, 10.8, -3.6], '#3a2a8a', [-0.5, 0, 0]);
    }, {
      glow: (p) => {
        for (const [x, y, z] of [[-3, 3, 4], [3.5, 5.5, 2.6], [-1.5, 8, 0.6], [4.6, 2.5, 1]]) box(p, [1, 1, 0.4], [x, y, z], '#fff27a');
      },
    }));
    gear.cape = tag('back', piece(body, [0, 5.4, -L / 2 + 2], () => {}, {
      cloth: (p) => {
        box(p, [W, 0.6, 11], [0, 0, -4.5], '#4a3aa8');
        box(p, [W + 1, 1.4, 2], [0, 0.4, 1.5], '#d9b03a');
      },
    }));
    // The staff stands at his right side, in his hand (held by the body, so it stays upright when he lifts it).
    gear.staff = piece(body, [W / 2 + 1.2, -bodyY + 0.5, L / 2 - 1], (p) => {
      box(p, [1.2, 30, 1.2], [0, 15, 0], '#6a4a2a');
      box(p, [2.4, 1, 2.4], [0, 29.6, 0], '#d9b03a');
      for (const s of [-1, 1]) box(p, [0.8, 3.4, 0.8], [s * 1.6, 31.4, 0], '#d9b03a', [0, 0, -s * 0.3]);
    });
    gear.orb = piece(gear.staff, [0, 32.6, 0], () => {}, { glow: (p) => box(p, [3.4, 3.4, 3.4], [0, 0, 0], '#c8a8ff') });
    gear.runes = runeCircle(root, [0, 0.4, 0], 20, '#b48cff');
    gear.burst = sparks(gear.orb, [0, 0, 0], { reach: 26, color: '#e0d0ff' });
  }
  if (id === 'summoner') {
    // A purple robe with gold trim, white bushy brows, prayer beads and a big scroll across his back.
    piece(body, [0, 0.6, 0.2], (p) => {
      box(p, [W + 1, H * 0.7, L + 0.6], [0, 0, 0], '#5a3a8a');
      box(p, [W + 1.4, 1, L + 1], [0, -H * 0.35, 0], '#d9b03a');
      box(p, [2.4, H * 0.7, 0.4], [0, 0, L / 2 + 0.6], '#d9b03a'); // the robe's opening
    });
    for (const s of [-1, 1]) piece(head, [s * (headW / 2 - 2.4), 10.8, 5.4], (p) => box(p, [4.4, 1.6, 2.4], [s * 0.6, 0, 0], '#f4f4f0', [0, 0, -s * 0.25]));
    piece(body, [0, 0, 0], (p) => {
      for (let i = -4; i <= 4; i++) box(p, [1.5, 1.5, 1.5], [i * 1.5 * b.width, 4.6 - i * i * 0.2, L / 2 + 0.4], i === 0 ? '#c2402a' : '#4a2410');
    });
    tag('back', piece(body, [0, 7.6, -2.5], (p) => {
      box(p, [W + 5, 3.6, 3.6], [0, 0, 0], '#efe6c8');
      for (const s of [-1, 1]) box(p, [1.4, 4.6, 4.6], [s * (W / 2 + 3), 0, 0], '#a83a2a');
      box(p, [1, 3.9, 3.9], [0, 0, 0], '#a83a2a');
    }));
    // The giant he calls up: an ancient toad that rises out of a cloud behind him.
    gear.giant = buildFrog('giant');
    gear.giant.root.position.set(0, 0, -42);
    gear.giant.root.visible = false;
    root.add(gear.giant.root);
    gear.circle = runeCircle(root, [0, 0.3, -42], 30, '#ff9a3a');
    gear.smokeIn = smoke(root, [0, 4, -42], { radius: 36, count: 24 });
    gear.smokeOut = smoke(root, [0, 4, -42], { radius: 36, count: 24 });
  }
  if (id === 'pondling') {
    piece(head, [0, 10.4, 3], (p) => {
      box(p, [12, 0.7, 12], [0, 0, 0], '#3f9d3a');
      box(p, [4, 0.8, 4], [3.5, 0.05, 3.5], '#5fbf6a'); // the notch in the pad, a lighter wedge
      box(p, [1, 2.4, 1], [-1, 1.4, -1], '#ff9ec7'); // and a little flower
      box(p, [2.2, 1, 2.2], [-1, 2.8, -1], '#ffd1e3');
    });
  }
  if (id === 'giant') {
    // A wide straw hat and a thick sacred rope with paper streamers.
    piece(head, [0, 10.6, 3.5], (p) => {
      box(p, [headW + 12, 0.8, 19], [0, 0, 0], '#d9b86a');
      box(p, [headW + 5, 1, 13], [0, 1, 0], '#c9a85a');
      box(p, [headW - 2, 1, 8], [0, 2, 0], '#d9b86a');
      box(p, [3, 1.2, 3], [0, 3, 0], '#a8884a');
    });
    piece(body, [0, 3.4, 0.4], (p) => {
      box(p, [W + 1.4, 2, L + 1], [0, 0, 0], '#e8d8a8');
      for (const x of [-4, 0, 4]) box(p, [1.4, 3.6, 0.3], [x, -2.4, L / 2 + 0.8], '#ffffff');
    });
  }
  if (id === 'ninja') {
    // A hood with a face mask (the eyes peek out), a scarf, two swords crossed on the back and a belt with a star.
    tag('head', piece(head, [0, 0, 0], () => {}, {
      cloth: (p) => {
        box(p, [headW + 1, 3.4, 1.2], [0, 1.6, 9.5], '#22232e'); // the mask over the mouth
        for (const s of [-1, 1]) box(p, [1, 6, 10], [s * (headW / 2 + 0.5), 2.6, 4], '#22232e');
        box(p, [headW + 1, 6.4, 1], [0, 2.8, -1.4], '#22232e');
        box(p, [headW + 1, 1, 5], [0, 5.9, 1], '#22232e');
      },
    }));
    for (const socket of sockets) tag('head', piece(socket, [0, 3.3, -0.6], () => {}, { cloth: (p) => box(p, [6.2, 1.4, 5], [0, 0, 0], '#22232e') }));
    piece(body, [0, 5.8, L / 2 - 3], (p) => box(p, [W + 1, 2, 4], [0, 0, 0], '#3a2a6a'));
    gear.tails = [-1, 1].map((s) => {
      const tail = piece(body, [s * 2, 5.8, L / 2 - 5], (p) => box(p, [1.6, 0.6, 7], [0, 0, -3.5], '#3a2a6a'));
      tail.rotation.set(0.5, s * 0.4, 0);
      return tail;
    });
    for (const s of [-1, 1]) {
      const sword = tag('back', piece(body, [0, 8, -3.6], (p) => {
        box(p, [1.4, 17, 1], [0, 0, 0], '#1a1a22');
        box(p, [3, 0.6, 2], [0, 8.8, 0], '#c9a23a');
        box(p, [1.2, 6, 1.2], [0, 12.2, 0], '#2a1a14');
        for (const y of [10.4, 12, 13.6]) box(p, [1.5, 0.8, 1.5], [0, y, 0], '#a83a2a', [0, 0.785, 0]);
      }));
      sword.rotation.set(-0.15, 0, s * 0.6);
    }
    piece(body, [0, -1.6, 0], (p) => {
      box(p, [W + 0.6, 1.2, L + 0.6], [0, 0, 0], '#22232e');
      box(p, [3.4, 0.9, 0.4], [W / 4, 0, L / 2 + 0.6], '#b8bcc4', [0, 0, 0.785]);
      box(p, [3.4, 0.9, 0.4], [W / 4, 0, L / 2 + 0.6], '#b8bcc4', [0, 0, -0.785]);
    });
    // The decoy log he leaves behind, and the clouds he vanishes and reappears in.
    gear.log = piece(root, [0, 4, 0], (p) => {
      box(p, [7, 7, 13], [0, 0, 0], '#8a5a33');
      for (const z of [-6.6, 6.6]) box(p, [6, 6, 0.4], [0, 0, z], '#d9b07a');
      box(p, [1.4, 3, 1.4], [2, 4, 2], '#6a4a2a');
    });
    gear.log.visible = false;
    gear.smokeA = smoke(root, [0, 6, 0], { radius: 14 });
    gear.smokeB = smoke(root, [0, 6, 16], { radius: 14 });
    gear.smokeC = smoke(root, [0, 6, 0], { radius: 12 });
  }

  // --- Animation ----------------------------------------------------------------------------------
  // Every frame starts from the rest pose; the current move then bends the joints.
  const joints = [
    frame, body, head, jaw, throat, tongue, ...eyes,
    ...arms.flatMap((a) => [a.arm, a.forearm, a.hand]),
    ...hindLegs.flatMap((l) => [l.thigh, l.shin, l.foot]),
    ...(gear.tails ?? []), // (they sway every frame, so they start from rest too)
    ...[gear.orb, gear.staff, gear.giant?.root].filter(Boolean),
  ];
  const rest = joints.map((j) => ({ position: j.position.clone(), rotation: j.rotation.clone(), scale: j.scale.clone() }));
  const resetPose = () =>
    joints.forEach((j, i) => {
      j.position.copy(rest[i].position);
      j.rotation.copy(rest[i].rotation);
      j.scale.copy(rest[i].scale);
    });

  const ease = (t) => t * t * (3 - 2 * t);
  const bump = (t, from, to) => (t <= from || t >= to ? 0 : Math.sin(((t - from) / (to - from)) * Math.PI));
  const ramp = (t, from, to) => ease(THREE.MathUtils.clamp((t - from) / (to - from), 0, 1));

  /** Legs: `k` 0 = folded (sitting), 1 = fully stretched backwards (a leap). */
  const stretchLegs = (k, spread = 0) => {
    for (const { side, thigh, shin, foot } of hindLegs) {
      thigh.rotation.x += 2.6 * k;
      thigh.rotation.z += side * spread;
      shin.rotation.x += -1.2 * k;
      foot.rotation.x += 0.8 * k;
    }
  };
  /** Arms: `reach` forward (positive) or back, `raise` up over the head in a V. */
  const moveArms = (reach, raise = 0, sides = [-1, 1]) => {
    for (const { side, arm, forearm } of arms) {
      if (!sides.includes(side)) continue;
      arm.rotation.x += -reach - raise * 0.3;
      arm.rotation.z += side * raise * 2.1;
      forearm.rotation.z += side * raise * 0.6;
      forearm.rotation.x += reach * 0.4;
    }
  };
  /** Both hands together in front of the chest, fingers up: a hand sign. */
  const handSign = (k) => {
    for (const { side, arm, forearm, hand } of arms) {
      arm.rotation.x += -k * 1.15;
      arm.rotation.z += -side * k * 0.55;
      forearm.rotation.x += -k * 0.7;
      forearm.rotation.z += side * k * 0.95;
      hand.rotation.x += -k * 0.9;
    }
  };
  // Overshoots a little and settles: things that pop into existence.
  const pop = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2);

  let time = 0;
  let move = 'idle';
  let moveTime = 0;
  let blinkIn = 2;
  let once = false; // a one-shot move returns to idle when it is done (the preview loops instead)
  let lengthOverride = null;
  let locomotion = 0; // 0–1: how far the legs are pushed out in a running hop (the game sets it)
  let flickLeft = 0;
  const FLICK = 0.2;

  const MOVES = {
    idle: { length: 3, pose: () => {} },
    hop: {
      length: 0.9,
      pose: (t) => {
        const crouch = bump(t, 0, 0.25) * 0.6;
        const air = bump(t, 0.2, 0.85);
        // Crouch, then leap: the body levels out, the hind legs trail straight back, the arms reach ahead.
        frame.position.y += air * 12 - crouch * 1.5;
        frame.position.z += Math.sin(t * Math.PI * 2) * 0.5;
        body.rotation.x += air * 0.2 + crouch * 0.15;
        stretchLegs(air - crouch * 0.2);
        moveArms(air * 0.9);
        head.rotation.x += -air * 0.1;
      },
    },
    attack: {
      length: 0.8,
      pose: (t) => {
        const windup = bump(t, 0, 0.35);
        const strike = bump(t, 0.3, 0.6);
        body.rotation.x += windup * 0.15 - strike * 0.25;
        head.rotation.x += windup * 0.3 - strike * 0.5;
        jaw.rotation.x += strike * 0.9;
        throat.scale.setScalar(1 + windup * 0.9);
        frame.position.z += strike * 2;
        // The tongue lashes out and snaps back.
        const lash = bump(t, 0.35, 0.65);
        tongue.scale.z = 1 + lash * 3.5;
        tongue.rotation.x = -lash * 0.4; // level, against the open jaw
      },
    },
    dash: {
      length: 0.7,
      pose: (t) => {
        const fly = bump(t, 0.05, 0.7);
        // A long, low lunge: flat out, legs fully stretched, arms forward.
        frame.position.y += fly * 6;
        frame.position.z += (ramp(t, 0.05, 0.6) - ramp(t, 0.6, 1)) * 10;
        body.rotation.x += fly * 0.35;
        head.rotation.x += -fly * 0.2;
        stretchLegs(fly * 1.15, 0.15);
        moveArms(fly * 1.3);
        for (const eye of eyes) eye.scale.y *= 1 - fly * 0.5; // squinting into the wind
      },
    },
    victory: {
      length: 2,
      pose: (t) => {
        const up = ramp(t, 0, 0.25) - ramp(t, 0.85, 1);
        const bounce = Math.abs(Math.sin(t * Math.PI * 4)) * up;
        frame.position.y += bounce * 4 + up * 5;
        body.rotation.x += -up * 0.95;
        head.rotation.x += up * 0.55;
        moveArms(0, up * (0.85 + 0.15 * Math.sin(t * Math.PI * 8)));
        stretchLegs(up * 0.35, up * 0.2);
        jaw.rotation.x += up * 0.5;
      },
    },
    sip: {
      length: 3,
      pose: (t) => {
        // Tode lifts his teacup, sips, and sighs contentedly.
        const lift = ramp(t, 0, 0.2) - ramp(t, 0.8, 0.95);
        const sip = bump(t, 0.3, 0.65);
        gear.cup.visible = lift > 0.05;
        gear.cup.position.set(-2 - (1 - lift) * 2, -6 + lift * 5.5 + sip * 0.8, 10 + lift * 1.2);
        gear.cup.rotation.x = -sip * 0.5; // tipped to drink
        for (const { side, arm, forearm, hand } of arms) {
          if (side !== -1) continue;
          arm.rotation.x += -lift * 1.5;
          arm.rotation.z += lift * 0.35; // elbow in, cup to the mouth
          forearm.rotation.x += -lift * 1.1;
          forearm.rotation.z += -lift * 0.5;
          hand.rotation.x += lift * 0.9 - sip * 0.5;
        }
        head.rotation.x += -sip * 0.25 + bump(t, 0.7, 0.95) * 0.12;
        for (const eye of eyes) eye.scale.y *= 1 - bump(t, 0.3, 0.95) * 0.85; // eyes closed in bliss
        throat.scale.setScalar(1 + bump(t, 0.68, 0.9) * 0.5);
      },
    },
    slam: {
      length: 1.6,
      pose: (t) => {
        // The Brawler pounds his chest twice, leaps and slams the ground with both fists.
        const pound = bump(t, 0.05, 0.25) + bump(t, 0.25, 0.45);
        const rise = bump(t, 0.45, 0.85);
        const smash = bump(t, 0.75, 0.95);
        body.rotation.x += -pound * 0.25 - rise * 0.4 + smash * 0.45;
        for (const { side, arm, forearm } of arms) {
          const hit = side === -1 ? bump(t, 0.05, 0.25) : bump(t, 0.25, 0.45);
          arm.rotation.x += -hit * 1.4 - rise * 2.6 + smash * 0.6;
          arm.rotation.y += -side * hit * 0.9;
          forearm.rotation.x += -hit * 1.4;
        }
        frame.position.y += rise * 10;
        stretchLegs(rise * 0.7);
        jaw.rotation.x += pound * 0.4 + smash * 0.7;
        frame.scale.y *= 1 - smash * 0.12;
      },
    },
    aim: {
      length: 2.4,
      pose: (t) => {
        // The Sharpshooter crouches, lifts the blowpipe to its mouth, holds… and puffs.
        const ready = ramp(t, 0, 0.25) - ramp(t, 0.85, 1);
        const puff = bump(t, 0.6, 0.72);
        const aiming = ready > 0.5;
        gear.pipe.visible = !aiming;
        gear.aimPipe.visible = aiming;
        body.rotation.x += ready * 0.12 + puff * 0.06; // low and level
        head.rotation.x += -ready * 0.05;
        // Both hands come up to hold the pipe.
        for (const { side, arm, forearm } of arms) {
          arm.rotation.x += -ready * 1.1;
          arm.rotation.z += -side * ready * 0.3;
          forearm.rotation.x += -ready * 0.6;
          forearm.rotation.z += side * ready * 0.5;
        }
        throat.scale.setScalar(1 + bump(t, 0.4, 0.62) * 0.6);
        eyes[0].scale.y *= 1 - ready * 0.8; // one eye closed to aim
        frame.position.z += -puff * 1.2;
      },
    },
    throw: {
      length: 1.6,
      pose: (t) => {
        // The Alchemist pulls a vial from the belt, winds up and lobs it.
        const draw = ramp(t, 0, 0.25);
        const windup = bump(t, 0.2, 0.55);
        const toss = bump(t, 0.5, 0.75);
        gear.potion.visible = t > 0.12 && t < 0.62;
        for (const { side, arm, forearm } of arms) {
          if (side !== -1) continue;
          arm.rotation.x += -draw * 0.4 + windup * 1.2 - toss * 2.8;
          arm.rotation.z += -windup * 0.6;
          forearm.rotation.x += -windup * 1.2 - toss * 0.4;
        }
        body.rotation.y += -windup * 0.35 + toss * 0.4;
        body.rotation.x += -toss * 0.2;
        jaw.rotation.x += toss * 0.5;
        // The thrown vial flies off in an arc.
        if (t >= 0.62 && t < 1) {
          gear.flying ??= gear.potion.clone();
          if (!gear.flying.parent) root.add(gear.flying);
          const k = (t - 0.62) / 0.38;
          gear.flying.visible = true;
          gear.flying.position.set(-4, 14 + k * 16 - k * k * 26, 10 + k * 40);
          gear.flying.rotation.x = k * 12;
        }
      },
    },
    flip: {
      length: 1.2,
      pose: (t) => {
        // The Dart Frog crouches and does a backflip.
        const crouch = bump(t, 0, 0.2) - bump(t, 0.85, 1) * 0.5;
        const spin = ramp(t, 0.15, 0.8);
        const air = bump(t, 0.15, 0.85);
        frame.position.y += air * 22 + 6 * Math.sin(spin * Math.PI) - crouch * 1.5;
        frame.position.z += -air * 4;
        frame.rotation.x += -spin * Math.PI * 2;
        stretchLegs(air * 0.6 - crouch * 0.3);
        moveArms(-air * 0.6, air * 0.4);
        for (const tail of gear.tails ?? []) tail.rotation.x += air * 0.9; // (only the Ninja has tails)
      },
    },
    cast: {
      length: 2.6,
      pose: (t) => {
        // The Mage raises the staff, the orb swells as a rune circle turns under him, then sparks burst out.
        const raise = ramp(t, 0, 0.22) - ramp(t, 0.85, 1);
        const charge = ramp(t, 0.15, 0.6) * (1 - ramp(t, 0.62, 0.8));
        const release = bump(t, 0.6, 0.8);
        // The staff goes up and leans forward, the arm with it.
        gear.staff.position.y += raise * 9;
        gear.staff.rotation.x += raise * 0.35;
        for (const { side, arm, forearm } of arms) {
          if (side === 1) {
            arm.rotation.x += -raise * 1.6;
            arm.rotation.z += raise * 0.5;
            forearm.rotation.x += -raise * 0.5;
          } else {
            arm.rotation.x += -raise * 1.1; // the other hand reaches out, palm forward
            forearm.rotation.x += -raise * 0.4;
          }
        }
        gear.orb.scale.setScalar(1 + charge * 0.9 + Math.sin(time * 22) * 0.1 * charge);
        gear.runes.set(raise, time * 1.4);
        gear.burst.set((t - 0.6) / 0.35);
        body.rotation.x += -raise * 0.22;
        head.rotation.x += -raise * 0.15;
        frame.position.y += release * 3;
        jaw.rotation.x += release * 0.45;
      },
    },
    summon: {
      length: 4.2,
      pose: (t) => {
        // Hand signs, palms slammed to the ground, a summoning circle, a burst of smoke… and the giant toad.
        const sign = ramp(t, 0, 0.07) - ramp(t, 0.22, 0.27);
        handSign(sign);
        frame.position.y += sign * Math.abs(Math.sin(t * 60)) * 0.5;
        const slam = bump(t, 0.22, 0.46);
        body.rotation.x += slam * 0.55;
        for (const { arm, forearm } of arms) {
          arm.rotation.x += slam * 0.5;
          forearm.rotation.x += slam * 0.4;
        }
        frame.position.y += -slam * 1.6;
        gear.circle.set(Math.min(ramp(t, 0.27, 0.34), 1 - ramp(t, 0.9, 1)), time * 0.5);
        gear.smokeIn.set((t - 0.33) / 0.3);
        gear.smokeOut.set((t - 0.86) / 0.14);
        // The giant: pops up out of the cloud, roars, and goes back in a puff.
        const rise = pop(ramp(t, 0.36, 0.5)) * (1 - ramp(t, 0.88, 0.93));
        const giant = gear.giant;
        giant.root.visible = rise > 0.01;
        giant.root.scale.setScalar(2.4 * Math.max(0.01, rise));
        const roar = bump(t, 0.54, 0.74);
        giant.parts.jaw.rotation.x += roar * 0.9;
        giant.parts.head.rotation.x += -roar * 0.3;
        giant.parts.body.rotation.x += -roar * 0.15;
        // The summoner straightens up and looks up at his friend.
        head.rotation.x += -ramp(t, 0.45, 0.55) * 0.3 * (1 - ramp(t, 0.85, 0.95));
      },
    },
    vanish: {
      length: 2.4,
      pose: (t) => {
        // A hand sign, a puff of smoke, a log where he stood… and he's over there. Then back in another puff.
        const sign = ramp(t, 0, 0.08) - ramp(t, 0.18, 0.22);
        handSign(sign);
        gear.smokeA.set((t - 0.2) / 0.3);
        gear.smokeB.set((t - 0.46) / 0.3);
        gear.smokeC.set((t - 0.84) / 0.16);
        const gone = (t > 0.25 && t < 0.5) || (t > 0.87 && t < 0.9);
        frame.visible = !gone;
        const log = t > 0.24 && t < 0.86;
        gear.log.visible = log;
        if (log) {
          const fall = ramp(t, 0.24, 0.34);
          gear.log.position.y = 4 + (1 - fall) * 10;
          gear.log.rotation.set(0, 0.6, (1 - fall) * 1.2);
        }
        if (t >= 0.5 && t < 0.87) {
          // Reappeared in front: low stance, a star ready in one hand.
          frame.position.z += 16;
          const stance = ramp(t, 0.5, 0.58);
          body.rotation.x += stance * 0.2;
          stretchLegs(stance * 0.18, stance * 0.25);
          moveArms(stance * 1.1, 0, [1]);
          moveArms(-stance * 0.3, 0, [-1]);
        }
      },
    },
  };

  // --- Garden emotes (Emotes.js): any class can play them, so they only bend the shared joints. ---------------
  Object.assign(MOVES, {
    love: {
      length: 2.8,
      pose: (t) => {
        // Hands clasped at the heart, swaying dreamily on tiptoes, eyes half closed, and a big sigh.
        const hold = ramp(t, 0, 0.12) - ramp(t, 0.88, 1);
        handSign(hold * 0.85);
        const sway = Math.sin(t * Math.PI * 4) * hold;
        body.rotation.z += sway * 0.16;
        head.rotation.z += sway * 0.22;
        head.rotation.x += -hold * 0.2;
        frame.position.y += Math.abs(Math.sin(t * Math.PI * 8)) * 1.4 * hold;
        for (const eye of eyes) eye.scale.y *= 1 - hold * 0.7;
        throat.scale.setScalar(1 + bump(t, 0.45, 0.75) * 0.7);
      },
    },
    laugh: {
      length: 3.4,
      centered: true,
      pose: (t) => {
        // Doubled up laughing, then rolling on his back, legs kicking, holding his belly… and back up.
        const lean = bump(t, 0, 0.32);
        const back = ramp(t, 0.14, 0.3) - ramp(t, 0.8, 0.95);
        const tilt = lean * 0.45 * (1 - back) + back * 1.3;
        frame.rotation.x += -tilt;
        frame.position.y += back * 8;
        frame.position.z += back * 7; // (rolled back around his feet: keep him over his spot)
        frame.rotation.z += Math.sin(t * Math.PI * 6) * 0.28 * back;
        const fit = Math.min(1, lean + back);
        jaw.rotation.x += fit * (0.3 + Math.abs(Math.sin(time * 26)) * 0.55);
        head.rotation.y += Math.sin(time * 13) * 0.14 * fit;
        head.rotation.x += -0.2 * fit;
        for (const { side, arm, forearm } of arms) {
          arm.rotation.x += -0.8 * fit;
          arm.rotation.z += -side * 0.35 * fit;
          forearm.rotation.z += side * 0.8 * fit + Math.sin(time * 20 + side) * 0.2 * back;
        }
        for (const { side, thigh, shin } of hindLegs) {
          const kick = Math.sin(time * 15 + side * 1.7) * back;
          thigh.rotation.x += back * 0.9 + kick * 0.55;
          shin.rotation.x += -kick * 0.6 - back * 0.3;
        }
        for (const eye of eyes) eye.scale.y *= 1 - 0.85 * fit; // squeezed shut
      },
    },
    dance: {
      length: 2,
      pose: (t) => {
        // Four beats a loop: a bouncing groove, hips swaying, a twist, and the disco point swapping arms.
        const beat = t * 4;
        const bounce = Math.abs(Math.sin(beat * Math.PI));
        const sway = Math.sin(beat * Math.PI);
        // Up on his hind legs (like the victory pose), so the arms show.
        frame.position.y += 4 + bounce * 3.5;
        body.rotation.x += -0.75 + bounce * 0.1;
        head.rotation.x += 0.4 - bounce * 0.14;
        body.rotation.z += sway * 0.22;
        body.rotation.y += Math.sin(t * Math.PI * 2) * 0.4;
        head.rotation.z += -sway * 0.18;
        const up = Math.floor(beat / 2) % 2 ? 1 : -1;
        moveArms(-0.5, 1.3 + 0.12 * bounce, [up]); // pointing at the sky
        moveArms(0.5, -0.2 + bounce * 0.15, [-up]); // the other hand low, swinging
        for (const { side, thigh, shin } of hindLegs) {
          const step = Math.max(0, Math.sin(beat * Math.PI + (side > 0 ? 0 : Math.PI)));
          thigh.rotation.x += step * 0.55;
          thigh.rotation.z += side * step * 0.25;
          shin.rotation.x += -step * 0.3;
        }
        jaw.rotation.x += 0.12 + bounce * 0.18; // singing along
      },
    },
    nap: {
      length: 4,
      centered: true,
      pose: (t) => {
        // Curled up asleep on his side: slow breaths, a puffing throat, a twitching foot now and then.
        const breath = Math.sin(t * Math.PI * 2);
        frame.rotation.z += 1.4;
        frame.position.x += 8.5;
        frame.position.y += 5.5;
        body.rotation.x += 0.15;
        head.rotation.x += 0.12;
        head.rotation.z += -0.2;
        body.scale.y *= 1 + breath * 0.05;
        throat.scale.setScalar(1 + (breath * 0.5 + 0.5) * 0.7);
        jaw.rotation.x += 0.06;
        for (const eye of eyes) eye.scale.y *= 0.08;
        handSign(0.45); // hands tucked under the chin
        for (const { side, thigh, shin, foot } of hindLegs) {
          thigh.rotation.x += 0.5;
          shin.rotation.x += -0.3;
          if (side > 0) foot.rotation.x += bump(t, 0.7, 0.78) * 0.6;
        }
      },
    },
    bow: {
      length: 3.4,
      pose: (t) => {
        // A courtly bow: one arm sweeps across the chest, the other out wide, deep down… then up, chest out.
        const sweep = ramp(t, 0, 0.18) - ramp(t, 0.78, 0.92);
        const down = bump(t, 0.16, 0.66);
        const proud = bump(t, 0.6, 1);
        for (const { side, arm, forearm } of arms) {
          if (side === 1) {
            arm.rotation.x += -sweep * 1.25;
            arm.rotation.z += -sweep * 0.9;
            forearm.rotation.z += sweep * 0.9;
          } else {
            arm.rotation.z += -sweep * 1.5;
            arm.rotation.x += sweep * 0.25;
            forearm.rotation.z += sweep * 0.4;
          }
        }
        body.rotation.x += down * 0.8 - proud * 0.3;
        head.rotation.x += down * 0.4 - proud * 0.35;
        frame.position.y += proud * 2;
        for (const eye of eyes) eye.scale.y *= 1 - down * 0.75;
      },
    },
    power: {
      length: 6.5,
      pose: (t) => {
        // Powering up: a wide straining crouch, fists clenched, trembling, building to a roar (the first 23%)…
        const charge = ramp(t, 0, 0.06) * (1 - ramp(t, 0.22, 0.25));
        body.rotation.x += charge * 0.28;
        frame.rotation.z += Math.sin(time * 70) * 0.035 * charge;
        frame.position.y += -charge * 1.5;
        for (const { side, arm, forearm, hand } of arms) {
          arm.rotation.x += charge * 0.75;
          arm.rotation.z += side * charge * 0.45;
          forearm.rotation.x += -charge * 1;
          hand.rotation.x += charge * 0.6;
        }
        stretchLegs(-charge * 0.05, charge * 0.4);
        head.rotation.x += charge * 0.12;
        jaw.rotation.x += charge * (0.15 + 0.5 * ramp(t, 0.1, 0.23));
        // …the burst: arms flung out, head back, a roar, and he floats in his new form.
        const burst = ramp(t, 0.23, 0.27) * (1 - ramp(t, 0.92, 1));
        const roar = bump(t, 0.23, 0.42);
        moveArms(-burst * 0.2, burst * (0.7 + roar * 0.25));
        body.rotation.x += -burst * (0.35 + roar * 0.3);
        head.rotation.x += -roar * 0.35;
        jaw.rotation.x += roar * 0.9 + burst * 0.1;
        frame.position.y += burst * (7 + Math.sin(time * 2.4) * 1.6);
        stretchLegs(burst * 0.45, burst * 0.15);
        throat.scale.setScalar(1 + roar * 0.8);
      },
    },
  });

  // More garden emotes (v0.33).
  Object.assign(MOVES, {
    cheer: {
      length: 2.4,
      pose: (t) => {
        // Up on his hind legs, jumping for joy four times, arms pumping over his head.
        const on = ramp(t, 0, 0.1) - ramp(t, 0.9, 1);
        const jump = Math.abs(Math.sin(t * Math.PI * 4)) * on;
        frame.position.y += 3 * on + jump * 7;
        body.rotation.x += -0.8 * on;
        head.rotation.x += 0.45 * on;
        moveArms(0, on * (0.55 + 0.5 * jump));
        stretchLegs(jump * 0.5, on * 0.25);
        jaw.rotation.x += on * 0.55;
      },
    },
    clap: {
      length: 2.4,
      pose: (t) => {
        // Sitting up and clapping six times, hands meeting in front of the chest.
        const on = ramp(t, 0, 0.1) - ramp(t, 0.9, 1);
        const apart = Math.sin(t * Math.PI * 12) * 0.5 + 0.5;
        frame.position.y += 3 * on;
        body.rotation.x += -0.6 * on;
        head.rotation.x += 0.35 * on;
        for (const { side, arm, forearm, hand } of arms) {
          arm.rotation.x += -1.15 * on;
          arm.rotation.z += -side * (0.55 - apart * 0.55) * on;
          forearm.rotation.x += -0.7 * on;
          forearm.rotation.z += side * (0.95 - apart * 0.7) * on;
          hand.rotation.x += -0.9 * on;
        }
        jaw.rotation.x += on * 0.3;
        for (const eye of eyes) eye.scale.y *= 1 - on * 0.35;
      },
    },
    meditate: {
      length: 4,
      pose: (t) => {
        // Floating cross-legged, hands together, eyes closed, breathing slowly.
        const breath = Math.sin(t * Math.PI * 2);
        frame.position.y += 7 + breath * 1.5;
        body.rotation.x += -0.55;
        head.rotation.x += 0.3;
        handSign(0.8);
        for (const eye of eyes) eye.scale.y *= 0.1;
        for (const { side, thigh, shin } of hindLegs) {
          thigh.rotation.x += 0.3;
          thigh.rotation.z += side * 0.5;
          shin.rotation.x += -0.4;
        }
        throat.scale.setScalar(1 + (breath * 0.5 + 0.5) * 0.3);
      },
    },
    croak: {
      length: 2.6,
      pose: (t) => {
        // Three big croaks: the throat balloons out, then the mouth pops open as it empties.
        const on = ramp(t, 0, 0.08) - ramp(t, 0.92, 1);
        const puff = [0.08, 0.38, 0.68].reduce((sum, at) => sum + bump(t, at, at + 0.24), 0);
        const pop = [0.3, 0.6, 0.9].reduce((sum, at) => sum + bump(t, at, at + 0.07), 0);
        throat.scale.setScalar(1 + puff * 1.6);
        head.rotation.x += on * 0.25 + puff * 0.1;
        body.rotation.x += -on * 0.2;
        frame.position.y += puff * 1.5 + pop * 2;
        jaw.rotation.x += pop * 0.45;
        for (const eye of eyes) eye.scale.y *= 1 - puff * 0.4;
      },
    },
    juggle: {
      length: 3.2,
      pose: (t) => {
        // Up on his hind legs, looking up, hands tossing in turn.
        const on = ramp(t, 0, 0.08) - ramp(t, 0.92, 1);
        frame.position.y += 3 * on;
        body.rotation.x += -0.6 * on;
        head.rotation.x += 0.5 * on;
        for (const { side, arm, forearm } of arms) {
          const toss = Math.max(0, Math.sin(time * 9 + (side > 0 ? 0 : Math.PI)));
          arm.rotation.x += (-1 - toss * 0.6) * on;
          arm.rotation.z += -side * 0.2 * on;
          forearm.rotation.x += -0.5 * on;
        }
        jaw.rotation.x += on * 0.15;
      },
    },
    cackle: {
      length: 3,
      pose: (t) => {
        // A wicked laugh: rubbing his hands, then leaning back, shoulders shaking.
        const on = ramp(t, 0, 0.1) - ramp(t, 0.9, 1);
        const rub = Math.sin(time * 18);
        handSign(on * 0.8);
        for (const { side, forearm } of arms) forearm.rotation.y += side * rub * 0.2 * on;
        const back = bump(t, 0.35, 0.95);
        const shake = Math.abs(Math.sin(time * 22));
        body.rotation.x += -on * 0.3 - back * 0.45;
        head.rotation.x += -back * 0.5;
        frame.position.y += shake * back * 1.2;
        jaw.rotation.x += back * (0.4 + shake * 0.4);
        for (const eye of eyes) eye.scale.y *= 1 - on * 0.55;
      },
    },
  });

  /**
   * Starts a move ('idle', 'hop', 'attack', 'dash', 'victory' or 'signature'). `once`: back to idle afterwards;
   * `length`: play it in this many seconds instead.
   */
  function play(name, { once: oneShot = false, length = null } = {}) {
    move = name === 'signature' ? look.signature : name;
    moveTime = 0;
    once = oneShot;
    lengthOverride = length;
  }

  /** Everything a move may show (a cup, a vial, smoke…) hidden again: only the move playing shows it. */
  function restGear() {
    frame.visible = true;
    if (gear.giant) gear.giant.root.visible = false;
    if (gear.log) gear.log.visible = false;
    for (const effect of [gear.smokeA, gear.smokeB, gear.smokeC, gear.smokeIn, gear.smokeOut, gear.burst]) effect?.set(0);
    gear.runes?.set(0);
    gear.circle?.set(0);
    if (gear.cup) gear.cup.visible = false;
    if (gear.potion) gear.potion.visible = false;
    if (gear.flying) gear.flying.visible = false; // the thrown vial only exists while the throw plays
    if (gear.aimPipe) {
      gear.aimPipe.visible = false;
      gear.pipe.visible = true;
    }
  }

  function update(delta) {
    time += delta;
    moveTime += delta;
    const current = MOVES[move] ?? MOVES.idle;
    resetPose();
    gear.giant?.update(delta); // breathes and blinks; the summon move then raises it
    restGear();

    // Always: breathing, a throat that pulses, blinking, and a glance around now and then.
    const breath = Math.sin(time * 2.4);
    body.scale.set(1 + breath * 0.015, 1 + breath * 0.025, 1);
    throat.scale.setScalar(1 + Math.max(0, Math.sin(time * 3.1)) * 0.35);
    head.rotation.y += Math.sin(time * 0.7) * 0.12 * (move === 'idle' ? 1 : 0);
    blinkIn -= delta;
    if (blinkIn < 0.12) for (const eye of eyes) eye.scale.y = THREE.MathUtils.clamp(Math.abs(blinkIn - 0.06) / 0.06, 0.1, 1);
    if (blinkIn <= 0) blinkIn = 2 + Math.random() * 3;
    if (gear.cape) gear.cape.rotation.x = -0.25 + Math.sin(time * 2.2) * 0.12;
    if (gear.tails) gear.tails.forEach((tail, i) => (tail.rotation.y += Math.sin(time * 9 + i) * 0.15));
    if (gear.kettle) gear.kettle.rotation.z = Math.sin(time * 1.5) * 0.04;

    const length = lengthOverride ?? current.length;
    current.pose(Math.min(1, moveTime / length));
    // Running: each hop pushes the legs out behind and the arms ahead (on top of idle only).
    if (locomotion > 0.01 && move === 'idle') {
      stretchLegs(locomotion * 0.75);
      body.rotation.x += locomotion * 0.16;
      moveArms(locomotion * 0.55);
    }
    // A quick snap of the jaw and tongue for every spit.
    if (flickLeft > 0) {
      flickLeft = Math.max(0, flickLeft - delta);
      const f = Math.sin((1 - flickLeft / FLICK) * Math.PI);
      jaw.rotation.x += f * 0.6;
      tongue.scale.z = Math.max(tongue.scale.z, 1 + f * 2.6);
      tongue.rotation.x += -f * 0.3;
    }
    // In play the game moves the frog; a move only bends it (and lifts it), it doesn't walk it off.
    // (A `centered` move, like lying down, puts the frog back over his spot itself.)
    if (rig.inPlace && !current.centered) {
      frame.position.x = 0;
      frame.position.z = 0;
    }
    if (moveTime >= length) {
      moveTime = 0; // loops (the preview picks the next move)
      if (once) {
        move = 'idle';
        once = false;
        lengthOverride = null;
      }
    }
    for (const group of covered) group.visible = false; // after restGear, which shows the blowpipe again
  }

  // The class's gear in slots a worn item fills (see `cover`).
  let covered = [];

  /**
   * A copy of the frog standing at rest (the Great Tode ultimate): a copy of the live frog froze whatever it was
   * doing, like the tongue flicked out mid-spit next to the giant's real tongue. The next update poses it again.
   */
  function cloneAtRest() {
    resetPose();
    restGear();
    flickLeft = 0;
    return withoutSilhouette(root.clone()); // the Great Tode is big enough to find
  }

  const rig = {
    root,
    play,
    update,
    cloneAtRest,
    look,
    id,
    inPlace: false,
    /** Materials to tint (ascension turns the frog golden); the glowing bits stay as they are. */
    materials: ownMaterials ? [materials.skin, materials.cloth] : [],
    setLocomotion: (k) => (locomotion = THREE.MathUtils.clamp(k, 0, 1)),
    flick: () => (flickLeft = FLICK),
    get move() {
      return move;
    },
    parts: { frame, body, head, jaw, arms, hindLegs }, // for tuning poses from the console (and the wardrobe)
    /** The frog's proportions, so worn items fit every class (WearableModels.js). */
    fit: { W, H, L, headW, bodyY, legs },
    /** Hides the class's own gear in these wardrobe slots (a hat replaces the Mage's hat), shows the rest. */
    cover(slots) {
      for (const group of covered) group.visible = true;
      covered = slots.flatMap((slot) => slotGear[slot] ?? []);
      for (const group of covered) group.visible = false;
    },
    get moveLength() {
      return (MOVES[move] ?? MOVES.idle).length;
    },
    get kettleTop() {
      return gear.kettle;
    },
  };
  return rig;
}
