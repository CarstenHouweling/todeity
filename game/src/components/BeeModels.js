import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { upgradeMaterial } from './Graphics.js';

/**
 * Procedural bees for the arenas after the garden (the garden keeps the original glTF bee).
 * Every arena has its own species, built from smooth primitives with more detail each arena:
 *   1 Sage Mountain   – armoured ronin hornets with kabuto helmets and amber wings
 *   2 Sky Citadel     – golden seraph bees in royal blue, with halos and feathered wings
 *   3 Tournament      – obsidian void wasps with glowing crystals and orbiting shards
 *   4 The Underworld  – charred demon hornets with horns, spikes, lava veins and bat wings
 * Bosses get their own regalia (a shogun's crest and banner, six seraph wings, a crystal crown, demon horns).
 *
 * Models are built Y-up facing +Z at the size of a drone (like the glTF bee); the Enemy scales and turns them.
 * Geometry is cached per kind and style; materials for the body are per bee (hit flashes), the rest shared.
 */

export const STYLES = {
  1: {
    shell: '#1c1414', shade: '#2a1c18', armor: '#b8322a', trim: '#d9b25a', band: '#f0a020', eye: '#ffc23f',
    wing: '#ffcf80', wingOpacity: 0.42, wings: 'insect', flap: 26, roughness: 0.35, metalness: 0.3,
  },
  2: {
    shell: '#d9a23a', shade: '#3a4a8a', armor: '#2f4fb0', trim: '#fff1b8', band: '#f4efe6', eye: '#7fd8ff',
    wing: '#ffffff', wingOpacity: 0.95, wings: 'feather', flap: 9, roughness: 0.25, metalness: 0.15,
  },
  3: {
    shell: '#16121f', shade: '#241c34', armor: '#3a2a5a', trim: '#7ff9ff', band: '#7ff9ff', eye: '#d070ff',
    wing: '#9ff4ff', wingOpacity: 0.38, wings: 'insect', flap: 30, roughness: 0.15, metalness: 0.6,
  },
  4: {
    shell: '#160806', shade: '#2a0c08', armor: '#3a0c06', trim: '#ff6a1a', band: '#ff4a10', eye: '#ff2a00',
    wing: '#4a0808', wingOpacity: 0.92, wings: 'bat', flap: 11, roughness: 0.4, metalness: 0.35,
  },
};

// Body proportions per kind: bulk (thickness), length of the abdomen, wing size.
const BUILDS = {
  drone: { bulk: 1, abdomen: 4, wing: 1 },
  zipper: { bulk: 0.78, abdomen: 3, wing: 1.25, tint: '#ffd23f' },
  brute: { bulk: 1.35, abdomen: 4, wing: 0.9, heavy: true, tint: '#d9483b' },
  stinger: { bulk: 0.95, abdomen: 5, wing: 1, sniper: true, tint: '#b05cff' },
  queen: { bulk: 1.15, abdomen: 5, wing: 1.2, boss: true },
  shogun: { bulk: 1.25, abdomen: 5, wing: 1.2, boss: true, heavy: true },
  seraph: { bulk: 1.1, abdomen: 5, wing: 1.3, boss: true },
  empress: { bulk: 1.2, abdomen: 6, wing: 1.3, boss: true },
  beezebub: { bulk: 1.3, abdomen: 6, wing: 1.4, boss: true, heavy: true },
};

const tmpColor = new THREE.Color();
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();
const matrix = new THREE.Matrix4();

/** A coloured, transformed, non-indexed piece, ready to merge. */
function piece(geometry, color, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  matrix.compose(new THREE.Vector3(...position), quaternion.setFromEuler(euler.set(...rotation)), new THREE.Vector3(...scale));
  g.applyMatrix4(matrix);
  tmpColor.set(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) tmpColor.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const merge = (pieces) => (pieces.length ? mergeGeometries(pieces) : null);
const mix = (a, b, t) => `#${tmpColor.set(a).lerp(new THREE.Color(b), t).getHexString()}`;

/** Leg: upper and lower segment from the thorax down to the ground. */
function leg(pieces, side, z, color, bulk, seg) {
  const x = side * 4.2 * bulk;
  pieces.push(piece(new THREE.CapsuleGeometry(0.75, 5, 3, seg), color, { position: [x + side * 2, 6.6, z], rotation: [0, 0, side * 1.05] }));
  pieces.push(piece(new THREE.CapsuleGeometry(0.6, 6, 3, seg), color, { position: [x + side * 4.4, 3.6, z + 0.6], rotation: [0.15, 0, side * 0.25] }));
}

// --- Wings (built lying in the XZ plane, extending along +X from the pivot) ----------------------

function insectWing(style, size) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(5, 3.6, 12, 4.2, 16, 1.5);
  shape.bezierCurveTo(17.5, 0, 15, -2.5, 9, -2.8);
  shape.bezierCurveTo(5, -3, 2, -1.8, 0, 0);
  const pieces = [];
  const front = new THREE.ShapeGeometry(shape, 12).rotateX(-Math.PI / 2);
  pieces.push(piece(front, style.wing, { scale: [size, 1, size], rotation: [0, 0.18, 0] }));
  const back = new THREE.ShapeGeometry(shape, 10).rotateX(-Math.PI / 2);
  pieces.push(piece(back, mix(style.wing, '#ffffff', 0.2), { position: [0, -0.2, -2.5], scale: [size * 0.7, 1, size * 0.7], rotation: [0, -0.35, 0] }));
  // Veins
  for (const [length, angle] of [[15, 0.2], [11, 0.05], [8, 0.42]]) {
    pieces.push(piece(new THREE.BoxGeometry(length * size, 0.15, 0.25), mix(style.wing, '#000000', 0.45), { position: [length * size * 0.5, 0.05, -angle * length * size * 0.5], rotation: [0, angle, 0] }));
  }
  return merge(pieces);
}

function featherWing(style, size, seg) {
  const pieces = [];
  for (let i = 0; i < 7; i++) {
    const length = (16 - i * 1.2) * size;
    const angle = 0.1 + i * 0.16;
    const color = i % 2 ? style.wing : mix(style.wing, style.armor, 0.25);
    pieces.push(
      piece(new THREE.SphereGeometry(1, seg, Math.max(6, seg >> 1)), color, {
        position: [Math.cos(angle) * length * 0.5, 0.2 * i, -Math.sin(angle) * length * 0.5],
        rotation: [0, angle, 0],
        scale: [length * 0.5, 0.35, 1.5 * size],
      })
    );
  }
  // Golden tips
  pieces.push(piece(new THREE.SphereGeometry(1, seg, 6), style.armor, { position: [15 * size * 0.95, 0.3, -1.8 * size], scale: [2.2, 0.4, 1.2] }));
  return merge(pieces);
}

function batWing(style, size, seg) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.8);
  shape.lineTo(17, 3.5);
  shape.quadraticCurveTo(15, 0.5, 14, -3.5);
  shape.quadraticCurveTo(11.5, -1.5, 9.5, -5);
  shape.quadraticCurveTo(7, -2.5, 5, -5.5);
  shape.quadraticCurveTo(3, -2.5, 0, -2.5);
  const pieces = [piece(new THREE.ShapeGeometry(shape, 8).rotateX(-Math.PI / 2), style.wing, { scale: [size, 1, size] })];
  // Finger bones with claws.
  // Shape point (x, y) lies at (x, 0, -y) once the shape is turned flat.
  for (const [x, y] of [[17, 3.5], [14, -3.5], [9.5, -5], [5, -5.5]]) {
    const length = Math.hypot(x, y) * size;
    pieces.push(piece(new THREE.CapsuleGeometry(0.35, length, 2, seg), '#1a0a08', { position: [x * size * 0.5, 0.2, -y * size * 0.5], rotation: [0, Math.atan2(y, x), Math.PI / 2] }));
  }
  pieces.push(piece(new THREE.ConeGeometry(0.7, 3, seg), style.trim, { position: [17 * size + 1, 0.2, -3.5 * size], rotation: [0, 0, -Math.PI / 2] }));
  return merge(pieces);
}

// --- The bee ---------------------------------------------------------------------------------

function buildGeometry(kind, styleId) {
  const style = STYLES[styleId];
  const build = BUILDS[kind] ?? BUILDS.drone;
  const { bulk } = build;
  // Smoother every arena; bosses are big on screen, so they get more. (Kept modest: a swarm is 50 bees.)
  const seg = Math.round((9 + styleId * 2) * (build.boss ? 1.6 : 1));
  const shell = build.tint ? mix(style.shell, build.tint, styleId === 2 ? 0.25 : 0.2) : style.shell;
  const armor = build.tint ? mix(style.armor, build.tint, 0.35) : style.armor;
  const body = [];
  const glow = [];
  const abdomen = [];
  const abdomenGlow = [];

  // Thorax and head
  body.push(piece(new THREE.SphereGeometry(6 * bulk, seg, seg), shell, { position: [0, 10, 0.5], scale: [1.05, 0.95, 1.1] }));
  body.push(piece(new THREE.SphereGeometry(4.6 * bulk, seg, seg), shell, { position: [0, 11, 8.2 * bulk], scale: [1.1, 0.95, 1] }));
  // Compound eyes (glowing) and mandibles
  for (const side of [-1, 1]) {
    glow.push(piece(new THREE.SphereGeometry(2.3 * bulk, seg, seg), style.eye, { position: [side * 3 * bulk, 12, 10.2 * bulk], scale: [0.8, 1.15, 0.85] }));
    body.push(piece(new THREE.ConeGeometry(0.9 * bulk, 4 * bulk, seg), style.shade, { position: [side * 1.5 * bulk, 8.6, 12.6 * bulk], rotation: [Math.PI / 2 + 0.3, 0, -side * 0.5] }));
    // Antennae
    body.push(piece(new THREE.CapsuleGeometry(0.3, 5, 2, seg), style.shade, { position: [side * 1.6, 15.5, 9 * bulk + 1], rotation: [0.7, 0, -side * 0.35] }));
    (styleId === 3 ? glow : body).push(piece(new THREE.SphereGeometry(0.7, seg, 6), styleId === 3 ? style.trim : style.shade, { position: [side * 2.5, 17.6, 9 * bulk + 3] }));
    // Legs
    for (const z of [3, 0, -3]) leg(body, side, z * bulk, style.shade, bulk, Math.max(4, seg >> 1));
  }

  // Abdomen: banded segments behind the pivot, ending in a stinger.
  let z = -3;
  for (let i = 0; i < build.abdomen; i++) {
    const r = (5.6 - i * (3.4 / build.abdomen)) * bulk;
    const color = i % 2 ? style.band : shell;
    abdomen.push(piece(new THREE.SphereGeometry(r, seg, seg), color, { position: [0, 0, z], scale: [1, 0.92, 1.05] }));
    if (styleId === 2 && i % 2 === 0) abdomen.push(piece(new THREE.TorusGeometry(r * 0.98, 0.35, 6, seg * 2), style.armor, { position: [0, 0, z - r * 0.5] }));
    if ((styleId === 3 || styleId === 4) && i % 2) abdomenGlow.push(piece(new THREE.TorusGeometry(r * 0.97, 0.3, 6, seg * 2), style.trim, { position: [0, 0, z] }));
    z -= r * 0.8;
  }
  const stingLength = build.sniper ? 8 : 5;
  (build.sniper ? abdomenGlow : abdomen).push(
    piece(new THREE.ConeGeometry(1.3 * bulk, stingLength, seg), build.sniper ? style.trim : style.shade, { position: [0, 0, z - stingLength * 0.45], rotation: [-Math.PI / 2, 0, 0] })
  );
  if (build.sniper) abdomenGlow.push(piece(new THREE.SphereGeometry(2.2 * bulk, seg, seg), style.eye, { position: [0, 0, z + 1] }));

  // Armour and arena regalia
  if (styleId === 1) {
    // Lacquered plates and a kabuto helmet with a golden crest.
    body.push(piece(new THREE.SphereGeometry(6.7 * bulk, seg, seg, 0, Math.PI * 2, 0, Math.PI / 2.1), armor, { position: [0, 10.4, 0.5], scale: [1.05, 1, 1.1] }));
    body.push(piece(new THREE.SphereGeometry(5.1 * bulk, seg, seg, 0, Math.PI * 2, 0, Math.PI / 2), armor, { position: [0, 11.4, 8.2 * bulk], scale: [1.15, 1, 1.05] }));
    body.push(piece(new THREE.TorusGeometry(5.3 * bulk, 0.5, 6, seg * 2), style.trim, { position: [0, 11.4, 8.2 * bulk], rotation: [Math.PI / 2, 0, 0], scale: [1.15, 1.05, 1] }));
    body.push(piece(new THREE.TorusGeometry(3.6, 0.5, 6, seg, Math.PI), style.trim, { position: [0, 16.5, 11 * bulk], rotation: [0, 0, 0] }));
    for (const side of [-1, 1]) {
      body.push(piece(new THREE.SphereGeometry(3.4 * bulk, seg, seg), armor, { position: [side * 6.5 * bulk, 11, 0.5], scale: [0.55, 1.1, 1.2] }));
    }
  } else if (styleId === 2) {
    // Porcelain bands, a golden collar and a halo.
    body.push(piece(new THREE.TorusGeometry(5.2 * bulk, 0.7, 8, seg * 2), style.armor, { position: [0, 10.5, 5], rotation: [0, 0, 0] }));
    glow.push(piece(new THREE.TorusGeometry(4.5 * bulk, 0.45, 8, seg * 3), style.trim, { position: [0, 19.5, 7 * bulk], rotation: [Math.PI / 2, 0, 0] }));
  } else if (styleId === 3) {
    // Crystals growing out of the back.
    for (let i = 0; i < 4; i++) {
      glow.push(piece(new THREE.OctahedronGeometry(1.6 + i * 0.3, 0), i % 2 ? style.trim : style.eye, { position: [(i - 1.5) * 2.2, 16 + (i % 2) * 1.5, -0.5 - i * 0.4], scale: [0.6, 2.2, 0.6], rotation: [-0.3, 0, (i - 1.5) * 0.35] }));
    }
    body.push(piece(new THREE.SphereGeometry(6.5 * bulk, seg, seg, 0, Math.PI * 2, 0, Math.PI / 2.4), style.armor, { position: [0, 10.3, 0.5], scale: [1.05, 1, 1.1] }));
  } else if (styleId === 4) {
    // Curved horns, spines along the back and smouldering veins.
    for (const side of [-1, 1]) {
      let hx = side * 2.6;
      let hy = 14;
      let angle = side * 0.6;
      let r = 1.3 * bulk;
      for (let i = 0; i < 4; i++) {
        body.push(piece(new THREE.CylinderGeometry(r * 0.75, r, 2.6, seg), '#0e0605', { position: [hx + Math.sin(angle) * 1.3, hy + Math.cos(angle) * 1.3, 9 * bulk], rotation: [0, 0, -angle] }));
        hx += Math.sin(angle) * 2.5;
        hy += Math.cos(angle) * 2.5;
        angle -= side * 0.35;
        r *= 0.78;
      }
      glow.push(piece(new THREE.ConeGeometry(r, 2, seg), style.trim, { position: [hx, hy + 0.8, 9 * bulk], rotation: [0, 0, -angle] }));
    }
    for (let i = 0; i < 4; i++) {
      body.push(piece(new THREE.ConeGeometry(0.9 * bulk, 4 * bulk, seg), '#0e0605', { position: [0, 15.5 + (i === 1 || i === 2 ? 0.6 : 0), 4 - i * 2.6], rotation: [-0.5, 0, 0] }));
    }
    glow.push(piece(new THREE.TorusGeometry(6.1 * bulk, 0.3, 6, seg * 2), style.trim, { position: [0, 10, 0.5], rotation: [Math.PI / 2, 0, 0], scale: [1.05, 1.1, 1] }));
  }

  if (build.heavy) {
    // Pauldrons and a horn for the heavy hitters.
    for (const side of [-1, 1]) {
      body.push(piece(new THREE.SphereGeometry(3.8 * bulk, seg, seg), armor, { position: [side * 6.8 * bulk, 12, 2], scale: [0.7, 0.9, 1.25] }));
      body.push(piece(new THREE.ConeGeometry(1, 3.5, seg), style.trim, { position: [side * 8.5 * bulk, 14.8, 2], rotation: [0, 0, -side * 0.6] }));
    }
    body.push(piece(new THREE.ConeGeometry(1.2 * bulk, 6 * bulk, seg), style.trim, { position: [0, 15, 11.5 * bulk], rotation: [0.9, 0, 0] }));
  }

  if (build.boss) addRegalia(kind, styleId, style, bulk, seg, body, glow);

  return {
    body: merge(body),
    glow: merge(glow),
    abdomen: merge(abdomen),
    abdomenGlow: merge(abdomenGlow),
    wing: style.wings === 'feather' ? featherWing(style, build.wing, seg) : style.wings === 'bat' ? batWing(style, build.wing, Math.max(4, seg >> 1)) : insectWing(style, build.wing),
    extraWings: build.boss && (styleId === 2 || styleId === 4),
    cape: build.boss && (styleId === 3 || kind === 'shogun'),
  };
}

/** Crowns, crests, banners and halos for the bosses. */
function addRegalia(kind, styleId, style, bulk, seg, body, glow) {
  const headZ = 8.2 * bulk;
  if (kind === 'shogun' || styleId === 1) {
    // A huge golden crescent crest and katana mandibles.
    body.push(piece(new THREE.TorusGeometry(6, 0.9, 8, seg * 2, Math.PI), style.trim, { position: [0, 18, headZ + 2], rotation: [0, 0, 0] }));
    for (const side of [-1, 1]) body.push(piece(new THREE.BoxGeometry(0.6, 0.8, 10), '#e8e8f0', { position: [side * 2.2, 8.6, headZ + 8], rotation: [0.25, side * -0.3, 0] }));
  } else if (styleId === 2) {
    // A second, larger halo and a crown of light.
    glow.push(piece(new THREE.TorusGeometry(8, 0.5, 8, seg * 3), style.trim, { position: [0, 24, headZ - 2], rotation: [Math.PI / 2 - 0.4, 0, 0] }));
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      glow.push(piece(new THREE.ConeGeometry(0.7, 4, seg), style.trim, { position: [Math.cos(angle) * 3.4, 17, headZ + Math.sin(angle) * 3.4] }));
    }
  } else if (styleId === 3) {
    // A crown of crystal spires.
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      glow.push(piece(new THREE.OctahedronGeometry(1.4, 0), i % 2 ? style.eye : style.trim, { position: [Math.cos(angle) * 3.6, 17.5, headZ + Math.sin(angle) * 3.6], scale: [0.7, 2.6, 0.7] }));
    }
  } else if (styleId === 4) {
    // A crown of hellfire spikes and a second pair of eyes.
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI * (0.15 + i * 0.175);
      glow.push(piece(new THREE.ConeGeometry(0.8, 4.5, seg), style.trim, { position: [Math.cos(angle) * 4.2, 16.5 + Math.sin(angle) * 1.5, headZ + 0.5], rotation: [0, 0, Math.PI / 2 - angle] }));
    }
    for (const side of [-1, 1]) glow.push(piece(new THREE.SphereGeometry(1.3, seg, seg), style.eye, { position: [side * 1.7, 13.6, headZ + 4] }));
  }
}

const geometryCache = new Map();
const sharedMaterials = new Map();

function shared(styleId) {
  if (!sharedMaterials.has(styleId)) {
    const style = STYLES[styleId];
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.35, 1.35, 1.35) }); // just past the bloom threshold
    const wing = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: style.wingOpacity < 0.9,
      opacity: style.wingOpacity,
      side: THREE.DoubleSide,
      depthWrite: style.wingOpacity >= 0.9,
      roughness: 0.3,
      metalness: 0.1,
      emissive: style.wing,
      emissiveIntensity: styleId === 3 ? 0.5 : 0.08,
    });
    const cape = new THREE.MeshStandardMaterial({ color: styleId === 3 ? '#3a1a6a' : '#b8322a', side: THREE.DoubleSide, roughness: 0.7, emissive: styleId === 3 ? '#2a0a5a' : '#000000' });
    sharedMaterials.set(styleId, { glow, wing, cape });
  }
  return sharedMaterials.get(styleId);
}

const sharedMesh = (geometry, material) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.shared = true; // geometry and material outlive the bee
  return mesh;
};

/**
 * Builds a bee: `{ root, materials, animate(time, delta, enemy) }`. `root` is Y-up facing +Z like the glTF bee.
 */
export function buildBee(kind, styleId) {
  const key = `${kind}:${styleId}`;
  if (!geometryCache.has(key)) geometryCache.set(key, buildGeometry(kind, styleId));
  const parts = geometryCache.get(key);
  const style = STYLES[styleId];
  const materials = shared(styleId);

  // The body is per bee so hit flashes and status glows only light up this one.
  const surface = upgradeMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: style.roughness, metalness: style.metalness }), styleId);
  surface.color.set('#ffffff');

  const root = new THREE.Group();
  const inner = new THREE.Group(); // bobs while flying
  root.add(inner);
  const body = new THREE.Mesh(parts.body, surface);
  body.userData.keepGeometry = true;
  body.castShadow = true;
  inner.add(body);
  if (parts.glow) inner.add(sharedMesh(parts.glow, materials.glow));

  const tail = new THREE.Group(); // the abdomen sways
  tail.position.set(0, 10, -1.5);
  const abdomen = new THREE.Mesh(parts.abdomen, surface);
  abdomen.userData.keepGeometry = true; // (only the body casts a shadow: fewer draw calls for a swarm)
  tail.add(abdomen);
  if (parts.abdomenGlow) tail.add(sharedMesh(parts.abdomenGlow, materials.glow));
  inner.add(tail);

  const wings = [];
  const addWing = (side, y, z, scale, tilt) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 3.2, y, z);
    const wing = sharedMesh(parts.wing, materials.wing);
    wing.scale.set(side * scale, scale, scale);
    wing.rotation.y = side * tilt;
    pivot.add(wing);
    inner.add(pivot);
    wings.push({ pivot, side, phase: tilt });
  };
  for (const side of [-1, 1]) {
    addWing(side, 15, 1, 1, 0.15);
    if (parts.extraWings) {
      addWing(side, 14, -2, 0.8, 0.55);
      if (styleId === 2) addWing(side, 16.5, 3, 0.7, -0.3);
    }
  }

  let cape = null;
  if (parts.cape) {
    if (!geometryCache.has('cape')) geometryCache.set('cape', new THREE.PlaneGeometry(14, 20, 4, 6));
    cape = sharedMesh(geometryCache.get('cape'), materials.cape);
    cape.position.set(0, 7, -5);
    cape.rotation.x = 0.4;
    inner.add(cape);
  }
  let orbit = null;
  if (kind === 'empress' || (styleId === 3 && BUILDS[kind]?.boss)) {
    // Shards of reality circling the Empress.
    orbit = new THREE.Group();
    orbit.position.y = 11;
    for (let i = 0; i < 6; i++) {
      const shard = sharedMesh(geometryCache.get('shard') ?? geometryCache.set('shard', new THREE.OctahedronGeometry(1.6, 0)).get('shard'), materials.glow);
      const angle = (i / 6) * Math.PI * 2;
      shard.position.set(Math.cos(angle) * 16, Math.sin(i) * 2, Math.sin(angle) * 16);
      shard.scale.set(0.8, 2, 0.8);
      orbit.add(shard);
    }
    inner.add(orbit);
  }

  const slowFlap = style.wings !== 'insect';
  return {
    root,
    materials: [surface],
    animate(time, delta, enemy) {
      const frozen = enemy.isFrozen;
      const rate = frozen ? 0 : enemy.speedFactor;
      enemy.flapTime = (enemy.flapTime ?? Math.random() * 10) + delta * rate;
      const t = enemy.flapTime;
      inner.position.y = Math.sin(t * 3) * 1.4;
      tail.rotation.x = Math.sin(t * 4.2) * 0.1 - (enemy.glow > 0.3 ? 0.35 : 0);
      for (const { pivot, side, phase } of wings) {
        const flap = Math.sin(t * style.flap + phase * 3);
        pivot.rotation.z = side * (slowFlap ? 0.15 + flap * 0.55 : 0.25 + flap * 0.45);
        pivot.rotation.x = slowFlap ? flap * 0.1 : 0;
      }
      if (cape) cape.rotation.x = 0.45 + Math.sin(t * 2.3) * 0.12;
      if (orbit) orbit.rotation.y = t * 1.3;
      if (enemy.dying) {
        // Tumble out of the air.
        inner.rotation.z += delta * 9;
        inner.rotation.x += delta * 4;
      }
    },
  };
}
